import { projectResponseFormatDiagnostic, type ResponseFormatDiagnostic } from "./response-format-diagnostic";

export const TRANSPORT_DIAGNOSTIC_MAX_RECEIVED_BYTES = 524_289;
export const TRANSPORT_DIAGNOSTIC_MAX_ELAPSED_MS = 720_000;
export const TRANSPORT_DIAGNOSTIC_V2_MAX_ELAPSED_MS = 1_320_000;

export type ResearchTransportDiagnosticVersion = "transport-diagnostic-v1" | "transport-diagnostic-v2" | "transport-diagnostic-v3";

export type ResearchTransportPhase = "fetch" | "headers" | "body-read" | "utf8-chunk" | "utf8-flush" | "outer-json" | "outer-shape";
export type ResearchTransportReason = "fetch-error" | "redirect" | "invalid-content-length" | "declared-body-too-large"
  | "missing-body" | "body-read-error" | "body-too-large" | "invalid-utf8" | "invalid-json" | "non-object" | "deadline";
export type ResearchTransportLocalCancellation = "none" | "deadline-abort" | "reject-response-body" | "reject-read-abort";
export type ResearchTransportNativeErrorKind = "body-timeout" | "headers-timeout" | "socket" | "abort" | "other";

type ResearchTransportDiagnosticCommon = Readonly<{
  phase: ResearchTransportPhase;
  reason: ResearchTransportReason;
  receivedBytes: number;
  bodyComplete: boolean;
  localCancellation: ResearchTransportLocalCancellation;
  nativeErrorKind: ResearchTransportNativeErrorKind | null;
  headersElapsedMs: number | null;
  bodyEndElapsedMs: number | null;
  localCancellationElapsedMs: number | null;
}>;

export type ResearchTransportDiagnostic = Readonly<ResearchTransportDiagnosticCommon & (
  | { version: "transport-diagnostic-v1" | "transport-diagnostic-v2" }
  | { version: "transport-diagnostic-v3"; responseFormat: ResponseFormatDiagnostic | null }
)>;

const legalReasons = Object.freeze({
  fetch: Object.freeze(["fetch-error", "deadline"]),
  headers: Object.freeze(["redirect", "invalid-content-length", "declared-body-too-large", "missing-body"]),
  "body-read": Object.freeze(["body-read-error", "body-too-large", "deadline"]),
  "utf8-chunk": Object.freeze(["invalid-utf8"]),
  "utf8-flush": Object.freeze(["invalid-utf8"]),
  "outer-json": Object.freeze(["invalid-json"]),
  "outer-shape": Object.freeze(["non-object"]),
} satisfies Readonly<Record<ResearchTransportPhase, readonly ResearchTransportReason[]>>);

function ownData(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

const V3_KEYS = Object.freeze([
  "version", "phase", "reason", "receivedBytes", "bodyComplete", "localCancellation", "nativeErrorKind",
  "headersElapsedMs", "bodyEndElapsedMs", "localCancellationElapsedMs", "responseFormat",
]);

function ownPlainData(input: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.getPrototypeOf(input) !== Object.prototype || Object.getOwnPropertySymbols(input).length) return null;
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Object.keys(descriptors).length !== keys.length) return null;
  const copy: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
    copy[key] = descriptor.value;
  }
  return copy;
}

function boundedInteger(value: unknown, maximum: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= maximum;
}

function elapsed(value: unknown, maximum: number): value is number | null {
  return value === null || boundedInteger(value, maximum);
}

const domExceptionNameGetter = typeof DOMException === "undefined" ? undefined
  : Object.getOwnPropertyDescriptor(DOMException.prototype, "name")?.get;

