create or replace function private.patient_active_nutrition_plan_version_id(
  p_runtime_patient_id uuid,
  p_reference_date date default current_date
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  with selected_plan as (
    select private.patient_current_nutrition_plan_id(
      p_runtime_patient_id,
      coalesce(p_reference_date, current_date)
    ) as nutrition_plan_id
  ),
  current_published as (
    select nutrition_plan_versions.id
    from selected_plan
    join clinical.nutrition_plan_versions as nutrition_plan_versions
      on nutrition_plan_versions.nutrition_plan_id = selected_plan.nutrition_plan_id
    where selected_plan.nutrition_plan_id is not null
      and nutrition_plan_versions.version_status = 'published'
      and nutrition_plan_versions.effective_from <= coalesce(p_reference_date, current_date)
      and (
        nutrition_plan_versions.effective_to is null
        or nutrition_plan_versions.effective_to >= coalesce(p_reference_date, current_date)
      )
    order by
      nutrition_plan_versions.effective_from desc,
      nutrition_plan_versions.version_number desc,
      nutrition_plan_versions.created_at desc
    limit 1
  ),
  fallback_version as (
    select nutrition_plan_versions.id
    from selected_plan
    join clinical.nutrition_plan_versions as nutrition_plan_versions
      on nutrition_plan_versions.nutrition_plan_id = selected_plan.nutrition_plan_id
    where selected_plan.nutrition_plan_id is not null
      and nutrition_plan_versions.version_status in ('published', 'draft')
    order by
      case
        when nutrition_plan_versions.version_status = 'published' then 0
        else 1
      end,
      nutrition_plan_versions.effective_from desc,
      nutrition_plan_versions.version_number desc,
      nutrition_plan_versions.created_at desc
    limit 1
  )
  select coalesce(
    (select id from current_published),
    (select id from fallback_version)
  )
$$;

create or replace function private.patient_active_nutrition_plan_json(
  p_runtime_patient_id uuid,
  p_reference_date date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_reference_date date := coalesce(p_reference_date, current_date);
  v_nutrition_plan_id uuid;
  v_current_version_id uuid;
begin
  if p_runtime_patient_id is null then
    return null;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not private.can_access_patient(p_runtime_patient_id) then
    raise exception 'patient nutrition plan access denied';
  end if;

  v_nutrition_plan_id := private.patient_current_nutrition_plan_id(
    p_runtime_patient_id,
    v_reference_date
  );

  if v_nutrition_plan_id is null then
    return null;
  end if;

  v_current_version_id := private.patient_active_nutrition_plan_version_id(
    p_runtime_patient_id,
    v_reference_date
  );

  return (
    select jsonb_build_object(
      'id', coalesce(nutrition_plans.legacy_nutrition_plan_id, nutrition_plans.id::text),
      'runtimeId', nutrition_plans.id::text,
      'status', upper(nutrition_plans.plan_status),
      'name', nutrition_plans.plan_name,
      'summary', nutrition_plans.summary,
      'startsAt', nutrition_plans.starts_at,
      'endsAt', nutrition_plans.ends_at,
      'currentVersion', (
        select case
          when nutrition_plan_versions.id is null then null
          else jsonb_build_object(
            'id', coalesce(nutrition_plan_versions.legacy_nutrition_version_id, nutrition_plan_versions.id::text),
            'runtimeId', nutrition_plan_versions.id::text,
            'versionNumber', nutrition_plan_versions.version_number,
            'status', upper(nutrition_plan_versions.version_status),
            'title', nutrition_plan_versions.title,
            'summary', nutrition_plan_versions.summary,
            'guidance', nutrition_plan_versions.guidance,
            'mealGoalDaily', nutrition_plan_versions.meal_goal_daily,
            'waterGoalMl', nutrition_plan_versions.water_goal_ml,
            'effectiveFrom', nutrition_plan_versions.effective_from,
            'effectiveTo', nutrition_plan_versions.effective_to,
            'publishedAt', nutrition_plan_versions.published_at
          )
        end
        from clinical.nutrition_plan_versions as nutrition_plan_versions
        where nutrition_plan_versions.id = v_current_version_id
      ),
      'targets', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', coalesce(nutrition_targets.legacy_target_id, nutrition_targets.id::text),
              'runtimeId', nutrition_targets.id::text,
              'type', nutrition_targets.target_type,
              'code', nutrition_targets.code,
              'label', nutrition_targets.label,
              'goalValue', nutrition_targets.goal_value,
              'unit', nutrition_targets.unit,
              'period', nutrition_targets.period,
              'mealType', nutrition_targets.meal_type,
              'guidance', nutrition_targets.guidance,
              'position', nutrition_targets.position,
              'active', nutrition_targets.active
            )
            order by nutrition_targets.position asc, nutrition_targets.created_at asc
          ),
          '[]'::jsonb
        )
        from clinical.nutrition_targets as nutrition_targets
        where nutrition_targets.nutrition_plan_version_id = v_current_version_id
      )
    )
    from clinical.nutrition_plans as nutrition_plans
    where nutrition_plans.id = v_nutrition_plan_id
  );
end;
$$;
