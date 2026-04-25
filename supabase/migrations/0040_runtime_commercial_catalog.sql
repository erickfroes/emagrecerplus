create table if not exists commercial.services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  legacy_service_id text,
  name text not null,
  code text not null,
  description text,
  service_type text not null default 'consultation' check (
    service_type in ('consultation', 'assessment', 'nutrition', 'support', 'procedure', 'membership', 'other')
  ),
  duration_minutes integer check (duration_minutes is null or duration_minutes >= 0),
  list_price numeric(12,2) not null default 0,
  currency_code text not null default 'BRL',
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint commercial_services_tenant_code_key unique (tenant_id, code)
);

create table if not exists commercial.packages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  legacy_package_id text,
  name text not null,
  code text not null,
  description text,
  package_type text not null default 'program',
  billing_model text not null default 'one_time' check (
    billing_model in ('one_time', 'recurring', 'hybrid')
  ),
  tier text,
  price numeric(12,2) not null default 0,
  currency_code text not null default 'BRL',
  featured boolean not null default false,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint commercial_packages_tenant_code_key unique (tenant_id, code)
);

create table if not exists commercial.package_services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  package_id uuid not null references commercial.packages (id) on delete cascade,
  service_id uuid not null references commercial.services (id) on delete restrict,
  quantity integer not null default 1 check (quantity > 0),
  required boolean not null default true,
  notes text,
  item_price_override numeric(12,2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_package_services_package_service_key unique (package_id, service_id)
);

create table if not exists commercial.programs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  legacy_program_id text,
  name text not null,
  code text not null,
  description text,
  program_type text not null default 'clinical',
  duration_days integer check (duration_days is null or duration_days > 0),
  featured boolean not null default false,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint commercial_programs_tenant_code_key unique (tenant_id, code)
);

create table if not exists commercial.program_packages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  program_id uuid not null references commercial.programs (id) on delete cascade,
  package_id uuid not null references commercial.packages (id) on delete restrict,
  sort_order integer not null default 0 check (sort_order >= 0),
  recommended boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_program_packages_program_package_key unique (program_id, package_id)
);

create unique index if not exists idx_commercial_services_legacy_id
  on commercial.services (legacy_service_id)
  where legacy_service_id is not null;

create index if not exists idx_commercial_services_tenant_active
  on commercial.services (tenant_id, active, name)
  where deleted_at is null;

create unique index if not exists idx_commercial_packages_legacy_id
  on commercial.packages (legacy_package_id)
  where legacy_package_id is not null;

create index if not exists idx_commercial_packages_tenant_active
  on commercial.packages (tenant_id, active, featured, name)
  where deleted_at is null;

create index if not exists idx_commercial_package_services_tenant_package
  on commercial.package_services (tenant_id, package_id, service_id);

create unique index if not exists idx_commercial_programs_legacy_id
  on commercial.programs (legacy_program_id)
  where legacy_program_id is not null;

create index if not exists idx_commercial_programs_tenant_active
  on commercial.programs (tenant_id, active, featured, name)
  where deleted_at is null;

create index if not exists idx_commercial_program_packages_tenant_program
  on commercial.program_packages (tenant_id, program_id, sort_order asc);

drop trigger if exists set_commercial_services_updated_at on commercial.services;
create trigger set_commercial_services_updated_at
before update on commercial.services
for each row execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_commercial_packages_updated_at on commercial.packages;
create trigger set_commercial_packages_updated_at
before update on commercial.packages
for each row execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_commercial_package_services_updated_at on commercial.package_services;
create trigger set_commercial_package_services_updated_at
before update on commercial.package_services
for each row execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_commercial_programs_updated_at on commercial.programs;
create trigger set_commercial_programs_updated_at
before update on commercial.programs
for each row execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_commercial_program_packages_updated_at on commercial.program_packages;
create trigger set_commercial_program_packages_updated_at
before update on commercial.program_packages
for each row execute function private.set_current_timestamp_updated_at();

grant all on table commercial.services to service_role;
grant all on table commercial.packages to service_role;
grant all on table commercial.package_services to service_role;
grant all on table commercial.programs to service_role;
grant all on table commercial.program_packages to service_role;

alter table commercial.services enable row level security;
alter table commercial.packages enable row level security;
alter table commercial.package_services enable row level security;
alter table commercial.programs enable row level security;
alter table commercial.program_packages enable row level security;

drop policy if exists commercial_services_select_current_scope on commercial.services;
create policy commercial_services_select_current_scope
on commercial.services
for select
using (private.can_read_commercial_domain(tenant_id));

drop policy if exists commercial_services_manage_current_scope on commercial.services;
create policy commercial_services_manage_current_scope
on commercial.services
for all
using (private.can_manage_commercial_domain(tenant_id))
with check (private.can_manage_commercial_domain(tenant_id));

drop policy if exists commercial_packages_select_current_scope on commercial.packages;
create policy commercial_packages_select_current_scope
on commercial.packages
for select
using (private.can_read_commercial_domain(tenant_id));

drop policy if exists commercial_packages_manage_current_scope on commercial.packages;
create policy commercial_packages_manage_current_scope
on commercial.packages
for all
using (private.can_manage_commercial_domain(tenant_id))
with check (private.can_manage_commercial_domain(tenant_id));

drop policy if exists commercial_package_services_select_current_scope on commercial.package_services;
create policy commercial_package_services_select_current_scope
on commercial.package_services
for select
using (private.can_read_commercial_domain(tenant_id));

