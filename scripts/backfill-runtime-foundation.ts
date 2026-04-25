import "dotenv/config";

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient as PrismaClientCtor } from "../generated/prisma/client/client.ts";
import { supabaseAdmin } from "../apps/api/src/lib/supabase-admin.ts";

type CliOptions = {
  batchSize: number;
  dryRun: boolean;
  tenantId: string | null;
};

type ScopeResult = {
  tenantId: string;
  units: Array<{
    legacyUnitId: string;
    unitId: string;
  }>;
};

type JsonObject = Record<string, unknown>;

const prisma = new PrismaClientCtor({
  adapter: new PrismaPg(process.env.DATABASE_URL!),
  log: ["error"],
});

function parseCliOptions(): CliOptions {
  const args = process.argv.slice(2);
  let batchSize = 100;
  let dryRun = false;
  let tenantId: string | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg.startsWith("--batch-size=")) {
      batchSize = Number(arg.slice("--batch-size=".length));
      continue;
    }

    if (arg === "--batch-size") {
      batchSize = Number(args[index + 1] ?? "");
      index += 1;
      continue;
    }

    if (arg.startsWith("--tenant=")) {
      tenantId = arg.slice("--tenant=".length).trim() || null;
      continue;
    }

    if (arg === "--tenant") {
      tenantId = (args[index + 1] ?? "").trim() || null;
      index += 1;
    }
  }

  assert(Number.isFinite(batchSize) && batchSize > 0, "O valor de --batch-size precisa ser um inteiro positivo.");

  return {
    batchSize,
    dryRun,
    tenantId,
  };
}

