import "dotenv/config";

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { PrismaPg } from "@prisma/adapter-pg";
import { createClient } from "@supabase/supabase-js";

import { PrismaClient } from "../generated/prisma/client/client";
import { UserStatus } from "../generated/prisma/client/enums";
import { assertDatabaseAvailable } from "./smoke-utils";

const apiPort = Number(process.env.API_SMOKE_PORT ?? 3101);
const baseUrl = `http://127.0.0.1:${apiPort}`;

const databaseUrl = process.env.DATABASE_URL ?? "";
assert(databaseUrl, "DATABASE_URL ausente.");

type ApiSmokeMode = "local" | "real";

function readModeArg() {
  for (let index = 2; index < process.argv.length; index += 1) {
    const arg = process.argv[index];

    if (arg === "--mode" || arg === "--smoke-mode") {
      return process.argv[index + 1];
    }

    if (arg.startsWith("--mode=")) {
      return arg.slice("--mode=".length);
    }

    if (arg.startsWith("--smoke-mode=")) {
      return arg.slice("--smoke-mode=".length);
    }
  }

  return undefined;
}

function normalizeSmokeMode(value: string | undefined): ApiSmokeMode {
  const normalized = value?.trim().toLowerCase();

  switch (normalized) {
    case undefined:
    case "":
    case "local":
    case "mock":
      return "local";
    case "real":
    case "runtime":
      return "real";
    default:
      throw new Error(
        `Modo de smoke invalido: ${value}. Use --mode=local, --mode=real ou API_SMOKE_MODE=local|real.`
      );
  }
}

function isRuntimeSyncExplicitlyDisabled(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "disabled" || normalized === "off" || normalized === "false" || normalized === "0";
}

const smokeMode = normalizeSmokeMode(readModeArg() ?? process.env.API_SMOKE_MODE);
const apiAuthMode = smokeMode === "real" ? "real" : "mock";
const requestedRuntimeSyncMode = process.env.API_RUNTIME_SYNC_MODE ?? process.env.RUNTIME_SYNC_MODE;

if (smokeMode === "real" && isRuntimeSyncExplicitlyDisabled(requestedRuntimeSyncMode)) {
  throw new Error("api:smoke:real nao pode rodar com API_RUNTIME_SYNC_MODE desabilitado.");
}

process.env.API_SMOKE_MODE = smokeMode;
process.env.API_AUTH_MODE = apiAuthMode;
process.env.NEXT_PUBLIC_AUTH_MODE = apiAuthMode;
process.env.API_RUNTIME_SYNC_MODE = smokeMode === "real" ? "enabled" : "disabled";

const prisma = new PrismaClient({
  adapter: new PrismaPg(databaseUrl),
  log: ["error"],
});

type JsonRecord = Record<string, unknown>;

type SmokeState = {
  patientId?: string;
  runtimeFixturePatientId?: string;
  runtimeTenantId?: string;
  convertedPatientId?: string;
  leadId?: string;
  invitationId?: string;
  appointmentId?: string;
  crossUnitAppointmentId?: string;
  cancelledAppointmentId?: string;
  rescheduledAppointmentId?: string;
  noShowAppointmentId?: string;
  returnAppointmentId?: string;
  encounterId?: string;
  clinicalTaskId?: string;
  smokeUserId?: string;
  supabaseUserId?: string;
  invitedSupabaseUserId?: string;
  billingPlanCode?: string;
  primaryUnitId?: string;
  secondaryUnitId?: string;
};

const state: SmokeState = {};
let requestAccessToken: string | null = null;

function deterministicUuid(namespace: string, key: string) {
  const hash = createHash("sha1").update(`${namespace}:${key}`).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;

  const hex = hash.subarray(0, 16).toString("hex");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function logStep(message: string) {
  console.log(`\n[api:smoke] ${message}`);
}

function assertRecord(value: unknown, message: string): asserts value is JsonRecord {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), message);
}

function assertPatientDetailShape(
  patientDetail: {
    id: string;
    summary: Record<string, unknown>;
    timeline: unknown[];
    habits: unknown[];
    tasks: Array<{ id: string; title?: string }>;
    operationalAlerts?: unknown[];
    commercialContext?: Record<string, unknown>;
  },
  expectedId: string,
  messagePrefix: string,
  expectedTaskId?: string,
  expectedTaskTitle?: string
) {
  assert.equal(patientDetail.id, expectedId, `${messagePrefix} retornou paciente inesperado.`);
  assertRecord(patientDetail.summary, `${messagePrefix} nao retornou summary valido.`);
  assert(Array.isArray(patientDetail.timeline), `${messagePrefix} nao retornou timeline.`);
  assert(Array.isArray(patientDetail.habits), `${messagePrefix} nao retornou habits.`);
  if (patientDetail.operationalAlerts !== undefined) {
    assert(Array.isArray(patientDetail.operationalAlerts), `${messagePrefix} nao retornou alerts.`);
  }
  if (patientDetail.commercialContext !== undefined) {
    assertRecord(patientDetail.commercialContext, `${messagePrefix} nao retornou commercialContext valido.`);
  }
  if (expectedTaskId || expectedTaskTitle) {
    assert(
      patientDetail.tasks.some(
        (task) =>
          (expectedTaskId ? task.id === expectedTaskId : false) ||
          (expectedTaskTitle ? task.title === expectedTaskTitle : false)
      ),
      `${messagePrefix} nao retornou a tarefa clinica criada no Paciente 360.`
    );
  }
}

async function requestJson<T = unknown>(
  path: string,
  init?: RequestInit,
  expectedStatus = 200
): Promise<T> {
  const headers = new Headers(init?.headers ?? {});

  if (requestAccessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${requestAccessToken}`);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });
  const text = await response.text();

  assert.equal(
    response.status,
    expectedStatus,
    `${init?.method ?? "GET"} ${path} retornou ${response.status}: ${text}`
  );

  return text ? (JSON.parse(text) as T) : (undefined as T);
}

async function requestJsonWithToken<T = unknown>(
  path: string,
  accessToken: string,
  init?: RequestInit,
  expectedStatus = 200
) {
  const headers = new Headers(init?.headers ?? {});
  headers.set("Authorization", `Bearer ${accessToken}`);

  return requestJson<T>(
    path,
    {
      ...init,
      headers,
    },
    expectedStatus
  );
}

async function requestEdgeFunctionJson<T = unknown>(
  functionName: string,
  body: unknown,
  expectedStatus = 200
) {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  assert(supabaseUrl, "SUPABASE_URL ausente para validar Edge Functions.");

  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();

  assert.equal(
    response.status,
    expectedStatus,
    `POST /functions/v1/${functionName} retornou ${response.status}: ${text}`
  );

  return text ? (JSON.parse(text) as T) : (undefined as T);
}

function formatDateQuery(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toFiniteNumber(value: unknown, message: string) {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  assert(Number.isFinite(parsed), message);
  return parsed;
}

function createRuntimeAuthenticatedClient() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  assert(supabaseUrl, "SUPABASE_URL ausente para validar RPCs autenticadas.");
  assert(publishableKey, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ausente para validar RPCs autenticadas.");
  assert(requestAccessToken, "Access token ausente para validar RPCs autenticadas.");

  return createClient(supabaseUrl, publishableKey, {
    global: {
      headers: {
        Authorization: `Bearer ${requestAccessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function createRuntimeAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  assert(supabaseUrl, "SUPABASE_URL ausente para validar RPCs com service_role.");
  assert(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY ausente para validar RPCs com service_role.");

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
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
      API_AUTH_MODE: apiAuthMode,
      NEXT_PUBLIC_AUTH_MODE: apiAuthMode,
      API_RUNTIME_SYNC_MODE: process.env.API_RUNTIME_SYNC_MODE,
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

  if (state.crossUnitAppointmentId) {
    await prisma.appointment
      .deleteMany({ where: { id: state.crossUnitAppointmentId } })
      .catch(() => undefined);
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

  if (state.returnAppointmentId) {
    await prisma.appointment.deleteMany({ where: { id: state.returnAppointmentId } }).catch(() => undefined);
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
    if (state.invitedSupabaseUserId) {
      await adminClient.auth.admin.deleteUser(state.invitedSupabaseUserId).catch(() => undefined);
    }
  }
}

function isRealAuthEnabled() {
  return smokeMode === "real";
}

function assertSmokeModeConfiguration() {
  if (!isRealAuthEnabled()) {
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  assert(supabaseUrl, "api:smoke:real exige SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_URL.");
  assert(serviceRoleKey, "api:smoke:real exige SUPABASE_SERVICE_ROLE_KEY.");
  assert(publishableKey, "api:smoke:real exige NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
}

async function setupRequestAuth() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!isRealAuthEnabled()) {
    return;
  }

  if (!supabaseUrl || !serviceRoleKey || !publishableKey) {
    throw new Error(
      "NEXT_PUBLIC_AUTH_MODE/API_AUTH_MODE esta em real, mas as variaveis do Supabase nao estao completas."
    );
  }

  logStep("Configurando sessao autenticada para validar rotas protegidas");

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
    prisma.unit.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
      take: 2,
      select: { id: true, name: true },
    }),
  ]);

  assert(unit.length > 0, "Nao foi encontrada nenhuma unidade para o smoke autenticado.");
  state.primaryUnitId = unit[0].id;
  state.secondaryUnitId = unit[1]?.id;

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
        create: unit.map((availableUnit, index) => ({
          unitId: availableUnit.id,
          accessLevel: index === 0 ? "PRIMARY" : "SECONDARY",
        })),
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
  requestAccessToken = signInResult.data.session.access_token;

  const authResponse = await requestJson<{
    user: { email: string; role: string };
    units: Array<{ id: string }>;
    currentUnitId: string;
    permissions: string[];
  }>(
    "/auth/me",
    undefined,
    200
  );

  assert.equal(authResponse.user.email, email, "auth/me retornou e-mail inesperado.");
  assert.equal(authResponse.user.role, "admin", "auth/me nao refletiu o papel esperado.");
  assert(authResponse.units.length > 0, "auth/me retornou usuario sem unidades.");
  assert.equal(
    authResponse.currentUnitId,
    state.primaryUnitId,
    "auth/me nao retornou a unidade primaria esperada."
  );
  assert(authResponse.permissions.includes("dashboard:view"), "auth/me nao retornou permissoes esperadas.");
}

