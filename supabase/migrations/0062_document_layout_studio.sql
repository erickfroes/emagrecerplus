create or replace function private.document_layout_presets_json()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_array(
    jsonb_build_object(
      'code', 'clinical_classic',
      'name', 'Clinico classico',
      'description', 'Cabecalho institucional, leitura ampla e assinatura destacada.',
      'paperSize', 'A4',
      'headerAlignment', 'left',
      'headerVariant', 'institutional',
      'showLogo', true,
      'showHeaderBand', true,
      'showDocumentMeta', true,
      'showPatientSummary', true,
      'showSignatureBlock', true,
      'showFooterNote', true,
      'showWatermark', false,
      'density', 'comfortable',
      'sectionStyle', 'card',
      'borderStyle', 'soft',
      'titleScale', 'xl',
      'bodyScale', 'md',
      'marginPreset', 'a4_clinical',
      'accentMode', 'brand',
      'contentLayout', jsonb_build_object(
        'sectionOrder', jsonb_build_array('opening', 'patient_summary', 'body', 'signature'),
        'showSectionNumbers', false
      )
    ),
    jsonb_build_object(
      'code', 'institutional_clean',
      'name', 'Institucional clean',
      'description', 'Visual corporativo limpo para consentimentos, contratos e comunicados.',
      'paperSize', 'A4',
      'headerAlignment', 'center',
      'headerVariant', 'clean',
      'showLogo', true,
      'showHeaderBand', false,
      'showDocumentMeta', true,
      'showPatientSummary', false,
      'showSignatureBlock', true,
      'showFooterNote', true,
      'showWatermark', false,
      'density', 'balanced',
      'sectionStyle', 'rule',
      'borderStyle', 'none',
      'titleScale', 'lg',
      'bodyScale', 'md',
      'marginPreset', 'a4_standard',
      'accentMode', 'minimal',
      'contentLayout', jsonb_build_object(
        'sectionOrder', jsonb_build_array('opening', 'body', 'signature'),
        'showSectionNumbers', true
      )
    ),
    jsonb_build_object(
      'code', 'evidence_compact',
      'name', 'Evidencia compacta',
      'description', 'Layout enxuto para laudos, evolucoes e anexos com foco em rastreabilidade.',
      'paperSize', 'A4',
      'headerAlignment', 'left',
      'headerVariant', 'compact',
      'showLogo', true,
      'showHeaderBand', false,
      'showDocumentMeta', true,
      'showPatientSummary', true,
      'showSignatureBlock', true,
      'showFooterNote', true,
      'showWatermark', true,
      'density', 'compact',
      'sectionStyle', 'plain',
      'borderStyle', 'hairline',
      'titleScale', 'lg',
      'bodyScale', 'sm',
      'marginPreset', 'a4_compact',
      'accentMode', 'monochrome',
      'contentLayout', jsonb_build_object(
        'sectionOrder', jsonb_build_array('opening', 'patient_summary', 'body', 'signature', 'footer'),
        'showSectionNumbers', true
      )
    )
  )
$$;

create or replace function private.document_layout_standards_json()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_array(
    jsonb_build_object(
      'code', 'cfm_document_identity',
      'title', 'Identificacao institucional e profissional',
      'summary', 'Cabecalho, identificacao do paciente, data de emissao e autoria devem permanecer legiveis e rastreaveis.'
    ),
    jsonb_build_object(
      'code', 'lei_14063_signature_trace',
      'title', 'Assinatura eletronica e trilha',
      'summary', 'O layout deve reservar bloco claro para assinatura, carimbo de data/hora e referencia do fluxo eletronico.'
    ),
    jsonb_build_object(
      'code', 'lei_13787_retention',
      'title', 'Guarda, integridade e reproducao',
      'summary', 'Artefatos emitidos precisam manter legibilidade em A4, integridade visual e campos estaveis para guarda digital.'
    )
  )
$$;

