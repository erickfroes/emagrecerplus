create or replace function api.start_encounter(
  p_legacy_tenant_id text,
  p_legacy_appointment_id text,
  p_legacy_encounter_id text,
  p_legacy_unit_id text,
  p_legacy_patient_id text,
  p_legacy_professional_id text default null,
  p_encounter_type text default 'other',
  p_opened_at timestamptz default null,
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
  v_runtime_professional_id uuid;
  v_runtime_appointment_id uuid;
  v_runtime_encounter_id uuid;
  v_runtime_encounter_status text;
  v_runtime_appointment_status text;
  v_actor_type text := case when coalesce(auth.role(), '') = 'service_role' then 'service_role' else 'profile' end;
  v_opened_at timestamptz := coalesce(p_opened_at, now());
  v_legacy_appointment_id text := nullif(trim(coalesce(p_legacy_appointment_id, '')), '');
  v_legacy_encounter_id text := nullif(trim(coalesce(p_legacy_encounter_id, '')), '');
  v_legacy_unit_id text := nullif(trim(coalesce(p_legacy_unit_id, '')), '');
  v_legacy_patient_id text := nullif(trim(coalesce(p_legacy_patient_id, '')), '');
  v_legacy_professional_id text := nullif(trim(coalesce(p_legacy_professional_id, '')), '');
  v_encounter_type text := lower(coalesce(nullif(trim(coalesce(p_encounter_type, '')), ''), 'other'));
  v_metadata jsonb;
  v_runtime_result jsonb;
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

  if v_legacy_encounter_id is null then
    raise exception 'p_legacy_encounter_id is required';
  end if;

  if v_legacy_unit_id is null then
    raise exception 'p_legacy_unit_id is required';
  end if;

  if v_legacy_patient_id is null then
    raise exception 'p_legacy_patient_id is required';
  end if;

  if v_encounter_type not in ('initial_consult', 'follow_up', 'procedure', 'teleconsult', 'review', 'other') then
    raise exception 'invalid encounter type %', v_encounter_type;
  end if;

  v_runtime_unit_id := private.runtime_unit_id_by_legacy_unit_id(v_runtime_tenant_id, v_legacy_unit_id);
  if v_runtime_unit_id is null then
    raise exception 'runtime unit not found for legacy unit %', v_legacy_unit_id;
  end if;

  v_runtime_patient_id := private.runtime_patient_id_by_legacy_patient_id(v_runtime_tenant_id, v_legacy_patient_id);
  if v_runtime_patient_id is null then
    raise exception 'runtime patient not found for legacy patient %', v_legacy_patient_id;
  end if;

  v_runtime_appointment_id := private.runtime_appointment_id_by_legacy_appointment_id(
    v_runtime_tenant_id,
    v_legacy_appointment_id
  );
  if v_runtime_appointment_id is null then
    raise exception 'runtime appointment not found for legacy appointment %', v_legacy_appointment_id;
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
    and (
      not private.can_manage_schedule_domain(v_runtime_tenant_id, v_runtime_unit_id)
      or not private.can_manage_clinical_domain(v_runtime_tenant_id, v_runtime_unit_id)
    ) then
    raise exception 'start encounter denied';
  end if;

  select appointments.status
  into v_runtime_appointment_status
  from scheduling.appointments as appointments
  where appointments.id = v_runtime_appointment_id
    and appointments.deleted_at is null
  limit 1;

  if v_runtime_appointment_status is null then
    raise exception 'runtime appointment % is not active', v_legacy_appointment_id;
  end if;

  if v_runtime_appointment_status in ('cancelled', 'no_show', 'completed') then
    raise exception 'appointment % cannot start encounter from status %', v_legacy_appointment_id, v_runtime_appointment_status;
  end if;

  select encounters.id, encounters.status
  into v_runtime_encounter_id, v_runtime_encounter_status
  from clinical.encounters as encounters
  where encounters.tenant_id = v_runtime_tenant_id
    and encounters.legacy_encounter_id = v_legacy_encounter_id
  limit 1;

  if v_runtime_encounter_status = 'cancelled' then
    raise exception 'encounter % is cancelled', v_legacy_encounter_id;
  end if;

  if v_runtime_encounter_status = 'closed' then
    raise exception 'encounter % is already closed', v_legacy_encounter_id;
  end if;

  if v_runtime_appointment_status = 'in_progress'
    and v_runtime_encounter_id is not null
    and v_runtime_encounter_status = 'open' then
    return jsonb_build_object(
      'encounterId', v_runtime_encounter_id::text,
      'legacyEncounterId', v_legacy_encounter_id,
      'appointmentId', v_runtime_appointment_id::text,
      'legacyAppointmentId', v_legacy_appointment_id,
      'encounterStatus', 'open',
      'appointmentStatus', 'in_progress',
      'source', 'supabase_runtime'
    );
  end if;

  v_metadata := jsonb_strip_nulls(
    coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'source', 'api_operational_flow',
      'operation', 'start_encounter',
      'legacy_tenant_id', p_legacy_tenant_id,
      'legacy_unit_id', v_legacy_unit_id,
      'legacy_patient_id', v_legacy_patient_id,
      'legacy_appointment_id', v_legacy_appointment_id,
      'legacy_encounter_id', v_legacy_encounter_id,
      'legacy_professional_id', v_legacy_professional_id
    )
  );

  update scheduling.appointments
  set
    status = 'in_progress',
    checked_in_at = coalesce(scheduling.appointments.checked_in_at, v_opened_at),
    metadata = coalesce(scheduling.appointments.metadata, '{}'::jsonb) || v_metadata,
    updated_at = now()
  where scheduling.appointments.id = v_runtime_appointment_id;

  v_runtime_result := api.upsert_runtime_encounter_from_legacy(
    p_legacy_tenant_id => p_legacy_tenant_id,
    p_legacy_encounter_id => v_legacy_encounter_id,
    p_legacy_unit_id => v_legacy_unit_id,
    p_legacy_patient_id => v_legacy_patient_id,
    p_encounter_type => v_encounter_type,
    p_status => 'open',
    p_legacy_professional_id => v_legacy_professional_id,
    p_legacy_appointment_id => v_legacy_appointment_id,
    p_opened_at => v_opened_at,
    p_metadata => v_metadata,
    p_updated_at => now()
  );

  v_runtime_encounter_id := nullif(v_runtime_result ->> 'id', '')::uuid;

  perform private.record_audit_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => v_runtime_unit_id,
    p_patient_id => v_runtime_patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => null,
    p_event_type => 'clinical.encounter_started',
    p_action => 'start',
    p_resource_schema => 'clinical',
    p_resource_table => 'encounters',
    p_resource_id => v_runtime_encounter_id,
    p_payload => jsonb_build_object(
      'legacyEncounterId', v_legacy_encounter_id,
      'legacyAppointmentId', v_legacy_appointment_id,
      'encounterStatus', 'open',
      'appointmentStatus', 'in_progress'
    ) || v_metadata
  );

  perform private.record_patient_timeline_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => v_runtime_unit_id,
    p_patient_id => v_runtime_patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => null,
    p_event_type => 'encounter_started',
    p_event_at => v_opened_at,
    p_source_schema => 'clinical',
    p_source_table => 'encounters',
    p_source_id => v_runtime_encounter_id,
    p_payload => jsonb_build_object(
      'legacyEncounterId', v_legacy_encounter_id,
      'legacyAppointmentId', v_legacy_appointment_id,
      'encounterStatus', 'open',
      'appointmentStatus', 'in_progress'
    ) || v_metadata
  );

  return jsonb_build_object(
    'encounterId', v_runtime_encounter_id::text,
    'legacyEncounterId', v_legacy_encounter_id,
    'appointmentId', v_runtime_appointment_id::text,
    'legacyAppointmentId', v_legacy_appointment_id,
    'encounterStatus', 'open',
    'appointmentStatus', 'in_progress',
    'source', 'supabase_runtime'
  );
