create or replace function private.ensure_runtime_unit(
  p_runtime_tenant_id uuid,
  p_legacy_unit_id text,
  p_unit_name text,
  p_unit_code text default null,
  p_city text default null,
  p_status text default 'active',
  p_deleted_at timestamptz default null,
  p_source text default 'runtime_backfill',
  p_is_default boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runtime_unit_id uuid;
  v_legacy_unit_id text := nullif(trim(coalesce(p_legacy_unit_id, '')), '');
  v_unit_name text := nullif(trim(coalesce(p_unit_name, '')), '');
  v_unit_code text := nullif(trim(coalesce(p_unit_code, '')), '');
  v_city text := nullif(trim(coalesce(p_city, '')), '');
  v_status text := case lower(coalesce(p_status, 'active'))
    when 'inactive' then 'inactive'
    when 'archived' then 'archived'
    else 'active'
  end;
  v_source text := coalesce(nullif(trim(coalesce(p_source, '')), ''), 'runtime_backfill');
begin
  if p_runtime_tenant_id is null then
    raise exception 'p_runtime_tenant_id is required';
  end if;

  if v_legacy_unit_id is null then
    raise exception 'p_legacy_unit_id is required';
  end if;

  v_unit_name := coalesce(v_unit_name, v_legacy_unit_id);
  v_unit_code := coalesce(v_unit_code, format('legacy-%s', v_legacy_unit_id));

  perform pg_advisory_xact_lock(
    hashtextextended(format('%s:%s', p_runtime_tenant_id::text, v_legacy_unit_id), 0)
  );

  select units.id
  into v_runtime_unit_id
  from platform.units as units
  where units.tenant_id = p_runtime_tenant_id
    and units.metadata @> jsonb_build_object('legacy_unit_id', v_legacy_unit_id)
  order by units.created_at asc, units.id asc
  limit 1;

  if v_runtime_unit_id is null then
    select units.id
    into v_runtime_unit_id
    from platform.units as units
    where units.tenant_id = p_runtime_tenant_id
      and units.code = v_unit_code
    order by units.created_at asc, units.id asc
    limit 1;
  end if;

  if v_runtime_unit_id is not null then
    update platform.units as units
    set
      name = coalesce(v_unit_name, units.name),
      code = case
        when units.code = v_unit_code then units.code
        when units.code is null then v_unit_code
        when not exists (
          select 1
          from platform.units as conflicting_units
          where conflicting_units.tenant_id = units.tenant_id
            and conflicting_units.code = v_unit_code
            and conflicting_units.id <> units.id
        ) then v_unit_code
        else units.code
      end,
      city = case
        when v_city is null then units.city
        when v_city = 'Sem cidade' and nullif(trim(coalesce(units.city, '')), '') is not null then units.city
        else v_city
      end,
      status = v_status,
      is_default = case when p_is_default then true else units.is_default end,
      deleted_at = p_deleted_at,
      metadata = coalesce(units.metadata, '{}'::jsonb) || jsonb_build_object(
        'legacy_unit_id', v_legacy_unit_id,
        'source', v_source
      )
    where units.id = v_runtime_unit_id
    returning units.id into v_runtime_unit_id;

    return v_runtime_unit_id;
  end if;

  insert into platform.units as units (
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
    p_runtime_tenant_id,
    v_unit_name,
    v_unit_code,
    coalesce(v_city, 'Sem cidade'),
    v_status,
    p_is_default,
    p_deleted_at,
    jsonb_build_object(
      'legacy_unit_id', v_legacy_unit_id,
      'source', v_source
    )
  )
  on conflict on constraint units_tenant_id_code_key do update
  set
    name = coalesce(excluded.name, units.name),
    city = case
      when nullif(trim(coalesce(excluded.city, '')), '') is null then units.city
      when excluded.city = 'Sem cidade' and nullif(trim(coalesce(units.city, '')), '') is not null then units.city
      else excluded.city
    end,
    status = excluded.status,
    is_default = case when excluded.is_default then true else units.is_default end,
    deleted_at = excluded.deleted_at,
    metadata = coalesce(units.metadata, '{}'::jsonb) || excluded.metadata
  returning units.id into v_runtime_unit_id;

  if v_runtime_unit_id is null then
    raise exception 'unable to resolve runtime unit for legacy_unit_id %', v_legacy_unit_id;
  end if;

  return v_runtime_unit_id;
end;
$$;

revoke all on function private.ensure_runtime_unit(
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  text,
  boolean
) from public, anon, authenticated;
grant execute on function private.ensure_runtime_unit(
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  text,
  boolean
) to service_role;

create or replace function api.backfill_runtime_scope(
  p_legacy_tenant_id text,
  p_legacy_tenant_legal_name text,
  p_legacy_tenant_trade_name text default null,
  p_legacy_tenant_status text default 'ACTIVE',
  p_subscription_plan_code text default null,
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
  v_unit jsonb;
  v_legacy_unit_id text;
  v_unit_name text;
  v_unit_code text;
  v_unit_city text;
  v_unit_status text;
  v_tenant_status text;
  v_unit_mappings jsonb := '[]'::jsonb;
begin
  if nullif(trim(coalesce(p_legacy_tenant_id, '')), '') is null then
    raise exception 'p_legacy_tenant_id is required';
  end if;

  if nullif(trim(coalesce(p_legacy_tenant_legal_name, '')), '') is null then
    raise exception 'p_legacy_tenant_legal_name is required';
  end if;

  v_tenant_status := case upper(coalesce(p_legacy_tenant_status, 'ACTIVE'))
    when 'ARCHIVED' then 'archived'
    when 'INACTIVE' then 'suspended'
    else 'active'
  end;

  select private.runtime_tenant_id_by_legacy_tenant_id(p_legacy_tenant_id)
  into v_runtime_tenant_id;

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
        'source', 'runtime_backfill'
      )
    )
    on conflict do nothing
    returning id into v_runtime_tenant_id;

    if v_runtime_tenant_id is null then
      select private.runtime_tenant_id_by_legacy_tenant_id(p_legacy_tenant_id)
      into v_runtime_tenant_id;
    end if;
  end if;

  if v_runtime_tenant_id is null then
    raise exception 'unable to resolve runtime tenant for legacy_tenant_id %', p_legacy_tenant_id;
  end if;

  update platform.tenants as tenants
  set
    legal_name = p_legacy_tenant_legal_name,
    trade_name = p_legacy_tenant_trade_name,
    status = v_tenant_status,
    subscription_plan_code = p_subscription_plan_code,
    metadata = coalesce(tenants.metadata, '{}'::jsonb) || jsonb_build_object(
      'legacy_tenant_id', p_legacy_tenant_id,
      'source', 'runtime_backfill'
    )
  where tenants.id = v_runtime_tenant_id;

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
    v_unit_city := nullif(trim(coalesce(v_unit ->> 'city', '')), '');
    v_unit_status := case upper(coalesce(v_unit ->> 'status', 'ACTIVE'))
      when 'INACTIVE' then 'inactive'
      else 'active'
    end;

    v_runtime_unit_id := private.ensure_runtime_unit(
      p_runtime_tenant_id => v_runtime_tenant_id,
      p_legacy_unit_id => v_legacy_unit_id,
      p_unit_name => v_unit_name,
      p_unit_code => v_unit_code,
      p_city => v_unit_city,
      p_status => v_unit_status,
      p_deleted_at => nullif(v_unit ->> 'deletedAt', '')::timestamptz,
      p_source => 'runtime_backfill',
      p_is_default => false
    );

    v_unit_mappings := v_unit_mappings || jsonb_build_array(
      jsonb_build_object(
        'legacyUnitId', v_legacy_unit_id,
        'unitId', v_runtime_unit_id
      )
    );
  end loop;

  return jsonb_build_object(
    'tenantId', v_runtime_tenant_id,
    'units', v_unit_mappings
  );
