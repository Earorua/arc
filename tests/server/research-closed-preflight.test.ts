// @vitest-environment node
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as authRuntime from "../../app/server/auth/runtime";
import { requireArcUser, UnauthenticatedError } from "../../app/server/auth/session";
import { createResearchClosedPreflightDependencies, createResearchClosedPreflightHandler } from "../../app/server/http/research-closed-preflight-route";
import { signBridgeMessage } from "../../app/server/research/executor/auth";
import { CLOSED_PREFLIGHT_JOB_ID, CLOSED_PREFLIGHT_PATH } from "../../app/server/research/executor/closed-preflight";
import { readResearchBridgeConnection } from "../../app/server/research/executor/connection-config";
import type { ResearchProductionEnvironment } from "../../app/server/research/production-policy";
import { TEST_BRIDGE_ENVIRONMENT } from "../helpers/research-bridge-fixture";
import { createResearchD1, seedUser } from "../helpers/sqlite-d1";

const dispose: (() => void)[] = [];
afterEach(() => { vi.restoreAllMocks(); Reflect.deleteProperty(env, "DB"); for (const close of dispose.splice(0)) close(); });
const owner = { id: "owner-a", name: "A", email: "a@example.test" };
const reply = { executorClosed: true, jobAbsent: true, siteOutboxEmpty: true };
function request(init: RequestInit = {}, url = `https://site.test${CLOSED_PREFLIGHT_PATH}`) {
  return new Request(url, { method: "POST", body: "{}", headers: { "content-type": "application/json",
    origin: "https://site.test", "sec-fetch-site": "same-origin" }, ...init });
}
function fixture() {
  const db = createResearchD1(); dispose.push(() => db.close());
  db.database.prepare("INSERT INTO feature_flags(key,enabled,cohort_json) VALUES (?,?,?)")
    .run("role-research-beta", 1, JSON.stringify({ userIds: [owner.id] }));
  const conn = readResearchBridgeConnection(TEST_BRIDGE_ENVIRONMENT)!;
  const binding = { fetch: vi.fn(async (req: Request) => {
    const body = new TextEncoder().encode(JSON.stringify(reply));
    const headers = await signBridgeMessage({ context: { direction: "site-to-executor", kind: "response", method: "POST",
      path: new URL(req.url).pathname, audience: conn.executorOrigin, jobId: CLOSED_PREFLIGHT_JOB_ID, status: 200 },
      body, keyId: conn.siteToExecutor.keyId, keyBytes: conn.siteToExecutor.copyKeyBytes(), now: Date.now });
    return new Response(body, { status: 200, headers });
  }) };
  const environment: ResearchProductionEnvironment = { ...TEST_BRIDGE_ENVIRONMENT, ARC_AI_ENABLED: "false",
    ARC_AI_RESEARCH_ENABLED: "false", ARC_AI_RESEARCH_BRIDGE_TRANSPORT: "service-binding-v1", ARC_RESEARCH_EXECUTOR: binding };
  const getD1 = vi.fn(() => db as unknown as D1Database);
  const deps = createResearchClosedPreflightDependencies({ environment, getD1 });
  const user = vi.fn(async () => owner);
  const handler = () => createResearchClosedPreflightHandler({ ...deps, requireUser: user });
  return { db, deps, user, handler, environment, binding, getD1 };
}

