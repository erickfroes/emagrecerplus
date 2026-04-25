import { createHash } from "node:crypto";

import type { PrismaService } from "../../prisma/prisma.service.ts";
import { supabaseAdmin } from "../../lib/supabase-admin.ts";
import { upsertRuntimePatientFromLegacy } from "./runtime-patient-writes.ts";
import { isRuntimeSyncEnabled } from "./runtime-mode.ts";

type ScopeResult = {
  tenantId: string;
  units: Array<{
    legacyUnitId: string;
    unitId: string;
  }>;
};

type UpsertRuntimeAppointmentFromLegacyParams = {
  legacyTenantId: string;
  legacyAppointmentId: string;
  legacyUnitId: string;
  legacyPatientId: string;
  legacyAppointmentTypeId: string;
  startsAt: string;
  endsAt: string;
  status?: string | null;
  source?: string | null;
  legacyProfessionalId?: string | null;
  notes?: string | null;
  legacyCreatedByUserId?: string | null;
  confirmedAt?: string | null;
  checkedInAt?: string | null;
  canceledAt?: string | null;
  metadata?: Record<string, unknown>;
  createdAt?: string | null;
  updatedAt?: string | null;
  deletedAt?: string | null;
};

type UpsertRuntimeAppointmentFromLegacyResult = {
  id: string;
  legacyAppointmentId: string;
  status: string;
  source: string;
};

type CreateRuntimeAppointmentParams = {
  legacyTenantId: string;
  legacyAppointmentId: string;
  legacyUnitId: string;
  legacyPatientId: string;
  legacyAppointmentTypeId: string;
  startsAt: string;
  endsAt: string;
  legacyProfessionalId?: string | null;
  notes?: string | null;
  source?: string | null;
  legacyCreatedByUserId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  deletedAt?: string | null;
  metadata?: Record<string, unknown>;
};

type AppointmentOperationResult = {
  id: string;
  legacyAppointmentId: string;
  status: string;
  source: string;
};

type ConfirmRuntimeAppointmentParams = {
  legacyTenantId: string;
  legacyAppointmentId: string;
  confirmedAt?: string | null;
  legacyActorUserId?: string | null;
  metadata?: Record<string, unknown>;
};

type RegisterRuntimeCheckinParams = {
  legacyTenantId: string;
  legacyAppointmentId: string;
  checkedInAt?: string | null;
  legacyActorUserId?: string | null;
  metadata?: Record<string, unknown>;
};

type EnqueueRuntimePatientParams = {
  legacyTenantId: string;
  legacyAppointmentId: string;
  enqueuedAt?: string | null;
  notes?: string | null;
  legacyActorUserId?: string | null;
  metadata?: Record<string, unknown>;
};

type CancelRuntimeAppointmentParams = {
  legacyTenantId: string;
  legacyAppointmentId: string;
  canceledAt?: string | null;
  notes?: string | null;
  reason?: string | null;
  legacyActorUserId?: string | null;
  metadata?: Record<string, unknown>;
};

type RescheduleRuntimeAppointmentParams = {
  legacyTenantId: string;
  legacyAppointmentId: string;
  startsAt: string;
  endsAt: string;
  notes?: string | null;
  reason?: string | null;
  legacyActorUserId?: string | null;
  metadata?: Record<string, unknown>;
};

type RescheduleRuntimeAppointmentResult = AppointmentOperationResult & {
  startsAt: string;
  endsAt: string;
};

type ScheduleRuntimeReturnParams = {
  legacyTenantId: string;
  legacyEncounterId: string;
  legacyReturnAppointmentId: string;
  legacyUnitId: string;
  legacyPatientId: string;
  legacyAppointmentTypeId: string;
  startsAt: string;
  endsAt: string;
  notes?: string | null;
  legacyProfessionalId?: string | null;
  legacyActorUserId?: string | null;
  metadata?: Record<string, unknown>;
};

type ScheduleRuntimeReturnResult = {
  encounterId: string | null;
  legacyEncounterId: string;
  appointmentId: string;
  legacyAppointmentId: string;
  appointmentStatus: string;
  encounterStatus: string | null;
  startsAt: string;
  endsAt: string;
  source: string;
};

