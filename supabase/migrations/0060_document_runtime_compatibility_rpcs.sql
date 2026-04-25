create or replace function api.request_document_signature(
  p_legacy_tenant_id text,
  p_legacy_unit_id text default null,
  p_document_reference text default null,
  p_signer_type text default 'patient',
  p_signer_name text default null,
  p_signer_email text default null,
  p_provider_code text default 'mock_internal',
  p_expires_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb,
  p_legacy_created_by_user_id text default null
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.create_document_signature_request(
    p_legacy_tenant_id,
    p_document_reference,
    p_legacy_unit_id,
    p_signer_type,
    p_signer_name,
    p_signer_email,
    p_provider_code,
    p_expires_at,
    p_metadata,
    p_legacy_created_by_user_id
  )
$$;

create or replace function api.generate_document_printable_artifact(
  p_legacy_tenant_id text,
  p_legacy_unit_id text default null,
  p_document_reference text default null,
  p_artifact_kind text default 'preview',
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
  v_document_snapshot jsonb;
  v_document_runtime_id text;
  v_artifact_kind text := lower(coalesce(nullif(trim(coalesce(p_artifact_kind, '')), ''), 'preview'));
  v_rendered_html text;
  v_storage_object_path text;
begin
  if v_artifact_kind not in ('preview', 'html', 'pdf', 'print_package') then
    v_artifact_kind := 'preview';
  end if;

  v_document_snapshot := api.get_patient_document_snapshot(
    p_legacy_tenant_id,
    p_document_reference,
    p_legacy_unit_id
  );

  v_document_runtime_id := coalesce(
    nullif(v_document_snapshot ->> 'runtimeId', ''),
    nullif(v_document_snapshot ->> 'id', ''),
    p_document_reference
  );

  v_storage_object_path := format(
    'generated://%s/%s-%s.html',
    v_document_runtime_id,
    v_artifact_kind,
    to_char(now() at time zone 'utc', 'YYYYMMDDHH24MISSMS')
  );

  v_rendered_html := concat(
    '<article><h1>',
    coalesce(v_document_snapshot ->> 'title', 'Documento'),
    '</h1><p>',
    coalesce(v_document_snapshot ->> 'summary', ''),
    '</p><pre>',
    coalesce((v_document_snapshot #> '{currentVersion,content}')::text, '{}'),
    '</pre></article>'
  );

  return api.register_document_printable_artifact(
    p_legacy_tenant_id,
    p_document_reference,
    p_legacy_unit_id,
    v_artifact_kind,
    'rendered',
    v_storage_object_path,
    v_rendered_html,
    md5(v_rendered_html),
    null,
    now(),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'source', 'compat_rpc_generate_document_printable_artifact'
    ),
    p_legacy_created_by_user_id
  );
end;
$$;

create or replace function public.request_document_signature(
  p_legacy_tenant_id text,
  p_legacy_unit_id text default null,
  p_document_reference text default null,
  p_signer_type text default 'patient',
  p_signer_name text default null,
  p_signer_email text default null,
  p_provider_code text default 'mock_internal',
  p_expires_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb,
  p_legacy_created_by_user_id text default null
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.request_document_signature(
    p_legacy_tenant_id,
    p_legacy_unit_id,
    p_document_reference,
    p_signer_type,
    p_signer_name,
    p_signer_email,
    p_provider_code,
    p_expires_at,
    p_metadata,
    p_legacy_created_by_user_id
  )
$$;

create or replace function public.generate_document_printable_artifact(
  p_legacy_tenant_id text,
  p_legacy_unit_id text default null,
  p_document_reference text default null,
  p_artifact_kind text default 'preview',
  p_metadata jsonb default '{}'::jsonb,
  p_legacy_created_by_user_id text default null
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.generate_document_printable_artifact(
    p_legacy_tenant_id,
    p_legacy_unit_id,
    p_document_reference,
    p_artifact_kind,
    p_metadata,
    p_legacy_created_by_user_id
  )
$$;

revoke all on function api.request_document_signature(text, text, text, text, text, text, text, timestamptz, jsonb, text) from public, anon, authenticated;
revoke all on function api.generate_document_printable_artifact(text, text, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.request_document_signature(text, text, text, text, text, text, text, timestamptz, jsonb, text) from public, anon, authenticated;
revoke all on function public.generate_document_printable_artifact(text, text, text, text, jsonb, text) from public, anon, authenticated;

grant execute on function api.request_document_signature(text, text, text, text, text, text, text, timestamptz, jsonb, text) to service_role;
grant execute on function api.generate_document_printable_artifact(text, text, text, text, jsonb, text) to service_role;
grant execute on function public.request_document_signature(text, text, text, text, text, text, text, timestamptz, jsonb, text) to service_role;
grant execute on function public.generate_document_printable_artifact(text, text, text, text, jsonb, text) to service_role;
