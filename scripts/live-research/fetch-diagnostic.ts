export type NativeFetchDiagnosticKind = "connect-timeout" | "headers-timeout" | "body-timeout" | "socket" | "dns"
  | "tls" | "abort" | "system-timeout" | "other";

export type NativeFetchDiagnostic = Readonly<{
  version: "native-fetch-diagnostic-v1";
  kind: NativeFetchDiagnosticKind;
}>;

const kindByCode = Object.freeze({
  UND_ERR_CONNECT_TIMEOUT: "connect-timeout",
  UND_ERR_HEADERS_TIMEOUT: "headers-timeout",
  UND_ERR_BODY_TIMEOUT: "body-timeout",
  UND_ERR_SOCKET: "socket",
  ECONNRESET: "socket",
  ECONNREFUSED: "socket",
  EPIPE: "socket",
  ENETUNREACH: "socket",
  EHOSTUNREACH: "socket",
  ENOTFOUND: "dns",
  EAI_AGAIN: "dns",
  ERR_TLS_CERT_ALTNAME_INVALID: "tls",
  CERT_HAS_EXPIRED: "tls",
  CERT_NOT_YET_VALID: "tls",
  DEPTH_ZERO_SELF_SIGNED_CERT: "tls",
  SELF_SIGNED_CERT_IN_CHAIN: "tls",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "tls",
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: "tls",
  ERR_TLS_HANDSHAKE_TIMEOUT: "tls",
  ABORT_ERR: "abort",
  UND_ERR_ABORT: "abort",
  ETIMEDOUT: "system-timeout",
} satisfies Readonly<Record<string, Exclude<NativeFetchDiagnosticKind, "other">>>);

const legalKinds = Object.freeze([
  "connect-timeout", "headers-timeout", "body-timeout", "socket", "dns", "tls", "abort", "system-timeout", "other",
] satisfies readonly NativeFetchDiagnosticKind[]);

const domExceptionNameGetter = typeof DOMException === "undefined" ? undefined
  : Object.getOwnPropertyDescriptor(DOMException.prototype, "name")?.get;

function ownData(value: object, key: "code" | "name" | "cause"): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function classifyOneLevel(value: unknown): NativeFetchDiagnosticKind | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const code = ownData(value, "code");
  if (typeof code === "string" && Object.hasOwn(kindByCode, code)) {
    return kindByCode[code as keyof typeof kindByCode];
  }
  if (typeof DOMException !== "undefined" && value instanceof DOMException
    && domExceptionNameGetter?.call(value) === "AbortError") return "abort";
  return ownData(value, "name") === "AbortError" ? "abort" : null;
}

export function buildNativeFetchDiagnostic(value: unknown): NativeFetchDiagnostic {
  let kind: NativeFetchDiagnosticKind = "other";
  try {
    const direct = classifyOneLevel(value);
    if (direct) kind = direct;
    else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      kind = classifyOneLevel(ownData(value, "cause")) ?? "other";
    }
  } catch { /* Reflection on the rejected value is untrusted. */ }
  return Object.freeze({ version: "native-fetch-diagnostic-v1", kind });
}

export function projectNativeFetchDiagnostic(value: unknown): NativeFetchDiagnostic | null {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length !== 0) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.keys(descriptors).length !== 2) return null;
    const version = descriptors.version;
    const kind = descriptors.kind;
    if (!version || !("value" in version) || !version.enumerable || version.value !== "native-fetch-diagnostic-v1"
      || !kind || !("value" in kind) || !kind.enumerable
      || typeof kind.value !== "string" || !legalKinds.includes(kind.value as NativeFetchDiagnosticKind)) return null;
    const projected = Object.freeze({
      version: "native-fetch-diagnostic-v1" as const,
      kind: kind.value as NativeFetchDiagnosticKind,
    });
    if (new TextEncoder().encode(JSON.stringify(projected)).byteLength > 256) return null;
    return projected;
  } catch {
    return null;
  }
}
