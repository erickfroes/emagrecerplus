create or replace function private.runtime_patient_document_id_by_public_id(
  p_runtime_tenant_id uuid,
  p_public_document_id text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select patient_documents.id
  from docs.patient_documents as patient_documents
  where patient_documents.tenant_id = p_runtime_tenant_id
    and patient_documents.deleted_at is null
    and (
      patient_documents.id = private.try_uuid(p_public_document_id)
      or patient_documents.legacy_patient_document_id = nullif(trim(coalesce(p_public_document_id, '')), '')
    )
  limit 1
$$;

create or replace function private.runtime_signature_request_id_by_public_id(
  p_runtime_tenant_id uuid,
  p_public_signature_request_id text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select signature_requests.id
  from docs.signature_requests as signature_requests
  inner join docs.patient_documents as patient_documents
    on patient_documents.id = signature_requests.patient_document_id
  where patient_documents.tenant_id = p_runtime_tenant_id
    and patient_documents.deleted_at is null
    and (
      signature_requests.id = private.try_uuid(p_public_signature_request_id)
      or signature_requests.legacy_signature_request_id = nullif(trim(coalesce(p_public_signature_request_id, '')), '')
    )
  limit 1
$$;

create or replace function api.create_document_signature_request(
  p_legacy_tenant_id text,
  p_document_id text,
  p_legacy_unit_id text default null,
  p_signer_type text default 'patient',
  p_signer_name text default null,
  p_signer_email text default null,
  p_provider_code text default 'mock_internal',
  p_expires_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb,
  p_legacy_requested_by_user_id text default null
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
  v_runtime_document_version_id uuid;
  v_runtime_patient_id uuid;
  v_document_unit_id uuid;
  v_signature_request_id uuid;
  v_actor_profile_id uuid := private.runtime_profile_id_by_legacy_user_id(p_legacy_requested_by_user_id);
  v_actor_type text := case when v_actor_profile_id is null then 'system' else 'profile' end;
  v_signer_type text;
  v_signer_name text := nullif(trim(coalesce(p_signer_name, '')), '');
  v_signer_email text := nullif(trim(coalesce(p_signer_email, '')), '');
  v_provider_code text := lower(coalesce(nullif(trim(coalesce(p_provider_code, '')), ''), 'mock_internal'));
  v_metadata jsonb;
  v_patient_name text;
  v_patient_email text;
  v_profile_name text;
  v_profile_email text;
  v_requested_at timestamptz := now();
begin
  if nullif(trim(coalesce(p_legacy_tenant_id, '')), '') is null then
    raise exception 'p_legacy_tenant_id is required';
  end if;

  if nullif(trim(coalesce(p_document_id, '')), '') is null then
    raise exception 'p_document_id is required';
  end if;

  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'p_metadata must be a json object';
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
    patient_documents.current_version_id,
    patient_documents.patient_id,
    patient_documents.unit_id
  into
    v_runtime_document_version_id,
    v_runtime_patient_id,
    v_document_unit_id
  from docs.patient_documents as patient_documents
  where patient_documents.id = v_runtime_document_id
  limit 1;

  if v_runtime_unit_id is not null
    and v_document_unit_id is not null
    and v_document_unit_id <> v_runtime_unit_id then
    raise exception 'document % is outside the current unit scope', p_document_id;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not private.can_manage_clinical_domain(v_runtime_tenant_id, coalesce(v_document_unit_id, v_runtime_unit_id)) then
    raise exception 'create document signature request denied';
  end if;

  v_signer_type := lower(coalesce(nullif(trim(coalesce(p_signer_type, '')), ''), 'patient'));
  if v_signer_type not in ('patient', 'professional', 'guardian', 'witness', 'other') then
    v_signer_type := 'patient';
  end if;

  select
    patients.full_name,
    patients.primary_email::text
  into
    v_patient_name,
    v_patient_email
  from patients.patients as patients
  where patients.id = v_runtime_patient_id
  limit 1;

  if v_actor_profile_id is not null then
    select
      coalesce(profiles.full_name, profiles.display_name),
      profiles.email::text
    into
      v_profile_name,
      v_profile_email
    from identity.profiles as profiles
    where profiles.id = v_actor_profile_id
    limit 1;
  end if;

  if v_signer_type = 'patient' then
    v_signer_name := coalesce(v_signer_name, v_patient_name);
    v_signer_email := coalesce(v_signer_email, v_patient_email);
  elsif v_signer_type = 'professional' then
    v_signer_name := coalesce(v_signer_name, v_profile_name);
    v_signer_email := coalesce(v_signer_email, v_profile_email);
  end if;

  v_metadata := jsonb_strip_nulls(
    coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'source', 'api_operational_flow',
      'operation', 'request_document_signature',
      'legacy_tenant_id', p_legacy_tenant_id,
      'legacy_unit_id', p_legacy_unit_id,
      'document_id', p_document_id,
      'provider_code', v_provider_code,
      'legacy_requested_by_user_id', p_legacy_requested_by_user_id
    )
  );

  insert into docs.signature_requests (
    tenant_id,
    patient_document_id,
    document_version_id,
    patient_id,
    signer_type,
    signer_name,
    signer_email,
    signer_profile_id,
    provider_code,
    request_status,
    requested_at,
    expires_at,
    metadata
  )
  values (
    v_runtime_tenant_id,
    v_runtime_document_id,
    v_runtime_document_version_id,
    v_runtime_patient_id,
    v_signer_type,
    v_signer_name,
    v_signer_email,
    case when v_signer_type = 'professional' then v_actor_profile_id else null end,
    v_provider_code,
    'sent',
    v_requested_at,
    p_expires_at,
    v_metadata
  )
  returning id
  into v_signature_request_id;

  insert into docs.signature_events (
    signature_request_id,
    event_type,
    source,
    event_at,
    payload,
    metadata
  )
  values (
    v_signature_request_id,
    'requested',
    'runtime_api',
    v_requested_at,
    jsonb_build_object(
      'requestStatus', 'sent',
      'providerCode', v_provider_code,
      'signerType', v_signer_type
    ),
    v_metadata
  );

  perform private.record_audit_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => coalesce(v_document_unit_id, v_runtime_unit_id),
    p_patient_id => v_runtime_patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => v_actor_profile_id,
    p_event_type => 'docs.signature_request_created',
    p_action => 'create',
    p_resource_schema => 'docs',
    p_resource_table => 'signature_requests',
    p_resource_id => v_signature_request_id,
    p_payload => jsonb_build_object(
      'documentId', v_runtime_document_id,
      'documentVersionId', v_runtime_document_version_id,
      'providerCode', v_provider_code,
      'signerType', v_signer_type,
      'requestedAt', v_requested_at,
      'expiresAt', p_expires_at
    ) || v_metadata
  );

  perform private.record_patient_timeline_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => coalesce(v_document_unit_id, v_runtime_unit_id),
    p_patient_id => v_runtime_patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => v_actor_profile_id,
    p_event_type => 'document_signature_requested',
    p_event_at => v_requested_at,
    p_source_schema => 'docs',
    p_source_table => 'signature_requests',
    p_source_id => v_signature_request_id,
    p_payload => jsonb_build_object(
      'documentId', v_runtime_document_id,
      'signerType', v_signer_type,
      'providerCode', v_provider_code,
      'requestedAt', v_requested_at,
      'expiresAt', p_expires_at
    ) || v_metadata
  );

  return coalesce(private.patient_document_json(v_runtime_document_id), '{}'::jsonb);
