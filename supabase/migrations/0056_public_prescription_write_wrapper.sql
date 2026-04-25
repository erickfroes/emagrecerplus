create or replace function public.record_prescription_for_encounter(
  p_legacy_tenant_id text,
  p_legacy_encounter_id text,
  p_legacy_prescription_id text default null,
  p_prescription_type text default 'other',
  p_summary text default null,
  p_legacy_issued_by_user_id text default null,
  p_issued_at timestamptz default now(),
  p_items jsonb default '[]'::jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.record_prescription_for_encounter(
    p_legacy_tenant_id,
    p_legacy_encounter_id,
    p_legacy_prescription_id,
    p_prescription_type,
    p_summary,
    p_legacy_issued_by_user_id,
    p_issued_at,
    p_items,
    p_metadata
  )
$$;

revoke all on function public.record_prescription_for_encounter(text, text, text, text, text, text, timestamptz, jsonb, jsonb) from public, anon, authenticated;

grant execute on function public.record_prescription_for_encounter(text, text, text, text, text, text, timestamptz, jsonb, jsonb) to service_role;
