create or replace function public.backfill_runtime_scope(
  p_legacy_tenant_id text,
  p_legacy_tenant_legal_name text,
  p_legacy_tenant_trade_name text default null,
  p_legacy_tenant_status text default 'ACTIVE',
  p_subscription_plan_code text default null,
  p_units jsonb default '[]'::jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.backfill_runtime_scope(
    p_legacy_tenant_id,
    p_legacy_tenant_legal_name,
    p_legacy_tenant_trade_name,
    p_legacy_tenant_status,
    p_subscription_plan_code,
    p_units
  )
$$;

create or replace function public.backfill_runtime_reference_data(
  p_runtime_tenant_id uuid,
  p_tags jsonb default '[]'::jsonb,
  p_professionals jsonb default '[]'::jsonb,
  p_appointment_types jsonb default '[]'::jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.backfill_runtime_reference_data(
    p_runtime_tenant_id,
    p_tags,
    p_professionals,
    p_appointment_types
  )
$$;

create or replace function public.backfill_runtime_patient_domain(
  p_runtime_tenant_id uuid,
  p_patients jsonb default '[]'::jsonb,
  p_patient_profiles jsonb default '[]'::jsonb,
  p_patient_tags jsonb default '[]'::jsonb,
  p_patient_flags jsonb default '[]'::jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.backfill_runtime_patient_domain(
    p_runtime_tenant_id,
    p_patients,
    p_patient_profiles,
    p_patient_tags,
    p_patient_flags
  )
$$;

create or replace function public.backfill_runtime_scheduling_domain(
  p_runtime_tenant_id uuid,
  p_appointments jsonb default '[]'::jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.backfill_runtime_scheduling_domain(
    p_runtime_tenant_id,
    p_appointments
  )
$$;

create or replace function public.backfill_runtime_clinical_domain(
  p_runtime_tenant_id uuid,
  p_encounters jsonb default '[]'::jsonb,
  p_anamneses jsonb default '[]'::jsonb,
  p_consultation_notes jsonb default '[]'::jsonb,
  p_care_plans jsonb default '[]'::jsonb,
  p_care_plan_items jsonb default '[]'::jsonb,
  p_clinical_tasks jsonb default '[]'::jsonb,
  p_adverse_events jsonb default '[]'::jsonb,
  p_patient_goals jsonb default '[]'::jsonb,
  p_prescription_records jsonb default '[]'::jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.backfill_runtime_clinical_domain(
    p_runtime_tenant_id,
    p_encounters,
    p_anamneses,
    p_consultation_notes,
    p_care_plans,
    p_care_plan_items,
    p_clinical_tasks,
    p_adverse_events,
    p_patient_goals,
    p_prescription_records
  )
$$;

create or replace function public.backfill_runtime_patient_logs(
  p_runtime_tenant_id uuid,
  p_habit_logs jsonb default '[]'::jsonb,
  p_hydration_logs jsonb default '[]'::jsonb,
  p_meal_logs jsonb default '[]'::jsonb,
  p_workout_logs jsonb default '[]'::jsonb,
  p_sleep_logs jsonb default '[]'::jsonb,
  p_symptom_logs jsonb default '[]'::jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.backfill_runtime_patient_logs(
    p_runtime_tenant_id,
    p_habit_logs,
    p_hydration_logs,
    p_meal_logs,
    p_workout_logs,
    p_sleep_logs,
    p_symptom_logs
  )
$$;
