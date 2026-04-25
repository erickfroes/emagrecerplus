create table if not exists clinical.medical_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  patient_id uuid not null unique references patients.patients (id) on delete cascade,
  last_encounter_id uuid references clinical.encounters (id) on delete set null,
  primary_clinician_profile_id uuid references identity.profiles (id) on delete set null,
  primary_goal text,
  current_phase text,
  risk_level text not null default 'low' check (risk_level in ('low', 'medium', 'high', 'critical')),
  care_summary text,
  lifestyle_summary text,
  nutrition_summary text,
  medication_summary text,
  alert_summary text,
  last_encounter_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clinical.problem_lists (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  patient_id uuid not null references patients.patients (id) on delete cascade,
  medical_record_id uuid references clinical.medical_records (id) on delete set null,
  encounter_id uuid references clinical.encounters (id) on delete set null,
  legacy_problem_id text,
  problem_code text,
  problem_name text not null,
  status text not null default 'active' check (status in ('active', 'monitoring', 'resolved', 'ruled_out', 'archived')),
  severity text check (severity in ('low', 'medium', 'high', 'critical')),
  onset_date date,
  resolved_date date,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clinical.encounter_sections (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references clinical.encounters (id) on delete cascade,
  section_code text not null,
  section_label text not null,
  position integer not null check (position > 0),
  completion_state text not null default 'pending' check (completion_state in ('pending', 'in_progress', 'completed', 'locked')),
  is_required boolean not null default true,
  summary text,
  payload jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  completed_by_profile_id uuid references identity.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint encounter_sections_encounter_id_section_code_key unique (encounter_id, section_code)
);

create index if not exists idx_medical_records_tenant_last_encounter
  on clinical.medical_records (tenant_id, last_encounter_at desc nulls last);

create unique index if not exists idx_problem_lists_legacy_id
  on clinical.problem_lists (legacy_problem_id)
  where legacy_problem_id is not null;

create index if not exists idx_problem_lists_patient_status_onset
  on clinical.problem_lists (patient_id, status, onset_date desc nulls last);

create index if not exists idx_problem_lists_medical_record
  on clinical.problem_lists (medical_record_id, created_at desc);

create index if not exists idx_encounter_sections_encounter_position
  on clinical.encounter_sections (encounter_id, position, section_code);

drop trigger if exists set_clinical_medical_records_updated_at on clinical.medical_records;
create trigger set_clinical_medical_records_updated_at
before update on clinical.medical_records
for each row
execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_clinical_problem_lists_updated_at on clinical.problem_lists;
create trigger set_clinical_problem_lists_updated_at
before update on clinical.problem_lists
for each row
execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_clinical_encounter_sections_updated_at on clinical.encounter_sections;
create trigger set_clinical_encounter_sections_updated_at
before update on clinical.encounter_sections
for each row
execute function private.set_current_timestamp_updated_at();

grant select, insert, update, delete on table
  clinical.medical_records,
  clinical.problem_lists,
  clinical.encounter_sections
to authenticated, service_role;

alter table clinical.medical_records enable row level security;
alter table clinical.problem_lists enable row level security;
alter table clinical.encounter_sections enable row level security;

drop policy if exists medical_records_select_current_scope on clinical.medical_records;
create policy medical_records_select_current_scope
on clinical.medical_records
for select
using (
  private.can_read_clinical_domain(tenant_id, null)
);

drop policy if exists medical_records_manage_current_scope on clinical.medical_records;
create policy medical_records_manage_current_scope
on clinical.medical_records
for all
using (
  private.can_manage_clinical_domain(tenant_id, null)
)
with check (
  private.can_manage_clinical_domain(tenant_id, null)
);

drop policy if exists problem_lists_select_current_scope on clinical.problem_lists;
create policy problem_lists_select_current_scope
on clinical.problem_lists
for select
using (
  private.can_read_clinical_domain(tenant_id, null)
);

drop policy if exists problem_lists_manage_current_scope on clinical.problem_lists;
create policy problem_lists_manage_current_scope
on clinical.problem_lists
for all
using (
  private.can_manage_clinical_domain(tenant_id, null)
)
with check (
  private.can_manage_clinical_domain(tenant_id, null)
);

drop policy if exists encounter_sections_select_current_scope on clinical.encounter_sections;
create policy encounter_sections_select_current_scope
on clinical.encounter_sections
for select
using (
  exists (
    select 1
    from clinical.encounters as encounters
    where encounters.id = encounter_sections.encounter_id
      and private.can_read_clinical_domain(encounters.tenant_id, encounters.unit_id)
  )
);

drop policy if exists encounter_sections_manage_current_scope on clinical.encounter_sections;
create policy encounter_sections_manage_current_scope
on clinical.encounter_sections
for all
using (
  exists (
    select 1
    from clinical.encounters as encounters
    where encounters.id = encounter_sections.encounter_id
      and private.can_manage_clinical_domain(encounters.tenant_id, encounters.unit_id)
  )
)
with check (
  exists (
    select 1
    from clinical.encounters as encounters
    where encounters.id = encounter_sections.encounter_id
      and private.can_manage_clinical_domain(encounters.tenant_id, encounters.unit_id)
  )
);

create or replace function private.ensure_patient_medical_record(p_runtime_patient_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient record;
  v_last_encounter record;
  v_latest_anamnesis record;
  v_latest_care_plan record;
  v_latest_goal record;
  v_primary_clinician_profile_id uuid;
  v_alert_summary text;
  v_risk_level text := 'low';
  v_medical_record_id uuid;
begin
  if p_runtime_patient_id is null then
    raise exception 'p_runtime_patient_id is required';
  end if;

  select
    patients.id,
    patients.tenant_id,
    profiles.goals_summary,
    profiles.lifestyle_summary
  into v_patient
  from patients.patients as patients
  left join patients.patient_profiles as profiles
    on profiles.patient_id = patients.id
  where patients.id = p_runtime_patient_id
    and patients.deleted_at is null
  limit 1;

  if v_patient.id is null then
    raise exception 'runtime patient not found for medical record %', p_runtime_patient_id;
  end if;

  select
    encounters.id,
    encounters.summary,
    encounters.opened_at,
    encounters.closed_at,
    encounters.professional_id
  into v_last_encounter
  from clinical.encounters as encounters
  where encounters.patient_id = p_runtime_patient_id
  order by coalesce(encounters.closed_at, encounters.opened_at, encounters.created_at) desc
  limit 1;

  select
    anamneses.chief_complaint,
    anamneses.past_medical_history,
    anamneses.medication_history,
    anamneses.lifestyle_history,
    anamneses.updated_at
  into v_latest_anamnesis
  from clinical.anamneses as anamneses
  inner join clinical.encounters as encounters
    on encounters.id = anamneses.encounter_id
  where encounters.patient_id = p_runtime_patient_id
  order by anamneses.updated_at desc
  limit 1;

  select
    care_plans.id,
    care_plans.current_status,
    care_plans.summary,
    care_plans.updated_at
  into v_latest_care_plan
  from clinical.care_plans as care_plans
  where care_plans.patient_id = p_runtime_patient_id
    and care_plans.deleted_at is null
  order by coalesce(care_plans.updated_at, care_plans.created_at) desc
  limit 1;

  select
    patient_goals.title,
    patient_goals.target_value,
    patient_goals.current_value,
    patient_goals.updated_at
  into v_latest_goal
  from clinical.patient_goals as patient_goals
  where patient_goals.patient_id = p_runtime_patient_id
  order by coalesce(patient_goals.target_date, patient_goals.created_at::date) desc, patient_goals.updated_at desc
  limit 1;

  select
    professionals.profile_id
  into v_primary_clinician_profile_id
  from scheduling.professionals as professionals
  where professionals.id = v_last_encounter.professional_id
  limit 1;

  select string_agg(alerts.item, '; ')
  into v_alert_summary
  from (
    select alert_rows.item
    from (
      select
        concat('Flag: ', patient_flags.flag_type) as item,
        1 as sort_order,
        patient_flags.created_at as sort_at
      from patients.patient_flags as patient_flags
      where patient_flags.patient_id = p_runtime_patient_id
        and patient_flags.active = true

      union all

      select
        concat('Evento adverso: ', adverse_events.event_type) as item,
        2 as sort_order,
        adverse_events.created_at as sort_at
      from clinical.adverse_events as adverse_events
      where adverse_events.patient_id = p_runtime_patient_id
        and adverse_events.status in ('active', 'monitoring')

      union all

      select
        concat('Problema: ', problem_lists.problem_name) as item,
        3 as sort_order,
        problem_lists.created_at as sort_at
      from clinical.problem_lists as problem_lists
      where problem_lists.patient_id = p_runtime_patient_id
        and problem_lists.status in ('active', 'monitoring')
    ) as alert_rows
    order by alert_rows.sort_order asc, alert_rows.sort_at desc
    limit 3
  ) as alerts;

  select
    case
      when exists (
        select 1
        from patients.patient_flags as patient_flags
        where patient_flags.patient_id = p_runtime_patient_id
          and patient_flags.active = true
          and patient_flags.severity = 'critical'
      ) then 'critical'
      when exists (
        select 1
        from clinical.adverse_events as adverse_events
        where adverse_events.patient_id = p_runtime_patient_id
          and adverse_events.status in ('active', 'monitoring')
          and adverse_events.severity = 'critical'
      ) then 'critical'
      when exists (
        select 1
        from patients.patient_flags as patient_flags
        where patient_flags.patient_id = p_runtime_patient_id
          and patient_flags.active = true
          and patient_flags.severity = 'high'
      ) then 'high'
      when exists (
        select 1
        from clinical.adverse_events as adverse_events
        where adverse_events.patient_id = p_runtime_patient_id
          and adverse_events.status in ('active', 'monitoring')
          and adverse_events.severity = 'severe'
      ) then 'high'
      when exists (
        select 1
        from patients.patient_flags as patient_flags
        where patient_flags.patient_id = p_runtime_patient_id
          and patient_flags.active = true
          and patient_flags.severity = 'medium'
      ) then 'medium'
      when exists (
        select 1
        from clinical.adverse_events as adverse_events
        where adverse_events.patient_id = p_runtime_patient_id
          and adverse_events.status in ('active', 'monitoring')
          and adverse_events.severity = 'moderate'
      ) then 'medium'
      when exists (
        select 1
        from clinical.problem_lists as problem_lists
        where problem_lists.patient_id = p_runtime_patient_id
          and problem_lists.status in ('active', 'monitoring')
      ) then 'medium'
      else 'low'
    end
  into v_risk_level;

  insert into clinical.medical_records (
    tenant_id,
    patient_id,
    last_encounter_id,
    primary_clinician_profile_id,
    primary_goal,
    current_phase,
    risk_level,
    care_summary,
    lifestyle_summary,
    nutrition_summary,
    medication_summary,
    alert_summary,
    last_encounter_at,
    metadata
  )
  values (
    v_patient.tenant_id,
    p_runtime_patient_id,
    v_last_encounter.id,
    v_primary_clinician_profile_id,
    coalesce(v_patient.goals_summary, v_latest_goal.title),
    v_latest_care_plan.current_status,
    v_risk_level,
    coalesce(v_latest_care_plan.summary, v_last_encounter.summary),
    coalesce(v_patient.lifestyle_summary, v_latest_anamnesis.lifestyle_history),
    v_latest_care_plan.summary,
    v_latest_anamnesis.medication_history,
    v_alert_summary,
    coalesce(v_last_encounter.closed_at, v_last_encounter.opened_at),
    jsonb_strip_nulls(
      jsonb_build_object(
        'source', 'structured_clinical_foundation',
        'lastStructuredSyncAt', now(),
        'goalHint', v_latest_goal.title,
        'carePlanId', coalesce(v_latest_care_plan.id::text, null),
        'anamnesisUpdatedAt', coalesce(v_latest_anamnesis.updated_at, null)
      )
    )
  )
  on conflict (patient_id) do update
  set
    tenant_id = excluded.tenant_id,
    last_encounter_id = excluded.last_encounter_id,
    primary_clinician_profile_id = excluded.primary_clinician_profile_id,
    primary_goal = excluded.primary_goal,
    current_phase = excluded.current_phase,
    risk_level = excluded.risk_level,
    care_summary = excluded.care_summary,
    lifestyle_summary = excluded.lifestyle_summary,
    nutrition_summary = excluded.nutrition_summary,
    medication_summary = excluded.medication_summary,
    alert_summary = excluded.alert_summary,
    last_encounter_at = excluded.last_encounter_at,
    metadata = coalesce(clinical.medical_records.metadata, '{}'::jsonb) || excluded.metadata
  returning id into v_medical_record_id;

  return v_medical_record_id;
end;
$$;

create or replace function private.sync_encounter_sections(p_runtime_encounter_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_encounter record;
  v_anamnesis_completed boolean := false;
  v_anamnesis_completed_at timestamptz;
  v_soap_completed boolean := false;
  v_soap_in_progress boolean := false;
  v_soap_completed_at timestamptz;
  v_problem_count integer := 0;
  v_problem_hint_count integer := 0;
  v_problem_latest_at timestamptz;
  v_goal_count integer := 0;
  v_goal_latest_at timestamptz;
  v_care_plan_count integer := 0;
  v_care_plan_latest_at timestamptz;
  v_prescription_count integer := 0;
  v_prescription_latest_at timestamptz;
begin
  if p_runtime_encounter_id is null then
    raise exception 'p_runtime_encounter_id is required';
  end if;

  select
    encounters.id,
    encounters.tenant_id,
    encounters.unit_id,
    encounters.patient_id
  into v_encounter
  from clinical.encounters as encounters
  where encounters.id = p_runtime_encounter_id
  limit 1;

  if v_encounter.id is null then
    raise exception 'runtime encounter not found for section sync %', p_runtime_encounter_id;
  end if;

  select
    exists (
      select 1
      from clinical.anamneses as anamneses
      where anamneses.encounter_id = p_runtime_encounter_id
        and (
          nullif(trim(coalesce(anamneses.chief_complaint, '')), '') is not null
          or nullif(trim(coalesce(anamneses.history_of_present_illness, '')), '') is not null
          or nullif(trim(coalesce(anamneses.past_medical_history, '')), '') is not null
          or nullif(trim(coalesce(anamneses.past_surgical_history, '')), '') is not null
          or nullif(trim(coalesce(anamneses.family_history, '')), '') is not null
          or nullif(trim(coalesce(anamneses.medication_history, '')), '') is not null
          or nullif(trim(coalesce(anamneses.allergy_history, '')), '') is not null
          or nullif(trim(coalesce(anamneses.lifestyle_history, '')), '') is not null
          or nullif(trim(coalesce(anamneses.gynecological_history, '')), '') is not null
          or nullif(trim(coalesce(anamneses.notes, '')), '') is not null
        )
    ),
    (
      select max(anamneses.updated_at)
      from clinical.anamneses as anamneses
      where anamneses.encounter_id = p_runtime_encounter_id
    )
  into v_anamnesis_completed, v_anamnesis_completed_at;

  select
    exists (
      select 1
      from clinical.consultation_notes as notes
      where notes.encounter_id = p_runtime_encounter_id
        and lower(coalesce(notes.note_type, '')) <> 'soap_draft'
        and (
          nullif(trim(coalesce(notes.subjective, '')), '') is not null
          or nullif(trim(coalesce(notes.objective, '')), '') is not null
          or nullif(trim(coalesce(notes.assessment, '')), '') is not null
          or nullif(trim(coalesce(notes.plan, '')), '') is not null
        )
    ),
    exists (
      select 1
      from clinical.consultation_notes as notes
      where notes.encounter_id = p_runtime_encounter_id
        and lower(coalesce(notes.note_type, '')) = 'soap_draft'
        and (
          nullif(trim(coalesce(notes.subjective, '')), '') is not null
          or nullif(trim(coalesce(notes.objective, '')), '') is not null
          or nullif(trim(coalesce(notes.assessment, '')), '') is not null
          or nullif(trim(coalesce(notes.plan, '')), '') is not null
        )
    ),
    (
      select max(coalesce(notes.signed_at, notes.updated_at, notes.created_at))
      from clinical.consultation_notes as notes
      where notes.encounter_id = p_runtime_encounter_id
        and lower(coalesce(notes.note_type, '')) <> 'soap_draft'
    )
  into v_soap_completed, v_soap_in_progress, v_soap_completed_at;

  select
    count(*),
    max(problem_lists.updated_at)
  into v_problem_count, v_problem_latest_at
  from clinical.problem_lists as problem_lists
  where problem_lists.patient_id = v_encounter.patient_id
    and problem_lists.status in ('active', 'monitoring');

  select (
    (select count(*)
      from patients.patient_flags as patient_flags
      where patient_flags.patient_id = v_encounter.patient_id
        and patient_flags.active = true)
    +
    (select count(*)
      from clinical.adverse_events as adverse_events
      where adverse_events.patient_id = v_encounter.patient_id
        and adverse_events.status in ('active', 'monitoring'))
  )
  into v_problem_hint_count;

  select
    count(*),
    max(patient_goals.updated_at)
  into v_goal_count, v_goal_latest_at
  from clinical.patient_goals as patient_goals
  where patient_goals.patient_id = v_encounter.patient_id
    and coalesce(lower(patient_goals.status), 'active') not in ('archived', 'cancelled');

  select
    count(*),
    max(coalesce(care_plan_items.updated_at, care_plans.updated_at))
  into v_care_plan_count, v_care_plan_latest_at
  from clinical.care_plans as care_plans
  left join clinical.care_plan_items as care_plan_items
    on care_plan_items.care_plan_id = care_plans.id
  where care_plans.patient_id = v_encounter.patient_id
    and care_plans.deleted_at is null;

  select
    count(*),
    max(prescription_records.issued_at)
  into v_prescription_count, v_prescription_latest_at
  from clinical.prescription_records as prescription_records
  where prescription_records.encounter_id = p_runtime_encounter_id;

  insert into clinical.encounter_sections (
    encounter_id,
    section_code,
    section_label,
    position,
    completion_state,
    is_required,
    summary,
    payload,
    completed_at,
    metadata
  )
  select
    p_runtime_encounter_id,
    section_rows.section_code,
    section_rows.section_label,
    section_rows.position,
    section_rows.completion_state,
    section_rows.is_required,
    section_rows.summary,
    section_rows.payload,
    section_rows.completed_at,
    section_rows.metadata
  from (
    values
      (
        'anamnesis',
        'Anamnese',
        1,
        case when v_anamnesis_completed then 'completed' else 'pending' end,
        true,
        case when v_anamnesis_completed then 'Anamnese registrada.' else 'Sem anamnese estruturada.' end,
        jsonb_build_object('relatedCount', case when v_anamnesis_completed then 1 else 0 end),
        v_anamnesis_completed_at,
        jsonb_build_object('source', 'structured_clinical_foundation')
      ),
      (
        'soap',
        'Evolucao SOAP',
        2,
        case
          when v_soap_completed then 'completed'
          when v_soap_in_progress then 'in_progress'
          else 'pending'
        end,
        true,
        case
          when v_soap_completed then 'SOAP oficial registrado.'
          when v_soap_in_progress then 'Rascunho SOAP em andamento.'
          else 'Sem SOAP oficial.'
        end,
        jsonb_build_object(
          'hasDraft', v_soap_in_progress,
          'hasOfficial', v_soap_completed
        ),
        v_soap_completed_at,
        jsonb_build_object('source', 'structured_clinical_foundation')
      ),
      (
        'problem_list',
        'Problemas',
        3,
        case
          when v_problem_count > 0 then 'completed'
          when v_problem_hint_count > 0 then 'in_progress'
          else 'pending'
        end,
        false,
        case
          when v_problem_count > 0 then concat(v_problem_count::text, ' problema(s) ativo(s).')
          when v_problem_hint_count > 0 then concat(v_problem_hint_count::text, ' alerta(s) aguardando estruturacao.')
          else 'Nenhum problema estruturado.'
        end,
        jsonb_build_object(
          'problemCount', v_problem_count,
          'alertHintCount', v_problem_hint_count
        ),
        v_problem_latest_at,
        jsonb_build_object('source', 'structured_clinical_foundation')
      ),
      (
        'goals',
        'Metas',
        4,
        case when v_goal_count > 0 then 'completed' else 'pending' end,
        false,
        case
          when v_goal_count > 0 then concat(v_goal_count::text, ' meta(s) ativa(s).')
          else 'Sem metas clinicas.'
        end,
        jsonb_build_object('goalCount', v_goal_count),
        v_goal_latest_at,
        jsonb_build_object('source', 'structured_clinical_foundation')
      ),
      (
        'care_plan',
        'Plano de cuidado',
        5,
        case when v_care_plan_count > 0 then 'completed' else 'pending' end,
        false,
        case
          when v_care_plan_count > 0 then concat(v_care_plan_count::text, ' item(ns) estruturado(s).')
          else 'Sem plano de cuidado ativo.'
        end,
        jsonb_build_object('carePlanItemCount', v_care_plan_count),
        v_care_plan_latest_at,
        jsonb_build_object('source', 'structured_clinical_foundation')
      ),
      (
        'prescriptions',
        'Prescricoes',
        6,
        case when v_prescription_count > 0 then 'completed' else 'pending' end,
        false,
        case
          when v_prescription_count > 0 then concat(v_prescription_count::text, ' registro(s) emitido(s).')
          else 'Sem prescricoes ou orientacoes.'
        end,
        jsonb_build_object('prescriptionCount', v_prescription_count),
        v_prescription_latest_at,
        jsonb_build_object('source', 'structured_clinical_foundation')
      )
  ) as section_rows(
    section_code,
    section_label,
    position,
    completion_state,
    is_required,
    summary,
    payload,
    completed_at,
    metadata
  )
  on conflict (encounter_id, section_code) do update
  set
    section_label = excluded.section_label,
    position = excluded.position,
    completion_state = excluded.completion_state,
    is_required = excluded.is_required,
    summary = excluded.summary,
    payload = excluded.payload,
    completed_at = excluded.completed_at,
    metadata = coalesce(clinical.encounter_sections.metadata, '{}'::jsonb) || excluded.metadata;

  return (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', encounter_sections.id::text,
          'code', encounter_sections.section_code,
          'label', encounter_sections.section_label,
          'position', encounter_sections.position,
          'completionState', encounter_sections.completion_state,
          'isRequired', encounter_sections.is_required,
          'summary', encounter_sections.summary,
          'completedAt', encounter_sections.completed_at
        )
        order by encounter_sections.position asc, encounter_sections.section_code asc
      ),
      '[]'::jsonb
    )
    from clinical.encounter_sections as encounter_sections
    where encounter_sections.encounter_id = p_runtime_encounter_id
  );
