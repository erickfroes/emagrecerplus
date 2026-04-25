import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import {
  currentProvider,
  normalizeMockWebhookEvent,
  normalizeStripeWebhookEvent,
  verifyStripeWebhookSignature,
} from "../_shared/billing-provider.ts";
import { createEdgeServiceClient } from "../_shared/supabase.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return handleOptions(request);
  }

  if (request.method !== "POST") {
    return jsonResponse(request, 405, { error: "Method not allowed" });
  }

  const provider = currentProvider();
  const serviceClient = createEdgeServiceClient();

  try {
    let normalizedEvent;

    if (provider === "stripe") {
      const rawBody = await request.text();
      const signature = request.headers.get("stripe-signature");

      if (!signature) {
        return jsonResponse(request, 400, { error: "Missing Stripe signature header" });
      }

      await verifyStripeWebhookSignature(rawBody, signature);
      const parsedBody = JSON.parse(rawBody);
      normalizedEvent = normalizeStripeWebhookEvent(parsedBody);

      if (!normalizedEvent) {
        return jsonResponse(request, 200, {
          ok: true,
          ignored: true,
          provider,
        });
      }
    } else {
      const parsedBody = await request.json().catch(() => null);
      normalizedEvent = normalizeMockWebhookEvent(parsedBody);
    }

    const { data, error } = await serviceClient.rpc("consume_tenant_billing_webhook", {
        p_provider: normalizedEvent.provider,
        p_event_id: normalizedEvent.eventId,
        p_event_type: normalizedEvent.eventType,
        p_payload: normalizedEvent.payload,
        p_idempotency_key: normalizedEvent.eventId,
        p_runtime_tenant_id:
          typeof normalizedEvent.payload.tenantId === "string"
            ? normalizedEvent.payload.tenantId
            : null,
      });

    if (error || !data) {
      return jsonResponse(request, 500, {
        error: "Failed to consume billing webhook",
        details: error?.message ?? null,
      });
    }

    const snapshot = data as Record<string, unknown>;
    if (snapshot.processingStatus === "failed" || snapshot.ok === false) {
      return jsonResponse(request, 500, snapshot);
    }

    return jsonResponse(request, 200, snapshot);
  } catch (error) {
    return jsonResponse(request, 500, {
      error: "Unhandled billing webhook error",
      details: error instanceof Error ? error.message : "Unknown billing webhook error",
    });
  }
});
