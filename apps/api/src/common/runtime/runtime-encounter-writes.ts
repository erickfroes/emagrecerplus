import { createHash } from "node:crypto";

import type { PrismaService } from "../../prisma/prisma.service.ts";
import { supabaseAdmin } from "../../lib/supabase-admin.ts";
import { upsertRuntimeAppointmentFromLegacy } from "./runtime-appointment-writes.ts";
import { upsertRuntimePatientFromLegacy } from "./runtime-patient-writes.ts";
import { isRuntimeSyncEnabled } from "./runtime-mode.ts";

type ScopeResult = {
  tenantId: string;
  units: Array<{
    legacyUnitId: string;
    unitId: string;
  }>;
};

type UpsertRuntimeEncounterFromLegacyParams = {
  legacyTenantId: string;
  legacyEncounterId: string;
  legacyUnitId: string;
  legacyPatientId: string;
  encounterType?: string | null;
  status?: string | null;
  legacyProfessionalId?: string | null;
  legacyAppointmentId?: string | null;
  summary?: string | null;
  openedAt?: string | null;
  closedAt?: string | null;
  metadata?: Record<string, unknown>;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type UpsertRuntimeEncounterFromLegacyResult = {
  id: string;
  legacyEncounterId: string;
  status: string;
  source: string;
};

type StartRuntimeEncounterFromLegacyParams = {
  legacyTenantId: string;
  legacyAppointmentId: string;
  legacyEncounterId: string;
  legacyUnitId: string;
  legacyPatientId: string;
  legacyProfessionalId?: string | null;
  encounterType?: string | null;
  openedAt?: string | null;
  metadata?: Record<string, unknown>;
};

type StartRuntimeEncounterFromLegacyResult = {
  encounterId: string;
  legacyEncounterId: string;
  appointmentId: string | null;
  legacyAppointmentId: string | null;
  encounterStatus: string;
  appointmentStatus: string | null;
  queueStatus: string | null;
  source: string;
};

type CompleteRuntimeEncounterFromLegacyParams = {
  legacyTenantId: string;
  legacyEncounterId: string;
  closedAt?: string | null;
  metadata?: Record<string, unknown>;
};

type CompleteRuntimeEncounterFromLegacyResult = {
  encounterId: string;
  legacyEncounterId: string;
  appointmentId: string | null;
  encounterStatus: string;
  appointmentStatus: string | null;
  queueStatus: string | null;
  closedAt: string | null;
  source: string;
};

type SyncRuntimeEncounterProjectionOptions = {
  flow: string;
  operation: string;
};

type SyncRuntimeClinicalTaskProjectionOptions = {
  flow: string;
  operation: string;
};

type UpsertRuntimeAnamnesisParams = {
  runtimeTenantId: string;
  runtimeEncounterId: string;
  runtimeAnamnesisId?: string | null;
  chiefComplaint?: string | null;
  historyOfPresentIllness?: string | null;
  pastMedicalHistory?: string | null;
  pastSurgicalHistory?: string | null;
  familyHistory?: string | null;
  medicationHistory?: string | null;
  allergyHistory?: string | null;
  lifestyleHistory?: string | null;
  gynecologicalHistory?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
  createdAt?: string | null;
  updatedAt?: string | null;
};

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

function asScopeResult(value: unknown): ScopeResult {
  if (!value || typeof value !== "object") {
    throw new Error("RPC de scope nao retornou um objeto valido.");
  }

  const record = value as Record<string, unknown>;
  if (typeof record.tenantId !== "string" || !record.tenantId) {
    throw new Error("RPC de scope nao retornou tenantId.");
  }

  if (!Array.isArray(record.units)) {
    throw new Error("RPC de scope nao retornou units.");
  }

  return {
    tenantId: String(record.tenantId),
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

export async function upsertRuntimeAnamnesis(params: UpsertRuntimeAnamnesisParams) {
  return callRpc<Record<string, unknown>>("upsert_runtime_anamnesis", {
    p_runtime_tenant_id: params.runtimeTenantId,
    p_encounter_id: params.runtimeEncounterId,
    p_id: params.runtimeAnamnesisId ?? null,
    p_chief_complaint: params.chiefComplaint ?? null,
    p_history_of_present_illness: params.historyOfPresentIllness ?? null,
    p_past_medical_history: params.pastMedicalHistory ?? null,
    p_past_surgical_history: params.pastSurgicalHistory ?? null,
    p_family_history: params.familyHistory ?? null,
    p_medication_history: params.medicationHistory ?? null,
    p_allergy_history: params.allergyHistory ?? null,
    p_lifestyle_history: params.lifestyleHistory ?? null,
    p_gynecological_history: params.gynecologicalHistory ?? null,
    p_notes: params.notes ?? null,
    p_metadata: params.metadata ?? {},
    p_created_at: params.createdAt ?? null,
    p_updated_at: params.updatedAt ?? null,
  });
}

export async function upsertRuntimeEncounterFromLegacy(
  params: UpsertRuntimeEncounterFromLegacyParams
): Promise<UpsertRuntimeEncounterFromLegacyResult> {
  const { data, error } = await supabaseAdmin.rpc("upsert_runtime_encounter_from_legacy", {
    p_legacy_tenant_id: params.legacyTenantId,
    p_legacy_encounter_id: params.legacyEncounterId,
    p_legacy_unit_id: params.legacyUnitId,
    p_legacy_patient_id: params.legacyPatientId,
    p_encounter_type: params.encounterType ?? null,
    p_status: params.status ?? null,
    p_legacy_professional_id: params.legacyProfessionalId ?? null,
    p_legacy_appointment_id: params.legacyAppointmentId ?? null,
    p_summary: params.summary ?? null,
    p_opened_at: params.openedAt ?? null,
    p_closed_at: params.closedAt ?? null,
    p_metadata: params.metadata ?? {},
    p_created_at: params.createdAt ?? null,
    p_updated_at: params.updatedAt ?? null,
  });

  if (error) {
    throw new Error(`Falha ao executar RPC upsert_runtime_encounter_from_legacy: ${error.message}`);
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("RPC upsert_runtime_encounter_from_legacy nao retornou um objeto valido.");
  }

  const result = data as Record<string, unknown>;

  if (
    typeof result.id !== "string" ||
    typeof result.legacyEncounterId !== "string" ||
    typeof result.status !== "string" ||
    typeof result.source !== "string"
  ) {
    throw new Error("RPC upsert_runtime_encounter_from_legacy retornou payload incompleto.");
  }

  return {
    id: result.id,
    legacyEncounterId: result.legacyEncounterId,
    status: result.status,
    source: result.source,
  };
}

export async function startRuntimeEncounterFromLegacy(
  params: StartRuntimeEncounterFromLegacyParams
): Promise<StartRuntimeEncounterFromLegacyResult> {
  const result = await callRpc<Record<string, unknown>>("start_encounter", {
    p_legacy_tenant_id: params.legacyTenantId,
    p_legacy_appointment_id: params.legacyAppointmentId,
    p_legacy_encounter_id: params.legacyEncounterId,
    p_legacy_unit_id: params.legacyUnitId,
    p_legacy_patient_id: params.legacyPatientId,
    p_legacy_professional_id: params.legacyProfessionalId ?? null,
    p_encounter_type: params.encounterType ?? null,
    p_opened_at: params.openedAt ?? null,
    p_metadata: params.metadata ?? {},
  });

  if (
    typeof result.encounterId !== "string" ||
    typeof result.legacyEncounterId !== "string" ||
    typeof result.encounterStatus !== "string" ||
    typeof result.source !== "string"
  ) {
    throw new Error("RPC start_encounter retornou payload incompleto.");
  }

  return {
    encounterId: result.encounterId,
    legacyEncounterId: result.legacyEncounterId,
    appointmentId:
      typeof result.appointmentId === "string" && result.appointmentId.length > 0
        ? result.appointmentId
        : null,
    legacyAppointmentId:
      typeof result.legacyAppointmentId === "string" && result.legacyAppointmentId.length > 0
        ? result.legacyAppointmentId
        : null,
    encounterStatus: result.encounterStatus,
    appointmentStatus:
      typeof result.appointmentStatus === "string" && result.appointmentStatus.length > 0
        ? result.appointmentStatus
        : null,
    queueStatus:
      typeof result.queueStatus === "string" && result.queueStatus.length > 0
        ? result.queueStatus
        : null,
    source: result.source,
  };
}

export async function completeRuntimeEncounterFromLegacy(
  params: CompleteRuntimeEncounterFromLegacyParams
): Promise<CompleteRuntimeEncounterFromLegacyResult> {
  const result = await callRpc<Record<string, unknown>>("complete_encounter", {
    p_legacy_tenant_id: params.legacyTenantId,
    p_legacy_encounter_id: params.legacyEncounterId,
    p_closed_at: params.closedAt ?? null,
    p_metadata: params.metadata ?? {},
  });

  if (
    typeof result.encounterId !== "string" ||
    typeof result.legacyEncounterId !== "string" ||
    typeof result.encounterStatus !== "string" ||
    typeof result.source !== "string"
  ) {
    throw new Error("RPC complete_encounter retornou payload incompleto.");
  }

  return {
    encounterId: result.encounterId,
    legacyEncounterId: result.legacyEncounterId,
    appointmentId:
      typeof result.appointmentId === "string" && result.appointmentId.length > 0
        ? result.appointmentId
        : null,
    encounterStatus: result.encounterStatus,
    appointmentStatus:
      typeof result.appointmentStatus === "string" && result.appointmentStatus.length > 0
        ? result.appointmentStatus
        : null,
    queueStatus:
      typeof result.queueStatus === "string" && result.queueStatus.length > 0
        ? result.queueStatus
        : null,
    closedAt: typeof result.closedAt === "string" && result.closedAt.length > 0 ? result.closedAt : null,
    source: result.source,
  };
}

export async function syncRuntimeEncounterProjection(
  prisma: PrismaService,
  legacyEncounterId: string,
  options: SyncRuntimeEncounterProjectionOptions
) {
  if (!isRuntimeSyncEnabled()) {
    return null;
  }

  const encounter = await prisma.encounter.findFirst({
    where: {
      id: legacyEncounterId,
    },
    include: {
      patient: {
        include: {
          profile: true,
        },
      },
      professional: true,
      unit: {
        include: {
          address: {
            select: {
              city: true,
            },
          },
        },
      },
      appointment: {
        include: {
          appointmentType: true,
        },
      },
      anamnesis: true,
      consultationNotes: {
        orderBy: {
          createdAt: "asc",
        },
      },
      prescriptionRecords: {
        orderBy: {
          issuedAt: "asc",
        },
      },
    },
  });

  if (!encounter) {
    return null;
  }

  const tenant = await prisma.tenant.findFirstOrThrow({
    where: {
      id: encounter.tenantId,
    },
    select: {
      id: true,
      legalName: true,
      tradeName: true,
      status: true,
      subscriptionPlanCode: true,
    },
  });

  const scope = asScopeResult(
    await callRpc("backfill_runtime_scope", {
      p_legacy_tenant_id: tenant.id,
      p_legacy_tenant_legal_name: tenant.legalName,
      p_legacy_tenant_trade_name: tenant.tradeName,
      p_legacy_tenant_status: tenant.status,
      p_subscription_plan_code: tenant.subscriptionPlanCode,
      p_units: [
        {
          id: encounter.unit.id,
          name: encounter.unit.name,
          code: encounter.unit.code,
          city: encounter.unit.address?.city ?? "Sem cidade",
          status: encounter.unit.status,
          deletedAt: toIso(encounter.unit.deletedAt),
        },
      ],
    })
  );

  await callRpc("backfill_runtime_reference_data", {
    p_runtime_tenant_id: scope.tenantId,
    p_professionals: [
      {
        id: deterministicUuid("professional", encounter.professional.id),
        legacy_professional_id: encounter.professional.id,
        legacy_user_id: encounter.professional.userId,
        professional_type: enumToRuntime(encounter.professional.professionalType, "other"),
        license_number: encounter.professional.licenseNumber,
        display_name: encounter.professional.displayName,
        color_hex: encounter.professional.colorHex,
        is_schedulable: encounter.professional.isSchedulable,
        metadata: {
          source: "api_runtime_encounter_sync",
          flow: options.flow,
          operation: options.operation,
          legacy_user_id: encounter.professional.userId,
        },
        created_at: toIso(encounter.professional.createdAt),
        updated_at: toIso(encounter.professional.updatedAt),
        deleted_at: toIso(encounter.professional.deletedAt),
      },
    ],
    p_appointment_types: encounter.appointment
      ? [
        {
          id: deterministicUuid("appointment_type", encounter.appointment.appointmentType.id),
          legacy_appointment_type_id: encounter.appointment.appointmentType.id,
          name: encounter.appointment.appointmentType.name,
          code: encounter.appointment.appointmentType.code,
          default_duration_minutes: encounter.appointment.appointmentType.defaultDurationMinutes,
          requires_professional: encounter.appointment.appointmentType.requiresProfessional,
          requires_resource: encounter.appointment.appointmentType.requiresResource,
          generates_encounter: encounter.appointment.appointmentType.generatesEncounter,
          allows_telehealth: encounter.appointment.appointmentType.allowsTelehealth,
          active: encounter.appointment.appointmentType.active,
          metadata: {
            source: "api_runtime_encounter_sync",
            flow: options.flow,
            operation: options.operation,
          },
          created_at: toIso(encounter.appointment.appointmentType.createdAt),
          updated_at: toIso(encounter.appointment.appointmentType.createdAt),
        },
      ]
      : [],
  });

  const runtimePatient = await upsertRuntimePatientFromLegacy({
    legacyTenantId: tenant.id,
    legacyPatientId: encounter.patient.id,
    fullName: encounter.patient.fullName,
    cpf: encounter.patient.cpf,
    birthDate: toDateOnly(encounter.patient.birthDate),
    primaryPhone: encounter.patient.primaryPhone,
    primaryEmail: encounter.patient.primaryEmail,
    goalsSummary: encounter.patient.profile?.goalsSummary ?? null,
    lifestyleSummary: encounter.patient.profile?.lifestyleSummary ?? null,
    metadata: {
      source: "api_runtime_encounter_sync",
      flow: options.flow,
      operation: options.operation,
    },
  });

  if (encounter.appointment) {
    await upsertRuntimeAppointmentFromLegacy({
      legacyTenantId: tenant.id,
      legacyAppointmentId: encounter.appointment.id,
      legacyUnitId: encounter.appointment.unitId,
      legacyPatientId: encounter.appointment.patientId,
      legacyAppointmentTypeId: encounter.appointment.appointmentTypeId,
      startsAt: encounter.appointment.startsAt.toISOString(),
      endsAt: encounter.appointment.endsAt.toISOString(),
      status: enumToRuntime(encounter.appointment.status, "scheduled"),
      source: enumToRuntime(encounter.appointment.source, "internal"),
      legacyProfessionalId: encounter.appointment.professionalId,
      notes: encounter.appointment.notes,
      legacyCreatedByUserId: encounter.appointment.createdBy,
      confirmedAt: encounter.appointment.status === "CONFIRMED" ? toIso(encounter.appointment.updatedAt) : null,
      checkedInAt: encounter.appointment.status === "CHECKED_IN" ? toIso(encounter.appointment.updatedAt) : null,
      canceledAt: encounter.appointment.status === "CANCELLED" ? toIso(encounter.appointment.updatedAt) : null,
      metadata: {
        source: "api_runtime_encounter_sync",
        flow: options.flow,
        operation: options.operation,
        legacy_calendar_id: encounter.appointment.calendarId,
        legacy_resource_id: encounter.appointment.resourceId,
      },
      createdAt: toIso(encounter.appointment.createdAt),
      updatedAt: toIso(encounter.appointment.updatedAt),
      deletedAt: toIso(encounter.appointment.deletedAt),
    });
  }

  const runtimeEncounter = await upsertRuntimeEncounterFromLegacy({
    legacyTenantId: tenant.id,
    legacyEncounterId: encounter.id,
    legacyUnitId: encounter.unitId,
    legacyPatientId: encounter.patientId,
    encounterType: enumToRuntime(encounter.encounterType, "other"),
    status: enumToRuntime(encounter.status, "open"),
    legacyProfessionalId: encounter.professionalId,
    legacyAppointmentId: encounter.appointmentId,
    openedAt: toIso(encounter.openedAt),
    closedAt: toIso(encounter.closedAt),
    metadata: {
      source: "api_runtime_encounter_sync",
      flow: options.flow,
      operation: options.operation,
    },
    createdAt: toIso(encounter.createdAt),
    updatedAt: toIso(encounter.updatedAt),
  });

  if (encounter.anamnesis) {
    await upsertRuntimeAnamnesis({
      runtimeTenantId: scope.tenantId,
      runtimeEncounterId: runtimeEncounter.id,
      runtimeAnamnesisId: deterministicUuid("anamnesis", encounter.anamnesis.id),
      chiefComplaint: encounter.anamnesis.chiefComplaint,
      historyOfPresentIllness: encounter.anamnesis.historyOfPresentIllness,
      pastMedicalHistory: encounter.anamnesis.pastMedicalHistory,
      pastSurgicalHistory: encounter.anamnesis.pastSurgicalHistory,
      familyHistory: encounter.anamnesis.familyHistory,
      medicationHistory: encounter.anamnesis.medicationHistory,
      allergyHistory: encounter.anamnesis.allergyHistory,
      lifestyleHistory: encounter.anamnesis.lifestyleHistory,
      gynecologicalHistory: encounter.anamnesis.gynecologicalHistory,
      notes: encounter.anamnesis.notes,
      metadata: {
        source: "api_runtime_encounter_sync",
        flow: options.flow,
        operation: options.operation,
      },
      createdAt: toIso(encounter.anamnesis.createdAt),
      updatedAt: toIso(encounter.anamnesis.updatedAt),
    });
  }

  await callRpc("backfill_runtime_clinical_domain", {
    p_runtime_tenant_id: scope.tenantId,
    p_consultation_notes: encounter.consultationNotes.map((note) => ({
      id: deterministicUuid("consultation_note", note.id),
      encounter_id: runtimeEncounter.id,
      note_type: note.noteType,
      subjective: note.subjective,
      objective: note.objective,
      assessment: note.assessment,
      plan: note.plan,
      legacy_signed_by_user_id: note.signedBy,
      signed_at: toIso(note.signedAt),
      metadata: {
        source: "api_runtime_encounter_sync",
        flow: options.flow,
        operation: options.operation,
      },
        created_at: toIso(note.createdAt),
        updated_at: toIso(note.updatedAt),
      })),
    p_prescription_records: encounter.prescriptionRecords.map((record) => ({
      id: deterministicUuid("prescription_record", record.id),
      encounter_id: runtimeEncounter.id,
      patient_id: runtimePatient.id,
      legacy_prescription_id: record.id,
      prescription_type: enumToRuntime(record.prescriptionType, "other"),
      summary: record.summary,
      legacy_issued_by_user_id: record.issuedBy,
      issued_at: toIso(record.issuedAt),
      metadata: {
        source: "api_runtime_encounter_sync",
        flow: options.flow,
        operation: options.operation,
      },
      created_at: toIso(record.createdAt),
      updated_at: toIso(record.createdAt),
    })),
  });

  return {
    runtimeTenantId: scope.tenantId,
    runtimeEncounterId: runtimeEncounter.id,
  };
}

export async function syncRuntimeClinicalTaskProjection(
  prisma: PrismaService,
  legacyTaskId: string,
  options: SyncRuntimeClinicalTaskProjectionOptions
) {
  if (!isRuntimeSyncEnabled()) {
    return;
  }

  const task = await prisma.clinicalTask.findFirst({
    where: {
      id: legacyTaskId,
    },
    include: {
      patient: {
        include: {
          profile: true,
        },
      },
      encounter: {
        include: {
          patient: {
            include: {
              profile: true,
            },
          },
          professional: true,
          unit: {
            include: {
              address: {
                select: {
                  city: true,
                },
              },
            },
          },
          appointment: {
            include: {
              appointmentType: true,
            },
          },
          anamnesis: true,
          consultationNotes: {
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      },
    },
  });

  if (!task) {
    return;
  }

  const tenant = await prisma.tenant.findFirstOrThrow({
    where: {
      id: task.tenantId,
    },
    select: {
      id: true,
      legalName: true,
      tradeName: true,
      status: true,
      subscriptionPlanCode: true,
      units: {
        where: task.encounterId ? { id: task.encounter!.unitId } : undefined,
        select: {
          id: true,
          name: true,
          code: true,
          status: true,
          deletedAt: true,
          address: {
            select: {
              city: true,
            },
          },
        },
      },
    },
  });

  let runtimeEncounterId: string | null = null;
  if (task.encounterId) {
    const encounterSync = await syncRuntimeEncounterProjection(prisma, task.encounterId, {
      flow: options.flow,
      operation: options.operation,
    });
    runtimeEncounterId = encounterSync?.runtimeEncounterId ?? null;
  }

  const scope = asScopeResult(
    await callRpc("backfill_runtime_scope", {
      p_legacy_tenant_id: tenant.id,
      p_legacy_tenant_legal_name: tenant.legalName,
      p_legacy_tenant_trade_name: tenant.tradeName,
      p_legacy_tenant_status: tenant.status,
      p_subscription_plan_code: tenant.subscriptionPlanCode,
      p_units: tenant.units.map((unit) => ({
        id: unit.id,
        name: unit.name,
        code: unit.code,
        city: unit.address?.city ?? "Sem cidade",
        status: unit.status,
        deletedAt: toIso(unit.deletedAt),
      })),
    })
  );

  const runtimePatient = await upsertRuntimePatientFromLegacy({
    legacyTenantId: tenant.id,
    legacyPatientId: task.patient.id,
    fullName: task.patient.fullName,
    cpf: task.patient.cpf,
    birthDate: toDateOnly(task.patient.birthDate),
    primaryPhone: task.patient.primaryPhone,
    primaryEmail: task.patient.primaryEmail,
    goalsSummary: task.patient.profile?.goalsSummary ?? null,
    lifestyleSummary: task.patient.profile?.lifestyleSummary ?? null,
    legacyCreatedByUserId: task.assignedToUserId,
    metadata: {
      source: "api_runtime_clinical_task_sync",
      flow: options.flow,
      operation: options.operation,
    },
  });

  await callRpc("backfill_runtime_clinical_domain", {
    p_runtime_tenant_id: scope.tenantId,
    p_clinical_tasks: [
      {
        id: deterministicUuid("clinical_task", task.id),
        patient_id: runtimePatient.id,
        encounter_id: runtimeEncounterId,
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
          source: "api_runtime_clinical_task_sync",
          flow: options.flow,
          operation: options.operation,
        },
        created_at: toIso(task.createdAt),
        updated_at: toIso(task.updatedAt),
        deleted_at: toIso(task.deletedAt),
      },
    ],
  });
}
