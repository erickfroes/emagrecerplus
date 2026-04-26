create table if not exists docs.document_operational_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references platform.tenants (id) on delete cascade,
  unit_id uuid references platform.units (id) on delete set null,
  patient_id uuid references patients.patients (id) on delete set null,
  patient_document_id uuid references docs.patient_documents (id) on delete set null,
  signature_request_id uuid references docs.signature_requests (id) on delete set null,
  event_category text not null,
  event_type text not null,
  severity text not null default 'info',
  provider_code text,
  provider_mode text,
  status text,
  error_code text,
  error_message text,
  correlation_id uuid,
  idempotency_key text,
  provider_event_hash text,
  raw_event_hash text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint document_operational_events_category_check
    check (event_category in ('dispatch', 'webhook', 'evidence', 'package', 'access', 'system')),
  constraint document_operational_events_severity_check
    check (severity in ('info', 'warning', 'error'))
);

create index if not exists idx_docs_document_operational_events_tenant_occurred
  on docs.document_operational_events (tenant_id, occurred_at desc);

create index if not exists idx_docs_document_operational_events_category_occurred
  on docs.document_operational_events (tenant_id, event_category, occurred_at desc);

create index if not exists idx_docs_document_operational_events_provider
  on docs.document_operational_events (tenant_id, provider_code, provider_mode, occurred_at desc)
  where provider_code is not null;

create index if not exists idx_docs_document_operational_events_document
  on docs.document_operational_events (patient_document_id, occurred_at desc)
  where patient_document_id is not null;

alter table docs.document_operational_events enable row level security;

drop policy if exists document_operational_events_select_current_scope on docs.document_operational_events;
create policy document_operational_events_select_current_scope
on docs.document_operational_events
for select
to authenticated
using (
  tenant_id is not null
  and private.can_read_clinical_domain(tenant_id, unit_id)
  and (patient_id is null or private.can_access_patient(patient_id))
);

revoke all on table docs.document_operational_events from public, anon, authenticated;
grant select, insert, update, delete on table docs.document_operational_events to service_role;

