update storage.buckets
set
  allowed_mime_types = array[
    'application/json',
    'application/pdf',
    'application/zip',
    'application/x-zip-compressed',
    'image/png',
    'image/jpeg',
    'image/webp',
    'text/html'
  ]::text[],
  updated_at = now()
where id = 'patient-documents';

create table if not exists docs.document_legal_evidence_packages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  unit_id uuid references platform.units (id) on delete set null,
  patient_id uuid not null references patients.patients (id) on delete cascade,
  patient_document_id uuid not null references docs.patient_documents (id) on delete cascade,
  document_legal_evidence_id uuid not null references docs.document_legal_evidence (id) on delete cascade,
  document_version_id uuid references docs.document_versions (id) on delete set null,
  signature_request_id uuid references docs.signature_requests (id) on delete set null,
  package_kind text not null default 'legal_evidence_json',
  package_status text not null default 'generating',
  storage_bucket text not null default 'patient-documents',
  storage_object_path text not null,
  content_type text not null default 'application/json',
  file_name text not null,
  checksum text,
  byte_size integer,
  generated_by_profile_id uuid references identity.profiles (id) on delete set null,
  generated_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_legal_evidence_packages_kind_check
    check (package_kind in ('legal_evidence_json')),
  constraint document_legal_evidence_packages_status_check
    check (package_status in ('generating', 'generated', 'failed', 'superseded')),
  constraint document_legal_evidence_packages_content_type_check
    check (content_type in ('application/json')),
  constraint document_legal_evidence_packages_byte_size_check
    check (byte_size is null or byte_size >= 0)
);

create index if not exists idx_docs_document_legal_evidence_packages_document_created
  on docs.document_legal_evidence_packages (patient_document_id, created_at desc);

create index if not exists idx_docs_document_legal_evidence_packages_evidence_created
  on docs.document_legal_evidence_packages (document_legal_evidence_id, created_at desc);

create index if not exists idx_docs_document_legal_evidence_packages_tenant_status
  on docs.document_legal_evidence_packages (tenant_id, package_status, updated_at desc);

create unique index if not exists idx_docs_document_legal_evidence_packages_storage_path
  on docs.document_legal_evidence_packages (storage_bucket, storage_object_path);

drop trigger if exists set_docs_document_legal_evidence_packages_updated_at on docs.document_legal_evidence_packages;
create trigger set_docs_document_legal_evidence_packages_updated_at
before update on docs.document_legal_evidence_packages
for each row execute function private.set_current_timestamp_updated_at();

alter table docs.document_legal_evidence_packages enable row level security;

drop policy if exists document_legal_evidence_packages_select_current_scope on docs.document_legal_evidence_packages;
create policy document_legal_evidence_packages_select_current_scope
on docs.document_legal_evidence_packages
for select
to authenticated
using (
  private.can_read_clinical_domain(tenant_id, unit_id)
  and private.can_access_patient(patient_id)
);

drop policy if exists document_legal_evidence_packages_manage_current_scope on docs.document_legal_evidence_packages;
create policy document_legal_evidence_packages_manage_current_scope
on docs.document_legal_evidence_packages
for all
to authenticated
using (
  private.can_manage_clinical_domain(tenant_id, unit_id)
  and private.can_access_patient(patient_id)
)
with check (
  private.can_manage_clinical_domain(tenant_id, unit_id)
  and private.can_access_patient(patient_id)
);

create table if not exists docs.document_legal_evidence_package_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  unit_id uuid references platform.units (id) on delete set null,
  patient_id uuid not null references patients.patients (id) on delete cascade,
  patient_document_id uuid not null references docs.patient_documents (id) on delete cascade,
  document_legal_evidence_id uuid not null references docs.document_legal_evidence (id) on delete cascade,
  document_legal_evidence_package_id uuid references docs.document_legal_evidence_packages (id) on delete set null,
  actor_profile_id uuid references identity.profiles (id) on delete set null,
  event_action text not null,
  event_status text not null,
  storage_bucket text not null default 'patient-documents',
  storage_object_path text,
  signed_url_expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint document_legal_evidence_package_events_action_check
    check (event_action in ('generate', 'download')),
  constraint document_legal_evidence_package_events_status_check
    check (event_status in ('pending', 'completed', 'granted', 'failed', 'storage_error', 'denied'))
);