end;
$$;

create or replace function api.register_document_printable_artifact(
  p_legacy_tenant_id text,
  p_document_id text,
  p_legacy_unit_id text default null,
  p_artifact_kind text default 'html',
  p_render_status text default 'rendered',
  p_storage_object_path text default null,
  p_rendered_html text default null,
  p_checksum text default null,
  p_failure_reason text default null,
  p_rendered_at timestamptz default now(),
  p_metadata jsonb default '{}'::jsonb,
  p_legacy_created_by_user_id text default null
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
  v_runtime_document_version_id uuid;
  v_runtime_patient_id uuid;
  v_document_unit_id uuid;
  v_printable_artifact_id uuid;
  v_actor_profile_id uuid := private.runtime_profile_id_by_legacy_user_id(p_legacy_created_by_user_id);
  v_actor_type text := case when v_actor_profile_id is null then 'system' else 'profile' end;
  v_artifact_kind text;
  v_render_status text;
  v_rendered_at timestamptz := coalesce(p_rendered_at, now());
  v_metadata jsonb;
begin
  if nullif(trim(coalesce(p_legacy_tenant_id, '')), '') is null then
    raise exception 'p_legacy_tenant_id is required';
  end if;

  if nullif(trim(coalesce(p_document_id, '')), '') is null then
    raise exception 'p_document_id is required';
  end if;

  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'p_metadata must be a json object';
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
    patient_documents.current_version_id,
    patient_documents.patient_id,
    patient_documents.unit_id
  into
    v_runtime_document_version_id,
    v_runtime_patient_id,
    v_document_unit_id
  from docs.patient_documents as patient_documents
  where patient_documents.id = v_runtime_document_id
  limit 1;

  if v_runtime_unit_id is not null
    and v_document_unit_id is not null
    and v_document_unit_id <> v_runtime_unit_id then
    raise exception 'document % is outside the current unit scope', p_document_id;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not private.can_manage_clinical_domain(v_runtime_tenant_id, coalesce(v_document_unit_id, v_runtime_unit_id)) then
    raise exception 'register document printable artifact denied';
  end if;

  v_artifact_kind := lower(coalesce(nullif(trim(coalesce(p_artifact_kind, '')), ''), 'html'));
  if v_artifact_kind not in ('preview', 'html', 'pdf', 'print_package') then
    v_artifact_kind := 'html';
  end if;

  v_render_status := lower(coalesce(nullif(trim(coalesce(p_render_status, '')), ''), 'rendered'));
  if v_render_status not in ('pending', 'rendered', 'failed') then
    v_render_status := 'rendered';
  end if;

  v_metadata := jsonb_strip_nulls(
    coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'source', 'edge_document_printable',
      'operation', 'register_document_printable_artifact',
      'legacy_tenant_id', p_legacy_tenant_id,
      'legacy_unit_id', p_legacy_unit_id,
      'document_id', p_document_id,
      'artifact_kind', v_artifact_kind,
      'legacy_created_by_user_id', p_legacy_created_by_user_id
    )
  );

  insert into docs.printable_artifacts (
    tenant_id,
    patient_document_id,
    document_version_id,
    artifact_kind,
    render_status,
    storage_object_path,
    checksum,
    rendered_at,
    failure_reason,
    metadata
  )
  values (
    v_runtime_tenant_id,
    v_runtime_document_id,
    v_runtime_document_version_id,
    v_artifact_kind,
    v_render_status,
    nullif(trim(coalesce(p_storage_object_path, '')), ''),
    nullif(trim(coalesce(p_checksum, '')), ''),
    case when v_render_status = 'rendered' then v_rendered_at else null end,
    nullif(trim(coalesce(p_failure_reason, '')), ''),
    v_metadata
  )
  returning id
  into v_printable_artifact_id;

  if v_runtime_document_version_id is not null then
    update docs.document_versions
    set
      rendered_html = coalesce(nullif(p_rendered_html, ''), rendered_html),
      storage_object_path = case
        when v_render_status = 'rendered'
          and v_artifact_kind in ('html', 'pdf')
          and nullif(trim(coalesce(p_storage_object_path, '')), '') is not null
          then nullif(trim(coalesce(p_storage_object_path, '')), '')
        else storage_object_path
      end,
      updated_at = now()
    where id = v_runtime_document_version_id;
  end if;

  perform private.record_audit_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => coalesce(v_document_unit_id, v_runtime_unit_id),
    p_patient_id => v_runtime_patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => v_actor_profile_id,
    p_event_type => 'docs.printable_artifact_registered',
    p_action => 'create',
    p_resource_schema => 'docs',
    p_resource_table => 'printable_artifacts',
    p_resource_id => v_printable_artifact_id,
    p_payload => jsonb_build_object(
      'documentId', v_runtime_document_id,
      'documentVersionId', v_runtime_document_version_id,
      'artifactKind', v_artifact_kind,
      'renderStatus', v_render_status,
      'renderedAt', case when v_render_status = 'rendered' then v_rendered_at else null end,
      'storageObjectPath', nullif(trim(coalesce(p_storage_object_path, '')), ''),
      'failureReason', nullif(trim(coalesce(p_failure_reason, '')), '')
    ) || v_metadata
  );

  perform private.record_patient_timeline_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => coalesce(v_document_unit_id, v_runtime_unit_id),
    p_patient_id => v_runtime_patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => v_actor_profile_id,
    p_event_type => case
      when v_render_status = 'rendered' then 'document_artifact_rendered'
      else 'document_artifact_failed'
    end,
    p_event_at => v_rendered_at,
    p_source_schema => 'docs',
    p_source_table => 'printable_artifacts',
    p_source_id => v_printable_artifact_id,
    p_payload => jsonb_build_object(
      'documentId', v_runtime_document_id,
      'artifactKind', v_artifact_kind,
      'renderStatus', v_render_status,
      'storageObjectPath', nullif(trim(coalesce(p_storage_object_path, '')), ''),
      'failureReason', nullif(trim(coalesce(p_failure_reason, '')), '')
    ) || v_metadata
  );

  return coalesce(private.patient_document_json(v_runtime_document_id), '{}'::jsonb);