async function ensureCommercialCatalogForSmokeTenant() {
  if (!isRealAuthEnabled()) {
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  assert(supabaseUrl, "SUPABASE_URL ausente para preparar catalogo comercial do smoke.");
  assert(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY ausente para preparar catalogo comercial do smoke.");

  const tenant = await prisma.tenant.findFirstOrThrow({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      legalName: true,
      tradeName: true,
      status: true,
      subscriptionPlanCode: true,
    },
  });

  const units = await prisma.unit.findMany({
    where: { tenantId: tenant.id, deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: {
      address: {
        select: {
          city: true,
        },
      },
    },
  });

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const scopeResult = await adminClient.rpc("backfill_runtime_scope", {
    p_legacy_tenant_id: tenant.id,
    p_legacy_tenant_legal_name: tenant.legalName,
    p_legacy_tenant_trade_name: tenant.tradeName,
    p_legacy_tenant_status: tenant.status,
    p_subscription_plan_code: tenant.subscriptionPlanCode,
    p_units: units.map((unit) => ({
      id: unit.id,
      name: unit.name,
      code: unit.code,
      city: unit.address?.city ?? "Sem cidade",
      status: unit.status,
      deletedAt: unit.deletedAt?.toISOString() ?? null,
    })),
  });

  assert(!scopeResult.error, `Falha ao preparar scope runtime do smoke: ${scopeResult.error?.message}`);
  assertRecord(scopeResult.data, "backfill_runtime_scope nao retornou payload valido para o smoke.");

  const runtimeTenantId = scopeResult.data.tenantId;
  assert(
    typeof runtimeTenantId === "string" && runtimeTenantId,
    "Scope runtime do smoke nao retornou tenantId."
  );
  state.runtimeTenantId = runtimeTenantId;
  state.billingPlanCode = tenant.subscriptionPlanCode ?? "smoke-growth";

  const billingResult = await adminClient.rpc("backfill_runtime_platform_billing", {
    p_runtime_tenant_id: runtimeTenantId,
    p_plans: [
      {
        id: deterministicUuid("smoke_tenant_plan", state.billingPlanCode),
        code: state.billingPlanCode,
        name: "Smoke Growth",
        description: "Plano seeded pelo smoke para validar billing SaaS separado do financeiro clinico.",
        status: "active",
        billing_interval: "monthly",
        currency_code: "BRL",
        price_amount: 499,
        trial_days: 7,
        included_limits: {
          activePatients: 300,
          activeStaff: 25,
          monthlyAppointments: 1500,
        },
        features: {
          patientApp: true,
          commercialCatalog: true,
          financialSummary: true,
        },
        metadata: {
          source: "api_smoke",
        },
      },
    ],
    p_subscriptions: [
      {
        id: deterministicUuid("smoke_tenant_subscription", tenant.id),
        plan_reference: state.billingPlanCode,
        status: "active",
        started_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        auto_renew: true,
        external_customer_id: `smoke-customer-${tenant.id}`,
        external_subscription_id: `smoke-subscription-${tenant.id}`,
        metadata: {
          source: "api_smoke",
        },
      },
    ],
  });

  assert(
    !billingResult.error,
    `Falha ao preparar billing SaaS do smoke: ${billingResult.error?.message}`
  );

  const commercialCatalogResult = await adminClient.rpc("backfill_runtime_commercial_catalog", {
    p_runtime_tenant_id: runtimeTenantId,
    p_services: [
      {
        legacy_service_id: `smoke-service-initial-${tenant.id}`,
        name: "Consulta inicial smoke",
        code: "smoke_initial_consult",
        description: "Servico seeded pelo smoke para validar matriculas no tenant autenticado.",
        service_type: "consultation",
        duration_minutes: 60,
        list_price: 320,
        currency_code: "BRL",
        active: true,
        metadata: {
          source: "api_smoke",
        },
      },
      {
        legacy_service_id: `smoke-service-follow-${tenant.id}`,
        name: "Retorno smoke",
        code: "smoke_follow_up",
        description: "Retorno de acompanhamento seeded pelo smoke.",
        service_type: "nutrition",
        duration_minutes: 30,
        list_price: 180,
        currency_code: "BRL",
        active: true,
        metadata: {
          source: "api_smoke",
        },
      },
    ],
    p_packages: [
      {
        legacy_package_id: `smoke-package-starter-${tenant.id}`,
        name: "Pacote smoke starter",
        code: "smoke_starter_package",
        description: "Pacote seeded para validar enrollments no Paciente 360.",
        package_type: "clinical",
        billing_model: "one_time",
        tier: "starter",
        price: 890,
        currency_code: "BRL",
        featured: true,
        active: true,
        metadata: {
          source: "api_smoke",
          allowsCommunity: true,
          chatPriority: false,
        },
      },
    ],
    p_package_services: [
      {
        legacy_package_id: `smoke-package-starter-${tenant.id}`,
        legacy_service_id: `smoke-service-initial-${tenant.id}`,
        quantity: 1,
        required: true,
        notes: "Consulta inicial do pacote smoke.",
        metadata: {
          source: "api_smoke",
        },
      },
      {
        legacy_package_id: `smoke-package-starter-${tenant.id}`,
        legacy_service_id: `smoke-service-follow-${tenant.id}`,
        quantity: 3,
        required: true,
        notes: "Retornos previstos no pacote smoke.",
        metadata: {
          source: "api_smoke",
        },
      },
    ],
    p_programs: [
      {
        legacy_program_id: `smoke-program-main-${tenant.id}`,
        name: "Programa smoke metabolic",
        code: "smoke_metabolic_program",
        description: "Programa seeded pelo smoke para habilitar matriculas comerciais.",
        program_type: "clinical",
        duration_days: 84,
        featured: true,
        active: true,
        metadata: {
          source: "api_smoke",
        },
      },
    ],
    p_program_packages: [
      {
        legacy_program_id: `smoke-program-main-${tenant.id}`,
        legacy_package_id: `smoke-package-starter-${tenant.id}`,
        sort_order: 0,
        recommended: true,
        metadata: {
          source: "api_smoke",
        },
      },
    ],
  });

  assert(
    !commercialCatalogResult.error,
    `Falha ao preparar catalogo comercial do smoke: ${commercialCatalogResult.error?.message}`
  );
}

async function main() {
  assertSmokeModeConfiguration();
  await assertDatabaseAvailable(databaseUrl);

  logStep(
    smokeMode === "real"
      ? "Modo real/runtime: auth real, RPCs Supabase, catalogo, documentos e assinatura serao exigidos"
      : "Modo local/mock: validando rotas essenciais, shapes e fluxos minimos sem runtime Supabase"
  );
  logStep("Consultando fixtures base");

  const [appointmentType, professional, tenant, pipelineStage] = await Promise.all([
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
    await setupRequestAuth();
    await ensureCommercialCatalogForSmokeTenant();

    if (isRealAuthEnabled()) {
      assert(state.primaryUnitId, "Unidade primaria ausente para validar runtime do Paciente 360.");

      const runtimeFixturePatient = await prisma.patient.findFirstOrThrow({
        where: {
          tenantId: tenant.id,
          deletedAt: null,
          OR: [
            {
              appointments: {
                some: {
                  unitId: state.primaryUnitId,
                  deletedAt: null,
                },
              },
            },
            {
              encounters: {
                some: {
                  unitId: state.primaryUnitId,
                },
              },
            },
          ],
        },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });

      state.runtimeFixturePatientId = runtimeFixturePatient.id;
    }

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

    const commercialCatalog = await requestJson<{
      services: Array<{ id: string }>;
      packages: Array<{ id: string }>;
      packageServices: unknown[];
      programs: Array<{ id: string }>;
      programPackages: Array<{ programId: string; packageId: string }>;
    }>("/leads/catalog");
    assert(Array.isArray(commercialCatalog.services), "leads/catalog nao retornou services.");
    assert(Array.isArray(commercialCatalog.packages), "leads/catalog nao retornou packages.");
    assert(
      Array.isArray(commercialCatalog.packageServices),
      "leads/catalog nao retornou packageServices."
    );
    assert(Array.isArray(commercialCatalog.programs), "leads/catalog nao retornou programs.");
    assert(
      Array.isArray(commercialCatalog.programPackages),
      "leads/catalog nao retornou programPackages."
    );

    const smokeProgramId = commercialCatalog.programs[0]?.id ?? null;
    const smokePackageId =
      commercialCatalog.programPackages.find((item) => item.programId === smokeProgramId)?.packageId ??
      commercialCatalog.packages[0]?.id ??
      null;

    if (isRealAuthEnabled()) {
      assert(smokeProgramId, "leads/catalog nao retornou programId para o smoke.");
      assert(smokePackageId, "leads/catalog nao retornou packageId para o smoke.");
    }

    const clinicalTasks = await requestJson<{ items: unknown[] }>("/clinical/tasks");
    assert(Array.isArray(clinicalTasks.items), "clinical/tasks nao retornou items.");

    let settingsAccess: {
      canManageAccess: boolean;
      roles: unknown[];
      units: Array<{ id: string }>;
      members: unknown[];
      pendingInvitations: Array<{ id: string; email: string }>;
    } | null = null;

    if (isRealAuthEnabled()) {
      settingsAccess = await requestJson<{
        canManageAccess: boolean;
        roles: unknown[];
        units: Array<{ id: string }>;
        members: unknown[];
        pendingInvitations: Array<{ id: string; email: string }>;
      }>("/settings/access");
      assert.equal(
        settingsAccess.canManageAccess,
        true,
        "settings/access deveria permitir gerenciamento para o usuario autenticado no smoke."
      );
      assert(Array.isArray(settingsAccess.roles), "settings/access nao retornou lista de papeis.");
      assert(Array.isArray(settingsAccess.units), "settings/access nao retornou lista de unidades.");
      assert(Array.isArray(settingsAccess.members), "settings/access nao retornou lista de membros.");
      assert(
        Array.isArray(settingsAccess.pendingInvitations),
        "settings/access nao retornou lista de convites."
      );
      assert(settingsAccess.units.length > 0, "settings/access nao retornou unidades para o convite.");
    }

    if (isRealAuthEnabled()) {
      const runtimeReadClient = createRuntimeAuthenticatedClient();
      const tenantBillingSummaryResult = await runtimeReadClient.rpc("current_tenant_billing_summary");

      assert(
        !tenantBillingSummaryResult.error,
        `RPC current_tenant_billing_summary falhou: ${tenantBillingSummaryResult.error?.message}`
      );
      assertRecord(
        tenantBillingSummaryResult.data,
        "RPC current_tenant_billing_summary nao retornou objeto."
      );

      const tenantBillingSummary = tenantBillingSummaryResult.data as JsonRecord;

      assertRecord(
        tenantBillingSummary.plan,
        "RPC current_tenant_billing_summary nao retornou bloco plan."
      );
      assertRecord(
        tenantBillingSummary.subscription,
        "RPC current_tenant_billing_summary nao retornou bloco subscription."
      );
      assert(
        Array.isArray(tenantBillingSummary.meters),
        "RPC current_tenant_billing_summary nao retornou lista de meters."
      );
      assert(
        tenantBillingSummary.meters.some(
          (meter) =>
            Boolean(meter) &&
            typeof meter === "object" &&
            "code" in meter &&
            (
              (meter as { code?: unknown }).code === "active_patients" ||
              (meter as { code?: unknown }).code === "active_staff" ||
              (meter as { code?: unknown }).code === "monthly_appointments"
            )
        ),
        "RPC current_tenant_billing_summary nao retornou os medidores padrao do tenant."
      );
      if (state.billingPlanCode) {
        assert.equal(
          (tenantBillingSummary.plan as JsonRecord).code,
          state.billingPlanCode,
          "RPC current_tenant_billing_summary nao refletiu o plano SaaS esperado."
        );
      }
    }

    const unauthorized = await fetch(`${baseUrl}/auth/me`);
    assert.equal(unauthorized.status, 401, "auth/me sem token deveria retornar 401.");
    if (isRealAuthEnabled()) {
      const protectedWithoutToken = await fetch(`${baseUrl}/patients`);
      assert.equal(
        protectedWithoutToken.status,
        401,
        "patients sem token deveria retornar 401 quando auth real estiver habilitado."
      );

      const invalidUnitResponse = await fetch(`${baseUrl}/appointments`, {
        headers: {
          Authorization: `Bearer ${requestAccessToken}`,
          "x-current-unit-id": "unit-inexistente-smoke",
        },
      });
      assert.equal(
        invalidUnitResponse.status,
        403,
        "appointments com unidade fora do escopo deveria retornar 403."
      );
    }

    logStep("Executando fluxo de escrita via HTTP");

    const timestamp = Date.now();
    const invitationEmail = `smoke.invite.${timestamp}@emagreceplus.local`;

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

    if (isRealAuthEnabled()) {
      assert(smokeProgramId, "Catalogo comercial do smoke sem programId para matricula.");
      assert(smokePackageId, "Catalogo comercial do smoke sem packageId para matricula.");

      const enrollmentContext = await requestJson<{
        hasCommercialContext: boolean;
        enrollment?: { id?: string; status?: string } | null;
        program?: { id?: string } | null;
        package?: { id?: string } | null;
        entitlements?: unknown[];
      }>(
        `/patients/${createdPatient.id}/enrollments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            programId: smokeProgramId,
            packageId: smokePackageId,
            startDate: formatDateQuery(new Date()),
            notes: "Matricula criada no smoke para validar contexto comercial runtime.",
          }),
        },
        201
      );

      assert.equal(
        enrollmentContext.hasCommercialContext,
        true,
        "POST /patients/:id/enrollments deveria retornar hasCommercialContext=true."
      );
      assertRecord(
        enrollmentContext.enrollment,
        "POST /patients/:id/enrollments nao retornou bloco enrollment."
      );
      assertRecord(
        enrollmentContext.program,
        "POST /patients/:id/enrollments nao retornou bloco program."
      );
      assertRecord(
        enrollmentContext.package,
        "POST /patients/:id/enrollments nao retornou bloco package."
      );
      assert(
        Array.isArray(enrollmentContext.entitlements) && enrollmentContext.entitlements.length > 0,
        "POST /patients/:id/enrollments nao retornou entitlements derivados do pacote."
      );

      const runtimeClient = createRuntimeAuthenticatedClient();

      const createdPendingFinancialItemResult = await runtimeClient.rpc("record_financial_item", {
        p_patient_id: createdPatient.id,
        p_enrollment_id: String(enrollmentContext.enrollment.id ?? ""),
        p_package_id: String(enrollmentContext.package.id ?? ""),
        p_item_type: "service",
        p_reference_code: `SMOKE-FIN-PENDING-${timestamp}`,
        p_description: "Titulo pendente criado no smoke para validar o resumo financeiro.",
        p_currency_code: "BRL",
        p_amount_total: 240,
        p_due_date: formatDateQuery(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)),
        p_billing_model: "recurring",
        p_metadata: {
          source: "api_smoke",
          flow: "patient_enrollment",
        },
      });

      assert(
        !createdPendingFinancialItemResult.error,
        `RPC record_financial_item falhou para titulo pendente: ${createdPendingFinancialItemResult.error?.message}`
      );
      assertRecord(
        createdPendingFinancialItemResult.data,
        "RPC record_financial_item nao retornou payload valido para o titulo pendente."
      );

      const reconciledFinancialItemResult = await runtimeClient.rpc("reconcile_financial_item", {
        p_financial_item_id: createdPendingFinancialItemResult.data.id,
        p_amount_paid: 60,
        p_paid_at: new Date().toISOString(),
        p_reconciliation_status: "partially_reconciled",
        p_notes: "Pagamento parcial registrado no smoke.",
        p_metadata: {
          source: "api_smoke",
          flow: "patient_enrollment",
        },
      });

      assert(
        !reconciledFinancialItemResult.error,
        `RPC reconcile_financial_item falhou para titulo pendente: ${reconciledFinancialItemResult.error?.message}`
      );
      assertRecord(
        reconciledFinancialItemResult.data,
        "RPC reconcile_financial_item nao retornou payload valido para o titulo pendente."
      );

      const createdOverdueFinancialItemResult = await runtimeClient.rpc("record_financial_item", {
        p_patient_id: createdPatient.id,
        p_enrollment_id: String(enrollmentContext.enrollment.id ?? ""),
        p_package_id: String(enrollmentContext.package.id ?? ""),
        p_item_type: "service",
        p_reference_code: `SMOKE-FIN-OVERDUE-${timestamp}`,
        p_description: "Titulo vencido criado no smoke para validar atraso financeiro.",
        p_currency_code: "BRL",
        p_amount_total: 180,
        p_due_date: formatDateQuery(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)),
        p_billing_model: "one_time",
        p_metadata: {
          source: "api_smoke",
          flow: "patient_enrollment",
        },
      });

      assert(
        !createdOverdueFinancialItemResult.error,
        `RPC record_financial_item falhou para titulo vencido: ${createdOverdueFinancialItemResult.error?.message}`
      );
      assertRecord(
        createdOverdueFinancialItemResult.data,
        "RPC record_financial_item nao retornou payload valido para o titulo vencido."
      );
    }

    if (isRealAuthEnabled()) {
      assert(settingsAccess, "settings/access nao foi preparado para validar convites.");

      const createdInvitation = await requestJson<{ id: string; email: string; status: string }>(
        "/settings/invitations",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: invitationEmail,
            roleCode: "assistant",
            unitIds: [settingsAccess.units[0].id],
            expiresInDays: 7,
            note: "Smoke test access invitation",
          }),
        },
        201
      );

      state.invitationId = createdInvitation.id;
      assert.equal(createdInvitation.email, invitationEmail, "POST /settings/invitations retornou email inesperado.");
      assert.equal(createdInvitation.status, "pending", "POST /settings/invitations deveria retornar status pending.");

      const settingsAfterInvite = await requestJson<{
        pendingInvitations: Array<{ id: string; email: string }>;
      }>("/settings/access");

      assert(
        settingsAfterInvite.pendingInvitations.some((invitation) => invitation.id === createdInvitation.id),
        "settings/access nao refletiu o convite recem-criado."
      );

      const revokedInvitation = await requestJson<{ id: string; status: string }>(
        `/settings/invitations/${createdInvitation.id}`,
        {
          method: "DELETE",
        }
      );

      assert.equal(revokedInvitation.id, createdInvitation.id, "DELETE /settings/invitations retornou id inesperado.");
      assert.equal(revokedInvitation.status, "revoked", "DELETE /settings/invitations deveria revogar o convite.");

      const settingsAfterRevoke = await requestJson<{
        pendingInvitations: Array<{ id: string }>;
      }>("/settings/access");

      assert(
        !settingsAfterRevoke.pendingInvitations.some((invitation) => invitation.id === createdInvitation.id),
        "settings/access ainda retornou o convite depois da revogacao."
      );

      const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

      assert(supabaseUrl, "SUPABASE_URL ausente para validar aceite de convite.");
      assert(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY ausente para validar aceite de convite.");
      assert(publishableKey, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ausente para validar aceite de convite.");

      const adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });

      const inviteePublicClient = createClient(supabaseUrl, publishableKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });

      const invitedEmail = `smoke.invited.${timestamp}@emagreceplus.local`;
      const invitedPassword = `TmpInvite!${timestamp}Ab`;

      const invitedInvitation = await requestJson<{ id: string; email: string; status: string }>(
        "/settings/invitations",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: invitedEmail,
            roleCode: "assistant",
            unitIds: [settingsAccess.units[0].id],
            expiresInDays: 7,
            note: "Smoke test invitation acceptance",
          }),
        },
        201
      );

      const invitedCreateResult = await adminClient.auth.admin.createUser({
        email: invitedEmail,
        password: invitedPassword,
        email_confirm: true,
        user_metadata: {
          full_name: "Smoke Invited User",
        },
      });

      assert(
        !invitedCreateResult.error,
        `Falha ao criar usuario convidado no Supabase: ${invitedCreateResult.error?.message}`
      );
      assert(
        invitedCreateResult.data.user?.id,
        "Supabase nao retornou o id do usuario convidado."
      );
      state.invitedSupabaseUserId = invitedCreateResult.data.user.id;

      const invitedSignInResult = await inviteePublicClient.auth.signInWithPassword({
        email: invitedEmail,
        password: invitedPassword,
      });

      assert(
        !invitedSignInResult.error,
        `Falha no sign-in do usuario convidado: ${invitedSignInResult.error?.message}`
      );
      assert(
        invitedSignInResult.data.session?.access_token,
        "Supabase nao retornou access token para o usuario convidado."
      );

      const invitedAccessToken = invitedSignInResult.data.session.access_token;

      const invitedSession = await requestJsonWithToken<{
        user: { email: string; role: string };
        units: Array<{ id: string }>;
        currentUnitId: string;
        permissions: string[];
      }>("/auth/me", invitedAccessToken);

      assert.equal(
        invitedSession.user.email,
        invitedEmail,
        "auth/me nao refletiu o e-mail do usuario convidado."
      );
      assert.equal(
        invitedSession.user.role,
        "assistant",
        "auth/me nao refletiu o papel esperado para o usuario convidado."
      );
      assert(
        invitedSession.permissions.includes("dashboard:view"),
        "Usuario convidado nao recebeu permissoes runtime esperadas."
      );
      assert(
        invitedSession.units.length === 1,
        "Usuario convidado deveria receber apenas a unidade convidada."
      );
      assert.equal(
        invitedSession.currentUnitId,
        invitedSession.units[0].id,
        "Usuario convidado nao abriu com a unidade principal esperada."
      );

      const invitedDashboard = await requestJsonWithToken<{ stats: JsonRecord }>(
        "/dashboard/summary",
        invitedAccessToken
      );
      assertRecord(invitedDashboard.stats, "Usuario convidado nao conseguiu acessar dashboard/summary.");

      const settingsAfterAcceptance = await requestJson<{
        pendingInvitations: Array<{ id: string }>;
      }>("/settings/access");

      assert(
        !settingsAfterAcceptance.pendingInvitations.some(
          (invitation) => invitation.id === invitedInvitation.id
        ),
        "Convite aceito ainda apareceu como pendente em settings/access."
      );
    }

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
          professionalId: professional.id,
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

    const enqueuedPatient = await requestJson<{
      id: string;
      status: string;
      queueStatus: string;
    }>(
      `/appointments/${createdAppointment.id}/enqueue`,
      {
        method: "PATCH",
      },
      200
    );

    assert.equal(
      enqueuedPatient.id,
      createdAppointment.id,
      "PATCH /appointments/:id/enqueue retornou agendamento inesperado."
    );
    assert.equal(
      enqueuedPatient.status,
      "Check-in",
      "PATCH /appointments/:id/enqueue nao deveria alterar o status legado do agendamento."
    );
    assert.equal(
      enqueuedPatient.queueStatus,
      "Na fila",
      "PATCH /appointments/:id/enqueue nao colocou o paciente na fila."
    );

    if (
      isRealAuthEnabled() &&
      state.primaryUnitId &&
      state.secondaryUnitId &&
      state.secondaryUnitId !== state.primaryUnitId
    ) {
      const crossUnitStartsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const crossUnitEndsAt = new Date(crossUnitStartsAt.getTime() + 30 * 60 * 1000);

      const crossUnitAppointment = await requestJson<{ id: string }>(
        "/appointments",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-current-unit-id": state.secondaryUnitId,
          },
          body: JSON.stringify({
            patientId: createdPatient.id,
            appointmentTypeId: appointmentType.id,
            startsAt: crossUnitStartsAt.toISOString(),
            endsAt: crossUnitEndsAt.toISOString(),
            notes: "Smoke test appointment for alternate unit",
          }),
        },
        201
      );

      state.crossUnitAppointmentId = crossUnitAppointment.id;

      const primaryUnitView = await requestJson<{ items: Array<{ id: string }> }>(
        `/appointments?date=${formatDateQuery(crossUnitStartsAt)}`,
        {
          headers: {
            "x-current-unit-id": state.primaryUnitId,
          },
        }
      );

      assert(
        !primaryUnitView.items.some((appointment) => appointment.id === crossUnitAppointment.id),
        "A unidade primaria nao deveria enxergar agendamentos criados em outra unidade."
      );

      const secondaryUnitView = await requestJson<{ items: Array<{ id: string }> }>(
        `/appointments?date=${formatDateQuery(crossUnitStartsAt)}`,
        {
          headers: {
            "x-current-unit-id": state.secondaryUnitId,
          },
        }
      );

      assert(
        secondaryUnitView.items.some((appointment) => appointment.id === crossUnitAppointment.id),
        "A unidade secundaria nao retornou o agendamento criado no proprio escopo."
      );
    }

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

    const startedEncounter = await requestJson<{
      appointmentId: string;
      appointmentStatus: string;
      encounterId: string;
      encounterStatus: string;
      queueStatus: string | null;
    }>(
      `/appointments/${createdAppointment.id}/start-encounter`,
      {
        method: "PATCH",
      },
      200
    );

    state.encounterId = startedEncounter.encounterId;
    assert.equal(
      startedEncounter.appointmentId,
      createdAppointment.id,
      "PATCH /appointments/:id/start-encounter retornou agendamento inesperado."
    );
    assert.equal(
      startedEncounter.appointmentStatus,
      "Em atendimento",
      "PATCH /appointments/:id/start-encounter nao atualizou o status do agendamento."
    );
    assert.equal(
      startedEncounter.encounterStatus,
      "OPEN",
      "PATCH /appointments/:id/start-encounter deveria abrir o encounter legado."
    );
    if (isRealAuthEnabled()) {
      assert.equal(
        startedEncounter.queueStatus,
        "Em atendimento",
        "PATCH /appointments/:id/start-encounter nao refletiu a fila em atendimento."
      );
    }

    const createdClinicalTask = await requestJson<{ id: string; title: string }>(
      "/clinical/tasks",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: createdPatient.id,
          encounterId: startedEncounter.encounterId,
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

    const patientDetail = await requestJson<{
      id: string;
      summary: Record<string, unknown>;
      timeline: unknown[];
      habits: unknown[];
      tasks: Array<{ id: string }>;
      operationalAlerts?: unknown[];
      commercialContext?: Record<string, unknown>;
    }>(`/patients/${createdPatient.id}`);
    assertPatientDetailShape(
      patientDetail,
      createdPatient.id,
      "GET /patients/:id",
      createdClinicalTask.id,
      createdClinicalTask.title
    );
    if (isRealAuthEnabled()) {
      assertRecord(
        patientDetail.commercialContext,
        "GET /patients/:id deveria refletir commercialContext apos a matricula."
      );
      assert.equal(
        patientDetail.commercialContext.hasCommercialContext,
        true,
        "GET /patients/:id deveria indicar hasCommercialContext=true para o paciente matriculado."
      );
      assert(
        Array.isArray(patientDetail.commercialContext.entitlements) &&
          patientDetail.commercialContext.entitlements.length > 0,
        "GET /patients/:id deveria refletir entitlements da matricula criada."
      );
      assertRecord(
        patientDetail.commercialContext.financialSummary,
        "GET /patients/:id deveria refletir financialSummary apos os titulos financeiros do smoke."
      );
      assert.equal(
        patientDetail.commercialContext.financialSummary.pendingCount,
        1,
        "GET /patients/:id deveria refletir exatamente um titulo pendente apos a conciliacao parcial."
      );
      assert.equal(
        patientDetail.commercialContext.financialSummary.overdueCount,
        1,
        "GET /patients/:id deveria refletir exatamente um titulo vencido no runtime."
      );
      assert.equal(
        toFiniteNumber(
          patientDetail.commercialContext.financialSummary.pendingAmount,
          "GET /patients/:id nao retornou pendingAmount numerico."
        ),
        180,
        "GET /patients/:id deveria refletir saldo pendente liquido de BRL 180,00."
      );
      assert.equal(
        toFiniteNumber(
          patientDetail.commercialContext.financialSummary.overdueAmount,
          "GET /patients/:id nao retornou overdueAmount numerico."
        ),
        180,
        "GET /patients/:id deveria refletir saldo vencido de BRL 180,00."
      );
    }

    assert(state.convertedPatientId, "Paciente convertido ausente para validar o detalhe runtime.");

    const convertedPatientDetail = await requestJson<{
      id: string;
      summary: Record<string, unknown>;
      timeline: unknown[];
      habits: unknown[];
      tasks: Array<{ id: string; title?: string }>;
      operationalAlerts?: unknown[];
      commercialContext?: Record<string, unknown>;
    }>(`/patients/${state.convertedPatientId}`);

    assertPatientDetailShape(
      convertedPatientDetail,
      state.convertedPatientId,
      "GET /patients/:id (converted lead)"
    );
    if (isRealAuthEnabled()) {
      assertRecord(
        convertedPatientDetail.commercialContext,
        "GET /patients/:id (converted lead) nao retornou commercialContext."
      );
      assert.equal(
        convertedPatientDetail.commercialContext.hasCommercialContext,
        true,
        "GET /patients/:id (converted lead) deveria indicar contexto comercial apos a conversao."
      );
    }

    if (isRealAuthEnabled() && state.patientId && state.runtimeTenantId) {
      const runtimeAdminClient = createRuntimeAdminClient();
      const nutritionBackfillResult = await runtimeAdminClient.rpc("backfill_runtime_nutrition_domain", {
        p_runtime_tenant_id: state.runtimeTenantId,
        p_nutrition_plans: [
          {
            id: deterministicUuid("smoke_nutrition_plan", state.patientId),
            legacy_nutrition_plan_id: `smoke-nutrition-plan-${state.patientId}`,
            patient_reference: state.patientId,
            plan_name: "Plano nutricional smoke",
            plan_status: "active",
            summary: "Plano nutricional criado pelo smoke para validar vigencia e leitura curada.",
            starts_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
            ends_at: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
            metadata: {
              source: "api_smoke",
            },
          },
        ],
        p_nutrition_plan_versions: [
          {
            id: deterministicUuid("smoke_nutrition_plan_version", state.patientId),
            legacy_nutrition_version_id: `smoke-nutrition-version-${state.patientId}`,
            nutrition_plan_reference: `smoke-nutrition-plan-${state.patientId}`,
            version_number: 2,
            version_status: "published",
            title: "Versao 2 - Vigente no smoke",
            summary: "Versao vigente para validar cockpit e encounter estruturados.",
            guidance: "Priorizar proteina nas refeicoes principais e manter a hidratacao distribuida.",
            meal_goal_daily: 4,
            water_goal_ml: 2200,
            effective_from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
            effective_to: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
            published_at: new Date().toISOString(),
            metadata: {
              source: "api_smoke",
            },
          },
        ],
        p_nutrition_targets: [
          {
            id: deterministicUuid("smoke_nutrition_target", `${state.patientId}-meals`),
            legacy_target_id: `smoke-nutrition-target-meals-${state.patientId}`,
            nutrition_plan_version_reference: `smoke-nutrition-version-${state.patientId}`,
            target_type: "meal",
            code: "daily_meals",
            label: "Manter 4 refeicoes por dia",
            goal_value: 4,
            unit: "refeicoes",
            period: "day",
            position: 1,
            active: true,
            guidance: "Nao concentrar toda a ingestao no fim do dia.",
            metadata: {
              source: "api_smoke",
            },
          },
          {
            id: deterministicUuid("smoke_nutrition_target", `${state.patientId}-protein`),
            legacy_target_id: `smoke-nutrition-target-protein-${state.patientId}`,
            nutrition_plan_version_reference: `smoke-nutrition-version-${state.patientId}`,
            target_type: "macro",
            code: "protein_daily",
            label: "Meta proteica diaria",
            goal_value: 130,
            unit: "g",
            period: "day",
            position: 2,
            active: true,
            guidance: "Distribuir proteina entre almoco, jantar e lanches estruturados.",
            metadata: {
              source: "api_smoke",
            },
          },
          {
            id: deterministicUuid("smoke_nutrition_target", `${state.patientId}-hydration`),
            legacy_target_id: `smoke-nutrition-target-hydration-${state.patientId}`,
            nutrition_plan_version_reference: `smoke-nutrition-version-${state.patientId}`,
            target_type: "hydration",
            code: "water_daily",
            label: "Meta de hidratacao",
            goal_value: 2200,
            unit: "ml",
            period: "day",
            position: 3,
            active: true,
            guidance: "Espalhar a agua ao longo do dia para reduzir fadiga no fim da tarde.",
            metadata: {
              source: "api_smoke",
            },
          },
        ],
      });

      assert(
        !nutritionBackfillResult.error,
        `RPC backfill_runtime_nutrition_domain falhou: ${nutritionBackfillResult.error?.message}`
      );
    }

    if (isRealAuthEnabled() && state.runtimeFixturePatientId) {
      const patientAppTargetId = state.patientId ?? state.runtimeFixturePatientId;

      const runtimePatientDetail = await requestJson<{
        id: string;
        summary: Record<string, unknown>;
        timeline: unknown[];
        habits: unknown[];
        tasks: Array<{ id: string }>;
        operationalAlerts?: unknown[];
        commercialContext?: Record<string, unknown>;
      }>(`/patients/${state.runtimeFixturePatientId}`);

      assertPatientDetailShape(
        runtimePatientDetail,
        state.runtimeFixturePatientId,
        "GET /patients/:id (runtime fixture)"
      );

      const patientAppCockpitBefore = await requestJson<{
        patient: { id: string; name: string };
        nextAppointment: unknown;
        weeklyCounts: {
          waterCount: number;
          mealCount: number;
          workoutCount: number;
          sleepCount: number;
          symptomCount: number;
          checkinCount: number;
        };
        todayHydrationMl: number;
        todayCheckIn: { id: string; mood: string | null } | null;
        recentActivity: Array<{ id: string; eventType: string }>;
        nutritionPlan: {
          id: string;
          currentVersion: {
            id: string;
            versionNumber: number;
          } | null;
          targets: Array<{ id: string }>;
        } | null;
        commercialContext: {
          hasCommercialContext: boolean;
          financialSummary?: {
            overdueCount?: number;
          } | null;
        } | null;
        accessState: {
          status: string;
          financialStatus: string;
          features: {
            habitLogs: { enabled: boolean };
            community: { enabled: boolean };
            scheduleReturn: { enabled: boolean };
          };
        } | null;
        logs: {
          hydration: Array<{ id: string }>;
          meals: Array<{ id: string }>;
          workouts: Array<{ id: string }>;
          sleep: Array<{ id: string }>;
          symptoms: Array<{ id: string }>;
          checkins: Array<{ id: string }>;
        };
      }>(`/patient-app/cockpit?patientId=${encodeURIComponent(patientAppTargetId)}`);

      assert.equal(
        patientAppCockpitBefore.patient.id,
        patientAppTargetId,
        "GET /patient-app/cockpit nao retornou o fixture runtime esperado."
      );
      assert(
        typeof patientAppCockpitBefore.todayHydrationMl === "number",
        "GET /patient-app/cockpit nao retornou total diario de hidratacao."
      );
      assert(
        Array.isArray(patientAppCockpitBefore.logs.hydration),
        "GET /patient-app/cockpit nao retornou lista de hidratacao."
      );
      assert(
        Array.isArray(patientAppCockpitBefore.logs.checkins),
        "GET /patient-app/cockpit nao retornou lista de check-ins."
      );
      assert(
        Array.isArray(patientAppCockpitBefore.recentActivity),
        "GET /patient-app/cockpit nao retornou atividade recente."
      );
      assert.equal(
        patientAppCockpitBefore.commercialContext?.hasCommercialContext,
        true,
        "GET /patient-app/cockpit nao retornou o contexto comercial do fixture."
      );
      assert.equal(
        patientAppCockpitBefore.commercialContext?.financialSummary?.overdueCount,
        1,
        "GET /patient-app/cockpit deveria refletir o titulo vencido seeded para o fixture."
      );
      assert.equal(
        patientAppCockpitBefore.accessState?.status,
        "attention",
        "GET /patient-app/cockpit deveria sinalizar attention para o fixture com pendencia vencida."
      );
      assert.equal(
        patientAppCockpitBefore.accessState?.financialStatus,
        "overdue",
        "GET /patient-app/cockpit deveria sinalizar financeiro overdue para o fixture."
      );
      assert.equal(
        patientAppCockpitBefore.accessState?.features.habitLogs.enabled,
        true,
        "GET /patient-app/cockpit nao deveria bloquear os registros diarios."
      );
      assert.equal(
        patientAppCockpitBefore.accessState?.features.community.enabled,
        false,
        "GET /patient-app/cockpit deveria bloquear comunidade quando houver pendencia vencida."
      );
      assert.equal(
        patientAppCockpitBefore.accessState?.features.scheduleReturn.enabled,
        false,
        "GET /patient-app/cockpit deveria bloquear retorno quando houver pendencia vencida."
      );
      assert(
        patientAppCockpitBefore.nutritionPlan?.currentVersion?.id,
        "GET /patient-app/cockpit nao retornou a versao nutricional vigente."
      );
      assert.equal(
        patientAppCockpitBefore.nutritionPlan?.currentVersion?.versionNumber,
        2,
        "GET /patient-app/cockpit deveria expor a versao nutricional vigente seeded."
      );
      assert(
        (patientAppCockpitBefore.nutritionPlan?.targets.length ?? 0) >= 3,
        "GET /patient-app/cockpit nao retornou as metas nutricionais estruturadas."
      );

      const patientAppWaterLog = await requestJson<{ id: string; amountMl: number }>(
        `/patient-app/water-logs?patientId=${encodeURIComponent(patientAppTargetId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amountMl: 350,
            loggedAt: new Date().toISOString(),
          }),
        },
        201
      );

      const patientAppMealLog = await requestJson<{
        id: string;
        mealType: string;
        nutritionPlanVersionId: string | null;
      }>(
        `/patient-app/meal-logs?patientId=${encodeURIComponent(patientAppTargetId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mealType: "Lanche",
            description: "Iogurte com fruta",
            adherenceRating: 4,
            loggedAt: new Date().toISOString(),
          }),
        },
        201
      );

      const patientAppWorkoutLog = await requestJson<{ id: string; workoutType: string }>(
        `/patient-app/workout-logs?patientId=${encodeURIComponent(patientAppTargetId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workoutType: "Caminhada",
            durationMinutes: 30,
            intensity: "Leve",
            completed: true,
            loggedAt: new Date().toISOString(),
          }),
        },
        201
      );

      const patientAppSleepLog = await requestJson<{ id: string; sleepDate: string }>(
        `/patient-app/sleep-logs?patientId=${encodeURIComponent(patientAppTargetId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sleepDate: new Date().toISOString().slice(0, 10),
            hours: 7.2,
            qualityScore: 7,
          }),
        },
        201
      );

      const patientAppSymptomLog = await requestJson<{ id: string; symptomType: string }>(
        `/patient-app/symptom-logs?patientId=${encodeURIComponent(patientAppTargetId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symptomType: "Ansiedade",
            severityScore: 4,
            description: "Oscilacao leve no fim da tarde",
            loggedAt: new Date().toISOString(),
          }),
        },
        201
      );

      const patientAppDailyCheckin = await requestJson<{ id: string; mood: string | null }>(
        `/patient-app/daily-checkins?patientId=${encodeURIComponent(patientAppTargetId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            checkinDate: new Date().toISOString().slice(0, 10),
            mood: "good",
            energyScore: 7,
            sleepHours: 7.5,
            hungerLevel: 3,
            notes: "Check-in do smoke para validar cockpit e timeline.",
          }),
        },
        201
      );

      assert.equal(patientAppWaterLog.amountMl, 350, "POST /patient-app/water-logs retornou volume inesperado.");
      assert.equal(
        patientAppDailyCheckin.mood,
        "good",
        "POST /patient-app/daily-checkins retornou humor inesperado."
      );
      assert.equal(patientAppMealLog.mealType, "Lanche", "POST /patient-app/meal-logs retornou tipo inesperado.");
      assert.equal(
        patientAppMealLog.nutritionPlanVersionId,
        patientAppCockpitBefore.nutritionPlan?.currentVersion?.id ?? null,
        "POST /patient-app/meal-logs nao vinculou a refeicao a versao nutricional vigente."
      );
      assert.equal(
        patientAppWorkoutLog.workoutType,
        "Caminhada",
        "POST /patient-app/workout-logs retornou treino inesperado."
      );
      assert(
        typeof patientAppSleepLog.sleepDate === "string",
        "POST /patient-app/sleep-logs nao retornou sleepDate."
      );
      assert.equal(
        patientAppSymptomLog.symptomType,
        "Ansiedade",
        "POST /patient-app/symptom-logs retornou sintoma inesperado."
      );

      const patientAppCockpitAfter = await requestJson<{
        nutritionPlan: {
          currentVersion: {
            id: string;
          } | null;
        } | null;
        weeklyCounts: {
          checkinCount: number;
        };
        todayHydrationMl: number;
        todayCheckIn: { id: string; mood: string | null } | null;
        accessState: {
          status: string;
          financialStatus: string;
          features: {
            habitLogs: { enabled: boolean };
          };
        } | null;
        recentActivity: Array<{ id: string; eventType: string }>;
        logs: {
          hydration: Array<{ id: string }>;
          meals: Array<{ id: string; nutritionPlanVersionId?: string | null }>;
          workouts: Array<{ id: string }>;
          sleep: Array<{ id: string }>;
          symptoms: Array<{ id: string }>;
          checkins: Array<{ id: string }>;
        };
      }>(`/patient-app/cockpit?patientId=${encodeURIComponent(patientAppTargetId)}`);

      assert(
        patientAppCockpitAfter.todayHydrationMl >= patientAppWaterLog.amountMl,
        "GET /patient-app/cockpit nao refletiu a nova hidratacao."
      );
      assert(
        patientAppCockpitAfter.logs.hydration.some((item) => item.id === patientAppWaterLog.id),
        "GET /patient-app/cockpit nao retornou o novo log de hidratacao."
      );
      assert(
        patientAppCockpitAfter.logs.meals.some(
          (item) =>
            item.id === patientAppMealLog.id &&
            item.nutritionPlanVersionId === patientAppMealLog.nutritionPlanVersionId
        ),
        "GET /patient-app/cockpit nao retornou o novo log de refeicao."
      );
      assert.equal(
        patientAppCockpitAfter.nutritionPlan?.currentVersion?.id,
        patientAppCockpitBefore.nutritionPlan?.currentVersion?.id ?? null,
        "GET /patient-app/cockpit nao preservou a versao nutricional vigente apos novos logs."
      );
      assert(
        patientAppCockpitAfter.logs.workouts.some((item) => item.id === patientAppWorkoutLog.id),
        "GET /patient-app/cockpit nao retornou o novo log de treino."
      );
      assert(
        patientAppCockpitAfter.logs.sleep.some((item) => item.id === patientAppSleepLog.id),
        "GET /patient-app/cockpit nao retornou o novo log de sono."
      );
      assert(
        patientAppCockpitAfter.logs.symptoms.some((item) => item.id === patientAppSymptomLog.id),
        "GET /patient-app/cockpit nao retornou o novo log de sintoma."
      );
      assert(
        patientAppCockpitAfter.logs.checkins.some((item) => item.id === patientAppDailyCheckin.id),
        "GET /patient-app/cockpit nao retornou o novo check-in diario."
      );
      assert.equal(
        patientAppCockpitAfter.todayCheckIn?.id,
        patientAppDailyCheckin.id,
        "GET /patient-app/cockpit nao refletiu o check-in de hoje."
      );
      assert(
        (patientAppCockpitAfter.weeklyCounts.checkinCount ?? 0) >= 1,
        "GET /patient-app/cockpit nao refletiu a contagem semanal de check-ins."
      );
      assert(
        patientAppCockpitAfter.recentActivity.some(
          (item) =>
            item.id !== undefined &&
            item.eventType === "patient_app.daily_checkin.logged"
        ),
        "GET /patient-app/cockpit nao retornou o check-in na atividade recente."
      );
      assert.equal(
        patientAppCockpitAfter.accessState?.financialStatus,
        "overdue",
        "GET /patient-app/cockpit nao preservou o estado financeiro do fixture apos novos logs."
      );
      assert.equal(
        patientAppCockpitAfter.accessState?.features.habitLogs.enabled,
        true,
        "GET /patient-app/cockpit nao deveria bloquear os registros diarios apos novos logs."
      );
    }

    if (isRealAuthEnabled()) {
      const runtimeClient = createRuntimeAuthenticatedClient();

      const dashboardOperationalSummaryResult = await runtimeClient.rpc(
        "dashboard_operational_summary",
        {
          p_current_legacy_unit_id: state.primaryUnitId ?? null,
        }
      );

      assert(
        !dashboardOperationalSummaryResult.error,
        `RPC dashboard_operational_summary falhou: ${dashboardOperationalSummaryResult.error?.message}`
      );
      assertRecord(
        dashboardOperationalSummaryResult.data,
        "RPC dashboard_operational_summary nao retornou objeto."
      );
      assertRecord(
        dashboardOperationalSummaryResult.data.stats,
        "RPC dashboard_operational_summary nao retornou stats validos."
      );
      assert(
        Array.isArray(dashboardOperationalSummaryResult.data.todayAppointments),
        "RPC dashboard_operational_summary nao retornou lista de agenda."
      );

      const crmOperationalSummaryResult = await runtimeClient.rpc(
        "crm_operational_summary",
        {
          p_pipeline_code: process.env.DEFAULT_PIPELINE_CODE ?? "default-sales",
        }
      );

      assert(
        !crmOperationalSummaryResult.error,
        `RPC crm_operational_summary falhou: ${crmOperationalSummaryResult.error?.message}`
      );
      assertRecord(
        crmOperationalSummaryResult.data,
        "RPC crm_operational_summary nao retornou objeto."
      );
      assert(
        Array.isArray(crmOperationalSummaryResult.data.pipeline),
        "RPC crm_operational_summary nao retornou pipeline."
      );

      const commercialCatalogSnapshotResult = await runtimeClient.rpc(
        "commercial_catalog_snapshot"
      );

      assert(
        !commercialCatalogSnapshotResult.error,
        `RPC commercial_catalog_snapshot falhou: ${commercialCatalogSnapshotResult.error?.message}`
      );
      assertRecord(
        commercialCatalogSnapshotResult.data,
        "RPC commercial_catalog_snapshot nao retornou objeto."
      );
      assert(
        Array.isArray(commercialCatalogSnapshotResult.data.services),
        "RPC commercial_catalog_snapshot nao retornou services."
      );
      assert(
        Array.isArray(commercialCatalogSnapshotResult.data.packages),
        "RPC commercial_catalog_snapshot nao retornou packages."
      );
      assert(
        Array.isArray(commercialCatalogSnapshotResult.data.programs),
        "RPC commercial_catalog_snapshot nao retornou programs."
      );

      const crmKanbanSnapshotResult = await runtimeClient.rpc("crm_kanban_snapshot", {
        p_pipeline_code: process.env.DEFAULT_PIPELINE_CODE ?? "default-sales",
      });

      assert(
        !crmKanbanSnapshotResult.error,
        `RPC crm_kanban_snapshot falhou: ${crmKanbanSnapshotResult.error?.message}`
      );
      assertRecord(
        crmKanbanSnapshotResult.data,
        "RPC crm_kanban_snapshot nao retornou objeto."
      );
      assert(
        Array.isArray(crmKanbanSnapshotResult.data.stages),
        "RPC crm_kanban_snapshot nao retornou stages."
      );
      assert(
        Array.isArray(crmKanbanSnapshotResult.data.leads),
        "RPC crm_kanban_snapshot nao retornou leads."
      );

      if (state.leadId) {
        const runtimeLead = crmKanbanSnapshotResult.data.leads.find?.(
          (lead: unknown) =>
            typeof lead === "object" &&
            lead !== null &&
            (lead as { id?: string }).id === state.leadId
        );

        assert(runtimeLead, "RPC crm_kanban_snapshot nao retornou o lead criado no fluxo do smoke.");

        const crmLeadActivitiesResult = await runtimeClient.rpc("crm_lead_activities", {
          p_lead_id: state.leadId,
        });

        assert(
          !crmLeadActivitiesResult.error,
          `RPC crm_lead_activities falhou: ${crmLeadActivitiesResult.error?.message}`
        );
        assertRecord(
          crmLeadActivitiesResult.data,
          "RPC crm_lead_activities nao retornou objeto."
        );
        assert(
          Array.isArray(crmLeadActivitiesResult.data.items),
          "RPC crm_lead_activities nao retornou items."
        );
        assert(
          crmLeadActivitiesResult.data.items.length > 0,
          "RPC crm_lead_activities deveria retornar atividades para o lead do smoke."
        );
      }

      assert(state.runtimeFixturePatientId, "Fixture runtime ausente para validar RPC patient_360.");

      const runtimePatient360Result = await runtimeClient.rpc("patient_360", {
        p_patient_id: state.runtimeFixturePatientId,
        p_current_legacy_unit_id: state.primaryUnitId ?? null,
      });

      assert(
        !runtimePatient360Result.error,
        `RPC patient_360 falhou: ${runtimePatient360Result.error?.message}`
      );
      assertRecord(runtimePatient360Result.data, "RPC patient_360 nao retornou objeto.");
      assert.equal(
        runtimePatient360Result.data.ready,
        true,
        "RPC patient_360 deveria retornar ready=true para paciente materializado no runtime."
      );
      assert.equal(
        runtimePatient360Result.data.source,
        "supabase_runtime",
        "RPC patient_360 deveria retornar leituras reais do Supabase para o fixture sincronizado."
      );
      assert.equal(
        runtimePatient360Result.data.schemaReady,
        true,
        "RPC patient_360 deveria manter schemaReady=true depois da migration 0016."
      );
      assertRecord(runtimePatient360Result.data.patient, "RPC patient_360 nao retornou o bloco patient.");
      assert.equal(
        runtimePatient360Result.data.patient.id,
        state.runtimeFixturePatientId,
        "RPC patient_360 nao retornou o fixture sincronizado esperado."
      );
      assert(
        Array.isArray(runtimePatient360Result.data.appointments),
        "RPC patient_360 nao retornou a lista de appointments do runtime."
      );

      const patientAppRpcTargetId = state.patientId ?? state.runtimeFixturePatientId;

      const patientAppCockpitResult = await runtimeClient.rpc("patient_app_cockpit", {
        p_patient_id: patientAppRpcTargetId,
      });

      assert(
        !patientAppCockpitResult.error,
        `RPC patient_app_cockpit falhou: ${patientAppCockpitResult.error?.message}`
      );
      assertRecord(
        patientAppCockpitResult.data,
        "RPC patient_app_cockpit nao retornou objeto."
      );
      assertRecord(
        patientAppCockpitResult.data.patient,
        "RPC patient_app_cockpit nao retornou bloco patient."
      );
      assert.equal(
        patientAppCockpitResult.data.patient.id,
        patientAppRpcTargetId,
        "RPC patient_app_cockpit nao retornou o fixture runtime esperado."
      );
      assertRecord(
        patientAppCockpitResult.data.weeklyCounts,
        "RPC patient_app_cockpit nao retornou weeklyCounts."
      );
      assertRecord(
        patientAppCockpitResult.data.logs,
        "RPC patient_app_cockpit nao retornou logs."
      );
      assert(
        Array.isArray(patientAppCockpitResult.data.logs.hydration),
        "RPC patient_app_cockpit nao retornou logs de hidratacao."
      );
      assert(
        Array.isArray(patientAppCockpitResult.data.logs.checkins),
        "RPC patient_app_cockpit nao retornou logs de check-in."
      );
      assert(
        Array.isArray(patientAppCockpitResult.data.recentActivity),
        "RPC patient_app_cockpit nao retornou atividade recente."
      );
      assert(
        typeof patientAppCockpitResult.data.weeklyCounts.checkinCount === "number",
        "RPC patient_app_cockpit nao retornou a contagem semanal de check-ins."
      );
      assertRecord(
        patientAppCockpitResult.data.commercialContext,
        "RPC patient_app_cockpit nao retornou commercialContext."
      );
      assertRecord(
        patientAppCockpitResult.data.nutritionPlan,
        "RPC patient_app_cockpit nao retornou nutritionPlan."
      );
      assert(
        Array.isArray(
          (
            patientAppCockpitResult.data.nutritionPlan as {
              targets?: unknown[];
            }
          ).targets
        ),
        "RPC patient_app_cockpit nao retornou as metas nutricionais."
      );
      assertRecord(
        patientAppCockpitResult.data.accessState,
        "RPC patient_app_cockpit nao retornou accessState."
      );
      assertRecord(
        patientAppCockpitResult.data.accessState.features,
        "RPC patient_app_cockpit nao retornou accessState.features."
      );
      assert.equal(
        patientAppCockpitResult.data.accessState.status,
        "attention",
        "RPC patient_app_cockpit deveria sinalizar attention para o fixture com pendencia vencida."
      );
      assert.equal(
        patientAppCockpitResult.data.accessState.financialStatus,
        "overdue",
        "RPC patient_app_cockpit deveria sinalizar financeiro overdue para o fixture."
      );
      assert.equal(
        (
          patientAppCockpitResult.data.accessState.features as {
            habitLogs?: { enabled?: boolean };
          }
        ).habitLogs?.enabled,
        true,
        "RPC patient_app_cockpit nao deveria bloquear os registros diarios."
      );

      const runtimePatientTimelineResult = await runtimeClient.rpc("patient_longitudinal_feed", {
        p_patient_id: state.runtimeFixturePatientId,
        p_current_legacy_unit_id: state.primaryUnitId ?? null,
        p_limit: 12,
      });

      assert(
        !runtimePatientTimelineResult.error,
        `RPC patient_longitudinal_feed falhou: ${runtimePatientTimelineResult.error?.message}`
      );
      assert(
        Array.isArray(runtimePatientTimelineResult.data),
        "RPC patient_longitudinal_feed nao retornou lista."
      );
      assert(
        runtimePatientTimelineResult.data.some(
          (item: unknown) =>
            typeof item === "object" &&
            item !== null &&
            (item as { eventType?: string }).eventType === "patient_app.daily_checkin.logged"
        ),
        "RPC patient_longitudinal_feed nao refletiu o check-in diario do app do paciente."
      );

      const createdPatient360Result = await runtimeClient.rpc("patient_360", {
        p_patient_id: createdPatient.id,
        p_current_legacy_unit_id: state.primaryUnitId ?? null,
      });

      assert(
        !createdPatient360Result.error,
        `RPC patient_360 falhou para o paciente criado via API: ${createdPatient360Result.error?.message}`
      );
      assertRecord(
        createdPatient360Result.data,
        "RPC patient_360 nao retornou objeto para o paciente criado via API."
      );
      assert.equal(
        createdPatient360Result.data.ready,
        true,
        "RPC patient_360 deveria materializar no runtime o paciente criado via API."
      );
      assert.equal(
        createdPatient360Result.data.source,
        "supabase_runtime",
        "RPC patient_360 deveria ler do runtime o paciente criado via API."
      );
      assertRecord(
        createdPatient360Result.data.patient,
        "RPC patient_360 nao retornou bloco patient para o paciente criado via API."
      );
      assert.equal(
        createdPatient360Result.data.patient.id,
        createdPatient.id,
        "RPC patient_360 nao retornou o paciente criado via API."
      );
      assert(
        Array.isArray(createdPatient360Result.data.tasks),
        "RPC patient_360 nao retornou tarefas para o paciente criado via API."
      );
      assertRecord(
        createdPatient360Result.data.commercialContext,
        "RPC patient_360 nao retornou commercialContext para o paciente criado via API."
      );
      assert.equal(
        createdPatient360Result.data.commercialContext.hasCommercialContext,
        true,
        "RPC patient_360 deveria refletir a matricula comercial criada via API."
      );

      const createdPatientCommercialContextResult = await runtimeClient.rpc(
        "patient_commercial_context",
        {
          p_patient_id: createdPatient.id,
        }
      );

      assert(
        !createdPatientCommercialContextResult.error,
        `RPC patient_commercial_context falhou para o paciente criado via API: ${createdPatientCommercialContextResult.error?.message}`
      );
      assertRecord(
        createdPatientCommercialContextResult.data,
        "RPC patient_commercial_context nao retornou objeto para o paciente criado via API."
      );
      assert.equal(
        createdPatientCommercialContextResult.data.hasCommercialContext,
        true,
        "RPC patient_commercial_context deveria refletir a matricula comercial criada via API."
      );
      assert(
        Array.isArray(createdPatientCommercialContextResult.data.entitlements) &&
          createdPatientCommercialContextResult.data.entitlements.length > 0,
        "RPC patient_commercial_context deveria retornar entitlements para o paciente criado via API."
      );
      assertRecord(
        createdPatientCommercialContextResult.data.financialSummary,
        "RPC patient_commercial_context deveria retornar financialSummary para o paciente criado via API."
      );
      assert.equal(
        createdPatientCommercialContextResult.data.financialSummary.pendingCount,
        1,
        "RPC patient_commercial_context deveria refletir um titulo pendente apos conciliacao parcial."
      );
      assert.equal(
        createdPatientCommercialContextResult.data.financialSummary.overdueCount,
        1,
        "RPC patient_commercial_context deveria refletir um titulo vencido."
      );
      assert.equal(
        toFiniteNumber(
          createdPatientCommercialContextResult.data.financialSummary.pendingAmount,
          "RPC patient_commercial_context nao retornou pendingAmount numerico."
        ),
        180,
        "RPC patient_commercial_context deveria refletir BRL 180,00 pendentes."
      );
      assert.equal(
        toFiniteNumber(
          createdPatientCommercialContextResult.data.financialSummary.overdueAmount,
          "RPC patient_commercial_context nao retornou overdueAmount numerico."
        ),
        180,
        "RPC patient_commercial_context deveria refletir BRL 180,00 vencidos."
      );

      const createdPatientFinancialSummaryResult = await runtimeClient.rpc(
        "patient_financial_summary",
        {
          p_patient_id: createdPatient.id,
        }
      );

      assert(
        !createdPatientFinancialSummaryResult.error,
        `RPC patient_financial_summary falhou para o paciente criado via API: ${createdPatientFinancialSummaryResult.error?.message}`
      );
      assertRecord(
        createdPatientFinancialSummaryResult.data,
        "RPC patient_financial_summary nao retornou objeto para o paciente criado via API."
      );
      assert.equal(
        createdPatientFinancialSummaryResult.data.pendingCount,
        1,
        "RPC patient_financial_summary deveria refletir exatamente um titulo pendente."
      );
      assert.equal(
        createdPatientFinancialSummaryResult.data.overdueCount,
        1,
        "RPC patient_financial_summary deveria refletir exatamente um titulo vencido."
      );
      assert.equal(
        toFiniteNumber(
          createdPatientFinancialSummaryResult.data.pendingAmount,
          "RPC patient_financial_summary nao retornou pendingAmount numerico."
        ),
        180,
        "RPC patient_financial_summary deveria refletir BRL 180,00 pendentes."
      );
      assert.equal(
        toFiniteNumber(
          createdPatientFinancialSummaryResult.data.overdueAmount,
          "RPC patient_financial_summary nao retornou overdueAmount numerico."
        ),
        180,
        "RPC patient_financial_summary deveria refletir BRL 180,00 vencidos."
      );
      assert.equal(
        createdPatient360Result.data.tasks.some(
          (task) =>
            Boolean(task) &&
            typeof task === "object" &&
            ("id" in task || "title" in task) &&
            (
              ("id" in task && task.id === createdClinicalTask.id) ||
              ("title" in task && task.title === createdClinicalTask.title)
            )
        ),
        true,
        "RPC patient_360 nao refletiu a tarefa clinica sincronizada no runtime."
      );

      assert(state.convertedPatientId, "Paciente convertido ausente para validar materializacao runtime.");

      const convertedPatient360Result = await runtimeClient.rpc("patient_360", {
        p_patient_id: state.convertedPatientId,
        p_current_legacy_unit_id: state.primaryUnitId ?? null,
      });

      assert(
        !convertedPatient360Result.error,
        `RPC patient_360 falhou para o paciente convertido: ${convertedPatient360Result.error?.message}`
      );
      assertRecord(
        convertedPatient360Result.data,
        "RPC patient_360 nao retornou objeto para o paciente convertido."
      );
      assertRecord(
        convertedPatient360Result.data.patient,
        "RPC patient_360 nao retornou bloco patient para o paciente convertido."
      );
      assert.equal(
        convertedPatient360Result.data.ready,
        true,
        "RPC patient_360 deveria materializar no runtime o paciente convertido."
      );
      assert.equal(
        convertedPatient360Result.data.patient.id,
        state.convertedPatientId,
        "RPC patient_360 nao retornou o paciente convertido esperado."
      );
      assert.equal(
        convertedPatient360Result.data.source,
        "supabase_runtime",
        "RPC patient_360 deveria devolver leitura runtime para o paciente convertido."
      );
      assert.equal(
        convertedPatient360Result.data.schemaReady,
        true,
        "RPC patient_360 deveria manter schemaReady=true para o paciente convertido."
      );
    }

    const encounterDetail = await requestJson<{
      id: string;
      status: string;
      documents?: Array<{
        id: string;
        title?: string | null;
        documentType?: string | null;
        status?: string | null;
      }>;
      prescriptions?: Array<{
        id: string;
        summary?: string | null;
        items?: Array<{
          id: string;
          title?: string | null;
          itemType?: string | null;
          dosage?: string | null;
          frequency?: string | null;
        }>;
      }>;
      nutritionPlan?: {
        id: string;
        currentVersion?: {
          id: string;
          versionNumber: number;
        } | null;
        targets?: unknown[];
      } | null;
      medicalRecord?: {
        id: string;
      } | null;
      sections?: Array<{
        code: string;
        completionState: string;
      }>;
      problemList?: unknown[];
      carePlan?: unknown[];
      anamnesis?: {
        chiefComplaint?: string | null;
      } | null;
      soapDraft?: {
        subjective?: string | null;
      } | null;
      notes?: Array<{ noteType?: string | null }>;
    }>(
      `/encounters/${startedEncounter.encounterId}`
    );
    assert.equal(
      encounterDetail.id,
      startedEncounter.encounterId,
      "GET /encounters/:id retornou encounter inesperado."
    );
    assert.equal(encounterDetail.status, "OPEN", "GET /encounters/:id deveria retornar o encounter aberto.");
    if (isRealAuthEnabled()) {
      assert(encounterDetail.nutritionPlan?.id, "GET /encounters/:id nao retornou nutritionPlan estruturado.");
      assert.equal(
        encounterDetail.nutritionPlan?.currentVersion?.versionNumber,
        2,
        "GET /encounters/:id deveria retornar a versao nutricional vigente."
      );
      assert(
        Array.isArray(encounterDetail.nutritionPlan?.targets),
        "GET /encounters/:id nao retornou nutrition targets."
      );
    }
    if (isRealAuthEnabled()) {
      assert(encounterDetail.medicalRecord?.id, "GET /encounters/:id nao retornou medicalRecord estruturado.");
    }
    assert(Array.isArray(encounterDetail.sections), "GET /encounters/:id nao retornou sections estruturadas.");
    assert(
      encounterDetail.sections.some((section) => section.code === "anamnesis"),
      "GET /encounters/:id nao retornou a secao de anamnese."
    );
    assert(
      encounterDetail.sections.some((section) => section.code === "soap"),
      "GET /encounters/:id nao retornou a secao SOAP."
    );
    assert(Array.isArray(encounterDetail.problemList), "GET /encounters/:id nao retornou problemList.");
    assert(Array.isArray(encounterDetail.carePlan), "GET /encounters/:id nao retornou carePlan.");
    assert(Array.isArray(encounterDetail.documents), "GET /encounters/:id nao retornou documents.");
    assert(Array.isArray(encounterDetail.prescriptions), "GET /encounters/:id nao retornou prescriptions.");

    const documentTemplates = await requestJson<
      Array<{
        id: string;
        title: string;
        templateKind: string;
        currentVersion?: { id: string; versionNumber: number } | null;
      }>
    >("/document-templates");

    assert(Array.isArray(documentTemplates), "GET /document-templates nao retornou uma lista.");

    const clinicalTasksAfterCreate = await requestJson<{ items: Array<{ id: string }> }>(
      "/clinical/tasks"
    );
    assert(
      clinicalTasksAfterCreate.items.some((task) => task.id === createdClinicalTask.id),
      "GET /clinical/tasks nao retornou a tarefa clinica criada."
    );

    if (isRealAuthEnabled()) {
      const autosaveAnamnesisPayload = {
        chiefComplaint: "Queixa principal em rascunho",
        historyOfPresentIllness: "Historia resumida em rascunho para o smoke.",
        pastMedicalHistory: "Antecedentes clinicos em rascunho para validacao.",
        lifestyleHistory: "Rotina e estilo de vida em rascunho no encounter.",
        notes: "Observacoes de anamnese salvas automaticamente no smoke.",
      };

      const autosaveAnamnesis = await requestJson<{
        section: string;
        anamnesis?: {
          chiefComplaint?: string | null;
          notes?: string | null;
        } | null;
      }>(
        `/encounters/${startedEncounter.encounterId}/autosave-section`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            section: "anamnesis",
            savedAt: new Date().toISOString(),
            ...autosaveAnamnesisPayload,
          }),
        },
        200
      );

      assert.equal(
        autosaveAnamnesis.section,
        "anamnesis",
        "PATCH /encounters/:id/autosave-section deveria registrar o rascunho de anamnese."
      );
      assert.equal(
        autosaveAnamnesis.anamnesis?.chiefComplaint,
        autosaveAnamnesisPayload.chiefComplaint,
        "PATCH /encounters/:id/autosave-section nao retornou a queixa principal autosalva."
      );

      const autosaveSoapDraftPayload = {
        subjective: "Paciente relata melhora parcial no rascunho.",
        objective: "Sinais vitais estaveis no rascunho.",
        assessment: "Evolucao favoravel em observacao.",
        plan: "Manter acompanhamento e reavaliar no retorno.",
      };

      const autosaveSoapDraft = await requestJson<{
        section: string;
        soapDraft?: {
          subjective?: string | null;
          plan?: string | null;
        } | null;
      }>(
        `/encounters/${startedEncounter.encounterId}/autosave-section`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            section: "soap_draft",
            savedAt: new Date().toISOString(),
            ...autosaveSoapDraftPayload,
          }),
        },
        200
      );

      assert.equal(
        autosaveSoapDraft.section,
        "soap_draft",
        "PATCH /encounters/:id/autosave-section deveria registrar o rascunho SOAP."
      );
      assert.equal(
        autosaveSoapDraft.soapDraft?.subjective,
        autosaveSoapDraftPayload.subjective,
        "PATCH /encounters/:id/autosave-section nao retornou o subjetivo do rascunho SOAP."
      );

      const encounterDetailAfterAutosave = await requestJson<{
        id: string;
        sections: Array<{
          code: string;
          completionState: string;
        }>;
        status: string;
        anamnesis: {
          chiefComplaint?: string | null;
          notes?: string | null;
        } | null;
        soapDraft: {
          subjective?: string | null;
          plan?: string | null;
        } | null;
        notes: Array<{ noteType?: string | null }>;
      }>(`/encounters/${startedEncounter.encounterId}`);

      assert.equal(
        encounterDetailAfterAutosave.anamnesis?.chiefComplaint,
        autosaveAnamnesisPayload.chiefComplaint,
        "GET /encounters/:id nao refletiu o overlay de anamnese autosalva."
      );
      assert.equal(
        encounterDetailAfterAutosave.anamnesis?.notes,
        autosaveAnamnesisPayload.notes,
        "GET /encounters/:id nao refletiu as observacoes da anamnese autosalva."
      );
      assert.equal(
        encounterDetailAfterAutosave.soapDraft?.subjective,
        autosaveSoapDraftPayload.subjective,
        "GET /encounters/:id nao retornou o rascunho SOAP."
      );
      assert.equal(
        encounterDetailAfterAutosave.soapDraft?.plan,
        autosaveSoapDraftPayload.plan,
        "GET /encounters/:id nao retornou o plano do rascunho SOAP."
      );
      assert.equal(
        encounterDetailAfterAutosave.sections.find((section) => section.code === "anamnesis")?.completionState,
        "completed",
        "GET /encounters/:id deveria marcar a secao de anamnese como concluida depois do autosave."
      );
      assert.equal(
        encounterDetailAfterAutosave.sections.find((section) => section.code === "soap")?.completionState,
        "in_progress",
        "GET /encounters/:id deveria marcar a secao SOAP como em andamento enquanto houver rascunho."
      );
      assert(
        encounterDetailAfterAutosave.notes.every((note) => note.noteType?.toLowerCase() !== "soap_draft"),
        "GET /encounters/:id nao deveria misturar rascunho SOAP no historico oficial."
      );
    }

    const anamnesis = await requestJson<{ encounterId: string }>(
      `/encounters/${startedEncounter.encounterId}/anamnesis`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chiefComplaint: "Validacao de anamnese oficial",
          historyOfPresentIllness: "Historia oficial registrada via api:smoke.",
          pastMedicalHistory: "Antecedentes oficiais registrados via api:smoke.",
          lifestyleHistory: "Estilo de vida oficial registrado via api:smoke.",
          notes: "Atualizacao oficial via api:smoke",
        }),
      },
      200
    );

    assert.equal(
      anamnesis.encounterId,
      startedEncounter.encounterId,
      "PATCH anamnesis nao vinculou ao encounter esperado."
    );

    const soapNote = await requestJson<{ encounterId: string }>(
      `/encounters/${startedEncounter.encounterId}/soap-note`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjective: "Paciente relata boa evolucao",
          objective: "Exame fisico sem intercorrencias relevantes",
          assessment: "Evolucao estavel",
          plan: "Manter acompanhamento",
        }),
      },
      200
    );

    assert.equal(
      soapNote.encounterId,
      startedEncounter.encounterId,
      "PATCH soap-note nao vinculou ao encounter esperado."
    );

    const encounterDetailAfterSoapSave = await requestJson<{
      id: string;
      sections: Array<{
        code: string;
        completionState: string;
      }>;
      soapDraft: {
        subjective?: string | null;
      } | null;
      notes: Array<{
        subjective?: string | null;
        assessment?: string | null;
      }>;
    }>(`/encounters/${startedEncounter.encounterId}`);

    assert.equal(
      encounterDetailAfterSoapSave.soapDraft,
      null,
      "GET /encounters/:id deveria limpar o rascunho SOAP depois do salvamento oficial."
    );
    assert(
      encounterDetailAfterSoapSave.notes.some(
        (note) =>
          note.subjective === "Paciente relata boa evolucao" &&
          note.assessment === "Evolucao estavel"
      ),
      "GET /encounters/:id nao retornou a evolucao SOAP oficial depois do salvamento."
    );
    assert.equal(
      encounterDetailAfterSoapSave.sections.find((section) => section.code === "soap")?.completionState,
      "completed",
      "GET /encounters/:id deveria marcar a secao SOAP como concluida depois do salvamento oficial."
    );

    const prescriptionRecord = await requestJson<{
      id: string;
      summary: string | null;
      items: Array<{
        id: string;
        title: string;
        itemType: string;
        dosage?: string | null;
        frequency?: string | null;
      }>;
    }>(
      `/encounters/${startedEncounter.encounterId}/prescriptions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prescriptionType: "PRESCRIPTION",
          summary: "Prescricao do smoke para validar itens estruturados.",
          items: [
            {
              itemType: "MEDICATION",
              title: "Metformina 850 mg",
              dosage: "850 mg",
              frequency: "2x ao dia",
              route: "Oral",
              durationDays: 30,
              quantity: 60,
              unit: "comprimidos",
              instructions: "Tomar apos cafe da manha e jantar.",
              position: 1,
            },
            {
              itemType: "ORIENTATION",
              title: "Aumentar ingestao hidrica",
              frequency: "Diario",
              instructions: "Meta minima de 2 litros por dia.",
              position: 2,
            },
          ],
        }),
      },
      201
    );

    assert.equal(
      prescriptionRecord.items.length,
      2,
      "POST /encounters/:id/prescriptions deveria retornar os itens estruturados da prescricao."
    );
    assert.equal(
      prescriptionRecord.items[0]?.title,
      "Metformina 850 mg",
      "POST /encounters/:id/prescriptions nao retornou o primeiro item esperado."
    );
    assert.equal(
      prescriptionRecord.items[1]?.itemType?.toLowerCase(),
      "orientation",
      "POST /encounters/:id/prescriptions nao retornou o tipo estruturado do segundo item."
    );

    const encounterDetailAfterPrescription = await requestJson<{
      prescriptions: Array<{
        id: string;
        summary?: string | null;
        items: Array<{
          id: string;
          title?: string | null;
          itemType?: string | null;
          dosage?: string | null;
          frequency?: string | null;
        }>;
      }>;
      sections: Array<{
        code: string;
        completionState: string;
      }>;
    }>(`/encounters/${startedEncounter.encounterId}`);

    const structuredPrescription = encounterDetailAfterPrescription.prescriptions.find(
      (item) => item.id === prescriptionRecord.id
    );
    assert(
      structuredPrescription,
      "GET /encounters/:id nao retornou a prescricao estruturada criada via POST."
    );
    if (isRealAuthEnabled()) {
      assert.equal(
        structuredPrescription?.items.length,
        2,
        "GET /encounters/:id nao refletiu os dois itens estruturados da prescricao."
      );
      assert(
        structuredPrescription?.items.some(
          (item) =>
            item.title === "Metformina 850 mg" &&
            item.itemType?.toLowerCase() === "medication" &&
            item.dosage === "850 mg"
        ),
        "GET /encounters/:id nao retornou o item medicamentoso estruturado."
      );
      assert(
        structuredPrescription?.items.some(
          (item) =>
            item.title === "Aumentar ingestao hidrica" &&
            item.itemType?.toLowerCase() === "orientation" &&
            item.frequency === "Diario"
        ),
        "GET /encounters/:id nao retornou o item de orientacao estruturado."
      );
    }

    const createdDocument = await requestJson<{
      id: string;
      title: string;
      documentType: string;
      status: string;
      currentVersion: {
        id: string;
        versionNumber: number;
        title: string;
        content: Record<string, unknown>;
      } | null;
    }>(
      `/encounters/${startedEncounter.encounterId}/documents`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: documentTemplates[0]?.id,
          documentType: "report",
          title: "Relatorio operacional do smoke",
          summary: "Documento emitido para validar o slice documental do encounter.",
          content: {
            sections: [
              { code: "summary", text: "Paciente respondeu bem ao plano inicial." },
              { code: "conduct", text: "Manter acompanhamento e reavaliar em 15 dias." },
            ],
          },
        }),
      },
      201
    );

    assert.equal(
      createdDocument.documentType,
      "report",
      "POST /encounters/:id/documents deveria registrar o documentType informado."
    );
    assert.equal(
      createdDocument.status,
      "issued",
      "POST /encounters/:id/documents deveria emitir o documento com status issued."
    );
    assert.equal(
      createdDocument.currentVersion?.versionNumber,
      1,
      "POST /encounters/:id/documents deveria criar a versao inicial do documento."
    );

    if (isRealAuthEnabled()) {
      const encounterDetailAfterDocument = await requestJson<{
        documents: Array<{
          id: string;
          title: string;
          documentType: string;
          status: string;
          currentVersion?: {
            id: string;
            versionNumber: number;
          } | null;
        }>;
      }>(`/encounters/${startedEncounter.encounterId}`);

      const issuedDocument = encounterDetailAfterDocument.documents.find(
        (item) => item.id === createdDocument.id
      );
      assert(
        issuedDocument,
        "GET /encounters/:id nao retornou o documento emitido pelo fluxo documental."
      );
      assert.equal(
        issuedDocument?.status,
        "issued",
        "GET /encounters/:id deveria refletir o status issued do documento."
      );
      assert.equal(
        issuedDocument?.currentVersion?.versionNumber,
        1,
        "GET /encounters/:id deveria refletir a versao inicial do documento emitido."
      );
    }

    const documentWithArtifact = await requestJson<{
      id: string;
      currentVersion?: {
        renderedHtml?: string | null;
      } | null;
      printableArtifacts?: Array<{
        id: string;
        artifactKind: string;
        renderStatus: string;
      }>;
    }>(
      `/documents/${createdDocument.id}/printable-artifacts`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artifactKind: "preview",
        }),
      },
      201
    );

    assert.equal(
      documentWithArtifact.id,
      createdDocument.id,
      "POST /documents/:id/printable-artifacts retornou documento inesperado."
    );
    assert(
      documentWithArtifact.printableArtifacts?.some(
        (artifact) =>
          artifact.artifactKind === "preview" && artifact.renderStatus === "rendered"
      ),
      "POST /documents/:id/printable-artifacts nao retornou o artefato preview renderizado."
    );
    assert(
      Boolean(documentWithArtifact.currentVersion?.renderedHtml),
      "POST /documents/:id/printable-artifacts nao preencheu o renderedHtml da versao atual."
    );

    const documentWithSignatureRequest = await requestJson<{
      id: string;
      signatureRequests?: Array<{
        id: string;
        requestStatus: string;
        signerType: string;
        providerCode?: string | null;
      }>;
    }>(
      `/documents/${createdDocument.id}/signature-requests`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signerType: "patient",
          signerEmail: "paciente-smoke@emagreceplus.local",
          providerCode: "mock",
        }),
      },
      201
    );

    const createdSignatureRequest = documentWithSignatureRequest.signatureRequests?.find(
      (request) => request.requestStatus === "sent"
    );

    assert(
      createdSignatureRequest,
      "POST /documents/:id/signature-requests nao retornou a solicitacao de assinatura enviada."
    );
    assert.equal(
      createdSignatureRequest?.signerType,
      "patient",
      "POST /documents/:id/signature-requests nao retornou o signerType esperado."
    );
    assert.equal(
      createdSignatureRequest?.providerCode ?? "mock",
      "mock",
      "POST /documents/:id/signature-requests nao retornou o providerCode esperado."
    );

    if (isRealAuthEnabled()) {
      const signatureEventId = `mock-document-signature-${Date.now()}`;
      const signatureWebhook = await requestEdgeFunctionJson<{
        ok: boolean;
        processingStatus: string;
        duplicate: boolean;
        requestStatus: string;
        document?: {
          id: string;
          status: string;
          signedAt?: string | null;
          signatureRequests?: Array<{
            id: string;
            requestStatus: string;
          }>;
        };
      }>("document-signature-webhook", {
        eventId: signatureEventId,
        eventType: "signed",
        signatureRequestId: createdSignatureRequest?.id,
        documentId: createdDocument.id,
        eventAt: new Date().toISOString(),
        signedStorageObjectPath:
          "tenant/mock/patients/mock/documents/signed/documento-assinado.pdf",
      });

      assert.equal(
        signatureWebhook.processingStatus,
        "processed",
        "document-signature-webhook deveria processar o evento mock."
      );
      assert.equal(
        signatureWebhook.requestStatus,
        "signed",
        "document-signature-webhook deveria marcar a solicitacao como signed."
      );
      assert.equal(
        signatureWebhook.document?.status,
        "signed",
        "document-signature-webhook deveria refletir o documento como signed."
      );

      const duplicateSignatureWebhook = await requestEdgeFunctionJson<{
        duplicate: boolean;
        processingStatus: string;
      }>("document-signature-webhook", {
        eventId: signatureEventId,
        eventType: "signed",
        signatureRequestId: createdSignatureRequest?.id,
        documentId: createdDocument.id,
        eventAt: new Date().toISOString(),
      });

      assert.equal(
        duplicateSignatureWebhook.processingStatus,
        "processed",
        "document-signature-webhook deveria manter processingStatus processed na reexecucao."
      );
      assert.equal(
        duplicateSignatureWebhook.duplicate,
        true,
        "document-signature-webhook deveria marcar duplicate=true na reexecucao."
      );

      const encounterDetailAfterSignature = await requestJson<{
        documents: Array<{
          id: string;
          status: string;
          signedAt?: string | null;
          currentVersion?: {
            signedAt?: string | null;
            signedStorageObjectPath?: string | null;
          } | null;
          signatureRequests?: Array<{
            id: string;
            requestStatus: string;
            completedAt?: string | null;
          }>;
          printableArtifacts?: Array<{
            id: string;
            artifactKind: string;
          }>;
        }>;
      }>(`/encounters/${startedEncounter.encounterId}`);

      const signedDocument = encounterDetailAfterSignature.documents.find(
        (item) => item.id === createdDocument.id
      );

      assert(signedDocument, "GET /encounters/:id nao retornou o documento assinado.");
      assert.equal(
        signedDocument?.status,
        "signed",
        "GET /encounters/:id deveria refletir o documento como signed."
      );
      assert(
        Boolean(signedDocument?.signedAt),
        "GET /encounters/:id deveria refletir signedAt no documento."
      );
      assert(
        Boolean(signedDocument?.currentVersion?.signedAt),
        "GET /encounters/:id deveria refletir signedAt na versao atual do documento."
      );
      assert(
        Boolean(signedDocument?.currentVersion?.signedStorageObjectPath),
        "GET /encounters/:id deveria refletir o signedStorageObjectPath apos o webhook."
      );
      assert(
        signedDocument?.signatureRequests?.some(
          (request) =>
            request.id === createdSignatureRequest?.id &&
            request.requestStatus === "signed" &&
            Boolean(request.completedAt)
        ),
        "GET /encounters/:id nao refletiu a assinatura concluida."
      );
      assert(
        signedDocument?.printableArtifacts?.some((artifact) => artifact.artifactKind === "preview"),
        "GET /encounters/:id deveria preservar o artefato imprimivel criado antes da assinatura."
      );
    }

    const completedEncounter = await requestJson<{
      id: string;
      status: string;
      closedAt: string;
      appointmentStatus: string | null;
      queueStatus: string | null;
    }>(
      `/encounters/${startedEncounter.encounterId}/complete`,
      {
        method: "PATCH",
      },
      200
    );

    assert.equal(
      completedEncounter.id,
      startedEncounter.encounterId,
      "PATCH /encounters/:id/complete retornou encounter inesperado."
    );
    assert.equal(
      completedEncounter.status,
      "CLOSED",
      "PATCH /encounters/:id/complete deveria encerrar o encounter legado."
    );
    assert.equal(
      completedEncounter.appointmentStatus,
      "Concluido",
      "PATCH /encounters/:id/complete deveria concluir o agendamento vinculado."
    );
    if (isRealAuthEnabled()) {
      assert.equal(
        completedEncounter.queueStatus,
        "Atendimento concluido",
        "PATCH /encounters/:id/complete nao refletiu o encerramento da fila."
      );
    }

    const completedAppointments = await requestJson<{ items: Array<{ id: string; status: string }> }>(
      `/appointments?date=${formatDateQuery(startsAt)}&status=${encodeURIComponent("Concluido")}`
    );

    assert(
      completedAppointments.items.some(
        (appointment) =>
          appointment.id === createdAppointment.id && appointment.status === "Concluido"
      ),
      "GET /appointments filtrado por concluido nao retornou o agendamento encerrado."
    );

    const returnStartsAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    returnStartsAt.setHours(10, 0, 0, 0);

    const scheduledReturn = await requestJson<{
      id: string;
      encounterId: string;
      status: string;
      startsAt: string;
      endsAt: string;
    }>(
      `/encounters/${startedEncounter.encounterId}/schedule-return`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startsAt: returnStartsAt.toISOString(),
          notes: "Retorno agendado pelo api:smoke apos conclusao do atendimento",
        }),
      },
      201
    );

    state.returnAppointmentId = scheduledReturn.id;

    assert.equal(
      scheduledReturn.encounterId,
      startedEncounter.encounterId,
      "POST /encounters/:id/schedule-return retornou encounter inesperado."
    );
    assert.equal(
      scheduledReturn.status,
      "Agendado",
      "POST /encounters/:id/schedule-return deveria criar um novo agendamento agendado."
    );

    const scheduledReturnAppointments = await requestJson<{ items: Array<{ id: string; status: string }> }>(
      `/appointments?date=${formatDateQuery(returnStartsAt)}&status=${encodeURIComponent("Agendado")}`
    );

    assert(
      scheduledReturnAppointments.items.some(
        (appointment) =>
          appointment.id === scheduledReturn.id && appointment.status === "Agendado"
      ),
      "GET /appointments filtrado por retorno nao retornou o agendamento derivado do encounter."
    );

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
