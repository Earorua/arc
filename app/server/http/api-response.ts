export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_INPUT"
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
  result.set("Cache-Control", "no-store");
  result.set("X-Request-Id", requestId);
  return result;
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
