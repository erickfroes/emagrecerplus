grant usage on schema public to authenticated;
grant usage on schema public to service_role;

create or replace function public.upsert_legacy_auth_projection(
  p_auth_user_id uuid,
  p_email text,
  p_full_name text,
  p_phone text default null,
  p_user_status text default 'ACTIVE',
  p_legacy_user_id text default null,
  p_legacy_tenant_id text default null,
  p_legacy_tenant_legal_name text default null,
  p_legacy_tenant_trade_name text default null,
  p_legacy_tenant_status text default 'ACTIVE',
  p_subscription_plan_code text default null,
  p_app_role_code text default 'assistant',
  p_units jsonb default '[]'::jsonb
)
returns jsonb
language sql
set search_path = ''
as $$
  select api.upsert_legacy_auth_projection(
    p_auth_user_id,
    p_email,
    p_full_name,
    p_phone,
    p_user_status,
    p_legacy_user_id,
    p_legacy_tenant_id,
    p_legacy_tenant_legal_name,
    p_legacy_tenant_trade_name,
    p_legacy_tenant_status,
    p_subscription_plan_code,
    p_app_role_code,
    p_units
  )
$$;

create or replace function public.current_app_session(p_current_unit_id uuid default null)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select api.current_app_session(p_current_unit_id)
$$;

revoke all on function public.upsert_legacy_auth_projection(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) from public, anon, authenticated;

grant execute on function public.upsert_legacy_auth_projection(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) to service_role;

revoke all on function public.current_app_session(uuid) from public, anon;
grant execute on function public.current_app_session(uuid) to authenticated, service_role;
