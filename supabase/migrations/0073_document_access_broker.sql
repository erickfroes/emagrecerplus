create table if not exists docs.document_access_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  unit_id uuid references platform.units(id) on delete set null,
  patient_id uuid not null references patients.patients(id) on delete cascade,
  patient_document_id uuid not null references docs.patient_documents(id) on delete cascade,
  document_version_id uuid references docs.document_versions(id) on delete set null,
  printable_artifact_id uuid references docs.printable_artifacts(id) on delete set null,
  actor_profile_id uuid references identity.profiles(id) on delete set null,
  access_action text not null,
  access_status text not null default 'granted',
  storage_bucket text not null default 'patient-documents',
  storage_object_path text,
  signed_url_expires_at timestamptz,
  request_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint document_access_events_action_check
    check (access_action in ('open', 'download')),
  constraint document_access_events_status_check
    check (access_status in ('granted', 'denied', 'storage_error'))
);

create index if not exists idx_document_access_events_tenant_created
  on docs.document_access_events (tenant_id, created_at desc);

create index if not exists idx_document_access_events_document_created
  on docs.document_access_events (patient_document_id, created_at desc);

create index if not exists idx_document_access_events_patient_created
  on docs.document_access_events (patient_id, created_at desc);

create index if not exists idx_document_access_events_actor_created
  on docs.document_access_events (actor_profile_id, created_at desc)
  where actor_profile_id is not null;

alter table docs.document_access_events enable row level security;

drop policy if exists document_access_events_select on docs.document_access_events;
create policy document_access_events_select
on docs.document_access_events
for select
using (
  private.can_read_clinical_domain(tenant_id, unit_id)
  and private.can_access_patient(patient_id)
);

