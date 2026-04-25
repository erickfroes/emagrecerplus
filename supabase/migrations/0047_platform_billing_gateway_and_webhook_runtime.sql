create or replace function private.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_uuid uuid;
begin
  if nullif(trim(coalesce(p_value, '')), '') is null then
    return null;
  end if;

  begin
    v_uuid := trim(p_value)::uuid;
  exception
    when others then
      return null;
  end;

  return v_uuid;
end;
$$;

revoke all on function private.try_uuid(text) from public, anon, authenticated;
grant execute on function private.try_uuid(text) to authenticated, service_role;

create table if not exists platform.billing_gateway_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  subscription_id uuid references platform.tenant_subscriptions (id) on delete set null,
  plan_id uuid references platform.tenant_plans (id) on delete set null,
  provider text not null,
  flow text not null check (flow in ('checkout', 'portal')),
  status text not null default 'created' check (
    status in ('created', 'ready', 'completed', 'expired', 'failed')
  ),
  external_session_id text,
  external_customer_id text,
  external_subscription_id text,
  checkout_url text,
  success_url text,
  cancel_url text,
  return_url text,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  completed_at timestamptz,
  consumed_at timestamptz,
  created_by_profile_id uuid references identity.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists platform.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references platform.tenants (id) on delete set null,
  subscription_id uuid references platform.tenant_subscriptions (id) on delete set null,
  gateway_session_id uuid references platform.billing_gateway_sessions (id) on delete set null,
  provider text not null,
  event_id text not null,
  event_type text not null,
  processing_status text not null default 'received' check (
    processing_status in ('received', 'processed', 'failed', 'ignored')
  ),
  external_customer_id text,
  external_subscription_id text,
  external_session_id text,
  idempotency_key text,
  processing_attempts integer not null default 0,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  result_snapshot jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_platform_billing_gateway_sessions_provider_external_session
  on platform.billing_gateway_sessions (provider, external_session_id)
  where external_session_id is not null
    and deleted_at is null;

