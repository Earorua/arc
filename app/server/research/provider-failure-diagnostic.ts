const ERROR_TYPES = [
  "context_length_exceeded", "max_tokens_exceeded", "token_limit_exceeded", "string_too_long", "authentication",
  "permission_denied", "payment_required", "rate_limit_exceeded", "provider_overloaded", "provider_unavailable",
  "invalid_request", "invalid_prompt", "not_found", "precondition_failed", "payload_too_large", "unprocessable",
  "content_policy_violation", "refusal", "invalid_image", "image_too_large", "image_too_small", "unsupported_image_format",
  "image_not_found", "image_download_failed", "server", "timeout", "unmapped",
] as const;

export type ProviderFailureDiagnostic = {
  httpStatus: number | null;
  location: "http-error" | "top-level-error" | "choice-error";
  errorCode: number | null;
  errorCodeState: "recognized" | "missing" | "invalid";
  errorType: typeof ERROR_TYPES[number] | null;
  errorTypeState: "recognized" | "missing" | "invalid" | "unrecognized";
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function httpCode(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599;
}

/** Observe an already parsed error without retaining any untrusted strings or containers. */
export function extractProviderFailureDiagnostic(httpStatus: unknown, location: ProviderFailureDiagnostic["location"], error: unknown): ProviderFailureDiagnostic {
  const parsedError = record(error);
  const invalidError = error != null && parsedError === null;
  const code = parsedError?.code;
  const metadata = parsedError?.metadata;
  const parsedMetadata = record(metadata);
  const invalidMetadata = metadata != null && parsedMetadata === null;
  const type = parsedMetadata?.error_type;
  const errorCodeState = invalidError ? "invalid" : code == null ? "missing" : httpCode(code) ? "recognized" : "invalid";
  const errorType = typeof type === "string" ? ERROR_TYPES.find((allowed) => allowed === type) ?? null : null;
  const errorTypeState = invalidError || invalidMetadata ? "invalid" : type == null ? "missing"
    : typeof type !== "string" ? "invalid" : errorType === null ? "unrecognized" : "recognized";
  return {
    httpStatus: httpCode(httpStatus) ? httpStatus : null, location,
    errorCode: errorCodeState === "recognized" ? code as number : null, errorCodeState,
    errorType: errorTypeState === "recognized" ? errorType : null, errorTypeState,
  };
}
