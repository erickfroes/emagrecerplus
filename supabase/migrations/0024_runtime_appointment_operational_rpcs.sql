create or replace function api.create_appointment(
  p_legacy_tenant_id text,
  p_legacy_appointment_id text,
  p_legacy_unit_id text,
  p_legacy_patient_id text,
  p_legacy_appointment_type_id text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_legacy_professional_id text default null,
  p_notes text default null,
  p_source text default 'internal',
  p_legacy_created_by_user_id text default null,
  p_created_at timestamptz default null,
  p_updated_at timestamptz default null,
  p_deleted_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
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
  v_runtime_appointment_id uuid;
  v_actor_profile_id uuid := private.runtime_profile_id_by_legacy_user_id(p_legacy_created_by_user_id);
  v_actor_type text := case
    when v_actor_profile_id is not null then 'profile'
    when coalesce(auth.role(), '') = 'service_role' then 'service_role'
    else 'profile'
  end;
  v_created_at timestamptz := coalesce(p_created_at, now());
  v_metadata jsonb;
  v_result jsonb;
begin
  if nullif(trim(coalesce(p_legacy_tenant_id, '')), '') is null then
    raise exception 'p_legacy_tenant_id is required';
  end if;

  if v_runtime_tenant_id is null then
    raise exception 'runtime tenant not found for legacy tenant %', p_legacy_tenant_id;
  end if;

  v_runtime_unit_id := private.runtime_unit_id_by_legacy_unit_id(v_runtime_tenant_id, p_legacy_unit_id);
  v_runtime_patient_id := private.runtime_patient_id_by_legacy_patient_id(v_runtime_tenant_id, p_legacy_patient_id);

  if v_runtime_unit_id is null then
    raise exception 'runtime unit not found for legacy unit %', p_legacy_unit_id;
  end if;

  if v_runtime_patient_id is null then
    raise exception 'runtime patient not found for legacy patient %', p_legacy_patient_id;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not private.can_manage_schedule_domain(v_runtime_tenant_id, v_runtime_unit_id) then
    raise exception 'create appointment denied';
  end if;

  v_runtime_appointment_id := private.runtime_appointment_id_by_legacy_appointment_id(
    v_runtime_tenant_id,
    p_legacy_appointment_id
  );

  if v_runtime_appointment_id is not null then
    return jsonb_build_object(
      'id', v_runtime_appointment_id::text,
      'legacyAppointmentId', p_legacy_appointment_id,
      'status', 'scheduled',
      'source', 'supabase_runtime'
    );
  end if;

  v_metadata := jsonb_strip_nulls(
    coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'source', 'api_operational_flow',
      'operation', 'create_appointment',
      'legacy_tenant_id', p_legacy_tenant_id,
      'legacy_unit_id', p_legacy_unit_id,
      'legacy_patient_id', p_legacy_patient_id,
      'legacy_appointment_type_id', p_legacy_appointment_type_id,
      'legacy_professional_id', p_legacy_professional_id,
      'legacy_created_by_user_id', p_legacy_created_by_user_id
    )
  );

  v_result := api.upsert_runtime_appointment_from_legacy(
    p_legacy_tenant_id => p_legacy_tenant_id,
    p_legacy_appointment_id => p_legacy_appointment_id,
    p_legacy_unit_id => p_legacy_unit_id,
    p_legacy_patient_id => p_legacy_patient_id,
    p_legacy_appointment_type_id => p_legacy_appointment_type_id,
    p_starts_at => p_starts_at,
    p_ends_at => p_ends_at,
    p_status => 'scheduled',
    p_source => p_source,
    p_legacy_professional_id => p_legacy_professional_id,
    p_notes => p_notes,
    p_legacy_created_by_user_id => p_legacy_created_by_user_id,
    p_metadata => v_metadata,
    p_created_at => v_created_at,
    p_updated_at => coalesce(p_updated_at, v_created_at),
    p_deleted_at => p_deleted_at
  );

  v_runtime_appointment_id := nullif(v_result ->> 'id', '')::uuid;

  perform private.record_audit_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => v_runtime_unit_id,
    p_patient_id => v_runtime_patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => v_actor_profile_id,
    p_event_type => 'scheduling.appointment_created',
    p_action => 'create',
    p_resource_schema => 'scheduling',
    p_resource_table => 'appointments',
    p_resource_id => v_runtime_appointment_id,
    p_payload => jsonb_build_object(
      'legacyAppointmentId', p_legacy_appointment_id,
      'status', 'scheduled',
      'startsAt', p_starts_at,
      'endsAt', p_ends_at
    ) || v_metadata
  );

  perform private.record_patient_timeline_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => v_runtime_unit_id,
    p_patient_id => v_runtime_patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => v_actor_profile_id,
    p_event_type => 'appointment_created',
    p_event_at => v_created_at,
    p_source_schema => 'scheduling',
    p_source_table => 'appointments',
    p_source_id => v_runtime_appointment_id,
    p_payload => jsonb_build_object(
      'legacyAppointmentId', p_legacy_appointment_id,
      'status', 'scheduled',
      'startsAt', p_starts_at,
      'endsAt', p_ends_at
    ) || v_metadata
  );

  return jsonb_build_object(
    'id', v_runtime_appointment_id::text,
    'legacyAppointmentId', p_legacy_appointment_id,
    'status', 'scheduled',
    'source', 'supabase_runtime'
  );
