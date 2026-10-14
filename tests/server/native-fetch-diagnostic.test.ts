// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildNativeFetchDiagnostic,
  projectNativeFetchDiagnostic,
  type NativeFetchDiagnosticKind,
} from "../../scripts/live-research/fetch-diagnostic";

const expectedByCode = [
  ["UND_ERR_CONNECT_TIMEOUT", "connect-timeout"],
  ["UND_ERR_HEADERS_TIMEOUT", "headers-timeout"],
  ["UND_ERR_BODY_TIMEOUT", "body-timeout"],
  ["UND_ERR_SOCKET", "socket"],
  ["ECONNRESET", "socket"],
  ["ECONNREFUSED", "socket"],
  ["EPIPE", "socket"],
  ["ENETUNREACH", "socket"],
  ["EHOSTUNREACH", "socket"],
  ["ENOTFOUND", "dns"],
  ["EAI_AGAIN", "dns"],
  ["ERR_TLS_CERT_ALTNAME_INVALID", "tls"],
  ["CERT_HAS_EXPIRED", "tls"],
  ["CERT_NOT_YET_VALID", "tls"],
  ["DEPTH_ZERO_SELF_SIGNED_CERT", "tls"],
  ["SELF_SIGNED_CERT_IN_CHAIN", "tls"],
  ["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "tls"],
  ["UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "tls"],
  ["ERR_TLS_HANDSHAKE_TIMEOUT", "tls"],
  ["ABORT_ERR", "abort"],
  ["UND_ERR_ABORT", "abort"],
  ["ETIMEDOUT", "system-timeout"],
] as const satisfies ReadonlyArray<readonly [string, NativeFetchDiagnosticKind]>;

describe("native fetch diagnostic classification", () => {
  it.each(expectedByCode)("maps exact own code %s to %s", (code, kind) => {
    expect(buildNativeFetchDiagnostic(Object.assign(new Error("CANARY-secret-message"), { code })))
      .toEqual({ version: "native-fetch-diagnostic-v1", kind });
  });

  it("uses exactly the nine bounded kinds", () => {
    const observed = new Set<NativeFetchDiagnosticKind>(expectedByCode.map(([, kind]) => kind));
    observed.add(buildNativeFetchDiagnostic(new Error("CANARY")).kind);
    expect([...observed].sort()).toEqual([
      "abort", "body-timeout", "connect-timeout", "dns", "headers-timeout", "other", "socket",
      "system-timeout", "tls",
    ]);
  });

  it("accepts an own data AbortError name and a real DOMException brand", () => {
    expect(buildNativeFetchDiagnostic({ name: "AbortError" }).kind).toBe("abort");
    if (typeof DOMException !== "undefined") {
      expect(buildNativeFetchDiagnostic(new DOMException("CANARY-secret", "AbortError")).kind).toBe("abort");
    }
  });

  it("rejects a fake DOMException brand without invoking arbitrary properties", () => {
    if (typeof DOMException === "undefined") return;
    const fake = Object.create(DOMException.prototype) as object;
    expect(fake).toBeInstanceOf(DOMException);
    expect(buildNativeFetchDiagnostic(fake).kind).toBe("other");
  });

  it("lets a recognized direct value win over a conflicting cause", () => {
    expect(buildNativeFetchDiagnostic({ code: "ENOTFOUND", cause: { code: "UND_ERR_HEADERS_TIMEOUT" } }).kind).toBe("dns");
  });

  it("inspects at most one own data cause and ignores arrays and AggregateError.errors", () => {
    expect(buildNativeFetchDiagnostic({ cause: { code: "ECONNRESET", cause: { code: "ENOTFOUND" } } }).kind).toBe("socket");
    expect(buildNativeFetchDiagnostic({ cause: { cause: { code: "ENOTFOUND" } } }).kind).toBe("other");
    expect(buildNativeFetchDiagnostic([{ code: "ENOTFOUND" }]).kind).toBe("other");
    expect(buildNativeFetchDiagnostic(new AggregateError([{ code: "ENOTFOUND" }], "CANARY-secret")).kind).toBe("other");
  });

  it("uses exact code matches without prefixes, substrings, prototypes, or coercion", () => {
    const inherited = Object.create({ code: "ENOTFOUND" }) as object;
    const coercible = { toString() { throw new Error("CANARY-coercion"); } };
    expect(buildNativeFetchDiagnostic({ code: "prefix-ENOTFOUND" }).kind).toBe("other");
    expect(buildNativeFetchDiagnostic({ code: "UND_ERR_HEADERS_TIMEOUT_suffix" }).kind).toBe("other");
    expect(buildNativeFetchDiagnostic(inherited).kind).toBe("other");
    expect(buildNativeFetchDiagnostic({ code: coercible }).kind).toBe("other");
  });

  it("never invokes getters, stringification hooks, or deeper causes", () => {
    let calls = 0;
    const nested = { get code() { calls++; return "ENOTFOUND"; } };
    const input = {
      get code() { calls++; return "UND_ERR_HEADERS_TIMEOUT"; },
      get name() { calls++; return "AbortError"; },
      get cause() { calls++; return nested; },
      get message() { calls++; return "CANARY-secret"; },
      toJSON() { calls++; return {}; },
      toString() { calls++; return "CANARY-secret"; },
    };
    expect(buildNativeFetchDiagnostic(input).kind).toBe("other");
    expect(calls).toBe(0);
  });

  it("turns reflection failures into a frozen other diagnostic", () => {
    const proxy = new Proxy({}, { getOwnPropertyDescriptor() { throw new Error("CANARY-reflection"); } });
    const result = buildNativeFetchDiagnostic(proxy);
    expect(result).toEqual({ version: "native-fetch-diagnostic-v1", kind: "other" });
    expect(Object.isFrozen(result)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("CANARY");
  });
});

describe("native fetch diagnostic projection", () => {
  it("returns an independent frozen exact-shape copy within 256 UTF-8 bytes", () => {
    const input = { version: "native-fetch-diagnostic-v1", kind: "tls" };
    const result = projectNativeFetchDiagnostic(input);
    expect(result).toEqual(input);
    expect(result).not.toBe(input);
    expect(Object.keys(result!)).toEqual(["version", "kind"]);
    expect(Object.isFrozen(result)).toBe(true);
    input.kind = "other";
    expect(result?.kind).toBe("tls");
    expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThanOrEqual(256);
  });

  it.each([
    ["null", null],
    ["array", ["native-fetch-diagnostic-v1", "dns"]],
    ["custom prototype", Object.create({ version: "native-fetch-diagnostic-v1", kind: "dns" })],
    ["missing field", { version: "native-fetch-diagnostic-v1" }],
    ["extra field", { version: "native-fetch-diagnostic-v1", kind: "dns", secret: "CANARY" }],
    ["invalid version", { version: "native-fetch-diagnostic-v2", kind: "dns" }],
    ["invalid kind", { version: "native-fetch-diagnostic-v1", kind: "network" }],
  ])("rejects %s", (_label, input) => {
    expect(projectNativeFetchDiagnostic(input)).toBeNull();
  });

  it("rejects symbols, accessors, and non-enumerable fields without invoking getters", () => {
    let getterCalls = 0;
    const symbolInput = { version: "native-fetch-diagnostic-v1", kind: "dns", [Symbol("CANARY")]: true };
    const accessorInput = { version: "native-fetch-diagnostic-v1", get kind() { getterCalls++; return "dns"; } };
    const nonEnumerable = { version: "native-fetch-diagnostic-v1" } as Record<string, unknown>;
    Object.defineProperty(nonEnumerable, "kind", { value: "dns", enumerable: false });
    expect(projectNativeFetchDiagnostic(symbolInput)).toBeNull();
    expect(projectNativeFetchDiagnostic(accessorInput)).toBeNull();
    expect(projectNativeFetchDiagnostic(nonEnumerable)).toBeNull();
    expect(getterCalls).toBe(0);
  });

  it("rejects reflection failures without serializing untrusted input", () => {
    let serializeCalls = 0;
    const proxy = new Proxy({ toJSON() { serializeCalls++; return "CANARY"; } }, {
      getPrototypeOf() { throw new Error("CANARY-reflection"); },
    });
    expect(projectNativeFetchDiagnostic(proxy)).toBeNull();
    expect(serializeCalls).toBe(0);
  });

  it("builds only fixed public values and never exposes exception references", () => {
    const exception = Object.assign(new Error("CANARY-secret-message"), {
      code: "UND_ERR_HEADERS_TIMEOUT", privateToken: "CANARY-secret-token",
    });
    const result = buildNativeFetchDiagnostic(exception);
    expect(result).toEqual({ version: "native-fetch-diagnostic-v1", kind: "headers-timeout" });
    expect(Object.values(result)).not.toContain(exception);
    expect(JSON.stringify(result)).not.toContain("CANARY");
    expect(JSON.stringify(result)).not.toContain("UND_ERR_HEADERS_TIMEOUT");
  });
});
