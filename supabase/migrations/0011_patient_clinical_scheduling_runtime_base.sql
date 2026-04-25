create or replace function private.can_read_patients_domain(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_tenant_id is not null
    and target_tenant_id = private.current_tenant_id()
    and (
      private.is_platform_admin()
      or private.has_permission('patients.read')
      or private.has_permission('patients.write')
      or private.has_permission('patients.read.all')
      or private.has_permission('clinical.read')
      or private.has_permission('clinical.write')
      or private.has_permission('clinical.read.all')
    )
$$;

create or replace function private.can_manage_patients_domain(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_tenant_id is not null
    and target_tenant_id = private.current_tenant_id()
    and (
      private.is_platform_admin()
      or private.has_permission('patients.write')
    )
$$;

create or replace function private.can_read_schedule_domain(
  target_tenant_id uuid,
  target_unit_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_tenant_id is not null
    and target_tenant_id = private.current_tenant_id()
    and (
      private.is_platform_admin()
      or private.has_permission('schedule.read')
      or private.has_permission('schedule.write')
      or private.has_permission('clinical.read')
      or private.has_permission('clinical.write')
      or private.has_permission('clinical.read.all')
    )
    and (
      target_unit_id is null
      or target_unit_id = any (coalesce(private.current_unit_ids(), '{}'::uuid[]))
      or private.is_platform_admin()
      or private.has_permission('clinical.read.all')
    )
$$;

create or replace function private.can_manage_schedule_domain(
  target_tenant_id uuid,
  target_unit_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_tenant_id is not null
    and target_tenant_id = private.current_tenant_id()
    and (
      private.is_platform_admin()
      or private.has_permission('schedule.write')
    )
    and (
      target_unit_id is null
      or target_unit_id = any (coalesce(private.current_unit_ids(), '{}'::uuid[]))
      or private.is_platform_admin()
    )
$$;

create or replace function private.can_read_clinical_domain(
  target_tenant_id uuid,
  target_unit_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_tenant_id is not null
    and target_tenant_id = private.current_tenant_id()
    and (
      private.is_platform_admin()
      or private.has_permission('clinical.read')
      or private.has_permission('clinical.write')
      or private.has_permission('clinical.read.all')
    )
    and (
      target_unit_id is null
      or target_unit_id = any (coalesce(private.current_unit_ids(), '{}'::uuid[]))
      or private.is_platform_admin()
      or private.has_permission('clinical.read.all')
    )
$$;

create or replace function private.can_manage_clinical_domain(
  target_tenant_id uuid,
  target_unit_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_tenant_id is not null
    and target_tenant_id = private.current_tenant_id()
    and (
      private.is_platform_admin()
      or private.has_permission('clinical.write')
    )
    and (
      target_unit_id is null
      or target_unit_id = any (coalesce(private.current_unit_ids(), '{}'::uuid[]))
      or private.is_platform_admin()
    )
$$;

revoke all on function private.can_read_patients_domain(uuid) from public, anon;
revoke all on function private.can_manage_patients_domain(uuid) from public, anon;
revoke all on function private.can_read_schedule_domain(uuid, uuid) from public, anon;
revoke all on function private.can_manage_schedule_domain(uuid, uuid) from public, anon;
revoke all on function private.can_read_clinical_domain(uuid, uuid) from public, anon;
revoke all on function private.can_manage_clinical_domain(uuid, uuid) from public, anon;

grant execute on function private.can_read_patients_domain(uuid) to authenticated, service_role;
grant execute on function private.can_manage_patients_domain(uuid) to authenticated, service_role;
grant execute on function private.can_read_schedule_domain(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_manage_schedule_domain(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_read_clinical_domain(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_manage_clinical_domain(uuid, uuid) to authenticated, service_role;

create table if not exists patients.patients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  legacy_patient_id text,
  external_code text,
  full_name text not null,
  cpf text,
  birth_date date,
  sex text,
  gender text,
  marital_status text,
  primary_phone text,
  primary_email citext,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  source text not null default 'runtime' check (source in ('runtime', 'legacy_backfill', 'hybrid')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists patients.patient_profiles (
  patient_id uuid primary key references patients.patients (id) on delete cascade,
  occupation text,
  referral_source text,
  lifestyle_summary text,
  goals_summary text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists patients.tags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  legacy_tag_id text,
  name text not null,
  code text not null,
  color text,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tags_tenant_id_code_key unique (tenant_id, code)
);

create table if not exists patients.patient_tags (
  patient_id uuid not null references patients.patients (id) on delete cascade,
  tag_id uuid not null references patients.tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  primary key (patient_id, tag_id)
);

create table if not exists patients.patient_flags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  patient_id uuid not null references patients.patients (id) on delete cascade,
  legacy_flag_id text,
  flag_type text not null,
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  description text,
  active boolean not null default true,
  created_by_profile_id uuid references identity.profiles (id) on delete set null,
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists scheduling.professionals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  profile_id uuid references identity.profiles (id) on delete set null,
  legacy_professional_id text,
  professional_type text not null check (
    professional_type in (
      'physician',
      'nutritionist',
      'nurse',
      'physical_trainer',
      'receptionist',
      'financial',
      'administrative',
      'other'
    )
  ),
  license_number text,
  display_name text not null,
  color_hex text,
  is_schedulable boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists scheduling.appointment_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  legacy_appointment_type_id text,
  name text not null,
  code text not null,
  default_duration_minutes integer not null check (default_duration_minutes > 0),
  requires_professional boolean not null default true,
  requires_resource boolean not null default false,
  generates_encounter boolean not null default true,
  allows_telehealth boolean not null default false,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointment_types_tenant_id_code_key unique (tenant_id, code)
);

create table if not exists scheduling.appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  unit_id uuid not null references platform.units (id) on delete restrict,
  patient_id uuid not null references patients.patients (id) on delete restrict,
  professional_id uuid references scheduling.professionals (id) on delete set null,
  appointment_type_id uuid not null references scheduling.appointment_types (id) on delete restrict,
  legacy_appointment_id text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (
    status in ('scheduled', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show')
  ),
  source text not null default 'internal' check (
    source in ('internal', 'patient_app', 'crm', 'automation', 'other')
  ),
  notes text,
  created_by_profile_id uuid references identity.profiles (id) on delete set null,
  confirmed_at timestamptz,
  checked_in_at timestamptz,
  canceled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint appointments_ends_after_start check (ends_at > starts_at)
);

create table if not exists clinical.encounters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  unit_id uuid not null references platform.units (id) on delete restrict,
  patient_id uuid not null references patients.patients (id) on delete restrict,
  appointment_id uuid unique references scheduling.appointments (id) on delete set null,
  professional_id uuid references scheduling.professionals (id) on delete set null,
  legacy_encounter_id text,
  encounter_type text not null check (
    encounter_type in ('initial_consult', 'follow_up', 'procedure', 'teleconsult', 'review', 'other')
  ),
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  summary text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clinical.anamneses (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null unique references clinical.encounters (id) on delete cascade,
  chief_complaint text,
  history_of_present_illness text,
  past_medical_history text,
  past_surgical_history text,
  family_history text,
  medication_history text,
  allergy_history text,
  lifestyle_history text,
  gynecological_history text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clinical.consultation_notes (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references clinical.encounters (id) on delete cascade,
  note_type text,
  subjective text,
  objective text,
  assessment text,
  plan text,
  signed_by_profile_id uuid references identity.profiles (id) on delete set null,
  signed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clinical.care_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  patient_id uuid not null references patients.patients (id) on delete restrict,
  legacy_care_plan_id text,
  current_status text,
  summary text,
  start_date date,
  end_date date,
  created_by_profile_id uuid references identity.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists clinical.care_plan_items (
  id uuid primary key default gen_random_uuid(),
  care_plan_id uuid not null references clinical.care_plans (id) on delete cascade,
  item_type text not null,
  title text not null,
  description text,
  status text,
  target_date date,
  completed_at timestamptz,
  position integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clinical.clinical_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  patient_id uuid not null references patients.patients (id) on delete restrict,
  encounter_id uuid references clinical.encounters (id) on delete set null,
  assigned_to_profile_id uuid references identity.profiles (id) on delete set null,
  legacy_task_id text,
  task_type text not null,
  title text not null,
  description text,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'done', 'cancelled')),
  due_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists clinical.adverse_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  patient_id uuid not null references patients.patients (id) on delete restrict,
  encounter_id uuid references clinical.encounters (id) on delete set null,
  legacy_adverse_event_id text,
  severity text not null check (severity in ('mild', 'moderate', 'severe', 'critical')),
  event_type text not null,
  description text not null,
  onset_at timestamptz,
  resolved_at timestamptz,
  status text not null default 'active' check (status in ('active', 'resolved', 'monitoring', 'closed')),
  recorded_by_profile_id uuid references identity.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clinical.patient_goals (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients.patients (id) on delete cascade,
  legacy_goal_id text,
  goal_type text not null,
  title text not null,
  target_value text,
  current_value text,
  target_date date,
  status text,
  created_by_profile_id uuid references identity.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clinical.prescription_records (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references clinical.encounters (id) on delete cascade,
  patient_id uuid not null references patients.patients (id) on delete restrict,
  legacy_prescription_id text,
  prescription_type text not null check (
    prescription_type in ('prescription', 'orientation', 'supplement_plan', 'training_guidance', 'other')
  ),
  summary text,
  issued_by_profile_id uuid references identity.profiles (id) on delete set null,
  issued_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists clinical.habit_logs (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients.patients (id) on delete cascade,
  legacy_habit_log_id text,
  logged_at timestamptz not null default now(),
  kind text not null,
  value_text text,
  value_num numeric(10, 2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists clinical.hydration_logs (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients.patients (id) on delete cascade,
  legacy_hydration_log_id text,
  logged_at timestamptz not null default now(),
  volume_ml integer not null check (volume_ml > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists clinical.meal_logs (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients.patients (id) on delete cascade,
  legacy_meal_log_id text,
  logged_at timestamptz not null default now(),
  meal_type text,
  description text,
  photo_path text,
  adherence_rating integer check (adherence_rating between 1 and 5),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists clinical.workout_logs (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients.patients (id) on delete cascade,
  legacy_workout_log_id text,
  logged_at timestamptz not null default now(),
  workout_type text,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  intensity text,
  completed boolean not null default true,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists clinical.sleep_logs (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients.patients (id) on delete cascade,
  legacy_sleep_log_id text,
  sleep_date date not null,
  hours_slept numeric(4, 2),
  sleep_quality_score integer check (sleep_quality_score between 1 and 10),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists clinical.symptom_logs (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients.patients (id) on delete cascade,
  legacy_symptom_log_id text,
  logged_at timestamptz not null default now(),
  symptom_type text not null,
  severity_score integer check (severity_score between 0 and 10),
  description text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_patients_legacy_patient_id
  on patients.patients (legacy_patient_id)
  where legacy_patient_id is not null;

create unique index if not exists idx_patients_tenant_cpf_active
  on patients.patients (tenant_id, cpf)
  where cpf is not null
    and deleted_at is null;

create index if not exists idx_patients_tenant_status_deleted_at
  on patients.patients (tenant_id, status, deleted_at);

create index if not exists idx_patients_tenant_full_name
  on patients.patients (tenant_id, full_name);

create index if not exists idx_patient_profiles_referral_source
  on patients.patient_profiles (referral_source);

create unique index if not exists idx_tags_legacy_tag_id
  on patients.tags (legacy_tag_id)
  where legacy_tag_id is not null;

create index if not exists idx_tags_tenant_status
  on patients.tags (tenant_id, status);

create index if not exists idx_patient_tags_tag_id
  on patients.patient_tags (tag_id);

create unique index if not exists idx_patient_flags_legacy_flag_id
  on patients.patient_flags (legacy_flag_id)
  where legacy_flag_id is not null;

create index if not exists idx_patient_flags_tenant_patient_active
  on patients.patient_flags (tenant_id, patient_id, active, created_at desc);

create unique index if not exists idx_professionals_tenant_profile_active
  on scheduling.professionals (tenant_id, profile_id)
  where profile_id is not null
    and deleted_at is null;

create unique index if not exists idx_professionals_legacy_professional_id
  on scheduling.professionals (legacy_professional_id)
  where legacy_professional_id is not null;

create index if not exists idx_professionals_tenant_type_deleted_at
  on scheduling.professionals (tenant_id, professional_type, deleted_at);

create unique index if not exists idx_appointment_types_legacy_id
  on scheduling.appointment_types (legacy_appointment_type_id)
  where legacy_appointment_type_id is not null;

create index if not exists idx_appointment_types_tenant_active
  on scheduling.appointment_types (tenant_id, active);

create unique index if not exists idx_appointments_legacy_id
  on scheduling.appointments (legacy_appointment_id)
  where legacy_appointment_id is not null;

create index if not exists idx_appointments_tenant_unit_starts_at
  on scheduling.appointments (tenant_id, unit_id, starts_at desc)
  where deleted_at is null;

create index if not exists idx_appointments_patient_starts_at
  on scheduling.appointments (patient_id, starts_at desc)
  where deleted_at is null;

create index if not exists idx_appointments_professional_starts_at
  on scheduling.appointments (professional_id, starts_at desc)
  where professional_id is not null
    and deleted_at is null;

create index if not exists idx_appointments_status_starts_at
  on scheduling.appointments (status, starts_at desc)
  where deleted_at is null;

create unique index if not exists idx_encounters_legacy_id
  on clinical.encounters (legacy_encounter_id)
  where legacy_encounter_id is not null;

create index if not exists idx_encounters_tenant_unit_opened_at
  on clinical.encounters (tenant_id, unit_id, opened_at desc);

create index if not exists idx_encounters_patient_opened_at
  on clinical.encounters (patient_id, opened_at desc);

create index if not exists idx_encounters_professional_opened_at
  on clinical.encounters (professional_id, opened_at desc)
  where professional_id is not null;

create index if not exists idx_encounters_status_opened_at
  on clinical.encounters (status, opened_at desc);

create index if not exists idx_consultation_notes_encounter_created_at
  on clinical.consultation_notes (encounter_id, created_at desc);

create unique index if not exists idx_care_plans_legacy_id
  on clinical.care_plans (legacy_care_plan_id)
  where legacy_care_plan_id is not null;

create index if not exists idx_care_plans_tenant_patient_deleted_at
  on clinical.care_plans (tenant_id, patient_id, deleted_at);

create index if not exists idx_care_plan_items_care_plan_status
  on clinical.care_plan_items (care_plan_id, status, position);

create unique index if not exists idx_clinical_tasks_legacy_id
  on clinical.clinical_tasks (legacy_task_id)
  where legacy_task_id is not null;

create index if not exists idx_clinical_tasks_tenant_status_due_at
  on clinical.clinical_tasks (tenant_id, status, due_at)
  where deleted_at is null;

create index if not exists idx_clinical_tasks_patient_status
  on clinical.clinical_tasks (patient_id, status)
  where deleted_at is null;

create index if not exists idx_clinical_tasks_assigned_status
  on clinical.clinical_tasks (assigned_to_profile_id, status)
  where assigned_to_profile_id is not null
    and deleted_at is null;

create unique index if not exists idx_adverse_events_legacy_id
  on clinical.adverse_events (legacy_adverse_event_id)
  where legacy_adverse_event_id is not null;

create index if not exists idx_adverse_events_tenant_created_at
  on clinical.adverse_events (tenant_id, created_at desc);

create index if not exists idx_adverse_events_patient_status
  on clinical.adverse_events (patient_id, status);

create unique index if not exists idx_patient_goals_legacy_id
  on clinical.patient_goals (legacy_goal_id)
  where legacy_goal_id is not null;

create index if not exists idx_patient_goals_patient_status_target_date
  on clinical.patient_goals (patient_id, status, target_date);

create unique index if not exists idx_prescription_records_legacy_id
  on clinical.prescription_records (legacy_prescription_id)
  where legacy_prescription_id is not null;

create index if not exists idx_prescription_records_encounter_issued_at
  on clinical.prescription_records (encounter_id, issued_at desc);

create index if not exists idx_prescription_records_patient_issued_at
  on clinical.prescription_records (patient_id, issued_at desc);

create unique index if not exists idx_habit_logs_legacy_id
  on clinical.habit_logs (legacy_habit_log_id)
  where legacy_habit_log_id is not null;

create index if not exists idx_habit_logs_patient_logged_at
  on clinical.habit_logs (patient_id, logged_at desc);

create unique index if not exists idx_hydration_logs_legacy_id
  on clinical.hydration_logs (legacy_hydration_log_id)
  where legacy_hydration_log_id is not null;

create index if not exists idx_hydration_logs_patient_logged_at
  on clinical.hydration_logs (patient_id, logged_at desc);

create unique index if not exists idx_meal_logs_legacy_id
  on clinical.meal_logs (legacy_meal_log_id)
  where legacy_meal_log_id is not null;

create index if not exists idx_meal_logs_patient_logged_at
  on clinical.meal_logs (patient_id, logged_at desc);

create unique index if not exists idx_workout_logs_legacy_id
  on clinical.workout_logs (legacy_workout_log_id)
  where legacy_workout_log_id is not null;

create index if not exists idx_workout_logs_patient_logged_at
  on clinical.workout_logs (patient_id, logged_at desc);

create unique index if not exists idx_sleep_logs_legacy_id
  on clinical.sleep_logs (legacy_sleep_log_id)
  where legacy_sleep_log_id is not null;

create index if not exists idx_sleep_logs_patient_sleep_date
  on clinical.sleep_logs (patient_id, sleep_date desc);

create unique index if not exists idx_symptom_logs_legacy_id
  on clinical.symptom_logs (legacy_symptom_log_id)
  where legacy_symptom_log_id is not null;

create index if not exists idx_symptom_logs_patient_logged_at
  on clinical.symptom_logs (patient_id, logged_at desc);

drop trigger if exists set_patients_patients_updated_at on patients.patients;
create trigger set_patients_patients_updated_at
before update on patients.patients
for each row
execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_patients_patient_profiles_updated_at on patients.patient_profiles;
create trigger set_patients_patient_profiles_updated_at
before update on patients.patient_profiles
for each row
execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_patients_tags_updated_at on patients.tags;
create trigger set_patients_tags_updated_at
before update on patients.tags
for each row
execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_patients_patient_flags_updated_at on patients.patient_flags;
create trigger set_patients_patient_flags_updated_at
before update on patients.patient_flags
for each row
execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_scheduling_professionals_updated_at on scheduling.professionals;
create trigger set_scheduling_professionals_updated_at
before update on scheduling.professionals
for each row
execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_scheduling_appointment_types_updated_at on scheduling.appointment_types;
create trigger set_scheduling_appointment_types_updated_at
before update on scheduling.appointment_types
for each row
execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_scheduling_appointments_updated_at on scheduling.appointments;
create trigger set_scheduling_appointments_updated_at
before update on scheduling.appointments
for each row
execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_clinical_encounters_updated_at on clinical.encounters;
create trigger set_clinical_encounters_updated_at
before update on clinical.encounters
for each row
execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_clinical_anamneses_updated_at on clinical.anamneses;
create trigger set_clinical_anamneses_updated_at
before update on clinical.anamneses
for each row
execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_clinical_consultation_notes_updated_at on clinical.consultation_notes;
create trigger set_clinical_consultation_notes_updated_at
before update on clinical.consultation_notes
for each row
execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_clinical_care_plans_updated_at on clinical.care_plans;
create trigger set_clinical_care_plans_updated_at
before update on clinical.care_plans
for each row
execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_clinical_care_plan_items_updated_at on clinical.care_plan_items;
create trigger set_clinical_care_plan_items_updated_at
before update on clinical.care_plan_items
for each row
execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_clinical_tasks_updated_at on clinical.clinical_tasks;
create trigger set_clinical_tasks_updated_at
before update on clinical.clinical_tasks
for each row
execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_clinical_adverse_events_updated_at on clinical.adverse_events;
create trigger set_clinical_adverse_events_updated_at
before update on clinical.adverse_events
for each row
execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_clinical_patient_goals_updated_at on clinical.patient_goals;
create trigger set_clinical_patient_goals_updated_at
before update on clinical.patient_goals
for each row
execute function private.set_current_timestamp_updated_at();

grant usage on schema patients to service_role;
grant usage on schema scheduling to service_role;
grant usage on schema clinical to service_role;

grant all on table
  patients.patients,
  patients.patient_profiles,
  patients.tags,
  patients.patient_tags,
  patients.patient_flags,
  scheduling.professionals,
  scheduling.appointment_types,
  scheduling.appointments,
  clinical.encounters,
  clinical.anamneses,
  clinical.consultation_notes,
  clinical.care_plans,
  clinical.care_plan_items,
  clinical.clinical_tasks,
  clinical.adverse_events,
  clinical.patient_goals,
  clinical.prescription_records,
  clinical.habit_logs,
  clinical.hydration_logs,
  clinical.meal_logs,
  clinical.workout_logs,
  clinical.sleep_logs,
  clinical.symptom_logs
to service_role;

alter table patients.patients enable row level security;
alter table patients.patient_profiles enable row level security;
alter table patients.tags enable row level security;
alter table patients.patient_tags enable row level security;
alter table patients.patient_flags enable row level security;
alter table scheduling.professionals enable row level security;
alter table scheduling.appointment_types enable row level security;
alter table scheduling.appointments enable row level security;
alter table clinical.encounters enable row level security;
alter table clinical.anamneses enable row level security;
alter table clinical.consultation_notes enable row level security;
alter table clinical.care_plans enable row level security;
alter table clinical.care_plan_items enable row level security;
alter table clinical.clinical_tasks enable row level security;
alter table clinical.adverse_events enable row level security;
alter table clinical.patient_goals enable row level security;
alter table clinical.prescription_records enable row level security;
alter table clinical.habit_logs enable row level security;
alter table clinical.hydration_logs enable row level security;
alter table clinical.meal_logs enable row level security;
alter table clinical.workout_logs enable row level security;
alter table clinical.sleep_logs enable row level security;
alter table clinical.symptom_logs enable row level security;

drop policy if exists patients_select_current_scope on patients.patients;
create policy patients_select_current_scope
on patients.patients
for select
to authenticated
using (
  deleted_at is null
  and private.can_read_patients_domain(tenant_id)
);

drop policy if exists patients_manage_current_scope on patients.patients;
create policy patients_manage_current_scope
on patients.patients
for all
to authenticated
using (
  deleted_at is null
  and private.can_manage_patients_domain(tenant_id)
)
with check (
  private.can_manage_patients_domain(tenant_id)
);

drop policy if exists patient_profiles_select_current_scope on patients.patient_profiles;
create policy patient_profiles_select_current_scope
on patients.patient_profiles
for select
to authenticated
using (
  exists (
    select 1
    from patients.patients
    where patients.id = patient_profiles.patient_id
      and patients.deleted_at is null
      and private.can_read_patients_domain(patients.tenant_id)
  )
);

drop policy if exists patient_profiles_manage_current_scope on patients.patient_profiles;
create policy patient_profiles_manage_current_scope
on patients.patient_profiles
for all
to authenticated
using (
  exists (
    select 1
    from patients.patients
    where patients.id = patient_profiles.patient_id
      and patients.deleted_at is null
      and private.can_manage_patients_domain(patients.tenant_id)
  )
)
with check (
  exists (
    select 1
    from patients.patients
    where patients.id = patient_profiles.patient_id
      and patients.deleted_at is null
      and private.can_manage_patients_domain(patients.tenant_id)
  )
);

drop policy if exists tags_select_current_scope on patients.tags;
create policy tags_select_current_scope
on patients.tags
for select
to authenticated
using (
  private.can_read_patients_domain(tenant_id)
);

drop policy if exists tags_manage_current_scope on patients.tags;
create policy tags_manage_current_scope
on patients.tags
for all
to authenticated
using (
  private.can_manage_patients_domain(tenant_id)
)
with check (
  private.can_manage_patients_domain(tenant_id)
);

drop policy if exists patient_tags_select_current_scope on patients.patient_tags;
create policy patient_tags_select_current_scope
on patients.patient_tags
for select
to authenticated
using (
  exists (
    select 1
    from patients.patients
    where patients.id = patient_tags.patient_id
      and patients.deleted_at is null
      and private.can_read_patients_domain(patients.tenant_id)
  )
);

drop policy if exists patient_tags_manage_current_scope on patients.patient_tags;
create policy patient_tags_manage_current_scope
on patients.patient_tags
for all
to authenticated
using (
  exists (
    select 1
    from patients.patients
    where patients.id = patient_tags.patient_id
      and patients.deleted_at is null
      and private.can_manage_patients_domain(patients.tenant_id)
  )
)
with check (
  exists (
    select 1
    from patients.patients
    where patients.id = patient_tags.patient_id
      and patients.deleted_at is null
      and private.can_manage_patients_domain(patients.tenant_id)
  )
);

drop policy if exists patient_flags_select_current_scope on patients.patient_flags;
create policy patient_flags_select_current_scope
on patients.patient_flags
for select
to authenticated
using (
  private.can_read_patients_domain(tenant_id)
);

drop policy if exists patient_flags_manage_current_scope on patients.patient_flags;
create policy patient_flags_manage_current_scope
on patients.patient_flags
for all
to authenticated
using (
  private.can_manage_patients_domain(tenant_id)
)
with check (
  private.can_manage_patients_domain(tenant_id)
);

drop policy if exists professionals_select_current_scope on scheduling.professionals;
create policy professionals_select_current_scope
on scheduling.professionals
for select
to authenticated
using (
  deleted_at is null
  and private.can_read_schedule_domain(tenant_id, null)
);

drop policy if exists professionals_manage_current_scope on scheduling.professionals;
create policy professionals_manage_current_scope
on scheduling.professionals
for all
to authenticated
using (
  deleted_at is null
  and private.can_manage_schedule_domain(tenant_id, null)
)
with check (
  private.can_manage_schedule_domain(tenant_id, null)
);

drop policy if exists appointment_types_select_current_scope on scheduling.appointment_types;
create policy appointment_types_select_current_scope
on scheduling.appointment_types
for select
to authenticated
using (
  private.can_read_schedule_domain(tenant_id, null)
);

drop policy if exists appointment_types_manage_current_scope on scheduling.appointment_types;
create policy appointment_types_manage_current_scope
on scheduling.appointment_types
for all
to authenticated
using (
  private.can_manage_schedule_domain(tenant_id, null)
)
with check (
  private.can_manage_schedule_domain(tenant_id, null)
);

drop policy if exists appointments_select_current_scope on scheduling.appointments;
create policy appointments_select_current_scope
on scheduling.appointments
for select
to authenticated
using (
  deleted_at is null
  and private.can_read_schedule_domain(tenant_id, unit_id)
);

drop policy if exists appointments_manage_current_scope on scheduling.appointments;
create policy appointments_manage_current_scope
on scheduling.appointments
for all
to authenticated
using (
  deleted_at is null
  and private.can_manage_schedule_domain(tenant_id, unit_id)
)
with check (
  private.can_manage_schedule_domain(tenant_id, unit_id)
);

drop policy if exists encounters_select_current_scope on clinical.encounters;
create policy encounters_select_current_scope
on clinical.encounters
for select
to authenticated
using (
  private.can_read_clinical_domain(tenant_id, unit_id)
);

drop policy if exists encounters_manage_current_scope on clinical.encounters;
create policy encounters_manage_current_scope
on clinical.encounters
for all
to authenticated
using (
  private.can_manage_clinical_domain(tenant_id, unit_id)
)
with check (
  private.can_manage_clinical_domain(tenant_id, unit_id)
);

drop policy if exists anamneses_select_current_scope on clinical.anamneses;
create policy anamneses_select_current_scope
on clinical.anamneses
for select
to authenticated
using (
  exists (
    select 1
    from clinical.encounters
    where encounters.id = anamneses.encounter_id
      and private.can_read_clinical_domain(encounters.tenant_id, encounters.unit_id)
  )
);

drop policy if exists anamneses_manage_current_scope on clinical.anamneses;
create policy anamneses_manage_current_scope
on clinical.anamneses
for all
to authenticated
using (
  exists (
    select 1
    from clinical.encounters
    where encounters.id = anamneses.encounter_id
      and private.can_manage_clinical_domain(encounters.tenant_id, encounters.unit_id)
  )
)
with check (
  exists (
    select 1
    from clinical.encounters
    where encounters.id = anamneses.encounter_id
      and private.can_manage_clinical_domain(encounters.tenant_id, encounters.unit_id)
  )
);

drop policy if exists consultation_notes_select_current_scope on clinical.consultation_notes;
create policy consultation_notes_select_current_scope
on clinical.consultation_notes
for select
to authenticated
using (
  exists (
    select 1
    from clinical.encounters
    where encounters.id = consultation_notes.encounter_id
      and private.can_read_clinical_domain(encounters.tenant_id, encounters.unit_id)
  )
);

drop policy if exists consultation_notes_manage_current_scope on clinical.consultation_notes;
create policy consultation_notes_manage_current_scope
on clinical.consultation_notes
for all
to authenticated
using (
  exists (
    select 1
    from clinical.encounters
    where encounters.id = consultation_notes.encounter_id
      and private.can_manage_clinical_domain(encounters.tenant_id, encounters.unit_id)
  )
)
with check (
  exists (
    select 1
    from clinical.encounters
    where encounters.id = consultation_notes.encounter_id
      and private.can_manage_clinical_domain(encounters.tenant_id, encounters.unit_id)
  )
);

drop policy if exists care_plans_select_current_scope on clinical.care_plans;
create policy care_plans_select_current_scope
on clinical.care_plans
for select
to authenticated
using (
  deleted_at is null
  and private.can_read_clinical_domain(tenant_id, null)
);

drop policy if exists care_plans_manage_current_scope on clinical.care_plans;
create policy care_plans_manage_current_scope
on clinical.care_plans
for all
to authenticated
using (
  deleted_at is null
  and private.can_manage_clinical_domain(tenant_id, null)
)
with check (
  private.can_manage_clinical_domain(tenant_id, null)
);

drop policy if exists care_plan_items_select_current_scope on clinical.care_plan_items;
create policy care_plan_items_select_current_scope
on clinical.care_plan_items
for select
to authenticated
using (
  exists (
    select 1
    from clinical.care_plans
    where care_plans.id = care_plan_items.care_plan_id
      and care_plans.deleted_at is null
      and private.can_read_clinical_domain(care_plans.tenant_id, null)
  )
);

drop policy if exists care_plan_items_manage_current_scope on clinical.care_plan_items;
create policy care_plan_items_manage_current_scope
on clinical.care_plan_items
for all
to authenticated
using (
  exists (
    select 1
    from clinical.care_plans
    where care_plans.id = care_plan_items.care_plan_id
      and care_plans.deleted_at is null
      and private.can_manage_clinical_domain(care_plans.tenant_id, null)
  )
)
with check (
  exists (
    select 1
    from clinical.care_plans
    where care_plans.id = care_plan_items.care_plan_id
      and care_plans.deleted_at is null
      and private.can_manage_clinical_domain(care_plans.tenant_id, null)
  )
);

drop policy if exists clinical_tasks_select_current_scope on clinical.clinical_tasks;
create policy clinical_tasks_select_current_scope
on clinical.clinical_tasks
for select
to authenticated
using (
  deleted_at is null
  and private.can_read_clinical_domain(tenant_id, null)
);

drop policy if exists clinical_tasks_manage_current_scope on clinical.clinical_tasks;
create policy clinical_tasks_manage_current_scope
on clinical.clinical_tasks
for all
to authenticated
using (
  deleted_at is null
  and private.can_manage_clinical_domain(tenant_id, null)
)
with check (
  private.can_manage_clinical_domain(tenant_id, null)
);

drop policy if exists adverse_events_select_current_scope on clinical.adverse_events;
create policy adverse_events_select_current_scope
on clinical.adverse_events
for select
to authenticated
using (
  private.can_read_clinical_domain(tenant_id, null)
);

drop policy if exists adverse_events_manage_current_scope on clinical.adverse_events;
create policy adverse_events_manage_current_scope
on clinical.adverse_events
for all
to authenticated
using (
  private.can_manage_clinical_domain(tenant_id, null)
)
with check (
  private.can_manage_clinical_domain(tenant_id, null)
);

drop policy if exists patient_goals_select_current_scope on clinical.patient_goals;
create policy patient_goals_select_current_scope
on clinical.patient_goals
for select
to authenticated
using (
  exists (
    select 1
    from patients.patients
    where patients.id = patient_goals.patient_id
      and patients.deleted_at is null
      and private.can_read_clinical_domain(patients.tenant_id, null)
  )
);

drop policy if exists patient_goals_manage_current_scope on clinical.patient_goals;
create policy patient_goals_manage_current_scope
on clinical.patient_goals
for all
to authenticated
using (
  exists (
    select 1
    from patients.patients
    where patients.id = patient_goals.patient_id
      and patients.deleted_at is null
      and private.can_manage_clinical_domain(patients.tenant_id, null)
  )
)
with check (
  exists (
    select 1
    from patients.patients
    where patients.id = patient_goals.patient_id
      and patients.deleted_at is null
      and private.can_manage_clinical_domain(patients.tenant_id, null)
  )
);

drop policy if exists prescription_records_select_current_scope on clinical.prescription_records;
create policy prescription_records_select_current_scope
on clinical.prescription_records
for select
to authenticated
using (
  exists (
    select 1
    from clinical.encounters
    where encounters.id = prescription_records.encounter_id
      and private.can_read_clinical_domain(encounters.tenant_id, encounters.unit_id)
  )
);

drop policy if exists prescription_records_manage_current_scope on clinical.prescription_records;
create policy prescription_records_manage_current_scope
on clinical.prescription_records
for all
to authenticated
using (
  exists (
    select 1
    from clinical.encounters
    where encounters.id = prescription_records.encounter_id
      and private.can_manage_clinical_domain(encounters.tenant_id, encounters.unit_id)
  )
)
with check (
  exists (
    select 1
    from clinical.encounters
    where encounters.id = prescription_records.encounter_id
      and private.can_manage_clinical_domain(encounters.tenant_id, encounters.unit_id)
  )
);

drop policy if exists habit_logs_select_current_scope on clinical.habit_logs;
create policy habit_logs_select_current_scope
on clinical.habit_logs
for select
to authenticated
using (
  exists (
    select 1
    from patients.patients
    where patients.id = habit_logs.patient_id
      and patients.deleted_at is null
      and private.can_read_clinical_domain(patients.tenant_id, null)
  )
);

drop policy if exists habit_logs_manage_current_scope on clinical.habit_logs;
create policy habit_logs_manage_current_scope
on clinical.habit_logs
for all
to authenticated
using (
  exists (
    select 1
    from patients.patients
    where patients.id = habit_logs.patient_id
      and patients.deleted_at is null
      and private.can_manage_clinical_domain(patients.tenant_id, null)
  )
)
with check (
  exists (
    select 1
    from patients.patients
    where patients.id = habit_logs.patient_id
      and patients.deleted_at is null
      and private.can_manage_clinical_domain(patients.tenant_id, null)
  )
);

drop policy if exists hydration_logs_select_current_scope on clinical.hydration_logs;
create policy hydration_logs_select_current_scope
on clinical.hydration_logs
for select
to authenticated
using (
  exists (
    select 1
    from patients.patients
    where patients.id = hydration_logs.patient_id
      and patients.deleted_at is null
      and private.can_read_clinical_domain(patients.tenant_id, null)
  )
);

drop policy if exists hydration_logs_manage_current_scope on clinical.hydration_logs;
create policy hydration_logs_manage_current_scope
on clinical.hydration_logs
for all
to authenticated
using (
  exists (
    select 1
    from patients.patients
    where patients.id = hydration_logs.patient_id
      and patients.deleted_at is null
      and private.can_manage_clinical_domain(patients.tenant_id, null)
  )
)
with check (
  exists (
    select 1
    from patients.patients
    where patients.id = hydration_logs.patient_id
      and patients.deleted_at is null
      and private.can_manage_clinical_domain(patients.tenant_id, null)
  )
);

drop policy if exists meal_logs_select_current_scope on clinical.meal_logs;
create policy meal_logs_select_current_scope
on clinical.meal_logs
for select
to authenticated
using (
  exists (
    select 1
    from patients.patients
    where patients.id = meal_logs.patient_id
      and patients.deleted_at is null
      and private.can_read_clinical_domain(patients.tenant_id, null)
  )
);

drop policy if exists meal_logs_manage_current_scope on clinical.meal_logs;
create policy meal_logs_manage_current_scope
on clinical.meal_logs
for all
to authenticated
using (
  exists (
    select 1
    from patients.patients
    where patients.id = meal_logs.patient_id
      and patients.deleted_at is null
      and private.can_manage_clinical_domain(patients.tenant_id, null)
  )
)
with check (
  exists (
    select 1
    from patients.patients
    where patients.id = meal_logs.patient_id
      and patients.deleted_at is null
      and private.can_manage_clinical_domain(patients.tenant_id, null)
  )
);

drop policy if exists workout_logs_select_current_scope on clinical.workout_logs;
create policy workout_logs_select_current_scope
on clinical.workout_logs
for select
to authenticated
using (
  exists (
    select 1
    from patients.patients
    where patients.id = workout_logs.patient_id
      and patients.deleted_at is null
      and private.can_read_clinical_domain(patients.tenant_id, null)
  )
);

drop policy if exists workout_logs_manage_current_scope on clinical.workout_logs;
create policy workout_logs_manage_current_scope
on clinical.workout_logs
for all
to authenticated
using (
  exists (
    select 1
    from patients.patients
    where patients.id = workout_logs.patient_id
      and patients.deleted_at is null
      and private.can_manage_clinical_domain(patients.tenant_id, null)
  )
)
with check (
  exists (
    select 1
    from patients.patients
    where patients.id = workout_logs.patient_id
      and patients.deleted_at is null
      and private.can_manage_clinical_domain(patients.tenant_id, null)
  )
);

drop policy if exists sleep_logs_select_current_scope on clinical.sleep_logs;
create policy sleep_logs_select_current_scope
on clinical.sleep_logs
for select
to authenticated
using (
  exists (
    select 1
    from patients.patients
    where patients.id = sleep_logs.patient_id
      and patients.deleted_at is null
      and private.can_read_clinical_domain(patients.tenant_id, null)
  )
);

drop policy if exists sleep_logs_manage_current_scope on clinical.sleep_logs;
create policy sleep_logs_manage_current_scope
on clinical.sleep_logs
for all
to authenticated
using (
  exists (
    select 1
    from patients.patients
    where patients.id = sleep_logs.patient_id
      and patients.deleted_at is null
      and private.can_manage_clinical_domain(patients.tenant_id, null)
  )
)
with check (
  exists (
    select 1
    from patients.patients
    where patients.id = sleep_logs.patient_id
      and patients.deleted_at is null
      and private.can_manage_clinical_domain(patients.tenant_id, null)
  )
);

drop policy if exists symptom_logs_select_current_scope on clinical.symptom_logs;
create policy symptom_logs_select_current_scope
on clinical.symptom_logs
for select
to authenticated
using (
  exists (
    select 1
    from patients.patients
    where patients.id = symptom_logs.patient_id
      and patients.deleted_at is null
      and private.can_read_clinical_domain(patients.tenant_id, null)
  )
);

drop policy if exists symptom_logs_manage_current_scope on clinical.symptom_logs;
create policy symptom_logs_manage_current_scope
on clinical.symptom_logs
for all
to authenticated
using (
  exists (
    select 1
    from patients.patients
    where patients.id = symptom_logs.patient_id
      and patients.deleted_at is null
      and private.can_manage_clinical_domain(patients.tenant_id, null)
  )
)
with check (
  exists (
    select 1
    from patients.patients
    where patients.id = symptom_logs.patient_id
      and patients.deleted_at is null
      and private.can_manage_clinical_domain(patients.tenant_id, null)
  )
);

create or replace function api.patient_adherence_summary(p_patient_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'adherence',
    case
      when private.legacy_patient_schema_available() then
        'Base relacional criada no Supabase. Backfill e leituras curadas ainda pendentes.'
      else
        'Leitura curada pendente da migracao do schema legado para o Supabase.'
    end,
    'habits', '[]'::jsonb
  )
$$;

create or replace function api.patient_360(
  p_patient_id text,
  p_current_legacy_unit_id text default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ready', false,
    'patientId', p_patient_id,
    'currentLegacyUnitId', p_current_legacy_unit_id,
    'schemaReady', private.legacy_patient_schema_available(),
    'source', 'supabase_scaffold',
    'reason',
    case
      when private.legacy_patient_schema_available() then
        'A base relacional do runtime ja existe, mas o backfill e as leituras SQL do Paciente 360 ainda nao foram ativados.'
      else
        'Os schemas legados de paciente, agenda e clinico ainda nao foram migrados para o Supabase runtime.'
    end,
    'timeline', api.patient_longitudinal_feed(p_patient_id, p_current_legacy_unit_id, 12),
    'habits', coalesce(api.patient_adherence_summary(p_patient_id) -> 'habits', '[]'::jsonb),
    'operationalAlerts', api.patient_operational_alerts(p_patient_id, p_current_legacy_unit_id),
    'commercialContext', api.patient_commercial_context(p_patient_id)
  )
$$;
