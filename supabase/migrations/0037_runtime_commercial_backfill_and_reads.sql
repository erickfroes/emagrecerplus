alter table commercial.pipelines
  drop constraint if exists commercial_pipelines_legacy_pipeline_id_key;

alter table commercial.pipeline_stages
  drop constraint if exists commercial_pipeline_stages_legacy_stage_id_key;

alter table commercial.leads
  drop constraint if exists commercial_leads_legacy_lead_id_key;

alter table commercial.lead_stage_history
  drop constraint if exists commercial_lead_stage_history_legacy_stage_history_key_key;

alter table commercial.lead_activities
  drop constraint if exists commercial_lead_activities_legacy_activity_id_key;

alter table commercial.conversions
  drop constraint if exists commercial_conversions_legacy_conversion_id_key;

alter table commercial.pipelines
  add constraint commercial_pipelines_legacy_pipeline_id_key unique (legacy_pipeline_id);

alter table commercial.pipeline_stages
  add constraint commercial_pipeline_stages_legacy_stage_id_key unique (legacy_stage_id);

alter table commercial.leads
  add constraint commercial_leads_legacy_lead_id_key unique (legacy_lead_id);

alter table commercial.lead_stage_history
  add constraint commercial_lead_stage_history_legacy_stage_history_key_key unique (legacy_stage_history_key);

alter table commercial.lead_activities
  add constraint commercial_lead_activities_legacy_activity_id_key unique (legacy_activity_id);

alter table commercial.conversions
  add constraint commercial_conversions_legacy_conversion_id_key unique (legacy_conversion_id);

drop index if exists idx_commercial_pipelines_legacy_id;
drop index if exists idx_commercial_pipeline_stages_legacy_id;
drop index if exists idx_commercial_leads_legacy_id;
drop index if exists idx_commercial_lead_stage_history_legacy_key;
drop index if exists idx_commercial_lead_activities_legacy_id;
drop index if exists idx_commercial_conversions_legacy_id;

