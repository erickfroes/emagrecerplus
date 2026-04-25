create or replace function api.create_team_invitation(
  p_email text,
  p_role_code text,
  p_unit_ids uuid[] default null,
  p_expires_in_days integer default 7,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := private.current_tenant_id();
  v_profile_id uuid := private.current_profile_id();
  v_role_id uuid;
  v_role identity.roles%rowtype;
  v_email text;
  v_unit_ids uuid[];
  v_invalid_unit_count integer := 0;
  v_raw_token text;
  v_token_hash text;
  v_invitation identity.invitation_tokens%rowtype;
begin
  if not private.can_manage_tenant_access() then
    raise exception 'Usuario sem permissao para gerenciar acessos.';
  end if;

  if v_tenant_id is null then
    raise exception 'Nao foi possivel determinar o tenant atual.';
  end if;

  v_email := nullif(lower(trim(coalesce(p_email, ''))), '');

  if v_email is null then
    raise exception 'p_email is required';
  end if;

  if position('@' in v_email) <= 1
    or split_part(v_email, '@', 2) = ''
    or position('.' in split_part(v_email, '@', 2)) <= 1 then
    raise exception 'E-mail de convite invalido.';
  end if;

  v_role_id := private.resolve_active_role_id(v_tenant_id, p_role_code);

  if v_role_id is null then
    raise exception 'Role de convite invalida ou inativa.';
  end if;

  select *
  into v_role
  from identity.roles as roles
  where roles.id = v_role_id;

  if coalesce(array_length(p_unit_ids, 1), 0) > 0 then
    select count(*)
    into v_invalid_unit_count
    from unnest(p_unit_ids) as requested_unit_id
    left join platform.units as units
      on units.id = requested_unit_id
     and units.tenant_id = v_tenant_id
     and units.deleted_at is null
     and units.status = 'active'
    where units.id is null;

    if v_invalid_unit_count > 0 then
      raise exception 'Convite contem unidades invalidas ou fora do tenant.';
    end if;

    select coalesce(
      array_agg(units.id order by units.is_default desc, units.created_at asc),
      '{}'::uuid[]
    )
    into v_unit_ids
    from platform.units as units
    where units.id = any (p_unit_ids);
  else
    select coalesce(
      array_agg(units.id order by units.is_default desc, units.created_at asc),
      '{}'::uuid[]
    )
    into v_unit_ids
    from platform.units as units
    where units.tenant_id = v_tenant_id
      and units.deleted_at is null
      and units.status = 'active';
  end if;

  if coalesce(array_length(v_unit_ids, 1), 0) = 0 then
    raise exception 'Convite sem unidades elegiveis.';
  end if;

  update identity.invitation_tokens
  set
    status = case
      when status = 'pending' and expires_at <= now() then 'expired'
      else 'revoked'
    end
  where tenant_id = v_tenant_id
    and email = v_email
    and status = 'pending';

  v_raw_token := encode(extensions.gen_random_bytes(24), 'hex');
  v_token_hash := encode(extensions.digest(v_raw_token, 'sha256'), 'hex');

  insert into identity.invitation_tokens (
    tenant_id,
    role_id,
    email,
    token_hash,
    status,
    invited_by_profile_id,
    metadata,
    expires_at
  )
  values (
    v_tenant_id,
    v_role_id,
    v_email,
    v_token_hash,
    'pending',
    v_profile_id,
    jsonb_build_object(
      'role_code', v_role.code,
      'app_role_code', v_role.app_role_code,
      'unit_ids', to_jsonb(v_unit_ids),
      'note', nullif(trim(coalesce(p_note, '')), ''),
      'source', 'settings_access'
    ),
    now() + make_interval(days => greatest(1, least(coalesce(p_expires_in_days, 7), 30)))
  )
  returning *
  into v_invitation;

  perform private.record_audit_event(
    v_tenant_id,
    v_unit_ids[1],
    null,
    'profile',
    v_profile_id,
    'identity.invitation.created',
    'create',
    'identity',
    'invitation_tokens',
    v_invitation.id,
    jsonb_build_object(
      'email', v_invitation.email,
      'roleCode', v_role.code,
      'appRoleCode', v_role.app_role_code,
      'unitIds', to_jsonb(v_unit_ids)
    ),
    null,
    null
  );

  return jsonb_build_object(
    'id', v_invitation.id,
    'email', v_invitation.email,
    'status', v_invitation.status,
    'roleCode', v_role.code,
    'roleName', v_role.name,
    'appRoleCode', v_role.app_role_code,
    'unitIds', to_jsonb(v_unit_ids),
    'createdAt', v_invitation.created_at,
    'expiresAt', v_invitation.expires_at
  );
end;
$$;

create or replace function api.bootstrap_tenant_onboarding(
  p_auth_user_id uuid,
  p_email text,
  p_full_name text,
  p_legal_name text,
  p_trade_name text default null,
  p_unit_name text default 'Matriz',
  p_city text default null,
  p_timezone text default 'America/Sao_Paulo',
  p_slug text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_role_id uuid;
  v_tenant_id uuid;
  v_unit_id uuid;
  v_membership_id uuid;
  v_email text;
begin
  if p_auth_user_id is null then
    raise exception 'p_auth_user_id is required';
  end if;

  v_email := nullif(lower(trim(coalesce(p_email, ''))), '');

  if v_email is null then
    raise exception 'p_email is required';
  end if;

  if nullif(trim(coalesce(p_full_name, '')), '') is null then
    raise exception 'p_full_name is required';
  end if;

  if nullif(trim(coalesce(p_legal_name, '')), '') is null then
    raise exception 'p_legal_name is required';
  end if;

  if nullif(trim(coalesce(p_unit_name, '')), '') is null then
    raise exception 'p_unit_name is required';
  end if;

  v_owner_role_id := private.resolve_active_role_id(null, 'owner');

  if v_owner_role_id is null then
    raise exception 'Role owner indisponivel para onboarding.';
  end if;

  insert into platform.tenants (
    legal_name,
    trade_name,
    slug,
    status,
    default_timezone,
    metadata
  )
  values (
    trim(p_legal_name),
    nullif(trim(coalesce(p_trade_name, '')), ''),
    nullif(trim(coalesce(p_slug, '')), ''),
    'trial',
    coalesce(nullif(trim(coalesce(p_timezone, '')), ''), 'America/Sao_Paulo'),
    jsonb_build_object(
      'source', 'bootstrap_tenant_onboarding'
    )
  )
  returning id into v_tenant_id;

  insert into platform.units (
    tenant_id,
    name,
    city,
    timezone,
    status,
    is_default,
    metadata
  )
  values (
    v_tenant_id,
    trim(p_unit_name),
    nullif(trim(coalesce(p_city, '')), ''),
    coalesce(nullif(trim(coalesce(p_timezone, '')), ''), 'America/Sao_Paulo'),
    'active',
    true,
    jsonb_build_object(
      'source', 'bootstrap_tenant_onboarding'
    )
  )
  returning id into v_unit_id;

  insert into identity.profiles as profiles (
    id,
    email,
    full_name,
    display_name,
    status,
    default_tenant_id,
    default_unit_id,
    metadata
  )
  values (
    p_auth_user_id,
    v_email,
    trim(p_full_name),
    trim(p_full_name),
    'active',
    v_tenant_id,
    v_unit_id,
    jsonb_build_object(
      'source', 'bootstrap_tenant_onboarding'
    )
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = excluded.full_name,
    display_name = excluded.display_name,
    status = 'active',
    default_tenant_id = excluded.default_tenant_id,
    default_unit_id = excluded.default_unit_id,
    metadata = coalesce(profiles.metadata, '{}'::jsonb) || excluded.metadata;

  update identity.memberships
  set is_default = false
  where profile_id = p_auth_user_id
    and status = 'active'
    and is_default = true;

  insert into identity.memberships (
    profile_id,
    tenant_id,
    role_id,
    status,
    is_default,
    joined_at,
    metadata
  )
  values (
    p_auth_user_id,
    v_tenant_id,
    v_owner_role_id,
    'active',
    true,
    now(),
    jsonb_build_object(
      'source', 'bootstrap_tenant_onboarding'
    )
  )
  returning id into v_membership_id;

  insert into identity.unit_memberships (
    membership_id,
    unit_id,
    access_level,
    status,
    is_primary
  )
  values (
    v_membership_id,
    v_unit_id,
    'manager',
    'active',
    true
  );

  insert into platform.branding_settings (
    tenant_id,
    brand_name
  )
  values (
    v_tenant_id,
    coalesce(nullif(trim(coalesce(p_trade_name, '')), ''), trim(p_legal_name))
  )
  on conflict (tenant_id) do nothing;

  perform private.record_audit_event(
    v_tenant_id,
    v_unit_id,
    null,
    'service',
    p_auth_user_id,
    'platform.tenant.bootstrapped',
    'create',
    'platform',
    'tenants',
    v_tenant_id,
    jsonb_build_object(
      'unitId', v_unit_id,
      'membershipId', v_membership_id,
      'email', v_email
    ),
    null,
    null
  );

  return jsonb_build_object(
    'tenantId', v_tenant_id,
    'unitId', v_unit_id,
    'membershipId', v_membership_id
  );
end;
$$;
