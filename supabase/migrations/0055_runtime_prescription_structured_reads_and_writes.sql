create or replace function private.runtime_encounter_prescriptions_json(
  p_runtime_encounter_id uuid
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
        'id', coalesce(prescription_records.legacy_prescription_id, prescription_records.id::text),
        'runtimeId', prescription_records.id::text,
        'prescriptionType', prescription_records.prescription_type,
        'summary', prescription_records.summary,
        'issuedAt', prescription_records.issued_at,
        'items', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', coalesce(prescription_items.legacy_prescription_item_id, prescription_items.id::text),
              'runtimeId', prescription_items.id::text,
              'itemType', prescription_items.item_type,
              'title', prescription_items.title,
              'dosage', prescription_items.dosage,
              'frequency', prescription_items.frequency,
              'route', prescription_items.route,
              'durationDays', prescription_items.duration_days,
              'quantity', prescription_items.quantity,
              'unit', prescription_items.unit,
              'instructions', prescription_items.instructions,
              'position', prescription_items.position
            )
            order by prescription_items.position asc, prescription_items.created_at asc
          )
          from clinical.prescription_items as prescription_items
          where prescription_items.prescription_record_id = prescription_records.id
        ), '[]'::jsonb)
      )
      order by prescription_records.issued_at desc, prescription_records.created_at desc
    ),
    '[]'::jsonb
  )
  from clinical.prescription_records as prescription_records
  where prescription_records.encounter_id = p_runtime_encounter_id
$$;

