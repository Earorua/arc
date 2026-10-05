import { describe, expect, it, vi } from "vitest";
import { formatAuthDiagnostic } from "../../app/server/auth/diagnostics";

const GENERIC = "[Arc Auth] ERROR";
const PRIVATE = "synthetic-private-diagnostic-sentinel";
const ALLOWED_ERRORS = [
  "invalid_client",
  "invalid_grant",
  "invalid_request",
  "unauthorized_client",
  "unsupported_grant_type",
  "redirect_uri_mismatch",
  "access_denied",
  "temporarily_unavailable",
  "server_error",
] as const;

describe("bounded auth diagnostic formatting", () => {
  it.each(ALLOWED_ERRORS)("accepts the exact %s error with or without a valid status", (error) => {
    expect(formatAuthDiagnostic("error", "", [{ error, status: 401 }]))
      .toBe(`${GENERIC} upstream_error=${error} http_status=401`);
    expect(formatAuthDiagnostic("error", "", [{ error }]))
      .toBe(`${GENERIC} upstream_error=${error}`);
    expect(formatAuthDiagnostic("error", "", [{ error, status: PRIVATE }]))
      .toBe(`${GENERIC} upstream_error=${error}`);
  });

  it.each([400, 401, 499, 500, 599])("accepts integer HTTP error status %i without an accepted code", (status) => {
    expect(formatAuthDiagnostic("error", "", [{ error: PRIVATE, status }]))
      .toBe(`${GENERIC} http_status=${status}`);
  });

  it.each([
    ["below range", 399], ["above range", 600], ["success", 200], ["zero", 0],
    ["negative", -400], ["fraction", 400.5], ["NaN", NaN], ["infinity", Infinity],
    ["negative infinity", -Infinity], ["numeric string", "401"], ["private string", PRIVATE],
    ["null", null], ["missing", undefined], ["bigint", BigInt(401)], ["boolean", true],
    ["boxed number", Object(401)],
  ])("rejects a %s status without coercion", (_label, status) => {
    expect(formatAuthDiagnostic("error", "", [{ status }])).toBe(GENERIC);
    expect(formatAuthDiagnostic("error", "", [{ error: "invalid_client", status }]))
      .toBe(`${GENERIC} upstream_error=invalid_client`);
  });

  it.each(["warn", "info", "debug", "ERROR"])("keeps %s calls severity-only", (level) => {
    expect(formatAuthDiagnostic(level, "", [{ error: "invalid_client", status: 401 }]))
      .toBe(`[Arc Auth] ${level.toUpperCase()}`);
  });

  it.each([
    ["ordinary", "Token exchange failed"], ["whitespace", " "], ["null", null],
    ["missing", undefined], ["object", { error: "invalid_client", message: PRIVATE }],
    ["boxed empty string", Object("")],
  ])("keeps a %s message severity-only", (_label, message) => {
    expect(formatAuthDiagnostic("error", message, [{ error: "invalid_client", status: 401 }]))
      .toBe(GENERIC);
  });

  it("rejects missing and extra arguments without inspecting their contents", () => {
    const get = vi.fn(() => { throw new Error(PRIVATE); });
    const extra = new Proxy({}, { get, getOwnPropertyDescriptor: get });
    expect(formatAuthDiagnostic("error", "", [])).toBe(GENERIC);
    expect(formatAuthDiagnostic("error", "", [{ error: "invalid_client", status: 401 }, extra]))
      .toBe(GENERIC);
    expect(get).not.toHaveBeenCalled();
  });

  it.each([
    ["null", null], ["missing", undefined], ["text", PRIVATE], ["number", 401],
    ["boolean", true], ["symbol", Symbol(PRIVATE)], ["function", () => PRIVATE],
    ["array", []], ["decorated array", Object.assign([], { error: "invalid_client", status: 401 })],
  ])("keeps a %s argument severity-only", (_label, value) => {
    expect(formatAuthDiagnostic("error", "", [value])).toBe(GENERIC);
  });

  it("uses own data properties, including non-enumerable and null-prototype records", () => {
    const inherited = { error: "invalid_client", status: 401 };
    expect(formatAuthDiagnostic("error", "", [Object.create(inherited)])).toBe(GENERIC);
    expect(formatAuthDiagnostic("error", "", [Object.assign(Object.create(inherited), { status: 502 })]))
      .toBe(`${GENERIC} http_status=502`);
    expect(formatAuthDiagnostic("error", "", [Object.assign(Object.create(inherited), { error: "invalid_grant" })]))
      .toBe(`${GENERIC} upstream_error=invalid_grant`);
    const own = Object.create(null, {
      error: { value: "invalid_client" },
      status: { value: 401 },
    });
    expect(formatAuthDiagnostic("error", "", [own]))
      .toBe(`${GENERIC} upstream_error=invalid_client http_status=401`);
  });

  it("ignores accessor descriptors without evaluating getters", () => {
    const getter = vi.fn(() => { throw new Error(PRIVATE); });
    const errorAccessor = Object.defineProperty({ status: 401 }, "error", { get: getter });
    const statusAccessor = Object.defineProperty({ error: "invalid_client" }, "status", { get: getter });
    const bothAccessors = Object.defineProperties({}, { error: { get: getter }, status: { get: getter } });
    expect(formatAuthDiagnostic("error", "", [errorAccessor])).toBe(`${GENERIC} http_status=401`);
    expect(formatAuthDiagnostic("error", "", [statusAccessor])).toBe(`${GENERIC} upstream_error=invalid_client`);
    expect(formatAuthDiagnostic("error", "", [bothAccessors])).toBe(GENERIC);
    expect(getter).not.toHaveBeenCalled();
  });

  it("never visits private fields or serialization hooks beside recognized fields", () => {
    const getter = vi.fn(() => { throw new Error(PRIVATE); });
    const toJSON = vi.fn(() => PRIVATE);
    const toString = vi.fn(() => PRIVATE);
    const value = { error: "invalid_client", status: 401, toJSON, toString };
    for (const field of [
      "message", "stack", "description", "error_description", "statusText", "cause", "request", "response",
      "headers", "body", "url", "email", "account", "clientId", "clientSecret", "code", "state", "verifier",
      "accessToken", "refreshToken", "idToken", "cookie",
    ]) Object.defineProperty(value, field, { get: getter });
    expect(formatAuthDiagnostic("error", "", [value]))
      .toBe(`${GENERIC} upstream_error=invalid_client http_status=401`);
    expect(getter).not.toHaveBeenCalled();
    expect(toJSON).not.toHaveBeenCalled();
    expect(toString).not.toHaveBeenCalled();
  });

  it("does not traverse nested causes or cyclic records", () => {
    const nested = { cause: { error: "invalid_client", status: 401, message: PRIVATE } };
    expect(formatAuthDiagnostic("error", "", [nested])).toBe(GENERIC);
    const cyclic: Record<string, unknown> = { error: "invalid_grant", status: 400, message: PRIVATE };
    cyclic.cause = cyclic;
    cyclic.response = cyclic;
    expect(formatAuthDiagnostic("error", "", [cyclic]))
      .toBe(`${GENERIC} upstream_error=invalid_grant http_status=400`);
  });

  it.each([
    ["unknown", PRIVATE], ["uppercase", "INVALID_CLIENT"], ["padded", " invalid_client"],
    ["suffix", "invalid_client\nsynthetic-private-diagnostic-sentinel"], ["number", 401],
    ["array", ["invalid_client"]], ["nested", { error: "invalid_client" }],
  ])("rejects a %s error code while retaining only a valid status", (_label, error) => {
    expect(formatAuthDiagnostic("error", "", [{ error }])).toBe(GENERIC);
    expect(formatAuthDiagnostic("error", "", [{ error, status: 502 }])).toBe(`${GENERIC} http_status=502`);
  });

  it("does not coerce object-valued error or status fields", () => {
    const toString = vi.fn(() => "invalid_client");
    const toJSON = vi.fn(() => 401);
    const valueOf = vi.fn(() => 401);
    const privateValue = { toString, toJSON, valueOf, message: PRIVATE };
    expect(formatAuthDiagnostic("error", "", [{ error: privateValue, status: privateValue }])).toBe(GENERIC);
    expect(toString).not.toHaveBeenCalled();
    expect(toJSON).not.toHaveBeenCalled();
    expect(valueOf).not.toHaveBeenCalled();
  });

  it("keeps transport and redirect-refusal exception text private", () => {
    for (const message of [`Transport failed ${PRIVATE}`, `OAuth endpoint refused a redirect ${PRIVATE}`]) {
      expect(formatAuthDiagnostic("error", "", [new Error(message)])).toBe(GENERIC);
    }
  });

  it("does not enumerate or read properties through proxy get traps", () => {
    const trap = vi.fn(() => { throw new Error(PRIVATE); });
    const value = new Proxy({ error: "invalid_client", status: 401 }, { get: trap, ownKeys: trap, getPrototypeOf: trap });
    expect(formatAuthDiagnostic("error", "", [value]))
      .toBe(`${GENERIC} upstream_error=invalid_client http_status=401`);
    expect(trap).not.toHaveBeenCalled();
  });

  it.each(["error", "status"])("falls back completely when the %s descriptor trap throws", (field) => {
    const value = new Proxy({ error: "invalid_client", status: 401 }, {
      getOwnPropertyDescriptor(target, key) {
        if (key === field) throw new Error(PRIVATE);
        return Object.getOwnPropertyDescriptor(target, key);
      },
    });
    expect(formatAuthDiagnostic("error", "", [value])).toBe(GENERIC);
  });

  it("contains revoked proxy failures from array inspection", () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    expect(formatAuthDiagnostic("error", "", [proxy])).toBe(GENERIC);
  });
});
