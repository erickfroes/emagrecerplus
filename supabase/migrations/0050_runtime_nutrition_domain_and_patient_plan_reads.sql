create table if not exists clinical.nutrition_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  patient_id uuid not null references patients.patients (id) on delete cascade,
  medical_record_id uuid references clinical.medical_records (id) on delete set null,
  legacy_nutrition_plan_id text,
  current_version_id uuid,
  plan_status text not null default 'active' check (
    plan_status in ('draft', 'active', 'paused', 'completed', 'archived')
  ),
  plan_name text not null,
  summary text,
  starts_at date,
  ends_at date,
  authored_by_profile_id uuid references identity.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists clinical.nutrition_plan_versions (
  id uuid primary key default gen_random_uuid(),
  nutrition_plan_id uuid not null references clinical.nutrition_plans (id) on delete cascade,
  legacy_nutrition_version_id text,
  version_number integer not null check (version_number > 0),
  version_status text not null default 'draft' check (
    version_status in ('draft', 'published', 'superseded', 'archived')
  ),
  title text not null,
  summary text,
  guidance text,
  meal_goal_daily integer check (meal_goal_daily is null or meal_goal_daily > 0),
  water_goal_ml integer check (water_goal_ml is null or water_goal_ml > 0),
  effective_from date not null default current_date,
  effective_to date,
  published_at timestamptz,
  authored_by_profile_id uuid references identity.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nutrition_plan_versions_effective_window check (
    effective_to is null or effective_to >= effective_from
  )
);

