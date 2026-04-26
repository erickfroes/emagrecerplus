import { getOptionalEnv } from "./env.ts";

type SignatureWebhookPayload = Record<string, unknown>;

export type DocumentSignatureProviderCode = "mock" | "d4sign";
export type DocumentSignatureProviderMode = "unconfigured" | "simulated" | "real";
export type DocumentSignatureAdapterCode =
  | "mock"
  | "d4sign_unconfigured"
  | "d4sign_simulated"
  | "d4sign_real";
export type D4SignHmacStrategy = "uuid" | "raw_body";

const D4SIGN_SIMULATED_WEBHOOK_SECRET = "emagreceplus-d4sign-simulated-webhook-secret";
const D4SIGN_REQUIRED_REAL_ENV = [
  "D4SIGN_BASE_URL",
  "D4SIGN_TOKEN_API",
  "D4SIGN_CRYPT_KEY",
  "D4SIGN_WEBHOOK_SECRET",
  "D4SIGN_SAFE_UUID",
];

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

export type DocumentSignatureProviderDescriptor = {
  adapterCode: DocumentSignatureAdapterCode;
  isConfigured: boolean;
  missingConfiguration: string[];
  providerCode: DocumentSignatureProviderCode;
  providerMode: DocumentSignatureProviderMode;
  providerStatus: "mock_ready" | "provider_config_missing" | "simulated_ready" | "not_implemented";
  requestedMode: DocumentSignatureProviderMode | null;
};

export type D4SignContentHmacValidation = {
  expectedHash: string | null;
  receivedHash: string | null;
  reason: string | null;
  strategy: D4SignHmacStrategy;
  valid: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeProviderCode(value: unknown): DocumentSignatureProviderCode {
  const normalized = asTrimmedString(value)?.toLowerCase();

  switch (normalized) {
    case "d4sign":
    case "d4sign_real":
    case "d4sign_simulated":
    case "d4sign_unconfigured":
      return "d4sign";
    default:
      return "mock";
  }
}

function normalizeProviderMode(value: unknown): DocumentSignatureProviderMode | null {
  const normalized = asTrimmedString(value)?.toLowerCase();

  switch (normalized) {
    case "unconfigured":
    case "d4sign_unconfigured":
      return "unconfigured";
    case "simulated":
    case "simulation":
    case "d4sign_simulated":
      return "simulated";
    case "real":
    case "production":
    case "d4sign_real":
      return "real";
    default:
      return null;
  }
}

function modeFromProviderAlias(value: unknown): DocumentSignatureProviderMode | null {
  const normalized = asTrimmedString(value)?.toLowerCase();

  switch (normalized) {
    case "d4sign_unconfigured":
      return "unconfigured";
    case "d4sign_simulated":
      return "simulated";
    case "d4sign_real":
      return "real";
    default:
      return null;
  }
}

export function currentDocumentSignatureProvider() {
  return getOptionalEnv("DOCUMENT_SIGNATURE_PROVIDER")?.trim().toLowerCase() || "mock";
}

export function currentDocumentSignatureProviderMode() {
  return normalizeProviderMode(getOptionalEnv("DOCUMENT_SIGNATURE_PROVIDER_MODE"));
}

export function resolveDocumentSignatureProvider(options?: {
  provider?: unknown;
  providerMode?: unknown;
}): DocumentSignatureProviderDescriptor {
  const configuredProvider = currentDocumentSignatureProvider();
  const providerInput = asTrimmedString(options?.provider) ?? configuredProvider;
  const providerCode = normalizeProviderCode(providerInput);

  if (providerCode === "mock") {
    return {
      adapterCode: "mock",
      isConfigured: true,
      missingConfiguration: [],
      providerCode,
      providerMode: "simulated",
      providerStatus: "mock_ready",
      requestedMode: null,
    };
  }

  const requestedMode =
    normalizeProviderMode(options?.providerMode) ??
    modeFromProviderAlias(providerInput) ??
    currentDocumentSignatureProviderMode();
  const missingConfiguration = D4SIGN_REQUIRED_REAL_ENV.filter((name) => !getOptionalEnv(name));
  const realConfigurationReady = missingConfiguration.length === 0;

  if (requestedMode === "simulated") {
    return {
      adapterCode: "d4sign_simulated",
      isConfigured: false,
      missingConfiguration,
      providerCode,
      providerMode: "simulated",
      providerStatus: "simulated_ready",
      requestedMode,
    };
  }

  if (requestedMode === "unconfigured" || !realConfigurationReady) {
    return {
      adapterCode: "d4sign_unconfigured",
      isConfigured: false,
      missingConfiguration,
      providerCode,
      providerMode: "unconfigured",
      providerStatus: "provider_config_missing",
      requestedMode,
    };
  }

  return {
    adapterCode: "d4sign_real",
    isConfigured: true,
    missingConfiguration: [],
    providerCode,
    providerMode: "real",
    providerStatus: "not_implemented",
    requestedMode: "real",
  };
}

export function normalizeD4SignHmacStrategy(value: unknown): D4SignHmacStrategy {
  const normalized = asTrimmedString(value)?.toLowerCase();
  return normalized === "raw_body" || normalized === "raw-body" || normalized === "body"
    ? "raw_body"
    : "uuid";
}

export async function sha256HexBytes(payload: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256HexText(value: string) {
  return sha256HexBytes(new TextEncoder().encode(value));
}

export async function hmacSha256Hex(secret: string, payload: Uint8Array | string) {
  const bytes = typeof payload === "string" ? new TextEncoder().encode(payload) : payload;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, bytes);

  return Array.from(new Uint8Array(signature))
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

function parseSha256HmacHeader(value: string | null): string | null {
  const normalized = asTrimmedString(value);
  if (!normalized) {
    return null;
  }

  const hash = normalized.toLowerCase().startsWith("sha256=")
    ? normalized.slice("sha256=".length)
    : null;

  return hash && /^[a-f0-9]{64}$/i.test(hash) ? hash.toLowerCase() : null;
}

function hexToBytes(value: string): Uint8Array | null {
  if (!/^[a-f0-9]+$/i.test(value) || value.length % 2 !== 0) {
    return null;
  }

  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }

  return bytes;
}

function timingSafeEqualHex(expectedHex: string, receivedHex: string) {
  const expected = hexToBytes(expectedHex);
  const received = hexToBytes(receivedHex);

  if (!expected || !received || expected.length === 0) {
    return false;
  }

  const maxLength = Math.max(expected.length, received.length);
  let diff = expected.length ^ received.length;

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (expected[index % expected.length] ?? 0) ^ (received[index] ?? 0);
  }

  return diff === 0;
}

