import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import {
  currentDocumentSignatureProvider,
  extractD4SignDocumentUuid,
  normalizeD4SignDocumentSignatureWebhookEvent,
  normalizeD4SignHmacStrategy,
  normalizeMockDocumentSignatureWebhookEvent,
  resolveDocumentSignatureProvider,
  sha256HexText,
  validateD4SignContentHmac,
  type DocumentSignatureProviderDescriptor,
  type NormalizedDocumentSignatureEvent,
} from "../_shared/document-signature-provider.ts";
import { getOptionalEnv } from "../_shared/env.ts";
import { createEdgeServiceClient } from "../_shared/supabase.ts";

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function recordProviderReadiness(params: {
  descriptor: DocumentSignatureProviderDescriptor;
  documentId: string | null;
  hmacStrategy: string | null;
  hmacValid: boolean | null;
  legacyTenantId: string | null;
  providerEventHash: string;
  providerPayloadHash: string;
  rawEventHash: string;
  requestStatus: string;
  serviceClient: ReturnType<typeof createEdgeServiceClient>;
  signatureRequestId: string | null;
  verificationMethod: string;
}) {
  if (!params.documentId && !params.signatureRequestId) {
    return null;
  }

  const { error } = await params.serviceClient.rpc(
    "record_document_signature_provider_readiness",
    {
      p_legacy_tenant_id: params.legacyTenantId,
      p_document_id: params.documentId,
      p_signature_request_id: params.signatureRequestId,
      p_legacy_unit_id: null,
      p_provider: params.descriptor.providerCode,
      p_provider_mode: params.descriptor.providerMode,
      p_provider_status:
        params.descriptor.providerMode === "simulated"
          ? "simulated_webhook_received"
          : params.descriptor.providerStatus,
      p_request_status: params.requestStatus,
      p_external_document_id: null,
      p_external_envelope_id: null,
      p_provider_event_hash: params.providerEventHash,
      p_raw_event_hash: params.rawEventHash,
      p_verification_method: params.verificationMethod,
      p_verification_status:
        params.descriptor.providerCode === "d4sign" ? "pending" : "not_required",
      p_verification_failure_reason: null,
      p_verified_at: null,
      p_provider_payload_hash: params.providerPayloadHash,
      p_metadata: {
        adapterCode: params.descriptor.adapterCode,
        edgeFunction: "document-signature-webhook",
        hmacStrategy: params.hmacStrategy,
        hmacValid: params.hmacValid,
        providerEventHash: params.providerEventHash,
        rawEventHash: params.rawEventHash,
        realProviderImplemented: false,
      },
    },
  );

  if (error) {
    console.error("[document-signature-webhook] Failed to record provider readiness.", error);
  }

  return null;
}

function normalizeMockEvent(body: Record<string, unknown>, provider: string) {
  return normalizeMockDocumentSignatureWebhookEvent({
    ...body,
    provider,
    eventId: asNonEmptyString(body.eventId) ?? crypto.randomUUID(),
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return handleOptions(request);
  }

  if (request.method !== "POST") {
    return jsonResponse(request, 405, { error: "Method not allowed" });
  }

  const rawBody = await request.text();
  const body = (() => {
    try {
      const parsed = JSON.parse(rawBody);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  })();

  if (!body) {
    return jsonResponse(request, 400, { error: "Invalid request body" });
  }

  const providerInput = asNonEmptyString(body.provider) ?? currentDocumentSignatureProvider();
  const descriptor = resolveDocumentSignatureProvider({
    provider: providerInput,
    providerMode: body.providerMode,
  });
  const rawEventHash = await sha256HexText(rawBody);

  let normalizedEvent: NormalizedDocumentSignatureEvent | Error;
  let providerEventHash: string | null = null;
  let verificationMethod: string | null = null;
  let hmacResult:
    | Awaited<ReturnType<typeof validateD4SignContentHmac>>
    | null = null;

  if (descriptor.providerCode === "d4sign") {
    const hmacStrategy = normalizeD4SignHmacStrategy(
      body.hmacStrategy ?? getOptionalEnv("D4SIGN_HMAC_STRATEGY"),
    );
    const documentUuid = extractD4SignDocumentUuid(body);
    hmacResult = await validateD4SignContentHmac({
      contentHmacHeader: request.headers.get("content-hmac"),
      documentUuid,
      providerMode: descriptor.providerMode,
      rawBody,
      secret: getOptionalEnv("D4SIGN_WEBHOOK_SECRET"),
      strategy: hmacStrategy,
    });

    if (!hmacResult.valid) {
      return jsonResponse(request, 401, {
        error: "invalid_d4sign_hmac",
        hmac: {
          reason: hmacResult.reason,
          strategy: hmacResult.strategy,
          valid: false,
        },
        ok: false,
        provider: "d4sign",
        providerMode: descriptor.providerMode,
      });
    }

    providerEventHash = await sha256HexText(
      `d4sign:${documentUuid ?? "unknown"}:${rawEventHash}`,
    );
    verificationMethod = `d4sign_hmac_${hmacStrategy}_${descriptor.providerMode}`;
    normalizedEvent = (() => {
      try {
        return normalizeD4SignDocumentSignatureWebhookEvent(body, {
          hmac: hmacResult!,
          providerEventHash: providerEventHash!,
          providerMode: descriptor.providerMode,
          rawEventHash,
          verificationMethod: verificationMethod!,
        });
      } catch (error) {
        return error instanceof Error ? error : new Error("Invalid D4Sign webhook payload.");
      }
    })();
  } else {
    normalizedEvent = (() => {
      try {
        return normalizeMockEvent(body, providerInput);
      } catch (error) {
        return error instanceof Error ? error : new Error("Invalid signature webhook payload.");
      }
    })();
  }

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
      asNonEmptyString(body.idempotencyKey) ?? providerEventHash ?? normalizedEvent.eventId,
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

  if (descriptor.providerCode === "d4sign" && providerEventHash && verificationMethod) {
    await recordProviderReadiness({
      descriptor,
      documentId: normalizedEvent.documentId,
      hmacStrategy: hmacResult?.strategy ?? null,
      hmacValid: hmacResult?.valid ?? null,
      legacyTenantId: asNonEmptyString(body.legacyTenantId) ?? null,
      providerEventHash,
      providerPayloadHash: providerEventHash,
      rawEventHash,
      requestStatus: normalizedEvent.requestStatus,
      serviceClient,
      signatureRequestId: normalizedEvent.signatureRequestId,
      verificationMethod,
    });
  }

  return jsonResponse(request, 200, {
    ...snapshot,
    hmac: hmacResult
      ? {
          reason: hmacResult.reason,
          strategy: hmacResult.strategy,
          valid: hmacResult.valid,
        }
      : undefined,
    providerEventHash,
    providerMode: descriptor.providerMode,
    rawEventHash: descriptor.providerCode === "d4sign" ? rawEventHash : undefined,
  });
});
