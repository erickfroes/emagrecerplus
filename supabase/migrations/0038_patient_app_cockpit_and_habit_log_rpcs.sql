create or replace function private.current_patient_id_from_claims()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  with claim_patient_ids as (
    select nullif(patient_id, '')::uuid as patient_id
    from jsonb_array_elements_text(
      coalesce(
        coalesce(auth.jwt(), '{}'::jsonb) -> 'app_metadata' -> 'patient_ids',
        coalesce(auth.jwt(), '{}'::jsonb) -> 'patient_ids',
        '[]'::jsonb
      )
    ) as patient_id
  )
  select coalesce(
    nullif(coalesce(auth.jwt(), '{}'::jsonb) -> 'app_metadata' ->> 'patient_id', '')::uuid,
    nullif(coalesce(auth.jwt(), '{}'::jsonb) ->> 'patient_id', '')::uuid,
    (
      select patient_id
      from claim_patient_ids
      where patient_id is not null
      limit 1
    )
  )
$$;

create or replace function private.resolve_patient_app_patient_id(
  p_patient_reference text default null
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_patient_reference text := nullif(trim(coalesce(p_patient_reference, '')), '');
  v_runtime_patient_id uuid;
begin
  if v_patient_reference is not null then
    v_runtime_patient_id := private.runtime_patient_id_from_reference(v_patient_reference);

    if v_runtime_patient_id is null then
      raise exception 'patient app patient not found for reference %', v_patient_reference;
    end if;
  else
    v_runtime_patient_id := private.current_patient_id_from_claims();

    if v_runtime_patient_id is null then
      raise exception 'patient app patient context unavailable';
    end if;
  end if;

  if not private.can_access_patient(v_runtime_patient_id) then
    raise exception 'patient app access denied for patient %', v_runtime_patient_id;
  end if;

  return v_runtime_patient_id;
end;
$$;

revoke all on function private.current_patient_id_from_claims() from public, anon;
revoke all on function private.resolve_patient_app_patient_id(text) from public, anon;

grant execute on function private.current_patient_id_from_claims() to authenticated, service_role;
grant execute on function private.resolve_patient_app_patient_id(text) to authenticated, service_role;

create or replace function api.patient_app_cockpit(
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
  v_patient patients.patients%rowtype;
  v_profile patients.patient_profiles%rowtype;
  v_next_appointment jsonb := null;
  v_weekly_counts jsonb := '{}'::jsonb;
  v_today_hydration_ml integer := 0;
  v_logs jsonb := '{}'::jsonb;
begin
  select *
  into v_patient
  from patients.patients as patients
  where patients.id = v_runtime_patient_id
    and patients.deleted_at is null;

  if not found then
    raise exception 'patient app patient not found';
  end if;

  select *
  into v_profile
  from patients.patient_profiles as patient_profiles
  where patient_profiles.patient_id = v_runtime_patient_id;

  select jsonb_build_object(
    'id', coalesce(appointments.legacy_appointment_id, appointments.id::text),
    'runtimeId', appointments.id,
    'startsAt', appointments.starts_at,
    'status', appointments.status,
    'type', appointment_types.name,
    'professional', coalesce(professionals.display_name, 'Equipe clinica')
  )
  into v_next_appointment
  from scheduling.appointments as appointments
  join scheduling.appointment_types as appointment_types
    on appointment_types.id = appointments.appointment_type_id
  left join scheduling.professionals as professionals
    on professionals.id = appointments.professional_id
  where appointments.patient_id = v_runtime_patient_id
    and appointments.deleted_at is null
    and appointments.status in ('scheduled', 'confirmed', 'checked_in', 'in_progress')
    and appointments.starts_at >= now()
  order by appointments.starts_at asc
  limit 1;

  select coalesce(sum(hydration_logs.volume_ml), 0)::integer
  into v_today_hydration_ml
  from clinical.hydration_logs as hydration_logs
  where hydration_logs.patient_id = v_runtime_patient_id
    and hydration_logs.logged_at >= date_trunc('day', now())
    and hydration_logs.logged_at < date_trunc('day', now()) + interval '1 day';

  select jsonb_build_object(
    'waterCount',
      (
        select count(*)::integer
        from clinical.hydration_logs as hydration_logs
        where hydration_logs.patient_id = v_runtime_patient_id
          and hydration_logs.logged_at >= now() - interval '7 days'
      ),
    'mealCount',
      (
        select count(*)::integer
        from clinical.meal_logs as meal_logs
        where meal_logs.patient_id = v_runtime_patient_id
          and meal_logs.logged_at >= now() - interval '7 days'
      ),
    'workoutCount',
      (
        select count(*)::integer
        from clinical.workout_logs as workout_logs
        where workout_logs.patient_id = v_runtime_patient_id
          and workout_logs.logged_at >= now() - interval '7 days'
      ),
    'sleepCount',
      (
        select count(*)::integer
        from clinical.sleep_logs as sleep_logs
        where sleep_logs.patient_id = v_runtime_patient_id
          and sleep_logs.sleep_date >= current_date - 6
      ),
    'symptomCount',
      (
        select count(*)::integer
        from clinical.symptom_logs as symptom_logs
        where symptom_logs.patient_id = v_runtime_patient_id
          and symptom_logs.logged_at >= now() - interval '7 days'
      )
  )
  into v_weekly_counts;

  select jsonb_build_object(
    'hydration',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', coalesce(rows.legacy_hydration_log_id, rows.id::text),
              'runtimeId', rows.id,
              'amountMl', rows.volume_ml,
              'loggedAt', rows.logged_at
            )
            order by rows.logged_at desc
          )
          from (
            select hydration_logs.id,
                   hydration_logs.legacy_hydration_log_id,
                   hydration_logs.volume_ml,
                   hydration_logs.logged_at
            from clinical.hydration_logs as hydration_logs
            where hydration_logs.patient_id = v_runtime_patient_id
            order by hydration_logs.logged_at desc
            limit 12
          ) as rows
        ),
        '[]'::jsonb
      ),
    'meals',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', coalesce(rows.legacy_meal_log_id, rows.id::text),
              'runtimeId', rows.id,
              'mealType', rows.meal_type,
              'description', rows.description,
              'adherenceRating', rows.adherence_rating,
              'notes', rows.notes,
              'loggedAt', rows.logged_at
            )
            order by rows.logged_at desc
          )
          from (
            select meal_logs.id,
                   meal_logs.legacy_meal_log_id,
                   meal_logs.meal_type,
                   meal_logs.description,
                   meal_logs.adherence_rating,
                   meal_logs.notes,
                   meal_logs.logged_at
            from clinical.meal_logs as meal_logs
            where meal_logs.patient_id = v_runtime_patient_id
            order by meal_logs.logged_at desc
            limit 12
          ) as rows
        ),
        '[]'::jsonb
      ),
    'workouts',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', coalesce(rows.legacy_workout_log_id, rows.id::text),
              'runtimeId', rows.id,
              'workoutType', rows.workout_type,
              'durationMinutes', rows.duration_minutes,
              'intensity', rows.intensity,
              'completed', rows.completed,
              'notes', rows.notes,
              'loggedAt', rows.logged_at
            )
            order by rows.logged_at desc
          )
          from (
            select workout_logs.id,
                   workout_logs.legacy_workout_log_id,
                   workout_logs.workout_type,
                   workout_logs.duration_minutes,
                   workout_logs.intensity,
                   workout_logs.completed,
                   workout_logs.notes,
                   workout_logs.logged_at
            from clinical.workout_logs as workout_logs
            where workout_logs.patient_id = v_runtime_patient_id
            order by workout_logs.logged_at desc
            limit 12
          ) as rows
        ),
        '[]'::jsonb
      ),
    'sleep',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', coalesce(rows.legacy_sleep_log_id, rows.id::text),
              'runtimeId', rows.id,
              'sleepDate', rows.sleep_date,
              'hours', rows.hours_slept,
              'qualityScore', rows.sleep_quality_score,
              'notes', rows.notes
            )
            order by rows.sleep_date desc, rows.created_at desc
          )
          from (
            select sleep_logs.id,
                   sleep_logs.legacy_sleep_log_id,
                   sleep_logs.sleep_date,
                   sleep_logs.hours_slept,
                   sleep_logs.sleep_quality_score,
                   sleep_logs.notes,
                   sleep_logs.created_at
            from clinical.sleep_logs as sleep_logs
            where sleep_logs.patient_id = v_runtime_patient_id
            order by sleep_logs.sleep_date desc, sleep_logs.created_at desc
            limit 12
          ) as rows
        ),
        '[]'::jsonb
      ),
    'symptoms',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', coalesce(rows.legacy_symptom_log_id, rows.id::text),
              'runtimeId', rows.id,
              'symptomType', rows.symptom_type,
              'severityScore', rows.severity_score,
              'description', rows.description,
              'notes', rows.notes,
              'loggedAt', rows.logged_at
            )
            order by rows.logged_at desc
          )
          from (
            select symptom_logs.id,
                   symptom_logs.legacy_symptom_log_id,
                   symptom_logs.symptom_type,
                   symptom_logs.severity_score,
                   symptom_logs.description,
                   symptom_logs.notes,
                   symptom_logs.logged_at
            from clinical.symptom_logs as symptom_logs
            where symptom_logs.patient_id = v_runtime_patient_id
            order by symptom_logs.logged_at desc
            limit 12
          ) as rows
        ),
        '[]'::jsonb
      )
  )
  into v_logs;

  return jsonb_build_object(
    'patient', jsonb_build_object(
      'id', coalesce(v_patient.legacy_patient_id, v_patient.id::text),
      'runtimeId', v_patient.id,
      'name', v_patient.full_name,
      'mainGoal', v_profile.goals_summary
    ),
    'nextAppointment', v_next_appointment,
    'weeklyCounts', v_weekly_counts,
    'todayHydrationMl', v_today_hydration_ml,
    'logs', v_logs
  );
