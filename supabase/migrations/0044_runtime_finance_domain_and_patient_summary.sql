create or replace function private.can_access_finance_patient(target_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from patients.patients as patients
    where patients.id = target_patient_id
      and (
        private.can_access_patient(target_patient_id)
        or (
          patients.tenant_id = private.current_tenant_id()
          and (
            private.is_platform_admin()
            or private.has_permission('finance.read')
            or private.has_permission('finance.write')
          )
        )
      )
  )
$$;

create or replace function private.can_read_finance_domain(target_tenant_id uuid)
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
      or private.has_permission('finance.read')
      or private.has_permission('finance.write')
    )
$$;

create or replace function private.can_manage_finance_domain(target_tenant_id uuid)
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
      or private.has_permission('finance.write')
    )
$$;

create or replace function private.finance_outstanding_amount(
  p_amount_total numeric,
  p_amount_paid numeric
)
returns numeric
language sql
immutable
security definer
set search_path = ''
as $$
  select greatest(coalesce(p_amount_total, 0::numeric) - coalesce(p_amount_paid, 0::numeric), 0::numeric)
$$;

create or replace function private.normalize_financial_item_status(
  p_requested_status text,
  p_due_date date,
  p_amount_total numeric,
  p_amount_paid numeric
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
      greatest(coalesce(p_amount_total, 0::numeric), 0::numeric) as amount_total,
      greatest(coalesce(p_amount_paid, 0::numeric), 0::numeric) as amount_paid
  )
  select
    case
      when normalized.requested_status in ('canceled', 'refunded', 'written_off', 'draft') then normalized.requested_status
      when normalized.amount_total = 0::numeric then 'paid'
      when normalized.amount_paid >= normalized.amount_total then 'paid'
      when normalized.requested_status = 'paid' then 'paid'
      when normalized.requested_status = 'overdue' then 'overdue'
      when p_due_date is not null and p_due_date < current_date then 'overdue'
      else 'pending'
    end
  from normalized
$$;

create or replace function private.normalize_financial_reconciliation_status(
  p_requested_status text,
  p_amount_total numeric,
  p_amount_paid numeric
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
      greatest(coalesce(p_amount_total, 0::numeric), 0::numeric) as amount_total,
      greatest(coalesce(p_amount_paid, 0::numeric), 0::numeric) as amount_paid
  )
  select
    case
      when normalized.requested_status in ('unreconciled', 'partially_reconciled', 'reconciled', 'disputed')
        then normalized.requested_status
      when normalized.amount_paid <= 0::numeric then 'unreconciled'
      when normalized.amount_paid < normalized.amount_total then 'partially_reconciled'
      else 'reconciled'
    end
  from normalized
$$;

revoke all on function private.can_access_finance_patient(uuid) from public, anon;
revoke all on function private.can_read_finance_domain(uuid) from public, anon;
revoke all on function private.can_manage_finance_domain(uuid) from public, anon;
revoke all on function private.finance_outstanding_amount(numeric, numeric) from public, anon, authenticated;
revoke all on function private.normalize_financial_item_status(text, date, numeric, numeric) from public, anon, authenticated;
revoke all on function private.normalize_financial_reconciliation_status(text, numeric, numeric) from public, anon, authenticated;

grant execute on function private.can_access_finance_patient(uuid) to authenticated, service_role;
grant execute on function private.can_read_finance_domain(uuid) to authenticated, service_role;
grant execute on function private.can_manage_finance_domain(uuid) to authenticated, service_role;
grant execute on function private.finance_outstanding_amount(numeric, numeric) to authenticated, service_role;
grant execute on function private.normalize_financial_item_status(text, date, numeric, numeric) to authenticated, service_role;
grant execute on function private.normalize_financial_reconciliation_status(text, numeric, numeric) to authenticated, service_role;

create table if not exists finance.financial_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  patient_id uuid not null references patients.patients (id) on delete cascade,
  enrollment_id uuid references commercial.patient_program_enrollments (id) on delete set null,
  package_id uuid references commercial.packages (id) on delete set null,
  legacy_financial_item_id text,
  reference_code text,
  item_type text not null default 'enrollment' check (
    item_type in ('enrollment', 'renewal', 'upgrade', 'service', 'return', 'adjustment', 'other')
  ),
  status text not null default 'pending' check (
    status in ('draft', 'pending', 'paid', 'overdue', 'canceled', 'refunded', 'written_off')
  ),
  reconciliation_status text not null default 'unreconciled' check (
    reconciliation_status in ('unreconciled', 'partially_reconciled', 'reconciled', 'disputed')
  ),
  billing_model text check (
    billing_model is null or billing_model in ('one_time', 'recurring', 'hybrid')
  ),
  currency_code text not null default 'BRL',
  amount_total numeric(12,2) not null default 0 check (amount_total >= 0),
  amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0 and amount_paid <= amount_total),
  due_date date,
  paid_at timestamptz,
  last_reconciled_at timestamptz,
  description text,
  created_by_profile_id uuid references identity.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists finance.financial_item_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  financial_item_id uuid not null references finance.financial_items (id) on delete cascade,
  patient_id uuid not null references patients.patients (id) on delete cascade,
  legacy_financial_event_id text,
  event_type text not null check (
    event_type in ('created', 'payment_recorded', 'reconciled', 'status_changed', 'canceled', 'refunded', 'written_off', 'note')
  ),
  previous_status text,
  current_status text,
  reconciliation_status text,
  amount numeric(12,2) check (amount is null or amount >= 0),
  event_at timestamptz not null default now(),
  actor_type text,
  actor_profile_id uuid references identity.profiles (id) on delete set null,
  notes text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_finance_financial_items_legacy_id
  on finance.financial_items (legacy_financial_item_id);

