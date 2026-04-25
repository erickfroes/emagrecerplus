create or replace function private.can_read_platform_billing_domain(target_tenant_id uuid)
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
      or private.has_permission('platform.write')
      or private.has_permission('settings.write')
      or private.has_permission('audit.read')
    )
$$;

create or replace function private.can_manage_platform_billing_domain(target_tenant_id uuid)
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
      or private.has_permission('platform.write')
      or private.has_permission('settings.write')
    )
$$;

create or replace function private.normalize_platform_subscription_status(
  p_requested_status text default null,
  p_tenant_status text default null
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with normalized as (
    select
      lower(nullif(trim(coalesce(p_requested_status, '')), '')) as requested_status,
      lower(nullif(trim(coalesce(p_tenant_status, '')), '')) as tenant_status
  )
  select
    case
      when normalized.requested_status in ('trialing', 'active', 'past_due', 'suspended', 'canceled', 'expired')
        then normalized.requested_status
      when normalized.tenant_status in ('trial', 'trialing')
        then 'trialing'
      when normalized.tenant_status in ('suspended', 'inactive')
        then 'suspended'
      when normalized.tenant_status in ('archived', 'canceled', 'cancelled')
        then 'canceled'
      else 'active'
    end
  from normalized
$$;

create or replace function private.try_numeric(p_value text)
returns numeric
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_numeric numeric;
begin
  if nullif(trim(coalesce(p_value, '')), '') is null then
    return null;
  end if;

  begin
    v_numeric := trim(p_value)::numeric;
  exception
    when others then
      return null;
  end;

  return v_numeric;
end;
$$;

create or replace function private.jsonb_numeric(
  p_payload jsonb,
  p_key text
)
returns numeric
language sql
immutable
security definer
set search_path = ''
as $$
  select private.try_numeric(coalesce(p_payload ->> p_key, null))
$$;

create or replace function private.period_window(
  p_period text default 'monthly',
  p_reference timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_period text := lower(coalesce(nullif(trim(p_period), ''), 'monthly'));
  v_reference timestamptz := coalesce(p_reference, now());
  v_started_at timestamptz;
  v_ends_at timestamptz;
begin
  case v_period
    when 'daily' then
      v_started_at := date_trunc('day', v_reference);
      v_ends_at := v_started_at + interval '1 day';
    when 'weekly' then
      v_started_at := date_trunc('week', v_reference);
      v_ends_at := v_started_at + interval '1 week';
    when 'quarterly' then
      v_started_at := date_trunc('quarter', v_reference);
      v_ends_at := v_started_at + interval '3 months';
    when 'semiannual' then
      v_started_at := date_trunc('year', v_reference)
        + case
            when extract(month from v_reference) <= 6 then interval '0 months'
            else interval '6 months'
          end;
      v_ends_at := v_started_at + interval '6 months';
    when 'annual' then
      v_started_at := date_trunc('year', v_reference);
      v_ends_at := v_started_at + interval '1 year';
    when 'never' then
      v_started_at := null;
      v_ends_at := null;
    else
      v_started_at := date_trunc('month', v_reference);
      v_ends_at := v_started_at + interval '1 month';
  end case;

  return jsonb_build_object(
    'startedAt', v_started_at,
    'endsAt', v_ends_at
  );
end;
$$;

revoke all on function private.can_read_platform_billing_domain(uuid) from public, anon;
revoke all on function private.can_manage_platform_billing_domain(uuid) from public, anon;
revoke all on function private.normalize_platform_subscription_status(text, text) from public, anon, authenticated;
revoke all on function private.try_numeric(text) from public, anon, authenticated;
revoke all on function private.jsonb_numeric(jsonb, text) from public, anon, authenticated;
revoke all on function private.period_window(text, timestamptz) from public, anon, authenticated;

grant execute on function private.can_read_platform_billing_domain(uuid) to authenticated, service_role;
grant execute on function private.can_manage_platform_billing_domain(uuid) to authenticated, service_role;
grant execute on function private.normalize_platform_subscription_status(text, text) to authenticated, service_role;
grant execute on function private.try_numeric(text) to authenticated, service_role;
grant execute on function private.jsonb_numeric(jsonb, text) to authenticated, service_role;
grant execute on function private.period_window(text, timestamptz) to authenticated, service_role;

create table if not exists platform.tenant_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  status text not null default 'active' check (
    status in ('draft', 'active', 'deprecated', 'archived')
  ),
  billing_interval text not null default 'monthly' check (
    billing_interval in ('monthly', 'quarterly', 'semiannual', 'annual', 'custom')
  ),
  currency_code text not null default 'BRL',
  price_amount numeric(12,2) not null default 0 check (price_amount >= 0),
  trial_days integer not null default 0 check (trial_days >= 0),
  included_limits jsonb not null default '{}'::jsonb,
  features jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists platform.tenant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  plan_id uuid not null references platform.tenant_plans (id) on delete restrict,
  legacy_subscription_plan_code text,
  plan_code_snapshot text,
  plan_name_snapshot text,
  status text not null default 'active' check (
    status in ('trialing', 'active', 'past_due', 'suspended', 'canceled', 'expired')
  ),
  started_at timestamptz not null default now(),
  trial_ends_at timestamptz,
  current_period_started_at timestamptz not null default now(),
  current_period_ends_at timestamptz not null default (now() + interval '1 month'),
  canceled_at timestamptz,
  ended_at timestamptz,
  auto_renew boolean not null default true,
  external_customer_id text,
  external_subscription_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists platform.usage_meters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  subscription_id uuid not null references platform.tenant_subscriptions (id) on delete cascade,
  meter_code text not null,
  meter_name text not null,
  aggregation_mode text not null default 'gauge' check (
    aggregation_mode in ('gauge', 'counter')
  ),
  reset_period text not null default 'never' check (
    reset_period in ('never', 'daily', 'weekly', 'monthly', 'quarterly', 'annual')
  ),
  status text not null default 'active' check (
    status in ('active', 'paused', 'archived')
  ),
  current_value numeric(14,2) not null default 0 check (current_value >= 0),
  included_limit numeric(14,2) check (included_limit is null or included_limit >= 0),
  soft_limit numeric(14,2) check (soft_limit is null or soft_limit >= 0),
  hard_limit numeric(14,2) check (hard_limit is null or hard_limit >= 0),
  period_started_at timestamptz,
  period_ends_at timestamptz,
  last_recorded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint usage_meters_soft_hard_check check (
    soft_limit is null
    or hard_limit is null
    or soft_limit <= hard_limit
  )
);

create unique index if not exists idx_platform_tenant_plans_code
  on platform.tenant_plans (code)
  where deleted_at is null;

create index if not exists idx_platform_tenant_plans_status
  on platform.tenant_plans (status, created_at desc)
  where deleted_at is null;

create unique index if not exists idx_platform_tenant_subscriptions_single_open
  on platform.tenant_subscriptions (tenant_id)
  where deleted_at is null
    and status in ('trialing', 'active', 'past_due', 'suspended');

create unique index if not exists idx_platform_tenant_subscriptions_external
  on platform.tenant_subscriptions (external_subscription_id)
  where external_subscription_id is not null
    and deleted_at is null;

create index if not exists idx_platform_tenant_subscriptions_tenant_status_period
  on platform.tenant_subscriptions (tenant_id, status, current_period_ends_at asc nulls last, created_at desc)
  where deleted_at is null;

create index if not exists idx_platform_tenant_subscriptions_plan_status
  on platform.tenant_subscriptions (plan_id, status, created_at desc)
  where deleted_at is null;

create unique index if not exists idx_platform_usage_meters_tenant_code
  on platform.usage_meters (tenant_id, meter_code)
  where deleted_at is null;

create index if not exists idx_platform_usage_meters_subscription_status
  on platform.usage_meters (subscription_id, status, meter_code)
  where deleted_at is null;

create index if not exists idx_platform_usage_meters_tenant_limits
  on platform.usage_meters (tenant_id, hard_limit, soft_limit, current_value)
  where deleted_at is null;

drop trigger if exists set_platform_tenant_plans_updated_at on platform.tenant_plans;
create trigger set_platform_tenant_plans_updated_at
before update on platform.tenant_plans
for each row execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_platform_tenant_subscriptions_updated_at on platform.tenant_subscriptions;
create trigger set_platform_tenant_subscriptions_updated_at
before update on platform.tenant_subscriptions
for each row execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_platform_usage_meters_updated_at on platform.usage_meters;
create trigger set_platform_usage_meters_updated_at
before update on platform.usage_meters
for each row execute function private.set_current_timestamp_updated_at();

grant all on table platform.tenant_plans to service_role;
grant all on table platform.tenant_subscriptions to service_role;
grant all on table platform.usage_meters to service_role;

alter table platform.tenant_plans enable row level security;
alter table platform.tenant_subscriptions enable row level security;
alter table platform.usage_meters enable row level security;

drop policy if exists tenant_plans_select_billing_scope on platform.tenant_plans;
create policy tenant_plans_select_billing_scope
on platform.tenant_plans
for select
using (
  private.is_platform_admin()
  or private.can_read_platform_billing_domain(private.current_tenant_id())
);

drop policy if exists tenant_plans_manage_platform_admin on platform.tenant_plans;
create policy tenant_plans_manage_platform_admin
on platform.tenant_plans
for all
using (private.is_platform_admin())
with check (private.is_platform_admin());

drop policy if exists tenant_subscriptions_select_billing_scope on platform.tenant_subscriptions;
create policy tenant_subscriptions_select_billing_scope
on platform.tenant_subscriptions
for select
using (private.can_read_platform_billing_domain(tenant_id));

drop policy if exists tenant_subscriptions_manage_billing_scope on platform.tenant_subscriptions;
create policy tenant_subscriptions_manage_billing_scope
on platform.tenant_subscriptions
for all
using (private.can_manage_platform_billing_domain(tenant_id))
with check (private.can_manage_platform_billing_domain(tenant_id));

drop policy if exists usage_meters_select_billing_scope on platform.usage_meters;
create policy usage_meters_select_billing_scope
on platform.usage_meters
for select
using (private.can_read_platform_billing_domain(tenant_id));

drop policy if exists usage_meters_manage_billing_scope on platform.usage_meters;
create policy usage_meters_manage_billing_scope
on platform.usage_meters
for all
using (private.can_manage_platform_billing_domain(tenant_id))
with check (private.can_manage_platform_billing_domain(tenant_id));

create or replace function private.resolve_tenant_plan_id(p_plan_ref text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select plans.id
  from platform.tenant_plans as plans
  where plans.deleted_at is null
    and (
      plans.id::text = p_plan_ref
      or plans.code = lower(coalesce(p_plan_ref, ''))
    )
  order by
    case
      when plans.id::text = p_plan_ref then 0
      else 1
    end
  limit 1
$$;

revoke all on function private.resolve_tenant_plan_id(text) from public, anon, authenticated;
grant execute on function private.resolve_tenant_plan_id(text) to authenticated, service_role;

create or replace function private.ensure_default_tenant_usage_meters(
  p_runtime_tenant_id uuid,
  p_source text default 'runtime_backfill'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription_id uuid;
  v_included_limits jsonb := '{}'::jsonb;
  v_month_window jsonb;
  v_month_started_at timestamptz;
  v_month_ends_at timestamptz;
  v_active_patients numeric(14,2) := 0;
  v_active_staff numeric(14,2) := 0;
  v_monthly_appointments numeric(14,2) := 0;
  v_usage_meter_count integer := 0;
begin
  if p_runtime_tenant_id is null then
    raise exception 'p_runtime_tenant_id is required';
  end if;

  select subscriptions.id, coalesce(plans.included_limits, '{}'::jsonb)
  into v_subscription_id, v_included_limits
  from platform.tenant_subscriptions as subscriptions
  join platform.tenant_plans as plans
    on plans.id = subscriptions.plan_id
   and plans.deleted_at is null
  where subscriptions.tenant_id = p_runtime_tenant_id
    and subscriptions.deleted_at is null
    and subscriptions.status in ('trialing', 'active', 'past_due', 'suspended')
  order by
    case subscriptions.status
      when 'active' then 0
      when 'trialing' then 1
      when 'past_due' then 2
      when 'suspended' then 3
      else 4
    end,
    coalesce(subscriptions.current_period_ends_at, subscriptions.updated_at, subscriptions.created_at) desc,
    subscriptions.created_at desc
  limit 1;

  if v_subscription_id is null then
    return jsonb_build_object(
      'tenantId', p_runtime_tenant_id,
      'usageMeters', 0
    );
  end if;

  v_month_window := private.period_window('monthly', now());
  v_month_started_at := (v_month_window ->> 'startedAt')::timestamptz;
  v_month_ends_at := (v_month_window ->> 'endsAt')::timestamptz;

  select count(*)::numeric(14,2)
  into v_active_patients
  from patients.patients as patients
  where patients.tenant_id = p_runtime_tenant_id
    and patients.deleted_at is null
    and patients.status = 'active';

  select count(*)::numeric(14,2)
  into v_active_staff
  from identity.memberships as memberships
  join identity.roles as roles
    on roles.id = memberships.role_id
  where memberships.tenant_id = p_runtime_tenant_id
    and memberships.status = 'active'
    and roles.app_role_code <> 'patient';

  select count(*)::numeric(14,2)
  into v_monthly_appointments
  from scheduling.appointments as appointments
  where appointments.tenant_id = p_runtime_tenant_id
    and appointments.deleted_at is null
    and appointments.starts_at >= v_month_started_at
    and appointments.starts_at < v_month_ends_at;

  with meter_rows as (
    select
      p_runtime_tenant_id as tenant_id,
      v_subscription_id as subscription_id,
      'active_patients'::text as meter_code,
      'Pacientes ativos'::text as meter_name,
      'gauge'::text as aggregation_mode,
      'never'::text as reset_period,
      'active'::text as status,
      v_active_patients as current_value,
      private.jsonb_numeric(v_included_limits, 'activePatients')::numeric(14,2) as included_limit,
      null::timestamptz as period_started_at,
      null::timestamptz as period_ends_at,
      now() as last_recorded_at,
      jsonb_build_object('source', p_source) as metadata
    union all
    select
      p_runtime_tenant_id,
      v_subscription_id,
      'active_staff',
      'Equipe ativa',
      'gauge',
      'never',
      'active',
      v_active_staff,
      private.jsonb_numeric(v_included_limits, 'activeStaff')::numeric(14,2),
      null::timestamptz,
      null::timestamptz,
      now(),
      jsonb_build_object('source', p_source)
    union all
    select
      p_runtime_tenant_id,
      v_subscription_id,
      'monthly_appointments',
      'Agendamentos do mes',
      'counter',
      'monthly',
      'active',
      v_monthly_appointments,
      private.jsonb_numeric(v_included_limits, 'monthlyAppointments')::numeric(14,2),
      v_month_started_at,
      v_month_ends_at,
      now(),
      jsonb_build_object('source', p_source)
  )
  insert into platform.usage_meters (
    tenant_id,
    subscription_id,
    meter_code,
    meter_name,
    aggregation_mode,
    reset_period,
    status,
    current_value,
    included_limit,
    soft_limit,
    hard_limit,
    period_started_at,
    period_ends_at,
    last_recorded_at,
    metadata
  )
  select
    meter_rows.tenant_id,
    meter_rows.subscription_id,
    meter_rows.meter_code,
    meter_rows.meter_name,
    meter_rows.aggregation_mode,
    meter_rows.reset_period,
    meter_rows.status,
    meter_rows.current_value,
    meter_rows.included_limit,
    case
      when meter_rows.included_limit is null then null
      else round(meter_rows.included_limit * 0.9, 2)
    end as soft_limit,
    meter_rows.included_limit as hard_limit,
    meter_rows.period_started_at,
    meter_rows.period_ends_at,
    meter_rows.last_recorded_at,
    meter_rows.metadata
  from meter_rows
  on conflict (tenant_id, meter_code)
    where deleted_at is null
  do update
  set
    subscription_id = excluded.subscription_id,
    meter_name = excluded.meter_name,
    aggregation_mode = excluded.aggregation_mode,
    reset_period = excluded.reset_period,
    status = excluded.status,
    current_value = excluded.current_value,
    included_limit = excluded.included_limit,
    soft_limit = excluded.soft_limit,
    hard_limit = excluded.hard_limit,
    period_started_at = excluded.period_started_at,
    period_ends_at = excluded.period_ends_at,
    last_recorded_at = excluded.last_recorded_at,
    metadata = coalesce(platform.usage_meters.metadata, '{}'::jsonb) || excluded.metadata,
    deleted_at = null;

  get diagnostics v_usage_meter_count = row_count;

  return jsonb_build_object(
    'tenantId', p_runtime_tenant_id,
    'usageMeters', v_usage_meter_count
  );
end;
$$;

create or replace function private.sync_runtime_tenant_billing(
  p_runtime_tenant_id uuid,
  p_subscription_plan_code text,
  p_tenant_status text default null,
  p_source text default 'runtime_backfill'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_code text := lower(nullif(trim(coalesce(p_subscription_plan_code, '')), ''));
  v_plan_id uuid;
  v_plan_name text;
  v_billing_interval text;
  v_subscription_id uuid;
  v_subscription_status text := private.normalize_platform_subscription_status(null, p_tenant_status);
  v_period_window jsonb;
  v_usage_meter_result jsonb;
begin
  if p_runtime_tenant_id is null then
    raise exception 'p_runtime_tenant_id is required';
  end if;

  if v_plan_code is not null then
    insert into platform.tenant_plans (
      code,
      name,
      status,
      billing_interval,
      currency_code,
      price_amount,
      trial_days,
      included_limits,
      features,
      metadata
    )
    values (
      v_plan_code,
      initcap(replace(replace(v_plan_code, '-', ' '), '_', ' ')),
      'active',
      'monthly',
      'BRL',
      0,
      0,
      '{}'::jsonb,
      '{}'::jsonb,
      jsonb_build_object(
        'source', p_source,
        'autoCreated', true
      )
    )
    on conflict (code)
      where deleted_at is null
    do update
    set
      metadata = coalesce(platform.tenant_plans.metadata, '{}'::jsonb) || jsonb_build_object(
        'lastSource', p_source,
        'autoCreated', true
      ),
      deleted_at = null
    returning id, name, billing_interval
    into v_plan_id, v_plan_name, v_billing_interval;
  end if;

  if v_plan_id is null then
    select plans.id, plans.name, plans.billing_interval
    into v_plan_id, v_plan_name, v_billing_interval
    from platform.tenant_plans as plans
    where plans.deleted_at is null
      and plans.code = v_plan_code
    limit 1;
  end if;

  select subscriptions.id
  into v_subscription_id
  from platform.tenant_subscriptions as subscriptions
  where subscriptions.tenant_id = p_runtime_tenant_id
    and subscriptions.deleted_at is null
    and subscriptions.status in ('trialing', 'active', 'past_due', 'suspended')
  order by
    case subscriptions.status
      when 'active' then 0
      when 'trialing' then 1
      when 'past_due' then 2
      when 'suspended' then 3
      else 4
    end,
    coalesce(subscriptions.current_period_ends_at, subscriptions.updated_at, subscriptions.created_at) desc,
    subscriptions.created_at desc
  limit 1;

  if v_plan_id is null and v_subscription_id is null then
    return jsonb_build_object(
      'tenantId', p_runtime_tenant_id,
      'planCode', null,
      'subscriptionId', null,
      'usageMeters', 0
    );
  end if;

  v_period_window := private.period_window(coalesce(v_billing_interval, 'monthly'), now());

  if v_subscription_id is null then
    insert into platform.tenant_subscriptions (
      tenant_id,
      plan_id,
      legacy_subscription_plan_code,
      plan_code_snapshot,
      plan_name_snapshot,
      status,
      started_at,
      current_period_started_at,
      current_period_ends_at,
      auto_renew,
      metadata
    )
    values (
      p_runtime_tenant_id,
      v_plan_id,
      v_plan_code,
      v_plan_code,
      v_plan_name,
      v_subscription_status,
      now(),
      coalesce((v_period_window ->> 'startedAt')::timestamptz, now()),
      coalesce((v_period_window ->> 'endsAt')::timestamptz, now() + interval '1 month'),
      v_subscription_status not in ('canceled', 'expired'),
      jsonb_build_object(
        'source', p_source
      )
    )
    returning id into v_subscription_id;
  else
    update platform.tenant_subscriptions as subscriptions
    set
      plan_id = coalesce(v_plan_id, subscriptions.plan_id),
      legacy_subscription_plan_code = coalesce(v_plan_code, subscriptions.legacy_subscription_plan_code),
      plan_code_snapshot = coalesce(v_plan_code, subscriptions.plan_code_snapshot),
      plan_name_snapshot = coalesce(v_plan_name, subscriptions.plan_name_snapshot),
      status = v_subscription_status,
      auto_renew = case
        when v_subscription_status in ('canceled', 'expired') then false
        else subscriptions.auto_renew
      end,
      current_period_started_at = coalesce(
        subscriptions.current_period_started_at,
        (v_period_window ->> 'startedAt')::timestamptz,
        now()
      ),
      current_period_ends_at = coalesce(
        subscriptions.current_period_ends_at,
        (v_period_window ->> 'endsAt')::timestamptz,
        now() + interval '1 month'
      ),
      canceled_at = case
        when v_subscription_status = 'canceled' then coalesce(subscriptions.canceled_at, now())
        else subscriptions.canceled_at
      end,
      ended_at = case
        when v_subscription_status in ('canceled', 'expired') then coalesce(subscriptions.ended_at, now())
        else null
      end,
      metadata = coalesce(subscriptions.metadata, '{}'::jsonb) || jsonb_build_object(
        'lastSource', p_source
      ),
      deleted_at = null
    where subscriptions.id = v_subscription_id;
  end if;

  v_usage_meter_result := private.ensure_default_tenant_usage_meters(p_runtime_tenant_id, p_source);

  return jsonb_build_object(
    'tenantId', p_runtime_tenant_id,
    'planCode', v_plan_code,
    'subscriptionId', v_subscription_id,
    'usageMeters', coalesce((v_usage_meter_result ->> 'usageMeters')::integer, 0)
  );
end;
$$;

create or replace function private.sync_tenant_billing_after_tenant_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  if pg_trigger_depth() > 1 then
    return new;
  end if;

  perform private.sync_runtime_tenant_billing(
    new.id,
    new.subscription_plan_code,
    new.status,
    'tenant_trigger'
  );

  return new;
end;
$$;

revoke all on function private.ensure_default_tenant_usage_meters(uuid, text) from public, anon, authenticated;
revoke all on function private.sync_runtime_tenant_billing(uuid, text, text, text) from public, anon, authenticated;
revoke all on function private.sync_tenant_billing_after_tenant_write() from public, anon, authenticated;

grant execute on function private.ensure_default_tenant_usage_meters(uuid, text) to authenticated, service_role;
grant execute on function private.sync_runtime_tenant_billing(uuid, text, text, text) to service_role;
grant execute on function private.sync_tenant_billing_after_tenant_write() to service_role;

drop trigger if exists sync_platform_tenant_billing_after_write on platform.tenants;
create trigger sync_platform_tenant_billing_after_write
after insert or update of status, subscription_plan_code on platform.tenants
for each row
execute function private.sync_tenant_billing_after_tenant_write();

create or replace function api.backfill_runtime_platform_billing(
  p_runtime_tenant_id uuid,
  p_plans jsonb default '[]'::jsonb,
  p_subscriptions jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plans_count integer := 0;
  v_subscriptions_count integer := 0;
  v_usage_meter_result jsonb;
  v_runtime_subscription_plan_code text;
begin
  if p_runtime_tenant_id is null then
    raise exception 'p_runtime_tenant_id is required';
  end if;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_plans, '[]'::jsonb)) as x(
      id uuid,
      code text,
      name text,
      description text,
      status text,
      billing_interval text,
      currency_code text,
      price_amount numeric,
      trial_days integer,
      included_limits jsonb,
      features jsonb,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz,
      deleted_at timestamptz
    )
  ),
  normalized as (
    select
      coalesce(rows.id, gen_random_uuid()) as id,
      lower(nullif(trim(coalesce(rows.code, '')), '')) as code,
      coalesce(
        nullif(trim(coalesce(rows.name, '')), ''),
        initcap(replace(replace(lower(nullif(trim(coalesce(rows.code, '')), '')), '-', ' '), '_', ' '))
      ) as name,
      nullif(trim(coalesce(rows.description, '')), '') as description,
      case
        when lower(coalesce(rows.status, '')) in ('draft', 'active', 'deprecated', 'archived')
          then lower(rows.status)
        else 'active'
      end as status,
      case
        when lower(coalesce(rows.billing_interval, '')) in ('monthly', 'quarterly', 'semiannual', 'annual', 'custom')
          then lower(rows.billing_interval)
        else 'monthly'
      end as billing_interval,
      coalesce(nullif(trim(coalesce(rows.currency_code, '')), ''), 'BRL') as currency_code,
      greatest(coalesce(rows.price_amount, 0::numeric), 0::numeric)::numeric(12,2) as price_amount,
      greatest(coalesce(rows.trial_days, 0), 0) as trial_days,
      coalesce(rows.included_limits, '{}'::jsonb) as included_limits,
      coalesce(rows.features, '{}'::jsonb) as features,
      coalesce(rows.metadata, '{}'::jsonb) as metadata,
      coalesce(rows.created_at, now()) as created_at,
      coalesce(rows.updated_at, coalesce(rows.created_at, now())) as updated_at,
      rows.deleted_at
    from rows
    where lower(nullif(trim(coalesce(rows.code, '')), '')) is not null
  )
  insert into platform.tenant_plans (
    id,
    code,
    name,
    description,
    status,
    billing_interval,
    currency_code,
    price_amount,
    trial_days,
    included_limits,
    features,
    metadata,
    created_at,
    updated_at,
    deleted_at
  )
  select
    normalized.id,
    normalized.code,
    normalized.name,
    normalized.description,
    normalized.status,
    normalized.billing_interval,
    normalized.currency_code,
    normalized.price_amount,
    normalized.trial_days,
    normalized.included_limits,
    normalized.features,
    normalized.metadata,
    normalized.created_at,
    normalized.updated_at,
    normalized.deleted_at
  from normalized
  on conflict (code)
    where deleted_at is null
  do update
  set
    name = excluded.name,
    description = excluded.description,
    status = excluded.status,
    billing_interval = excluded.billing_interval,
    currency_code = excluded.currency_code,
    price_amount = excluded.price_amount,
    trial_days = excluded.trial_days,
    included_limits = excluded.included_limits,
    features = excluded.features,
    metadata = coalesce(platform.tenant_plans.metadata, '{}'::jsonb) || excluded.metadata,
    deleted_at = excluded.deleted_at;

  get diagnostics v_plans_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_subscriptions, '[]'::jsonb)) as x(
      id uuid,
      plan_reference text,
      status text,
      started_at timestamptz,
      trial_ends_at timestamptz,
      current_period_started_at timestamptz,
      current_period_ends_at timestamptz,
      canceled_at timestamptz,
      ended_at timestamptz,
      auto_renew boolean,
      external_customer_id text,
      external_subscription_id text,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz,
      deleted_at timestamptz
    )
  ),
  resolved as (
    select
      coalesce(
        (
          select subscriptions.id
          from platform.tenant_subscriptions as subscriptions
          where subscriptions.tenant_id = p_runtime_tenant_id
            and subscriptions.deleted_at is null
            and subscriptions.status in ('trialing', 'active', 'past_due', 'suspended')
          order by
            case subscriptions.status
              when 'active' then 0
              when 'trialing' then 1
              when 'past_due' then 2
              when 'suspended' then 3
              else 4
            end,
            coalesce(subscriptions.current_period_ends_at, subscriptions.updated_at, subscriptions.created_at) desc,
            subscriptions.created_at desc
          limit 1
        ),
        rows.id,
        gen_random_uuid()
      ) as id,
      p_runtime_tenant_id as tenant_id,
      private.resolve_tenant_plan_id(rows.plan_reference) as plan_id,
      rows.plan_reference,
      private.normalize_platform_subscription_status(rows.status, null) as status,
      coalesce(rows.started_at, now()) as started_at,
      rows.trial_ends_at,
      coalesce(rows.current_period_started_at, (private.period_window('monthly', now()) ->> 'startedAt')::timestamptz, now()) as current_period_started_at,
      coalesce(rows.current_period_ends_at, (private.period_window('monthly', now()) ->> 'endsAt')::timestamptz, now() + interval '1 month') as current_period_ends_at,
      rows.canceled_at,
      rows.ended_at,
      coalesce(rows.auto_renew, true) as auto_renew,
      nullif(trim(coalesce(rows.external_customer_id, '')), '') as external_customer_id,
      nullif(trim(coalesce(rows.external_subscription_id, '')), '') as external_subscription_id,
      coalesce(rows.metadata, '{}'::jsonb) as metadata,
      coalesce(rows.created_at, now()) as created_at,
      coalesce(rows.updated_at, coalesce(rows.created_at, now())) as updated_at,
      rows.deleted_at
    from rows
  ),
  prepared as (
    select
      resolved.id,
      resolved.tenant_id,
      resolved.plan_id,
      plans.code as plan_code_snapshot,
      plans.name as plan_name_snapshot,
      resolved.status,
      resolved.started_at,
      resolved.trial_ends_at,
      resolved.current_period_started_at,
      resolved.current_period_ends_at,
      resolved.canceled_at,
      resolved.ended_at,
      resolved.auto_renew,
      resolved.external_customer_id,
      resolved.external_subscription_id,
      resolved.metadata,
      resolved.created_at,
      resolved.updated_at,
      resolved.deleted_at
    from resolved
    join platform.tenant_plans as plans
      on plans.id = resolved.plan_id
     and plans.deleted_at is null
  )
  insert into platform.tenant_subscriptions (
    id,
    tenant_id,
    plan_id,
    legacy_subscription_plan_code,
    plan_code_snapshot,
    plan_name_snapshot,
    status,
    started_at,
    trial_ends_at,
    current_period_started_at,
    current_period_ends_at,
    canceled_at,
    ended_at,
    auto_renew,
    external_customer_id,
    external_subscription_id,
    metadata,
    created_at,
    updated_at,
    deleted_at
  )
  select
    prepared.id,
    prepared.tenant_id,
    prepared.plan_id,
    prepared.plan_code_snapshot,
    prepared.plan_code_snapshot,
    prepared.plan_name_snapshot,
    prepared.status,
    prepared.started_at,
    prepared.trial_ends_at,
    prepared.current_period_started_at,
    prepared.current_period_ends_at,
    prepared.canceled_at,
    prepared.ended_at,
    prepared.auto_renew,
    prepared.external_customer_id,
    prepared.external_subscription_id,
    prepared.metadata,
    prepared.created_at,
    prepared.updated_at,
    prepared.deleted_at
  from prepared
  on conflict (id)
  do update
  set
    plan_id = excluded.plan_id,
    legacy_subscription_plan_code = excluded.legacy_subscription_plan_code,
    plan_code_snapshot = excluded.plan_code_snapshot,
    plan_name_snapshot = excluded.plan_name_snapshot,
    status = excluded.status,
    started_at = excluded.started_at,
    trial_ends_at = excluded.trial_ends_at,
    current_period_started_at = excluded.current_period_started_at,
    current_period_ends_at = excluded.current_period_ends_at,
    canceled_at = excluded.canceled_at,
    ended_at = excluded.ended_at,
    auto_renew = excluded.auto_renew,
    external_customer_id = excluded.external_customer_id,
    external_subscription_id = excluded.external_subscription_id,
    metadata = coalesce(platform.tenant_subscriptions.metadata, '{}'::jsonb) || excluded.metadata,
    deleted_at = excluded.deleted_at;

  get diagnostics v_subscriptions_count = row_count;

  select tenants.subscription_plan_code
  into v_runtime_subscription_plan_code
  from platform.tenants as tenants
  where tenants.id = p_runtime_tenant_id;

  if v_subscriptions_count = 0 then
    perform private.sync_runtime_tenant_billing(
      p_runtime_tenant_id,
      v_runtime_subscription_plan_code,
      (select status from platform.tenants where id = p_runtime_tenant_id),
      'runtime_platform_billing_backfill'
    );
  end if;

  v_usage_meter_result := private.ensure_default_tenant_usage_meters(
    p_runtime_tenant_id,
    'runtime_platform_billing_backfill'
  );

  return jsonb_build_object(
    'tenantId', p_runtime_tenant_id,
    'plans', v_plans_count,
    'subscriptions', v_subscriptions_count,
    'usageMeters', coalesce((v_usage_meter_result ->> 'usageMeters')::integer, 0)
  );
