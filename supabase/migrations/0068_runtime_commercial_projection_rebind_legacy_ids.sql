-- Reconcile stale legacy ids when the runtime commercial pipeline/stage is
-- matched by its natural key. This keeps repeated local/dev seeds and real
-- runtime syncs idempotent after legacy ids change.

create or replace function private.ensure_commercial_pipeline(
  p_runtime_tenant_id uuid,
  p_pipeline_id uuid,
  p_legacy_pipeline_id text,
  p_name text,
  p_code text,
  p_active boolean,
  p_metadata jsonb,
  p_created_at timestamptz,
  p_updated_at timestamptz,
  p_deleted_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pipeline_id uuid;
  v_code text;
  v_name text;
  v_metadata jsonb;
begin
  if p_runtime_tenant_id is null then
    raise exception 'runtime tenant id is required';
  end if;

  if nullif(btrim(p_legacy_pipeline_id), '') is null then
    raise exception 'legacy pipeline id is required';
  end if;

  v_code := lower(
    coalesce(
      nullif(btrim(p_code), ''),
      format('legacy-%s', p_legacy_pipeline_id)
    )
  );
  v_name := coalesce(nullif(btrim(p_name), ''), v_code);
  v_metadata := coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'source', 'legacy_prisma',
      'legacy_pipeline_id', p_legacy_pipeline_id
    );

  perform pg_advisory_xact_lock(
    hashtextextended(
      format(
        'commercial_pipeline:%s:%s:%s',
        p_runtime_tenant_id::text,
        p_legacy_pipeline_id,
        v_code
      ),
      0
    )
  );

  select pipelines.id
  into v_pipeline_id
  from commercial.pipelines
  where pipelines.tenant_id = p_runtime_tenant_id
    and pipelines.legacy_pipeline_id = p_legacy_pipeline_id
  limit 1;

  if v_pipeline_id is null then
    select pipelines.id
    into v_pipeline_id
    from commercial.pipelines
    where pipelines.tenant_id = p_runtime_tenant_id
      and pipelines.code = v_code
    limit 1;
  end if;

  if v_pipeline_id is not null then
    update commercial.pipelines as pipelines
    set
      legacy_pipeline_id = case
        when pipelines.legacy_pipeline_id = p_legacy_pipeline_id then pipelines.legacy_pipeline_id
        when not exists (
          select 1
          from commercial.pipelines as conflicting
          where conflicting.legacy_pipeline_id = p_legacy_pipeline_id
            and conflicting.id <> pipelines.id
        ) then p_legacy_pipeline_id
        else pipelines.legacy_pipeline_id
      end,
      name = v_name,
      code = case
        when pipelines.code = v_code then pipelines.code
        when not exists (
          select 1
          from commercial.pipelines as conflicting
          where conflicting.tenant_id = p_runtime_tenant_id
            and conflicting.code = v_code
            and conflicting.id <> pipelines.id
        ) then v_code
        else pipelines.code
      end,
      active = coalesce(p_active, pipelines.active),
      metadata = coalesce(pipelines.metadata, '{}'::jsonb)
        || jsonb_strip_nulls(
          jsonb_build_object(
            'previous_legacy_pipeline_id',
            case
              when pipelines.legacy_pipeline_id is distinct from p_legacy_pipeline_id
              then pipelines.legacy_pipeline_id
              else null
            end
          )
        )
        || v_metadata,
      updated_at = greatest(
        coalesce(pipelines.updated_at, '-infinity'::timestamptz),
        coalesce(p_updated_at, now())
      ),
      deleted_at = p_deleted_at
    where pipelines.id = v_pipeline_id
    returning pipelines.id into v_pipeline_id;

    return v_pipeline_id;
  end if;

  insert into commercial.pipelines as pipelines (
    id,
    tenant_id,
    legacy_pipeline_id,
    name,
    code,
    active,
    metadata,
    created_at,
    updated_at,
    deleted_at
  )
  values (
    coalesce(p_pipeline_id, gen_random_uuid()),
    p_runtime_tenant_id,
    p_legacy_pipeline_id,
    v_name,
    v_code,
    coalesce(p_active, true),
    v_metadata,
    coalesce(p_created_at, now()),
    coalesce(p_updated_at, now()),
    p_deleted_at
  )
  on conflict (tenant_id, code) do update
  set
    legacy_pipeline_id = case
      when pipelines.legacy_pipeline_id = excluded.legacy_pipeline_id then pipelines.legacy_pipeline_id
      when not exists (
        select 1
        from commercial.pipelines as conflicting
        where conflicting.legacy_pipeline_id = excluded.legacy_pipeline_id
          and conflicting.id <> pipelines.id
      ) then excluded.legacy_pipeline_id
      else pipelines.legacy_pipeline_id
    end,
    name = excluded.name,
    active = excluded.active,
    metadata = coalesce(pipelines.metadata, '{}'::jsonb)
      || jsonb_strip_nulls(
        jsonb_build_object(
          'previous_legacy_pipeline_id',
          case
            when pipelines.legacy_pipeline_id is distinct from excluded.legacy_pipeline_id
            then pipelines.legacy_pipeline_id
            else null
          end
        )
      )
      || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = greatest(
      coalesce(pipelines.updated_at, '-infinity'::timestamptz),
      coalesce(excluded.updated_at, now())
    ),
    deleted_at = excluded.deleted_at
  returning pipelines.id into v_pipeline_id;

  return v_pipeline_id;
end;
$$;

