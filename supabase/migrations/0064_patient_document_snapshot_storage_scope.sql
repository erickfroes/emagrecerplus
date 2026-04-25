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
  left join docs.document_template_versions as document_template_versions
    on document_template_versions.id = document_templates.current_version_id
  left join docs.document_versions as document_versions
    on document_versions.id = patient_documents.current_version_id
  where patient_documents.id = p_patient_document_id
    and patient_documents.deleted_at is null
  limit 1
$$;