end;
$$;

create or replace function api.log_patient_app_hydration(
  p_volume_ml integer,
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
  v_row clinical.hydration_logs%rowtype;
begin
  if coalesce(p_volume_ml, 0) <= 0 then
    raise exception 'p_volume_ml must be greater than zero';
  end if;

  insert into clinical.hydration_logs (
    patient_id,
    logged_at,
    volume_ml,
    metadata
  )
  values (
    v_runtime_patient_id,
    coalesce(p_logged_at, now()),
    p_volume_ml,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('source', 'patient_app')
  )
  returning *
  into v_row;

  return jsonb_build_object(
    'id', coalesce(v_row.legacy_hydration_log_id, v_row.id::text),
    'runtimeId', v_row.id,
    'amountMl', v_row.volume_ml,
    'loggedAt', v_row.logged_at
  );
end;
$$;

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
  v_row clinical.meal_logs%rowtype;
begin
  if v_meal_type is null then
    raise exception 'p_meal_type is required';
  end if;

  if p_adherence_rating is not null and (p_adherence_rating < 1 or p_adherence_rating > 5) then
    raise exception 'p_adherence_rating must be between 1 and 5';
  end if;

  insert into clinical.meal_logs (
    patient_id,
    logged_at,
    meal_type,
    description,
    adherence_rating,
    notes,
    metadata
  )
  values (
    v_runtime_patient_id,
    coalesce(p_logged_at, now()),
    v_meal_type,
    nullif(trim(coalesce(p_description, '')), ''),
    p_adherence_rating,
    nullif(trim(coalesce(p_notes, '')), ''),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('source', 'patient_app')
  )
  returning *
  into v_row;

  return jsonb_build_object(
    'id', coalesce(v_row.legacy_meal_log_id, v_row.id::text),
    'runtimeId', v_row.id,
    'mealType', v_row.meal_type,
    'description', v_row.description,
    'adherenceRating', v_row.adherence_rating,
    'notes', v_row.notes,
    'loggedAt', v_row.logged_at
  );
end;
$$;

create or replace function api.log_patient_app_workout(
  p_workout_type text,
  p_duration_minutes integer default null,
  p_intensity text default null,
  p_completed boolean default true,
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
  v_workout_type text := nullif(trim(coalesce(p_workout_type, '')), '');
  v_row clinical.workout_logs%rowtype;
begin
  if v_workout_type is null then
    raise exception 'p_workout_type is required';
  end if;

  if p_duration_minutes is not null and p_duration_minutes <= 0 then
    raise exception 'p_duration_minutes must be greater than zero';
  end if;

  insert into clinical.workout_logs (
    patient_id,
    logged_at,
    workout_type,
    duration_minutes,
    intensity,
    completed,
    notes,
    metadata
  )
  values (
    v_runtime_patient_id,
    coalesce(p_logged_at, now()),
    v_workout_type,
    p_duration_minutes,
    nullif(trim(coalesce(p_intensity, '')), ''),
    coalesce(p_completed, true),
    nullif(trim(coalesce(p_notes, '')), ''),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('source', 'patient_app')
  )
  returning *
  into v_row;

  return jsonb_build_object(
    'id', coalesce(v_row.legacy_workout_log_id, v_row.id::text),
    'runtimeId', v_row.id,
    'workoutType', v_row.workout_type,
    'durationMinutes', v_row.duration_minutes,
    'intensity', v_row.intensity,
    'completed', v_row.completed,
    'notes', v_row.notes,
    'loggedAt', v_row.logged_at
  );
end;
$$;

create or replace function api.log_patient_app_sleep(
  p_sleep_date date,
  p_hours_slept numeric(4, 2) default null,
  p_sleep_quality_score integer default null,
  p_notes text default null,
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
  v_row clinical.sleep_logs%rowtype;
begin
  if p_sleep_date is null then
    raise exception 'p_sleep_date is required';
  end if;

  if p_hours_slept is not null and p_hours_slept <= 0 then
    raise exception 'p_hours_slept must be greater than zero';
  end if;

  if p_sleep_quality_score is not null and (p_sleep_quality_score < 1 or p_sleep_quality_score > 10) then
    raise exception 'p_sleep_quality_score must be between 1 and 10';
  end if;

  insert into clinical.sleep_logs (
    patient_id,
    sleep_date,
    hours_slept,
    sleep_quality_score,
    notes,
    metadata
  )
  values (
    v_runtime_patient_id,
    p_sleep_date,
    p_hours_slept,
    p_sleep_quality_score,
    nullif(trim(coalesce(p_notes, '')), ''),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('source', 'patient_app')
  )
  returning *
  into v_row;

  return jsonb_build_object(
    'id', coalesce(v_row.legacy_sleep_log_id, v_row.id::text),
    'runtimeId', v_row.id,
    'sleepDate', v_row.sleep_date,
    'hours', v_row.hours_slept,
    'qualityScore', v_row.sleep_quality_score,
    'notes', v_row.notes
  );
end;
$$;

create or replace function api.log_patient_app_symptom(
  p_symptom_type text,
  p_severity_score integer default null,
  p_description text default null,
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
  v_symptom_type text := nullif(trim(coalesce(p_symptom_type, '')), '');
  v_row clinical.symptom_logs%rowtype;
begin
  if v_symptom_type is null then
    raise exception 'p_symptom_type is required';
  end if;

  if p_severity_score is not null and (p_severity_score < 0 or p_severity_score > 10) then
    raise exception 'p_severity_score must be between 0 and 10';
  end if;

  insert into clinical.symptom_logs (
    patient_id,
    logged_at,
    symptom_type,
    severity_score,
    description,
    notes,
    metadata
  )
  values (
    v_runtime_patient_id,
    coalesce(p_logged_at, now()),
    v_symptom_type,
    p_severity_score,
    nullif(trim(coalesce(p_description, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('source', 'patient_app')
  )
  returning *
  into v_row;

  return jsonb_build_object(
    'id', coalesce(v_row.legacy_symptom_log_id, v_row.id::text),
    'runtimeId', v_row.id,
    'symptomType', v_row.symptom_type,
    'severityScore', v_row.severity_score,
    'description', v_row.description,
    'notes', v_row.notes,
    'loggedAt', v_row.logged_at
  );
end;
$$;

create or replace function public.patient_app_cockpit(
  p_patient_id text default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select api.patient_app_cockpit(p_patient_id)
$$;

create or replace function public.log_patient_app_hydration(
  p_volume_ml integer,
  p_logged_at timestamptz default now(),
  p_patient_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select api.log_patient_app_hydration(
    p_volume_ml,
    p_logged_at,
    p_patient_id,
    p_metadata
  )
$$;

create or replace function public.log_patient_app_meal(
  p_meal_type text,
  p_description text default null,
  p_adherence_rating integer default null,
  p_notes text default null,
  p_logged_at timestamptz default now(),
  p_patient_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select api.log_patient_app_meal(
    p_meal_type,
    p_description,
    p_adherence_rating,
    p_notes,
    p_logged_at,
    p_patient_id,
    p_metadata
  )
$$;

create or replace function public.log_patient_app_workout(
  p_workout_type text,
  p_duration_minutes integer default null,
  p_intensity text default null,
  p_completed boolean default true,
  p_notes text default null,
  p_logged_at timestamptz default now(),
  p_patient_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select api.log_patient_app_workout(
    p_workout_type,
    p_duration_minutes,
    p_intensity,
    p_completed,
    p_notes,
    p_logged_at,
    p_patient_id,
    p_metadata
  )
$$;

create or replace function public.log_patient_app_sleep(
  p_sleep_date date,
  p_hours_slept numeric(4, 2) default null,
  p_sleep_quality_score integer default null,
  p_notes text default null,
  p_patient_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select api.log_patient_app_sleep(
    p_sleep_date,
    p_hours_slept,
    p_sleep_quality_score,
    p_notes,
    p_patient_id,
    p_metadata
  )
$$;

create or replace function public.log_patient_app_symptom(
  p_symptom_type text,
  p_severity_score integer default null,
  p_description text default null,
  p_notes text default null,
  p_logged_at timestamptz default now(),
  p_patient_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select api.log_patient_app_symptom(
    p_symptom_type,
    p_severity_score,
    p_description,
    p_notes,
    p_logged_at,
    p_patient_id,
    p_metadata
  )
$$;

revoke all on function api.patient_app_cockpit(text) from public, anon;
revoke all on function api.log_patient_app_hydration(integer, timestamptz, text, jsonb) from public, anon;
revoke all on function api.log_patient_app_meal(text, text, integer, text, timestamptz, text, jsonb) from public, anon;
revoke all on function api.log_patient_app_workout(text, integer, text, boolean, text, timestamptz, text, jsonb) from public, anon;
revoke all on function api.log_patient_app_sleep(date, numeric, integer, text, text, jsonb) from public, anon;
revoke all on function api.log_patient_app_symptom(text, integer, text, text, timestamptz, text, jsonb) from public, anon;

revoke all on function public.patient_app_cockpit(text) from public, anon;
revoke all on function public.log_patient_app_hydration(integer, timestamptz, text, jsonb) from public, anon;
revoke all on function public.log_patient_app_meal(text, text, integer, text, timestamptz, text, jsonb) from public, anon;
revoke all on function public.log_patient_app_workout(text, integer, text, boolean, text, timestamptz, text, jsonb) from public, anon;
revoke all on function public.log_patient_app_sleep(date, numeric, integer, text, text, jsonb) from public, anon;
revoke all on function public.log_patient_app_symptom(text, integer, text, text, timestamptz, text, jsonb) from public, anon;

grant execute on function api.patient_app_cockpit(text) to authenticated, service_role;
grant execute on function api.log_patient_app_hydration(integer, timestamptz, text, jsonb) to authenticated, service_role;
grant execute on function api.log_patient_app_meal(text, text, integer, text, timestamptz, text, jsonb) to authenticated, service_role;
grant execute on function api.log_patient_app_workout(text, integer, text, boolean, text, timestamptz, text, jsonb) to authenticated, service_role;
grant execute on function api.log_patient_app_sleep(date, numeric, integer, text, text, jsonb) to authenticated, service_role;
grant execute on function api.log_patient_app_symptom(text, integer, text, text, timestamptz, text, jsonb) to authenticated, service_role;

grant execute on function public.patient_app_cockpit(text) to authenticated, service_role;
grant execute on function public.log_patient_app_hydration(integer, timestamptz, text, jsonb) to authenticated, service_role;
grant execute on function public.log_patient_app_meal(text, text, integer, text, timestamptz, text, jsonb) to authenticated, service_role;
grant execute on function public.log_patient_app_workout(text, integer, text, boolean, text, timestamptz, text, jsonb) to authenticated, service_role;
grant execute on function public.log_patient_app_sleep(date, numeric, integer, text, text, jsonb) to authenticated, service_role;
grant execute on function public.log_patient_app_symptom(text, integer, text, text, timestamptz, text, jsonb) to authenticated, service_role;