end;
$$;

revoke all on function api.create_appointment(text, text, text, text, text, timestamptz, timestamptz, text, text, text, text, timestamptz, timestamptz, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function api.create_appointment(text, text, text, text, text, timestamptz, timestamptz, text, text, text, text, timestamptz, timestamptz, timestamptz, jsonb) to service_role;

create or replace function public.create_appointment(
  p_legacy_tenant_id text,
  p_legacy_appointment_id text,
  p_legacy_unit_id text,
  p_legacy_patient_id text,
  p_legacy_appointment_type_id text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_legacy_professional_id text default null,
  p_notes text default null,
  p_source text default 'internal',
  p_legacy_created_by_user_id text default null,
  p_created_at timestamptz default null,
  p_updated_at timestamptz default null,
  p_deleted_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.create_appointment(
    p_legacy_tenant_id,
    p_legacy_appointment_id,
    p_legacy_unit_id,
    p_legacy_patient_id,
    p_legacy_appointment_type_id,
    p_starts_at,
    p_ends_at,
    p_legacy_professional_id,
    p_notes,
    p_source,
    p_legacy_created_by_user_id,
    p_created_at,
    p_updated_at,
    p_deleted_at,
    p_metadata
  )
$$;

revoke all on function public.create_appointment(text, text, text, text, text, timestamptz, timestamptz, text, text, text, text, timestamptz, timestamptz, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.create_appointment(text, text, text, text, text, timestamptz, timestamptz, text, text, text, text, timestamptz, timestamptz, timestamptz, jsonb) to service_role;

create or replace function api.confirm_appointment(
  p_legacy_tenant_id text,
  p_legacy_appointment_id text,
  p_confirmed_at timestamptz default null,
  p_legacy_actor_user_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runtime_tenant_id uuid := private.runtime_tenant_id_by_legacy_tenant_id(p_legacy_tenant_id);
  v_runtime_appointment_id uuid;
  v_runtime_unit_id uuid;
  v_runtime_patient_id uuid;
  v_current_status text;
  v_actor_profile_id uuid := private.runtime_profile_id_by_legacy_user_id(p_legacy_actor_user_id);
  v_actor_type text := case
    when v_actor_profile_id is not null then 'profile'
    when coalesce(auth.role(), '') = 'service_role' then 'service_role'
    else 'profile'
  end;
  v_confirmed_at timestamptz := coalesce(p_confirmed_at, now());
  v_metadata jsonb;
begin
  select
    appointments.id,
    appointments.unit_id,
    appointments.patient_id,
    appointments.status
  into
    v_runtime_appointment_id,
    v_runtime_unit_id,
    v_runtime_patient_id,
    v_current_status
  from scheduling.appointments as appointments
  where appointments.tenant_id = v_runtime_tenant_id
    and appointments.legacy_appointment_id = p_legacy_appointment_id
    and appointments.deleted_at is null
  limit 1;

  if v_runtime_appointment_id is null then
    raise exception 'runtime appointment not found for legacy appointment %', p_legacy_appointment_id;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not private.can_manage_schedule_domain(v_runtime_tenant_id, v_runtime_unit_id) then
    raise exception 'confirm appointment denied';
  end if;

  if v_current_status = 'confirmed' then
    return jsonb_build_object(
      'id', v_runtime_appointment_id::text,
      'legacyAppointmentId', p_legacy_appointment_id,
      'status', 'confirmed',
      'source', 'supabase_runtime'
    );
  end if;

  if v_current_status in ('checked_in', 'in_progress', 'completed', 'cancelled', 'no_show') then
    raise exception 'appointment % cannot transition from % to confirmed', p_legacy_appointment_id, v_current_status;
  end if;

  v_metadata := jsonb_strip_nulls(
    coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'source', 'api_operational_flow',
      'operation', 'confirm_appointment',
      'legacy_tenant_id', p_legacy_tenant_id,
      'legacy_appointment_id', p_legacy_appointment_id,
      'legacy_actor_user_id', p_legacy_actor_user_id
    )
  );

  update scheduling.appointments
  set
    status = 'confirmed',
    confirmed_at = coalesce(scheduling.appointments.confirmed_at, v_confirmed_at),
    metadata = coalesce(scheduling.appointments.metadata, '{}'::jsonb) || v_metadata,
    updated_at = now()
  where scheduling.appointments.id = v_runtime_appointment_id;

  perform private.record_audit_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => v_runtime_unit_id,
    p_patient_id => v_runtime_patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => v_actor_profile_id,
    p_event_type => 'scheduling.appointment_confirmed',
    p_action => 'confirm',
    p_resource_schema => 'scheduling',
    p_resource_table => 'appointments',
    p_resource_id => v_runtime_appointment_id,
    p_payload => jsonb_build_object(
      'legacyAppointmentId', p_legacy_appointment_id,
      'status', 'confirmed',
      'confirmedAt', v_confirmed_at
    ) || v_metadata
  );

  perform private.record_patient_timeline_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => v_runtime_unit_id,
    p_patient_id => v_runtime_patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => v_actor_profile_id,
    p_event_type => 'appointment_confirmed',
    p_event_at => v_confirmed_at,
    p_source_schema => 'scheduling',
    p_source_table => 'appointments',
    p_source_id => v_runtime_appointment_id,
    p_payload => jsonb_build_object(
      'legacyAppointmentId', p_legacy_appointment_id,
      'status', 'confirmed',
      'confirmedAt', v_confirmed_at
    ) || v_metadata
  );

  return jsonb_build_object(
    'id', v_runtime_appointment_id::text,
    'legacyAppointmentId', p_legacy_appointment_id,
    'status', 'confirmed',
    'source', 'supabase_runtime'
  );
end;
$$;

revoke all on function api.confirm_appointment(text, text, timestamptz, text, jsonb) from public, anon, authenticated;
grant execute on function api.confirm_appointment(text, text, timestamptz, text, jsonb) to service_role;

create or replace function public.confirm_appointment(
  p_legacy_tenant_id text,
  p_legacy_appointment_id text,
  p_confirmed_at timestamptz default null,
  p_legacy_actor_user_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.confirm_appointment(
    p_legacy_tenant_id,
    p_legacy_appointment_id,
    p_confirmed_at,
    p_legacy_actor_user_id,
    p_metadata
  )
$$;

revoke all on function public.confirm_appointment(text, text, timestamptz, text, jsonb) from public, anon, authenticated;
grant execute on function public.confirm_appointment(text, text, timestamptz, text, jsonb) to service_role;

create or replace function api.register_checkin(
  p_legacy_tenant_id text,
  p_legacy_appointment_id text,
  p_checked_in_at timestamptz default null,
  p_legacy_actor_user_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runtime_tenant_id uuid := private.runtime_tenant_id_by_legacy_tenant_id(p_legacy_tenant_id);
  v_runtime_appointment_id uuid;
  v_runtime_unit_id uuid;
  v_runtime_patient_id uuid;
  v_current_status text;
  v_actor_profile_id uuid := private.runtime_profile_id_by_legacy_user_id(p_legacy_actor_user_id);
  v_actor_type text := case
    when v_actor_profile_id is not null then 'profile'
    when coalesce(auth.role(), '') = 'service_role' then 'service_role'
    else 'profile'
  end;
  v_checked_in_at timestamptz := coalesce(p_checked_in_at, now());
  v_metadata jsonb;
begin
  select
    appointments.id,
    appointments.unit_id,
    appointments.patient_id,
    appointments.status
  into
    v_runtime_appointment_id,
    v_runtime_unit_id,
    v_runtime_patient_id,
    v_current_status
  from scheduling.appointments as appointments
  where appointments.tenant_id = v_runtime_tenant_id
    and appointments.legacy_appointment_id = p_legacy_appointment_id
    and appointments.deleted_at is null
  limit 1;

  if v_runtime_appointment_id is null then
    raise exception 'runtime appointment not found for legacy appointment %', p_legacy_appointment_id;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not private.can_manage_schedule_domain(v_runtime_tenant_id, v_runtime_unit_id) then
    raise exception 'register checkin denied';
  end if;

  if v_current_status in ('cancelled', 'no_show') then
    raise exception 'appointment % cannot transition from % to checked_in', p_legacy_appointment_id, v_current_status;
  end if;

  if v_current_status in ('checked_in', 'in_progress', 'completed') then
    return jsonb_build_object(
      'id', v_runtime_appointment_id::text,
      'legacyAppointmentId', p_legacy_appointment_id,
      'status', v_current_status,
      'source', 'supabase_runtime'
    );
  end if;

  v_metadata := jsonb_strip_nulls(
    coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'source', 'api_operational_flow',
      'operation', 'register_checkin',
      'legacy_tenant_id', p_legacy_tenant_id,
      'legacy_appointment_id', p_legacy_appointment_id,
      'legacy_actor_user_id', p_legacy_actor_user_id
    )
  );

  update scheduling.appointments
  set
    status = 'checked_in',
    checked_in_at = coalesce(scheduling.appointments.checked_in_at, v_checked_in_at),
    metadata = coalesce(scheduling.appointments.metadata, '{}'::jsonb) || v_metadata,
    updated_at = now()
  where scheduling.appointments.id = v_runtime_appointment_id;

  perform private.record_audit_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => v_runtime_unit_id,
    p_patient_id => v_runtime_patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => v_actor_profile_id,
    p_event_type => 'scheduling.appointment_checked_in',
    p_action => 'check_in',
    p_resource_schema => 'scheduling',
    p_resource_table => 'appointments',
    p_resource_id => v_runtime_appointment_id,
    p_payload => jsonb_build_object(
      'legacyAppointmentId', p_legacy_appointment_id,
      'status', 'checked_in',
      'checkedInAt', v_checked_in_at
    ) || v_metadata
  );

  perform private.record_patient_timeline_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => v_runtime_unit_id,
    p_patient_id => v_runtime_patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => v_actor_profile_id,
    p_event_type => 'appointment_checked_in',
    p_event_at => v_checked_in_at,
    p_source_schema => 'scheduling',
    p_source_table => 'appointments',
    p_source_id => v_runtime_appointment_id,
    p_payload => jsonb_build_object(
      'legacyAppointmentId', p_legacy_appointment_id,
      'status', 'checked_in',
      'checkedInAt', v_checked_in_at
    ) || v_metadata
  );

  return jsonb_build_object(
    'id', v_runtime_appointment_id::text,
    'legacyAppointmentId', p_legacy_appointment_id,
    'status', 'checked_in',
    'source', 'supabase_runtime'
  );