create or replace function private.crm_stage_code_from_status(p_status text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select
    case lower(coalesce(p_status, 'new'))
      when 'contacted' then 'contacted'
      when 'qualified' then 'qualified'
      when 'appointment_booked' then 'appointment_booked'
      when 'proposal_sent' then 'proposal_sent'
      when 'won' then 'won'
      when 'lost' then 'lost'
      else 'new'
    end
$$;

create or replace function private.runtime_pipeline_id_by_legacy_pipeline_id(
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
  from commercial.pipelines as pipelines
  where pipelines.tenant_id = p_runtime_tenant_id
    and pipelines.legacy_pipeline_id = p_legacy_pipeline_id
  limit 1
$$;

create or replace function private.runtime_stage_id_by_legacy_stage_id(
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

create or replace function private.runtime_lead_id_by_legacy_lead_id(
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
  from commercial.leads as leads
  where leads.tenant_id = p_runtime_tenant_id
    and leads.legacy_lead_id = p_legacy_lead_id
  limit 1
$$;

create or replace function private.current_commercial_pipeline_id(
  p_runtime_tenant_id uuid,
  p_pipeline_code text default null
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pipelines.id
  from commercial.pipelines as pipelines
  where pipelines.tenant_id = p_runtime_tenant_id
    and pipelines.deleted_at is null
    and pipelines.active = true
    and (
      nullif(trim(coalesce(p_pipeline_code, '')), '') is null
      or pipelines.code = nullif(trim(coalesce(p_pipeline_code, '')), '')
    )
  order by
    case
      when nullif(trim(coalesce(p_pipeline_code, '')), '') is not null
        and pipelines.code = nullif(trim(coalesce(p_pipeline_code, '')), '')
        then 0
      else 1
    end,
    pipelines.created_at asc
  limit 1
$$;

revoke all on function private.crm_stage_code_from_status(text) from public, anon;
revoke all on function private.runtime_pipeline_id_by_legacy_pipeline_id(uuid, text) from public, anon, authenticated;
revoke all on function private.runtime_stage_id_by_legacy_stage_id(uuid, text) from public, anon, authenticated;
revoke all on function private.runtime_lead_id_by_legacy_lead_id(uuid, text) from public, anon, authenticated;
revoke all on function private.current_commercial_pipeline_id(uuid, text) from public, anon;

grant execute on function private.crm_stage_code_from_status(text) to authenticated, service_role;
grant execute on function private.runtime_pipeline_id_by_legacy_pipeline_id(uuid, text) to service_role;
grant execute on function private.runtime_stage_id_by_legacy_stage_id(uuid, text) to service_role;
grant execute on function private.runtime_lead_id_by_legacy_lead_id(uuid, text) to service_role;
grant execute on function private.current_commercial_pipeline_id(uuid, text) to authenticated, service_role;

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
  v_pipelines_count integer := 0;
  v_pipeline_stages_count integer := 0;
  v_leads_count integer := 0;
  v_lead_profiles_count integer := 0;
  v_stage_history_count integer := 0;
  v_activities_count integer := 0;
  v_conversions_count integer := 0;
begin
  if p_runtime_tenant_id is null then
    raise exception 'p_runtime_tenant_id is required';
  end if;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_pipelines, '[]'::jsonb)) as x(
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
  )
  insert into commercial.pipelines (
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
  select
    coalesce(rows.id, gen_random_uuid()),
    p_runtime_tenant_id,
    rows.legacy_pipeline_id,
    rows.name,
    rows.code,
    coalesce(rows.active, true),
    coalesce(rows.metadata, '{}'::jsonb),
    coalesce(rows.created_at, now()),
    coalesce(rows.updated_at, coalesce(rows.created_at, now())),
    rows.deleted_at
  from rows
  where nullif(trim(coalesce(rows.legacy_pipeline_id, '')), '') is not null
    and nullif(trim(coalesce(rows.name, '')), '') is not null
    and nullif(trim(coalesce(rows.code, '')), '') is not null
  on conflict (legacy_pipeline_id) do update
  set
    tenant_id = excluded.tenant_id,
    name = excluded.name,
    code = excluded.code,
    active = excluded.active,
    metadata = coalesce(commercial.pipelines.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = excluded.updated_at,
    deleted_at = excluded.deleted_at;

  get diagnostics v_pipelines_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_pipeline_stages, '[]'::jsonb)) as x(
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
  ),
  resolved as (
    select
      coalesce(rows.id, gen_random_uuid()) as id,
      rows.legacy_stage_id,
      private.runtime_pipeline_id_by_legacy_pipeline_id(
        p_runtime_tenant_id,
        rows.legacy_pipeline_id
      ) as pipeline_id,
      rows.name,
      rows.code,
      greatest(coalesce(rows.position, 0), 0) as position,
      coalesce(rows.is_final, false) as is_final,
      coalesce(rows.metadata, '{}'::jsonb) as metadata,
      coalesce(rows.created_at, now()) as created_at,
      coalesce(rows.updated_at, coalesce(rows.created_at, now())) as updated_at
    from rows
  )
  insert into commercial.pipeline_stages (
    id,
    tenant_id,
    pipeline_id,
    legacy_stage_id,
    name,
    code,
    position,
    is_final,
    metadata,
    created_at,
    updated_at
  )
  select
    resolved.id,
    p_runtime_tenant_id,
    resolved.pipeline_id,
    resolved.legacy_stage_id,
    resolved.name,
    resolved.code,
    resolved.position,
    resolved.is_final,
    resolved.metadata,
    resolved.created_at,
    resolved.updated_at
  from resolved
  where nullif(trim(coalesce(resolved.legacy_stage_id, '')), '') is not null
    and resolved.pipeline_id is not null
    and nullif(trim(coalesce(resolved.name, '')), '') is not null
    and nullif(trim(coalesce(resolved.code, '')), '') is not null
  on conflict (legacy_stage_id) do update
  set
    tenant_id = excluded.tenant_id,
    pipeline_id = excluded.pipeline_id,
    name = excluded.name,
    code = excluded.code,
    position = excluded.position,
    is_final = excluded.is_final,
    metadata = coalesce(commercial.pipeline_stages.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = excluded.updated_at;

  get diagnostics v_pipeline_stages_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_leads, '[]'::jsonb)) as x(
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
  insert into commercial.leads (
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
    coalesce(rows.id, gen_random_uuid()),
    p_runtime_tenant_id,
    rows.legacy_lead_id,
    rows.full_name,
    rows.phone,
    rows.email,
    rows.source,
    rows.campaign,
    rows.interest_type,
    lower(coalesce(rows.status, 'new')),
    coalesce(rows.metadata, '{}'::jsonb),
    coalesce(rows.created_at, now()),
    coalesce(rows.updated_at, coalesce(rows.created_at, now())),
    rows.deleted_at
  from rows
  where nullif(trim(coalesce(rows.legacy_lead_id, '')), '') is not null
    and nullif(trim(coalesce(rows.full_name, '')), '') is not null
  on conflict (legacy_lead_id) do update
  set
    tenant_id = excluded.tenant_id,
    full_name = excluded.full_name,
    phone = excluded.phone,
    email = excluded.email,
    source = excluded.source,
    campaign = excluded.campaign,
    interest_type = excluded.interest_type,
    status = excluded.status,
    metadata = coalesce(commercial.leads.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = excluded.updated_at,
    deleted_at = excluded.deleted_at;

  get diagnostics v_leads_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_lead_profiles, '[]'::jsonb)) as x(
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
  resolved as (
    select
      private.runtime_lead_id_by_legacy_lead_id(
        p_runtime_tenant_id,
        rows.legacy_lead_id
      ) as lead_id,
      rows.main_goal,
      rows.budget_range,
      rows.urgency_level,
      rows.pain_point,
      rows.notes,
      coalesce(rows.metadata, '{}'::jsonb) as metadata,
      coalesce(rows.created_at, now()) as created_at,
      coalesce(rows.updated_at, coalesce(rows.created_at, now())) as updated_at
    from rows
  )
  insert into commercial.lead_profiles (
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
    resolved.lead_id,
    resolved.main_goal,
    resolved.budget_range,
    resolved.urgency_level,
    resolved.pain_point,
    resolved.notes,
    resolved.metadata,
    resolved.created_at,
    resolved.updated_at
  from resolved
  where resolved.lead_id is not null
  on conflict (lead_id) do update
  set
    main_goal = excluded.main_goal,
    budget_range = excluded.budget_range,
    urgency_level = excluded.urgency_level,
    pain_point = excluded.pain_point,
    notes = excluded.notes,
    metadata = coalesce(commercial.lead_profiles.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = excluded.updated_at;

  get diagnostics v_lead_profiles_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_lead_stage_history, '[]'::jsonb)) as x(
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
  resolved as (
    select
      coalesce(rows.id, gen_random_uuid()) as id,
      rows.legacy_stage_history_key,
      private.runtime_lead_id_by_legacy_lead_id(
        p_runtime_tenant_id,
        rows.legacy_lead_id
      ) as lead_id,
      private.runtime_stage_id_by_legacy_stage_id(
        p_runtime_tenant_id,
        rows.legacy_stage_id
      ) as stage_id,
      private.runtime_profile_id_by_legacy_user_id(
        rows.legacy_changed_by_user_id
      ) as changed_by_profile_id,
      coalesce(rows.changed_at, now()) as changed_at,
      coalesce(rows.metadata, '{}'::jsonb) as metadata,
      coalesce(rows.created_at, coalesce(rows.changed_at, now())) as created_at
    from rows
  )
  insert into commercial.lead_stage_history (
    id,
    tenant_id,
    legacy_stage_history_key,
    lead_id,
    stage_id,
    changed_by_profile_id,
    changed_at,
    metadata,
    created_at
  )
  select
    resolved.id,
    p_runtime_tenant_id,
    resolved.legacy_stage_history_key,
    resolved.lead_id,
    resolved.stage_id,
    resolved.changed_by_profile_id,
    resolved.changed_at,
    resolved.metadata,
    resolved.created_at
  from resolved
  where nullif(trim(coalesce(resolved.legacy_stage_history_key, '')), '') is not null
    and resolved.lead_id is not null
    and resolved.stage_id is not null
  on conflict (legacy_stage_history_key) do update
  set
    tenant_id = excluded.tenant_id,
    lead_id = excluded.lead_id,
    stage_id = excluded.stage_id,
    changed_by_profile_id = excluded.changed_by_profile_id,
    changed_at = excluded.changed_at,
    metadata = coalesce(commercial.lead_stage_history.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    created_at = excluded.created_at;

  get diagnostics v_stage_history_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_lead_activities, '[]'::jsonb)) as x(
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
  resolved as (
    select
      coalesce(rows.id, gen_random_uuid()) as id,
      rows.legacy_activity_id,
      private.runtime_lead_id_by_legacy_lead_id(
        p_runtime_tenant_id,
        rows.legacy_lead_id
      ) as lead_id,
      private.runtime_profile_id_by_legacy_user_id(
        rows.assigned_to_legacy_user_id
      ) as assigned_to_profile_id,
      lower(coalesce(rows.activity_type, 'task')) as activity_type,
      rows.description,
      rows.due_at,
      rows.completed_at,
      coalesce(rows.metadata, '{}'::jsonb) as metadata,
      coalesce(rows.created_at, now()) as created_at,
      coalesce(rows.updated_at, coalesce(rows.created_at, now())) as updated_at
    from rows
  )
  insert into commercial.lead_activities (
    id,
    tenant_id,
    legacy_activity_id,
    lead_id,
    assigned_to_profile_id,
    activity_type,
    description,
    due_at,
    completed_at,
    metadata,
    created_at,
    updated_at
  )
  select
    resolved.id,
    p_runtime_tenant_id,
    resolved.legacy_activity_id,
    resolved.lead_id,
    resolved.assigned_to_profile_id,
    resolved.activity_type,
    resolved.description,
    resolved.due_at,
    resolved.completed_at,
    resolved.metadata,
    resolved.created_at,
    resolved.updated_at
  from resolved
  where nullif(trim(coalesce(resolved.legacy_activity_id, '')), '') is not null
    and resolved.lead_id is not null
  on conflict (legacy_activity_id) do update
  set
    tenant_id = excluded.tenant_id,
    lead_id = excluded.lead_id,
    assigned_to_profile_id = excluded.assigned_to_profile_id,
    activity_type = excluded.activity_type,
    description = excluded.description,
    due_at = excluded.due_at,
    completed_at = excluded.completed_at,
    metadata = coalesce(commercial.lead_activities.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = excluded.updated_at;

  get diagnostics v_activities_count = row_count;

  with rows as (
    select *
    from jsonb_to_recordset(coalesce(p_conversions, '[]'::jsonb)) as x(
      id uuid,
      legacy_conversion_id text,
      legacy_lead_id text,
      legacy_patient_id text,
      legacy_converted_by_user_id text,
      metadata jsonb,
      created_at timestamptz
    )
  ),
  resolved as (
    select
      coalesce(rows.id, gen_random_uuid()) as id,
      rows.legacy_conversion_id,
      private.runtime_lead_id_by_legacy_lead_id(
        p_runtime_tenant_id,
        rows.legacy_lead_id
      ) as lead_id,
      private.runtime_patient_id_by_legacy_patient_id(
        p_runtime_tenant_id,
        rows.legacy_patient_id
      ) as patient_id,
      private.runtime_profile_id_by_legacy_user_id(
        rows.legacy_converted_by_user_id
      ) as converted_by_profile_id,
      coalesce(rows.metadata, '{}'::jsonb) as metadata,
      coalesce(rows.created_at, now()) as created_at
    from rows
  )
  insert into commercial.conversions (
    id,
    tenant_id,
    legacy_conversion_id,
    lead_id,
    patient_id,
    converted_by_profile_id,
    metadata,
    created_at
  )
  select
    resolved.id,
    p_runtime_tenant_id,
    resolved.legacy_conversion_id,
    resolved.lead_id,
    resolved.patient_id,
    resolved.converted_by_profile_id,
    resolved.metadata,
    resolved.created_at
  from resolved
  where nullif(trim(coalesce(resolved.legacy_conversion_id, '')), '') is not null
    and resolved.lead_id is not null
    and resolved.patient_id is not null
  on conflict (lead_id) do update
  set
    tenant_id = excluded.tenant_id,
    legacy_conversion_id = excluded.legacy_conversion_id,
    patient_id = excluded.patient_id,
    converted_by_profile_id = excluded.converted_by_profile_id,
    metadata = coalesce(commercial.conversions.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    created_at = excluded.created_at;

  get diagnostics v_conversions_count = row_count;

  return jsonb_build_object(
    'pipelines', v_pipelines_count,
    'pipelineStages', v_pipeline_stages_count,
    'leads', v_leads_count,
    'leadProfiles', v_lead_profiles_count,
    'leadStageHistory', v_stage_history_count,
    'leadActivities', v_activities_count,
    'conversions', v_conversions_count
  );
end;
$$;

revoke all on function api.backfill_runtime_commercial_domain(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;

grant execute on function api.backfill_runtime_commercial_domain(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb)
  to service_role;

create or replace function api.crm_kanban_snapshot(
  p_pipeline_code text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_runtime_tenant_id uuid := private.current_tenant_id();
  v_pipeline_id uuid;
begin
  if v_runtime_tenant_id is null
    or not private.can_read_commercial_domain(v_runtime_tenant_id) then
    raise exception 'crm kanban denied';
  end if;

  v_pipeline_id := private.current_commercial_pipeline_id(
    v_runtime_tenant_id,
    p_pipeline_code
  );

  if v_pipeline_id is null then
    return jsonb_build_object(
      'stages', '[]'::jsonb,
      'leads', '[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'stages', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'code', stages.code,
          'name', stages.name,
          'position', stages.position
        )
        order by stages.position asc
      )
      from commercial.pipeline_stages as stages
      where stages.pipeline_id = v_pipeline_id
    ), '[]'::jsonb),
    'leads', coalesce((
      select jsonb_agg(lead_rows.payload order by lead_rows.sort_created_at desc)
      from (
        select
          leads.created_at as sort_created_at,
          jsonb_build_object(
            'id', coalesce(leads.legacy_lead_id, leads.id::text),
            'fullName', leads.full_name,
            'phone', leads.phone,
            'email', leads.email::text,
            'source', leads.source,
            'interestType', leads.interest_type,
            'stageCode', coalesce(current_stage.code, private.crm_stage_code_from_status(leads.status)),
            'stageName', coalesce(
              current_stage.name,
              fallback_stage.name,
              initcap(replace(private.crm_stage_code_from_status(leads.status), '_', ' '))
            ),
            'owner', coalesce(latest_activity.assigned_to, latest_stage_history.changed_by, 'Time comercial'),
            'lastContactAt', to_jsonb(
              coalesce(latest_activity.activity_created_at, latest_stage_history.changed_at, leads.created_at)
            ),
            'updatedAt', to_jsonb(leads.updated_at),
            'timeline', coalesce(timeline.items, '[]'::jsonb)
          ) as payload
        from commercial.leads as leads
        left join lateral (
          select
            stages.code,
            stages.name
          from commercial.lead_stage_history as history
          join commercial.pipeline_stages as stages
            on stages.id = history.stage_id
          where history.lead_id = leads.id
          order by history.changed_at desc, history.created_at desc
          limit 1
        ) as current_stage on true
        left join commercial.pipeline_stages as fallback_stage
          on fallback_stage.pipeline_id = v_pipeline_id
         and fallback_stage.code = private.crm_stage_code_from_status(leads.status)
        left join lateral (
          select
            coalesce(profiles.full_name, 'Time comercial') as assigned_to,
            activities.created_at as activity_created_at
          from commercial.lead_activities as activities
          left join identity.profiles as profiles
            on profiles.id = activities.assigned_to_profile_id
          where activities.lead_id = leads.id
          order by activities.created_at desc
          limit 1
        ) as latest_activity on true
        left join lateral (
          select
            coalesce(profiles.full_name, 'Time comercial') as changed_by,
            history.changed_at
          from commercial.lead_stage_history as history
          left join identity.profiles as profiles
            on profiles.id = history.changed_by_profile_id
          where history.lead_id = leads.id
          order by history.changed_at desc, history.created_at desc
          limit 1
        ) as latest_stage_history on true
        left join lateral (
          select coalesce(
            jsonb_agg(timeline_rows.item order by timeline_rows.event_at desc),
            '[]'::jsonb
          ) as items
          from (
            select
              event_rows.event_at,
              jsonb_build_object(
                'id', event_rows.id,
                'kind', event_rows.kind,
                'title', event_rows.title,
                'description', event_rows.description,
                'date', event_rows.event_at
              ) as item
            from (
              select
                coalesce(activities.completed_at, activities.created_at) as event_at,
                'activity-' || coalesce(activities.legacy_activity_id, activities.id::text) as id,
                'activity'::text as kind,
                case activities.activity_type
                  when 'call' then 'Ligacao registrada'
                  when 'message' then 'Mensagem registrada'
                  when 'email' then 'Email registrado'
                  when 'meeting' then 'Reuniao registrada'
                  when 'note' then 'Observacao comercial'
                  else 'Tarefa comercial'
                end as title,
                coalesce(
                  nullif(trim(activities.description), ''),
                  'Atividade comercial registrada.'
                ) as description
              from commercial.lead_activities as activities
              where activities.lead_id = leads.id

              union all

              select
                history.changed_at as event_at,
                'stage-' || coalesce(history.legacy_stage_history_key, history.id::text) as id,
                'stage'::text as kind,
                'Etapa alterada para ' || coalesce(stages.name, 'Etapa do pipeline') as title,
                case
                  when profiles.full_name is not null then 'Atualizado por ' || profiles.full_name || '.'
                  else 'Atualizado pelo time comercial.'
                end as description
              from commercial.lead_stage_history as history
              join commercial.pipeline_stages as stages
                on stages.id = history.stage_id
              left join identity.profiles as profiles
                on profiles.id = history.changed_by_profile_id
              where history.lead_id = leads.id
            ) as event_rows
            order by event_rows.event_at desc
            limit 8
          ) as timeline_rows
        ) as timeline on true
        where leads.tenant_id = v_runtime_tenant_id
          and leads.deleted_at is null
      ) as lead_rows
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function api.crm_lead_activities(
  p_lead_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_runtime_tenant_id uuid := private.current_tenant_id();
  v_runtime_lead_id uuid;
begin
  if v_runtime_tenant_id is null
    or not private.can_read_commercial_domain(v_runtime_tenant_id) then
    raise exception 'crm activities denied';
  end if;

  select leads.id
  into v_runtime_lead_id
  from commercial.leads as leads
  where leads.tenant_id = v_runtime_tenant_id
    and leads.deleted_at is null
    and (
      leads.legacy_lead_id = p_lead_id
      or leads.id::text = p_lead_id
    )
  limit 1;

  if v_runtime_lead_id is null then
    raise exception 'crm lead not found for reference %', p_lead_id;
  end if;

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', coalesce(activities.legacy_activity_id, activities.id::text),
          'activityType', upper(activities.activity_type),
          'description', coalesce(
            nullif(trim(activities.description), ''),
            'Atividade comercial registrada.'
          ),
          'dueAt', to_jsonb(activities.due_at),
          'completedAt', to_jsonb(activities.completed_at),
          'createdAt', to_jsonb(activities.created_at),
          'assignedTo', coalesce(profiles.full_name, 'Time comercial')
        )
        order by activities.completed_at asc nulls first, activities.due_at asc nulls last, activities.created_at desc
      )
      from commercial.lead_activities as activities
      left join identity.profiles as profiles
        on profiles.id = activities.assigned_to_profile_id
      where activities.lead_id = v_runtime_lead_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function api.crm_operational_summary(
  p_pipeline_code text default null
)
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
    raise exception 'crm summary denied';
  end if;

  return (
    with lead_stage_codes as (
      select
        leads.id,
        leads.full_name,
        leads.created_at,
        leads.updated_at,
        coalesce(
          current_stage.code,
          private.crm_stage_code_from_status(leads.status)
        ) as stage_code,
        latest_activity.created_at as last_activity_at
      from commercial.leads as leads
      left join lateral (
        select
          stages.code
        from commercial.lead_stage_history as history
        join commercial.pipeline_stages as stages
          on stages.id = history.stage_id
        where history.lead_id = leads.id
        order by history.changed_at desc, history.created_at desc
        limit 1
      ) as current_stage on true
      left join lateral (
        select activities.created_at
        from commercial.lead_activities as activities
        where activities.lead_id = leads.id
        order by activities.created_at desc
        limit 1
      ) as latest_activity on true
      where leads.tenant_id = v_runtime_tenant_id
        and leads.deleted_at is null
    ),
    pipeline_counts as (
      select
        count(*) filter (where lead_stage_codes.stage_code in ('new', 'contacted')) as count_new,
        count(*) filter (where lead_stage_codes.stage_code = 'qualified') as count_qualified,
        count(*) filter (where lead_stage_codes.stage_code = 'appointment_booked') as count_scheduled,
        count(*) filter (where lead_stage_codes.stage_code = 'proposal_sent') as count_proposal,
        count(*) filter (where lead_stage_codes.stage_code = 'won') as count_closed
      from lead_stage_codes
    ),
    hot_lead as (
      select
        lead_stage_codes.id::text as runtime_lead_id,
        lead_stage_codes.full_name,
        coalesce(lead_stage_codes.last_activity_at, lead_stage_codes.created_at) as last_contact_at
      from lead_stage_codes
      where lead_stage_codes.stage_code in ('new', 'contacted', 'qualified')
      order by lead_stage_codes.updated_at desc, lead_stage_codes.created_at desc
      limit 1
    )
    select jsonb_build_object(
      'openLeads', (
        select count(*)
        from lead_stage_codes
        where lead_stage_codes.stage_code not in ('won', 'lost')
      ),
      'pipeline', jsonb_build_array(
        jsonb_build_object(
          'code', 'new',
          'title', 'Novo lead',
          'count', coalesce((select pipeline_counts.count_new from pipeline_counts), 0)
        ),
        jsonb_build_object(
          'code', 'qualified',
          'title', 'Qualificado',
          'count', coalesce((select pipeline_counts.count_qualified from pipeline_counts), 0)
        ),
        jsonb_build_object(
          'code', 'scheduled',
          'title', 'Consulta marcada',
          'count', coalesce((select pipeline_counts.count_scheduled from pipeline_counts), 0)
        ),
        jsonb_build_object(
          'code', 'proposal',
          'title', 'Proposta',
          'count', coalesce((select pipeline_counts.count_proposal from pipeline_counts), 0)
        ),
        jsonb_build_object(
          'code', 'closed',
          'title', 'Fechado',
          'count', coalesce((select pipeline_counts.count_closed from pipeline_counts), 0)
        )
      ),
      'hotLead', (
        select jsonb_build_object(
          'id', hot_lead.runtime_lead_id,
          'fullName', hot_lead.full_name,
          'lastContactAt', to_jsonb(hot_lead.last_contact_at)
        )
        from hot_lead
      )
    )
  );
end;
$$;

create or replace function api.patient_commercial_context(
  p_patient_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_runtime_patient_id uuid := private.runtime_patient_id_from_reference(p_patient_id);
begin
  if v_runtime_patient_id is null then
    return jsonb_build_object(
      'hasCommercialContext', false
    );
  end if;

  if not private.can_access_patient(v_runtime_patient_id) then
    raise exception 'patient access denied';
  end if;

  return coalesce((
    select jsonb_build_object(
      'hasCommercialContext', true,
      'leadId', coalesce(leads.legacy_lead_id, leads.id::text),
      'leadName', leads.full_name,
      'leadStatus', leads.status,
      'stageCode', coalesce(current_stage.code, private.crm_stage_code_from_status(leads.status)),
      'stageName', coalesce(
        current_stage.name,
        initcap(replace(private.crm_stage_code_from_status(leads.status), '_', ' '))
      ),
      'convertedAt', to_jsonb(conversions.created_at),
      'source', leads.source,
      'interestType', leads.interest_type,
      'lastCommercialTouchAt', to_jsonb(
        coalesce(latest_activity.created_at, conversions.created_at, leads.updated_at)
      )
    )
    from commercial.conversions as conversions
    join commercial.leads as leads
      on leads.id = conversions.lead_id
    left join lateral (
      select
        stages.code,
        stages.name
      from commercial.lead_stage_history as history
      join commercial.pipeline_stages as stages
        on stages.id = history.stage_id
      where history.lead_id = leads.id
      order by history.changed_at desc, history.created_at desc
      limit 1
    ) as current_stage on true
    left join lateral (
      select activities.created_at
      from commercial.lead_activities as activities
      where activities.lead_id = leads.id
      order by activities.created_at desc
      limit 1
    ) as latest_activity on true
    where conversions.patient_id = v_runtime_patient_id
      and leads.deleted_at is null
    order by conversions.created_at desc
    limit 1
  ), jsonb_build_object(
    'hasCommercialContext', false
  ));
end;
$$;

create or replace function public.backfill_runtime_commercial_domain(
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
language sql
volatile
set search_path = ''
as $$
  select api.backfill_runtime_commercial_domain(
    p_runtime_tenant_id,
    p_pipelines,
    p_pipeline_stages,
    p_leads,
    p_lead_profiles,
    p_lead_stage_history,
    p_lead_activities,
    p_conversions
  )
$$;

create or replace function public.crm_kanban_snapshot(
  p_pipeline_code text default null
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select api.crm_kanban_snapshot(p_pipeline_code)
$$;

create or replace function public.crm_lead_activities(
  p_lead_id text
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select api.crm_lead_activities(p_lead_id)
$$;

create or replace function public.crm_operational_summary(
  p_pipeline_code text default null
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select api.crm_operational_summary(p_pipeline_code)
$$;

create or replace function public.patient_commercial_context(
  p_patient_id text
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select api.patient_commercial_context(p_patient_id)
$$;

revoke all on function api.crm_kanban_snapshot(text) from public, anon;
revoke all on function api.crm_lead_activities(text) from public, anon;
revoke all on function api.crm_operational_summary(text) from public, anon;
revoke all on function api.patient_commercial_context(text) from public, anon;
revoke all on function public.backfill_runtime_commercial_domain(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.crm_kanban_snapshot(text) from public, anon;
revoke all on function public.crm_lead_activities(text) from public, anon;
revoke all on function public.crm_operational_summary(text) from public, anon;
revoke all on function public.patient_commercial_context(text) from public, anon;

grant execute on function api.crm_kanban_snapshot(text) to authenticated, service_role;
grant execute on function api.crm_lead_activities(text) to authenticated, service_role;
grant execute on function api.crm_operational_summary(text) to authenticated, service_role;
grant execute on function api.patient_commercial_context(text) to authenticated, service_role;
grant execute on function public.backfill_runtime_commercial_domain(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.crm_kanban_snapshot(text) to authenticated, service_role;
grant execute on function public.crm_lead_activities(text) to authenticated, service_role;
grant execute on function public.crm_operational_summary(text) to authenticated, service_role;
grant execute on function public.patient_commercial_context(text) to authenticated, service_role;
