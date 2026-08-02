import { describe, expect, it, vi } from "vitest";
import { UnauthenticatedError } from "../../app/server/auth/session";
import {
  createProductionAccountLinkHandlers,
  type AccountLinkProductionRuntime,
} from "../../app/server/account-link/http";

const origin = "https://arc.example";
const requestId = "00000000-0000-4000-8000-000000000009";

function startRequest() {
  const body = new FormData();
  body.set("targetProvider", "google");
  return new Request(`${origin}/api/account-link/start`, {
    method: "POST",
    headers: { origin },
    body,
  });
}

function cookies(response: Response) {
  return (response.headers as Headers & { getSetCookie(): string[] }).getSetCookie();
}

function runtime(overrides: Partial<AccountLinkProductionRuntime> = {}): AccountLinkProductionRuntime {
  return {
    requireUser: vi.fn(async () => ({
      id: "user-owner",
      name: "Arc Learner",
      email: "owner@example.com",
    })),
    getD1: vi.fn(() => { throw new Error("D1 binding unavailable"); }),
    getAuth: vi.fn(() => ({
      api: {
        listUserAccounts: vi.fn(async () => []),
        linkSocialAccount: vi.fn(async () => ({
          response: { url: "https://provider.example/oauth", redirect: true },
          headers: new Headers(),
        })),
      },
    })),
    readEnvironment: vi.fn(() => ({
      BETTER_AUTH_URL: origin,
      BETTER_AUTH_SECRET: "s".repeat(32),
      GOOGLE_CLIENT_ID: "google-id",
      GOOGLE_CLIENT_SECRET: "google-secret",
      GITHUB_CLIENT_ID: "github-id",
      GITHUB_CLIENT_SECRET: "github-secret",
    })),
    createRequestId: () => requestId,
    now: () => new Date("2026-08-02T08:00:00.000Z"),
    createId: vi.fn()
      .mockReturnValueOnce("intent-1")
      .mockReturnValueOnce("proof-nonce"),
    ...overrides,
  };
}

async function expectSafeError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-request-id")).toBe(requestId);
  await expect(response.json()).resolves.toEqual({
    error: expect.objectContaining({ code, requestId }),
  });
}

class GatewayD1 {
  readonly preparedSql: string[] = [];

  prepare(sql: string) {
    this.preparedSql.push(sql);
    return new GatewayStatement(this, sql);
  }

  async batch() {
    return [
      { success: true, meta: { changes: 0 } },
      { success: true, meta: { changes: 1 } },
    ];
  }
}

class GatewayStatement {
  constructor(
    private readonly db: GatewayD1,
    private readonly sql: string,
  ) {}

  bind() {
    return this;
  }

  async first() {
    if (this.sql.includes("endpoint_rate_buckets")) return { count: 1 };
    if (this.sql.includes("account_link_intents")) return null;
    return null;
  }

  async run() {
    void this.db;
    return { success: true, meta: { changes: 1 } };
  }
}

describe("production account-link handler composition", () => {
  it("records an anonymous event only after auth without touching operational D1 paths", async () => {
    const db = new GatewayD1();
    const getD1 = vi.fn(() => db as unknown as D1Database);
    const requireUser = vi.fn(async () => { throw new UnauthenticatedError(); });
    const fixture = runtime({
      getD1,
      requireUser,
      readEnvironment: vi.fn(() => { throw new Error("must stay lazy"); }),
    });

    const response = await createProductionAccountLinkHandlers(fixture).start(startRequest());

    await expectSafeError(response, 401, "UNAUTHENTICATED");
    expect(getD1).toHaveBeenCalledOnce();
    expect(requireUser.mock.invocationCallOrder[0]).toBeLessThan(
      getD1.mock.invocationCallOrder[0],
    );
    expect(db.preparedSql).toHaveLength(1);
    expect(db.preparedSql[0]).toContain("INSERT INTO operational_events");
    expect(fixture.readEnvironment).not.toHaveBeenCalled();
  });

  it("keeps an anonymous 401 safe when the post-auth event sink binding is unavailable", async () => {
    const getD1 = vi.fn(() => { throw new Error("event binding unavailable"); });
    const requireUser = vi.fn(async () => { throw new UnauthenticatedError(); });
    const fixture = runtime({ getD1, requireUser });

    const response = await createProductionAccountLinkHandlers(fixture).start(startRequest());

    await expectSafeError(response, 401, "UNAUTHENTICATED");
    expect(getD1).toHaveBeenCalledOnce();
    expect(requireUser.mock.invocationCallOrder[0]).toBeLessThan(
      getD1.mock.invocationCallOrder[0],
    );
  });

  it.each([
    ["missing D1", runtime()],
    ["missing configuration", runtime({
      getD1: vi.fn(() => new GatewayD1() as unknown as D1Database),
      readEnvironment: vi.fn(() => ({})),
    })],
  ] as const)("maps %s initialization failure to a sanitized 503", async (_name, fixture) => {
    const response = await createProductionAccountLinkHandlers(fixture).start(startRequest());
    const body = await response.clone().text();

    await expectSafeError(response, 503, "UNAVAILABLE");
    expect(body).not.toMatch(/binding|secret|configuration/iu);
  });

  it("runs the real production service wiring and preserves two Better Auth cookies separately", async () => {
    const authHeaders = new Headers({ "x-auth-flow": "created" });
    authHeaders.append("set-cookie", "arc.oauth_state=one; Path=/; HttpOnly");
    authHeaders.append("set-cookie", "arc.oauth_meta=two; Path=/; HttpOnly");
    const listUserAccounts = vi.fn(async () => [{ providerId: "github" }]);
    const linkSocialAccount = vi.fn(async () => ({
      response: { url: "https://provider.example/oauth", redirect: true },
      headers: authHeaders,
    }));
    const fixture = runtime({
      getD1: vi.fn(() => new GatewayD1() as unknown as D1Database),
      getAuth: vi.fn(() => ({ api: { listUserAccounts, linkSocialAccount } })),
    });

    const response = await createProductionAccountLinkHandlers(fixture).start(startRequest());

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://provider.example/oauth");
    expect(response.headers.get("x-auth-flow")).toBe("created");
    expect(cookies(response)).toEqual([
      "arc.oauth_state=one; Path=/; HttpOnly",
      "arc.oauth_meta=two; Path=/; HttpOnly",
      expect.stringContaining("__Host-arc_link_intent="),
    ]);
    expect(linkSocialAccount).toHaveBeenCalledWith(expect.objectContaining({
      headers: expect.any(Headers),
      body: { provider: "github", disableRedirect: true },
      returnHeaders: true,
    }));
  });
});
