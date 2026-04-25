create or replace function private.record_audit_event(
  p_tenant_id uuid,
  p_unit_id uuid,
  p_patient_id uuid,
  p_actor_type text,
  p_event_type text,
  p_action text default null,
  p_resource_schema text default null,
  p_resource_table text default null,
  p_resource_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.record_audit_event(
    p_tenant_id,
    p_unit_id,
    p_patient_id,
    p_actor_type,
    null,
    p_event_type,
    p_action,
    p_resource_schema,
    p_resource_table,
    p_resource_id,
    p_payload,
    null,
    null
  )
$$;

create or replace function private.record_patient_timeline_event(
  p_tenant_id uuid,
  p_unit_id uuid,
  p_patient_id uuid,
  p_actor_type text,
  p_event_type text,
  p_event_at timestamptz default null,
  p_visibility_scope text default 'tenant_clinical',
  p_source_schema text default null,
  p_source_table text default null,
  p_source_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.record_patient_timeline_event(
    p_tenant_id,
    p_unit_id,
    p_patient_id,
    p_actor_type,
    null,
    p_event_type,
    p_event_at,
    p_visibility_scope,
    p_source_schema,
    p_source_table,
    p_source_id,
    p_payload
  )
$$;

revoke all on function private.record_audit_event(uuid, uuid, uuid, text, text, text, text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function private.record_patient_timeline_event(uuid, uuid, uuid, text, text, timestamptz, text, text, text, uuid, jsonb) from public, anon, authenticated;

grant execute on function private.record_audit_event(uuid, uuid, uuid, text, text, text, text, text, uuid, jsonb) to service_role;
grant execute on function private.record_patient_timeline_event(uuid, uuid, uuid, text, text, timestamptz, text, text, text, uuid, jsonb) to service_role;
