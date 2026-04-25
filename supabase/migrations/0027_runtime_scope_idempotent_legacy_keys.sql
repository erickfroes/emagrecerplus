delete from platform.tenants
where metadata ->> 'legacy_tenant_id' = 'runtime-fixture-tenant-main'
  and id <> (
    select tenants.id
    from platform.tenants as tenants
    where tenants.metadata ->> 'legacy_tenant_id' = 'runtime-fixture-tenant-main'
    order by tenants.created_at asc, tenants.id asc
    limit 1
  );

create unique index if not exists idx_tenants_legacy_tenant_id_unique
  on platform.tenants ((metadata ->> 'legacy_tenant_id'))
  where metadata ? 'legacy_tenant_id';

create unique index if not exists idx_units_tenant_legacy_unit_id_unique
  on platform.units (tenant_id, (metadata ->> 'legacy_unit_id'))
  where metadata ? 'legacy_unit_id';

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
    v_unit_city := coalesce(nullif(trim(coalesce(v_unit ->> 'city', '')), ''), 'Sem cidade');
    v_unit_status := case upper(coalesce(v_unit ->> 'status', 'ACTIVE'))
      when 'INACTIVE' then 'inactive'
      else 'active'
    end;

    select private.runtime_unit_id_by_legacy_unit_id(v_runtime_tenant_id, v_legacy_unit_id)
    into v_runtime_unit_id;

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
          'source', 'runtime_backfill'
        )
      )
      on conflict do nothing
      returning id into v_runtime_unit_id;

      if v_runtime_unit_id is null then
        select private.runtime_unit_id_by_legacy_unit_id(v_runtime_tenant_id, v_legacy_unit_id)
        into v_runtime_unit_id;
      end if;
    end if;

    if v_runtime_unit_id is null then
      raise exception 'unable to resolve runtime unit for legacy_unit_id %', v_legacy_unit_id;
    end if;

    update platform.units as units
    set
      name = v_unit_name,
      code = v_unit_code,
      city = v_unit_city,
      status = v_unit_status,
      deleted_at = nullif(v_unit ->> 'deletedAt', '')::timestamptz,
      metadata = coalesce(units.metadata, '{}'::jsonb) || jsonb_build_object(
        'legacy_unit_id', v_legacy_unit_id,
        'source', 'runtime_backfill'
      )
    where units.id = v_runtime_unit_id;

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