create unique index if not exists idx_finance_financial_items_reference_code
  on finance.financial_items (tenant_id, reference_code)
  where reference_code is not null;

create index if not exists idx_finance_financial_items_patient_open
  on finance.financial_items (patient_id, due_date asc nulls last, created_at desc)
  where deleted_at is null
    and status in ('draft', 'pending', 'overdue');

create index if not exists idx_finance_financial_items_tenant_status_due
  on finance.financial_items (tenant_id, status, due_date asc nulls last, created_at desc)
  where deleted_at is null;

create index if not exists idx_finance_financial_items_enrollment_status_due
  on finance.financial_items (enrollment_id, status, due_date asc nulls last)
  where enrollment_id is not null
    and deleted_at is null;

create index if not exists idx_finance_financial_items_tenant_reconciliation
  on finance.financial_items (tenant_id, reconciliation_status, last_reconciled_at desc)
  where deleted_at is null;

create unique index if not exists idx_finance_financial_item_events_legacy_id
  on finance.financial_item_events (legacy_financial_event_id);

create index if not exists idx_finance_financial_item_events_item_event_at
  on finance.financial_item_events (financial_item_id, event_at desc);

create index if not exists idx_finance_financial_item_events_patient_event_at
  on finance.financial_item_events (patient_id, event_at desc);

create index if not exists idx_finance_financial_item_events_tenant_type_event_at
  on finance.financial_item_events (tenant_id, event_type, event_at desc);

drop trigger if exists set_finance_financial_items_updated_at on finance.financial_items;
create trigger set_finance_financial_items_updated_at
before update on finance.financial_items
for each row execute function private.set_current_timestamp_updated_at();

grant all on table finance.financial_items to service_role;
grant all on table finance.financial_item_events to service_role;

alter table finance.financial_items enable row level security;
alter table finance.financial_item_events enable row level security;

drop policy if exists finance_financial_items_select_current_scope on finance.financial_items;
create policy finance_financial_items_select_current_scope
on finance.financial_items
for select
using (private.can_read_finance_domain(tenant_id) and private.can_access_finance_patient(patient_id));

drop policy if exists finance_financial_items_manage_current_scope on finance.financial_items;
create policy finance_financial_items_manage_current_scope
on finance.financial_items
for all
using (private.can_manage_finance_domain(tenant_id) and private.can_access_finance_patient(patient_id))
with check (private.can_manage_finance_domain(tenant_id) and private.can_access_finance_patient(patient_id));

drop policy if exists finance_financial_item_events_select_current_scope on finance.financial_item_events;
create policy finance_financial_item_events_select_current_scope
on finance.financial_item_events
for select
using (private.can_read_finance_domain(tenant_id) and private.can_access_finance_patient(patient_id));

drop policy if exists finance_financial_item_events_manage_current_scope on finance.financial_item_events;
create policy finance_financial_item_events_manage_current_scope
on finance.financial_item_events
for all
using (private.can_manage_finance_domain(tenant_id) and private.can_access_finance_patient(patient_id))
with check (private.can_manage_finance_domain(tenant_id) and private.can_access_finance_patient(patient_id));

