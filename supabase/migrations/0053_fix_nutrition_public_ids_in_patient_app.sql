create or replace function api.log_patient_app_meal(
  p_meal_type text,
  p_description text default null,
  p_adherence_rating integer default null,
  p_notes text default null,
  p_logged_at timestamptz default now(),
  p_patient_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_runtime_patient_id uuid := private.resolve_patient_app_patient_id(p_patient_id);
  v_meal_type text := nullif(trim(coalesce(p_meal_type, '')), '');
  v_logged_at timestamptz := coalesce(p_logged_at, now());
  v_nutrition_plan_version_id uuid;
  v_nutrition_plan_version_reference text;
  v_row clinical.meal_logs%rowtype;
begin
  if v_meal_type is null then
    raise exception 'p_meal_type is required';
  end if;

  if p_adherence_rating is not null and (p_adherence_rating < 1 or p_adherence_rating > 5) then
    raise exception 'p_adherence_rating must be between 1 and 5';
  end if;

  v_nutrition_plan_version_id := private.patient_active_nutrition_plan_version_id(
    v_runtime_patient_id,
    v_logged_at::date
  );

  insert into clinical.meal_logs (
    patient_id,
    nutrition_plan_version_id,
    logged_at,
    meal_type,
    description,
    adherence_rating,
    notes,
    metadata
  )
  values (
    v_runtime_patient_id,
    v_nutrition_plan_version_id,
    v_logged_at,
    v_meal_type,
    nullif(trim(coalesce(p_description, '')), ''),
    p_adherence_rating,
    nullif(trim(coalesce(p_notes, '')), ''),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('source', 'patient_app')
  )
  returning *
  into v_row;

  select coalesce(
    nutrition_plan_versions.legacy_nutrition_version_id,
    nutrition_plan_versions.id::text
  )
  into v_nutrition_plan_version_reference
  from clinical.nutrition_plan_versions as nutrition_plan_versions
  where nutrition_plan_versions.id = v_row.nutrition_plan_version_id;

  return jsonb_build_object(
    'id', coalesce(v_row.legacy_meal_log_id, v_row.id::text),
    'runtimeId', v_row.id,
    'nutritionPlanVersionId', v_nutrition_plan_version_reference,
    'mealType', v_row.meal_type,
    'description', v_row.description,
    'adherenceRating', v_row.adherence_rating,
    'notes', v_row.notes,
    'loggedAt', v_row.logged_at
  );
end;
$$;

create or replace function public.patient_app_cockpit(
  p_patient_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_runtime_patient_id uuid := private.resolve_patient_app_patient_id(p_patient_id);
  v_payload jsonb := api.patient_app_cockpit(p_patient_id);
  v_logs_with_nutrition jsonb := '[]'::jsonb;
begin
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', coalesce(rows.legacy_meal_log_id, rows.id::text),
        'runtimeId', rows.id,
        'nutritionPlanVersionId', rows.nutrition_plan_version_reference,
        'mealType', rows.meal_type,
        'description', rows.description,
        'adherenceRating', rows.adherence_rating,
        'notes', rows.notes,
        'loggedAt', rows.logged_at
      )
      order by rows.logged_at desc
    ),
    '[]'::jsonb
  )
  into v_logs_with_nutrition
  from (
    select
      meal_logs.id,
      meal_logs.legacy_meal_log_id,
      coalesce(
        nutrition_plan_versions.legacy_nutrition_version_id,
        nutrition_plan_versions.id::text
      ) as nutrition_plan_version_reference,
      meal_logs.meal_type,
      meal_logs.description,
      meal_logs.adherence_rating,
      meal_logs.notes,
      meal_logs.logged_at
    from clinical.meal_logs as meal_logs
    left join clinical.nutrition_plan_versions as nutrition_plan_versions
      on nutrition_plan_versions.id = meal_logs.nutrition_plan_version_id
    where meal_logs.patient_id = v_runtime_patient_id
    order by meal_logs.logged_at desc
    limit 12
  ) as rows;

  return jsonb_set(
    jsonb_set(
      v_payload,
      '{logs,meals}',
      v_logs_with_nutrition,
      true
    ),
    '{nutritionPlan}',
    coalesce(
      private.patient_active_nutrition_plan_json(v_runtime_patient_id, current_date),
      'null'::jsonb
    ),
    true
  );
end;
$$;
