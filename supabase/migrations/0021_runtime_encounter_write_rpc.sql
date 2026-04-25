create or replace function private.runtime_appointment_id_by_legacy_appointment_id(
  p_runtime_tenant_id uuid,
  p_legacy_appointment_id text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select appointments.id
  from scheduling.appointments as appointments
  where appointments.tenant_id = p_runtime_tenant_id
    and appointments.legacy_appointment_id = p_legacy_appointment_id
  limit 1
$$;

create or replace function private.runtime_encounter_id_by_legacy_encounter_id(
  p_runtime_tenant_id uuid,
  p_legacy_encounter_id text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select encounters.id
  from clinical.encounters as encounters
  where encounters.tenant_id = p_runtime_tenant_id
    and encounters.legacy_encounter_id = p_legacy_encounter_id
  limit 1
$$;

revoke all on function private.runtime_appointment_id_by_legacy_appointment_id(uuid, text) from public, anon, authenticated;
revoke all on function private.runtime_encounter_id_by_legacy_encounter_id(uuid, text) from public, anon, authenticated;

grant execute on function private.runtime_appointment_id_by_legacy_appointment_id(uuid, text) to service_role;
grant execute on function private.runtime_encounter_id_by_legacy_encounter_id(uuid, text) to service_role;

create or replace function api.upsert_runtime_encounter_from_legacy(
  p_legacy_tenant_id text,
  p_legacy_encounter_id text,
  p_legacy_unit_id text,
  p_legacy_patient_id text,
  p_encounter_type text default 'other',
  p_status text default 'open',
  p_legacy_professional_id text default null,
  p_legacy_appointment_id text default null,
  p_summary text default null,
  p_opened_at timestamptz default null,
  p_closed_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb,
  p_created_at timestamptz default null,
  p_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runtime_tenant_id uuid := private.runtime_tenant_id_by_legacy_tenant_id(p_legacy_tenant_id);
  v_runtime_unit_id uuid;
  v_runtime_patient_id uuid;
  v_runtime_professional_id uuid;
  v_runtime_appointment_id uuid;
  v_encounter_id uuid;
  v_legacy_encounter_id text := nullif(trim(coalesce(p_legacy_encounter_id, '')), '');
  v_legacy_unit_id text := nullif(trim(coalesce(p_legacy_unit_id, '')), '');
  v_legacy_patient_id text := nullif(trim(coalesce(p_legacy_patient_id, '')), '');
  v_legacy_professional_id text := nullif(trim(coalesce(p_legacy_professional_id, '')), '');
  v_legacy_appointment_id text := nullif(trim(coalesce(p_legacy_appointment_id, '')), '');
  v_encounter_type text := lower(coalesce(nullif(trim(coalesce(p_encounter_type, '')), ''), 'other'));
  v_status text := lower(coalesce(nullif(trim(coalesce(p_status, '')), ''), 'open'));
  v_metadata jsonb;
begin
  if nullif(trim(coalesce(p_legacy_tenant_id, '')), '') is null then
    raise exception 'p_legacy_tenant_id is required';
  end if;

  if v_runtime_tenant_id is null then
    raise exception 'runtime tenant not found for legacy tenant %', p_legacy_tenant_id;
  end if;

  if v_legacy_encounter_id is null then
    raise exception 'p_legacy_encounter_id is required';
  end if;

  if v_legacy_unit_id is null then
    raise exception 'p_legacy_unit_id is required';
  end if;

  if v_legacy_patient_id is null then
    raise exception 'p_legacy_patient_id is required';
  end if;

  if v_encounter_type not in ('initial_consult', 'follow_up', 'procedure', 'teleconsult', 'review', 'other') then
    raise exception 'invalid encounter type %', v_encounter_type;
  end if;

  if v_status not in ('open', 'closed', 'cancelled') then
    raise exception 'invalid encounter status %', v_status;
  end if;

  v_runtime_unit_id := private.runtime_unit_id_by_legacy_unit_id(v_runtime_tenant_id, v_legacy_unit_id);
  if v_runtime_unit_id is null then
    raise exception 'runtime unit not found for legacy unit %', v_legacy_unit_id;
  end if;

  v_runtime_patient_id := private.runtime_patient_id_by_legacy_patient_id(v_runtime_tenant_id, v_legacy_patient_id);
  if v_runtime_patient_id is null then
    raise exception 'runtime patient not found for legacy patient %', v_legacy_patient_id;
  end if;

  if v_legacy_professional_id is not null then
    v_runtime_professional_id := private.runtime_professional_id_by_legacy_professional_id(
      v_runtime_tenant_id,
      v_legacy_professional_id
    );

    if v_runtime_professional_id is null then
      raise exception 'runtime professional not found for legacy professional %', v_legacy_professional_id;
    end if;
  else
    v_runtime_professional_id := null;
  end if;

  if v_legacy_appointment_id is not null then
    v_runtime_appointment_id := private.runtime_appointment_id_by_legacy_appointment_id(
      v_runtime_tenant_id,
      v_legacy_appointment_id
    );

    if v_runtime_appointment_id is null then
      raise exception 'runtime appointment not found for legacy appointment %', v_legacy_appointment_id;
    end if;
  else
    v_runtime_appointment_id := null;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not private.can_manage_clinical_domain(v_runtime_tenant_id, v_runtime_unit_id) then
    raise exception 'encounter write denied';
  end if;

  v_metadata := jsonb_strip_nulls(
    coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'source', 'api_runtime_write',
      'legacy_tenant_id', p_legacy_tenant_id,
      'legacy_unit_id', v_legacy_unit_id,
      'legacy_patient_id', v_legacy_patient_id,
      'legacy_professional_id', v_legacy_professional_id,
      'legacy_appointment_id', v_legacy_appointment_id
    )
  );

  select private.runtime_encounter_id_by_legacy_encounter_id(v_runtime_tenant_id, v_legacy_encounter_id)
  into v_encounter_id;

  if v_encounter_id is null then
    insert into clinical.encounters (
      tenant_id,
      unit_id,
      patient_id,
      appointment_id,
      professional_id,
      legacy_encounter_id,
      encounter_type,
      status,
      summary,
      opened_at,
      closed_at,
      metadata,
      created_at,
      updated_at
    )
    values (
      v_runtime_tenant_id,
      v_runtime_unit_id,
      v_runtime_patient_id,
      v_runtime_appointment_id,
      v_runtime_professional_id,
      v_legacy_encounter_id,
      v_encounter_type,
      v_status,
      p_summary,
      coalesce(p_opened_at, now()),
      p_closed_at,
      v_metadata,
      coalesce(p_created_at, now()),
      coalesce(p_updated_at, coalesce(p_created_at, now()))
    )
    returning id into v_encounter_id;
  else
    update clinical.encounters
    set
      tenant_id = v_runtime_tenant_id,
      unit_id = v_runtime_unit_id,
      patient_id = v_runtime_patient_id,
      appointment_id = v_runtime_appointment_id,
      professional_id = v_runtime_professional_id,
      encounter_type = v_encounter_type,
      status = v_status,
      summary = coalesce(p_summary, clinical.encounters.summary),
      opened_at = coalesce(p_opened_at, clinical.encounters.opened_at),
      closed_at = coalesce(p_closed_at, clinical.encounters.closed_at),
      metadata = coalesce(clinical.encounters.metadata, '{}'::jsonb) || v_metadata,
      updated_at = coalesce(p_updated_at, now())
    where clinical.encounters.id = v_encounter_id;
  end if;

  return jsonb_build_object(
    'id', v_encounter_id::text,
    'legacyEncounterId', v_legacy_encounter_id,
    'status', v_status,
    'source', 'supabase_runtime'
  );
end;
$$;

revoke all on function api.upsert_runtime_encounter_from_legacy(text, text, text, text, text, text, text, text, text, timestamptz, timestamptz, jsonb, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function api.upsert_runtime_encounter_from_legacy(text, text, text, text, text, text, text, text, text, timestamptz, timestamptz, jsonb, timestamptz, timestamptz) to service_role;

create or replace function public.upsert_runtime_encounter_from_legacy(
  p_legacy_tenant_id text,
  p_legacy_encounter_id text,
  p_legacy_unit_id text,
  p_legacy_patient_id text,
  p_encounter_type text default 'other',
  p_status text default 'open',
  p_legacy_professional_id text default null,
  p_legacy_appointment_id text default null,
  p_summary text default null,
  p_opened_at timestamptz default null,
  p_closed_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb,
  p_created_at timestamptz default null,
  p_updated_at timestamptz default null
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.upsert_runtime_encounter_from_legacy(
    p_legacy_tenant_id,
    p_legacy_encounter_id,
    p_legacy_unit_id,
    p_legacy_patient_id,
    p_encounter_type,
    p_status,
    p_legacy_professional_id,
    p_legacy_appointment_id,
    p_summary,
    p_opened_at,
    p_closed_at,
    p_metadata,
    p_created_at,
    p_updated_at
  )
$$;

revoke all on function public.upsert_runtime_encounter_from_legacy(text, text, text, text, text, text, text, text, text, timestamptz, timestamptz, jsonb, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.upsert_runtime_encounter_from_legacy(text, text, text, text, text, text, text, text, text, timestamptz, timestamptz, jsonb, timestamptz, timestamptz) to service_role;