export function projectTransportDiagnostic(value: unknown): Readonly<ResearchTransportDiagnostic> | null {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
    const version = ownData(value, "version");
    const isV3 = version === "transport-diagnostic-v3";
    const source = isV3 ? ownPlainData(value, V3_KEYS) : value;
    if (!source) return null;
    const phase = ownData(source, "phase");
    const reason = ownData(source, "reason");
    const receivedBytes = ownData(source, "receivedBytes");
    const bodyComplete = ownData(source, "bodyComplete");
    const localCancellation = ownData(source, "localCancellation");
    const nativeErrorKind = ownData(source, "nativeErrorKind");
    const headersElapsedMs = ownData(source, "headersElapsedMs");
    const bodyEndElapsedMs = ownData(source, "bodyEndElapsedMs");
    const localCancellationElapsedMs = ownData(source, "localCancellationElapsedMs");
    const maximumElapsedMs = version === "transport-diagnostic-v1" ? TRANSPORT_DIAGNOSTIC_MAX_ELAPSED_MS
      : version === "transport-diagnostic-v2" || isV3 ? TRANSPORT_DIAGNOSTIC_V2_MAX_ELAPSED_MS : null;

    if (maximumElapsedMs === null
      || typeof phase !== "string" || !Object.hasOwn(legalReasons, phase)
      || typeof reason !== "string" || !(legalReasons[phase as ResearchTransportPhase] as readonly string[]).includes(reason)
      || !boundedInteger(receivedBytes, TRANSPORT_DIAGNOSTIC_MAX_RECEIVED_BYTES)
      || typeof bodyComplete !== "boolean"
      || !["none", "deadline-abort", "reject-response-body", "reject-read-abort"].includes(localCancellation as string)
      || ![null, "body-timeout", "headers-timeout", "socket", "abort", "other"].includes(nativeErrorKind as ResearchTransportNativeErrorKind | null)
      || !elapsed(headersElapsedMs, maximumElapsedMs) || !elapsed(bodyEndElapsedMs, maximumElapsedMs)
      || !elapsed(localCancellationElapsedMs, maximumElapsedMs)) return null;

    if ((localCancellation === "none") !== (localCancellationElapsedMs === null)) return null;
    if ((phase === "fetch" || phase === "headers") && bodyEndElapsedMs !== null) return null;
    if (phase !== "fetch" && headersElapsedMs === null) return null;
    if (phase === "fetch" && headersElapsedMs !== null) return null;
    if (!["fetch", "headers"].includes(phase) && bodyEndElapsedMs === null) return null;
    if (["outer-json", "outer-shape", "utf8-flush"].includes(phase) && bodyComplete !== true) return null;
    if (reason === "body-too-large" && (bodyComplete !== false || receivedBytes !== TRANSPORT_DIAGNOSTIC_MAX_RECEIVED_BYTES)) return null;

    const format = isV3 ? ownData(source, "responseFormat") : null;
    if (isV3 && !(phase === "outer-json" && reason === "invalid-json") && format !== null) return null;
    const responseFormat = format === null ? null : projectResponseFormatDiagnostic(format);
    if (format !== null && responseFormat === null) return null;
    const projected = Object.freeze({
      version: version as ResearchTransportDiagnosticVersion,
      phase: phase as ResearchTransportPhase,
      reason: reason as ResearchTransportReason,
      receivedBytes,
      bodyComplete,
      localCancellation: localCancellation as ResearchTransportLocalCancellation,
      nativeErrorKind: nativeErrorKind as ResearchTransportNativeErrorKind | null,
      headersElapsedMs,
      bodyEndElapsedMs,
      localCancellationElapsedMs,
      ...(isV3 ? { responseFormat } : {}),
    });
    if (isV3 && new TextEncoder().encode(JSON.stringify(projected)).byteLength > 2_048) return null;
    return projected as Readonly<ResearchTransportDiagnostic>;
  } catch {
    return null;
  }
}

function classifyOneLevel(value: unknown): ResearchTransportNativeErrorKind | null {
  if (value === null || typeof value !== "object") return null;
  const code = ownData(value, "code");
  if (code === "UND_ERR_BODY_TIMEOUT") return "body-timeout";
  if (code === "UND_ERR_HEADERS_TIMEOUT") return "headers-timeout";
  if (code === "UND_ERR_SOCKET") return "socket";
  if (code === "ABORT_ERR") return "abort";
  if (typeof DOMException !== "undefined" && value instanceof DOMException
    && domExceptionNameGetter?.call(value) === "AbortError") return "abort";
  return ownData(value, "name") === "AbortError" ? "abort" : null;
}

export function classifyNativeTransportError(value: unknown): ResearchTransportNativeErrorKind {
  try {
    const direct = classifyOneLevel(value);
    if (direct) return direct;
    if (value !== null && typeof value === "object") {
      const nested = classifyOneLevel(ownData(value, "cause"));
      if (nested) return nested;
    }
  } catch { /* Untrusted error properties are intentionally ignored. */ }
  return "other";
}