export async function validateD4SignContentHmac(params: {
  contentHmacHeader: string | null;
  documentUuid: string | null;
  providerMode: DocumentSignatureProviderMode;
  rawBody: string;
  secret?: string | null;
  strategy?: D4SignHmacStrategy | null;
}): Promise<D4SignContentHmacValidation> {
  const strategy = params.strategy ?? "uuid";
  const receivedHash = parseSha256HmacHeader(params.contentHmacHeader);

  if (!receivedHash) {
    return {
      expectedHash: null,
      receivedHash: null,
      reason: "missing_or_invalid_content_hmac",
      strategy,
      valid: false,
    };
  }

  const secret =
    asTrimmedString(params.secret) ??
    (params.providerMode === "simulated" ? D4SIGN_SIMULATED_WEBHOOK_SECRET : null);

  if (!secret) {
    return {
      expectedHash: null,
      receivedHash,
      reason: "missing_hmac_secret",
      strategy,
      valid: false,
    };
  }

  const payload =
    strategy === "raw_body" ? params.rawBody : asTrimmedString(params.documentUuid);

  if (!payload) {
    return {
      expectedHash: null,
      receivedHash,
      reason: strategy === "raw_body" ? "missing_hmac_raw_body" : "missing_hmac_uuid",
      strategy,
      valid: false,
    };
  }

  const expectedHash = await hmacSha256Hex(secret, payload);

  return {
    expectedHash,
    receivedHash,
    reason: timingSafeEqualHex(expectedHash, receivedHash) ? null : "hmac_mismatch",
    strategy,
    valid: timingSafeEqualHex(expectedHash, receivedHash),
  };
}

