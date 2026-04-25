create or replace function private.runtime_tenant_id_by_legacy_tenant_id(p_legacy_tenant_id text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tenants.id
  from platform.tenants as tenants
  where tenants.metadata @> jsonb_build_object('legacy_tenant_id', p_legacy_tenant_id)
  limit 1
$$;

create or replace function private.runtime_unit_id_by_legacy_unit_id(
  p_runtime_tenant_id uuid,
  p_legacy_unit_id text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select units.id
  from platform.units as units
  where units.tenant_id = p_runtime_tenant_id
    and units.metadata @> jsonb_build_object('legacy_unit_id', p_legacy_unit_id)
  limit 1
$$;

create or replace function private.runtime_profile_id_by_legacy_user_id(p_legacy_user_id text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select profiles.id
  from identity.profiles as profiles
  where coalesce(profiles.metadata ->> 'legacy_user_id', '') = coalesce(p_legacy_user_id, '')
  limit 1
$$;

revoke all on function private.runtime_tenant_id_by_legacy_tenant_id(text) from public, anon, authenticated;
revoke all on function private.runtime_unit_id_by_legacy_unit_id(uuid, text) from public, anon, authenticated;
revoke all on function private.runtime_profile_id_by_legacy_user_id(text) from public, anon, authenticated;

grant execute on function private.runtime_tenant_id_by_legacy_tenant_id(text) to service_role;
grant execute on function private.runtime_unit_id_by_legacy_unit_id(uuid, text) to service_role;
grant execute on function private.runtime_profile_id_by_legacy_user_id(text) to service_role;

create or replace function api.backfill_runtime_scope(
  p_legacy_tenant_id text,
  p_legacy_tenant_legal_name text,
  p_legacy_tenant_trade_name text default null,
  p_legacy_tenant_status text default 'ACTIVE',
  p_subscription_plan_code text default null,
  p_units jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runtime_tenant_id uuid;
  v_runtime_unit_id uuid;
  v_unit jsonb;
  v_legacy_unit_id text;
  v_unit_name text;
  v_unit_code text;
  v_unit_city text;
  v_unit_status text;
  v_tenant_status text;
  v_unit_mappings jsonb := '[]'::jsonb;
begin
  if nullif(trim(coalesce(p_legacy_tenant_id, '')), '') is null then
    raise exception 'p_legacy_tenant_id is required';
  end if;

  if nullif(trim(coalesce(p_legacy_tenant_legal_name, '')), '') is null then
    raise exception 'p_legacy_tenant_legal_name is required';
  end if;

  v_tenant_status := case upper(coalesce(p_legacy_tenant_status, 'ACTIVE'))
    when 'ARCHIVED' then 'archived'
    when 'INACTIVE' then 'suspended'
    else 'active'
  end;

  select private.runtime_tenant_id_by_legacy_tenant_id(p_legacy_tenant_id)
  into v_runtime_tenant_id;

  if v_runtime_tenant_id is null then
    insert into platform.tenants (
      id,
      legal_name,
      trade_name,
      status,
      subscription_plan_code,
      default_timezone,
      metadata
    )
    values (
      gen_random_uuid(),
      p_legacy_tenant_legal_name,
      p_legacy_tenant_trade_name,
      v_tenant_status,
      p_subscription_plan_code,
      'America/Sao_Paulo',
      jsonb_build_object(
        'legacy_tenant_id', p_legacy_tenant_id,
        'source', 'runtime_backfill'
      )
    )
    returning id into v_runtime_tenant_id;
  else
    update platform.tenants as tenants
    set
      legal_name = p_legacy_tenant_legal_name,
      trade_name = p_legacy_tenant_trade_name,
      status = v_tenant_status,
      subscription_plan_code = p_subscription_plan_code,
      metadata = coalesce(tenants.metadata, '{}'::jsonb) || jsonb_build_object(
        'legacy_tenant_id', p_legacy_tenant_id,
        'source', 'runtime_backfill'
      )
    where tenants.id = v_runtime_tenant_id;
  end if;

  for v_unit in
    select value
    from jsonb_array_elements(coalesce(p_units, '[]'::jsonb))
  loop
    v_legacy_unit_id := nullif(trim(coalesce(v_unit ->> 'id', '')), '');

    if v_legacy_unit_id is null then
      continue;
    end if;

    v_unit_name := coalesce(nullif(trim(coalesce(v_unit ->> 'name', '')), ''), v_legacy_unit_id);
    v_unit_code := coalesce(
      nullif(trim(coalesce(v_unit ->> 'code', '')), ''),
      format('legacy-%s', v_legacy_unit_id)
    );
    v_unit_city := coalesce(nullif(trim(coalesce(v_unit ->> 'city', '')), ''), 'Sem cidade');
    v_unit_status := case upper(coalesce(v_unit ->> 'status', 'ACTIVE'))
      when 'INACTIVE' then 'inactive'
      else 'active'
    end;

    select private.runtime_unit_id_by_legacy_unit_id(v_runtime_tenant_id, v_legacy_unit_id)
    into v_runtime_unit_id;

    if v_runtime_unit_id is null then
      insert into platform.units (
        id,
        tenant_id,
        name,
        code,
        city,
        status,
        is_default,
        deleted_at,
        metadata
      )
      values (
        gen_random_uuid(),
        v_runtime_tenant_id,
        v_unit_name,
        v_unit_code,
        v_unit_city,
        v_unit_status,
        false,
        nullif(v_unit ->> 'deletedAt', '')::timestamptz,
        jsonb_build_object(
          'legacy_unit_id', v_legacy_unit_id,
          'source', 'runtime_backfill'
        )
      )
      returning id into v_runtime_unit_id;
    else
      update platform.units as units
      set
        name = v_unit_name,
        code = v_unit_code,
        city = v_unit_city,
        status = v_unit_status,
        deleted_at = nullif(v_unit ->> 'deletedAt', '')::timestamptz,
        metadata = coalesce(units.metadata, '{}'::jsonb) || jsonb_build_object(
          'legacy_unit_id', v_legacy_unit_id,
          'source', 'runtime_backfill'
        )
      where units.id = v_runtime_unit_id;
    end if;

    v_unit_mappings := v_unit_mappings || jsonb_build_array(
      jsonb_build_object(
        'legacyUnitId', v_legacy_unit_id,
        'unitId', v_runtime_unit_id
      )
    );
  end loop;

  return jsonb_build_object(
    'tenantId', v_runtime_tenant_id,
    'units', v_unit_mappings
  );
end;
$$;

revoke all on function api.backfill_runtime_scope(text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function api.backfill_runtime_scope(text, text, text, text, text, jsonb) to service_role;

create or replace function api.backfill_runtime_reference_data(
  p_runtime_tenant_id uuid,
  p_tags jsonb default '[]'::jsonb,
  p_professionals jsonb default '[]'::jsonb,
  p_appointment_types jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tags_count integer := 0;
  v_professionals_count integer := 0;
  v_appointment_types_count integer := 0;
begin
  if p_runtime_tenant_id is null then
    raise exception 'p_runtime_tenant_id is required';
  end if;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_tags, '[]'::jsonb)) as x(
      id uuid,
      legacy_tag_id text,
      name text,
      code text,
      color text,
      status text,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz
    )
  )
  insert into patients.tags (
    id,
    tenant_id,
    legacy_tag_id,
    name,
    code,
    color,
    status,
    metadata,
    created_at,
    updated_at
  )
  select
    rows.id,
    p_runtime_tenant_id,
    rows.legacy_tag_id,
    rows.name,
    rows.code,
    rows.color,
    lower(coalesce(rows.status, 'active')),
    coalesce(rows.metadata, '{}'::jsonb),
    coalesce(rows.created_at, now()),
    coalesce(rows.updated_at, coalesce(rows.created_at, now()))
  from rows
  where rows.id is not null
    and nullif(trim(coalesce(rows.name, '')), '') is not null
    and nullif(trim(coalesce(rows.code, '')), '') is not null
  on conflict (id) do update
  set
    tenant_id = excluded.tenant_id,
    legacy_tag_id = excluded.legacy_tag_id,
    name = excluded.name,
    code = excluded.code,
    color = excluded.color,
    status = excluded.status,
    metadata = coalesce(patients.tags.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = excluded.updated_at;

  get diagnostics v_tags_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_professionals, '[]'::jsonb)) as x(
      id uuid,
      legacy_professional_id text,
      legacy_user_id text,
      professional_type text,
      license_number text,
      display_name text,
      color_hex text,
      is_schedulable boolean,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz,
      deleted_at timestamptz
    )
  )
  insert into scheduling.professionals (
    id,
    tenant_id,
    profile_id,
    legacy_professional_id,
    professional_type,
    license_number,
    display_name,
    color_hex,
    is_schedulable,
    metadata,
    created_at,
    updated_at,
    deleted_at
  )
  select
    rows.id,
    p_runtime_tenant_id,
    private.runtime_profile_id_by_legacy_user_id(rows.legacy_user_id),
    rows.legacy_professional_id,
    lower(coalesce(rows.professional_type, 'other')),
    rows.license_number,
    rows.display_name,
    rows.color_hex,
    coalesce(rows.is_schedulable, true),
    coalesce(rows.metadata, '{}'::jsonb),
    coalesce(rows.created_at, now()),
    coalesce(rows.updated_at, coalesce(rows.created_at, now())),
    rows.deleted_at
  from rows
  where rows.id is not null
    and nullif(trim(coalesce(rows.display_name, '')), '') is not null
  on conflict (id) do update
  set
    tenant_id = excluded.tenant_id,
    profile_id = excluded.profile_id,
    legacy_professional_id = excluded.legacy_professional_id,
    professional_type = excluded.professional_type,
    license_number = excluded.license_number,
    display_name = excluded.display_name,
    color_hex = excluded.color_hex,
    is_schedulable = excluded.is_schedulable,
    metadata = coalesce(scheduling.professionals.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = excluded.updated_at,
    deleted_at = excluded.deleted_at;

  get diagnostics v_professionals_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_appointment_types, '[]'::jsonb)) as x(
      id uuid,
      legacy_appointment_type_id text,
      name text,
      code text,
      default_duration_minutes integer,
      requires_professional boolean,
      requires_resource boolean,
      generates_encounter boolean,
      allows_telehealth boolean,
      active boolean,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz
    )
  )
  insert into scheduling.appointment_types (
    id,
    tenant_id,
    legacy_appointment_type_id,
    name,
    code,
    default_duration_minutes,
    requires_professional,
    requires_resource,
    generates_encounter,
    allows_telehealth,
    active,
    metadata,
    created_at,
    updated_at
  )
  select
    rows.id,
    p_runtime_tenant_id,
    rows.legacy_appointment_type_id,
    rows.name,
    rows.code,
    greatest(coalesce(rows.default_duration_minutes, 30), 1),
    coalesce(rows.requires_professional, true),
    coalesce(rows.requires_resource, false),
    coalesce(rows.generates_encounter, true),
    coalesce(rows.allows_telehealth, false),
    coalesce(rows.active, true),
    coalesce(rows.metadata, '{}'::jsonb),
    coalesce(rows.created_at, now()),
    coalesce(rows.updated_at, coalesce(rows.created_at, now()))
  from rows
  where rows.id is not null
    and nullif(trim(coalesce(rows.name, '')), '') is not null
    and nullif(trim(coalesce(rows.code, '')), '') is not null
  on conflict (id) do update
  set
    tenant_id = excluded.tenant_id,
    legacy_appointment_type_id = excluded.legacy_appointment_type_id,
    name = excluded.name,
    code = excluded.code,
    default_duration_minutes = excluded.default_duration_minutes,
    requires_professional = excluded.requires_professional,
    requires_resource = excluded.requires_resource,
    generates_encounter = excluded.generates_encounter,
    allows_telehealth = excluded.allows_telehealth,
    active = excluded.active,
    metadata = coalesce(scheduling.appointment_types.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = excluded.updated_at;

  get diagnostics v_appointment_types_count = row_count;

  return jsonb_build_object(
    'tags', v_tags_count,
    'professionals', v_professionals_count,
    'appointmentTypes', v_appointment_types_count
  );
end;
$$;

revoke all on function api.backfill_runtime_reference_data(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function api.backfill_runtime_reference_data(uuid, jsonb, jsonb, jsonb) to service_role;

create or replace function api.backfill_runtime_patient_domain(
  p_runtime_tenant_id uuid,
  p_patients jsonb default '[]'::jsonb,
  p_patient_profiles jsonb default '[]'::jsonb,
  p_patient_tags jsonb default '[]'::jsonb,
  p_patient_flags jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patients_count integer := 0;
  v_profiles_count integer := 0;
  v_tags_count integer := 0;
  v_flags_count integer := 0;
begin
  if p_runtime_tenant_id is null then
    raise exception 'p_runtime_tenant_id is required';
  end if;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_patients, '[]'::jsonb)) as x(
      id uuid,
      legacy_patient_id text,
      external_code text,
      full_name text,
      cpf text,
      birth_date date,
      sex text,
      gender text,
      marital_status text,
      primary_phone text,
      primary_email text,
      status text,
      source text,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz,
      deleted_at timestamptz
    )
  )
  insert into patients.patients (
    id,
    tenant_id,
    legacy_patient_id,
    external_code,
    full_name,
    cpf,
    birth_date,
    sex,
    gender,
    marital_status,
    primary_phone,
    primary_email,
    status,
    source,
    metadata,
    created_at,
    updated_at,
    deleted_at
  )
  select
    rows.id,
    p_runtime_tenant_id,
    rows.legacy_patient_id,
    rows.external_code,
    rows.full_name,
    rows.cpf,
    rows.birth_date,
    rows.sex,
    rows.gender,
    rows.marital_status,
    rows.primary_phone,
    rows.primary_email,
    lower(coalesce(rows.status, 'active')),
    lower(coalesce(rows.source, 'legacy_backfill')),
    coalesce(rows.metadata, '{}'::jsonb),
    coalesce(rows.created_at, now()),
    coalesce(rows.updated_at, coalesce(rows.created_at, now())),
    rows.deleted_at
  from rows
  where rows.id is not null
    and nullif(trim(coalesce(rows.full_name, '')), '') is not null
  on conflict (id) do update
  set
    tenant_id = excluded.tenant_id,
    legacy_patient_id = excluded.legacy_patient_id,
    external_code = excluded.external_code,
    full_name = excluded.full_name,
    cpf = excluded.cpf,
    birth_date = excluded.birth_date,
    sex = excluded.sex,
    gender = excluded.gender,
    marital_status = excluded.marital_status,
    primary_phone = excluded.primary_phone,
    primary_email = excluded.primary_email,
    status = excluded.status,
    source = excluded.source,
    metadata = coalesce(patients.patients.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = excluded.updated_at,
    deleted_at = excluded.deleted_at;

  get diagnostics v_patients_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_patient_profiles, '[]'::jsonb)) as x(
      patient_id uuid,
      occupation text,
      referral_source text,
      lifestyle_summary text,
      goals_summary text,
      notes text,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz
    )
  )
  insert into patients.patient_profiles (
    patient_id,
    occupation,
    referral_source,
    lifestyle_summary,
    goals_summary,
    notes,
    metadata,
    created_at,
    updated_at
  )
  select
    rows.patient_id,
    rows.occupation,
    rows.referral_source,
    rows.lifestyle_summary,
    rows.goals_summary,
    rows.notes,
    coalesce(rows.metadata, '{}'::jsonb),
    coalesce(rows.created_at, now()),
    coalesce(rows.updated_at, coalesce(rows.created_at, now()))
  from rows
  where rows.patient_id is not null
  on conflict (patient_id) do update
  set
    occupation = excluded.occupation,
    referral_source = excluded.referral_source,
    lifestyle_summary = excluded.lifestyle_summary,
    goals_summary = excluded.goals_summary,
    notes = excluded.notes,
    metadata = coalesce(patients.patient_profiles.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = excluded.updated_at;

  get diagnostics v_profiles_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_patient_tags, '[]'::jsonb)) as x(
      patient_id uuid,
      tag_id uuid,
      metadata jsonb,
      created_at timestamptz
    )
  )
  insert into patients.patient_tags (
    patient_id,
    tag_id,
    created_at,
    metadata
  )
  select
    rows.patient_id,
    rows.tag_id,
    coalesce(rows.created_at, now()),
    coalesce(rows.metadata, '{}'::jsonb)
  from rows
  where rows.patient_id is not null
    and rows.tag_id is not null
  on conflict (patient_id, tag_id) do update
  set
    metadata = coalesce(patients.patient_tags.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb);

  get diagnostics v_tags_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_patient_flags, '[]'::jsonb)) as x(
      id uuid,
      patient_id uuid,
      legacy_flag_id text,
      flag_type text,
      severity text,
      description text,
      active boolean,
      legacy_created_by_user_id text,
      resolved_at timestamptz,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz
    )
  )
  insert into patients.patient_flags (
    id,
    tenant_id,
    patient_id,
    legacy_flag_id,
    flag_type,
    severity,
    description,
    active,
    created_by_profile_id,
    resolved_at,
    metadata,
    created_at,
    updated_at
  )
  select
    rows.id,
    p_runtime_tenant_id,
    rows.patient_id,
    rows.legacy_flag_id,
    rows.flag_type,
    lower(coalesce(rows.severity, 'medium')),
    rows.description,
    coalesce(rows.active, true),
    private.runtime_profile_id_by_legacy_user_id(rows.legacy_created_by_user_id),
    rows.resolved_at,
    coalesce(rows.metadata, '{}'::jsonb),
    coalesce(rows.created_at, now()),
    coalesce(rows.updated_at, coalesce(rows.created_at, now()))
  from rows
  where rows.id is not null
    and rows.patient_id is not null
    and nullif(trim(coalesce(rows.flag_type, '')), '') is not null
  on conflict (id) do update
  set
    tenant_id = excluded.tenant_id,
    patient_id = excluded.patient_id,
    legacy_flag_id = excluded.legacy_flag_id,
    flag_type = excluded.flag_type,
    severity = excluded.severity,
    description = excluded.description,
    active = excluded.active,
    created_by_profile_id = excluded.created_by_profile_id,
    resolved_at = excluded.resolved_at,
    metadata = coalesce(patients.patient_flags.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = excluded.updated_at;

  get diagnostics v_flags_count = row_count;

  return jsonb_build_object(
    'patients', v_patients_count,
    'patientProfiles', v_profiles_count,
    'patientTags', v_tags_count,
    'patientFlags', v_flags_count
  );
end;
$$;

revoke all on function api.backfill_runtime_patient_domain(uuid, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function api.backfill_runtime_patient_domain(uuid, jsonb, jsonb, jsonb, jsonb) to service_role;

create or replace function api.backfill_runtime_scheduling_domain(
  p_runtime_tenant_id uuid,
  p_appointments jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointments_count integer := 0;
begin
  if p_runtime_tenant_id is null then
    raise exception 'p_runtime_tenant_id is required';
  end if;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_appointments, '[]'::jsonb)) as x(
      id uuid,
      unit_id uuid,
      patient_id uuid,
      professional_id uuid,
      appointment_type_id uuid,
      legacy_appointment_id text,
      starts_at timestamptz,
      ends_at timestamptz,
      status text,
      source text,
      notes text,
      legacy_created_by_user_id text,
      confirmed_at timestamptz,
      checked_in_at timestamptz,
      canceled_at timestamptz,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz,
      deleted_at timestamptz
    )
  )
  insert into scheduling.appointments (
    id,
    tenant_id,
    unit_id,
    patient_id,
    professional_id,
    appointment_type_id,
    legacy_appointment_id,
    starts_at,
    ends_at,
    status,
    source,
    notes,
    created_by_profile_id,
    confirmed_at,
    checked_in_at,
    canceled_at,
    metadata,
    created_at,
    updated_at,
    deleted_at
  )
  select
    rows.id,
    p_runtime_tenant_id,
    rows.unit_id,
    rows.patient_id,
    rows.professional_id,
    rows.appointment_type_id,
    rows.legacy_appointment_id,
    rows.starts_at,
    rows.ends_at,
    lower(coalesce(rows.status, 'scheduled')),
    lower(coalesce(rows.source, 'internal')),
    rows.notes,
    private.runtime_profile_id_by_legacy_user_id(rows.legacy_created_by_user_id),
    rows.confirmed_at,
    rows.checked_in_at,
    rows.canceled_at,
    coalesce(rows.metadata, '{}'::jsonb),
    coalesce(rows.created_at, now()),
    coalesce(rows.updated_at, coalesce(rows.created_at, now())),
    rows.deleted_at
  from rows
  where rows.id is not null
    and rows.unit_id is not null
    and rows.patient_id is not null
    and rows.appointment_type_id is not null
    and rows.starts_at is not null
    and rows.ends_at is not null
  on conflict (id) do update
  set
    tenant_id = excluded.tenant_id,
    unit_id = excluded.unit_id,
    patient_id = excluded.patient_id,
    professional_id = excluded.professional_id,
    appointment_type_id = excluded.appointment_type_id,
    legacy_appointment_id = excluded.legacy_appointment_id,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    status = excluded.status,
    source = excluded.source,
    notes = excluded.notes,
    created_by_profile_id = excluded.created_by_profile_id,
    confirmed_at = excluded.confirmed_at,
    checked_in_at = excluded.checked_in_at,
    canceled_at = excluded.canceled_at,
    metadata = coalesce(scheduling.appointments.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = excluded.updated_at,
    deleted_at = excluded.deleted_at;

  get diagnostics v_appointments_count = row_count;

  return jsonb_build_object(
    'appointments', v_appointments_count
  );
end;
$$;

revoke all on function api.backfill_runtime_scheduling_domain(uuid, jsonb) from public, anon, authenticated;
grant execute on function api.backfill_runtime_scheduling_domain(uuid, jsonb) to service_role;

create or replace function api.backfill_runtime_clinical_domain(
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
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_encounters_count integer := 0;
  v_anamneses_count integer := 0;
  v_consultation_notes_count integer := 0;
  v_care_plans_count integer := 0;
  v_care_plan_items_count integer := 0;
  v_clinical_tasks_count integer := 0;
  v_adverse_events_count integer := 0;
  v_patient_goals_count integer := 0;
  v_prescription_records_count integer := 0;
begin
  if p_runtime_tenant_id is null then
    raise exception 'p_runtime_tenant_id is required';
  end if;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_encounters, '[]'::jsonb)) as x(
      id uuid,
      unit_id uuid,
      patient_id uuid,
      appointment_id uuid,
      professional_id uuid,
      legacy_encounter_id text,
      encounter_type text,
      status text,
      summary text,
      opened_at timestamptz,
      closed_at timestamptz,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz
    )
  )
  insert into clinical.encounters (
    id,
    tenant_id,
    unit_id,
    patient_id,
    appointment_id,
    professional_id,
    legacy_encounter_id,
    encounter_type,
    status,
    summary,
    opened_at,
    closed_at,
    metadata,
    created_at,
    updated_at
  )
  select
    rows.id,
    p_runtime_tenant_id,
    rows.unit_id,
    rows.patient_id,
    rows.appointment_id,
    rows.professional_id,
    rows.legacy_encounter_id,
    lower(coalesce(rows.encounter_type, 'other')),
    lower(coalesce(rows.status, 'open')),
    rows.summary,
    coalesce(rows.opened_at, now()),
    rows.closed_at,
    coalesce(rows.metadata, '{}'::jsonb),
    coalesce(rows.created_at, now()),
    coalesce(rows.updated_at, coalesce(rows.created_at, now()))
  from rows
  where rows.id is not null
    and rows.unit_id is not null
    and rows.patient_id is not null
  on conflict (id) do update
  set
    tenant_id = excluded.tenant_id,
    unit_id = excluded.unit_id,
    patient_id = excluded.patient_id,
    appointment_id = excluded.appointment_id,
    professional_id = excluded.professional_id,
    legacy_encounter_id = excluded.legacy_encounter_id,
    encounter_type = excluded.encounter_type,
    status = excluded.status,
    summary = excluded.summary,
    opened_at = excluded.opened_at,
    closed_at = excluded.closed_at,
    metadata = coalesce(clinical.encounters.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = excluded.updated_at;

  get diagnostics v_encounters_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_anamneses, '[]'::jsonb)) as x(
      id uuid,
      encounter_id uuid,
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
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz
    )
  )
  insert into clinical.anamneses (
    id,
    encounter_id,
    chief_complaint,
    history_of_present_illness,
    past_medical_history,
    past_surgical_history,
    family_history,
    medication_history,
    allergy_history,
    lifestyle_history,
    gynecological_history,
    notes,
    metadata,
    created_at,
    updated_at
  )
  select
    rows.id,
    rows.encounter_id,
    rows.chief_complaint,
    rows.history_of_present_illness,
    rows.past_medical_history,
    rows.past_surgical_history,
    rows.family_history,
    rows.medication_history,
    rows.allergy_history,
    rows.lifestyle_history,
    rows.gynecological_history,
    rows.notes,
    coalesce(rows.metadata, '{}'::jsonb),
    coalesce(rows.created_at, now()),
    coalesce(rows.updated_at, coalesce(rows.created_at, now()))
  from rows
  where rows.id is not null
    and rows.encounter_id is not null
  on conflict (id) do update
  set
    encounter_id = excluded.encounter_id,
    chief_complaint = excluded.chief_complaint,
    history_of_present_illness = excluded.history_of_present_illness,
    past_medical_history = excluded.past_medical_history,
    past_surgical_history = excluded.past_surgical_history,
    family_history = excluded.family_history,
    medication_history = excluded.medication_history,
    allergy_history = excluded.allergy_history,
    lifestyle_history = excluded.lifestyle_history,
    gynecological_history = excluded.gynecological_history,
    notes = excluded.notes,
    metadata = coalesce(clinical.anamneses.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = excluded.updated_at;

  get diagnostics v_anamneses_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_consultation_notes, '[]'::jsonb)) as x(
      id uuid,
      encounter_id uuid,
      note_type text,
      subjective text,
      objective text,
      assessment text,
      plan text,
      legacy_signed_by_user_id text,
      signed_at timestamptz,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz
    )
  )
  insert into clinical.consultation_notes (
    id,
    encounter_id,
    note_type,
    subjective,
    objective,
    assessment,
    plan,
    signed_by_profile_id,
    signed_at,
    metadata,
    created_at,
    updated_at
  )
  select
    rows.id,
    rows.encounter_id,
    rows.note_type,
    rows.subjective,
    rows.objective,
    rows.assessment,
    rows.plan,
    private.runtime_profile_id_by_legacy_user_id(rows.legacy_signed_by_user_id),
    rows.signed_at,
    coalesce(rows.metadata, '{}'::jsonb),
    coalesce(rows.created_at, now()),
    coalesce(rows.updated_at, coalesce(rows.created_at, now()))
  from rows
  where rows.id is not null
    and rows.encounter_id is not null
  on conflict (id) do update
  set
    encounter_id = excluded.encounter_id,
    note_type = excluded.note_type,
    subjective = excluded.subjective,
    objective = excluded.objective,
    assessment = excluded.assessment,
    plan = excluded.plan,
    signed_by_profile_id = excluded.signed_by_profile_id,
    signed_at = excluded.signed_at,
    metadata = coalesce(clinical.consultation_notes.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = excluded.updated_at;

  get diagnostics v_consultation_notes_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_care_plans, '[]'::jsonb)) as x(
      id uuid,
      patient_id uuid,
      legacy_care_plan_id text,
      current_status text,
      summary text,
      start_date date,
      end_date date,
      legacy_created_by_user_id text,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz,
      deleted_at timestamptz
    )
  )
  insert into clinical.care_plans (
    id,
    tenant_id,
    patient_id,
    legacy_care_plan_id,
    current_status,
    summary,
    start_date,
    end_date,
    created_by_profile_id,
    metadata,
    created_at,
    updated_at,
    deleted_at
  )
  select
    rows.id,
    p_runtime_tenant_id,
    rows.patient_id,
    rows.legacy_care_plan_id,
    rows.current_status,
    rows.summary,
    rows.start_date,
    rows.end_date,
    private.runtime_profile_id_by_legacy_user_id(rows.legacy_created_by_user_id),
    coalesce(rows.metadata, '{}'::jsonb),
    coalesce(rows.created_at, now()),
    coalesce(rows.updated_at, coalesce(rows.created_at, now())),
    rows.deleted_at
  from rows
  where rows.id is not null
    and rows.patient_id is not null
  on conflict (id) do update
  set
    tenant_id = excluded.tenant_id,
    patient_id = excluded.patient_id,
    legacy_care_plan_id = excluded.legacy_care_plan_id,
    current_status = excluded.current_status,
    summary = excluded.summary,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    created_by_profile_id = excluded.created_by_profile_id,
    metadata = coalesce(clinical.care_plans.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = excluded.updated_at,
    deleted_at = excluded.deleted_at;

  get diagnostics v_care_plans_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_care_plan_items, '[]'::jsonb)) as x(
      id uuid,
      care_plan_id uuid,
      item_type text,
      title text,
      description text,
      status text,
      target_date date,
      completed_at timestamptz,
      position integer,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz
    )
  )
  insert into clinical.care_plan_items (
    id,
    care_plan_id,
    item_type,
    title,
    description,
    status,
    target_date,
    completed_at,
    position,
    metadata,
    created_at,
    updated_at
  )
  select
    rows.id,
    rows.care_plan_id,
    rows.item_type,
    rows.title,
    rows.description,
    rows.status,
    rows.target_date,
    rows.completed_at,
    rows.position,
    coalesce(rows.metadata, '{}'::jsonb),
    coalesce(rows.created_at, now()),
    coalesce(rows.updated_at, coalesce(rows.created_at, now()))
  from rows
  where rows.id is not null
    and rows.care_plan_id is not null
    and nullif(trim(coalesce(rows.item_type, '')), '') is not null
    and nullif(trim(coalesce(rows.title, '')), '') is not null
  on conflict (id) do update
  set
    care_plan_id = excluded.care_plan_id,
    item_type = excluded.item_type,
    title = excluded.title,
    description = excluded.description,
    status = excluded.status,
    target_date = excluded.target_date,
    completed_at = excluded.completed_at,
    position = excluded.position,
    metadata = coalesce(clinical.care_plan_items.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = excluded.updated_at;

  get diagnostics v_care_plan_items_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_clinical_tasks, '[]'::jsonb)) as x(
      id uuid,
      patient_id uuid,
      encounter_id uuid,
      legacy_task_id text,
      assigned_to_legacy_user_id text,
      task_type text,
      title text,
      description text,
      priority text,
      status text,
      due_at timestamptz,
      completed_at timestamptz,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz,
      deleted_at timestamptz
    )
  )
  insert into clinical.clinical_tasks (
    id,
    tenant_id,
    patient_id,
    encounter_id,
    assigned_to_profile_id,
    legacy_task_id,
    task_type,
    title,
    description,
    priority,
    status,
    due_at,
    completed_at,
    metadata,
    created_at,
    updated_at,
    deleted_at
  )
  select
    rows.id,
    p_runtime_tenant_id,
    rows.patient_id,
    rows.encounter_id,
    private.runtime_profile_id_by_legacy_user_id(rows.assigned_to_legacy_user_id),
    rows.legacy_task_id,
    rows.task_type,
    rows.title,
    rows.description,
    lower(coalesce(rows.priority, 'medium')),
    lower(coalesce(rows.status, 'open')),
    rows.due_at,
    rows.completed_at,
    coalesce(rows.metadata, '{}'::jsonb),
    coalesce(rows.created_at, now()),
    coalesce(rows.updated_at, coalesce(rows.created_at, now())),
    rows.deleted_at
  from rows
  where rows.id is not null
    and rows.patient_id is not null
    and nullif(trim(coalesce(rows.task_type, '')), '') is not null
    and nullif(trim(coalesce(rows.title, '')), '') is not null
  on conflict (id) do update
  set
    tenant_id = excluded.tenant_id,
    patient_id = excluded.patient_id,
    encounter_id = excluded.encounter_id,
    assigned_to_profile_id = excluded.assigned_to_profile_id,
    legacy_task_id = excluded.legacy_task_id,
    task_type = excluded.task_type,
    title = excluded.title,
    description = excluded.description,
    priority = excluded.priority,
    status = excluded.status,
    due_at = excluded.due_at,
    completed_at = excluded.completed_at,
    metadata = coalesce(clinical.clinical_tasks.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = excluded.updated_at,
    deleted_at = excluded.deleted_at;

  get diagnostics v_clinical_tasks_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_adverse_events, '[]'::jsonb)) as x(
      id uuid,
      patient_id uuid,
      encounter_id uuid,
      legacy_adverse_event_id text,
      severity text,
      event_type text,
      description text,
      onset_at timestamptz,
      resolved_at timestamptz,
      status text,
      legacy_recorded_by_user_id text,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz
    )
  )
  insert into clinical.adverse_events (
    id,
    tenant_id,
    patient_id,
    encounter_id,
    legacy_adverse_event_id,
    severity,
    event_type,
    description,
    onset_at,
    resolved_at,
    status,
    recorded_by_profile_id,
    metadata,
    created_at,
    updated_at
  )
  select
    rows.id,
    p_runtime_tenant_id,
    rows.patient_id,
    rows.encounter_id,
    rows.legacy_adverse_event_id,
    lower(coalesce(rows.severity, 'moderate')),
    rows.event_type,
    rows.description,
    rows.onset_at,
    rows.resolved_at,
    lower(coalesce(rows.status, 'active')),
    private.runtime_profile_id_by_legacy_user_id(rows.legacy_recorded_by_user_id),
    coalesce(rows.metadata, '{}'::jsonb),
    coalesce(rows.created_at, now()),
    coalesce(rows.updated_at, coalesce(rows.created_at, now()))
  from rows
  where rows.id is not null
    and rows.patient_id is not null
    and nullif(trim(coalesce(rows.event_type, '')), '') is not null
    and nullif(trim(coalesce(rows.description, '')), '') is not null
  on conflict (id) do update
  set
    tenant_id = excluded.tenant_id,
    patient_id = excluded.patient_id,
    encounter_id = excluded.encounter_id,
    legacy_adverse_event_id = excluded.legacy_adverse_event_id,
    severity = excluded.severity,
    event_type = excluded.event_type,
    description = excluded.description,
    onset_at = excluded.onset_at,
    resolved_at = excluded.resolved_at,
    status = excluded.status,
    recorded_by_profile_id = excluded.recorded_by_profile_id,
    metadata = coalesce(clinical.adverse_events.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = excluded.updated_at;

  get diagnostics v_adverse_events_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_patient_goals, '[]'::jsonb)) as x(
      id uuid,
      patient_id uuid,
      legacy_goal_id text,
      goal_type text,
      title text,
      target_value text,
      current_value text,
      target_date date,
      status text,
      legacy_created_by_user_id text,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz
    )
  )
  insert into clinical.patient_goals (
    id,
    patient_id,
    legacy_goal_id,
    goal_type,
    title,
    target_value,
    current_value,
    target_date,
    status,
    created_by_profile_id,
    metadata,
    created_at,
    updated_at
  )
  select
    rows.id,
    rows.patient_id,
    rows.legacy_goal_id,
    rows.goal_type,
    rows.title,
    rows.target_value,
    rows.current_value,
    rows.target_date,
    rows.status,
    private.runtime_profile_id_by_legacy_user_id(rows.legacy_created_by_user_id),
    coalesce(rows.metadata, '{}'::jsonb),
    coalesce(rows.created_at, now()),
    coalesce(rows.updated_at, coalesce(rows.created_at, now()))
  from rows
  where rows.id is not null
    and rows.patient_id is not null
    and nullif(trim(coalesce(rows.goal_type, '')), '') is not null
    and nullif(trim(coalesce(rows.title, '')), '') is not null
  on conflict (id) do update
  set
    patient_id = excluded.patient_id,
    legacy_goal_id = excluded.legacy_goal_id,
    goal_type = excluded.goal_type,
    title = excluded.title,
    target_value = excluded.target_value,
    current_value = excluded.current_value,
    target_date = excluded.target_date,
    status = excluded.status,
    created_by_profile_id = excluded.created_by_profile_id,
    metadata = coalesce(clinical.patient_goals.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = excluded.updated_at;

  get diagnostics v_patient_goals_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_prescription_records, '[]'::jsonb)) as x(
      id uuid,
      encounter_id uuid,
      patient_id uuid,
      legacy_prescription_id text,
      prescription_type text,
      summary text,
      legacy_issued_by_user_id text,
      issued_at timestamptz,
      metadata jsonb,
      created_at timestamptz
    )
  )
  insert into clinical.prescription_records (
    id,
    encounter_id,
    patient_id,
    legacy_prescription_id,
    prescription_type,
    summary,
    issued_by_profile_id,
    issued_at,
    metadata,
    created_at
  )
  select
    rows.id,
    rows.encounter_id,
    rows.patient_id,
    rows.legacy_prescription_id,
    lower(coalesce(rows.prescription_type, 'other')),
    rows.summary,
    private.runtime_profile_id_by_legacy_user_id(rows.legacy_issued_by_user_id),
    coalesce(rows.issued_at, now()),
    coalesce(rows.metadata, '{}'::jsonb),
    coalesce(rows.created_at, coalesce(rows.issued_at, now()))
  from rows
  where rows.id is not null
    and rows.encounter_id is not null
    and rows.patient_id is not null
  on conflict (id) do update
  set
    encounter_id = excluded.encounter_id,
    patient_id = excluded.patient_id,
    legacy_prescription_id = excluded.legacy_prescription_id,
    prescription_type = excluded.prescription_type,
    summary = excluded.summary,
    issued_by_profile_id = excluded.issued_by_profile_id,
    issued_at = excluded.issued_at,
    metadata = coalesce(clinical.prescription_records.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    created_at = excluded.created_at;

  get diagnostics v_prescription_records_count = row_count;

  return jsonb_build_object(
    'encounters', v_encounters_count,
    'anamneses', v_anamneses_count,
    'consultationNotes', v_consultation_notes_count,
    'carePlans', v_care_plans_count,
    'carePlanItems', v_care_plan_items_count,
    'clinicalTasks', v_clinical_tasks_count,
    'adverseEvents', v_adverse_events_count,
    'patientGoals', v_patient_goals_count,
    'prescriptionRecords', v_prescription_records_count
  );
end;
$$;

revoke all on function api.backfill_runtime_clinical_domain(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function api.backfill_runtime_clinical_domain(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;

create or replace function api.backfill_runtime_patient_logs(
  p_runtime_tenant_id uuid,
  p_habit_logs jsonb default '[]'::jsonb,
  p_hydration_logs jsonb default '[]'::jsonb,
  p_meal_logs jsonb default '[]'::jsonb,
  p_workout_logs jsonb default '[]'::jsonb,
  p_sleep_logs jsonb default '[]'::jsonb,
  p_symptom_logs jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_habit_logs_count integer := 0;
  v_hydration_logs_count integer := 0;
  v_meal_logs_count integer := 0;
  v_workout_logs_count integer := 0;
  v_sleep_logs_count integer := 0;
  v_symptom_logs_count integer := 0;
begin
  if p_runtime_tenant_id is null then
    raise exception 'p_runtime_tenant_id is required';
  end if;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_habit_logs, '[]'::jsonb)) as x(
      id uuid,
      patient_id uuid,
      legacy_habit_log_id text,
      logged_at timestamptz,
      kind text,
      value_text text,
      value_num numeric,
      metadata jsonb,
      created_at timestamptz
    )
  )
  insert into clinical.habit_logs (
    id,
    patient_id,
    legacy_habit_log_id,
    logged_at,
    kind,
    value_text,
    value_num,
    metadata,
    created_at
  )
  select
    rows.id,
    rows.patient_id,
    rows.legacy_habit_log_id,
    coalesce(rows.logged_at, now()),
    rows.kind,
    rows.value_text,
    rows.value_num,
    coalesce(rows.metadata, '{}'::jsonb),
    coalesce(rows.created_at, coalesce(rows.logged_at, now()))
  from rows
  where rows.id is not null
    and rows.patient_id is not null
    and nullif(trim(coalesce(rows.kind, '')), '') is not null
  on conflict (id) do update
  set
    patient_id = excluded.patient_id,
    legacy_habit_log_id = excluded.legacy_habit_log_id,
    logged_at = excluded.logged_at,
    kind = excluded.kind,
    value_text = excluded.value_text,
    value_num = excluded.value_num,
    metadata = coalesce(clinical.habit_logs.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    created_at = excluded.created_at;

  get diagnostics v_habit_logs_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_hydration_logs, '[]'::jsonb)) as x(
      id uuid,
      patient_id uuid,
      legacy_hydration_log_id text,
      logged_at timestamptz,
      volume_ml integer,
      metadata jsonb,
      created_at timestamptz
    )
  )
  insert into clinical.hydration_logs (
    id,
    patient_id,
    legacy_hydration_log_id,
    logged_at,
    volume_ml,
    metadata,
    created_at
  )
  select
    rows.id,
    rows.patient_id,
    rows.legacy_hydration_log_id,
    coalesce(rows.logged_at, now()),
    greatest(coalesce(rows.volume_ml, 0), 1),
    coalesce(rows.metadata, '{}'::jsonb),
    coalesce(rows.created_at, coalesce(rows.logged_at, now()))
  from rows
  where rows.id is not null
    and rows.patient_id is not null
  on conflict (id) do update
  set
    patient_id = excluded.patient_id,
    legacy_hydration_log_id = excluded.legacy_hydration_log_id,
    logged_at = excluded.logged_at,
    volume_ml = excluded.volume_ml,
    metadata = coalesce(clinical.hydration_logs.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    created_at = excluded.created_at;

  get diagnostics v_hydration_logs_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_meal_logs, '[]'::jsonb)) as x(
      id uuid,
      patient_id uuid,
      legacy_meal_log_id text,
      logged_at timestamptz,
      meal_type text,
      description text,
      photo_path text,
      adherence_rating integer,
      notes text,
      metadata jsonb,
      created_at timestamptz
    )
  )
  insert into clinical.meal_logs (
    id,
    patient_id,
    legacy_meal_log_id,
    logged_at,
    meal_type,
    description,
    photo_path,
    adherence_rating,
    notes,
    metadata,
    created_at
  )
  select
    rows.id,
    rows.patient_id,
    rows.legacy_meal_log_id,
    coalesce(rows.logged_at, now()),
    rows.meal_type,
    rows.description,
    rows.photo_path,
    rows.adherence_rating,
    rows.notes,
    coalesce(rows.metadata, '{}'::jsonb),
    coalesce(rows.created_at, coalesce(rows.logged_at, now()))
  from rows
  where rows.id is not null
    and rows.patient_id is not null
  on conflict (id) do update
  set
    patient_id = excluded.patient_id,
    legacy_meal_log_id = excluded.legacy_meal_log_id,
    logged_at = excluded.logged_at,
    meal_type = excluded.meal_type,
    description = excluded.description,
    photo_path = excluded.photo_path,
    adherence_rating = excluded.adherence_rating,
    notes = excluded.notes,
    metadata = coalesce(clinical.meal_logs.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    created_at = excluded.created_at;

  get diagnostics v_meal_logs_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_workout_logs, '[]'::jsonb)) as x(
      id uuid,
      patient_id uuid,
      legacy_workout_log_id text,
      logged_at timestamptz,
      workout_type text,
      duration_minutes integer,
      intensity text,
      completed boolean,
      notes text,
      metadata jsonb,
      created_at timestamptz
    )
  )
  insert into clinical.workout_logs (
    id,
    patient_id,
    legacy_workout_log_id,
    logged_at,
    workout_type,
    duration_minutes,
    intensity,
    completed,
    notes,
    metadata,
    created_at
  )
  select
    rows.id,
    rows.patient_id,
    rows.legacy_workout_log_id,
    coalesce(rows.logged_at, now()),
    rows.workout_type,
    rows.duration_minutes,
    rows.intensity,
    coalesce(rows.completed, true),
    rows.notes,
    coalesce(rows.metadata, '{}'::jsonb),
    coalesce(rows.created_at, coalesce(rows.logged_at, now()))
  from rows
  where rows.id is not null
    and rows.patient_id is not null
  on conflict (id) do update
  set
    patient_id = excluded.patient_id,
    legacy_workout_log_id = excluded.legacy_workout_log_id,
    logged_at = excluded.logged_at,
    workout_type = excluded.workout_type,
    duration_minutes = excluded.duration_minutes,
    intensity = excluded.intensity,
    completed = excluded.completed,
    notes = excluded.notes,
    metadata = coalesce(clinical.workout_logs.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    created_at = excluded.created_at;

  get diagnostics v_workout_logs_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_sleep_logs, '[]'::jsonb)) as x(
      id uuid,
      patient_id uuid,
      legacy_sleep_log_id text,
      sleep_date date,
      hours_slept numeric,
      sleep_quality_score integer,
      notes text,
      metadata jsonb,
      created_at timestamptz
    )
  )
  insert into clinical.sleep_logs (
    id,
    patient_id,
    legacy_sleep_log_id,
    sleep_date,
    hours_slept,
    sleep_quality_score,
    notes,
    metadata,
    created_at
  )
  select
    rows.id,
    rows.patient_id,
    rows.legacy_sleep_log_id,
    rows.sleep_date,
    rows.hours_slept,
    rows.sleep_quality_score,
    rows.notes,
    coalesce(rows.metadata, '{}'::jsonb),
    coalesce(rows.created_at, now())
  from rows
  where rows.id is not null
    and rows.patient_id is not null
    and rows.sleep_date is not null
  on conflict (id) do update
  set
    patient_id = excluded.patient_id,
    legacy_sleep_log_id = excluded.legacy_sleep_log_id,
    sleep_date = excluded.sleep_date,
    hours_slept = excluded.hours_slept,
    sleep_quality_score = excluded.sleep_quality_score,
    notes = excluded.notes,
    metadata = coalesce(clinical.sleep_logs.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    created_at = excluded.created_at;

  get diagnostics v_sleep_logs_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_symptom_logs, '[]'::jsonb)) as x(
      id uuid,
      patient_id uuid,
      legacy_symptom_log_id text,
      logged_at timestamptz,
      symptom_type text,
      severity_score integer,
      description text,
      notes text,
      metadata jsonb,
      created_at timestamptz
    )
  )
  insert into clinical.symptom_logs (
    id,
    patient_id,
    legacy_symptom_log_id,
    logged_at,
    symptom_type,
    severity_score,
    description,
    notes,
    metadata,
    created_at
  )
  select
    rows.id,
    rows.patient_id,
    rows.legacy_symptom_log_id,
    coalesce(rows.logged_at, now()),
    rows.symptom_type,
    rows.severity_score,
    rows.description,
    rows.notes,
    coalesce(rows.metadata, '{}'::jsonb),
    coalesce(rows.created_at, coalesce(rows.logged_at, now()))
  from rows
  where rows.id is not null
    and rows.patient_id is not null
    and nullif(trim(coalesce(rows.symptom_type, '')), '') is not null
  on conflict (id) do update
  set
    patient_id = excluded.patient_id,
    legacy_symptom_log_id = excluded.legacy_symptom_log_id,
    logged_at = excluded.logged_at,
    symptom_type = excluded.symptom_type,
    severity_score = excluded.severity_score,
    description = excluded.description,
    notes = excluded.notes,
    metadata = coalesce(clinical.symptom_logs.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    created_at = excluded.created_at;

  get diagnostics v_symptom_logs_count = row_count;

  return jsonb_build_object(
    'habitLogs', v_habit_logs_count,
    'hydrationLogs', v_hydration_logs_count,
    'mealLogs', v_meal_logs_count,
    'workoutLogs', v_workout_logs_count,
    'sleepLogs', v_sleep_logs_count,
    'symptomLogs', v_symptom_logs_count
  );
end;
$$;

revoke all on function api.backfill_runtime_patient_logs(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function api.backfill_runtime_patient_logs(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;
