create or replace function api.get_patient_document_snapshot(
  p_legacy_tenant_id text,
  p_document_id text,
  p_legacy_unit_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_runtime_tenant_id uuid;
  v_runtime_unit_id uuid;
  v_runtime_document_id uuid;
  v_document_unit_id uuid;
begin
  if nullif(trim(coalesce(p_legacy_tenant_id, '')), '') is null then
    raise exception 'p_legacy_tenant_id is required';
  end if;

  if nullif(trim(coalesce(p_document_id, '')), '') is null then
    raise exception 'p_document_id is required';
  end if;

  v_runtime_tenant_id := private.runtime_tenant_id_by_legacy_tenant_id(p_legacy_tenant_id);

  if v_runtime_tenant_id is null then
    raise exception 'runtime tenant not found for legacy tenant %', p_legacy_tenant_id;
  end if;

  if nullif(trim(coalesce(p_legacy_unit_id, '')), '') is not null then
    select units.id
    into v_runtime_unit_id
    from platform.units as units
    where units.tenant_id = v_runtime_tenant_id
      and units.metadata @> jsonb_build_object('legacy_unit_id', p_legacy_unit_id)
    limit 1;
  end if;

  v_runtime_document_id := private.runtime_patient_document_id_by_public_id(
    v_runtime_tenant_id,
    p_document_id
  );

  if v_runtime_document_id is null then
    raise exception 'patient document % not found in current tenant', p_document_id;
  end if;

  select patient_documents.unit_id
  into v_document_unit_id
  from docs.patient_documents as patient_documents
  where patient_documents.id = v_runtime_document_id
  limit 1;

  if v_runtime_unit_id is not null
    and v_document_unit_id is not null
    and v_document_unit_id <> v_runtime_unit_id then
    raise exception 'document % is outside the current unit scope', p_document_id;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not private.can_read_clinical_domain(v_runtime_tenant_id, coalesce(v_document_unit_id, v_runtime_unit_id)) then
    raise exception 'get patient document snapshot denied';
  end if;

  return coalesce(private.patient_document_json(v_runtime_document_id), '{}'::jsonb);
end;
$$;

create or replace function public.get_patient_document_snapshot(
  p_legacy_tenant_id text,
  p_document_id text,
  p_legacy_unit_id text default null
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select api.get_patient_document_snapshot(
    p_legacy_tenant_id,
    p_document_id,
    p_legacy_unit_id
  )
$$;

revoke all on function api.get_patient_document_snapshot(text, text, text) from public, anon, authenticated;
revoke all on function public.get_patient_document_snapshot(text, text, text) from public, anon, authenticated;

grant execute on function api.get_patient_document_snapshot(text, text, text) to service_role;
grant execute on function public.get_patient_document_snapshot(text, text, text) to service_role;