end;
$$;

revoke all on function api.backfill_runtime_scope(text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function api.backfill_runtime_scope(text, text, text, text, text, jsonb) to service_role;

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
    on conflict do nothing
    returning id into v_runtime_tenant_id;

    if v_runtime_tenant_id is null then
      select tenants.id
      into v_runtime_tenant_id
      from platform.tenants as tenants
      where tenants.metadata @> jsonb_build_object('legacy_tenant_id', p_legacy_tenant_id)
      limit 1;
    end if;
  end if;

  if v_runtime_tenant_id is null then
    raise exception 'unable to resolve runtime tenant for legacy_tenant_id %', p_legacy_tenant_id;
  end if;

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
    v_unit_city := nullif(trim(coalesce(v_unit ->> 'city', '')), '');
    v_unit_status := case upper(coalesce(v_unit ->> 'status', 'ACTIVE'))
      when 'INACTIVE' then 'inactive'
      else 'active'
    end;

    v_runtime_unit_id := private.ensure_runtime_unit(
      p_runtime_tenant_id => v_runtime_tenant_id,
      p_legacy_unit_id => v_legacy_unit_id,
      p_unit_name => v_unit_name,
      p_unit_code => v_unit_code,
      p_city => v_unit_city,
      p_status => v_unit_status,
      p_deleted_at => nullif(v_unit ->> 'deletedAt', '')::timestamptz,
      p_source => 'prisma_bootstrap',
      p_is_default => v_default_runtime_unit_id is null
    );

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
