alter table docs.signature_requests
  add column if not exists provider_mode text,
  add column if not exists external_document_id text,
  add column if not exists external_envelope_id text,
  add column if not exists verification_method text,
  add column if not exists verification_status text,
  add column if not exists verification_failure_reason text,
  add column if not exists verified_at timestamptz,
  add column if not exists provider_payload_hash text;

alter table docs.signature_dispatch_attempts
  add column if not exists provider_mode text,
  add column if not exists external_document_id text,
  add column if not exists external_envelope_id text,
  add column if not exists provider_payload_hash text,
  add column if not exists verification_method text,
  add column if not exists verification_status text,
  add column if not exists verification_failure_reason text,
  add column if not exists verified_at timestamptz;

alter table docs.signature_events
  add column if not exists provider_mode text,
  add column if not exists provider_event_hash text,
  add column if not exists raw_event_hash text,
  add column if not exists hmac_strategy text,
  add column if not exists hmac_valid boolean,
  add column if not exists verification_method text,
  add column if not exists verification_status text,
  add column if not exists verification_failure_reason text,
  add column if not exists provider_payload_hash text;

alter table docs.document_legal_evidence
  add column if not exists provider_mode text,
  add column if not exists external_document_id text,
  add column if not exists provider_event_hash text,
  add column if not exists verification_method text,
  add column if not exists verification_failure_reason text,
  add column if not exists provider_payload_hash text;

create index if not exists idx_docs_signature_requests_provider_mode
  on docs.signature_requests (provider_code, provider_mode, requested_at desc);

create index if not exists idx_docs_signature_dispatch_attempts_provider_mode
  on docs.signature_dispatch_attempts (provider_code, provider_mode, attempted_at desc);

create index if not exists idx_docs_signature_events_provider_hash
  on docs.signature_events (source, provider_event_hash)
  where provider_event_hash is not null;

create or replace function private.apply_signature_dispatch_provider_readiness()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  new.provider_mode := coalesce(
    nullif(trim(coalesce(new.provider_mode, '')), ''),
    nullif(trim(coalesce(new.metadata ->> 'providerMode', '')), ''),
    nullif(trim(coalesce(new.response_payload ->> 'providerMode', '')), '')
  );
  new.external_document_id := coalesce(
    nullif(trim(coalesce(new.external_document_id, '')), ''),
    nullif(trim(coalesce(new.metadata ->> 'externalDocumentId', '')), ''),
    nullif(trim(coalesce(new.response_payload ->> 'externalDocumentId', '')), '')
  );
  new.external_envelope_id := coalesce(
    nullif(trim(coalesce(new.external_envelope_id, '')), ''),
    nullif(trim(coalesce(new.metadata ->> 'externalEnvelopeId', '')), ''),
    nullif(trim(coalesce(new.response_payload ->> 'externalEnvelopeId', '')), '')
  );
  new.provider_payload_hash := coalesce(
    nullif(trim(coalesce(new.provider_payload_hash, '')), ''),
    nullif(trim(coalesce(new.metadata ->> 'providerPayloadHash', '')), ''),
    case when new.response_payload <> '{}'::jsonb then md5(new.response_payload::text) else null end
  );
  new.verification_method := coalesce(
    nullif(trim(coalesce(new.verification_method, '')), ''),
    nullif(trim(coalesce(new.metadata ->> 'verificationMethod', '')), ''),
    nullif(trim(coalesce(new.response_payload ->> 'verificationMethod', '')), '')
  );
  new.verification_status := coalesce(
    nullif(trim(coalesce(new.verification_status, '')), ''),
    nullif(trim(coalesce(new.metadata ->> 'verificationStatus', '')), ''),
    nullif(trim(coalesce(new.response_payload ->> 'verificationStatus', '')), '')
  );
  new.verification_failure_reason := coalesce(
    nullif(trim(coalesce(new.verification_failure_reason, '')), ''),
    nullif(trim(coalesce(new.metadata ->> 'verificationFailureReason', '')), ''),
    nullif(trim(coalesce(new.response_payload ->> 'verificationFailureReason', '')), '')
  );

  return new;
end;
$$;

drop trigger if exists apply_signature_dispatch_provider_readiness on docs.signature_dispatch_attempts;
create trigger apply_signature_dispatch_provider_readiness
before insert or update on docs.signature_dispatch_attempts
for each row execute function private.apply_signature_dispatch_provider_readiness();