create or replace function api.list_accessible_patient_documents(
  p_legacy_tenant_id text,
  p_legacy_unit_id text default null,
  p_patient_id text default null,
  p_status text default null,
  p_document_type text default null,
  p_limit integer default 50,
  p_offset integer default 0
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
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  if nullif(trim(coalesce(p_legacy_tenant_id, '')), '') is null then
    raise exception 'p_legacy_tenant_id is required';
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
              order by signature_requests.requested_at desc, signature_requests.created_at desc
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

create or replace function api.prepare_patient_document_access(
  p_legacy_tenant_id text,
  p_document_id text,
  p_artifact_id text default null,
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
  v_runtime_patient_id uuid;
  v_document_unit_id uuid;
  v_document_title text;
  v_document_type text;
  v_public_document_id text;
  v_document_version_id uuid;
  v_public_document_version_id text;
  v_printable_artifact_id uuid;
  v_public_printable_artifact_id text;
  v_artifact_kind text := 'document_version';
  v_render_status text;
  v_storage_object_path text;
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
    v_runtime_unit_id := private.runtime_unit_id_by_legacy_unit_id(
      v_runtime_tenant_id,
      p_legacy_unit_id
    );

    if v_runtime_unit_id is null then
      raise exception 'runtime unit not found for legacy unit %', p_legacy_unit_id;
    end if;
  end if;

  v_runtime_document_id := private.runtime_patient_document_id_by_public_id(
    v_runtime_tenant_id,
    p_document_id
  );

  if v_runtime_document_id is null then
    raise exception 'patient document % not found in current tenant', p_document_id;
  end if;

  select
    patient_documents.unit_id,
    patient_documents.patient_id,
    patient_documents.title,
    patient_documents.document_type,
    coalesce(patient_documents.legacy_patient_document_id, patient_documents.id::text),
    document_versions.id,
    coalesce(document_versions.legacy_document_version_id, document_versions.id::text),
    coalesce(
      nullif(document_versions.signed_storage_object_path, ''),
      nullif(document_versions.storage_object_path, '')
    ),
    document_versions.status
  into
    v_document_unit_id,
    v_runtime_patient_id,
    v_document_title,
    v_document_type,
    v_public_document_id,
    v_document_version_id,
    v_public_document_version_id,
    v_storage_object_path,
    v_render_status
  from docs.patient_documents as patient_documents
  left join docs.document_versions as document_versions
    on document_versions.id = patient_documents.current_version_id
  where patient_documents.id = v_runtime_document_id
    and patient_documents.deleted_at is null
  limit 1;

  if v_runtime_patient_id is null then
    raise exception 'patient document % not found in current tenant', p_document_id;
  end if;

  if v_runtime_unit_id is not null
    and v_document_unit_id is not null
    and v_document_unit_id <> v_runtime_unit_id then
    raise exception 'document % is outside the current unit scope', p_document_id;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not (
      private.can_read_clinical_domain(
        v_runtime_tenant_id,
        coalesce(v_document_unit_id, v_runtime_unit_id)
      )
      and private.can_access_patient(v_runtime_patient_id)
    ) then
    raise exception 'prepare patient document access denied';
  end if;

  if nullif(trim(coalesce(p_artifact_id, '')), '') is not null then
    select
      printable_artifacts.id,
      coalesce(printable_artifacts.legacy_printable_artifact_id, printable_artifacts.id::text),
      printable_artifacts.artifact_kind,
      printable_artifacts.render_status,
      nullif(printable_artifacts.storage_object_path, '')
    into
      v_printable_artifact_id,
      v_public_printable_artifact_id,
      v_artifact_kind,
      v_render_status,
      v_storage_object_path
    from docs.printable_artifacts as printable_artifacts
    where printable_artifacts.patient_document_id = v_runtime_document_id
      and (
        printable_artifacts.id = private.try_uuid(p_artifact_id)
        or printable_artifacts.legacy_printable_artifact_id = nullif(trim(coalesce(p_artifact_id, '')), '')
      )
    limit 1;

    if v_printable_artifact_id is null then
      raise exception 'printable artifact % not found for document %', p_artifact_id, p_document_id;
    end if;
  elsif v_document_version_id is null then
    raise exception 'document % has no current version', p_document_id;
  end if;

  if nullif(trim(coalesce(v_storage_object_path, '')), '') is null then
    raise exception 'document access target has no storage object path';
  end if;

  if v_printable_artifact_id is not null
    and coalesce(v_render_status, '') <> 'rendered' then
    raise exception 'printable artifact % is not rendered', p_artifact_id;
  end if;

  return jsonb_strip_nulls(
    jsonb_build_object(
      'id', coalesce(v_public_printable_artifact_id, v_public_document_version_id),
      'runtimeId', coalesce(v_printable_artifact_id, v_document_version_id)::text,
      'targetKind', case
        when v_printable_artifact_id is null then 'document_version'
        else 'printable_artifact'
      end,
      'documentId', v_public_document_id,
      'runtimeDocumentId', v_runtime_document_id::text,
      'documentVersionId', v_public_document_version_id,
      'runtimeDocumentVersionId', v_document_version_id::text,
      'printableArtifactId', v_public_printable_artifact_id,
      'runtimePrintableArtifactId', v_printable_artifact_id::text,
      'artifactKind', v_artifact_kind,
      'renderStatus', v_render_status,
      'documentTitle', v_document_title,
      'documentType', v_document_type,
      'storageBucket', 'patient-documents',
      'storageObjectPath', v_storage_object_path
    )
  );
end;
$$;

create or replace function api.record_patient_document_access_event(
  p_legacy_tenant_id text,
  p_document_id text,
  p_access_action text,
  p_access_status text default 'granted',
  p_artifact_id text default null,
  p_document_version_id text default null,
  p_legacy_unit_id text default null,
  p_signed_url_expires_at timestamptz default null,
  p_storage_bucket text default 'patient-documents',
  p_storage_object_path text default null,
  p_legacy_actor_user_id text default null,
  p_request_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_runtime_tenant_id uuid;
  v_runtime_unit_id uuid;
  v_runtime_document_id uuid;
  v_runtime_patient_id uuid;
  v_document_unit_id uuid;
  v_document_version_id uuid;
  v_printable_artifact_id uuid;
  v_actor_profile_id uuid := private.runtime_profile_id_by_legacy_user_id(p_legacy_actor_user_id);
  v_actor_type text := case when v_actor_profile_id is null then 'system' else 'profile' end;
  v_access_action text := lower(nullif(trim(coalesce(p_access_action, '')), ''));
  v_access_status text := lower(nullif(trim(coalesce(p_access_status, '')), ''));
  v_metadata jsonb := coalesce(p_request_metadata, '{}'::jsonb);
  v_access_event_id uuid;
begin
  if nullif(trim(coalesce(p_legacy_tenant_id, '')), '') is null then
    raise exception 'p_legacy_tenant_id is required';
  end if;

  if nullif(trim(coalesce(p_document_id, '')), '') is null then
    raise exception 'p_document_id is required';
  end if;

  if jsonb_typeof(v_metadata) <> 'object' then
    raise exception 'p_request_metadata must be a json object';
  end if;

  if v_access_action not in ('open', 'download') then
    raise exception 'invalid document access action %', p_access_action;
  end if;

  if v_access_status not in ('granted', 'denied', 'storage_error') then
    raise exception 'invalid document access status %', p_access_status;
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

  v_runtime_document_id := private.runtime_patient_document_id_by_public_id(
    v_runtime_tenant_id,
    p_document_id
  );

  if v_runtime_document_id is null then
    raise exception 'patient document % not found in current tenant', p_document_id;
  end if;

  select
    patient_documents.patient_id,
    patient_documents.unit_id,
    patient_documents.current_version_id
  into
    v_runtime_patient_id,
    v_document_unit_id,
    v_document_version_id
  from docs.patient_documents as patient_documents
  where patient_documents.id = v_runtime_document_id
    and patient_documents.deleted_at is null
  limit 1;

  if v_runtime_unit_id is not null
    and v_document_unit_id is not null
    and v_document_unit_id <> v_runtime_unit_id then
    raise exception 'document % is outside the current unit scope', p_document_id;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not (
      private.can_read_clinical_domain(
        v_runtime_tenant_id,
        coalesce(v_document_unit_id, v_runtime_unit_id)
      )
      and private.can_access_patient(v_runtime_patient_id)
    ) then
    raise exception 'record patient document access denied';
  end if;

  if nullif(trim(coalesce(p_artifact_id, '')), '') is not null then
    select printable_artifacts.id
    into v_printable_artifact_id
    from docs.printable_artifacts as printable_artifacts
    where printable_artifacts.patient_document_id = v_runtime_document_id
      and (
        printable_artifacts.id = private.try_uuid(p_artifact_id)
        or printable_artifacts.legacy_printable_artifact_id = nullif(trim(coalesce(p_artifact_id, '')), '')
      )
    limit 1;

    if v_printable_artifact_id is null then
      raise exception 'printable artifact % not found for document %', p_artifact_id, p_document_id;
    end if;
  elsif nullif(trim(coalesce(p_document_version_id, '')), '') is not null then
    select document_versions.id
    into v_document_version_id
    from docs.document_versions as document_versions
    where document_versions.patient_document_id = v_runtime_document_id
      and (
        document_versions.id = private.try_uuid(p_document_version_id)
        or document_versions.legacy_document_version_id = nullif(trim(coalesce(p_document_version_id, '')), '')
      )
    limit 1;
  end if;

  insert into docs.document_access_events (
    tenant_id,
    unit_id,
    patient_id,
    patient_document_id,
    document_version_id,
    printable_artifact_id,
    actor_profile_id,
    access_action,
    access_status,
    storage_bucket,
    storage_object_path,
    signed_url_expires_at,
    metadata
  )
  values (
    v_runtime_tenant_id,
    v_document_unit_id,
    v_runtime_patient_id,
    v_runtime_document_id,
    case when v_printable_artifact_id is null then v_document_version_id else null end,
    v_printable_artifact_id,
    v_actor_profile_id,
    v_access_action,
    v_access_status,
    coalesce(nullif(trim(coalesce(p_storage_bucket, '')), ''), 'patient-documents'),
    nullif(trim(coalesce(p_storage_object_path, '')), ''),
    p_signed_url_expires_at,
    jsonb_strip_nulls(
      v_metadata
      || jsonb_build_object(
        'source', 'document_access_broker',
        'legacy_tenant_id', p_legacy_tenant_id,
        'legacy_unit_id', p_legacy_unit_id,
        'legacy_actor_user_id', p_legacy_actor_user_id
      )
    )
  )
  returning id
  into v_access_event_id;

  perform private.record_audit_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => v_document_unit_id,
    p_patient_id => v_runtime_patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => v_actor_profile_id,
    p_event_type => 'docs.patient_document_access_' || v_access_status,
    p_action => v_access_action,
    p_resource_schema => 'docs',
    p_resource_table => case
      when v_printable_artifact_id is null then 'document_versions'
      else 'printable_artifacts'
    end,
    p_resource_id => coalesce(v_printable_artifact_id, v_document_version_id, v_runtime_document_id),
    p_payload => jsonb_strip_nulls(
      v_metadata
      || jsonb_build_object(
        'accessEventId', v_access_event_id,
        'patientDocumentId', v_runtime_document_id,
        'documentVersionId', v_document_version_id,
        'printableArtifactId', v_printable_artifact_id,
        'accessAction', v_access_action,
        'accessStatus', v_access_status,
        'signedUrlExpiresAt', p_signed_url_expires_at,
        'storageBucket', coalesce(nullif(trim(coalesce(p_storage_bucket, '')), ''), 'patient-documents')
      )
    )
  );

  return jsonb_build_object(
    'id', v_access_event_id::text,
    'documentId', v_runtime_document_id::text,
    'documentVersionId', v_document_version_id::text,
    'printableArtifactId', v_printable_artifact_id::text,
    'accessAction', v_access_action,
    'accessStatus', v_access_status,
    'createdAt', now()
  );
end;
$$;

revoke all on table docs.document_access_events from public, anon, authenticated;
grant select on table docs.document_access_events to authenticated, service_role;
grant insert, update, delete on table docs.document_access_events to service_role;

revoke all on function api.list_accessible_patient_documents(text, text, text, text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function api.prepare_patient_document_access(text, text, text, text)
  from public, anon, authenticated;
revoke all on function api.record_patient_document_access_event(text, text, text, text, text, text, text, timestamptz, text, text, text, jsonb)
  from public, anon, authenticated;

grant execute on function api.list_accessible_patient_documents(text, text, text, text, text, integer, integer)
  to service_role;
grant execute on function api.prepare_patient_document_access(text, text, text, text)
  to service_role;
grant execute on function api.record_patient_document_access_event(text, text, text, text, text, text, text, timestamptz, text, text, text, jsonb)
  to service_role;