create or replace function api.record_prescription_for_encounter(
  p_legacy_tenant_id text,
  p_legacy_encounter_id text,
  p_legacy_prescription_id text default null,
  p_prescription_type text default 'other',
  p_summary text default null,
  p_legacy_issued_by_user_id text default null,
  p_issued_at timestamptz default now(),
  p_items jsonb default '[]'::jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_runtime_tenant_id uuid;
  v_runtime_encounter_id uuid;
  v_runtime_patient_id uuid;
  v_runtime_unit_id uuid;
  v_runtime_prescription_id uuid;
  v_actor_profile_id uuid := private.runtime_profile_id_by_legacy_user_id(p_legacy_issued_by_user_id);
  v_actor_type text := case when v_actor_profile_id is null then 'system' else 'profile' end;
  v_prescription_type text := case
    when lower(coalesce(p_prescription_type, 'other')) in (
      'prescription',
      'orientation',
      'supplement_plan',
      'training_guidance',
      'other'
    ) then lower(coalesce(p_prescription_type, 'other'))
    else 'other'
  end;
  v_summary text := nullif(trim(coalesce(p_summary, '')), '');
  v_issued_at timestamptz := coalesce(p_issued_at, now());
  v_metadata jsonb;
begin
  if nullif(trim(coalesce(p_legacy_tenant_id, '')), '') is null then
    raise exception 'p_legacy_tenant_id is required';
  end if;

  if nullif(trim(coalesce(p_legacy_encounter_id, '')), '') is null then
    raise exception 'p_legacy_encounter_id is required';
  end if;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'p_items must be a json array';
  end if;

  v_runtime_tenant_id := private.runtime_tenant_id_by_legacy_tenant_id(p_legacy_tenant_id);

  if v_runtime_tenant_id is null then
    raise exception 'runtime tenant not found for legacy tenant %', p_legacy_tenant_id;
  end if;

  select
    encounters.id,
    encounters.patient_id,
    encounters.unit_id
  into
    v_runtime_encounter_id,
    v_runtime_patient_id,
    v_runtime_unit_id
  from clinical.encounters as encounters
  where encounters.tenant_id = v_runtime_tenant_id
    and encounters.legacy_encounter_id = p_legacy_encounter_id
  limit 1;

  if v_runtime_encounter_id is null then
    raise exception 'runtime encounter not found for legacy encounter %', p_legacy_encounter_id;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not private.can_manage_clinical_domain(v_runtime_tenant_id, v_runtime_unit_id) then
    raise exception 'record prescription denied';
  end if;

  if v_summary is null then
    select nullif(
      string_agg(nullif(trim(coalesce(item.title, '')), ''), '; ' order by item.position asc),
      ''
    )
    into v_summary
    from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as item(
      title text,
      position integer
    );
  end if;

  v_metadata := jsonb_strip_nulls(
    coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'source', 'api_operational_flow',
      'operation', 'record_prescription',
      'legacy_tenant_id', p_legacy_tenant_id,
      'legacy_encounter_id', p_legacy_encounter_id,
      'legacy_prescription_id', p_legacy_prescription_id,
      'legacy_issued_by_user_id', p_legacy_issued_by_user_id
    )
  );

  if nullif(trim(coalesce(p_legacy_prescription_id, '')), '') is not null then
    select prescription_records.id
    into v_runtime_prescription_id
    from clinical.prescription_records as prescription_records
    where prescription_records.encounter_id = v_runtime_encounter_id
      and prescription_records.legacy_prescription_id = p_legacy_prescription_id
    limit 1;
  end if;

  if v_runtime_prescription_id is null then
    insert into clinical.prescription_records (
      encounter_id,
      patient_id,
      legacy_prescription_id,
      prescription_type,
      summary,
      issued_by_profile_id,
      issued_at,
      metadata
    )
    values (
      v_runtime_encounter_id,
      v_runtime_patient_id,
      nullif(trim(coalesce(p_legacy_prescription_id, '')), ''),
      v_prescription_type,
      v_summary,
      v_actor_profile_id,
      v_issued_at,
      v_metadata
    )
    returning id
    into v_runtime_prescription_id;
  else
    update clinical.prescription_records
    set
      prescription_type = v_prescription_type,
      summary = v_summary,
      issued_by_profile_id = coalesce(v_actor_profile_id, clinical.prescription_records.issued_by_profile_id),
      issued_at = v_issued_at,
      metadata = coalesce(clinical.prescription_records.metadata, '{}'::jsonb) || v_metadata
    where id = v_runtime_prescription_id;

    delete from clinical.prescription_items
    where prescription_record_id = v_runtime_prescription_id;
  end if;

  insert into clinical.prescription_items (
    prescription_record_id,
    legacy_prescription_item_id,
    item_type,
    title,
    dosage,
    frequency,
    route,
    duration_days,
    quantity,
    unit,
    instructions,
    position,
    metadata
  )
  select
    v_runtime_prescription_id,
    nullif(trim(coalesce(items.legacy_prescription_item_id, '')), ''),
    case
      when lower(coalesce(items.item_type, 'other')) in ('medication', 'supplement', 'orientation', 'exam', 'compound', 'other')
        then lower(coalesce(items.item_type, 'other'))
      else 'other'
    end,
    coalesce(nullif(trim(coalesce(items.title, '')), ''), 'Item de prescricao'),
    nullif(trim(coalesce(items.dosage, '')), ''),
    nullif(trim(coalesce(items.frequency, '')), ''),
    nullif(trim(coalesce(items.route, '')), ''),
    case
      when items.duration_days is null then null
      else greatest(items.duration_days, 1)
    end,
    items.quantity,
    nullif(trim(coalesce(items.unit, '')), ''),
    nullif(trim(coalesce(items.instructions, '')), ''),
    greatest(coalesce(items.position, 1), 1),
    coalesce(items.metadata, '{}'::jsonb)
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as items(
    legacy_prescription_item_id text,
    item_type text,
    title text,
    dosage text,
    frequency text,
    route text,
    duration_days integer,
    quantity numeric,
    unit text,
    instructions text,
    position integer,
    metadata jsonb
  );

  perform private.record_audit_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => v_runtime_unit_id,
    p_patient_id => v_runtime_patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => v_actor_profile_id,
    p_event_type => 'clinical.prescription_recorded',
    p_action => 'create',
    p_resource_schema => 'clinical',
    p_resource_table => 'prescription_records',
    p_resource_id => v_runtime_prescription_id,
    p_payload => jsonb_build_object(
      'legacyPrescriptionId', p_legacy_prescription_id,
      'prescriptionType', v_prescription_type,
      'issuedAt', v_issued_at,
      'itemCount', jsonb_array_length(coalesce(p_items, '[]'::jsonb))
    ) || v_metadata
  );

  perform private.record_patient_timeline_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => v_runtime_unit_id,
    p_patient_id => v_runtime_patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => v_actor_profile_id,
    p_event_type => 'prescription_recorded',
    p_event_at => v_issued_at,
    p_source_schema => 'clinical',
    p_source_table => 'prescription_records',
    p_source_id => v_runtime_prescription_id,
    p_payload => jsonb_build_object(
      'legacyPrescriptionId', p_legacy_prescription_id,
      'prescriptionType', v_prescription_type,
      'summary', v_summary,
      'itemCount', jsonb_array_length(coalesce(p_items, '[]'::jsonb))
    ) || v_metadata
  );

  return (
    select jsonb_build_object(
      'id', coalesce(prescription_records.legacy_prescription_id, prescription_records.id::text),
      'runtimeId', prescription_records.id::text,
      'prescriptionType', prescription_records.prescription_type,
      'summary', prescription_records.summary,
      'issuedAt', prescription_records.issued_at,
      'items', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', coalesce(prescription_items.legacy_prescription_item_id, prescription_items.id::text),
            'runtimeId', prescription_items.id::text,
            'itemType', prescription_items.item_type,
            'title', prescription_items.title,
            'dosage', prescription_items.dosage,
            'frequency', prescription_items.frequency,
            'route', prescription_items.route,
            'durationDays', prescription_items.duration_days,
            'quantity', prescription_items.quantity,
            'unit', prescription_items.unit,
            'instructions', prescription_items.instructions,
            'position', prescription_items.position
          )
          order by prescription_items.position asc, prescription_items.created_at asc
        )
        from clinical.prescription_items as prescription_items
        where prescription_items.prescription_record_id = prescription_records.id
      ), '[]'::jsonb)
    )
    from clinical.prescription_records as prescription_records
    where prescription_records.id = v_runtime_prescription_id
  );
