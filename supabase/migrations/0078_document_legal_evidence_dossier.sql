create table if not exists docs.document_legal_evidence (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  unit_id uuid references platform.units (id) on delete set null,
  patient_id uuid not null references patients.patients (id) on delete cascade,
  patient_document_id uuid not null references docs.patient_documents (id) on delete cascade,
  document_version_id uuid references docs.document_versions (id) on delete set null,
  printable_artifact_id uuid references docs.printable_artifacts (id) on delete set null,
  signature_request_id uuid references docs.signature_requests (id) on delete set null,
  provider_code text,
  external_request_id text,
  external_envelope_id text,
  evidence_status text not null default 'partial' check (
    evidence_status in ('partial', 'complete', 'failed', 'superseded')
  ),
  verification_status text not null default 'not_required' check (
    verification_status in ('not_required', 'pending', 'verified', 'failed')
  ),
  document_hash text,
  printable_artifact_hash text,
  signed_artifact_hash text,
  manifest_hash text,
  evidence_payload jsonb not null default '{}'::jsonb,
  provider_payload jsonb not null default '{}'::jsonb,
  verification_payload jsonb not null default '{}'::jsonb,
  consolidated_at timestamptz not null default now(),
  verified_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_docs_document_legal_evidence_document_updated
  on docs.document_legal_evidence (patient_document_id, updated_at desc);

create index if not exists idx_docs_document_legal_evidence_tenant_status
  on docs.document_legal_evidence (tenant_id, evidence_status, updated_at desc);

create unique index if not exists idx_docs_document_legal_evidence_signature_active
  on docs.document_legal_evidence (patient_document_id, document_version_id, signature_request_id)
  where signature_request_id is not null
    and evidence_status <> 'superseded';

create unique index if not exists idx_docs_document_legal_evidence_unsigned_active
  on docs.document_legal_evidence (patient_document_id, document_version_id)
  where signature_request_id is null
    and evidence_status <> 'superseded';

drop trigger if exists set_docs_document_legal_evidence_updated_at on docs.document_legal_evidence;
create trigger set_docs_document_legal_evidence_updated_at
before update on docs.document_legal_evidence
for each row execute function private.set_current_timestamp_updated_at();

alter table docs.document_legal_evidence enable row level security;

drop policy if exists document_legal_evidence_select_current_scope on docs.document_legal_evidence;
create policy document_legal_evidence_select_current_scope
on docs.document_legal_evidence
for select
to authenticated
using (
  private.can_read_clinical_domain(tenant_id, unit_id)
  and private.can_access_patient(patient_id)
);

drop policy if exists document_legal_evidence_manage_current_scope on docs.document_legal_evidence;
create policy document_legal_evidence_manage_current_scope
on docs.document_legal_evidence
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

revoke all on table docs.document_legal_evidence from public, anon, authenticated;
grant select, insert, update, delete on table docs.document_legal_evidence to service_role;

create or replace function private.rebuild_document_legal_evidence(
  p_patient_document_id uuid,
  p_signature_request_id uuid default null,
  p_reason text default 'manual'
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_evidence_id uuid;
  v_existing_evidence_id uuid;
  v_now timestamptz := now();

  v_tenant_id uuid;
  v_unit_id uuid;
  v_patient_id uuid;
  v_document_version_id uuid;
  v_document_public_id text;
  v_document_type text;
  v_document_status text;
  v_document_title text;
  v_document_summary text;
  v_document_number text;
  v_document_issued_at timestamptz;
  v_document_expires_at timestamptz;
  v_document_signed_at timestamptz;
  v_patient_public_id text;
  v_patient_name text;
  v_encounter_public_id text;
  v_encounter_id uuid;
  v_encounter_status text;
  v_template_id uuid;
  v_template_title text;
  v_template_kind text;
  v_template_status text;
  v_author_profile_id uuid;
  v_author_name text;
  v_author_email text;
  v_professional_public_id text;
  v_professional_id uuid;
  v_professional_name text;
  v_professional_type text;
  v_professional_license text;

  v_version_public_id text;
  v_version_number integer;
  v_version_status text;
  v_version_title text;
  v_version_summary text;
  v_version_checksum text;
  v_version_issued_at timestamptz;
  v_version_signed_at timestamptz;
  v_version_has_storage boolean := false;
  v_version_has_signed_storage boolean := false;

  v_artifact_id uuid;
  v_artifact_public_id text;
  v_artifact_kind text;
  v_artifact_status text;
  v_artifact_checksum text;
  v_artifact_rendered_at timestamptz;
  v_artifact_failure_reason text;
  v_artifact_content_type text;
  v_artifact_has_storage boolean := false;

  v_signature_id uuid;
  v_signature_public_id text;
  v_signer_type text;
  v_signer_name text;
  v_signer_email text;
  v_provider_code text;
  v_signature_status text;
  v_signature_external_request_id text;
  v_signature_requested_at timestamptz;
  v_signature_expires_at timestamptz;
  v_signature_completed_at timestamptz;

  v_dispatch_id uuid;
  v_dispatch_provider_code text;
  v_dispatch_status text;
  v_dispatch_external_request_id text;
  v_dispatch_idempotency_key text;
  v_dispatch_response_payload jsonb := '{}'::jsonb;
  v_dispatch_request_payload jsonb := '{}'::jsonb;
  v_dispatch_error_message text;
  v_dispatch_attempted_at timestamptz;
  v_dispatch_completed_at timestamptz;

  v_document_hash text;
  v_printable_artifact_hash text;
  v_signed_artifact_hash text;
  v_manifest_hash text;
  v_external_request_id text;
  v_external_envelope_id text;
  v_evidence_status text := 'partial';
  v_verification_status text := 'not_required';
  v_failure_reason text;
  v_verified_at timestamptz;
  v_failed_at timestamptz;
  v_signed_event_exists boolean := false;
  v_is_signed boolean := false;
  v_is_local_provider boolean := false;
  v_has_artifact_hash boolean := false;
  v_status_reasons jsonb := '[]'::jsonb;
  v_signature_events jsonb := '[]'::jsonb;
  v_dispatch_events jsonb := '[]'::jsonb;
  v_provider_signature_events jsonb := '[]'::jsonb;
  v_access_event_count integer := 0;
  v_evidence_payload jsonb;
  v_provider_payload jsonb;
  v_verification_payload jsonb;
begin
  select
    patient_documents.tenant_id,
    patient_documents.unit_id,
    patient_documents.patient_id,
    patient_documents.current_version_id,
    coalesce(patient_documents.legacy_patient_document_id, patient_documents.id::text),
    patient_documents.document_type,
    patient_documents.status,
    patient_documents.title,
    patient_documents.summary,
    patient_documents.document_number,
    patient_documents.issued_at,
    patient_documents.expires_at,
    patient_documents.signed_at,
    coalesce(patients.legacy_patient_id, patients.id::text),
    patients.full_name,
    clinical_encounters.id,
    coalesce(clinical_encounters.legacy_encounter_id, clinical_encounters.id::text),
    clinical_encounters.status,
    document_templates.id,
    document_templates.title,
    document_templates.template_kind,
    document_templates.status,
    author_profiles.id,
    coalesce(author_profiles.full_name, author_profiles.display_name, author_profiles.email::text),
    author_profiles.email::text,
    professionals.id,
    coalesce(professionals.legacy_professional_id, professionals.id::text),
    professionals.display_name,
    professionals.professional_type,
    professionals.license_number,
    coalesce(document_versions.legacy_document_version_id, document_versions.id::text),
    document_versions.version_number,
    document_versions.status,
    document_versions.title,
    document_versions.summary,
    document_versions.checksum,
    document_versions.issued_at,
    document_versions.signed_at,
    nullif(coalesce(document_versions.storage_object_path, ''), '') is not null,
    nullif(coalesce(document_versions.signed_storage_object_path, ''), '') is not null
  into
    v_tenant_id,
    v_unit_id,
    v_patient_id,
    v_document_version_id,
    v_document_public_id,
    v_document_type,
    v_document_status,
    v_document_title,
    v_document_summary,
    v_document_number,
    v_document_issued_at,
    v_document_expires_at,
    v_document_signed_at,
    v_patient_public_id,
    v_patient_name,
    v_encounter_id,
    v_encounter_public_id,
    v_encounter_status,
    v_template_id,
    v_template_title,
    v_template_kind,
    v_template_status,
    v_author_profile_id,
    v_author_name,
    v_author_email,
    v_professional_id,
    v_professional_public_id,
    v_professional_name,
    v_professional_type,
    v_professional_license,
    v_version_public_id,
    v_version_number,
    v_version_status,
    v_version_title,
    v_version_summary,
    v_version_checksum,
    v_version_issued_at,
    v_version_signed_at,
    v_version_has_storage,
    v_version_has_signed_storage
  from docs.patient_documents as patient_documents
  inner join patients.patients as patients
    on patients.id = patient_documents.patient_id
  left join clinical.encounters as clinical_encounters
    on clinical_encounters.id = patient_documents.encounter_id
  left join scheduling.professionals as professionals
    on professionals.id = clinical_encounters.professional_id
  left join docs.document_templates as document_templates
    on document_templates.id = patient_documents.document_template_id
  left join docs.document_versions as document_versions
    on document_versions.id = patient_documents.current_version_id
  left join identity.profiles as author_profiles
    on author_profiles.id = patient_documents.created_by_profile_id
  where patient_documents.id = p_patient_document_id
    and patient_documents.deleted_at is null
  limit 1;

  if v_tenant_id is null then
    return null;
  end if;

  select
    signature_requests.id,
    coalesce(signature_requests.legacy_signature_request_id, signature_requests.id::text),
    signature_requests.signer_type,
    signature_requests.signer_name,
    signature_requests.signer_email,
    signature_requests.provider_code,
    signature_requests.request_status,
    signature_requests.external_request_id,
    signature_requests.requested_at,
    signature_requests.expires_at,
    signature_requests.completed_at
  into
    v_signature_id,
    v_signature_public_id,
    v_signer_type,
    v_signer_name,
    v_signer_email,
    v_provider_code,
    v_signature_status,
    v_signature_external_request_id,
    v_signature_requested_at,
    v_signature_expires_at,
    v_signature_completed_at
  from docs.signature_requests as signature_requests
  where signature_requests.patient_document_id = p_patient_document_id
    and (p_signature_request_id is null or signature_requests.id = p_signature_request_id)
  order by signature_requests.requested_at desc nulls last, signature_requests.created_at desc
  limit 1;

  select
    printable_artifacts.id,
    coalesce(printable_artifacts.legacy_printable_artifact_id, printable_artifacts.id::text),
    printable_artifacts.artifact_kind,
    printable_artifacts.render_status,
    printable_artifacts.checksum,
    printable_artifacts.rendered_at,
    printable_artifacts.failure_reason,
    printable_artifacts.metadata ->> 'contentType',
    nullif(coalesce(printable_artifacts.storage_object_path, ''), '') is not null
  into
    v_artifact_id,
    v_artifact_public_id,
    v_artifact_kind,
    v_artifact_status,
    v_artifact_checksum,
    v_artifact_rendered_at,
    v_artifact_failure_reason,
    v_artifact_content_type,
    v_artifact_has_storage
  from docs.printable_artifacts as printable_artifacts
  where printable_artifacts.patient_document_id = p_patient_document_id
  order by
    case printable_artifacts.artifact_kind
      when 'print_package' then 1
      when 'pdf' then 2
      when 'html' then 3
      else 4
    end,
    case printable_artifacts.render_status when 'rendered' then 0 else 1 end,
    printable_artifacts.rendered_at desc nulls last,
    printable_artifacts.created_at desc
  limit 1;

  select printable_artifacts.checksum
  into v_manifest_hash
  from docs.printable_artifacts as printable_artifacts
  where printable_artifacts.patient_document_id = p_patient_document_id
    and printable_artifacts.artifact_kind = 'print_package'
    and printable_artifacts.render_status = 'rendered'
    and nullif(trim(coalesce(printable_artifacts.checksum, '')), '') is not null
  order by printable_artifacts.rendered_at desc nulls last, printable_artifacts.created_at desc
  limit 1;

  if v_signature_id is not null then
    select
      signature_dispatch_attempts.id,
      signature_dispatch_attempts.provider_code,
      signature_dispatch_attempts.dispatch_status,
      signature_dispatch_attempts.external_request_id,
      signature_dispatch_attempts.idempotency_key,
      signature_dispatch_attempts.request_payload,
      signature_dispatch_attempts.response_payload,
      signature_dispatch_attempts.error_message,
      signature_dispatch_attempts.attempted_at,
      signature_dispatch_attempts.completed_at
    into
      v_dispatch_id,
      v_dispatch_provider_code,
      v_dispatch_status,
      v_dispatch_external_request_id,
      v_dispatch_idempotency_key,
      v_dispatch_request_payload,
      v_dispatch_response_payload,
      v_dispatch_error_message,
      v_dispatch_attempted_at,
      v_dispatch_completed_at
    from docs.signature_dispatch_attempts as signature_dispatch_attempts
    where signature_dispatch_attempts.signature_request_id = v_signature_id
    order by signature_dispatch_attempts.attempted_at desc, signature_dispatch_attempts.created_at desc
    limit 1;

    select exists (
      select 1
      from docs.signature_events as signature_events
      where signature_events.signature_request_id = v_signature_id
        and signature_events.event_type = 'signed'
    )
    into v_signed_event_exists;

    select coalesce(
      jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'id', limited_signature_events.id::text,
            'signatureRequestId', v_signature_public_id,
            'eventType', limited_signature_events.event_type,
            'source', limited_signature_events.source,
            'externalEventId', limited_signature_events.external_event_id,
            'eventAt', limited_signature_events.event_at,
            'createdAt', limited_signature_events.created_at
          )
        )
        order by limited_signature_events.event_at desc, limited_signature_events.created_at desc
      ),
      '[]'::jsonb
    )
    into v_signature_events
    from (
      select
        signature_events.id,
        signature_events.event_type,
        signature_events.source,
        signature_events.external_event_id,
        signature_events.event_at,
        signature_events.created_at
      from docs.signature_events as signature_events
      where signature_events.signature_request_id = v_signature_id
      order by signature_events.event_at desc, signature_events.created_at desc
      limit 20
    ) as limited_signature_events;

    select coalesce(
      jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'id', limited_signature_events.id::text,
            'eventType', limited_signature_events.event_type,
            'source', limited_signature_events.source,
            'externalEventId', limited_signature_events.external_event_id,
            'eventAt', limited_signature_events.event_at,
            'payload', limited_signature_events.payload,
            'metadata', limited_signature_events.metadata,
            'createdAt', limited_signature_events.created_at
          )
        )
        order by limited_signature_events.event_at desc, limited_signature_events.created_at desc
      ),
      '[]'::jsonb
    )
    into v_provider_signature_events
    from (
      select
        signature_events.id,
        signature_events.event_type,
        signature_events.source,
        signature_events.external_event_id,
        signature_events.event_at,
        signature_events.payload,
        signature_events.metadata,
        signature_events.created_at
      from docs.signature_events as signature_events
      where signature_events.signature_request_id = v_signature_id
      order by signature_events.event_at desc, signature_events.created_at desc
      limit 20
    ) as limited_signature_events;

    select coalesce(
      jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'id', limited_dispatch_events.id::text,
            'signatureRequestId', v_signature_public_id,
            'providerCode', limited_dispatch_events.provider_code,
            'dispatchStatus', limited_dispatch_events.dispatch_status,
            'externalRequestId', limited_dispatch_events.external_request_id,
            'idempotencyKey', limited_dispatch_events.idempotency_key,
            'attemptedAt', limited_dispatch_events.attempted_at,
            'completedAt', limited_dispatch_events.completed_at,
            'errorMessage', limited_dispatch_events.error_message
          )
        )
        order by limited_dispatch_events.attempted_at desc, limited_dispatch_events.created_at desc
      ),
      '[]'::jsonb
    )
    into v_dispatch_events
    from (
      select
        signature_dispatch_attempts.id,
        signature_dispatch_attempts.provider_code,
        signature_dispatch_attempts.dispatch_status,
        signature_dispatch_attempts.external_request_id,
        signature_dispatch_attempts.idempotency_key,
        signature_dispatch_attempts.attempted_at,
        signature_dispatch_attempts.completed_at,
        signature_dispatch_attempts.error_message,
        signature_dispatch_attempts.created_at
      from docs.signature_dispatch_attempts as signature_dispatch_attempts
      where signature_dispatch_attempts.signature_request_id = v_signature_id
      order by signature_dispatch_attempts.attempted_at desc, signature_dispatch_attempts.created_at desc
      limit 20
    ) as limited_dispatch_events;
  end if;

  select count(*)
  into v_access_event_count
  from docs.document_access_events as document_access_events
  where document_access_events.patient_document_id = p_patient_document_id;

  v_provider_code := lower(coalesce(v_provider_code, v_dispatch_provider_code, 'none'));
  v_is_local_provider := v_provider_code in ('internal', 'manual', 'mock', 'mock_internal');
  v_document_hash := nullif(trim(coalesce(v_version_checksum, '')), '');
  v_printable_artifact_hash := nullif(trim(coalesce(v_artifact_checksum, '')), '');
  v_signed_artifact_hash := case
    when v_version_has_signed_storage then coalesce(v_document_hash, v_printable_artifact_hash)
    else null
  end;
  v_has_artifact_hash := coalesce(v_printable_artifact_hash, v_document_hash) is not null;
  v_external_request_id := coalesce(v_signature_external_request_id, v_dispatch_external_request_id);
  v_external_envelope_id := coalesce(
    v_dispatch_response_payload ->> 'externalEnvelopeId',
    v_dispatch_response_payload ->> 'external_envelope_id',
    v_dispatch_response_payload ->> 'envelopeId',
    v_dispatch_response_payload ->> 'envelope_id',
    v_external_request_id
  );
  v_is_signed := coalesce(v_document_status, '') = 'signed'
    or coalesce(v_version_status, '') = 'signed'
    or coalesce(v_signature_status, '') = 'signed';

  if v_document_version_id is null then
    v_status_reasons := v_status_reasons || jsonb_build_array('missing_document_version');
  end if;

  if v_artifact_id is null then
    v_status_reasons := v_status_reasons || jsonb_build_array('missing_printable_artifact');
  elsif coalesce(v_artifact_status, '') <> 'rendered' then
    v_status_reasons := v_status_reasons || jsonb_build_array('printable_artifact_not_rendered');
  end if;

  if not v_has_artifact_hash then
    v_status_reasons := v_status_reasons || jsonb_build_array('missing_artifact_hash');
  end if;

  if v_signature_id is null then
    v_status_reasons := v_status_reasons || jsonb_build_array('missing_signature_request');
  elsif not v_is_signed then
    v_status_reasons := v_status_reasons || jsonb_build_array('signature_not_completed');
  end if;

  if v_signature_status in ('declined', 'expired', 'cancelled') then
    v_evidence_status := 'failed';
    v_verification_status := 'failed';
    v_failure_reason := 'signature_' || v_signature_status;
  elsif v_dispatch_status = 'failed' then
    v_evidence_status := 'failed';
    v_verification_status := 'failed';
    v_failure_reason := coalesce(v_dispatch_error_message, 'signature_dispatch_failed');
  elsif v_artifact_status = 'failed' then
    v_evidence_status := 'failed';
    v_verification_status := 'failed';
    v_failure_reason := coalesce(v_artifact_failure_reason, 'printable_artifact_failed');
  elsif v_is_signed and v_has_artifact_hash and v_signature_id is not null and (v_is_local_provider or v_signed_event_exists) then
    v_verification_status := case when v_is_local_provider then 'not_required' else 'pending' end;
    v_evidence_status := case when v_is_local_provider then 'complete' else 'partial' end;
  else
    v_evidence_status := 'partial';
    v_verification_status := case
      when v_is_signed and not v_is_local_provider then 'pending'
      else 'not_required'
    end;
  end if;

  if v_evidence_status = 'failed' then
    v_failed_at := coalesce(v_dispatch_completed_at, v_signature_completed_at, v_now);
  elsif v_verification_status = 'verified' then
    v_verified_at := v_now;
  end if;

  v_verification_payload := jsonb_strip_nulls(
    jsonb_build_object(
      'status', v_verification_status,
      'algorithm', 'sha256',
      'providerVerificationRequired', v_is_signed and not v_is_local_provider,
      'providerRealAdapterImplemented', false,
      'providerRealAdapterPending', v_is_signed and not v_is_local_provider,
      'verifiedAt', v_verified_at,
      'failedAt', v_failed_at,
      'failureReason', v_failure_reason
    )
  );

  v_provider_payload := jsonb_strip_nulls(
    jsonb_build_object(
      'latestDispatchRequest', v_dispatch_request_payload,
      'latestDispatchResponse', v_dispatch_response_payload,
      'signatureEvents', v_provider_signature_events
    )
  );

  v_evidence_payload := jsonb_strip_nulls(
    jsonb_build_object(
      'document', jsonb_strip_nulls(
        jsonb_build_object(
          'id', v_document_public_id,
          'runtimeId', p_patient_document_id::text,
          'documentType', v_document_type,
          'status', v_document_status,
          'title', v_document_title,
          'summary', v_document_summary,
          'documentNumber', v_document_number,
          'issuedAt', v_document_issued_at,
          'expiresAt', v_document_expires_at,
          'signedAt', v_document_signed_at
        )
      ),
      'patient', jsonb_strip_nulls(
        jsonb_build_object(
          'id', v_patient_public_id,
          'runtimeId', v_patient_id::text,
          'name', v_patient_name
        )
      ),
      'professional', case
        when v_professional_id is null then null
        else jsonb_strip_nulls(
          jsonb_build_object(
            'id', v_professional_public_id,
            'runtimeId', v_professional_id::text,
            'name', v_professional_name,
            'professionalType', v_professional_type,
            'licenseNumber', v_professional_license
          )
        )
      end,
      'author', case
        when v_author_profile_id is null then null
        else jsonb_strip_nulls(
          jsonb_build_object(
            'runtimeId', v_author_profile_id::text,
            'name', v_author_name,
            'email', v_author_email
          )
        )
      end,
      'encounter', case
        when v_encounter_id is null then null
        else jsonb_strip_nulls(
          jsonb_build_object(
            'id', v_encounter_public_id,
            'runtimeId', v_encounter_id::text,
            'status', v_encounter_status
          )
        )
      end,
      'template', case
        when v_template_id is null then null
        else jsonb_strip_nulls(
          jsonb_build_object(
            'id', v_template_id::text,
            'title', v_template_title,
            'templateKind', v_template_kind,
            'status', v_template_status
          )
        )
      end,
      'version', case
        when v_document_version_id is null then null
        else jsonb_strip_nulls(
          jsonb_build_object(
            'id', v_version_public_id,
            'runtimeId', v_document_version_id::text,
            'versionNumber', v_version_number,
            'status', v_version_status,
            'title', v_version_title,
            'summary', v_version_summary,
            'issuedAt', v_version_issued_at,
            'signedAt', v_version_signed_at,
            'checksum', v_document_hash,
            'hasStorageObject', v_version_has_storage,
            'hasSignedStorageObject', v_version_has_signed_storage
          )
        )
      end,
      'printableArtifact', case
        when v_artifact_id is null then null
        else jsonb_strip_nulls(
          jsonb_build_object(
            'id', v_artifact_public_id,
            'runtimeId', v_artifact_id::text,
            'artifactKind', v_artifact_kind,
            'renderStatus', v_artifact_status,
            'renderedAt', v_artifact_rendered_at,
            'checksum', v_printable_artifact_hash,
            'contentType', v_artifact_content_type,
            'hasStorageObject', v_artifact_has_storage,
            'failureReason', v_artifact_failure_reason
          )
        )
      end,
      'signature', case
        when v_signature_id is null then null
        else jsonb_strip_nulls(
          jsonb_build_object(
            'id', v_signature_public_id,
            'runtimeId', v_signature_id::text,
            'signerType', v_signer_type,
            'signerName', v_signer_name,
            'signerEmail', v_signer_email,
            'providerCode', v_provider_code,
            'externalRequestId', v_external_request_id,
            'externalEnvelopeId', v_external_envelope_id,
            'requestStatus', v_signature_status,
            'requestedAt', v_signature_requested_at,
            'expiresAt', v_signature_expires_at,
            'completedAt', v_signature_completed_at
          )
        )
      end,
      'signatories', case
        when v_signature_id is null then '[]'::jsonb
        else jsonb_build_array(
          jsonb_strip_nulls(
            jsonb_build_object(
              'signatureRequestId', v_signature_public_id,
              'signerType', v_signer_type,
              'name', v_signer_name,
              'email', v_signer_email,
              'providerCode', v_provider_code,
              'status', v_signature_status,
              'requestedAt', v_signature_requested_at,
              'completedAt', v_signature_completed_at
            )
          )
        )
      end,
      'provider', jsonb_strip_nulls(
        jsonb_build_object(
          'providerCode', v_provider_code,
          'externalRequestId', v_external_request_id,
          'externalEnvelopeId', v_external_envelope_id,
          'latestDispatchStatus', v_dispatch_status,
          'latestDispatchAt', v_dispatch_attempted_at,
          'latestDispatchCompletedAt', v_dispatch_completed_at,
          'idempotencyKey', v_dispatch_idempotency_key
        )
      ),
      'hashes', jsonb_strip_nulls(
        jsonb_build_object(
          'algorithm', 'sha256',
          'documentHash', v_document_hash,
          'printableArtifactHash', v_printable_artifact_hash,
          'signedArtifactHash', v_signed_artifact_hash,
          'manifestHash', v_manifest_hash
        )
      ),
      'events', jsonb_build_object(
        'signature', v_signature_events,
        'dispatch', v_dispatch_events
      ),
      'timestamps', jsonb_strip_nulls(
        jsonb_build_object(
          'documentIssuedAt', v_document_issued_at,
          'artifactRenderedAt', v_artifact_rendered_at,
          'signatureRequestedAt', v_signature_requested_at,
          'signatureCompletedAt', v_signature_completed_at,
          'latestDispatchAt', v_dispatch_attempted_at,
          'latestDispatchCompletedAt', v_dispatch_completed_at,
          'documentSignedAt', coalesce(v_document_signed_at, v_version_signed_at),
          'consolidatedAt', v_now
        )
      ),
      'statusReasons', v_status_reasons,
      'accessAuditSummary', jsonb_build_object(
        'eventCount', v_access_event_count,
        'capturedAt', v_now
      ),
      'providerContract', jsonb_build_object(
        'realProviderImplemented', false,
        'expectedVerificationFields', jsonb_build_array(
          'providerCode',
          'externalRequestId',
          'externalEnvelopeId',
          'webhookSignature',
          'artifactHash',
          'verificationPayload'
        )
      )
    )
  );

  select document_legal_evidence.id
  into v_existing_evidence_id
  from docs.document_legal_evidence as document_legal_evidence
  where document_legal_evidence.patient_document_id = p_patient_document_id
    and document_legal_evidence.document_version_id is not distinct from v_document_version_id
    and document_legal_evidence.signature_request_id is not distinct from v_signature_id
    and document_legal_evidence.evidence_status <> 'superseded'
  order by document_legal_evidence.updated_at desc
  limit 1;

  if v_existing_evidence_id is null then
    insert into docs.document_legal_evidence (
      tenant_id,
      unit_id,
      patient_id,
      patient_document_id,
      document_version_id,
      printable_artifact_id,
      signature_request_id,
      provider_code,
      external_request_id,
      external_envelope_id,
      evidence_status,
      verification_status,
      document_hash,
      printable_artifact_hash,
      signed_artifact_hash,
      manifest_hash,
      evidence_payload,
      provider_payload,
      verification_payload,
      consolidated_at,
      verified_at,
      failed_at,
      failure_reason
    )
    values (
      v_tenant_id,
      v_unit_id,
      v_patient_id,
      p_patient_document_id,
      v_document_version_id,
      v_artifact_id,
      v_signature_id,
      nullif(v_provider_code, 'none'),
      v_external_request_id,
      v_external_envelope_id,
      v_evidence_status,
      v_verification_status,
      v_document_hash,
      v_printable_artifact_hash,
      v_signed_artifact_hash,
      v_manifest_hash,
      v_evidence_payload,
      v_provider_payload,
      v_verification_payload,
      v_now,
      v_verified_at,
      v_failed_at,
      v_failure_reason
    )
    returning id
    into v_evidence_id;
  else
    update docs.document_legal_evidence
    set
      unit_id = v_unit_id,
      patient_id = v_patient_id,
      document_version_id = v_document_version_id,
      printable_artifact_id = v_artifact_id,
      signature_request_id = v_signature_id,
      provider_code = nullif(v_provider_code, 'none'),
      external_request_id = v_external_request_id,
      external_envelope_id = v_external_envelope_id,
      evidence_status = v_evidence_status,
      verification_status = v_verification_status,
      document_hash = v_document_hash,
      printable_artifact_hash = v_printable_artifact_hash,
      signed_artifact_hash = v_signed_artifact_hash,
      manifest_hash = v_manifest_hash,
      evidence_payload = v_evidence_payload,
      provider_payload = v_provider_payload,
      verification_payload = v_verification_payload,
      consolidated_at = v_now,
      verified_at = v_verified_at,
      failed_at = v_failed_at,
      failure_reason = v_failure_reason,
      updated_at = v_now
    where id = v_existing_evidence_id
    returning id
    into v_evidence_id;
  end if;

  update docs.document_legal_evidence
  set
    evidence_status = 'superseded',
    updated_at = v_now
  where patient_document_id = p_patient_document_id
    and id <> v_evidence_id
    and evidence_status <> 'superseded';

  return v_evidence_id;
