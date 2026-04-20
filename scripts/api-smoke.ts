import "dotenv/config";

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

import { PrismaPg } from "@prisma/adapter-pg";
import { createClient } from "@supabase/supabase-js";

import { PrismaClient } from "../generated/prisma/client/client";
import { EncounterStatus, EncounterType, UserStatus } from "../generated/prisma/client/enums";
import { assertDatabaseAvailable } from "./smoke-utils";

const apiPort = Number(process.env.API_SMOKE_PORT ?? 3101);
const baseUrl = `http://127.0.0.1:${apiPort}`;

const databaseUrl = process.env.DATABASE_URL ?? "";
assert(databaseUrl, "DATABASE_URL ausente.");

const prisma = new PrismaClient({
  adapter: new PrismaPg(databaseUrl),
  log: ["error"],
});

type JsonRecord = Record<string, unknown>;

type SmokeState = {
  patientId?: string;
  convertedPatientId?: string;
  leadId?: string;
  appointmentId?: string;
  cancelledAppointmentId?: string;
  rescheduledAppointmentId?: string;
  noShowAppointmentId?: string;
  encounterId?: string;
  clinicalTaskId?: string;
  smokeUserId?: string;
  supabaseUserId?: string;
};

const state: SmokeState = {};

function logStep(message: string) {
  console.log(`\n[api:smoke] ${message}`);
}

function assertRecord(value: unknown, message: string): asserts value is JsonRecord {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), message);
}

async function requestJson<T = unknown>(
  path: string,
  init?: RequestInit,
  expectedStatus = 200
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();

  assert.equal(
    response.status,
    expectedStatus,
    `${init?.method ?? "GET"} ${path} retornou ${response.status}: ${text}`
  );

  return text ? (JSON.parse(text) as T) : (undefined as T);
}

function formatDateQuery(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function waitForHealth() {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Aguarda a API subir.
    }

    await delay(500);
  }

  throw new Error("A API nao respondeu em /health dentro do tempo esperado.");
}

function startApiProcess(): ChildProcess {
  const child = spawn(process.execPath, ["apps/api/dist/apps/api/src/main.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      API_PORT: String(apiPort),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.on("data", (chunk) => {
    process.stdout.write(String(chunk));
  });

  child.stderr?.on("data", (chunk) => {
    process.stderr.write(String(chunk));
  });

  return child;
}

async function cleanup() {
  logStep("Limpando registros temporarios");

  if (state.clinicalTaskId) {
    await prisma.clinicalTask.deleteMany({ where: { id: state.clinicalTaskId } }).catch(() => undefined);
  }

  if (state.appointmentId) {
    await prisma.appointment.deleteMany({ where: { id: state.appointmentId } }).catch(() => undefined);
  }

  if (state.cancelledAppointmentId) {
    await prisma.appointment.deleteMany({ where: { id: state.cancelledAppointmentId } }).catch(() => undefined);
  }

  if (state.rescheduledAppointmentId) {
    await prisma.appointment.deleteMany({ where: { id: state.rescheduledAppointmentId } }).catch(() => undefined);
  }

  if (state.noShowAppointmentId) {
    await prisma.appointment.deleteMany({ where: { id: state.noShowAppointmentId } }).catch(() => undefined);
  }

  if (state.encounterId) {
    await prisma.encounter.deleteMany({ where: { id: state.encounterId } }).catch(() => undefined);
  }

  if (state.leadId) {
    await prisma.lead.deleteMany({ where: { id: state.leadId } }).catch(() => undefined);
  }

  if (state.convertedPatientId) {
    await prisma.patient.deleteMany({ where: { id: state.convertedPatientId } }).catch(() => undefined);
  }

  if (state.patientId) {
    await prisma.patient.deleteMany({ where: { id: state.patientId } }).catch(() => undefined);
  }

  if (state.smokeUserId) {
    await prisma.user.deleteMany({ where: { id: state.smokeUserId } }).catch(() => undefined);
  }

  if (state.supabaseUserId && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const adminClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    await adminClient.auth.admin.deleteUser(state.supabaseUserId).catch(() => undefined);
  }
}

