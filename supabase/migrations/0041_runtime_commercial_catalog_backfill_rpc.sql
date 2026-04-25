alter table commercial.services
  drop constraint if exists commercial_services_legacy_service_id_key;

alter table commercial.packages
  drop constraint if exists commercial_packages_legacy_package_id_key;

alter table commercial.programs
  drop constraint if exists commercial_programs_legacy_program_id_key;

drop index if exists idx_commercial_services_legacy_id;
drop index if exists idx_commercial_packages_legacy_id;
drop index if exists idx_commercial_programs_legacy_id;

alter table commercial.services
  add constraint commercial_services_legacy_service_id_key unique (legacy_service_id);

alter table commercial.packages
  add constraint commercial_packages_legacy_package_id_key unique (legacy_package_id);

alter table commercial.programs
  add constraint commercial_programs_legacy_program_id_key unique (legacy_program_id);

create or replace function private.runtime_service_id_by_legacy_service_id(
  p_runtime_tenant_id uuid,
  p_legacy_service_id text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select services.id
  from commercial.services as services
  where services.tenant_id = p_runtime_tenant_id
    and services.legacy_service_id = p_legacy_service_id
  limit 1
$$;

create or replace function private.runtime_package_id_by_legacy_package_id(
  p_runtime_tenant_id uuid,
  p_legacy_package_id text
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
    and packages.legacy_package_id = p_legacy_package_id
  limit 1
$$;

create or replace function private.runtime_program_id_by_legacy_program_id(
  p_runtime_tenant_id uuid,
  p_legacy_program_id text
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
    and programs.legacy_program_id = p_legacy_program_id
  limit 1
$$;

revoke all on function private.runtime_service_id_by_legacy_service_id(uuid, text) from public, anon, authenticated;
revoke all on function private.runtime_package_id_by_legacy_package_id(uuid, text) from public, anon, authenticated;
revoke all on function private.runtime_program_id_by_legacy_program_id(uuid, text) from public, anon, authenticated;

grant execute on function private.runtime_service_id_by_legacy_service_id(uuid, text) to service_role;
grant execute on function private.runtime_package_id_by_legacy_package_id(uuid, text) to service_role;
grant execute on function private.runtime_program_id_by_legacy_program_id(uuid, text) to service_role;

create or replace function api.backfill_runtime_commercial_catalog(
  p_runtime_tenant_id uuid,
  p_services jsonb default '[]'::jsonb,
  p_packages jsonb default '[]'::jsonb,
  p_package_services jsonb default '[]'::jsonb,
  p_programs jsonb default '[]'::jsonb,
  p_program_packages jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_services_count integer := 0;
  v_packages_count integer := 0;
  v_package_services_count integer := 0;
  v_programs_count integer := 0;
  v_program_packages_count integer := 0;
begin
  if p_runtime_tenant_id is null then
    raise exception 'p_runtime_tenant_id is required';
  end if;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_services, '[]'::jsonb)) as x(
      id uuid,
      legacy_service_id text,
      name text,
      code text,
      description text,
      service_type text,
      duration_minutes integer,
      list_price numeric,
      currency_code text,
      active boolean,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz,
      deleted_at timestamptz
    )
  )
  insert into commercial.services (
    id,
    tenant_id,
    legacy_service_id,
    name,
    code,
    description,
    service_type,
    duration_minutes,
    list_price,
    currency_code,
    active,
    metadata,
    created_at,
    updated_at,
    deleted_at
  )
  select
    coalesce(rows.id, gen_random_uuid()),
    p_runtime_tenant_id,
    rows.legacy_service_id,
    rows.name,
    rows.code,
    rows.description,
    coalesce(rows.service_type, 'consultation'),
    rows.duration_minutes,
    coalesce(rows.list_price, 0),
    coalesce(nullif(trim(coalesce(rows.currency_code, '')), ''), 'BRL'),
    coalesce(rows.active, true),
    coalesce(rows.metadata, '{}'::jsonb),
    coalesce(rows.created_at, now()),
    coalesce(rows.updated_at, coalesce(rows.created_at, now())),
    rows.deleted_at
  from rows
  where nullif(trim(coalesce(rows.legacy_service_id, '')), '') is not null
    and nullif(trim(coalesce(rows.name, '')), '') is not null
    and nullif(trim(coalesce(rows.code, '')), '') is not null
  on conflict (legacy_service_id) do update
  set
    tenant_id = excluded.tenant_id,
    name = excluded.name,
    code = excluded.code,
    description = excluded.description,
    service_type = excluded.service_type,
    duration_minutes = excluded.duration_minutes,
    list_price = excluded.list_price,
    currency_code = excluded.currency_code,
    active = excluded.active,
    metadata = coalesce(commercial.services.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = excluded.updated_at,
    deleted_at = excluded.deleted_at;

  get diagnostics v_services_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_packages, '[]'::jsonb)) as x(
      id uuid,
      legacy_package_id text,
      name text,
      code text,
      description text,
      package_type text,
      billing_model text,
      tier text,
      price numeric,
      currency_code text,
      featured boolean,
      active boolean,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz,
      deleted_at timestamptz
    )
  )
  insert into commercial.packages (
    id,
    tenant_id,
    legacy_package_id,
    name,
    code,
    description,
    package_type,
    billing_model,
    tier,
    price,
    currency_code,
    featured,
    active,
    metadata,
    created_at,
    updated_at,
    deleted_at
  )
  select
    coalesce(rows.id, gen_random_uuid()),
    p_runtime_tenant_id,
    rows.legacy_package_id,
    rows.name,
    rows.code,
    rows.description,
    coalesce(rows.package_type, 'program'),
    coalesce(rows.billing_model, 'one_time'),
    rows.tier,
    coalesce(rows.price, 0),
    coalesce(nullif(trim(coalesce(rows.currency_code, '')), ''), 'BRL'),
    coalesce(rows.featured, false),
    coalesce(rows.active, true),
    coalesce(rows.metadata, '{}'::jsonb),
    coalesce(rows.created_at, now()),
    coalesce(rows.updated_at, coalesce(rows.created_at, now())),
    rows.deleted_at
  from rows
  where nullif(trim(coalesce(rows.legacy_package_id, '')), '') is not null
    and nullif(trim(coalesce(rows.name, '')), '') is not null
    and nullif(trim(coalesce(rows.code, '')), '') is not null
  on conflict (legacy_package_id) do update
  set
    tenant_id = excluded.tenant_id,
    name = excluded.name,
    code = excluded.code,
    description = excluded.description,
    package_type = excluded.package_type,
    billing_model = excluded.billing_model,
    tier = excluded.tier,
    price = excluded.price,
    currency_code = excluded.currency_code,
    featured = excluded.featured,
    active = excluded.active,
    metadata = coalesce(commercial.packages.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = excluded.updated_at,
    deleted_at = excluded.deleted_at;

  get diagnostics v_packages_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_package_services, '[]'::jsonb)) as x(
      id uuid,
      legacy_package_id text,
      legacy_service_id text,
      quantity integer,
      required boolean,
      notes text,
      item_price_override numeric,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz
    )
  ),
  resolved as (
    select
      coalesce(rows.id, gen_random_uuid()) as id,
      private.runtime_package_id_by_legacy_package_id(
        p_runtime_tenant_id,
        rows.legacy_package_id
      ) as package_id,
      private.runtime_service_id_by_legacy_service_id(
        p_runtime_tenant_id,
        rows.legacy_service_id
      ) as service_id,
      greatest(coalesce(rows.quantity, 1), 1) as quantity,
      coalesce(rows.required, true) as required,
      rows.notes,
      rows.item_price_override,
      coalesce(rows.metadata, '{}'::jsonb) as metadata,
      coalesce(rows.created_at, now()) as created_at,
      coalesce(rows.updated_at, coalesce(rows.created_at, now())) as updated_at
    from rows
  )
  insert into commercial.package_services (
    id,
    tenant_id,
    package_id,
    service_id,
    quantity,
    required,
    notes,
    item_price_override,
    metadata,
    created_at,
    updated_at
  )
  select
    resolved.id,
    p_runtime_tenant_id,
    resolved.package_id,
    resolved.service_id,
    resolved.quantity,
    resolved.required,
    resolved.notes,
    resolved.item_price_override,
    resolved.metadata,
    resolved.created_at,
    resolved.updated_at
  from resolved
  where resolved.package_id is not null
    and resolved.service_id is not null
  on conflict (package_id, service_id) do update
  set
    tenant_id = excluded.tenant_id,
    quantity = excluded.quantity,
    required = excluded.required,
    notes = excluded.notes,
    item_price_override = excluded.item_price_override,
    metadata = coalesce(commercial.package_services.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = excluded.updated_at;

  get diagnostics v_package_services_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_programs, '[]'::jsonb)) as x(
      id uuid,
      legacy_program_id text,
      name text,
      code text,
      description text,
      program_type text,
      duration_days integer,
      featured boolean,
      active boolean,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz,
      deleted_at timestamptz
    )
  )
  insert into commercial.programs (
    id,
    tenant_id,
    legacy_program_id,
    name,
    code,
    description,
    program_type,
    duration_days,
    featured,
    active,
    metadata,
    created_at,
    updated_at,
    deleted_at
  )
  select
    coalesce(rows.id, gen_random_uuid()),
    p_runtime_tenant_id,
    rows.legacy_program_id,
    rows.name,
    rows.code,
    rows.description,
    coalesce(rows.program_type, 'clinical'),
    rows.duration_days,
    coalesce(rows.featured, false),
    coalesce(rows.active, true),
    coalesce(rows.metadata, '{}'::jsonb),
    coalesce(rows.created_at, now()),
    coalesce(rows.updated_at, coalesce(rows.created_at, now())),
    rows.deleted_at
  from rows
  where nullif(trim(coalesce(rows.legacy_program_id, '')), '') is not null
    and nullif(trim(coalesce(rows.name, '')), '') is not null
    and nullif(trim(coalesce(rows.code, '')), '') is not null
  on conflict (legacy_program_id) do update
  set
    tenant_id = excluded.tenant_id,
    name = excluded.name,
    code = excluded.code,
    description = excluded.description,
    program_type = excluded.program_type,
    duration_days = excluded.duration_days,
    featured = excluded.featured,
    active = excluded.active,
    metadata = coalesce(commercial.programs.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = excluded.updated_at,
    deleted_at = excluded.deleted_at;

  get diagnostics v_programs_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_program_packages, '[]'::jsonb)) as x(
      id uuid,
      legacy_program_id text,
      legacy_package_id text,
      sort_order integer,
      recommended boolean,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz
    )
  ),
  resolved as (
    select
      coalesce(rows.id, gen_random_uuid()) as id,
      private.runtime_program_id_by_legacy_program_id(
        p_runtime_tenant_id,
        rows.legacy_program_id
      ) as program_id,
      private.runtime_package_id_by_legacy_package_id(
        p_runtime_tenant_id,
        rows.legacy_package_id
      ) as package_id,
      greatest(coalesce(rows.sort_order, 0), 0) as sort_order,
      coalesce(rows.recommended, false) as recommended,
      coalesce(rows.metadata, '{}'::jsonb) as metadata,
      coalesce(rows.created_at, now()) as created_at,
      coalesce(rows.updated_at, coalesce(rows.created_at, now())) as updated_at
    from rows
  )
  insert into commercial.program_packages (
    id,
    tenant_id,
    program_id,
    package_id,
    sort_order,
    recommended,
    metadata,
    created_at,
    updated_at
  )
  select
    resolved.id,
    p_runtime_tenant_id,
    resolved.program_id,
    resolved.package_id,
    resolved.sort_order,
    resolved.recommended,
    resolved.metadata,
    resolved.created_at,
    resolved.updated_at
  from resolved
  where resolved.program_id is not null
    and resolved.package_id is not null
  on conflict (program_id, package_id) do update
  set
    tenant_id = excluded.tenant_id,
    sort_order = excluded.sort_order,
    recommended = excluded.recommended,
    metadata = coalesce(commercial.program_packages.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = excluded.updated_at;

  get diagnostics v_program_packages_count = row_count;

  return jsonb_build_object(
    'services', v_services_count,
    'packages', v_packages_count,
    'packageServices', v_package_services_count,
    'programs', v_programs_count,
    'programPackages', v_program_packages_count
  );
end;
$$;

revoke all on function api.backfill_runtime_commercial_catalog(uuid, jsonb, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;

grant execute on function api.backfill_runtime_commercial_catalog(uuid, jsonb, jsonb, jsonb, jsonb, jsonb)
  to service_role;

create or replace function public.backfill_runtime_commercial_catalog(
  p_runtime_tenant_id uuid,
  p_services jsonb default '[]'::jsonb,
  p_packages jsonb default '[]'::jsonb,
  p_package_services jsonb default '[]'::jsonb,
  p_programs jsonb default '[]'::jsonb,
  p_program_packages jsonb default '[]'::jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.backfill_runtime_commercial_catalog(
    p_runtime_tenant_id,
    p_services,
    p_packages,
    p_package_services,
    p_programs,
    p_program_packages
  )
$$;

revoke all on function public.backfill_runtime_commercial_catalog(uuid, jsonb, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;

grant execute on function public.backfill_runtime_commercial_catalog(uuid, jsonb, jsonb, jsonb, jsonb, jsonb)
  to service_role;
