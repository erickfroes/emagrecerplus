import "dotenv/config";

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import process from "node:process";

import { supabaseAdmin } from "../apps/api/src/lib/supabase-admin.ts";

type ScopeResult = {
  tenantId: string;
  units: Array<{
    legacyUnitId: string;
    unitId: string;
  }>;
};

type RuntimeUnitFixture = {
  legacyUnitId: string;
  name: string;
  code: string;
  city: string;
  status: string;
};

function deterministicUuid(namespace: string, key: string) {
  const hash = createHash("sha1").update(`${namespace}:${key}`).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;

  const hex = hash.subarray(0, 16).toString("hex");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function toIso(value: Date) {
  return value.toISOString();
}

function toDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function daysFromNow(days: number, hour = 9, minute = 0) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  value.setHours(hour, minute, 0, 0);
  return value;
}

function hoursFrom(date: Date, hours: number) {
  const value = new Date(date);
  value.setHours(value.getHours() + hours);
  return value;
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
  if (process.argv.includes("--help")) {
    console.log(`
Uso:
  npm run runtime:seed:direct

Descricao:
  Cria fixtures minimas de homologacao direto no runtime Supabase, sem depender do Prisma legado.
`);
    return;
  }

  assert(process.env.SUPABASE_URL, "SUPABASE_URL ausente.");
  assert(process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY ausente.");

  const runtimeUnits: RuntimeUnitFixture[] = [
    {
      legacyUnitId: "runtime-fixture-unit-main",
      name: "Runtime Matriz",
      code: "RUNTIME-MATRIZ",
      city: "Imperatriz",
      status: "ACTIVE",
    },
    {
      legacyUnitId: "runtime-fixture-unit-east",
      name: "Runtime Leste",
      code: "RUNTIME-LESTE",
      city: "Imperatriz",
      status: "ACTIVE",
    },
  ];

  const scope = asScopeResult(
    await callRpc("backfill_runtime_scope", {
      p_legacy_tenant_id: "runtime-fixture-tenant-main",
      p_legacy_tenant_legal_name: "Runtime Homolog Clinic LTDA",
      p_legacy_tenant_trade_name: "Runtime Homolog Clinic",
      p_legacy_tenant_status: "ACTIVE",
      p_subscription_plan_code: "runtime-homolog",
      p_units: runtimeUnits.map((unit) => ({
        id: unit.legacyUnitId,
        name: unit.name,
        code: unit.code,
        city: unit.city,
        status: unit.status,
      })),
    })
  );

  console.log(`[runtime:seed:direct] scope tenantId=${scope.tenantId} units=${scope.units.length}`);

  const runtimeUnitIdByLegacy = new Map(scope.units.map((entry) => [entry.legacyUnitId, entry.unitId]));
  const mainUnitId = runtimeUnitIdByLegacy.get("runtime-fixture-unit-main");
  const eastUnitId = runtimeUnitIdByLegacy.get("runtime-fixture-unit-east");

  assert(mainUnitId, "Unit runtime-fixture-unit-main nao foi resolvida.");
  assert(eastUnitId, "Unit runtime-fixture-unit-east nao foi resolvida.");

  const referenceDataResult = await callRpc("backfill_runtime_reference_data", {
    p_runtime_tenant_id: scope.tenantId,
    p_tags: [
      {
        id: deterministicUuid("runtime_tag", "high-risk"),
        legacy_tag_id: "runtime-tag-high-risk",
        name: "Alto risco",
        code: "high_risk",
        color: "#ef4444",
        status: "active",
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-15)),
        updated_at: toIso(daysFromNow(-15)),
      },
      {
        id: deterministicUuid("runtime_tag", "vip"),
        legacy_tag_id: "runtime-tag-vip",
        name: "VIP",
        code: "vip",
        color: "#f59e0b",
        status: "active",
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-15)),
        updated_at: toIso(daysFromNow(-15)),
      },
      {
        id: deterministicUuid("runtime_tag", "follow-up"),
        legacy_tag_id: "runtime-tag-follow-up",
        name: "Retorno prioritario",
        code: "priority_follow_up",
        color: "#3b82f6",
        status: "active",
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-15)),
        updated_at: toIso(daysFromNow(-15)),
      },
    ],
    p_professionals: [
      {
        id: deterministicUuid("runtime_professional", "doctor"),
        legacy_professional_id: "runtime-professional-doctor",
        legacy_user_id: null,
        professional_type: "physician",
        license_number: "CRM-RUNTIME-001",
        display_name: "Dr. Runtime Silva",
        color_hex: "#1d4ed8",
        is_schedulable: true,
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-20)),
        updated_at: toIso(daysFromNow(-20)),
        deleted_at: null,
      },
      {
        id: deterministicUuid("runtime_professional", "nutritionist"),
        legacy_professional_id: "runtime-professional-nutritionist",
        legacy_user_id: null,
        professional_type: "nutritionist",
        license_number: "CRN-RUNTIME-001",
        display_name: "Dra. Nutri Runtime",
        color_hex: "#059669",
        is_schedulable: true,
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-20)),
        updated_at: toIso(daysFromNow(-20)),
        deleted_at: null,
      },
    ],
    p_appointment_types: [
      {
        id: deterministicUuid("runtime_appointment_type", "initial-consult"),
        legacy_appointment_type_id: "runtime-appointment-type-initial",
        name: "Consulta inicial runtime",
        code: "runtime_initial_consult",
        default_duration_minutes: 60,
        requires_professional: true,
        requires_resource: false,
        generates_encounter: true,
        allows_telehealth: false,
        active: true,
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-20)),
        updated_at: toIso(daysFromNow(-20)),
      },
      {
        id: deterministicUuid("runtime_appointment_type", "follow-up"),
        legacy_appointment_type_id: "runtime-appointment-type-follow-up",
        name: "Retorno runtime",
        code: "runtime_follow_up",
        default_duration_minutes: 30,
        requires_professional: true,
        requires_resource: false,
        generates_encounter: true,
        allows_telehealth: true,
        active: true,
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-20)),
        updated_at: toIso(daysFromNow(-20)),
      },
    ],
  });

  console.log(`[runtime:seed:direct] referenceData ${summarizeResult(referenceDataResult)}`);

  const patientCamilaId = deterministicUuid("runtime_patient", "camila");
  const patientBrunoId = deterministicUuid("runtime_patient", "bruno");

  const patientResult = await callRpc("backfill_runtime_patient_domain", {
    p_runtime_tenant_id: scope.tenantId,
    p_patients: [
      {
        id: patientCamilaId,
        legacy_patient_id: "runtime-patient-camila",
        external_code: "RUNTIME-001",
        full_name: "Camila Runtime Souza",
        cpf: "900.000.000-01",
        birth_date: "1990-05-12",
        sex: "female",
        gender: "female",
        marital_status: "single",
        primary_phone: "(99) 99111-0001",
        primary_email: "camila.runtime@example.com",
        status: "active",
        source: "hybrid",
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-40)),
        updated_at: toIso(daysFromNow(-1)),
        deleted_at: null,
      },
      {
        id: patientBrunoId,
        legacy_patient_id: "runtime-patient-bruno",
        external_code: "RUNTIME-002",
        full_name: "Bruno Runtime Lima",
        cpf: "900.000.000-02",
        birth_date: "1987-11-03",
        sex: "male",
        gender: "male",
        marital_status: "married",
        primary_phone: "(99) 99111-0002",
        primary_email: "bruno.runtime@example.com",
        status: "active",
        source: "hybrid",
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-35)),
        updated_at: toIso(daysFromNow(-2)),
        deleted_at: null,
      },
    ],
    p_patient_profiles: [
      {
        patient_id: patientCamilaId,
        occupation: "Empresaria",
        referral_source: "Instagram",
        lifestyle_summary: "Rotina intensa, treina 3x por semana e relata dificuldade de manter sono regular.",
        goals_summary: "Perda de gordura com melhora de energia e constancia.",
        notes: "Paciente de homologacao seeded direto no runtime.",
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-40)),
        updated_at: toIso(daysFromNow(-1)),
      },
      {
        patient_id: patientBrunoId,
        occupation: "Gestor comercial",
        referral_source: "Indicacao",
        lifestyle_summary: "Sedentarismo recente e foco em retomada de rotina.",
        goals_summary: "Retomar atividade fisica e melhorar composicao corporal.",
        notes: "Paciente de retorno para agenda futura.",
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-35)),
        updated_at: toIso(daysFromNow(-2)),
      },
    ],
    p_patient_tags: [
      {
        patient_id: patientCamilaId,
        tag_id: deterministicUuid("runtime_tag", "high-risk"),
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-20)),
      },
      {
        patient_id: patientCamilaId,
        tag_id: deterministicUuid("runtime_tag", "vip"),
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-18)),
      },
      {
        patient_id: patientBrunoId,
        tag_id: deterministicUuid("runtime_tag", "follow-up"),
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-10)),
      },
    ],
    p_patient_flags: [
      {
        id: deterministicUuid("runtime_patient_flag", "camila-alert"),
        patient_id: patientCamilaId,
        legacy_flag_id: "runtime-patient-flag-camila",
        flag_type: "adherence_attention",
        severity: "high",
        description: "Oscilacao recente de adesao alimentar e sono irregular.",
        active: true,
        legacy_created_by_user_id: null,
        resolved_at: null,
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-6)),
        updated_at: toIso(daysFromNow(-1)),
      },
    ],
  });

  console.log(`[runtime:seed:direct] patients ${summarizeResult(patientResult)}`);

  const completedAppointmentStart = daysFromNow(-3, 8, 30);
  const completedAppointmentEnd = hoursFrom(completedAppointmentStart, 1);
  const futureAppointmentStart = daysFromNow(2, 14, 0);
  const futureAppointmentEnd = hoursFrom(futureAppointmentStart, 1);

  const schedulingResult = await callRpc("backfill_runtime_scheduling_domain", {
    p_runtime_tenant_id: scope.tenantId,
    p_appointments: [
      {
        id: deterministicUuid("runtime_appointment", "camila-completed"),
        unit_id: mainUnitId,
        patient_id: patientCamilaId,
        professional_id: deterministicUuid("runtime_professional", "doctor"),
        appointment_type_id: deterministicUuid("runtime_appointment_type", "initial-consult"),
        legacy_appointment_id: "runtime-appointment-camila-completed",
        starts_at: toIso(completedAppointmentStart),
        ends_at: toIso(completedAppointmentEnd),
        status: "completed",
        source: "internal",
        notes: "Consulta inicial concluida pelo seed runtime.",
        legacy_created_by_user_id: null,
        confirmed_at: toIso(daysFromNow(-4, 16, 0)),
        checked_in_at: toIso(daysFromNow(-3, 8, 10)),
        canceled_at: null,
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-7, 10, 0)),
        updated_at: toIso(daysFromNow(-3, 9, 30)),
        deleted_at: null,
      },
      {
        id: deterministicUuid("runtime_appointment", "bruno-follow-up"),
        unit_id: eastUnitId,
        patient_id: patientBrunoId,
        professional_id: deterministicUuid("runtime_professional", "nutritionist"),
        appointment_type_id: deterministicUuid("runtime_appointment_type", "follow-up"),
        legacy_appointment_id: "runtime-appointment-bruno-follow-up",
        starts_at: toIso(futureAppointmentStart),
        ends_at: toIso(futureAppointmentEnd),
        status: "confirmed",
        source: "internal",
        notes: "Retorno futuro seeded direto no runtime.",
        legacy_created_by_user_id: null,
        confirmed_at: toIso(daysFromNow(-1, 11, 0)),
        checked_in_at: null,
        canceled_at: null,
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-2, 10, 0)),
        updated_at: toIso(daysFromNow(-1, 11, 0)),
        deleted_at: null,
      },
    ],
  });

  console.log(`[runtime:seed:direct] scheduling ${summarizeResult(schedulingResult)}`);

  const clinicalResult = await callRpc("backfill_runtime_clinical_domain", {
    p_runtime_tenant_id: scope.tenantId,
    p_encounters: [
      {
        id: deterministicUuid("runtime_encounter", "camila-completed"),
        unit_id: mainUnitId,
        patient_id: patientCamilaId,
        appointment_id: deterministicUuid("runtime_appointment", "camila-completed"),
        professional_id: deterministicUuid("runtime_professional", "doctor"),
        legacy_encounter_id: "runtime-encounter-camila-completed",
        encounter_type: "initial_consult",
        status: "closed",
        summary: "Consulta inicial com definicao de plano nutricional e acompanhamento.",
        opened_at: toIso(daysFromNow(-3, 8, 40)),
        closed_at: toIso(daysFromNow(-3, 9, 35)),
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-3, 8, 40)),
        updated_at: toIso(daysFromNow(-3, 9, 35)),
      },
    ],
    p_anamneses: [
      {
        id: deterministicUuid("runtime_anamnesis", "camila"),
        encounter_id: deterministicUuid("runtime_encounter", "camila-completed"),
        chief_complaint: "Dificuldade de adesao e fadiga no fim do dia.",
        history_of_present_illness: "Paciente relata oscilacao de rotina alimentar apos viagens frequentes.",
        past_medical_history: "Sem comorbidades relevantes referidas.",
        past_surgical_history: null,
        family_history: "Historia familiar de diabetes tipo 2.",
        medication_history: "Sem medicacao cronica.",
        allergy_history: "Nega alergias medicamentosas.",
        lifestyle_history: "Treina musculacao 3x/semana e caminha aos fins de semana.",
        gynecological_history: null,
        notes: "Seed direto runtime.",
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-3, 8, 50)),
        updated_at: toIso(daysFromNow(-3, 8, 55)),
      },
    ],
    p_consultation_notes: [
      {
        id: deterministicUuid("runtime_consultation_note", "camila-soap"),
        encounter_id: deterministicUuid("runtime_encounter", "camila-completed"),
        note_type: "soap",
        subjective: "Paciente motivada, mas com dificuldade de constancia em dias de agenda cheia.",
        objective: "Peso e composicao corporal com margem para reducao de gordura.",
        assessment: "Baixa adesao em periodo noturno e necessidade de reforco de rotina.",
        plan: "Plano alimentar simplificado, hidracao guiada e retorno em 15 dias.",
        legacy_signed_by_user_id: null,
        signed_at: toIso(daysFromNow(-3, 9, 20)),
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-3, 9, 5)),
        updated_at: toIso(daysFromNow(-3, 9, 20)),
      },
    ],
    p_care_plans: [
      {
        id: deterministicUuid("runtime_care_plan", "camila-main"),
        patient_id: patientCamilaId,
        legacy_care_plan_id: "runtime-care-plan-camila",
        current_status: "active",
        summary: "Plano inicial de recomposicao corporal com foco em adesao.",
        start_date: toDateOnly(daysFromNow(-3)),
        end_date: toDateOnly(daysFromNow(27)),
        legacy_created_by_user_id: null,
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-3, 9, 15)),
        updated_at: toIso(daysFromNow(-3, 9, 15)),
        deleted_at: null,
      },
    ],
    p_care_plan_items: [
      {
        id: deterministicUuid("runtime_care_plan_item", "camila-hydration"),
        care_plan_id: deterministicUuid("runtime_care_plan", "camila-main"),
        item_type: "habit",
        title: "Hidratacao 2L/dia",
        description: "Meta minima diaria de hidratacao na primeira fase.",
        status: "active",
        target_date: toDateOnly(daysFromNow(14)),
        completed_at: null,
        position: 1,
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-3, 9, 16)),
        updated_at: toIso(daysFromNow(-3, 9, 16)),
      },
    ],
    p_clinical_tasks: [
      {
        id: deterministicUuid("runtime_clinical_task", "camila-follow-up-task"),
        patient_id: patientCamilaId,
        encounter_id: deterministicUuid("runtime_encounter", "camila-completed"),
        legacy_task_id: "runtime-clinical-task-camila",
        assigned_to_legacy_user_id: null,
        task_type: "follow_up",
        title: "Revisar adesao em 7 dias",
        description: "Checar hidracao, sono e organizacao de refeicoes.",
        priority: "high",
        status: "open",
        due_at: toIso(daysFromNow(4, 10, 0)),
        completed_at: null,
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-3, 9, 18)),
        updated_at: toIso(daysFromNow(-3, 9, 18)),
        deleted_at: null,
      },
    ],
    p_patient_goals: [
      {
        id: deterministicUuid("runtime_patient_goal", "camila-goal"),
        patient_id: patientCamilaId,
        legacy_goal_id: "runtime-patient-goal-camila",
        goal_type: "body_composition",
        title: "Reduzir gordura corporal",
        target_value: "-4kg gordura",
        current_value: "baseline",
        target_date: toDateOnly(daysFromNow(45)),
        status: "active",
        legacy_created_by_user_id: null,
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-3, 9, 18)),
        updated_at: toIso(daysFromNow(-3, 9, 18)),
      },
    ],
    p_prescription_records: [
      {
        id: deterministicUuid("runtime_prescription_record", "camila-guidance"),
        encounter_id: deterministicUuid("runtime_encounter", "camila-completed"),
        patient_id: patientCamilaId,
        legacy_prescription_id: "runtime-prescription-camila",
        prescription_type: "orientation",
        summary: "Orientacao de rotina alimentar simplificada e hidracao estruturada.",
        legacy_issued_by_user_id: null,
        issued_at: toIso(daysFromNow(-3, 9, 25)),
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-3, 9, 25)),
      },
    ],
  });

  console.log(`[runtime:seed:direct] clinical ${summarizeResult(clinicalResult)}`);

  const patientLogsResult = await callRpc("backfill_runtime_patient_logs", {
    p_runtime_tenant_id: scope.tenantId,
    p_habit_logs: [
      {
        id: deterministicUuid("runtime_habit_log", "camila-steps"),
        patient_id: patientCamilaId,
        legacy_habit_log_id: "runtime-habit-log-camila",
        logged_at: toIso(daysFromNow(-1, 19, 0)),
        kind: "daily_steps",
        value_text: null,
        value_num: 7800,
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-1, 19, 0)),
      },
    ],
    p_hydration_logs: [
      {
        id: deterministicUuid("runtime_hydration_log", "camila-water"),
        patient_id: patientCamilaId,
        legacy_hydration_log_id: "runtime-hydration-log-camila",
        logged_at: toIso(daysFromNow(-1, 18, 0)),
        volume_ml: 2100,
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-1, 18, 0)),
      },
    ],
    p_meal_logs: [
      {
        id: deterministicUuid("runtime_meal_log", "camila-lunch"),
        patient_id: patientCamilaId,
        legacy_meal_log_id: "runtime-meal-log-camila",
        logged_at: toIso(daysFromNow(-1, 12, 30)),
        meal_type: "lunch",
        description: "Prato base com proteina, legumes e carboidrato moderado.",
        photo_path: null,
        adherence_rating: 4,
        notes: "Boa organizacao no horario comercial.",
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-1, 12, 30)),
      },
    ],
    p_workout_logs: [
      {
        id: deterministicUuid("runtime_workout_log", "camila-training"),
        patient_id: patientCamilaId,
        legacy_workout_log_id: "runtime-workout-log-camila",
        logged_at: toIso(daysFromNow(-2, 7, 0)),
        workout_type: "strength_training",
        duration_minutes: 50,
        intensity: "moderate",
        completed: true,
        notes: "Treino completo de membros inferiores.",
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-2, 7, 0)),
      },
    ],
    p_sleep_logs: [
      {
        id: deterministicUuid("runtime_sleep_log", "camila-sleep"),
        patient_id: patientCamilaId,
        legacy_sleep_log_id: "runtime-sleep-log-camila",
        sleep_date: toDateOnly(daysFromNow(-1)),
        hours_slept: 6.5,
        sleep_quality_score: 3,
        notes: "Dormiu tarde por excesso de tela.",
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-1, 6, 0)),
      },
    ],
    p_symptom_logs: [
      {
        id: deterministicUuid("runtime_symptom_log", "camila-fatigue"),
        patient_id: patientCamilaId,
        legacy_symptom_log_id: "runtime-symptom-log-camila",
        logged_at: toIso(daysFromNow(-1, 20, 0)),
        symptom_type: "fatigue",
        severity_score: 2,
        description: "Cansaco leve no fim do dia.",
        notes: "Relaciona piora a noites com menos sono.",
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-1, 20, 0)),
      },
    ],
  });

  console.log(`[runtime:seed:direct] patientLogs ${summarizeResult(patientLogsResult)}`);

  const nutritionDomainResult = await callRpc("backfill_runtime_nutrition_domain", {
    p_runtime_tenant_id: scope.tenantId,
    p_nutrition_plans: [
      {
        id: deterministicUuid("runtime_nutrition_plan", "camila-main"),
        legacy_nutrition_plan_id: "runtime-nutrition-plan-camila",
        patient_reference: "runtime-patient-camila",
        plan_name: "Plano nutricional inicial",
        plan_status: "active",
        summary: "Estrutura alimentar progressiva para recomposicao corporal com foco em adesao.",
        starts_at: toDateOnly(daysFromNow(-30)),
        ends_at: toDateOnly(daysFromNow(45)),
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-30, 9, 0)),
        updated_at: toIso(daysFromNow(-3, 9, 30)),
        deleted_at: null,
      },
    ],
    p_nutrition_plan_versions: [
      {
        id: deterministicUuid("runtime_nutrition_plan_version", "camila-v1"),
        legacy_nutrition_version_id: "runtime-nutrition-version-camila-v1",
        nutrition_plan_reference: "runtime-nutrition-plan-camila",
        version_number: 1,
        version_status: "superseded",
        title: "Versao 1 - Base de organizacao",
        summary: "Primeira versao com foco em organizacao do horario comercial.",
        guidance: "Priorizar cafe da manha completo e reduzir longos periodos em jejum.",
        meal_goal_daily: 4,
        water_goal_ml: 2000,
        effective_from: toDateOnly(daysFromNow(-30)),
        effective_to: toDateOnly(daysFromNow(-4)),
        published_at: toIso(daysFromNow(-30, 9, 30)),
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-30, 9, 15)),
        updated_at: toIso(daysFromNow(-4, 18, 0)),
      },
      {
        id: deterministicUuid("runtime_nutrition_plan_version", "camila-v2"),
        legacy_nutrition_version_id: "runtime-nutrition-version-camila-v2",
        nutrition_plan_reference: "runtime-nutrition-plan-camila",
        version_number: 2,
        version_status: "published",
        title: "Versao 2 - Adesao e saciedade",
        summary: "Versao vigente com distribuicao simples de refeicoes e hidracao guiada.",
        guidance: "Usar combinacoes de alta saciedade nos horarios mais criticos e reforcar preparacao noturna.",
        meal_goal_daily: 4,
        water_goal_ml: 2200,
        effective_from: toDateOnly(daysFromNow(-3)),
        effective_to: toDateOnly(daysFromNow(45)),
        published_at: toIso(daysFromNow(-3, 9, 30)),
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-3, 9, 20)),
        updated_at: toIso(daysFromNow(-3, 9, 30)),
      },
    ],
    p_nutrition_targets: [
      {
        id: deterministicUuid("runtime_nutrition_target", "camila-v2-meals"),
        legacy_target_id: "runtime-nutrition-target-camila-meals",
        nutrition_plan_version_reference: "runtime-nutrition-version-camila-v2",
        target_type: "meal",
        code: "daily_meals",
        label: "Manter 4 refeicoes por dia",
        goal_value: 4,
        unit: "refeicoes",
        period: "day",
        meal_type: null,
        guidance: "Evitar pular refeicoes nos dias de agenda cheia.",
        position: 1,
        active: true,
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-3, 9, 31)),
        updated_at: toIso(daysFromNow(-3, 9, 31)),
      },
      {
        id: deterministicUuid("runtime_nutrition_target", "camila-v2-protein"),
        legacy_target_id: "runtime-nutrition-target-camila-protein",
        nutrition_plan_version_reference: "runtime-nutrition-version-camila-v2",
        target_type: "macro",
        code: "protein_daily",
        label: "Meta proteica diaria",
        goal_value: 130,
        unit: "g",
        period: "day",
        meal_type: null,
        guidance: "Distribuir proteina entre as refeicoes principais para melhorar saciedade.",
        position: 2,
        active: true,
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-3, 9, 32)),
        updated_at: toIso(daysFromNow(-3, 9, 32)),
      },
      {
        id: deterministicUuid("runtime_nutrition_target", "camila-v2-hydration"),
        legacy_target_id: "runtime-nutrition-target-camila-hydration",
        nutrition_plan_version_reference: "runtime-nutrition-version-camila-v2",
        target_type: "hydration",
        code: "water_daily",
        label: "Meta de hidratacao",
        goal_value: 2200,
        unit: "ml",
        period: "day",
        meal_type: null,
        guidance: "Distribuir a agua ao longo do dia e nao concentrar apenas no treino.",
        position: 3,
        active: true,
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-3, 9, 33)),
        updated_at: toIso(daysFromNow(-3, 9, 33)),
      },
      {
        id: deterministicUuid("runtime_nutrition_target", "camila-v2-evening"),
        legacy_target_id: "runtime-nutrition-target-camila-evening",
        nutrition_plan_version_reference: "runtime-nutrition-version-camila-v2",
        target_type: "behavior",
        code: "evening_routine",
        label: "Organizar o jantar ate 20h30",
        goal_value: 5,
        unit: "dias",
        period: "week",
        meal_type: "dinner",
        guidance: "Deixar proteina e vegetais semi-prontos para reduzir decisao no fim do dia.",
        position: 4,
        active: true,
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-3, 9, 34)),
        updated_at: toIso(daysFromNow(-3, 9, 34)),
      },
    ],
  });

  console.log(`[runtime:seed:direct] nutrition ${summarizeResult(nutritionDomainResult)}`);

  const now = new Date();

  const billingSaasResult = await callRpc("backfill_runtime_platform_billing", {
    p_runtime_tenant_id: scope.tenantId,
    p_plans: [
      {
        id: deterministicUuid("runtime_tenant_plan", "runtime-homolog"),
        code: "runtime-homolog",
        name: "Runtime Homolog",
        description:
          "Plano de homologacao do runtime para validar separacao entre billing SaaS e financeiro clinico.",
        status: "active",
        billing_interval: "monthly",
        currency_code: "BRL",
        price_amount: 349,
        trial_days: 14,
        included_limits: {
          activePatients: 250,
          activeStaff: 20,
          monthlyAppointments: 1200,
        },
        features: {
          patientApp: true,
          commercialCatalog: true,
          financialSummary: true,
        },
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-30, 8, 0)),
        updated_at: toIso(now),
        deleted_at: null,
      },
    ],
    p_subscriptions: [
      {
        id: deterministicUuid("runtime_tenant_subscription", "runtime-fixture-tenant-main"),
        plan_reference: "runtime-homolog",
        status: "active",
        started_at: toIso(daysFromNow(-30, 8, 0)),
        trial_ends_at: toIso(daysFromNow(-16, 8, 0)),
        auto_renew: true,
        external_customer_id: "runtime-fixture-customer-main",
        external_subscription_id: "runtime-fixture-subscription-main",
        metadata: {
          source: "runtime_direct_seed",
          environment: "staging",
        },
        created_at: toIso(daysFromNow(-30, 8, 0)),
        updated_at: toIso(now),
        deleted_at: null,
      },
    ],
  });

  console.log(`[runtime:seed:direct] billingSaas ${summarizeResult(billingSaasResult)}`);

  const serviceInitialId = deterministicUuid("runtime_service", "initial-consultation");
  const serviceFollowUpId = deterministicUuid("runtime_service", "nutrition-follow-up");
  const serviceAssessmentId = deterministicUuid("runtime_service", "body-composition");

  const packageStarterId = deterministicUuid("runtime_package", "starter");
  const packageFollowId = deterministicUuid("runtime_package", "follow");

  const programRecompositionId = deterministicUuid("runtime_program", "body-recomposition");

  const commercialCatalogResult = await callRpc("backfill_runtime_commercial_catalog", {
    p_runtime_tenant_id: scope.tenantId,
    p_services: [
      {
        id: serviceInitialId,
        legacy_service_id: "runtime-service-initial-consultation",
        name: "Consulta inicial metabólica",
        code: "initial_metabolic_consult",
        description: "Consulta de entrada com anamnese, definicao de estrategia e plano inicial.",
        service_type: "consultation",
        duration_minutes: 60,
        list_price: 320,
        currency_code: "BRL",
        active: true,
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-20, 10, 0)),
        updated_at: toIso(now),
        deleted_at: null,
      },
      {
        id: serviceFollowUpId,
        legacy_service_id: "runtime-service-nutrition-follow-up",
        name: "Retorno nutricional",
        code: "nutrition_follow_up",
        description: "Retorno de ajuste de plano alimentar e adesao semanal.",
        service_type: "nutrition",
        duration_minutes: 30,
        list_price: 180,
        currency_code: "BRL",
        active: true,
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-20, 10, 5)),
        updated_at: toIso(now),
        deleted_at: null,
      },
      {
        id: serviceAssessmentId,
        legacy_service_id: "runtime-service-body-assessment",
        name: "Avaliacao de composicao corporal",
        code: "body_composition_assessment",
        description: "Avaliacao de medidas e bioimpedancia para acompanhamento do programa.",
        service_type: "assessment",
        duration_minutes: 25,
        list_price: 120,
        currency_code: "BRL",
        active: true,
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-20, 10, 10)),
        updated_at: toIso(now),
        deleted_at: null,
      },
    ],
    p_packages: [
      {
        id: packageStarterId,
        legacy_package_id: "runtime-package-starter-12w",
        name: "Starter 12 semanas",
        code: "starter_12w",
        description: "Pacote de entrada com consulta inicial, retornos e acompanhamento de composicao.",
        package_type: "emagrecimento",
        billing_model: "one_time",
        tier: "starter",
        price: 1290,
        currency_code: "BRL",
        featured: true,
        active: true,
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-18, 14, 0)),
        updated_at: toIso(now),
        deleted_at: null,
      },
      {
        id: packageFollowId,
        legacy_package_id: "runtime-package-follow-recurring",
        name: "Follow recorrente",
        code: "follow_recurring",
        description: "Pacote de continuidade mensal para pacientes em fase de manutencao.",
        package_type: "acompanhamento",
        billing_model: "recurring",
        tier: "continuity",
        price: 390,
        currency_code: "BRL",
        featured: false,
        active: true,
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-16, 15, 0)),
        updated_at: toIso(now),
        deleted_at: null,
      },
    ],
    p_package_services: [
      {
        id: deterministicUuid("runtime_package_service", "starter-initial"),
        legacy_package_id: "runtime-package-starter-12w",
        legacy_service_id: "runtime-service-initial-consultation",
        quantity: 1,
        required: true,
        notes: "Consulta obrigatoria de onboarding.",
        item_price_override: null,
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-18, 14, 5)),
        updated_at: toIso(now),
      },
      {
        id: deterministicUuid("runtime_package_service", "starter-follow"),
        legacy_package_id: "runtime-package-starter-12w",
        legacy_service_id: "runtime-service-nutrition-follow-up",
        quantity: 4,
        required: true,
        notes: "Ciclo inicial de retornos quinzenais.",
        item_price_override: null,
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-18, 14, 10)),
        updated_at: toIso(now),
      },
      {
        id: deterministicUuid("runtime_package_service", "starter-assessment"),
        legacy_package_id: "runtime-package-starter-12w",
        legacy_service_id: "runtime-service-body-assessment",
        quantity: 2,
        required: false,
        notes: "Avaliacao incluida para comparativo de entrada e reavaliacao.",
        item_price_override: 0,
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-18, 14, 15)),
        updated_at: toIso(now),
      },
      {
        id: deterministicUuid("runtime_package_service", "follow-follow"),
        legacy_package_id: "runtime-package-follow-recurring",
        legacy_service_id: "runtime-service-nutrition-follow-up",
        quantity: 2,
        required: true,
        notes: "Dois retornos por ciclo mensal.",
        item_price_override: null,
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-16, 15, 5)),
        updated_at: toIso(now),
      },
    ],
    p_programs: [
      {
        id: programRecompositionId,
        legacy_program_id: "runtime-program-body-recomposition",
        name: "Programa de recomposicao corporal",
        code: "body_recomposition_program",
        description: "Jornada estruturada para perda de gordura com manutencao de massa magra.",
        program_type: "clinical",
        duration_days: 84,
        featured: true,
        active: true,
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-14, 9, 0)),
        updated_at: toIso(now),
        deleted_at: null,
      },
    ],
    p_program_packages: [
      {
        id: deterministicUuid("runtime_program_package", "body-recomposition-starter"),
        legacy_program_id: "runtime-program-body-recomposition",
        legacy_package_id: "runtime-package-starter-12w",
        sort_order: 0,
        recommended: true,
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-14, 9, 5)),
        updated_at: toIso(now),
      },
      {
        id: deterministicUuid("runtime_program_package", "body-recomposition-follow"),
        legacy_program_id: "runtime-program-body-recomposition",
        legacy_package_id: "runtime-package-follow-recurring",
        sort_order: 1,
        recommended: false,
        metadata: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-14, 9, 10)),
        updated_at: toIso(now),
      },
    ],
  });

  console.log(`[runtime:seed:direct] commercialCatalog ${summarizeResult(commercialCatalogResult)}`);

  const commercialEnrollmentResult = await callRpc("backfill_runtime_commercial_patient_enrollments", {
    p_runtime_tenant_id: scope.tenantId,
    p_enrollments: [
      {
        id: deterministicUuid("runtime_enrollment", "camila-starter"),
        legacy_enrollment_id: "runtime-enrollment-camila-starter",
        legacy_patient_id: "runtime-patient-camila",
        legacy_program_id: "runtime-program-body-recomposition",
        legacy_package_id: "runtime-package-starter-12w",
        enrollment_status: "active",
        start_date: toDateOnly(daysFromNow(-21, 9, 0)),
        end_date: toDateOnly(daysFromNow(63, 9, 0)),
        enrolled_at: toIso(daysFromNow(-21, 9, 15)),
        activated_at: toIso(daysFromNow(-21, 9, 30)),
        source: "runtime_direct_seed",
        notes: "Matricula de homologacao para validar entitlements e contexto comercial no Paciente 360.",
        metadata: {
          source: "runtime_direct_seed",
          seedVersion: 1,
        },
        created_at: toIso(daysFromNow(-21, 9, 15)),
        updated_at: toIso(now),
        deleted_at: null,
      },
    ],
    p_entitlements: [
      {
        id: deterministicUuid("runtime_entitlement", "camila-starter-initial"),
        legacy_entitlement_id: "runtime-entitlement-camila-starter-initial",
        legacy_enrollment_id: "runtime-enrollment-camila-starter",
        legacy_patient_id: "runtime-patient-camila",
        legacy_package_id: "runtime-package-starter-12w",
        legacy_service_id: "runtime-service-initial-consultation",
        entitlement_type: "service",
        code: "service:initial_metabolic_consult",
        title: "Consulta inicial metabólica",
        balance_total: 1,
        balance_used: 1,
        active: true,
        starts_at: toIso(daysFromNow(-21, 9, 30)),
        ends_at: toIso(daysFromNow(63, 9, 0)),
        metadata: {
          source: "runtime_direct_seed",
          required: true,
        },
        created_at: toIso(daysFromNow(-21, 9, 30)),
        updated_at: toIso(now),
      },
      {
        id: deterministicUuid("runtime_entitlement", "camila-starter-follow"),
        legacy_entitlement_id: "runtime-entitlement-camila-starter-follow",
        legacy_enrollment_id: "runtime-enrollment-camila-starter",
        legacy_patient_id: "runtime-patient-camila",
        legacy_package_id: "runtime-package-starter-12w",
        legacy_service_id: "runtime-service-nutrition-follow-up",
        entitlement_type: "service",
        code: "service:nutrition_follow_up",
        title: "Retorno nutricional",
        balance_total: 4,
        balance_used: 2,
        active: true,
        starts_at: toIso(daysFromNow(-20, 10, 0)),
        ends_at: toIso(daysFromNow(63, 9, 0)),
        metadata: {
          source: "runtime_direct_seed",
          required: true,
        },
        created_at: toIso(daysFromNow(-20, 10, 0)),
        updated_at: toIso(now),
      },
      {
        id: deterministicUuid("runtime_entitlement", "camila-starter-assessment"),
        legacy_entitlement_id: "runtime-entitlement-camila-starter-assessment",
        legacy_enrollment_id: "runtime-enrollment-camila-starter",
        legacy_patient_id: "runtime-patient-camila",
        legacy_package_id: "runtime-package-starter-12w",
        legacy_service_id: "runtime-service-body-assessment",
        entitlement_type: "service",
        code: "service:body_composition_assessment",
        title: "Avaliacao de composicao corporal",
        balance_total: 2,
        balance_used: 1,
        active: true,
        starts_at: toIso(daysFromNow(-20, 10, 15)),
        ends_at: toIso(daysFromNow(63, 9, 0)),
        metadata: {
          source: "runtime_direct_seed",
          required: false,
        },
        created_at: toIso(daysFromNow(-20, 10, 15)),
        updated_at: toIso(now),
      },
    ],
  });

  console.log(
    `[runtime:seed:direct] commercialEnrollments ${summarizeResult(commercialEnrollmentResult)}`
  );

  const financialDomainResult = await callRpc("backfill_runtime_financial_domain", {
    p_runtime_tenant_id: scope.tenantId,
    p_financial_items: [
      {
        id: deterministicUuid("runtime_financial_item", "camila-enrollment-paid"),
        legacy_financial_item_id: "runtime-financial-item-camila-enrollment-paid",
        patient_reference: "runtime-patient-camila",
        enrollment_reference: "runtime-enrollment-camila-starter",
        package_reference: "runtime-package-starter-12w",
        reference_code: "FIN-RUNTIME-001",
        item_type: "enrollment",
        status: "paid",
        reconciliation_status: "reconciled",
        billing_model: "one_time",
        currency_code: "BRL",
        amount_total: 890,
        amount_paid: 890,
        due_date: toDateOnly(daysFromNow(-20, 9, 0)),
        paid_at: toIso(daysFromNow(-19, 11, 0)),
        last_reconciled_at: toIso(daysFromNow(-19, 11, 0)),
        description: "Pacote starter 12 semanas liquidado na ativacao inicial.",
        metadata: {
          source: "runtime_direct_seed",
          category: "starter_package",
        },
        created_at: toIso(daysFromNow(-21, 9, 20)),
        updated_at: toIso(now),
        deleted_at: null,
      },
      {
        id: deterministicUuid("runtime_financial_item", "camila-follow-up-pending"),
        legacy_financial_item_id: "runtime-financial-item-camila-follow-up-pending",
        patient_reference: "runtime-patient-camila",
        enrollment_reference: "runtime-enrollment-camila-starter",
        package_reference: "runtime-package-follow-recurring",
        reference_code: "FIN-RUNTIME-002",
        item_type: "service",
        status: "pending",
        reconciliation_status: "unreconciled",
        billing_model: "recurring",
        currency_code: "BRL",
        amount_total: 240,
        amount_paid: 0,
        due_date: toDateOnly(daysFromNow(5, 9, 0)),
        paid_at: null,
        last_reconciled_at: null,
        description: "Cobranca futura do bloco de retornos nutricionais.",
        metadata: {
          source: "runtime_direct_seed",
          category: "follow_up_block",
        },
        created_at: toIso(daysFromNow(-2, 10, 15)),
        updated_at: toIso(now),
        deleted_at: null,
      },
      {
        id: deterministicUuid("runtime_financial_item", "camila-overdue-assessment"),
        legacy_financial_item_id: "runtime-financial-item-camila-overdue-assessment",
        patient_reference: "runtime-patient-camila",
        enrollment_reference: "runtime-enrollment-camila-starter",
        package_reference: "runtime-package-starter-12w",
        reference_code: "FIN-RUNTIME-003",
        item_type: "service",
        status: "overdue",
        reconciliation_status: "unreconciled",
        billing_model: "one_time",
        currency_code: "BRL",
        amount_total: 180,
        amount_paid: 0,
        due_date: toDateOnly(daysFromNow(-4, 9, 0)),
        paid_at: null,
        last_reconciled_at: null,
        description: "Avaliacao complementar ainda pendente de quitacao.",
        metadata: {
          source: "runtime_direct_seed",
          category: "assessment_add_on",
        },
        created_at: toIso(daysFromNow(-7, 9, 45)),
        updated_at: toIso(now),
        deleted_at: null,
      },
    ],
    p_financial_item_events: [
      {
        id: deterministicUuid("runtime_financial_event", "camila-enrollment-created"),
        legacy_financial_event_id: "runtime-financial-event-camila-enrollment-created",
        financial_item_reference: "runtime-financial-item-camila-enrollment-paid",
        patient_reference: "runtime-patient-camila",
        event_type: "created",
        previous_status: null,
        current_status: "paid",
        reconciliation_status: "reconciled",
        amount: 890,
        event_at: toIso(daysFromNow(-21, 9, 20)),
        actor_type: "system",
        actor_profile_id: null,
        notes: "Titulo financeiro inicial criado pelo seed direto.",
        payload: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-21, 9, 20)),
      },
      {
        id: deterministicUuid("runtime_financial_event", "camila-enrollment-reconciled"),
        legacy_financial_event_id: "runtime-financial-event-camila-enrollment-reconciled",
        financial_item_reference: "runtime-financial-item-camila-enrollment-paid",
        patient_reference: "runtime-patient-camila",
        event_type: "reconciled",
        previous_status: "pending",
        current_status: "paid",
        reconciliation_status: "reconciled",
        amount: 890,
        event_at: toIso(daysFromNow(-19, 11, 0)),
        actor_type: "system",
        actor_profile_id: null,
        notes: "Liquidacao inicial refletida no runtime.",
        payload: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-19, 11, 0)),
      },
      {
        id: deterministicUuid("runtime_financial_event", "camila-follow-up-created"),
        legacy_financial_event_id: "runtime-financial-event-camila-follow-up-created",
        financial_item_reference: "runtime-financial-item-camila-follow-up-pending",
        patient_reference: "runtime-patient-camila",
        event_type: "created",
        previous_status: null,
        current_status: "pending",
        reconciliation_status: "unreconciled",
        amount: 240,
        event_at: toIso(daysFromNow(-2, 10, 15)),
        actor_type: "system",
        actor_profile_id: null,
        notes: "Titulo futuro de retornos criado no seed direto.",
        payload: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-2, 10, 15)),
      },
      {
        id: deterministicUuid("runtime_financial_event", "camila-overdue-created"),
        legacy_financial_event_id: "runtime-financial-event-camila-overdue-created",
        financial_item_reference: "runtime-financial-item-camila-overdue-assessment",
        patient_reference: "runtime-patient-camila",
        event_type: "created",
        previous_status: null,
        current_status: "overdue",
        reconciliation_status: "unreconciled",
        amount: 180,
        event_at: toIso(daysFromNow(-7, 9, 45)),
        actor_type: "system",
        actor_profile_id: null,
        notes: "Avaliacao avulsa criada no seed direto.",
        payload: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-7, 9, 45)),
      },
      {
        id: deterministicUuid("runtime_financial_event", "camila-overdue-status"),
        legacy_financial_event_id: "runtime-financial-event-camila-overdue-status",
        financial_item_reference: "runtime-financial-item-camila-overdue-assessment",
        patient_reference: "runtime-patient-camila",
        event_type: "status_changed",
        previous_status: "pending",
        current_status: "overdue",
        reconciliation_status: "unreconciled",
        amount: null,
        event_at: toIso(daysFromNow(-4, 9, 5)),
        actor_type: "system",
        actor_profile_id: null,
        notes: "Titulo ultrapassou a data de vencimento no seed direto.",
        payload: {
          source: "runtime_direct_seed",
        },
        created_at: toIso(daysFromNow(-4, 9, 5)),
      },
    ],
  });

  console.log(`[runtime:seed:direct] financial ${summarizeResult(financialDomainResult)}`);
}

main().catch((error) => {
  console.error("[runtime:seed:direct] erro:", error instanceof Error ? error.message : error);
  process.exit(1);
});
