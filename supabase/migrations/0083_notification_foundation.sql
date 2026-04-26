create schema if not exists notifications;

revoke all on schema notifications from public, anon;
grant usage on schema notifications to authenticated, service_role;

alter default privileges in schema notifications revoke all on tables from public, anon, authenticated;
alter default privileges in schema notifications revoke all on sequences from public, anon, authenticated;
alter default privileges in schema notifications revoke all on functions from public, anon, authenticated;

create table if not exists notifications.notification_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  unit_id uuid references platform.units (id) on delete set null,
  actor_user_id uuid references identity.profiles (id) on delete set null,
  patient_id uuid references patients.patients (id) on delete set null,
  recipient_user_id uuid references identity.profiles (id) on delete set null,
  recipient_patient_id uuid references patients.patients (id) on delete set null,
  source_domain text not null,
  source_entity_type text not null,
  source_entity_id text not null,
  event_type text not null,
  title text not null,
  body text not null default '',
  payload jsonb not null default '{}'::jsonb,
  severity text not null default 'info',
  status text not null default 'ready',
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_events_source_domain_check check (btrim(source_domain) <> ''),
  constraint notification_events_source_entity_type_check check (btrim(source_entity_type) <> ''),
  constraint notification_events_source_entity_id_check check (btrim(source_entity_id) <> ''),
  constraint notification_events_event_type_check check (btrim(event_type) <> ''),
  constraint notification_events_title_check check (btrim(title) <> ''),
  constraint notification_events_payload_object_check check (jsonb_typeof(payload) = 'object'),
  constraint notification_events_severity_check check (severity in ('info', 'warning', 'critical')),
  constraint notification_events_status_check check (status in ('pending', 'ready', 'cancelled', 'failed'))
);

create table if not exists notifications.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  notification_event_id uuid not null references notifications.notification_events (id) on delete cascade,
  channel text not null default 'in_app',
  recipient_type text not null,
  recipient_user_id uuid references identity.profiles (id) on delete set null,
  recipient_patient_id uuid references patients.patients (id) on delete set null,
  status text not null default 'pending',
  provider text,
  provider_message_id text,
  failure_reason text,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_deliveries_channel_check check (channel in ('in_app', 'email', 'whatsapp', 'push')),
  constraint notification_deliveries_recipient_type_check check (recipient_type in ('user', 'patient')),
  constraint notification_deliveries_status_check check (status in ('pending', 'sent', 'read', 'failed', 'cancelled')),
  constraint notification_deliveries_recipient_check check (
    (recipient_type = 'user' and recipient_user_id is not null and recipient_patient_id is null)
    or (recipient_type = 'patient' and recipient_patient_id is not null and recipient_user_id is null)
  )
);

create unique index if not exists uq_notification_events_tenant_idempotency_key
  on notifications.notification_events (tenant_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_notification_events_tenant_status_created
  on notifications.notification_events (tenant_id, status, created_at desc);

create index if not exists idx_notification_events_tenant_recipient_user_created
  on notifications.notification_events (tenant_id, recipient_user_id, created_at desc)
  where recipient_user_id is not null;

create index if not exists idx_notification_events_tenant_recipient_patient_created
  on notifications.notification_events (tenant_id, recipient_patient_id, created_at desc)
  where recipient_patient_id is not null;

create index if not exists idx_notification_events_tenant_source
  on notifications.notification_events (tenant_id, source_domain, source_entity_type, source_entity_id);

create index if not exists idx_notification_deliveries_event
  on notifications.notification_deliveries (notification_event_id);

create index if not exists idx_notification_deliveries_tenant_channel_status_scheduled
  on notifications.notification_deliveries (tenant_id, channel, status, scheduled_at, created_at desc);

create index if not exists idx_notification_deliveries_tenant_recipient_user_status_created
  on notifications.notification_deliveries (tenant_id, recipient_user_id, status, created_at desc)
  where recipient_user_id is not null;

create index if not exists idx_notification_deliveries_tenant_recipient_patient_status_created
  on notifications.notification_deliveries (tenant_id, recipient_patient_id, status, created_at desc)
  where recipient_patient_id is not null;

create unique index if not exists uq_notification_deliveries_in_app_user
  on notifications.notification_deliveries (notification_event_id, channel, recipient_user_id)
  where channel = 'in_app' and recipient_user_id is not null;

create unique index if not exists uq_notification_deliveries_in_app_patient
  on notifications.notification_deliveries (notification_event_id, channel, recipient_patient_id)
  where channel = 'in_app' and recipient_patient_id is not null;

drop trigger if exists set_notification_events_updated_at on notifications.notification_events;
create trigger set_notification_events_updated_at
before update on notifications.notification_events
for each row execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_notification_deliveries_updated_at on notifications.notification_deliveries;
create trigger set_notification_deliveries_updated_at
before update on notifications.notification_deliveries
for each row execute function private.set_current_timestamp_updated_at();

insert into identity.permissions (
  code,
  description,
  module_code,
  is_system
)
values
  ('notifications.read', 'Leitura de notificacoes internas do tenant.', 'notifications', true),
  ('notifications.write', 'Criacao, cancelamento e orquestracao de notificacoes internas.', 'notifications', true)
on conflict (code) do update
set
  description = excluded.description,
  module_code = excluded.module_code,
  is_system = excluded.is_system,
  status = 'active',
  updated_at = now();

with role_permission_map (role_code, permission_code) as (
  values
    ('owner', 'notifications.read'),
    ('owner', 'notifications.write'),
    ('admin', 'notifications.read'),
    ('admin', 'notifications.write'),
    ('manager', 'notifications.read'),
    ('manager', 'notifications.write'),
    ('clinician', 'notifications.read'),
    ('physician', 'notifications.read'),
    ('nutritionist', 'notifications.read'),
    ('assistant', 'notifications.read'),
    ('reception', 'notifications.read'),
    ('sales', 'notifications.read'),
    ('nursing', 'notifications.read'),
    ('financial', 'notifications.read'),
    ('patient', 'notifications.read')
)
insert into identity.role_permissions (
  role_id,
  permission_id
)
select
  roles.id,
  permissions.id
from role_permission_map
join identity.roles as roles
  on roles.tenant_id is null
 and roles.code = role_permission_map.role_code
join identity.permissions as permissions
  on permissions.code = role_permission_map.permission_code
on conflict do nothing;

create or replace function private.notification_current_patient_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(coalesce(auth.jwt(), '{}'::jsonb) -> 'app_metadata' ->> 'patient_id', '')::uuid,
    nullif(coalesce(auth.jwt(), '{}'::jsonb) ->> 'patient_id', '')::uuid
  )