create or replace function private.document_branding_snapshot(
  p_tenant_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_strip_nulls(
      jsonb_build_object(
        'brandName', coalesce(branding_settings.brand_name, branding_settings.settings ->> 'brandName', branding_settings.settings ->> 'tradeName'),
        'legalName', coalesce(branding_settings.settings ->> 'legalName', branding_settings.brand_name),
        'tradeName', coalesce(branding_settings.settings ->> 'tradeName', branding_settings.brand_name),
        'logoPath', coalesce(branding_settings.logo_path, branding_settings.settings ->> 'logoPath'),
        'primaryColor', coalesce(branding_settings.primary_color, branding_settings.settings ->> 'primaryColor', '#0f766e'),
        'secondaryColor', coalesce(branding_settings.secondary_color, branding_settings.settings ->> 'secondaryColor', '#0f172a'),
        'accentColor', coalesce(branding_settings.settings ->> 'accentColor', branding_settings.primary_color, '#14b8a6'),
        'headerTitle', coalesce(branding_settings.settings ->> 'headerTitle', branding_settings.settings ->> 'tradeName', branding_settings.brand_name),
        'headerSubtitle', branding_settings.settings ->> 'headerSubtitle',
        'crmLabel', branding_settings.settings ->> 'crmLabel',
        'addressLine', branding_settings.settings ->> 'addressLine',
        'contactLine', branding_settings.settings ->> 'contactLine',
        'website', branding_settings.settings ->> 'website',
        'footerNote', branding_settings.settings ->> 'footerNote',
        'signatureNote', branding_settings.settings ->> 'signatureNote',
        'watermarkText', branding_settings.settings ->> 'watermarkText',
        'showLogo', case when branding_settings.settings ? 'showLogo' then (branding_settings.settings ->> 'showLogo')::boolean else true end,
        'showLegalName', case when branding_settings.settings ? 'showLegalName' then (branding_settings.settings ->> 'showLegalName')::boolean else false end,
        'showContactBlock', case when branding_settings.settings ? 'showContactBlock' then (branding_settings.settings ->> 'showContactBlock')::boolean else true end
      )
    )
    from platform.branding_settings as branding_settings
    where branding_settings.tenant_id = p_tenant_id
    limit 1
  ), jsonb_build_object(
    'brandName', 'EmagrecePlus',
    'legalName', 'EmagrecePlus',
    'tradeName', 'EmagrecePlus',
    'primaryColor', '#0f766e',
    'secondaryColor', '#0f172a',
    'accentColor', '#14b8a6',
    'showLogo', false,
    'showLegalName', true,
    'showContactBlock', false
  ))
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

