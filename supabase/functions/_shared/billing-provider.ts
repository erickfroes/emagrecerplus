import {
  getAppBaseUrl,
  getBillingProvider,
  getOptionalEnv,
  getRequiredEnv,
} from "./env.ts";

type JsonRecord = Record<string, unknown>;

export type BillingProviderName = "mock" | "stripe";

export type TenantBillingSummary = {
  tenantId: string;
  plan?: {
    code?: string | null;
    name?: string | null;
  } | null;
  subscription?: {
    id?: string | null;
    externalCustomerId?: string | null;
    externalSubscriptionId?: string | null;
  } | null;
};

export type BillingPlanRow = {
  id: string;
  code: string;
  name: string;
  billing_interval: string;
  currency_code: string;
  price_amount: number;
  metadata: JsonRecord | null;
};

export type GatewaySessionInput = {
  provider: BillingProviderName;
  flow: "checkout" | "portal";
  idempotencyKey: string;
  tenantId: string;
  planCode: string | null;
  currentSubscriptionId: string | null;
  externalCustomerId: string | null;
  successUrl: string | null;
  cancelUrl: string | null;
  returnUrl: string | null;
  plan: BillingPlanRow | null;
};

export type GatewaySessionResult = {
  provider: BillingProviderName;
  flow: "checkout" | "portal";
  sessionId: string;
  checkoutUrl: string | null;
  externalCustomerId: string | null;
  externalSubscriptionId: string | null;
  expiresAt: string | null;
  metadata: JsonRecord;
};

export type NormalizedWebhookEvent = {
  provider: BillingProviderName;
  eventId: string;
  eventType: string;
  payload: JsonRecord;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNestedRecord(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null;
}

function readPath(record: JsonRecord | null, ...path: string[]): unknown {
  let current: unknown = record;

  for (const key of path) {
    if (!isRecord(current)) {
      return null;
    }

    current = current[key];
  }

  return current;
}

function readStringPath(record: JsonRecord | null, ...path: string[]): string | null {
  return asString(readPath(record, ...path));
}

function toIsoFromUnix(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return new Date(value * 1000).toISOString();
}

function intervalFromStripe(value: unknown): string | null {
  switch (asString(value)) {
    case "month":
      return "monthly";
    case "year":
      return "annual";
    case "week":
      return "custom";
    case "day":
      return "custom";
    default:
      return null;
  }
}

function centsToAmount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Number((value / 100).toFixed(2));
}

function parseBooleanString(value: unknown): boolean | null {
  const normalized = asString(value)?.toLowerCase();

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  return null;
}

function getPlanMetadataValue(plan: BillingPlanRow | null, ...path: string[]): string | null {
  if (!plan?.metadata || !isRecord(plan.metadata)) {
    return null;
  }

  return readStringPath(plan.metadata, ...path);
}

function getStripeApiVersion(): string | null {
  return getOptionalEnv("STRIPE_API_VERSION");
}

async function callStripe(
  method: "POST",
  pathname: string,
  body: URLSearchParams,
  idempotencyKey?: string,
): Promise<JsonRecord> {
  const secretKey = getRequiredEnv("STRIPE_SECRET_KEY");
  const headers: HeadersInit = {
    authorization: `Bearer ${secretKey}`,
    "content-type": "application/x-www-form-urlencoded",
  };

  const apiVersion = getStripeApiVersion();
  if (apiVersion) {
    headers["stripe-version"] = apiVersion;
  }

  if (idempotencyKey) {
    headers["idempotency-key"] = idempotencyKey;
  }

  const response = await fetch(`https://api.stripe.com${pathname}`, {
    method,
    headers,
    body,
  });

  const json = (await response.json().catch(() => ({}))) as JsonRecord;

  if (!response.ok) {
    const message =
      readStringPath(json, "error", "message") ??
      `Stripe request failed with status ${response.status}`;
    throw new Error(message);
  }

  return json;
}

