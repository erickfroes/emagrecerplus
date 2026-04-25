create table if not exists commercial.patient_program_enrollments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  patient_id uuid not null references patients.patients (id) on delete cascade,
  program_id uuid references commercial.programs (id) on delete set null,
  package_id uuid references commercial.packages (id) on delete set null,
  legacy_enrollment_id text,
  enrollment_status text not null default 'active' check (
    enrollment_status in ('draft', 'active', 'paused', 'completed', 'canceled', 'superseded')
  ),
  start_date date,
  end_date date,
  enrolled_at timestamptz not null default now(),
  activated_at timestamptz,
  completed_at timestamptz,
  canceled_at timestamptz,
  source text,
  notes text,
  created_by_profile_id uuid references identity.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists commercial.patient_entitlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  patient_id uuid not null references patients.patients (id) on delete cascade,
  enrollment_id uuid not null references commercial.patient_program_enrollments (id) on delete cascade,
  package_id uuid references commercial.packages (id) on delete set null,
  service_id uuid references commercial.services (id) on delete set null,
  legacy_entitlement_id text,
  entitlement_type text not null default 'service' check (
    entitlement_type in ('service', 'feature')
  ),
  code text not null,
  title text not null,
  balance_total integer not null default 0 check (balance_total >= 0),
  balance_used integer not null default 0 check (balance_used >= 0 and balance_used <= balance_total),
  active boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_commercial_patient_program_enrollments_legacy_id
  on commercial.patient_program_enrollments (legacy_enrollment_id)
  where legacy_enrollment_id is not null;

create index if not exists idx_commercial_patient_program_enrollments_patient_status
  on commercial.patient_program_enrollments (patient_id, enrollment_status, enrolled_at desc)
  where deleted_at is null;

create unique index if not exists idx_commercial_patient_program_enrollments_single_current
  on commercial.patient_program_enrollments (patient_id)
  where deleted_at is null and enrollment_status in ('draft', 'active', 'paused');

create unique index if not exists idx_commercial_patient_entitlements_legacy_id
  on commercial.patient_entitlements (legacy_entitlement_id)
  where legacy_entitlement_id is not null;

create unique index if not exists idx_commercial_patient_entitlements_enrollment_code
  on commercial.patient_entitlements (enrollment_id, code);

create index if not exists idx_commercial_patient_entitlements_patient_active
  on commercial.patient_entitlements (patient_id, active, starts_at desc);

drop trigger if exists set_commercial_patient_program_enrollments_updated_at on commercial.patient_program_enrollments;
create trigger set_commercial_patient_program_enrollments_updated_at
before update on commercial.patient_program_enrollments
for each row execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_commercial_patient_entitlements_updated_at on commercial.patient_entitlements;
create trigger set_commercial_patient_entitlements_updated_at
before update on commercial.patient_entitlements
for each row execute function private.set_current_timestamp_updated_at();

grant all on table commercial.patient_program_enrollments to service_role;
grant all on table commercial.patient_entitlements to service_role;

alter table commercial.patient_program_enrollments enable row level security;
alter table commercial.patient_entitlements enable row level security;

drop policy if exists commercial_patient_program_enrollments_select_current_scope on commercial.patient_program_enrollments;
create policy commercial_patient_program_enrollments_select_current_scope
on commercial.patient_program_enrollments
for select
using (private.can_read_commercial_domain(tenant_id) and private.can_access_patient(patient_id));

drop policy if exists commercial_patient_program_enrollments_manage_current_scope on commercial.patient_program_enrollments;
create policy commercial_patient_program_enrollments_manage_current_scope
on commercial.patient_program_enrollments
for all
using (private.can_manage_commercial_domain(tenant_id) and private.can_access_patient(patient_id))
with check (private.can_manage_commercial_domain(tenant_id) and private.can_access_patient(patient_id));

drop policy if exists commercial_patient_entitlements_select_current_scope on commercial.patient_entitlements;
create policy commercial_patient_entitlements_select_current_scope
on commercial.patient_entitlements
for select
using (private.can_read_commercial_domain(tenant_id) and private.can_access_patient(patient_id));