create or replace function private.apply_signature_event_provider_readiness()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  new.provider_mode := coalesce(
    nullif(trim(coalesce(new.provider_mode, '')), ''),
    nullif(trim(coalesce(new.metadata ->> 'providerMode', '')), ''),
    nullif(trim(coalesce(new.payload ->> 'providerMode', '')), '')
  );
  new.provider_event_hash := coalesce(
    nullif(trim(coalesce(new.provider_event_hash, '')), ''),
    nullif(trim(coalesce(new.metadata ->> 'providerEventHash', '')), ''),
    nullif(trim(coalesce(new.payload ->> 'providerEventHash', '')), '')
  );
  new.raw_event_hash := coalesce(
    nullif(trim(coalesce(new.raw_event_hash, '')), ''),
    nullif(trim(coalesce(new.metadata ->> 'rawEventHash', '')), ''),
    nullif(trim(coalesce(new.payload ->> 'rawEventHash', '')), '')
  );
  new.hmac_strategy := coalesce(
    nullif(trim(coalesce(new.hmac_strategy, '')), ''),
    nullif(trim(coalesce(new.metadata ->> 'hmacStrategy', '')), ''),
    nullif(trim(coalesce(new.payload -> 'hmac' ->> 'strategy', '')), '')
  );
  new.hmac_valid := coalesce(
    new.hmac_valid,
    case
      when lower(coalesce(new.metadata ->> 'hmacValid', '')) in ('true', '1', 'yes') then true
      when lower(coalesce(new.metadata ->> 'hmacValid', '')) in ('false', '0', 'no') then false
      when lower(coalesce(new.payload -> 'hmac' ->> 'valid', '')) in ('true', '1', 'yes') then true
      when lower(coalesce(new.payload -> 'hmac' ->> 'valid', '')) in ('false', '0', 'no') then false
      else null
    end
  );
  new.verification_method := coalesce(
    nullif(trim(coalesce(new.verification_method, '')), ''),
    nullif(trim(coalesce(new.metadata ->> 'verificationMethod', '')), ''),
    nullif(trim(coalesce(new.payload ->> 'verificationMethod', '')), '')
  );
  new.verification_status := coalesce(
    nullif(trim(coalesce(new.verification_status, '')), ''),
    nullif(trim(coalesce(new.metadata ->> 'verificationStatus', '')), ''),
    nullif(trim(coalesce(new.payload ->> 'verificationStatus', '')), '')
  );
  new.verification_failure_reason := coalesce(
    nullif(trim(coalesce(new.verification_failure_reason, '')), ''),
    nullif(trim(coalesce(new.metadata ->> 'verificationFailureReason', '')), ''),
    nullif(trim(coalesce(new.payload ->> 'verificationFailureReason', '')), '')
  );
  new.provider_payload_hash := coalesce(
    nullif(trim(coalesce(new.provider_payload_hash, '')), ''),
    nullif(trim(coalesce(new.metadata ->> 'providerPayloadHash', '')), ''),
    nullif(trim(coalesce(new.payload ->> 'providerPayloadHash', '')), ''),
    case when new.payload <> '{}'::jsonb then md5(new.payload::text) else null end
  );

  return new;
end;
$$;

drop trigger if exists apply_signature_event_provider_readiness on docs.signature_events;
create trigger apply_signature_event_provider_readiness
before insert or update on docs.signature_events
for each row execute function private.apply_signature_event_provider_readiness();

create or replace function private.apply_document_legal_evidence_provider_readiness()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_signature docs.signature_requests%rowtype;
  v_dispatch docs.signature_dispatch_attempts%rowtype;
  v_event docs.signature_events%rowtype;
