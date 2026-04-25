import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import {
  currentDocumentSignatureProvider,
  normalizeMockDocumentSignatureWebhookEvent,
} from "../_shared/document-signature-provider.ts";
import { createEdgeServiceClient } from "../_shared/supabase.ts";

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return handleOptions(request);
  }

  if (request.method !== "POST") {
    return jsonResponse(request, 405, { error: "Method not allowed" });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse(request, 400, { error: "Invalid request body" });
  }

  const provider =
    asNonEmptyString((body as Record<string, unknown>).provider) ?? currentDocumentSignatureProvider();
  const normalizedEvent = (() => {
    try {
      return normalizeMockDocumentSignatureWebhookEvent({
        ...(body as Record<string, unknown>),
        provider,
        eventId:
          asNonEmptyString((body as Record<string, unknown>).eventId) ?? crypto.randomUUID(),
      });
    } catch (error) {
      return error instanceof Error ? error : new Error("Invalid signature webhook payload.");
    }
  })();

  if (normalizedEvent instanceof Error) {
    return jsonResponse(request, 400, { error: normalizedEvent.message });
  }

  const serviceClient = createEdgeServiceClient();

  const { data, error } = await serviceClient.rpc("consume_document_signature_webhook", {
    p_provider: normalizedEvent.provider,
    p_event_id: normalizedEvent.eventId,
    p_request_status: normalizedEvent.requestStatus,
    p_signature_request_id: normalizedEvent.signatureRequestId,
    p_document_id: normalizedEvent.documentId,
    p_external_request_id: normalizedEvent.externalRequestId,
    p_completed_at: normalizedEvent.completedAt,
    p_payload: normalizedEvent.payload,
    p_idempotency_key:
      asNonEmptyString((body as Record<string, unknown>).idempotencyKey) ?? normalizedEvent.eventId,
  });

  if (error || !data) {
    return jsonResponse(request, 500, {
      error: "Failed to consume document signature webhook",
      details: error?.message ?? null,
    });
  }

  const snapshot = data as Record<string, unknown>;
  if (snapshot.ok === false) {
    return jsonResponse(request, 500, snapshot);
  }

  return jsonResponse(request, 200, snapshot);
});