end;
$$;

create or replace function private.document_legal_evidence_safe_json(
  p_evidence_id uuid,
  p_access_event_limit integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_access_event_limit, 10), 1), 50);
  v_result jsonb;
begin
  select jsonb_strip_nulls(
    document_legal_evidence.evidence_payload
    || jsonb_build_object(
      'id', document_legal_evidence.id::text,
      'runtimeId', document_legal_evidence.id::text,
      'documentId', coalesce(patient_documents.legacy_patient_document_id, patient_documents.id::text),
      'runtimeDocumentId', document_legal_evidence.patient_document_id::text,
      'documentVersionId', coalesce(document_versions.legacy_document_version_id, document_versions.id::text),
      'runtimeDocumentVersionId', document_legal_evidence.document_version_id::text,
      'printableArtifactId', coalesce(printable_artifacts.legacy_printable_artifact_id, printable_artifacts.id::text),
      'runtimePrintableArtifactId', document_legal_evidence.printable_artifact_id::text,
      'signatureRequestId', coalesce(signature_requests.legacy_signature_request_id, signature_requests.id::text),
      'runtimeSignatureRequestId', document_legal_evidence.signature_request_id::text,
      'evidenceStatus', document_legal_evidence.evidence_status,
      'verificationStatus', document_legal_evidence.verification_status,
      'providerCode', document_legal_evidence.provider_code,
      'externalRequestId', document_legal_evidence.external_request_id,
      'externalEnvelopeId', document_legal_evidence.external_envelope_id,
      'hashAlgorithm', 'sha256',
      'documentHash', document_legal_evidence.document_hash,
      'printableArtifactHash', document_legal_evidence.printable_artifact_hash,
      'signedArtifactHash', document_legal_evidence.signed_artifact_hash,
      'manifestHash', document_legal_evidence.manifest_hash,
      'verifiedAt', document_legal_evidence.verified_at,
      'failedAt', document_legal_evidence.failed_at,
      'failureReason', document_legal_evidence.failure_reason,
      'consolidatedAt', document_legal_evidence.consolidated_at,
      'createdAt', document_legal_evidence.created_at,
      'updatedAt', document_legal_evidence.updated_at,
      'accessAudit', coalesce((
        select jsonb_agg(access_event_payload order by access_event_created_at desc)
        from (
          select
            document_access_events.created_at as access_event_created_at,
            jsonb_strip_nulls(
              jsonb_build_object(
                'id', document_access_events.id::text,
                'runtimeId', document_access_events.id::text,
                'accessAction', document_access_events.access_action,
                'accessStatus', document_access_events.access_status,
                'targetKind', case
                  when document_access_events.printable_artifact_id is null then 'document_version'
                  else 'printable_artifact'
                end,
                'artifactKind', access_artifacts.artifact_kind,
                'signedUrlExpiresAt', document_access_events.signed_url_expires_at,
                'createdAt', document_access_events.created_at,
                'actor', case
                  when access_actor_profiles.id is null then null
                  else jsonb_strip_nulls(
                    jsonb_build_object(
                      'runtimeId', access_actor_profiles.id::text,
                      'name', coalesce(
                        access_actor_profiles.full_name,
                        access_actor_profiles.display_name,
                        access_actor_profiles.email::text
                      ),
                      'email', access_actor_profiles.email::text
                    )
                  )
                end
              )
            ) as access_event_payload
          from docs.document_access_events as document_access_events
          left join docs.printable_artifacts as access_artifacts
            on access_artifacts.id = document_access_events.printable_artifact_id
          left join identity.profiles as access_actor_profiles
            on access_actor_profiles.id = document_access_events.actor_profile_id
          where document_access_events.patient_document_id = document_legal_evidence.patient_document_id
          order by document_access_events.created_at desc
          limit v_limit
        ) as access_events
      ), '[]'::jsonb),
      'evidenceAccessAudit', coalesce((
        select jsonb_agg(audit_event_payload order by audit_event_created_at desc)
        from (
          select
            audit_events.created_at as audit_event_created_at,
            jsonb_strip_nulls(
              jsonb_build_object(
                'id', audit_events.id::text,
                'eventType', audit_events.event_type,
                'action', audit_events.action,
                'createdAt', audit_events.created_at,
                'actorType', audit_events.actor_type,
                'actor', case
                  when audit_actor_profiles.id is null then null
                  else jsonb_strip_nulls(
                    jsonb_build_object(
                      'runtimeId', audit_actor_profiles.id::text,
                      'name', coalesce(
                        audit_actor_profiles.full_name,
                        audit_actor_profiles.display_name,
                        audit_actor_profiles.email::text
                      ),
                      'email', audit_actor_profiles.email::text
                    )
                  )
                end
              )
            ) as audit_event_payload
          from audit.audit_events as audit_events
          left join identity.profiles as audit_actor_profiles
            on audit_actor_profiles.id = audit_events.actor_id
          where audit_events.resource_schema = 'docs'
            and audit_events.resource_table = 'document_legal_evidence'
            and audit_events.resource_id = document_legal_evidence.id
          order by audit_events.created_at desc
          limit v_limit
        ) as audit_events
      ), '[]'::jsonb)
    )
  )
  into v_result
  from docs.document_legal_evidence as document_legal_evidence
  inner join docs.patient_documents as patient_documents
    on patient_documents.id = document_legal_evidence.patient_document_id
  left join docs.document_versions as document_versions
    on document_versions.id = document_legal_evidence.document_version_id
  left join docs.printable_artifacts as printable_artifacts
    on printable_artifacts.id = document_legal_evidence.printable_artifact_id
  left join docs.signature_requests as signature_requests
    on signature_requests.id = document_legal_evidence.signature_request_id
  where document_legal_evidence.id = p_evidence_id
  limit 1;

  return v_result;