end;
$$;

create or replace function api.consume_document_signature_webhook(
  p_provider text,
  p_event_id text,
  p_request_status text,
  p_signature_request_id text default null,
  p_document_id text default null,
  p_external_request_id text default null,
  p_completed_at timestamptz default null,
  p_payload jsonb default '{}'::jsonb,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_provider text := lower(nullif(trim(coalesce(p_provider, '')), ''));
  v_event_id text := nullif(trim(coalesce(p_event_id, '')), '');
  v_request_status text := lower(nullif(trim(coalesce(p_request_status, '')), ''));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_request_hash text := md5(v_payload::text);
  v_idempotency_scope text;
  v_existing_snapshot jsonb;
  v_runtime_tenant_id uuid;
  v_signature_request_id uuid;
  v_runtime_document_id uuid;
  v_runtime_document_version_id uuid;
  v_runtime_patient_id uuid;
  v_document_unit_id uuid;
  v_signature_event_id uuid;
  v_completed_at timestamptz := coalesce(
    p_completed_at,
    case
      when nullif(trim(coalesce(v_payload ->> 'completedAt', '')), '') is null then null
      else (v_payload ->> 'completedAt')::timestamptz
    end,
    now()
  );
  v_signed_storage_object_path text := nullif(trim(coalesce(
    v_payload ->> 'signedStorageObjectPath',
    v_payload -> 'document' ->> 'signedStorageObjectPath',
    ''
  )), '');
  v_result jsonb;
begin
  if v_provider is null then
    raise exception 'p_provider is required';
  end if;

  if v_event_id is null then
    raise exception 'p_event_id is required';
  end if;

  if v_request_status is null then
    raise exception 'p_request_status is required';
  end if;

  if jsonb_typeof(v_payload) <> 'object' then
    raise exception 'p_payload must be a json object';
  end if;

  if v_request_status not in ('pending', 'sent', 'viewed', 'signed', 'declined', 'expired', 'cancelled') then
    raise exception 'invalid signature request status %', v_request_status;
  end if;

  v_runtime_tenant_id := private.try_uuid(
    coalesce(
      nullif(trim(coalesce(v_payload ->> 'tenantId', '')), ''),
      nullif(trim(coalesce(v_payload ->> 'tenant_id', '')), '')
    )
  );

  if v_runtime_tenant_id is null and nullif(trim(coalesce(p_document_id, '')), '') is not null then
    select patient_documents.tenant_id
    into v_runtime_tenant_id
    from docs.patient_documents as patient_documents
    where patient_documents.deleted_at is null
      and (
        patient_documents.id = private.try_uuid(p_document_id)
        or patient_documents.legacy_patient_document_id = nullif(trim(coalesce(p_document_id, '')), '')
      )
    limit 1;
  end if;

  v_idempotency_scope := 'docs.signature_webhook:' || v_provider;

  insert into audit.idempotency_keys (
    tenant_id,
    scope,
    key,
    request_hash
  )
  values (
    v_runtime_tenant_id,
    v_idempotency_scope,
    v_event_id,
    v_request_hash
  )
  on conflict (scope, key) do nothing;

  if not found then
    select idempotency.response_snapshot
    into v_existing_snapshot
    from audit.idempotency_keys as idempotency
    where idempotency.scope = v_idempotency_scope
      and idempotency.key = v_event_id
    limit 1;

    if v_existing_snapshot is not null then
      return v_existing_snapshot || jsonb_build_object('duplicate', true);
    end if;
  end if;

  if v_runtime_tenant_id is not null and nullif(trim(coalesce(p_signature_request_id, '')), '') is not null then
    v_signature_request_id := private.runtime_signature_request_id_by_public_id(
      v_runtime_tenant_id,
      p_signature_request_id
    );
  end if;

  if v_signature_request_id is null and nullif(trim(coalesce(p_external_request_id, '')), '') is not null then
    select signature_requests.id, patient_documents.tenant_id
    into v_signature_request_id, v_runtime_tenant_id
    from docs.signature_requests as signature_requests
    inner join docs.patient_documents as patient_documents
      on patient_documents.id = signature_requests.patient_document_id
    where signature_requests.external_request_id = nullif(trim(coalesce(p_external_request_id, '')), '')
      and patient_documents.deleted_at is null
    limit 1;
  end if;

  if v_signature_request_id is null and nullif(trim(coalesce(p_document_id, '')), '') is not null then
    select signature_requests.id, patient_documents.tenant_id
    into v_signature_request_id, v_runtime_tenant_id
    from docs.signature_requests as signature_requests
    inner join docs.patient_documents as patient_documents
      on patient_documents.id = signature_requests.patient_document_id
    where patient_documents.deleted_at is null
      and (
        patient_documents.id = private.try_uuid(p_document_id)
        or patient_documents.legacy_patient_document_id = nullif(trim(coalesce(p_document_id, '')), '')
      )
    order by signature_requests.requested_at desc, signature_requests.created_at desc
    limit 1;
  end if;

  if v_signature_request_id is null then
    raise exception 'signature request could not be resolved for webhook event %', v_event_id;
  end if;

  select
    signature_requests.patient_document_id,
    signature_requests.document_version_id,
    signature_requests.patient_id,
    patient_documents.tenant_id,
    patient_documents.unit_id
  into
    v_runtime_document_id,
    v_runtime_document_version_id,
    v_runtime_patient_id,
    v_runtime_tenant_id,
    v_document_unit_id
  from docs.signature_requests as signature_requests
  inner join docs.patient_documents as patient_documents
    on patient_documents.id = signature_requests.patient_document_id
  where signature_requests.id = v_signature_request_id
  limit 1;

  update docs.signature_requests
  set
    request_status = v_request_status,
    completed_at = case
      when v_request_status = 'signed' then v_completed_at
      else completed_at
    end,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'lastWebhookProvider', v_provider,
      'lastWebhookEventId', v_event_id,
      'lastWebhookStatus', v_request_status
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
    v_event_id,
    v_request_status,
    v_provider,
    case when v_request_status = 'signed' then v_completed_at else now() end,
    v_payload,
    jsonb_build_object(
      'provider', v_provider,
      'idempotencyKey', coalesce(nullif(trim(coalesce(p_idempotency_key, '')), ''), v_event_id)
    )
  )
  on conflict (external_event_id) do update
  set
    event_type = excluded.event_type,
    source = excluded.source,
    event_at = excluded.event_at,
    payload = excluded.payload,
    metadata = excluded.metadata
  returning id
  into v_signature_event_id;

  if v_request_status = 'signed' then
    update docs.patient_documents
    set
      status = 'signed',
      signed_at = v_completed_at,
      updated_at = now()
    where id = v_runtime_document_id;

    if v_runtime_document_version_id is not null then
      update docs.document_versions
      set
        status = 'signed',
        signed_at = v_completed_at,
        signed_storage_object_path = coalesce(v_signed_storage_object_path, signed_storage_object_path),
        updated_at = now()
      where id = v_runtime_document_version_id;
    end if;

    perform private.record_audit_event(
      p_tenant_id => v_runtime_tenant_id,
      p_unit_id => v_document_unit_id,
      p_patient_id => v_runtime_patient_id,
      p_actor_type => 'system',
      p_actor_id => null,
      p_event_type => 'docs.signature_completed',
      p_action => 'update',
      p_resource_schema => 'docs',
      p_resource_table => 'signature_requests',
      p_resource_id => v_signature_request_id,
      p_payload => jsonb_build_object(
        'provider', v_provider,
        'eventId', v_event_id,
        'requestStatus', v_request_status,
        'documentId', v_runtime_document_id,
        'documentVersionId', v_runtime_document_version_id,
        'completedAt', v_completed_at,
        'signedStorageObjectPath', v_signed_storage_object_path
      ) || v_payload
    );

    perform private.record_patient_timeline_event(
      p_tenant_id => v_runtime_tenant_id,
      p_unit_id => v_document_unit_id,
      p_patient_id => v_runtime_patient_id,
      p_actor_type => 'system',
      p_actor_id => null,
      p_event_type => 'document_signed',
      p_event_at => v_completed_at,
      p_source_schema => 'docs',
      p_source_table => 'signature_requests',
      p_source_id => v_signature_request_id,
      p_payload => jsonb_build_object(
        'provider', v_provider,
        'eventId', v_event_id,
        'requestStatus', v_request_status,
        'documentId', v_runtime_document_id,
        'signedStorageObjectPath', v_signed_storage_object_path
      ) || v_payload
    );
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'processingStatus', 'processed',
    'provider', v_provider,
    'eventId', v_event_id,
    'requestStatus', v_request_status,
    'document', private.patient_document_json(v_runtime_document_id)
  );

  update audit.idempotency_keys
  set
    tenant_id = coalesce(tenant_id, v_runtime_tenant_id),
    response_snapshot = v_result,
    consumed_at = coalesce(consumed_at, now())
  where scope = v_idempotency_scope
    and key = v_event_id;

  return v_result;
