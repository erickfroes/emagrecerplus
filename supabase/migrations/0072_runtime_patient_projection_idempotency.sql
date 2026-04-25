-- Reconcile legacy patient projection when an active runtime patient already
-- exists for the same tenant/CPF but is still bound to a previous legacy id.

create or replace function private.ensure_runtime_patient_from_legacy(
  p_runtime_tenant_id uuid,
  p_legacy_tenant_id text,
  p_legacy_patient_id text,
  p_full_name text,
  p_cpf text default null,
  p_birth_date date default null,
  p_primary_phone text default null,
  p_primary_email text default null,
  p_legacy_created_by_user_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient_id uuid;
  v_profile_id uuid := private.runtime_profile_id_by_legacy_user_id(p_legacy_created_by_user_id);
  v_legacy_tenant_id text := nullif(btrim(coalesce(p_legacy_tenant_id, '')), '');
  v_legacy_patient_id text := nullif(btrim(coalesce(p_legacy_patient_id, '')), '');
  v_full_name text := nullif(btrim(coalesce(p_full_name, '')), '');
  v_cpf text := nullif(btrim(coalesce(p_cpf, '')), '');
  v_primary_phone text := nullif(btrim(coalesce(p_primary_phone, '')), '');
  v_primary_email text := nullif(btrim(coalesce(p_primary_email, '')), '');
  v_source text := 'hybrid';
  v_metadata jsonb;
begin
  if p_runtime_tenant_id is null then
    raise exception 'runtime tenant id is required';
  end if;

  if v_legacy_tenant_id is null then
    raise exception 'legacy tenant id is required';
  end if;

  if v_legacy_patient_id is null then
    raise exception 'legacy patient id is required';
  end if;

  if v_full_name is null then
    raise exception 'full name is required';
  end if;

  v_metadata := jsonb_strip_nulls(
    coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'source', 'api_runtime_write',
      'legacy_patient_id', v_legacy_patient_id,
      'legacy_tenant_id', v_legacy_tenant_id,
      'legacy_created_by_user_id', p_legacy_created_by_user_id,
      'created_by_profile_id', v_profile_id
    )
  );

  perform pg_advisory_xact_lock(
    hashtextextended(
      format('patient_legacy:%s:%s', p_runtime_tenant_id::text, v_legacy_patient_id),
      0
    )
  );

  if v_cpf is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(
        format('patient_cpf:%s:%s', p_runtime_tenant_id::text, v_cpf),
        0
      )
    );
  end if;

  select patients.id
  into v_patient_id
  from patients.patients as patients
  where patients.tenant_id = p_runtime_tenant_id
    and (
      patients.legacy_patient_id = v_legacy_patient_id
      or patients.metadata @> jsonb_build_object('legacy_patient_id', v_legacy_patient_id)
      or patients.metadata @> jsonb_build_object('legacyPatientId', v_legacy_patient_id)
    )
  order by
    case
      when patients.legacy_patient_id = v_legacy_patient_id then 0
      else 1
    end,
    patients.created_at asc,
    patients.id asc
  limit 1;

  if v_patient_id is null and v_cpf is not null then
    select patients.id
    into v_patient_id
    from patients.patients as patients
    where patients.tenant_id = p_runtime_tenant_id
      and patients.cpf = v_cpf
      and patients.deleted_at is null
    order by
      case when patients.status = 'active' then 0 else 1 end,
      patients.created_at asc,
      patients.id asc
    limit 1;
  end if;

  if v_patient_id is not null then
    update patients.patients as patients
    set
      legacy_patient_id = case
        when patients.legacy_patient_id = v_legacy_patient_id then patients.legacy_patient_id
        when not exists (
          select 1
          from patients.patients as conflicting
          where conflicting.legacy_patient_id = v_legacy_patient_id
            and conflicting.id <> patients.id
        ) then v_legacy_patient_id
        else patients.legacy_patient_id
      end,
      full_name = v_full_name,
      cpf = case
        when v_cpf is null then patients.cpf
        when patients.cpf = v_cpf then patients.cpf
        when patients.cpf is null
          and not exists (
            select 1
            from patients.patients as conflicting
            where conflicting.tenant_id = p_runtime_tenant_id
              and conflicting.cpf = v_cpf
              and conflicting.deleted_at is null
              and conflicting.id <> patients.id
          ) then v_cpf
        else patients.cpf
      end,
      birth_date = coalesce(p_birth_date, patients.birth_date),
      primary_phone = coalesce(v_primary_phone, patients.primary_phone),
      primary_email = coalesce(v_primary_email, patients.primary_email),
      status = case
        when patients.status = 'archived' then patients.status
        else 'active'
      end,
      source = case
        when patients.source = 'runtime' then 'hybrid'
        else v_source
      end,
      metadata = coalesce(patients.metadata, '{}'::jsonb)
        || jsonb_strip_nulls(
          jsonb_build_object(
            'previous_legacy_patient_id',
            case
              when patients.legacy_patient_id is distinct from v_legacy_patient_id
              then patients.legacy_patient_id
              else null
            end
          )
        )
        || v_metadata,
      updated_at = now()
    where patients.id = v_patient_id
    returning patients.id into v_patient_id;

    return v_patient_id;
  end if;

  insert into patients.patients as patients (
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
    v_metadata
  )
  on conflict (tenant_id, cpf)
  where cpf is not null
    and deleted_at is null
  do update
  set
    legacy_patient_id = case
      when patients.legacy_patient_id = excluded.legacy_patient_id then patients.legacy_patient_id
      when not exists (
        select 1
        from patients.patients as conflicting
        where conflicting.legacy_patient_id = excluded.legacy_patient_id
          and conflicting.id <> patients.id
      ) then excluded.legacy_patient_id
      else patients.legacy_patient_id
    end,
    full_name = excluded.full_name,
    birth_date = coalesce(excluded.birth_date, patients.birth_date),
    primary_phone = coalesce(excluded.primary_phone, patients.primary_phone),
    primary_email = coalesce(excluded.primary_email, patients.primary_email),
    status = case
      when patients.status = 'archived' then patients.status
      else 'active'
    end,
    source = case
      when patients.source = 'runtime' then 'hybrid'
      else excluded.source
    end,
    metadata = coalesce(patients.metadata, '{}'::jsonb)
      || jsonb_strip_nulls(
        jsonb_build_object(
          'previous_legacy_patient_id',
          case
            when patients.legacy_patient_id is distinct from excluded.legacy_patient_id
            then patients.legacy_patient_id
            else null
          end
        )
      )
      || coalesce(excluded.metadata, '{}'::jsonb),
    updated_at = now()
  returning patients.id into v_patient_id;

  return v_patient_id;
