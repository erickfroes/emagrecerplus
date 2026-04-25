create or replace function api.upsert_runtime_patient_from_legacy(
  p_runtime_tenant_id uuid,
  p_legacy_patient_id text,
  p_full_name text,
  p_cpf text default null,
  p_birth_date date default null,
  p_primary_phone text default null,
  p_primary_email text default null,
  p_goals_summary text default null,
  p_lifestyle_summary text default null,
  p_legacy_created_by_user_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient_id uuid;
  v_source text := 'hybrid';
  v_profile_id uuid := private.runtime_profile_id_by_legacy_user_id(p_legacy_created_by_user_id);
  v_legacy_patient_id text := nullif(trim(coalesce(p_legacy_patient_id, '')), '');
  v_full_name text := nullif(trim(coalesce(p_full_name, '')), '');
  v_cpf text := nullif(trim(coalesce(p_cpf, '')), '');
  v_primary_phone text := nullif(trim(coalesce(p_primary_phone, '')), '');
  v_primary_email text := nullif(trim(coalesce(p_primary_email, '')), '');
begin
  if p_runtime_tenant_id is null then
    raise exception 'p_runtime_tenant_id is required';
  end if;

  if v_legacy_patient_id is null then
    raise exception 'p_legacy_patient_id is required';
  end if;

  if v_full_name is null then
    raise exception 'p_full_name is required';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not private.can_manage_patients_domain(p_runtime_tenant_id) then
    raise exception 'patient write denied';
  end if;

  insert into patients.patients (
    tenant_id,
    legacy_patient_id,
    full_name,
    cpf,
    birth_date,
    primary_phone,
    primary_email,
    status,
    source,
    metadata
  )
  values (
    p_runtime_tenant_id,
    v_legacy_patient_id,
    v_full_name,
    v_cpf,
    p_birth_date,
    v_primary_phone,
    v_primary_email,
    'active',
    v_source,
    jsonb_strip_nulls(
      coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'source', 'api_runtime_write',
        'legacy_created_by_user_id', p_legacy_created_by_user_id,
        'created_by_profile_id', v_profile_id
      )
    )
  )
  on conflict (legacy_patient_id) do update
  set
    tenant_id = excluded.tenant_id,
    full_name = excluded.full_name,
    cpf = coalesce(excluded.cpf, patients.patients.cpf),
    birth_date = coalesce(excluded.birth_date, patients.patients.birth_date),
    primary_phone = coalesce(excluded.primary_phone, patients.patients.primary_phone),
    primary_email = coalesce(excluded.primary_email, patients.patients.primary_email),
    status = case
      when patients.patients.status = 'archived' then patients.patients.status
      else excluded.status
    end,
    source = case
      when patients.patients.source = 'runtime' then 'hybrid'
      else excluded.source
    end,
    metadata = coalesce(patients.patients.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = now()
  returning id into v_patient_id;

  if p_goals_summary is not null
    or p_lifestyle_summary is not null
    or exists (
      select 1
      from patients.patient_profiles as patient_profiles
      where patient_profiles.patient_id = v_patient_id
    ) then
    insert into patients.patient_profiles (
      patient_id,
      goals_summary,
      lifestyle_summary,
      metadata
    )
    values (
      v_patient_id,
      p_goals_summary,
      p_lifestyle_summary,
      jsonb_strip_nulls(
        coalesce(p_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'source', 'api_runtime_write',
          'legacy_created_by_user_id', p_legacy_created_by_user_id,
          'created_by_profile_id', v_profile_id
        )
      )
    )
    on conflict (patient_id) do update
    set
      goals_summary = coalesce(excluded.goals_summary, patients.patient_profiles.goals_summary),
      lifestyle_summary = coalesce(excluded.lifestyle_summary, patients.patient_profiles.lifestyle_summary),
      metadata = coalesce(patients.patient_profiles.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
      updated_at = now();
  end if;

  return jsonb_build_object(
    'id', v_patient_id::text,
    'legacyPatientId', v_legacy_patient_id,
    'referenceId', v_legacy_patient_id,
    'source', 'supabase_runtime'
  );
end;
$$;

revoke all on function api.upsert_runtime_patient_from_legacy(uuid, text, text, text, date, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function api.upsert_runtime_patient_from_legacy(uuid, text, text, text, date, text, text, text, text, text, jsonb) to service_role;

create or replace function public.upsert_runtime_patient_from_legacy(
  p_runtime_tenant_id uuid,
  p_legacy_patient_id text,
  p_full_name text,
  p_cpf text default null,
  p_birth_date date default null,
  p_primary_phone text default null,
  p_primary_email text default null,
  p_goals_summary text default null,
  p_lifestyle_summary text default null,
  p_legacy_created_by_user_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.upsert_runtime_patient_from_legacy(
    p_runtime_tenant_id,
    p_legacy_patient_id,
    p_full_name,
    p_cpf,
    p_birth_date,
    p_primary_phone,
    p_primary_email,
    p_goals_summary,
    p_lifestyle_summary,
    p_legacy_created_by_user_id,
    p_metadata
  )
$$;

revoke all on function public.upsert_runtime_patient_from_legacy(uuid, text, text, text, date, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.upsert_runtime_patient_from_legacy(uuid, text, text, text, date, text, text, text, text, text, jsonb) to service_role;
