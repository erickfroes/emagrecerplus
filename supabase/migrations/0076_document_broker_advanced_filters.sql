drop function if exists public.list_accessible_patient_documents(text, text, text, text, text, integer, integer);
drop function if exists api.list_accessible_patient_documents(text, text, text, text, text, integer, integer);

create index if not exists idx_docs_patient_documents_tenant_issued_filters
  on docs.patient_documents (
    tenant_id,
    issued_at desc nulls last,
    created_at desc,
    status,
    document_type
  )
  where deleted_at is null;

create index if not exists idx_docs_signature_requests_document_latest
  on docs.signature_requests (
    patient_document_id,
    requested_at desc nulls last,
    created_at desc,
    request_status
  );

create or replace function api.list_accessible_patient_documents(
  p_legacy_tenant_id text,
  p_legacy_unit_id text default null,
  p_patient_id text default null,
  p_status text default null,
  p_document_type text default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_signature_status text default null,
  p_issued_from timestamptz default null,
  p_issued_to timestamptz default null
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
  v_runtime_patient_id uuid;
  v_status text := lower(nullif(trim(coalesce(p_status, '')), ''));
  v_document_type text := lower(nullif(trim(coalesce(p_document_type, '')), ''));
  v_signature_status text := lower(nullif(trim(coalesce(p_signature_status, '')), ''));
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  if nullif(trim(coalesce(p_legacy_tenant_id, '')), '') is null then
    raise exception 'p_legacy_tenant_id is required';
  end if;

  if v_signature_status is not null
    and v_signature_status not in ('pending', 'sent', 'viewed', 'signed', 'declined', 'expired', 'cancelled') then
    raise exception 'invalid signature status %', p_signature_status;
  end if;

  if p_issued_from is not null and p_issued_to is not null and p_issued_from > p_issued_to then
    raise exception 'p_issued_from must be before or equal to p_issued_to';
  end if;

  v_runtime_tenant_id := private.runtime_tenant_id_by_legacy_tenant_id(p_legacy_tenant_id);

  if v_runtime_tenant_id is null then
    raise exception 'runtime tenant not found for legacy tenant %', p_legacy_tenant_id;
  end if;

  if nullif(trim(coalesce(p_legacy_unit_id, '')), '') is not null then
    v_runtime_unit_id := private.runtime_unit_id_by_legacy_unit_id(
      v_runtime_tenant_id,
      p_legacy_unit_id
    );

    if v_runtime_unit_id is null then
      raise exception 'runtime unit not found for legacy unit %', p_legacy_unit_id;
    end if;
  end if;

  if nullif(trim(coalesce(p_patient_id, '')), '') is not null then
    v_runtime_patient_id := private.runtime_patient_id_by_legacy_patient_id(
      v_runtime_tenant_id,
      p_patient_id
    );

    if v_runtime_patient_id is null then
      select patients.id
      into v_runtime_patient_id
      from patients.patients as patients
      where patients.tenant_id = v_runtime_tenant_id
        and patients.id = private.try_uuid(p_patient_id)
        and patients.deleted_at is null
      limit 1;
    end if;

    if v_runtime_patient_id is null then
      raise exception 'patient % not found in current tenant', p_patient_id;
    end if;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not private.can_read_clinical_domain(v_runtime_tenant_id, v_runtime_unit_id) then
    raise exception 'list patient documents denied';
  end if;

  select coalesce(
    jsonb_build_object(
      'items',
      coalesce(
        jsonb_agg(document_payload order by sort_issued_at desc nulls last, sort_created_at desc),
        '[]'::jsonb
      ),
      'total',
      coalesce(max(total_count), 0),
      'limit',
      v_limit,
      'offset',
      v_offset
    ),
    jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'limit', v_limit, 'offset', v_offset)
  )
  into v_result
  from (
    select
      patient_documents.issued_at as sort_issued_at,
      patient_documents.created_at as sort_created_at,
      count(*) over () as total_count,
      jsonb_strip_nulls(
        jsonb_build_object(
          'id', coalesce(patient_documents.legacy_patient_document_id, patient_documents.id::text),
          'runtimeId', patient_documents.id::text,
          'documentType', patient_documents.document_type,
          'status', patient_documents.status,
          'title', patient_documents.title,
          'summary', patient_documents.summary,
          'documentNumber', patient_documents.document_number,
          'issuedAt', patient_documents.issued_at,
          'expiresAt', patient_documents.expires_at,
          'signedAt', patient_documents.signed_at,
          'patient', jsonb_build_object(
            'id', coalesce(patients.legacy_patient_id, patients.id::text),
            'runtimeId', patients.id::text,
            'name', patients.full_name
          ),
          'encounterId', clinical_encounters.legacy_encounter_id,
          'currentVersion', case
            when document_versions.id is null then null
            else jsonb_strip_nulls(
              jsonb_build_object(
                'id', coalesce(document_versions.legacy_document_version_id, document_versions.id::text),
                'runtimeId', document_versions.id::text,
                'versionNumber', document_versions.version_number,
                'status', document_versions.status,
                'title', document_versions.title,
                'issuedAt', document_versions.issued_at,
                'signedAt', document_versions.signed_at,
                'hasStorageObject',
                  nullif(coalesce(
                    document_versions.signed_storage_object_path,
                    document_versions.storage_object_path,
                    ''
                  ), '') is not null
              )
            )
          end,
          'printableArtifacts', coalesce((
            select jsonb_agg(
              jsonb_strip_nulls(
                jsonb_build_object(
                  'id', coalesce(printable_artifacts.legacy_printable_artifact_id, printable_artifacts.id::text),
                  'runtimeId', printable_artifacts.id::text,
                  'artifactKind', printable_artifacts.artifact_kind,
                  'renderStatus', printable_artifacts.render_status,
                  'renderedAt', printable_artifacts.rendered_at,
                  'hasStorageObject',
                    nullif(coalesce(printable_artifacts.storage_object_path, ''), '') is not null
                )
              )
              order by printable_artifacts.created_at desc
            )
            from docs.printable_artifacts as printable_artifacts
            where printable_artifacts.patient_document_id = patient_documents.id
          ), '[]'::jsonb),
          'signatureRequests', coalesce((
            select jsonb_agg(
              jsonb_strip_nulls(
                jsonb_build_object(
                  'id', coalesce(signature_requests.legacy_signature_request_id, signature_requests.id::text),
                  'runtimeId', signature_requests.id::text,
                  'signerType', signature_requests.signer_type,
                  'providerCode', signature_requests.provider_code,
                  'requestStatus', signature_requests.request_status,
                  'requestedAt', signature_requests.requested_at,
                  'completedAt', signature_requests.completed_at
                )
              )
              order by signature_requests.requested_at desc nulls last, signature_requests.created_at desc
            )
            from docs.signature_requests as signature_requests
            where signature_requests.patient_document_id = patient_documents.id
          ), '[]'::jsonb)
        )
      ) as document_payload
    from docs.patient_documents as patient_documents
    inner join patients.patients as patients
      on patients.id = patient_documents.patient_id
    left join clinical.encounters as clinical_encounters
      on clinical_encounters.id = patient_documents.encounter_id
    left join docs.document_versions as document_versions
      on document_versions.id = patient_documents.current_version_id
    where patient_documents.tenant_id = v_runtime_tenant_id
      and patient_documents.deleted_at is null
      and (v_runtime_patient_id is null or patient_documents.patient_id = v_runtime_patient_id)
      and (v_status is null or patient_documents.status = v_status)
      and (v_document_type is null or patient_documents.document_type = v_document_type)
      and (p_issued_from is null or patient_documents.issued_at >= p_issued_from)
      and (p_issued_to is null or patient_documents.issued_at <= p_issued_to)
      and (
        v_signature_status is null
        or (
          select latest_signature_requests.request_status
          from docs.signature_requests as latest_signature_requests
          where latest_signature_requests.patient_document_id = patient_documents.id
          order by latest_signature_requests.requested_at desc nulls last,
            latest_signature_requests.created_at desc
          limit 1
        ) = v_signature_status
      )
      and (
        v_runtime_unit_id is null
        or patient_documents.unit_id is null
        or patient_documents.unit_id = v_runtime_unit_id
      )
      and (
        coalesce(auth.role(), '') = 'service_role'
        or (
          private.can_read_clinical_domain(
            patient_documents.tenant_id,
            coalesce(patient_documents.unit_id, v_runtime_unit_id)
          )
          and private.can_access_patient(patient_documents.patient_id)
        )
      )
    order by patient_documents.issued_at desc nulls last, patient_documents.created_at desc
    limit v_limit
    offset v_offset
  ) as visible_documents;

  return coalesce(
    v_result,
    jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'limit', v_limit, 'offset', v_offset)
  );
