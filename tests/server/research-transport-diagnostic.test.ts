// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { classifyNativeTransportError, projectTransportDiagnostic, type ResearchTransportDiagnostic }
  from "../../app/server/research/transport-diagnostic";

const completeJsonFailure = (): ResearchTransportDiagnostic => ({
  version: "transport-diagnostic-v1",
  phase: "outer-json",
  reason: "invalid-json",
  receivedBytes: 12,
  bodyComplete: true,
  localCancellation: "none",
  nativeErrorKind: null,
  headersElapsedMs: 1,
  bodyEndElapsedMs: 2,
  localCancellationElapsedMs: null,
});

const completeJsonFailureV3 = () => ({
  ...completeJsonFailure(),
  version: "transport-diagnostic-v3" as const,
  responseFormat: { contentType: "text" as const, bodyPrefixKind: "json-container-like" as const },
});

describe("research transport diagnostic projection", () => {
  it("returns a fresh frozen flat value and omits unknown fields", () => {
    const input = { ...completeJsonFailure(), rawBody: "secret-canary", nested: { token: "secret-canary" } };
    const projected = projectTransportDiagnostic(input);
    expect(projected).toEqual(completeJsonFailure());
    expect(projected).not.toBe(input);
    expect(Object.isFrozen(projected)).toBe(true);
    expect(JSON.stringify(projected)).not.toContain("secret-canary");
  });

  it.each([
    { phase: "fetch", reason: "invalid-json" },
    { version: "transport-diagnostic-v4" },
    { receivedBytes: -1 },
    { receivedBytes: 524_290 },
    { receivedBytes: 1.5 },
    { headersElapsedMs: 720_001 },
    { bodyEndElapsedMs: -1 },
    { localCancellation: "none", localCancellationElapsedMs: 1 },
    { localCancellation: "reject-read-abort", localCancellationElapsedMs: null },
    { phase: "outer-json", bodyComplete: false },
    { phase: "utf8-flush", reason: "invalid-utf8", bodyComplete: false },
    { phase: "body-read", reason: "body-too-large", receivedBytes: 524_288, bodyComplete: false },
    { phase: "body-read", reason: "body-too-large", receivedBytes: 524_289, bodyComplete: true },
    { phase: "fetch", reason: "fetch-error", headersElapsedMs: 0, bodyEndElapsedMs: null },
    { phase: "headers", reason: "missing-body", bodyEndElapsedMs: 2 },
  ])("rejects invalid contract or cross-field combination %#", (change) => {
    expect(projectTransportDiagnostic({ ...completeJsonFailure(), ...change })).toBeNull();
  });

  it("accepts the exact response cap sentinel without clipping it", () => {
    const projected = projectTransportDiagnostic({ ...completeJsonFailure(), phase: "body-read", reason: "body-too-large",
      receivedBytes: 524_289, bodyComplete: false, localCancellation: "reject-read-abort", localCancellationElapsedMs: 3 });
    expect(projected?.receivedBytes).toBe(524_289);
  });

  it.each([
    ["transport-diagnostic-v1", 720_000, 720_001],
    ["transport-diagnostic-v2", 1_320_000, 1_320_001],
    ["transport-diagnostic-v3", 1_320_000, 1_320_001],
  ] as const)("applies the version-selected elapsed bound for %s", (version, maximum, overbound) => {
    const exact = { ...completeJsonFailure(), version, headersElapsedMs: maximum, bodyEndElapsedMs: maximum,
      ...(version === "transport-diagnostic-v3" ? { responseFormat: null } : {}) };
    expect(projectTransportDiagnostic(exact)).toEqual(exact);
    expect(projectTransportDiagnostic({ ...exact, headersElapsedMs: overbound })).toBeNull();
    expect(projectTransportDiagnostic({ ...exact, bodyEndElapsedMs: overbound })).toBeNull();
    expect(projectTransportDiagnostic({ ...exact, localCancellation: "reject-read-abort",
      localCancellationElapsedMs: maximum })).not.toBeNull();
    expect(projectTransportDiagnostic({ ...exact, localCancellation: "reject-read-abort",
      localCancellationElapsedMs: overbound })).toBeNull();
  });

  it("does not invoke accessors and contains Proxy failures", () => {
    const getter = vi.fn(() => { throw new Error("secret-canary"); });
    const accessor = Object.defineProperty({ ...completeJsonFailure() }, "reason", { enumerable: true, get: getter });
    expect(projectTransportDiagnostic(accessor)).toBeNull();
    expect(getter).not.toHaveBeenCalled();
    expect(projectTransportDiagnostic(new Proxy({}, { getOwnPropertyDescriptor() { throw new Error("secret-canary"); } }))).toBeNull();
  });

  it("strictly projects v3 into independent frozen top-level and nested snapshots", () => {
    const input = completeJsonFailureV3();
    const first = projectTransportDiagnostic(input);
    const second = projectTransportDiagnostic(input);
    (input.responseFormat as { contentType: string }).contentType = "json";
    expect(first).toEqual(completeJsonFailureV3());
    expect(second).toEqual(completeJsonFailureV3());
    expect(first).not.toBe(input);
    expect(first).not.toBe(second);
    expect(Object.isFrozen(first)).toBe(true);
    if (first?.version === "transport-diagnostic-v3") {
      expect(first.responseFormat).not.toBe(input.responseFormat);
      expect(Object.isFrozen(first.responseFormat)).toBe(true);
    }
    expect(new TextEncoder().encode(JSON.stringify(first)).byteLength).toBeLessThanOrEqual(2_048);
  });

  it.each([
    { ...completeJsonFailureV3(), extra: "secret-canary" },
    { ...completeJsonFailureV3(), responseFormat: { ...completeJsonFailureV3().responseFormat, extra: "secret-canary" } },
    { ...completeJsonFailureV3(), responseFormat: { contentType: "text", bodyPrefixKind: "invalid" } },
    { ...completeJsonFailureV3(), phase: "outer-shape", reason: "non-object" },
    { ...completeJsonFailure(), version: "transport-diagnostic-v3" },
    Object.assign(Object.create(null), completeJsonFailureV3()),
    Object.assign(Object.create({ inherited: true }), completeJsonFailureV3()),
  ])("rejects a non-exact v3 contract %#", (input) => {
    expect(projectTransportDiagnostic(input)).toBeNull();
  });

  it("accepts null format only on the parse-failure path and requires it elsewhere", () => {
    expect(projectTransportDiagnostic({ ...completeJsonFailureV3(), responseFormat: null })).not.toBeNull();
    expect(projectTransportDiagnostic({ ...completeJsonFailureV3(), phase: "outer-shape", reason: "non-object",
      responseFormat: null })).not.toBeNull();
    expect(projectTransportDiagnostic({ ...completeJsonFailureV3(), phase: "outer-shape", reason: "non-object",
      responseFormat: completeJsonFailureV3().responseFormat })).toBeNull();
  });

  it("rejects v3 symbols and accessors without invoking getters or leaking canaries", () => {
    const getter = vi.fn(() => "invalid-json");
    const accessor = Object.defineProperty({ ...completeJsonFailureV3() }, "reason", {
      enumerable: true,
      get: getter,
    });
    const symbolInput = { ...completeJsonFailureV3(), [Symbol("secret-canary")]: true };
    const hidden = Object.defineProperty({ ...completeJsonFailureV3() }, "reason", {
      value: "invalid-json",
      enumerable: false,
    });
    expect(projectTransportDiagnostic(accessor)).toBeNull();
    expect(projectTransportDiagnostic(symbolInput)).toBeNull();
    expect(projectTransportDiagnostic(hidden)).toBeNull();
    expect(getter).not.toHaveBeenCalled();
    expect(JSON.stringify(projectTransportDiagnostic({ ...completeJsonFailureV3(), privateBody: "secret-canary" })))
      .not.toContain("secret-canary");
    expect(JSON.stringify(projectTransportDiagnostic({ ...completeJsonFailure(), rawBody: "secret-canary" })))
      .not.toContain("secret-canary");
  });

  it.each([null, [], "value", {}, { ...completeJsonFailure(), reason: undefined }])("rejects missing or invalid shapes: %j", (value) => {
    expect(projectTransportDiagnostic(value)).toBeNull();
  });
});