end;
$$;

create or replace function api.get_structured_encounter_snapshot(
  p_legacy_tenant_id text,
  p_legacy_encounter_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runtime_tenant_id uuid := private.runtime_tenant_id_by_legacy_tenant_id(p_legacy_tenant_id);
  v_legacy_encounter_id text := nullif(trim(coalesce(p_legacy_encounter_id, '')), '');
  v_encounter record;
  v_medical_record_id uuid;
  v_sections jsonb := '[]'::jsonb;
begin
  if nullif(trim(coalesce(p_legacy_tenant_id, '')), '') is null then
    raise exception 'p_legacy_tenant_id is required';
  end if;

  if v_legacy_encounter_id is null then
    raise exception 'p_legacy_encounter_id is required';
  end if;

  if v_runtime_tenant_id is null then
    return jsonb_build_object(
      'ready', false,
      'reason', 'runtime_tenant_not_found',
      'source', 'supabase_runtime'
    );
  end if;

  select
    encounters.id,
    encounters.tenant_id,
    encounters.unit_id,
    encounters.patient_id,
    encounters.professional_id,
    encounters.appointment_id,
    encounters.encounter_type,
    encounters.status,
    encounters.legacy_encounter_id,
    patients.legacy_patient_id,
    patients.full_name as patient_name,
    professionals.legacy_professional_id,
    professionals.display_name as professional_name,
    appointments.legacy_appointment_id,
    appointment_types.name as appointment_type_name,
    appointments.starts_at as appointment_starts_at,
    appointments.status as appointment_status
  into v_encounter
  from clinical.encounters as encounters
  inner join patients.patients as patients
    on patients.id = encounters.patient_id
  left join scheduling.professionals as professionals
    on professionals.id = encounters.professional_id
  left join scheduling.appointments as appointments
    on appointments.id = encounters.appointment_id
  left join scheduling.appointment_types as appointment_types
    on appointment_types.id = appointments.appointment_type_id
  where encounters.tenant_id = v_runtime_tenant_id
    and encounters.legacy_encounter_id = v_legacy_encounter_id
  limit 1;

  if v_encounter.id is null then
    return jsonb_build_object(
      'ready', false,
      'reason', 'runtime_encounter_not_found',
      'source', 'supabase_runtime'
    );
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not private.can_read_clinical_domain(v_encounter.tenant_id, v_encounter.unit_id) then
    raise exception 'structured encounter snapshot denied';
  end if;

  v_medical_record_id := private.ensure_patient_medical_record(v_encounter.patient_id);
  update clinical.problem_lists
  set medical_record_id = v_medical_record_id
  where patient_id = v_encounter.patient_id
    and medical_record_id is distinct from v_medical_record_id;

  v_sections := private.sync_encounter_sections(v_encounter.id);

  return jsonb_build_object(
    'ready', true,
    'source', 'supabase_runtime',
    'encounter', jsonb_build_object(
      'id', coalesce(v_encounter.legacy_encounter_id, v_encounter.id::text),
      'patient', jsonb_build_object(
        'id', coalesce(v_encounter.legacy_patient_id, v_encounter.patient_id::text),
        'name', v_encounter.patient_name
      ),
      'professional', jsonb_build_object(
        'id', coalesce(v_encounter.legacy_professional_id, v_encounter.professional_id::text),
        'name', coalesce(v_encounter.professional_name, 'Equipe clinica')
      ),
      'appointment', case
        when v_encounter.appointment_id is null then null
        else jsonb_build_object(
          'id', coalesce(v_encounter.legacy_appointment_id, v_encounter.appointment_id::text),
          'type', coalesce(v_encounter.appointment_type_name, 'Consulta'),
          'startsAt', v_encounter.appointment_starts_at,
          'status', upper(coalesce(v_encounter.appointment_status, 'scheduled'))
        )
      end,
      'encounterType', upper(coalesce(v_encounter.encounter_type, 'other')),
      'status', upper(coalesce(v_encounter.status, 'open')),
      'medicalRecord', (
        select jsonb_build_object(
          'id', medical_records.id::text,
          'primaryGoal', medical_records.primary_goal,
          'currentPhase', medical_records.current_phase,
          'riskLevel', medical_records.risk_level,
          'careSummary', medical_records.care_summary,
          'lifestyleSummary', medical_records.lifestyle_summary,
          'nutritionSummary', medical_records.nutrition_summary,
          'medicationSummary', medical_records.medication_summary,
          'alertSummary', medical_records.alert_summary,
          'lastEncounterAt', medical_records.last_encounter_at
        )
        from clinical.medical_records as medical_records
        where medical_records.id = v_medical_record_id
      ),
      'sections', coalesce(v_sections, '[]'::jsonb),
      'anamnesis', (
        select case
          when anamneses.id is null then null
          else jsonb_build_object(
            'id', anamneses.id::text,
            'chiefComplaint', anamneses.chief_complaint,
            'historyOfPresentIllness', anamneses.history_of_present_illness,
            'pastMedicalHistory', anamneses.past_medical_history,
            'pastSurgicalHistory', anamneses.past_surgical_history,
            'familyHistory', anamneses.family_history,
            'medicationHistory', anamneses.medication_history,
            'allergyHistory', anamneses.allergy_history,
            'lifestyleHistory', anamneses.lifestyle_history,
            'gynecologicalHistory', anamneses.gynecological_history,
            'notes', anamneses.notes
          )
        end
        from clinical.anamneses as anamneses
        where anamneses.encounter_id = v_encounter.id
        limit 1
      ),
      'soapDraft', (
        select case
          when notes.id is null then null
          else jsonb_build_object(
            'id', notes.id::text,
            'noteType', notes.note_type,
            'subjective', notes.subjective,
            'objective', notes.objective,
            'assessment', notes.assessment,
            'plan', notes.plan,
            'signedAt', notes.signed_at
          )
        end
        from clinical.consultation_notes as notes
        where notes.encounter_id = v_encounter.id
          and lower(coalesce(notes.note_type, '')) = 'soap_draft'
        order by notes.updated_at desc
        limit 1
      ),
      'notes', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', notes.id::text,
              'noteType', notes.note_type,
              'subjective', notes.subjective,
              'objective', notes.objective,
              'assessment', notes.assessment,
              'plan', notes.plan,
              'signedAt', notes.signed_at
            )
            order by coalesce(notes.signed_at, notes.created_at) desc
          ),
          '[]'::jsonb
        )
        from clinical.consultation_notes as notes
        where notes.encounter_id = v_encounter.id
          and lower(coalesce(notes.note_type, '')) <> 'soap_draft'
      ),
      'tasks', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', coalesce(clinical_tasks.legacy_task_id, clinical_tasks.id::text),
              'title', clinical_tasks.title,
              'priority', upper(coalesce(clinical_tasks.priority, 'medium')),
              'status', upper(coalesce(clinical_tasks.status, 'open')),
              'dueAt', clinical_tasks.due_at
            )
            order by clinical_tasks.due_at asc nulls last, clinical_tasks.created_at desc
          ),
          '[]'::jsonb
        )
        from clinical.clinical_tasks as clinical_tasks
        where clinical_tasks.encounter_id = v_encounter.id
          and clinical_tasks.deleted_at is null
      ),
      'goals', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', coalesce(patient_goals.legacy_goal_id, patient_goals.id::text),
              'title', patient_goals.title,
              'goalType', patient_goals.goal_type,
              'targetValue', patient_goals.target_value,
              'currentValue', patient_goals.current_value,
              'status', patient_goals.status,
              'targetDate', patient_goals.target_date
            )
            order by patient_goals.target_date asc nulls last, patient_goals.created_at desc
          ),
          '[]'::jsonb
        )
        from clinical.patient_goals as patient_goals
        where patient_goals.patient_id = v_encounter.patient_id
      ),
      'carePlan', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', care_plan_items.id::text,
              'itemType', care_plan_items.item_type,
              'title', care_plan_items.title,
              'status', care_plan_items.status,
              'dueDate', care_plan_items.target_date,
              'completedAt', care_plan_items.completed_at
            )
            order by care_plan_items.position asc nulls last, care_plan_items.title asc
          ),
          '[]'::jsonb
        )
        from clinical.care_plans as care_plans
        inner join clinical.care_plan_items as care_plan_items
          on care_plan_items.care_plan_id = care_plans.id
        where care_plans.patient_id = v_encounter.patient_id
          and care_plans.deleted_at is null
      ),
      'prescriptions', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', coalesce(prescription_records.legacy_prescription_id, prescription_records.id::text),
              'prescriptionType', prescription_records.prescription_type,
              'summary', prescription_records.summary,
              'issuedAt', prescription_records.issued_at
            )
            order by prescription_records.issued_at desc
          ),
          '[]'::jsonb
        )
        from clinical.prescription_records as prescription_records
        where prescription_records.encounter_id = v_encounter.id
      ),
      'adverseEvents', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', coalesce(adverse_events.legacy_adverse_event_id, adverse_events.id::text),
              'eventType', adverse_events.event_type,
              'severity', adverse_events.severity,
              'status', adverse_events.status,
              'description', adverse_events.description
            )
            order by coalesce(adverse_events.onset_at, adverse_events.created_at) desc
          ),
          '[]'::jsonb
        )
        from clinical.adverse_events as adverse_events
        where adverse_events.patient_id = v_encounter.patient_id
      ),
      'problemList', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', coalesce(problem_lists.legacy_problem_id, problem_lists.id::text),
              'problemCode', problem_lists.problem_code,
              'problemName', problem_lists.problem_name,
              'clinicalStatus', upper(coalesce(problem_lists.status, 'active')),
              'severity', case
                when problem_lists.severity is null then null
                else upper(problem_lists.severity)
              end,
              'onsetDate', problem_lists.onset_date,
              'resolvedDate', problem_lists.resolved_date,
              'notes', problem_lists.notes
            )
            order by coalesce(problem_lists.onset_date, problem_lists.created_at::date) desc, problem_lists.created_at desc
          ),
          '[]'::jsonb
        )
        from clinical.problem_lists as problem_lists
        where problem_lists.patient_id = v_encounter.patient_id
      )
    )
  );
end;
$$;

create or replace function public.get_structured_encounter_snapshot(
  p_legacy_tenant_id text,
  p_legacy_encounter_id text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select api.get_structured_encounter_snapshot(
    p_legacy_tenant_id,
    p_legacy_encounter_id
  )
$$;

revoke all on function private.ensure_patient_medical_record(uuid) from public, anon;
revoke all on function private.sync_encounter_sections(uuid) from public, anon;
revoke all on function api.get_structured_encounter_snapshot(text, text) from public, anon;
revoke all on function public.get_structured_encounter_snapshot(text, text) from public, anon;

grant execute on function private.ensure_patient_medical_record(uuid) to authenticated, service_role;
grant execute on function private.sync_encounter_sections(uuid) to authenticated, service_role;
grant execute on function api.get_structured_encounter_snapshot(text, text) to authenticated, service_role;
grant execute on function public.get_structured_encounter_snapshot(text, text) to authenticated, service_role;