describe("closed connectivity Site boundary", () => {
  it("admits exact A independently of disabled global flags through a signed private request", async () => {
    const f = fixture(); const response = await f.handler()(request());
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ siteClosed: true, ownerAllowed: true, ...reply });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(f.binding.fetch).toHaveBeenCalledOnce();
    expect(f.db.preparedSql.filter(sql => sql.includes("FROM feature_flags"))).toHaveLength(2);
    expect(f.db.database.prepare("SELECT count(*) n FROM endpoint_rate_buckets").get()).toEqual({ n: 0 });
  });

  it("rejects distinct B and anonymous sessions before bridge work", async () => {
    const f = fixture(); f.user.mockResolvedValue({ ...owner, id: "owner-b" });
    expect((await f.handler()(request())).status).toBe(404);
    f.user.mockRejectedValue(new UnauthenticatedError());
    expect((await f.handler()(request())).status).toBe(401);
    expect(f.binding.fetch).not.toHaveBeenCalled();
    expect(f.db.database.prepare("SELECT count(*) n FROM research_bridge_nonces").get()).toEqual({ n: 0 });
  });

  it("uses requireArcUser and its retired account guard", async () => {
    const f = fixture(); seedUser(f.db, "owner-a"); seedUser(f.db, "owner-b");
    f.db.database.prepare("INSERT INTO account_recoveries VALUES (?,?,?,?,?,?,?,?,?)")
      .run("recovered", "owner-a", "owner-b", "a", "b", "google", "github", "path", 1);
    env.DB = f.db as unknown as D1Database;
    vi.spyOn(authRuntime, "getAuth").mockReturnValue({ api: { getSession: vi.fn(async () => ({ user: owner })) } } as never);
    expect(f.deps.requireUser).toBe(requireArcUser);
    expect((await createResearchClosedPreflightHandler(f.deps)(request())).status).toBe(401);
    expect(f.binding.fetch).not.toHaveBeenCalled();
  });

  it.each([null, [0, '{"userIds":["owner-a"]}'], [1, '{}'], [1, 'bad'], [1, '{"userIds":[]}'],
    [1, '{"userIds":["owner-a","owner-b"]}'], [1, '{"userIds":["owner-a"],"extra":true}'],
    [1, '{"userIds":[" owner-a "]}']])("rejects nonexclusive cohort %j", async row => {
    const f = fixture(); f.db.database.prepare("DELETE FROM feature_flags").run();
    if (row) f.db.database.prepare("INSERT INTO feature_flags(key,enabled,cohort_json) VALUES (?,?,?)").run("role-research-beta", row[0], row[1]);
    expect((await f.handler()(request())).status).toBe(404); expect(f.binding.fetch).not.toHaveBeenCalled();
  });

  it.each([undefined, "true", "FALSE", " false"])("requires literal global closed flags %j", async value => {
    for (const key of ["ARC_AI_ENABLED", "ARC_AI_RESEARCH_ENABLED"] as const) {
      const f = fixture(); f.environment[key] = value;
      expect((await f.handler()(request())).status).toBe(409); expect(f.binding.fetch).not.toHaveBeenCalled();
    }
  });

  it.each([
    ["origin", null], ["origin", "null"], ["origin", "https://other.test"],
    ["sec-fetch-site", null], ["sec-fetch-site", "cross-site"], ["content-type", "text/plain"],
  ])("rejects invalid request header %s=%s", async (key, value) => {
    const f = fixture(); const headers = new Headers(request().headers);
    if (value === null) headers.delete(key); else headers.set(key, value);
    expect((await f.handler()(request({ headers }))).status).toBe(404); expect(f.binding.fetch).not.toHaveBeenCalled();
  });

  it.each(["https://other.test/api/intelligence/research/closed-preflight", "https://site.test/wrong",
    `https://site.test${CLOSED_PREFLIGHT_PATH}?a=1`, `https://site.test${CLOSED_PREFLIGHT_PATH}#x`])("rejects wrong URL %s", async url => {
    const f = fixture(); expect((await f.handler()(request({}, url))).status).toBe(404); expect(f.binding.fetch).not.toHaveBeenCalled();
  });

  it.each(["GET", "PUT"])("rejects wrong method %s", async method => {
    const f = fixture(); expect((await f.handler()(request({ method, body: null }))).status).toBe(404);
    expect(f.binding.fetch).not.toHaveBeenCalled();
  });

  it.each(['{"extra":1}', '[]', 'null', '{', ' '.repeat(257)])("bounds and strictly parses public body %j", async body => {
    const f = fixture(); expect((await f.handler()(request({ body }))).status).toBe(404); expect(f.binding.fetch).not.toHaveBeenCalled();
  });

  it("cancels an oversized streamed body and a stalled body without outbound work", async () => {
    const f = fixture(); const cancel = vi.fn();
    const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(257)); }, cancel });
    expect((await f.handler()(request({ body, duplex: "half" } as RequestInit))).status).toBe(404);
    expect(cancel).toHaveBeenCalledOnce();
    const stalled = new ReadableStream({ cancel });
    expect((await f.handler()(request({ body: stalled, duplex: "half" } as RequestInit))).status).toBe(404);
    expect(cancel).toHaveBeenCalledTimes(2); expect(f.binding.fetch).not.toHaveBeenCalled();
  });

  it.each([undefined, "unknown", "fetch"])("requires exact private transport mode %j without global fallback", async mode => {
    const f = fixture(); const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Forbidden"));
    f.environment.ARC_AI_RESEARCH_BRIDGE_TRANSPORT = mode;
    expect((await f.handler()(request())).status).toBe(503); expect(fetch).not.toHaveBeenCalled();
    expect(f.binding.fetch).not.toHaveBeenCalled();
  });

  it.each([undefined, { fetch: "bad" }])("fails closed for unavailable binding %j", async binding => {
    const f = fixture(); f.environment.ARC_RESEARCH_EXECUTOR = binding as never;
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Forbidden"));
    expect((await f.handler()(request())).status).toBe(503); expect(fetch).not.toHaveBeenCalled();
  });

  it("fails closed on auth, DB, transport and unsigned replies without leaking details", async () => {
    const f = fixture(); f.user.mockRejectedValueOnce(new Error("private"));
    expect((await f.handler()(request())).status).toBe(503);
    f.binding.fetch.mockRejectedValueOnce(new Error("private"));
    expect((await f.handler()(request())).status).toBe(503);
    f.binding.fetch.mockResolvedValueOnce(Response.json(reply));
    expect((await f.handler()(request())).status).toBe(503);
    f.getD1.mockImplementation(() => { throw new Error("private"); });
    const response = await f.handler()(request());
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("private");
  });
});
