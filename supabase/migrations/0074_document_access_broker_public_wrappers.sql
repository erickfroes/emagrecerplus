create or replace function public.list_accessible_patient_documents(
  p_legacy_tenant_id text,
  p_legacy_unit_id text default null,
  p_patient_id text default null,
  p_status text default null,
  p_document_type text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select api.list_accessible_patient_documents(
    p_legacy_tenant_id,
    p_legacy_unit_id,
    p_patient_id,
    p_status,
    p_document_type,
    p_limit,
    p_offset
  )
$$;

create or replace function public.prepare_patient_document_access(
  p_legacy_tenant_id text,
  p_document_id text,
  p_artifact_id text default null,
  p_legacy_unit_id text default null
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select api.prepare_patient_document_access(
    p_legacy_tenant_id,
    p_document_id,
    p_artifact_id,
    p_legacy_unit_id
  )
$$;

create or replace function public.record_patient_document_access_event(
  p_legacy_tenant_id text,
  p_document_id text,
  p_access_action text,
  p_access_status text default 'granted',
  p_artifact_id text default null,
  p_document_version_id text default null,
  p_legacy_unit_id text default null,
  p_signed_url_expires_at timestamptz default null,
  p_storage_bucket text default 'patient-documents',
  p_storage_object_path text default null,
  p_legacy_actor_user_id text default null,
  p_request_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.record_patient_document_access_event(
    p_legacy_tenant_id,
    p_document_id,
    p_access_action,
    p_access_status,
    p_artifact_id,
    p_document_version_id,
    p_legacy_unit_id,
    p_signed_url_expires_at,
    p_storage_bucket,
    p_storage_object_path,
    p_legacy_actor_user_id,
    p_request_metadata
  )
$$;

revoke all on function public.list_accessible_patient_documents(text, text, text, text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.prepare_patient_document_access(text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.record_patient_document_access_event(text, text, text, text, text, text, text, timestamptz, text, text, text, jsonb)
  from public, anon, authenticated;

grant execute on function public.list_accessible_patient_documents(text, text, text, text, text, integer, integer)
  to service_role;
grant execute on function public.prepare_patient_document_access(text, text, text, text)
  to service_role;
grant execute on function public.record_patient_document_access_event(text, text, text, text, text, text, text, timestamptz, text, text, text, jsonb)
  to service_role;