create index if not exists idx_platform_billing_gateway_sessions_tenant_created_at
  on platform.billing_gateway_sessions (tenant_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_platform_billing_gateway_sessions_tenant_status
  on platform.billing_gateway_sessions (tenant_id, status, created_at desc)
  where deleted_at is null;

create index if not exists idx_platform_billing_gateway_sessions_subscription
  on platform.billing_gateway_sessions (subscription_id, created_at desc)
  where subscription_id is not null
    and deleted_at is null;

create unique index if not exists idx_platform_billing_webhook_events_provider_event
  on platform.billing_webhook_events (provider, event_id);

create index if not exists idx_platform_billing_webhook_events_tenant_received
  on platform.billing_webhook_events (tenant_id, received_at desc);

create index if not exists idx_platform_billing_webhook_events_subscription_received
  on platform.billing_webhook_events (subscription_id, received_at desc)
  where subscription_id is not null;

create index if not exists idx_platform_billing_webhook_events_status_received
  on platform.billing_webhook_events (processing_status, received_at desc);

drop trigger if exists set_platform_billing_gateway_sessions_updated_at on platform.billing_gateway_sessions;
create trigger set_platform_billing_gateway_sessions_updated_at
before update on platform.billing_gateway_sessions
for each row execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_platform_billing_webhook_events_updated_at on platform.billing_webhook_events;
create trigger set_platform_billing_webhook_events_updated_at
before update on platform.billing_webhook_events
for each row execute function private.set_current_timestamp_updated_at();

grant all on table platform.billing_gateway_sessions to service_role;
grant all on table platform.billing_webhook_events to service_role;

alter table platform.billing_gateway_sessions enable row level security;
alter table platform.billing_webhook_events enable row level security;

drop policy if exists platform_billing_gateway_sessions_select_current_scope on platform.billing_gateway_sessions;
create policy platform_billing_gateway_sessions_select_current_scope
on platform.billing_gateway_sessions
for select
using (
  deleted_at is null
  and private.can_read_platform_billing_domain(tenant_id)
);

drop policy if exists platform_billing_gateway_sessions_manage_current_scope on platform.billing_gateway_sessions;
create policy platform_billing_gateway_sessions_manage_current_scope
on platform.billing_gateway_sessions
for all
using (
  deleted_at is null
  and private.can_manage_platform_billing_domain(tenant_id)
)
with check (
  private.can_manage_platform_billing_domain(tenant_id)
);

drop policy if exists platform_billing_webhook_events_select_current_scope on platform.billing_webhook_events;
create policy platform_billing_webhook_events_select_current_scope
on platform.billing_webhook_events
for select
using (
  tenant_id is not null
  and private.can_read_platform_billing_domain(tenant_id)
);

drop policy if exists platform_billing_webhook_events_manage_current_scope on platform.billing_webhook_events;
create policy platform_billing_webhook_events_manage_current_scope
on platform.billing_webhook_events
for all
using (
  tenant_id is not null
  and private.can_manage_platform_billing_domain(tenant_id)
)
with check (
  tenant_id is not null
  and private.can_manage_platform_billing_domain(tenant_id)
);

create or replace function private.resolve_platform_billing_tenant(
  p_runtime_tenant_id uuid default null,
  p_external_customer_id text default null,
  p_external_subscription_id text default null,
  p_external_session_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_runtime_tenant_id uuid := p_runtime_tenant_id;
  v_metadata_tenant_id uuid;
begin
  if v_runtime_tenant_id is not null
    and exists (
      select 1
      from platform.tenants as tenants
      where tenants.id = v_runtime_tenant_id
        and tenants.deleted_at is null
    )
  then
    return v_runtime_tenant_id;
  end if;

  v_metadata_tenant_id := coalesce(
    private.try_uuid(p_metadata ->> 'tenantId'),
    private.try_uuid(p_metadata ->> 'tenant_id'),
    private.try_uuid(p_metadata -> 'tenant' ->> 'id')
  );

  if v_metadata_tenant_id is not null
    and exists (
      select 1
      from platform.tenants as tenants
      where tenants.id = v_metadata_tenant_id
        and tenants.deleted_at is null
    )
  then
    return v_metadata_tenant_id;
  end if;

  if nullif(trim(coalesce(p_external_subscription_id, '')), '') is not null then
    select subscriptions.tenant_id
    into v_runtime_tenant_id
    from platform.tenant_subscriptions as subscriptions
    where subscriptions.deleted_at is null
      and subscriptions.external_subscription_id = trim(p_external_subscription_id)
    order by subscriptions.updated_at desc, subscriptions.created_at desc
    limit 1;

    if v_runtime_tenant_id is not null then
      return v_runtime_tenant_id;
    end if;
  end if;

  if nullif(trim(coalesce(p_external_customer_id, '')), '') is not null then
    select subscriptions.tenant_id
    into v_runtime_tenant_id
    from platform.tenant_subscriptions as subscriptions
    where subscriptions.deleted_at is null
      and subscriptions.external_customer_id = trim(p_external_customer_id)
    order by subscriptions.updated_at desc, subscriptions.created_at desc
    limit 1;

    if v_runtime_tenant_id is not null then
      return v_runtime_tenant_id;
    end if;
  end if;

  select sessions.tenant_id
  into v_runtime_tenant_id
  from platform.billing_gateway_sessions as sessions
  where sessions.deleted_at is null
    and (
      (
        nullif(trim(coalesce(p_external_session_id, '')), '') is not null
        and sessions.external_session_id = trim(p_external_session_id)
      )
      or (
        nullif(trim(coalesce(p_external_subscription_id, '')), '') is not null
        and sessions.external_subscription_id = trim(p_external_subscription_id)
      )
      or (
        nullif(trim(coalesce(p_external_customer_id, '')), '') is not null
        and sessions.external_customer_id = trim(p_external_customer_id)
      )
    )
  order by sessions.updated_at desc, sessions.created_at desc
  limit 1;

  return v_runtime_tenant_id;
end;
$$;

revoke all on function private.resolve_platform_billing_tenant(uuid, text, text, text, jsonb) from public, anon;
grant execute on function private.resolve_platform_billing_tenant(uuid, text, text, text, jsonb) to authenticated, service_role;

create or replace function api.register_tenant_billing_gateway_session(
  p_runtime_tenant_id uuid,
  p_provider text,
  p_flow text,
  p_subscription_id uuid default null,
  p_plan_code text default null,
  p_external_session_id text default null,
  p_external_customer_id text default null,
  p_external_subscription_id text default null,
  p_checkout_url text default null,
  p_success_url text default null,
  p_cancel_url text default null,
  p_return_url text default null,
  p_expires_at timestamptz default null,
  p_status text default null,
  p_idempotency_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runtime_tenant_id uuid := p_runtime_tenant_id;
  v_provider text := lower(nullif(trim(coalesce(p_provider, '')), ''));
  v_flow text := lower(nullif(trim(coalesce(p_flow, '')), ''));
  v_plan_code text := lower(nullif(trim(coalesce(p_plan_code, '')), ''));
  v_status text := lower(nullif(trim(coalesce(p_status, '')), ''));
  v_plan_id uuid;
  v_subscription_id uuid := p_subscription_id;
  v_actor_profile_id uuid := private.current_profile_id();
  v_session platform.billing_gateway_sessions%rowtype;
begin
  if v_runtime_tenant_id is null then
    raise exception 'p_runtime_tenant_id is required';
  end if;

  if not exists (
    select 1
    from platform.tenants as tenants
    where tenants.id = v_runtime_tenant_id
      and tenants.deleted_at is null
  ) then
    raise exception 'tenant not found';
  end if;

  if v_provider is null then
    raise exception 'p_provider is required';
  end if;

  if v_flow not in ('checkout', 'portal') then
    raise exception 'unsupported gateway flow';
  end if;

  if v_status not in ('created', 'ready', 'completed', 'expired', 'failed') then
    v_status := case
      when nullif(trim(coalesce(p_checkout_url, '')), '') is not null then 'ready'
      else 'created'
    end;
  end if;

  if v_plan_code is not null then
    select plans.id
    into v_plan_id
    from platform.tenant_plans as plans
    where plans.code = v_plan_code
      and plans.deleted_at is null
    limit 1;
  end if;

  if v_subscription_id is null
    and nullif(trim(coalesce(p_external_subscription_id, '')), '') is not null then
    select subscriptions.id
    into v_subscription_id
    from platform.tenant_subscriptions as subscriptions
    where subscriptions.tenant_id = v_runtime_tenant_id
      and subscriptions.deleted_at is null
      and subscriptions.external_subscription_id = trim(p_external_subscription_id)
    order by subscriptions.updated_at desc, subscriptions.created_at desc
    limit 1;
  end if;

  if v_subscription_id is null then
    select subscriptions.id
    into v_subscription_id
    from platform.tenant_subscriptions as subscriptions
    where subscriptions.tenant_id = v_runtime_tenant_id
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
  end if;

  if nullif(trim(coalesce(p_idempotency_key, '')), '') is not null then
    select *
    into v_session
    from platform.billing_gateway_sessions as sessions
    where sessions.tenant_id = v_runtime_tenant_id
      and sessions.provider = v_provider
      and sessions.flow = v_flow
      and sessions.idempotency_key = trim(p_idempotency_key)
      and sessions.deleted_at is null
    order by sessions.created_at desc
    limit 1;
  end if;

  if v_session.id is null
    and nullif(trim(coalesce(p_external_session_id, '')), '') is not null then
    select *
    into v_session
    from platform.billing_gateway_sessions as sessions
    where sessions.provider = v_provider
      and sessions.external_session_id = trim(p_external_session_id)
      and sessions.deleted_at is null
    limit 1;
  end if;

  if v_session.id is null then
    insert into platform.billing_gateway_sessions (
      tenant_id,
      subscription_id,
      plan_id,
      provider,
      flow,
      status,
      external_session_id,
      external_customer_id,
      external_subscription_id,
      checkout_url,
      success_url,
      cancel_url,
      return_url,
      idempotency_key,
      metadata,
      expires_at,
      created_by_profile_id
    )
    values (
      v_runtime_tenant_id,
      v_subscription_id,
      v_plan_id,
      v_provider,
      v_flow,
      v_status,
      nullif(trim(coalesce(p_external_session_id, '')), ''),
      nullif(trim(coalesce(p_external_customer_id, '')), ''),
      nullif(trim(coalesce(p_external_subscription_id, '')), ''),
      nullif(trim(coalesce(p_checkout_url, '')), ''),
      nullif(trim(coalesce(p_success_url, '')), ''),
      nullif(trim(coalesce(p_cancel_url, '')), ''),
      nullif(trim(coalesce(p_return_url, '')), ''),
      nullif(trim(coalesce(p_idempotency_key, '')), ''),
      coalesce(p_metadata, '{}'::jsonb),
      p_expires_at,
      v_actor_profile_id
    )
    returning *
    into v_session;
  else
    update platform.billing_gateway_sessions
    set
      subscription_id = coalesce(v_subscription_id, subscription_id),
      plan_id = coalesce(v_plan_id, plan_id),
      status = coalesce(v_status, status),
      external_session_id = coalesce(nullif(trim(coalesce(p_external_session_id, '')), ''), external_session_id),
      external_customer_id = coalesce(nullif(trim(coalesce(p_external_customer_id, '')), ''), external_customer_id),
      external_subscription_id = coalesce(nullif(trim(coalesce(p_external_subscription_id, '')), ''), external_subscription_id),
      checkout_url = coalesce(nullif(trim(coalesce(p_checkout_url, '')), ''), checkout_url),
      success_url = coalesce(nullif(trim(coalesce(p_success_url, '')), ''), success_url),
      cancel_url = coalesce(nullif(trim(coalesce(p_cancel_url, '')), ''), cancel_url),
      return_url = coalesce(nullif(trim(coalesce(p_return_url, '')), ''), return_url),
      expires_at = coalesce(p_expires_at, expires_at),
      metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
      updated_at = now()
    where id = v_session.id
    returning *
    into v_session;
  end if;

  perform private.record_audit_event(
    v_runtime_tenant_id,
    null,
    null,
    case when v_actor_profile_id is null then 'system' else 'profile' end,
    'tenant_billing_gateway_session_registered',
    'upsert',
    'platform',
    'billing_gateway_sessions',
    v_session.id,
    jsonb_build_object(
      'provider', v_provider,
      'flow', v_flow,
      'status', v_session.status,
      'externalSessionId', v_session.external_session_id,
      'externalCustomerId', v_session.external_customer_id,
      'externalSubscriptionId', v_session.external_subscription_id,
      'planCode', v_plan_code
    )
  );

  insert into audit.outbox_events (
    tenant_id,
    aggregate_type,
    aggregate_id,
    event_type,
    payload
  )
  values (
    v_runtime_tenant_id,
    'platform.billing_gateway_session',
    v_session.id,
    'platform.billing_gateway_session.registered',
    jsonb_build_object(
      'provider', v_provider,
      'flow', v_flow,
      'status', v_session.status,
      'externalSessionId', v_session.external_session_id,
      'checkoutUrl', v_session.checkout_url
    )
  );

  return jsonb_build_object(
    'sessionId', v_session.id,
    'tenantId', v_runtime_tenant_id,
    'subscriptionId', v_session.subscription_id,
    'planId', v_session.plan_id,
    'provider', v_session.provider,
    'flow', v_session.flow,
    'status', v_session.status,
    'externalSessionId', v_session.external_session_id,
    'externalCustomerId', v_session.external_customer_id,
    'externalSubscriptionId', v_session.external_subscription_id,
    'checkoutUrl', v_session.checkout_url,
    'expiresAt', v_session.expires_at
  );
end;
$$;

revoke all on function api.register_tenant_billing_gateway_session(uuid, text, text, uuid, text, text, text, text, text, text, text, text, timestamptz, text, text, jsonb) from public, anon, authenticated;
grant execute on function api.register_tenant_billing_gateway_session(uuid, text, text, uuid, text, text, text, text, text, text, text, text, timestamptz, text, text, jsonb) to service_role;

create or replace function api.consume_tenant_billing_webhook(
  p_provider text,
  p_event_id text,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb,
  p_idempotency_key text default null,
  p_runtime_tenant_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider text := lower(nullif(trim(coalesce(p_provider, '')), ''));
  v_event_id text := nullif(trim(coalesce(p_event_id, '')), '');
  v_event_type text := nullif(trim(coalesce(p_event_type, '')), '');
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_idempotency_scope text;
  v_request_hash text := md5(coalesce(p_payload, '{}'::jsonb)::text);
  v_existing_snapshot jsonb;
  v_runtime_tenant_id uuid;
  v_plan_code text;
  v_plan_name text;
  v_billing_interval text;
  v_currency_code text := 'BRL';
  v_price_amount numeric(12,2);
  v_subscription_status text;
  v_external_customer_id text;
  v_external_subscription_id text;
  v_external_session_id text;
  v_current_period_started_at timestamptz;
  v_current_period_ends_at timestamptz;
  v_trial_ends_at timestamptz;
  v_canceled_at timestamptz;
  v_ended_at timestamptz;
  v_auto_renew boolean := true;
  v_plan_id uuid;
  v_subscription_id uuid;
  v_gateway_session_id uuid;
  v_webhook_event_id uuid;
  v_existing_event_status text;
  v_error_message text;
  v_result jsonb;
begin
  if v_provider is null then
    raise exception 'p_provider is required';
  end if;

  if v_event_id is null then
    raise exception 'p_event_id is required';
  end if;

  if v_event_type is null then
    raise exception 'p_event_type is required';
  end if;

  v_idempotency_scope := 'platform.billing_webhook:' || v_provider;

  insert into audit.idempotency_keys (
    tenant_id,
    scope,
    key,
    request_hash
  )
  values (
    p_runtime_tenant_id,
    v_idempotency_scope,
    v_event_id,
    v_request_hash
  )
  on conflict (scope, key) do nothing;

  if not found then
    select idempotency.response_snapshot
    into v_existing_snapshot
    from audit.idempotency_keys as idempotency
    where idempotency.scope = v_idempotency_scope
      and idempotency.key = v_event_id
    limit 1;

    if v_existing_snapshot is not null then
      return v_existing_snapshot || jsonb_build_object('duplicate', true);
    end if;
  end if;

  v_external_customer_id := nullif(trim(coalesce(
    v_payload ->> 'externalCustomerId',
    v_payload -> 'customer' ->> 'id',
    ''
  )), '');
  v_external_subscription_id := nullif(trim(coalesce(
    v_payload ->> 'externalSubscriptionId',
    v_payload -> 'subscription' ->> 'id',
    ''
  )), '');
  v_external_session_id := nullif(trim(coalesce(
    v_payload ->> 'externalSessionId',
    v_payload ->> 'checkoutSessionId',
    v_payload -> 'session' ->> 'id',
    ''
  )), '');
  v_plan_code := lower(nullif(trim(coalesce(
    v_payload ->> 'planCode',
    v_payload -> 'plan' ->> 'code',
    v_payload -> 'metadata' ->> 'planCode',
    ''
  )), ''));
  v_plan_name := nullif(trim(coalesce(
    v_payload ->> 'planName',
    v_payload -> 'plan' ->> 'name',
    ''
  )), '');
  v_billing_interval := lower(nullif(trim(coalesce(
    v_payload ->> 'billingInterval',
    v_payload -> 'plan' ->> 'billingInterval',
    ''
  )), ''));

  if v_billing_interval not in ('monthly', 'quarterly', 'semiannual', 'annual', 'custom') then
    v_billing_interval := null;
  end if;

  v_currency_code := upper(coalesce(
    nullif(trim(coalesce(
      v_payload ->> 'currencyCode',
      v_payload -> 'plan' ->> 'currencyCode',
      ''
    )), ''),
    'BRL'
  ));
  v_price_amount := greatest(coalesce(private.try_numeric(coalesce(
    v_payload ->> 'priceAmount',
    v_payload -> 'plan' ->> 'priceAmount',
    '0'
  )), 0::numeric), 0::numeric)::numeric(12,2);
  v_subscription_status := private.normalize_platform_subscription_status(
    coalesce(
      v_payload ->> 'status',
      v_payload -> 'subscription' ->> 'status'
    ),
    null
  );
  v_current_period_started_at := case
    when nullif(trim(coalesce(v_payload ->> 'currentPeriodStartedAt', '')), '') is null then null
    else (v_payload ->> 'currentPeriodStartedAt')::timestamptz
  end;
  v_current_period_ends_at := case
    when nullif(trim(coalesce(v_payload ->> 'currentPeriodEndsAt', '')), '') is null then null
    else (v_payload ->> 'currentPeriodEndsAt')::timestamptz
  end;
  v_trial_ends_at := case
    when nullif(trim(coalesce(v_payload ->> 'trialEndsAt', '')), '') is null then null
    else (v_payload ->> 'trialEndsAt')::timestamptz
  end;
  v_canceled_at := case
    when nullif(trim(coalesce(v_payload ->> 'canceledAt', '')), '') is null then null
    else (v_payload ->> 'canceledAt')::timestamptz
  end;
  v_ended_at := case
    when nullif(trim(coalesce(v_payload ->> 'endedAt', '')), '') is null then null
    else (v_payload ->> 'endedAt')::timestamptz
  end;

  if lower(coalesce(v_payload ->> 'autoRenew', '')) in ('true', 'false') then
    v_auto_renew := (v_payload ->> 'autoRenew')::boolean;
  end if;

  v_runtime_tenant_id := private.resolve_platform_billing_tenant(
    p_runtime_tenant_id,
    v_external_customer_id,
    v_external_subscription_id,
    v_external_session_id,
    coalesce(v_payload -> 'metadata', '{}'::jsonb)
      || jsonb_build_object(
        'tenantId',
        coalesce(v_payload ->> 'tenantId', v_payload ->> 'tenant_id')
      )
  );

  insert into platform.billing_webhook_events (
    tenant_id,
    provider,
    event_id,
    event_type,
    processing_status,
    external_customer_id,
    external_subscription_id,
    external_session_id,
    idempotency_key,
    processing_attempts,
    payload
  )
  values (
    v_runtime_tenant_id,
    v_provider,
    v_event_id,
    v_event_type,
    'received',
    v_external_customer_id,
    v_external_subscription_id,
    v_external_session_id,
    coalesce(nullif(trim(coalesce(p_idempotency_key, '')), ''), v_event_id),
    1,
    v_payload
  )
  on conflict (provider, event_id) do update
  set
    tenant_id = coalesce(excluded.tenant_id, platform.billing_webhook_events.tenant_id),
    event_type = excluded.event_type,
    external_customer_id = coalesce(excluded.external_customer_id, platform.billing_webhook_events.external_customer_id),
    external_subscription_id = coalesce(excluded.external_subscription_id, platform.billing_webhook_events.external_subscription_id),
    external_session_id = coalesce(excluded.external_session_id, platform.billing_webhook_events.external_session_id),
    idempotency_key = coalesce(excluded.idempotency_key, platform.billing_webhook_events.idempotency_key),
    processing_attempts = platform.billing_webhook_events.processing_attempts + 1,
    payload = excluded.payload,
    updated_at = now()
  returning id, processing_status, result_snapshot, gateway_session_id
  into v_webhook_event_id, v_existing_event_status, v_existing_snapshot, v_gateway_session_id;

  if v_existing_snapshot is not null
    and v_existing_event_status in ('processed', 'ignored') then
    update audit.idempotency_keys
    set
      tenant_id = coalesce(tenant_id, v_runtime_tenant_id),
      response_snapshot = v_existing_snapshot,
      consumed_at = coalesce(consumed_at, now())
    where scope = v_idempotency_scope
      and key = v_event_id;

    return v_existing_snapshot || jsonb_build_object('duplicate', true);
  end if;

  begin
    if v_runtime_tenant_id is null then
      raise exception 'tenant resolution failed for billing webhook';
    end if;

    if v_plan_code is not null then
      insert into platform.tenant_plans (
        code,
        name,
        status,
        billing_interval,
        currency_code,
        price_amount,
        metadata
      )
      values (
        v_plan_code,
        coalesce(v_plan_name, initcap(replace(replace(v_plan_code, '-', ' '), '_', ' '))),
        'active',
        coalesce(v_billing_interval, 'monthly'),
        v_currency_code,
        coalesce(v_price_amount, 0::numeric),
        jsonb_build_object(
          'source', 'billing_webhook',
          'provider', v_provider
        )
      )
      on conflict (code)
        where deleted_at is null
      do update
      set
        name = coalesce(excluded.name, platform.tenant_plans.name),
        billing_interval = coalesce(excluded.billing_interval, platform.tenant_plans.billing_interval),
        currency_code = coalesce(excluded.currency_code, platform.tenant_plans.currency_code),
        price_amount = greatest(coalesce(excluded.price_amount, platform.tenant_plans.price_amount), 0::numeric),
        metadata = coalesce(platform.tenant_plans.metadata, '{}'::jsonb) || jsonb_build_object(
          'lastWebhookProvider', v_provider,
          'lastWebhookEventType', v_event_type
        ),
        deleted_at = null
      returning id
      into v_plan_id;

      perform private.sync_runtime_tenant_billing(
        v_runtime_tenant_id,
        v_plan_code,
        v_subscription_status,
        'billing_webhook:' || v_provider
      );
    end if;

    if v_plan_id is null and v_plan_code is not null then
      select plans.id
      into v_plan_id
      from platform.tenant_plans as plans
      where plans.code = v_plan_code
        and plans.deleted_at is null
      limit 1;
    end if;

    select subscriptions.id
    into v_subscription_id
    from platform.tenant_subscriptions as subscriptions
    where subscriptions.tenant_id = v_runtime_tenant_id
      and subscriptions.deleted_at is null
      and (
        (
          v_external_subscription_id is not null
          and subscriptions.external_subscription_id = v_external_subscription_id
        )
        or (
          v_external_customer_id is not null
          and subscriptions.external_customer_id = v_external_customer_id
        )
        or (
          v_plan_id is not null
          and subscriptions.plan_id = v_plan_id
        )
        or (
          v_plan_code is not null
          and subscriptions.plan_code_snapshot = v_plan_code
        )
      )
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
    limit 1;

    if v_subscription_id is null then
      select subscriptions.id
      into v_subscription_id
      from platform.tenant_subscriptions as subscriptions
      where subscriptions.tenant_id = v_runtime_tenant_id
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
      limit 1;
    end if;

    if v_subscription_id is null then
      raise exception 'subscription resolution failed for billing webhook';
    end if;

    update platform.tenant_subscriptions
    set
      plan_id = coalesce(v_plan_id, plan_id),
      plan_code_snapshot = coalesce(v_plan_code, plan_code_snapshot),
      plan_name_snapshot = coalesce(v_plan_name, plan_name_snapshot),
      status = v_subscription_status,
      trial_ends_at = coalesce(v_trial_ends_at, trial_ends_at),
      current_period_started_at = coalesce(v_current_period_started_at, current_period_started_at, now()),
      current_period_ends_at = coalesce(v_current_period_ends_at, current_period_ends_at, now() + interval '1 month'),
      canceled_at = coalesce(v_canceled_at, canceled_at),
      ended_at = coalesce(v_ended_at, ended_at),
      auto_renew = coalesce(v_auto_renew, auto_renew),
      external_customer_id = coalesce(v_external_customer_id, external_customer_id),
      external_subscription_id = coalesce(v_external_subscription_id, external_subscription_id),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'gateway', jsonb_build_object(
          'provider', v_provider,
          'lastEventId', v_event_id,
          'lastEventType', v_event_type,
          'lastReceivedAt', now(),
          'externalSessionId', v_external_session_id
        )
      ),
      updated_at = now()
    where id = v_subscription_id;

    if v_plan_code is not null then
      update platform.tenants
      set
        subscription_plan_code = v_plan_code,
        updated_at = now()
      where id = v_runtime_tenant_id;
    end if;

    perform private.ensure_default_tenant_usage_meters(
      v_runtime_tenant_id,
      'billing_webhook:' || v_provider
    );

    if v_external_session_id is not null then
      update platform.billing_gateway_sessions
      set
        tenant_id = coalesce(v_runtime_tenant_id, tenant_id),
        subscription_id = coalesce(v_subscription_id, subscription_id),
        plan_id = coalesce(v_plan_id, plan_id),
        external_customer_id = coalesce(v_external_customer_id, external_customer_id),
        external_subscription_id = coalesce(v_external_subscription_id, external_subscription_id),
        status = case
          when v_event_type in (
            'checkout.session.completed',
            'customer.subscription.created',
            'customer.subscription.updated',
            'invoice.paid'
          ) then 'completed'
          when v_event_type in ('checkout.session.expired') then 'expired'
          else status
        end,
        completed_at = case
          when v_event_type in (
            'checkout.session.completed',
            'customer.subscription.created',
            'customer.subscription.updated',
            'invoice.paid'
          ) then coalesce(completed_at, now())
          else completed_at
        end,
        consumed_at = case
          when v_event_type in (
            'checkout.session.completed',
            'customer.subscription.created',
            'customer.subscription.updated',
            'invoice.paid'
          ) then coalesce(consumed_at, now())
          else consumed_at
        end,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'lastWebhookEventId', v_event_id,
          'lastWebhookEventType', v_event_type
        ),
        updated_at = now()
      where provider = v_provider
        and external_session_id = v_external_session_id
        and deleted_at is null
      returning id
      into v_gateway_session_id;
    end if;

    perform private.record_audit_event(
      v_runtime_tenant_id,
      null,
      null,
      'system',
      'tenant_billing_webhook_processed',
      'upsert',
      'platform',
      'tenant_subscriptions',
      v_subscription_id,
      jsonb_build_object(
        'provider', v_provider,
        'eventId', v_event_id,
        'eventType', v_event_type,
        'subscriptionStatus', v_subscription_status,
        'planCode', v_plan_code,
        'externalCustomerId', v_external_customer_id,
        'externalSubscriptionId', v_external_subscription_id,
        'externalSessionId', v_external_session_id
      )
    );

    insert into audit.outbox_events (
      tenant_id,
      aggregate_type,
      aggregate_id,
      event_type,
      payload
    )
    values (
      v_runtime_tenant_id,
      'platform.tenant_subscription',
      v_subscription_id,
      'platform.tenant_subscription.webhook_processed',
      jsonb_build_object(
        'provider', v_provider,
        'eventId', v_event_id,
        'eventType', v_event_type,
        'subscriptionStatus', v_subscription_status,
        'planCode', v_plan_code
      )
    );

    v_result := jsonb_build_object(
      'ok', true,
      'duplicate', false,
      'processingStatus', 'processed',
      'webhookEventId', v_webhook_event_id,
      'tenantId', v_runtime_tenant_id,
      'subscriptionId', v_subscription_id,
      'subscriptionStatus', v_subscription_status,
      'planCode', v_plan_code,
      'gatewaySessionId', v_gateway_session_id
    );

    update platform.billing_webhook_events
    set
      tenant_id = v_runtime_tenant_id,
      subscription_id = v_subscription_id,
      gateway_session_id = coalesce(v_gateway_session_id, gateway_session_id),
      processing_status = 'processed',
      processed_at = now(),
      result_snapshot = v_result,
      last_error = null,
      updated_at = now()
    where id = v_webhook_event_id;

    update audit.idempotency_keys
    set
      tenant_id = coalesce(tenant_id, v_runtime_tenant_id),
      response_snapshot = v_result,
      consumed_at = now()
    where scope = v_idempotency_scope
      and key = v_event_id;

    return v_result;
  exception
    when others then
      v_error_message := sqlerrm;
      v_result := jsonb_build_object(
        'ok', false,
        'duplicate', false,
        'processingStatus', 'failed',
        'error', v_error_message,
        'webhookEventId', v_webhook_event_id,
        'tenantId', v_runtime_tenant_id,
        'subscriptionId', v_subscription_id,
        'planCode', v_plan_code,
        'gatewaySessionId', v_gateway_session_id
      );

      insert into audit.integration_failures (
        tenant_id,
        integration_name,
        provider,
        failure_type,
        payload,
        error_message,
        retryable,
        status
      )
      values (
        v_runtime_tenant_id,
        'platform_billing_webhook',
        v_provider,
        'processing_failed',
        jsonb_build_object(
          'eventId', v_event_id,
          'eventType', v_event_type,
          'payload', v_payload
        ),
        v_error_message,
        true,
        'open'
      );

      if v_webhook_event_id is not null then
        update platform.billing_webhook_events
        set
          tenant_id = coalesce(v_runtime_tenant_id, tenant_id),
          subscription_id = coalesce(v_subscription_id, subscription_id),
          gateway_session_id = coalesce(v_gateway_session_id, gateway_session_id),
          processing_status = 'failed',
          result_snapshot = v_result,
          last_error = v_error_message,
          updated_at = now()
        where id = v_webhook_event_id;
      end if;

      return v_result;
  end;
end;
$$;

revoke all on function api.consume_tenant_billing_webhook(text, text, text, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function api.consume_tenant_billing_webhook(text, text, text, jsonb, text, uuid) to service_role;