create or replace function private.resolve_financial_enrollment_id(
  p_runtime_tenant_id uuid,
  p_enrollment_ref text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select enrollments.id
  from commercial.patient_program_enrollments as enrollments
  where enrollments.tenant_id = p_runtime_tenant_id
    and enrollments.deleted_at is null
    and (
      enrollments.id::text = p_enrollment_ref
      or enrollments.legacy_enrollment_id = p_enrollment_ref
    )
  order by
    case
      when enrollments.id::text = p_enrollment_ref then 0
      else 1
    end
  limit 1
$$;

create or replace function private.resolve_financial_item_id(
  p_runtime_tenant_id uuid,
  p_financial_item_ref text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select items.id
  from finance.financial_items as items
  where items.tenant_id = p_runtime_tenant_id
    and items.deleted_at is null
    and (
      items.id::text = p_financial_item_ref
      or items.legacy_financial_item_id = p_financial_item_ref
      or items.reference_code = p_financial_item_ref
    )
  order by
    case
      when items.id::text = p_financial_item_ref then 0
      when items.legacy_financial_item_id = p_financial_item_ref then 1
      else 2
    end
  limit 1
$$;

revoke all on function private.resolve_financial_enrollment_id(uuid, text) from public, anon, authenticated;
revoke all on function private.resolve_financial_item_id(uuid, text) from public, anon, authenticated;

grant execute on function private.resolve_financial_enrollment_id(uuid, text) to authenticated, service_role;
grant execute on function private.resolve_financial_item_id(uuid, text) to authenticated, service_role;

create or replace function api.backfill_runtime_financial_domain(
  p_runtime_tenant_id uuid,
  p_financial_items jsonb default '[]'::jsonb,
  p_financial_item_events jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_financial_items_count integer := 0;
  v_financial_item_events_count integer := 0;
begin
  if p_runtime_tenant_id is null then
    raise exception 'p_runtime_tenant_id is required';
  end if;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_financial_items, '[]'::jsonb)) as x(
      id uuid,
      legacy_financial_item_id text,
      patient_reference text,
      enrollment_reference text,
      package_reference text,
      reference_code text,
      item_type text,
      status text,
      reconciliation_status text,
      billing_model text,
      currency_code text,
      amount_total numeric,
      amount_paid numeric,
      due_date date,
      paid_at timestamptz,
      last_reconciled_at timestamptz,
      description text,
      created_by_profile_id uuid,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz,
      deleted_at timestamptz
    )
  ),
  normalized as (
    select
      coalesce(rows.id, gen_random_uuid()) as id,
      rows.legacy_financial_item_id,
      private.runtime_patient_id_from_reference(rows.patient_reference) as patient_id,
      private.resolve_financial_enrollment_id(p_runtime_tenant_id, rows.enrollment_reference) as enrollment_id,
      private.resolve_commercial_package_id(p_runtime_tenant_id, rows.package_reference) as package_id,
      nullif(trim(coalesce(rows.reference_code, '')), '') as reference_code,
      case
        when lower(coalesce(rows.item_type, '')) in ('enrollment', 'renewal', 'upgrade', 'service', 'return', 'adjustment', 'other')
          then lower(rows.item_type)
        else 'enrollment'
      end as item_type,
      greatest(coalesce(rows.amount_total, 0::numeric), 0::numeric)::numeric(12,2) as amount_total,
      least(
        greatest(coalesce(rows.amount_paid, 0::numeric), 0::numeric),
        greatest(coalesce(rows.amount_total, 0::numeric), 0::numeric)
      )::numeric(12,2) as amount_paid,
      rows.due_date,
      case
        when lower(coalesce(rows.billing_model, '')) in ('one_time', 'recurring', 'hybrid')
          then lower(rows.billing_model)
        else null
      end as billing_model,
      coalesce(nullif(trim(coalesce(rows.currency_code, '')), ''), 'BRL') as currency_code,
      rows.paid_at,
      rows.last_reconciled_at,
      rows.description,
      rows.created_by_profile_id,
      coalesce(rows.metadata, '{}'::jsonb) as metadata,
      coalesce(rows.created_at, now()) as created_at,
      coalesce(rows.updated_at, coalesce(rows.created_at, now())) as updated_at,
      rows.deleted_at,
      rows.status,
      rows.reconciliation_status
    from rows
  ),
  prepared as (
    select
      normalized.id,
      normalized.legacy_financial_item_id,
      normalized.patient_id,
      normalized.enrollment_id,
      normalized.package_id,
      normalized.reference_code,
      normalized.item_type,
      private.normalize_financial_item_status(
        normalized.status,
        normalized.due_date,
        normalized.amount_total,
        normalized.amount_paid
      ) as status,
      private.normalize_financial_reconciliation_status(
        normalized.reconciliation_status,
        normalized.amount_total,
        normalized.amount_paid
      ) as reconciliation_status,
      normalized.billing_model,
      normalized.currency_code,
      normalized.amount_total,
      normalized.amount_paid,
      normalized.due_date,
      normalized.paid_at,
      normalized.last_reconciled_at,
      normalized.description,
      normalized.created_by_profile_id,
      normalized.metadata,
      normalized.created_at,
      normalized.updated_at,
      normalized.deleted_at
    from normalized
  )
  insert into finance.financial_items (
    id,
    tenant_id,
    patient_id,
    enrollment_id,
    package_id,
    legacy_financial_item_id,
    reference_code,
    item_type,
    status,
    reconciliation_status,
    billing_model,
    currency_code,
    amount_total,
    amount_paid,
    due_date,
    paid_at,
    last_reconciled_at,
    description,
    created_by_profile_id,
    metadata,
    created_at,
    updated_at,
    deleted_at
  )
  select
    prepared.id,
    p_runtime_tenant_id,
    prepared.patient_id,
    prepared.enrollment_id,
    prepared.package_id,
    prepared.legacy_financial_item_id,
    prepared.reference_code,
    prepared.item_type,
    prepared.status,
    prepared.reconciliation_status,
    prepared.billing_model,
    prepared.currency_code,
    prepared.amount_total,
    prepared.amount_paid,
    prepared.due_date,
    prepared.paid_at,
    prepared.last_reconciled_at,
    prepared.description,
    prepared.created_by_profile_id,
    prepared.metadata,
    prepared.created_at,
    prepared.updated_at,
    prepared.deleted_at
  from prepared
  where nullif(trim(coalesce(prepared.legacy_financial_item_id, '')), '') is not null
    and prepared.patient_id is not null
  on conflict (legacy_financial_item_id) do update
  set
    tenant_id = excluded.tenant_id,
    patient_id = excluded.patient_id,
    enrollment_id = excluded.enrollment_id,
    package_id = excluded.package_id,
    reference_code = excluded.reference_code,
    item_type = excluded.item_type,
    status = excluded.status,
    reconciliation_status = excluded.reconciliation_status,
    billing_model = excluded.billing_model,
    currency_code = excluded.currency_code,
    amount_total = excluded.amount_total,
    amount_paid = excluded.amount_paid,
    due_date = excluded.due_date,
    paid_at = coalesce(excluded.paid_at, finance.financial_items.paid_at),
    last_reconciled_at = coalesce(excluded.last_reconciled_at, finance.financial_items.last_reconciled_at),
    description = excluded.description,
    created_by_profile_id = coalesce(excluded.created_by_profile_id, finance.financial_items.created_by_profile_id),
    metadata = coalesce(finance.financial_items.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = excluded.updated_at,
    deleted_at = excluded.deleted_at;

  get diagnostics v_financial_items_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_financial_item_events, '[]'::jsonb)) as x(
      id uuid,
      legacy_financial_event_id text,
      financial_item_reference text,
      patient_reference text,
      event_type text,
      previous_status text,
      current_status text,
      reconciliation_status text,
      amount numeric,
      event_at timestamptz,
      actor_type text,
      actor_profile_id uuid,
      notes text,
      payload jsonb,
      created_at timestamptz
    )
  ),
  resolved as (
    select
      coalesce(rows.id, gen_random_uuid()) as id,
      rows.legacy_financial_event_id,
      private.resolve_financial_item_id(p_runtime_tenant_id, rows.financial_item_reference) as financial_item_id,
      private.runtime_patient_id_from_reference(rows.patient_reference) as patient_id,
      case
        when lower(coalesce(rows.event_type, '')) in ('created', 'payment_recorded', 'reconciled', 'status_changed', 'canceled', 'refunded', 'written_off', 'note')
          then lower(rows.event_type)
        else 'note'
      end as event_type,
      rows.previous_status,
      rows.current_status,
      rows.reconciliation_status,
      case
        when rows.amount is null then null
        else greatest(rows.amount, 0::numeric)::numeric(12,2)
      end as amount,
      coalesce(rows.event_at, now()) as event_at,
      rows.actor_type,
      rows.actor_profile_id,
      rows.notes,
      coalesce(rows.payload, '{}'::jsonb) as payload,
      coalesce(rows.created_at, coalesce(rows.event_at, now()), now()) as created_at
    from rows
  )
  insert into finance.financial_item_events (
    id,
    tenant_id,
    financial_item_id,
    patient_id,
    legacy_financial_event_id,
    event_type,
    previous_status,
    current_status,
    reconciliation_status,
    amount,
    event_at,
    actor_type,
    actor_profile_id,
    notes,
    payload,
    created_at
  )
  select
    resolved.id,
    p_runtime_tenant_id,
    resolved.financial_item_id,
    resolved.patient_id,
    resolved.legacy_financial_event_id,
    resolved.event_type,
    resolved.previous_status,
    resolved.current_status,
    resolved.reconciliation_status,
    resolved.amount,
    resolved.event_at,
    resolved.actor_type,
    resolved.actor_profile_id,
    resolved.notes,
    resolved.payload,
    resolved.created_at
  from resolved
  where nullif(trim(coalesce(resolved.legacy_financial_event_id, '')), '') is not null
    and resolved.financial_item_id is not null
    and resolved.patient_id is not null
  on conflict (legacy_financial_event_id) do update
  set
    tenant_id = excluded.tenant_id,
    financial_item_id = excluded.financial_item_id,
    patient_id = excluded.patient_id,
    event_type = excluded.event_type,
    previous_status = excluded.previous_status,
    current_status = excluded.current_status,
    reconciliation_status = excluded.reconciliation_status,
    amount = excluded.amount,
    event_at = excluded.event_at,
    actor_type = excluded.actor_type,
    actor_profile_id = excluded.actor_profile_id,
    notes = excluded.notes,
    payload = coalesce(finance.financial_item_events.payload, '{}'::jsonb) || coalesce(excluded.payload, '{}'::jsonb),
    created_at = excluded.created_at;

  get diagnostics v_financial_item_events_count = row_count;

  return jsonb_build_object(
    'financialItems', v_financial_items_count,
    'financialItemEvents', v_financial_item_events_count
  );
