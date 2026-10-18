// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { fixtureHarness, ORIGIN, preservedRows, rows } from "../helpers/auth-migration-fixture";
import { callback, startSocial } from "../helpers/auth-migration-oauth";

const harness = fixtureHarness();
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SYNTHETIC_CODE = "synthetic-diagnostic-code";

describe("auth diagnostics through the actual Google callback", () => {
  it.each([
    {
      name: "401 invalid_client",
      respond: () => Response.json({ error: "invalid_client", error_description: "synthetic-private-provider-description" }, { status: 401 }),
      marker: "[Arc Auth] ERROR upstream_error=invalid_client http_status=401",
    },
    {
      name: "400 invalid_grant",
      respond: () => Response.json({ error: "invalid_grant", error_description: "synthetic-private-provider-description" }, { status: 400 }),
      marker: "[Arc Auth] ERROR upstream_error=invalid_grant http_status=400",
    },
    {
      name: "transport exception",
      respond: () => { throw new Error("synthetic-private-transport-exception"); },
      marker: "[Arc Auth] ERROR",
    },
    {
      name: "unknown provider error",
      respond: () => Response.json({ error: "synthetic-private-unknown-error" }, { status: 502 }),
      marker: "[Arc Auth] ERROR http_status=502",
    },
    {
      name: "malformed error response",
      respond: () => new Response("{synthetic-private-malformed-response", { status: 502 }),
      marker: "[Arc Auth] ERROR http_status=502",
    },
    {
      name: "malformed successful token response",
      respond: () => Response.json(null),
      marker: "[Arc Auth] ERROR",
    },
    {
      name: "refused token endpoint redirect",
      respond: () => new Response(null, { status: 302, headers: { location: "https://synthetic-private.invalid/token" } }),
      marker: "[Arc Auth] ERROR",
    },
  ])("handles $name without changing the failed callback", async ({ respond, marker }) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url !== TOKEN_ENDPOINT) throw new Error("SYNTHETIC_DIAGNOSTIC_NETWORK_DENIED");
      return respond();
    });
    vi.stubGlobal("fetch", fetch);
    const f = await harness.fixture();
    const before = preservedRows(f);
    const accountsBefore = rows(f, "accounts");
    const start = await startSocial(f, "google");
    const statePayload = JSON.parse(String(start.verification.value)) as { codeVerifier: string };

    const response = await callback(f, "google", start.state, start.cookie, "code", SYNTHETIC_CODE);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [input, init] = fetch.mock.calls[0];
    expect(String(input)).toBe(TOKEN_ENDPOINT);
    expect(init?.method).toBe("POST");
    expect(init?.redirect).toBe("manual");
    expect(init?.body).toBeInstanceOf(URLSearchParams);
    const body = init?.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe(SYNTHETIC_CODE);
    expect(body.get("client_id")).toBe("synthetic-google-id");
    expect(body.get("client_secret")).toBe("synthetic-google-secret");
    expect(body.get("redirect_uri")).toBe(`${ORIGIN}/api/auth/callback/google`);
    expect(statePayload.codeVerifier).toEqual(expect.any(String));
    expect(statePayload.codeVerifier.length).toBeGreaterThan(0);
    expect(body.get("code_verifier")).toBe(statePayload.codeVerifier);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/today?error=invalid_code`);
    expect(rows(f, "verifications")).toEqual([]);
    expect(rows(f, "sessions")).toEqual([]);
    expect(rows(f, "accounts")).toEqual(accountsBefore);
    expect(preservedRows(f)).toEqual(before);
    expect(warn).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(error.mock.calls).toEqual([[marker]]);
  });
});
