export function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();

  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }

  return value;
}

export function getOptionalEnv(name: string): string | null {
  return Deno.env.get(name)?.trim() || null;
}

export function getAppBaseUrl(): string {
  return getOptionalEnv("APP_BASE_URL") ?? "http://localhost:3000";
}

export function getBillingProvider(): "mock" | "stripe" {
  const provider = (getOptionalEnv("BILLING_PROVIDER") ?? "mock").toLowerCase();

  return provider === "stripe" ? "stripe" : "mock";
}
