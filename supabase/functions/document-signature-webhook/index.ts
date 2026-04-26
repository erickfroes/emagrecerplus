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
import {
  edgeObservabilityMetadata,
  logEdgeDocumentOperationalEvent,
  resolveEdgeCorrelationId,
  safeEdgeErrorMessage,
} from "../_shared/document-observability.ts";
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
  correlationId: string;
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
        ...edgeObservabilityMetadata(
          params.correlationId,
          "document.signature_provider_readiness_recorded",
        ),
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
    logEdgeDocumentOperationalEvent("warn", {
      correlationId: params.correlationId,
      documentId: params.documentId,
      errorMessage: safeEdgeErrorMessage(error.message),
      event: "document.signature_provider_readiness_failed",
      operation: "document-signature-webhook",
      provider: params.descriptor.providerCode,
      providerMode: params.descriptor.providerMode,
      signatureRequestId: params.signatureRequestId,
    });
  }

  return null;
}

async function recordOperationalEvent(params: {
  descriptor: DocumentSignatureProviderDescriptor;
  documentId: string | null;
  eventType: string;
  correlationId: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  hmacStrategy?: string | null;
  idempotencyKey?: string | null;
  legacyTenantId?: string | null;
  providerEventHash?: string | null;
  rawEventHash?: string | null;
  serviceClient?: ReturnType<typeof createEdgeServiceClient>;
  severity?: "error" | "info" | "warning";
  signatureRequestId?: string | null;
  status?: string | null;
}) {
  try {
    const serviceClient = params.serviceClient ?? createEdgeServiceClient();
    const { error } = await serviceClient.rpc("record_document_operational_event", {
      p_event_category: "webhook",
      p_event_type: params.eventType,
      p_legacy_tenant_id: params.legacyTenantId ?? null,
      p_legacy_unit_id: null,
      p_document_id: params.documentId,
      p_signature_request_id: params.signatureRequestId ?? null,
      p_external_request_id: null,
      p_severity: params.severity ?? "info",
      p_provider: params.descriptor.providerCode,
      p_provider_mode: params.descriptor.providerMode,
      p_status: params.status ?? null,
      p_error_code: params.errorCode ?? null,
      p_error_message: params.errorMessage ?? null,
      p_correlation_id: params.correlationId,
      p_idempotency_key: params.idempotencyKey ?? null,
      p_provider_event_hash: params.providerEventHash ?? null,
      p_raw_event_hash: params.rawEventHash ?? null,
      p_metadata: {
        ...edgeObservabilityMetadata(params.correlationId, params.eventType),
        adapterCode: params.descriptor.adapterCode,
        edgeFunction: "document-signature-webhook",
        hmacStrategy: params.hmacStrategy ?? null,
        realProviderImplemented: false,
      },
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    logEdgeDocumentOperationalEvent("warn", {
      correlationId: params.correlationId,
      errorMessage: safeEdgeErrorMessage(error),
      event: "document.operational_event_record_failed",
      operation: "document-signature-webhook",
      provider: params.descriptor.providerCode,
      providerMode: params.descriptor.providerMode,
    });
  }
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
  const correlationId = resolveEdgeCorrelationId(
    request.headers.get("x-correlation-id"),
    isRecord(body) ? body.correlationId : null,
  );

  if (!body) {
    logEdgeDocumentOperationalEvent("warn", {
      correlationId,
      event: "document.signature_webhook_invalid_body",
      operation: "document-signature-webhook",
    });
    return jsonResponse(request, 400, { correlationId, error: "Invalid request body" });
  }

  const providerInput = asNonEmptyString(body.provider) ?? currentDocumentSignatureProvider();
  const descriptor = resolveDocumentSignatureProvider({
    provider: providerInput,
    providerMode: body.providerMode,
  });
  const rawEventHash = await sha256HexText(rawBody);

  logEdgeDocumentOperationalEvent("info", {
    correlationId,
    event: "document.signature_webhook_received",
    operation: "document-signature-webhook",
    provider: descriptor.providerCode,
    providerMode: descriptor.providerMode,
    rawEventHash,
  });

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
      logEdgeDocumentOperationalEvent("warn", {
        correlationId,
        event: "document.signature_webhook_hmac_invalid",
        hmacReason: hmacResult.reason,
        hmacStrategy: hmacResult.strategy,
        operation: "document-signature-webhook",
        provider: "d4sign",
        providerMode: descriptor.providerMode,
        rawEventHash,
      });
      await recordOperationalEvent({
        descriptor,
        documentId: asNonEmptyString(body.documentId),
        eventType: "document.signature_webhook_hmac_invalid",
        correlationId,
        errorCode: "invalid_d4sign_hmac",
        errorMessage: hmacResult.reason,
        hmacStrategy: hmacResult.strategy,
        legacyTenantId: asNonEmptyString(body.legacyTenantId),
        rawEventHash,
        severity: "error",
        signatureRequestId: asNonEmptyString(body.signatureRequestId),
        status: "invalid_hmac",
      });
      return jsonResponse(request, 401, {
        correlationId,
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
    logEdgeDocumentOperationalEvent("warn", {
      correlationId,
      errorMessage: safeEdgeErrorMessage(normalizedEvent),
      event: "document.signature_webhook_normalization_failed",
      operation: "document-signature-webhook",
      provider: descriptor.providerCode,
      providerMode: descriptor.providerMode,
    });
    return jsonResponse(request, 400, { correlationId, error: normalizedEvent.message });
  }

  const serviceClient = createEdgeServiceClient();
  const webhookPayload = {
    ...normalizedEvent.payload,
    ...edgeObservabilityMetadata(correlationId, "document.signature_webhook_received"),
  };

  const { data, error } = await serviceClient.rpc("consume_document_signature_webhook", {
    p_provider: normalizedEvent.provider,
    p_event_id: normalizedEvent.eventId,
    p_request_status: normalizedEvent.requestStatus,
    p_signature_request_id: normalizedEvent.signatureRequestId,
    p_document_id: normalizedEvent.documentId,
    p_external_request_id: normalizedEvent.externalRequestId,
    p_completed_at: normalizedEvent.completedAt,
    p_payload: webhookPayload,
    p_idempotency_key:
      asNonEmptyString(body.idempotencyKey) ?? providerEventHash ?? normalizedEvent.eventId,
  });

  if (error || !data) {
    logEdgeDocumentOperationalEvent("error", {
      correlationId,
      documentId: normalizedEvent.documentId,
      errorMessage: safeEdgeErrorMessage(error?.message ?? "consume_webhook_failed"),
      event: "document.signature_webhook_consume_failed",
      operation: "document-signature-webhook",
      provider: normalizedEvent.provider,
      providerMode: descriptor.providerMode,
      signatureRequestId: normalizedEvent.signatureRequestId,
    });
    await recordOperationalEvent({
      descriptor,
      documentId: normalizedEvent.documentId,
      eventType: "document.signature_webhook_consume_failed",
      correlationId,
      errorCode: "consume_webhook_failed",
      errorMessage: error?.message ?? "consume_webhook_failed",
      idempotencyKey: asNonEmptyString(body.idempotencyKey) ?? providerEventHash ?? normalizedEvent.eventId,
      legacyTenantId: asNonEmptyString(body.legacyTenantId),
      providerEventHash,
      rawEventHash,
      serviceClient,
      severity: "error",
      signatureRequestId: normalizedEvent.signatureRequestId,
      status: "failed",
    });
    return jsonResponse(request, 500, {
      correlationId,
      error: "Failed to consume document signature webhook",
      details: error?.message ?? null,
    });
  }

  const snapshot = data as Record<string, unknown>;
  if (snapshot.ok === false) {
    logEdgeDocumentOperationalEvent("error", {
      correlationId,
      documentId: normalizedEvent.documentId,
      event: "document.signature_webhook_processing_failed",
      operation: "document-signature-webhook",
      provider: normalizedEvent.provider,
      providerMode: descriptor.providerMode,
      signatureRequestId: normalizedEvent.signatureRequestId,
    });
    return jsonResponse(request, 500, { ...snapshot, correlationId });
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
      correlationId,
      serviceClient,
      signatureRequestId: normalizedEvent.signatureRequestId,
      verificationMethod,
    });
  }

  if (snapshot.duplicate === true) {
    await recordOperationalEvent({
      descriptor,
      documentId: normalizedEvent.documentId,
      eventType: "document.signature_webhook_duplicate",
      correlationId,
      idempotencyKey: asNonEmptyString(body.idempotencyKey) ?? providerEventHash ?? normalizedEvent.eventId,
      legacyTenantId: asNonEmptyString(body.legacyTenantId),
      providerEventHash,
      rawEventHash,
      serviceClient,
      severity: "warning",
      signatureRequestId: normalizedEvent.signatureRequestId,
      status: "duplicate",
    });
  }

  logEdgeDocumentOperationalEvent(snapshot.duplicate === true ? "warn" : "info", {
    correlationId,
    documentId: normalizedEvent.documentId,
    duplicate: snapshot.duplicate === true,
    event:
      snapshot.duplicate === true
        ? "document.signature_webhook_duplicate"
        : "document.signature_webhook_processed",
    operation: "document-signature-webhook",
    provider: normalizedEvent.provider,
    providerMode: descriptor.providerMode,
    requestStatus: normalizedEvent.requestStatus,
    signatureRequestId: normalizedEvent.signatureRequestId,
  });

  return jsonResponse(request, 200, {
    ...snapshot,
    correlationId,
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