end;
$$;

revoke all on function api.backfill_runtime_financial_domain(uuid, jsonb, jsonb)
  from public, anon, authenticated;

grant execute on function api.backfill_runtime_financial_domain(uuid, jsonb, jsonb)
  to service_role;

create or replace function api.record_financial_item(
  p_patient_id text,
  p_enrollment_id text default null,
  p_package_id text default null,
  p_item_type text default 'enrollment',
  p_reference_code text default null,
  p_description text default null,
  p_currency_code text default 'BRL',
  p_amount_total numeric default 0,
  p_due_date date default null,
  p_billing_model text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runtime_tenant_id uuid := private.current_tenant_id();
  v_runtime_patient_id uuid := private.runtime_patient_id_from_reference(p_patient_id);
  v_runtime_enrollment_id uuid := private.resolve_financial_enrollment_id(v_runtime_tenant_id, p_enrollment_id);
  v_runtime_package_id uuid := private.resolve_commercial_package_id(v_runtime_tenant_id, p_package_id);
  v_actor_profile_id uuid := private.current_profile_id();
  v_actor_type text := case when v_actor_profile_id is null then 'system' else 'profile' end;
  v_amount_total numeric(12,2) := greatest(coalesce(p_amount_total, 0::numeric), 0::numeric)::numeric(12,2);
  v_status text;
  v_reconciliation_status text;
  v_item finance.financial_items%rowtype;
begin
  if v_runtime_tenant_id is null
    or not private.can_manage_finance_domain(v_runtime_tenant_id) then
    raise exception 'financial item write denied';
  end if;

  if v_runtime_patient_id is null then
    raise exception 'patient not found';
  end if;

  if not private.can_access_finance_patient(v_runtime_patient_id) then
    raise exception 'patient finance access denied';
  end if;

  if nullif(trim(coalesce(p_enrollment_id, '')), '') is not null
    and v_runtime_enrollment_id is null then
    raise exception 'enrollment not found';
  end if;

  if nullif(trim(coalesce(p_package_id, '')), '') is not null
    and v_runtime_package_id is null then
    raise exception 'package not found';
  end if;

  v_status := private.normalize_financial_item_status(
    null,
    p_due_date,
    v_amount_total,
    0::numeric
  );

  v_reconciliation_status := private.normalize_financial_reconciliation_status(
    null,
    v_amount_total,
    0::numeric
  );

  insert into finance.financial_items (
    tenant_id,
    patient_id,
    enrollment_id,
    package_id,
    reference_code,
    item_type,
    status,
    reconciliation_status,
    billing_model,
    currency_code,
    amount_total,
    amount_paid,
    due_date,
    description,
    created_by_profile_id,
    metadata
  )
  values (
    v_runtime_tenant_id,
    v_runtime_patient_id,
    v_runtime_enrollment_id,
    v_runtime_package_id,
    nullif(trim(coalesce(p_reference_code, '')), ''),
    case
      when lower(coalesce(p_item_type, '')) in ('enrollment', 'renewal', 'upgrade', 'service', 'return', 'adjustment', 'other')
        then lower(p_item_type)
      else 'enrollment'
    end,
    v_status,
    v_reconciliation_status,
    case
      when lower(coalesce(p_billing_model, '')) in ('one_time', 'recurring', 'hybrid')
        then lower(p_billing_model)
      else null
    end,
    coalesce(nullif(trim(coalesce(p_currency_code, '')), ''), 'BRL'),
    v_amount_total,
    0::numeric(12,2),
    p_due_date,
    p_description,
    v_actor_profile_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning *
  into v_item;

  insert into finance.financial_item_events (
    tenant_id,
    financial_item_id,
    patient_id,
    event_type,
    current_status,
    reconciliation_status,
    amount,
    event_at,
    actor_type,
    actor_profile_id,
    notes,
    payload
  )
  values (
    v_runtime_tenant_id,
    v_item.id,
    v_runtime_patient_id,
    'created',
    v_item.status,
    v_item.reconciliation_status,
    v_item.amount_total,
    v_item.created_at,
    v_actor_type,
    v_actor_profile_id,
    v_item.description,
    jsonb_build_object(
      'referenceCode', v_item.reference_code,
      'itemType', v_item.item_type,
      'amountTotal', v_item.amount_total,
      'dueDate', v_item.due_date
    ) || coalesce(v_item.metadata, '{}'::jsonb)
  );

  perform private.record_audit_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => null,
    p_patient_id => v_runtime_patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => v_actor_profile_id,
    p_event_type => 'finance.financial_item_created',
    p_action => 'create',
    p_resource_schema => 'finance',
    p_resource_table => 'financial_items',
    p_resource_id => v_item.id,
    p_payload => jsonb_build_object(
      'referenceCode', v_item.reference_code,
      'itemType', v_item.item_type,
      'status', v_item.status,
      'reconciliationStatus', v_item.reconciliation_status,
      'amountTotal', v_item.amount_total,
      'dueDate', v_item.due_date
    ) || coalesce(v_item.metadata, '{}'::jsonb)
  );

  perform private.record_patient_timeline_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => null,
    p_patient_id => v_runtime_patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => v_actor_profile_id,
    p_event_type => 'financial_item_created',
    p_event_at => v_item.created_at,
    p_source_schema => 'finance',
    p_source_table => 'financial_items',
    p_source_id => v_item.id,
    p_payload => jsonb_build_object(
      'referenceCode', v_item.reference_code,
      'itemType', v_item.item_type,
      'amountTotal', v_item.amount_total,
      'dueDate', v_item.due_date,
      'status', v_item.status
    ) || coalesce(v_item.metadata, '{}'::jsonb)
  );

  return jsonb_build_object(
    'id', v_item.id::text,
    'status', v_item.status,
    'reconciliationStatus', v_item.reconciliation_status,
    'amountTotal', v_item.amount_total,
    'amountPaid', v_item.amount_paid,
    'outstandingAmount', private.finance_outstanding_amount(v_item.amount_total, v_item.amount_paid),
    'currencyCode', v_item.currency_code,
    'dueDate', v_item.due_date,
    'referenceCode', v_item.reference_code
  );