$$;

create or replace function private.notification_profile_in_tenant(
  target_profile_id uuid,
  target_tenant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_profile_id is not null
    and target_tenant_id is not null
    and (
      exists (
        select 1
        from identity.memberships as memberships
        where memberships.profile_id = target_profile_id
          and memberships.tenant_id = target_tenant_id
          and memberships.status = 'active'
      )
      or exists (
        select 1
        from identity.profiles as profiles
        where profiles.id = target_profile_id
          and profiles.default_tenant_id = target_tenant_id
          and profiles.status in ('invited', 'active')
      )
    )
$$;

create or replace function private.can_read_notification_admin(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(auth.role(), '') = 'service_role'
    or private.is_platform_admin()
    or (
      target_tenant_id is not null
      and target_tenant_id = private.current_tenant_id()
      and (
        private.has_permission('notifications.read')
        or private.has_permission('notifications.write')
        or private.has_permission('audit.read')
        or private.has_permission('settings.read')
      )
    )
$$;

create or replace function private.can_read_notification_delivery(
  target_tenant_id uuid,
  target_recipient_user_id uuid,
  target_recipient_patient_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_tenant_id is not null
    and (
      private.can_read_notification_admin(target_tenant_id)
      or (
        target_tenant_id = private.current_tenant_id()
        and target_recipient_user_id is not null
        and target_recipient_user_id = private.current_profile_id()
      )
      or (
        target_tenant_id = private.current_tenant_id()
        and target_recipient_patient_id is not null
        and target_recipient_patient_id = private.notification_current_patient_id()
      )
    )
$$;

create or replace function private.notification_safe_payload(p_payload jsonb)
returns jsonb
language sql
immutable
security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(
    coalesce(p_payload, '{}'::jsonb)
    - 'authorization'
    - 'Authorization'
    - 'apikey'
    - 'apiKey'
    - 'emailProviderToken'
    - 'password'
    - 'providerSecret'
    - 'pushToken'
    - 'secret'
    - 'serviceRole'
    - 'service_role'
    - 'signedUrl'
    - 'token'
    - 'whatsappToken'
  )
$$;

create or replace function private.enforce_notification_event_scope()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if new.unit_id is not null and not exists (
    select 1
    from platform.units as units
    where units.id = new.unit_id
      and units.tenant_id = new.tenant_id
  ) then
    raise exception 'notification unit does not belong to tenant';
  end if;

  if new.actor_user_id is not null
    and not private.notification_profile_in_tenant(new.actor_user_id, new.tenant_id) then
    raise exception 'notification actor does not belong to tenant';
  end if;

  if new.recipient_user_id is not null
    and not private.notification_profile_in_tenant(new.recipient_user_id, new.tenant_id) then
    raise exception 'notification recipient user does not belong to tenant';
  end if;

  if new.patient_id is not null and not exists (
    select 1
    from patients.patients as patients
    where patients.id = new.patient_id
      and patients.tenant_id = new.tenant_id
  ) then
    raise exception 'notification patient does not belong to tenant';
  end if;

  if new.recipient_patient_id is not null and not exists (
    select 1
    from patients.patients as patients
    where patients.id = new.recipient_patient_id
      and patients.tenant_id = new.tenant_id
  ) then
    raise exception 'notification recipient patient does not belong to tenant';
  end if;

  return new;
end;
$$;

create or replace function private.enforce_notification_delivery_scope()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event_tenant_id uuid;
begin
  select notification_events.tenant_id
  into v_event_tenant_id
  from notifications.notification_events as notification_events
  where notification_events.id = new.notification_event_id;

  if v_event_tenant_id is null or v_event_tenant_id <> new.tenant_id then
    raise exception 'notification delivery tenant does not match event';
  end if;

  if new.recipient_user_id is not null
    and not private.notification_profile_in_tenant(new.recipient_user_id, new.tenant_id) then
    raise exception 'notification delivery user does not belong to tenant';
  end if;

  if new.recipient_patient_id is not null and not exists (
    select 1
    from patients.patients as patients
    where patients.id = new.recipient_patient_id
      and patients.tenant_id = new.tenant_id
  ) then
    raise exception 'notification delivery patient does not belong to tenant';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_notification_event_scope on notifications.notification_events;
create trigger enforce_notification_event_scope
before insert or update of tenant_id, unit_id, actor_user_id, patient_id, recipient_user_id, recipient_patient_id
on notifications.notification_events
for each row execute function private.enforce_notification_event_scope();

drop trigger if exists enforce_notification_delivery_scope on notifications.notification_deliveries;
create trigger enforce_notification_delivery_scope
before insert or update of tenant_id, notification_event_id, recipient_user_id, recipient_patient_id
on notifications.notification_deliveries
for each row execute function private.enforce_notification_delivery_scope();

alter table notifications.notification_events enable row level security;
alter table notifications.notification_deliveries enable row level security;

drop policy if exists notification_events_select_current_scope on notifications.notification_events;
create policy notification_events_select_current_scope
on notifications.notification_events
for select
to authenticated
using (
  private.can_read_notification_admin(tenant_id)
  or (
    tenant_id = private.current_tenant_id()
    and recipient_user_id is not null
    and recipient_user_id = private.current_profile_id()
  )
  or (
    tenant_id = private.current_tenant_id()
    and recipient_patient_id is not null
    and recipient_patient_id = private.notification_current_patient_id()
  )
  or exists (
    select 1
    from notifications.notification_deliveries as deliveries
    where deliveries.notification_event_id = notification_events.id
      and private.can_read_notification_delivery(
        deliveries.tenant_id,
        deliveries.recipient_user_id,
        deliveries.recipient_patient_id
      )
  )
);

drop policy if exists notification_deliveries_select_current_scope on notifications.notification_deliveries;
create policy notification_deliveries_select_current_scope
on notifications.notification_deliveries
for select
to authenticated
using (
  private.can_read_notification_delivery(tenant_id, recipient_user_id, recipient_patient_id)
);

revoke all on table
  notifications.notification_events,
  notifications.notification_deliveries
from public, anon, authenticated;

grant select, insert, update, delete on table
  notifications.notification_events,
  notifications.notification_deliveries
to service_role;

create or replace function api.create_notification_event(
  p_tenant_id uuid default null,
  p_unit_id uuid default null,
  p_actor_user_id uuid default null,
  p_patient_id uuid default null,
  p_recipient_user_id uuid default null,
  p_recipient_patient_id uuid default null,
  p_source_domain text default null,
  p_source_entity_type text default null,
  p_source_entity_id text default null,
  p_event_type text default null,
  p_title text default null,
  p_body text default '',
  p_payload jsonb default '{}'::jsonb,
  p_severity text default 'info',
  p_status text default 'ready',
  p_idempotency_key text default null,
  p_channels text[] default array['in_app']::text[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := coalesce(p_tenant_id, private.current_tenant_id());
  v_actor_user_id uuid := coalesce(
    p_actor_user_id,
    case when coalesce(auth.role(), '') <> 'service_role' then private.current_profile_id() else null end
  );
  v_severity text := lower(coalesce(nullif(btrim(coalesce(p_severity, '')), ''), 'info'));
  v_status text := lower(coalesce(nullif(btrim(coalesce(p_status, '')), ''), 'ready'));
  v_idempotency_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_channels text[] := coalesce(p_channels, array['in_app']::text[]);
  v_event notifications.notification_events%rowtype;
  v_delivery_user_id uuid;
  v_delivery_patient_id uuid;
  v_deliveries jsonb := '[]'::jsonb;
begin
  if v_tenant_id is null then
    raise exception 'p_tenant_id is required';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not (
      private.has_permission('notifications.write')
      or private.has_permission('audit.read')
      or private.has_permission('settings.write')
    ) then
    raise exception 'create notification denied';
  end if;

  if not exists (
    select 1
    from platform.tenants as tenants
    where tenants.id = v_tenant_id
      and tenants.status <> 'archived'
  ) then
    raise exception 'tenant not found for notification';
  end if;

  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then
    raise exception 'p_payload must be a json object';
  end if;

  if exists (
    select 1
    from unnest(v_channels) as channel
    where channel not in ('in_app', 'email', 'whatsapp', 'push')
  ) then
    raise exception 'unsupported notification channel';
  end if;

  if v_severity not in ('info', 'warning', 'critical') then
    v_severity := 'info';
  end if;

  if v_status not in ('pending', 'ready', 'cancelled', 'failed') then
    v_status := 'ready';
  end if;

  if v_idempotency_key is not null then
    select *
    into v_event
    from notifications.notification_events as notification_events
    where notification_events.tenant_id = v_tenant_id
      and notification_events.idempotency_key = v_idempotency_key
    limit 1;
  end if;

  if v_event.id is null then
    insert into notifications.notification_events (
      tenant_id,
      unit_id,
      actor_user_id,
      patient_id,
      recipient_user_id,
      recipient_patient_id,
      source_domain,
      source_entity_type,
      source_entity_id,
      event_type,
      title,
      body,
      payload,
      severity,
      status,
      idempotency_key
    )
    values (
      v_tenant_id,
      p_unit_id,
      v_actor_user_id,
      p_patient_id,
      p_recipient_user_id,
      p_recipient_patient_id,
      lower(nullif(btrim(coalesce(p_source_domain, '')), '')),
      lower(nullif(btrim(coalesce(p_source_entity_type, '')), '')),
      nullif(btrim(coalesce(p_source_entity_id, '')), ''),
      lower(nullif(btrim(coalesce(p_event_type, '')), '')),
      nullif(btrim(coalesce(p_title, '')), ''),
      coalesce(p_body, ''),
      private.notification_safe_payload(p_payload),
      v_severity,
      v_status,
      v_idempotency_key
    )
    returning *
    into v_event;

    perform private.record_audit_event(
      v_event.tenant_id,
      v_event.unit_id,
      v_event.patient_id,
      case when v_actor_user_id is null then 'system' else 'user' end,
      v_actor_user_id,
      'notification.event_created',
      'create',
      'notifications',
      'notification_events',
      v_event.id,
      jsonb_build_object(
        'eventType', v_event.event_type,
        'sourceDomain', v_event.source_domain,
        'severity', v_event.severity,
        'status', v_event.status
      ),
      null,
      v_event.idempotency_key
    );
  end if;

  if 'in_app' = any (v_channels) and p_recipient_user_id is not null then
    select notification_deliveries.id
    into v_delivery_user_id
    from notifications.notification_deliveries as notification_deliveries
    where notification_deliveries.notification_event_id = v_event.id
      and notification_deliveries.channel = 'in_app'
      and notification_deliveries.recipient_user_id = p_recipient_user_id
    limit 1;

    if v_delivery_user_id is null then
      insert into notifications.notification_deliveries (
        tenant_id,
        notification_event_id,
        channel,
        recipient_type,
        recipient_user_id,
        status,
        provider
      )
      values (
        v_event.tenant_id,
        v_event.id,
        'in_app',
        'user',
        p_recipient_user_id,
        'pending',
        'internal'
      )
      returning id
      into v_delivery_user_id;
    end if;
  end if;

  if 'in_app' = any (v_channels) and p_recipient_patient_id is not null then
    select notification_deliveries.id
    into v_delivery_patient_id
    from notifications.notification_deliveries as notification_deliveries
    where notification_deliveries.notification_event_id = v_event.id
      and notification_deliveries.channel = 'in_app'
      and notification_deliveries.recipient_patient_id = p_recipient_patient_id
    limit 1;

    if v_delivery_patient_id is null then
      insert into notifications.notification_deliveries (
        tenant_id,
        notification_event_id,
        channel,
        recipient_type,
        recipient_patient_id,
        status,
        provider
      )
      values (
        v_event.tenant_id,
        v_event.id,
        'in_app',
        'patient',
        p_recipient_patient_id,
        'pending',
        'internal'
      )
      returning id
      into v_delivery_patient_id;
    end if;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_strip_nulls(
        jsonb_build_object(
          'id', notification_deliveries.id::text,
          'channel', notification_deliveries.channel,
          'recipientType', notification_deliveries.recipient_type,
          'recipientUserId', notification_deliveries.recipient_user_id::text,
          'recipientPatientId', notification_deliveries.recipient_patient_id::text,
          'status', notification_deliveries.status,
          'provider', notification_deliveries.provider,
          'scheduledAt', notification_deliveries.scheduled_at,
          'createdAt', notification_deliveries.created_at
        )
      )
      order by notification_deliveries.created_at asc
    ),
    '[]'::jsonb
  )
  into v_deliveries
  from notifications.notification_deliveries as notification_deliveries
  where notification_deliveries.notification_event_id = v_event.id;

  return jsonb_strip_nulls(
    jsonb_build_object(
      'id', v_event.id::text,
      'tenantId', v_event.tenant_id::text,
      'unitId', v_event.unit_id::text,
      'patientId', v_event.patient_id::text,
      'recipientUserId', v_event.recipient_user_id::text,
      'recipientPatientId', v_event.recipient_patient_id::text,
      'sourceDomain', v_event.source_domain,
      'sourceEntityType', v_event.source_entity_type,
      'sourceEntityId', v_event.source_entity_id,
      'eventType', v_event.event_type,
      'title', v_event.title,
      'body', v_event.body,
      'severity', v_event.severity,
      'status', v_event.status,
      'idempotencyKey', v_event.idempotency_key,
      'createdAt', v_event.created_at,
      'updatedAt', v_event.updated_at,
      'deliveries', v_deliveries
    )
  );
end;
$$;

create or replace function api.list_my_notifications(
  p_limit integer default 20,
  p_offset integer default 0,
  p_include_read boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := private.current_tenant_id();
  v_profile_id uuid := private.current_profile_id();
  v_patient_id uuid := private.notification_current_patient_id();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_items jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_unread_count integer := 0;
begin
  if v_tenant_id is null then
    raise exception 'notification tenant context is required';
  end if;

  select count(*)
  into v_total
  from notifications.notification_deliveries as deliveries
  inner join notifications.notification_events as events
    on events.id = deliveries.notification_event_id
  where deliveries.tenant_id = v_tenant_id
    and deliveries.channel = 'in_app'
    and deliveries.status in ('pending', 'sent', 'read')
    and events.status in ('pending', 'ready')
    and (
      (deliveries.recipient_user_id is not null and deliveries.recipient_user_id = v_profile_id)
      or (deliveries.recipient_patient_id is not null and deliveries.recipient_patient_id = v_patient_id)
    )
    and (p_include_read or deliveries.status <> 'read');

  select count(*)
  into v_unread_count
  from notifications.notification_deliveries as deliveries
  inner join notifications.notification_events as events
    on events.id = deliveries.notification_event_id
  where deliveries.tenant_id = v_tenant_id
    and deliveries.channel = 'in_app'
    and deliveries.status in ('pending', 'sent')
    and events.status in ('pending', 'ready')
    and (
      (deliveries.recipient_user_id is not null and deliveries.recipient_user_id = v_profile_id)
      or (deliveries.recipient_patient_id is not null and deliveries.recipient_patient_id = v_patient_id)
    );

  select coalesce(jsonb_agg(item_payload order by item_created_at desc), '[]'::jsonb)
  into v_items
  from (
    select
      events.created_at as item_created_at,
      jsonb_strip_nulls(
        jsonb_build_object(
          'id', events.id::text,
          'deliveryId', deliveries.id::text,
          'unitId', events.unit_id::text,
          'patientId', events.patient_id::text,
          'sourceDomain', events.source_domain,
          'sourceEntityType', events.source_entity_type,
          'sourceEntityId', events.source_entity_id,
          'eventType', events.event_type,
          'title', events.title,
          'body', events.body,
          'severity', events.severity,
          'status', events.status,
          'channel', deliveries.channel,
          'deliveryStatus', deliveries.status,
          'scheduledAt', deliveries.scheduled_at,
          'sentAt', deliveries.sent_at,
          'readAt', deliveries.read_at,
          'createdAt', events.created_at
        )
      ) as item_payload
    from notifications.notification_deliveries as deliveries
    inner join notifications.notification_events as events
      on events.id = deliveries.notification_event_id
    where deliveries.tenant_id = v_tenant_id
      and deliveries.channel = 'in_app'
      and deliveries.status in ('pending', 'sent', 'read')
      and events.status in ('pending', 'ready')
      and (
        (deliveries.recipient_user_id is not null and deliveries.recipient_user_id = v_profile_id)
        or (deliveries.recipient_patient_id is not null and deliveries.recipient_patient_id = v_patient_id)
      )
      and (p_include_read or deliveries.status <> 'read')
    order by events.created_at desc
    limit v_limit offset v_offset
  ) as items;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'unreadCount', v_unread_count,
    'limit', v_limit,
    'offset', v_offset
  );
end;
$$;

create or replace function api.list_admin_notifications(
  p_status text default null,
  p_severity text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := private.current_tenant_id();
  v_status text := lower(nullif(btrim(coalesce(p_status, '')), ''));
  v_severity text := lower(nullif(btrim(coalesce(p_severity, '')), ''));
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_items jsonb := '[]'::jsonb;
  v_total integer := 0;
begin
  if v_tenant_id is null then
    raise exception 'notification tenant context is required';
  end if;

  if not private.can_read_notification_admin(v_tenant_id) then
    raise exception 'list admin notifications denied';
  end if;

  select count(*)
  into v_total
  from notifications.notification_events as events
  where events.tenant_id = v_tenant_id
    and (v_status is null or events.status = v_status)
    and (v_severity is null or events.severity = v_severity);

  select coalesce(jsonb_agg(item_payload order by item_created_at desc), '[]'::jsonb)
  into v_items
  from (
    select
      events.created_at as item_created_at,
      jsonb_strip_nulls(
        jsonb_build_object(
          'id', events.id::text,
          'unitId', events.unit_id::text,
          'actorUserId', events.actor_user_id::text,
          'patientId', events.patient_id::text,
          'recipientUserId', events.recipient_user_id::text,
          'recipientPatientId', events.recipient_patient_id::text,
          'sourceDomain', events.source_domain,
          'sourceEntityType', events.source_entity_type,
          'sourceEntityId', events.source_entity_id,
          'eventType', events.event_type,
          'title', events.title,
          'body', events.body,
          'severity', events.severity,
          'status', events.status,
          'createdAt', events.created_at,
          'updatedAt', events.updated_at
        )
      ) as item_payload
    from notifications.notification_events as events
    where events.tenant_id = v_tenant_id
      and (v_status is null or events.status = v_status)
      and (v_severity is null or events.severity = v_severity)
    order by events.created_at desc
    limit v_limit offset v_offset
  ) as items;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
end;
$$;

create or replace function api.mark_notification_read(
  p_notification_event_id uuid default null,
  p_delivery_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := private.current_tenant_id();
  v_profile_id uuid := private.current_profile_id();
  v_patient_id uuid := private.notification_current_patient_id();
  v_delivery_id uuid;
  v_delivery notifications.notification_deliveries%rowtype;
  v_event notifications.notification_events%rowtype;
begin
  if v_tenant_id is null then
    raise exception 'notification tenant context is required';
  end if;

  if p_notification_event_id is null and p_delivery_id is null then
    raise exception 'notification id is required';
  end if;

  select deliveries.id
  into v_delivery_id
  from notifications.notification_deliveries as deliveries
  inner join notifications.notification_events as events
    on events.id = deliveries.notification_event_id
  where deliveries.tenant_id = v_tenant_id
    and deliveries.channel = 'in_app'
    and deliveries.status in ('pending', 'sent', 'read')
    and events.status in ('pending', 'ready')
    and (p_delivery_id is null or deliveries.id = p_delivery_id)
    and (p_notification_event_id is null or deliveries.notification_event_id = p_notification_event_id)
    and (
      (deliveries.recipient_user_id is not null and deliveries.recipient_user_id = v_profile_id)
      or (deliveries.recipient_patient_id is not null and deliveries.recipient_patient_id = v_patient_id)
    )
  order by deliveries.created_at desc
  limit 1;

  if v_delivery_id is null then
    raise exception 'notification delivery not found';
  end if;

  update notifications.notification_deliveries
  set
    status = 'read',
    read_at = coalesce(read_at, now()),
    updated_at = now()
  where id = v_delivery_id
  returning *
  into v_delivery;

  select *
  into v_event
  from notifications.notification_events as events
  where events.id = v_delivery.notification_event_id;

  perform private.record_audit_event(
    v_event.tenant_id,
    v_event.unit_id,
    v_event.patient_id,
    'user',
    v_profile_id,
    'notification.delivery_read',
    'read',
    'notifications',
    'notification_deliveries',
    v_delivery.id,
    jsonb_build_object(
      'notificationEventId', v_event.id::text,
      'eventType', v_event.event_type,
      'channel', v_delivery.channel
    ),
    null,
    null
  );

  return jsonb_strip_nulls(
    jsonb_build_object(
      'id', v_event.id::text,
      'deliveryId', v_delivery.id::text,
      'status', v_event.status,
      'deliveryStatus', v_delivery.status,
      'readAt', v_delivery.read_at
    )
  );
end;
$$;

create or replace function api.cancel_notification_event(
  p_notification_event_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := private.current_tenant_id();
  v_event notifications.notification_events%rowtype;
  v_cancelled_deliveries integer := 0;
begin
  if p_notification_event_id is null then
    raise exception 'p_notification_event_id is required';
  end if;

  select *
  into v_event
  from notifications.notification_events as events
  where events.id = p_notification_event_id
    and (
      coalesce(auth.role(), '') = 'service_role'
      or events.tenant_id = v_tenant_id
    )
  limit 1;

  if v_event.id is null then
    raise exception 'notification event not found';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not (
      private.has_permission('notifications.write')
      or private.has_permission('audit.read')
      or private.has_permission('settings.write')
    ) then
    raise exception 'cancel notification denied';
  end if;

  update notifications.notification_events
  set
    status = 'cancelled',
    payload = payload || jsonb_strip_nulls(jsonb_build_object('cancelReason', nullif(btrim(coalesce(p_reason, '')), ''))),
    updated_at = now()
  where id = v_event.id
  returning *
  into v_event;

  update notifications.notification_deliveries
  set
    status = 'cancelled',
    updated_at = now()
  where notification_event_id = v_event.id
    and status in ('pending', 'sent', 'failed')
    and channel in ('in_app', 'email', 'whatsapp', 'push');

  get diagnostics v_cancelled_deliveries = row_count;

  perform private.record_audit_event(
    v_event.tenant_id,
    v_event.unit_id,
    v_event.patient_id,
    'user',
    case when coalesce(auth.role(), '') = 'service_role' then null else private.current_profile_id() end,
    'notification.event_cancelled',
    'cancel',
    'notifications',
    'notification_events',
    v_event.id,
    jsonb_strip_nulls(
      jsonb_build_object(
        'eventType', v_event.event_type,
        'cancelledDeliveries', v_cancelled_deliveries,
        'reason', nullif(btrim(coalesce(p_reason, '')), '')
      )
    ),
    null,
    null
  );

  return jsonb_strip_nulls(
    jsonb_build_object(
      'id', v_event.id::text,
      'status', v_event.status,
      'cancelledDeliveries', v_cancelled_deliveries,
      'updatedAt', v_event.updated_at
    )
  );
end;
$$;

create or replace function public.create_notification_event(
  p_tenant_id uuid default null,
  p_unit_id uuid default null,
  p_actor_user_id uuid default null,
  p_patient_id uuid default null,
  p_recipient_user_id uuid default null,
  p_recipient_patient_id uuid default null,
  p_source_domain text default null,
  p_source_entity_type text default null,
  p_source_entity_id text default null,
  p_event_type text default null,
  p_title text default null,
  p_body text default '',
  p_payload jsonb default '{}'::jsonb,
  p_severity text default 'info',
  p_status text default 'ready',
  p_idempotency_key text default null,
  p_channels text[] default array['in_app']::text[]
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select api.create_notification_event(
    p_tenant_id,
    p_unit_id,
    p_actor_user_id,
    p_patient_id,
    p_recipient_user_id,
    p_recipient_patient_id,
    p_source_domain,
    p_source_entity_type,
    p_source_entity_id,
    p_event_type,
    p_title,
    p_body,
    p_payload,
    p_severity,
    p_status,
    p_idempotency_key,
    p_channels
  )
$$;

create or replace function public.list_my_notifications(
  p_limit integer default 20,
  p_offset integer default 0,
  p_include_read boolean default false
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select api.list_my_notifications(p_limit, p_offset, p_include_read)
$$;

create or replace function public.list_admin_notifications(
  p_status text default null,
  p_severity text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select api.list_admin_notifications(p_status, p_severity, p_limit, p_offset)
$$;

create or replace function public.mark_notification_read(
  p_notification_event_id uuid default null,
  p_delivery_id uuid default null
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select api.mark_notification_read(p_notification_event_id, p_delivery_id)
$$;

create or replace function public.cancel_notification_event(
  p_notification_event_id uuid,
  p_reason text default null
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select api.cancel_notification_event(p_notification_event_id, p_reason)
$$;

create or replace function private.current_app_permission_codes()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  with granted_codes as (
    select unnest(private.current_permission_codes()) as code
  ),
  mapped_permissions as (
    select 'dashboard:view'::text as permission_code
    where exists (
      select 1
      from granted_codes
      where code = 'platform.read'
    )
    union
    select 'settings:view'::text
    where exists (
      select 1
      from granted_codes
      where code in ('platform.read', 'roles.read', 'users.read', 'audit.read', 'settings.read', 'settings.write')
    )
    union
    select 'patients:view'::text
    where exists (
      select 1
      from granted_codes
      where code = 'patients.read'
    )
    union
    select 'patients:write'::text
    where exists (
      select 1
      from granted_codes
      where code = 'patients.write'
    )
    union
    select 'schedule:view'::text
    where exists (
      select 1
      from granted_codes
      where code = 'schedule.read'
    )
    union
    select 'schedule:write'::text
    where exists (
      select 1
      from granted_codes
      where code = 'schedule.write'
    )
    union
    select 'crm:view'::text
    where exists (
      select 1
      from granted_codes
      where code = 'crm.read'
    )
    union
    select 'crm:write'::text
    where exists (
      select 1
      from granted_codes
      where code = 'crm.write'
    )
    union
    select 'clinical:view'::text
    where exists (
      select 1
      from granted_codes
      where code = 'clinical.read'
    )
    union
    select 'clinical:write'::text
    where exists (
      select 1
      from granted_codes
      where code = 'clinical.write'
    )
    union
    select 'notifications:view'::text
    where exists (
      select 1
      from granted_codes
      where code in ('notifications.read', 'notifications.write', 'audit.read', 'settings.read')
    )
  )
  select coalesce(
    array(
      select permission_code
      from mapped_permissions
      order by permission_code
    ),
    '{}'::text[]
  )
$$;

alter function private.notification_current_patient_id()
  security definer;
alter function private.notification_current_patient_id()
  set search_path = '';
alter function private.notification_profile_in_tenant(uuid, uuid)
  security definer;
alter function private.notification_profile_in_tenant(uuid, uuid)
  set search_path = '';
alter function private.can_read_notification_admin(uuid)
  security definer;
alter function private.can_read_notification_admin(uuid)
  set search_path = '';
alter function private.can_read_notification_delivery(uuid, uuid, uuid)
  security definer;
alter function private.can_read_notification_delivery(uuid, uuid, uuid)
  set search_path = '';
alter function private.notification_safe_payload(jsonb)
  security definer;
alter function private.notification_safe_payload(jsonb)
  set search_path = '';
alter function private.enforce_notification_event_scope()
  security definer;
alter function private.enforce_notification_event_scope()
  set search_path = '';
alter function private.enforce_notification_delivery_scope()
  security definer;
alter function private.enforce_notification_delivery_scope()
  set search_path = '';
alter function api.create_notification_event(uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, jsonb, text, text, text, text[])
  security definer;
alter function api.create_notification_event(uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, jsonb, text, text, text, text[])
  set search_path = '';
alter function api.list_my_notifications(integer, integer, boolean)
  security definer;
alter function api.list_my_notifications(integer, integer, boolean)
  set search_path = '';
alter function api.list_admin_notifications(text, text, integer, integer)
  security definer;
alter function api.list_admin_notifications(text, text, integer, integer)
  set search_path = '';
alter function api.mark_notification_read(uuid, uuid)
  security definer;
alter function api.mark_notification_read(uuid, uuid)
  set search_path = '';
alter function api.cancel_notification_event(uuid, text)
  security definer;
alter function api.cancel_notification_event(uuid, text)
  set search_path = '';
alter function public.create_notification_event(uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, jsonb, text, text, text, text[])
  security invoker;
alter function public.create_notification_event(uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, jsonb, text, text, text, text[])
  set search_path = '';
alter function public.list_my_notifications(integer, integer, boolean)
  security invoker;
alter function public.list_my_notifications(integer, integer, boolean)
  set search_path = '';
alter function public.list_admin_notifications(text, text, integer, integer)
  security invoker;
alter function public.list_admin_notifications(text, text, integer, integer)
  set search_path = '';
alter function public.mark_notification_read(uuid, uuid)
  security invoker;
alter function public.mark_notification_read(uuid, uuid)
  set search_path = '';
alter function public.cancel_notification_event(uuid, text)
  security invoker;
alter function public.cancel_notification_event(uuid, text)
  set search_path = '';
alter function private.current_app_permission_codes()
  security definer;
alter function private.current_app_permission_codes()
  set search_path = '';

revoke all on function private.notification_current_patient_id()
  from public, anon;
revoke all on function private.notification_profile_in_tenant(uuid, uuid)
  from public, anon;
revoke all on function private.can_read_notification_admin(uuid)
  from public, anon;
revoke all on function private.can_read_notification_delivery(uuid, uuid, uuid)
  from public, anon;
revoke all on function private.notification_safe_payload(jsonb)
  from public, anon, authenticated;
revoke all on function private.enforce_notification_event_scope()
  from public, anon, authenticated;
revoke all on function private.enforce_notification_delivery_scope()
  from public, anon, authenticated;
revoke all on function api.create_notification_event(uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, jsonb, text, text, text, text[])
  from public, anon, authenticated;
revoke all on function api.list_my_notifications(integer, integer, boolean)
  from public, anon, authenticated;
revoke all on function api.list_admin_notifications(text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function api.mark_notification_read(uuid, uuid)
  from public, anon, authenticated;
revoke all on function api.cancel_notification_event(uuid, text)
  from public, anon, authenticated;
revoke all on function public.create_notification_event(uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, jsonb, text, text, text, text[])
  from public, anon, authenticated;
revoke all on function public.list_my_notifications(integer, integer, boolean)
  from public, anon, authenticated;
revoke all on function public.list_admin_notifications(text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.mark_notification_read(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.cancel_notification_event(uuid, text)
  from public, anon, authenticated;
revoke all on function private.current_app_permission_codes()
  from public, anon;

grant execute on function private.notification_current_patient_id()
  to authenticated, service_role;
grant execute on function private.notification_profile_in_tenant(uuid, uuid)
  to authenticated, service_role;
grant execute on function private.can_read_notification_admin(uuid)
  to authenticated, service_role;
grant execute on function private.can_read_notification_delivery(uuid, uuid, uuid)
  to authenticated, service_role;
grant execute on function private.notification_safe_payload(jsonb)
  to service_role;
grant execute on function private.enforce_notification_event_scope()
  to service_role;
grant execute on function private.enforce_notification_delivery_scope()
  to service_role;
grant execute on function api.create_notification_event(uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, jsonb, text, text, text, text[])
  to authenticated, service_role;
grant execute on function api.list_my_notifications(integer, integer, boolean)
  to authenticated, service_role;
grant execute on function api.list_admin_notifications(text, text, integer, integer)
  to authenticated, service_role;
grant execute on function api.mark_notification_read(uuid, uuid)
  to authenticated, service_role;
grant execute on function api.cancel_notification_event(uuid, text)
  to authenticated, service_role;
grant execute on function public.create_notification_event(uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, jsonb, text, text, text, text[])
  to authenticated, service_role;
grant execute on function public.list_my_notifications(integer, integer, boolean)
  to authenticated, service_role;
grant execute on function public.list_admin_notifications(text, text, integer, integer)
  to authenticated, service_role;
grant execute on function public.mark_notification_read(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.cancel_notification_event(uuid, text)
  to authenticated, service_role;
grant execute on function private.current_app_permission_codes()
  to authenticated, service_role;