end;
$$;

revoke all on function api.register_checkin(text, text, timestamptz, text, jsonb) from public, anon, authenticated;
grant execute on function api.register_checkin(text, text, timestamptz, text, jsonb) to service_role;

create or replace function public.register_checkin(
  p_legacy_tenant_id text,
  p_legacy_appointment_id text,
  p_checked_in_at timestamptz default null,
  p_legacy_actor_user_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.register_checkin(
    p_legacy_tenant_id,
    p_legacy_appointment_id,
    p_checked_in_at,
    p_legacy_actor_user_id,
    p_metadata
  )
$$;

revoke all on function public.register_checkin(text, text, timestamptz, text, jsonb) from public, anon, authenticated;
grant execute on function public.register_checkin(text, text, timestamptz, text, jsonb) to service_role;

create or replace function api.cancel_appointment(
  p_legacy_tenant_id text,
  p_legacy_appointment_id text,
  p_canceled_at timestamptz default null,
  p_notes text default null,
  p_reason text default null,
  p_legacy_actor_user_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runtime_tenant_id uuid := private.runtime_tenant_id_by_legacy_tenant_id(p_legacy_tenant_id);
  v_runtime_appointment_id uuid;
  v_runtime_unit_id uuid;
  v_runtime_patient_id uuid;
  v_current_status text;
  v_actor_profile_id uuid := private.runtime_profile_id_by_legacy_user_id(p_legacy_actor_user_id);
  v_actor_type text := case
    when v_actor_profile_id is not null then 'profile'
    when coalesce(auth.role(), '') = 'service_role' then 'service_role'
    else 'profile'
  end;
  v_canceled_at timestamptz := coalesce(p_canceled_at, now());
  v_metadata jsonb;
begin
  select
    appointments.id,
    appointments.unit_id,
    appointments.patient_id,
    appointments.status
  into
    v_runtime_appointment_id,
    v_runtime_unit_id,
    v_runtime_patient_id,
    v_current_status
  from scheduling.appointments as appointments
  where appointments.tenant_id = v_runtime_tenant_id
    and appointments.legacy_appointment_id = p_legacy_appointment_id
    and appointments.deleted_at is null
  limit 1;

  if v_runtime_appointment_id is null then
    raise exception 'runtime appointment not found for legacy appointment %', p_legacy_appointment_id;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not private.can_manage_schedule_domain(v_runtime_tenant_id, v_runtime_unit_id) then
    raise exception 'cancel appointment denied';
  end if;

  if v_current_status = 'cancelled' then
    return jsonb_build_object(
      'id', v_runtime_appointment_id::text,
      'legacyAppointmentId', p_legacy_appointment_id,
      'status', 'cancelled',
      'source', 'supabase_runtime'
    );
  end if;

  if v_current_status in ('checked_in', 'in_progress', 'completed', 'no_show') then
    raise exception 'appointment % cannot transition from % to cancelled', p_legacy_appointment_id, v_current_status;
  end if;

  v_metadata := jsonb_strip_nulls(
    coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'source', 'api_operational_flow',
      'operation', 'cancel_appointment',
      'legacy_tenant_id', p_legacy_tenant_id,
      'legacy_appointment_id', p_legacy_appointment_id,
      'legacy_actor_user_id', p_legacy_actor_user_id,
      'reason', p_reason
    )
  );

  update scheduling.appointments
  set
    status = 'cancelled',
    notes = coalesce(p_notes, scheduling.appointments.notes),
    canceled_at = coalesce(scheduling.appointments.canceled_at, v_canceled_at),
    metadata = coalesce(scheduling.appointments.metadata, '{}'::jsonb) || v_metadata,
    updated_at = now()
  where scheduling.appointments.id = v_runtime_appointment_id;

  perform private.record_audit_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => v_runtime_unit_id,
    p_patient_id => v_runtime_patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => v_actor_profile_id,
    p_event_type => 'scheduling.appointment_canceled',
    p_action => 'cancel',
    p_resource_schema => 'scheduling',
    p_resource_table => 'appointments',
    p_resource_id => v_runtime_appointment_id,
    p_payload => jsonb_build_object(
      'legacyAppointmentId', p_legacy_appointment_id,
      'status', 'cancelled',
      'canceledAt', v_canceled_at,
      'reason', p_reason
    ) || v_metadata
  );

  perform private.record_patient_timeline_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => v_runtime_unit_id,
    p_patient_id => v_runtime_patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => v_actor_profile_id,
    p_event_type => 'appointment_canceled',
    p_event_at => v_canceled_at,
    p_source_schema => 'scheduling',
    p_source_table => 'appointments',
    p_source_id => v_runtime_appointment_id,
    p_payload => jsonb_build_object(
      'legacyAppointmentId', p_legacy_appointment_id,
      'status', 'cancelled',
      'canceledAt', v_canceled_at,
      'reason', p_reason
    ) || v_metadata
  );

  return jsonb_build_object(
    'id', v_runtime_appointment_id::text,
    'legacyAppointmentId', p_legacy_appointment_id,
    'status', 'cancelled',
    'source', 'supabase_runtime'
  );