describe("native transport error classification", () => {
  it.each([
    [{ code: "UND_ERR_BODY_TIMEOUT" }, "body-timeout"],
    [{ code: "UND_ERR_HEADERS_TIMEOUT" }, "headers-timeout"],
    [{ code: "UND_ERR_SOCKET" }, "socket"],
    [{ code: "ABORT_ERR" }, "abort"],
    [{ name: "AbortError" }, "abort"],
    [new DOMException("secret-canary", "AbortError"), "abort"],
    [{ cause: { code: "UND_ERR_BODY_TIMEOUT" } }, "body-timeout"],
    [{ cause: { name: "AbortError" } }, "abort"],
  ] as const)("classifies the allowlisted native shape %#", (value, expected) => {
    expect(classifyNativeTransportError(value)).toBe(expected);
  });

  it.each([
    null,
    new Error("secret-canary"),
    { code: "ECONNRESET", message: "secret-canary", stack: "secret-canary" },
    { cause: { cause: { code: "UND_ERR_SOCKET" } } },
  ])("collapses every non-allowlisted error to other", (value) => {
    expect(classifyNativeTransportError(value)).toBe("other");
  });

  it("does not invoke error getters and contains Proxy failures", () => {
    const getter = vi.fn(() => { throw new Error("secret-canary"); });
    const accessor = Object.defineProperty({}, "code", { enumerable: true, get: getter });
    expect(classifyNativeTransportError(accessor)).toBe("other");
    expect(getter).not.toHaveBeenCalled();
    expect(classifyNativeTransportError(new Proxy({}, { getOwnPropertyDescriptor() { throw new Error("secret-canary"); } }))).toBe("other");
  });

  it("recognizes a real AbortError without invoking an overriding DOMException name accessor", () => {
    const getter = vi.fn(() => { throw new Error("secret-canary"); });
    class HostileAbortError extends DOMException {
      override get name(): string { return getter(); }
    }
    const error = new HostileAbortError("secret-canary", "AbortError");

    expect(classifyNativeTransportError(error)).toBe("abort");
    expect(getter).not.toHaveBeenCalled();
  });
});
