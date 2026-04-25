import { createHash } from "node:crypto";

import type { PrismaService } from "../../prisma/prisma.service.ts";
import { supabaseAdmin } from "../../lib/supabase-admin.ts";
import { upsertRuntimeAppointmentFromLegacy } from "./runtime-appointment-writes.ts";
import { upsertRuntimeAnamnesis, upsertRuntimeEncounterFromLegacy } from "./runtime-encounter-writes.ts";
import { upsertRuntimePatientFromLegacy } from "./runtime-patient-writes.ts";

type ScopeResult = {
  tenantId: string;
  units: Array<{
    legacyUnitId: string;
    unitId: string;
  }>;
};

function isRuntimeSyncConfigured() {
  return Boolean(
    (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
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

export async function syncPatientRuntimeProjection(
  prisma: PrismaService,
  legacyPatientId: string
) {
  if (!isRuntimeSyncConfigured()) {
    return;
  }

  try {
    await syncPatientRuntimeProjectionUnsafe(prisma, legacyPatientId);
  } catch (error) {
    console.error(
      `[runtime:sync] Falha ao sincronizar paciente ${legacyPatientId}:`,
      error
    );
  }
}

async function syncPatientRuntimeProjectionUnsafe(
  prisma: PrismaService,
  legacyPatientId: string
) {
  const patient = await prisma.patient.findFirst({
    where: {
      id: legacyPatientId,
    },
    include: {
      profile: true,
      patientTags: {
        include: {
          tag: true,
        },
      },
      flags: true,
    },
  });

  if (!patient) {
    return;
  }

  const [tenant, appointments, encounters, clinicalTasks] = await Promise.all([
    prisma.tenant.findFirstOrThrow({
      where: { id: patient.tenantId },
      select: {
        id: true,
        legalName: true,
        tradeName: true,
        status: true,
        subscriptionPlanCode: true,
        units: {
          orderBy: { createdAt: "asc" },
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
    }),
    prisma.appointment.findMany({
      where: {
        tenantId: patient.tenantId,
        patientId: patient.id,
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        unitId: true,
        patientId: true,
        professionalId: true,
        appointmentTypeId: true,
        startsAt: true,
        endsAt: true,
        status: true,
        source: true,
        notes: true,
        createdBy: true,
        calendarId: true,
        resourceId: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    }),
    prisma.encounter.findMany({
      where: {
        tenantId: patient.tenantId,
        patientId: patient.id,
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        unitId: true,
        patientId: true,
        appointmentId: true,
        professionalId: true,
        encounterType: true,
        status: true,
        openedAt: true,
        closedAt: true,
        createdAt: true,
        updatedAt: true,
        anamnesis: {
          select: {
            id: true,
            chiefComplaint: true,
            historyOfPresentIllness: true,
            pastMedicalHistory: true,
            pastSurgicalHistory: true,
            familyHistory: true,
            medicationHistory: true,
            allergyHistory: true,
            lifestyleHistory: true,
            gynecologicalHistory: true,
            notes: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        consultationNotes: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            noteType: true,
            subjective: true,
            objective: true,
            assessment: true,
            plan: true,
            signedBy: true,
            signedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    }),
    prisma.clinicalTask.findMany({
      where: {
        tenantId: patient.tenantId,
        patientId: patient.id,
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        patientId: true,
        encounterId: true,
        assignedToUserId: true,
        taskType: true,
        title: true,
        description: true,
        priority: true,
        status: true,
        dueAt: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    }),
  ]);

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

  const runtimeUnitIdByLegacy = new Map(scope.units.map((entry) => [entry.legacyUnitId, entry.unitId]));

  const professionalIds = [...new Set(
    [...appointments.map((appointment) => appointment.professionalId), ...encounters.map((encounter) => encounter.professionalId)]
      .filter((value): value is string => Boolean(value))
  )];
  const appointmentTypeIds = [...new Set(
    appointments
      .map((appointment) => appointment.appointmentTypeId)
      .filter((value): value is string => Boolean(value))
  )];

  const [professionals, appointmentTypes] = await Promise.all([
    professionalIds.length
      ? prisma.professional.findMany({
        where: {
          tenantId: patient.tenantId,
          id: {
            in: professionalIds,
          },
        },
        orderBy: { createdAt: "asc" },
      })
      : Promise.resolve([]),
    appointmentTypeIds.length
      ? prisma.appointmentType.findMany({
        where: {
          tenantId: patient.tenantId,
          id: {
            in: appointmentTypeIds,
          },
        },
        orderBy: { createdAt: "asc" },
      })
      : Promise.resolve([]),
  ]);

  const runtimePatient = await upsertRuntimePatientFromLegacy({
    legacyTenantId: tenant.id,
    legacyPatientId: patient.id,
    fullName: patient.fullName,
    cpf: patient.cpf,
    birthDate: toDateOnly(patient.birthDate),
    primaryPhone: patient.primaryPhone,
    primaryEmail: patient.primaryEmail,
    goalsSummary: patient.profile?.goalsSummary ?? null,
    lifestyleSummary: patient.profile?.lifestyleSummary ?? null,
    metadata: {
      source: "api_runtime_sync",
    },
  });
  const runtimePatientId = runtimePatient.id;

  await callRpc("backfill_runtime_reference_data", {
    p_runtime_tenant_id: scope.tenantId,
    p_tags: patient.patientTags.map((patientTag) => ({
      id: deterministicUuid("tag", patientTag.tagId),
      legacy_tag_id: patientTag.tagId,
      name: patientTag.tag.name,
      code: patientTag.tag.code,
      color: patientTag.tag.color,
      status: "active",
      metadata: {
        source: "api_runtime_sync",
      },
      created_at: toIso(patientTag.tag.createdAt),
      updated_at: toIso(patientTag.tag.createdAt),
    })),
    p_professionals: professionals.map((professional) => ({
      id: deterministicUuid("professional", professional.id),
      legacy_professional_id: professional.id,
      legacy_user_id: professional.userId,
      professional_type: enumToRuntime(professional.professionalType, "other"),
      license_number: professional.licenseNumber,
      display_name: professional.displayName,
      color_hex: professional.colorHex,
      is_schedulable: professional.isSchedulable,
      metadata: {
        source: "api_runtime_sync",
        legacy_user_id: professional.userId,
      },
      created_at: toIso(professional.createdAt),
      updated_at: toIso(professional.updatedAt),
      deleted_at: toIso(professional.deletedAt),
    })),
    p_appointment_types: appointmentTypes.map((appointmentType) => ({
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
        source: "api_runtime_sync",
      },
      created_at: toIso(appointmentType.createdAt),
      updated_at: toIso(appointmentType.createdAt),
    })),
  });

  await callRpc("backfill_runtime_patient_domain", {
    p_runtime_tenant_id: scope.tenantId,
    p_patients: [
      {
        id: runtimePatientId,
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
        source: "hybrid",
        metadata: {
          source: "api_runtime_sync",
        },
        created_at: toIso(patient.createdAt),
        updated_at: toIso(patient.updatedAt),
        deleted_at: toIso(patient.deletedAt),
      },
    ],
    p_patient_profiles: patient.profile
      ? [
        {
          patient_id: runtimePatientId,
          occupation: patient.profile.occupation,
          referral_source: patient.profile.referralSource,
          lifestyle_summary: patient.profile.lifestyleSummary,
          goals_summary: patient.profile.goalsSummary,
          notes: patient.profile.notes,
          metadata: {
            source: "api_runtime_sync",
          },
          created_at: toIso(patient.profile.createdAt),
          updated_at: toIso(patient.profile.updatedAt),
        },
      ]
      : [],
    p_patient_tags: patient.patientTags.map((patientTag) => ({
      patient_id: runtimePatientId,
      tag_id: deterministicUuid("tag", patientTag.tagId),
      metadata: {
        source: "api_runtime_sync",
      },
      created_at: toIso(patientTag.createdAt),
    })),
    p_patient_flags: patient.flags.map((flag) => ({
      id: deterministicUuid("patient_flag", flag.id),
      patient_id: runtimePatientId,
      legacy_flag_id: flag.id,
      flag_type: flag.flagType,
      severity: enumToRuntime(flag.severity, "medium"),
      description: flag.description,
      active: flag.active,
      legacy_created_by_user_id: flag.createdBy,
      resolved_at: null,
      metadata: {
        source: "api_runtime_sync",
      },
      created_at: toIso(flag.createdAt),
      updated_at: toIso(flag.createdAt),
    })),
  });

  const runtimeAppointmentIdByLegacy = new Map(
    (
      await Promise.all(
        appointments.map(async (appointment) => {
          const runtimeUnitId = runtimeUnitIdByLegacy.get(appointment.unitId);
          if (!runtimeUnitId) {
            return null;
          }

          const result = await upsertRuntimeAppointmentFromLegacy({
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
            confirmedAt: appointment.status === "CONFIRMED" ? toIso(appointment.updatedAt) : null,
            checkedInAt: appointment.status === "CHECKED_IN" ? toIso(appointment.updatedAt) : null,
            canceledAt: appointment.status === "CANCELLED" ? toIso(appointment.updatedAt) : null,
            metadata: {
              source: "api_runtime_sync",
              legacy_calendar_id: appointment.calendarId,
              legacy_resource_id: appointment.resourceId,
            },
            createdAt: toIso(appointment.createdAt),
            updatedAt: toIso(appointment.updatedAt),
            deletedAt: toIso(appointment.deletedAt),
          });

          return [appointment.id, result.id] as const;
        })
      )
    ).filter((entry): entry is readonly [string, string] => Boolean(entry))
  );

  const appointmentRows = appointments.flatMap((appointment) => {
    const runtimeUnitId = runtimeUnitIdByLegacy.get(appointment.unitId);
    if (!runtimeUnitId) {
      return [];
    }

    return [
      {
        id: runtimeAppointmentIdByLegacy.get(appointment.id) ?? deterministicUuid("appointment", appointment.id),
        unit_id: runtimeUnitId,
        patient_id: runtimePatientId,
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
        confirmed_at: appointment.status === "CONFIRMED" ? toIso(appointment.updatedAt) : null,
        checked_in_at: appointment.status === "CHECKED_IN" ? toIso(appointment.updatedAt) : null,
        canceled_at: appointment.status === "CANCELLED" ? toIso(appointment.updatedAt) : null,
        metadata: {
          source: "api_runtime_sync",
          legacy_calendar_id: appointment.calendarId,
          legacy_resource_id: appointment.resourceId,
        },
        created_at: toIso(appointment.createdAt),
        updated_at: toIso(appointment.updatedAt),
        deleted_at: toIso(appointment.deletedAt),
      },
    ];
  });

  await callRpc("backfill_runtime_scheduling_domain", {
    p_runtime_tenant_id: scope.tenantId,
    p_appointments: appointmentRows,
  });

  const runtimeEncounterIdByLegacy = new Map(
    (
      await Promise.all(
        encounters.map(async (encounter) => {
          const runtimeUnitId = runtimeUnitIdByLegacy.get(encounter.unitId);
          if (!runtimeUnitId) {
            return null;
          }

          const result = await upsertRuntimeEncounterFromLegacy({
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
              source: "api_runtime_sync",
            },
            createdAt: toIso(encounter.createdAt),
            updatedAt: toIso(encounter.updatedAt),
          });

          return [encounter.id, result.id] as const;
        })
      )
    ).filter((entry): entry is readonly [string, string] => Boolean(entry))
  );

  const encounterRows = encounters.flatMap((encounter) => {
    const runtimeUnitId = runtimeUnitIdByLegacy.get(encounter.unitId);
    if (!runtimeUnitId) {
      return [];
    }

    return [
      {
        id: runtimeEncounterIdByLegacy.get(encounter.id) ?? deterministicUuid("encounter", encounter.id),
        unit_id: runtimeUnitId,
        patient_id: runtimePatientId,
        appointment_id: encounter.appointmentId
          ? (runtimeAppointmentIdByLegacy.get(encounter.appointmentId)
            ?? deterministicUuid("appointment", encounter.appointmentId))
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
          source: "api_runtime_sync",
        },
        created_at: toIso(encounter.createdAt),
        updated_at: toIso(encounter.updatedAt),
      },
    ];
  });

  await Promise.all(
    encounters
      .filter((encounter) => Boolean(encounter.anamnesis))
      .map((encounter) =>
        upsertRuntimeAnamnesis({
          runtimeTenantId: scope.tenantId,
          runtimeEncounterId:
            runtimeEncounterIdByLegacy.get(encounter.id) ?? deterministicUuid("encounter", encounter.id),
          runtimeAnamnesisId: deterministicUuid("anamnesis", encounter.anamnesis!.id),
          chiefComplaint: encounter.anamnesis!.chiefComplaint,
          historyOfPresentIllness: encounter.anamnesis!.historyOfPresentIllness,
          pastMedicalHistory: encounter.anamnesis!.pastMedicalHistory,
          pastSurgicalHistory: encounter.anamnesis!.pastSurgicalHistory,
          familyHistory: encounter.anamnesis!.familyHistory,
          medicationHistory: encounter.anamnesis!.medicationHistory,
          allergyHistory: encounter.anamnesis!.allergyHistory,
          lifestyleHistory: encounter.anamnesis!.lifestyleHistory,
          gynecologicalHistory: encounter.anamnesis!.gynecologicalHistory,
          notes: encounter.anamnesis!.notes,
          metadata: {
            source: "api_runtime_sync",
          },
          createdAt: toIso(encounter.anamnesis!.createdAt),
          updatedAt: toIso(encounter.anamnesis!.updatedAt),
        })
      )
  );

  await callRpc("backfill_runtime_clinical_domain", {
    p_runtime_tenant_id: scope.tenantId,
    p_encounters: encounterRows,
    p_consultation_notes: encounters.flatMap((encounter) =>
      encounter.consultationNotes.map((note) => ({
        id: deterministicUuid("consultation_note", note.id),
        encounter_id: runtimeEncounterIdByLegacy.get(encounter.id) ?? deterministicUuid("encounter", encounter.id),
        note_type: note.noteType,
        subjective: note.subjective,
        objective: note.objective,
        assessment: note.assessment,
        plan: note.plan,
        legacy_signed_by_user_id: note.signedBy,
        signed_at: toIso(note.signedAt),
        metadata: {
          source: "api_runtime_sync",
        },
        created_at: toIso(note.createdAt),
        updated_at: toIso(note.updatedAt),
      }))
    ),
    p_clinical_tasks: clinicalTasks.map((task) => ({
      id: deterministicUuid("clinical_task", task.id),
      patient_id: runtimePatientId,
      encounter_id: task.encounterId
        ? (runtimeEncounterIdByLegacy.get(task.encounterId) ?? deterministicUuid("encounter", task.encounterId))
        : null,
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
        source: "api_runtime_sync",
      },
      created_at: toIso(task.createdAt),
      updated_at: toIso(task.updatedAt),
      deleted_at: toIso(task.deletedAt),
    })),
  });
}