create table if not exists clinical.nutrition_targets (
  id uuid primary key default gen_random_uuid(),
  nutrition_plan_version_id uuid not null references clinical.nutrition_plan_versions (id) on delete cascade,
  legacy_target_id text,
  target_type text not null default 'behavior' check (
    target_type in ('meal', 'macro', 'hydration', 'behavior', 'supplement', 'other')
  ),
  code text,
  label text not null,
  goal_value numeric(12,2),
  unit text,
  period text not null default 'day' check (
    period in ('day', 'week', 'meal', 'custom')
  ),
  meal_type text,
  guidance text,
  position integer not null default 1 check (position > 0),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table clinical.nutrition_plans
  drop constraint if exists nutrition_plans_current_version_id_fkey;

alter table clinical.nutrition_plans
  add constraint nutrition_plans_current_version_id_fkey
  foreign key (current_version_id)
  references clinical.nutrition_plan_versions (id)
  on delete set null;

alter table clinical.meal_logs
  add column if not exists nutrition_plan_version_id uuid references clinical.nutrition_plan_versions (id) on delete set null;

create unique index if not exists idx_clinical_nutrition_plans_legacy_id
  on clinical.nutrition_plans (legacy_nutrition_plan_id)
  where legacy_nutrition_plan_id is not null;

create unique index if not exists idx_clinical_nutrition_plans_patient_single_current
  on clinical.nutrition_plans (patient_id)
  where deleted_at is null
    and plan_status in ('draft', 'active', 'paused');

create index if not exists idx_clinical_nutrition_plans_patient_status_window
  on clinical.nutrition_plans (patient_id, plan_status, starts_at desc nulls last, created_at desc)
  where deleted_at is null;

create unique index if not exists idx_clinical_nutrition_plan_versions_legacy_id
  on clinical.nutrition_plan_versions (legacy_nutrition_version_id)
  where legacy_nutrition_version_id is not null;

create unique index if not exists idx_clinical_nutrition_plan_versions_unique_number
  on clinical.nutrition_plan_versions (nutrition_plan_id, version_number);

create index if not exists idx_clinical_nutrition_plan_versions_current_window
  on clinical.nutrition_plan_versions (
    nutrition_plan_id,
    version_status,
    effective_from desc,
    effective_to asc nulls last,
    version_number desc
  );

create unique index if not exists idx_clinical_nutrition_targets_legacy_id
  on clinical.nutrition_targets (legacy_target_id)
  where legacy_target_id is not null;

create index if not exists idx_clinical_nutrition_targets_version_position
  on clinical.nutrition_targets (nutrition_plan_version_id, active desc, position asc, created_at asc);

create index if not exists idx_clinical_meal_logs_patient_plan_version_logged_at
  on clinical.meal_logs (patient_id, nutrition_plan_version_id, logged_at desc)
  where nutrition_plan_version_id is not null;

drop trigger if exists set_clinical_nutrition_plans_updated_at on clinical.nutrition_plans;
create trigger set_clinical_nutrition_plans_updated_at
before update on clinical.nutrition_plans
for each row execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_clinical_nutrition_plan_versions_updated_at on clinical.nutrition_plan_versions;
create trigger set_clinical_nutrition_plan_versions_updated_at
before update on clinical.nutrition_plan_versions
for each row execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_clinical_nutrition_targets_updated_at on clinical.nutrition_targets;
create trigger set_clinical_nutrition_targets_updated_at
before update on clinical.nutrition_targets
for each row execute function private.set_current_timestamp_updated_at();

grant select, insert, update, delete on table
  clinical.nutrition_plans,
  clinical.nutrition_plan_versions,
  clinical.nutrition_targets
to authenticated, service_role;

alter table clinical.nutrition_plans enable row level security;
alter table clinical.nutrition_plan_versions enable row level security;
alter table clinical.nutrition_targets enable row level security;

drop policy if exists nutrition_plans_select_current_scope on clinical.nutrition_plans;
create policy nutrition_plans_select_current_scope
on clinical.nutrition_plans
for select
using (
  private.can_read_clinical_domain(tenant_id, null)
  and private.can_access_patient(patient_id)
);

drop policy if exists nutrition_plans_manage_current_scope on clinical.nutrition_plans;
create policy nutrition_plans_manage_current_scope
on clinical.nutrition_plans
for all
using (
  private.can_manage_clinical_domain(tenant_id, null)
  and private.can_access_patient(patient_id)
)
with check (
  private.can_manage_clinical_domain(tenant_id, null)
  and private.can_access_patient(patient_id)
);

drop policy if exists nutrition_plan_versions_select_current_scope on clinical.nutrition_plan_versions;
create policy nutrition_plan_versions_select_current_scope
on clinical.nutrition_plan_versions
for select
using (
  exists (
    select 1
    from clinical.nutrition_plans as nutrition_plans
    where nutrition_plans.id = nutrition_plan_versions.nutrition_plan_id
      and private.can_read_clinical_domain(nutrition_plans.tenant_id, null)
      and private.can_access_patient(nutrition_plans.patient_id)
  )
);

drop policy if exists nutrition_plan_versions_manage_current_scope on clinical.nutrition_plan_versions;
create policy nutrition_plan_versions_manage_current_scope
on clinical.nutrition_plan_versions
for all
using (
  exists (
    select 1
    from clinical.nutrition_plans as nutrition_plans
    where nutrition_plans.id = nutrition_plan_versions.nutrition_plan_id
      and private.can_manage_clinical_domain(nutrition_plans.tenant_id, null)
      and private.can_access_patient(nutrition_plans.patient_id)
  )
)
with check (
  exists (
    select 1
    from clinical.nutrition_plans as nutrition_plans
    where nutrition_plans.id = nutrition_plan_versions.nutrition_plan_id
      and private.can_manage_clinical_domain(nutrition_plans.tenant_id, null)
      and private.can_access_patient(nutrition_plans.patient_id)
  )
);

drop policy if exists nutrition_targets_select_current_scope on clinical.nutrition_targets;
create policy nutrition_targets_select_current_scope
on clinical.nutrition_targets
for select
using (
  exists (
    select 1
    from clinical.nutrition_plan_versions as nutrition_plan_versions
    inner join clinical.nutrition_plans as nutrition_plans
      on nutrition_plans.id = nutrition_plan_versions.nutrition_plan_id
    where nutrition_plan_versions.id = nutrition_targets.nutrition_plan_version_id
      and private.can_read_clinical_domain(nutrition_plans.tenant_id, null)
      and private.can_access_patient(nutrition_plans.patient_id)
  )
);

drop policy if exists nutrition_targets_manage_current_scope on clinical.nutrition_targets;
create policy nutrition_targets_manage_current_scope
on clinical.nutrition_targets
for all
using (
  exists (
    select 1
    from clinical.nutrition_plan_versions as nutrition_plan_versions
    inner join clinical.nutrition_plans as nutrition_plans
      on nutrition_plans.id = nutrition_plan_versions.nutrition_plan_id
    where nutrition_plan_versions.id = nutrition_targets.nutrition_plan_version_id
      and private.can_manage_clinical_domain(nutrition_plans.tenant_id, null)
      and private.can_access_patient(nutrition_plans.patient_id)
  )
)
with check (
  exists (
    select 1
    from clinical.nutrition_plan_versions as nutrition_plan_versions
    inner join clinical.nutrition_plans as nutrition_plans
      on nutrition_plans.id = nutrition_plan_versions.nutrition_plan_id
    where nutrition_plan_versions.id = nutrition_targets.nutrition_plan_version_id
      and private.can_manage_clinical_domain(nutrition_plans.tenant_id, null)
      and private.can_access_patient(nutrition_plans.patient_id)
  )
);

create or replace function private.runtime_nutrition_plan_id_from_reference(
  p_plan_reference text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select nutrition_plans.id
  from clinical.nutrition_plans as nutrition_plans
  where nutrition_plans.deleted_at is null
    and (
      nutrition_plans.id::text = p_plan_reference
      or nutrition_plans.legacy_nutrition_plan_id = p_plan_reference
    )
  order by
    case
      when nutrition_plans.id::text = p_plan_reference then 0
      else 1
    end
  limit 1
$$;

create or replace function private.runtime_nutrition_plan_version_id_from_reference(
  p_version_reference text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select nutrition_plan_versions.id
  from clinical.nutrition_plan_versions as nutrition_plan_versions
  where
    nutrition_plan_versions.id::text = p_version_reference
    or nutrition_plan_versions.legacy_nutrition_version_id = p_version_reference
  order by
    case
      when nutrition_plan_versions.id::text = p_version_reference then 0
      else 1
    end
  limit 1
$$;

create or replace function private.patient_current_nutrition_plan_id(
  p_runtime_patient_id uuid,
  p_reference_date date default current_date
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select nutrition_plans.id
  from clinical.nutrition_plans as nutrition_plans
  where nutrition_plans.patient_id = p_runtime_patient_id
    and nutrition_plans.deleted_at is null
    and nutrition_plans.plan_status in ('active', 'paused', 'draft')
    and (
      nutrition_plans.starts_at is null
      or nutrition_plans.starts_at <= coalesce(p_reference_date, current_date)
    )
    and (
      nutrition_plans.ends_at is null
      or nutrition_plans.ends_at >= coalesce(p_reference_date, current_date)
      or nutrition_plans.plan_status = 'draft'
    )
  order by
    case nutrition_plans.plan_status
      when 'active' then 0
      when 'paused' then 1
      when 'draft' then 2
      else 3
    end,
    nutrition_plans.starts_at desc nulls last,
    nutrition_plans.updated_at desc,
    nutrition_plans.created_at desc
  limit 1
$$;

create or replace function private.refresh_nutrition_plan_current_version(
  p_nutrition_plan_id uuid,
  p_reference_date date default current_date
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reference_date date := coalesce(p_reference_date, current_date);
  v_current_version_id uuid;
begin
  if p_nutrition_plan_id is null then
    return null;
  end if;

  select nutrition_plan_versions.id
  into v_current_version_id
  from clinical.nutrition_plan_versions as nutrition_plan_versions
  where nutrition_plan_versions.nutrition_plan_id = p_nutrition_plan_id
    and nutrition_plan_versions.version_status = 'published'
    and nutrition_plan_versions.effective_from <= v_reference_date
    and (
      nutrition_plan_versions.effective_to is null
      or nutrition_plan_versions.effective_to >= v_reference_date
    )
  order by
    nutrition_plan_versions.effective_from desc,
    nutrition_plan_versions.version_number desc,
    nutrition_plan_versions.created_at desc
  limit 1;

  if v_current_version_id is null then
    select nutrition_plan_versions.id
    into v_current_version_id
    from clinical.nutrition_plan_versions as nutrition_plan_versions
    where nutrition_plan_versions.nutrition_plan_id = p_nutrition_plan_id
      and nutrition_plan_versions.version_status in ('published', 'draft')
    order by
      case
        when nutrition_plan_versions.version_status = 'published' then 0
        else 1
      end,
      nutrition_plan_versions.effective_from desc,
      nutrition_plan_versions.version_number desc,
      nutrition_plan_versions.created_at desc
    limit 1;
  end if;

  update clinical.nutrition_plans
  set current_version_id = v_current_version_id
  where id = p_nutrition_plan_id
    and current_version_id is distinct from v_current_version_id;

  return v_current_version_id;
end;
$$;

create or replace function private.refresh_parent_nutrition_plan_current_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nutrition_plan_id uuid := coalesce(new.nutrition_plan_id, old.nutrition_plan_id);
begin
  if v_nutrition_plan_id is not null then
    perform private.refresh_nutrition_plan_current_version(v_nutrition_plan_id, current_date);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists refresh_parent_nutrition_plan_current_version on clinical.nutrition_plan_versions;
create trigger refresh_parent_nutrition_plan_current_version
after insert or update or delete on clinical.nutrition_plan_versions
for each row execute function private.refresh_parent_nutrition_plan_current_version();

create or replace function private.patient_active_nutrition_plan_version_id(
  p_runtime_patient_id uuid,
  p_reference_date date default current_date
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_nutrition_plan_id uuid;
begin
  if p_runtime_patient_id is null then
    return null;
  end if;

  v_nutrition_plan_id := private.patient_current_nutrition_plan_id(
    p_runtime_patient_id,
    coalesce(p_reference_date, current_date)
  );

  if v_nutrition_plan_id is null then
    return null;
  end if;

  return private.refresh_nutrition_plan_current_version(
    v_nutrition_plan_id,
    coalesce(p_reference_date, current_date)
  );
end;
$$;

create or replace function private.patient_active_nutrition_plan_json(
  p_runtime_patient_id uuid,
  p_reference_date date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_reference_date date := coalesce(p_reference_date, current_date);
  v_nutrition_plan_id uuid;
  v_current_version_id uuid;
begin
  if p_runtime_patient_id is null then
    return null;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not private.can_access_patient(p_runtime_patient_id) then
    raise exception 'patient nutrition plan access denied';
  end if;

  v_nutrition_plan_id := private.patient_current_nutrition_plan_id(
    p_runtime_patient_id,
    v_reference_date
  );

  if v_nutrition_plan_id is null then
    return null;
  end if;

  update clinical.nutrition_plans
  set medical_record_id = private.ensure_patient_medical_record(p_runtime_patient_id)
  where id = v_nutrition_plan_id
    and medical_record_id is null;

  v_current_version_id := private.patient_active_nutrition_plan_version_id(
    p_runtime_patient_id,
    v_reference_date
  );

  return (
    select jsonb_build_object(
      'id', coalesce(nutrition_plans.legacy_nutrition_plan_id, nutrition_plans.id::text),
      'runtimeId', nutrition_plans.id::text,
      'status', upper(nutrition_plans.plan_status),
      'name', nutrition_plans.plan_name,
      'summary', nutrition_plans.summary,
      'startsAt', nutrition_plans.starts_at,
      'endsAt', nutrition_plans.ends_at,
      'currentVersion', (
        select case
          when nutrition_plan_versions.id is null then null
          else jsonb_build_object(
            'id', coalesce(nutrition_plan_versions.legacy_nutrition_version_id, nutrition_plan_versions.id::text),
            'runtimeId', nutrition_plan_versions.id::text,
            'versionNumber', nutrition_plan_versions.version_number,
            'status', upper(nutrition_plan_versions.version_status),
            'title', nutrition_plan_versions.title,
            'summary', nutrition_plan_versions.summary,
            'guidance', nutrition_plan_versions.guidance,
            'mealGoalDaily', nutrition_plan_versions.meal_goal_daily,
            'waterGoalMl', nutrition_plan_versions.water_goal_ml,
            'effectiveFrom', nutrition_plan_versions.effective_from,
            'effectiveTo', nutrition_plan_versions.effective_to,
            'publishedAt', nutrition_plan_versions.published_at
          )
        end
        from clinical.nutrition_plan_versions as nutrition_plan_versions
        where nutrition_plan_versions.id = v_current_version_id
      ),
      'targets', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', coalesce(nutrition_targets.legacy_target_id, nutrition_targets.id::text),
              'runtimeId', nutrition_targets.id::text,
              'type', nutrition_targets.target_type,
              'code', nutrition_targets.code,
              'label', nutrition_targets.label,
              'goalValue', nutrition_targets.goal_value,
              'unit', nutrition_targets.unit,
              'period', nutrition_targets.period,
              'mealType', nutrition_targets.meal_type,
              'guidance', nutrition_targets.guidance,
              'position', nutrition_targets.position,
              'active', nutrition_targets.active
            )
            order by nutrition_targets.position asc, nutrition_targets.created_at asc
          ),
          '[]'::jsonb
        )
        from clinical.nutrition_targets as nutrition_targets
        where nutrition_targets.nutrition_plan_version_id = v_current_version_id
      )
    )
    from clinical.nutrition_plans as nutrition_plans
    where nutrition_plans.id = v_nutrition_plan_id
  );
end;
$$;

revoke all on function private.runtime_nutrition_plan_id_from_reference(text) from public, anon, authenticated;
revoke all on function private.runtime_nutrition_plan_version_id_from_reference(text) from public, anon, authenticated;
revoke all on function private.patient_current_nutrition_plan_id(uuid, date) from public, anon, authenticated;
revoke all on function private.refresh_nutrition_plan_current_version(uuid, date) from public, anon, authenticated;
revoke all on function private.refresh_parent_nutrition_plan_current_version() from public, anon, authenticated;
revoke all on function private.patient_active_nutrition_plan_version_id(uuid, date) from public, anon, authenticated;
revoke all on function private.patient_active_nutrition_plan_json(uuid, date) from public, anon, authenticated;

grant execute on function private.runtime_nutrition_plan_id_from_reference(text) to service_role;
grant execute on function private.runtime_nutrition_plan_version_id_from_reference(text) to service_role;
grant execute on function private.patient_current_nutrition_plan_id(uuid, date) to authenticated, service_role;
grant execute on function private.refresh_nutrition_plan_current_version(uuid, date) to authenticated, service_role;
grant execute on function private.refresh_parent_nutrition_plan_current_version() to authenticated, service_role;
grant execute on function private.patient_active_nutrition_plan_version_id(uuid, date) to authenticated, service_role;
grant execute on function private.patient_active_nutrition_plan_json(uuid, date) to authenticated, service_role;

create or replace function api.backfill_runtime_nutrition_domain(
  p_runtime_tenant_id uuid,
  p_nutrition_plans jsonb default '[]'::jsonb,
  p_nutrition_plan_versions jsonb default '[]'::jsonb,
  p_nutrition_targets jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nutrition_plans_count integer := 0;
  v_nutrition_plan_versions_count integer := 0;
  v_nutrition_targets_count integer := 0;
begin
  if p_runtime_tenant_id is null then
    raise exception 'p_runtime_tenant_id is required';
  end if;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_nutrition_plans, '[]'::jsonb)) as x(
      id uuid,
      legacy_nutrition_plan_id text,
      patient_reference text,
      plan_name text,
      plan_status text,
      summary text,
      starts_at date,
      ends_at date,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz,
      deleted_at timestamptz
    )
  ),
  resolved as (
    select
      coalesce(rows.id, gen_random_uuid()) as id,
      rows.legacy_nutrition_plan_id,
      private.runtime_patient_id_from_reference(rows.patient_reference) as patient_id,
      coalesce(nullif(trim(coalesce(rows.plan_name, '')), ''), 'Plano nutricional') as plan_name,
      case
        when rows.plan_status in ('draft', 'active', 'paused', 'completed', 'archived')
          then rows.plan_status
        else 'active'
      end as plan_status,
      nullif(trim(coalesce(rows.summary, '')), '') as summary,
      rows.starts_at,
      rows.ends_at,
      coalesce(rows.metadata, '{}'::jsonb) as metadata,
      coalesce(rows.created_at, now()) as created_at,
      coalesce(rows.updated_at, coalesce(rows.created_at, now())) as updated_at,
      rows.deleted_at
    from rows
  )
  insert into clinical.nutrition_plans (
    id,
    tenant_id,
    patient_id,
    medical_record_id,
    legacy_nutrition_plan_id,
    plan_status,
    plan_name,
    summary,
    starts_at,
    ends_at,
    metadata,
    created_at,
    updated_at,
    deleted_at
  )
  select
    resolved.id,
    p_runtime_tenant_id,
    resolved.patient_id,
    private.ensure_patient_medical_record(resolved.patient_id),
    resolved.legacy_nutrition_plan_id,
    resolved.plan_status,
    resolved.plan_name,
    resolved.summary,
    resolved.starts_at,
    resolved.ends_at,
    resolved.metadata,
    resolved.created_at,
    resolved.updated_at,
    resolved.deleted_at
  from resolved
  where nullif(trim(coalesce(resolved.legacy_nutrition_plan_id, '')), '') is not null
    and resolved.patient_id is not null
  on conflict (legacy_nutrition_plan_id) do update
  set
    tenant_id = excluded.tenant_id,
    patient_id = excluded.patient_id,
    medical_record_id = excluded.medical_record_id,
    plan_status = excluded.plan_status,
    plan_name = excluded.plan_name,
    summary = excluded.summary,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    metadata = coalesce(clinical.nutrition_plans.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = excluded.updated_at,
    deleted_at = excluded.deleted_at;

  get diagnostics v_nutrition_plans_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_nutrition_plan_versions, '[]'::jsonb)) as x(
      id uuid,
      legacy_nutrition_version_id text,
      nutrition_plan_reference text,
      version_number integer,
      version_status text,
      title text,
      summary text,
      guidance text,
      meal_goal_daily integer,
      water_goal_ml integer,
      effective_from date,
      effective_to date,
      published_at timestamptz,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz
    )
  ),
  resolved as (
    select
      coalesce(rows.id, gen_random_uuid()) as id,
      rows.legacy_nutrition_version_id,
      private.runtime_nutrition_plan_id_from_reference(rows.nutrition_plan_reference) as nutrition_plan_id,
      greatest(coalesce(rows.version_number, 1), 1) as version_number,
      case
        when rows.version_status in ('draft', 'published', 'superseded', 'archived')
          then rows.version_status
        else 'draft'
      end as version_status,
      coalesce(nullif(trim(coalesce(rows.title, '')), ''), 'Versao nutricional') as title,
      nullif(trim(coalesce(rows.summary, '')), '') as summary,
      nullif(trim(coalesce(rows.guidance, '')), '') as guidance,
      case
        when rows.meal_goal_daily is null then null
        else greatest(rows.meal_goal_daily, 1)
      end as meal_goal_daily,
      case
        when rows.water_goal_ml is null then null
        else greatest(rows.water_goal_ml, 1)
      end as water_goal_ml,
      coalesce(rows.effective_from, current_date) as effective_from,
      rows.effective_to,
      rows.published_at,
      coalesce(rows.metadata, '{}'::jsonb) as metadata,
      coalesce(rows.created_at, now()) as created_at,
      coalesce(rows.updated_at, coalesce(rows.created_at, now())) as updated_at
    from rows
  )
  insert into clinical.nutrition_plan_versions (
    id,
    nutrition_plan_id,
    legacy_nutrition_version_id,
    version_number,
    version_status,
    title,
    summary,
    guidance,
    meal_goal_daily,
    water_goal_ml,
    effective_from,
    effective_to,
    published_at,
    metadata,
    created_at,
    updated_at
  )
  select
    resolved.id,
    resolved.nutrition_plan_id,
    resolved.legacy_nutrition_version_id,
    resolved.version_number,
    resolved.version_status,
    resolved.title,
    resolved.summary,
    resolved.guidance,
    resolved.meal_goal_daily,
    resolved.water_goal_ml,
    resolved.effective_from,
    resolved.effective_to,
    resolved.published_at,
    resolved.metadata,
    resolved.created_at,
    resolved.updated_at
  from resolved
  where nullif(trim(coalesce(resolved.legacy_nutrition_version_id, '')), '') is not null
    and resolved.nutrition_plan_id is not null
  on conflict (legacy_nutrition_version_id) do update
  set
    nutrition_plan_id = excluded.nutrition_plan_id,
    version_number = excluded.version_number,
    version_status = excluded.version_status,
    title = excluded.title,
    summary = excluded.summary,
    guidance = excluded.guidance,
    meal_goal_daily = excluded.meal_goal_daily,
    water_goal_ml = excluded.water_goal_ml,
    effective_from = excluded.effective_from,
    effective_to = excluded.effective_to,
    published_at = excluded.published_at,
    metadata = coalesce(clinical.nutrition_plan_versions.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = excluded.updated_at;

  get diagnostics v_nutrition_plan_versions_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_nutrition_targets, '[]'::jsonb)) as x(
      id uuid,
      legacy_target_id text,
      nutrition_plan_version_reference text,
      target_type text,
      code text,
      label text,
      goal_value numeric,
      unit text,
      period text,
      meal_type text,
      guidance text,
      position integer,
      active boolean,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz
    )
  ),
  resolved as (
    select
      coalesce(rows.id, gen_random_uuid()) as id,
      rows.legacy_target_id,
      private.runtime_nutrition_plan_version_id_from_reference(rows.nutrition_plan_version_reference) as nutrition_plan_version_id,
      case
        when rows.target_type in ('meal', 'macro', 'hydration', 'behavior', 'supplement', 'other')
          then rows.target_type
        else 'behavior'
      end as target_type,
      nullif(trim(coalesce(rows.code, '')), '') as code,
      coalesce(nullif(trim(coalesce(rows.label, '')), ''), 'Meta nutricional') as label,
      rows.goal_value,
      nullif(trim(coalesce(rows.unit, '')), '') as unit,
      case
        when rows.period in ('day', 'week', 'meal', 'custom')
          then rows.period
        else 'day'
      end as period,
      nullif(trim(coalesce(rows.meal_type, '')), '') as meal_type,
      nullif(trim(coalesce(rows.guidance, '')), '') as guidance,
      greatest(coalesce(rows.position, 1), 1) as position,
      coalesce(rows.active, true) as active,
      coalesce(rows.metadata, '{}'::jsonb) as metadata,
      coalesce(rows.created_at, now()) as created_at,
      coalesce(rows.updated_at, coalesce(rows.created_at, now())) as updated_at
    from rows
  )
  insert into clinical.nutrition_targets (
    id,
    nutrition_plan_version_id,
    legacy_target_id,
    target_type,
    code,
    label,
    goal_value,
    unit,
    period,
    meal_type,
    guidance,
    position,
    active,
    metadata,
    created_at,
    updated_at
  )
  select
    resolved.id,
    resolved.nutrition_plan_version_id,
    resolved.legacy_target_id,
    resolved.target_type,
    resolved.code,
    resolved.label,
    resolved.goal_value,
    resolved.unit,
    resolved.period,
    resolved.meal_type,
    resolved.guidance,
    resolved.position,
    resolved.active,
    resolved.metadata,
    resolved.created_at,
    resolved.updated_at
  from resolved
  where nullif(trim(coalesce(resolved.legacy_target_id, '')), '') is not null
    and resolved.nutrition_plan_version_id is not null
  on conflict (legacy_target_id) do update
  set
    nutrition_plan_version_id = excluded.nutrition_plan_version_id,
    target_type = excluded.target_type,
    code = excluded.code,
    label = excluded.label,
    goal_value = excluded.goal_value,
    unit = excluded.unit,
    period = excluded.period,
    meal_type = excluded.meal_type,
    guidance = excluded.guidance,
    position = excluded.position,
    active = excluded.active,
    metadata = coalesce(clinical.nutrition_targets.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = excluded.updated_at;

  get diagnostics v_nutrition_targets_count = row_count;

  perform private.refresh_nutrition_plan_current_version(nutrition_plans.id, current_date)
  from clinical.nutrition_plans as nutrition_plans
  where nutrition_plans.tenant_id = p_runtime_tenant_id
    and nutrition_plans.deleted_at is null;

  update clinical.meal_logs as meal_logs
  set nutrition_plan_version_id = private.patient_active_nutrition_plan_version_id(
    meal_logs.patient_id,
    meal_logs.logged_at::date
  )
  where meal_logs.nutrition_plan_version_id is null
    and meal_logs.patient_id in (
      select nutrition_plans.patient_id
      from clinical.nutrition_plans as nutrition_plans
      where nutrition_plans.tenant_id = p_runtime_tenant_id
        and nutrition_plans.deleted_at is null
    );

  return jsonb_build_object(
    'nutritionPlans', v_nutrition_plans_count,
    'nutritionPlanVersions', v_nutrition_plan_versions_count,
    'nutritionTargets', v_nutrition_targets_count
  );
end;
$$;

create or replace function public.backfill_runtime_nutrition_domain(
  p_runtime_tenant_id uuid,
  p_nutrition_plans jsonb default '[]'::jsonb,
  p_nutrition_plan_versions jsonb default '[]'::jsonb,
  p_nutrition_targets jsonb default '[]'::jsonb
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select api.backfill_runtime_nutrition_domain(
    p_runtime_tenant_id,
    p_nutrition_plans,
    p_nutrition_plan_versions,
    p_nutrition_targets
  )
$$;

revoke all on function api.backfill_runtime_nutrition_domain(uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.backfill_runtime_nutrition_domain(uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated;

grant execute on function api.backfill_runtime_nutrition_domain(uuid, jsonb, jsonb, jsonb)
  to service_role;
grant execute on function public.backfill_runtime_nutrition_domain(uuid, jsonb, jsonb, jsonb)
  to service_role;

create or replace function api.log_patient_app_meal(
  p_meal_type text,
  p_description text default null,
  p_adherence_rating integer default null,
  p_notes text default null,
  p_logged_at timestamptz default now(),
  p_patient_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_runtime_patient_id uuid := private.resolve_patient_app_patient_id(p_patient_id);
  v_meal_type text := nullif(trim(coalesce(p_meal_type, '')), '');
  v_logged_at timestamptz := coalesce(p_logged_at, now());
  v_nutrition_plan_version_id uuid;
  v_row clinical.meal_logs%rowtype;
begin
  if v_meal_type is null then
    raise exception 'p_meal_type is required';
  end if;

  if p_adherence_rating is not null and (p_adherence_rating < 1 or p_adherence_rating > 5) then
    raise exception 'p_adherence_rating must be between 1 and 5';
  end if;

  v_nutrition_plan_version_id := private.patient_active_nutrition_plan_version_id(
    v_runtime_patient_id,
    v_logged_at::date
  );

  insert into clinical.meal_logs (
    patient_id,
    nutrition_plan_version_id,
    logged_at,
    meal_type,
    description,
    adherence_rating,
    notes,
    metadata
  )
  values (
    v_runtime_patient_id,
    v_nutrition_plan_version_id,
    v_logged_at,
    v_meal_type,
    nullif(trim(coalesce(p_description, '')), ''),
    p_adherence_rating,
    nullif(trim(coalesce(p_notes, '')), ''),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('source', 'patient_app')
  )
  returning *
  into v_row;

  return jsonb_build_object(
    'id', coalesce(v_row.legacy_meal_log_id, v_row.id::text),
    'runtimeId', v_row.id,
    'nutritionPlanVersionId', case
      when v_row.nutrition_plan_version_id is null then null
      else v_row.nutrition_plan_version_id::text
    end,
    'mealType', v_row.meal_type,
    'description', v_row.description,
    'adherenceRating', v_row.adherence_rating,
    'notes', v_row.notes,
    'loggedAt', v_row.logged_at
  );
end;
$$;

create or replace function public.patient_app_cockpit(
  p_patient_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_runtime_patient_id uuid := private.resolve_patient_app_patient_id(p_patient_id);
  v_payload jsonb := api.patient_app_cockpit(p_patient_id);
  v_logs_with_nutrition jsonb := '[]'::jsonb;
begin
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', coalesce(rows.legacy_meal_log_id, rows.id::text),
        'runtimeId', rows.id,
        'nutritionPlanVersionId', case
          when rows.nutrition_plan_version_id is null then null
          else rows.nutrition_plan_version_id::text
        end,
        'mealType', rows.meal_type,
        'description', rows.description,
        'adherenceRating', rows.adherence_rating,
        'notes', rows.notes,
        'loggedAt', rows.logged_at
      )
      order by rows.logged_at desc
    ),
    '[]'::jsonb
  )
  into v_logs_with_nutrition
  from (
    select
      meal_logs.id,
      meal_logs.legacy_meal_log_id,
      meal_logs.nutrition_plan_version_id,
      meal_logs.meal_type,
      meal_logs.description,
      meal_logs.adherence_rating,
      meal_logs.notes,
      meal_logs.logged_at
    from clinical.meal_logs as meal_logs
    where meal_logs.patient_id = v_runtime_patient_id
    order by meal_logs.logged_at desc
    limit 12
  ) as rows;

  return jsonb_set(
    jsonb_set(
      v_payload,
      '{logs,meals}',
      v_logs_with_nutrition,
      true
    ),
    '{nutritionPlan}',
    coalesce(
      private.patient_active_nutrition_plan_json(v_runtime_patient_id, current_date),
      'null'::jsonb
    ),
    true
  );
end;
$$;

create or replace function public.get_structured_encounter_snapshot(
  p_legacy_tenant_id text,
  p_legacy_encounter_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_payload jsonb := api.get_structured_encounter_snapshot(
    p_legacy_tenant_id,
    p_legacy_encounter_id
  );
  v_runtime_patient_id uuid;
begin
  if coalesce(v_payload ->> 'ready', 'false') <> 'true' then
    return v_payload;
  end if;

  v_runtime_patient_id := private.runtime_patient_id_from_reference(
    nullif(v_payload #>> '{encounter,patient,id}', '')
  );

  return jsonb_set(
    v_payload,
    '{encounter,nutritionPlan}',
    coalesce(
      private.patient_active_nutrition_plan_json(v_runtime_patient_id, current_date),
      'null'::jsonb
    ),
    true
  );
end;
$$;

revoke all on function api.log_patient_app_meal(text, text, integer, text, timestamptz, text, jsonb)
  from public, anon;
revoke all on function public.patient_app_cockpit(text) from public, anon;
revoke all on function public.get_structured_encounter_snapshot(text, text) from public, anon;

grant execute on function api.log_patient_app_meal(text, text, integer, text, timestamptz, text, jsonb)
  to authenticated, service_role;
grant execute on function public.patient_app_cockpit(text) to authenticated, service_role;
grant execute on function public.get_structured_encounter_snapshot(text, text) to authenticated, service_role;
