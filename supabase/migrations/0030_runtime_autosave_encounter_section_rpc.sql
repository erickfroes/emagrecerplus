create unique index if not exists idx_consultation_notes_encounter_soap_draft_unique
  on clinical.consultation_notes (encounter_id)
  where lower(coalesce(note_type, '')) = 'soap_draft';

create or replace function api.autosave_encounter_section(
  p_legacy_tenant_id text,
  p_legacy_encounter_id text,
  p_section text,
  p_payload jsonb default '{}'::jsonb,
  p_legacy_actor_user_id text default null,
  p_saved_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runtime_tenant_id uuid := private.runtime_tenant_id_by_legacy_tenant_id(p_legacy_tenant_id);
  v_legacy_encounter_id text := nullif(trim(coalesce(p_legacy_encounter_id, '')), '');
  v_section text := lower(nullif(trim(coalesce(p_section, '')), ''));
  v_runtime_encounter_id uuid;
  v_runtime_unit_id uuid;
  v_runtime_patient_id uuid;
  v_runtime_encounter_status text;
  v_runtime_anamnesis_id uuid;
  v_runtime_draft_note_id uuid;
  v_runtime_draft_updated_at timestamptz;
  v_actor_profile_id uuid := private.runtime_profile_id_by_legacy_user_id(p_legacy_actor_user_id);
  v_saved_at timestamptz := coalesce(p_saved_at, now());
  v_metadata jsonb;
begin
  if nullif(trim(coalesce(p_legacy_tenant_id, '')), '') is null then
    raise exception 'p_legacy_tenant_id is required';
  end if;

  if v_legacy_encounter_id is null then
    raise exception 'p_legacy_encounter_id is required';
  end if;

  if v_section is null then
    raise exception 'p_section is required';
  end if;

  if v_section not in ('anamnesis', 'soap_draft') then
    raise exception 'unsupported encounter section %', v_section;
  end if;

  if v_runtime_tenant_id is null then
    raise exception 'runtime tenant not found for legacy tenant %', p_legacy_tenant_id;
  end if;

  select
    encounters.id,
    encounters.unit_id,
    encounters.patient_id,
    encounters.status
  into
    v_runtime_encounter_id,
    v_runtime_unit_id,
    v_runtime_patient_id,
    v_runtime_encounter_status
  from clinical.encounters as encounters
  where encounters.tenant_id = v_runtime_tenant_id
    and encounters.legacy_encounter_id = v_legacy_encounter_id
  limit 1;

  if v_runtime_encounter_id is null then
    raise exception 'runtime encounter not found for legacy encounter %', v_legacy_encounter_id;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not private.can_manage_clinical_domain(v_runtime_tenant_id, v_runtime_unit_id) then
    raise exception 'autosave encounter section denied';
  end if;

  if v_runtime_encounter_status = 'cancelled' then
    raise exception 'encounter % is cancelled', v_legacy_encounter_id;
  end if;

  v_metadata := jsonb_strip_nulls(
    coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'source', 'api_operational_flow',
      'operation', 'autosave_encounter_section',
      'section', v_section,
      'legacy_tenant_id', p_legacy_tenant_id,
      'legacy_encounter_id', v_legacy_encounter_id,
      'legacy_actor_user_id', p_legacy_actor_user_id,
      'savedAt', v_saved_at
    )
  );

  if v_section = 'anamnesis' then
    insert into clinical.anamneses (
      encounter_id,
      chief_complaint,
      history_of_present_illness,
      past_medical_history,
      lifestyle_history,
      notes,
      metadata,
      created_at,
      updated_at
    )
    values (
      v_runtime_encounter_id,
      p_payload ->> 'chiefComplaint',
      p_payload ->> 'historyOfPresentIllness',
      p_payload ->> 'pastMedicalHistory',
      p_payload ->> 'lifestyleHistory',
      p_payload ->> 'notes',
      v_metadata,
      v_saved_at,
      v_saved_at
    )
    on conflict (encounter_id) do update
    set
      chief_complaint = case
        when excluded.updated_at >= coalesce(clinical.anamneses.updated_at, '-infinity'::timestamptz)
          then excluded.chief_complaint
        else clinical.anamneses.chief_complaint
      end,
      history_of_present_illness = case
        when excluded.updated_at >= coalesce(clinical.anamneses.updated_at, '-infinity'::timestamptz)
          then excluded.history_of_present_illness
        else clinical.anamneses.history_of_present_illness
      end,
      past_medical_history = case
        when excluded.updated_at >= coalesce(clinical.anamneses.updated_at, '-infinity'::timestamptz)
          then excluded.past_medical_history
        else clinical.anamneses.past_medical_history
      end,
      lifestyle_history = case
        when excluded.updated_at >= coalesce(clinical.anamneses.updated_at, '-infinity'::timestamptz)
          then excluded.lifestyle_history
        else clinical.anamneses.lifestyle_history
      end,
      notes = case
        when excluded.updated_at >= coalesce(clinical.anamneses.updated_at, '-infinity'::timestamptz)
          then excluded.notes
        else clinical.anamneses.notes
      end,
      metadata = case
        when excluded.updated_at >= coalesce(clinical.anamneses.updated_at, '-infinity'::timestamptz)
          then coalesce(clinical.anamneses.metadata, '{}'::jsonb) || excluded.metadata
        else clinical.anamneses.metadata
      end,
      updated_at = greatest(
        coalesce(clinical.anamneses.updated_at, '-infinity'::timestamptz),
        excluded.updated_at
      )
    returning id into v_runtime_anamnesis_id;

    return jsonb_build_object(
      'section', 'anamnesis',
      'encounterId', v_runtime_encounter_id::text,
      'legacyEncounterId', v_legacy_encounter_id,
      'savedAt', v_saved_at,
      'source', 'supabase_runtime',
      'anamnesis', jsonb_build_object(
        'id', v_runtime_anamnesis_id::text,
        'chiefComplaint', p_payload ->> 'chiefComplaint',
        'historyOfPresentIllness', p_payload ->> 'historyOfPresentIllness',
        'pastMedicalHistory', p_payload ->> 'pastMedicalHistory',
        'lifestyleHistory', p_payload ->> 'lifestyleHistory',
        'notes', p_payload ->> 'notes'
      )
    );
  end if;

  select
    note.id,
    note.updated_at
  into
    v_runtime_draft_note_id,
    v_runtime_draft_updated_at
  from clinical.consultation_notes as note
  where note.encounter_id = v_runtime_encounter_id
    and lower(coalesce(note.note_type, '')) = 'soap_draft'
  limit 1;

  if exists (
    select 1
    from clinical.consultation_notes as note
    where note.encounter_id = v_runtime_encounter_id
      and lower(coalesce(note.note_type, '')) <> 'soap_draft'
      and coalesce(note.signed_at, note.updated_at, note.created_at) >= v_saved_at
  ) then
    return jsonb_build_object(
      'section', 'soap_draft',
      'encounterId', v_runtime_encounter_id::text,
      'legacyEncounterId', v_legacy_encounter_id,
      'savedAt', v_saved_at,
      'source', 'supabase_runtime',
      'soapDraft', null
    );
  end if;

  if v_runtime_draft_note_id is null then
    insert into clinical.consultation_notes (
      encounter_id,
      note_type,
      subjective,
      objective,
      assessment,
      plan,
      signed_by_profile_id,
      signed_at,
      metadata,
      created_at,
      updated_at
    )
    values (
      v_runtime_encounter_id,
      'soap_draft',
      p_payload ->> 'subjective',
      p_payload ->> 'objective',
      p_payload ->> 'assessment',
      p_payload ->> 'plan',
      null,
      null,
      v_metadata || jsonb_build_object('draft', true),
      v_saved_at,
      v_saved_at
    )
    returning id into v_runtime_draft_note_id;
  else
    update clinical.consultation_notes
    set
      subjective = case
        when v_saved_at >= coalesce(v_runtime_draft_updated_at, '-infinity'::timestamptz)
          then p_payload ->> 'subjective'
        else clinical.consultation_notes.subjective
      end,
      objective = case
        when v_saved_at >= coalesce(v_runtime_draft_updated_at, '-infinity'::timestamptz)
          then p_payload ->> 'objective'
        else clinical.consultation_notes.objective
      end,
      assessment = case
        when v_saved_at >= coalesce(v_runtime_draft_updated_at, '-infinity'::timestamptz)
          then p_payload ->> 'assessment'
        else clinical.consultation_notes.assessment
      end,
      plan = case
        when v_saved_at >= coalesce(v_runtime_draft_updated_at, '-infinity'::timestamptz)
          then p_payload ->> 'plan'
        else clinical.consultation_notes.plan
      end,
      metadata = case
        when v_saved_at >= coalesce(v_runtime_draft_updated_at, '-infinity'::timestamptz)
          then coalesce(clinical.consultation_notes.metadata, '{}'::jsonb)
            || v_metadata
            || jsonb_build_object('draft', true)
        else clinical.consultation_notes.metadata
      end,
      updated_at = greatest(
        coalesce(clinical.consultation_notes.updated_at, '-infinity'::timestamptz),
        v_saved_at
      )
    where clinical.consultation_notes.id = v_runtime_draft_note_id;
  end if;

  return jsonb_build_object(
    'section', 'soap_draft',
    'encounterId', v_runtime_encounter_id::text,
    'legacyEncounterId', v_legacy_encounter_id,
    'savedAt', v_saved_at,
    'source', 'supabase_runtime',
    'soapDraft', jsonb_build_object(
      'id', v_runtime_draft_note_id::text,
      'noteType', 'SOAP_DRAFT',
      'subjective', p_payload ->> 'subjective',
      'objective', p_payload ->> 'objective',
      'assessment', p_payload ->> 'assessment',
      'plan', p_payload ->> 'plan'
    )
  );
end;
$$;

revoke all on function api.autosave_encounter_section(text, text, text, jsonb, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function api.autosave_encounter_section(text, text, text, jsonb, text, timestamptz, jsonb) to service_role;

create or replace function public.autosave_encounter_section(
  p_legacy_tenant_id text,
  p_legacy_encounter_id text,
  p_section text,
  p_payload jsonb default '{}'::jsonb,
  p_legacy_actor_user_id text default null,
  p_saved_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.autosave_encounter_section(
    p_legacy_tenant_id,
    p_legacy_encounter_id,
    p_section,
    p_payload,
    p_legacy_actor_user_id,
    p_saved_at,
    p_metadata
  )
$$;

revoke all on function public.autosave_encounter_section(text, text, text, jsonb, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.autosave_encounter_section(text, text, text, jsonb, text, timestamptz, jsonb) to service_role;
