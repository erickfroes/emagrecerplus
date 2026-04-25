create or replace function private.can_read_commercial_domain(target_tenant_id uuid)
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
      or private.has_permission('crm.read')
      or private.has_permission('crm.write')
    )
$$;

create or replace function private.can_manage_commercial_domain(target_tenant_id uuid)
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
      or private.has_permission('crm.write')
    )
$$;

revoke all on function private.can_read_commercial_domain(uuid) from public, anon;
revoke all on function private.can_manage_commercial_domain(uuid) from public, anon;

grant execute on function private.can_read_commercial_domain(uuid) to authenticated, service_role;
grant execute on function private.can_manage_commercial_domain(uuid) to authenticated, service_role;

create table if not exists commercial.pipelines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  legacy_pipeline_id text,
  name text not null,
  code text not null,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint commercial_pipelines_tenant_code_key unique (tenant_id, code)
);

create table if not exists commercial.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  pipeline_id uuid not null references commercial.pipelines (id) on delete cascade,
  legacy_stage_id text,
  name text not null,
  code text not null,
  position integer not null check (position >= 0),
  is_final boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_pipeline_stages_pipeline_code_key unique (pipeline_id, code),
  constraint commercial_pipeline_stages_pipeline_position_key unique (pipeline_id, position)
);