end;
$$;

revoke all on function api.record_financial_item(text, text, text, text, text, text, text, numeric, date, text, jsonb)
  from public, anon;

grant execute on function api.record_financial_item(text, text, text, text, text, text, text, numeric, date, text, jsonb)
  to authenticated, service_role;

create or replace function api.reconcile_financial_item(
  p_financial_item_id text,
  p_amount_paid numeric default null,
  p_paid_at timestamptz default now(),
  p_reconciliation_status text default 'reconciled',
  p_notes text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runtime_tenant_id uuid := private.current_tenant_id();
  v_actor_profile_id uuid := private.current_profile_id();
  v_actor_type text := case when v_actor_profile_id is null then 'system' else 'profile' end;
  v_runtime_financial_item_id uuid := private.resolve_financial_item_id(v_runtime_tenant_id, p_financial_item_id);
  v_item finance.financial_items%rowtype;
  v_previous_status text;
  v_previous_reconciliation_status text;
  v_previous_amount_paid numeric(12,2);
  v_new_amount_paid numeric(12,2);
  v_payment_delta numeric(12,2);
  v_status text;
  v_reconciliation_status text;
  v_event_type text;
begin
  if v_runtime_tenant_id is null
    or not private.can_manage_finance_domain(v_runtime_tenant_id) then
    raise exception 'financial item reconciliation denied';
  end if;

  if v_runtime_financial_item_id is null then
    raise exception 'financial item not found';
  end if;

  select *
  into v_item
  from finance.financial_items as items
  where items.id = v_runtime_financial_item_id
    and items.deleted_at is null;

  if not found then
    raise exception 'financial item not found';
  end if;

  if not private.can_access_finance_patient(v_item.patient_id) then
    raise exception 'patient finance access denied';
  end if;

  if p_amount_paid is not null
    and p_amount_paid < v_item.amount_paid then
    raise exception 'amount_paid cannot decrease';
  end if;

  v_previous_status := v_item.status;
  v_previous_reconciliation_status := v_item.reconciliation_status;
  v_previous_amount_paid := v_item.amount_paid;

  v_new_amount_paid := least(
    greatest(coalesce(p_amount_paid, v_item.amount_total), v_item.amount_paid),
    v_item.amount_total
  )::numeric(12,2);

  v_payment_delta := greatest(v_new_amount_paid - v_item.amount_paid, 0::numeric)::numeric(12,2);

  v_status := private.normalize_financial_item_status(
    v_item.status,
    v_item.due_date,
    v_item.amount_total,
    v_new_amount_paid
  );

  v_reconciliation_status := private.normalize_financial_reconciliation_status(
    p_reconciliation_status,
    v_item.amount_total,
    v_new_amount_paid
  );

  update finance.financial_items
  set
    amount_paid = v_new_amount_paid,
    status = v_status,
    reconciliation_status = v_reconciliation_status,
    paid_at = case
      when v_new_amount_paid > 0::numeric then coalesce(p_paid_at, finance.financial_items.paid_at, now())
      else finance.financial_items.paid_at
    end,
    last_reconciled_at = now(),
    metadata = coalesce(finance.financial_items.metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
    updated_at = now()
  where id = v_runtime_financial_item_id
  returning *
  into v_item;

  v_event_type := case
    when v_reconciliation_status = 'disputed' then 'status_changed'
    when v_new_amount_paid >= v_item.amount_total then 'reconciled'
    when v_payment_delta > 0::numeric then 'payment_recorded'
    else 'status_changed'
  end;

  insert into finance.financial_item_events (
    tenant_id,
    financial_item_id,
    patient_id,
    event_type,
    previous_status,
    current_status,
    reconciliation_status,
    amount,
    event_at,
    actor_type,
    actor_profile_id,
    notes,
    payload
  )
  values (
    v_runtime_tenant_id,
    v_item.id,
    v_item.patient_id,
    v_event_type,
    v_previous_status,
    v_item.status,
    v_item.reconciliation_status,
    nullif(v_payment_delta, 0::numeric),
    coalesce(p_paid_at, now()),
    v_actor_type,
    v_actor_profile_id,
    p_notes,
    jsonb_build_object(
      'previousAmountPaid', v_previous_amount_paid,
      'amountPaid', v_item.amount_paid,
      'outstandingAmount', private.finance_outstanding_amount(v_item.amount_total, v_item.amount_paid),
      'previousReconciliationStatus', v_previous_reconciliation_status,
      'reconciliationStatus', v_item.reconciliation_status
    ) || coalesce(p_metadata, '{}'::jsonb)
  );

  perform private.record_audit_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => null,
    p_patient_id => v_item.patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => v_actor_profile_id,
    p_event_type => 'finance.financial_item_reconciled',
    p_action => 'update',
    p_resource_schema => 'finance',
    p_resource_table => 'financial_items',
    p_resource_id => v_item.id,
    p_payload => jsonb_build_object(
      'previousStatus', v_previous_status,
      'status', v_item.status,
      'amountPaid', v_item.amount_paid,
      'outstandingAmount', private.finance_outstanding_amount(v_item.amount_total, v_item.amount_paid),
      'reconciliationStatus', v_item.reconciliation_status
    ) || coalesce(p_metadata, '{}'::jsonb)
  );

  perform private.record_patient_timeline_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => null,
    p_patient_id => v_item.patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => v_actor_profile_id,
    p_event_type => 'financial_item_reconciled',
    p_event_at => coalesce(p_paid_at, now()),
    p_source_schema => 'finance',
    p_source_table => 'financial_items',
    p_source_id => v_item.id,
    p_payload => jsonb_build_object(
      'amountPaid', v_item.amount_paid,
      'outstandingAmount', private.finance_outstanding_amount(v_item.amount_total, v_item.amount_paid),
      'status', v_item.status,
      'reconciliationStatus', v_item.reconciliation_status
    ) || coalesce(p_metadata, '{}'::jsonb)
  );

  return jsonb_build_object(
    'id', v_item.id::text,
    'status', v_item.status,
    'reconciliationStatus', v_item.reconciliation_status,
    'amountTotal', v_item.amount_total,
    'amountPaid', v_item.amount_paid,
    'outstandingAmount', private.finance_outstanding_amount(v_item.amount_total, v_item.amount_paid),
    'currencyCode', v_item.currency_code,
    'dueDate', v_item.due_date,
    'lastReconciledAt', v_item.last_reconciled_at
  );