end;
$$;

create or replace function public.list_accessible_patient_documents(
  p_legacy_tenant_id text,
  p_legacy_unit_id text default null,
  p_patient_id text default null,
  p_status text default null,
  p_document_type text default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_signature_status text default null,
  p_issued_from timestamptz default null,
  p_issued_to timestamptz default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select api.list_accessible_patient_documents(
    p_legacy_tenant_id,
    p_legacy_unit_id,
    p_patient_id,
    p_status,
    p_document_type,
    p_limit,
    p_offset,
    p_signature_status,
    p_issued_from,
    p_issued_to
  )
$$;

alter function api.list_accessible_patient_documents(text, text, text, text, text, integer, integer, text, timestamptz, timestamptz)
  security definer;
alter function api.list_accessible_patient_documents(text, text, text, text, text, integer, integer, text, timestamptz, timestamptz)
  set search_path = '';

alter function public.list_accessible_patient_documents(text, text, text, text, text, integer, integer, text, timestamptz, timestamptz)
  security invoker;
alter function public.list_accessible_patient_documents(text, text, text, text, text, integer, integer, text, timestamptz, timestamptz)
  set search_path = '';

revoke all on function api.list_accessible_patient_documents(text, text, text, text, text, integer, integer, text, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.list_accessible_patient_documents(text, text, text, text, text, integer, integer, text, timestamptz, timestamptz)
  from public, anon, authenticated;

grant execute on function api.list_accessible_patient_documents(text, text, text, text, text, integer, integer, text, timestamptz, timestamptz)
  to service_role;
grant execute on function public.list_accessible_patient_documents(text, text, text, text, text, integer, integer, text, timestamptz, timestamptz)
  to service_role;
