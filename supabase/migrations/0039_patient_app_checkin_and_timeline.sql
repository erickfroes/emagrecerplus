create or replace function private.patient_app_patient_context(
  p_runtime_patient_id uuid
)
returns table (
  patient_id uuid,
  tenant_id uuid,
  patient_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select patients.id, patients.tenant_id, patients.full_name
  from patients.patients as patients
  where patients.id = p_runtime_patient_id
    and patients.deleted_at is null
  limit 1
$$;

create or replace function private.record_patient_app_event(
  p_runtime_patient_id uuid,
  p_event_type text,
  p_source_schema text,
  p_source_table text,
  p_source_id uuid,
  p_event_at timestamptz default now(),
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_context record;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  select *
  into v_context
  from private.patient_app_patient_context(p_runtime_patient_id);

  if v_context.patient_id is null then
    raise exception 'patient app patient not found';
  end if;

  perform private.record_audit_event(
    v_context.tenant_id,
    null,
    v_context.patient_id,
    'patient_app',
    p_event_type,
    'create',
    p_source_schema,
    p_source_table,
    p_source_id,
    v_payload
  );

  perform private.record_patient_timeline_event(
    v_context.tenant_id,
    null,
    v_context.patient_id,
    'patient_app',
    p_event_type,
    coalesce(p_event_at, now()),
    'patient_app',
    p_source_schema,
    p_source_table,
    p_source_id,
    v_payload
  );
end;
$$;

create or replace function private.patient_timeline_snapshot(
  p_runtime_patient_id uuid,
  p_limit integer default 12,
  p_runtime_unit_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', rows.id::text,
        'eventType', rows.event_type,
        'eventAt', rows.event_at,
        'title',
          coalesce(
            nullif(rows.payload ->> 'title', ''),
            case rows.event_type
              when 'patient_app.daily_checkin.logged' then 'Check-in diario'
              when 'patient_app.hydration.logged' then 'Hidratacao registrada'
              when 'patient_app.meal.logged' then 'Refeicao registrada'
              when 'patient_app.workout.logged' then 'Treino registrado'
              when 'patient_app.sleep.logged' then 'Sono registrado'
              when 'patient_app.symptom.logged' then 'Sintoma registrado'
              when 'appointment.created' then 'Agendamento criado'
              when 'appointment.confirmed' then 'Agendamento confirmado'
              when 'appointment.checked_in' then 'Check-in de atendimento'
              when 'queue.enqueued' then 'Paciente encaminhado para fila'
              when 'encounter.started' then 'Atendimento iniciado'
              when 'encounter.completed' then 'Atendimento concluido'
              when 'appointment.return_scheduled' then 'Retorno agendado'
              else rows.event_type
            end
          ),
        'description',
          coalesce(
            nullif(rows.payload ->> 'description', ''),
            nullif(rows.payload ->> 'summary', ''),
            nullif(rows.payload ->> 'notes', ''),
            nullif(rows.payload ->> 'valueLabel', '')
          ),
        'sourceSchema', rows.source_schema,
        'sourceTable', rows.source_table,
        'sourceId', rows.source_id,
        'payload', rows.payload
      )
      order by rows.event_at desc
    ),
    '[]'::jsonb
  )
  from (
    select
      timeline.id,
      timeline.event_type,
      timeline.event_at,
      timeline.source_schema,
      timeline.source_table,
      timeline.source_id,
      timeline.payload
    from audit.patient_timeline_events as timeline
    where timeline.patient_id = p_runtime_patient_id
      and (
        p_runtime_unit_id is null
        or timeline.unit_id is null
        or timeline.unit_id = p_runtime_unit_id
      )
    order by timeline.event_at desc
    limit greatest(coalesce(p_limit, 12), 1)
  ) as rows
$$;

