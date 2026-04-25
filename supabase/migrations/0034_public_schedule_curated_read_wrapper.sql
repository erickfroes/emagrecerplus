create or replace function public.list_appointments(
  p_date date default null,
  p_status text default null,
  p_professional text default null,
  p_unit text default null,
  p_current_legacy_unit_id text default null
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select api.list_appointments(
    p_date,
    p_status,
    p_professional,
    p_unit,
    p_current_legacy_unit_id
  )
$$;

revoke all on function public.list_appointments(date, text, text, text, text) from public, anon;
grant execute on function public.list_appointments(date, text, text, text, text) to authenticated, service_role;
