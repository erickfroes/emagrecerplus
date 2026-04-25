import { getOptionalEnv } from "./env.ts";

type SignatureWebhookPayload = Record<string, unknown>;

export type NormalizedDocumentSignatureEvent = {
  provider: string;
  eventId: string;
  requestStatus: string;
  signatureRequestId: string | null;
  documentId: string | null;
  externalRequestId: string | null;
  completedAt: string | null;
  payload: SignatureWebhookPayload;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function currentDocumentSignatureProvider() {
  return getOptionalEnv("DOCUMENT_SIGNATURE_PROVIDER")?.trim().toLowerCase() || "mock";
}

export function normalizeMockDocumentSignatureWebhookEvent(
  value: unknown,
): NormalizedDocumentSignatureEvent {
  if (!isRecord(value)) {
    throw new Error("Mock signature webhook payload must be an object.");
  }

  const eventId =
    asTrimmedString(value.eventId) ??
    asTrimmedString(value.id) ??
    asTrimmedString(value.externalEventId);

  if (!eventId) {
    throw new Error("Mock signature webhook payload requires eventId.");
  }

  const requestStatus =
    asTrimmedString(value.requestStatus)?.toLowerCase() ??
    asTrimmedString(value.eventType)?.toLowerCase() ??
    asTrimmedString(value.status)?.toLowerCase() ??
    "signed";

  const signatureRequestId =
    asTrimmedString(value.signatureRequestId) ??
    asTrimmedString(value.requestId);

  const documentId = asTrimmedString(value.documentId);
  const externalRequestId = asTrimmedString(value.externalRequestId);

  if (!signatureRequestId && !documentId && !externalRequestId) {
    throw new Error(
      "Mock signature webhook payload requires signatureRequestId, documentId or externalRequestId.",
    );
  }

  return {
    provider: asTrimmedString(value.provider)?.toLowerCase() ?? "mock",
    eventId,
    requestStatus,
    signatureRequestId,
    documentId,
    externalRequestId,
    completedAt:
      asTrimmedString(value.completedAt) ??
      asTrimmedString(value.eventAt) ??
      null,
    payload: value,
  };
}
