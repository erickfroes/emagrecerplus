import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { currentDocumentSignatureProvider } from "../_shared/document-signature-provider.ts";
import { getOptionalEnv, getRequiredEnv } from "../_shared/env.ts";
import { createEdgeServiceClient } from "../_shared/supabase.ts";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function findSignatureRequest(snapshot: JsonRecord, signatureRequestId: string | null) {
  const signatureRequests = asArray(snapshot.signatureRequests);

  if (!signatureRequestId) {
    return signatureRequests[0] ?? null;
  }

  return (
    signatureRequests.find(
      (item) => item.id === signatureRequestId || item.runtimeId === signatureRequestId,
    ) ?? null
  );
}

function buildCallbackUrl() {
  const explicitCallbackUrl = getOptionalEnv("DOCUMENT_SIGNATURE_CALLBACK_URL");
  if (explicitCallbackUrl) {
    return explicitCallbackUrl;
  }

  return `${getRequiredEnv("SUPABASE_URL").replace(/\/+$/, "")}/functions/v1/document-signature-webhook`;
}

function pickExternalRequestId(value: JsonRecord) {
  return (
    asNonEmptyString(value.externalRequestId) ??
    asNonEmptyString(value.requestId) ??
    asNonEmptyString(value.signatureRequestId) ??
    asNonEmptyString(value.id)
  );
}

function isLocalProvider(provider: string) {
  return ["internal", "manual", "mock", "mock_internal"].includes(provider);
}

async function parseResponsePayload(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as JsonRecord;
  } catch {
    return { raw: text };
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return handleOptions(request);
  }

  if (request.method !== "POST") {
    return jsonResponse(request, 405, { error: "Method not allowed" });
  }

  const body = await request.json().catch(() => null);
  if (!isRecord(body)) {
    return jsonResponse(request, 400, { error: "Invalid request body" });
  }

  const legacyTenantId = asNonEmptyString(body.legacyTenantId);
  const documentId = asNonEmptyString(body.documentId);
  const legacyUnitId = asNonEmptyString(body.legacyUnitId);
  const explicitSignatureRequestId = asNonEmptyString(body.signatureRequestId);

  if (!legacyTenantId || !documentId) {
    return jsonResponse(request, 400, {
      error: "legacyTenantId and documentId are required",
    });
  }

  const serviceClient = createEdgeServiceClient();
  const { data: snapshotData, error: snapshotError } = await serviceClient.rpc(
    "get_patient_document_snapshot",
    {
      p_legacy_tenant_id: legacyTenantId,
      p_document_id: documentId,
      p_legacy_unit_id: legacyUnitId,
    },
  );

  if (snapshotError || !isRecord(snapshotData)) {
    return jsonResponse(request, 500, {
      details: snapshotError?.message ?? null,
      error: "Failed to load document snapshot for signature dispatch",
    });
  }

  const signatureRequest = findSignatureRequest(snapshotData, explicitSignatureRequestId);
  if (!signatureRequest) {
    return jsonResponse(request, 404, {
      error: "Signature request not found in document snapshot",
    });
  }

  const signatureRequestId =
    asNonEmptyString(signatureRequest.runtimeId) ?? asNonEmptyString(signatureRequest.id);
  if (!signatureRequestId) {
    return jsonResponse(request, 500, {
      error: "Signature request snapshot is missing runtime id",
    });
  }

  const provider = (
    asNonEmptyString(body.providerCode) ??
    asNonEmptyString(signatureRequest.providerCode) ??
    currentDocumentSignatureProvider()
  ).toLowerCase();
  const idempotencyKey =
    asNonEmptyString(request.headers.get("x-idempotency-key")) ??
    asNonEmptyString(body.idempotencyKey) ??
    `${provider}:${signatureRequestId}:${Date.now()}`;
  const callbackUrl = buildCallbackUrl();
  const dispatchPayload = {
    callbackUrl,
    document: {
      id: snapshotData.runtimeId ?? snapshotData.id,
      publicId: snapshotData.id,
      title: snapshotData.title,
      type: snapshotData.documentType,
      number: snapshotData.documentNumber,
      issuedAt: snapshotData.issuedAt,
      currentVersionId: isRecord(snapshotData.currentVersion)
        ? snapshotData.currentVersion.runtimeId ?? snapshotData.currentVersion.id
        : null,
    },
    provider,
    signatureRequest: {
      id: signatureRequestId,
      publicId: signatureRequest.id,
      signerType: signatureRequest.signerType,
      signerName: signatureRequest.signerName,
      signerEmail: signatureRequest.signerEmail,
      expiresAt: signatureRequest.expiresAt,
    },
  };
  const dispatchUrl = getOptionalEnv("DOCUMENT_SIGNATURE_DISPATCH_URL");
  const apiKey = getOptionalEnv("DOCUMENT_SIGNATURE_API_KEY");

  let dispatchStatus: "failed" | "sent" | "skipped" = "skipped";
  let externalRequestId: string | null = null;
  let responsePayload: JsonRecord = {};
  let errorMessage: string | null = null;

  if (dispatchUrl) {
    try {
      const providerResponse = await fetch(dispatchUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-idempotency-key": idempotencyKey,
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(dispatchPayload),
      });

      responsePayload = await parseResponsePayload(providerResponse);
      externalRequestId = pickExternalRequestId(responsePayload);
      dispatchStatus = providerResponse.ok ? "sent" : "failed";
      if (!providerResponse.ok) {
        errorMessage =
          asNonEmptyString(responsePayload.error) ??
          asNonEmptyString(responsePayload.message) ??
          `Provider returned HTTP ${providerResponse.status}`;
      }
    } catch (error) {
      dispatchStatus = "failed";
      errorMessage = error instanceof Error ? error.message : "Provider dispatch failed";
      responsePayload = { error: errorMessage };
    }
  } else if (isLocalProvider(provider)) {
    dispatchStatus = "sent";
    externalRequestId = `local-${signatureRequestId}`;
    responsePayload = {
      mode: "local_evidence_only",
      reason: "DOCUMENT_SIGNATURE_DISPATCH_URL not configured",
    };
  } else {
    dispatchStatus = "failed";
    errorMessage = "DOCUMENT_SIGNATURE_DISPATCH_URL not configured for external provider";
    responsePayload = { error: errorMessage };
  }

  const { data: dispatchData, error: dispatchError } = await serviceClient.rpc(
    "record_document_signature_dispatch",
    {
      p_legacy_tenant_id: legacyTenantId,
      p_document_id: documentId,
      p_signature_request_id: signatureRequestId,
      p_legacy_unit_id: legacyUnitId,
      p_provider: provider,
      p_dispatch_status: dispatchStatus,
      p_external_request_id: externalRequestId,
      p_idempotency_key: idempotencyKey,
      p_request_payload: dispatchPayload,
      p_response_payload: responsePayload,
      p_error_message: errorMessage,
      p_completed_at: new Date().toISOString(),
      p_metadata: {
        edgeFunction: "document-signature-dispatch",
        hasDispatchUrl: Boolean(dispatchUrl),
      },
    },
  );

  if (dispatchError || !dispatchData) {
    return jsonResponse(request, 500, {
      details: dispatchError?.message ?? null,
      error: "Failed to record document signature dispatch",
    });
  }

  return jsonResponse(request, dispatchStatus === "failed" ? 502 : 200, {
    dispatchStatus,
    document: dispatchData,
    errorMessage,
    externalRequestId,
    ok: dispatchStatus !== "failed",
    provider,
    signatureRequestId,
  });
});