end;
$$;

create or replace function private.runtime_patient_id_by_legacy_patient_id(
  p_runtime_tenant_id uuid,
  p_legacy_patient_id text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select patients.id
  from patients.patients as patients
  where patients.tenant_id = p_runtime_tenant_id
    and (
      patients.legacy_patient_id = nullif(btrim(coalesce(p_legacy_patient_id, '')), '')
      or patients.metadata @> jsonb_build_object(
        'legacy_patient_id',
        nullif(btrim(coalesce(p_legacy_patient_id, '')), '')
      )
      or patients.metadata @> jsonb_build_object(
        'legacyPatientId',
        nullif(btrim(coalesce(p_legacy_patient_id, '')), '')
      )
    )
  order by
    case
      when patients.legacy_patient_id = nullif(btrim(coalesce(p_legacy_patient_id, '')), '')
      then 0
      else 1
    end,
    patients.created_at asc,
    patients.id asc
  limit 1
$$;

create or replace function private.runtime_patient_id_from_reference(
  p_patient_reference text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select patients.id
  from patients.patients as patients
  where patients.legacy_patient_id = nullif(btrim(coalesce(p_patient_reference, '')), '')
     or patients.id::text = nullif(btrim(coalesce(p_patient_reference, '')), '')
     or patients.metadata @> jsonb_build_object(
       'legacy_patient_id',
       nullif(btrim(coalesce(p_patient_reference, '')), '')
     )
     or patients.metadata @> jsonb_build_object(
       'legacyPatientId',
       nullif(btrim(coalesce(p_patient_reference, '')), '')
     )
  order by
    case
      when patients.legacy_patient_id = nullif(btrim(coalesce(p_patient_reference, '')), '') then 0
      when patients.id::text = nullif(btrim(coalesce(p_patient_reference, '')), '') then 1
      else 2
    end,
    patients.created_at asc,
    patients.id asc
  limit 1
$$;

create or replace function api.upsert_runtime_patient_from_legacy(
  p_legacy_tenant_id text,
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
  v_runtime_tenant_id uuid := private.runtime_tenant_id_by_legacy_tenant_id(p_legacy_tenant_id);
  v_patient_id uuid;
  v_profile_id uuid := private.runtime_profile_id_by_legacy_user_id(p_legacy_created_by_user_id);
  v_legacy_patient_id text := nullif(btrim(coalesce(p_legacy_patient_id, '')), '');
  v_full_name text := nullif(btrim(coalesce(p_full_name, '')), '');
  v_metadata jsonb;
begin
  if nullif(btrim(coalesce(p_legacy_tenant_id, '')), '') is null then
    raise exception 'p_legacy_tenant_id is required';
  end if;

  if v_runtime_tenant_id is null then
    raise exception 'runtime tenant not found for legacy tenant %', p_legacy_tenant_id;
  end if;

  if v_legacy_patient_id is null then
    raise exception 'p_legacy_patient_id is required';
  end if;

  if v_full_name is null then
    raise exception 'p_full_name is required';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not private.can_manage_patients_domain(v_runtime_tenant_id) then
    raise exception 'patient write denied';
  end if;

  v_metadata := jsonb_strip_nulls(
    coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'source', 'api_runtime_write',
      'legacy_patient_id', v_legacy_patient_id,
      'legacy_created_by_user_id', p_legacy_created_by_user_id,
      'created_by_profile_id', v_profile_id,
      'legacy_tenant_id', p_legacy_tenant_id
    )
  );

  v_patient_id := private.ensure_runtime_patient_from_legacy(
    v_runtime_tenant_id,
    p_legacy_tenant_id,
    v_legacy_patient_id,
    v_full_name,
    p_cpf,
    p_birth_date,
    p_primary_phone,
    p_primary_email,
    p_legacy_created_by_user_id,
    p_metadata
  );

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
      v_metadata
    )
    on conflict (patient_id) do update
    set
      goals_summary = coalesce(excluded.goals_summary, patients.patient_profiles.goals_summary),
      lifestyle_summary = coalesce(excluded.lifestyle_summary, patients.patient_profiles.lifestyle_summary),
      metadata = coalesce(patients.patient_profiles.metadata, '{}'::jsonb)
        || coalesce(excluded.metadata, '{}'::jsonb),
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

revoke all on function private.ensure_runtime_patient_from_legacy(
  uuid,
  text,
  text,
  text,
  text,
  date,
  text,
  text,
  text,
  jsonb
) from public, anon, authenticated;
grant execute on function private.ensure_runtime_patient_from_legacy(
  uuid,
  text,
  text,
  text,
  text,
  date,
  text,
  text,
  text,
  jsonb
) to service_role;

revoke all on function private.runtime_patient_id_by_legacy_patient_id(uuid, text)
from public, anon, authenticated;
grant execute on function private.runtime_patient_id_by_legacy_patient_id(uuid, text)
to service_role;

revoke all on function private.runtime_patient_id_from_reference(text)
from public, anon, authenticated;
grant execute on function private.runtime_patient_id_from_reference(text)
to service_role;

revoke all on function api.upsert_runtime_patient_from_legacy(
  text,
  text,
  text,
  text,
  date,
  text,
  text,
  text,
  text,
  text,
  jsonb
) from public, anon, authenticated;
grant execute on function api.upsert_runtime_patient_from_legacy(
  text,
  text,
  text,
  text,
  date,
  text,
  text,
  text,
  text,
  text,
  jsonb
) to service_role;
