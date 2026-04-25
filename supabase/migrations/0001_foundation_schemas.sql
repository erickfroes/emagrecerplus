create extension if not exists pgcrypto;
create extension if not exists citext;

create schema if not exists platform;
create schema if not exists identity;
create schema if not exists crm;
create schema if not exists patients;
create schema if not exists scheduling;
create schema if not exists clinical;
create schema if not exists journey;
create schema if not exists commercial;
create schema if not exists finance;
create schema if not exists docs;
create schema if not exists comms;
create schema if not exists audit;
create schema if not exists analytics;
create schema if not exists api;
create schema if not exists private;

comment on schema api is 'Curated frontend-facing views and RPCs.';
comment on schema private is 'Internal helpers, security definer functions, and non-exposed database logic.';
comment on schema audit is 'Audit, idempotency, outbox, and longitudinal event infrastructure.';

revoke all on schema public from public;
revoke all on schema public from anon;
revoke all on schema public from authenticated;

revoke all on schema platform from public;
revoke all on schema platform from anon;
revoke all on schema platform from authenticated;
revoke all on schema identity from public;
revoke all on schema identity from anon;
revoke all on schema identity from authenticated;
revoke all on schema crm from public;
revoke all on schema crm from anon;
revoke all on schema crm from authenticated;
revoke all on schema patients from public;
revoke all on schema patients from anon;
revoke all on schema patients from authenticated;
revoke all on schema scheduling from public;
revoke all on schema scheduling from anon;
revoke all on schema scheduling from authenticated;
revoke all on schema clinical from public;
revoke all on schema clinical from anon;
revoke all on schema clinical from authenticated;
revoke all on schema journey from public;
revoke all on schema journey from anon;
revoke all on schema journey from authenticated;
revoke all on schema commercial from public;
revoke all on schema commercial from anon;
revoke all on schema commercial from authenticated;
revoke all on schema finance from public;
revoke all on schema finance from anon;
revoke all on schema finance from authenticated;
revoke all on schema docs from public;
revoke all on schema docs from anon;
revoke all on schema docs from authenticated;
revoke all on schema comms from public;
revoke all on schema comms from anon;
revoke all on schema comms from authenticated;
revoke all on schema audit from public;
revoke all on schema audit from anon;
revoke all on schema audit from authenticated;
revoke all on schema analytics from public;
revoke all on schema analytics from anon;
revoke all on schema analytics from authenticated;
revoke all on schema private from public;
revoke all on schema private from anon;

grant usage on schema api to anon;
grant usage on schema api to authenticated;
grant usage on schema api to service_role;
grant usage on schema private to authenticated;
grant usage on schema private to service_role;
grant usage on schema audit to service_role;

alter default privileges in schema platform revoke all on tables from public, anon, authenticated;
alter default privileges in schema identity revoke all on tables from public, anon, authenticated;
alter default privileges in schema crm revoke all on tables from public, anon, authenticated;
alter default privileges in schema patients revoke all on tables from public, anon, authenticated;
alter default privileges in schema scheduling revoke all on tables from public, anon, authenticated;
alter default privileges in schema clinical revoke all on tables from public, anon, authenticated;
alter default privileges in schema journey revoke all on tables from public, anon, authenticated;
alter default privileges in schema commercial revoke all on tables from public, anon, authenticated;
alter default privileges in schema finance revoke all on tables from public, anon, authenticated;
alter default privileges in schema docs revoke all on tables from public, anon, authenticated;
alter default privileges in schema comms revoke all on tables from public, anon, authenticated;
alter default privileges in schema audit revoke all on tables from public, anon, authenticated;
alter default privileges in schema analytics revoke all on tables from public, anon, authenticated;
alter default privileges in schema api revoke all on tables from public, anon, authenticated;
alter default privileges in schema private revoke all on tables from public, anon, authenticated;

