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
  const token = options?.token ?? useAuthStore.getState().token;

  const response = await fetch(url, {
    method: options?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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