create or replace function private.runtime_patient_id_by_legacy_patient_id(
  p_runtime_tenant_id uuid,
  p_legacy_patient_id text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select patients.id
  from patients.patients as patients
  where patients.tenant_id = p_runtime_tenant_id
    and patients.legacy_patient_id = p_legacy_patient_id
  limit 1
$$;

create or replace function private.runtime_professional_id_by_legacy_professional_id(
  p_runtime_tenant_id uuid,
  p_legacy_professional_id text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select professionals.id
  from scheduling.professionals as professionals
  where professionals.tenant_id = p_runtime_tenant_id
    and professionals.legacy_professional_id = p_legacy_professional_id
  limit 1
$$;

create or replace function private.runtime_appointment_type_id_by_legacy_appointment_type_id(
  p_runtime_tenant_id uuid,
  p_legacy_appointment_type_id text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select appointment_types.id
  from scheduling.appointment_types as appointment_types
  where appointment_types.tenant_id = p_runtime_tenant_id
    and appointment_types.legacy_appointment_type_id = p_legacy_appointment_type_id
  limit 1
$$;

revoke all on function private.runtime_patient_id_by_legacy_patient_id(uuid, text) from public, anon, authenticated;
revoke all on function private.runtime_professional_id_by_legacy_professional_id(uuid, text) from public, anon, authenticated;
revoke all on function private.runtime_appointment_type_id_by_legacy_appointment_type_id(uuid, text) from public, anon, authenticated;

grant execute on function private.runtime_patient_id_by_legacy_patient_id(uuid, text) to service_role;
grant execute on function private.runtime_professional_id_by_legacy_professional_id(uuid, text) to service_role;
grant execute on function private.runtime_appointment_type_id_by_legacy_appointment_type_id(uuid, text) to service_role;

create or replace function api.upsert_runtime_appointment_from_legacy(
  p_legacy_tenant_id text,
  p_legacy_appointment_id text,
  p_legacy_unit_id text,
  p_legacy_patient_id text,
  p_legacy_appointment_type_id text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_status text default 'scheduled',
  p_source text default 'internal',
  p_legacy_professional_id text default null,
  p_notes text default null,
  p_legacy_created_by_user_id text default null,
  p_confirmed_at timestamptz default null,
  p_checked_in_at timestamptz default null,
  p_canceled_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb,
  p_created_at timestamptz default null,
  p_updated_at timestamptz default null,
  p_deleted_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runtime_tenant_id uuid := private.runtime_tenant_id_by_legacy_tenant_id(p_legacy_tenant_id);
  v_runtime_unit_id uuid;
  v_runtime_patient_id uuid;
  v_runtime_professional_id uuid;
  v_runtime_appointment_type_id uuid;
  v_created_by_profile_id uuid := private.runtime_profile_id_by_legacy_user_id(p_legacy_created_by_user_id);
  v_appointment_id uuid;
  v_legacy_appointment_id text := nullif(trim(coalesce(p_legacy_appointment_id, '')), '');
  v_legacy_unit_id text := nullif(trim(coalesce(p_legacy_unit_id, '')), '');
  v_legacy_patient_id text := nullif(trim(coalesce(p_legacy_patient_id, '')), '');
  v_legacy_appointment_type_id text := nullif(trim(coalesce(p_legacy_appointment_type_id, '')), '');
  v_legacy_professional_id text := nullif(trim(coalesce(p_legacy_professional_id, '')), '');
  v_status text := lower(coalesce(nullif(trim(coalesce(p_status, '')), ''), 'scheduled'));
  v_source text := lower(coalesce(nullif(trim(coalesce(p_source, '')), ''), 'internal'));
  v_metadata jsonb;
begin
  if nullif(trim(coalesce(p_legacy_tenant_id, '')), '') is null then
    raise exception 'p_legacy_tenant_id is required';
  end if;

  if v_runtime_tenant_id is null then
    raise exception 'runtime tenant not found for legacy tenant %', p_legacy_tenant_id;
  end if;

  if v_legacy_appointment_id is null then
    raise exception 'p_legacy_appointment_id is required';
  end if;

  if v_legacy_unit_id is null then
    raise exception 'p_legacy_unit_id is required';
  end if;

  if v_legacy_patient_id is null then
    raise exception 'p_legacy_patient_id is required';
  end if;

  if v_legacy_appointment_type_id is null then
    raise exception 'p_legacy_appointment_type_id is required';
  end if;

  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'appointment period is invalid';
  end if;

  if v_status not in ('scheduled', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show') then
    raise exception 'invalid appointment status %', v_status;
  end if;

  if v_source not in ('internal', 'patient_app', 'crm', 'automation', 'other') then
    raise exception 'invalid appointment source %', v_source;
  end if;

  v_runtime_unit_id := private.runtime_unit_id_by_legacy_unit_id(v_runtime_tenant_id, v_legacy_unit_id);
  if v_runtime_unit_id is null then
    raise exception 'runtime unit not found for legacy unit %', v_legacy_unit_id;
  end if;

  v_runtime_patient_id := private.runtime_patient_id_by_legacy_patient_id(v_runtime_tenant_id, v_legacy_patient_id);
  if v_runtime_patient_id is null then
    raise exception 'runtime patient not found for legacy patient %', v_legacy_patient_id;
  end if;

  v_runtime_appointment_type_id := private.runtime_appointment_type_id_by_legacy_appointment_type_id(
    v_runtime_tenant_id,
    v_legacy_appointment_type_id
  );
  if v_runtime_appointment_type_id is null then
    raise exception 'runtime appointment type not found for legacy appointment type %', v_legacy_appointment_type_id;
  end if;

  if v_legacy_professional_id is not null then
    v_runtime_professional_id := private.runtime_professional_id_by_legacy_professional_id(
      v_runtime_tenant_id,
      v_legacy_professional_id
    );

    if v_runtime_professional_id is null then
      raise exception 'runtime professional not found for legacy professional %', v_legacy_professional_id;
    end if;
  else
    v_runtime_professional_id := null;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not private.can_manage_schedule_domain(v_runtime_tenant_id, v_runtime_unit_id) then
    raise exception 'appointment write denied';
  end if;

  v_metadata := jsonb_strip_nulls(
    coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'source', 'api_runtime_write',
      'legacy_tenant_id', p_legacy_tenant_id,
      'legacy_unit_id', v_legacy_unit_id,
      'legacy_patient_id', v_legacy_patient_id,
      'legacy_appointment_type_id', v_legacy_appointment_type_id,
      'legacy_professional_id', v_legacy_professional_id,
      'legacy_created_by_user_id', p_legacy_created_by_user_id,
      'created_by_profile_id', v_created_by_profile_id
    )
  );

  select appointments.id
  into v_appointment_id
  from scheduling.appointments as appointments
  where appointments.tenant_id = v_runtime_tenant_id
    and appointments.legacy_appointment_id = v_legacy_appointment_id
  limit 1;

  if v_appointment_id is null then
    insert into scheduling.appointments (
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
    values (
      v_runtime_tenant_id,
      v_runtime_unit_id,
      v_runtime_patient_id,
      v_runtime_professional_id,
      v_runtime_appointment_type_id,
      v_legacy_appointment_id,
      p_starts_at,
      p_ends_at,
      v_status,
      v_source,
      p_notes,
      v_created_by_profile_id,
      p_confirmed_at,
      p_checked_in_at,
      p_canceled_at,
      v_metadata,
      coalesce(p_created_at, now()),
      coalesce(p_updated_at, coalesce(p_created_at, now())),
      p_deleted_at
    )
    returning id into v_appointment_id;
  else
    update scheduling.appointments
    set
      tenant_id = v_runtime_tenant_id,
      unit_id = v_runtime_unit_id,
      patient_id = v_runtime_patient_id,
      professional_id = v_runtime_professional_id,
      appointment_type_id = v_runtime_appointment_type_id,
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      status = v_status,
      source = v_source,
      notes = coalesce(p_notes, scheduling.appointments.notes),
      created_by_profile_id = coalesce(v_created_by_profile_id, scheduling.appointments.created_by_profile_id),
      confirmed_at = coalesce(p_confirmed_at, scheduling.appointments.confirmed_at),
      checked_in_at = coalesce(p_checked_in_at, scheduling.appointments.checked_in_at),
      canceled_at = coalesce(p_canceled_at, scheduling.appointments.canceled_at),
      metadata = coalesce(scheduling.appointments.metadata, '{}'::jsonb) || v_metadata,
      updated_at = coalesce(p_updated_at, now()),
      deleted_at = p_deleted_at
    where scheduling.appointments.id = v_appointment_id;
  end if;

  return jsonb_build_object(
    'id', v_appointment_id::text,
    'legacyAppointmentId', v_legacy_appointment_id,
    'status', v_status,
    'source', 'supabase_runtime'
  );
end;
$$;

revoke all on function api.upsert_runtime_appointment_from_legacy(text, text, text, text, text, timestamptz, timestamptz, text, text, text, text, text, timestamptz, timestamptz, timestamptz, jsonb, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function api.upsert_runtime_appointment_from_legacy(text, text, text, text, text, timestamptz, timestamptz, text, text, text, text, text, timestamptz, timestamptz, timestamptz, jsonb, timestamptz, timestamptz, timestamptz) to service_role;

create or replace function public.upsert_runtime_appointment_from_legacy(
  p_legacy_tenant_id text,
  p_legacy_appointment_id text,
  p_legacy_unit_id text,
  p_legacy_patient_id text,
  p_legacy_appointment_type_id text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_status text default 'scheduled',
  p_source text default 'internal',
  p_legacy_professional_id text default null,
  p_notes text default null,
  p_legacy_created_by_user_id text default null,
  p_confirmed_at timestamptz default null,
  p_checked_in_at timestamptz default null,
  p_canceled_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb,
  p_created_at timestamptz default null,
  p_updated_at timestamptz default null,
  p_deleted_at timestamptz default null
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.upsert_runtime_appointment_from_legacy(
    p_legacy_tenant_id,
    p_legacy_appointment_id,
    p_legacy_unit_id,
    p_legacy_patient_id,
    p_legacy_appointment_type_id,
    p_starts_at,
    p_ends_at,
    p_status,
    p_source,
    p_legacy_professional_id,
    p_notes,
    p_legacy_created_by_user_id,
    p_confirmed_at,
    p_checked_in_at,
    p_canceled_at,
    p_metadata,
    p_created_at,
    p_updated_at,
    p_deleted_at
  )
$$;

revoke all on function public.upsert_runtime_appointment_from_legacy(text, text, text, text, text, timestamptz, timestamptz, text, text, text, text, text, timestamptz, timestamptz, timestamptz, jsonb, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.upsert_runtime_appointment_from_legacy(text, text, text, text, text, timestamptz, timestamptz, text, text, text, text, text, timestamptz, timestamptz, timestamptz, jsonb, timestamptz, timestamptz, timestamptz) to service_role;
