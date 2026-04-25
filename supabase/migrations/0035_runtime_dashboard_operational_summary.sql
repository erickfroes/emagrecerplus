create or replace function api.dashboard_operational_summary(
  p_current_legacy_unit_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_runtime_tenant_id uuid := private.current_tenant_id();
  v_runtime_unit_id uuid;
  v_timezone text := 'America/Araguaina';
  v_today_date date := (now() at time zone v_timezone)::date;
  v_today_start timestamptz;
  v_today_end timestamptz;
  v_seven_days_ago timestamptz := now() - interval '7 days';
  v_scheduled_today integer := 0;
  v_completed_today integer := 0;
  v_no_shows_7d integer := 0;
  v_open_clinical_tasks integer := 0;
  v_today_appointments jsonb := '[]'::jsonb;
  v_upcoming_appointments jsonb := '[]'::jsonb;
  v_flag_alerts jsonb := '[]'::jsonb;
  v_no_show_alerts jsonb := '[]'::jsonb;
  v_alerts jsonb := '[]'::jsonb;
begin
  if v_runtime_tenant_id is null then
    raise exception 'dashboard summary denied';
  end if;

  v_runtime_unit_id := private.runtime_unit_id_from_reference(
    v_runtime_tenant_id,
    p_current_legacy_unit_id
  );

  if v_runtime_unit_id is null then
    raise exception 'runtime unit not found for legacy unit %', p_current_legacy_unit_id;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not (
      private.is_platform_admin()
      or private.has_permission('dashboard:view')
      or private.can_read_schedule_domain(v_runtime_tenant_id, v_runtime_unit_id)
      or private.can_read_clinical_domain(v_runtime_tenant_id, v_runtime_unit_id)
    ) then
    raise exception 'dashboard summary denied';
  end if;

  v_today_start := make_timestamptz(
    extract(year from v_today_date)::int,
    extract(month from v_today_date)::int,
    extract(day from v_today_date)::int,
    0,
    0,
    0,
    v_timezone
  );
  v_today_end := v_today_start + interval '1 day';

  select count(*)
  into v_scheduled_today
  from scheduling.appointments as appointments
  where appointments.tenant_id = v_runtime_tenant_id
    and appointments.unit_id = v_runtime_unit_id
    and appointments.deleted_at is null
    and appointments.starts_at >= v_today_start
    and appointments.starts_at < v_today_end;

  select count(*)
  into v_completed_today
  from scheduling.appointments as appointments
  where appointments.tenant_id = v_runtime_tenant_id
    and appointments.unit_id = v_runtime_unit_id
    and appointments.deleted_at is null
    and appointments.starts_at >= v_today_start
    and appointments.starts_at < v_today_end
    and appointments.status = 'completed';

  select count(*)
  into v_no_shows_7d
  from scheduling.appointments as appointments
  where appointments.tenant_id = v_runtime_tenant_id
    and appointments.unit_id = v_runtime_unit_id
    and appointments.deleted_at is null
    and appointments.status = 'no_show'
    and appointments.updated_at >= v_seven_days_ago;

  select count(*)
  into v_open_clinical_tasks
  from clinical.clinical_tasks as clinical_tasks
  left join clinical.encounters as encounters
    on encounters.id = clinical_tasks.encounter_id
  where clinical_tasks.tenant_id = v_runtime_tenant_id
    and clinical_tasks.deleted_at is null
    and clinical_tasks.status in ('open', 'in_progress')
    and (
      clinical_tasks.encounter_id is null
      or encounters.unit_id = v_runtime_unit_id
    );

  select coalesce(
    jsonb_agg(appointment_rows.payload order by appointment_rows.starts_at asc),
    '[]'::jsonb
  )
  into v_today_appointments
  from (
    select
      appointments.starts_at,
      jsonb_build_object(
        'id', coalesce(appointments.legacy_appointment_id, appointments.id::text),
        'time', to_char(appointments.starts_at at time zone v_timezone, 'HH24:MI'),
        'patient', patients.full_name,
        'type', appointment_types.name,
        'professional', coalesce(professionals.display_name, 'Equipe clinica'),
        'status',
          case appointments.status
            when 'completed' then 'completed'
            when 'confirmed' then 'confirmed'
            when 'no_show' then 'no_show'
            else 'scheduled'
          end
      ) as payload
    from scheduling.appointments as appointments
    join patients.patients as patients
      on patients.id = appointments.patient_id
    join scheduling.appointment_types as appointment_types
      on appointment_types.id = appointments.appointment_type_id
    left join scheduling.professionals as professionals
      on professionals.id = appointments.professional_id
    where appointments.tenant_id = v_runtime_tenant_id
      and appointments.unit_id = v_runtime_unit_id
      and appointments.deleted_at is null
      and appointments.starts_at >= v_today_start
      and appointments.starts_at < v_today_end
    order by appointments.starts_at asc
    limit 8
  ) as appointment_rows;

  select coalesce(
    jsonb_agg(appointment_rows.payload order by appointment_rows.starts_at asc),
    '[]'::jsonb
  )
  into v_upcoming_appointments
  from (
    select
      appointments.starts_at,
      jsonb_build_object(
        'id', coalesce(appointments.legacy_appointment_id, appointments.id::text),
        'time', to_char(appointments.starts_at at time zone v_timezone, 'HH24:MI'),
        'patient', patients.full_name,
        'type', appointment_types.name,
        'professional', coalesce(professionals.display_name, 'Equipe clinica'),
        'status',
          case appointments.status
            when 'completed' then 'completed'
            when 'confirmed' then 'confirmed'
            when 'no_show' then 'no_show'
            else 'scheduled'
          end
      ) as payload
    from scheduling.appointments as appointments
    join patients.patients as patients
      on patients.id = appointments.patient_id
    join scheduling.appointment_types as appointment_types
      on appointment_types.id = appointments.appointment_type_id
    left join scheduling.professionals as professionals
      on professionals.id = appointments.professional_id
    where appointments.tenant_id = v_runtime_tenant_id
      and appointments.unit_id = v_runtime_unit_id
      and appointments.deleted_at is null
      and appointments.starts_at >= now()
      and appointments.status not in ('cancelled', 'no_show')
    order by appointments.starts_at asc
    limit 8
  ) as appointment_rows;

  select coalesce(
    jsonb_agg(alert_rows.payload order by alert_rows.created_at desc),
    '[]'::jsonb
  )
  into v_flag_alerts
  from (
    select
      patient_flags.created_at,
      jsonb_build_object(
        'id', patient_flags.id::text,
        'title', patients.full_name || ' com alerta ativo',
        'description', coalesce(
          patient_flags.description,
          'Flag ' || patient_flags.flag_type || ' ativa no cadastro.'
        )
      ) as payload
    from patients.patient_flags as patient_flags
    join patients.patients as patients
      on patients.id = patient_flags.patient_id
    where patient_flags.tenant_id = v_runtime_tenant_id
      and patient_flags.active = true
      and patient_flags.severity in ('high', 'critical')
    order by patient_flags.created_at desc
    limit 3
  ) as alert_rows;

  select coalesce(
    jsonb_agg(alert_rows.payload order by alert_rows.created_at desc),
    '[]'::jsonb
  )
  into v_no_show_alerts
  from (
    select
      appointments.updated_at as created_at,
      jsonb_build_object(
        'id', appointments.id::text,
        'title', 'No-show recente de ' || patients.full_name,
        'description', coalesce(
          nullif(appointments.metadata ->> 'reason', ''),
          'Ocorrencia registrada recentemente na agenda.'
        )
      ) as payload
    from scheduling.appointments as appointments
    join patients.patients as patients
      on patients.id = appointments.patient_id
    where appointments.tenant_id = v_runtime_tenant_id
      and appointments.unit_id = v_runtime_unit_id
      and appointments.deleted_at is null
      and appointments.status = 'no_show'
      and appointments.updated_at >= v_seven_days_ago
    order by appointments.updated_at desc
    limit 2
  ) as alert_rows;

  v_alerts := coalesce(v_flag_alerts, '[]'::jsonb) || coalesce(v_no_show_alerts, '[]'::jsonb);

  return jsonb_build_object(
    'stats', jsonb_build_object(
      'scheduledToday', v_scheduled_today,
      'completedToday', v_completed_today,
      'noShows7d', v_no_shows_7d,
      'openClinicalTasks', v_open_clinical_tasks
    ),
    'todayAppointments',
      case
        when jsonb_array_length(v_today_appointments) > 0 then v_today_appointments
        else v_upcoming_appointments
      end,
    'alerts', v_alerts
  );
end;
$$;

revoke all on function api.dashboard_operational_summary(text) from public, anon, authenticated;
grant execute on function api.dashboard_operational_summary(text) to authenticated, service_role;

create or replace function public.dashboard_operational_summary(
  p_current_legacy_unit_id text default null
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select api.dashboard_operational_summary(p_current_legacy_unit_id)
$$;

revoke all on function public.dashboard_operational_summary(text) from public, anon;
grant execute on function public.dashboard_operational_summary(text) to authenticated, service_role;