end;
$$;

create or replace function public.get_structured_encounter_snapshot(
  p_legacy_tenant_id text,
  p_legacy_encounter_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_payload jsonb := api.get_structured_encounter_snapshot(
    p_legacy_tenant_id,
    p_legacy_encounter_id
  );
  v_runtime_patient_id uuid;
  v_runtime_tenant_id uuid;
  v_runtime_encounter_id uuid;
begin
  if coalesce(v_payload ->> 'ready', 'false') <> 'true' then
    return v_payload;
  end if;

  v_runtime_patient_id := private.runtime_patient_id_from_reference(
    nullif(v_payload #>> '{encounter,patient,id}', '')
  );

  select tenants.id
  into v_runtime_tenant_id
  from platform.tenants as tenants
  where tenants.metadata @> jsonb_build_object('legacy_tenant_id', p_legacy_tenant_id)
  limit 1;

  if v_runtime_tenant_id is not null then
    select encounters.id
    into v_runtime_encounter_id
    from clinical.encounters as encounters
    where encounters.tenant_id = v_runtime_tenant_id
      and encounters.legacy_encounter_id = p_legacy_encounter_id
    limit 1;
  end if;

  return jsonb_set(
    jsonb_set(
      v_payload,
      '{encounter,prescriptions}',
      coalesce(
        private.runtime_encounter_prescriptions_json(v_runtime_encounter_id),
        '[]'::jsonb
      ),
      true
    ),
    '{encounter,nutritionPlan}',
    coalesce(
      private.patient_active_nutrition_plan_json(v_runtime_patient_id, current_date),
      'null'::jsonb
    ),
    true
  );
end;
$$;

revoke all on function private.runtime_encounter_prescriptions_json(uuid) from public, anon, authenticated;
revoke all on function api.record_prescription_for_encounter(text, text, text, text, text, text, timestamptz, jsonb, jsonb) from public, anon, authenticated;

grant execute on function private.runtime_encounter_prescriptions_json(uuid) to authenticated, service_role;
grant execute on function api.record_prescription_for_encounter(text, text, text, text, text, text, timestamptz, jsonb, jsonb) to service_role;