alter default privileges in schema platform revoke all on sequences from public, anon, authenticated;
alter default privileges in schema identity revoke all on sequences from public, anon, authenticated;
alter default privileges in schema crm revoke all on sequences from public, anon, authenticated;
alter default privileges in schema patients revoke all on sequences from public, anon, authenticated;
alter default privileges in schema scheduling revoke all on sequences from public, anon, authenticated;
alter default privileges in schema clinical revoke all on sequences from public, anon, authenticated;
alter default privileges in schema journey revoke all on sequences from public, anon, authenticated;
alter default privileges in schema commercial revoke all on sequences from public, anon, authenticated;
alter default privileges in schema finance revoke all on sequences from public, anon, authenticated;
alter default privileges in schema docs revoke all on sequences from public, anon, authenticated;
alter default privileges in schema comms revoke all on sequences from public, anon, authenticated;
alter default privileges in schema audit revoke all on sequences from public, anon, authenticated;
alter default privileges in schema analytics revoke all on sequences from public, anon, authenticated;
alter default privileges in schema api revoke all on sequences from public, anon, authenticated;
alter default privileges in schema private revoke all on sequences from public, anon, authenticated;

alter default privileges in schema platform revoke all on functions from public, anon, authenticated;
alter default privileges in schema identity revoke all on functions from public, anon, authenticated;
alter default privileges in schema crm revoke all on functions from public, anon, authenticated;
alter default privileges in schema patients revoke all on functions from public, anon, authenticated;
alter default privileges in schema scheduling revoke all on functions from public, anon, authenticated;
alter default privileges in schema clinical revoke all on functions from public, anon, authenticated;
alter default privileges in schema journey revoke all on functions from public, anon, authenticated;
alter default privileges in schema commercial revoke all on functions from public, anon, authenticated;
alter default privileges in schema finance revoke all on functions from public, anon, authenticated;
alter default privileges in schema docs revoke all on functions from public, anon, authenticated;
alter default privileges in schema comms revoke all on functions from public, anon, authenticated;
alter default privileges in schema audit revoke all on functions from public, anon, authenticated;
alter default privileges in schema analytics revoke all on functions from public, anon, authenticated;
alter default privileges in schema api revoke all on functions from public, anon, authenticated;
alter default privileges in schema private revoke all on functions from public, anon, authenticated;

create table if not exists audit.audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  unit_id uuid,
  patient_id uuid,
  actor_type text not null,
  actor_id uuid,
  event_type text not null,
  action text,
  resource_schema text,
  resource_table text,
  resource_id uuid,
  payload jsonb not null default '{}'::jsonb,
  request_id uuid,
  idempotency_key text,
  created_at timestamptz not null default now()
);

create table if not exists audit.patient_timeline_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  unit_id uuid,
  patient_id uuid not null,
  actor_type text not null,
  actor_id uuid,
  event_type text not null,
  event_at timestamptz not null default now(),
  visibility_scope text not null default 'tenant_clinical',
  source_schema text,
  source_table text,
  source_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists audit.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  scope text not null,
  key text not null,
  request_hash text,
  response_snapshot jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  consumed_at timestamptz,
  unique (scope, key)
);

create table if not exists audit.outbox_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  unit_id uuid,
  patient_id uuid,
  aggregate_type text not null,
  aggregate_id uuid,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'delivered', 'failed', 'canceled')),
  available_at timestamptz not null default now(),
  delivered_at timestamptz,
  failure_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);

create table if not exists audit.integration_failures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  unit_id uuid,
  patient_id uuid,
  integration_name text not null,
  provider text,
  failure_type text not null,
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  retryable boolean not null default true,
  status text not null default 'open' check (status in ('open', 'retrying', 'resolved', 'ignored')),
  occurred_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_audit_events_tenant_created_at
  on audit.audit_events (tenant_id, created_at desc);

create index if not exists idx_audit_events_patient_created_at
  on audit.audit_events (patient_id, created_at desc);