end;
$$;

revoke all on function api.reconcile_financial_item(text, numeric, timestamptz, text, text, jsonb)
  from public, anon;

grant execute on function api.reconcile_financial_item(text, numeric, timestamptz, text, text, jsonb)
  to authenticated, service_role;

create or replace function api.patient_financial_summary(
  p_patient_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_runtime_patient_id uuid := private.runtime_patient_id_from_reference(p_patient_id);
begin
  if v_runtime_patient_id is null then
    return jsonb_build_object(
      'pendingCount', 0,
      'overdueCount', 0,
      'pendingAmount', 0,
      'overdueAmount', 0,
      'nextDueDate', null,
      'lastEventAt', null,
      'currencyCode', 'BRL'
    );
  end if;

  if not private.can_access_finance_patient(v_runtime_patient_id) then
    raise exception 'patient finance access denied';
  end if;

  return coalesce((
    with items as (
      select
        financial_items.currency_code,
        financial_items.due_date,
        financial_items.status,
        private.finance_outstanding_amount(
          financial_items.amount_total,
          financial_items.amount_paid
        ) as outstanding_amount
      from finance.financial_items as financial_items
      where financial_items.patient_id = v_runtime_patient_id
        and financial_items.deleted_at is null
        and financial_items.status not in ('canceled', 'refunded', 'written_off')
    ),
    classified as (
      select
        items.*,
        (
          items.outstanding_amount > 0::numeric
          and (
            items.status = 'overdue'
            or (
              items.status in ('draft', 'pending')
              and items.due_date is not null
              and items.due_date < current_date
            )
          )
        ) as is_overdue,
        (
          items.outstanding_amount > 0::numeric
          and not (
            items.outstanding_amount > 0::numeric
            and (
              items.status = 'overdue'
              or (
                items.status in ('draft', 'pending')
                and items.due_date is not null
                and items.due_date < current_date
              )
            )
          )
          and items.status in ('draft', 'pending', 'overdue')
        ) as is_pending
      from items
    )
    select jsonb_build_object(
      'pendingCount', coalesce(sum(case when classified.is_pending then 1 else 0 end), 0),
      'overdueCount', coalesce(sum(case when classified.is_overdue then 1 else 0 end), 0),
      'pendingAmount', coalesce(sum(case when classified.is_pending then classified.outstanding_amount else 0::numeric end), 0::numeric),
      'overdueAmount', coalesce(sum(case when classified.is_overdue then classified.outstanding_amount else 0::numeric end), 0::numeric),
      'nextDueDate', min(classified.due_date) filter (
        where classified.outstanding_amount > 0::numeric
          and classified.due_date is not null
      ),
      'lastEventAt', (
        select max(events.event_at)
        from finance.financial_item_events as events
        where events.patient_id = v_runtime_patient_id
      ),
      'currencyCode', coalesce(
        (
          select latest_items.currency_code
          from finance.financial_items as latest_items
          where latest_items.patient_id = v_runtime_patient_id
            and latest_items.deleted_at is null
          order by latest_items.updated_at desc, latest_items.created_at desc
          limit 1
        ),
        'BRL'
      )
    )
    from classified
  ), jsonb_build_object(
    'pendingCount', 0,
    'overdueCount', 0,
    'pendingAmount', 0,
    'overdueAmount', 0,
    'nextDueDate', null,
    'lastEventAt', null,
    'currencyCode', 'BRL'
  ));
end;
$$;

create or replace function api.patient_commercial_context(
  p_patient_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_runtime_patient_id uuid := private.runtime_patient_id_from_reference(p_patient_id);
  v_lead_context jsonb;
  v_enrollment_context jsonb;
begin
  if v_runtime_patient_id is null then
    return jsonb_build_object(
      'hasCommercialContext', false
    );
  end if;

  if not private.can_access_patient(v_runtime_patient_id) then
    raise exception 'patient access denied';
  end if;

  select jsonb_build_object(
    'leadId', coalesce(leads.legacy_lead_id, leads.id::text),
    'leadName', leads.full_name,
    'leadStatus', leads.status,
    'stageCode', coalesce(current_stage.code, private.crm_stage_code_from_status(leads.status)),
    'stageName', coalesce(
      current_stage.name,
      initcap(replace(private.crm_stage_code_from_status(leads.status), '_', ' '))
    ),
    'convertedAt', to_jsonb(conversions.created_at),
    'source', leads.source,
    'interestType', leads.interest_type,
    'lastCommercialTouchAt', to_jsonb(
      coalesce(latest_activity.created_at, conversions.created_at, leads.updated_at)
    )
  )
  into v_lead_context
  from commercial.conversions as conversions
  join commercial.leads as leads
    on leads.id = conversions.lead_id
  left join lateral (
    select
      stages.code,
      stages.name
    from commercial.lead_stage_history as history
    join commercial.pipeline_stages as stages
      on stages.id = history.stage_id
    where history.lead_id = leads.id
    order by history.changed_at desc, history.created_at desc
    limit 1
  ) as current_stage on true
  left join lateral (
    select activities.created_at
    from commercial.lead_activities as activities
    where activities.lead_id = leads.id
    order by activities.created_at desc
    limit 1
  ) as latest_activity on true
  where conversions.patient_id = v_runtime_patient_id
    and leads.deleted_at is null
  order by conversions.created_at desc
  limit 1;

  select jsonb_build_object(
    'enrollment', jsonb_build_object(
      'id', enrollments.id::text,
      'status', enrollments.enrollment_status,
      'startDate', enrollments.start_date,
      'endDate', enrollments.end_date,
      'enrolledAt', enrollments.enrolled_at,
      'activatedAt', enrollments.activated_at,
      'source', enrollments.source,
      'notes', enrollments.notes
    ),
    'program', case
      when programs.id is null then null
      else jsonb_build_object(
        'id', coalesce(programs.legacy_program_id, programs.id::text),
        'name', programs.name,
        'code', programs.code,
        'programType', programs.program_type,
        'durationDays', programs.duration_days
      )
    end,
    'package', case
      when packages.id is null then null
      else jsonb_build_object(
        'id', coalesce(packages.legacy_package_id, packages.id::text),
        'name', packages.name,
        'code', packages.code,
        'tier', packages.tier,
        'billingModel', packages.billing_model,
        'price', packages.price,
        'currencyCode', packages.currency_code
      )
    end,
    'entitlements', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', entitlements.id::text,
          'code', entitlements.code,
          'title', entitlements.title,
          'entitlementType', entitlements.entitlement_type,
          'balanceTotal', entitlements.balance_total,
          'balanceUsed', entitlements.balance_used,
          'balanceRemaining', greatest(entitlements.balance_total - entitlements.balance_used, 0),
          'active', entitlements.active,
          'serviceId', case
            when services.id is null then null
            else coalesce(services.legacy_service_id, services.id::text)
          end,
          'serviceName', services.name,
          'endsAt', entitlements.ends_at
        )
        order by entitlements.active desc, entitlements.code asc
      )
      from commercial.patient_entitlements as entitlements
      left join commercial.services as services
        on services.id = entitlements.service_id
      where entitlements.enrollment_id = enrollments.id
    ), '[]'::jsonb),
    'benefits', jsonb_build_object(
      'tier', coalesce(packages.tier, 'standard'),
      'allowsCommunity', coalesce((packages.metadata ->> 'allowsCommunity')::boolean, false),
      'chatPriority', coalesce((packages.metadata ->> 'chatPriority')::boolean, false)
    ),
    'vigency', jsonb_build_object(
      'startDate', enrollments.start_date,
      'endDate', enrollments.end_date,
      'renewalRisk', case
        when enrollments.end_date is null then 'none'
        when enrollments.end_date < current_date then 'expired'
        when enrollments.end_date <= current_date + 7 then 'high'
        when enrollments.end_date <= current_date + 21 then 'medium'
        else 'none'
      end
    ),
    'eligibility', jsonb_build_object(
      'hasActiveEnrollment', enrollments.enrollment_status in ('active', 'paused'),
      'hasCompletedPackage', exists (
        select 1
        from commercial.patient_program_enrollments as history
        where history.patient_id = enrollments.patient_id
          and history.deleted_at is null
          and history.enrollment_status = 'completed'
      ),
      'canRequestUpgrade', enrollments.enrollment_status in ('active', 'paused')
    ),
    'financialSummary', api.patient_financial_summary(v_runtime_patient_id::text)
  )
  into v_enrollment_context
  from commercial.patient_program_enrollments as enrollments
  left join commercial.programs as programs
    on programs.id = enrollments.program_id
  left join commercial.packages as packages
    on packages.id = enrollments.package_id
  where enrollments.patient_id = v_runtime_patient_id
    and enrollments.deleted_at is null
  order by
    case
      when enrollments.enrollment_status in ('active', 'paused') then 0
      when enrollments.enrollment_status = 'draft' then 1
      else 2
    end,
    enrollments.enrolled_at desc
  limit 1;

  if v_lead_context is null and v_enrollment_context is null then
    return jsonb_build_object(
      'hasCommercialContext', false
    );
  end if;

  return jsonb_build_object(
    'hasCommercialContext', true,
    'lead', coalesce(v_lead_context, 'null'::jsonb)
  ) || coalesce(v_enrollment_context, '{}'::jsonb);