exception
  when others then
    update audit.idempotency_keys
    set
      tenant_id = coalesce(tenant_id, v_runtime_tenant_id),
      response_snapshot = jsonb_build_object(
        'ok', false,
        'processingStatus', 'failed',
        'provider', v_provider,
        'eventId', v_event_id,
        'error', sqlerrm
      ),
      consumed_at = coalesce(consumed_at, now())
    where scope = v_idempotency_scope
      and key = v_event_id;

    raise;
end;
$$;

create or replace function public.create_document_signature_request(
  p_legacy_tenant_id text,
  p_document_id text,
  p_legacy_unit_id text default null,
  p_signer_type text default 'patient',
  p_signer_name text default null,
  p_signer_email text default null,
  p_provider_code text default 'mock_internal',
  p_expires_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb,
  p_legacy_requested_by_user_id text default null
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.create_document_signature_request(
    p_legacy_tenant_id,
    p_document_id,
    p_legacy_unit_id,
    p_signer_type,
    p_signer_name,
    p_signer_email,
    p_provider_code,
    p_expires_at,
    p_metadata,
    p_legacy_requested_by_user_id
  )
$$;

create or replace function public.register_document_printable_artifact(
  p_legacy_tenant_id text,
  p_document_id text,
  p_legacy_unit_id text default null,
  p_artifact_kind text default 'html',
  p_render_status text default 'rendered',
  p_storage_object_path text default null,
  p_rendered_html text default null,
  p_checksum text default null,
  p_failure_reason text default null,
  p_rendered_at timestamptz default now(),
  p_metadata jsonb default '{}'::jsonb,
  p_legacy_created_by_user_id text default null
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.register_document_printable_artifact(
    p_legacy_tenant_id,
    p_document_id,
    p_legacy_unit_id,
    p_artifact_kind,
    p_render_status,
    p_storage_object_path,
    p_rendered_html,
    p_checksum,
    p_failure_reason,
    p_rendered_at,
    p_metadata,
    p_legacy_created_by_user_id
  )
$$;

create or replace function public.consume_document_signature_webhook(
  p_provider text,
  p_event_id text,
  p_request_status text,
  p_signature_request_id text default null,
  p_document_id text default null,
  p_external_request_id text default null,
  p_completed_at timestamptz default null,
  p_payload jsonb default '{}'::jsonb,
  p_idempotency_key text default null
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.consume_document_signature_webhook(
    p_provider,
    p_event_id,
    p_request_status,
    p_signature_request_id,
    p_document_id,
    p_external_request_id,
    p_completed_at,
    p_payload,
    p_idempotency_key
  )
$$;

revoke all on function private.runtime_patient_document_id_by_public_id(uuid, text) from public, anon, authenticated;
revoke all on function private.runtime_signature_request_id_by_public_id(uuid, text) from public, anon, authenticated;
revoke all on function api.create_document_signature_request(text, text, text, text, text, text, text, timestamptz, jsonb, text) from public, anon, authenticated;
revoke all on function api.register_document_printable_artifact(text, text, text, text, text, text, text, text, text, timestamptz, jsonb, text) from public, anon, authenticated;
revoke all on function api.consume_document_signature_webhook(text, text, text, text, text, text, timestamptz, jsonb, text) from public, anon, authenticated;
revoke all on function public.create_document_signature_request(text, text, text, text, text, text, text, timestamptz, jsonb, text) from public, anon, authenticated;
revoke all on function public.register_document_printable_artifact(text, text, text, text, text, text, text, text, text, timestamptz, jsonb, text) from public, anon, authenticated;
revoke all on function public.consume_document_signature_webhook(text, text, text, text, text, text, timestamptz, jsonb, text) from public, anon, authenticated;

grant execute on function private.runtime_patient_document_id_by_public_id(uuid, text) to authenticated, service_role;
grant execute on function private.runtime_signature_request_id_by_public_id(uuid, text) to authenticated, service_role;
grant execute on function api.create_document_signature_request(text, text, text, text, text, text, text, timestamptz, jsonb, text) to service_role;
grant execute on function api.register_document_printable_artifact(text, text, text, text, text, text, text, text, text, timestamptz, jsonb, text) to service_role;
grant execute on function api.consume_document_signature_webhook(text, text, text, text, text, text, timestamptz, jsonb, text) to service_role;
grant execute on function public.create_document_signature_request(text, text, text, text, text, text, text, timestamptz, jsonb, text) to service_role;
grant execute on function public.register_document_printable_artifact(text, text, text, text, text, text, text, text, text, timestamptz, jsonb, text) to service_role;
grant execute on function public.consume_document_signature_webhook(text, text, text, text, text, text, timestamptz, jsonb, text) to service_role;