create or replace function api.get_document_layout_studio_snapshot(
  p_legacy_tenant_id text,
  p_legacy_unit_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_context jsonb := api.current_access_context();
  v_runtime_tenant_id uuid;
  v_runtime_unit_id uuid;
  v_tenant record;
  v_unit_name text;
  v_unit_legacy_id text;
begin
  v_runtime_tenant_id := case
    when nullif(trim(coalesce(p_legacy_tenant_id, '')), '') is null
      then nullif(v_context ->> 'tenantId', '')::uuid
    else private.runtime_tenant_id_by_legacy_tenant_id(p_legacy_tenant_id)
  end;

  if v_runtime_tenant_id is null then
    raise exception 'runtime tenant not found for legacy tenant %', p_legacy_tenant_id;
  end if;

  if nullif(trim(coalesce(p_legacy_unit_id, '')), '') is not null then
    select units.id, units.name, units.metadata ->> 'legacy_unit_id'
    into v_runtime_unit_id, v_unit_name, v_unit_legacy_id
    from platform.units as units
    where units.tenant_id = v_runtime_tenant_id
      and units.metadata @> jsonb_build_object('legacy_unit_id', p_legacy_unit_id)
    limit 1;
  else
    v_runtime_unit_id := nullif(v_context ->> 'currentUnitId', '')::uuid;

    if v_runtime_unit_id is not null then
      select units.id, units.name, units.metadata ->> 'legacy_unit_id'
      into v_runtime_unit_id, v_unit_name, v_unit_legacy_id
      from platform.units as units
      where units.id = v_runtime_unit_id
      limit 1;
    end if;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not private.can_read_clinical_domain(v_runtime_tenant_id, v_runtime_unit_id) then
    raise exception 'document layout studio snapshot denied';
  end if;

  select tenants.id, tenants.legacy_tenant_id, tenants.legal_name, tenants.trade_name, tenants.default_timezone
  into v_tenant
  from platform.tenants as tenants
  where tenants.id = v_runtime_tenant_id
  limit 1;

  return jsonb_strip_nulls(
    jsonb_build_object(
      'tenant', jsonb_build_object(
        'id', v_tenant.id::text,
        'legacyTenantId', v_tenant.legacy_tenant_id,
        'legalName', v_tenant.legal_name,
        'tradeName', v_tenant.trade_name,
        'defaultTimezone', v_tenant.default_timezone
      ),
      'unit', case
        when v_runtime_unit_id is null then null
        else jsonb_build_object(
          'id', v_runtime_unit_id::text,
          'legacyUnitId', coalesce(p_legacy_unit_id, v_unit_legacy_id),
          'name', v_unit_name
        )
      end,
      'branding', private.document_branding_snapshot(v_runtime_tenant_id),
      'presets', private.document_layout_presets_json(),
      'standards', private.document_layout_standards_json(),
      'templates', api.list_document_templates(
        coalesce(nullif(trim(coalesce(p_legacy_tenant_id, '')), ''), v_tenant.legacy_tenant_id),
        coalesce(p_legacy_unit_id, nullif(v_unit_legacy_id, '')),
        null
      )
    )
  );
end;
$$;

create or replace function api.update_document_layout_branding(
  p_legacy_tenant_id text,
  p_branding jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_context jsonb := api.current_access_context();
  v_runtime_tenant_id uuid;
begin
  if jsonb_typeof(coalesce(p_branding, '{}'::jsonb)) <> 'object' then
    raise exception 'p_branding must be a json object';
  end if;

  v_runtime_tenant_id := case
    when nullif(trim(coalesce(p_legacy_tenant_id, '')), '') is null
      then nullif(v_context ->> 'tenantId', '')::uuid
    else private.runtime_tenant_id_by_legacy_tenant_id(p_legacy_tenant_id)
  end;

  if v_runtime_tenant_id is null then
    raise exception 'runtime tenant not found for legacy tenant %', p_legacy_tenant_id;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not private.can_manage_clinical_domain(v_runtime_tenant_id, null) then
    raise exception 'document layout branding update denied';
  end if;

  insert into platform.branding_settings (
    tenant_id,
    brand_name,
    primary_color,
    secondary_color,
    logo_path,
    settings
  )
  values (
    v_runtime_tenant_id,
    nullif(trim(coalesce(p_branding ->> 'brandName', p_branding ->> 'tradeName', '')), ''),
    nullif(trim(coalesce(p_branding ->> 'primaryColor', '')), ''),
    nullif(trim(coalesce(p_branding ->> 'secondaryColor', '')), ''),
    nullif(trim(coalesce(p_branding ->> 'logoPath', '')), ''),
    jsonb_strip_nulls(coalesce(p_branding, '{}'::jsonb))
  )
  on conflict (tenant_id) do update
  set brand_name = coalesce(excluded.brand_name, platform.branding_settings.brand_name),
      primary_color = coalesce(excluded.primary_color, platform.branding_settings.primary_color),
      secondary_color = coalesce(excluded.secondary_color, platform.branding_settings.secondary_color),
      logo_path = coalesce(excluded.logo_path, platform.branding_settings.logo_path),
      settings = jsonb_strip_nulls(coalesce(platform.branding_settings.settings, '{}'::jsonb) || coalesce(excluded.settings, '{}'::jsonb)),
      updated_at = now();

  return private.document_branding_snapshot(v_runtime_tenant_id);
end;
$$;

create or replace function api.update_document_template_layout(
  p_legacy_tenant_id text,
  p_template_id uuid,
  p_legacy_unit_id text default null,
  p_title text default null,
  p_description text default null,
  p_summary text default null,
  p_content jsonb default null,
  p_render_schema jsonb default null,
  p_metadata jsonb default '{}'::jsonb,
  p_legacy_updated_by_user_id text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_context jsonb := api.current_access_context();
  v_runtime_tenant_id uuid;
  v_runtime_unit_id uuid;
  v_runtime_template_id uuid;
  v_runtime_current_version_id uuid;
  v_next_version_number integer;
  v_actor_profile_id uuid := private.runtime_profile_id_by_legacy_user_id(p_legacy_updated_by_user_id);
begin
  if p_template_id is null then
    raise exception 'p_template_id is required';
  end if;

  if p_content is not null and jsonb_typeof(p_content) <> 'object' then
    raise exception 'p_content must be a json object';
  end if;

  if p_render_schema is not null and jsonb_typeof(p_render_schema) <> 'object' then
    raise exception 'p_render_schema must be a json object';
  end if;

  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'p_metadata must be a json object';
  end if;

  v_runtime_tenant_id := case
    when nullif(trim(coalesce(p_legacy_tenant_id, '')), '') is null
      then nullif(v_context ->> 'tenantId', '')::uuid
    else private.runtime_tenant_id_by_legacy_tenant_id(p_legacy_tenant_id)
  end;

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
  else
    v_runtime_unit_id := nullif(v_context ->> 'currentUnitId', '')::uuid;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not private.can_manage_clinical_domain(v_runtime_tenant_id, v_runtime_unit_id) then
    raise exception 'document template layout update denied';
  end if;

  select document_templates.id, document_templates.current_version_id
  into v_runtime_template_id, v_runtime_current_version_id
  from docs.document_templates as document_templates
  where document_templates.id = p_template_id
    and document_templates.tenant_id = v_runtime_tenant_id
    and document_templates.deleted_at is null
    and (
      v_runtime_unit_id is null
      or document_templates.unit_id is null
      or document_templates.unit_id = v_runtime_unit_id
    )
  limit 1;

  if v_runtime_template_id is null then
    raise exception 'document template % not found in current scope', p_template_id;
  end if;

  update docs.document_templates
  set title = coalesce(nullif(trim(coalesce(p_title, '')), ''), title),
      description = coalesce(nullif(trim(coalesce(p_description, '')), ''), description),
      updated_at = now()
  where id = v_runtime_template_id;

  if v_runtime_current_version_id is null then
    select coalesce(max(document_template_versions.version_number), 0) + 1
    into v_next_version_number
    from docs.document_template_versions as document_template_versions
    where document_template_versions.document_template_id = v_runtime_template_id;

    insert into docs.document_template_versions (
      document_template_id,
      version_number,
      status,
      title,
      summary,
      content,
      render_schema,
      created_by_profile_id,
      metadata
    )
    select
      v_runtime_template_id,
      coalesce(v_next_version_number, 1),
      'draft',
      coalesce(nullif(trim(coalesce(p_title, '')), ''), document_templates.title),
      nullif(trim(coalesce(p_summary, '')), ''),
      coalesce(p_content, '{}'::jsonb),
      coalesce(p_render_schema, '{}'::jsonb),
      v_actor_profile_id,
      jsonb_strip_nulls(
        jsonb_build_object(
          'source', 'document_layout_studio',
          'legacy_updated_by_user_id', p_legacy_updated_by_user_id
        ) || coalesce(p_metadata, '{}'::jsonb)
      )
    from docs.document_templates as document_templates
    where document_templates.id = v_runtime_template_id
    returning id into v_runtime_current_version_id;
  else
    update docs.document_template_versions
    set title = coalesce(nullif(trim(coalesce(p_title, '')), ''), title),
        summary = coalesce(nullif(trim(coalesce(p_summary, '')), ''), summary),
        content = coalesce(p_content, content),
        render_schema = coalesce(p_render_schema, render_schema),
        metadata = jsonb_strip_nulls(
          coalesce(docs.document_template_versions.metadata, '{}'::jsonb)
          || jsonb_build_object(
            'source', 'document_layout_studio',
            'legacy_updated_by_user_id', p_legacy_updated_by_user_id,
            'layoutUpdatedAt', timezone('utc', now())
          )
          || coalesce(p_metadata, '{}'::jsonb)
        ),
        updated_at = now()
    where id = v_runtime_current_version_id;
  end if;

  return (
    select jsonb_strip_nulls(
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
    from docs.document_templates as document_templates
    left join docs.document_template_versions as document_template_versions
      on document_template_versions.id = document_templates.current_version_id
    where document_templates.id = v_runtime_template_id
    limit 1
  );
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
  v_template_summary text;
  v_template_content jsonb := '{}'::jsonb;
  v_template_render_schema jsonb := '{}'::jsonb;
  v_template_version_id uuid;
  v_tenant_branding jsonb;
  v_actor_profile_id uuid := private.runtime_profile_id_by_legacy_user_id(p_legacy_created_by_user_id);
  v_actor_type text := case when v_actor_profile_id is null then 'system' else 'profile' end;
  v_document_type text;
  v_title text;
  v_summary text;
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

  select encounters.id, encounters.patient_id, encounters.unit_id
  into v_runtime_encounter_id, v_runtime_patient_id, v_runtime_unit_id
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
      coalesce(document_template_versions.title, document_templates.title),
      document_templates.template_kind,
      document_template_versions.summary,
      coalesce(document_template_versions.content, '{}'::jsonb),
      coalesce(document_template_versions.render_schema, '{}'::jsonb),
      document_template_versions.id
    into
      v_template_title,
      v_template_kind,
      v_template_summary,
      v_template_content,
      v_template_render_schema,
      v_template_version_id
    from docs.document_templates as document_templates
    left join docs.document_template_versions as document_template_versions
      on document_template_versions.id = document_templates.current_version_id
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

  v_tenant_branding := private.document_branding_snapshot(v_runtime_tenant_id);

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

  v_summary := coalesce(
    nullif(trim(coalesce(p_summary, '')), ''),
    nullif(trim(coalesce(v_template_summary, '')), '')
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
      'document_template_version_id', v_template_version_id,
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
    coalesce(v_template_content, '{}'::jsonb) || coalesce(p_content, '{}'::jsonb),
    v_issued_at,
    v_actor_profile_id,
    jsonb_strip_nulls(
      v_metadata
      || jsonb_build_object(
        'layoutSchema', coalesce(v_template_render_schema, '{}'::jsonb),
        'tenantBranding', coalesce(v_tenant_branding, '{}'::jsonb),
        'layoutStandards', private.document_layout_standards_json()
      )
    )
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

create or replace function public.get_document_layout_studio_snapshot(
  p_legacy_tenant_id text,
  p_legacy_unit_id text default null
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select api.get_document_layout_studio_snapshot(p_legacy_tenant_id, p_legacy_unit_id)
$$;

create or replace function public.update_document_layout_branding(
  p_legacy_tenant_id text,
  p_branding jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.update_document_layout_branding(p_legacy_tenant_id, p_branding)
$$;

create or replace function public.update_document_template_layout(
  p_legacy_tenant_id text,
  p_template_id uuid,
  p_legacy_unit_id text default null,
  p_title text default null,
  p_description text default null,
  p_summary text default null,
  p_content jsonb default null,
  p_render_schema jsonb default null,
  p_metadata jsonb default '{}'::jsonb,
  p_legacy_updated_by_user_id text default null
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.update_document_template_layout(
    p_legacy_tenant_id,
    p_template_id,
    p_legacy_unit_id,
    p_title,
    p_description,
    p_summary,
    p_content,
    p_render_schema,
    p_metadata,
    p_legacy_updated_by_user_id
  )
$$;

revoke all on function api.get_document_layout_studio_snapshot(text, text) from public, anon, authenticated;
revoke all on function api.update_document_layout_branding(text, jsonb) from public, anon, authenticated;
revoke all on function api.update_document_template_layout(text, uuid, text, text, text, text, jsonb, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.get_document_layout_studio_snapshot(text, text) from public, anon;
revoke all on function public.update_document_layout_branding(text, jsonb) from public, anon;
revoke all on function public.update_document_template_layout(text, uuid, text, text, text, text, jsonb, jsonb, jsonb, text) from public, anon;

grant execute on function api.get_document_layout_studio_snapshot(text, text) to service_role;
grant execute on function api.update_document_layout_branding(text, jsonb) to service_role;
grant execute on function api.update_document_template_layout(text, uuid, text, text, text, text, jsonb, jsonb, jsonb, text) to service_role;
grant execute on function public.get_document_layout_studio_snapshot(text, text) to authenticated, service_role;
grant execute on function public.update_document_layout_branding(text, jsonb) to authenticated, service_role;
grant execute on function public.update_document_template_layout(text, uuid, text, text, text, text, jsonb, jsonb, jsonb, text) to authenticated, service_role;