create table if not exists commercial.leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  legacy_lead_id text,
  full_name text not null,
  phone text,
  email citext,
  source text,
  campaign text,
  interest_type text,
  status text not null default 'new' check (
    status in ('new', 'contacted', 'qualified', 'appointment_booked', 'proposal_sent', 'won', 'lost')
  ),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists commercial.lead_profiles (
  lead_id uuid primary key references commercial.leads (id) on delete cascade,
  main_goal text,
  budget_range text,
  urgency_level text,
  pain_point text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists commercial.lead_stage_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  legacy_stage_history_key text,
  lead_id uuid not null references commercial.leads (id) on delete cascade,
  stage_id uuid not null references commercial.pipeline_stages (id) on delete cascade,
  changed_by_profile_id uuid references identity.profiles (id) on delete set null,
  changed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists commercial.lead_activities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  legacy_activity_id text,
  lead_id uuid not null references commercial.leads (id) on delete cascade,
  assigned_to_profile_id uuid references identity.profiles (id) on delete set null,
  activity_type text not null check (
    activity_type in ('call', 'message', 'task', 'note', 'email', 'meeting')
  ),
  description text,
  due_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists commercial.conversions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  legacy_conversion_id text,
  lead_id uuid not null unique references commercial.leads (id) on delete cascade,
  patient_id uuid not null references patients.patients (id) on delete restrict,
  converted_by_profile_id uuid references identity.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_commercial_pipelines_legacy_id
  on commercial.pipelines (legacy_pipeline_id)
  where legacy_pipeline_id is not null;

create index if not exists idx_commercial_pipelines_tenant_active
  on commercial.pipelines (tenant_id, active)
  where deleted_at is null;

create unique index if not exists idx_commercial_pipeline_stages_legacy_id
  on commercial.pipeline_stages (legacy_stage_id)
  where legacy_stage_id is not null;

create index if not exists idx_commercial_pipeline_stages_tenant_pipeline_position
  on commercial.pipeline_stages (tenant_id, pipeline_id, position asc);

create unique index if not exists idx_commercial_leads_legacy_id
  on commercial.leads (legacy_lead_id)
  where legacy_lead_id is not null;

create index if not exists idx_commercial_leads_tenant_status_created_at
  on commercial.leads (tenant_id, status, created_at desc)
  where deleted_at is null;

create index if not exists idx_commercial_leads_tenant_full_name
  on commercial.leads (tenant_id, full_name)
  where deleted_at is null;

create index if not exists idx_commercial_leads_tenant_phone
  on commercial.leads (tenant_id, phone)
  where phone is not null and deleted_at is null;

create unique index if not exists idx_commercial_lead_stage_history_legacy_key
  on commercial.lead_stage_history (legacy_stage_history_key)
  where legacy_stage_history_key is not null;

create index if not exists idx_commercial_lead_stage_history_lead_changed_at
  on commercial.lead_stage_history (lead_id, changed_at desc);

create unique index if not exists idx_commercial_lead_activities_legacy_id
  on commercial.lead_activities (legacy_activity_id)
  where legacy_activity_id is not null;

create index if not exists idx_commercial_lead_activities_lead_due_at
  on commercial.lead_activities (lead_id, due_at asc nulls last, created_at desc);

create index if not exists idx_commercial_lead_activities_assigned_status
  on commercial.lead_activities (assigned_to_profile_id, completed_at, due_at)
  where assigned_to_profile_id is not null;

create unique index if not exists idx_commercial_conversions_legacy_id
  on commercial.conversions (legacy_conversion_id)
  where legacy_conversion_id is not null;

create index if not exists idx_commercial_conversions_patient_created_at
  on commercial.conversions (patient_id, created_at desc);

drop trigger if exists set_commercial_pipelines_updated_at on commercial.pipelines;
create trigger set_commercial_pipelines_updated_at
before update on commercial.pipelines
for each row execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_commercial_pipeline_stages_updated_at on commercial.pipeline_stages;
create trigger set_commercial_pipeline_stages_updated_at
before update on commercial.pipeline_stages
for each row execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_commercial_leads_updated_at on commercial.leads;
create trigger set_commercial_leads_updated_at
before update on commercial.leads
for each row execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_commercial_lead_profiles_updated_at on commercial.lead_profiles;
create trigger set_commercial_lead_profiles_updated_at
before update on commercial.lead_profiles
for each row execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_commercial_lead_activities_updated_at on commercial.lead_activities;
create trigger set_commercial_lead_activities_updated_at
before update on commercial.lead_activities
for each row execute function private.set_current_timestamp_updated_at();

grant all on table commercial.pipelines to service_role;
grant all on table commercial.pipeline_stages to service_role;
grant all on table commercial.leads to service_role;
grant all on table commercial.lead_profiles to service_role;
grant all on table commercial.lead_stage_history to service_role;
grant all on table commercial.lead_activities to service_role;
grant all on table commercial.conversions to service_role;

alter table commercial.pipelines enable row level security;
alter table commercial.pipeline_stages enable row level security;
alter table commercial.leads enable row level security;
alter table commercial.lead_profiles enable row level security;
alter table commercial.lead_stage_history enable row level security;
alter table commercial.lead_activities enable row level security;
alter table commercial.conversions enable row level security;

drop policy if exists commercial_pipelines_select_current_scope on commercial.pipelines;
create policy commercial_pipelines_select_current_scope
on commercial.pipelines
for select
using (private.can_read_commercial_domain(tenant_id));

drop policy if exists commercial_pipelines_manage_current_scope on commercial.pipelines;
create policy commercial_pipelines_manage_current_scope
on commercial.pipelines
for all
using (private.can_manage_commercial_domain(tenant_id))
with check (private.can_manage_commercial_domain(tenant_id));

drop policy if exists commercial_pipeline_stages_select_current_scope on commercial.pipeline_stages;
create policy commercial_pipeline_stages_select_current_scope
on commercial.pipeline_stages
for select
using (private.can_read_commercial_domain(tenant_id));

drop policy if exists commercial_pipeline_stages_manage_current_scope on commercial.pipeline_stages;
create policy commercial_pipeline_stages_manage_current_scope
on commercial.pipeline_stages
for all
using (private.can_manage_commercial_domain(tenant_id))
with check (private.can_manage_commercial_domain(tenant_id));

drop policy if exists commercial_leads_select_current_scope on commercial.leads;
create policy commercial_leads_select_current_scope
on commercial.leads
for select
using (private.can_read_commercial_domain(tenant_id));

drop policy if exists commercial_leads_manage_current_scope on commercial.leads;
create policy commercial_leads_manage_current_scope
on commercial.leads
for all
using (private.can_manage_commercial_domain(tenant_id))
with check (private.can_manage_commercial_domain(tenant_id));

drop policy if exists commercial_lead_profiles_select_current_scope on commercial.lead_profiles;
create policy commercial_lead_profiles_select_current_scope
on commercial.lead_profiles
for select
using (
  exists (
    select 1
    from commercial.leads as leads
    where leads.id = lead_profiles.lead_id
      and private.can_read_commercial_domain(leads.tenant_id)
  )
);

drop policy if exists commercial_lead_profiles_manage_current_scope on commercial.lead_profiles;
create policy commercial_lead_profiles_manage_current_scope
on commercial.lead_profiles
for all
using (
  exists (
    select 1
    from commercial.leads as leads
    where leads.id = lead_profiles.lead_id
      and private.can_manage_commercial_domain(leads.tenant_id)
  )
)
with check (
  exists (
    select 1
    from commercial.leads as leads
    where leads.id = lead_profiles.lead_id
      and private.can_manage_commercial_domain(leads.tenant_id)
  )
);

drop policy if exists commercial_lead_stage_history_select_current_scope on commercial.lead_stage_history;
create policy commercial_lead_stage_history_select_current_scope
on commercial.lead_stage_history
for select
using (private.can_read_commercial_domain(tenant_id));

drop policy if exists commercial_lead_stage_history_manage_current_scope on commercial.lead_stage_history;
create policy commercial_lead_stage_history_manage_current_scope
on commercial.lead_stage_history
for all
using (private.can_manage_commercial_domain(tenant_id))
with check (private.can_manage_commercial_domain(tenant_id));

drop policy if exists commercial_lead_activities_select_current_scope on commercial.lead_activities;
create policy commercial_lead_activities_select_current_scope
on commercial.lead_activities
for select
using (private.can_read_commercial_domain(tenant_id));

drop policy if exists commercial_lead_activities_manage_current_scope on commercial.lead_activities;
create policy commercial_lead_activities_manage_current_scope
on commercial.lead_activities
for all
using (private.can_manage_commercial_domain(tenant_id))
with check (private.can_manage_commercial_domain(tenant_id));

drop policy if exists commercial_conversions_select_current_scope on commercial.conversions;
create policy commercial_conversions_select_current_scope
on commercial.conversions
for select
using (private.can_read_commercial_domain(tenant_id));

drop policy if exists commercial_conversions_manage_current_scope on commercial.conversions;
create policy commercial_conversions_manage_current_scope
on commercial.conversions
for all
using (private.can_manage_commercial_domain(tenant_id))
with check (private.can_manage_commercial_domain(tenant_id));
