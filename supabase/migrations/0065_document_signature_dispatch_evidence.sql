create table if not exists docs.signature_dispatch_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants (id) on delete cascade,
  signature_request_id uuid not null references docs.signature_requests (id) on delete cascade,
  patient_document_id uuid not null references docs.patient_documents (id) on delete cascade,
  patient_id uuid not null references patients.patients (id) on delete cascade,
  provider_code text not null,
  dispatch_status text not null default 'pending' check (
    dispatch_status in ('pending', 'sent', 'failed', 'skipped')
  ),
  external_request_id text,
  idempotency_key text,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  error_message text,
  attempted_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_docs_signature_dispatch_attempts_idempotency
  on docs.signature_dispatch_attempts (provider_code, idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_docs_signature_dispatch_attempts_request_attempted
  on docs.signature_dispatch_attempts (signature_request_id, attempted_at desc);

create index if not exists idx_docs_signature_dispatch_attempts_status_attempted
  on docs.signature_dispatch_attempts (tenant_id, dispatch_status, attempted_at desc);

drop trigger if exists set_docs_signature_dispatch_attempts_updated_at on docs.signature_dispatch_attempts;
create trigger set_docs_signature_dispatch_attempts_updated_at
before update on docs.signature_dispatch_attempts
for each row execute function private.set_current_timestamp_updated_at();

grant select, insert, update, delete on table docs.signature_dispatch_attempts to authenticated, service_role;

alter table docs.signature_dispatch_attempts enable row level security;

drop policy if exists signature_dispatch_attempts_select_current_scope on docs.signature_dispatch_attempts;
create policy signature_dispatch_attempts_select_current_scope
on docs.signature_dispatch_attempts
for select
to authenticated
using (
  exists (
    select 1
    from docs.patient_documents as patient_documents
    where patient_documents.id = signature_dispatch_attempts.patient_document_id
      and private.can_read_clinical_domain(patient_documents.tenant_id, patient_documents.unit_id)
      and private.can_access_patient(patient_documents.patient_id)
  )
);

drop policy if exists signature_dispatch_attempts_manage_current_scope on docs.signature_dispatch_attempts;
create policy signature_dispatch_attempts_manage_current_scope
on docs.signature_dispatch_attempts
for all
to authenticated
using (
  exists (
    select 1
    from docs.patient_documents as patient_documents
    where patient_documents.id = signature_dispatch_attempts.patient_document_id
      and private.can_manage_clinical_domain(patient_documents.tenant_id, patient_documents.unit_id)
      and private.can_access_patient(patient_documents.patient_id)
  )
)
with check (
  exists (
    select 1
    from docs.patient_documents as patient_documents
    where patient_documents.id = signature_dispatch_attempts.patient_document_id
      and private.can_manage_clinical_domain(patient_documents.tenant_id, patient_documents.unit_id)
      and private.can_access_patient(patient_documents.patient_id)
  )
);

create or replace function api.record_document_signature_dispatch(
  p_legacy_tenant_id text,
  p_document_id text,
  p_signature_request_id text,
  p_legacy_unit_id text default null,
  p_provider text default null,
  p_dispatch_status text default 'sent',
  p_external_request_id text default null,
  p_idempotency_key text default null,
  p_request_payload jsonb default '{}'::jsonb,
  p_response_payload jsonb default '{}'::jsonb,
  p_error_message text default null,
  p_completed_at timestamptz default now(),
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
  v_runtime_document_version_id uuid;
  v_signature_request_id uuid;
  v_provider text := lower(coalesce(nullif(trim(coalesce(p_provider, '')), ''), 'mock'));
  v_dispatch_status text := lower(coalesce(nullif(trim(coalesce(p_dispatch_status, '')), ''), 'sent'));
  v_external_request_id text := nullif(trim(coalesce(p_external_request_id, '')), '');
  v_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  v_completed_at timestamptz := coalesce(p_completed_at, now());
  v_request_payload jsonb := coalesce(p_request_payload, '{}'::jsonb);
  v_response_payload jsonb := coalesce(p_response_payload, '{}'::jsonb);
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_dispatch_attempt_id uuid;
begin
  if nullif(trim(coalesce(p_legacy_tenant_id, '')), '') is null then
    raise exception 'p_legacy_tenant_id is required';
  end if;

  if nullif(trim(coalesce(p_document_id, '')), '') is null then
    raise exception 'p_document_id is required';
  end if;

  if nullif(trim(coalesce(p_signature_request_id, '')), '') is null then
    raise exception 'p_signature_request_id is required';
  end if;

  if jsonb_typeof(v_request_payload) <> 'object' then
    raise exception 'p_request_payload must be a json object';
  end if;

  if jsonb_typeof(v_response_payload) <> 'object' then
    raise exception 'p_response_payload must be a json object';
  end if;

  if jsonb_typeof(v_metadata) <> 'object' then
    raise exception 'p_metadata must be a json object';
  end if;

  if v_dispatch_status not in ('pending', 'sent', 'failed', 'skipped') then
    raise exception 'invalid dispatch status %', v_dispatch_status;
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

  v_signature_request_id := private.runtime_signature_request_id_by_public_id(
    v_runtime_tenant_id,
    p_signature_request_id
  );

  if v_signature_request_id is null then
    raise exception 'signature request % not found in current tenant', p_signature_request_id;
  end if;

  select
    patient_documents.unit_id,
    patient_documents.patient_id,
    signature_requests.document_version_id
  into
    v_document_unit_id,
    v_runtime_patient_id,
    v_runtime_document_version_id
  from docs.signature_requests as signature_requests
  inner join docs.patient_documents as patient_documents
    on patient_documents.id = signature_requests.patient_document_id
  where signature_requests.id = v_signature_request_id
    and signature_requests.patient_document_id = v_runtime_document_id
    and patient_documents.deleted_at is null
  limit 1;

  if v_runtime_patient_id is null then
    raise exception 'signature request % does not belong to document %', p_signature_request_id, p_document_id;
  end if;

  if v_runtime_unit_id is not null
    and v_document_unit_id is not null
    and v_document_unit_id <> v_runtime_unit_id then
    raise exception 'document % is outside the current unit scope', p_document_id;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not private.can_manage_clinical_domain(v_runtime_tenant_id, coalesce(v_document_unit_id, v_runtime_unit_id)) then
    raise exception 'record document signature dispatch denied';
  end if;

  insert into docs.signature_dispatch_attempts (
    tenant_id,
    signature_request_id,
    patient_document_id,
    patient_id,
    provider_code,
    dispatch_status,
    external_request_id,
    idempotency_key,
    request_payload,
    response_payload,
    error_message,
    completed_at,
    metadata
  )
  values (
    v_runtime_tenant_id,
    v_signature_request_id,
    v_runtime_document_id,
    v_runtime_patient_id,
    v_provider,
    v_dispatch_status,
    v_external_request_id,
    v_idempotency_key,
    v_request_payload,
    v_response_payload,
    nullif(trim(coalesce(p_error_message, '')), ''),
    v_completed_at,
    v_metadata
  )
  on conflict (provider_code, idempotency_key) where idempotency_key is not null do update
  set
    dispatch_status = excluded.dispatch_status,
    external_request_id = coalesce(excluded.external_request_id, docs.signature_dispatch_attempts.external_request_id),
    request_payload = excluded.request_payload,
    response_payload = excluded.response_payload,
    error_message = excluded.error_message,
    completed_at = excluded.completed_at,
    metadata = docs.signature_dispatch_attempts.metadata || excluded.metadata,
    updated_at = now()
  returning id
  into v_dispatch_attempt_id;

  update docs.signature_requests
  set
    external_request_id = coalesce(v_external_request_id, external_request_id),
    request_status = case
      when v_dispatch_status = 'sent' then 'sent'
      else request_status
    end,
    metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_strip_nulls(
        jsonb_build_object(
          'lastDispatchAttemptId', v_dispatch_attempt_id,
          'lastDispatchProvider', v_provider,
          'lastDispatchStatus', v_dispatch_status,
          'lastDispatchAt', v_completed_at,
          'lastDispatchError', nullif(trim(coalesce(p_error_message, '')), ''),
          'externalRequestId', v_external_request_id
        )
      ),
    updated_at = now()
  where id = v_signature_request_id;

  insert into docs.signature_events (
    signature_request_id,
    external_event_id,
    event_type,
    source,
    event_at,
    payload,
    metadata
  )
  values (
    v_signature_request_id,
    case
      when v_idempotency_key is null then null
      else v_provider || ':dispatch:' || v_idempotency_key
    end,
    'dispatch_' || v_dispatch_status,
    'signature_dispatch',
    v_completed_at,
    jsonb_strip_nulls(
      jsonb_build_object(
        'provider', v_provider,
        'dispatchStatus', v_dispatch_status,
        'externalRequestId', v_external_request_id,
        'errorMessage', nullif(trim(coalesce(p_error_message, '')), ''),
        'requestPayload', v_request_payload,
        'responsePayload', v_response_payload
      )
    ),
    jsonb_strip_nulls(
      jsonb_build_object(
        'dispatchAttemptId', v_dispatch_attempt_id,
        'idempotencyKey', v_idempotency_key
      )
    ) || v_metadata
  )
  on conflict (external_event_id) do update
  set
    event_type = excluded.event_type,
    source = excluded.source,
    event_at = excluded.event_at,
    payload = excluded.payload,
    metadata = excluded.metadata;

  perform private.record_audit_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => v_document_unit_id,
    p_patient_id => v_runtime_patient_id,
    p_actor_type => 'system',
    p_actor_id => null,
    p_event_type => 'docs.signature_dispatch_recorded',
    p_action => 'create',
    p_resource_schema => 'docs',
    p_resource_table => 'signature_dispatch_attempts',
    p_resource_id => v_dispatch_attempt_id,
    p_payload => jsonb_strip_nulls(
      jsonb_build_object(
        'documentId', v_runtime_document_id,
        'documentVersionId', v_runtime_document_version_id,
        'signatureRequestId', v_signature_request_id,
        'provider', v_provider,
        'dispatchStatus', v_dispatch_status,
        'externalRequestId', v_external_request_id,
        'errorMessage', nullif(trim(coalesce(p_error_message, '')), '')
      )
    ) || v_metadata
  );

  if v_dispatch_status = 'sent' then
    perform private.record_patient_timeline_event(
      p_tenant_id => v_runtime_tenant_id,
      p_unit_id => v_document_unit_id,
      p_patient_id => v_runtime_patient_id,
      p_actor_type => 'system',
      p_actor_id => null,
      p_event_type => 'document_signature_sent',
      p_event_at => v_completed_at,
      p_source_schema => 'docs',
      p_source_table => 'signature_dispatch_attempts',
      p_source_id => v_dispatch_attempt_id,
      p_payload => jsonb_strip_nulls(
        jsonb_build_object(
          'documentId', v_runtime_document_id,
          'signatureRequestId', v_signature_request_id,
          'provider', v_provider,
          'externalRequestId', v_external_request_id
        )
      ) || v_metadata
    );
  end if;

  return coalesce(private.patient_document_json(v_runtime_document_id), '{}'::jsonb);
end;
$$;

create or replace function private.patient_document_json(
  p_patient_document_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(
    jsonb_build_object(
      'id', coalesce(patient_documents.legacy_patient_document_id, patient_documents.id::text),
      'runtimeId', patient_documents.id::text,
      'tenantId', patient_documents.tenant_id::text,
      'unitId', patient_documents.unit_id::text,
      'patientId', patient_documents.patient_id::text,
      'documentType', patient_documents.document_type,
      'status', patient_documents.status,
      'title', patient_documents.title,
      'summary', patient_documents.summary,
      'documentNumber', patient_documents.document_number,
      'issuedAt', patient_documents.issued_at,
      'expiresAt', patient_documents.expires_at,
      'signedAt', patient_documents.signed_at,
      'layoutSchema', coalesce(document_versions.metadata -> 'layoutSchema', document_template_versions.render_schema, '{}'::jsonb),
      'tenantBranding', coalesce(document_versions.metadata -> 'tenantBranding', private.document_branding_snapshot(patient_documents.tenant_id)),
      'standardsNotes', coalesce(document_versions.metadata -> 'layoutStandards', private.document_layout_standards_json()),
      'template', case
        when document_templates.id is null then null
        else jsonb_build_object(
          'id', document_templates.id::text,
          'title', document_templates.title,
          'templateKind', document_templates.template_kind,
          'status', document_templates.status
        )
      end,
      'currentVersion', case
        when document_versions.id is null then null
        else jsonb_strip_nulls(
          jsonb_build_object(
            'id', coalesce(document_versions.legacy_document_version_id, document_versions.id::text),
            'runtimeId', document_versions.id::text,
            'versionNumber', document_versions.version_number,
            'status', document_versions.status,
            'title', document_versions.title,
            'summary', document_versions.summary,
            'content', document_versions.content,
            'renderedHtml', document_versions.rendered_html,
            'storageObjectPath', document_versions.storage_object_path,
            'signedStorageObjectPath', document_versions.signed_storage_object_path,
            'issuedAt', document_versions.issued_at,
            'signedAt', document_versions.signed_at,
            'layoutSchema', coalesce(document_versions.metadata -> 'layoutSchema', document_template_versions.render_schema, '{}'::jsonb),
            'tenantBranding', coalesce(document_versions.metadata -> 'tenantBranding', private.document_branding_snapshot(patient_documents.tenant_id))
          )
        )
      end,
      'signatureRequests', coalesce((
        select jsonb_agg(
          jsonb_strip_nulls(
            jsonb_build_object(
              'id', coalesce(signature_requests.legacy_signature_request_id, signature_requests.id::text),
              'runtimeId', signature_requests.id::text,
              'signerType', signature_requests.signer_type,
              'signerName', signature_requests.signer_name,
              'signerEmail', signature_requests.signer_email,
              'providerCode', signature_requests.provider_code,
              'externalRequestId', signature_requests.external_request_id,
              'requestStatus', signature_requests.request_status,
              'requestedAt', signature_requests.requested_at,
              'expiresAt', signature_requests.expires_at,
              'completedAt', signature_requests.completed_at,
              'metadata', signature_requests.metadata,
              'latestDispatch', (
                select jsonb_strip_nulls(
                  jsonb_build_object(
                    'id', signature_dispatch_attempts.id::text,
                    'providerCode', signature_dispatch_attempts.provider_code,
                    'dispatchStatus', signature_dispatch_attempts.dispatch_status,
                    'externalRequestId', signature_dispatch_attempts.external_request_id,
                    'attemptedAt', signature_dispatch_attempts.attempted_at,
                    'completedAt', signature_dispatch_attempts.completed_at,
                    'errorMessage', signature_dispatch_attempts.error_message
                  )
                )
                from docs.signature_dispatch_attempts as signature_dispatch_attempts
                where signature_dispatch_attempts.signature_request_id = signature_requests.id
                order by signature_dispatch_attempts.attempted_at desc, signature_dispatch_attempts.created_at desc
                limit 1
              )
            )
          )
          order by signature_requests.requested_at desc, signature_requests.created_at desc
        )
        from docs.signature_requests as signature_requests
        where signature_requests.patient_document_id = patient_documents.id
      ), '[]'::jsonb),
      'printableArtifacts', coalesce((
        select jsonb_agg(
          jsonb_strip_nulls(
            jsonb_build_object(
              'id', coalesce(printable_artifacts.legacy_printable_artifact_id, printable_artifacts.id::text),
              'runtimeId', printable_artifacts.id::text,
              'artifactKind', printable_artifacts.artifact_kind,
              'renderStatus', printable_artifacts.render_status,
              'storageObjectPath', printable_artifacts.storage_object_path,
              'renderedAt', printable_artifacts.rendered_at,
              'failureReason', printable_artifacts.failure_reason
            )
          )
          order by printable_artifacts.created_at desc
        )
        from docs.printable_artifacts as printable_artifacts
        where printable_artifacts.patient_document_id = patient_documents.id
      ), '[]'::jsonb)
    )
  )
  from docs.patient_documents as patient_documents
  left join docs.document_templates as document_templates
    on document_templates.id = patient_documents.document_template_id
  left join docs.document_template_versions as document_template_versions
    on document_template_versions.id = document_templates.current_version_id
  left join docs.document_versions as document_versions
    on document_versions.id = patient_documents.current_version_id
  where patient_documents.id = p_patient_document_id
    and patient_documents.deleted_at is null
  limit 1
$$;

create or replace function public.record_document_signature_dispatch(
  p_legacy_tenant_id text,
  p_document_id text,
  p_signature_request_id text,
  p_legacy_unit_id text default null,
  p_provider text default null,
  p_dispatch_status text default 'sent',
  p_external_request_id text default null,
  p_idempotency_key text default null,
  p_request_payload jsonb default '{}'::jsonb,
  p_response_payload jsonb default '{}'::jsonb,
  p_error_message text default null,
  p_completed_at timestamptz default now(),
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.record_document_signature_dispatch(
    p_legacy_tenant_id,
    p_document_id,
    p_signature_request_id,
    p_legacy_unit_id,
    p_provider,
    p_dispatch_status,
    p_external_request_id,
    p_idempotency_key,
    p_request_payload,
    p_response_payload,
    p_error_message,
    p_completed_at,
    p_metadata
  )
$$;

revoke all on function api.record_document_signature_dispatch(text, text, text, text, text, text, text, text, jsonb, jsonb, text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.record_document_signature_dispatch(text, text, text, text, text, text, text, text, jsonb, jsonb, text, timestamptz, jsonb) from public, anon, authenticated;

grant execute on function api.record_document_signature_dispatch(text, text, text, text, text, text, text, text, jsonb, jsonb, text, timestamptz, jsonb) to service_role;
grant execute on function public.record_document_signature_dispatch(text, text, text, text, text, text, text, text, jsonb, jsonb, text, timestamptz, jsonb) to service_role;