begin
  if new.signature_request_id is null then
    return new;
  end if;

  select *
  into v_signature
  from docs.signature_requests
  where id = new.signature_request_id
  limit 1;

  select *
  into v_dispatch
  from docs.signature_dispatch_attempts
  where signature_request_id = new.signature_request_id
  order by attempted_at desc, created_at desc
  limit 1;

  select *
  into v_event
  from docs.signature_events
  where signature_request_id = new.signature_request_id
  order by event_at desc, created_at desc
  limit 1;

  new.provider_mode := coalesce(
    nullif(trim(coalesce(new.provider_mode, '')), ''),
    nullif(trim(coalesce(v_signature.provider_mode, '')), ''),
    nullif(trim(coalesce(v_dispatch.provider_mode, '')), ''),
    nullif(trim(coalesce(v_event.provider_mode, '')), ''),
    nullif(trim(coalesce(v_signature.metadata ->> 'providerMode', '')), '')
  );
  new.external_document_id := coalesce(
    nullif(trim(coalesce(new.external_document_id, '')), ''),
    nullif(trim(coalesce(v_signature.external_document_id, '')), ''),
    nullif(trim(coalesce(v_dispatch.external_document_id, '')), ''),
    nullif(trim(coalesce(v_event.payload ->> 'externalDocumentId', '')), '')
  );
  new.external_envelope_id := coalesce(
    nullif(trim(coalesce(new.external_envelope_id, '')), ''),
    nullif(trim(coalesce(v_signature.external_envelope_id, '')), ''),
    nullif(trim(coalesce(v_dispatch.external_envelope_id, '')), '')
  );
  new.provider_event_hash := coalesce(
    nullif(trim(coalesce(new.provider_event_hash, '')), ''),
    nullif(trim(coalesce(v_event.provider_event_hash, '')), ''),
    nullif(trim(coalesce(v_event.payload ->> 'providerEventHash', '')), '')
  );
  new.verification_method := coalesce(
    nullif(trim(coalesce(new.verification_method, '')), ''),
    nullif(trim(coalesce(v_signature.verification_method, '')), ''),
    nullif(trim(coalesce(v_event.verification_method, '')), ''),
    nullif(trim(coalesce(v_dispatch.verification_method, '')), '')
  );
  new.verification_failure_reason := coalesce(
    nullif(trim(coalesce(new.verification_failure_reason, '')), ''),
    nullif(trim(coalesce(v_signature.verification_failure_reason, '')), ''),
    nullif(trim(coalesce(v_event.verification_failure_reason, '')), ''),
    nullif(trim(coalesce(v_dispatch.verification_failure_reason, '')), '')
  );
  new.provider_payload_hash := coalesce(
    nullif(trim(coalesce(new.provider_payload_hash, '')), ''),
    nullif(trim(coalesce(v_signature.provider_payload_hash, '')), ''),
    nullif(trim(coalesce(v_event.provider_payload_hash, '')), ''),
    nullif(trim(coalesce(v_dispatch.provider_payload_hash, '')), '')
  );

  return new;
end;
$$;

drop trigger if exists apply_document_legal_evidence_provider_readiness on docs.document_legal_evidence;
create trigger apply_document_legal_evidence_provider_readiness
before insert or update on docs.document_legal_evidence
for each row execute function private.apply_document_legal_evidence_provider_readiness();

