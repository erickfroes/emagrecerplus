-- Make the legacy -> runtime commercial projection idempotent when a runtime
-- pipeline already exists for the same tenant/code but is missing the legacy
-- binding. This is intentionally a replacement of the RPC body instead of an
-- old migration edit.

create or replace function private.runtime_commercial_pipeline_id_by_legacy_pipeline_id(
  p_runtime_tenant_id uuid,
  p_legacy_pipeline_id text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pipelines.id
  from commercial.pipelines
  where pipelines.tenant_id = p_runtime_tenant_id
    and pipelines.legacy_pipeline_id = p_legacy_pipeline_id
  limit 1
$$;

create or replace function private.runtime_commercial_stage_id_by_legacy_stage_id(
  p_runtime_tenant_id uuid,
  p_legacy_stage_id text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select stages.id
  from commercial.pipeline_stages as stages
  where stages.tenant_id = p_runtime_tenant_id
    and stages.legacy_stage_id = p_legacy_stage_id
  limit 1
$$;

create or replace function private.runtime_commercial_lead_id_by_legacy_lead_id(
  p_runtime_tenant_id uuid,
  p_legacy_lead_id text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select leads.id
  from commercial.leads
  where leads.tenant_id = p_runtime_tenant_id
    and leads.legacy_lead_id = p_legacy_lead_id
  limit 1
$$;

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
      legacy_pipeline_id = coalesce(pipelines.legacy_pipeline_id, p_legacy_pipeline_id),
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
      metadata = coalesce(pipelines.metadata, '{}'::jsonb) || v_metadata,
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
    legacy_pipeline_id = coalesce(pipelines.legacy_pipeline_id, excluded.legacy_pipeline_id),
    name = excluded.name,
    active = excluded.active,
    metadata = coalesce(pipelines.metadata, '{}'::jsonb)
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
      legacy_stage_id = coalesce(stages.legacy_stage_id, p_legacy_stage_id),
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
      metadata = coalesce(stages.metadata, '{}'::jsonb) || v_metadata,
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
    legacy_stage_id = coalesce(stages.legacy_stage_id, excluded.legacy_stage_id),
    legacy_pipeline_id = coalesce(stages.legacy_pipeline_id, excluded.legacy_pipeline_id),
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
      || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = greatest(
      coalesce(stages.updated_at, '-infinity'::timestamptz),
      coalesce(excluded.updated_at, now())
    )
  returning stages.id into v_stage_id;

  return v_stage_id;
end;
$$;

drop function if exists api.backfill_runtime_commercial_domain(
  uuid,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
);

create or replace function api.backfill_runtime_commercial_domain(
  p_runtime_tenant_id uuid,
  p_pipelines jsonb default '[]'::jsonb,
  p_pipeline_stages jsonb default '[]'::jsonb,
  p_leads jsonb default '[]'::jsonb,
  p_lead_profiles jsonb default '[]'::jsonb,
  p_lead_stage_history jsonb default '[]'::jsonb,
  p_lead_activities jsonb default '[]'::jsonb,
  p_conversions jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pipeline_row record;
  v_stage_row record;
  v_pipeline_id uuid;
  v_pipelines_count integer := 0;
  v_pipeline_stages_count integer := 0;
  v_leads_count integer := 0;
  v_lead_profiles_count integer := 0;
  v_lead_stage_history_count integer := 0;
  v_lead_activities_count integer := 0;
  v_conversions_count integer := 0;
begin
  if p_runtime_tenant_id is null then
    raise exception 'runtime tenant id is required';
  end if;

  for v_pipeline_row in
    select *
    from jsonb_to_recordset(coalesce(p_pipelines, '[]'::jsonb)) as payload(
      id uuid,
      legacy_pipeline_id text,
      name text,
      code text,
      active boolean,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz,
      deleted_at timestamptz
    )
  loop
    perform private.ensure_commercial_pipeline(
      p_runtime_tenant_id,
      v_pipeline_row.id,
      v_pipeline_row.legacy_pipeline_id,
      v_pipeline_row.name,
      v_pipeline_row.code,
      v_pipeline_row.active,
      v_pipeline_row.metadata,
      v_pipeline_row.created_at,
      v_pipeline_row.updated_at,
      v_pipeline_row.deleted_at
    );
    v_pipelines_count := v_pipelines_count + 1;
  end loop;

  for v_stage_row in
    select *
    from jsonb_to_recordset(coalesce(p_pipeline_stages, '[]'::jsonb)) as payload(
      id uuid,
      legacy_stage_id text,
      legacy_pipeline_id text,
      name text,
      code text,
      position integer,
      is_final boolean,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz
    )
  loop
    v_pipeline_id := private.runtime_commercial_pipeline_id_by_legacy_pipeline_id(
      p_runtime_tenant_id,
      v_stage_row.legacy_pipeline_id
    );

    if v_pipeline_id is null then
      raise exception 'runtime commercial pipeline not found for legacy pipeline %',
        v_stage_row.legacy_pipeline_id;
    end if;

    perform private.ensure_commercial_pipeline_stage(
      p_runtime_tenant_id,
      v_stage_row.id,
      v_pipeline_id,
      v_stage_row.legacy_stage_id,
      v_stage_row.legacy_pipeline_id,
      v_stage_row.name,
      v_stage_row.code,
      v_stage_row.position,
      v_stage_row.is_final,
      v_stage_row.metadata,
      v_stage_row.created_at,
      v_stage_row.updated_at
    );
    v_pipeline_stages_count := v_pipeline_stages_count + 1;
  end loop;

  with payload as (
    select *
    from jsonb_to_recordset(coalesce(p_leads, '[]'::jsonb)) as payload(
      id uuid,
      legacy_lead_id text,
      full_name text,
      phone text,
      email text,
      source text,
      campaign text,
      interest_type text,
      status text,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz,
      deleted_at timestamptz
    )
  )
  insert into commercial.leads as leads (
    id,
    tenant_id,
    legacy_lead_id,
    full_name,
    phone,
    email,
    source,
    campaign,
    interest_type,
    status,
    metadata,
    created_at,
    updated_at,
    deleted_at
  )
  select
    coalesce(payload.id, gen_random_uuid()),
    p_runtime_tenant_id,
    payload.legacy_lead_id,
    coalesce(nullif(btrim(payload.full_name), ''), 'Lead sem nome'),
    nullif(btrim(payload.phone), ''),
    nullif(btrim(payload.email), ''),
    payload.source,
    payload.campaign,
    payload.interest_type,
    coalesce(nullif(payload.status, ''), 'new'),
    coalesce(payload.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'source', 'legacy_prisma',
        'legacy_lead_id', payload.legacy_lead_id
      ),
    coalesce(payload.created_at, now()),
    coalesce(payload.updated_at, now()),
    payload.deleted_at
  from payload
  where payload.legacy_lead_id is not null
  on conflict (legacy_lead_id) do update
  set
    full_name = excluded.full_name,
    phone = coalesce(excluded.phone, leads.phone),
    email = coalesce(excluded.email, leads.email),
    source = coalesce(excluded.source, leads.source),
    campaign = coalesce(excluded.campaign, leads.campaign),
    interest_type = coalesce(excluded.interest_type, leads.interest_type),
    status = excluded.status,
    metadata = coalesce(leads.metadata, '{}'::jsonb)
      || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = greatest(
      coalesce(leads.updated_at, '-infinity'::timestamptz),
      coalesce(excluded.updated_at, now())
    ),
    deleted_at = excluded.deleted_at;
  get diagnostics v_leads_count = row_count;

  with payload as (
    select *
    from jsonb_to_recordset(coalesce(p_lead_profiles, '[]'::jsonb)) as payload(
      legacy_lead_id text,
      main_goal text,
      budget_range text,
      urgency_level text,
      pain_point text,
      notes text,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz
    )
  ),
  prepared as (
    select
      private.runtime_commercial_lead_id_by_legacy_lead_id(
        p_runtime_tenant_id,
        payload.legacy_lead_id
      ) as lead_id,
      payload.*
    from payload
  )
  insert into commercial.lead_profiles as profiles (
    lead_id,
    main_goal,
    budget_range,
    urgency_level,
    pain_point,
    notes,
    metadata,
    created_at,
    updated_at
  )
  select
    prepared.lead_id,
    prepared.main_goal,
    prepared.budget_range,
    prepared.urgency_level,
    prepared.pain_point,
    prepared.notes,
    coalesce(prepared.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'source', 'legacy_prisma',
        'legacy_lead_id', prepared.legacy_lead_id
      ),
    coalesce(prepared.created_at, now()),
    coalesce(prepared.updated_at, now())
  from prepared
  where prepared.lead_id is not null
  on conflict (lead_id) do update
  set
    main_goal = coalesce(excluded.main_goal, profiles.main_goal),
    budget_range = coalesce(excluded.budget_range, profiles.budget_range),
    urgency_level = coalesce(excluded.urgency_level, profiles.urgency_level),
    pain_point = coalesce(excluded.pain_point, profiles.pain_point),
    notes = coalesce(excluded.notes, profiles.notes),
    metadata = coalesce(profiles.metadata, '{}'::jsonb)
      || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = greatest(
      coalesce(profiles.updated_at, '-infinity'::timestamptz),
      coalesce(excluded.updated_at, now())
    );
  get diagnostics v_lead_profiles_count = row_count;

  with payload as (
    select *
    from jsonb_to_recordset(coalesce(p_lead_stage_history, '[]'::jsonb)) as payload(
      id uuid,
      legacy_stage_history_key text,
      legacy_lead_id text,
      legacy_stage_id text,
      legacy_changed_by_user_id text,
      changed_at timestamptz,
      metadata jsonb,
      created_at timestamptz
    )
  ),
  prepared as (
    select
      private.runtime_commercial_lead_id_by_legacy_lead_id(
        p_runtime_tenant_id,
        payload.legacy_lead_id
      ) as lead_id,
      private.runtime_commercial_stage_id_by_legacy_stage_id(
        p_runtime_tenant_id,
        payload.legacy_stage_id
      ) as stage_id,
      private.runtime_profile_id_by_legacy_user_id(payload.legacy_changed_by_user_id)
        as changed_by_profile_id,
      payload.*
    from payload
  )
  insert into commercial.lead_stage_history as history (
    id,
    lead_id,
    stage_id,
    changed_by_profile_id,
    legacy_stage_history_key,
    changed_at,
    metadata,
    created_at
  )
  select
    coalesce(prepared.id, gen_random_uuid()),
    prepared.lead_id,
    prepared.stage_id,
    prepared.changed_by_profile_id,
    prepared.legacy_stage_history_key,
    coalesce(prepared.changed_at, now()),
    coalesce(prepared.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'source', 'legacy_prisma',
        'legacy_lead_id', prepared.legacy_lead_id,
        'legacy_stage_id', prepared.legacy_stage_id,
        'legacy_changed_by_user_id', prepared.legacy_changed_by_user_id
      ),
    coalesce(prepared.created_at, now())
  from prepared
  where prepared.lead_id is not null
    and prepared.stage_id is not null
    and prepared.legacy_stage_history_key is not null
  on conflict (legacy_stage_history_key) do update
  set
    lead_id = excluded.lead_id,
    stage_id = excluded.stage_id,
    changed_by_profile_id = coalesce(
      excluded.changed_by_profile_id,
      history.changed_by_profile_id
    ),
    changed_at = excluded.changed_at,
    metadata = coalesce(history.metadata, '{}'::jsonb)
      || coalesce(excluded.metadata, '{}'::jsonb);
  get diagnostics v_lead_stage_history_count = row_count;

  with payload as (
    select *
    from jsonb_to_recordset(coalesce(p_lead_activities, '[]'::jsonb)) as payload(
      id uuid,
      legacy_activity_id text,
      legacy_lead_id text,
      assigned_to_legacy_user_id text,
      activity_type text,
      description text,
      due_at timestamptz,
      completed_at timestamptz,
      metadata jsonb,
      created_at timestamptz,
      updated_at timestamptz
    )
  ),
  prepared as (
    select
      private.runtime_commercial_lead_id_by_legacy_lead_id(
        p_runtime_tenant_id,
        payload.legacy_lead_id
      ) as lead_id,
      private.runtime_profile_id_by_legacy_user_id(payload.assigned_to_legacy_user_id)
        as assigned_to_profile_id,
      payload.*
    from payload
  )
  insert into commercial.lead_activities as activities (
    id,
    lead_id,
    assigned_to_profile_id,
    legacy_activity_id,
    activity_type,
    description,
    due_at,
    completed_at,
    metadata,
    created_at,
    updated_at
  )
  select
    coalesce(prepared.id, gen_random_uuid()),
    prepared.lead_id,
    prepared.assigned_to_profile_id,
    prepared.legacy_activity_id,
    prepared.activity_type,
    prepared.description,
    prepared.due_at,
    prepared.completed_at,
    coalesce(prepared.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'source', 'legacy_prisma',
        'legacy_lead_id', prepared.legacy_lead_id,
        'assigned_to_legacy_user_id', prepared.assigned_to_legacy_user_id
      ),
    coalesce(prepared.created_at, now()),
    coalesce(prepared.updated_at, now())
  from prepared
  where prepared.lead_id is not null
    and prepared.legacy_activity_id is not null
  on conflict (legacy_activity_id) do update
  set
    lead_id = excluded.lead_id,
    assigned_to_profile_id = coalesce(
      excluded.assigned_to_profile_id,
      activities.assigned_to_profile_id
    ),
    activity_type = excluded.activity_type,
    description = excluded.description,
    due_at = excluded.due_at,
    completed_at = excluded.completed_at,
    metadata = coalesce(activities.metadata, '{}'::jsonb)
      || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = greatest(
      coalesce(activities.updated_at, '-infinity'::timestamptz),
      coalesce(excluded.updated_at, now())
    );
  get diagnostics v_lead_activities_count = row_count;

  with payload as (
    select *
    from jsonb_to_recordset(coalesce(p_conversions, '[]'::jsonb)) as payload(
      id uuid,
      legacy_conversion_id text,
      legacy_lead_id text,
      legacy_patient_id text,
      legacy_converted_by_user_id text,
      metadata jsonb,
      created_at timestamptz
    )
  ),
  prepared as (
    select
      private.runtime_commercial_lead_id_by_legacy_lead_id(
        p_runtime_tenant_id,
        payload.legacy_lead_id
      ) as lead_id,
      (
        select patients.id
        from patients.patients
        where patients.tenant_id = p_runtime_tenant_id
          and patients.legacy_patient_id = payload.legacy_patient_id
        limit 1
      ) as patient_id,
      private.runtime_profile_id_by_legacy_user_id(payload.legacy_converted_by_user_id)
        as converted_by_profile_id,
      payload.*
    from payload
  )
  insert into commercial.conversions as conversions (
    id,
    lead_id,
    patient_id,
    converted_by_profile_id,
    legacy_conversion_id,
    legacy_lead_id,
    legacy_patient_id,
    metadata,
    created_at
  )
  select
    coalesce(prepared.id, gen_random_uuid()),
    prepared.lead_id,
    prepared.patient_id,
    prepared.converted_by_profile_id,
    prepared.legacy_conversion_id,
    prepared.legacy_lead_id,
    prepared.legacy_patient_id,
    coalesce(prepared.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'source', 'legacy_prisma',
        'legacy_lead_id', prepared.legacy_lead_id,
        'legacy_patient_id', prepared.legacy_patient_id,
        'legacy_converted_by_user_id', prepared.legacy_converted_by_user_id
      ),
    coalesce(prepared.created_at, now())
  from prepared
  where prepared.lead_id is not null
  on conflict (lead_id) do update
  set
    patient_id = coalesce(excluded.patient_id, conversions.patient_id),
    converted_by_profile_id = coalesce(
      excluded.converted_by_profile_id,
      conversions.converted_by_profile_id
    ),
    legacy_conversion_id = coalesce(
      conversions.legacy_conversion_id,
      excluded.legacy_conversion_id
    ),
    legacy_patient_id = coalesce(
      conversions.legacy_patient_id,
      excluded.legacy_patient_id
    ),
    metadata = coalesce(conversions.metadata, '{}'::jsonb)
      || coalesce(excluded.metadata, '{}'::jsonb);
  get diagnostics v_conversions_count = row_count;

  return jsonb_build_object(
    'pipelines', v_pipelines_count,
    'pipelineStages', v_pipeline_stages_count,
    'leads', v_leads_count,
    'leadProfiles', v_lead_profiles_count,
    'leadStageHistory', v_lead_stage_history_count,
    'leadActivities', v_lead_activities_count,
    'conversions', v_conversions_count
  );
end;
$$;

revoke all on function private.runtime_commercial_pipeline_id_by_legacy_pipeline_id(uuid, text)
from public, anon, authenticated;
grant execute on function private.runtime_commercial_pipeline_id_by_legacy_pipeline_id(uuid, text)
to service_role;

revoke all on function private.runtime_commercial_stage_id_by_legacy_stage_id(uuid, text)
from public, anon, authenticated;
grant execute on function private.runtime_commercial_stage_id_by_legacy_stage_id(uuid, text)
to service_role;

revoke all on function private.runtime_commercial_lead_id_by_legacy_lead_id(uuid, text)
from public, anon, authenticated;
grant execute on function private.runtime_commercial_lead_id_by_legacy_lead_id(uuid, text)
to service_role;

revoke all on function private.ensure_commercial_pipeline(
  uuid,
  uuid,
  text,
  text,
  text,
  boolean,
  jsonb,
  timestamptz,
  timestamptz,
  timestamptz
) from public, anon, authenticated;
grant execute on function private.ensure_commercial_pipeline(
  uuid,
  uuid,
  text,
  text,
  text,
  boolean,
  jsonb,
  timestamptz,
  timestamptz,
  timestamptz
) to service_role;

revoke all on function private.ensure_commercial_pipeline_stage(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  integer,
  boolean,
  jsonb,
  timestamptz,
  timestamptz
) from public, anon, authenticated;
grant execute on function private.ensure_commercial_pipeline_stage(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  integer,
  boolean,
  jsonb,
  timestamptz,
  timestamptz
) to service_role;

revoke all on function api.backfill_runtime_commercial_domain(
  uuid,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) from public, anon, authenticated;
grant execute on function api.backfill_runtime_commercial_domain(
  uuid,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) to service_role;