create or replace function api.patient_longitudinal_feed(
  p_patient_id text,
  p_current_legacy_unit_id text default null,
  p_limit integer default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_runtime_patient_id uuid := private.runtime_patient_id_from_reference(p_patient_id);
  v_runtime_tenant_id uuid;
  v_runtime_unit_id uuid;
begin
  if v_runtime_patient_id is null then
    return '[]'::jsonb;
  end if;

  if not private.can_access_patient(v_runtime_patient_id) then
    raise exception 'patient access denied';
  end if;

  select patients.tenant_id
  into v_runtime_tenant_id
  from patients.patients as patients
  where patients.id = v_runtime_patient_id
    and patients.deleted_at is null;

  if v_runtime_tenant_id is null then
    return '[]'::jsonb;
  end if;

  if nullif(trim(coalesce(p_current_legacy_unit_id, '')), '') is not null then
    v_runtime_unit_id := private.runtime_unit_id_from_reference(
      v_runtime_tenant_id,
      p_current_legacy_unit_id
    );
  end if;

  return private.patient_timeline_snapshot(
    v_runtime_patient_id,
    greatest(coalesce(p_limit, 12), 1),
    v_runtime_unit_id
  );
end;
$$;

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
  v_today_checkin jsonb := null;
  v_logs jsonb := '{}'::jsonb;
  v_recent_activity jsonb := '[]'::jsonb;
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
    'id', coalesce(rows.legacy_habit_log_id, rows.id::text),
    'runtimeId', rows.id,
    'checkinDate', coalesce(nullif(rows.metadata ->> 'checkinDate', '')::date, rows.logged_at::date),
    'mood', nullif(rows.metadata ->> 'mood', ''),
    'energyScore', nullif(rows.metadata ->> 'energyScore', '')::integer,
    'sleepHours', nullif(rows.metadata ->> 'sleepHours', '')::numeric,
    'hungerLevel', nullif(rows.metadata ->> 'hungerLevel', '')::integer,
    'notes', nullif(rows.metadata ->> 'notes', ''),
    'completed', coalesce(nullif(rows.metadata ->> 'completed', '')::boolean, true),
    'loggedAt', rows.logged_at
  )
  into v_today_checkin
  from (
    select habit_logs.*
    from clinical.habit_logs as habit_logs
    where habit_logs.patient_id = v_runtime_patient_id
      and habit_logs.kind = 'daily_checkin'
      and coalesce(nullif(habit_logs.metadata ->> 'checkinDate', '')::date, habit_logs.logged_at::date) = current_date
    order by habit_logs.logged_at desc
    limit 1
  ) as rows;

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
      ),
    'checkinCount',
      (
        select count(*)::integer
        from clinical.habit_logs as habit_logs
        where habit_logs.patient_id = v_runtime_patient_id
          and habit_logs.kind = 'daily_checkin'
          and coalesce(nullif(habit_logs.metadata ->> 'checkinDate', '')::date, habit_logs.logged_at::date) >= current_date - 6
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
      ),
    'checkins',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', coalesce(rows.legacy_habit_log_id, rows.id::text),
              'runtimeId', rows.id,
              'checkinDate', coalesce(nullif(rows.metadata ->> 'checkinDate', '')::date, rows.logged_at::date),
              'mood', nullif(rows.metadata ->> 'mood', ''),
              'energyScore', nullif(rows.metadata ->> 'energyScore', '')::integer,
              'sleepHours', nullif(rows.metadata ->> 'sleepHours', '')::numeric,
              'hungerLevel', nullif(rows.metadata ->> 'hungerLevel', '')::integer,
              'notes', nullif(rows.metadata ->> 'notes', ''),
              'completed', coalesce(nullif(rows.metadata ->> 'completed', '')::boolean, true),
              'loggedAt', rows.logged_at
            )
            order by rows.logged_at desc
          )
          from (
            select habit_logs.id,
                   habit_logs.legacy_habit_log_id,
                   habit_logs.logged_at,
                   habit_logs.metadata
            from clinical.habit_logs as habit_logs
            where habit_logs.patient_id = v_runtime_patient_id
              and habit_logs.kind = 'daily_checkin'
            order by habit_logs.logged_at desc
            limit 12
          ) as rows
        ),
        '[]'::jsonb
      )
  )
  into v_logs;

  v_recent_activity := private.patient_timeline_snapshot(v_runtime_patient_id, 8, null);

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
    'todayCheckIn', v_today_checkin,
    'recentActivity', v_recent_activity,
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

  perform private.record_patient_app_event(
    v_runtime_patient_id,
    'patient_app.hydration.logged',
    'clinical',
    'hydration_logs',
    v_row.id,
    v_row.logged_at,
    jsonb_build_object(
      'kind', 'hydration',
      'title', 'Hidratacao registrada',
      'description', format('%s ml adicionados ao dia.', v_row.volume_ml),
      'valueLabel', format('%s ml', v_row.volume_ml),
      'amountMl', v_row.volume_ml
    )
  );

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

  perform private.record_patient_app_event(
    v_runtime_patient_id,
    'patient_app.meal.logged',
    'clinical',
    'meal_logs',
    v_row.id,
    v_row.logged_at,
    jsonb_build_object(
      'kind', 'meal',
      'title', 'Refeicao registrada',
      'description', coalesce(v_row.description, format('%s registrada.', v_row.meal_type)),
      'mealType', v_row.meal_type,
      'adherenceRating', v_row.adherence_rating,
      'notes', v_row.notes
    )
  );

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

  perform private.record_patient_app_event(
    v_runtime_patient_id,
    'patient_app.workout.logged',
    'clinical',
    'workout_logs',
    v_row.id,
    v_row.logged_at,
    jsonb_build_object(
      'kind', 'workout',
      'title', 'Treino registrado',
      'description',
        trim(
          both ' '
          from format(
            '%s %s',
            coalesce(v_row.workout_type, 'Treino'),
            case
              when v_row.duration_minutes is null then ''
              else format('por %s min.', v_row.duration_minutes)
            end
          )
        ),
      'workoutType', v_row.workout_type,
      'durationMinutes', v_row.duration_minutes,
      'intensity', v_row.intensity,
      'completed', v_row.completed,
      'notes', v_row.notes
    )
  );

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

  perform private.record_patient_app_event(
    v_runtime_patient_id,
    'patient_app.sleep.logged',
    'clinical',
    'sleep_logs',
    v_row.id,
    v_row.created_at,
    jsonb_build_object(
      'kind', 'sleep',
      'title', 'Sono registrado',
      'description',
        trim(
          both ' '
          from format(
            '%s %s',
            format('Sono de %s.', v_row.sleep_date),
            case
              when v_row.hours_slept is null then ''
              else format('%sh de descanso.', replace(v_row.hours_slept::text, '.', ','))
            end
          )
        ),
      'sleepDate', v_row.sleep_date,
      'hoursSlept', v_row.hours_slept,
      'qualityScore', v_row.sleep_quality_score,
      'notes', v_row.notes
    )
  );

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

  perform private.record_patient_app_event(
    v_runtime_patient_id,
    'patient_app.symptom.logged',
    'clinical',
    'symptom_logs',
    v_row.id,
    v_row.logged_at,
    jsonb_build_object(
      'kind', 'symptom',
      'title', 'Sintoma registrado',
      'description',
        coalesce(
          v_row.description,
          format(
            '%s com intensidade %s.',
            v_row.symptom_type,
            coalesce(v_row.severity_score::text, 'sem nota')
          )
        ),
      'symptomType', v_row.symptom_type,
      'severityScore', v_row.severity_score,
      'notes', v_row.notes
    )
  );

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