create or replace function api.record_document_signature_provider_readiness(
  p_legacy_tenant_id text default null,
  p_document_id text default null,
  p_signature_request_id text default null,
  p_legacy_unit_id text default null,
  p_provider text default null,
  p_provider_mode text default null,
  p_provider_status text default null,
  p_request_status text default null,
  p_external_document_id text default null,
  p_external_envelope_id text default null,
  p_provider_event_hash text default null,
  p_raw_event_hash text default null,
  p_verification_method text default null,
  p_verification_status text default null,
  p_verification_failure_reason text default null,
  p_verified_at timestamptz default null,
  p_provider_payload_hash text default null,
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
  v_document_unit_id uuid;
  v_runtime_patient_id uuid;
  v_signature_request_id uuid;
  v_provider text := lower(nullif(trim(coalesce(p_provider, '')), ''));
  v_provider_mode text := lower(nullif(trim(coalesce(p_provider_mode, '')), ''));
  v_provider_status text := lower(nullif(trim(coalesce(p_provider_status, '')), ''));
  v_request_status text := lower(nullif(trim(coalesce(p_request_status, '')), ''));
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if jsonb_typeof(v_metadata) <> 'object' then
    raise exception 'p_metadata must be a json object';
  end if;

  if nullif(trim(coalesce(p_legacy_tenant_id, '')), '') is not null then
    v_runtime_tenant_id := private.runtime_tenant_id_by_legacy_tenant_id(p_legacy_tenant_id);
  end if;

  if v_runtime_tenant_id is not null
    and nullif(trim(coalesce(p_legacy_unit_id, '')), '') is not null then
    select units.id
    into v_runtime_unit_id
    from platform.units as units
    where units.tenant_id = v_runtime_tenant_id
      and units.metadata @> jsonb_build_object('legacy_unit_id', p_legacy_unit_id)
    limit 1;
  end if;

  if v_runtime_tenant_id is not null and nullif(trim(coalesce(p_document_id, '')), '') is not null then
    v_runtime_document_id := private.runtime_patient_document_id_by_public_id(
      v_runtime_tenant_id,
      p_document_id
    );
  end if;

  if v_runtime_document_id is null and nullif(trim(coalesce(p_document_id, '')), '') is not null then
    select patient_documents.id, patient_documents.tenant_id
    into v_runtime_document_id, v_runtime_tenant_id
    from docs.patient_documents as patient_documents
    where patient_documents.deleted_at is null
      and (
        patient_documents.id = private.try_uuid(p_document_id)
        or patient_documents.legacy_patient_document_id = nullif(trim(coalesce(p_document_id, '')), '')
      )
    limit 1;
  end if;

  if v_runtime_tenant_id is not null
    and nullif(trim(coalesce(p_signature_request_id, '')), '') is not null then
    v_signature_request_id := private.runtime_signature_request_id_by_public_id(
      v_runtime_tenant_id,
      p_signature_request_id
    );
  end if;

  if v_signature_request_id is null
    and nullif(trim(coalesce(p_signature_request_id, '')), '') is not null then
    select signature_requests.id, signature_requests.patient_document_id, patient_documents.tenant_id
    into v_signature_request_id, v_runtime_document_id, v_runtime_tenant_id
    from docs.signature_requests as signature_requests
    inner join docs.patient_documents as patient_documents
      on patient_documents.id = signature_requests.patient_document_id
    where patient_documents.deleted_at is null
      and (
        signature_requests.id = private.try_uuid(p_signature_request_id)
        or signature_requests.legacy_signature_request_id = nullif(trim(coalesce(p_signature_request_id, '')), '')
      )
    limit 1;
  end if;

  if v_signature_request_id is null and v_runtime_document_id is not null then
    select signature_requests.id
    into v_signature_request_id
    from docs.signature_requests as signature_requests
    where signature_requests.patient_document_id = v_runtime_document_id
    order by signature_requests.requested_at desc, signature_requests.created_at desc
    limit 1;
  end if;

  if v_signature_request_id is null then
    raise exception 'signature request could not be resolved for provider readiness';
  end if;

  select
    signature_requests.patient_document_id,
    signature_requests.patient_id,
    patient_documents.tenant_id,
    patient_documents.unit_id
  into
    v_runtime_document_id,
    v_runtime_patient_id,
    v_runtime_tenant_id,
    v_document_unit_id
  from docs.signature_requests as signature_requests
  inner join docs.patient_documents as patient_documents
    on patient_documents.id = signature_requests.patient_document_id
  where signature_requests.id = v_signature_request_id
  limit 1;

  if v_runtime_unit_id is not null
    and v_document_unit_id is not null
    and v_document_unit_id <> v_runtime_unit_id then
    raise exception 'document is outside the current unit scope';
  end if;

  if v_request_status is not null
    and v_request_status not in ('pending', 'sent', 'viewed', 'signed', 'declined', 'expired', 'cancelled') then
    raise exception 'invalid request status %', v_request_status;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not private.can_manage_clinical_domain(v_runtime_tenant_id, coalesce(v_document_unit_id, v_runtime_unit_id)) then
    raise exception 'record document signature provider readiness denied';
  end if;

  update docs.signature_requests
  set
    provider_code = coalesce(v_provider, provider_code),
    provider_mode = coalesce(v_provider_mode, provider_mode),
    external_document_id = coalesce(nullif(trim(coalesce(p_external_document_id, '')), ''), external_document_id),
    external_envelope_id = coalesce(nullif(trim(coalesce(p_external_envelope_id, '')), ''), external_envelope_id),
    external_request_id = coalesce(nullif(trim(coalesce(p_external_document_id, '')), ''), external_request_id),
    request_status = coalesce(v_request_status, request_status),
    verification_method = coalesce(nullif(trim(coalesce(p_verification_method, '')), ''), verification_method),
    verification_status = coalesce(lower(nullif(trim(coalesce(p_verification_status, '')), '')), verification_status),
    verification_failure_reason = coalesce(
      nullif(trim(coalesce(p_verification_failure_reason, '')), ''),
      verification_failure_reason
    ),
    verified_at = coalesce(p_verified_at, verified_at),
    provider_payload_hash = coalesce(nullif(trim(coalesce(p_provider_payload_hash, '')), ''), provider_payload_hash),
    metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_strip_nulls(
        jsonb_build_object(
          'providerMode', v_provider_mode,
          'providerStatus', v_provider_status,
          'externalDocumentId', nullif(trim(coalesce(p_external_document_id, '')), ''),
          'externalEnvelopeId', nullif(trim(coalesce(p_external_envelope_id, '')), ''),
          'providerEventHash', nullif(trim(coalesce(p_provider_event_hash, '')), ''),
          'rawEventHash', nullif(trim(coalesce(p_raw_event_hash, '')), ''),
          'verificationMethod', nullif(trim(coalesce(p_verification_method, '')), ''),
          'verificationStatus', lower(nullif(trim(coalesce(p_verification_status, '')), '')),
          'verificationFailureReason', nullif(trim(coalesce(p_verification_failure_reason, '')), ''),
          'providerPayloadHash', nullif(trim(coalesce(p_provider_payload_hash, '')), '')
        )
      )
      || v_metadata,
    updated_at = now()
  where id = v_signature_request_id;

  update docs.document_legal_evidence
  set
    provider_mode = coalesce(v_provider_mode, provider_mode),
    external_document_id = coalesce(nullif(trim(coalesce(p_external_document_id, '')), ''), external_document_id),
    external_envelope_id = coalesce(nullif(trim(coalesce(p_external_envelope_id, '')), ''), external_envelope_id),
    provider_event_hash = coalesce(nullif(trim(coalesce(p_provider_event_hash, '')), ''), provider_event_hash),
    verification_method = coalesce(nullif(trim(coalesce(p_verification_method, '')), ''), verification_method),
    verification_failure_reason = coalesce(
      nullif(trim(coalesce(p_verification_failure_reason, '')), ''),
      verification_failure_reason
    ),
    provider_payload_hash = coalesce(nullif(trim(coalesce(p_provider_payload_hash, '')), ''), provider_payload_hash),
    updated_at = now()
  where signature_request_id = v_signature_request_id
    and evidence_status <> 'superseded';

  perform private.record_audit_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => v_document_unit_id,
    p_patient_id => v_runtime_patient_id,
    p_actor_type => 'system',
    p_actor_id => null,
    p_event_type => 'docs.signature_provider_readiness_recorded',
    p_action => 'update',
    p_resource_schema => 'docs',
    p_resource_table => 'signature_requests',
    p_resource_id => v_signature_request_id,
    p_payload => jsonb_strip_nulls(
      jsonb_build_object(
        'documentId', v_runtime_document_id,
        'signatureRequestId', v_signature_request_id,
        'provider', v_provider,
        'providerMode', v_provider_mode,
        'providerStatus', v_provider_status,
        'requestStatus', v_request_status,
        'externalDocumentId', nullif(trim(coalesce(p_external_document_id, '')), ''),
        'providerEventHash', nullif(trim(coalesce(p_provider_event_hash, '')), ''),
        'rawEventHash', nullif(trim(coalesce(p_raw_event_hash, '')), ''),
        'verificationMethod', nullif(trim(coalesce(p_verification_method, '')), ''),
        'verificationStatus', lower(nullif(trim(coalesce(p_verification_status, '')), ''))
      )
    ) || v_metadata
  );

  return coalesce(private.patient_document_json(v_runtime_document_id), '{}'::jsonb);