end;
$$;

create or replace function public.backfill_runtime_financial_domain(
  p_runtime_tenant_id uuid,
  p_financial_items jsonb default '[]'::jsonb,
  p_financial_item_events jsonb default '[]'::jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.backfill_runtime_financial_domain(
    p_runtime_tenant_id,
    p_financial_items,
    p_financial_item_events
  )
$$;

create or replace function public.record_financial_item(
  p_patient_id text,
  p_enrollment_id text default null,
  p_package_id text default null,
  p_item_type text default 'enrollment',
  p_reference_code text default null,
  p_description text default null,
  p_currency_code text default 'BRL',
  p_amount_total numeric default 0,
  p_due_date date default null,
  p_billing_model text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.record_financial_item(
    p_patient_id,
    p_enrollment_id,
    p_package_id,
    p_item_type,
    p_reference_code,
    p_description,
    p_currency_code,
    p_amount_total,
    p_due_date,
    p_billing_model,
    p_metadata
  )
$$;

create or replace function public.reconcile_financial_item(
  p_financial_item_id text,
  p_amount_paid numeric default null,
  p_paid_at timestamptz default now(),
  p_reconciliation_status text default 'reconciled',
  p_notes text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.reconcile_financial_item(
    p_financial_item_id,
    p_amount_paid,
    p_paid_at,
    p_reconciliation_status,
    p_notes,
    p_metadata
  )
$$;

create or replace function public.patient_financial_summary(
  p_patient_id text
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select api.patient_financial_summary(p_patient_id)
$$;

revoke all on function public.backfill_runtime_financial_domain(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.record_financial_item(text, text, text, text, text, text, text, numeric, date, text, jsonb) from public, anon;
revoke all on function public.reconcile_financial_item(text, numeric, timestamptz, text, text, jsonb) from public, anon;
revoke all on function public.patient_financial_summary(text) from public, anon;
revoke all on function api.patient_financial_summary(text) from public, anon;

grant execute on function public.backfill_runtime_financial_domain(uuid, jsonb, jsonb)
  to service_role;
grant execute on function public.record_financial_item(text, text, text, text, text, text, text, numeric, date, text, jsonb)
  to authenticated, service_role;
grant execute on function public.reconcile_financial_item(text, numeric, timestamptz, text, text, jsonb)
  to authenticated, service_role;
grant execute on function public.patient_financial_summary(text)
  to authenticated, service_role;
grant execute on function api.patient_financial_summary(text)
  to authenticated, service_role;