create index if not exists idx_docs_document_legal_evidence_package_events_package_created
  on docs.document_legal_evidence_package_events (document_legal_evidence_package_id, created_at desc);

create index if not exists idx_docs_document_legal_evidence_package_events_document_created
  on docs.document_legal_evidence_package_events (patient_document_id, created_at desc);

create index if not exists idx_docs_document_legal_evidence_package_events_tenant_created
  on docs.document_legal_evidence_package_events (tenant_id, created_at desc);

alter table docs.document_legal_evidence_package_events enable row level security;

drop policy if exists document_legal_evidence_package_events_select_current_scope on docs.document_legal_evidence_package_events;
create policy document_legal_evidence_package_events_select_current_scope
on docs.document_legal_evidence_package_events
for select
to authenticated
using (
  private.can_read_clinical_domain(tenant_id, unit_id)
  and private.can_access_patient(patient_id)
);

revoke all on table docs.document_legal_evidence_packages from public, anon, authenticated;
revoke all on table docs.document_legal_evidence_package_events from public, anon, authenticated;
grant select, insert, update, delete on table docs.document_legal_evidence_packages to service_role;
grant select, insert, update, delete on table docs.document_legal_evidence_package_events to service_role;

create or replace function private.document_legal_evidence_package_safe_json(
  p_package_id uuid,
  p_event_limit integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_event_limit, 10), 1), 50);
  v_result jsonb;
begin
  select jsonb_strip_nulls(
    jsonb_build_object(
      'id', evidence_packages.id::text,
      'runtimeId', evidence_packages.id::text,
      'documentId', coalesce(patient_documents.legacy_patient_document_id, patient_documents.id::text),
      'runtimeDocumentId', evidence_packages.patient_document_id::text,
      'evidenceId', evidence_packages.document_legal_evidence_id::text,
      'runtimeEvidenceId', evidence_packages.document_legal_evidence_id::text,
      'documentVersionId', coalesce(document_versions.legacy_document_version_id, document_versions.id::text),
      'runtimeDocumentVersionId', evidence_packages.document_version_id::text,
      'signatureRequestId', coalesce(signature_requests.legacy_signature_request_id, signature_requests.id::text),
      'runtimeSignatureRequestId', evidence_packages.signature_request_id::text,
      'packageKind', evidence_packages.package_kind,
      'packageStatus', evidence_packages.package_status,
      'contentType', evidence_packages.content_type,
      'fileName', evidence_packages.file_name,
      'checksum', evidence_packages.checksum,
      'byteSize', evidence_packages.byte_size,
      'generatedAt', evidence_packages.generated_at,
      'failedAt', evidence_packages.failed_at,
      'failureReason', evidence_packages.failure_reason,
      'createdAt', evidence_packages.created_at,
      'updatedAt', evidence_packages.updated_at,
      'metadata', evidence_packages.metadata - 'storageObjectPath' - 'storage_object_path',
      'events', coalesce((
        select jsonb_agg(package_event_payload order by package_event_created_at desc)
        from (
          select
            package_events.created_at as package_event_created_at,
            jsonb_strip_nulls(
              jsonb_build_object(
                'id', package_events.id::text,
                'runtimeId', package_events.id::text,
                'eventAction', package_events.event_action,
                'eventStatus', package_events.event_status,
                'signedUrlExpiresAt', package_events.signed_url_expires_at,
                'createdAt', package_events.created_at,
                'actor', case
                  when actor_profiles.id is null then null
                  else jsonb_strip_nulls(
                    jsonb_build_object(
                      'runtimeId', actor_profiles.id::text,
                      'name', coalesce(
                        actor_profiles.full_name,
                        actor_profiles.display_name,
                        actor_profiles.email::text
                      ),
                      'email', actor_profiles.email::text
                    )
                  )
                end
              )
            ) as package_event_payload
          from docs.document_legal_evidence_package_events as package_events
          left join identity.profiles as actor_profiles
            on actor_profiles.id = package_events.actor_profile_id
          where package_events.document_legal_evidence_package_id = evidence_packages.id
          order by package_events.created_at desc
          limit v_limit
        ) as limited_package_events
      ), '[]'::jsonb)
    )
  )
  into v_result
  from docs.document_legal_evidence_packages as evidence_packages
  inner join docs.patient_documents as patient_documents
    on patient_documents.id = evidence_packages.patient_document_id
  left join docs.document_versions as document_versions
    on document_versions.id = evidence_packages.document_version_id
  left join docs.signature_requests as signature_requests
    on signature_requests.id = evidence_packages.signature_request_id
  where evidence_packages.id = p_package_id
  limit 1;

  return v_result;
