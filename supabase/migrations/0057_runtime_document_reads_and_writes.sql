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
      'documentType', patient_documents.document_type,
      'status', patient_documents.status,
      'title', patient_documents.title,
      'summary', patient_documents.summary,
      'documentNumber', patient_documents.document_number,
      'issuedAt', patient_documents.issued_at,
      'expiresAt', patient_documents.expires_at,
      'signedAt', patient_documents.signed_at,
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
            'signedAt', document_versions.signed_at
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
              'requestStatus', signature_requests.request_status,
              'requestedAt', signature_requests.requested_at,
              'expiresAt', signature_requests.expires_at,
              'completedAt', signature_requests.completed_at
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
  left join docs.document_versions as document_versions
    on document_versions.id = patient_documents.current_version_id
  where patient_documents.id = p_patient_document_id
    and patient_documents.deleted_at is null
  limit 1
$$;

create or replace function private.runtime_encounter_documents_json(
  p_runtime_encounter_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      private.patient_document_json(patient_documents.id)
      order by coalesce(patient_documents.issued_at, patient_documents.created_at) desc,
        patient_documents.created_at desc
    ),
    '[]'::jsonb
  )
  from docs.patient_documents as patient_documents
  where patient_documents.encounter_id = p_runtime_encounter_id
    and patient_documents.deleted_at is null
$$;

create or replace function api.list_document_templates(
  p_legacy_tenant_id text,
  p_legacy_unit_id text default null,
  p_template_kind text default null
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
  v_template_kind text := case
    when nullif(trim(coalesce(p_template_kind, '')), '') is null then null
    else lower(trim(p_template_kind))
  end;
begin
  if nullif(trim(coalesce(p_legacy_tenant_id, '')), '') is null then
    raise exception 'p_legacy_tenant_id is required';
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

  if coalesce(auth.role(), '') <> 'service_role'
    and not private.can_read_clinical_domain(v_runtime_tenant_id, v_runtime_unit_id) then
    raise exception 'list document templates denied';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_strip_nulls(
        jsonb_build_object(
          'id', document_templates.id::text,
          'title', document_templates.title,
          'description', document_templates.description,
          'templateKind', document_templates.template_kind,
          'templateScope', document_templates.template_scope,
          'status', document_templates.status,
          'currentVersion', case
            when document_template_versions.id is null then null
            else jsonb_strip_nulls(
              jsonb_build_object(
                'id', coalesce(document_template_versions.legacy_document_template_version_id, document_template_versions.id::text),
                'runtimeId', document_template_versions.id::text,
                'versionNumber', document_template_versions.version_number,
                'status', document_template_versions.status,
                'title', document_template_versions.title,
                'summary', document_template_versions.summary,
                'content', document_template_versions.content,
                'renderSchema', document_template_versions.render_schema,
                'effectiveFrom', document_template_versions.effective_from,
                'effectiveTo', document_template_versions.effective_to,
                'publishedAt', document_template_versions.published_at
              )
            )
          end
        )
      )
      order by document_templates.title asc, document_templates.created_at asc
    )
    from docs.document_templates as document_templates
    left join docs.document_template_versions as document_template_versions
      on document_template_versions.id = document_templates.current_version_id
    where document_templates.tenant_id = v_runtime_tenant_id
      and document_templates.deleted_at is null
      and document_templates.status in ('draft', 'active')
      and (v_template_kind is null or document_templates.template_kind = v_template_kind)
      and (
        v_runtime_unit_id is null
        or document_templates.unit_id is null
        or document_templates.unit_id = v_runtime_unit_id
      )
  ), '[]'::jsonb);
end;
$$;

