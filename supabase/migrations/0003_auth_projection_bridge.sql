create or replace function api.upsert_legacy_auth_projection(
  p_auth_user_id uuid,
  p_email text,
  p_full_name text,
  p_phone text default null,
  p_user_status text default 'ACTIVE',
  p_legacy_user_id text default null,
  p_legacy_tenant_id text default null,
  p_legacy_tenant_legal_name text default null,
  p_legacy_tenant_trade_name text default null,
  p_legacy_tenant_status text default 'ACTIVE',
  p_subscription_plan_code text default null,
  p_app_role_code text default 'assistant',
  p_units jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runtime_tenant_id uuid;
  v_runtime_unit_id uuid;
  v_runtime_unit_ids uuid[] := '{}'::uuid[];
  v_default_runtime_unit_id uuid;
  v_runtime_role_id uuid;
  v_runtime_membership_id uuid;
  v_unit jsonb;
  v_legacy_unit_id text;
  v_unit_name text;
  v_unit_code text;
  v_unit_city text;
  v_unit_status text;
  v_runtime_access_level text;
  v_user_status text;
  v_tenant_status text;
  v_runtime_role_code text;
begin
  if p_auth_user_id is null then
    raise exception 'p_auth_user_id is required';
  end if;

  if nullif(trim(coalesce(p_email, '')), '') is null then
    raise exception 'p_email is required';
  end if;

  if nullif(trim(coalesce(p_legacy_user_id, '')), '') is null then
    raise exception 'p_legacy_user_id is required';
  end if;

  if nullif(trim(coalesce(p_legacy_tenant_id, '')), '') is null then
    raise exception 'p_legacy_tenant_id is required';
  end if;

  if nullif(trim(coalesce(p_legacy_tenant_legal_name, '')), '') is null then
    raise exception 'p_legacy_tenant_legal_name is required';
  end if;

  v_user_status := case upper(coalesce(p_user_status, 'ACTIVE'))
    when 'INVITED' then 'invited'
    when 'SUSPENDED' then 'suspended'
    when 'DISABLED' then 'disabled'
    else 'active'
  end;

  v_tenant_status := case upper(coalesce(p_legacy_tenant_status, 'ACTIVE'))
    when 'ARCHIVED' then 'archived'
    when 'INACTIVE' then 'suspended'
    else 'active'
  end;

  v_runtime_role_code := case lower(coalesce(p_app_role_code, 'assistant'))
    when 'owner' then 'owner'
    when 'admin' then 'admin'
    when 'manager' then 'manager'
    when 'clinician' then 'clinician'
    when 'assistant' then 'assistant'
    when 'physician' then 'physician'
    when 'nutritionist' then 'nutritionist'
    when 'reception' then 'reception'
    when 'sales' then 'sales'
    when 'nursing' then 'nursing'
    when 'financial' then 'financial'
    else 'assistant'
  end;

  v_runtime_access_level := case v_runtime_role_code
    when 'owner' then 'manager'
    when 'admin' then 'manager'
    when 'manager' then 'manager'
    when 'clinician' then 'clinical'
    when 'physician' then 'clinical'
    when 'nutritionist' then 'clinical'
    when 'nursing' then 'clinical'
    when 'sales' then 'viewer'
    when 'financial' then 'viewer'
    else 'member'
  end;

  select tenants.id
  into v_runtime_tenant_id
  from platform.tenants as tenants
  where tenants.metadata @> jsonb_build_object('legacy_tenant_id', p_legacy_tenant_id)
  limit 1;

  if v_runtime_tenant_id is null then
    insert into platform.tenants (
      id,
      legal_name,
      trade_name,
      status,
      subscription_plan_code,
      default_timezone,
      metadata
    )
    values (
      gen_random_uuid(),
      p_legacy_tenant_legal_name,
      p_legacy_tenant_trade_name,
      v_tenant_status,
      p_subscription_plan_code,
      'America/Sao_Paulo',
      jsonb_build_object(
        'legacy_tenant_id', p_legacy_tenant_id,
        'source', 'prisma_bootstrap'
      )
    )
    returning id into v_runtime_tenant_id;
  else
    update platform.tenants as tenants
    set
      legal_name = p_legacy_tenant_legal_name,
      trade_name = p_legacy_tenant_trade_name,
      status = v_tenant_status,
      subscription_plan_code = p_subscription_plan_code,
      metadata = coalesce(tenants.metadata, '{}'::jsonb) || jsonb_build_object(
        'legacy_tenant_id', p_legacy_tenant_id,
        'source', 'prisma_bootstrap'
      )
    where tenants.id = v_runtime_tenant_id;
  end if;

  for v_unit in
    select value
    from jsonb_array_elements(coalesce(p_units, '[]'::jsonb))
  loop
    v_legacy_unit_id := nullif(trim(coalesce(v_unit ->> 'id', '')), '');

    if v_legacy_unit_id is null then
      continue;
    end if;

    v_unit_name := coalesce(nullif(trim(coalesce(v_unit ->> 'name', '')), ''), v_legacy_unit_id);
    v_unit_code := coalesce(
      nullif(trim(coalesce(v_unit ->> 'code', '')), ''),
      format('legacy-%s', v_legacy_unit_id)
    );
    v_unit_city := coalesce(nullif(trim(coalesce(v_unit ->> 'city', '')), ''), 'Sem cidade');
    v_unit_status := case upper(coalesce(v_unit ->> 'status', 'ACTIVE'))
      when 'INACTIVE' then 'inactive'
      else 'active'
    end;

    select units.id
    into v_runtime_unit_id
    from platform.units as units
    where units.tenant_id = v_runtime_tenant_id
      and units.metadata @> jsonb_build_object('legacy_unit_id', v_legacy_unit_id)
    limit 1;

    if v_runtime_unit_id is null then
      insert into platform.units (
        id,
        tenant_id,
        name,
        code,
        city,
        status,
        is_default,
        deleted_at,
        metadata
      )
      values (
        gen_random_uuid(),
        v_runtime_tenant_id,
        v_unit_name,
        v_unit_code,
        v_unit_city,
        v_unit_status,
        false,
        nullif(v_unit ->> 'deletedAt', '')::timestamptz,
        jsonb_build_object(
          'legacy_unit_id', v_legacy_unit_id,
          'source', 'prisma_bootstrap'
        )
      )
      returning id into v_runtime_unit_id;
    else
      update platform.units as units
      set
        name = v_unit_name,
        code = v_unit_code,
        city = v_unit_city,
        status = v_unit_status,
        deleted_at = nullif(v_unit ->> 'deletedAt', '')::timestamptz,
        metadata = coalesce(units.metadata, '{}'::jsonb) || jsonb_build_object(
          'legacy_unit_id', v_legacy_unit_id,
          'source', 'prisma_bootstrap'
        )
      where units.id = v_runtime_unit_id;
    end if;

    v_runtime_unit_ids := array_append(v_runtime_unit_ids, v_runtime_unit_id);

    if v_default_runtime_unit_id is null then
      v_default_runtime_unit_id := v_runtime_unit_id;
    end if;
  end loop;

  if coalesce(array_length(v_runtime_unit_ids, 1), 0) = 0 then
    raise exception 'p_units must contain at least one unit';
  end if;

  update platform.units
  set is_default = false
  where tenant_id = v_runtime_tenant_id;

  update platform.units
  set is_default = true
  where id = v_default_runtime_unit_id;

  insert into identity.profiles as profiles (
    id,
    email,
    full_name,
    display_name,
    phone,
    status,
    default_tenant_id,
    default_unit_id,
    last_seen_at,
    metadata
  )
  values (
    p_auth_user_id,
    p_email,
    p_full_name,
    p_full_name,
    p_phone,
    v_user_status,
    v_runtime_tenant_id,
    v_default_runtime_unit_id,
    now(),
    jsonb_build_object(
      'legacy_user_id', p_legacy_user_id,
      'legacy_tenant_id', p_legacy_tenant_id,
      'source', 'prisma_bootstrap'
    )
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = excluded.full_name,
    display_name = excluded.display_name,
    phone = excluded.phone,
    status = excluded.status,
    default_tenant_id = excluded.default_tenant_id,
    default_unit_id = excluded.default_unit_id,
    last_seen_at = excluded.last_seen_at,
    metadata = coalesce(profiles.metadata, '{}'::jsonb) || excluded.metadata;

  select roles.id
  into v_runtime_role_id
  from identity.roles as roles
  where roles.tenant_id is null
    and roles.code = v_runtime_role_code
    and roles.status = 'active'
  limit 1;

  if v_runtime_role_id is null then
    select roles.id
    into v_runtime_role_id
    from identity.roles as roles
    where roles.tenant_id is null
      and roles.code = 'assistant'
      and roles.status = 'active'
    limit 1;
  end if;

  insert into identity.memberships as memberships (
    profile_id,
    tenant_id,
    role_id,
    status,
    is_default,
    joined_at,
    last_seen_at,
    metadata
  )
  values (
    p_auth_user_id,
    v_runtime_tenant_id,
    v_runtime_role_id,
    'active',
    true,
    now(),
    now(),
    jsonb_build_object(
      'legacy_user_id', p_legacy_user_id,
      'legacy_tenant_id', p_legacy_tenant_id,
      'legacy_role_code', v_runtime_role_code,
      'source', 'prisma_bootstrap'
    )
  )
  on conflict (profile_id, tenant_id) do update
  set
    role_id = excluded.role_id,
    status = 'active',
    is_default = true,
    joined_at = coalesce(memberships.joined_at, excluded.joined_at),
    last_seen_at = excluded.last_seen_at,
    revoked_at = null,
    metadata = coalesce(memberships.metadata, '{}'::jsonb) || excluded.metadata
  returning id into v_runtime_membership_id;

  update identity.unit_memberships
  set
    status = 'inactive',
    is_primary = false,
    updated_at = now()
  where membership_id = v_runtime_membership_id;

  foreach v_runtime_unit_id in array v_runtime_unit_ids
  loop
    insert into identity.unit_memberships as unit_memberships (
      membership_id,
      unit_id,
      access_level,
      status,
      is_primary
    )
    values (
      v_runtime_membership_id,
      v_runtime_unit_id,
      v_runtime_access_level,
      'active',
      v_runtime_unit_id = v_default_runtime_unit_id
    )
    on conflict (membership_id, unit_id) do update
    set
      access_level = excluded.access_level,
      status = 'active',
      is_primary = excluded.is_primary,
      updated_at = now();
  end loop;

  return jsonb_build_object(
    'profileId', p_auth_user_id,
    'tenantId', v_runtime_tenant_id,
    'membershipId', v_runtime_membership_id,
    'unitIds', to_jsonb(v_runtime_unit_ids)
  );
end;
$$;

revoke all on function api.upsert_legacy_auth_projection(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) from public, anon, authenticated;

grant execute on function api.upsert_legacy_auth_projection(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) to service_role;

create or replace function api.current_app_session(p_current_unit_id uuid default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_context jsonb := api.current_access_context(p_current_unit_id);
  v_runtime_tenant_id uuid := nullif(v_context ->> 'tenantId', '')::uuid;
  v_profile_id uuid := nullif(v_context -> 'profile' ->> 'id', '')::uuid;
  v_selected_runtime_unit_id uuid := nullif(v_context ->> 'currentUnitId', '')::uuid;
  v_app_permissions text[] := private.current_app_permission_codes();
  v_units jsonb;
  v_accessible_unit_ids text[];
begin
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', coalesce(units.metadata ->> 'legacy_unit_id', units.id::text),
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

  select coalesce(
    array(
      select coalesce(units.metadata ->> 'legacy_unit_id', units.id::text)
      from platform.units as units
      where units.id = any (private.current_unit_ids())
      order by units.is_default desc, units.created_at asc
    ),
    '{}'::text[]
  )
  into v_accessible_unit_ids;

  return jsonb_build_object(
    'tenantId',
    coalesce(
      (
        select tenants.metadata ->> 'legacy_tenant_id'
        from platform.tenants as tenants
        where tenants.id = v_runtime_tenant_id
        limit 1
      ),
      v_context ->> 'tenantId'
    ),
    'user', jsonb_build_object(
      'id',
      coalesce(
        (
          select profiles.metadata ->> 'legacy_user_id'
          from identity.profiles as profiles
          where profiles.id = v_profile_id
          limit 1
        ),
        v_context -> 'profile' ->> 'id'
      ),
      'name', v_context -> 'profile' ->> 'fullName',
      'email', v_context -> 'profile' ->> 'email',
      'role', coalesce(v_context ->> 'appRoleCode', 'assistant')
    ),
    'units', v_units,
    'currentUnitId',
    coalesce(
      (
        select coalesce(units.metadata ->> 'legacy_unit_id', units.id::text)
        from platform.units as units
        where units.id = v_selected_runtime_unit_id
        limit 1
      ),
      v_selected_runtime_unit_id::text
    ),
    'accessibleUnitIds', to_jsonb(v_accessible_unit_ids),
    'permissions', to_jsonb(coalesce(v_app_permissions, '{}'::text[]))
  );
end;
$$;