end;
$$;

create or replace function api.get_document_legal_evidence_package_summary(
  p_legacy_tenant_id text,
  p_document_id text,
  p_legacy_unit_id text default null,
  p_event_limit integer default 10
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
  v_package_id uuid;
  v_limit integer := least(greatest(coalesce(p_event_limit, 10), 1), 50);
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

  select patient_documents.patient_id, patient_documents.unit_id
  into v_runtime_patient_id, v_document_unit_id
  from docs.patient_documents as patient_documents
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
    raise exception 'get document legal evidence package summary denied';
  end if;

  select evidence_packages.id
  into v_package_id
  from docs.document_legal_evidence_packages as evidence_packages
  inner join docs.document_legal_evidence as evidence
    on evidence.id = evidence_packages.document_legal_evidence_id
  where evidence_packages.patient_document_id = v_runtime_document_id
    and evidence_packages.package_status in ('generated', 'failed')
    and evidence.evidence_status <> 'superseded'
  order by
    case evidence_packages.package_status when 'generated' then 0 else 1 end,
    coalesce(evidence_packages.generated_at, evidence_packages.failed_at, evidence_packages.created_at) desc,
    evidence_packages.created_at desc
  limit 1;

  if v_package_id is null then
    return jsonb_build_object(
      'documentId', p_document_id,
      'runtimeDocumentId', v_runtime_document_id::text,
      'packageStatus', 'not_generated',
      'events', '[]'::jsonb
    );
  end if;

  return private.document_legal_evidence_package_safe_json(v_package_id, v_limit);
end;
$$;

create or replace function api.prepare_document_legal_evidence_package(
  p_legacy_tenant_id text,
  p_document_id text,
  p_legacy_unit_id text default null,
  p_legacy_actor_user_id text default null,
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
  v_runtime_unit_id uuid;
  v_runtime_document_id uuid;
  v_runtime_patient_id uuid;
  v_document_unit_id uuid;
  v_document_version_id uuid;
  v_signature_request_id uuid;
  v_evidence_id uuid;
  v_package_id uuid := gen_random_uuid();
  v_actor_profile_id uuid := private.runtime_profile_id_by_legacy_user_id(p_legacy_actor_user_id);
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_storage_object_path text;
  v_file_name text;
begin
  if nullif(trim(coalesce(p_legacy_tenant_id, '')), '') is null then
    raise exception 'p_legacy_tenant_id is required';
  end if;

  if nullif(trim(coalesce(p_document_id, '')), '') is null then
    raise exception 'p_document_id is required';
  end if;

  if jsonb_typeof(v_metadata) <> 'object' then
    raise exception 'p_metadata must be a json object';
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
    raise exception 'prepare document legal evidence package denied';
  end if;

  v_evidence_id := private.rebuild_document_legal_evidence(
    v_runtime_document_id,
    null,
    'package_prepare'
  );

  if v_evidence_id is null then
    raise exception 'legal evidence not found for document %', p_document_id;
  end if;

  select evidence.signature_request_id
  into v_signature_request_id
  from docs.document_legal_evidence as evidence
  where evidence.id = v_evidence_id
    and evidence.evidence_status <> 'superseded'
  limit 1;

  if not found then
    raise exception 'active legal evidence not found for document %', p_document_id;
  end if;

  v_storage_object_path := format(
    'tenant/%s/patients/%s/documents/%s/evidence/legal-evidence-%s.json',
    v_runtime_tenant_id,
    v_runtime_patient_id,
    v_runtime_document_id,
    v_package_id
  );
  v_file_name := format('dossie-evidencia-%s.json', v_package_id);

  insert into docs.document_legal_evidence_packages (
    id,
    tenant_id,
    unit_id,
    patient_id,
    patient_document_id,
    document_legal_evidence_id,
    document_version_id,
    signature_request_id,
    package_kind,
    package_status,
    storage_bucket,
    storage_object_path,
    content_type,
    file_name,
    generated_by_profile_id,
    metadata
  )
  values (
    v_package_id,
    v_runtime_tenant_id,
    v_document_unit_id,
    v_runtime_patient_id,
    v_runtime_document_id,
    v_evidence_id,
    v_document_version_id,
    v_signature_request_id,
    'legal_evidence_json',
    'generating',
    'patient-documents',
    v_storage_object_path,
    'application/json',
    v_file_name,
    v_actor_profile_id,
    jsonb_strip_nulls(
      v_metadata
      || jsonb_build_object(
        'source', 'document_evidence_package_endpoint',
        'schemaVersion', 'document-legal-evidence-package.v1'
      )
    )
  );

  return jsonb_build_object(
    'id', v_package_id::text,
    'runtimeId', v_package_id::text,
    'documentId', p_document_id,
    'runtimeDocumentId', v_runtime_document_id::text,
    'evidenceId', v_evidence_id::text,
    'runtimeEvidenceId', v_evidence_id::text,
    'documentVersionId', v_document_version_id::text,
    'runtimeDocumentVersionId', v_document_version_id::text,
    'signatureRequestId', v_signature_request_id::text,
    'runtimeSignatureRequestId', v_signature_request_id::text,
    'packageKind', 'legal_evidence_json',
    'packageStatus', 'generating',
    'storageBucket', 'patient-documents',
    'storageObjectPath', v_storage_object_path,
    'contentType', 'application/json',
    'fileName', v_file_name
  );
end;
$$;

create or replace function api.complete_document_legal_evidence_package(
  p_legacy_tenant_id text,
  p_document_id text,
  p_package_id text,
  p_package_status text,
  p_checksum text default null,
  p_byte_size integer default null,
  p_failure_reason text default null,
  p_legacy_unit_id text default null,
  p_legacy_actor_user_id text default null,
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
  v_runtime_unit_id uuid;
  v_runtime_document_id uuid;
  v_package_id uuid := private.try_uuid(p_package_id);
  v_actor_profile_id uuid := private.runtime_profile_id_by_legacy_user_id(p_legacy_actor_user_id);
  v_actor_type text := case when v_actor_profile_id is null then 'system' else 'profile' end;
  v_package docs.document_legal_evidence_packages%rowtype;
  v_status text := lower(nullif(trim(coalesce(p_package_status, '')), ''));
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if nullif(trim(coalesce(p_legacy_tenant_id, '')), '') is null then
    raise exception 'p_legacy_tenant_id is required';
  end if;

  if nullif(trim(coalesce(p_document_id, '')), '') is null then
    raise exception 'p_document_id is required';
  end if;

  if v_package_id is null then
    raise exception 'p_package_id must be a uuid';
  end if;

  if v_status not in ('generated', 'failed') then
    raise exception 'invalid package status %', p_package_status;
  end if;

  if jsonb_typeof(v_metadata) <> 'object' then
    raise exception 'p_metadata must be a json object';
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

  select *
  into v_package
  from docs.document_legal_evidence_packages as packages
  where packages.id = v_package_id
    and packages.tenant_id = v_runtime_tenant_id
    and packages.patient_document_id = v_runtime_document_id
  limit 1;

  if v_package.id is null then
    raise exception 'legal evidence package % not found for document %', p_package_id, p_document_id;
  end if;

  if v_runtime_unit_id is not null
    and v_package.unit_id is not null
    and v_package.unit_id <> v_runtime_unit_id then
    raise exception 'document % is outside the current unit scope', p_document_id;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not (
      private.can_read_clinical_domain(
        v_runtime_tenant_id,
        coalesce(v_package.unit_id, v_runtime_unit_id)
      )
      and private.can_access_patient(v_package.patient_id)
    ) then
    raise exception 'complete document legal evidence package denied';
  end if;

  if v_status = 'generated' then
    update docs.document_legal_evidence_packages
    set
      package_status = 'superseded',
      updated_at = now()
    where patient_document_id = v_package.patient_document_id
      and document_legal_evidence_id = v_package.document_legal_evidence_id
      and id <> v_package.id
      and package_status = 'generated';

    update docs.document_legal_evidence_packages
    set
      package_status = 'generated',
      checksum = nullif(trim(coalesce(p_checksum, '')), ''),
      byte_size = p_byte_size,
      generated_at = now(),
      failed_at = null,
      failure_reason = null,
      metadata = jsonb_strip_nulls(metadata || v_metadata),
      updated_at = now()
    where id = v_package.id;
  else
    update docs.document_legal_evidence_packages
    set
      package_status = 'failed',
      failed_at = now(),
      failure_reason = nullif(trim(coalesce(p_failure_reason, '')), ''),
      metadata = jsonb_strip_nulls(metadata || v_metadata),
      updated_at = now()
    where id = v_package.id;
  end if;

  insert into docs.document_legal_evidence_package_events (
    tenant_id,
    unit_id,
    patient_id,
    patient_document_id,
    document_legal_evidence_id,
    document_legal_evidence_package_id,
    actor_profile_id,
    event_action,
    event_status,
    storage_bucket,
    storage_object_path,
    metadata
  )
  values (
    v_package.tenant_id,
    v_package.unit_id,
    v_package.patient_id,
    v_package.patient_document_id,
    v_package.document_legal_evidence_id,
    v_package.id,
    v_actor_profile_id,
    'generate',
    case when v_status = 'generated' then 'completed' else 'failed' end,
    v_package.storage_bucket,
    v_package.storage_object_path,
    jsonb_strip_nulls(
      v_metadata
      || jsonb_build_object(
        'checksum', p_checksum,
        'byteSize', p_byte_size,
        'failureReason', p_failure_reason
      )
    )
  );

  perform private.record_audit_event(
    p_tenant_id => v_package.tenant_id,
    p_unit_id => v_package.unit_id,
    p_patient_id => v_package.patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => v_actor_profile_id,
    p_event_type => case
      when v_status = 'generated' then 'docs.document_legal_evidence_package_generated'
      else 'docs.document_legal_evidence_package_generation_failed'
    end,
    p_action => 'generate',
    p_resource_schema => 'docs',
    p_resource_table => 'document_legal_evidence_packages',
    p_resource_id => v_package.id,
    p_payload => jsonb_strip_nulls(
      v_metadata
      || jsonb_build_object(
        'patientDocumentId', v_package.patient_document_id,
        'documentLegalEvidenceId', v_package.document_legal_evidence_id,
        'checksum', p_checksum,
        'byteSize', p_byte_size,
        'packageStatus', v_status,
        'source', 'document_evidence_package_endpoint'
      )
    )
  );

  return private.document_legal_evidence_package_safe_json(v_package.id, 10);
end;
$$;

create or replace function api.record_document_legal_evidence_package_access_event(
  p_legacy_tenant_id text,
  p_document_id text,
  p_package_id text,
  p_access_status text default 'granted',
  p_legacy_unit_id text default null,
  p_signed_url_expires_at timestamptz default null,
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
  v_package_id uuid := private.try_uuid(p_package_id);
  v_actor_profile_id uuid := private.runtime_profile_id_by_legacy_user_id(p_legacy_actor_user_id);
  v_actor_type text := case when v_actor_profile_id is null then 'system' else 'profile' end;
  v_package docs.document_legal_evidence_packages%rowtype;
  v_status text := lower(nullif(trim(coalesce(p_access_status, '')), ''));
  v_metadata jsonb := coalesce(p_request_metadata, '{}'::jsonb);
  v_event_id uuid;
begin
  if nullif(trim(coalesce(p_legacy_tenant_id, '')), '') is null then
    raise exception 'p_legacy_tenant_id is required';
  end if;

  if nullif(trim(coalesce(p_document_id, '')), '') is null then
    raise exception 'p_document_id is required';
  end if;

  if v_package_id is null then
    raise exception 'p_package_id must be a uuid';
  end if;

  if v_status not in ('granted', 'storage_error', 'denied') then
    raise exception 'invalid package access status %', p_access_status;
  end if;

  if jsonb_typeof(v_metadata) <> 'object' then
    raise exception 'p_request_metadata must be a json object';
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

  select *
  into v_package
  from docs.document_legal_evidence_packages as packages
  where packages.id = v_package_id
    and packages.tenant_id = v_runtime_tenant_id
    and packages.patient_document_id = v_runtime_document_id
  limit 1;

  if v_package.id is null then
    raise exception 'legal evidence package % not found for document %', p_package_id, p_document_id;
  end if;

  if v_runtime_unit_id is not null
    and v_package.unit_id is not null
    and v_package.unit_id <> v_runtime_unit_id then
    raise exception 'document % is outside the current unit scope', p_document_id;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not (
      private.can_read_clinical_domain(
        v_runtime_tenant_id,
        coalesce(v_package.unit_id, v_runtime_unit_id)
      )
      and private.can_access_patient(v_package.patient_id)
    ) then
    raise exception 'record document legal evidence package access denied';
  end if;

  insert into docs.document_legal_evidence_package_events (
    tenant_id,
    unit_id,
    patient_id,
    patient_document_id,
    document_legal_evidence_id,
    document_legal_evidence_package_id,
    actor_profile_id,
    event_action,
    event_status,
    storage_bucket,
    storage_object_path,
    signed_url_expires_at,
    metadata
  )
  values (
    v_package.tenant_id,
    v_package.unit_id,
    v_package.patient_id,
    v_package.patient_document_id,
    v_package.document_legal_evidence_id,
    v_package.id,
    v_actor_profile_id,
    'download',
    v_status,
    v_package.storage_bucket,
    v_package.storage_object_path,
    p_signed_url_expires_at,
    jsonb_strip_nulls(
      v_metadata
      || jsonb_build_object(
        'source', 'document_evidence_package_endpoint',
        'packageKind', v_package.package_kind,
        'checksum', v_package.checksum
      )
    )
  )
  returning id
  into v_event_id;

  perform private.record_audit_event(
    p_tenant_id => v_package.tenant_id,
    p_unit_id => v_package.unit_id,
    p_patient_id => v_package.patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => v_actor_profile_id,
    p_event_type => 'docs.document_legal_evidence_package_download_' || v_status,
    p_action => 'download',
    p_resource_schema => 'docs',
    p_resource_table => 'document_legal_evidence_packages',
    p_resource_id => v_package.id,
    p_payload => jsonb_strip_nulls(
      v_metadata
      || jsonb_build_object(
        'packageEventId', v_event_id,
        'patientDocumentId', v_package.patient_document_id,
        'documentLegalEvidenceId', v_package.document_legal_evidence_id,
        'packageStatus', v_package.package_status,
        'signedUrlExpiresAt', p_signed_url_expires_at,
        'source', 'document_evidence_package_endpoint'
      )
    )
  );

  return jsonb_build_object(
    'id', v_event_id::text,
    'documentId', v_package.patient_document_id::text,
    'packageId', v_package.id::text,
    'accessAction', 'download',
    'accessStatus', v_status,
    'createdAt', now()
  );
end;
$$;

create or replace function public.get_document_legal_evidence_package_summary(
  p_legacy_tenant_id text,
  p_document_id text,
  p_legacy_unit_id text default null,
  p_event_limit integer default 10
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select api.get_document_legal_evidence_package_summary(
    p_legacy_tenant_id,
    p_document_id,
    p_legacy_unit_id,
    p_event_limit
  )
$$;

create or replace function public.prepare_document_legal_evidence_package(
  p_legacy_tenant_id text,
  p_document_id text,
  p_legacy_unit_id text default null,
  p_legacy_actor_user_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select api.prepare_document_legal_evidence_package(
    p_legacy_tenant_id,
    p_document_id,
    p_legacy_unit_id,
    p_legacy_actor_user_id,
    p_metadata
  )
$$;

create or replace function public.complete_document_legal_evidence_package(
  p_legacy_tenant_id text,
  p_document_id text,
  p_package_id text,
  p_package_status text,
  p_checksum text default null,
  p_byte_size integer default null,
  p_failure_reason text default null,
  p_legacy_unit_id text default null,
  p_legacy_actor_user_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select api.complete_document_legal_evidence_package(
    p_legacy_tenant_id,
    p_document_id,
    p_package_id,
    p_package_status,
    p_checksum,
    p_byte_size,
    p_failure_reason,
    p_legacy_unit_id,
    p_legacy_actor_user_id,
    p_metadata
  )
$$;

create or replace function public.record_document_legal_evidence_package_access_event(
  p_legacy_tenant_id text,
  p_document_id text,
  p_package_id text,
  p_access_status text default 'granted',
  p_legacy_unit_id text default null,
  p_signed_url_expires_at timestamptz default null,
  p_legacy_actor_user_id text default null,
  p_request_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select api.record_document_legal_evidence_package_access_event(
    p_legacy_tenant_id,
    p_document_id,
    p_package_id,
    p_access_status,
    p_legacy_unit_id,
    p_signed_url_expires_at,
    p_legacy_actor_user_id,
    p_request_metadata
  )
$$;

revoke all on function private.document_legal_evidence_package_safe_json(uuid, integer)
  from public, anon, authenticated;
revoke all on function api.get_document_legal_evidence_package_summary(text, text, text, integer)
  from public, anon, authenticated;
revoke all on function api.prepare_document_legal_evidence_package(text, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function api.complete_document_legal_evidence_package(text, text, text, text, text, integer, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function api.record_document_legal_evidence_package_access_event(text, text, text, text, text, timestamptz, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.get_document_legal_evidence_package_summary(text, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.prepare_document_legal_evidence_package(text, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.complete_document_legal_evidence_package(text, text, text, text, text, integer, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.record_document_legal_evidence_package_access_event(text, text, text, text, text, timestamptz, text, jsonb)
  from public, anon, authenticated;

grant execute on function private.document_legal_evidence_package_safe_json(uuid, integer)
  to service_role;
grant execute on function api.get_document_legal_evidence_package_summary(text, text, text, integer)
  to service_role;
grant execute on function api.prepare_document_legal_evidence_package(text, text, text, text, jsonb)
  to service_role;
grant execute on function api.complete_document_legal_evidence_package(text, text, text, text, text, integer, text, text, text, jsonb)
  to service_role;
grant execute on function api.record_document_legal_evidence_package_access_event(text, text, text, text, text, timestamptz, text, jsonb)
  to service_role;
grant execute on function public.get_document_legal_evidence_package_summary(text, text, text, integer)
  to service_role;
grant execute on function public.prepare_document_legal_evidence_package(text, text, text, text, jsonb)
  to service_role;
grant execute on function public.complete_document_legal_evidence_package(text, text, text, text, text, integer, text, text, text, jsonb)
  to service_role;
grant execute on function public.record_document_legal_evidence_package_access_event(text, text, text, text, text, timestamptz, text, jsonb)
  to service_role;