export async function buildD4SignSimulatedExternalDocumentId(params: {
  documentId: string;
  signatureRequestId: string;
}) {
  const hash = await sha256HexText(
    `d4sign-simulated:${params.documentId}:${params.signatureRequestId}`,
  );

  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(
    16,
    20,
  )}-${hash.slice(20, 32)}`;
}

export function extractD4SignDocumentUuid(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  return (
    asTrimmedString(value.externalDocumentId) ??
    asTrimmedString(value.uuidDoc) ??
    asTrimmedString(value.uuid_document) ??
    asTrimmedString(value.uuid) ??
    (isRecord(value.document)
      ? asTrimmedString(value.document.externalDocumentId) ??
        asTrimmedString(value.document.uuidDoc) ??
        asTrimmedString(value.document.uuid)
      : null)
  );
}

function normalizeD4SignRequestStatus(value: unknown) {
  const normalized = asTrimmedString(value)?.toLowerCase();

  switch (normalized) {
    case "signed":
    case "document_signed":
    case "assinado":
    case "finalized":
    case "finished":
    case "completed":
    case "concluido":
      return "signed";
    case "cancelled":
    case "canceled":
    case "cancelado":
      return "cancelled";
    case "declined":
    case "rejected":
    case "recusado":
      return "declined";
    case "expired":
    case "expirado":
      return "expired";
    case "viewed":
    case "opened":
    case "visualizado":
      return "viewed";
    case "email_failed":
    case "email_failure":
    case "email_error":
    case "email_bounced":
      return "pending";
    default:
      return "pending";
  }
}

export function normalizeD4SignDocumentSignatureWebhookEvent(
  value: unknown,
  options: {
    hmac: D4SignContentHmacValidation;
    providerEventHash: string;
    providerMode: DocumentSignatureProviderMode;
    rawEventHash: string;
    verificationMethod: string;
  },
): NormalizedDocumentSignatureEvent {
  if (!isRecord(value)) {
    throw new Error("D4Sign signature webhook payload must be an object.");
  }

  const externalDocumentId = extractD4SignDocumentUuid(value);
  const requestStatus = normalizeD4SignRequestStatus(
    value.requestStatus ?? value.eventType ?? value.status ?? value.action,
  );
  const eventId =
    asTrimmedString(value.eventId) ??
    asTrimmedString(value.id) ??
    asTrimmedString(value.externalEventId) ??
    asTrimmedString(value.uuidEvent) ??
    options.providerEventHash;

  const signatureRequestId =
    asTrimmedString(value.signatureRequestId) ??
    asTrimmedString(value.requestId) ??
    (isRecord(value.signatureRequest) ? asTrimmedString(value.signatureRequest.id) : null);
  const documentId =
    asTrimmedString(value.documentId) ??
    (isRecord(value.document) ? asTrimmedString(value.document.id) : null);
  const eventAt =
    asTrimmedString(value.completedAt) ??
    asTrimmedString(value.eventAt) ??
    asTrimmedString(value.date) ??
    asTrimmedString(value.createdAt);

  if (!signatureRequestId && !documentId && !externalDocumentId) {
    throw new Error(
      "D4Sign signature webhook payload requires signatureRequestId, documentId or document UUID.",
    );
  }

  return {
    provider: "d4sign",
    eventId,
    requestStatus,
    signatureRequestId,
    documentId,
    externalRequestId: asTrimmedString(value.externalRequestId) ?? externalDocumentId,
    completedAt: requestStatus === "signed" ? eventAt : null,
    payload: {
      ...value,
      externalDocumentId,
      provider: "d4sign",
      providerEventHash: options.providerEventHash,
      providerMode: options.providerMode,
      providerPayloadHash: options.providerEventHash,
      rawEventHash: options.rawEventHash,
      verificationMethod: options.verificationMethod,
      verificationStatus: "pending",
      hmac: {
        reason: options.hmac.reason,
        strategy: options.hmac.strategy,
        valid: options.hmac.valid,
      },
    },
  };
}

export function buildD4SignSimulatedWebhookFixture(
  kind: "signed_document" | "finalized_document" | "cancelled" | "email_failed" | "invalid_hmac" | "duplicate",
  params: {
    documentId: string;
    eventId: string;
    externalDocumentId: string;
    signatureRequestId: string;
  },
) {
  const eventTypeByKind = {
    cancelled: "cancelled",
    duplicate: "signed",
    email_failed: "email_failed",
    finalized_document: "finalized",
    invalid_hmac: "signed",
    signed_document: "signed",
  } satisfies Record<typeof kind, string>;

  return {
    documentId: params.documentId,
    eventAt: new Date().toISOString(),
    eventId: params.eventId,
    eventType: eventTypeByKind[kind],
    externalDocumentId: params.externalDocumentId,
    fixture: kind,
    provider: "d4sign",
    providerMode: "simulated",
    signatureRequestId: params.signatureRequestId,
  };
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
