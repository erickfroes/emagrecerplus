create or replace function api.get_encounter_autosave_overlay(
  p_legacy_tenant_id text,
  p_legacy_encounter_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runtime_tenant_id uuid := private.runtime_tenant_id_by_legacy_tenant_id(p_legacy_tenant_id);
  v_legacy_encounter_id text := nullif(trim(coalesce(p_legacy_encounter_id, '')), '');
  v_runtime_encounter_id uuid;
  v_runtime_unit_id uuid;
  v_anamnesis record;
  v_soap_draft record;
begin
  if nullif(trim(coalesce(p_legacy_tenant_id, '')), '') is null then
    raise exception 'p_legacy_tenant_id is required';
  end if;

  if v_legacy_encounter_id is null then
    raise exception 'p_legacy_encounter_id is required';
  end if;

  if v_runtime_tenant_id is null then
    return jsonb_build_object(
      'encounterId', null,
      'legacyEncounterId', v_legacy_encounter_id,
      'source', 'supabase_scaffold',
      'anamnesis', null,
      'soapDraft', null
    );
  end if;

  select
    encounters.id,
    encounters.unit_id
  into
    v_runtime_encounter_id,
    v_runtime_unit_id
  from clinical.encounters as encounters
  where encounters.tenant_id = v_runtime_tenant_id
    and encounters.legacy_encounter_id = v_legacy_encounter_id
  limit 1;

  if v_runtime_encounter_id is null then
    return jsonb_build_object(
      'encounterId', null,
      'legacyEncounterId', v_legacy_encounter_id,
      'source', 'supabase_scaffold',
      'anamnesis', null,
      'soapDraft', null
    );
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not private.can_manage_clinical_domain(v_runtime_tenant_id, v_runtime_unit_id) then
    raise exception 'get encounter autosave overlay denied';
  end if;

  select
    anamneses.id,
    anamneses.chief_complaint,
    anamneses.history_of_present_illness,
    anamneses.past_medical_history,
    anamneses.lifestyle_history,
    anamneses.notes
  into v_anamnesis
  from clinical.anamneses as anamneses
  where anamneses.encounter_id = v_runtime_encounter_id
  limit 1;

  select
    notes.id,
    notes.note_type,
    notes.subjective,
    notes.objective,
    notes.assessment,
    notes.plan,
    notes.signed_at
  into v_soap_draft
  from clinical.consultation_notes as notes
  where notes.encounter_id = v_runtime_encounter_id
    and lower(coalesce(notes.note_type, '')) = 'soap_draft'
  order by notes.updated_at desc
  limit 1;

  return jsonb_build_object(
    'encounterId', v_runtime_encounter_id::text,
    'legacyEncounterId', v_legacy_encounter_id,
    'source', 'supabase_runtime',
    'anamnesis',
      case
        when v_anamnesis.id is null then null
        else jsonb_build_object(
          'id', v_anamnesis.id::text,
          'chiefComplaint', v_anamnesis.chief_complaint,
          'historyOfPresentIllness', v_anamnesis.history_of_present_illness,
          'pastMedicalHistory', v_anamnesis.past_medical_history,
          'lifestyleHistory', v_anamnesis.lifestyle_history,
          'notes', v_anamnesis.notes
        )
      end,
    'soapDraft',
      case
        when v_soap_draft.id is null then null
        else jsonb_build_object(
          'id', v_soap_draft.id::text,
          'noteType', v_soap_draft.note_type,
          'subjective', v_soap_draft.subjective,
          'objective', v_soap_draft.objective,
          'assessment', v_soap_draft.assessment,
          'plan', v_soap_draft.plan,
          'signedAt', v_soap_draft.signed_at
        )
      end
  );
end;
$$;

revoke all on function api.get_encounter_autosave_overlay(text, text) from public, anon, authenticated;
grant execute on function api.get_encounter_autosave_overlay(text, text) to service_role;

create or replace function public.get_encounter_autosave_overlay(
  p_legacy_tenant_id text,
  p_legacy_encounter_id text
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select api.get_encounter_autosave_overlay(
    p_legacy_tenant_id,
    p_legacy_encounter_id
  )
$$;

revoke all on function public.get_encounter_autosave_overlay(text, text) from public, anon, authenticated;
grant execute on function public.get_encounter_autosave_overlay(text, text) to service_role;

create or replace function api.clear_encounter_soap_draft(
  p_legacy_tenant_id text,
  p_legacy_encounter_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runtime_tenant_id uuid := private.runtime_tenant_id_by_legacy_tenant_id(p_legacy_tenant_id);
  v_legacy_encounter_id text := nullif(trim(coalesce(p_legacy_encounter_id, '')), '');
  v_runtime_encounter_id uuid;
  v_runtime_unit_id uuid;
  v_deleted_count integer := 0;
begin
  if nullif(trim(coalesce(p_legacy_tenant_id, '')), '') is null then
    raise exception 'p_legacy_tenant_id is required';
  end if;

  if v_legacy_encounter_id is null then
    raise exception 'p_legacy_encounter_id is required';
  end if;

  if v_runtime_tenant_id is null then
    return jsonb_build_object(
      'encounterId', null,
      'legacyEncounterId', v_legacy_encounter_id,
      'clearedCount', 0,
      'source', 'supabase_scaffold'
    );
  end if;

  select
    encounters.id,
    encounters.unit_id
  into
    v_runtime_encounter_id,
    v_runtime_unit_id
  from clinical.encounters as encounters
  where encounters.tenant_id = v_runtime_tenant_id
    and encounters.legacy_encounter_id = v_legacy_encounter_id
  limit 1;

  if v_runtime_encounter_id is null then
    return jsonb_build_object(
      'encounterId', null,
      'legacyEncounterId', v_legacy_encounter_id,
      'clearedCount', 0,
      'source', 'supabase_scaffold'
    );
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not private.can_manage_clinical_domain(v_runtime_tenant_id, v_runtime_unit_id) then
    raise exception 'clear encounter soap draft denied';
  end if;

  delete from clinical.consultation_notes as notes
  where notes.encounter_id = v_runtime_encounter_id
    and lower(coalesce(notes.note_type, '')) = 'soap_draft';

  get diagnostics v_deleted_count = row_count;

  return jsonb_build_object(
    'encounterId', v_runtime_encounter_id::text,
    'legacyEncounterId', v_legacy_encounter_id,
    'clearedCount', v_deleted_count,
    'source', 'supabase_runtime'
  );
end;
$$;

revoke all on function api.clear_encounter_soap_draft(text, text) from public, anon, authenticated;
grant execute on function api.clear_encounter_soap_draft(text, text) to service_role;

create or replace function public.clear_encounter_soap_draft(
  p_legacy_tenant_id text,
  p_legacy_encounter_id text
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.clear_encounter_soap_draft(
    p_legacy_tenant_id,
    p_legacy_encounter_id
  )
$$;

revoke all on function public.clear_encounter_soap_draft(text, text) from public, anon, authenticated;
grant execute on function public.clear_encounter_soap_draft(text, text) to service_role;