end;
$$;

create or replace function api.current_tenant_billing_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := private.current_tenant_id();
begin
  if v_tenant_id is null then
    raise exception 'current tenant context is required';
  end if;

  if not private.can_read_platform_billing_domain(v_tenant_id) and not private.is_platform_admin() then
    raise exception 'current profile cannot access tenant billing summary';
  end if;

  return (
    with current_subscription as (
      select
        subscriptions.id,
        subscriptions.tenant_id,
        subscriptions.status,
        subscriptions.started_at,
        subscriptions.trial_ends_at,
        subscriptions.current_period_started_at,
        subscriptions.current_period_ends_at,
        subscriptions.canceled_at,
        subscriptions.ended_at,
        subscriptions.auto_renew,
        subscriptions.external_customer_id,
        subscriptions.external_subscription_id,
        subscriptions.metadata,
        subscriptions.plan_code_snapshot,
        subscriptions.plan_name_snapshot,
        plans.id as plan_id,
        plans.code as plan_code,
        plans.name as plan_name,
        plans.description as plan_description,
        plans.billing_interval,
        plans.currency_code,
        plans.price_amount,
        plans.trial_days,
        plans.included_limits,
        plans.features
      from platform.tenant_subscriptions as subscriptions
      join platform.tenant_plans as plans
        on plans.id = subscriptions.plan_id
       and plans.deleted_at is null
      where subscriptions.tenant_id = v_tenant_id
        and subscriptions.deleted_at is null
      order by
        case subscriptions.status
          when 'active' then 0
          when 'trialing' then 1
          when 'past_due' then 2
          when 'suspended' then 3
          when 'canceled' then 4
          when 'expired' then 5
          else 6
        end,
        coalesce(subscriptions.current_period_ends_at, subscriptions.updated_at, subscriptions.created_at) desc,
        subscriptions.created_at desc
      limit 1
    ),
    meters as (
      select
        usage_meters.id,
        usage_meters.meter_code,
        usage_meters.meter_name,
        usage_meters.aggregation_mode,
        usage_meters.reset_period,
        usage_meters.status,
        usage_meters.current_value,
        usage_meters.included_limit,
        usage_meters.soft_limit,
        usage_meters.hard_limit,
        usage_meters.period_started_at,
        usage_meters.period_ends_at,
        usage_meters.last_recorded_at,
        usage_meters.metadata
      from platform.usage_meters as usage_meters
      where usage_meters.tenant_id = v_tenant_id
        and usage_meters.deleted_at is null
      order by usage_meters.meter_code asc
    ),
    aggregated as (
      select
        count(*) filter (
          where meters.soft_limit is not null
            and meters.current_value >= meters.soft_limit
        ) as near_soft_limit_count,
        count(*) filter (
          where meters.hard_limit is not null
            and meters.current_value >= meters.hard_limit
        ) as hard_limit_count
      from meters
    )
    select jsonb_build_object(
      'tenantId', tenants.id,
      'tenantStatus', tenants.status,
      'subscriptionPlanCodeShadow', tenants.subscription_plan_code,
      'plan', case
        when current_subscription.plan_id is null then null
        else jsonb_build_object(
          'id', current_subscription.plan_id,
          'code', current_subscription.plan_code,
          'name', current_subscription.plan_name,
          'description', current_subscription.plan_description,
          'billingInterval', current_subscription.billing_interval,
          'currencyCode', current_subscription.currency_code,
          'priceAmount', current_subscription.price_amount,
          'trialDays', current_subscription.trial_days,
          'includedLimits', current_subscription.included_limits,
          'features', current_subscription.features
        )
      end,
      'subscription', case
        when current_subscription.id is null then null
        else jsonb_build_object(
          'id', current_subscription.id,
          'status', current_subscription.status,
          'startedAt', current_subscription.started_at,
          'trialEndsAt', current_subscription.trial_ends_at,
          'currentPeriodStartedAt', current_subscription.current_period_started_at,
          'currentPeriodEndsAt', current_subscription.current_period_ends_at,
          'canceledAt', current_subscription.canceled_at,
          'endedAt', current_subscription.ended_at,
          'autoRenew', current_subscription.auto_renew,
          'externalCustomerId', current_subscription.external_customer_id,
          'externalSubscriptionId', current_subscription.external_subscription_id,
          'planCodeSnapshot', current_subscription.plan_code_snapshot,
          'planNameSnapshot', current_subscription.plan_name_snapshot,
          'metadata', current_subscription.metadata
        )
      end,
      'meters', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', meters.id,
            'code', meters.meter_code,
            'name', meters.meter_name,
            'aggregationMode', meters.aggregation_mode,
            'resetPeriod', meters.reset_period,
            'status', meters.status,
            'currentValue', meters.current_value,
            'includedLimit', meters.included_limit,
            'softLimit', meters.soft_limit,
            'hardLimit', meters.hard_limit,
            'periodStartedAt', meters.period_started_at,
            'periodEndsAt', meters.period_ends_at,
            'lastRecordedAt', meters.last_recorded_at,
            'metadata', meters.metadata
          )
          order by meters.meter_code asc
        )
        from meters
      ), '[]'::jsonb),
      'usage', jsonb_build_object(
        'nearSoftLimitCount', coalesce((select aggregated.near_soft_limit_count from aggregated), 0),
        'hardLimitCount', coalesce((select aggregated.hard_limit_count from aggregated), 0)
      )
    )
    from platform.tenants as tenants
    left join current_subscription on true
    where tenants.id = v_tenant_id
  );