drop policy if exists commercial_patient_entitlements_manage_current_scope on commercial.patient_entitlements;
create policy commercial_patient_entitlements_manage_current_scope
on commercial.patient_entitlements
for all
using (private.can_manage_commercial_domain(tenant_id) and private.can_access_patient(patient_id))
with check (private.can_manage_commercial_domain(tenant_id) and private.can_access_patient(patient_id));

create or replace function private.resolve_commercial_program_id(
  p_runtime_tenant_id uuid,
  p_program_ref text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select programs.id
  from commercial.programs as programs
  where programs.tenant_id = p_runtime_tenant_id
    and programs.deleted_at is null
    and (
      programs.id::text = p_program_ref
      or programs.legacy_program_id = p_program_ref
      or programs.code = p_program_ref
    )
  order by
    case
      when programs.id::text = p_program_ref then 0
      when programs.legacy_program_id = p_program_ref then 1
      else 2
    end
  limit 1
$$;

create or replace function private.resolve_commercial_package_id(
  p_runtime_tenant_id uuid,
  p_package_ref text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select packages.id
  from commercial.packages as packages
  where packages.tenant_id = p_runtime_tenant_id
    and packages.deleted_at is null
    and (
      packages.id::text = p_package_ref
      or packages.legacy_package_id = p_package_ref
      or packages.code = p_package_ref
    )
  order by
    case
      when packages.id::text = p_package_ref then 0
      when packages.legacy_package_id = p_package_ref then 1
      else 2
    end
  limit 1
$$;

revoke all on function private.resolve_commercial_program_id(uuid, text) from public, anon, authenticated;
revoke all on function private.resolve_commercial_package_id(uuid, text) from public, anon, authenticated;

grant execute on function private.resolve_commercial_program_id(uuid, text) to authenticated, service_role;
grant execute on function private.resolve_commercial_package_id(uuid, text) to authenticated, service_role;

create or replace function api.backfill_runtime_commercial_patient_enrollments(
  p_runtime_tenant_id uuid,
  p_enrollments jsonb default '[]'::jsonb,
  p_entitlements jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enrollments_count integer := 0;
  v_entitlements_count integer := 0;
begin
  if p_runtime_tenant_id is null then
    raise exception 'p_runtime_tenant_id is required';
  end if;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_enrollments, '[]'::jsonb)) as x(
      id uuid,
      legacy_enrollment_id text,
      legacy_patient_id text,
      legacy_program_id text,
      legacy_package_id text,
      enrollment_status text,
      start_date date,
      end_date date,
      enrolled_at timestamptz,
      activated_at timestamptz,
      completed_at timestamptz,
      canceled_at timestamptz,
      source text,
      notes text,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz,
      deleted_at timestamptz
    )
  ),
  resolved as (
    select
      coalesce(rows.id, gen_random_uuid()) as id,
      rows.legacy_enrollment_id,
      private.runtime_patient_id_by_legacy_patient_id(p_runtime_tenant_id, rows.legacy_patient_id) as patient_id,
      private.runtime_program_id_by_legacy_program_id(p_runtime_tenant_id, rows.legacy_program_id) as program_id,
      private.runtime_package_id_by_legacy_package_id(p_runtime_tenant_id, rows.legacy_package_id) as package_id,
      coalesce(rows.enrollment_status, 'active') as enrollment_status,
      rows.start_date,
      rows.end_date,
      coalesce(rows.enrolled_at, now()) as enrolled_at,
      rows.activated_at,
      rows.completed_at,
      rows.canceled_at,
      rows.source,
      rows.notes,
      coalesce(rows.metadata, '{}'::jsonb) as metadata,
      coalesce(rows.created_at, now()) as created_at,
      coalesce(rows.updated_at, coalesce(rows.created_at, now())) as updated_at,
      rows.deleted_at
    from rows
  )
  insert into commercial.patient_program_enrollments (
    id,
    tenant_id,
    patient_id,
    program_id,
    package_id,
    legacy_enrollment_id,
    enrollment_status,
    start_date,
    end_date,
    enrolled_at,
    activated_at,
    completed_at,
    canceled_at,
    source,
    notes,
    metadata,
    created_at,
    updated_at,
    deleted_at
  )
  select
    resolved.id,
    p_runtime_tenant_id,
    resolved.patient_id,
    resolved.program_id,
    resolved.package_id,
    resolved.legacy_enrollment_id,
    resolved.enrollment_status,
    resolved.start_date,
    resolved.end_date,
    resolved.enrolled_at,
    resolved.activated_at,
    resolved.completed_at,
    resolved.canceled_at,
    resolved.source,
    resolved.notes,
    resolved.metadata,
    resolved.created_at,
    resolved.updated_at,
    resolved.deleted_at
  from resolved
  where nullif(trim(coalesce(resolved.legacy_enrollment_id, '')), '') is not null
    and resolved.patient_id is not null
  on conflict (legacy_enrollment_id) do update
  set
    tenant_id = excluded.tenant_id,
    patient_id = excluded.patient_id,
    program_id = excluded.program_id,
    package_id = excluded.package_id,
    enrollment_status = excluded.enrollment_status,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    enrolled_at = excluded.enrolled_at,
    activated_at = excluded.activated_at,
    completed_at = excluded.completed_at,
    canceled_at = excluded.canceled_at,
    source = excluded.source,
    notes = excluded.notes,
    metadata = coalesce(commercial.patient_program_enrollments.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = excluded.updated_at,
    deleted_at = excluded.deleted_at;

  get diagnostics v_enrollments_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_entitlements, '[]'::jsonb)) as x(
      id uuid,
      legacy_entitlement_id text,
      legacy_enrollment_id text,
      legacy_patient_id text,
      legacy_package_id text,
      legacy_service_id text,
      entitlement_type text,
      code text,
      title text,
      balance_total integer,
      balance_used integer,
      active boolean,
      starts_at timestamptz,
      ends_at timestamptz,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz
    )
  ),
  resolved as (
    select
      coalesce(rows.id, gen_random_uuid()) as id,
      rows.legacy_entitlement_id,
      enrollments.id as enrollment_id,
      private.runtime_patient_id_by_legacy_patient_id(p_runtime_tenant_id, rows.legacy_patient_id) as patient_id,
      private.runtime_package_id_by_legacy_package_id(p_runtime_tenant_id, rows.legacy_package_id) as package_id,
      private.runtime_service_id_by_legacy_service_id(p_runtime_tenant_id, rows.legacy_service_id) as service_id,
      coalesce(rows.entitlement_type, 'service') as entitlement_type,
      rows.code,
      rows.title,
      greatest(coalesce(rows.balance_total, 0), 0) as balance_total,
      greatest(coalesce(rows.balance_used, 0), 0) as balance_used,
      coalesce(rows.active, true) as active,
      coalesce(rows.starts_at, now()) as starts_at,
      rows.ends_at,
      coalesce(rows.metadata, '{}'::jsonb) as metadata,
      coalesce(rows.created_at, now()) as created_at,
      coalesce(rows.updated_at, coalesce(rows.created_at, now())) as updated_at
    from rows
    left join commercial.patient_program_enrollments as enrollments
      on enrollments.tenant_id = p_runtime_tenant_id
     and enrollments.legacy_enrollment_id = rows.legacy_enrollment_id
  )
  insert into commercial.patient_entitlements (
    id,
    tenant_id,
    patient_id,
    enrollment_id,
    package_id,
    service_id,
    legacy_entitlement_id,
    entitlement_type,
    code,
    title,
    balance_total,
    balance_used,
    active,
    starts_at,
    ends_at,
    metadata,
    created_at,
    updated_at
  )
  select
    resolved.id,
    p_runtime_tenant_id,
    resolved.patient_id,
    resolved.enrollment_id,
    resolved.package_id,
    resolved.service_id,
    resolved.legacy_entitlement_id,
    resolved.entitlement_type,
    resolved.code,
    resolved.title,
    resolved.balance_total,
    least(resolved.balance_used, resolved.balance_total),
    resolved.active,
    resolved.starts_at,
    resolved.ends_at,
    resolved.metadata,
    resolved.created_at,
    resolved.updated_at
  from resolved
  where nullif(trim(coalesce(resolved.legacy_entitlement_id, '')), '') is not null
    and resolved.enrollment_id is not null
    and resolved.patient_id is not null
    and nullif(trim(coalesce(resolved.code, '')), '') is not null
    and nullif(trim(coalesce(resolved.title, '')), '') is not null
  on conflict (legacy_entitlement_id) do update
  set
    tenant_id = excluded.tenant_id,
    patient_id = excluded.patient_id,
    enrollment_id = excluded.enrollment_id,
    package_id = excluded.package_id,
    service_id = excluded.service_id,
    entitlement_type = excluded.entitlement_type,
    code = excluded.code,
    title = excluded.title,
    balance_total = excluded.balance_total,
    balance_used = excluded.balance_used,
    active = excluded.active,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    metadata = coalesce(commercial.patient_entitlements.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = excluded.updated_at;

  get diagnostics v_entitlements_count = row_count;

  return jsonb_build_object(
    'enrollments', v_enrollments_count,
    'entitlements', v_entitlements_count
  );
end;
$$;

revoke all on function api.backfill_runtime_commercial_patient_enrollments(uuid, jsonb, jsonb)
  from public, anon, authenticated;

grant execute on function api.backfill_runtime_commercial_patient_enrollments(uuid, jsonb, jsonb)
  to service_role;

create or replace function api.enroll_patient_program(
  p_patient_id text,
  p_program_id text,
  p_package_id text,
  p_start_date date default null,
  p_end_date date default null,
  p_enrollment_status text default 'active',
  p_source text default null,
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
  v_runtime_patient_id uuid := private.runtime_patient_id_from_reference(p_patient_id);
  v_runtime_program_id uuid := private.resolve_commercial_program_id(v_runtime_tenant_id, p_program_id);
  v_runtime_package_id uuid := private.resolve_commercial_package_id(v_runtime_tenant_id, p_package_id);
  v_actor_profile_id uuid := case when coalesce(auth.role(), '') = 'service_role' then null else private.current_profile_id() end;
  v_actor_type text := case when coalesce(auth.role(), '') = 'service_role' then 'service_role' else 'profile' end;
  v_enrollment_id uuid;
  v_enrolled_at timestamptz := now();
begin
  if v_runtime_tenant_id is null then
    raise exception 'current tenant not resolved';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not private.can_manage_commercial_domain(v_runtime_tenant_id) then
    raise exception 'commercial enrollment denied';
  end if;

  if v_runtime_patient_id is null or not private.can_access_patient(v_runtime_patient_id) then
    raise exception 'patient access denied';
  end if;

  if v_runtime_program_id is null then
    raise exception 'program not found for reference %', p_program_id;
  end if;

  if v_runtime_package_id is null then
    raise exception 'package not found for reference %', p_package_id;
  end if;

  if not exists (
    select 1
    from commercial.program_packages as program_packages
    where program_packages.tenant_id = v_runtime_tenant_id
      and program_packages.program_id = v_runtime_program_id
      and program_packages.package_id = v_runtime_package_id
  ) then
    raise exception 'package % is not linked to program %', p_package_id, p_program_id;
  end if;

  update commercial.patient_program_enrollments
  set
    enrollment_status = 'superseded',
    completed_at = coalesce(completed_at, v_enrolled_at),
    updated_at = now()
  where tenant_id = v_runtime_tenant_id
    and patient_id = v_runtime_patient_id
    and deleted_at is null
    and enrollment_status in ('draft', 'active', 'paused');

  insert into commercial.patient_program_enrollments (
    tenant_id,
    patient_id,
    program_id,
    package_id,
    enrollment_status,
    start_date,
    end_date,
    enrolled_at,
    activated_at,
    source,
    notes,
    created_by_profile_id,
    metadata
  )
  values (
    v_runtime_tenant_id,
    v_runtime_patient_id,
    v_runtime_program_id,
    v_runtime_package_id,
    coalesce(p_enrollment_status, 'active'),
    p_start_date,
    p_end_date,
    v_enrolled_at,
    case when coalesce(p_enrollment_status, 'active') = 'active' then v_enrolled_at else null end,
    p_source,
    p_notes,
    v_actor_profile_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_enrollment_id;

  insert into commercial.patient_entitlements (
    tenant_id,
    patient_id,
    enrollment_id,
    package_id,
    service_id,
    entitlement_type,
    code,
    title,
    balance_total,
    balance_used,
    active,
    starts_at,
    ends_at,
    metadata
  )
  select
    v_runtime_tenant_id,
    v_runtime_patient_id,
    v_enrollment_id,
    v_runtime_package_id,
    services.id,
    'service',
    'service:' || services.code,
    services.name,
    package_services.quantity,
    0,
    true,
    coalesce(p_start_date::timestamptz, v_enrolled_at),
    p_end_date::timestamptz,
    jsonb_build_object(
      'required', package_services.required,
      'notes', package_services.notes,
      'itemPriceOverride', package_services.item_price_override
    )
  from commercial.package_services as package_services
  join commercial.services as services
    on services.id = package_services.service_id
  where package_services.package_id = v_runtime_package_id
    and package_services.tenant_id = v_runtime_tenant_id;

  perform private.record_audit_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => null,
    p_patient_id => v_runtime_patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => v_actor_profile_id,
    p_event_type => 'commercial.patient_enrollment_created',
    p_action => 'enroll_patient_program',
    p_resource_schema => 'commercial',
    p_resource_table => 'patient_program_enrollments',
    p_resource_id => v_enrollment_id,
    p_payload => jsonb_build_object(
      'programId', p_program_id,
      'packageId', p_package_id,
      'enrollmentStatus', coalesce(p_enrollment_status, 'active'),
      'startDate', p_start_date,
      'endDate', p_end_date
    ) || coalesce(p_metadata, '{}'::jsonb)
  );

  perform private.record_patient_timeline_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => null,
    p_patient_id => v_runtime_patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => v_actor_profile_id,
    p_event_type => 'commercial_enrollment_created',
    p_event_at => v_enrolled_at,
    p_source_schema => 'commercial',
    p_source_table => 'patient_program_enrollments',
    p_source_id => v_enrollment_id,
    p_payload => jsonb_build_object(
      'programId', p_program_id,
      'packageId', p_package_id,
      'enrollmentStatus', coalesce(p_enrollment_status, 'active'),
      'startDate', p_start_date,
      'endDate', p_end_date
    ) || coalesce(p_metadata, '{}'::jsonb)
  );

  return api.patient_commercial_context(p_patient_id);
end;
$$;

revoke all on function api.enroll_patient_program(text, text, text, date, date, text, text, text, jsonb)
  from public, anon;

grant execute on function api.enroll_patient_program(text, text, text, date, date, text, text, text, jsonb)
  to authenticated, service_role;

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
    'financialSummary', jsonb_build_object(
      'pendingCount', 0,
      'overdueCount', 0
    )
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

create or replace function public.backfill_runtime_commercial_patient_enrollments(
  p_runtime_tenant_id uuid,
  p_enrollments jsonb default '[]'::jsonb,
  p_entitlements jsonb default '[]'::jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.backfill_runtime_commercial_patient_enrollments(
    p_runtime_tenant_id,
    p_enrollments,
    p_entitlements
  )
$$;

create or replace function public.enroll_patient_program(
  p_patient_id text,
  p_program_id text,
  p_package_id text,
  p_start_date date default null,
  p_end_date date default null,
  p_enrollment_status text default 'active',
  p_source text default null,
  p_notes text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.enroll_patient_program(
    p_patient_id,
    p_program_id,
    p_package_id,
    p_start_date,
    p_end_date,
    p_enrollment_status,
    p_source,
    p_notes,
    p_metadata
  )
$$;

create or replace function public.patient_commercial_context(
  p_patient_id text
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select api.patient_commercial_context(p_patient_id)
$$;

revoke all on function public.backfill_runtime_commercial_patient_enrollments(uuid, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.enroll_patient_program(text, text, text, date, date, text, text, text, jsonb)
  from public, anon;
revoke all on function public.patient_commercial_context(text) from public, anon;
revoke all on function api.patient_commercial_context(text) from public, anon;

grant execute on function public.backfill_runtime_commercial_patient_enrollments(uuid, jsonb, jsonb)
  to service_role;
grant execute on function public.enroll_patient_program(text, text, text, date, date, text, text, text, jsonb)
  to authenticated, service_role;
grant execute on function public.patient_commercial_context(text)
  to authenticated, service_role;
grant execute on function api.patient_commercial_context(text)
  to authenticated, service_role;