create index if not exists idx_audit_events_request_id
  on audit.audit_events (request_id);

create index if not exists idx_patient_timeline_patient_event_at
  on audit.patient_timeline_events (tenant_id, patient_id, event_at desc);

create index if not exists idx_patient_timeline_event_type
  on audit.patient_timeline_events (event_type, event_at desc);

create index if not exists idx_outbox_events_status_available_at
  on audit.outbox_events (status, available_at);

create index if not exists idx_integration_failures_status_occurred_at
  on audit.integration_failures (status, occurred_at desc);

alter table audit.audit_events enable row level security;
alter table audit.patient_timeline_events enable row level security;
alter table audit.idempotency_keys enable row level security;
alter table audit.outbox_events enable row level security;
alter table audit.integration_failures enable row level security;

create or replace function private.set_current_timestamp_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Bootstrap helper layer.
-- These helpers are claim-backed only until Etapa 4 introduces relational memberships.
create or replace function private.current_profile_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(coalesce(auth.jwt(), '{}'::jsonb) -> 'app_metadata' ->> 'profile_id', '')::uuid,
    nullif(coalesce(auth.jwt(), '{}'::jsonb) ->> 'profile_id', '')::uuid,
    auth.uid()
  )
$$;

create or replace function private.current_tenant_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(coalesce(auth.jwt(), '{}'::jsonb) -> 'app_metadata' ->> 'tenant_id', '')::uuid,
    nullif(coalesce(auth.jwt(), '{}'::jsonb) ->> 'tenant_id', '')::uuid
  )
$$;

create or replace function private.current_unit_ids()
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select coalesce(
    array(
      select unit_id::uuid
      from jsonb_array_elements_text(
        coalesce(
          coalesce(auth.jwt(), '{}'::jsonb) -> 'app_metadata' -> 'unit_ids',
          coalesce(auth.jwt(), '{}'::jsonb) -> 'unit_ids',
          '[]'::jsonb
        )
      ) as unit_id
    ),
    '{}'::uuid[]
  )
$$;

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(coalesce(auth.jwt(), '{}'::jsonb) -> 'app_metadata' ->> 'is_platform_admin', '')::boolean,
    false
  )
  or coalesce(
    nullif(coalesce(auth.jwt(), '{}'::jsonb) ->> 'is_platform_admin', '')::boolean,
    false
  )
  or coalesce(auth.jwt(), '{}'::jsonb) -> 'app_metadata' ->> 'platform_role' in ('platform_owner', 'platform_support')
  or coalesce(auth.jwt(), '{}'::jsonb) ->> 'platform_role' in ('platform_owner', 'platform_support')
$$;

