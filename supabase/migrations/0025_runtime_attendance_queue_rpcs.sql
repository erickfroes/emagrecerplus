create table if not exists scheduling.attendance_queue (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  unit_id uuid not null references platform.units (id) on delete restrict,
  patient_id uuid not null references patients.patients (id) on delete restrict,
  appointment_id uuid not null unique references scheduling.appointments (id) on delete cascade,
  encounter_id uuid unique references clinical.encounters (id) on delete set null,
  queue_status text not null default 'waiting' check (
    queue_status in ('waiting', 'in_attendance', 'completed', 'removed')
  ),
  priority text not null default 'normal' check (priority in ('normal', 'urgent')),
  notes text,
  enqueued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_by_profile_id uuid references identity.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_queue_started_after_enqueued check (
    started_at is null or started_at >= enqueued_at
  ),
  constraint attendance_queue_completed_after_enqueued check (
    completed_at is null or completed_at >= enqueued_at
  )
);

create index if not exists idx_attendance_queue_unit_status_enqueued_at
  on scheduling.attendance_queue (tenant_id, unit_id, queue_status, enqueued_at asc);

create index if not exists idx_attendance_queue_patient_created_at
  on scheduling.attendance_queue (patient_id, created_at desc);

drop trigger if exists set_scheduling_attendance_queue_updated_at on scheduling.attendance_queue;
create trigger set_scheduling_attendance_queue_updated_at
before update on scheduling.attendance_queue
for each row
execute function private.set_current_timestamp_updated_at();

grant all on table scheduling.attendance_queue to service_role;

alter table scheduling.attendance_queue enable row level security;

drop policy if exists attendance_queue_select_current_scope on scheduling.attendance_queue;
create policy attendance_queue_select_current_scope
on scheduling.attendance_queue
for select
to authenticated
using (
  private.can_read_schedule_domain(tenant_id, unit_id)
);

drop policy if exists attendance_queue_manage_current_scope on scheduling.attendance_queue;
create policy attendance_queue_manage_current_scope
on scheduling.attendance_queue
for all
to authenticated
using (
  private.can_manage_schedule_domain(tenant_id, unit_id)
)
with check (
  private.can_manage_schedule_domain(tenant_id, unit_id)
);

create or replace function api.enqueue_patient(
  p_legacy_tenant_id text,
  p_legacy_appointment_id text,
  p_enqueued_at timestamptz default null,
  p_notes text default null,
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
  v_runtime_queue_id uuid;
  v_current_queue_status text;
  v_runtime_appointment_status text;
  v_actor_profile_id uuid := private.runtime_profile_id_by_legacy_user_id(p_legacy_actor_user_id);
  v_actor_type text := case
    when v_actor_profile_id is not null then 'profile'
    when coalesce(auth.role(), '') = 'service_role' then 'service_role'
    else 'profile'
  end;
  v_enqueued_at timestamptz := coalesce(p_enqueued_at, now());
  v_metadata jsonb;
begin
  if nullif(trim(coalesce(p_legacy_tenant_id, '')), '') is null then
    raise exception 'p_legacy_tenant_id is required';
  end if;

  if v_runtime_tenant_id is null then
    raise exception 'runtime tenant not found for legacy tenant %', p_legacy_tenant_id;
  end if;

  select
    appointments.id,
    appointments.unit_id,
    appointments.patient_id,
    appointments.status
  into
    v_runtime_appointment_id,
    v_runtime_unit_id,
    v_runtime_patient_id,
    v_runtime_appointment_status
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
    raise exception 'enqueue patient denied';
  end if;

  select queue.id, queue.queue_status
  into v_runtime_queue_id, v_current_queue_status
  from scheduling.attendance_queue as queue
  where queue.appointment_id = v_runtime_appointment_id
  limit 1;

  if v_runtime_queue_id is not null then
    return jsonb_build_object(
      'id', v_runtime_queue_id::text,
      'appointmentId', v_runtime_appointment_id::text,
      'legacyAppointmentId', p_legacy_appointment_id,
      'appointmentStatus', v_runtime_appointment_status,
      'queueStatus', v_current_queue_status,
      'source', 'supabase_runtime'
    );
  end if;

  if v_runtime_appointment_status <> 'checked_in' then
    raise exception 'appointment % cannot be enqueued from status %', p_legacy_appointment_id, v_runtime_appointment_status;
  end if;

  v_metadata := jsonb_strip_nulls(
    coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'source', 'api_operational_flow',
      'operation', 'enqueue_patient',
      'legacy_tenant_id', p_legacy_tenant_id,
      'legacy_appointment_id', p_legacy_appointment_id,
      'legacy_actor_user_id', p_legacy_actor_user_id
    )
  );

  insert into scheduling.attendance_queue (
    tenant_id,
    unit_id,
    patient_id,
    appointment_id,
    queue_status,
    notes,
    enqueued_at,
    created_by_profile_id,
    metadata
  )
  values (
    v_runtime_tenant_id,
    v_runtime_unit_id,
    v_runtime_patient_id,
    v_runtime_appointment_id,
    'waiting',
    p_notes,
    v_enqueued_at,
    v_actor_profile_id,
    v_metadata
  )
  returning id into v_runtime_queue_id;

  perform private.record_audit_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => v_runtime_unit_id,
    p_patient_id => v_runtime_patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => v_actor_profile_id,
    p_event_type => 'scheduling.patient_enqueued',
    p_action => 'enqueue',
    p_resource_schema => 'scheduling',
    p_resource_table => 'attendance_queue',
    p_resource_id => v_runtime_queue_id,
    p_payload => jsonb_build_object(
      'legacyAppointmentId', p_legacy_appointment_id,
      'appointmentStatus', v_runtime_appointment_status,
      'queueStatus', 'waiting',
      'enqueuedAt', v_enqueued_at
    ) || v_metadata
  );

  perform private.record_patient_timeline_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => v_runtime_unit_id,
    p_patient_id => v_runtime_patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => v_actor_profile_id,
    p_event_type => 'patient_enqueued',
    p_event_at => v_enqueued_at,
    p_source_schema => 'scheduling',
    p_source_table => 'attendance_queue',
    p_source_id => v_runtime_queue_id,
    p_payload => jsonb_build_object(
      'legacyAppointmentId', p_legacy_appointment_id,
      'appointmentStatus', v_runtime_appointment_status,
      'queueStatus', 'waiting',
      'enqueuedAt', v_enqueued_at
    ) || v_metadata
  );

  return jsonb_build_object(
    'id', v_runtime_queue_id::text,
    'appointmentId', v_runtime_appointment_id::text,
    'legacyAppointmentId', p_legacy_appointment_id,
    'appointmentStatus', v_runtime_appointment_status,
    'queueStatus', 'waiting',
    'source', 'supabase_runtime'
  );
