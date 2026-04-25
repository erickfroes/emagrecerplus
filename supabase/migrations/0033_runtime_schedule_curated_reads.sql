create or replace function api.list_appointments(
  p_date date default null,
  p_status text default null,
  p_professional text default null,
  p_unit text default null,
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
  v_target_date date := coalesce(p_date, (now() at time zone 'America/Araguaina')::date);
  v_items jsonb := '[]'::jsonb;
begin
  if v_runtime_tenant_id is null then
    raise exception 'list appointments denied';
  end if;

  v_runtime_unit_id := private.runtime_unit_id_from_reference(
    v_runtime_tenant_id,
    p_current_legacy_unit_id
  );

  if v_runtime_unit_id is null then
    raise exception 'runtime unit not found for legacy unit %', p_current_legacy_unit_id;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not private.can_read_schedule_domain(v_runtime_tenant_id, v_runtime_unit_id) then
    raise exception 'list appointments denied';
  end if;

  select coalesce(
    jsonb_agg(appointment_rows.payload order by appointment_rows.starts_at asc),
    '[]'::jsonb
  )
  into v_items
  from (
    select
      appointments.starts_at,
      jsonb_build_object(
        'id', coalesce(appointments.legacy_appointment_id, appointments.id::text),
        'runtimeId', appointments.id::text,
        'startsAt', appointments.starts_at,
        'endsAt', appointments.ends_at,
        'status', appointments.status,
        'patient', patients.full_name,
        'type', appointment_types.name,
        'professional', coalesce(professionals.display_name, 'Equipe clinica'),
        'room', units.name
      ) as payload
    from scheduling.appointments as appointments
    join patients.patients as patients
      on patients.id = appointments.patient_id
    join scheduling.appointment_types as appointment_types
      on appointment_types.id = appointments.appointment_type_id
    left join scheduling.professionals as professionals
      on professionals.id = appointments.professional_id
    join platform.units as units
      on units.id = appointments.unit_id
    where appointments.tenant_id = v_runtime_tenant_id
      and appointments.unit_id = v_runtime_unit_id
      and appointments.deleted_at is null
      and (appointments.starts_at at time zone 'America/Araguaina')::date = v_target_date
      and (
        p_status is null
        or appointments.status = p_status
      )
      and (
        p_professional is null
        or professionals.display_name ilike '%' || p_professional || '%'
      )
      and (
        p_unit is null
        or units.name ilike '%' || p_unit || '%'
      )
  ) as appointment_rows;

  if v_items = '[]'::jsonb
    and p_date is null
    and p_status is null
    and p_professional is null
    and p_unit is null then
    select coalesce(
      jsonb_agg(appointment_rows.payload order by appointment_rows.starts_at asc),
      '[]'::jsonb
    )
    into v_items
    from (
      select
        appointments.starts_at,
        jsonb_build_object(
          'id', coalesce(appointments.legacy_appointment_id, appointments.id::text),
          'runtimeId', appointments.id::text,
          'startsAt', appointments.starts_at,
          'endsAt', appointments.ends_at,
          'status', appointments.status,
          'patient', patients.full_name,
          'type', appointment_types.name,
          'professional', coalesce(professionals.display_name, 'Equipe clinica'),
          'room', units.name
        ) as payload
      from scheduling.appointments as appointments
      join patients.patients as patients
        on patients.id = appointments.patient_id
      join scheduling.appointment_types as appointment_types
        on appointment_types.id = appointments.appointment_type_id
      left join scheduling.professionals as professionals
        on professionals.id = appointments.professional_id
      join platform.units as units
        on units.id = appointments.unit_id
      where appointments.tenant_id = v_runtime_tenant_id
        and appointments.unit_id = v_runtime_unit_id
        and appointments.deleted_at is null
        and appointments.starts_at >= now()
        and appointments.status not in ('cancelled', 'no_show')
      order by appointments.starts_at asc
      limit 12
    ) as appointment_rows;
  end if;

  return jsonb_build_object(
    'items', v_items
  );
end;
$$;

revoke all on function api.list_appointments(date, text, text, text, text) from public, anon, authenticated;
grant execute on function api.list_appointments(date, text, text, text, text) to authenticated, service_role;
