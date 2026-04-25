create or replace function api.schedule_return(
  p_legacy_tenant_id text,
  p_legacy_encounter_id text,
  p_legacy_return_appointment_id text,
  p_legacy_unit_id text,
  p_legacy_patient_id text,
  p_legacy_appointment_type_id text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_notes text default null,
  p_legacy_professional_id text default null,
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
  v_legacy_encounter_id text := nullif(trim(coalesce(p_legacy_encounter_id, '')), '');
  v_legacy_return_appointment_id text := nullif(trim(coalesce(p_legacy_return_appointment_id, '')), '');
  v_legacy_unit_id text := nullif(trim(coalesce(p_legacy_unit_id, '')), '');
  v_legacy_patient_id text := nullif(trim(coalesce(p_legacy_patient_id, '')), '');
  v_legacy_appointment_type_id text := nullif(trim(coalesce(p_legacy_appointment_type_id, '')), '');
  v_runtime_unit_id uuid;
  v_runtime_patient_id uuid;
  v_runtime_encounter_id uuid;
  v_runtime_encounter_status text;
  v_runtime_appointment_id uuid;
  v_runtime_appointment_status text;
  v_actor_profile_id uuid := private.runtime_profile_id_by_legacy_user_id(p_legacy_actor_user_id);
  v_actor_type text := case
    when v_actor_profile_id is not null then 'profile'
    when coalesce(auth.role(), '') = 'service_role' then 'service_role'
    else 'profile'
  end;
  v_scheduled_at timestamptz := now();
  v_metadata jsonb;
  v_create_result jsonb;
begin
  if nullif(trim(coalesce(p_legacy_tenant_id, '')), '') is null then
    raise exception 'p_legacy_tenant_id is required';
  end if;

  if v_legacy_encounter_id is null then
    raise exception 'p_legacy_encounter_id is required';
  end if;

  if v_legacy_return_appointment_id is null then
    raise exception 'p_legacy_return_appointment_id is required';
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

  if p_starts_at is null then
    raise exception 'p_starts_at is required';
  end if;

  if p_ends_at is null then
    raise exception 'p_ends_at is required';
  end if;

  if p_ends_at <= p_starts_at then
    raise exception 'return interval invalid';
  end if;

  if v_runtime_tenant_id is null then
    raise exception 'runtime tenant not found for legacy tenant %', p_legacy_tenant_id;
  end if;

  v_runtime_unit_id := private.runtime_unit_id_by_legacy_unit_id(v_runtime_tenant_id, v_legacy_unit_id);
  if v_runtime_unit_id is null then
    raise exception 'runtime unit not found for legacy unit %', v_legacy_unit_id;
  end if;

  v_runtime_patient_id := private.runtime_patient_id_by_legacy_patient_id(v_runtime_tenant_id, v_legacy_patient_id);
  if v_runtime_patient_id is null then
    raise exception 'runtime patient not found for legacy patient %', v_legacy_patient_id;
  end if;

  select
    encounters.id,
    encounters.unit_id,
    encounters.patient_id,
    encounters.status
  into
    v_runtime_encounter_id,
    v_runtime_unit_id,
    v_runtime_patient_id,
    v_runtime_encounter_status
  from clinical.encounters as encounters
  where encounters.tenant_id = v_runtime_tenant_id
    and encounters.legacy_encounter_id = v_legacy_encounter_id
  limit 1;

  if v_runtime_encounter_id is null then
    raise exception 'runtime encounter not found for legacy encounter %', v_legacy_encounter_id;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not private.can_manage_schedule_domain(v_runtime_tenant_id, v_runtime_unit_id) then
    raise exception 'schedule return denied';
  end if;

  if v_runtime_encounter_status = 'cancelled' then
    raise exception 'encounter % is cancelled', v_legacy_encounter_id;
  end if;

  select
    appointments.id,
    appointments.status
  into
    v_runtime_appointment_id,
    v_runtime_appointment_status
  from scheduling.appointments as appointments
  where appointments.tenant_id = v_runtime_tenant_id
    and appointments.legacy_appointment_id = v_legacy_return_appointment_id
    and appointments.deleted_at is null
  limit 1;

  if v_runtime_appointment_id is not null then
    return jsonb_build_object(
      'encounterId', v_runtime_encounter_id::text,
      'legacyEncounterId', v_legacy_encounter_id,
      'appointmentId', v_runtime_appointment_id::text,
      'legacyAppointmentId', v_legacy_return_appointment_id,
      'appointmentStatus', v_runtime_appointment_status,
      'encounterStatus', v_runtime_encounter_status,
      'startsAt', p_starts_at,
      'endsAt', p_ends_at,
      'source', 'supabase_runtime'
    );
  end if;

  if v_runtime_unit_id <> private.runtime_unit_id_by_legacy_unit_id(v_runtime_tenant_id, v_legacy_unit_id) then
    raise exception 'encounter % is not linked to legacy unit %', v_legacy_encounter_id, v_legacy_unit_id;
  end if;

  if v_runtime_patient_id <> private.runtime_patient_id_by_legacy_patient_id(v_runtime_tenant_id, v_legacy_patient_id) then
    raise exception 'encounter % is not linked to legacy patient %', v_legacy_encounter_id, v_legacy_patient_id;
  end if;

  v_metadata := jsonb_strip_nulls(
    coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'originContext', 'schedule_return',
      'originLegacyEncounterId', v_legacy_encounter_id,
      'originRuntimeEncounterId', v_runtime_encounter_id::text,
      'legacyTenantId', p_legacy_tenant_id,
      'legacyUnitId', v_legacy_unit_id,
      'legacyPatientId', v_legacy_patient_id,
      'legacyAppointmentTypeId', v_legacy_appointment_type_id,
      'legacyProfessionalId', p_legacy_professional_id,
      'legacyActorUserId', p_legacy_actor_user_id
    )
  );

  v_create_result := api.create_appointment(
    p_legacy_tenant_id => p_legacy_tenant_id,
    p_legacy_appointment_id => v_legacy_return_appointment_id,
    p_legacy_unit_id => v_legacy_unit_id,
    p_legacy_patient_id => v_legacy_patient_id,
    p_legacy_appointment_type_id => v_legacy_appointment_type_id,
    p_starts_at => p_starts_at,
    p_ends_at => p_ends_at,
    p_legacy_professional_id => p_legacy_professional_id,
    p_notes => p_notes,
    p_source => 'internal',
    p_legacy_created_by_user_id => p_legacy_actor_user_id,
    p_created_at => v_scheduled_at,
    p_updated_at => v_scheduled_at,
    p_deleted_at => null,
    p_metadata => v_metadata
  );

  v_runtime_appointment_id := nullif(v_create_result ->> 'id', '')::uuid;
  v_runtime_appointment_status := coalesce(nullif(v_create_result ->> 'status', ''), 'scheduled');

  if v_runtime_appointment_id is null then
    raise exception 'schedule_return did not resolve appointment id';
  end if;

  perform private.record_audit_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => v_runtime_unit_id,
    p_patient_id => v_runtime_patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => v_actor_profile_id,
    p_event_type => 'scheduling.return_scheduled',
    p_action => 'schedule_return',
    p_resource_schema => 'scheduling',
    p_resource_table => 'appointments',
    p_resource_id => v_runtime_appointment_id,
    p_payload => jsonb_build_object(
      'legacyEncounterId', v_legacy_encounter_id,
      'legacyAppointmentId', v_legacy_return_appointment_id,
      'appointmentStatus', v_runtime_appointment_status,
      'encounterStatus', v_runtime_encounter_status,
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
    p_event_type => 'return_scheduled',
    p_event_at => v_scheduled_at,
    p_source_schema => 'scheduling',
    p_source_table => 'appointments',
    p_source_id => v_runtime_appointment_id,
    p_payload => jsonb_build_object(
      'legacyEncounterId', v_legacy_encounter_id,
      'legacyAppointmentId', v_legacy_return_appointment_id,
      'appointmentStatus', v_runtime_appointment_status,
      'encounterStatus', v_runtime_encounter_status,
      'startsAt', p_starts_at,
      'endsAt', p_ends_at
    ) || v_metadata
  );

  return jsonb_build_object(
    'encounterId', v_runtime_encounter_id::text,
    'legacyEncounterId', v_legacy_encounter_id,
    'appointmentId', v_runtime_appointment_id::text,
    'legacyAppointmentId', v_legacy_return_appointment_id,
    'appointmentStatus', v_runtime_appointment_status,
    'encounterStatus', v_runtime_encounter_status,
    'startsAt', p_starts_at,
    'endsAt', p_ends_at,
    'source', 'supabase_runtime'
  );
end;
$$;

revoke all on function api.schedule_return(text, text, text, text, text, text, timestamptz, timestamptz, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function api.schedule_return(text, text, text, text, text, text, timestamptz, timestamptz, text, text, text, jsonb) to service_role;

create or replace function public.schedule_return(
  p_legacy_tenant_id text,
  p_legacy_encounter_id text,
  p_legacy_return_appointment_id text,
  p_legacy_unit_id text,
  p_legacy_patient_id text,
  p_legacy_appointment_type_id text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_notes text default null,
  p_legacy_professional_id text default null,
  p_legacy_actor_user_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.schedule_return(
    p_legacy_tenant_id,
    p_legacy_encounter_id,
    p_legacy_return_appointment_id,
    p_legacy_unit_id,
    p_legacy_patient_id,
    p_legacy_appointment_type_id,
    p_starts_at,
    p_ends_at,
    p_notes,
    p_legacy_professional_id,
    p_legacy_actor_user_id,
    p_metadata
  )
$$;

revoke all on function public.schedule_return(text, text, text, text, text, text, timestamptz, timestamptz, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.schedule_return(text, text, text, text, text, text, timestamptz, timestamptz, text, text, text, jsonb) to service_role;
