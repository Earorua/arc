import { describe, expect, it, vi } from "vitest";
import { AccountLinkError } from "../../app/server/account-link/contracts";
import { UnauthenticatedError } from "../../app/server/auth/session";
import { RateLimitUnavailableError } from "../../app/server/http/rate-limit";
import {
  createAccountLinkHandlers,
  type AccountLinkHttpDependencies,
} from "../../app/server/account-link/http";

const requestId = "00000000-0000-4000-8000-000000000007";
const origin = "https://arc.example";
const user = { id: "user-owner", name: "Arc Learner", email: "owner@example.com" };

function formRequest(path: "start" | "continue", fields: Record<string, string> = {}) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  return new Request(`${origin}/api/account-link/${path}`, {
    method: "POST",
    headers: { origin },
    body,
  });
}

function statusRequest(cookie = "__Host-arc_link_intent=browser-credential") {
  return new Request(`${origin}/api/account-link/status`, {
    headers: cookie ? { cookie } : undefined,
  });
}

function setup() {
  const start = vi.fn().mockResolvedValue({
    credential: "browser-credential",
    authorizationUrl: "https://provider.example/oauth",
    authHeaders: (() => {
      const headers = new Headers({ "x-provider-state": "created" });
      headers.append("set-cookie", "arc.oauth_state=one; Path=/; HttpOnly");
      headers.append("set-cookie", "arc.oauth_meta=two; Path=/; HttpOnly");
      return headers;
    })(),
  });
  const status = vi.fn().mockResolvedValue({
    stage: "verified",
    targetProvider: "google",
    expiresAt: "2026-08-02T08:05:00.000Z",
  });
  const continueLink = vi.fn().mockResolvedValue({
    authorizationUrl: "https://provider.example/target",
    authHeaders: new Headers(),
  });
  const reserve = vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  const requireUser = vi.fn().mockResolvedValue(user);
  const recordEvent = vi.fn().mockResolvedValue(undefined);
  const deps: AccountLinkHttpDependencies = {
    requireUser,
    service: { start, status, continue: continueLink },
    readCredential: (headers) => headers.get("cookie")?.includes("browser-credential")
      ? "browser-credential"
      : null,
    serializeCredential: (value, maxAge) =>
      `__Host-arc_link_intent=${value}; Max-Age=${maxAge}; Path=/; Secure; HttpOnly; SameSite=Lax`,
    clearCredential: () =>
      "__Host-arc_link_intent=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax",
    rateLimiter: { reserve },
    configuredOrigin: origin,
    createRequestId: () => requestId,
    now: () => 1_785_657_600_000,
    recordEvent,
  };
  return {
    handlers: createAccountLinkHandlers(deps),
    requireUser,
    start,
    status,
    continueLink,
    reserve,
    recordEvent,
  };
}

async function expectError(response: Response, status: number, code: string, message: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-request-id")).toBe(requestId);
  await expect(response.json()).resolves.toEqual({
    error: { code, message, requestId },
  });
}

function setCookies(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  return headers.getSetCookie?.() ?? [];
}

