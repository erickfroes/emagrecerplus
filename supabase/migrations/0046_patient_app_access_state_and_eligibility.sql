create or replace function private.patient_app_access_state(
  p_runtime_patient_id uuid,
  p_commercial_context jsonb default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_commercial_context jsonb := coalesce(
    p_commercial_context,
    api.patient_commercial_context(p_runtime_patient_id::text),
    '{}'::jsonb
  );
  v_eligibility jsonb := coalesce(v_commercial_context -> 'eligibility', '{}'::jsonb);
  v_benefits jsonb := coalesce(v_commercial_context -> 'benefits', '{}'::jsonb);
  v_vigency jsonb := coalesce(v_commercial_context -> 'vigency', '{}'::jsonb);
  v_financial jsonb := coalesce(v_commercial_context -> 'financialSummary', '{}'::jsonb);
  v_has_commercial_context boolean := coalesce(
    nullif(v_commercial_context ->> 'hasCommercialContext', '')::boolean,
    false
  );
  v_has_active_enrollment boolean := coalesce(
    nullif(v_eligibility ->> 'hasActiveEnrollment', '')::boolean,
    false
  );
  v_can_request_upgrade boolean := coalesce(
    nullif(v_eligibility ->> 'canRequestUpgrade', '')::boolean,
    false
  );
  v_allows_community boolean := coalesce(
    nullif(v_benefits ->> 'allowsCommunity', '')::boolean,
    false
  );
  v_chat_priority boolean := coalesce(
    nullif(v_benefits ->> 'chatPriority', '')::boolean,
    false
  );
  v_renewal_risk text := coalesce(nullif(v_vigency ->> 'renewalRisk', ''), 'none');
  v_pending_count integer := greatest(
    coalesce(nullif(v_financial ->> 'pendingCount', '')::integer, 0),
    0
  );
  v_overdue_count integer := greatest(
    coalesce(nullif(v_financial ->> 'overdueCount', '')::integer, 0),
    0
  );
  v_pending_amount numeric := greatest(
    coalesce(nullif(v_financial ->> 'pendingAmount', '')::numeric, 0::numeric),
    0::numeric
  );
  v_overdue_amount numeric := greatest(
    coalesce(nullif(v_financial ->> 'overdueAmount', '')::numeric, 0::numeric),
    0::numeric
  );
  v_status text := 'enabled';
  v_financial_status text := 'clear';
  v_blocker_reason text := null;
  v_alert_message text := null;
  v_community_enabled boolean := false;
  v_community_reason text := null;
  v_priority_chat_enabled boolean := false;
  v_priority_chat_reason text := null;
  v_schedule_return_enabled boolean := false;
  v_schedule_return_reason text := null;
  v_upgrade_request_reason text := null;
begin
  v_financial_status := case
    when v_overdue_count > 0 or v_overdue_amount > 0 then 'overdue'
    when v_pending_count > 0 or v_pending_amount > 0 then 'pending'
    else 'clear'
  end;

  if not v_has_commercial_context then
    v_status := 'attention';
    v_blocker_reason := 'Plano ainda em liberacao.';
    v_alert_message := 'Seu plano ainda nao esta totalmente liberado. Os registros diarios seguem ativos.';
  elsif not v_has_active_enrollment then
    v_status := 'restricted';
    v_blocker_reason := 'Matricula sem vigencia ativa.';
    v_alert_message := 'Sua matricula precisa ser reativada para liberar todos os beneficios.';
  elsif v_renewal_risk = 'expired' then
    v_status := 'restricted';
    v_blocker_reason := 'Vigencia expirada.';
    v_alert_message := 'Sua vigencia expirou. Os registros diarios continuam ativos, mas os beneficios premium ficam indisponiveis.';
  elsif v_financial_status = 'overdue' then
    v_status := 'attention';
    v_alert_message := 'Existe pendencia vencida. Regularize para manter beneficios completos.';
  elsif v_renewal_risk in ('high', 'medium') then
    v_status := 'attention';
    v_alert_message := 'Sua renovacao esta proxima. Antecipe a regularizacao do plano.';
  elsif v_financial_status = 'pending' then
    v_status := 'attention';
    v_alert_message := 'Existe pagamento pendente em aberto.';
  end if;

  v_community_enabled :=
    v_has_active_enrollment
    and v_allows_community
    and v_renewal_risk <> 'expired'
    and v_financial_status <> 'overdue';

  v_community_reason := case
    when v_community_enabled then null
    when not v_has_commercial_context then 'Plano ainda em liberacao.'
    when not v_has_active_enrollment then 'Disponivel somente com matricula ativa.'
    when not v_allows_community then 'Seu plano atual nao inclui comunidade.'
    when v_renewal_risk = 'expired' then 'Renove o plano para reabrir a comunidade.'
    when v_financial_status = 'overdue' then 'Regularize a pendencia vencida para liberar a comunidade.'
    else 'Comunidade indisponivel no momento.'
  end;

  v_priority_chat_enabled :=
    v_has_active_enrollment
    and v_chat_priority
    and v_renewal_risk <> 'expired'
    and v_financial_status <> 'overdue';

  v_priority_chat_reason := case
    when v_priority_chat_enabled then null
    when not v_has_commercial_context then 'Plano ainda em liberacao.'
    when not v_has_active_enrollment then 'Disponivel somente com matricula ativa.'
    when not v_chat_priority then 'Seu plano atual nao inclui chat prioritario.'
    when v_renewal_risk = 'expired' then 'Renove o plano para reativar o chat prioritario.'
    when v_financial_status = 'overdue' then 'Regularize a pendencia vencida para reativar o chat prioritario.'
    else 'Chat prioritario indisponivel no momento.'
  end;

  v_schedule_return_enabled :=
    v_has_active_enrollment
    and v_renewal_risk <> 'expired'
    and v_financial_status <> 'overdue';

  v_schedule_return_reason := case
    when v_schedule_return_enabled then null
    when not v_has_commercial_context then 'Plano ainda em liberacao.'
    when not v_has_active_enrollment then 'Disponivel somente com matricula ativa.'
    when v_renewal_risk = 'expired' then 'Renove o plano para liberar novos retornos.'
    when v_financial_status = 'overdue' then 'Regularize a pendencia vencida para solicitar novos retornos.'
    else 'Retorno indisponivel no momento.'
  end;

  v_upgrade_request_reason := case
    when v_can_request_upgrade then null
    when not v_has_commercial_context then 'Plano ainda em liberacao.'
    when not v_has_active_enrollment then 'Upgrade disponivel somente com matricula ativa.'
    else 'Upgrade indisponivel no momento.'
  end;

  return jsonb_build_object(
    'hasCommercialContext', v_has_commercial_context,
    'hasActiveEnrollment', v_has_active_enrollment,
    'status', v_status,
    'financialStatus', v_financial_status,
    'renewalRisk', v_renewal_risk,
    'supportLevel', case
      when v_priority_chat_enabled then 'priority'
      else 'standard'
    end,
    'blockerReason', v_blocker_reason,
    'alertMessage', v_alert_message,
    'features', jsonb_build_object(
      'habitLogs', jsonb_build_object(
        'enabled', true,
        'reason', null
      ),
      'community', jsonb_build_object(
        'enabled', v_community_enabled,
        'reason', v_community_reason
      ),
      'priorityChat', jsonb_build_object(
        'enabled', v_priority_chat_enabled,
        'reason', v_priority_chat_reason
      ),
      'scheduleReturn', jsonb_build_object(
        'enabled', v_schedule_return_enabled,
        'reason', v_schedule_return_reason
      ),
      'upgradeRequest', jsonb_build_object(
        'enabled', v_can_request_upgrade,
        'reason', v_upgrade_request_reason
      )
    )
  );
end;
$$;

revoke all on function private.patient_app_access_state(uuid, jsonb) from public, anon;
grant execute on function private.patient_app_access_state(uuid, jsonb) to authenticated, service_role;

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
  v_commercial_context jsonb := '{}'::jsonb;
  v_access_state jsonb := '{}'::jsonb;
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
  v_commercial_context := api.patient_commercial_context(v_runtime_patient_id::text);
  v_access_state := private.patient_app_access_state(v_runtime_patient_id, v_commercial_context);

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
    'commercialContext', v_commercial_context,
    'accessState', v_access_state,
    'logs', v_logs
  );
end;
$$;