create or replace function api.issue_document_for_encounter(
  p_legacy_tenant_id text,
  p_legacy_encounter_id text,
  p_legacy_unit_id text default null,
  p_document_template_id uuid default null,
  p_document_type text default 'custom',
  p_title text default null,
  p_summary text default null,
  p_issued_at timestamptz default now(),
  p_expires_at timestamptz default null,
  p_content jsonb default '{}'::jsonb,
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
  v_runtime_encounter_id uuid;
  v_runtime_patient_id uuid;
  v_runtime_document_id uuid;
  v_runtime_document_version_id uuid;
  v_template_title text;
  v_template_kind text;
  v_actor_profile_id uuid := private.runtime_profile_id_by_legacy_user_id(p_legacy_created_by_user_id);
  v_actor_type text := case when v_actor_profile_id is null then 'system' else 'profile' end;
  v_document_type text;
  v_title text;
  v_summary text := nullif(trim(coalesce(p_summary, '')), '');
  v_issued_at timestamptz := coalesce(p_issued_at, now());
  v_metadata jsonb;
begin
  if nullif(trim(coalesce(p_legacy_tenant_id, '')), '') is null then
    raise exception 'p_legacy_tenant_id is required';
  end if;

  if nullif(trim(coalesce(p_legacy_encounter_id, '')), '') is null then
    raise exception 'p_legacy_encounter_id is required';
  end if;

  if jsonb_typeof(coalesce(p_content, '{}'::jsonb)) <> 'object' then
    raise exception 'p_content must be a json object';
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

  select
    encounters.id,
    encounters.patient_id,
    encounters.unit_id
  into
    v_runtime_encounter_id,
    v_runtime_patient_id,
    v_runtime_unit_id
  from clinical.encounters as encounters
  where encounters.tenant_id = v_runtime_tenant_id
    and encounters.legacy_encounter_id = p_legacy_encounter_id
  limit 1;

  if v_runtime_encounter_id is null then
    raise exception 'runtime encounter not found for legacy encounter %', p_legacy_encounter_id;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not private.can_manage_clinical_domain(v_runtime_tenant_id, v_runtime_unit_id) then
    raise exception 'issue document denied';
  end if;

  if p_document_template_id is not null then
    select
      document_templates.title,
      document_templates.template_kind
    into
      v_template_title,
      v_template_kind
    from docs.document_templates as document_templates
    where document_templates.id = p_document_template_id
      and document_templates.tenant_id = v_runtime_tenant_id
      and document_templates.deleted_at is null
      and (
        document_templates.unit_id is null
        or document_templates.unit_id = v_runtime_unit_id
      )
    limit 1;

    if v_template_title is null then
      raise exception 'document template % not found in current scope', p_document_template_id;
    end if;
  end if;

  v_document_type := case
    when lower(coalesce(nullif(trim(coalesce(p_document_type, '')), ''), coalesce(v_template_kind, 'custom'))) in (
      'report',
      'consent',
      'prescription',
      'orientation',
      'exam_request',
      'certificate',
      'custom'
    ) then lower(coalesce(nullif(trim(coalesce(p_document_type, '')), ''), coalesce(v_template_kind, 'custom')))
    else 'custom'
  end;

  v_title := coalesce(
    nullif(trim(coalesce(p_title, '')), ''),
    nullif(trim(coalesce(v_template_title, '')), ''),
    'Documento emitido'
  );

  v_metadata := jsonb_strip_nulls(
    coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'source', 'api_operational_flow',
      'operation', 'issue_document',
      'legacy_tenant_id', p_legacy_tenant_id,
      'legacy_encounter_id', p_legacy_encounter_id,
      'legacy_unit_id', p_legacy_unit_id,
      'document_template_id', p_document_template_id,
      'legacy_created_by_user_id', p_legacy_created_by_user_id
    )
  );

  insert into docs.patient_documents (
    tenant_id,
    unit_id,
    patient_id,
    encounter_id,
    document_template_id,
    document_type,
    status,
    title,
    summary,
    issued_at,
    expires_at,
    created_by_profile_id,
    metadata
  )
  values (
    v_runtime_tenant_id,
    v_runtime_unit_id,
    v_runtime_patient_id,
    v_runtime_encounter_id,
    p_document_template_id,
    v_document_type,
    'issued',
    v_title,
    v_summary,
    v_issued_at,
    p_expires_at,
    v_actor_profile_id,
    v_metadata
  )
  returning id
  into v_runtime_document_id;

  insert into docs.document_versions (
    patient_document_id,
    version_number,
    status,
    title,
    summary,
    content,
    issued_at,
    created_by_profile_id,
    metadata
  )
  values (
    v_runtime_document_id,
    1,
    'issued',
    v_title,
    v_summary,
    coalesce(p_content, '{}'::jsonb),
    v_issued_at,
    v_actor_profile_id,
    v_metadata
  )
  returning id
  into v_runtime_document_version_id;

  perform private.refresh_patient_document_current_version(v_runtime_document_id);

  perform private.record_audit_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => v_runtime_unit_id,
    p_patient_id => v_runtime_patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => v_actor_profile_id,
    p_event_type => 'docs.patient_document_issued',
    p_action => 'create',
    p_resource_schema => 'docs',
    p_resource_table => 'patient_documents',
    p_resource_id => v_runtime_document_id,
    p_payload => jsonb_build_object(
      'documentType', v_document_type,
      'title', v_title,
      'issuedAt', v_issued_at,
      'expiresAt', p_expires_at,
      'documentVersionId', v_runtime_document_version_id
    ) || v_metadata
  );

  perform private.record_patient_timeline_event(
    p_tenant_id => v_runtime_tenant_id,
    p_unit_id => v_runtime_unit_id,
    p_patient_id => v_runtime_patient_id,
    p_actor_type => v_actor_type,
    p_actor_id => v_actor_profile_id,
    p_event_type => 'document_issued',
    p_event_at => v_issued_at,
    p_source_schema => 'docs',
    p_source_table => 'patient_documents',
    p_source_id => v_runtime_document_id,
    p_payload => jsonb_build_object(
      'documentType', v_document_type,
      'title', v_title,
      'issuedAt', v_issued_at,
      'expiresAt', p_expires_at,
      'documentVersionId', v_runtime_document_version_id
    ) || v_metadata
  );

  return coalesce(private.patient_document_json(v_runtime_document_id), '{}'::jsonb);