function deterministicUuid(namespace: string, legacyId: string) {
  const hash = createHash("sha1").update(`${namespace}:${legacyId}`).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;

  const hex = hash.subarray(0, 16).toString("hex");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function enumToRuntime(value: string | null | undefined, fallback: string) {
  return value?.toLowerCase() ?? fallback;
}

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function toDateOnly(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function chunkArray<T>(value: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < value.length; index += size) {
    chunks.push(value.slice(index, index + size));
  }

  return chunks;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function asScopeResult(value: unknown): ScopeResult {
  assert(value && typeof value === "object", "RPC de scope nao retornou objeto.");
  const record = value as Record<string, unknown>;
  assert(typeof record.tenantId === "string" && record.tenantId, "RPC de scope nao retornou tenantId.");
  assert(Array.isArray(record.units), "RPC de scope nao retornou units.");

  return {
    tenantId: record.tenantId,
    units: record.units
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
      .map((entry) => ({
        legacyUnitId: String(entry.legacyUnitId ?? ""),
        unitId: String(entry.unitId ?? ""),
      }))
      .filter((entry) => entry.legacyUnitId.length > 0 && entry.unitId.length > 0),
  };
}

async function callRpc<T>(name: string, args: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin.rpc(name, args);

  if (error) {
    throw new Error(`Falha ao executar RPC ${name}: ${error.message}`);
  }

  return data as T;
}

function summarizeResult(result: unknown) {
  if (!result || typeof result !== "object") {
    return String(result);
  }

  return Object.entries(result as Record<string, unknown>)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
}

async function main() {
  const options = parseCliOptions();

  assert(process.env.DATABASE_URL, "DATABASE_URL ausente.");
  assert(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL, "SUPABASE_URL ausente.");
  assert(process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY ausente.");

  const tenants = await prisma.tenant.findMany({
    where: options.tenantId ? { id: options.tenantId } : undefined,
    orderBy: { createdAt: "asc" },
  });

  assert(tenants.length > 0, "Nenhum tenant legado encontrado para backfill.");

  console.log(
    `[runtime:backfill] tenants=${tenants.length} batchSize=${options.batchSize}${options.dryRun ? " dry-run" : ""}`
  );

  for (const tenant of tenants) {
    console.log("");
    console.log(`[runtime:backfill] tenant ${tenant.id} -> ${tenant.tradeName ?? tenant.legalName}`);

    const legacyUnits = await prisma.unit.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "asc" },
      include: {
        address: {
          select: {
            city: true,
          },
        },
      },
    });

    const scopeUnits = legacyUnits.map((unit) => ({
      id: unit.id,
      name: unit.name,
      code: unit.code,
      city: unit.address?.city ?? "Sem cidade",
      status: unit.status,
      deletedAt: toIso(unit.deletedAt),
    }));

    if (options.dryRun) {
      console.log(
        `[runtime:backfill] scope tenants=1 units=${scopeUnits.length}`
      );
      continue;
    }

    const scope = asScopeResult(
      await callRpc("backfill_runtime_scope", {
        p_legacy_tenant_id: tenant.id,
        p_legacy_tenant_legal_name: tenant.legalName,
        p_legacy_tenant_trade_name: tenant.tradeName,
        p_legacy_tenant_status: tenant.status,
        p_subscription_plan_code: tenant.subscriptionPlanCode,
        p_units: scopeUnits,
      })
    );

    const runtimeUnitIdByLegacy = new Map(scope.units.map((entry) => [entry.legacyUnitId, entry.unitId]));

    const tags = await prisma.tag.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "asc" },
    });

    for (const chunk of chunkArray(
      tags.map((tag) => ({
        id: deterministicUuid("tag", tag.id),
        legacy_tag_id: tag.id,
        name: tag.name,
        code: tag.code,
        color: tag.color,
        status: "active",
        metadata: {
          source: "legacy_backfill",
        },
        created_at: toIso(tag.createdAt),
        updated_at: toIso(tag.createdAt),
      })),
      options.batchSize
    )) {
      const result = await callRpc("backfill_runtime_reference_data", {
        p_runtime_tenant_id: scope.tenantId,
        p_tags: chunk,
      });

      console.log(`[runtime:backfill] tags ${summarizeResult(result)}`);
    }

    const professionals = await prisma.professional.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "asc" },
    });

    for (const chunk of chunkArray(
      professionals.map((professional) => ({
        id: deterministicUuid("professional", professional.id),
        legacy_professional_id: professional.id,
        legacy_user_id: professional.userId,
        professional_type: enumToRuntime(professional.professionalType, "other"),
        license_number: professional.licenseNumber,
        display_name: professional.displayName,
        color_hex: professional.colorHex,
        is_schedulable: professional.isSchedulable,
        metadata: {
          source: "legacy_backfill",
          legacy_user_id: professional.userId,
        },
        created_at: toIso(professional.createdAt),
        updated_at: toIso(professional.updatedAt),
        deleted_at: toIso(professional.deletedAt),
      })),
      options.batchSize
    )) {
      const result = await callRpc("backfill_runtime_reference_data", {
        p_runtime_tenant_id: scope.tenantId,
        p_professionals: chunk,
      });

      console.log(`[runtime:backfill] professionals ${summarizeResult(result)}`);
    }

    const appointmentTypes = await prisma.appointmentType.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "asc" },
    });

    for (const chunk of chunkArray(
      appointmentTypes.map((appointmentType) => ({
        id: deterministicUuid("appointment_type", appointmentType.id),
        legacy_appointment_type_id: appointmentType.id,
        name: appointmentType.name,
        code: appointmentType.code,
        default_duration_minutes: appointmentType.defaultDurationMinutes,
        requires_professional: appointmentType.requiresProfessional,
        requires_resource: appointmentType.requiresResource,
        generates_encounter: appointmentType.generatesEncounter,
        allows_telehealth: appointmentType.allowsTelehealth,
        active: appointmentType.active,
        metadata: {
          source: "legacy_backfill",
        },
        created_at: toIso(appointmentType.createdAt),
        updated_at: toIso(appointmentType.createdAt),
      })),
      options.batchSize
    )) {
      const result = await callRpc("backfill_runtime_reference_data", {
        p_runtime_tenant_id: scope.tenantId,
        p_appointment_types: chunk,
      });

      console.log(`[runtime:backfill] appointmentTypes ${summarizeResult(result)}`);
    }

    const patients = await prisma.patient.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "asc" },
      include: {
        profile: true,
        patientTags: true,
        flags: true,
      },
    });

    for (const patientChunk of chunkArray(patients, options.batchSize)) {
      const patientRows = patientChunk.map((patient) => ({
        id: deterministicUuid("patient", patient.id),
        legacy_patient_id: patient.id,
        external_code: patient.externalCode,
        full_name: patient.fullName,
        cpf: patient.cpf,
        birth_date: toDateOnly(patient.birthDate),
        sex: patient.sex,
        gender: patient.gender,
        marital_status: patient.maritalStatus,
        primary_phone: patient.primaryPhone,
        primary_email: patient.primaryEmail,
        status: enumToRuntime(patient.status, "active"),
        source: "legacy_backfill",
        metadata: {
          source: "legacy_backfill",
        },
        created_at: toIso(patient.createdAt),
        updated_at: toIso(patient.updatedAt),
        deleted_at: toIso(patient.deletedAt),
      }));

      const patientProfileRows = patientChunk
        .filter((patient) => patient.profile)
        .map((patient) => ({
          patient_id: deterministicUuid("patient", patient.id),
          occupation: patient.profile?.occupation ?? null,
          referral_source: patient.profile?.referralSource ?? null,
          lifestyle_summary: patient.profile?.lifestyleSummary ?? null,
          goals_summary: patient.profile?.goalsSummary ?? null,
          notes: patient.profile?.notes ?? null,
          metadata: {
            source: "legacy_backfill",
          },
          created_at: toIso(patient.profile?.createdAt ?? null),
          updated_at: toIso(patient.profile?.updatedAt ?? null),
        }));

      const patientTagRows = patientChunk.flatMap((patient) =>
        patient.patientTags.map((patientTag) => ({
          patient_id: deterministicUuid("patient", patient.id),
          tag_id: deterministicUuid("tag", patientTag.tagId),
          metadata: {
            source: "legacy_backfill",
          },
          created_at: toIso(patientTag.createdAt),
        }))
      );

      const patientFlagRows = patientChunk.flatMap((patient) =>
        patient.flags.map((flag) => ({
          id: deterministicUuid("patient_flag", flag.id),
          patient_id: deterministicUuid("patient", patient.id),
          legacy_flag_id: flag.id,
          flag_type: flag.flagType,
          severity: enumToRuntime(flag.severity, "medium"),
          description: flag.description,
          active: flag.active,
          legacy_created_by_user_id: flag.createdBy,
          resolved_at: null,
          metadata: {
            source: "legacy_backfill",
          },
          created_at: toIso(flag.createdAt),
          updated_at: toIso(flag.createdAt),
        }))
      );

      const result = await callRpc("backfill_runtime_patient_domain", {
        p_runtime_tenant_id: scope.tenantId,
        p_patients: patientRows,
        p_patient_profiles: patientProfileRows,
        p_patient_tags: patientTagRows,
        p_patient_flags: patientFlagRows,
      });

      console.log(`[runtime:backfill] patients ${summarizeResult(result)}`);
    }

    const appointments = await prisma.appointment.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "asc" },
    });

    for (const chunk of chunkArray(
      appointments
        .map((appointment) => {
          const runtimeUnitId = runtimeUnitIdByLegacy.get(appointment.unitId);
          if (!runtimeUnitId) {
            return null;
          }

          return {
            id: deterministicUuid("appointment", appointment.id),
            unit_id: runtimeUnitId,
            patient_id: deterministicUuid("patient", appointment.patientId),
            professional_id: appointment.professionalId
              ? deterministicUuid("professional", appointment.professionalId)
              : null,
            appointment_type_id: deterministicUuid("appointment_type", appointment.appointmentTypeId),
            legacy_appointment_id: appointment.id,
            starts_at: toIso(appointment.startsAt),
            ends_at: toIso(appointment.endsAt),
            status: enumToRuntime(appointment.status, "scheduled"),
            source: enumToRuntime(appointment.source, "internal"),
            notes: appointment.notes,
            legacy_created_by_user_id: appointment.createdBy,
            confirmed_at: null,
            checked_in_at: null,
            canceled_at: null,
            metadata: {
              source: "legacy_backfill",
              legacy_calendar_id: appointment.calendarId,
              legacy_resource_id: appointment.resourceId,
            },
            created_at: toIso(appointment.createdAt),
            updated_at: toIso(appointment.updatedAt),
            deleted_at: toIso(appointment.deletedAt),
          };
        })
        .filter(isPresent),
      options.batchSize
    )) {
      const result = await callRpc("backfill_runtime_scheduling_domain", {
        p_runtime_tenant_id: scope.tenantId,
        p_appointments: chunk,
      });

      console.log(`[runtime:backfill] appointments ${summarizeResult(result)}`);
    }

    const encounters = await prisma.encounter.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "asc" },
    });

    for (const chunk of chunkArray(
      encounters
        .map((encounter) => {
          const runtimeUnitId = runtimeUnitIdByLegacy.get(encounter.unitId);
          if (!runtimeUnitId) {
            return null;
          }

          return {
            id: deterministicUuid("encounter", encounter.id),
            unit_id: runtimeUnitId,
            patient_id: deterministicUuid("patient", encounter.patientId),
            appointment_id: encounter.appointmentId
              ? deterministicUuid("appointment", encounter.appointmentId)
              : null,
            professional_id: encounter.professionalId
              ? deterministicUuid("professional", encounter.professionalId)
              : null,
            legacy_encounter_id: encounter.id,
            encounter_type: enumToRuntime(encounter.encounterType, "other"),
            status: enumToRuntime(encounter.status, "open"),
            summary: null,
            opened_at: toIso(encounter.openedAt),
            closed_at: toIso(encounter.closedAt),
            metadata: {
              source: "legacy_backfill",
            },
            created_at: toIso(encounter.createdAt),
            updated_at: toIso(encounter.updatedAt),
          };
        })
        .filter(isPresent),
      options.batchSize
    )) {
      const result = await callRpc("backfill_runtime_clinical_domain", {
        p_runtime_tenant_id: scope.tenantId,
        p_encounters: chunk,
      });

      console.log(`[runtime:backfill] encounters ${summarizeResult(result)}`);
    }

    const anamneses = await prisma.anamnesis.findMany({
      where: { encounter: { tenantId: tenant.id } },
      orderBy: { createdAt: "asc" },
    });

    for (const chunk of chunkArray(
      anamneses.map((anamnesis) => ({
        id: deterministicUuid("anamnesis", anamnesis.id),
        encounter_id: deterministicUuid("encounter", anamnesis.encounterId),
        chief_complaint: anamnesis.chiefComplaint,
        history_of_present_illness: anamnesis.historyOfPresentIllness,
        past_medical_history: anamnesis.pastMedicalHistory,
        past_surgical_history: anamnesis.pastSurgicalHistory,
        family_history: anamnesis.familyHistory,
        medication_history: anamnesis.medicationHistory,
        allergy_history: anamnesis.allergyHistory,
        lifestyle_history: anamnesis.lifestyleHistory,
        gynecological_history: anamnesis.gynecologicalHistory,
        notes: anamnesis.notes,
        metadata: {
          source: "legacy_backfill",
        },
        created_at: toIso(anamnesis.createdAt),
        updated_at: toIso(anamnesis.updatedAt),
      })),
      options.batchSize
    )) {
      const result = await callRpc("backfill_runtime_clinical_domain", {
        p_runtime_tenant_id: scope.tenantId,
        p_anamneses: chunk,
      });

      console.log(`[runtime:backfill] anamneses ${summarizeResult(result)}`);
    }

    const consultationNotes = await prisma.consultationNote.findMany({
      where: { encounter: { tenantId: tenant.id } },
      orderBy: { createdAt: "asc" },
    });

    for (const chunk of chunkArray(
      consultationNotes.map((note) => ({
        id: deterministicUuid("consultation_note", note.id),
        encounter_id: deterministicUuid("encounter", note.encounterId),
        note_type: note.noteType,
        subjective: note.subjective,
        objective: note.objective,
        assessment: note.assessment,
        plan: note.plan,
        legacy_signed_by_user_id: note.signedBy,
        signed_at: toIso(note.signedAt),
        metadata: {
          source: "legacy_backfill",
        },
        created_at: toIso(note.createdAt),
        updated_at: toIso(note.updatedAt),
      })),
      options.batchSize
    )) {
      const result = await callRpc("backfill_runtime_clinical_domain", {
        p_runtime_tenant_id: scope.tenantId,
        p_consultation_notes: chunk,
      });

      console.log(`[runtime:backfill] consultationNotes ${summarizeResult(result)}`);
    }

    const carePlans = await prisma.carePlan.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "asc" },
    });

    for (const chunk of chunkArray(
      carePlans.map((carePlan) => ({
        id: deterministicUuid("care_plan", carePlan.id),
        patient_id: deterministicUuid("patient", carePlan.patientId),
        legacy_care_plan_id: carePlan.id,
        current_status: carePlan.currentStatus,
        summary: carePlan.summary,
        start_date: toDateOnly(carePlan.startDate),
        end_date: toDateOnly(carePlan.endDate),
        legacy_created_by_user_id: carePlan.createdBy,
        metadata: {
          source: "legacy_backfill",
        },
        created_at: toIso(carePlan.createdAt),
        updated_at: toIso(carePlan.updatedAt),
        deleted_at: toIso(carePlan.deletedAt),
      })),
      options.batchSize
    )) {
      const result = await callRpc("backfill_runtime_clinical_domain", {
        p_runtime_tenant_id: scope.tenantId,
        p_care_plans: chunk,
      });

      console.log(`[runtime:backfill] carePlans ${summarizeResult(result)}`);
    }

    const carePlanItems = await prisma.carePlanItem.findMany({
      where: { carePlan: { tenantId: tenant.id } },
      orderBy: [{ carePlanId: "asc" }, { title: "asc" }],
    });

    const carePlanPositionById = new Map<string, number>();
    let currentCarePlanId = "";
    let currentPosition = 0;

    for (const item of carePlanItems) {
      if (item.carePlanId !== currentCarePlanId) {
        currentCarePlanId = item.carePlanId;
        currentPosition = 1;
      } else {
        currentPosition += 1;
      }

      carePlanPositionById.set(item.id, currentPosition);
    }

    for (const chunk of chunkArray(
      carePlanItems.map((item) => ({
        id: deterministicUuid("care_plan_item", item.id),
        care_plan_id: deterministicUuid("care_plan", item.carePlanId),
        item_type: item.itemType,
        title: item.title,
        description: item.description,
        status: item.status,
        target_date: toDateOnly(item.targetDate),
        completed_at: toIso(item.completedAt),
        position: carePlanPositionById.get(item.id) ?? null,
        metadata: {
          source: "legacy_backfill",
        },
        created_at: null,
        updated_at: toIso(item.completedAt),
      })),
      options.batchSize
    )) {
      const result = await callRpc("backfill_runtime_clinical_domain", {
        p_runtime_tenant_id: scope.tenantId,
        p_care_plan_items: chunk,
      });

      console.log(`[runtime:backfill] carePlanItems ${summarizeResult(result)}`);
    }

    const clinicalTasks = await prisma.clinicalTask.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "asc" },
    });

    for (const chunk of chunkArray(
      clinicalTasks.map((task) => ({
        id: deterministicUuid("clinical_task", task.id),
        patient_id: deterministicUuid("patient", task.patientId),
        encounter_id: task.encounterId ? deterministicUuid("encounter", task.encounterId) : null,
        legacy_task_id: task.id,
        assigned_to_legacy_user_id: task.assignedToUserId,
        task_type: task.taskType,
        title: task.title,
        description: task.description,
        priority: enumToRuntime(task.priority, "medium"),
        status: enumToRuntime(task.status, "open"),
        due_at: toIso(task.dueAt),
        completed_at: toIso(task.completedAt),
        metadata: {
          source: "legacy_backfill",
        },
        created_at: toIso(task.createdAt),
        updated_at: toIso(task.updatedAt),
        deleted_at: toIso(task.deletedAt),
      })),
      options.batchSize
    )) {
      const result = await callRpc("backfill_runtime_clinical_domain", {
        p_runtime_tenant_id: scope.tenantId,
        p_clinical_tasks: chunk,
      });

      console.log(`[runtime:backfill] clinicalTasks ${summarizeResult(result)}`);
    }

    const adverseEvents = await prisma.adverseEvent.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "asc" },
    });

    for (const chunk of chunkArray(
      adverseEvents.map((event) => ({
        id: deterministicUuid("adverse_event", event.id),
        patient_id: deterministicUuid("patient", event.patientId),
        encounter_id: event.encounterId ? deterministicUuid("encounter", event.encounterId) : null,
        legacy_adverse_event_id: event.id,
        severity: enumToRuntime(event.severity, "moderate"),
        event_type: event.eventType,
        description: event.description,
        onset_at: toIso(event.onsetAt),
        resolved_at: toIso(event.resolvedAt),
        status: enumToRuntime(event.status, "active"),
        legacy_recorded_by_user_id: event.recordedBy,
        metadata: {
          source: "legacy_backfill",
        },
        created_at: toIso(event.createdAt),
        updated_at: toIso(event.updatedAt),
      })),
      options.batchSize
    )) {
      const result = await callRpc("backfill_runtime_clinical_domain", {
        p_runtime_tenant_id: scope.tenantId,
        p_adverse_events: chunk,
      });

      console.log(`[runtime:backfill] adverseEvents ${summarizeResult(result)}`);
    }

    const patientGoals = await prisma.patientGoal.findMany({
      where: { patient: { tenantId: tenant.id } },
      orderBy: { createdAt: "asc" },
    });

    for (const chunk of chunkArray(
      patientGoals.map((goal) => ({
        id: deterministicUuid("patient_goal", goal.id),
        patient_id: deterministicUuid("patient", goal.patientId),
        legacy_goal_id: goal.id,
        goal_type: goal.goalType,
        title: goal.title,
        target_value: goal.targetValue,
        current_value: goal.currentValue,
        target_date: toDateOnly(goal.targetDate),
        status: goal.status,
        legacy_created_by_user_id: goal.createdBy,
        metadata: {
          source: "legacy_backfill",
        },
        created_at: toIso(goal.createdAt),
        updated_at: toIso(goal.updatedAt),
      })),
      options.batchSize
    )) {
      const result = await callRpc("backfill_runtime_clinical_domain", {
        p_runtime_tenant_id: scope.tenantId,
        p_patient_goals: chunk,
      });

      console.log(`[runtime:backfill] patientGoals ${summarizeResult(result)}`);
    }

    const prescriptionRecords = await prisma.prescriptionRecord.findMany({
      where: { encounter: { tenantId: tenant.id } },
      orderBy: { createdAt: "asc" },
    });

    for (const chunk of chunkArray(
      prescriptionRecords.map((record) => ({
        id: deterministicUuid("prescription_record", record.id),
        encounter_id: deterministicUuid("encounter", record.encounterId),
        patient_id: deterministicUuid("patient", record.patientId),
        legacy_prescription_id: record.id,
        prescription_type: enumToRuntime(record.prescriptionType, "other"),
        summary: record.summary,
        legacy_issued_by_user_id: record.issuedBy,
        issued_at: toIso(record.issuedAt),
        metadata: {
          source: "legacy_backfill",
        },
        created_at: toIso(record.createdAt),
      })),
      options.batchSize
    )) {
      const result = await callRpc("backfill_runtime_clinical_domain", {
        p_runtime_tenant_id: scope.tenantId,
        p_prescription_records: chunk,
      });

      console.log(`[runtime:backfill] prescriptionRecords ${summarizeResult(result)}`);
    }

    const hydrationLogs = await prisma.hydrationLog.findMany({
      where: { patient: { tenantId: tenant.id } },
      orderBy: { createdAt: "asc" },
    });

    for (const chunk of chunkArray(
      hydrationLogs.map((log) => ({
        id: deterministicUuid("hydration_log", log.id),
        patient_id: deterministicUuid("patient", log.patientId),
        legacy_hydration_log_id: log.id,
        logged_at: toIso(log.loggedAt),
        volume_ml: log.volumeMl,
        metadata: {
          source: "legacy_backfill",
        },
        created_at: toIso(log.createdAt),
      })),
      options.batchSize
    )) {
      const result = await callRpc("backfill_runtime_patient_logs", {
        p_runtime_tenant_id: scope.tenantId,
        p_hydration_logs: chunk,
      });

      console.log(`[runtime:backfill] hydrationLogs ${summarizeResult(result)}`);
    }

    const mealLogs = await prisma.mealLog.findMany({
      where: { patient: { tenantId: tenant.id } },
      orderBy: { createdAt: "asc" },
    });

    for (const chunk of chunkArray(
      mealLogs.map((log) => ({
        id: deterministicUuid("meal_log", log.id),
        patient_id: deterministicUuid("patient", log.patientId),
        legacy_meal_log_id: log.id,
        logged_at: toIso(log.loggedAt),
        meal_type: log.mealType,
        description: log.description,
        photo_path: null,
        adherence_rating: log.adherenceRating,
        notes: log.notes,
        metadata: {
          source: "legacy_backfill",
          legacy_photo_file_id: log.photoFileId,
        },
        created_at: toIso(log.createdAt),
      })),
      options.batchSize
    )) {
      const result = await callRpc("backfill_runtime_patient_logs", {
        p_runtime_tenant_id: scope.tenantId,
        p_meal_logs: chunk,
      });

      console.log(`[runtime:backfill] mealLogs ${summarizeResult(result)}`);
    }

    const workoutLogs = await prisma.workoutLog.findMany({
      where: { patient: { tenantId: tenant.id } },
      orderBy: { createdAt: "asc" },
    });

    for (const chunk of chunkArray(
      workoutLogs.map((log) => ({
        id: deterministicUuid("workout_log", log.id),
        patient_id: deterministicUuid("patient", log.patientId),
        legacy_workout_log_id: log.id,
        logged_at: toIso(log.loggedAt),
        workout_type: log.workoutType,
        duration_minutes:
          typeof log.durationMinutes === "number" && log.durationMinutes > 0
            ? log.durationMinutes
            : null,
        intensity: log.intensity,
        completed: log.completed,
        notes: log.notes,
        metadata: {
          source: "legacy_backfill",
        },
        created_at: toIso(log.createdAt),
      })),
      options.batchSize
    )) {
      const result = await callRpc("backfill_runtime_patient_logs", {
        p_runtime_tenant_id: scope.tenantId,
        p_workout_logs: chunk,
      });

      console.log(`[runtime:backfill] workoutLogs ${summarizeResult(result)}`);
    }

    const sleepLogs = await prisma.sleepLog.findMany({
      where: { patient: { tenantId: tenant.id } },
      orderBy: { createdAt: "asc" },
    });

    for (const chunk of chunkArray(
      sleepLogs.map((log) => ({
        id: deterministicUuid("sleep_log", log.id),
        patient_id: deterministicUuid("patient", log.patientId),
        legacy_sleep_log_id: log.id,
        sleep_date: toDateOnly(log.sleepDate),
        hours_slept: log.hoursSlept,
        sleep_quality_score: log.sleepQualityScore,
        notes: log.notes,
        metadata: {
          source: "legacy_backfill",
        },
        created_at: toIso(log.createdAt),
      })),
      options.batchSize
    )) {
      const result = await callRpc("backfill_runtime_patient_logs", {
        p_runtime_tenant_id: scope.tenantId,
        p_sleep_logs: chunk,
      });

      console.log(`[runtime:backfill] sleepLogs ${summarizeResult(result)}`);
    }

    const symptomLogs = await prisma.symptomLog.findMany({
      where: { patient: { tenantId: tenant.id } },
      orderBy: { createdAt: "asc" },
    });

    for (const chunk of chunkArray(
      symptomLogs.map((log) => ({
        id: deterministicUuid("symptom_log", log.id),
        patient_id: deterministicUuid("patient", log.patientId),
        legacy_symptom_log_id: log.id,
        logged_at: toIso(log.loggedAt),
        symptom_type: log.symptomType,
        severity_score: log.severityScore,
        description: log.description,
        notes: log.notes,
        metadata: {
          source: "legacy_backfill",
        },
        created_at: toIso(log.createdAt),
      })),
      options.batchSize
    )) {
      const result = await callRpc("backfill_runtime_patient_logs", {
        p_runtime_tenant_id: scope.tenantId,
        p_symptom_logs: chunk,
      });

      console.log(`[runtime:backfill] symptomLogs ${summarizeResult(result)}`);
    }
  }

  console.log("");
  console.log("[runtime:backfill] concluido");
}

main()
  .catch((error) => {
    console.error("[runtime:backfill] erro fatal");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
