import { env } from "@/lib/env";
import { useAuthStore } from "@/state/auth-store";

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export class HttpError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.payload = payload;
  }
}

export async function http<T>(
  path: string,
  options?: {
    method?: HttpMethod;
    body?: unknown;
    headers?: Record<string, string>;
    token?: string | null;
    cache?: RequestCache;
  }
): Promise<T> {
  const url = path.startsWith("http") ? path : `${env.apiBaseUrl}${path}`;
  const authState = useAuthStore.getState();
  const token = options?.token ?? authState.token;
  const session = authState.session;
  const normalizedCurrentUnitId = authState.session?.currentUnitId?.trim() || null;
  const canUseRealAuthToken = env.authMode === "real" && Boolean(token) && token !== "mock-token";
  const canForwardCurrentUnitId =
    canUseRealAuthToken && session
      ? hasValidCurrentUnitSelection(session, normalizedCurrentUnitId)
      : false;

  const response = await fetch(url, {
    method: options?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(canUseRealAuthToken ? { Authorization: `Bearer ${token}` } : {}),
      ...(canForwardCurrentUnitId && normalizedCurrentUnitId
        ? { "x-current-unit-id": normalizedCurrentUnitId }
        : {}),
      ...(options?.headers ?? {}),
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
    cache: options?.cache ?? "no-store",
  });

  const text = await response.text();
  const payload = text ? safeJsonParse(text) : null;

  if (!response.ok) {
    throw new HttpError(
      `Erro na requisição ${options?.method ?? "GET"} ${path}`,
      response.status,
      payload
    );
  }

  return payload as T;
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function hasValidCurrentUnitSelection(
  session: NonNullable<ReturnType<typeof useAuthStore.getState>["session"]>,
  currentUnitId: string | null
) {
  if (session.user.role === "patient") {
    return false;
  }

  if (!currentUnitId) {
    return false;
  }

  return (
    session.accessibleUnitIds.includes(currentUnitId) &&
    session.units.some((unit) => unit.id === currentUnitId)
  );
}
