type AuthMode = "mock" | "real";

function parseAuthMode(value?: string): AuthMode {
  return value === "real" ? "real" : "mock";
}

export const env = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001",
  useMocks: process.env.NEXT_PUBLIC_USE_MOCKS === "true",
  authMode: parseAuthMode(process.env.NEXT_PUBLIC_AUTH_MODE),
  demoLoginEnabled: process.env.NEXT_PUBLIC_DEMO_LOGIN_ENABLED !== "false",
  demoDefaultEmail: process.env.NEXT_PUBLIC_DEMO_LOGIN_EMAIL ?? "admin@emagreceplus.local",
  demoDefaultPassword: process.env.NEXT_PUBLIC_DEMO_LOGIN_PASSWORD ?? "123456",
};