drop policy if exists commercial_package_services_manage_current_scope on commercial.package_services;
create policy commercial_package_services_manage_current_scope
on commercial.package_services
for all
using (private.can_manage_commercial_domain(tenant_id))
with check (private.can_manage_commercial_domain(tenant_id));

drop policy if exists commercial_programs_select_current_scope on commercial.programs;
create policy commercial_programs_select_current_scope
on commercial.programs
for select
using (private.can_read_commercial_domain(tenant_id));

drop policy if exists commercial_programs_manage_current_scope on commercial.programs;
create policy commercial_programs_manage_current_scope
on commercial.programs
for all
using (private.can_manage_commercial_domain(tenant_id))
with check (private.can_manage_commercial_domain(tenant_id));

drop policy if exists commercial_program_packages_select_current_scope on commercial.program_packages;
create policy commercial_program_packages_select_current_scope
on commercial.program_packages
for select
using (private.can_read_commercial_domain(tenant_id));

drop policy if exists commercial_program_packages_manage_current_scope on commercial.program_packages;
create policy commercial_program_packages_manage_current_scope
on commercial.program_packages
for all
using (private.can_manage_commercial_domain(tenant_id))
with check (private.can_manage_commercial_domain(tenant_id));

create or replace function api.commercial_catalog_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_runtime_tenant_id uuid := private.current_tenant_id();
begin
  if v_runtime_tenant_id is null
    or not private.can_read_commercial_domain(v_runtime_tenant_id) then
    raise exception 'commercial catalog denied';
  end if;

  return jsonb_build_object(
    'services', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', coalesce(services.legacy_service_id, services.id::text),
          'name', services.name,
          'code', services.code,
          'description', services.description,
          'serviceType', services.service_type,
          'durationMinutes', services.duration_minutes,
          'listPrice', services.list_price,
          'currencyCode', services.currency_code,
          'active', services.active
        )
        order by services.active desc, services.name asc
      )
      from commercial.services as services
      where services.tenant_id = v_runtime_tenant_id
        and services.deleted_at is null
    ), '[]'::jsonb),
    'packages', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', coalesce(packages.legacy_package_id, packages.id::text),
          'name', packages.name,
          'code', packages.code,
          'description', packages.description,
          'packageType', packages.package_type,
          'billingModel', packages.billing_model,
          'tier', packages.tier,
          'price', packages.price,
          'currencyCode', packages.currency_code,
          'featured', packages.featured,
          'active', packages.active,
          'serviceCount', coalesce(service_totals.service_count, 0)
        )
        order by packages.featured desc, packages.active desc, packages.name asc
      )
      from commercial.packages as packages
      left join lateral (
        select count(*)::integer as service_count
        from commercial.package_services as package_services
        where package_services.package_id = packages.id
      ) as service_totals on true
      where packages.tenant_id = v_runtime_tenant_id
        and packages.deleted_at is null
    ), '[]'::jsonb),
    'packageServices', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', package_services.id::text,
          'packageId', coalesce(packages.legacy_package_id, package_services.package_id::text),
          'serviceId', coalesce(services.legacy_service_id, package_services.service_id::text),
          'quantity', package_services.quantity,
          'required', package_services.required,
          'notes', package_services.notes,
          'itemPriceOverride', package_services.item_price_override
        )
        order by packages.name asc, services.name asc
      )
      from commercial.package_services as package_services
      join commercial.packages as packages
        on packages.id = package_services.package_id
      join commercial.services as services
        on services.id = package_services.service_id
      where package_services.tenant_id = v_runtime_tenant_id
        and packages.deleted_at is null
        and services.deleted_at is null
    ), '[]'::jsonb),
    'programs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', coalesce(programs.legacy_program_id, programs.id::text),
          'name', programs.name,
          'code', programs.code,
          'description', programs.description,
          'programType', programs.program_type,
          'durationDays', programs.duration_days,
          'featured', programs.featured,
          'active', programs.active,
          'packageCount', coalesce(package_totals.package_count, 0)
        )
        order by programs.featured desc, programs.active desc, programs.name asc
      )
      from commercial.programs as programs
      left join lateral (
        select count(*)::integer as package_count
        from commercial.program_packages as program_packages
        where program_packages.program_id = programs.id
      ) as package_totals on true
      where programs.tenant_id = v_runtime_tenant_id
        and programs.deleted_at is null
    ), '[]'::jsonb),
    'programPackages', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', program_packages.id::text,
          'programId', coalesce(programs.legacy_program_id, program_packages.program_id::text),
          'packageId', coalesce(packages.legacy_package_id, program_packages.package_id::text),
          'sortOrder', program_packages.sort_order,
          'recommended', program_packages.recommended
        )
        order by programs.name asc, program_packages.sort_order asc, packages.name asc
      )
      from commercial.program_packages as program_packages
      join commercial.programs as programs
        on programs.id = program_packages.program_id
      join commercial.packages as packages
        on packages.id = program_packages.package_id
      where program_packages.tenant_id = v_runtime_tenant_id
        and programs.deleted_at is null
        and packages.deleted_at is null
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.commercial_catalog_snapshot()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select api.commercial_catalog_snapshot()
$$;

revoke all on function api.commercial_catalog_snapshot() from public, anon;
revoke all on function public.commercial_catalog_snapshot() from public, anon;

grant execute on function api.commercial_catalog_snapshot() to authenticated, service_role;
grant execute on function public.commercial_catalog_snapshot() to authenticated, service_role;
