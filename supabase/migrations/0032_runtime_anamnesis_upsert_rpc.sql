create or replace function api.upsert_runtime_anamnesis(
  p_runtime_tenant_id uuid,
  p_encounter_id uuid,
  p_id uuid default null,
  p_chief_complaint text default null,
  p_history_of_present_illness text default null,
  p_past_medical_history text default null,
  p_past_surgical_history text default null,
  p_family_history text default null,
  p_medication_history text default null,
  p_allergy_history text default null,
  p_lifestyle_history text default null,
  p_gynecological_history text default null,
  p_notes text default null,
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
  v_tenant_id uuid;
  v_anamnesis_id uuid;
  v_effective_created_at timestamptz := coalesce(p_created_at, now());
  v_effective_updated_at timestamptz := coalesce(p_updated_at, coalesce(p_created_at, now()));
begin
  if p_runtime_tenant_id is null then
    raise exception 'p_runtime_tenant_id is required';
  end if;

  if p_encounter_id is null then
    raise exception 'p_encounter_id is required';
  end if;

  select encounters.tenant_id
  into v_tenant_id
  from clinical.encounters as encounters
  where encounters.id = p_encounter_id
  limit 1;

  if v_tenant_id is null then
    raise exception 'runtime encounter % not found', p_encounter_id;
  end if;

  if v_tenant_id <> p_runtime_tenant_id then
    raise exception 'runtime encounter % does not belong to tenant %', p_encounter_id, p_runtime_tenant_id;
  end if;

  insert into clinical.anamneses (
    id,
    encounter_id,
    chief_complaint,
    history_of_present_illness,
    past_medical_history,
    past_surgical_history,
    family_history,
    medication_history,
    allergy_history,
    lifestyle_history,
    gynecological_history,
    notes,
    metadata,
    created_at,
    updated_at
  )
  values (
    coalesce(p_id, gen_random_uuid()),
    p_encounter_id,
    p_chief_complaint,
    p_history_of_present_illness,
    p_past_medical_history,
    p_past_surgical_history,
    p_family_history,
    p_medication_history,
    p_allergy_history,
    p_lifestyle_history,
    p_gynecological_history,
    p_notes,
    coalesce(p_metadata, '{}'::jsonb),
    v_effective_created_at,
    v_effective_updated_at
  )
  on conflict (encounter_id) do update
  set
    chief_complaint = excluded.chief_complaint,
    history_of_present_illness = excluded.history_of_present_illness,
    past_medical_history = excluded.past_medical_history,
    past_surgical_history = excluded.past_surgical_history,
    family_history = excluded.family_history,
    medication_history = excluded.medication_history,
    allergy_history = excluded.allergy_history,
    lifestyle_history = excluded.lifestyle_history,
    gynecological_history = excluded.gynecological_history,
    notes = excluded.notes,
    metadata = coalesce(clinical.anamneses.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    created_at = least(clinical.anamneses.created_at, excluded.created_at),
    updated_at = greatest(clinical.anamneses.updated_at, excluded.updated_at)
  returning id into v_anamnesis_id;

  return jsonb_build_object(
    'id', v_anamnesis_id::text,
    'encounterId', p_encounter_id::text,
    'source', 'supabase_runtime'
  );
end;
$$;

revoke all on function api.upsert_runtime_anamnesis(uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, text, jsonb, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function api.upsert_runtime_anamnesis(uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, text, jsonb, timestamptz, timestamptz) to service_role;

create or replace function public.upsert_runtime_anamnesis(
  p_runtime_tenant_id uuid,
  p_encounter_id uuid,
  p_id uuid default null,
  p_chief_complaint text default null,
  p_history_of_present_illness text default null,
  p_past_medical_history text default null,
  p_past_surgical_history text default null,
  p_family_history text default null,
  p_medication_history text default null,
  p_allergy_history text default null,
  p_lifestyle_history text default null,
  p_gynecological_history text default null,
  p_notes text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_created_at timestamptz default null,
  p_updated_at timestamptz default null
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.upsert_runtime_anamnesis(
    p_runtime_tenant_id,
    p_encounter_id,
    p_id,
    p_chief_complaint,
    p_history_of_present_illness,
    p_past_medical_history,
    p_past_surgical_history,
    p_family_history,
    p_medication_history,
    p_allergy_history,
    p_lifestyle_history,
    p_gynecological_history,
    p_notes,
    p_metadata,
    p_created_at,
    p_updated_at
  )
$$;

revoke all on function public.upsert_runtime_anamnesis(uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, text, jsonb, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.upsert_runtime_anamnesis(uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, text, jsonb, timestamptz, timestamptz) to service_role;