create or replace function private.document_ops_safe_text(p_value text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select nullif(
    left(
      regexp_replace(
        regexp_replace(
          coalesce(p_value, ''),
          'https?://[^[:space:]"''`]+',
          '[redacted-url]',
          'gi'
        ),
        'tenant/[^[:space:]"''`]+',
        '[redacted-storage-path]',
        'gi'
      ),
      500
    ),
    ''
  )
$$;

create or replace function private.document_ops_safe_metadata(p_metadata jsonb)
returns jsonb
language sql
immutable
security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(
    coalesce(p_metadata, '{}'::jsonb)
    - 'authorization'
    - 'Authorization'
    - 'apikey'
    - 'apiKey'
    - 'cryptKey'
    - 'downloadUrl'
    - 'openUrl'
    - 'secret'
    - 'serviceRole'
    - 'service_role'
    - 'signedUrl'
    - 'storageObjectPath'
    - 'storage_object_path'
    - 'token'
    - 'tokenAPI'
  )
$$;

create or replace function api.record_document_operational_event(
  p_event_category text,
  p_event_type text,
  p_legacy_tenant_id text default null,
  p_legacy_unit_id text default null,
  p_document_id text default null,
  p_signature_request_id text default null,
  p_external_request_id text default null,
  p_severity text default 'info',
  p_provider text default null,
  p_provider_mode text default null,
  p_status text default null,
  p_error_code text default null,
  p_error_message text default null,
  p_correlation_id text default null,
  p_idempotency_key text default null,
  p_provider_event_hash text default null,
  p_raw_event_hash text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default now()
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
  v_signature_request_id uuid;
  v_category text := lower(coalesce(nullif(trim(coalesce(p_event_category, '')), ''), 'system'));
  v_severity text := lower(coalesce(nullif(trim(coalesce(p_severity, '')), ''), 'info'));
  v_event_id uuid;
begin
  if v_category not in ('dispatch', 'webhook', 'evidence', 'package', 'access', 'system') then
    v_category := 'system';
  end if;

  if v_severity in ('warn', 'warning') then
    v_severity := 'warning';
  elsif v_severity not in ('info', 'warning', 'error') then
    v_severity := 'info';
  end if;

  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'p_metadata must be a json object';
  end if;

  if nullif(trim(coalesce(p_legacy_tenant_id, '')), '') is not null then
    v_runtime_tenant_id := private.runtime_tenant_id_by_legacy_tenant_id(p_legacy_tenant_id);
  end if;

  if v_runtime_tenant_id is null and nullif(trim(coalesce(p_document_id, '')), '') is not null then
    select patient_documents.tenant_id,
      patient_documents.id,
      patient_documents.patient_id,
      patient_documents.unit_id
    into v_runtime_tenant_id,
      v_runtime_document_id,
      v_runtime_patient_id,
      v_runtime_unit_id
    from docs.patient_documents as patient_documents
    where patient_documents.deleted_at is null
      and (
        patient_documents.id = private.try_uuid(p_document_id)
        or patient_documents.legacy_patient_document_id = nullif(trim(coalesce(p_document_id, '')), '')
      )
    limit 1;
  end if;

  if v_runtime_tenant_id is null
    and nullif(trim(coalesce(p_signature_request_id, '')), '') is not null then
    select patient_documents.tenant_id,
      patient_documents.id,
      patient_documents.patient_id,
      patient_documents.unit_id,
      signature_requests.id
    into v_runtime_tenant_id,
      v_runtime_document_id,
      v_runtime_patient_id,
      v_runtime_unit_id,
      v_signature_request_id
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

  if v_runtime_tenant_id is null
    and nullif(trim(coalesce(p_external_request_id, '')), '') is not null then
    select patient_documents.tenant_id,
      patient_documents.id,
      patient_documents.patient_id,
      patient_documents.unit_id,
      signature_requests.id
    into v_runtime_tenant_id,
      v_runtime_document_id,
      v_runtime_patient_id,
      v_runtime_unit_id,
      v_signature_request_id
    from docs.signature_requests as signature_requests
    inner join docs.patient_documents as patient_documents
      on patient_documents.id = signature_requests.patient_document_id
    where patient_documents.deleted_at is null
      and signature_requests.external_request_id = nullif(trim(coalesce(p_external_request_id, '')), '')
    limit 1;
  end if;

  if v_runtime_tenant_id is not null
    and nullif(trim(coalesce(p_legacy_unit_id, '')), '') is not null then
    v_runtime_unit_id := coalesce(
      private.runtime_unit_id_by_legacy_unit_id(v_runtime_tenant_id, p_legacy_unit_id),
      v_runtime_unit_id
    );
  end if;

  if v_runtime_document_id is null
    and v_runtime_tenant_id is not null
    and nullif(trim(coalesce(p_document_id, '')), '') is not null then
    v_runtime_document_id := private.runtime_patient_document_id_by_public_id(
      v_runtime_tenant_id,
      p_document_id
    );
  end if;

  if v_signature_request_id is null
    and v_runtime_tenant_id is not null
    and nullif(trim(coalesce(p_signature_request_id, '')), '') is not null then
    v_signature_request_id := private.runtime_signature_request_id_by_public_id(
      v_runtime_tenant_id,
      p_signature_request_id
    );
  end if;

  if v_signature_request_id is null
    and nullif(trim(coalesce(p_external_request_id, '')), '') is not null then
    select signature_requests.id
    into v_signature_request_id
    from docs.signature_requests as signature_requests
    where signature_requests.external_request_id = nullif(trim(coalesce(p_external_request_id, '')), '')
    limit 1;
  end if;

  if v_signature_request_id is not null
    and (v_runtime_document_id is null or v_runtime_patient_id is null or v_runtime_unit_id is null) then
    select patient_documents.id,
      patient_documents.patient_id,
      patient_documents.unit_id,
      patient_documents.tenant_id
    into v_runtime_document_id,
      v_runtime_patient_id,
      v_runtime_unit_id,
      v_runtime_tenant_id
    from docs.signature_requests as signature_requests
    inner join docs.patient_documents as patient_documents
      on patient_documents.id = signature_requests.patient_document_id
    where signature_requests.id = v_signature_request_id
      and patient_documents.deleted_at is null
    limit 1;
  end if;

  if v_runtime_document_id is not null
    and (v_runtime_patient_id is null or v_runtime_unit_id is null or v_runtime_tenant_id is null) then
    select patient_documents.patient_id,
      patient_documents.unit_id,
      patient_documents.tenant_id
    into v_runtime_patient_id,
      v_runtime_unit_id,
      v_runtime_tenant_id
    from docs.patient_documents as patient_documents
    where patient_documents.id = v_runtime_document_id
      and patient_documents.deleted_at is null
    limit 1;
  end if;

  insert into docs.document_operational_events (
    tenant_id,
    unit_id,
    patient_id,
    patient_document_id,
    signature_request_id,
    event_category,
    event_type,
    severity,
    provider_code,
    provider_mode,
    status,
    error_code,
    error_message,
    correlation_id,
    idempotency_key,
    provider_event_hash,
    raw_event_hash,
    metadata,
    occurred_at
  )
  values (
    v_runtime_tenant_id,
    v_runtime_unit_id,
    v_runtime_patient_id,
    v_runtime_document_id,
    v_signature_request_id,
    v_category,
    nullif(trim(coalesce(p_event_type, '')), ''),
    v_severity,
    lower(nullif(trim(coalesce(p_provider, '')), '')),
    lower(nullif(trim(coalesce(p_provider_mode, '')), '')),
    lower(nullif(trim(coalesce(p_status, '')), '')),
    lower(nullif(trim(coalesce(p_error_code, '')), '')),
    private.document_ops_safe_text(p_error_message),
    private.try_uuid(p_correlation_id),
    nullif(trim(coalesce(p_idempotency_key, '')), ''),
    nullif(trim(coalesce(p_provider_event_hash, '')), ''),
    nullif(trim(coalesce(p_raw_event_hash, '')), ''),
    private.document_ops_safe_metadata(p_metadata),
    coalesce(p_occurred_at, now())
  )
  returning id
  into v_event_id;

  return jsonb_build_object('id', v_event_id::text, 'recorded', true);
end;
$$;

create or replace function api.get_document_operational_health(
  p_legacy_tenant_id text,
  p_legacy_unit_id text default null,
  p_period_from timestamptz default null,
  p_period_to timestamptz default null,
  p_provider text default null,
  p_status text default null,
  p_limit integer default 25
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
  v_period_to timestamptz := coalesce(p_period_to, now());
  v_period_from timestamptz := coalesce(p_period_from, coalesce(p_period_to, now()) - interval '24 hours');
  v_provider text := lower(nullif(trim(coalesce(p_provider, '')), ''));
  v_status text := lower(nullif(trim(coalesce(p_status, '')), ''));
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_dispatch_failed_count integer := 0;
  v_hmac_failure_count integer := 0;
  v_duplicate_count integer := 0;
  v_package_failure_count integer := 0;
  v_evidence_pending_count integer := 0;
  v_provider_config_missing_count integer := 0;
  v_latest_dispatches jsonb := '[]'::jsonb;
  v_latest_webhooks jsonb := '[]'::jsonb;
  v_recent_failures jsonb := '[]'::jsonb;
  v_overall_status text := 'ok';
begin
  if nullif(trim(coalesce(p_legacy_tenant_id, '')), '') is null then
    raise exception 'p_legacy_tenant_id is required';
  end if;

  if v_period_from > v_period_to then
    raise exception 'p_period_from must be before p_period_to';
  end if;

  if v_status = 'all' then
    v_status := null;
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

  if coalesce(auth.role(), '') <> 'service_role'
    and not private.can_read_clinical_domain(v_runtime_tenant_id, v_runtime_unit_id) then
    raise exception 'get document operational health denied';
  end if;

  select count(*)
  into v_dispatch_failed_count
  from docs.signature_dispatch_attempts as dispatch_attempts
  inner join docs.patient_documents as patient_documents
    on patient_documents.id = dispatch_attempts.patient_document_id
  where dispatch_attempts.tenant_id = v_runtime_tenant_id
    and dispatch_attempts.attempted_at >= v_period_from
    and dispatch_attempts.attempted_at <= v_period_to
    and dispatch_attempts.dispatch_status = 'failed'
    and (v_provider is null or lower(dispatch_attempts.provider_code) = v_provider)
    and (
      v_runtime_unit_id is null
      or patient_documents.unit_id is null
      or patient_documents.unit_id = v_runtime_unit_id
    );

  select count(*)
  into v_provider_config_missing_count
  from docs.signature_dispatch_attempts as dispatch_attempts
  inner join docs.patient_documents as patient_documents
    on patient_documents.id = dispatch_attempts.patient_document_id
  where dispatch_attempts.tenant_id = v_runtime_tenant_id
    and dispatch_attempts.attempted_at >= v_period_from
    and dispatch_attempts.attempted_at <= v_period_to
    and (
      dispatch_attempts.error_message = 'provider_config_missing'
      or dispatch_attempts.response_payload ->> 'providerStatus' = 'provider_config_missing'
      or dispatch_attempts.metadata ->> 'providerStatus' = 'provider_config_missing'
    )
    and (v_provider is null or lower(dispatch_attempts.provider_code) = v_provider)
    and (
      v_runtime_unit_id is null
      or patient_documents.unit_id is null
      or patient_documents.unit_id = v_runtime_unit_id
    );

  select count(*)
  into v_hmac_failure_count
  from (
    select operational_events.id::text
    from docs.document_operational_events as operational_events
    where operational_events.tenant_id = v_runtime_tenant_id
      and operational_events.event_type = 'document.signature_webhook_hmac_invalid'
      and operational_events.occurred_at >= v_period_from
      and operational_events.occurred_at <= v_period_to
      and (v_provider is null or lower(operational_events.provider_code) = v_provider)
      and (
        v_runtime_unit_id is null
        or operational_events.unit_id is null
        or operational_events.unit_id = v_runtime_unit_id
      )
    union all
    select signature_events.id::text
    from docs.signature_events as signature_events
    inner join docs.signature_requests as signature_requests
      on signature_requests.id = signature_events.signature_request_id
    inner join docs.patient_documents as patient_documents
      on patient_documents.id = signature_requests.patient_document_id
    where patient_documents.tenant_id = v_runtime_tenant_id
      and coalesce(signature_events.hmac_valid, true) = false
      and signature_events.created_at >= v_period_from
      and signature_events.created_at <= v_period_to
      and (v_provider is null or lower(signature_events.source) = v_provider)
      and (
        v_runtime_unit_id is null
        or patient_documents.unit_id is null
        or patient_documents.unit_id = v_runtime_unit_id
      )
  ) as hmac_failures;

  select count(*)
  into v_duplicate_count
  from docs.document_operational_events as operational_events
  where operational_events.tenant_id = v_runtime_tenant_id
    and operational_events.event_type = 'document.signature_webhook_duplicate'
    and operational_events.occurred_at >= v_period_from
    and operational_events.occurred_at <= v_period_to
    and (v_provider is null or lower(operational_events.provider_code) = v_provider)
    and (
      v_runtime_unit_id is null
      or operational_events.unit_id is null
      or operational_events.unit_id = v_runtime_unit_id
    );

  select count(*)
  into v_package_failure_count
  from (
    select evidence_packages.id::text
    from docs.document_legal_evidence_packages as evidence_packages
    where evidence_packages.tenant_id = v_runtime_tenant_id
      and evidence_packages.package_status = 'failed'
      and coalesce(evidence_packages.failed_at, evidence_packages.updated_at, evidence_packages.created_at) >= v_period_from
      and coalesce(evidence_packages.failed_at, evidence_packages.updated_at, evidence_packages.created_at) <= v_period_to
      and (
        v_runtime_unit_id is null
        or evidence_packages.unit_id is null
        or evidence_packages.unit_id = v_runtime_unit_id
      )
    union all
    select printable_artifacts.id::text
    from docs.printable_artifacts as printable_artifacts
    inner join docs.patient_documents as patient_documents
      on patient_documents.id = printable_artifacts.patient_document_id
    where printable_artifacts.tenant_id = v_runtime_tenant_id
      and printable_artifacts.artifact_kind = 'print_package'
      and printable_artifacts.render_status = 'failed'
      and coalesce(printable_artifacts.rendered_at, printable_artifacts.updated_at, printable_artifacts.created_at) >= v_period_from
      and coalesce(printable_artifacts.rendered_at, printable_artifacts.updated_at, printable_artifacts.created_at) <= v_period_to
      and (
        v_runtime_unit_id is null
        or patient_documents.unit_id is null
        or patient_documents.unit_id = v_runtime_unit_id
      )
  ) as package_failures;

  select count(*)
  into v_evidence_pending_count
  from docs.document_legal_evidence as evidence
  where evidence.tenant_id = v_runtime_tenant_id
    and coalesce(evidence.updated_at, evidence.consolidated_at, evidence.created_at) >= v_period_from
    and coalesce(evidence.updated_at, evidence.consolidated_at, evidence.created_at) <= v_period_to
    and evidence.evidence_status <> 'superseded'
    and (
      evidence.evidence_status in ('partial', 'failed')
      or evidence.verification_status = 'pending'
    )
    and (v_provider is null or lower(evidence.provider_code) = v_provider)
    and (
      v_runtime_unit_id is null
      or evidence.unit_id is null
      or evidence.unit_id = v_runtime_unit_id
    );

  select coalesce(jsonb_agg(dispatch_payload order by dispatch_occurred_at desc), '[]'::jsonb)
  into v_latest_dispatches
  from (
    select
      dispatch_attempts.attempted_at as dispatch_occurred_at,
      jsonb_strip_nulls(
        jsonb_build_object(
          'id', dispatch_attempts.id::text,
          'documentId', coalesce(patient_documents.legacy_patient_document_id, patient_documents.id::text),
          'runtimeDocumentId', patient_documents.id::text,
          'signatureRequestId', coalesce(signature_requests.legacy_signature_request_id, signature_requests.id::text),
          'runtimeSignatureRequestId', signature_requests.id::text,
          'patient', jsonb_build_object(
            'id', coalesce(patients.legacy_patient_id, patients.id::text),
            'runtimeId', patients.id::text,
            'name', patients.full_name
          ),
          'providerCode', dispatch_attempts.provider_code,
          'providerMode', dispatch_attempts.provider_mode,
          'dispatchStatus', dispatch_attempts.dispatch_status,
          'providerStatus', coalesce(
            dispatch_attempts.metadata ->> 'providerStatus',
            dispatch_attempts.response_payload ->> 'providerStatus'
          ),
          'externalRequestId', dispatch_attempts.external_request_id,
          'attemptedAt', dispatch_attempts.attempted_at,
          'completedAt', dispatch_attempts.completed_at,
          'errorMessage', private.document_ops_safe_text(dispatch_attempts.error_message)
        )
      ) as dispatch_payload
    from docs.signature_dispatch_attempts as dispatch_attempts
    inner join docs.signature_requests as signature_requests
      on signature_requests.id = dispatch_attempts.signature_request_id
    inner join docs.patient_documents as patient_documents
      on patient_documents.id = dispatch_attempts.patient_document_id
    inner join patients.patients as patients
      on patients.id = dispatch_attempts.patient_id
    where dispatch_attempts.tenant_id = v_runtime_tenant_id
      and dispatch_attempts.attempted_at >= v_period_from
      and dispatch_attempts.attempted_at <= v_period_to
      and (v_provider is null or lower(dispatch_attempts.provider_code) = v_provider)
      and (
        v_runtime_unit_id is null
        or patient_documents.unit_id is null
        or patient_documents.unit_id = v_runtime_unit_id
      )
    order by dispatch_attempts.attempted_at desc, dispatch_attempts.created_at desc
    limit v_limit
  ) as latest_dispatches;

  select coalesce(jsonb_agg(webhook_payload order by webhook_occurred_at desc), '[]'::jsonb)
  into v_latest_webhooks
  from (
    select
      coalesce(signature_events.event_at, signature_events.created_at) as webhook_occurred_at,
      jsonb_strip_nulls(
        jsonb_build_object(
          'id', signature_events.id::text,
          'documentId', coalesce(patient_documents.legacy_patient_document_id, patient_documents.id::text),
          'runtimeDocumentId', patient_documents.id::text,
          'signatureRequestId', coalesce(signature_requests.legacy_signature_request_id, signature_requests.id::text),
          'runtimeSignatureRequestId', signature_requests.id::text,
          'patient', jsonb_build_object(
            'id', coalesce(patients.legacy_patient_id, patients.id::text),
            'runtimeId', patients.id::text,
            'name', patients.full_name
          ),
          'eventType', signature_events.event_type,
          'source', signature_events.source,
          'externalEventId', signature_events.external_event_id,
          'providerMode', signature_events.provider_mode,
          'providerEventHash', signature_events.provider_event_hash,
          'rawEventHash', signature_events.raw_event_hash,
          'hmacStrategy', signature_events.hmac_strategy,
          'hmacValid', signature_events.hmac_valid,
          'verificationStatus', signature_events.verification_status,
          'eventAt', signature_events.event_at,
          'createdAt', signature_events.created_at
        )
      ) as webhook_payload
    from docs.signature_events as signature_events
    inner join docs.signature_requests as signature_requests
      on signature_requests.id = signature_events.signature_request_id
    inner join docs.patient_documents as patient_documents
      on patient_documents.id = signature_requests.patient_document_id
    inner join patients.patients as patients
      on patients.id = patient_documents.patient_id
    where patient_documents.tenant_id = v_runtime_tenant_id
      and coalesce(signature_events.event_at, signature_events.created_at) >= v_period_from
      and coalesce(signature_events.event_at, signature_events.created_at) <= v_period_to
      and (v_provider is null or lower(signature_events.source) = v_provider)
      and lower(signature_events.source) not in ('internal', 'runtime_api')
      and (
        v_runtime_unit_id is null
        or patient_documents.unit_id is null
        or patient_documents.unit_id = v_runtime_unit_id
      )
    order by coalesce(signature_events.event_at, signature_events.created_at) desc,
      signature_events.created_at desc
    limit v_limit
  ) as latest_webhooks;

  select coalesce(jsonb_agg(failure_payload order by failure_occurred_at desc), '[]'::jsonb)
  into v_recent_failures
  from (
    select *
    from (
      select
        dispatch_attempts.attempted_at as failure_occurred_at,
        case
          when dispatch_attempts.error_message = 'provider_config_missing'
            or dispatch_attempts.response_payload ->> 'providerStatus' = 'provider_config_missing'
            or dispatch_attempts.metadata ->> 'providerStatus' = 'provider_config_missing'
          then 'warning'
          when dispatch_attempts.dispatch_status = 'failed' then 'failure'
          when dispatch_attempts.dispatch_status = 'pending' then 'pending'
          else 'warning'
        end as health_status,
        jsonb_strip_nulls(
          jsonb_build_object(
            'id', dispatch_attempts.id::text,
            'category', 'dispatch',
            'status', case
              when dispatch_attempts.error_message = 'provider_config_missing'
                or dispatch_attempts.response_payload ->> 'providerStatus' = 'provider_config_missing'
                or dispatch_attempts.metadata ->> 'providerStatus' = 'provider_config_missing'
              then 'provider_config_missing'
              else dispatch_attempts.dispatch_status
            end,
            'healthStatus', case
              when dispatch_attempts.error_message = 'provider_config_missing'
                or dispatch_attempts.response_payload ->> 'providerStatus' = 'provider_config_missing'
                or dispatch_attempts.metadata ->> 'providerStatus' = 'provider_config_missing'
              then 'warning'
              when dispatch_attempts.dispatch_status = 'failed' then 'failure'
              when dispatch_attempts.dispatch_status = 'pending' then 'pending'
              else 'warning'
            end,
            'documentId', coalesce(patient_documents.legacy_patient_document_id, patient_documents.id::text),
            'runtimeDocumentId', patient_documents.id::text,
            'patientName', patients.full_name,
            'providerCode', dispatch_attempts.provider_code,
            'providerMode', dispatch_attempts.provider_mode,
            'message', private.document_ops_safe_text(dispatch_attempts.error_message),
            'occurredAt', dispatch_attempts.attempted_at
          )
        ) as failure_payload
      from docs.signature_dispatch_attempts as dispatch_attempts
      inner join docs.patient_documents as patient_documents
        on patient_documents.id = dispatch_attempts.patient_document_id
      inner join patients.patients as patients
        on patients.id = dispatch_attempts.patient_id
      where dispatch_attempts.tenant_id = v_runtime_tenant_id
        and dispatch_attempts.attempted_at >= v_period_from
        and dispatch_attempts.attempted_at <= v_period_to
        and dispatch_attempts.dispatch_status in ('failed', 'skipped', 'pending')
        and (
          dispatch_attempts.dispatch_status = 'failed'
          or dispatch_attempts.error_message is not null
          or dispatch_attempts.response_payload ->> 'providerStatus' = 'provider_config_missing'
          or dispatch_attempts.metadata ->> 'providerStatus' = 'provider_config_missing'
        )
        and (v_provider is null or lower(dispatch_attempts.provider_code) = v_provider)
        and (
          v_runtime_unit_id is null
          or patient_documents.unit_id is null
          or patient_documents.unit_id = v_runtime_unit_id
        )
      union all
      select
        operational_events.occurred_at as failure_occurred_at,
        case
          when operational_events.severity = 'error' then 'failure'
          when operational_events.status = 'duplicate' then 'warning'
          else operational_events.severity
        end as health_status,
        jsonb_strip_nulls(
          jsonb_build_object(
            'id', operational_events.id::text,
            'category', operational_events.event_category,
            'eventType', operational_events.event_type,
            'status', coalesce(operational_events.status, operational_events.error_code),
            'healthStatus', case
              when operational_events.severity = 'error' then 'failure'
              when operational_events.status = 'duplicate' then 'warning'
              else operational_events.severity
            end,
            'documentId', coalesce(patient_documents.legacy_patient_document_id, patient_documents.id::text),
            'runtimeDocumentId', patient_documents.id::text,
            'patientName', patients.full_name,
            'providerCode', operational_events.provider_code,
            'providerMode', operational_events.provider_mode,
            'message', private.document_ops_safe_text(
              coalesce(operational_events.error_message, operational_events.error_code, operational_events.event_type)
            ),
            'occurredAt', operational_events.occurred_at,
            'correlationId', operational_events.correlation_id::text
          )
        ) as failure_payload
      from docs.document_operational_events as operational_events
      left join docs.patient_documents as patient_documents
        on patient_documents.id = operational_events.patient_document_id
      left join patients.patients as patients
        on patients.id = operational_events.patient_id
      where operational_events.tenant_id = v_runtime_tenant_id
        and operational_events.occurred_at >= v_period_from
        and operational_events.occurred_at <= v_period_to
        and operational_events.event_type in (
          'document.signature_webhook_hmac_invalid',
          'document.signature_webhook_duplicate',
          'document.signature_webhook_consume_failed'
        )
        and (v_provider is null or lower(operational_events.provider_code) = v_provider)
        and (
          v_runtime_unit_id is null
          or operational_events.unit_id is null
          or operational_events.unit_id = v_runtime_unit_id
        )
      union all
      select
        coalesce(evidence_packages.failed_at, evidence_packages.updated_at, evidence_packages.created_at) as failure_occurred_at,
        'failure' as health_status,
        jsonb_strip_nulls(
          jsonb_build_object(
            'id', evidence_packages.id::text,
            'category', 'package',
            'status', evidence_packages.package_status,
            'healthStatus', 'failure',
            'documentId', coalesce(patient_documents.legacy_patient_document_id, patient_documents.id::text),
            'runtimeDocumentId', patient_documents.id::text,
            'patientName', patients.full_name,
            'message', private.document_ops_safe_text(evidence_packages.failure_reason),
            'occurredAt', coalesce(evidence_packages.failed_at, evidence_packages.updated_at, evidence_packages.created_at)
          )
        ) as failure_payload
      from docs.document_legal_evidence_packages as evidence_packages
      inner join docs.patient_documents as patient_documents
        on patient_documents.id = evidence_packages.patient_document_id
      inner join patients.patients as patients
        on patients.id = evidence_packages.patient_id
      where evidence_packages.tenant_id = v_runtime_tenant_id
        and evidence_packages.package_status = 'failed'
        and coalesce(evidence_packages.failed_at, evidence_packages.updated_at, evidence_packages.created_at) >= v_period_from
        and coalesce(evidence_packages.failed_at, evidence_packages.updated_at, evidence_packages.created_at) <= v_period_to
        and (
          v_runtime_unit_id is null
          or evidence_packages.unit_id is null
          or evidence_packages.unit_id = v_runtime_unit_id
        )
      union all
      select
        coalesce(printable_artifacts.rendered_at, printable_artifacts.updated_at, printable_artifacts.created_at) as failure_occurred_at,
        'failure' as health_status,
        jsonb_strip_nulls(
          jsonb_build_object(
            'id', printable_artifacts.id::text,
            'category', 'package',
            'status', printable_artifacts.render_status,
            'healthStatus', 'failure',
            'documentId', coalesce(patient_documents.legacy_patient_document_id, patient_documents.id::text),
            'runtimeDocumentId', patient_documents.id::text,
            'patientName', patients.full_name,
            'message', private.document_ops_safe_text(printable_artifacts.failure_reason),
            'occurredAt', coalesce(printable_artifacts.rendered_at, printable_artifacts.updated_at, printable_artifacts.created_at)
          )
        ) as failure_payload
      from docs.printable_artifacts as printable_artifacts
      inner join docs.patient_documents as patient_documents
        on patient_documents.id = printable_artifacts.patient_document_id
      inner join patients.patients as patients
        on patients.id = patient_documents.patient_id
      where printable_artifacts.tenant_id = v_runtime_tenant_id
        and printable_artifacts.artifact_kind = 'print_package'
        and printable_artifacts.render_status = 'failed'
        and coalesce(printable_artifacts.rendered_at, printable_artifacts.updated_at, printable_artifacts.created_at) >= v_period_from
        and coalesce(printable_artifacts.rendered_at, printable_artifacts.updated_at, printable_artifacts.created_at) <= v_period_to
        and (
          v_runtime_unit_id is null
          or patient_documents.unit_id is null
          or patient_documents.unit_id = v_runtime_unit_id
        )
      union all
      select
        coalesce(evidence.updated_at, evidence.consolidated_at, evidence.created_at) as failure_occurred_at,
        case when evidence.evidence_status = 'failed' then 'failure' else 'pending' end as health_status,
        jsonb_strip_nulls(
          jsonb_build_object(
            'id', evidence.id::text,
            'category', 'evidence',
            'status', evidence.evidence_status,
            'verificationStatus', evidence.verification_status,
            'healthStatus', case when evidence.evidence_status = 'failed' then 'failure' else 'pending' end,
            'documentId', coalesce(patient_documents.legacy_patient_document_id, patient_documents.id::text),
            'runtimeDocumentId', patient_documents.id::text,
            'patientName', patients.full_name,
            'providerCode', evidence.provider_code,
            'providerMode', evidence.provider_mode,
            'message', private.document_ops_safe_text(evidence.failure_reason),
            'occurredAt', coalesce(evidence.updated_at, evidence.consolidated_at, evidence.created_at)
          )
        ) as failure_payload
      from docs.document_legal_evidence as evidence
      inner join docs.patient_documents as patient_documents
        on patient_documents.id = evidence.patient_document_id
      inner join patients.patients as patients
        on patients.id = evidence.patient_id
      where evidence.tenant_id = v_runtime_tenant_id
        and evidence.evidence_status <> 'superseded'
        and (
          evidence.evidence_status in ('partial', 'failed')
          or evidence.verification_status = 'pending'
        )
        and coalesce(evidence.updated_at, evidence.consolidated_at, evidence.created_at) >= v_period_from
        and coalesce(evidence.updated_at, evidence.consolidated_at, evidence.created_at) <= v_period_to
        and (v_provider is null or lower(evidence.provider_code) = v_provider)
        and (
          v_runtime_unit_id is null
          or evidence.unit_id is null
          or evidence.unit_id = v_runtime_unit_id
        )
    ) as failures
    where v_status is null or health_status = v_status
    order by failure_occurred_at desc
    limit v_limit
  ) as limited_failures;

  if v_dispatch_failed_count > 0 or v_hmac_failure_count > 0 or v_package_failure_count > 0 then
    v_overall_status := 'failure';
  elsif v_provider_config_missing_count > 0 or v_duplicate_count > 0 or v_evidence_pending_count > 0 then
    v_overall_status := 'warning';
  else
    v_overall_status := 'ok';
  end if;

  return jsonb_build_object(
    'generatedAt', now(),
    'overallStatus', v_overall_status,
    'period', jsonb_build_object(
      'from', v_period_from,
      'to', v_period_to
    ),
    'filters', jsonb_build_object(
      'provider', v_provider,
      'status', v_status,
      'limit', v_limit
    ),
    'summary', jsonb_build_array(
      jsonb_build_object(
        'key', 'dispatch_failed',
        'label', 'Dispatch com falha',
        'count', v_dispatch_failed_count,
        'status', case when v_dispatch_failed_count > 0 then 'failure' else 'ok' end
      ),
      jsonb_build_object(
        'key', 'webhook_hmac_failed',
        'label', 'HMAC invalido',
        'count', v_hmac_failure_count,
        'status', case when v_hmac_failure_count > 0 then 'failure' else 'ok' end
      ),
      jsonb_build_object(
        'key', 'webhook_duplicate',
        'label', 'Webhooks duplicados',
        'count', v_duplicate_count,
        'status', case when v_duplicate_count > 0 then 'warning' else 'ok' end
      ),
      jsonb_build_object(
        'key', 'package_failed',
        'label', 'Pacotes com falha',
        'count', v_package_failure_count,
        'status', case when v_package_failure_count > 0 then 'failure' else 'ok' end
      ),
      jsonb_build_object(
        'key', 'evidence_pending',
        'label', 'Evidencias pendentes',
        'count', v_evidence_pending_count,
        'status', case when v_evidence_pending_count > 0 then 'pending' else 'ok' end
      ),
      jsonb_build_object(
        'key', 'provider_config_missing',
        'label', 'Provider sem configuracao',
        'count', v_provider_config_missing_count,
        'status', case when v_provider_config_missing_count > 0 then 'warning' else 'ok' end
      )
    ),
    'counts', jsonb_build_object(
      'dispatchFailed', v_dispatch_failed_count,
      'webhookHmacFailed', v_hmac_failure_count,
      'webhookDuplicate', v_duplicate_count,
      'packageFailed', v_package_failure_count,
      'evidencePending', v_evidence_pending_count,
      'providerConfigMissing', v_provider_config_missing_count
    ),
    'latestDispatches', v_latest_dispatches,
    'latestWebhooks', v_latest_webhooks,
    'recentFailures', v_recent_failures
  );
end;
$$;

create or replace function public.record_document_operational_event(
  p_event_category text,
  p_event_type text,
  p_legacy_tenant_id text default null,
  p_legacy_unit_id text default null,
  p_document_id text default null,
  p_signature_request_id text default null,
  p_external_request_id text default null,
  p_severity text default 'info',
  p_provider text default null,
  p_provider_mode text default null,
  p_status text default null,
  p_error_code text default null,
  p_error_message text default null,
  p_correlation_id text default null,
  p_idempotency_key text default null,
  p_provider_event_hash text default null,
  p_raw_event_hash text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default now()
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select api.record_document_operational_event(
    p_event_category,
    p_event_type,
    p_legacy_tenant_id,
    p_legacy_unit_id,
    p_document_id,
    p_signature_request_id,
    p_external_request_id,
    p_severity,
    p_provider,
    p_provider_mode,
    p_status,
    p_error_code,
    p_error_message,
    p_correlation_id,
    p_idempotency_key,
    p_provider_event_hash,
    p_raw_event_hash,
    p_metadata,
    p_occurred_at
  )
$$;

create or replace function public.get_document_operational_health(
  p_legacy_tenant_id text,
  p_legacy_unit_id text default null,
  p_period_from timestamptz default null,
  p_period_to timestamptz default null,
  p_provider text default null,
  p_status text default null,
  p_limit integer default 25
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select api.get_document_operational_health(
    p_legacy_tenant_id,
    p_legacy_unit_id,
    p_period_from,
    p_period_to,
    p_provider,
    p_status,
    p_limit
  )
$$;

alter function private.document_ops_safe_text(text)
  security definer;
alter function private.document_ops_safe_text(text)
  set search_path = '';
alter function private.document_ops_safe_metadata(jsonb)
  security definer;
alter function private.document_ops_safe_metadata(jsonb)
  set search_path = '';
alter function api.record_document_operational_event(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb, timestamptz)
  security definer;
alter function api.record_document_operational_event(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb, timestamptz)
  set search_path = '';
alter function api.get_document_operational_health(text, text, timestamptz, timestamptz, text, text, integer)
  security definer;
alter function api.get_document_operational_health(text, text, timestamptz, timestamptz, text, text, integer)
  set search_path = '';
alter function public.record_document_operational_event(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb, timestamptz)
  security invoker;
alter function public.record_document_operational_event(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb, timestamptz)
  set search_path = '';
alter function public.get_document_operational_health(text, text, timestamptz, timestamptz, text, text, integer)
  security invoker;
alter function public.get_document_operational_health(text, text, timestamptz, timestamptz, text, text, integer)
  set search_path = '';

revoke all on function private.document_ops_safe_text(text)
  from public, anon, authenticated;
revoke all on function private.document_ops_safe_metadata(jsonb)
  from public, anon, authenticated;
revoke all on function api.record_document_operational_event(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb, timestamptz)
  from public, anon, authenticated;
revoke all on function api.get_document_operational_health(text, text, timestamptz, timestamptz, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.record_document_operational_event(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb, timestamptz)
  from public, anon, authenticated;
revoke all on function public.get_document_operational_health(text, text, timestamptz, timestamptz, text, text, integer)
  from public, anon, authenticated;

grant execute on function private.document_ops_safe_text(text)
  to service_role;
grant execute on function private.document_ops_safe_metadata(jsonb)
  to service_role;
grant execute on function api.record_document_operational_event(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb, timestamptz)
  to service_role;
grant execute on function api.get_document_operational_health(text, text, timestamptz, timestamptz, text, text, integer)
  to service_role;
grant execute on function public.record_document_operational_event(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb, timestamptz)
  to service_role;
grant execute on function public.get_document_operational_health(text, text, timestamptz, timestamptz, text, text, integer)
  to service_role;
