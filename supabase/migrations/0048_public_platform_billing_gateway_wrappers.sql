create or replace function public.register_tenant_billing_gateway_session(
  p_runtime_tenant_id uuid,
  p_provider text,
  p_flow text,
  p_subscription_id uuid default null,
  p_plan_code text default null,
  p_external_session_id text default null,
  p_external_customer_id text default null,
  p_external_subscription_id text default null,
  p_checkout_url text default null,
  p_success_url text default null,
  p_cancel_url text default null,
  p_return_url text default null,
  p_expires_at timestamptz default null,
  p_status text default null,
  p_idempotency_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.register_tenant_billing_gateway_session(
    p_runtime_tenant_id,
    p_provider,
    p_flow,
    p_subscription_id,
    p_plan_code,
    p_external_session_id,
    p_external_customer_id,
    p_external_subscription_id,
    p_checkout_url,
    p_success_url,
    p_cancel_url,
    p_return_url,
    p_expires_at,
    p_status,
    p_idempotency_key,
    p_metadata
  )
$$;

create or replace function public.consume_tenant_billing_webhook(
  p_provider text,
  p_event_id text,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb,
  p_idempotency_key text default null,
  p_runtime_tenant_id uuid default null
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select api.consume_tenant_billing_webhook(
    p_provider,
    p_event_id,
    p_event_type,
    p_payload,
    p_idempotency_key,
    p_runtime_tenant_id
  )
$$;

revoke all on function public.register_tenant_billing_gateway_session(uuid, text, text, uuid, text, text, text, text, text, text, text, text, timestamptz, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.consume_tenant_billing_webhook(text, text, text, jsonb, text, uuid) from public, anon, authenticated;

grant execute on function public.register_tenant_billing_gateway_session(uuid, text, text, uuid, text, text, text, text, text, text, text, text, timestamptz, text, text, jsonb) to service_role;
grant execute on function public.consume_tenant_billing_webhook(text, text, text, jsonb, text, uuid) to service_role;
