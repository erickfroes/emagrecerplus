create or replace function private.runtime_patient_id_from_reference(p_patient_reference text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select patients.id
  from patients.patients as patients
  where patients.legacy_patient_id = p_patient_reference
     or patients.id::text = p_patient_reference
  limit 1
$$;

create or replace function private.runtime_unit_id_from_reference(
  p_runtime_tenant_id uuid,
  p_unit_reference text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select units.id
  from platform.units as units
  where units.tenant_id = p_runtime_tenant_id
    and (
      units.metadata @> jsonb_build_object('legacy_unit_id', p_unit_reference)
      or units.id::text = p_unit_reference
    )
  limit 1
$$;

create or replace function private.can_access_patient(target_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from patients.patients as patients
    where patients.id = target_patient_id
      and (
        private.is_platform_admin()
        or private.has_permission('patients.read.all')
        or private.has_permission('clinical.read.all')
        or (
          patients.tenant_id = private.current_tenant_id()
          and (
            private.has_permission('patients.read')
            or private.has_permission('patients.write')
            or private.has_permission('clinical.read')
            or private.has_permission('clinical.write')
            or private.has_permission('schedule.read')
            or private.has_permission('schedule.write')
          )
        )
        or coalesce(
          nullif(coalesce(auth.jwt(), '{}'::jsonb) -> 'app_metadata' ->> 'patient_id', '')::uuid = target_patient_id,
          false
        )
        or coalesce(
          nullif(coalesce(auth.jwt(), '{}'::jsonb) ->> 'patient_id', '')::uuid = target_patient_id,
          false
        )
        or exists (
          select 1
          from jsonb_array_elements_text(
            coalesce(
              coalesce(auth.jwt(), '{}'::jsonb) -> 'app_metadata' -> 'patient_ids',
              coalesce(auth.jwt(), '{}'::jsonb) -> 'patient_ids',
              '[]'::jsonb
            )
          ) as patient_id
          where patient_id::uuid = target_patient_id
        )
      )
  )
$$;

create or replace function api.patient_360(
  p_patient_id text,
  p_current_legacy_unit_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_runtime_patient_id uuid := private.runtime_patient_id_from_reference(p_patient_id);
  v_patient patients.patients%rowtype;
  v_runtime_unit_id uuid;
begin
  if v_runtime_patient_id is null then
    return jsonb_build_object(
      'ready', false,
      'patientId', p_patient_id,
      'currentLegacyUnitId', p_current_legacy_unit_id,
      'schemaReady', private.legacy_patient_schema_available(),
      'source', 'supabase_scaffold',
      'reason', 'Paciente ainda nao materializado no runtime Supabase.'
    );
  end if;

  select *
  into v_patient
  from patients.patients
  where id = v_runtime_patient_id;

  if not found then
    return jsonb_build_object(
      'ready', false,
      'patientId', p_patient_id,
      'currentLegacyUnitId', p_current_legacy_unit_id,
      'schemaReady', private.legacy_patient_schema_available(),
      'source', 'supabase_scaffold',
      'reason', 'Paciente nao encontrado no runtime Supabase.'
    );
  end if;

  if not private.can_access_patient(v_runtime_patient_id) then
    raise exception 'patient access denied';
  end if;

  v_runtime_unit_id := private.runtime_unit_id_from_reference(v_patient.tenant_id, p_current_legacy_unit_id);

  return jsonb_build_object(
    'ready', true,
    'source', 'supabase_runtime',
    'schemaReady', true,
    'patient', jsonb_build_object(
      'id', coalesce(v_patient.legacy_patient_id, v_patient.id::text),
      'runtimeId', v_patient.id::text,
      'name', v_patient.full_name,
      'birthDate', v_patient.birth_date,
      'email', v_patient.primary_email,
      'phone', v_patient.primary_phone,
      'mainGoal', (
        select patient_profiles.goals_summary
        from patients.patient_profiles as patient_profiles
        where patient_profiles.patient_id = v_patient.id
      )
    ),
    'tags', coalesce((
      select jsonb_agg(tags.name order by tags.name)
      from patients.patient_tags as patient_tags
      join patients.tags as tags
        on tags.id = patient_tags.tag_id
      where patient_tags.patient_id = v_patient.id
    ), '[]'::jsonb),
    'flags', coalesce((
      select jsonb_agg(patient_flags.flag_type order by patient_flags.created_at desc)
      from patients.patient_flags as patient_flags
      where patient_flags.patient_id = v_patient.id
        and patient_flags.active = true
    ), '[]'::jsonb),
    'appointments', coalesce((
      select jsonb_agg(appointment_rows.payload order by appointment_rows.starts_at asc)
      from (
        select
          appointments.starts_at,
          jsonb_build_object(
            'id', appointments.id::text,
            'startsAt', appointments.starts_at,
            'status', appointments.status,
            'appointmentTypeName', appointment_types.name,
            'professionalName', professionals.display_name
          ) as payload
        from scheduling.appointments as appointments
        left join scheduling.appointment_types as appointment_types
          on appointment_types.id = appointments.appointment_type_id
        left join scheduling.professionals as professionals
          on professionals.id = appointments.professional_id
        where appointments.patient_id = v_patient.id
          and appointments.deleted_at is null
          and (
            v_runtime_unit_id is null
            or appointments.unit_id = v_runtime_unit_id
        )
      ) as appointment_rows
    ), '[]'::jsonb),
    'encounters', coalesce((
      select jsonb_agg(encounter_rows.payload order by encounter_rows.opened_at desc)
      from (
        select
          encounters.opened_at,
          jsonb_build_object(
            'id', encounters.id::text,
            'openedAt', encounters.opened_at,
            'encounterType', encounters.encounter_type,
            'professionalName', professionals.display_name,
            'appointmentTypeName', appointment_types.name,
            'anamnesis',
              case
                when anamneses.id is null then null
                else jsonb_build_object(
                  'chiefComplaint', anamneses.chief_complaint,
                  'notes', anamneses.notes,
                  'updatedAt', anamneses.updated_at
                )
              end,
            'consultationNotes', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', consultation_notes.id::text,
                  'subjective', consultation_notes.subjective,
                  'objective', consultation_notes.objective,
                  'assessment', consultation_notes.assessment,
                  'plan', consultation_notes.plan,
                  'createdAt', consultation_notes.created_at,
                  'signedAt', consultation_notes.signed_at
                )
                order by consultation_notes.created_at desc
              )
              from clinical.consultation_notes as consultation_notes
              where consultation_notes.encounter_id = encounters.id
            ), '[]'::jsonb),
            'prescriptionRecords', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', prescription_records.id::text,
                  'prescriptionType', prescription_records.prescription_type,
                  'summary', prescription_records.summary,
                  'issuedAt', prescription_records.issued_at
                )
                order by prescription_records.issued_at desc
              )
              from clinical.prescription_records as prescription_records
              where prescription_records.encounter_id = encounters.id
            ), '[]'::jsonb),
            'adverseEvents', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', adverse_events.id::text,
                  'eventType', adverse_events.event_type,
                  'description', adverse_events.description,
                  'createdAt', adverse_events.created_at
                )
                order by adverse_events.created_at desc
              )
              from clinical.adverse_events as adverse_events
              where adverse_events.encounter_id = encounters.id
            ), '[]'::jsonb)
          ) as payload
        from clinical.encounters as encounters
        left join scheduling.professionals as professionals
          on professionals.id = encounters.professional_id
        left join scheduling.appointments as appointments
          on appointments.id = encounters.appointment_id
        left join scheduling.appointment_types as appointment_types
          on appointment_types.id = appointments.appointment_type_id
        left join clinical.anamneses as anamneses
          on anamneses.encounter_id = encounters.id
        where encounters.patient_id = v_patient.id
          and (
            v_runtime_unit_id is null
            or encounters.unit_id = v_runtime_unit_id
          )
      ) as encounter_rows
    ), '[]'::jsonb),
    'carePlans', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'currentStatus', care_plans.current_status,
          'startDate', care_plans.start_date,
          'endDate', care_plans.end_date,
          'items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', care_plan_items.id::text,
                'title', care_plan_items.title,
                'status', care_plan_items.status,
                'targetDate', care_plan_items.target_date,
                'completedAt', care_plan_items.completed_at
              )
              order by care_plan_items.position asc nulls last, care_plan_items.title asc
            )
            from clinical.care_plan_items as care_plan_items
            where care_plan_items.care_plan_id = care_plans.id
          ), '[]'::jsonb)
        )
        order by care_plans.created_at desc
      )
      from clinical.care_plans as care_plans
      where care_plans.patient_id = v_patient.id
        and care_plans.deleted_at is null
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(task_rows.payload order by task_rows.due_at asc nulls last, task_rows.created_at desc)
      from (
        select
          clinical_tasks.due_at,
          clinical_tasks.created_at,
          jsonb_build_object(
            'id', clinical_tasks.id::text,
            'title', clinical_tasks.title,
            'priority', clinical_tasks.priority,
            'status', clinical_tasks.status,
            'dueAt', clinical_tasks.due_at,
            'ownerName', profiles.full_name
          ) as payload
        from clinical.clinical_tasks as clinical_tasks
        left join identity.profiles as profiles
          on profiles.id = clinical_tasks.assigned_to_profile_id
        where clinical_tasks.patient_id = v_patient.id
          and clinical_tasks.deleted_at is null
          and clinical_tasks.status in ('open', 'in_progress')
      ) as task_rows
    ), '[]'::jsonb),
    'habits', jsonb_build_object(
      'hydrationLogs', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'loggedAt', hydration_rows.logged_at,
            'volumeMl', hydration_rows.volume_ml
          )
          order by hydration_rows.logged_at desc
        )
        from (
          select hydration_logs.logged_at, hydration_logs.volume_ml
          from clinical.hydration_logs as hydration_logs
          where hydration_logs.patient_id = v_patient.id
          order by hydration_logs.logged_at desc
          limit 7
        ) as hydration_rows
      ), '[]'::jsonb),
      'mealLogs', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'adherenceRating', meal_rows.adherence_rating
          )
          order by meal_rows.logged_at desc
        )
        from (
          select meal_logs.logged_at, meal_logs.adherence_rating
          from clinical.meal_logs as meal_logs
          where meal_logs.patient_id = v_patient.id
          order by meal_logs.logged_at desc
          limit 7
        ) as meal_rows
      ), '[]'::jsonb),
      'workoutLogs', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'completed', workout_rows.completed
          )
          order by workout_rows.logged_at desc
        )
        from (
          select workout_logs.logged_at, workout_logs.completed
          from clinical.workout_logs as workout_logs
          where workout_logs.patient_id = v_patient.id
          order by workout_logs.logged_at desc
          limit 7
        ) as workout_rows
      ), '[]'::jsonb),
      'sleepLogs', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'hoursSlept', sleep_rows.hours_slept
          )
          order by sleep_rows.sleep_date desc
        )
        from (
          select sleep_logs.sleep_date, sleep_logs.hours_slept
          from clinical.sleep_logs as sleep_logs
          where sleep_logs.patient_id = v_patient.id
          order by sleep_logs.sleep_date desc
          limit 7
        ) as sleep_rows
      ), '[]'::jsonb),
      'symptomLogs', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'symptomType', symptom_rows.symptom_type,
            'severityScore', symptom_rows.severity_score,
            'description', symptom_rows.description
          )
          order by symptom_rows.logged_at desc
        )
        from (
          select symptom_logs.logged_at, symptom_logs.symptom_type, symptom_logs.severity_score, symptom_logs.description
          from clinical.symptom_logs as symptom_logs
          where symptom_logs.patient_id = v_patient.id
          order by symptom_logs.logged_at desc
          limit 1
        ) as symptom_rows
      ), '[]'::jsonb)
    ),
    'operationalAlerts', coalesce((
      select jsonb_agg(alert_rows.payload order by alert_rows.sort_order asc, alert_rows.created_at desc)
      from (
        select
          1 as sort_order,
          patient_flags.created_at,
          jsonb_build_object(
            'type', 'flag',
            'title', patient_flags.flag_type,
            'description', patient_flags.description,
            'severity', patient_flags.severity
          ) as payload
        from patients.patient_flags as patient_flags
        where patient_flags.patient_id = v_patient.id
          and patient_flags.active = true

        union all

        select
          2 as sort_order,
          clinical_tasks.created_at,
          jsonb_build_object(
            'type', 'task',
            'title', clinical_tasks.title,
            'description', clinical_tasks.description,
            'severity', clinical_tasks.priority
          ) as payload
        from clinical.clinical_tasks as clinical_tasks
        where clinical_tasks.patient_id = v_patient.id
          and clinical_tasks.deleted_at is null
          and clinical_tasks.status in ('open', 'in_progress')
          and clinical_tasks.due_at is not null
          and clinical_tasks.due_at < now()
      ) as alert_rows
    ), '[]'::jsonb),
    'commercialContext', api.patient_commercial_context(p_patient_id)
  );
end;
$$;
