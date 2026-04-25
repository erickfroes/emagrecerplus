alter function public.list_accessible_patient_documents(text, text, text, text, text, integer, integer)
  security invoker;
alter function public.list_accessible_patient_documents(text, text, text, text, text, integer, integer)
  set search_path = '';

alter function public.prepare_patient_document_access(text, text, text, text)
  security invoker;
alter function public.prepare_patient_document_access(text, text, text, text)
  set search_path = '';

alter function public.record_patient_document_access_event(text, text, text, text, text, text, text, timestamptz, text, text, text, jsonb)
  security invoker;
alter function public.record_patient_document_access_event(text, text, text, text, text, text, text, timestamptz, text, text, text, jsonb)
  set search_path = '';

alter function api.list_accessible_patient_documents(text, text, text, text, text, integer, integer)
  security definer;
alter function api.list_accessible_patient_documents(text, text, text, text, text, integer, integer)
  set search_path = '';

alter function api.prepare_patient_document_access(text, text, text, text)
  security definer;
alter function api.prepare_patient_document_access(text, text, text, text)
  set search_path = '';

alter function api.record_patient_document_access_event(text, text, text, text, text, text, text, timestamptz, text, text, text, jsonb)
  security definer;
alter function api.record_patient_document_access_event(text, text, text, text, text, text, text, timestamptz, text, text, text, jsonb)
  set search_path = '';

revoke all on function public.list_accessible_patient_documents(text, text, text, text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.prepare_patient_document_access(text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.record_patient_document_access_event(text, text, text, text, text, text, text, timestamptz, text, text, text, jsonb)
  from public, anon, authenticated;

revoke all on function api.list_accessible_patient_documents(text, text, text, text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function api.prepare_patient_document_access(text, text, text, text)
  from public, anon, authenticated;
revoke all on function api.record_patient_document_access_event(text, text, text, text, text, text, text, timestamptz, text, text, text, jsonb)
  from public, anon, authenticated;

grant execute on function public.list_accessible_patient_documents(text, text, text, text, text, integer, integer)
  to service_role;
grant execute on function public.prepare_patient_document_access(text, text, text, text)
  to service_role;
grant execute on function public.record_patient_document_access_event(text, text, text, text, text, text, text, timestamptz, text, text, text, jsonb)
  to service_role;

grant execute on function api.list_accessible_patient_documents(text, text, text, text, text, integer, integer)
  to service_role;
grant execute on function api.prepare_patient_document_access(text, text, text, text)
  to service_role;
grant execute on function api.record_patient_document_access_event(text, text, text, text, text, text, text, timestamptz, text, text, text, jsonb)
  to service_role;
