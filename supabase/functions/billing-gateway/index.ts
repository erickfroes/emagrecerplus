import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import {
  type BillingPlanRow,
  createGatewaySession,
  currentProvider,
  type TenantBillingSummary,
} from "../_shared/billing-provider.ts";
import { getAppBaseUrl } from "../_shared/env.ts";
import { createEdgeServiceClient, createEdgeUserClient } from "../_shared/supabase.ts";

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeFlow(value: unknown): "checkout" | "portal" | null {
  const normalized = asNonEmptyString(value)?.toLowerCase();
  if (normalized === "checkout" || normalized === "portal") {
    return normalized;
  }

  return null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return handleOptions(request);
  }

  if (request.method !== "POST") {
    return jsonResponse(request, 405, { error: "Method not allowed" });
  }

  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return jsonResponse(request, 401, { error: "Missing authorization header" });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse(request, 400, { error: "Invalid request body" });
  }

  const flow = normalizeFlow((body as Record<string, unknown>).flow);
  if (!flow) {
    return jsonResponse(request, 400, { error: "Invalid billing flow" });
  }

  const userClient = createEdgeUserClient(authorization);
  const { data: billingSummary, error: billingSummaryError } = await userClient.rpc(
    "current_tenant_billing_summary",
  );

  if (billingSummaryError || !billingSummary) {
    return jsonResponse(request, 403, {
      error: "Unable to resolve tenant billing context",
      details: billingSummaryError?.message ?? null,
    });
  }

  const normalizedSummary = billingSummary as TenantBillingSummary;
  const tenantId = asNonEmptyString(normalizedSummary.tenantId);
  if (!tenantId) {
    return jsonResponse(request, 403, { error: "Missing tenant context" });
  }

  const appBaseUrl = getAppBaseUrl();
  const requestedPlanCode = asNonEmptyString((body as Record<string, unknown>).planCode);
  const planCode =
    flow === "checkout"
      ? requestedPlanCode ?? asNonEmptyString(normalizedSummary.plan?.code)
      : requestedPlanCode ?? asNonEmptyString(normalizedSummary.plan?.code);

  const successUrl =
    asNonEmptyString((body as Record<string, unknown>).successUrl) ??
    `${appBaseUrl}/settings/billing?status=success`;
  const cancelUrl =
    asNonEmptyString((body as Record<string, unknown>).cancelUrl) ??
    `${appBaseUrl}/settings/billing?status=cancel`;
  const returnUrl =
    asNonEmptyString((body as Record<string, unknown>).returnUrl) ??
    `${appBaseUrl}/settings/billing`;
  const idempotencyKey =
    asNonEmptyString((body as Record<string, unknown>).idempotencyKey) ??
    request.headers.get("x-idempotency-key")?.trim() ??
    crypto.randomUUID();

  const serviceClient = createEdgeServiceClient();
  let planRow: BillingPlanRow | null = null;

  if (flow === "checkout") {
    if (!planCode) {
      return jsonResponse(request, 400, {
        error: "Checkout flow requires a planCode or an active tenant plan",
      });
    }

    const { data, error } = await serviceClient
      .schema("platform")
      .from("tenant_plans")
      .select("id, code, name, billing_interval, currency_code, price_amount, metadata")
      .eq("code", planCode)
      .is("deleted_at", null)
      .single();

    if (error || !data) {
      return jsonResponse(request, 404, {
        error: "Plan not found for billing gateway",
        details: error?.message ?? null,
      });
    }

    planRow = data as BillingPlanRow;
  }

  try {
    const provider = currentProvider();
    const gatewaySession = await createGatewaySession({
      provider,
      flow,
      idempotencyKey,
      tenantId,
      planCode,
      currentSubscriptionId: asNonEmptyString(normalizedSummary.subscription?.id),
      externalCustomerId:
        asNonEmptyString(normalizedSummary.subscription?.externalCustomerId) ?? null,
      successUrl,
      cancelUrl,
      returnUrl,
      plan: planRow,
    });

    const { data: registeredSession, error: registerError } = await serviceClient.rpc(
      "register_tenant_billing_gateway_session",
      {
        p_runtime_tenant_id: tenantId,
        p_provider: gatewaySession.provider,
        p_flow: gatewaySession.flow,
        p_subscription_id: asNonEmptyString(normalizedSummary.subscription?.id),
        p_plan_code: planCode,
        p_external_session_id: gatewaySession.sessionId,
        p_external_customer_id: gatewaySession.externalCustomerId,
        p_external_subscription_id: gatewaySession.externalSubscriptionId,
        p_checkout_url: gatewaySession.checkoutUrl,
        p_success_url: successUrl,
        p_cancel_url: cancelUrl,
        p_return_url: returnUrl,
        p_expires_at: gatewaySession.expiresAt,
        p_status: "ready",
        p_idempotency_key: idempotencyKey,
        p_metadata: gatewaySession.metadata,
      },
    );

    if (registerError || !registeredSession) {
      return jsonResponse(request, 500, {
        error: "Failed to register billing gateway session",
        details: registerError?.message ?? null,
      });
    }

    return jsonResponse(request, 200, {
      tenantId,
      provider: gatewaySession.provider,
      flow: gatewaySession.flow,
      idempotencyKey,
      session: registeredSession,
      redirectUrl: gatewaySession.checkoutUrl,
    });
  } catch (error) {
    return jsonResponse(request, 500, {
      error: "Failed to create billing gateway session",
      details: error instanceof Error ? error.message : "Unknown billing gateway error",
    });
  }
});
