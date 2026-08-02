export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "INTERNAL";

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
  };
};

function responseHeaders(requestId: string, headers?: HeadersInit): Headers {
  const result = new Headers(headers);
  if (!result.has("Cache-Control")) result.set("Cache-Control", "no-store");
  result.set("X-Request-Id", requestId);
  return result;
}

const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function resolveRequestId(
  candidate: string | null | undefined,
  createId: () => string = () => crypto.randomUUID(),
): string {
  return candidate && requestIdPattern.test(candidate) ? candidate : createId();
}

export function applyResponseSafety(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  if (!headers.has("X-Request-Id")) headers.set("X-Request-Id", requestId);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function apiJson(
  body: unknown,
  requestId: string,
  init: ResponseInit = {},
): Response {
  return Response.json(body, {
    ...init,
    headers: responseHeaders(requestId, init.headers),
  });
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number,
  requestId: string,
  headers?: HeadersInit,
): Response {
  const body: ApiErrorBody = {
    error: { code, message, requestId },
  };
  return apiJson(body, requestId, { status, headers });
}