end;
$$;

revoke all on function api.enqueue_patient(text, text, timestamptz, text, text, jsonb) from public, anon, authenticated;
grant execute on function api.enqueue_patient(text, text, timestamptz, text, text, jsonb) to service_role;

create or replace function public.enqueue_patient(
  p_legacy_tenant_id text,
  p_legacy_appointment_id text,
  p_enqueued_at timestamptz default null,
  p_notes text default null,
  p_legacy_actor_user_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.enqueue_patient(
    p_legacy_tenant_id,
    p_legacy_appointment_id,
    p_enqueued_at,
    p_notes,
    p_legacy_actor_user_id,
    p_metadata
  )
$$;

revoke all on function public.enqueue_patient(text, text, timestamptz, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.enqueue_patient(text, text, timestamptz, text, text, jsonb) to service_role;

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
  v_runtime_queue_id uuid;
  v_runtime_queue_status text;
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

  select queue.id, queue.queue_status
  into v_runtime_queue_id, v_runtime_queue_status
  from scheduling.attendance_queue as queue
  where queue.appointment_id = v_runtime_appointment_id
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
      'queueStatus', coalesce(v_runtime_queue_status, null),
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

  if v_runtime_queue_id is not null and v_runtime_queue_status <> 'completed' then
    update scheduling.attendance_queue
    set
      encounter_id = coalesce(scheduling.attendance_queue.encounter_id, v_runtime_encounter_id),
      queue_status = 'in_attendance',
      started_at = coalesce(scheduling.attendance_queue.started_at, v_opened_at),
      metadata = coalesce(scheduling.attendance_queue.metadata, '{}'::jsonb) || v_metadata,
      updated_at = now()
    where scheduling.attendance_queue.id = v_runtime_queue_id;

    v_runtime_queue_status := 'in_attendance';

    perform private.record_audit_event(
      p_tenant_id => v_runtime_tenant_id,
      p_unit_id => v_runtime_unit_id,
      p_patient_id => v_runtime_patient_id,
      p_actor_type => v_actor_type,
      p_actor_id => null,
      p_event_type => 'scheduling.queue_attendance_started',
      p_action => 'start_attendance',
      p_resource_schema => 'scheduling',
      p_resource_table => 'attendance_queue',
      p_resource_id => v_runtime_queue_id,
      p_payload => jsonb_build_object(
        'legacyEncounterId', v_legacy_encounter_id,
        'legacyAppointmentId', v_legacy_appointment_id,
        'queueStatus', 'in_attendance',
        'startedAt', v_opened_at
      ) || v_metadata
    );

    perform private.record_patient_timeline_event(
      p_tenant_id => v_runtime_tenant_id,
      p_unit_id => v_runtime_unit_id,
      p_patient_id => v_runtime_patient_id,
      p_actor_type => v_actor_type,
      p_actor_id => null,
      p_event_type => 'attendance_started',
      p_event_at => v_opened_at,
      p_source_schema => 'scheduling',
      p_source_table => 'attendance_queue',
      p_source_id => v_runtime_queue_id,
      p_payload => jsonb_build_object(
        'legacyEncounterId', v_legacy_encounter_id,
        'legacyAppointmentId', v_legacy_appointment_id,
        'queueStatus', 'in_attendance',
        'startedAt', v_opened_at
      ) || v_metadata
    );
  end if;

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
      'appointmentStatus', 'in_progress',
      'queueStatus', coalesce(v_runtime_queue_status, null)
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
      'appointmentStatus', 'in_progress',
      'queueStatus', coalesce(v_runtime_queue_status, null)
    ) || v_metadata
  );

  return jsonb_build_object(
    'encounterId', v_runtime_encounter_id::text,
    'legacyEncounterId', v_legacy_encounter_id,
    'appointmentId', v_runtime_appointment_id::text,
    'legacyAppointmentId', v_legacy_appointment_id,
    'encounterStatus', 'open',
    'appointmentStatus', 'in_progress',
    'queueStatus', coalesce(v_runtime_queue_status, null),
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
  v_runtime_queue_id uuid;
  v_runtime_queue_status text;
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

  if v_runtime_appointment_id is not null then
    select queue.id, queue.queue_status
    into v_runtime_queue_id, v_runtime_queue_status
    from scheduling.attendance_queue as queue
    where queue.appointment_id = v_runtime_appointment_id
    limit 1;
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
      'queueStatus', coalesce(v_runtime_queue_status, null),
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

  if v_runtime_queue_id is not null and v_runtime_queue_status <> 'completed' then
    update scheduling.attendance_queue
    set
      encounter_id = coalesce(scheduling.attendance_queue.encounter_id, v_runtime_encounter_id),
      queue_status = 'completed',
      completed_at = coalesce(scheduling.attendance_queue.completed_at, v_closed_at),
      metadata = coalesce(scheduling.attendance_queue.metadata, '{}'::jsonb) || v_metadata,
      updated_at = now()
    where scheduling.attendance_queue.id = v_runtime_queue_id;

    v_runtime_queue_status := 'completed';

    perform private.record_audit_event(
      p_tenant_id => v_runtime_tenant_id,
      p_unit_id => v_runtime_unit_id,
      p_patient_id => v_runtime_patient_id,
      p_actor_type => v_actor_type,
      p_actor_id => null,
      p_event_type => 'scheduling.queue_attendance_completed',
      p_action => 'complete_attendance',
      p_resource_schema => 'scheduling',
      p_resource_table => 'attendance_queue',
      p_resource_id => v_runtime_queue_id,
      p_payload => jsonb_build_object(
        'legacyEncounterId', v_legacy_encounter_id,
        'queueStatus', 'completed',
        'completedAt', v_closed_at
      ) || v_metadata
    );

    perform private.record_patient_timeline_event(
      p_tenant_id => v_runtime_tenant_id,
      p_unit_id => v_runtime_unit_id,
      p_patient_id => v_runtime_patient_id,
      p_actor_type => v_actor_type,
      p_actor_id => null,
      p_event_type => 'attendance_completed',
      p_event_at => v_closed_at,
      p_source_schema => 'scheduling',
      p_source_table => 'attendance_queue',
      p_source_id => v_runtime_queue_id,
      p_payload => jsonb_build_object(
        'legacyEncounterId', v_legacy_encounter_id,
        'queueStatus', 'completed',
        'completedAt', v_closed_at
      ) || v_metadata
    );
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
      'appointmentStatus', coalesce(v_runtime_appointment_status, null),
      'queueStatus', coalesce(v_runtime_queue_status, null)
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
      'appointmentStatus', coalesce(v_runtime_appointment_status, null),
      'queueStatus', coalesce(v_runtime_queue_status, null)
    ) || v_metadata
  );

  return jsonb_build_object(
    'encounterId', v_runtime_encounter_id::text,
    'legacyEncounterId', v_legacy_encounter_id,
    'appointmentId', coalesce(v_runtime_appointment_id::text, null),
    'encounterStatus', 'closed',
    'appointmentStatus', coalesce(v_runtime_appointment_status, null),
    'queueStatus', coalesce(v_runtime_queue_status, null),
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