async function createStripeGatewaySession(
  input: GatewaySessionInput,
): Promise<GatewaySessionResult> {
  if (input.flow === "portal") {
    if (!input.externalCustomerId) {
      throw new Error("Portal flow requires an external customer id");
    }

    const body = new URLSearchParams({
      customer: input.externalCustomerId,
      return_url: input.returnUrl ?? input.successUrl ?? input.cancelUrl ?? getAppBaseUrl(),
    });

    const result = await callStripe(
      "POST",
      "/v1/billing_portal/sessions",
      body,
      input.idempotencyKey,
    );

    return {
      provider: "stripe",
      flow: input.flow,
      sessionId: asString(result.id) ?? crypto.randomUUID(),
      checkoutUrl: asString(result.url),
      externalCustomerId: input.externalCustomerId,
      externalSubscriptionId: null,
      expiresAt: null,
      metadata: {
        mode: "stripe_portal",
      },
    };
  }

  const stripePriceId =
    getPlanMetadataValue(input.plan, "stripePriceId") ??
    getPlanMetadataValue(input.plan, "stripe", "priceId");

  if (!stripePriceId) {
    throw new Error("Selected plan is missing stripe price metadata");
  }

  if (!input.successUrl || !input.cancelUrl) {
    throw new Error("Checkout flow requires success and cancel URLs");
  }

  const body = new URLSearchParams({
    mode: "subscription",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    "line_items[0][price]": stripePriceId,
    "line_items[0][quantity]": "1",
    "metadata[tenantId]": input.tenantId,
    "metadata[planCode]": input.planCode ?? "",
    "metadata[flow]": input.flow,
    "subscription_data[metadata][tenantId]": input.tenantId,
    "subscription_data[metadata][planCode]": input.planCode ?? "",
    "subscription_data[metadata][flow]": input.flow,
  });

  if (input.externalCustomerId) {
    body.set("customer", input.externalCustomerId);
  }

  const result = await callStripe(
    "POST",
    "/v1/checkout/sessions",
    body,
    input.idempotencyKey,
  );

  const expiresAtUnix = typeof result.expires_at === "number" ? result.expires_at : null;

  return {
    provider: "stripe",
    flow: input.flow,
    sessionId: asString(result.id) ?? crypto.randomUUID(),
    checkoutUrl: asString(result.url),
    externalCustomerId: asString(result.customer) ?? input.externalCustomerId,
    externalSubscriptionId: asString(result.subscription),
    expiresAt: expiresAtUnix ? new Date(expiresAtUnix * 1000).toISOString() : null,
    metadata: {
      mode: "stripe_checkout",
      stripePriceId,
    },
  };
}

function createMockGatewaySession(input: GatewaySessionInput): GatewaySessionResult {
  const sessionId = `mock_${crypto.randomUUID()}`;

  return {
    provider: "mock",
    flow: input.flow,
    sessionId,
    checkoutUrl:
      input.flow === "portal"
        ? `${input.returnUrl ?? getAppBaseUrl()}/billing/mock-portal?session=${sessionId}`
        : `${input.successUrl ?? getAppBaseUrl()}/billing/mock-checkout?session=${sessionId}`,
    externalCustomerId: input.externalCustomerId ?? `mock_customer_${input.tenantId}`,
    externalSubscriptionId:
      input.flow === "checkout"
        ? `mock_subscription_${input.planCode ?? "default"}`
        : input.currentSubscriptionId,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    metadata: {
      mode: "mock",
      tenantId: input.tenantId,
      planCode: input.planCode,
    },
  };
}

export async function createGatewaySession(
  input: GatewaySessionInput,
): Promise<GatewaySessionResult> {
  if (input.provider === "stripe") {
    return createStripeGatewaySession(input);
  }

  return createMockGatewaySession(input);
}

function mapStripeSubscriptionStatus(status: string | null, eventType: string): string {
  if (eventType === "invoice.payment_failed") {
    return "past_due";
  }

  if (eventType === "customer.subscription.deleted") {
    return "canceled";
  }

  switch ((status ?? "").toLowerCase()) {
    case "trialing":
      return "trialing";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "cancelled":
      return "canceled";
    case "incomplete_expired":
      return "expired";
    case "paused":
      return "suspended";
    default:
      return "active";
  }
}

function normalizeStripeWebhookFromSubscription(
  eventId: string,
  eventType: string,
  subscription: JsonRecord,
): NormalizedWebhookEvent {
  const item = Array.isArray(readPath(subscription, "items", "data"))
    ? (readPath(subscription, "items", "data") as unknown[])[0]
    : null;
  const itemRecord = asNestedRecord(item);
  const priceRecord = asNestedRecord(readPath(itemRecord, "price"));

  return {
    provider: "stripe",
    eventId,
    eventType,
    payload: {
      tenantId: readStringPath(subscription, "metadata", "tenantId"),
      planCode:
        readStringPath(subscription, "metadata", "planCode") ??
        readStringPath(priceRecord, "lookup_key"),
      planName: readStringPath(priceRecord, "nickname"),
      billingInterval: intervalFromStripe(readPath(priceRecord, "recurring", "interval")),
      currencyCode: readStringPath(priceRecord, "currency")?.toUpperCase() ?? "BRL",
      priceAmount: centsToAmount(readPath(priceRecord, "unit_amount")),
      status: mapStripeSubscriptionStatus(asString(subscription.status), eventType),
      externalCustomerId: asString(subscription.customer),
      externalSubscriptionId: asString(subscription.id),
      externalSessionId:
        readStringPath(subscription, "metadata", "checkoutSessionId") ??
        readStringPath(subscription, "metadata", "sessionId"),
      currentPeriodStartedAt: toIsoFromUnix(readPath(subscription, "current_period_start")),
      currentPeriodEndsAt: toIsoFromUnix(readPath(subscription, "current_period_end")),
      trialEndsAt: toIsoFromUnix(readPath(subscription, "trial_end")),
      canceledAt: toIsoFromUnix(readPath(subscription, "canceled_at")),
      endedAt: toIsoFromUnix(readPath(subscription, "ended_at")),
      autoRenew:
        typeof readPath(subscription, "cancel_at_period_end") === "boolean"
          ? !(readPath(subscription, "cancel_at_period_end") as boolean)
          : true,
      metadata: {
        tenantId: readStringPath(subscription, "metadata", "tenantId"),
        planCode: readStringPath(subscription, "metadata", "planCode"),
      },
    },
  };
}