create or replace function private.has_permission(requested_code text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    private.is_platform_admin()
    or exists (
      select 1
      from jsonb_array_elements_text(
        coalesce(
          coalesce(auth.jwt(), '{}'::jsonb) -> 'app_metadata' -> 'permissions',
          coalesce(auth.jwt(), '{}'::jsonb) -> 'permissions',
          '[]'::jsonb
        )
      ) as granted_code
      where granted_code = requested_code
    )
$$;

create or replace function private.can_access_patient(target_patient_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    target_patient_id is not null
    and (
      private.is_platform_admin()
      or private.has_permission('patients.read.all')
      or private.has_permission('clinical.read.all')
      or coalesce(
        nullif(coalesce(auth.jwt(), '{}'::jsonb) -> 'app_metadata' ->> 'patient_id', '')::uuid = target_patient_id,
        false
      )
      or coalesce(
        nullif(coalesce(auth.jwt(), '{}'::jsonb) ->> 'patient_id', '')::uuid = target_patient_id,
        false
      )
      or exists (
        select 1
        from jsonb_array_elements_text(
          coalesce(
            coalesce(auth.jwt(), '{}'::jsonb) -> 'app_metadata' -> 'patient_ids',
            coalesce(auth.jwt(), '{}'::jsonb) -> 'patient_ids',
            '[]'::jsonb
          )
        ) as patient_id
        where patient_id::uuid = target_patient_id
      )
    )
$$;

create or replace function private.record_audit_event(
  p_tenant_id uuid,
  p_unit_id uuid,
  p_patient_id uuid,
  p_actor_type text,
  p_actor_id uuid,
  p_event_type text,
  p_action text default null,
  p_resource_schema text default null,
  p_resource_table text default null,
  p_resource_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_request_id uuid default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
begin
  insert into audit.audit_events (
    tenant_id,
    unit_id,
    patient_id,
    actor_type,
    actor_id,
    event_type,
    action,
    resource_schema,
    resource_table,
    resource_id,
    payload,
    request_id,
    idempotency_key
  )
  values (
    p_tenant_id,
    p_unit_id,
    p_patient_id,
    coalesce(p_actor_type, 'system'),
    coalesce(p_actor_id, private.current_profile_id()),
    p_event_type,
    p_action,
    p_resource_schema,
    p_resource_table,
    p_resource_id,
    coalesce(p_payload, '{}'::jsonb),
    p_request_id,
    p_idempotency_key
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

create or replace function private.record_patient_timeline_event(
  p_tenant_id uuid,
  p_unit_id uuid,
  p_patient_id uuid,
  p_actor_type text,
  p_actor_id uuid,
  p_event_type text,
  p_event_at timestamptz default null,
  p_visibility_scope text default 'tenant_clinical',
  p_source_schema text default null,
  p_source_table text default null,
  p_source_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
begin
  insert into audit.patient_timeline_events (
    tenant_id,
    unit_id,
    patient_id,
    actor_type,
    actor_id,
    event_type,
    event_at,
    visibility_scope,
    source_schema,
    source_table,
    source_id,
    payload
  )
  values (
    p_tenant_id,
    p_unit_id,
    p_patient_id,
    coalesce(p_actor_type, 'system'),
    coalesce(p_actor_id, private.current_profile_id()),
    p_event_type,
    coalesce(p_event_at, now()),
    coalesce(p_visibility_scope, 'tenant_clinical'),
    p_source_schema,
    p_source_table,
    p_source_id,
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

create or replace function api.healthcheck()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', true,
    'runtime', 'supabase',
    'release', '0001_foundation_schemas',
    'timestamp', now()
  )
$$;

revoke all on all tables in schema audit from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;

revoke all on function private.current_profile_id() from public, anon;
revoke all on function private.current_tenant_id() from public, anon;
revoke all on function private.current_unit_ids() from public, anon;
revoke all on function private.is_platform_admin() from public, anon;
revoke all on function private.has_permission(text) from public, anon;
revoke all on function private.can_access_patient(uuid) from public, anon;
revoke all on function private.record_audit_event(uuid, uuid, uuid, text, uuid, text, text, text, text, uuid, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function private.record_patient_timeline_event(uuid, uuid, uuid, text, uuid, text, timestamptz, text, text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function private.set_current_timestamp_updated_at() from public, anon, authenticated;
revoke all on function api.healthcheck() from public;

grant execute on function private.current_profile_id() to authenticated, service_role;
grant execute on function private.current_tenant_id() to authenticated, service_role;
grant execute on function private.current_unit_ids() to authenticated, service_role;
grant execute on function private.is_platform_admin() to authenticated, service_role;
grant execute on function private.has_permission(text) to authenticated, service_role;
grant execute on function private.can_access_patient(uuid) to authenticated, service_role;
grant execute on function private.record_audit_event(uuid, uuid, uuid, text, uuid, text, text, text, text, uuid, jsonb, uuid, text) to service_role;
grant execute on function private.record_patient_timeline_event(uuid, uuid, uuid, text, uuid, text, timestamptz, text, text, text, uuid, jsonb) to service_role;
grant execute on function api.healthcheck() to anon, authenticated;
