export function buildCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin") ?? "*";

  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers":
      "authorization, x-client-info, apikey, content-type, x-correlation-id, x-idempotency-key, stripe-signature",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

export function jsonResponse(
  request: Request,
  status: number,
  payload: unknown,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...buildCorsHeaders(request),
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export function handleOptions(request: Request): Response {
  return new Response("ok", {
    status: 200,
    headers: buildCorsHeaders(request),
  });
}