create or replace function private.ensure_commercial_pipeline_stage(
  p_runtime_tenant_id uuid,
  p_stage_id uuid,
  p_pipeline_id uuid,
  p_legacy_stage_id text,
  p_legacy_pipeline_id text,
  p_name text,
  p_code text,
  p_position integer,
  p_is_final boolean,
  p_metadata jsonb,
  p_created_at timestamptz,
  p_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage_id uuid;
  v_code text;
  v_name text;
  v_metadata jsonb;
begin
  if p_runtime_tenant_id is null then
    raise exception 'runtime tenant id is required';
  end if;

  if p_pipeline_id is null then
    raise exception 'commercial pipeline id is required';
  end if;

  if nullif(btrim(p_legacy_stage_id), '') is null then
    raise exception 'legacy stage id is required';
  end if;

  v_code := lower(
    coalesce(
      nullif(btrim(p_code), ''),
      format('legacy-stage-%s', p_legacy_stage_id)
    )
  );
  v_name := coalesce(nullif(btrim(p_name), ''), v_code);
  v_metadata := coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'source', 'legacy_prisma',
      'legacy_stage_id', p_legacy_stage_id,
      'legacy_pipeline_id', p_legacy_pipeline_id
    );

  perform pg_advisory_xact_lock(
    hashtextextended(
      format(
        'commercial_pipeline_stage:%s:%s:%s',
        p_runtime_tenant_id::text,
        p_legacy_stage_id,
        v_code
      ),
      0
    )
  );

  select stages.id
  into v_stage_id
  from commercial.pipeline_stages as stages
  where stages.tenant_id = p_runtime_tenant_id
    and stages.legacy_stage_id = p_legacy_stage_id
  limit 1;

  if v_stage_id is null then
    select stages.id
    into v_stage_id
    from commercial.pipeline_stages as stages
    where stages.pipeline_id = p_pipeline_id
      and stages.code = v_code
    limit 1;
  end if;

  if v_stage_id is not null then
    update commercial.pipeline_stages as stages
    set
      legacy_stage_id = case
        when stages.legacy_stage_id = p_legacy_stage_id then stages.legacy_stage_id
        when not exists (
          select 1
          from commercial.pipeline_stages as conflicting
          where conflicting.legacy_stage_id = p_legacy_stage_id
            and conflicting.id <> stages.id
        ) then p_legacy_stage_id
        else stages.legacy_stage_id
      end,
      legacy_pipeline_id = p_legacy_pipeline_id,
      name = v_name,
      code = case
        when stages.code = v_code then stages.code
        when not exists (
          select 1
          from commercial.pipeline_stages as conflicting
          where conflicting.pipeline_id = p_pipeline_id
            and conflicting.code = v_code
            and conflicting.id <> stages.id
        ) then v_code
        else stages.code
      end,
      position = case
        when p_position is null then stages.position
        when stages.position = p_position then stages.position
        when not exists (
          select 1
          from commercial.pipeline_stages as conflicting
          where conflicting.pipeline_id = p_pipeline_id
            and conflicting.position = p_position
            and conflicting.id <> stages.id
        ) then p_position
        else stages.position
      end,
      is_final = coalesce(p_is_final, stages.is_final),
      metadata = coalesce(stages.metadata, '{}'::jsonb)
        || jsonb_strip_nulls(
          jsonb_build_object(
            'previous_legacy_stage_id',
            case
              when stages.legacy_stage_id is distinct from p_legacy_stage_id
              then stages.legacy_stage_id
              else null
            end
          )
        )
        || v_metadata,
      updated_at = greatest(
        coalesce(stages.updated_at, '-infinity'::timestamptz),
        coalesce(p_updated_at, now())
      )
    where stages.id = v_stage_id
    returning stages.id into v_stage_id;

    return v_stage_id;
  end if;

  insert into commercial.pipeline_stages as stages (
    id,
    tenant_id,
    pipeline_id,
    legacy_stage_id,
    legacy_pipeline_id,
    name,
    code,
    position,
    is_final,
    metadata,
    created_at,
    updated_at
  )
  values (
    coalesce(p_stage_id, gen_random_uuid()),
    p_runtime_tenant_id,
    p_pipeline_id,
    p_legacy_stage_id,
    p_legacy_pipeline_id,
    v_name,
    v_code,
    coalesce(p_position, 0),
    coalesce(p_is_final, false),
    v_metadata,
    coalesce(p_created_at, now()),
    coalesce(p_updated_at, now())
  )
  on conflict (pipeline_id, code) do update
  set
    legacy_stage_id = case
      when stages.legacy_stage_id = excluded.legacy_stage_id then stages.legacy_stage_id
      when not exists (
        select 1
        from commercial.pipeline_stages as conflicting
        where conflicting.legacy_stage_id = excluded.legacy_stage_id
          and conflicting.id <> stages.id
      ) then excluded.legacy_stage_id
      else stages.legacy_stage_id
    end,
    legacy_pipeline_id = excluded.legacy_pipeline_id,
    name = excluded.name,
    position = case
      when stages.position = excluded.position then stages.position
      when not exists (
        select 1
        from commercial.pipeline_stages as conflicting
        where conflicting.pipeline_id = stages.pipeline_id
          and conflicting.position = excluded.position
          and conflicting.id <> stages.id
      ) then excluded.position
      else stages.position
    end,
    is_final = excluded.is_final,
    metadata = coalesce(stages.metadata, '{}'::jsonb)
      || jsonb_strip_nulls(
        jsonb_build_object(
          'previous_legacy_stage_id',
          case
            when stages.legacy_stage_id is distinct from excluded.legacy_stage_id
            then stages.legacy_stage_id
            else null
          end
        )
      )
      || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = greatest(
      coalesce(stages.updated_at, '-infinity'::timestamptz),
      coalesce(excluded.updated_at, now())
    )
  returning stages.id into v_stage_id;

  return v_stage_id;
end;
$$;