type RegisterRuntimeNoShowParams = {
  legacyTenantId: string;
  legacyAppointmentId: string;
  reason?: string | null;
  legacyActorUserId?: string | null;
  metadata?: Record<string, unknown>;
};

type EnqueueRuntimePatientResult = {
  id: string;
  appointmentId: string;
  legacyAppointmentId: string;
  appointmentStatus: string;
  queueStatus: string;
  source: string;
};

type SyncRuntimeAppointmentProjectionOptions = {
  flow: string;
  operation: string;
  confirmedAt?: string | Date | null;
  checkedInAt?: string | Date | null;
  canceledAt?: string | Date | null;
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

function normalizeTimestamp(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
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

function assertAppointmentOperationResult(
  result: Record<string, unknown>,
  rpcName: string
): AppointmentOperationResult {
  if (
    typeof result.id !== "string" ||
    typeof result.legacyAppointmentId !== "string" ||
    typeof result.status !== "string" ||
    typeof result.source !== "string"
  ) {
    throw new Error(`RPC ${rpcName} retornou payload incompleto.`);
  }

  return {
    id: result.id,
    legacyAppointmentId: result.legacyAppointmentId,
    status: result.status,
    source: result.source,
  };
}

function assertEnqueueRuntimePatientResult(
  result: Record<string, unknown>,
  rpcName: string
): EnqueueRuntimePatientResult {
  if (
    typeof result.id !== "string" ||
    typeof result.appointmentId !== "string" ||
    typeof result.legacyAppointmentId !== "string" ||
    typeof result.appointmentStatus !== "string" ||
    typeof result.queueStatus !== "string" ||
    typeof result.source !== "string"
  ) {
    throw new Error(`RPC ${rpcName} retornou payload incompleto.`);
  }

  return {
    id: result.id,
    appointmentId: result.appointmentId,
    legacyAppointmentId: result.legacyAppointmentId,
    appointmentStatus: result.appointmentStatus,
    queueStatus: result.queueStatus,
    source: result.source,
  };
}

function assertScheduleRuntimeReturnResult(
  result: Record<string, unknown>,
  rpcName: string
): ScheduleRuntimeReturnResult {
  if (
    typeof result.legacyEncounterId !== "string" ||
    typeof result.appointmentId !== "string" ||
    typeof result.legacyAppointmentId !== "string" ||
    typeof result.appointmentStatus !== "string" ||
    typeof result.startsAt !== "string" ||
    typeof result.endsAt !== "string" ||
    typeof result.source !== "string"
  ) {
    throw new Error(`RPC ${rpcName} retornou payload incompleto.`);
  }

  return {
    encounterId:
      typeof result.encounterId === "string" && result.encounterId.length > 0 ? result.encounterId : null,
    legacyEncounterId: result.legacyEncounterId,
    appointmentId: result.appointmentId,
    legacyAppointmentId: result.legacyAppointmentId,
    appointmentStatus: result.appointmentStatus,
    encounterStatus:
      typeof result.encounterStatus === "string" && result.encounterStatus.length > 0
        ? result.encounterStatus
        : null,
    startsAt: result.startsAt,
    endsAt: result.endsAt,
    source: result.source,
  };
}

export async function upsertRuntimeAppointmentFromLegacy(
  params: UpsertRuntimeAppointmentFromLegacyParams
): Promise<UpsertRuntimeAppointmentFromLegacyResult> {
  const { data, error } = await supabaseAdmin.rpc("upsert_runtime_appointment_from_legacy", {
    p_legacy_tenant_id: params.legacyTenantId,
    p_legacy_appointment_id: params.legacyAppointmentId,
    p_legacy_unit_id: params.legacyUnitId,
    p_legacy_patient_id: params.legacyPatientId,
    p_legacy_appointment_type_id: params.legacyAppointmentTypeId,
    p_starts_at: params.startsAt,
    p_ends_at: params.endsAt,
    p_status: params.status ?? null,
    p_source: params.source ?? null,
    p_legacy_professional_id: params.legacyProfessionalId ?? null,
    p_notes: params.notes ?? null,
    p_legacy_created_by_user_id: params.legacyCreatedByUserId ?? null,
    p_confirmed_at: params.confirmedAt ?? null,
    p_checked_in_at: params.checkedInAt ?? null,
    p_canceled_at: params.canceledAt ?? null,
    p_metadata: params.metadata ?? {},
    p_created_at: params.createdAt ?? null,
    p_updated_at: params.updatedAt ?? null,
    p_deleted_at: params.deletedAt ?? null,
  });

  if (error) {
    throw new Error(`Falha ao executar RPC upsert_runtime_appointment_from_legacy: ${error.message}`);
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("RPC upsert_runtime_appointment_from_legacy nao retornou um objeto valido.");
  }

  const result = data as Record<string, unknown>;

  if (
    typeof result.id !== "string" ||
    typeof result.legacyAppointmentId !== "string" ||
    typeof result.status !== "string" ||
    typeof result.source !== "string"
  ) {
    throw new Error("RPC upsert_runtime_appointment_from_legacy retornou payload incompleto.");
  }

  return {
    id: result.id,
    legacyAppointmentId: result.legacyAppointmentId,
    status: result.status,
    source: result.source,
  };
}

export async function createRuntimeAppointment(params: CreateRuntimeAppointmentParams) {
  const result = await callRpc<Record<string, unknown>>("create_appointment", {
    p_legacy_tenant_id: params.legacyTenantId,
    p_legacy_appointment_id: params.legacyAppointmentId,
    p_legacy_unit_id: params.legacyUnitId,
    p_legacy_patient_id: params.legacyPatientId,
    p_legacy_appointment_type_id: params.legacyAppointmentTypeId,
    p_starts_at: params.startsAt,
    p_ends_at: params.endsAt,
    p_legacy_professional_id: params.legacyProfessionalId ?? null,
    p_notes: params.notes ?? null,
    p_source: params.source ?? null,
    p_legacy_created_by_user_id: params.legacyCreatedByUserId ?? null,
    p_created_at: params.createdAt ?? null,
    p_updated_at: params.updatedAt ?? null,
    p_deleted_at: params.deletedAt ?? null,
    p_metadata: params.metadata ?? {},
  });

  return assertAppointmentOperationResult(result, "create_appointment");
}

export async function confirmRuntimeAppointment(params: ConfirmRuntimeAppointmentParams) {
  const result = await callRpc<Record<string, unknown>>("confirm_appointment", {
    p_legacy_tenant_id: params.legacyTenantId,
    p_legacy_appointment_id: params.legacyAppointmentId,
    p_confirmed_at: params.confirmedAt ?? null,
    p_legacy_actor_user_id: params.legacyActorUserId ?? null,
    p_metadata: params.metadata ?? {},
  });

  return assertAppointmentOperationResult(result, "confirm_appointment");
}

export async function registerRuntimeAppointmentCheckin(params: RegisterRuntimeCheckinParams) {
  const result = await callRpc<Record<string, unknown>>("register_checkin", {
    p_legacy_tenant_id: params.legacyTenantId,
    p_legacy_appointment_id: params.legacyAppointmentId,
    p_checked_in_at: params.checkedInAt ?? null,
    p_legacy_actor_user_id: params.legacyActorUserId ?? null,
    p_metadata: params.metadata ?? {},
  });

  return assertAppointmentOperationResult(result, "register_checkin");
}

export async function enqueueRuntimePatient(params: EnqueueRuntimePatientParams) {
  const result = await callRpc<Record<string, unknown>>("enqueue_patient", {
    p_legacy_tenant_id: params.legacyTenantId,
    p_legacy_appointment_id: params.legacyAppointmentId,
    p_enqueued_at: params.enqueuedAt ?? null,
    p_notes: params.notes ?? null,
    p_legacy_actor_user_id: params.legacyActorUserId ?? null,
    p_metadata: params.metadata ?? {},
  });

  return assertEnqueueRuntimePatientResult(result, "enqueue_patient");
}

export async function cancelRuntimeAppointment(params: CancelRuntimeAppointmentParams) {
  const result = await callRpc<Record<string, unknown>>("cancel_appointment", {
    p_legacy_tenant_id: params.legacyTenantId,
    p_legacy_appointment_id: params.legacyAppointmentId,
    p_canceled_at: params.canceledAt ?? null,
    p_notes: params.notes ?? null,
    p_reason: params.reason ?? null,
    p_legacy_actor_user_id: params.legacyActorUserId ?? null,
    p_metadata: params.metadata ?? {},
  });

  return assertAppointmentOperationResult(result, "cancel_appointment");
}

export async function rescheduleRuntimeAppointment(
  params: RescheduleRuntimeAppointmentParams
): Promise<RescheduleRuntimeAppointmentResult> {
  const result = await callRpc<Record<string, unknown>>("reschedule_appointment", {
    p_legacy_tenant_id: params.legacyTenantId,
    p_legacy_appointment_id: params.legacyAppointmentId,
    p_starts_at: params.startsAt,
    p_ends_at: params.endsAt,
    p_notes: params.notes ?? null,
    p_reason: params.reason ?? null,
    p_legacy_actor_user_id: params.legacyActorUserId ?? null,
    p_metadata: params.metadata ?? {},
  });

  const appointmentResult = assertAppointmentOperationResult(result, "reschedule_appointment");

  if (typeof result.startsAt !== "string" || typeof result.endsAt !== "string") {
    throw new Error("RPC reschedule_appointment retornou payload incompleto.");
  }

  return {
    ...appointmentResult,
    startsAt: result.startsAt,
    endsAt: result.endsAt,
  };
}

export async function scheduleRuntimeReturn(
  params: ScheduleRuntimeReturnParams
): Promise<ScheduleRuntimeReturnResult> {
  const result = await callRpc<Record<string, unknown>>("schedule_return", {
    p_legacy_tenant_id: params.legacyTenantId,
    p_legacy_encounter_id: params.legacyEncounterId,
    p_legacy_return_appointment_id: params.legacyReturnAppointmentId,
    p_legacy_unit_id: params.legacyUnitId,
    p_legacy_patient_id: params.legacyPatientId,
    p_legacy_appointment_type_id: params.legacyAppointmentTypeId,
    p_starts_at: params.startsAt,
    p_ends_at: params.endsAt,
    p_notes: params.notes ?? null,
    p_legacy_professional_id: params.legacyProfessionalId ?? null,
    p_legacy_actor_user_id: params.legacyActorUserId ?? null,
    p_metadata: params.metadata ?? {},
  });

  return assertScheduleRuntimeReturnResult(result, "schedule_return");
}

export async function registerRuntimeAppointmentNoShow(params: RegisterRuntimeNoShowParams) {
  const result = await callRpc<Record<string, unknown>>("register_no_show", {
    p_legacy_tenant_id: params.legacyTenantId,
    p_legacy_appointment_id: params.legacyAppointmentId,
    p_reason: params.reason ?? null,
    p_legacy_actor_user_id: params.legacyActorUserId ?? null,
    p_metadata: params.metadata ?? {},
  });

  return assertAppointmentOperationResult(result, "register_no_show");
}

export async function syncRuntimeAppointmentProjection(
  prisma: PrismaService,
  legacyAppointmentId: string,
  options: SyncRuntimeAppointmentProjectionOptions
) {
  if (!isRuntimeSyncEnabled()) {
    return;
  }

  const appointment = await prisma.appointment.findFirst({
    where: {
      id: legacyAppointmentId,
    },
    include: {
      patient: {
        include: {
          profile: true,
        },
      },
      professional: true,
      appointmentType: true,
      unit: {
        include: {
          address: {
            select: {
              city: true,
            },
          },
        },
      },
    },
  });

  if (!appointment) {
    return;
  }

  const tenant = await prisma.tenant.findFirstOrThrow({
    where: {
      id: appointment.tenantId,
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
          id: appointment.unit.id,
          name: appointment.unit.name,
          code: appointment.unit.code,
          city: appointment.unit.address?.city ?? "Sem cidade",
          status: appointment.unit.status,
          deletedAt: toIso(appointment.unit.deletedAt),
        },
      ],
    })
  );

  await callRpc("backfill_runtime_reference_data", {
    p_runtime_tenant_id: scope.tenantId,
    p_professionals: appointment.professional
      ? [
        {
          id: deterministicUuid("professional", appointment.professional.id),
          legacy_professional_id: appointment.professional.id,
          legacy_user_id: appointment.professional.userId,
          professional_type: enumToRuntime(appointment.professional.professionalType, "other"),
          license_number: appointment.professional.licenseNumber,
          display_name: appointment.professional.displayName,
          color_hex: appointment.professional.colorHex,
          is_schedulable: appointment.professional.isSchedulable,
          metadata: {
            source: "api_runtime_appointment_sync",
            flow: options.flow,
            operation: options.operation,
            legacy_user_id: appointment.professional.userId,
          },
          created_at: toIso(appointment.professional.createdAt),
          updated_at: toIso(appointment.professional.updatedAt),
          deleted_at: toIso(appointment.professional.deletedAt),
        },
      ]
      : [],
    p_appointment_types: [
      {
        id: deterministicUuid("appointment_type", appointment.appointmentType.id),
        legacy_appointment_type_id: appointment.appointmentType.id,
        name: appointment.appointmentType.name,
        code: appointment.appointmentType.code,
        default_duration_minutes: appointment.appointmentType.defaultDurationMinutes,
        requires_professional: appointment.appointmentType.requiresProfessional,
        requires_resource: appointment.appointmentType.requiresResource,
        generates_encounter: appointment.appointmentType.generatesEncounter,
        allows_telehealth: appointment.appointmentType.allowsTelehealth,
        active: appointment.appointmentType.active,
        metadata: {
          source: "api_runtime_appointment_sync",
          flow: options.flow,
          operation: options.operation,
        },
        created_at: toIso(appointment.appointmentType.createdAt),
        updated_at: toIso(appointment.appointmentType.createdAt),
      },
    ],
  });

  await upsertRuntimePatientFromLegacy({
    legacyTenantId: tenant.id,
    legacyPatientId: appointment.patient.id,
    fullName: appointment.patient.fullName,
    cpf: appointment.patient.cpf,
    birthDate: toDateOnly(appointment.patient.birthDate),
    primaryPhone: appointment.patient.primaryPhone,
    primaryEmail: appointment.patient.primaryEmail,
    goalsSummary: appointment.patient.profile?.goalsSummary ?? null,
    lifestyleSummary: appointment.patient.profile?.lifestyleSummary ?? null,
    legacyCreatedByUserId: appointment.createdBy,
    metadata: {
      source: "api_runtime_appointment_sync",
      flow: options.flow,
      operation: options.operation,
    },
  });

  await upsertRuntimeAppointmentFromLegacy({
    legacyTenantId: tenant.id,
    legacyAppointmentId: appointment.id,
    legacyUnitId: appointment.unitId,
    legacyPatientId: appointment.patientId,
    legacyAppointmentTypeId: appointment.appointmentTypeId,
    startsAt: appointment.startsAt.toISOString(),
    endsAt: appointment.endsAt.toISOString(),
    status: enumToRuntime(appointment.status, "scheduled"),
    source: enumToRuntime(appointment.source, "internal"),
    legacyProfessionalId: appointment.professionalId,
    notes: appointment.notes,
    legacyCreatedByUserId: appointment.createdBy,
    confirmedAt:
      normalizeTimestamp(options.confirmedAt) ??
      (appointment.status === "CONFIRMED" ? toIso(appointment.updatedAt) : null),
    checkedInAt:
      normalizeTimestamp(options.checkedInAt) ??
      (appointment.status === "CHECKED_IN" ? toIso(appointment.updatedAt) : null),
    canceledAt:
      normalizeTimestamp(options.canceledAt) ??
      (appointment.status === "CANCELLED" ? toIso(appointment.updatedAt) : null),
    metadata: {
      source: "api_runtime_appointment_sync",
      flow: options.flow,
      operation: options.operation,
      legacy_calendar_id: appointment.calendarId,
      legacy_resource_id: appointment.resourceId,
    },
    createdAt: toIso(appointment.createdAt),
    updatedAt: toIso(appointment.updatedAt),
    deletedAt: toIso(appointment.deletedAt),
  });
}