end;
$$;

create or replace function api.consolidate_document_legal_evidence(
  p_legacy_tenant_id text,
  p_document_id text,
  p_legacy_unit_id text default null,
  p_signature_request_id text default null
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
  v_signature_request_id uuid;
  v_evidence_id uuid;
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
    raise exception 'consolidate document legal evidence denied';
  end if;

  if nullif(trim(coalesce(p_signature_request_id, '')), '') is not null then
    v_signature_request_id := private.runtime_signature_request_id_by_public_id(
      v_runtime_tenant_id,
      p_signature_request_id
    );

    if v_signature_request_id is null then
      raise exception 'signature request % not found in current tenant', p_signature_request_id;
    end if;
  end if;

  v_evidence_id := private.rebuild_document_legal_evidence(
    v_runtime_document_id,
    v_signature_request_id,
    'api_consolidate'
  );

  return private.document_legal_evidence_safe_json(v_evidence_id, 10);
end;
$$;

create or replace function api.get_document_legal_evidence_dossier(
  p_legacy_tenant_id text,
  p_document_id text,
  p_legacy_unit_id text default null,
  p_access_event_limit integer default 10,
  p_legacy_actor_user_id text default null,
  p_reconsolidate boolean default true,
  p_audit_access boolean default true
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
  v_evidence_id uuid;
  v_actor_profile_id uuid := private.runtime_profile_id_by_legacy_user_id(p_legacy_actor_user_id);
  v_actor_type text := case when v_actor_profile_id is null then 'system' else 'profile' end;
  v_limit integer := least(greatest(coalesce(p_access_event_limit, 10), 1), 50);
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
    raise exception 'get document legal evidence denied';
  end if;

  if coalesce(p_reconsolidate, true) then
    v_evidence_id := private.rebuild_document_legal_evidence(
      v_runtime_document_id,
      null,
      'api_get'
    );
  end if;

  if v_evidence_id is null then
    select document_legal_evidence.id
    into v_evidence_id
    from docs.document_legal_evidence as document_legal_evidence
    where document_legal_evidence.patient_document_id = v_runtime_document_id
      and document_legal_evidence.evidence_status <> 'superseded'
    order by document_legal_evidence.updated_at desc, document_legal_evidence.created_at desc
    limit 1;
  end if;

  if v_evidence_id is null then
    return jsonb_build_object(
      'documentId', p_document_id,
      'runtimeDocumentId', v_runtime_document_id::text,
      'evidenceStatus', 'missing',
      'verificationStatus', 'not_required',
      'accessAudit', '[]'::jsonb,
      'evidenceAccessAudit', '[]'::jsonb
    );
  end if;

  if coalesce(p_audit_access, true) then
    perform private.record_audit_event(
      p_tenant_id => v_runtime_tenant_id,
      p_unit_id => v_document_unit_id,
      p_patient_id => v_runtime_patient_id,
      p_actor_type => v_actor_type,
      p_actor_id => v_actor_profile_id,
      p_event_type => 'docs.document_legal_evidence_accessed',
      p_action => 'read',
      p_resource_schema => 'docs',
      p_resource_table => 'document_legal_evidence',
      p_resource_id => v_evidence_id,
      p_payload => jsonb_build_object(
        'patientDocumentId', v_runtime_document_id,
        'documentId', p_document_id,
        'source', 'document_evidence_dossier_endpoint',
        'legacyTenantId', p_legacy_tenant_id,
        'legacyUnitId', p_legacy_unit_id,
        'legacyActorUserId', p_legacy_actor_user_id
      )
    );
  end if;

  return private.document_legal_evidence_safe_json(v_evidence_id, v_limit);
end;
$$;

create or replace function private.rebuild_document_legal_evidence_trigger()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_document_id uuid;
  v_signature_request_id uuid;
begin
  if tg_table_schema = 'docs' and tg_table_name = 'patient_documents' then
    v_document_id := new.id;
  elsif tg_table_schema = 'docs' and tg_table_name = 'document_versions' then
    v_document_id := new.patient_document_id;
  elsif tg_table_schema = 'docs' and tg_table_name = 'printable_artifacts' then
    v_document_id := new.patient_document_id;
  elsif tg_table_schema = 'docs' and tg_table_name = 'signature_requests' then
    v_document_id := new.patient_document_id;
    v_signature_request_id := new.id;
  elsif tg_table_schema = 'docs' and tg_table_name = 'signature_events' then
    select signature_requests.patient_document_id, signature_requests.id
    into v_document_id, v_signature_request_id
    from docs.signature_requests as signature_requests
    where signature_requests.id = new.signature_request_id
    limit 1;
  elsif tg_table_schema = 'docs' and tg_table_name = 'signature_dispatch_attempts' then
    v_document_id := new.patient_document_id;
    v_signature_request_id := new.signature_request_id;
  end if;

  if v_document_id is not null then
    perform private.rebuild_document_legal_evidence(
      v_document_id,
      v_signature_request_id,
      'trigger:' || tg_table_name
    );
  end if;

  return new;
end;
$$;

drop trigger if exists rebuild_document_legal_evidence_on_patient_documents on docs.patient_documents;
create trigger rebuild_document_legal_evidence_on_patient_documents
after insert or update of current_version_id, status, signed_at, deleted_at
on docs.patient_documents
for each row execute function private.rebuild_document_legal_evidence_trigger();

drop trigger if exists rebuild_document_legal_evidence_on_document_versions on docs.document_versions;
create trigger rebuild_document_legal_evidence_on_document_versions
after insert or update of status, checksum, issued_at, signed_at, storage_object_path, signed_storage_object_path
on docs.document_versions
for each row execute function private.rebuild_document_legal_evidence_trigger();

drop trigger if exists rebuild_document_legal_evidence_on_printable_artifacts on docs.printable_artifacts;
create trigger rebuild_document_legal_evidence_on_printable_artifacts
after insert or update of render_status, checksum, rendered_at, failure_reason, metadata, storage_object_path
on docs.printable_artifacts
for each row execute function private.rebuild_document_legal_evidence_trigger();

drop trigger if exists rebuild_document_legal_evidence_on_signature_requests on docs.signature_requests;
create trigger rebuild_document_legal_evidence_on_signature_requests
after insert or update of request_status, external_request_id, completed_at, metadata
on docs.signature_requests
for each row execute function private.rebuild_document_legal_evidence_trigger();

drop trigger if exists rebuild_document_legal_evidence_on_signature_events on docs.signature_events;
create trigger rebuild_document_legal_evidence_on_signature_events
after insert or update of event_type, external_event_id, event_at, payload, metadata
on docs.signature_events
for each row execute function private.rebuild_document_legal_evidence_trigger();

drop trigger if exists rebuild_document_legal_evidence_on_signature_dispatch_attempts on docs.signature_dispatch_attempts;
create trigger rebuild_document_legal_evidence_on_signature_dispatch_attempts
after insert or update of dispatch_status, external_request_id, idempotency_key, response_payload, error_message, completed_at, metadata
on docs.signature_dispatch_attempts
for each row execute function private.rebuild_document_legal_evidence_trigger();

create or replace function public.consolidate_document_legal_evidence(
  p_legacy_tenant_id text,
  p_document_id text,
  p_legacy_unit_id text default null,
  p_signature_request_id text default null
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select api.consolidate_document_legal_evidence(
    p_legacy_tenant_id,
    p_document_id,
    p_legacy_unit_id,
    p_signature_request_id
  )
$$;

create or replace function public.get_document_legal_evidence_dossier(
  p_legacy_tenant_id text,
  p_document_id text,
  p_legacy_unit_id text default null,
  p_access_event_limit integer default 10,
  p_legacy_actor_user_id text default null,
  p_reconsolidate boolean default true,
  p_audit_access boolean default true
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select api.get_document_legal_evidence_dossier(
    p_legacy_tenant_id,
    p_document_id,
    p_legacy_unit_id,
    p_access_event_limit,
    p_legacy_actor_user_id,
    p_reconsolidate,
    p_audit_access
  )
$$;

alter function api.consolidate_document_legal_evidence(text, text, text, text)
  security definer;
alter function api.consolidate_document_legal_evidence(text, text, text, text)
  set search_path = '';

alter function api.get_document_legal_evidence_dossier(text, text, text, integer, text, boolean, boolean)
  security definer;
alter function api.get_document_legal_evidence_dossier(text, text, text, integer, text, boolean, boolean)
  set search_path = '';

alter function public.consolidate_document_legal_evidence(text, text, text, text)
  security invoker;
alter function public.consolidate_document_legal_evidence(text, text, text, text)
  set search_path = '';

alter function public.get_document_legal_evidence_dossier(text, text, text, integer, text, boolean, boolean)
  security invoker;
alter function public.get_document_legal_evidence_dossier(text, text, text, integer, text, boolean, boolean)
  set search_path = '';

revoke all on function private.rebuild_document_legal_evidence(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function private.document_legal_evidence_safe_json(uuid, integer)
  from public, anon, authenticated;
revoke all on function private.rebuild_document_legal_evidence_trigger()
  from public, anon, authenticated;
revoke all on function api.consolidate_document_legal_evidence(text, text, text, text)
  from public, anon, authenticated;
revoke all on function api.get_document_legal_evidence_dossier(text, text, text, integer, text, boolean, boolean)
  from public, anon, authenticated;
revoke all on function public.consolidate_document_legal_evidence(text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.get_document_legal_evidence_dossier(text, text, text, integer, text, boolean, boolean)
  from public, anon, authenticated;

grant execute on function private.rebuild_document_legal_evidence(uuid, uuid, text)
  to service_role;
grant execute on function private.document_legal_evidence_safe_json(uuid, integer)
  to service_role;
grant execute on function api.consolidate_document_legal_evidence(text, text, text, text)
  to service_role;
grant execute on function api.get_document_legal_evidence_dossier(text, text, text, integer, text, boolean, boolean)
  to service_role;
grant execute on function public.consolidate_document_legal_evidence(text, text, text, text)
  to service_role;
grant execute on function public.get_document_legal_evidence_dossier(text, text, text, integer, text, boolean, boolean)
  to service_role;

do $$
declare
  v_document record;
begin
  for v_document in
    select patient_documents.id
    from docs.patient_documents as patient_documents
    where patient_documents.deleted_at is null
  loop
    perform private.rebuild_document_legal_evidence(
      v_document.id,
      null,
      'migration_backfill'
    );
  end loop;
end;
$$;