create or replace function api.log_patient_app_daily_checkin(
  p_checkin_date date default current_date,
  p_mood text default null,
  p_energy_score integer default null,
  p_sleep_hours numeric(4, 2) default null,
  p_hunger_level integer default null,
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
  v_checkin_date date := coalesce(p_checkin_date, current_date);
  v_mood text := nullif(trim(coalesce(p_mood, '')), '');
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
  v_row clinical.habit_logs%rowtype;
  v_existing_id uuid;
  v_payload jsonb;
begin
  if v_mood is not null and v_mood not in ('great', 'good', 'neutral', 'bad', 'terrible') then
    raise exception 'p_mood must be one of great, good, neutral, bad or terrible';
  end if;

  if p_energy_score is not null and (p_energy_score < 1 or p_energy_score > 10) then
    raise exception 'p_energy_score must be between 1 and 10';
  end if;

  if p_sleep_hours is not null and p_sleep_hours <= 0 then
    raise exception 'p_sleep_hours must be greater than zero';
  end if;

  if p_hunger_level is not null and (p_hunger_level < 1 or p_hunger_level > 5) then
    raise exception 'p_hunger_level must be between 1 and 5';
  end if;

  v_payload :=
    coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'source', 'patient_app',
      'checkinDate', v_checkin_date,
      'mood', v_mood,
      'energyScore', p_energy_score,
      'sleepHours', p_sleep_hours,
      'hungerLevel', p_hunger_level,
      'notes', v_notes,
      'completed', true
    );

  select habit_logs.id
  into v_existing_id
  from clinical.habit_logs as habit_logs
  where habit_logs.patient_id = v_runtime_patient_id
    and habit_logs.kind = 'daily_checkin'
    and coalesce(nullif(habit_logs.metadata ->> 'checkinDate', '')::date, habit_logs.logged_at::date) = v_checkin_date
  order by habit_logs.logged_at desc
  limit 1;

  if v_existing_id is null then
    insert into clinical.habit_logs (
      patient_id,
      logged_at,
      kind,
      value_text,
      value_num,
      metadata
    )
    values (
      v_runtime_patient_id,
      now(),
      'daily_checkin',
      coalesce(v_mood, 'completed'),
      p_energy_score,
      v_payload
    )
    returning *
    into v_row;
  else
    update clinical.habit_logs
    set
      logged_at = now(),
      value_text = coalesce(v_mood, 'completed'),
      value_num = p_energy_score,
      metadata = v_payload
    where id = v_existing_id
    returning *
    into v_row;
  end if;

  perform private.record_patient_app_event(
    v_runtime_patient_id,
    'patient_app.daily_checkin.logged',
    'clinical',
    'habit_logs',
    v_row.id,
    v_row.logged_at,
    jsonb_build_object(
      'kind', 'daily_checkin',
      'title', 'Check-in diario',
      'description',
        coalesce(
          case
            when v_mood is not null then format('Humor do dia: %s.', v_mood)
            else null
          end,
          'Check-in diario concluido.'
        ),
      'checkinDate', v_checkin_date,
      'mood', v_mood,
      'energyScore', p_energy_score,
      'sleepHours', p_sleep_hours,
      'hungerLevel', p_hunger_level,
      'notes', v_notes,
      'completed', true
    )
  );

  return jsonb_build_object(
    'id', coalesce(v_row.legacy_habit_log_id, v_row.id::text),
    'runtimeId', v_row.id,
    'checkinDate', v_checkin_date,
    'mood', v_mood,
    'energyScore', p_energy_score,
    'sleepHours', p_sleep_hours,
    'hungerLevel', p_hunger_level,
    'notes', v_notes,
    'completed', true,
    'loggedAt', v_row.logged_at
  );
