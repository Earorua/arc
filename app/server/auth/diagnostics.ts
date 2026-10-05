const UPSTREAM_ERRORS = new Set([
  "invalid_client",
  "invalid_grant",
  "invalid_request",
  "unauthorized_client",
  "unsupported_grant_type",
  "redirect_uri_mismatch",
  "access_denied",
  "temporarily_unavailable",
  "server_error",
]);

export function formatAuthDiagnostic(level: string, message: unknown, args: readonly unknown[]): string {
  const marker = `[Arc Auth] ${level.toUpperCase()}`;
  if (level !== "error" || message !== "") return marker;

  try {
    if (args.length !== 1) return marker;
    const value = args[0];
    if (value === null || typeof value !== "object" || Array.isArray(value)) return marker;

    // Read only own data descriptors; never evaluate exception accessors or
    // inspect messages, nested causes, request details, or serialization hooks.
    const errorDescriptor = Object.getOwnPropertyDescriptor(value, "error");
    const statusDescriptor = Object.getOwnPropertyDescriptor(value, "status");
    const error: unknown = errorDescriptor && Object.prototype.hasOwnProperty.call(errorDescriptor, "value")
      ? errorDescriptor.value : undefined;
    const status: unknown = statusDescriptor && Object.prototype.hasOwnProperty.call(statusDescriptor, "value")
      ? statusDescriptor.value : undefined;

    let result = marker;
    if (typeof error === "string" && UPSTREAM_ERRORS.has(error)) result += ` upstream_error=${error}`;
    if (typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599) {
      result += ` http_status=${status}`;
    }
    return result;
  } catch {
    // Proxies can throw even during Array.isArray. Logging must not change
    // authentication behavior or disclose the inspection failure.
    return marker;
  }
}