end;
$$;

create or replace function public.backfill_runtime_platform_billing(
  p_runtime_tenant_id uuid,
  p_plans jsonb default '[]'::jsonb,
  p_subscriptions jsonb default '[]'::jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.backfill_runtime_platform_billing(
    p_runtime_tenant_id,
    p_plans,
    p_subscriptions
  )
$$;

create or replace function public.current_tenant_billing_summary()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select api.current_tenant_billing_summary()
$$;

revoke all on function api.backfill_runtime_platform_billing(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function api.current_tenant_billing_summary() from public, anon;
revoke all on function public.backfill_runtime_platform_billing(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.current_tenant_billing_summary() from public, anon;

grant execute on function api.backfill_runtime_platform_billing(uuid, jsonb, jsonb) to service_role;
grant execute on function api.current_tenant_billing_summary() to authenticated, service_role;
grant execute on function public.backfill_runtime_platform_billing(uuid, jsonb, jsonb) to service_role;
grant execute on function public.current_tenant_billing_summary() to authenticated, service_role;

do $$
declare
  v_tenant record;
begin
  for v_tenant in
    select tenants.id, tenants.subscription_plan_code, tenants.status
    from platform.tenants as tenants
    where tenants.deleted_at is null
  loop
    perform private.sync_runtime_tenant_billing(
      v_tenant.id,
      v_tenant.subscription_plan_code,
      v_tenant.status,
      'migration_0045'
    );
  end loop;
end;
$$;