end;
$$;

revoke all on function api.start_encounter(text, text, text, text, text, text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function api.start_encounter(text, text, text, text, text, text, text, timestamptz, jsonb) to service_role;

create or replace function public.start_encounter(
  p_legacy_tenant_id text,
  p_legacy_appointment_id text,
  p_legacy_encounter_id text,
  p_legacy_unit_id text,
  p_legacy_patient_id text,
  p_legacy_professional_id text default null,
  p_encounter_type text default 'other',
  p_opened_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.start_encounter(
    p_legacy_tenant_id,
    p_legacy_appointment_id,
    p_legacy_encounter_id,
    p_legacy_unit_id,
    p_legacy_patient_id,
    p_legacy_professional_id,
    p_encounter_type,
    p_opened_at,
    p_metadata
  )
$$;

revoke all on function public.start_encounter(text, text, text, text, text, text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.start_encounter(text, text, text, text, text, text, text, timestamptz, jsonb) to service_role;

create or replace function api.complete_encounter(
  p_legacy_tenant_id text,
  p_legacy_encounter_id text,
  p_closed_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runtime_tenant_id uuid := private.runtime_tenant_id_by_legacy_tenant_id(p_legacy_tenant_id);
  v_runtime_encounter_id uuid;
  v_runtime_unit_id uuid;
  v_runtime_patient_id uuid;
  v_runtime_appointment_id uuid;
  v_runtime_encounter_status text;
  v_runtime_appointment_status text;
  v_closed_at timestamptz := coalesce(p_closed_at, now());
  v_actor_type text := case when coalesce(auth.role(), '') = 'service_role' then 'service_role' else 'profile' end;
  v_legacy_encounter_id text := nullif(trim(coalesce(p_legacy_encounter_id, '')), '');
  v_metadata jsonb;
begin
  if nullif(trim(coalesce(p_legacy_tenant_id, '')), '') is null then
    raise exception 'p_legacy_tenant_id is required';
  end if;

  if v_runtime_tenant_id is null then
    raise exception 'runtime tenant not found for legacy tenant %', p_legacy_tenant_id;
  end if;

  if v_legacy_encounter_id is null then
    raise exception 'p_legacy_encounter_id is required';
  end if;

  select
    encounters.id,
    encounters.unit_id,
    encounters.patient_id,
    encounters.appointment_id,
    encounters.status,
    appointments.status
  into
    v_runtime_encounter_id,
    v_runtime_unit_id,
    v_runtime_patient_id,
    v_runtime_appointment_id,
    v_runtime_encounter_status,
    v_runtime_appointment_status
  from clinical.encounters as encounters
  left join scheduling.appointments as appointments
    on appointments.id = encounters.appointment_id
  where encounters.tenant_id = v_runtime_tenant_id
    and encounters.legacy_encounter_id = v_legacy_encounter_id
  limit 1;

  if v_runtime_encounter_id is null then
    raise exception 'runtime encounter not found for legacy encounter %', v_legacy_encounter_id;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not private.can_manage_clinical_domain(v_runtime_tenant_id, v_runtime_unit_id) then
    raise exception 'complete encounter denied';
  end if;

  if v_runtime_encounter_status = 'cancelled' then
    raise exception 'encounter % is cancelled', v_legacy_encounter_id;
  end if;

  if v_runtime_encounter_status = 'closed'
    and (v_runtime_appointment_id is null or v_runtime_appointment_status = 'completed') then
    return jsonb_build_object(
      'encounterId', v_runtime_encounter_id::text,
      'legacyEncounterId', v_legacy_encounter_id,
      'appointmentId', coalesce(v_runtime_appointment_id::text, null),
      'encounterStatus', 'closed',
      'appointmentStatus', coalesce(v_runtime_appointment_status, null),
      'closedAt', v_closed_at,
      'source', 'supabase_runtime'
    );
  end if;

  v_metadata := jsonb_strip_nulls(
    coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'source', 'api_operational_flow',
      'operation', 'complete_encounter',
      'legacy_tenant_id', p_legacy_tenant_id,
      'legacy_encounter_id', v_legacy_encounter_id
    )
  );

  update clinical.encounters
  set
    status = 'closed',
    closed_at = coalesce(clinical.encounters.closed_at, v_closed_at),
    metadata = coalesce(clinical.encounters.metadata, '{}'::jsonb) || v_metadata,
    updated_at = now()
  where clinical.encounters.id = v_runtime_encounter_id;

  if v_runtime_appointment_id is not null and coalesce(v_runtime_appointment_status, '') not in ('cancelled', 'no_show') then
    update scheduling.appointments
    set
      status = 'completed',
      metadata = coalesce(scheduling.appointments.metadata, '{}'::jsonb) || v_metadata,
      updated_at = now()
    where scheduling.appointments.id = v_runtime_appointment_id;

    v_runtime_appointment_status := 'completed';
  end if;

  perform private.record_audit_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => v_runtime_unit_id,
    p_patient_id => v_runtime_patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => null,
    p_event_type => 'clinical.encounter_completed',
    p_action => 'complete',
    p_resource_schema => 'clinical',
    p_resource_table => 'encounters',
    p_resource_id => v_runtime_encounter_id,
    p_payload => jsonb_build_object(
      'legacyEncounterId', v_legacy_encounter_id,
      'encounterStatus', 'closed',
      'appointmentStatus', coalesce(v_runtime_appointment_status, null)
    ) || v_metadata
  );

  perform private.record_patient_timeline_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => v_runtime_unit_id,
    p_patient_id => v_runtime_patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => null,
    p_event_type => 'encounter_completed',
    p_event_at => v_closed_at,
    p_source_schema => 'clinical',
    p_source_table => 'encounters',
    p_source_id => v_runtime_encounter_id,
    p_payload => jsonb_build_object(
      'legacyEncounterId', v_legacy_encounter_id,
      'encounterStatus', 'closed',
      'appointmentStatus', coalesce(v_runtime_appointment_status, null)
    ) || v_metadata
  );

  return jsonb_build_object(
    'encounterId', v_runtime_encounter_id::text,
    'legacyEncounterId', v_legacy_encounter_id,
    'appointmentId', coalesce(v_runtime_appointment_id::text, null),
    'encounterStatus', 'closed',
    'appointmentStatus', coalesce(v_runtime_appointment_status, null),
    'closedAt', v_closed_at,
    'source', 'supabase_runtime'
  );
end;
$$;

revoke all on function api.complete_encounter(text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function api.complete_encounter(text, text, timestamptz, jsonb) to service_role;

create or replace function public.complete_encounter(
  p_legacy_tenant_id text,
  p_legacy_encounter_id text,
  p_closed_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.complete_encounter(
    p_legacy_tenant_id,
    p_legacy_encounter_id,
    p_closed_at,
    p_metadata
  )
$$;

revoke all on function public.complete_encounter(text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.complete_encounter(text, text, timestamptz, jsonb) to service_role;