end;
$$;

create or replace function api.get_document_signature_provider_readiness(
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
  v_runtime_patient_id uuid;
  v_document_public_id text;
  v_signature docs.signature_requests%rowtype;
  v_dispatch docs.signature_dispatch_attempts%rowtype;
  v_event docs.signature_events%rowtype;
  v_evidence docs.document_legal_evidence%rowtype;
  v_provider_code text;
  v_provider_mode text;
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

  select
    patient_documents.unit_id,
    patient_documents.patient_id,
    coalesce(patient_documents.legacy_patient_document_id, patient_documents.id::text)
  into
    v_document_unit_id,
    v_runtime_patient_id,
    v_document_public_id
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
      private.can_read_clinical_domain(v_runtime_tenant_id, coalesce(v_document_unit_id, v_runtime_unit_id))
      and private.can_access_patient(v_runtime_patient_id)
    ) then
    raise exception 'get document signature provider readiness denied';
  end if;

  select *
  into v_signature
  from docs.signature_requests
  where patient_document_id = v_runtime_document_id
  order by requested_at desc, created_at desc
  limit 1;

  if v_signature.id is not null then
    select *
    into v_dispatch
    from docs.signature_dispatch_attempts
    where signature_request_id = v_signature.id
    order by attempted_at desc, created_at desc
    limit 1;

    select *
    into v_event
    from docs.signature_events
    where signature_request_id = v_signature.id
    order by event_at desc, created_at desc
    limit 1;
  end if;

  select *
  into v_evidence
  from docs.document_legal_evidence
  where patient_document_id = v_runtime_document_id
    and evidence_status <> 'superseded'
  order by updated_at desc, created_at desc
  limit 1;

  v_provider_code := coalesce(v_signature.provider_code, v_dispatch.provider_code, v_evidence.provider_code);
  v_provider_mode := coalesce(
    v_signature.provider_mode,
    v_dispatch.provider_mode,
    v_event.provider_mode,
    v_evidence.provider_mode,
    v_signature.metadata ->> 'providerMode',
    v_dispatch.metadata ->> 'providerMode',
    v_event.payload ->> 'providerMode'
  );

  return jsonb_strip_nulls(
    jsonb_build_object(
      'documentId', v_document_public_id,
      'runtimeDocumentId', v_runtime_document_id::text,
      'signatureRequestId', coalesce(v_signature.legacy_signature_request_id, v_signature.id::text),
      'runtimeSignatureRequestId', v_signature.id::text,
      'providerCode', v_provider_code,
      'providerMode', v_provider_mode,
      'adapterCode', case
        when v_provider_code = 'd4sign' and v_provider_mode = 'unconfigured' then 'd4sign_unconfigured'
        when v_provider_code = 'd4sign' and v_provider_mode = 'simulated' then 'd4sign_simulated'
        when v_provider_code = 'd4sign' and v_provider_mode = 'real' then 'd4sign_real'
        when v_provider_code is null then null
        else 'mock'
      end,
      'providerStatus', coalesce(
        v_signature.metadata ->> 'providerStatus',
        v_dispatch.metadata ->> 'providerStatus',
        v_dispatch.response_payload ->> 'providerStatus',
        v_event.payload ->> 'providerStatus'
      ),
      'externalDocumentId', coalesce(
        v_signature.external_document_id,
        v_dispatch.external_document_id,
        v_event.payload ->> 'externalDocumentId',
        v_evidence.external_document_id
      ),
      'externalEnvelopeId', coalesce(
        v_signature.external_envelope_id,
        v_dispatch.external_envelope_id,
        v_evidence.external_envelope_id
      ),
      'providerEventHash', coalesce(
        v_event.provider_event_hash,
        v_event.payload ->> 'providerEventHash',
        v_evidence.provider_event_hash
      ),
      'rawEventHash', coalesce(v_event.raw_event_hash, v_event.payload ->> 'rawEventHash'),
      'providerPayloadHash', coalesce(
        v_signature.provider_payload_hash,
        v_event.provider_payload_hash,
        v_dispatch.provider_payload_hash,
        v_evidence.provider_payload_hash
      ),
      'hmacStrategy', coalesce(v_event.hmac_strategy, v_event.payload -> 'hmac' ->> 'strategy'),
      'hmacValid', coalesce(v_event.hmac_valid, false),
      'verificationMethod', coalesce(
        v_signature.verification_method,
        v_event.verification_method,
        v_dispatch.verification_method,
        v_evidence.verification_method
      ),
      'verificationStatus', coalesce(
        v_signature.verification_status,
        v_event.verification_status,
        v_dispatch.verification_status,
        v_evidence.verification_status
      ),
      'verificationFailureReason', coalesce(
        v_signature.verification_failure_reason,
        v_event.verification_failure_reason,
        v_dispatch.verification_failure_reason,
        v_evidence.verification_failure_reason
      ),
      'verifiedAt', coalesce(v_signature.verified_at, v_dispatch.verified_at, v_evidence.verified_at),
      'providerRealAdapterImplemented', false,
      'credentialsPending', coalesce(v_provider_code = 'd4sign' and v_provider_mode = 'unconfigured', false),
      'latestDispatch', case
        when v_dispatch.id is null then null
        else jsonb_strip_nulls(
          jsonb_build_object(
            'id', v_dispatch.id::text,
            'providerCode', v_dispatch.provider_code,
            'providerMode', v_dispatch.provider_mode,
            'dispatchStatus', v_dispatch.dispatch_status,
            'externalRequestId', v_dispatch.external_request_id,
            'externalDocumentId', v_dispatch.external_document_id,
            'externalEnvelopeId', v_dispatch.external_envelope_id,
            'attemptedAt', v_dispatch.attempted_at,
            'completedAt', v_dispatch.completed_at,
            'errorMessage', v_dispatch.error_message
          )
        )
      end,
      'latestEvent', case
        when v_event.id is null then null
        else jsonb_strip_nulls(
          jsonb_build_object(
            'id', v_event.id::text,
            'eventType', v_event.event_type,
            'source', v_event.source,
            'externalEventId', v_event.external_event_id,
            'providerMode', v_event.provider_mode,
            'providerEventHash', v_event.provider_event_hash,
            'rawEventHash', v_event.raw_event_hash,
            'hmacStrategy', v_event.hmac_strategy,
            'hmacValid', v_event.hmac_valid,
            'eventAt', v_event.event_at,
            'createdAt', v_event.created_at
          )
        )
      end
    )
  );
