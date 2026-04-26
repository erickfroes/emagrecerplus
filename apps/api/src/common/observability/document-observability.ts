import { randomUUID } from "node:crypto";

type DocumentOperationalLogLevel = "debug" | "error" | "info" | "warn";

type DocumentOperationalLogFields = Record<string, unknown> & {
  correlationId: string;
  event: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REDACTED_KEY_PATTERN =
  /authorization|apikey|cryptkey|downloadurl|openurl|secret|service[_-]?role|signedurl|storage[_-]?object[_-]?path|token/i;

export function resolveDocumentCorrelationId(value?: string | string[] | null) {
  const candidate = Array.isArray(value) ? value[0] : value;
  const trimmed = candidate?.trim();

  return trimmed && UUID_PATTERN.test(trimmed) ? trimmed : randomUUID();
}

export function documentObservabilityMetadata(
  correlationId: string,
  event: string,
  metadata: Record<string, unknown> = {}
) {
  return {
    ...metadata,
    correlationId,
    observabilityEvent: event,
  };
}

export function safeDocumentErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "unknown_error");

  return message
    .replace(/https?:\/\/\S+/g, "[redacted-url]")
    .replace(/\btenant\/[^\s"'`]+/g, "[redacted-storage-path]");
}

export function logDocumentOperationalEvent(
  level: DocumentOperationalLogLevel,
  fields: DocumentOperationalLogFields
) {
  const payload = JSON.stringify(
    redactOperationalPayload({
      component: "api",
      observedAt: new Date().toISOString(),
      type: "document_operational_event",
      ...fields,
    })
  );

  switch (level) {
    case "debug":
      console.debug(payload);
      break;
    case "warn":
      console.warn(payload);
      break;
    case "error":
      console.error(payload);
      break;
    default:
      console.info(payload);
      break;
  }
}

function redactOperationalPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactOperationalPayload);
  }

  if (!value || typeof value !== "object") {
    return typeof value === "string" ? redactSensitiveString(value) : value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
      key,
      REDACTED_KEY_PATTERN.test(key) ? "[redacted]" : redactOperationalPayload(entryValue),
    ])
  );
}

function redactSensitiveString(value: string) {
  return value
    .replace(/https?:\/\/\S+/g, "[redacted-url]")
    .replace(/\btenant\/[^\s"'`]+/g, "[redacted-storage-path]");
}