end;
$$;

create or replace function public.list_document_templates(
  p_legacy_tenant_id text,
  p_legacy_unit_id text default null,
  p_template_kind text default null
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select api.list_document_templates(
    p_legacy_tenant_id,
    p_legacy_unit_id,
    p_template_kind
  )
$$;

create or replace function public.issue_document_for_encounter(
  p_legacy_tenant_id text,
  p_legacy_encounter_id text,
  p_legacy_unit_id text default null,
  p_document_template_id uuid default null,
  p_document_type text default 'custom',
  p_title text default null,
  p_summary text default null,
  p_issued_at timestamptz default now(),
  p_expires_at timestamptz default null,
  p_content jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb,
  p_legacy_created_by_user_id text default null
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.issue_document_for_encounter(
    p_legacy_tenant_id,
    p_legacy_encounter_id,
    p_legacy_unit_id,
    p_document_template_id,
    p_document_type,
    p_title,
    p_summary,
    p_issued_at,
    p_expires_at,
    p_content,
    p_metadata,
    p_legacy_created_by_user_id
  )
$$;

create or replace function public.get_structured_encounter_snapshot(
  p_legacy_tenant_id text,
  p_legacy_encounter_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_payload jsonb := api.get_structured_encounter_snapshot(
    p_legacy_tenant_id,
    p_legacy_encounter_id
  );
  v_runtime_patient_id uuid;
  v_runtime_tenant_id uuid;
  v_runtime_encounter_id uuid;
begin
  if coalesce(v_payload ->> 'ready', 'false') <> 'true' then
    return v_payload;
  end if;

  v_runtime_patient_id := private.runtime_patient_id_from_reference(
    nullif(v_payload #>> '{encounter,patient,id}', '')
  );

  select tenants.id
  into v_runtime_tenant_id
  from platform.tenants as tenants
  where tenants.metadata @> jsonb_build_object('legacy_tenant_id', p_legacy_tenant_id)
  limit 1;

  if v_runtime_tenant_id is not null then
    select encounters.id
    into v_runtime_encounter_id
    from clinical.encounters as encounters
    where encounters.tenant_id = v_runtime_tenant_id
      and encounters.legacy_encounter_id = p_legacy_encounter_id
    limit 1;
  end if;

  v_payload := jsonb_set(
    v_payload,
    '{encounter,prescriptions}',
    coalesce(
      private.runtime_encounter_prescriptions_json(v_runtime_encounter_id),
      '[]'::jsonb
    ),
    true
  );

  v_payload := jsonb_set(
    v_payload,
    '{encounter,documents}',
    coalesce(
      private.runtime_encounter_documents_json(v_runtime_encounter_id),
      '[]'::jsonb
    ),
    true
  );

  v_payload := jsonb_set(
    v_payload,
    '{encounter,nutritionPlan}',
    coalesce(
      private.patient_active_nutrition_plan_json(v_runtime_patient_id, current_date),
      'null'::jsonb
    ),
    true
  );

  return v_payload;
end;
$$;

revoke all on function private.patient_document_json(uuid) from public, anon, authenticated;
revoke all on function private.runtime_encounter_documents_json(uuid) from public, anon, authenticated;
revoke all on function api.list_document_templates(text, text, text) from public, anon, authenticated;
revoke all on function api.issue_document_for_encounter(text, text, text, uuid, text, text, text, timestamptz, timestamptz, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.list_document_templates(text, text, text) from public, anon, authenticated;
revoke all on function public.issue_document_for_encounter(text, text, text, uuid, text, text, text, timestamptz, timestamptz, jsonb, jsonb, text) from public, anon, authenticated;

grant execute on function private.patient_document_json(uuid) to authenticated, service_role;
grant execute on function private.runtime_encounter_documents_json(uuid) to authenticated, service_role;
grant execute on function api.list_document_templates(text, text, text) to service_role;
grant execute on function api.issue_document_for_encounter(text, text, text, uuid, text, text, text, timestamptz, timestamptz, jsonb, jsonb, text) to service_role;
grant execute on function public.list_document_templates(text, text, text) to service_role;
grant execute on function public.issue_document_for_encounter(text, text, text, uuid, text, text, text, timestamptz, timestamptz, jsonb, jsonb, text) to service_role;