end;
$$;

create or replace function public.log_patient_app_daily_checkin(
  p_checkin_date date default current_date,
  p_mood text default null,
  p_energy_score integer default null,
  p_sleep_hours numeric(4, 2) default null,
  p_hunger_level integer default null,
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
  select api.log_patient_app_daily_checkin(
    p_checkin_date,
    p_mood,
    p_energy_score,
    p_sleep_hours,
    p_hunger_level,
    p_notes,
    p_patient_id,
    p_metadata
  )
$$;

revoke all on function private.patient_app_patient_context(uuid) from public, anon;
revoke all on function private.record_patient_app_event(uuid, text, text, text, uuid, timestamptz, jsonb) from public, anon;
revoke all on function private.patient_timeline_snapshot(uuid, integer, uuid) from public, anon;
revoke all on function api.log_patient_app_daily_checkin(date, text, integer, numeric, integer, text, text, jsonb) from public, anon;
revoke all on function public.log_patient_app_daily_checkin(date, text, integer, numeric, integer, text, text, jsonb) from public, anon;

grant execute on function private.patient_app_patient_context(uuid) to authenticated, service_role;
grant execute on function private.record_patient_app_event(uuid, text, text, text, uuid, timestamptz, jsonb) to authenticated, service_role;
grant execute on function private.patient_timeline_snapshot(uuid, integer, uuid) to authenticated, service_role;
grant execute on function api.log_patient_app_daily_checkin(date, text, integer, numeric, integer, text, text, jsonb) to authenticated, service_role;
grant execute on function public.log_patient_app_daily_checkin(date, text, integer, numeric, integer, text, text, jsonb) to authenticated, service_role;
