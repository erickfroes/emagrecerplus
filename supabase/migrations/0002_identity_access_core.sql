create table if not exists platform.tenants (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  trade_name text,
  slug citext,
  document_number text,
  status text not null default 'active' check (status in ('active', 'trial', 'suspended', 'archived')),
  subscription_plan_code text,
  default_timezone text not null default 'America/Sao_Paulo',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists idx_tenants_slug
  on platform.tenants (slug)
  where slug is not null;

create index if not exists idx_tenants_status_deleted_at
  on platform.tenants (status, deleted_at);

create table if not exists platform.units (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  name text not null,
  code text,
  timezone text,
  city text,
  state text,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  is_default boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint units_tenant_id_code_key unique nulls not distinct (tenant_id, code)
);

create unique index if not exists idx_units_default_per_tenant
  on platform.units (tenant_id)
  where is_default = true
    and deleted_at is null;

create index if not exists idx_units_tenant_status_deleted_at
  on platform.units (tenant_id, status, deleted_at);

create table if not exists platform.feature_flags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  feature_code text not null,
  is_enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feature_flags_tenant_id_feature_code_key unique (tenant_id, feature_code)
);

create table if not exists platform.branding_settings (
  tenant_id uuid primary key references platform.tenants (id) on delete cascade,
  brand_name text,
  primary_color text,
  secondary_color text,
  logo_path text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists identity.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email citext not null unique,
  full_name text,
  display_name text,
  phone text,
  avatar_path text,
  platform_role text check (platform_role in ('platform_owner', 'platform_support')),
  status text not null default 'active' check (status in ('invited', 'active', 'suspended', 'disabled')),
  default_tenant_id uuid references platform.tenants (id) on delete set null,
  default_unit_id uuid references platform.units (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create index if not exists idx_profiles_default_tenant
  on identity.profiles (default_tenant_id);

create index if not exists idx_profiles_default_unit
  on identity.profiles (default_unit_id);

create index if not exists idx_profiles_status
  on identity.profiles (status);

create table if not exists identity.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  module_code text,
  is_system boolean not null default true,
  status text not null default 'active' check (status in ('active', 'deprecated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_permissions_module_status
  on identity.permissions (module_code, status);

create table if not exists identity.roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references platform.tenants (id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  app_role_code text not null,
  is_system boolean not null default false,
  status text not null default 'active' check (status in ('active', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roles_tenant_id_code_key unique nulls not distinct (tenant_id, code),
  constraint roles_app_role_code_check check (
    app_role_code in (
      'owner',
      'admin',
      'manager',
      'clinician',
      'assistant',
      'physician',
      'nutritionist',
      'reception',
      'sales',
      'nursing',
      'financial',
      'patient'
    )
  )
);

create index if not exists idx_roles_tenant_status
  on identity.roles (tenant_id, status);

create table if not exists identity.role_permissions (
  role_id uuid not null references identity.roles (id) on delete cascade,
  permission_id uuid not null references identity.permissions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create index if not exists idx_role_permissions_permission
  on identity.role_permissions (permission_id);

create table if not exists identity.memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references identity.profiles (id) on delete cascade,
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  role_id uuid not null references identity.roles (id) on delete restrict,
  status text not null default 'active' check (status in ('invited', 'active', 'suspended', 'revoked')),
  is_default boolean not null default false,
  invited_by_profile_id uuid references identity.profiles (id) on delete set null,
  joined_at timestamptz,
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint memberships_profile_id_tenant_id_key unique (profile_id, tenant_id)
);

create unique index if not exists idx_memberships_default_per_profile
  on identity.memberships (profile_id)
  where is_default = true
    and status = 'active';

create index if not exists idx_memberships_tenant_status
  on identity.memberships (tenant_id, status, created_at desc);

create index if not exists idx_memberships_profile_status
  on identity.memberships (profile_id, status, created_at desc);

create table if not exists identity.unit_memberships (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references identity.memberships (id) on delete cascade,
  unit_id uuid not null references platform.units (id) on delete cascade,
  access_level text not null default 'member' check (access_level in ('member', 'manager', 'clinical', 'viewer')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unit_memberships_membership_id_unit_id_key unique (membership_id, unit_id)
);

create unique index if not exists idx_unit_memberships_primary_per_membership
  on identity.unit_memberships (membership_id)
  where is_primary = true
    and status = 'active';

create index if not exists idx_unit_memberships_unit_status
  on identity.unit_memberships (unit_id, status);

create table if not exists identity.invitation_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  role_id uuid references identity.roles (id) on delete set null,
  email citext not null,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  invited_by_profile_id uuid references identity.profiles (id) on delete set null,
  accepted_profile_id uuid references identity.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_invitation_tokens_tenant_status
  on identity.invitation_tokens (tenant_id, status, expires_at);

create index if not exists idx_invitation_tokens_email_status
  on identity.invitation_tokens (email, status);

create table if not exists identity.access_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references identity.profiles (id) on delete cascade,
  membership_id uuid references identity.memberships (id) on delete set null,
  tenant_id uuid references platform.tenants (id) on delete set null,
  unit_id uuid references platform.units (id) on delete set null,
  session_reference text,
  access_token_jti text,
  ip_address inet,
  user_agent text,
  device_label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint access_sessions_session_reference_key unique nulls not distinct (session_reference),
  constraint access_sessions_access_token_jti_key unique nulls not distinct (access_token_jti)
);

create index if not exists idx_access_sessions_profile_created_at
  on identity.access_sessions (profile_id, created_at desc);

create index if not exists idx_access_sessions_tenant_created_at
  on identity.access_sessions (tenant_id, created_at desc);

drop trigger if exists set_platform_tenants_updated_at on platform.tenants;
create trigger set_platform_tenants_updated_at
before update on platform.tenants
for each row
execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_platform_units_updated_at on platform.units;
create trigger set_platform_units_updated_at
before update on platform.units
for each row
execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_platform_feature_flags_updated_at on platform.feature_flags;
create trigger set_platform_feature_flags_updated_at
before update on platform.feature_flags
for each row
execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_platform_branding_settings_updated_at on platform.branding_settings;
create trigger set_platform_branding_settings_updated_at
before update on platform.branding_settings
for each row
execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_identity_profiles_updated_at on identity.profiles;
create trigger set_identity_profiles_updated_at
before update on identity.profiles
for each row
execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_identity_permissions_updated_at on identity.permissions;
create trigger set_identity_permissions_updated_at
before update on identity.permissions
for each row
execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_identity_roles_updated_at on identity.roles;
create trigger set_identity_roles_updated_at
before update on identity.roles
for each row
execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_identity_memberships_updated_at on identity.memberships;
create trigger set_identity_memberships_updated_at
before update on identity.memberships
for each row
execute function private.set_current_timestamp_updated_at();

drop trigger if exists set_identity_unit_memberships_updated_at on identity.unit_memberships;
create trigger set_identity_unit_memberships_updated_at
before update on identity.unit_memberships
for each row
execute function private.set_current_timestamp_updated_at();

grant usage on schema platform to authenticated;
grant usage on schema platform to service_role;
grant usage on schema identity to authenticated;
grant usage on schema identity to service_role;

grant select, insert, update, delete on table
  platform.tenants,
  platform.units,
  platform.feature_flags,
  platform.branding_settings
to authenticated;

grant all on table
  platform.tenants,
  platform.units,
  platform.feature_flags,
  platform.branding_settings
to service_role;

grant select, insert, update, delete on table
  identity.profiles,
  identity.roles,
  identity.role_permissions,
  identity.memberships,
  identity.unit_memberships,
  identity.invitation_tokens,
  identity.access_sessions
to authenticated;

grant select on table identity.permissions to authenticated;

grant all on table
  identity.profiles,
  identity.permissions,
  identity.roles,
  identity.role_permissions,
  identity.memberships,
  identity.unit_memberships,
  identity.invitation_tokens,
  identity.access_sessions
to service_role;

insert into identity.permissions (
  code,
  description,
  module_code,
  is_system
)
values
  ('platform.read', 'Leitura de tenant, configuracoes e contexto base.', 'platform', true),
  ('platform.write', 'Gestao estrutural do tenant.', 'platform', true),
  ('users.read', 'Leitura de perfis, memberships e equipe.', 'identity', true),
  ('users.write', 'Gestao de perfis, memberships e equipe.', 'identity', true),
  ('roles.read', 'Leitura de perfis de acesso e papeis.', 'identity', true),
  ('roles.write', 'Gestao de papeis e permissoes.', 'identity', true),
  ('audit.read', 'Leitura de trilhas de auditoria e sessoes.', 'audit', true),
  ('patients.read', 'Leitura operacional de pacientes.', 'patients', true),
  ('patients.write', 'Edicao operacional de pacientes.', 'patients', true),
  ('patients.read.all', 'Leitura irrestrita dentro do tenant para contexto clinico.', 'patients', true),
  ('schedule.read', 'Leitura de agenda, filas e retornos.', 'scheduling', true),
  ('schedule.write', 'Gestao de agenda, filas e retornos.', 'scheduling', true),
  ('crm.read', 'Leitura de leads, funis e propostas.', 'crm', true),
  ('crm.write', 'Gestao de leads, funis e propostas.', 'crm', true),
  ('clinical.read', 'Leitura de encounter, prontuario e planos.', 'clinical', true),
  ('clinical.write', 'Edicao de encounter, prontuario e planos.', 'clinical', true),
  ('clinical.read.all', 'Leitura clinica irrestrita no tenant.', 'clinical', true),
  ('documents.read', 'Leitura de documentos, prescricoes e anexos.', 'docs', true),
  ('documents.write', 'Gestao de documentos, prescricoes e anexos.', 'docs', true),
  ('finance.read', 'Leitura de financeiro clinico e reconciliacao.', 'finance', true),
  ('finance.write', 'Gestao de financeiro clinico e reconciliacao.', 'finance', true),
  ('settings.read', 'Leitura de configuracoes e parametros.', 'settings', true),
  ('settings.write', 'Gestao de configuracoes e parametros.', 'settings', true),
  ('community.read', 'Leitura de comunicacao, comunidade e conteudo.', 'comms', true),
  ('community.write', 'Gestao de comunicacao, comunidade e conteudo.', 'comms', true)
on conflict (code) do update
set
  description = excluded.description,
  module_code = excluded.module_code,
  is_system = excluded.is_system,
  status = 'active',
  updated_at = now();

insert into identity.roles (
  tenant_id,
  code,
  name,
  description,
  app_role_code,
  is_system
)
values
  (null, 'owner', 'Owner', 'Acesso total ao tenant e seus dominios clinicos e operacionais.', 'owner', true),
  (null, 'admin', 'Admin', 'Administracao geral do tenant com operacao ampla.', 'admin', true),
  (null, 'manager', 'Manager', 'Gestao operacional e acompanhamento de equipes.', 'manager', true),
  (null, 'clinician', 'Clinician', 'Atendimento clinico generalista com foco assistencial.', 'clinician', true),
  (null, 'physician', 'Physician', 'Atendimento medico com foco em encounter e conduta.', 'physician', true),
  (null, 'nutritionist', 'Nutritionist', 'Atendimento nutricional estruturado e acompanhamento.', 'nutritionist', true),
  (null, 'assistant', 'Assistant', 'Apoio operacional e administrativo do fluxo clinico.', 'assistant', true),
  (null, 'reception', 'Reception', 'Recepcao e orquestracao de agenda.', 'reception', true),
  (null, 'sales', 'Sales', 'Operacao comercial, leads e propostas.', 'sales', true),
  (null, 'nursing', 'Nursing', 'Apoio clinico e operacional de enfermagem.', 'nursing', true),
  (null, 'financial', 'Financial', 'Financeiro clinico e conciliacao.', 'financial', true),
  (null, 'patient', 'Patient', 'Perfil de paciente para cockpit e jornada assistida.', 'patient', true)
on conflict (tenant_id, code) do update
set
  name = excluded.name,
  description = excluded.description,
  app_role_code = excluded.app_role_code,
  is_system = excluded.is_system,
  status = 'active',
  updated_at = now();

with role_permission_map (role_code, permission_code) as (
  values
    ('owner', 'platform.read'),
    ('owner', 'platform.write'),
    ('owner', 'users.read'),
    ('owner', 'users.write'),
    ('owner', 'roles.read'),
    ('owner', 'roles.write'),
    ('owner', 'audit.read'),
    ('owner', 'patients.read'),
    ('owner', 'patients.write'),
    ('owner', 'patients.read.all'),
    ('owner', 'schedule.read'),
    ('owner', 'schedule.write'),
    ('owner', 'crm.read'),
    ('owner', 'crm.write'),
    ('owner', 'clinical.read'),
    ('owner', 'clinical.write'),
    ('owner', 'clinical.read.all'),
    ('owner', 'documents.read'),
    ('owner', 'documents.write'),
    ('owner', 'finance.read'),
    ('owner', 'finance.write'),
    ('owner', 'settings.read'),
    ('owner', 'settings.write'),
    ('owner', 'community.read'),
    ('owner', 'community.write'),
    ('admin', 'platform.read'),
    ('admin', 'users.read'),
    ('admin', 'users.write'),
    ('admin', 'roles.read'),
    ('admin', 'roles.write'),
    ('admin', 'audit.read'),
    ('admin', 'patients.read'),
    ('admin', 'patients.write'),
    ('admin', 'schedule.read'),
    ('admin', 'schedule.write'),
    ('admin', 'crm.read'),
    ('admin', 'crm.write'),
    ('admin', 'clinical.read'),
    ('admin', 'clinical.write'),
    ('admin', 'documents.read'),
    ('admin', 'documents.write'),
    ('admin', 'finance.read'),
    ('admin', 'finance.write'),
    ('admin', 'settings.read'),
    ('admin', 'settings.write'),
    ('manager', 'platform.read'),
    ('manager', 'users.read'),
    ('manager', 'patients.read'),
    ('manager', 'patients.write'),
    ('manager', 'schedule.read'),
    ('manager', 'schedule.write'),
    ('manager', 'crm.read'),
    ('manager', 'crm.write'),
    ('manager', 'clinical.read'),
    ('manager', 'documents.read'),
    ('manager', 'finance.read'),
    ('manager', 'settings.read'),
    ('clinician', 'platform.read'),
    ('clinician', 'patients.read'),
    ('clinician', 'schedule.read'),
    ('clinician', 'schedule.write'),
    ('clinician', 'clinical.read'),
    ('clinician', 'clinical.write'),
    ('clinician', 'documents.read'),
    ('physician', 'platform.read'),
    ('physician', 'patients.read'),
    ('physician', 'patients.read.all'),
    ('physician', 'schedule.read'),
    ('physician', 'schedule.write'),
    ('physician', 'clinical.read'),
    ('physician', 'clinical.write'),
    ('physician', 'clinical.read.all'),
    ('physician', 'documents.read'),
    ('physician', 'documents.write'),
    ('nutritionist', 'platform.read'),
    ('nutritionist', 'patients.read'),
    ('nutritionist', 'schedule.read'),
    ('nutritionist', 'schedule.write'),
    ('nutritionist', 'clinical.read'),
    ('nutritionist', 'clinical.write'),
    ('nutritionist', 'documents.read'),
    ('assistant', 'platform.read'),
    ('assistant', 'patients.read'),
    ('assistant', 'patients.write'),
    ('assistant', 'schedule.read'),
    ('assistant', 'schedule.write'),
    ('assistant', 'crm.read'),
    ('assistant', 'crm.write'),
    ('reception', 'platform.read'),
    ('reception', 'patients.read'),
    ('reception', 'patients.write'),
    ('reception', 'schedule.read'),
    ('reception', 'schedule.write'),
    ('sales', 'platform.read'),
    ('sales', 'crm.read'),
    ('sales', 'crm.write'),
    ('sales', 'patients.read'),
    ('nursing', 'platform.read'),
    ('nursing', 'patients.read'),
    ('nursing', 'schedule.read'),
    ('nursing', 'schedule.write'),
    ('nursing', 'clinical.read'),
    ('nursing', 'clinical.write'),
    ('financial', 'platform.read'),
    ('financial', 'finance.read'),
    ('financial', 'finance.write'),
    ('financial', 'settings.read'),
    ('patient', 'documents.read'),
    ('patient', 'community.read')
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

create or replace function private.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    auth.uid(),
    nullif(coalesce(auth.jwt(), '{}'::jsonb) -> 'app_metadata' ->> 'profile_id', '')::uuid,
    nullif(coalesce(auth.jwt(), '{}'::jsonb) ->> 'profile_id', '')::uuid
  )
$$;

create or replace function private.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  with claim_context as (
    select coalesce(
      nullif(coalesce(auth.jwt(), '{}'::jsonb) -> 'app_metadata' ->> 'tenant_id', '')::uuid,
      nullif(coalesce(auth.jwt(), '{}'::jsonb) ->> 'tenant_id', '')::uuid
    ) as tenant_id
  ),
  profile_context as (
    select profiles.default_tenant_id as tenant_id
    from identity.profiles as profiles
    where profiles.id = private.current_profile_id()
      and profiles.status in ('invited', 'active')
    limit 1
  ),
  membership_context as (
    select memberships.tenant_id
    from identity.memberships as memberships
    where memberships.profile_id = private.current_profile_id()
      and memberships.status = 'active'
    order by memberships.is_default desc, memberships.created_at asc
    limit 1
  )
  select coalesce(
    (select tenant_id from claim_context),
    (select tenant_id from profile_context),
    (select tenant_id from membership_context)
  )
$$;

create or replace function private.current_membership_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select memberships.id
  from identity.memberships as memberships
  where memberships.profile_id = private.current_profile_id()
    and memberships.tenant_id = private.current_tenant_id()
    and memberships.status = 'active'
  order by memberships.is_default desc, memberships.created_at asc
  limit 1
$$;

create or replace function private.current_tenant_role_code()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select roles.code
  from identity.memberships as memberships
  join identity.roles as roles
    on roles.id = memberships.role_id
  where memberships.profile_id = private.current_profile_id()
    and memberships.tenant_id = private.current_tenant_id()
    and memberships.status = 'active'
    and roles.status = 'active'
  order by memberships.is_default desc, memberships.created_at asc
  limit 1
$$;

create or replace function private.current_app_role_code()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with role_context as (
    select roles.app_role_code
    from identity.memberships as memberships
    join identity.roles as roles
      on roles.id = memberships.role_id
    where memberships.profile_id = private.current_profile_id()
      and memberships.tenant_id = private.current_tenant_id()
      and memberships.status = 'active'
      and roles.status = 'active'
    order by memberships.is_default desc, memberships.created_at asc
    limit 1
  )
  select coalesce(
    (select app_role_code from role_context),
    nullif(coalesce(auth.jwt(), '{}'::jsonb) -> 'app_metadata' ->> 'role', ''),
    nullif(coalesce(auth.jwt(), '{}'::jsonb) ->> 'role', ''),
    'assistant'
  )
$$;

create or replace function private.current_permission_codes()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  with relational_permissions as (
    select distinct permissions.code
    from identity.memberships as memberships
    join identity.roles as roles
      on roles.id = memberships.role_id
    join identity.role_permissions as role_permissions
      on role_permissions.role_id = roles.id
    join identity.permissions as permissions
      on permissions.id = role_permissions.permission_id
    where memberships.profile_id = private.current_profile_id()
      and memberships.tenant_id = private.current_tenant_id()
      and memberships.status = 'active'
      and roles.status = 'active'
      and permissions.status = 'active'
  ),
  claim_permissions as (
    select granted_code as code
    from jsonb_array_elements_text(
      coalesce(
        coalesce(auth.jwt(), '{}'::jsonb) -> 'app_metadata' -> 'permissions',
        coalesce(auth.jwt(), '{}'::jsonb) -> 'permissions',
        '[]'::jsonb
      )
    ) as granted_code
  )
  select coalesce(
    array(
      select distinct code
      from (
        select code from relational_permissions
        union
        select code from claim_permissions
      ) as merged_permissions
      order by code
    ),
    '{}'::text[]
  )
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

create or replace function private.current_unit_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  with claim_units as (
    select nullif(unit_id, '')::uuid as unit_id
    from jsonb_array_elements_text(
      coalesce(
        coalesce(auth.jwt(), '{}'::jsonb) -> 'app_metadata' -> 'unit_ids',
        coalesce(auth.jwt(), '{}'::jsonb) -> 'unit_ids',
        '[]'::jsonb
      )
    ) as unit_id
  ),
  relational_units as (
    select unit_memberships.unit_id
    from identity.unit_memberships as unit_memberships
    where unit_memberships.membership_id = private.current_membership_id()
      and unit_memberships.status = 'active'
  ),
  tenant_fallback_units as (
    select units.id as unit_id
    from platform.units as units
    where units.tenant_id = private.current_tenant_id()
      and units.status = 'active'
      and units.deleted_at is null
      and not exists (
        select 1
        from relational_units
      )
  )
  select coalesce(
    array(
      select distinct unit_id
      from (
        select unit_id from claim_units
        union
        select unit_id from relational_units
        union
        select unit_id from tenant_fallback_units
      ) as effective_units
      where unit_id is not null
      order by unit_id
    ),
    '{}'::uuid[]
  )
$$;

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select profiles.platform_role in ('platform_owner', 'platform_support')
      from identity.profiles as profiles
      where profiles.id = private.current_profile_id()
      limit 1
    ),
    false
  )
  or coalesce(
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

create or replace function private.profile_is_member_of_current_tenant(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_profile_id is not null
    and (
      private.is_platform_admin()
      or exists (
        select 1
        from identity.memberships as memberships
        where memberships.profile_id = target_profile_id
          and memberships.tenant_id = private.current_tenant_id()
          and memberships.status = 'active'
      )
    )
$$;

create or replace function private.has_permission(requested_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    requested_code is not null
    and (
      private.is_platform_admin()
      or requested_code = any (private.current_permission_codes())
    )
$$;

create or replace function private.can_manage_tenant_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_platform_admin()
    or private.has_permission('users.write')
    or private.has_permission('roles.write')
$$;

create or replace function private.can_manage_tenant_settings()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_platform_admin()
    or private.has_permission('platform.write')
    or private.has_permission('settings.write')
$$;

create or replace function private.can_access_patient(target_patient_id uuid)
returns boolean
language sql
stable
security definer
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

revoke all on function private.current_profile_id() from public, anon;
revoke all on function private.current_tenant_id() from public, anon;
revoke all on function private.current_membership_id() from public, anon;
revoke all on function private.current_tenant_role_code() from public, anon;
revoke all on function private.current_app_role_code() from public, anon;
revoke all on function private.current_permission_codes() from public, anon;
revoke all on function private.current_app_permission_codes() from public, anon;
revoke all on function private.current_unit_ids() from public, anon;
revoke all on function private.is_platform_admin() from public, anon;
revoke all on function private.profile_is_member_of_current_tenant(uuid) from public, anon;
revoke all on function private.has_permission(text) from public, anon;
revoke all on function private.can_manage_tenant_access() from public, anon;
revoke all on function private.can_manage_tenant_settings() from public, anon;
revoke all on function private.can_access_patient(uuid) from public, anon;

grant execute on function private.current_profile_id() to authenticated, service_role;
grant execute on function private.current_tenant_id() to authenticated, service_role;
grant execute on function private.current_membership_id() to authenticated, service_role;
grant execute on function private.current_tenant_role_code() to authenticated, service_role;
grant execute on function private.current_app_role_code() to authenticated, service_role;
grant execute on function private.current_permission_codes() to authenticated, service_role;
grant execute on function private.current_app_permission_codes() to authenticated, service_role;
grant execute on function private.current_unit_ids() to authenticated, service_role;
grant execute on function private.is_platform_admin() to authenticated, service_role;
grant execute on function private.profile_is_member_of_current_tenant(uuid) to authenticated, service_role;
grant execute on function private.has_permission(text) to authenticated, service_role;
grant execute on function private.can_manage_tenant_access() to authenticated, service_role;
grant execute on function private.can_manage_tenant_settings() to authenticated, service_role;
grant execute on function private.can_access_patient(uuid) to authenticated, service_role;

alter table platform.tenants enable row level security;
alter table platform.units enable row level security;
alter table platform.feature_flags enable row level security;
alter table platform.branding_settings enable row level security;
alter table identity.profiles enable row level security;
alter table identity.permissions enable row level security;
alter table identity.roles enable row level security;
alter table identity.role_permissions enable row level security;
alter table identity.memberships enable row level security;
alter table identity.unit_memberships enable row level security;
alter table identity.invitation_tokens enable row level security;
alter table identity.access_sessions enable row level security;

create policy tenants_select_current_scope
on platform.tenants
for select
to authenticated
using (
  private.is_platform_admin()
  or id = private.current_tenant_id()
);

create policy tenants_update_manage_settings
on platform.tenants
for update
to authenticated
using (
  private.is_platform_admin()
  or (
    id = private.current_tenant_id()
    and private.can_manage_tenant_settings()
  )
)
with check (
  private.is_platform_admin()
  or (
    id = private.current_tenant_id()
    and private.can_manage_tenant_settings()
  )
);

create policy units_select_current_scope
on platform.units
for select
to authenticated
using (
  private.is_platform_admin()
  or (
    tenant_id = private.current_tenant_id()
    and id = any (private.current_unit_ids())
  )
);

create policy units_manage_current_tenant
on platform.units
for all
to authenticated
using (
  private.is_platform_admin()
  or (
    tenant_id = private.current_tenant_id()
    and private.can_manage_tenant_settings()
  )
)
with check (
  private.is_platform_admin()
  or (
    tenant_id = private.current_tenant_id()
    and private.can_manage_tenant_settings()
  )
);

create policy feature_flags_select_current_scope
on platform.feature_flags
for select
to authenticated
using (
  private.is_platform_admin()
  or tenant_id = private.current_tenant_id()
);

create policy feature_flags_manage_current_tenant
on platform.feature_flags
for all
to authenticated
using (
  private.is_platform_admin()
  or (
    tenant_id = private.current_tenant_id()
    and private.can_manage_tenant_settings()
  )
)
with check (
  private.is_platform_admin()
  or (
    tenant_id = private.current_tenant_id()
    and private.can_manage_tenant_settings()
  )
);

create policy branding_settings_select_current_scope
on platform.branding_settings
for select
to authenticated
using (
  private.is_platform_admin()
  or tenant_id = private.current_tenant_id()
);

create policy branding_settings_manage_current_tenant
on platform.branding_settings
for all
to authenticated
using (
  private.is_platform_admin()
  or (
    tenant_id = private.current_tenant_id()
    and private.can_manage_tenant_settings()
  )
)
with check (
  private.is_platform_admin()
  or (
    tenant_id = private.current_tenant_id()
    and private.can_manage_tenant_settings()
  )
);

create policy profiles_select_self_or_tenant_scope
on identity.profiles
for select
to authenticated
using (
  id = private.current_profile_id()
  or private.is_platform_admin()
  or (
    private.can_manage_tenant_access()
    and private.profile_is_member_of_current_tenant(id)
  )
);

create policy profiles_insert_access_managers
on identity.profiles
for insert
to authenticated
with check (
  private.is_platform_admin()
  or private.can_manage_tenant_access()
);

create policy profiles_update_self_or_access_managers
on identity.profiles
for update
to authenticated
using (
  id = private.current_profile_id()
  or private.is_platform_admin()
  or (
    private.can_manage_tenant_access()
    and private.profile_is_member_of_current_tenant(id)
  )
)
with check (
  id = private.current_profile_id()
  or private.is_platform_admin()
  or (
    private.can_manage_tenant_access()
    and (
      default_tenant_id is null
      or default_tenant_id = private.current_tenant_id()
    )
  )
);

create policy permissions_select_authenticated
on identity.permissions
for select
to authenticated
using (true);

create policy roles_select_current_scope
on identity.roles
for select
to authenticated
using (
  private.is_platform_admin()
  or tenant_id is null
  or tenant_id = private.current_tenant_id()
);

create policy roles_manage_current_scope
on identity.roles
for all
to authenticated
using (
  private.is_platform_admin()
  or (
    tenant_id = private.current_tenant_id()
    and private.can_manage_tenant_access()
  )
)
with check (
  private.is_platform_admin()
  or (
    tenant_id = private.current_tenant_id()
    and private.can_manage_tenant_access()
  )
);

create policy role_permissions_select_current_scope
on identity.role_permissions
for select
to authenticated
using (
  exists (
    select 1
    from identity.roles as roles
    where roles.id = role_permissions.role_id
      and (
        private.is_platform_admin()
        or roles.tenant_id is null
        or roles.tenant_id = private.current_tenant_id()
      )
  )
);

create policy role_permissions_manage_current_scope
on identity.role_permissions
for all
to authenticated
using (
  exists (
    select 1
    from identity.roles as roles
    where roles.id = role_permissions.role_id
      and (
        private.is_platform_admin()
        or (
          roles.tenant_id = private.current_tenant_id()
          and private.can_manage_tenant_access()
        )
      )
  )
)
with check (
  exists (
    select 1
    from identity.roles as roles
    where roles.id = role_permissions.role_id
      and (
        private.is_platform_admin()
        or (
          roles.tenant_id = private.current_tenant_id()
          and private.can_manage_tenant_access()
        )
      )
  )
);

create policy memberships_select_self_or_current_tenant
on identity.memberships
for select
to authenticated
using (
  profile_id = private.current_profile_id()
  or private.is_platform_admin()
  or (
    tenant_id = private.current_tenant_id()
    and (
      private.has_permission('users.read')
      or private.has_permission('users.write')
      or private.has_permission('audit.read')
    )
  )
);

create policy memberships_manage_current_tenant
on identity.memberships
for all
to authenticated
using (
  private.is_platform_admin()
  or (
    tenant_id = private.current_tenant_id()
    and private.can_manage_tenant_access()
  )
)
with check (
  private.is_platform_admin()
  or (
    tenant_id = private.current_tenant_id()
    and private.can_manage_tenant_access()
  )
);

create policy unit_memberships_select_self_or_current_tenant
on identity.unit_memberships
for select
to authenticated
using (
  exists (
    select 1
    from identity.memberships as memberships
    where memberships.id = unit_memberships.membership_id
      and (
        memberships.profile_id = private.current_profile_id()
        or private.is_platform_admin()
        or (
          memberships.tenant_id = private.current_tenant_id()
          and (
            private.has_permission('users.read')
            or private.has_permission('users.write')
            or private.has_permission('audit.read')
          )
        )
      )
  )
);

create policy unit_memberships_manage_current_tenant
on identity.unit_memberships
for all
to authenticated
using (
  exists (
    select 1
    from identity.memberships as memberships
    where memberships.id = unit_memberships.membership_id
      and (
        private.is_platform_admin()
        or (
          memberships.tenant_id = private.current_tenant_id()
          and private.can_manage_tenant_access()
        )
      )
  )
)
with check (
  exists (
    select 1
    from identity.memberships as memberships
    join platform.units as units
      on units.id = unit_memberships.unit_id
    where memberships.id = unit_memberships.membership_id
      and units.id = unit_memberships.unit_id
      and (
        private.is_platform_admin()
        or (
          memberships.tenant_id = private.current_tenant_id()
          and units.tenant_id = private.current_tenant_id()
          and private.can_manage_tenant_access()
        )
      )
  )
);

create policy invitation_tokens_select_current_tenant
on identity.invitation_tokens
for select
to authenticated
using (
  private.is_platform_admin()
  or (
    tenant_id = private.current_tenant_id()
    and private.can_manage_tenant_access()
  )
);

create policy invitation_tokens_manage_current_tenant
on identity.invitation_tokens
for all
to authenticated
using (
  private.is_platform_admin()
  or (
    tenant_id = private.current_tenant_id()
    and private.can_manage_tenant_access()
  )
)
with check (
  private.is_platform_admin()
  or (
    tenant_id = private.current_tenant_id()
    and private.can_manage_tenant_access()
  )
);

create policy access_sessions_select_self_or_audit_scope
on identity.access_sessions
for select
to authenticated
using (
  profile_id = private.current_profile_id()
  or private.is_platform_admin()
  or (
    tenant_id = private.current_tenant_id()
    and private.has_permission('audit.read')
  )
);

create policy access_sessions_insert_self
on identity.access_sessions
for insert
to authenticated
with check (
  profile_id = private.current_profile_id()
  and (
    tenant_id is null
    or tenant_id = private.current_tenant_id()
  )
);

create policy access_sessions_update_self_or_audit_scope
on identity.access_sessions
for update
to authenticated
using (
  profile_id = private.current_profile_id()
  or private.is_platform_admin()
  or (
    tenant_id = private.current_tenant_id()
    and private.has_permission('audit.read')
  )
)
with check (
  profile_id = private.current_profile_id()
  or private.is_platform_admin()
  or (
    tenant_id = private.current_tenant_id()
    and private.has_permission('audit.read')
  )
);

create or replace function api.current_access_context(p_current_unit_id uuid default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_profile_id uuid := private.current_profile_id();
  v_tenant_id uuid := private.current_tenant_id();
  v_membership_id uuid := private.current_membership_id();
  v_unit_ids uuid[] := private.current_unit_ids();
  v_permission_codes text[] := private.current_permission_codes();
  v_profile identity.profiles%rowtype;
  v_role_code text := private.current_tenant_role_code();
  v_app_role_code text := private.current_app_role_code();
  v_selected_unit_id uuid;
begin
  select *
  into v_profile
  from identity.profiles
  where id = v_profile_id;

  if p_current_unit_id is not null and p_current_unit_id = any (v_unit_ids) then
    v_selected_unit_id := p_current_unit_id;
  else
    select coalesce(
      (
        select unit_memberships.unit_id
        from identity.unit_memberships as unit_memberships
        where unit_memberships.membership_id = v_membership_id
          and unit_memberships.status = 'active'
          and unit_memberships.is_primary = true
        order by unit_memberships.created_at asc
        limit 1
      ),
      (
        select units.id
        from platform.units as units
        where units.id = any (v_unit_ids)
        order by units.is_default desc, units.created_at asc
        limit 1
      ),
      v_profile.default_unit_id
    )
    into v_selected_unit_id;
  end if;

  return jsonb_build_object(
    'profileId', v_profile_id,
    'tenantId', v_tenant_id,
    'membershipId', v_membership_id,
    'roleCode', v_role_code,
    'appRoleCode', v_app_role_code,
    'platformRole', v_profile.platform_role,
    'currentUnitId', v_selected_unit_id,
    'unitIds', to_jsonb(coalesce(v_unit_ids, '{}'::uuid[])),
    'permissionCodes', to_jsonb(coalesce(v_permission_codes, '{}'::text[])),
    'profile', jsonb_build_object(
      'id', v_profile_id,
      'email', coalesce(v_profile.email::text, auth.jwt() ->> 'email'),
      'fullName', coalesce(v_profile.full_name, v_profile.display_name, auth.jwt() ->> 'email')
    )
  );
end;
$$;

create or replace function api.current_app_session(p_current_unit_id uuid default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_context jsonb := api.current_access_context(p_current_unit_id);
  v_selected_unit_id uuid := nullif(v_context ->> 'currentUnitId', '')::uuid;
  v_app_permissions text[] := private.current_app_permission_codes();
  v_units jsonb;
begin
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', units.id,
        'name', units.name,
        'city', coalesce(units.city, 'Sem cidade')
      )
      order by units.is_default desc, units.created_at asc
    ),
    '[]'::jsonb
  )
  into v_units
  from platform.units as units
  where units.id = any (private.current_unit_ids());

  return jsonb_build_object(
    'tenantId', v_context ->> 'tenantId',
    'user', jsonb_build_object(
      'id', v_context -> 'profile' ->> 'id',
      'name', v_context -> 'profile' ->> 'fullName',
      'email', v_context -> 'profile' ->> 'email',
      'role', coalesce(v_context ->> 'appRoleCode', 'assistant')
    ),
    'units', v_units,
    'currentUnitId', v_selected_unit_id,
    'accessibleUnitIds', to_jsonb(coalesce(private.current_unit_ids(), '{}'::uuid[])),
    'permissions', to_jsonb(coalesce(v_app_permissions, '{}'::text[]))
  );
end;
$$;

revoke all on function api.current_access_context(uuid) from public, anon;
revoke all on function api.current_app_session(uuid) from public, anon;

grant execute on function api.current_access_context(uuid) to authenticated, service_role;
grant execute on function api.current_app_session(uuid) to authenticated, service_role;