end;
$$;

revoke all on function api.cancel_appointment(text, text, timestamptz, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function api.cancel_appointment(text, text, timestamptz, text, text, text, jsonb) to service_role;

create or replace function public.cancel_appointment(
  p_legacy_tenant_id text,
  p_legacy_appointment_id text,
  p_canceled_at timestamptz default null,
  p_notes text default null,
  p_reason text default null,
  p_legacy_actor_user_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.cancel_appointment(
    p_legacy_tenant_id,
    p_legacy_appointment_id,
    p_canceled_at,
    p_notes,
    p_reason,
    p_legacy_actor_user_id,
    p_metadata
  )
$$;

revoke all on function public.cancel_appointment(text, text, timestamptz, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.cancel_appointment(text, text, timestamptz, text, text, text, jsonb) to service_role;

create or replace function api.reschedule_appointment(
  p_legacy_tenant_id text,
  p_legacy_appointment_id text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_notes text default null,
  p_reason text default null,
  p_legacy_actor_user_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runtime_tenant_id uuid := private.runtime_tenant_id_by_legacy_tenant_id(p_legacy_tenant_id);
  v_runtime_appointment_id uuid;
  v_runtime_unit_id uuid;
  v_runtime_patient_id uuid;
  v_current_status text;
  v_previous_starts_at timestamptz;
  v_previous_ends_at timestamptz;
  v_actor_profile_id uuid := private.runtime_profile_id_by_legacy_user_id(p_legacy_actor_user_id);
  v_actor_type text := case
    when v_actor_profile_id is not null then 'profile'
    when coalesce(auth.role(), '') = 'service_role' then 'service_role'
    else 'profile'
  end;
  v_metadata jsonb;
begin
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'appointment period is invalid';
  end if;

  select
    appointments.id,
    appointments.unit_id,
    appointments.patient_id,
    appointments.status,
    appointments.starts_at,
    appointments.ends_at
  into
    v_runtime_appointment_id,
    v_runtime_unit_id,
    v_runtime_patient_id,
    v_current_status,
    v_previous_starts_at,
    v_previous_ends_at
  from scheduling.appointments as appointments
  where appointments.tenant_id = v_runtime_tenant_id
    and appointments.legacy_appointment_id = p_legacy_appointment_id
    and appointments.deleted_at is null
  limit 1;

  if v_runtime_appointment_id is null then
    raise exception 'runtime appointment not found for legacy appointment %', p_legacy_appointment_id;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not private.can_manage_schedule_domain(v_runtime_tenant_id, v_runtime_unit_id) then
    raise exception 'reschedule appointment denied';
  end if;

  if v_current_status in ('checked_in', 'in_progress', 'completed', 'cancelled', 'no_show') then
    raise exception 'appointment % cannot transition from % to scheduled', p_legacy_appointment_id, v_current_status;
  end if;

  v_metadata := jsonb_strip_nulls(
    coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'source', 'api_operational_flow',
      'operation', 'reschedule_appointment',
      'legacy_tenant_id', p_legacy_tenant_id,
      'legacy_appointment_id', p_legacy_appointment_id,
      'legacy_actor_user_id', p_legacy_actor_user_id,
      'reason', p_reason,
      'previousStartsAt', v_previous_starts_at,
      'previousEndsAt', v_previous_ends_at
    )
  );

  update scheduling.appointments
  set
    starts_at = p_starts_at,
    ends_at = p_ends_at,
    status = 'scheduled',
    notes = coalesce(p_notes, scheduling.appointments.notes),
    confirmed_at = null,
    checked_in_at = null,
    canceled_at = null,
    metadata = coalesce(scheduling.appointments.metadata, '{}'::jsonb) || v_metadata,
    updated_at = now()
  where scheduling.appointments.id = v_runtime_appointment_id;

  perform private.record_audit_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => v_runtime_unit_id,
    p_patient_id => v_runtime_patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => v_actor_profile_id,
    p_event_type => 'scheduling.appointment_rescheduled',
    p_action => 'reschedule',
    p_resource_schema => 'scheduling',
    p_resource_table => 'appointments',
    p_resource_id => v_runtime_appointment_id,
    p_payload => jsonb_build_object(
      'legacyAppointmentId', p_legacy_appointment_id,
      'status', 'scheduled',
      'startsAt', p_starts_at,
      'endsAt', p_ends_at,
      'previousStartsAt', v_previous_starts_at,
      'previousEndsAt', v_previous_ends_at,
      'reason', p_reason
    ) || v_metadata
  );

  perform private.record_patient_timeline_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => v_runtime_unit_id,
    p_patient_id => v_runtime_patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => v_actor_profile_id,
    p_event_type => 'appointment_rescheduled',
    p_event_at => now(),
    p_source_schema => 'scheduling',
    p_source_table => 'appointments',
    p_source_id => v_runtime_appointment_id,
    p_payload => jsonb_build_object(
      'legacyAppointmentId', p_legacy_appointment_id,
      'status', 'scheduled',
      'startsAt', p_starts_at,
      'endsAt', p_ends_at,
      'previousStartsAt', v_previous_starts_at,
      'previousEndsAt', v_previous_ends_at,
      'reason', p_reason
    ) || v_metadata
  );

  return jsonb_build_object(
    'id', v_runtime_appointment_id::text,
    'legacyAppointmentId', p_legacy_appointment_id,
    'status', 'scheduled',
    'startsAt', p_starts_at,
    'endsAt', p_ends_at,
    'source', 'supabase_runtime'
  );
end;
$$;

revoke all on function api.reschedule_appointment(text, text, timestamptz, timestamptz, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function api.reschedule_appointment(text, text, timestamptz, timestamptz, text, text, text, jsonb) to service_role;

create or replace function public.reschedule_appointment(
  p_legacy_tenant_id text,
  p_legacy_appointment_id text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_notes text default null,
  p_reason text default null,
  p_legacy_actor_user_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.reschedule_appointment(
    p_legacy_tenant_id,
    p_legacy_appointment_id,
    p_starts_at,
    p_ends_at,
    p_notes,
    p_reason,
    p_legacy_actor_user_id,
    p_metadata
  )
$$;

revoke all on function public.reschedule_appointment(text, text, timestamptz, timestamptz, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.reschedule_appointment(text, text, timestamptz, timestamptz, text, text, text, jsonb) to service_role;

create or replace function api.register_no_show(
  p_legacy_tenant_id text,
  p_legacy_appointment_id text,
  p_reason text default null,
  p_legacy_actor_user_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runtime_tenant_id uuid := private.runtime_tenant_id_by_legacy_tenant_id(p_legacy_tenant_id);
  v_runtime_appointment_id uuid;
  v_runtime_unit_id uuid;
  v_runtime_patient_id uuid;
  v_current_status text;
  v_actor_profile_id uuid := private.runtime_profile_id_by_legacy_user_id(p_legacy_actor_user_id);
  v_actor_type text := case
    when v_actor_profile_id is not null then 'profile'
    when coalesce(auth.role(), '') = 'service_role' then 'service_role'
    else 'profile'
  end;
  v_event_at timestamptz := now();
  v_metadata jsonb;
begin
  select
    appointments.id,
    appointments.unit_id,
    appointments.patient_id,
    appointments.status
  into
    v_runtime_appointment_id,
    v_runtime_unit_id,
    v_runtime_patient_id,
    v_current_status
  from scheduling.appointments as appointments
  where appointments.tenant_id = v_runtime_tenant_id
    and appointments.legacy_appointment_id = p_legacy_appointment_id
    and appointments.deleted_at is null
  limit 1;

  if v_runtime_appointment_id is null then
    raise exception 'runtime appointment not found for legacy appointment %', p_legacy_appointment_id;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not private.can_manage_schedule_domain(v_runtime_tenant_id, v_runtime_unit_id) then
    raise exception 'register no show denied';
  end if;

  if v_current_status = 'no_show' then
    return jsonb_build_object(
      'id', v_runtime_appointment_id::text,
      'legacyAppointmentId', p_legacy_appointment_id,
      'status', 'no_show',
      'source', 'supabase_runtime'
    );
  end if;

  if v_current_status in ('checked_in', 'in_progress', 'completed') then
    raise exception 'appointment % cannot transition from % to no_show', p_legacy_appointment_id, v_current_status;
  end if;

  v_metadata := jsonb_strip_nulls(
    coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'source', 'api_operational_flow',
      'operation', 'register_no_show',
      'legacy_tenant_id', p_legacy_tenant_id,
      'legacy_appointment_id', p_legacy_appointment_id,
      'legacy_actor_user_id', p_legacy_actor_user_id,
      'reason', p_reason
    )
  );

  update scheduling.appointments
  set
    status = 'no_show',
    metadata = coalesce(scheduling.appointments.metadata, '{}'::jsonb) || v_metadata,
    updated_at = now()
  where scheduling.appointments.id = v_runtime_appointment_id;

  perform private.record_audit_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => v_runtime_unit_id,
    p_patient_id => v_runtime_patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => v_actor_profile_id,
    p_event_type => 'scheduling.appointment_no_show',
    p_action => 'mark_no_show',
    p_resource_schema => 'scheduling',
    p_resource_table => 'appointments',
    p_resource_id => v_runtime_appointment_id,
    p_payload => jsonb_build_object(
      'legacyAppointmentId', p_legacy_appointment_id,
      'status', 'no_show',
      'reason', p_reason
    ) || v_metadata
  );

  perform private.record_patient_timeline_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => v_runtime_unit_id,
    p_patient_id => v_runtime_patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => v_actor_profile_id,
    p_event_type => 'appointment_no_show',
    p_event_at => v_event_at,
    p_source_schema => 'scheduling',
    p_source_table => 'appointments',
    p_source_id => v_runtime_appointment_id,
    p_payload => jsonb_build_object(
      'legacyAppointmentId', p_legacy_appointment_id,
      'status', 'no_show',
      'reason', p_reason
    ) || v_metadata
  );

  return jsonb_build_object(
    'id', v_runtime_appointment_id::text,
    'legacyAppointmentId', p_legacy_appointment_id,
    'status', 'no_show',
    'source', 'supabase_runtime'
  );
end;
$$;

revoke all on function api.register_no_show(text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function api.register_no_show(text, text, text, text, jsonb) to service_role;

create or replace function public.register_no_show(
  p_legacy_tenant_id text,
  p_legacy_appointment_id text,
  p_reason text default null,
  p_legacy_actor_user_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.register_no_show(
    p_legacy_tenant_id,
    p_legacy_appointment_id,
    p_reason,
    p_legacy_actor_user_id,
    p_metadata
  )
$$;

revoke all on function public.register_no_show(text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.register_no_show(text, text, text, text, jsonb) to service_role;