function normalizeStripeWebhookFromInvoice(
  eventId: string,
  eventType: string,
  invoice: JsonRecord,
): NormalizedWebhookEvent {
  const line = Array.isArray(readPath(invoice, "lines", "data"))
    ? (readPath(invoice, "lines", "data") as unknown[])[0]
    : null;
  const lineRecord = asNestedRecord(line);
  const priceRecord = asNestedRecord(readPath(lineRecord, "price"));

  return {
    provider: "stripe",
    eventId,
    eventType,
    payload: {
      tenantId: readStringPath(invoice, "metadata", "tenantId"),
      planCode:
        readStringPath(invoice, "metadata", "planCode") ??
        readStringPath(priceRecord, "lookup_key"),
      planName: readStringPath(priceRecord, "nickname"),
      billingInterval: intervalFromStripe(readPath(priceRecord, "recurring", "interval")),
      currencyCode: readStringPath(invoice, "currency")?.toUpperCase() ?? "BRL",
      priceAmount: centsToAmount(invoice.amount_due),
      status: eventType === "invoice.payment_failed" ? "past_due" : "active",
      externalCustomerId: asString(invoice.customer),
      externalSubscriptionId: asString(invoice.subscription),
      externalSessionId: readStringPath(invoice, "metadata", "checkoutSessionId"),
      currentPeriodStartedAt: toIsoFromUnix(readPath(lineRecord, "period", "start")),
      currentPeriodEndsAt: toIsoFromUnix(readPath(lineRecord, "period", "end")),
      autoRenew: true,
      metadata: {
        tenantId: readStringPath(invoice, "metadata", "tenantId"),
        planCode: readStringPath(invoice, "metadata", "planCode"),
      },
    },
  };
}

function normalizeStripeWebhookFromCheckoutSession(
  eventId: string,
  eventType: string,
  session: JsonRecord,
): NormalizedWebhookEvent {
  return {
    provider: "stripe",
    eventId,
    eventType,
    payload: {
      tenantId: readStringPath(session, "metadata", "tenantId"),
      planCode: readStringPath(session, "metadata", "planCode"),
      status: "active",
      externalCustomerId: asString(session.customer),
      externalSubscriptionId: asString(session.subscription),
      externalSessionId: asString(session.id),
      autoRenew: true,
      metadata: {
        tenantId: readStringPath(session, "metadata", "tenantId"),
        planCode: readStringPath(session, "metadata", "planCode"),
        checkoutSessionId: asString(session.id),
      },
    },
  };
}

export function normalizeMockWebhookEvent(body: unknown): NormalizedWebhookEvent {
  const record = isRecord(body) ? body : {};
  const payload = isRecord(record.payload) ? record.payload : record;

  return {
    provider: "mock",
    eventId: asString(record.eventId) ?? crypto.randomUUID(),
    eventType: asString(record.eventType) ?? "mock.subscription.updated",
    payload,
  };
}

export function normalizeStripeWebhookEvent(body: unknown): NormalizedWebhookEvent | null {
  if (!isRecord(body)) {
    throw new Error("Invalid Stripe webhook payload");
  }

  const eventId = asString(body.id);
  const eventType = asString(body.type);
  const object = asNestedRecord(readPath(body, "data", "object"));

  if (!eventId || !eventType || !object) {
    throw new Error("Invalid Stripe event envelope");
  }

  switch (eventType) {
    case "checkout.session.completed":
    case "checkout.session.expired":
      return normalizeStripeWebhookFromCheckoutSession(eventId, eventType, object);
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return normalizeStripeWebhookFromSubscription(eventId, eventType, object);
    case "invoice.payment_failed":
    case "invoice.paid":
      return normalizeStripeWebhookFromInvoice(eventId, eventType, object);
    default:
      return null;
  }
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return mismatch === 0;
}

export async function verifyStripeWebhookSignature(
  rawBody: string,
  signatureHeader: string,
): Promise<void> {
  const secret = getRequiredEnv("STRIPE_WEBHOOK_SECRET");
  const pieces = signatureHeader.split(",").map((part) => part.trim());
  const timestamp = pieces
    .find((part) => part.startsWith("t="))
    ?.slice(2);
  const signatures = pieces
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));

  if (!timestamp || signatures.length === 0) {
    throw new Error("Invalid Stripe signature header");
  }

  const toleranceSeconds = 5 * 60;
  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));

  if (!Number.isFinite(ageSeconds) || ageSeconds > toleranceSeconds) {
    throw new Error("Expired Stripe signature");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  );
  const expected = hex(signed);

  if (!signatures.some((signature) => timingSafeEqual(signature, expected))) {
    throw new Error("Stripe signature mismatch");
  }
}

export function currentProvider(): BillingProviderName {
  return getBillingProvider();
}
