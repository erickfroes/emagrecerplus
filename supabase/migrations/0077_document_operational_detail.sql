create or replace function api.get_patient_document_operational_detail(
  p_legacy_tenant_id text,
  p_document_id text,
  p_legacy_unit_id text default null,
  p_access_event_limit integer default 20
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
  v_access_event_limit integer := least(greatest(coalesce(p_access_event_limit, 20), 1), 50);
  v_result jsonb;
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
    raise exception 'get patient document operational detail denied';
  end if;

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
      'patient', jsonb_build_object(
        'id', coalesce(patients.legacy_patient_id, patients.id::text),
        'runtimeId', patients.id::text,
        'name', patients.full_name
      ),
      'encounter', case
        when clinical_encounters.id is null then null
        else jsonb_strip_nulls(
          jsonb_build_object(
            'id', coalesce(clinical_encounters.legacy_encounter_id, clinical_encounters.id::text),
            'runtimeId', clinical_encounters.id::text,
            'encounterType', clinical_encounters.encounter_type,
            'status', clinical_encounters.status,
            'openedAt', clinical_encounters.opened_at,
            'closedAt', clinical_encounters.closed_at
          )
        )
      end,
      'template', case
        when document_templates.id is null then null
        else jsonb_strip_nulls(
          jsonb_build_object(
            'id', document_templates.id::text,
            'title', document_templates.title,
            'templateKind', document_templates.template_kind,
            'status', document_templates.status
          )
        )
      end,
      'author', case
        when author_profiles.id is null then null
        else jsonb_strip_nulls(
          jsonb_build_object(
            'runtimeId', author_profiles.id::text,
            'name', coalesce(author_profiles.full_name, author_profiles.display_name, author_profiles.email::text),
            'email', author_profiles.email::text
          )
        )
      end,
      'professional', case
        when professionals.id is null then null
        else jsonb_strip_nulls(
          jsonb_build_object(
            'id', coalesce(professionals.legacy_professional_id, professionals.id::text),
            'runtimeId', professionals.id::text,
            'name', professionals.display_name,
            'professionalType', professionals.professional_type,
            'licenseNumber', professionals.license_number
          )
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
            'issuedAt', document_versions.issued_at,
            'signedAt', document_versions.signed_at,
            'checksum', document_versions.checksum,
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
              'failureReason', printable_artifacts.failure_reason,
              'checksum', printable_artifacts.checksum,
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
              'signerName', signature_requests.signer_name,
              'signerEmail', signature_requests.signer_email,
              'providerCode', signature_requests.provider_code,
              'externalRequestId', signature_requests.external_request_id,
              'requestStatus', signature_requests.request_status,
              'requestedAt', signature_requests.requested_at,
              'expiresAt', signature_requests.expires_at,
              'completedAt', signature_requests.completed_at,
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
          order by signature_requests.requested_at desc nulls last, signature_requests.created_at desc
        )
        from docs.signature_requests as signature_requests
        where signature_requests.patient_document_id = patient_documents.id
      ), '[]'::jsonb),
      'signatureEvents', coalesce((
        select jsonb_agg(
          jsonb_strip_nulls(
            jsonb_build_object(
              'id', limited_signature_events.id::text,
              'runtimeId', limited_signature_events.id::text,
              'signatureRequestId', limited_signature_events.signature_request_public_id,
              'eventType', limited_signature_events.event_type,
              'source', limited_signature_events.source,
              'externalEventId', limited_signature_events.external_event_id,
              'eventAt', limited_signature_events.event_at,
              'createdAt', limited_signature_events.created_at
            )
          )
          order by limited_signature_events.event_at desc, limited_signature_events.created_at desc
        )
        from (
          select
            signature_events.id,
            coalesce(signature_requests.legacy_signature_request_id, signature_requests.id::text)
              as signature_request_public_id,
            signature_events.event_type,
            signature_events.source,
            signature_events.external_event_id,
            signature_events.event_at,
            signature_events.created_at
          from docs.signature_events as signature_events
          inner join docs.signature_requests as signature_requests
            on signature_requests.id = signature_events.signature_request_id
          where signature_requests.patient_document_id = patient_documents.id
          order by signature_events.event_at desc, signature_events.created_at desc
          limit 20
        ) as limited_signature_events
      ), '[]'::jsonb),
      'dispatchEvents', coalesce((
        select jsonb_agg(
          jsonb_strip_nulls(
            jsonb_build_object(
              'id', limited_dispatch_events.id::text,
              'signatureRequestId', limited_dispatch_events.signature_request_public_id,
              'providerCode', limited_dispatch_events.provider_code,
              'dispatchStatus', limited_dispatch_events.dispatch_status,
              'externalRequestId', limited_dispatch_events.external_request_id,
              'attemptedAt', limited_dispatch_events.attempted_at,
              'completedAt', limited_dispatch_events.completed_at,
              'errorMessage', limited_dispatch_events.error_message
            )
          )
          order by limited_dispatch_events.attempted_at desc, limited_dispatch_events.created_at desc
        )
        from (
          select
            signature_dispatch_attempts.id,
            coalesce(signature_requests.legacy_signature_request_id, signature_requests.id::text)
              as signature_request_public_id,
            signature_dispatch_attempts.provider_code,
            signature_dispatch_attempts.dispatch_status,
            signature_dispatch_attempts.external_request_id,
            signature_dispatch_attempts.attempted_at,
            signature_dispatch_attempts.completed_at,
            signature_dispatch_attempts.error_message,
            signature_dispatch_attempts.created_at
          from docs.signature_dispatch_attempts as signature_dispatch_attempts
          inner join docs.signature_requests as signature_requests
            on signature_requests.id = signature_dispatch_attempts.signature_request_id
          where signature_dispatch_attempts.patient_document_id = patient_documents.id
          order by signature_dispatch_attempts.attempted_at desc, signature_dispatch_attempts.created_at desc
          limit 20
        ) as limited_dispatch_events
      ), '[]'::jsonb),
      'prescriptions', coalesce((
        select jsonb_agg(
          jsonb_strip_nulls(
            jsonb_build_object(
              'id', coalesce(prescription_records.legacy_prescription_id, prescription_records.id::text),
              'runtimeId', prescription_records.id::text,
              'prescriptionType', prescription_records.prescription_type,
              'summary', prescription_records.summary,
              'issuedAt', prescription_records.issued_at
            )
          )
          order by prescription_records.issued_at desc, prescription_records.created_at desc
        )
        from clinical.prescription_records as prescription_records
        where prescription_records.encounter_id = patient_documents.encounter_id
      ), '[]'::jsonb),
      'accessEvents', coalesce((
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
                'artifactKind', printable_artifacts.artifact_kind,
                'signedUrlExpiresAt', document_access_events.signed_url_expires_at,
                'createdAt', document_access_events.created_at,
                'actor', case
                  when actor_profiles.id is null then null
                  else jsonb_strip_nulls(
                    jsonb_build_object(
                      'runtimeId', actor_profiles.id::text,
                      'name', coalesce(actor_profiles.full_name, actor_profiles.display_name, actor_profiles.email::text),
                      'email', actor_profiles.email::text
                    )
                  )
                end
              )
            ) as access_event_payload
          from docs.document_access_events as document_access_events
          left join docs.printable_artifacts as printable_artifacts
            on printable_artifacts.id = document_access_events.printable_artifact_id
          left join identity.profiles as actor_profiles
            on actor_profiles.id = document_access_events.actor_profile_id
          where document_access_events.patient_document_id = patient_documents.id
          order by document_access_events.created_at desc
          limit v_access_event_limit
        ) as access_events
      ), '[]'::jsonb)
    )
  )
  into v_result
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
  where patient_documents.id = v_runtime_document_id
    and patient_documents.deleted_at is null
  limit 1;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

create or replace function public.get_patient_document_operational_detail(
  p_legacy_tenant_id text,
  p_document_id text,
  p_legacy_unit_id text default null,
  p_access_event_limit integer default 20
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select api.get_patient_document_operational_detail(
    p_legacy_tenant_id,
    p_document_id,
    p_legacy_unit_id,
    p_access_event_limit
  )
$$;

alter function api.get_patient_document_operational_detail(text, text, text, integer)
  security definer;
alter function api.get_patient_document_operational_detail(text, text, text, integer)
  set search_path = '';

alter function public.get_patient_document_operational_detail(text, text, text, integer)
  security invoker;
alter function public.get_patient_document_operational_detail(text, text, text, integer)
  set search_path = '';

revoke all on function api.get_patient_document_operational_detail(text, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.get_patient_document_operational_detail(text, text, text, integer)
  from public, anon, authenticated;

grant execute on function api.get_patient_document_operational_detail(text, text, text, integer)
  to service_role;
grant execute on function public.get_patient_document_operational_detail(text, text, text, integer)
  to service_role;