async function runAuthSmoke() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !serviceRoleKey || !publishableKey) {
    logStep("Pulando auth smoke: variaveis do Supabase nao estao completas");
    return;
  }

  logStep("Validando auth/me com usuario temporario do Supabase");

  const [tenant, role, unit] = await Promise.all([
    prisma.tenant.findFirstOrThrow({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
    prisma.role.findFirstOrThrow({
      where: { code: "admin" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
    prisma.unit.findFirstOrThrow({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const email = `smoke.auth.${Date.now()}@emagreceplus.local`;
  const password = `TmpAuth!${Date.now()}Ab`;

  const localUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      fullName: "Smoke Auth User",
      email,
      status: UserStatus.ACTIVE,
      userRoles: {
        create: {
          roleId: role.id,
        },
      },
      unitAccess: {
        create: {
          unitId: unit.id,
          accessLevel: "PRIMARY",
        },
      },
    },
    select: { id: true },
  });

  state.smokeUserId = localUser.id;

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const publicClient = createClient(supabaseUrl, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const createUserResult = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  assert(!createUserResult.error, `Falha ao criar usuario Supabase: ${createUserResult.error?.message}`);
  assert(createUserResult.data.user?.id, "Supabase nao retornou id do usuario criado.");
  state.supabaseUserId = createUserResult.data.user.id;

  const signInResult = await publicClient.auth.signInWithPassword({
    email,
    password,
  });

  assert(!signInResult.error, `Falha no sign-in do Supabase: ${signInResult.error?.message}`);
  assert(signInResult.data.session?.access_token, "Supabase nao retornou access token.");

  const authResponse = await requestJson<{
    user: { email: string; role: string };
    units: Array<{ id: string }>;
    currentUnitId: string;
    permissions: string[];
  }>(
    "/auth/me",
    {
      headers: {
        Authorization: `Bearer ${signInResult.data.session.access_token}`,
      },
    },
    200
  );

  assert.equal(authResponse.user.email, email, "auth/me retornou e-mail inesperado.");
  assert.equal(authResponse.user.role, "admin", "auth/me nao refletiu o papel esperado.");
  assert(authResponse.units.length > 0, "auth/me retornou usuario sem unidades.");
  assert(authResponse.permissions.includes("dashboard:view"), "auth/me nao retornou permissoes esperadas.");
}

async function main() {
  await assertDatabaseAvailable(databaseUrl);

  logStep("Consultando fixtures base");

  const [seedPatient, appointmentType, professional, tenant, unit, pipelineStage] = await Promise.all([
    prisma.patient.findFirstOrThrow({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
    prisma.appointmentType.findFirstOrThrow({
      where: { active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
    prisma.professional.findFirstOrThrow({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
    prisma.tenant.findFirstOrThrow({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
    prisma.unit.findFirstOrThrow({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
    prisma.pipelineStage.findFirstOrThrow({
      where: {
        code: {
          in: ["qualified", "appointment_booked", "proposal_sent"],
        },
      },
      orderBy: { position: "asc" },
      select: { code: true },
    }),
  ]);

  const apiProcess = startApiProcess();

  try {
    await waitForHealth();

    logStep("Validando endpoints de leitura");

    const root = await requestJson<{ status: string }>("/");
    assert.equal(root.status, "ok", "Endpoint raiz nao retornou status ok.");

    const health = await requestJson<{ status: string }>("/health");
    assert.equal(health.status, "ok", "Healthcheck nao retornou status ok.");

    const dashboard = await requestJson<{ stats: JsonRecord; todayAppointments: unknown[] }>(
      "/dashboard/summary"
    );
    assertRecord(dashboard.stats, "dashboard/summary nao retornou stats validos.");
    assert(Array.isArray(dashboard.todayAppointments), "dashboard/summary nao retornou lista de agenda.");

    const patientsList = await requestJson<{ items: unknown[]; total: number }>("/patients");
    assert(Array.isArray(patientsList.items), "patients nao retornou items.");
    assert(typeof patientsList.total === "number", "patients nao retornou total numerico.");

    const appointmentsList = await requestJson<{ items: unknown[] }>("/appointments");
    assert(Array.isArray(appointmentsList.items), "appointments nao retornou items.");

    const kanban = await requestJson<{ columns: unknown[] }>("/leads/kanban");
    assert(Array.isArray(kanban.columns), "leads/kanban nao retornou colunas.");

    const clinicalTasks = await requestJson<{ items: unknown[] }>("/clinical/tasks");
    assert(Array.isArray(clinicalTasks.items), "clinical/tasks nao retornou items.");

    const unauthorized = await fetch(`${baseUrl}/auth/me`);
    assert.equal(unauthorized.status, 401, "auth/me sem token deveria retornar 401.");

    logStep("Executando fluxo de escrita via HTTP");

    const timestamp = Date.now();

    const createdPatient = await requestJson<{ id: string; name: string }>(
      "/patients",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: `Smoke Patient ${timestamp}`,
          primaryEmail: `smoke.patient.${timestamp}@example.com`,
          primaryPhone: "(99) 98888-0000",
          goalsSummary: "Validar criacao via API",
        }),
      },
      201
    );

    state.patientId = createdPatient.id;
    assert(createdPatient.id, "POST /patients nao retornou id.");

    const filteredPatients = await requestJson<{ items: Array<{ id: string }>; total: number }>(
      `/patients?search=${encodeURIComponent(createdPatient.name)}&status=Ativo`
    );

    assert(
      filteredPatients.items.some((patient) => patient.id === createdPatient.id),
      "GET /patients com filtros nao retornou o paciente criado."
    );

    const createdLead = await requestJson<{ id: string }>(
      "/leads",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: `Smoke Lead ${timestamp}`,
          email: `smoke.lead.${timestamp}@example.com`,
          phone: "(99) 97777-0000",
          source: "smoke-test",
          interestType: "emagrecimento",
        }),
      },
      201
    );

    state.leadId = createdLead.id;

    const movedLead = await requestJson<{ id: string; stageCode: string }>(
      `/leads/${createdLead.id}/stage`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stageCode: pipelineStage.code,
        }),
      },
      200
    );

    assert.equal(movedLead.id, createdLead.id, "PATCH /leads/:id/stage retornou lead inesperado.");
    assert.equal(movedLead.stageCode, pipelineStage.code, "PATCH /leads/:id/stage nao atualizou a etapa esperada.");

    const kanbanAfterLeadMove = await requestJson<{
      columns: Array<{
        items: Array<{ id: string; timeline: Array<{ id: string }> }>;
      }>;
    }>("/leads/kanban");

    const leadInKanban = kanbanAfterLeadMove.columns
      .flatMap((column) => column.items)
      .find((item) => item.id === createdLead.id);

    assert(leadInKanban, "GET /leads/kanban nao retornou o lead criado.");
    assert(
      (leadInKanban?.timeline.length ?? 0) > 0,
      "GET /leads/kanban nao retornou timeline real para o lead criado."
    );

    const leadActivities = await requestJson<{
      items: Array<{ id: string; description: string; completedAt: string | null }>;
    }>(`/leads/${createdLead.id}/activities`);

    assert(leadActivities.items.length > 0, "GET /leads/:id/activities nao retornou atividades.");

    const createdActivity = await requestJson<{
      id: string;
      description: string;
    }>(
      `/leads/${createdLead.id}/activities`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityType: "CALL",
          description: "Follow-up comercial do smoke test",
          dueAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        }),
      },
      201
    );

    assert(createdActivity.id, "POST /leads/:id/activities nao retornou id.");

    const updatedActivity = await requestJson<{
      id: string;
      description: string;
      completedAt: string | null;
    }>(
      `/leads/${createdLead.id}/activities/${createdActivity.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: "Follow-up comercial do smoke test concluido",
          completed: true,
        }),
      },
      200
    );

    assert.equal(
      updatedActivity.description,
      "Follow-up comercial do smoke test concluido",
      "PATCH /leads/:leadId/activities/:activityId nao atualizou a descricao."
    );
    assert(updatedActivity.completedAt, "PATCH /leads/:leadId/activities/:activityId nao concluiu a atividade.");

    const convertedLead = await requestJson<{ patientId: string; converted: boolean }>(
      `/leads/${createdLead.id}/convert`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      201
    );

    assert(convertedLead.converted, "POST /leads/:id/convert nao marcou o lead como convertido.");
    assert(convertedLead.patientId, "POST /leads/:id/convert nao retornou o patientId.");
    state.convertedPatientId = convertedLead.patientId;

    const startsAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 45 * 60 * 1000);

    const createdAppointment = await requestJson<{ id: string }>(
      "/appointments",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: createdPatient.id,
          appointmentTypeId: appointmentType.id,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          notes: "Smoke test appointment",
        }),
      },
      201
    );

    state.appointmentId = createdAppointment.id;

    const appointmentScope = await prisma.appointment.findUniqueOrThrow({
      where: { id: createdAppointment.id },
      select: {
        unit: {
          select: {
            name: true,
          },
        },
      },
    });

    const confirmedAppointment = await requestJson<{ id: string; status: string }>(
      `/appointments/${createdAppointment.id}/confirm`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      },
      200
    );

    assert.equal(
      confirmedAppointment.id,
      createdAppointment.id,
      "PATCH /appointments/:id/confirm retornou agendamento inesperado."
    );
    assert.equal(
      confirmedAppointment.status,
      "Confirmado",
      "PATCH /appointments/:id/confirm nao atualizou o status."
    );

    const confirmedAppointments = await requestJson<{ items: Array<{ id: string; status: string }> }>(
      `/appointments?date=${formatDateQuery(startsAt)}&status=${encodeURIComponent("Confirmado")}`
    );

    assert(
      confirmedAppointments.items.some(
        (appointment) =>
          appointment.id === createdAppointment.id && appointment.status === "Confirmado"
      ),
      "GET /appointments filtrado por confirmado nao retornou o agendamento esperado."
    );

    const checkedInAppointment = await requestJson<{ id: string; status: string }>(
      `/appointments/${createdAppointment.id}/check-in`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      },
      200
    );

    assert.equal(
      checkedInAppointment.id,
      createdAppointment.id,
      "PATCH /appointments/:id/check-in retornou agendamento inesperado."
    );
    assert.equal(
      checkedInAppointment.status,
      "Check-in",
      "PATCH /appointments/:id/check-in nao atualizou o status."
    );

    const checkedInAppointments = await requestJson<{ items: Array<{ id: string; status: string }> }>(
      `/appointments?date=${formatDateQuery(startsAt)}&status=${encodeURIComponent("Check-in")}`
    );

    assert(
      checkedInAppointments.items.some(
        (appointment) =>
          appointment.id === createdAppointment.id && appointment.status === "Check-in"
      ),
      "GET /appointments filtrado por status nao retornou o agendamento com check-in."
    );

    const unitAppointments = await requestJson<{ items: Array<{ id: string }> }>(
      `/appointments?date=${formatDateQuery(startsAt)}&unit=${encodeURIComponent(appointmentScope.unit.name)}`
    );

    assert(
      unitAppointments.items.some((appointment) => appointment.id === createdAppointment.id),
      "GET /appointments filtrado por unidade nao retornou o agendamento criado."
    );

    const cancelledStartsAt = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);
    const cancelledEndsAt = new Date(cancelledStartsAt.getTime() + 30 * 60 * 1000);

    const cancelledAppointment = await requestJson<{ id: string }>(
      "/appointments",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: createdPatient.id,
          appointmentTypeId: appointmentType.id,
          startsAt: cancelledStartsAt.toISOString(),
          endsAt: cancelledEndsAt.toISOString(),
          notes: "Smoke test cancelled appointment",
        }),
      },
      201
    );

    state.cancelledAppointmentId = cancelledAppointment.id;

    const cancelledAppointmentResult = await requestJson<{ id: string; status: string }>(
      `/appointments/${cancelledAppointment.id}/cancel`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "Paciente pediu cancelamento no smoke test",
        }),
      },
      200
    );

    assert.equal(
      cancelledAppointmentResult.id,
      cancelledAppointment.id,
      "PATCH /appointments/:id/cancel retornou agendamento inesperado."
    );
    assert.equal(
      cancelledAppointmentResult.status,
      "Cancelado",
      "PATCH /appointments/:id/cancel nao atualizou o status."
    );

    const cancelledAppointments = await requestJson<{ items: Array<{ id: string; status: string }> }>(
      `/appointments?date=${formatDateQuery(cancelledStartsAt)}&status=${encodeURIComponent("Cancelado")}`
    );

    assert(
      cancelledAppointments.items.some(
        (appointment) =>
          appointment.id === cancelledAppointment.id && appointment.status === "Cancelado"
      ),
      "GET /appointments filtrado por cancelado nao retornou o agendamento esperado."
    );

    const rescheduleStartsAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const rescheduleEndsAt = new Date(rescheduleStartsAt.getTime() + 30 * 60 * 1000);

    const rescheduledAppointment = await requestJson<{ id: string }>(
      "/appointments",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: createdPatient.id,
          appointmentTypeId: appointmentType.id,
          startsAt: rescheduleStartsAt.toISOString(),
          endsAt: rescheduleEndsAt.toISOString(),
          notes: "Smoke test rescheduled appointment",
        }),
      },
      201
    );

    state.rescheduledAppointmentId = rescheduledAppointment.id;

    const newRescheduleStartsAt = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);
    const newRescheduleEndsAt = new Date(newRescheduleStartsAt.getTime() + 30 * 60 * 1000);

    const rescheduledAppointmentResult = await requestJson<{
      id: string;
      status: string;
      startsAt: string;
      endsAt: string;
    }>(
      `/appointments/${rescheduledAppointment.id}/reschedule`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startsAt: newRescheduleStartsAt.toISOString(),
          endsAt: newRescheduleEndsAt.toISOString(),
          reason: "Paciente pediu novo horario no smoke test",
        }),
      },
      200
    );

    assert.equal(
      rescheduledAppointmentResult.id,
      rescheduledAppointment.id,
      "PATCH /appointments/:id/reschedule retornou agendamento inesperado."
    );
    assert.equal(
      rescheduledAppointmentResult.status,
      "Agendado",
      "PATCH /appointments/:id/reschedule nao atualizou o status esperado."
    );

    const rescheduledAppointments = await requestJson<{ items: Array<{ id: string; status: string }> }>(
      `/appointments?date=${formatDateQuery(newRescheduleStartsAt)}&status=${encodeURIComponent("Agendado")}`
    );

    assert(
      rescheduledAppointments.items.some(
        (appointment) =>
          appointment.id === rescheduledAppointment.id && appointment.status === "Agendado"
      ),
      "GET /appointments filtrado por remarcacao nao retornou o agendamento esperado."
    );

    const noShowStartsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const noShowEndsAt = new Date(noShowStartsAt.getTime() + 30 * 60 * 1000);

    const noShowAppointment = await requestJson<{ id: string }>(
      "/appointments",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: createdPatient.id,
          appointmentTypeId: appointmentType.id,
          startsAt: noShowStartsAt.toISOString(),
          endsAt: noShowEndsAt.toISOString(),
          notes: "Smoke test no-show appointment",
        }),
      },
      201
    );

    state.noShowAppointmentId = noShowAppointment.id;

    const markedNoShowAppointment = await requestJson<{ id: string; status: string }>(
      `/appointments/${noShowAppointment.id}/no-show`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "Paciente nao compareceu ao horario do smoke test",
        }),
      },
      200
    );

    assert.equal(
      markedNoShowAppointment.id,
      noShowAppointment.id,
      "PATCH /appointments/:id/no-show retornou agendamento inesperado."
    );
    assert.equal(
      markedNoShowAppointment.status,
      "No-show",
      "PATCH /appointments/:id/no-show nao atualizou o status."
    );

    const noShowAppointments = await requestJson<{ items: Array<{ id: string; status: string }> }>(
      `/appointments?date=${formatDateQuery(noShowStartsAt)}&status=${encodeURIComponent("No-show")}`
    );

    assert(
      noShowAppointments.items.some(
        (appointment) =>
          appointment.id === noShowAppointment.id && appointment.status === "No-show"
      ),
      "GET /appointments filtrado por no-show nao retornou o agendamento esperado."
    );

    const temporaryEncounter = await prisma.encounter.create({
      data: {
        tenantId: tenant.id,
        unitId: unit.id,
        patientId: createdPatient.id,
        professionalId: professional.id,
        encounterType: EncounterType.OTHER,
        status: EncounterStatus.OPEN,
      },
      select: { id: true },
    });

    state.encounterId = temporaryEncounter.id;

    const createdClinicalTask = await requestJson<{ id: string; title: string }>(
      "/clinical/tasks",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: createdPatient.id,
          encounterId: temporaryEncounter.id,
          title: "Revisar tolerancia ao plano apos atendimento",
          priority: "HIGH",
          dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        }),
      },
      201
    );

    state.clinicalTaskId = createdClinicalTask.id;
    assert.equal(createdClinicalTask.title, "Revisar tolerancia ao plano apos atendimento");

    const filteredClinicalTasks = await requestJson<{ items: Array<{ id: string }> }>(
      `/clinical/tasks?search=${encodeURIComponent("Revisar tolerancia")}&patient=${encodeURIComponent(createdPatient.name)}`
    );

    assert(
      filteredClinicalTasks.items.some((task) => task.id === createdClinicalTask.id),
      "GET /clinical/tasks com filtros nao retornou a tarefa criada."
    );

    logStep("Validando endpoints de detalhe e evolucao clinica");

    const patientDetail = await requestJson<{ id: string }>(`/patients/${seedPatient.id}`);
    assert.equal(patientDetail.id, seedPatient.id, "GET /patients/:id retornou paciente inesperado.");

    const encounterDetail = await requestJson<{ id: string }>(`/encounters/${temporaryEncounter.id}`);
    assert.equal(
      encounterDetail.id,
      temporaryEncounter.id,
      "GET /encounters/:id retornou encounter inesperado."
    );

    const clinicalTasksAfterCreate = await requestJson<{ items: Array<{ id: string }> }>(
      "/clinical/tasks"
    );
    assert(
      clinicalTasksAfterCreate.items.some((task) => task.id === createdClinicalTask.id),
      "GET /clinical/tasks nao retornou a tarefa clinica criada."
    );

    const anamnesis = await requestJson<{ encounterId: string }>(
      `/encounters/${temporaryEncounter.id}/anamnesis`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chiefComplaint: "Validacao de anamnese",
          notes: "Atualizacao via api:smoke",
        }),
      },
      200
    );

    assert.equal(
      anamnesis.encounterId,
      temporaryEncounter.id,
      "PATCH anamnesis nao vinculou ao encounter esperado."
    );

    const soapNote = await requestJson<{ encounterId: string }>(
      `/encounters/${temporaryEncounter.id}/soap-note`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjective: "Paciente relata boa evolucao",
          assessment: "Evolucao estavel",
          plan: "Manter acompanhamento",
        }),
      },
      200
    );

    assert.equal(
      soapNote.encounterId,
      temporaryEncounter.id,
      "PATCH soap-note nao vinculou ao encounter esperado."
    );

    await runAuthSmoke();

    logStep("Smoke concluido com sucesso");
  } finally {
    apiProcess.kill("SIGTERM");
    await cleanup();
  }
}

main()
  .catch(async (error) => {
    console.error("\n[api:smoke] Falha:", error);
    await cleanup().catch(() => undefined);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