end;
$$;

create or replace function public.record_document_signature_provider_readiness(
  p_legacy_tenant_id text default null,
  p_document_id text default null,
  p_signature_request_id text default null,
  p_legacy_unit_id text default null,
  p_provider text default null,
  p_provider_mode text default null,
  p_provider_status text default null,
  p_request_status text default null,
  p_external_document_id text default null,
  p_external_envelope_id text default null,
  p_provider_event_hash text default null,
  p_raw_event_hash text default null,
  p_verification_method text default null,
  p_verification_status text default null,
  p_verification_failure_reason text default null,
  p_verified_at timestamptz default null,
  p_provider_payload_hash text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.record_document_signature_provider_readiness(
    p_legacy_tenant_id,
    p_document_id,
    p_signature_request_id,
    p_legacy_unit_id,
    p_provider,
    p_provider_mode,
    p_provider_status,
    p_request_status,
    p_external_document_id,
    p_external_envelope_id,
    p_provider_event_hash,
    p_raw_event_hash,
    p_verification_method,
    p_verification_status,
    p_verification_failure_reason,
    p_verified_at,
    p_provider_payload_hash,
    p_metadata
  )
$$;

create or replace function public.get_document_signature_provider_readiness(
  p_legacy_tenant_id text,
  p_document_id text,
  p_legacy_unit_id text default null
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select api.get_document_signature_provider_readiness(
    p_legacy_tenant_id,
    p_document_id,
    p_legacy_unit_id
  )
$$;

alter function public.record_document_signature_provider_readiness(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz, text, jsonb)
  security invoker;
alter function public.get_document_signature_provider_readiness(text, text, text)
  security invoker;

revoke all on function private.apply_signature_dispatch_provider_readiness()
  from public, anon, authenticated;
revoke all on function private.apply_signature_event_provider_readiness()
  from public, anon, authenticated;
revoke all on function private.apply_document_legal_evidence_provider_readiness()
  from public, anon, authenticated;
revoke all on function api.record_document_signature_provider_readiness(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz, text, jsonb)
  from public, anon, authenticated;
revoke all on function api.get_document_signature_provider_readiness(text, text, text)
  from public, anon, authenticated;
revoke all on function public.record_document_signature_provider_readiness(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.get_document_signature_provider_readiness(text, text, text)
  from public, anon, authenticated;

grant execute on function api.record_document_signature_provider_readiness(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz, text, jsonb)
  to service_role;
grant execute on function api.get_document_signature_provider_readiness(text, text, text)
  to service_role;
grant execute on function public.record_document_signature_provider_readiness(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz, text, jsonb)
  to service_role;
grant execute on function public.get_document_signature_provider_readiness(text, text, text)
  to service_role;