describe("Arc account-link HTTP gateway", () => {
  it.each([
    ["start", (handlers: ReturnType<typeof createAccountLinkHandlers>) => handlers.start(formRequest("start", { targetProvider: "google" }))],
    ["status", (handlers: ReturnType<typeof createAccountLinkHandlers>) => handlers.status(statusRequest())],
    ["continue", (handlers: ReturnType<typeof createAccountLinkHandlers>) => handlers.continue(formRequest("continue"))],
  ])("returns a safe 401 for unauthenticated %s requests", async (_name, invoke) => {
    const harness = setup();
    harness.requireUser.mockRejectedValue(new UnauthenticatedError());
    const response = await invoke(harness.handlers);

    await expectError(response, 401, "UNAUTHENTICATED", "Sign in again to continue.");
    expect(harness.reserve).not.toHaveBeenCalled();
  });

  it.each(["start", "continue"] as const)(
    "rejects a non-matching or missing Origin before the %s mutation",
    async (route) => {
      const harness = setup();
      const request = formRequest(route, route === "start" ? { targetProvider: "google" } : {});
      request.headers.set("origin", "https://arc.example.attacker.test");
      const response = await harness.handlers[route](request);

      await expectError(response, 403, "FORBIDDEN", "This request could not be verified.");
      expect(harness.reserve).not.toHaveBeenCalled();
      expect(harness[route === "start" ? "start" : "continueLink"]).not.toHaveBeenCalled();
    },
  );

  it("rejects a missing Origin and accepts the configured origin after URL canonicalization", async () => {
    const harness = setup();
    const missingOrigin = formRequest("start", { targetProvider: "google" });
    missingOrigin.headers.delete("origin");
    await expectError(
      await harness.handlers.start(missingOrigin),
      403,
      "FORBIDDEN",
      "This request could not be verified.",
    );

    const canonicalOrigin = formRequest("start", { targetProvider: "google" });
    canonicalOrigin.headers.set("origin", "HTTPS://ARC.EXAMPLE:443/browser-supplied-path");
    const response = await harness.handlers.start(canonicalOrigin);
    expect(response.status).toBe(303);
    expect(harness.start).toHaveBeenCalledOnce();
  });

  it("accepts only targetProvider form data and returns a cookie-preserving 303", async () => {
    const harness = setup();
    const request = formRequest("start", { targetProvider: "google" });
    const response = await harness.handlers.start(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://provider.example/oauth");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("x-provider-state")).toBe("created");
    expect(setCookies(response)).toEqual([
      "arc.oauth_state=one; Path=/; HttpOnly",
      "arc.oauth_meta=two; Path=/; HttpOnly",
      expect.stringContaining("__Host-arc_link_intent=browser-credential"),
    ]);
    expect(setCookies(response)[2]).toContain("HttpOnly");
    expect(harness.start).toHaveBeenCalledWith(request.headers, user.id, "google");
  });

  it("rejects extra start fields without trusting a browser callback or origin", async () => {
    const harness = setup();
    const response = await harness.handlers.start(formRequest("start", {
      targetProvider: "google",
      callbackURL: "https://attacker.test",
    }));

    await expectError(response, 400, "INVALID_INPUT", "Choose a valid sign-in method.");
    expect(harness.start).not.toHaveBeenCalled();
  });

  it("returns only the safe status projection and passes headers for reconciliation", async () => {
    const harness = setup();
    harness.status.mockResolvedValue({
      stage: "verified",
      targetProvider: "github",
      expiresAt: "2026-08-02T08:05:00.000Z",
      credential: "secret",
      tokenHash: "hash",
      proof: "proof",
      accountId: "provider-account",
      email: "private@example.com",
    });
    const request = statusRequest();
    const response = await harness.handlers.status(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe(requestId);
    await expect(response.json()).resolves.toEqual({
      stage: "verified",
      targetProvider: "github",
      expiresAt: "2026-08-02T08:05:00.000Z",
    });
    expect(harness.status).toHaveBeenCalledWith(user.id, "browser-credential", request.headers);
  });

  it.each(["completed", "failed", "expired"] as const)(
    "returns terminal %s once and clears the Arc credential cookie",
    async (stage) => {
      const harness = setup();
      harness.status.mockResolvedValue({
        stage,
        targetProvider: "google",
        expiresAt: "2026-08-02T08:05:00.000Z",
      });
      const response = await harness.handlers.status(statusRequest());

      expect(await response.json()).toEqual({
        stage,
        targetProvider: "google",
        expiresAt: "2026-08-02T08:05:00.000Z",
      });
      expect(setCookies(response)).toEqual([
        expect.stringContaining("__Host-arc_link_intent=; Max-Age=0"),
      ]);
    },
  );

  it("keeps the Arc cookie while Task 6 reports completion reconciliation in progress", async () => {
    const harness = setup();
    harness.status.mockResolvedValue({
      stage: "completing",
      targetProvider: "github",
      expiresAt: "2026-08-02T08:05:00.000Z",
    });
    const response = await harness.handlers.status(statusRequest());

    expect(response.status).toBe(200);
    expect(setCookies(response)).toEqual([]);
    await expect(response.json()).resolves.toMatchObject({ stage: "completing" });
  });

  it("redirects continue only after the service atomically consumes the grant", async () => {
    const harness = setup();
    harness.continueLink.mockResolvedValue({
      authorizationUrl: "https://provider.example/target",
      authHeaders: (() => {
        const headers = new Headers();
        headers.append("set-cookie", "arc.target_state=one; Path=/; HttpOnly");
        headers.append("set-cookie", "arc.target_meta=two; Path=/; HttpOnly");
        return headers;
      })(),
    });
    const request = formRequest("continue");
    request.headers.set("cookie", "__Host-arc_link_intent=browser-credential");
    const response = await harness.handlers.continue(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://provider.example/target");
    expect(setCookies(response)).toEqual([
      "arc.target_state=one; Path=/; HttpOnly",
      "arc.target_meta=two; Path=/; HttpOnly",
      expect.stringContaining("__Host-arc_link_intent=browser-credential"),
    ]);
    expect(harness.continueLink).toHaveBeenCalledWith(request.headers, user.id, "browser-credential");
  });

  it.each([
    ["EXPIRED", "Verification expired. Start again."],
    ["REPLAYED", "Connection wasn't completed. Start again."],
    ["INVALID_INTENT", "Connection wasn't completed. Start again."],
  ] as const)("maps %s continue failures to a safe 409 and clears the cookie", async (domainCode, message) => {
    const harness = setup();
    harness.continueLink.mockRejectedValue(new AccountLinkError(domainCode, "private account provider details"));
    const request = formRequest("continue");
    request.headers.set("cookie", "__Host-arc_link_intent=browser-credential");
    const response = await harness.handlers.continue(request);

    await expectError(response, 409, "CONFLICT", message);
    expect(setCookies(response)).toEqual([
      expect.stringContaining("__Host-arc_link_intent=; Max-Age=0"),
    ]);
  });

  it.each([
    ["start", 5, 600],
    ["continue", 10, 600],
    ["status", 60, 60],
  ] as const)("uses the fail-closed %s user rate bucket", async (route, limit, windowSeconds) => {
    const harness = setup();
    const request = route === "status"
      ? statusRequest()
      : formRequest(route, route === "start" ? { targetProvider: "google" } : {});
    if (route === "continue") request.headers.set("cookie", "__Host-arc_link_intent=browser-credential");
    await harness.handlers[route](request);

    expect(harness.reserve).toHaveBeenCalledWith({
      scope: `account-link:${route}`,
      subject: user.id,
      limit,
      windowSeconds,
    });

    harness.reserve.mockRejectedValue(new RateLimitUnavailableError());
    const unavailable = await harness.handlers[route](request);
    await expectError(unavailable, 503, "UNAVAILABLE", "Connection could not start. Try again.");

    harness.reserve.mockRejectedValue(new Error("raw D1 database failure"));
    const genericFailure = await harness.handlers[route](request);
    await expectError(genericFailure, 503, "UNAVAILABLE", "Connection could not start. Try again.");
  });

  it("denies exhausted rate buckets before calling the service", async () => {
    const harness = setup();
    harness.reserve.mockResolvedValue({ allowed: false, retryAfterSeconds: 29 });
    const response = await harness.handlers.start(formRequest("start", { targetProvider: "github" }));

    await expectError(response, 429, "RATE_LIMITED", "Too many attempts. Wait before trying again.");
    expect(response.headers.get("retry-after")).toBe("29");
    expect(harness.start).not.toHaveBeenCalled();
  });

  it.each([
    ["NOT_CONFIGURED", 400, "INVALID_INPUT", "Choose a valid sign-in method."],
    ["NO_SOURCE_PROVIDER", 400, "INVALID_INPUT", "Choose a valid sign-in method."],
    ["ALREADY_CONNECTED", 409, "CONFLICT", "That sign-in method is already connected."],
  ] as const)("maps %s without leaking domain detail", async (domainCode, status, code, message) => {
    const harness = setup();
    harness.start.mockRejectedValue(new AccountLinkError(domainCode, "email tokenHash credential proof accountId"));
    const response = await harness.handlers.start(formRequest("start", { targetProvider: "google" }));
    const body = await response.clone().text();

    await expectError(response, status, code, message);
    expect(body).not.toMatch(/tokenHash|credential|proof|accountId|@/iu);
  });

  it("sanitizes unexpected secret-bearing failures", async () => {
    const harness = setup();
    harness.start.mockRejectedValue(new Error(
      "credential=raw tokenHash=hash proof=signed accountId=provider private@example.com",
    ));
    const response = await harness.handlers.start(formRequest("start", { targetProvider: "google" }));
    const body = await response.clone().text();

    await expectError(
      response,
      500,
      "INTERNAL",
      "Connection could not be completed. Nothing changed.",
    );
    expect(body).not.toMatch(/credential|tokenHash|proof|accountId|private@example\.com/iu);
  });
});
