create or replace function private.set_audit_event_request_id_from_payload()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  new.request_id := coalesce(
    new.request_id,
    private.try_uuid(new.payload ->> 'correlationId'),
    private.try_uuid(new.payload ->> 'correlation_id')
  );

  return new;
end;
$$;

drop trigger if exists set_audit_event_request_id_from_payload on audit.audit_events;
create trigger set_audit_event_request_id_from_payload
before insert or update of payload, request_id on audit.audit_events
for each row execute function private.set_audit_event_request_id_from_payload();

revoke all on function private.set_audit_event_request_id_from_payload()
  from public, anon, authenticated;
grant execute on function private.set_audit_event_request_id_from_payload()
  to service_role;
