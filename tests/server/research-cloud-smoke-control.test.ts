// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { SCENARIOS } from "../../worker/research-executor-smoke/scenarios";
import { readResearchPolicyConfiguration } from "../../app/server/research/production-policy";
import * as bridgeConnection from "../../app/server/research/executor/connection-config";
import * as bridgeAuth from "../../app/server/research/executor/auth";
import { PublicOperationScope } from "../../app/server/research/public-operation-scope";
import { createD1OperationBarrier } from "../helpers/research-bridge-fixture";
import { createResearchCloudSmokeFixture, type ControlRequestOptions } from "../helpers/research-cloud-smoke-fixture";

const fixtures: ReturnType<typeof createResearchCloudSmokeFixture>[] = [];
function fixture() { const value = createResearchCloudSmokeFixture(); fixtures.push(value); return value; }
afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); await Promise.all(fixtures.splice(0).map(f => f.dispose())); });

async function replayBytes(body: Uint8Array): Promise<Request> {
  const headers = await bridgeAuth.signBridgeMessage({ context: { direction: "executor-to-site", kind: "request",
    method: "POST", path: "/_smoke/replay", audience: "https://site.test", jobId: "collection", status: null },
    body, keyId: "control-test", keyBytes: new Uint8Array(32).fill(0x33), now: Date.now });
  return new Request("https://site.test/_smoke/replay", { method: "POST", headers, body: new Uint8Array(body) });
}

describe("protected replay control boundary", () => {
  const refusals: ReadonlyArray<readonly [string, ControlRequestOptions, number]> = [
    ["wrong control bytes", { secretHex: "44".repeat(32) }, 401],
    ["wrong control ID", { keyId: "unknown" }, 401],
    ["Site bridge credential", { keyId: "site-test", secretHex: "11".repeat(32) }, 401],
    ["executor bridge credential", { keyId: "executor-test", secretHex: "22".repeat(32) }, 401],
    ["wrong audience", { audience: "https://elsewhere.test" }, 401],
    ["wrong direction", { direction: "site-to-executor" }, 401],
    ["wrong job scope", { jobId: SCENARIOS[0]!.jobId }, 401],
    ["wrong method", { method: "GET" }, 404],
    ["unknown path", { path: "/_smoke/reset" }, 404],
    ["browser origin", { origin: "https://site.test" }, 404],
    ["unknown scenario", { body: { scenarioId: "other", step: "submit" } }, 400],
    ["missing step", { body: { scenarioId: "long" } }, 400],
    ["unknown step", { body: { scenarioId: "long", step: "start" } }, 400],
    ...["owner", "ownerId", "job", "jobId", "run", "url", "sql", "duration", "body", "configFingerprint"].map(field =>
      [`extra ${field}`, { body: { scenarioId: "long", step: "submit", [field]: "forbidden" } }, 400] as const),
  ];
  it.each(refusals)("rejects %s before replay actions", async (_name, options, expected) => {
    const f = fixture(); const before = f.siteSnapshot("long");
    const response = await f.dispatch(await f.makeRequest("replay", "long", { body: { scenarioId: "long", step: "submit" }, ...options }));
    expect(response.status).toBe(expected);
    expect(await response.json()).toEqual({ code: expected === 404 ? "not-found" : "unavailable" });
    expect(f.siteSnapshot("long")).toEqual(before); expect(f.traffic).toEqual([]); expect(f.workflowCreates()).toBe(0);
  });

  it.each(["query", "other-origin", "unsigned", "path-swapped"] as const)("rejects %s at the replay fetch boundary", async mode => {
    const f = fixture(); const before = f.siteSnapshot("long");
    const signed = await f.makeRequest(mode === "path-swapped" ? "start" : "replay", "long", { body: { scenarioId: "long", step: "submit" } });
    const url = mode === "query" ? "https://site.test/_smoke/replay?ignored=1"
      : mode === "other-origin" ? "https://elsewhere.test/_smoke/replay" : "https://site.test/_smoke/replay";
    const response = await f.dispatch(new Request(url, { method: "POST", headers: mode === "unsigned" ? {} : signed.headers,
      body: await signed.text() }));
    const status = mode === "query" || mode === "other-origin" ? 404 : 401;
    expect(response.status).toBe(status); expect(await response.json()).toEqual({ code: status === 404 ? "not-found" : "unavailable" });
    expect(f.siteSnapshot("long")).toEqual(before); expect(f.traffic).toEqual([]);
    expect(f.siteDb.database.prepare("SELECT count(*) n FROM research_bridge_nonces").get()).toEqual({ n: 0 });
  });

  it("consumes an authenticated refusal nonce exactly once without falling through to start or status", async () => {
    const f = fixture(); const before = f.siteSnapshot("long");
    const request = await f.makeRequest("replay", "long", { body: { scenarioId: "long", step: "submit" } });
    const body = await request.text();
    const copy = () => new Request(request.url, { method: request.method, headers: request.headers, body });
    const first = await f.dispatch(copy()); const second = await f.dispatch(copy());
    expect(first.status).toBe(503); expect(second.status).toBe(401);
    expect(await first.json()).toEqual({ code: "unavailable" }); expect(await second.json()).toEqual({ code: "unavailable" });
    expect(f.siteDb.database.prepare("SELECT count(*) n FROM research_bridge_nonces").get()).toEqual({ n: 1 });
    expect(f.siteSnapshot("long")).toEqual(before); expect(f.traffic).toEqual([]);
  });

  it.each([4096, 4097])("bounds streamed UTF-8 replay bodies at %i bytes", async size => {
    const f = fixture(); const before = f.siteSnapshot("long");
    const json = JSON.stringify({ scenarioId: "long", step: "submit", body: "界".repeat(1300) });
    const bytes = new TextEncoder().encode(json + " ".repeat(size - new TextEncoder().encode(json).length));
    const signed = await replayBytes(bytes); let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(bytes.slice(0, 2048)); controller.enqueue(bytes.slice(2048));
      if (size === 4096) controller.close();
    }, cancel() { cancelled = true; } });
    const response = await f.dispatch(new Request(signed, { body: stream, duplex: "half" } as RequestInit));
    expect(response.status).toBe(size === 4096 ? 400 : 413); expect(cancelled).toBe(size === 4097);
    expect(await response.json()).toEqual({ code: "unavailable" });
    expect(f.siteDb.database.prepare("SELECT count(*) n FROM research_bridge_nonces").get()).toEqual({ n: size === 4096 ? 1 : 0 });
    expect(f.siteSnapshot("long")).toEqual(before); expect(f.traffic).toEqual([]);
  });

  it("accepts a valid replay body padded to exactly 4096 bytes before the approval gate", async () => {
    const f = fixture(); const json = JSON.stringify({ scenarioId: "long", step: "submit" });
    const response = await f.dispatch(await replayBytes(new TextEncoder().encode(json.padEnd(4096, " "))));
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ code: "unavailable" });
    expect(f.siteDb.database.prepare("SELECT count(*) n FROM research_bridge_nonces").get()).toEqual({ n: 1 });
    expect(f.traffic).toEqual([]);
  });

  it("cancels a stalled replay body within the original operation budget before nonce SQL", async () => {
    const f = fixture(); const request = await f.makeRequest("replay", "long", { body: { scenarioId: "long", step: "submit" } });
    const before = f.siteSnapshot("long"); const cancel = vi.fn();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = f.dispatch(new Request(request, { body: new ReadableStream<Uint8Array>({ cancel }), duplex: "half" } as RequestInit));
    await vi.advanceTimersByTimeAsync(4500); const response = await pending;
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ code: "unavailable" }); expect(cancel).toHaveBeenCalledOnce();
    expect(f.siteDb.database.prepare("SELECT count(*) n FROM research_bridge_nonces").get()).toEqual({ n: 0 });
    expect(f.siteSnapshot("long")).toEqual(before); expect(f.traffic).toEqual([]);
  });

  it("bounds error-only signing at 500ms after fencing SQL and then erases the control key", async () => {
    const f = fixture(); const request = await f.makeRequest("replay", "long", { body: { scenarioId: "long", step: "submit" } });
    let entered!: () => void; let release!: () => void; let borrowedKey: Uint8Array | undefined;
    const signing = new Promise<void>(resolve => { entered = resolve; });
    const resumed = new Promise<void>(resolve => { release = resolve; });
    vi.spyOn(bridgeAuth, "signBridgeMessage").mockImplementation(async input => { borrowedKey = input.keyBytes; entered(); await resumed; return new Headers(); });
    const prepared = vi.spyOn(f.siteDb, "prepare"); vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = f.dispatch(request);
    try {
      await signing; const statements = prepared.mock.calls.length;
      expect(borrowedKey?.some(byte => byte !== 0)).toBe(true);
      let completed = false; void pending.then(() => { completed = true; });
      await vi.advanceTimersByTimeAsync(499); expect(completed).toBe(false);
      await vi.advanceTimersByTimeAsync(1); const response = await pending;
      expect(response.status).toBe(503); expect(await response.json()).toEqual({ code: "unavailable" });
      expect(borrowedKey?.every(byte => byte === 0)).toBe(true);
      release(); await new Promise<void>(resolve => setImmediate(resolve));
      expect(prepared).toHaveBeenCalledTimes(statements); expect(f.traffic).toEqual([]);
    } finally { release(); }
  });
});

describe("protected smoke control", () => {
  it("returns a verified signed refusal for replay before approval without business effects", async () => {
    const f = fixture(); await f.signedStart("long");
    const before = f.siteSnapshot("long"); const traffic = [...f.traffic];
    expect(await f.signedReplay("long", "submit")).toEqual({ status: 503, body: { code: "unavailable" } });
    expect(f.siteSnapshot("long")).toEqual(before); expect(f.traffic).toEqual(traffic);
    expect(Object.hasOwn(f.environment, "EXECUTOR_DB")).toBe(false);
    expect(Object.hasOwn(f.environment, "EXECUTOR_RECEIPTS")).toBe(false);
  });

  it("routes a valid replay request to refusal rather than unknown path", async () => {
    const f = fixture(); await f.signedStart("long");
    const response = await f.dispatch(await f.makeRequest("replay", "long", { body: { scenarioId: "long", step: "submit" } }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: "unavailable" });
  });

  it.each(["success", "refusal", "invalid-body", "unauthorized", "peer-match", "peer-match-executor", "peer-copy-throws",
    "scope-throws", "response-scope-throws", "sign-throws", "success-sign-throws"] as const)(
    "erases allocated control and temporary peer bytes after %s", async mode => {
      const f = fixture();
      const successRequest = mode === "success" || mode === "success-sign-throws";
      const request = await f.makeRequest(successRequest ? "status" : "replay", "long", {
        body: mode === "invalid-body" ? {} : { scenarioId: "long", ...(successRequest ? {} : { step: "submit" }) },
        ...(mode === "unauthorized" ? { secretHex: "44".repeat(32) } : {}),
      });
      if (mode === "peer-match") f.environment.SMOKE_CONTROL_SECRET_HEX = "11".repeat(32);
      if (mode === "peer-match-executor") f.environment.SMOKE_CONTROL_SECRET_HEX = "22".repeat(32);
      const controlCopies: Uint8Array[] = []; const peerCopies: Uint8Array[] = [];
      const actualFrom = Uint8Array.from;
      vi.spyOn(Uint8Array, "from").mockImplementation((...args: Parameters<typeof Uint8Array.from>) => {
        const copy = actualFrom.apply(Uint8Array, args); controlCopies.push(copy); return copy;
      });
      const actualConnection = bridgeConnection.readResearchBridgeConnection;
      vi.spyOn(bridgeConnection, "readResearchBridgeConnection").mockImplementation(environment => {
        const connection = actualConnection(environment)!;
        const wrap = (credential: bridgeConnection.BridgeChannelCredential, index: number) => ({
          keyId: credential.keyId, copyKeyBytes: () => {
            if (mode === "peer-copy-throws" && index === 1) throw new Error("Synthetic credential copy failure");
            const copy = credential.copyKeyBytes(); peerCopies.push(copy); return copy;
          },
        });
        return { ...connection, siteToExecutor: wrap(connection.siteToExecutor, 0), executorToSite: wrap(connection.executorToSite, 1) };
      });
      if (mode === "scope-throws") vi.spyOn(performance, "now").mockImplementation(() => { throw new Error("Synthetic clock failure"); });
      if (mode === "response-scope-throws") {
        const actualFinish = PublicOperationScope.prototype.finish;
        vi.spyOn(PublicOperationScope.prototype, "finish").mockImplementation(function (this: PublicOperationScope) {
          actualFinish.call(this);
          vi.spyOn(performance, "now").mockImplementation(() => { throw new Error("Synthetic response clock failure"); });
        });
      }
      const actualSign = bridgeAuth.signBridgeMessage;
      const signingKeyPresent: boolean[] = [];
      const sign = vi.spyOn(bridgeAuth, "signBridgeMessage").mockImplementation(async input => {
        // Inspect only a boolean; never expose key material to an assertion or log.
        signingKeyPresent.push(input.keyBytes.some(byte => byte !== 0));
        if (mode === "sign-throws" || mode === "success-sign-throws" && input.context.status === 200) throw new Error("Synthetic signing failure");
        return actualSign(input);
      });
      const response = await f.dispatch(request);
      expect(response.status).toBe(mode === "success" ? 200 : mode === "invalid-body" ? 400 : mode === "unauthorized" ? 401 : 503);
      expect(controlCopies.length).toBe(1);
      expect(controlCopies.every(copy => copy.every(byte => byte === 0))).toBe(true);
      expect(peerCopies.length).toBeGreaterThan(0);
      expect(peerCopies.every(copy => copy.every(byte => byte === 0))).toBe(true);
      if (["success", "refusal", "invalid-body", "unauthorized", "sign-throws"].includes(mode)) expect(sign).toHaveBeenCalledTimes(1);
      else if (mode === "success-sign-throws") expect(sign).toHaveBeenCalledTimes(2);
      else expect(sign).not.toHaveBeenCalled();
      expect(signingKeyPresent.every(Boolean)).toBe(true);
      expect(await response.json()).toEqual(mode === "success" ? { scenarioId: "long", state: "not-started", backgroundAccepted: false } : { code: "unavailable" });
    });

  it("starts through real admission and persisted acceptance with no Provider call", async () => {
    const f = fixture();
    const response = await f.dispatch(await f.makeRequest("start", "long"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ scenarioId: "long", state: "queued", backgroundAccepted: true });
    const snapshot = f.siteSnapshot("long");
    expect(snapshot.run).toMatchObject({ user_id: SCENARIOS[0]!.ownerId, mutation_id: SCENARIOS[0]!.mutationId });
    expect(snapshot.execution).toMatchObject({ job_id: SCENARIOS[0]!.jobId, admission_state: "admitted", began_at: null });
    expect(snapshot.tables.quota_ledger).toHaveLength(1);
    expect(snapshot.tables.ai_budget_reservations).toHaveLength(1);
    expect(snapshot.tables.research_site_acceptances).toHaveLength(1);
    expect(f.workflowCreates()).toBe(1);
    expect(f.executorDb.database.prepare("SELECT count(*) n FROM research_executor_results").get()).toEqual({ n: 0 });
  });

  const rejectedRequests: ReadonlyArray<readonly [string, ControlRequestOptions]> = [
    ["wrong control bytes", { secretHex: "44".repeat(32) }],
    ["wrong control ID", { keyId: "unknown" }],
    ["site bridge credential", { keyId: "site-test", secretHex: "11".repeat(32) }],
    ["executor bridge credential", { keyId: "executor-test", secretHex: "22".repeat(32) }],
    ["wrong audience", { audience: "https://elsewhere.test" }],
    ["wrong direction", { direction: "site-to-executor" as const }],
    ["wrong job scope", { jobId: SCENARIOS[0]!.jobId }],
    ["wrong method", { method: "GET" as const }],
    ["unknown path", { path: "/_smoke/reset" }],
    ["browser origin", { origin: "https://site.test" }],
    ["unknown scenario", { body: { scenarioId: "other" } }],
    ...["ownerId", "jobId", "url", "origin", "policy", "duration", "sql"].map(field =>
      [`unexpected ${field}`, { body: { scenarioId: "long", [field]: "forbidden" } }] as const),
  ];
  it.each(rejectedRequests)("rejects %s without start effects", async (_name, options) => {
    const f = fixture(); const before = f.siteSnapshot("long").tables;
    const response = await f.dispatch(await f.makeRequest("start", "long", options));
    const expected = options.method || options.path || options.origin ? 404 : options.body ? 400 : 401;
    expect(response.status).toBe(expected);
    const text = await response.text(); expect(text.length).toBeLessThan(4096);
    expect(text).not.toMatch(/forbidden|stack|secret|signature|SELECT|INSERT/u);
    expect(f.siteSnapshot("long").tables).toEqual(before);
    expect(f.traffic).toHaveLength(0);
  });

  it("rejects unsigned, replayed, and path-swapped requests", async () => {
    const f = fixture();
    const unsigned = await f.dispatch(new Request("https://site.test/_smoke/start", { method: "POST", body: '{"scenarioId":"long"}' }));
    expect(unsigned.status).toBe(401);
    const request = await f.makeRequest("status", "long");
    const body = await request.text();
    const replay = (url = request.url) => new Request(url, { method: request.method, headers: request.headers, body });
    expect((await f.dispatch(replay())).status).toBe(200);
    expect((await f.dispatch(replay())).status).toBe(401);
    expect((await f.dispatch(replay("https://site.test/_smoke/start"))).status).toBe(401);
    expect(f.siteSnapshot("long").tables.research_runs).toHaveLength(0);
  });

  it.each([
    ["control ID equals Site bridge", { SMOKE_CONTROL_KEY_ID: "site-test" }],
    ["control ID equals executor bridge", { SMOKE_CONTROL_KEY_ID: "executor-test" }],
    ["bridge IDs collide", { ARC_AI_RESEARCH_EXECUTOR_TO_SITE_KEY_ID: "site-test" }],
    ["control bytes equal Site bridge", { SMOKE_CONTROL_SECRET_HEX: "11".repeat(32) }],
    ["control bytes equal executor bridge", { SMOKE_CONTROL_SECRET_HEX: "22".repeat(32) }],
  ])("fails closed when %s", async (_name, patch) => {
    const f = fixture(); Object.assign(f.environment, patch);
    expect((await f.dispatch(await f.makeRequest("start", "long"))).status).toBe(503);
    expect(f.siteSnapshot("long").tables.research_runs).toHaveLength(0);
    expect(f.traffic).toHaveLength(0);
  });

  it("caps streamed request bytes before any nonce or start effect", async () => {
    const f = fixture(); const signed = await f.makeRequest("start", "long");
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(2048)); c.enqueue(new Uint8Array(2049)); }, cancel() { cancelled = true; } });
    const request = new Request(signed, { body, duplex: "half" } as RequestInit);
    expect((await f.dispatch(request)).status).toBe(413);
    expect(cancelled).toBe(true);
    expect(f.siteSnapshot("long").tables.research_runs).toHaveLength(0);
    expect(f.siteDb.database.prepare("SELECT count(*) n FROM research_bridge_nonces").get()).toEqual({ n: 0 });
  });

  it("concurrent duplicate starts and dropped response retain one original identity and reservation", async () => {
    const f = fixture(); f.dropNextSubmitResponse();
    const results = await Promise.all([f.signedStart("long"), f.signedStart("long"), f.signedStart("long")]);
    expect(results.every(result => result.status === 200)).toBe(true);
    const first = f.siteSnapshot("long");
    expect(first.tables.research_runs).toHaveLength(1);
    expect(first.tables.idempotency_records).toHaveLength(1);
    expect(first.tables.quota_ledger).toHaveLength(1);
    expect(first.tables.ai_budget_reservations).toHaveLength(1);
    expect(first.tables.research_site_acceptances).toHaveLength(1);
    expect(f.executorDb.database.prepare("SELECT count(*) n FROM research_executor_jobs").get()).toEqual({ n: 1 });
    expect(f.workflowCreates()).toBe(1);
    const replay = await f.signedStart("long");
    expect(replay.body.backgroundAccepted).toBe(true);
    expect(f.siteSnapshot("long")).toEqual(first);
    expect(f.traffic.filter(path => path.endsWith("/submit"))).toHaveLength(1);
  });

  it("reports unknown until the actual acceptance proof is persisted by independent maintenance", async () => {
    const f = fixture(); f.setDropAcceptance(true);
    const first = await f.signedStart("long");
    expect(first.status).toBe(200); expect(first.body.backgroundAccepted).toBe(false);
    expect(f.workflowCreates()).toBe(1);
    expect(f.siteSnapshot("long").tables.research_site_acceptances).toHaveLength(0);
    const before = f.siteSnapshot("long"); const requests = [...f.traffic];
    expect((await f.signedStart("long")).body.backgroundAccepted).toBe(false);
    expect((await f.signedStatus("long")).body.backgroundAccepted).toBe(false);
    expect(f.siteSnapshot("long")).toEqual(before); expect(f.traffic).toEqual(requests);
    f.setDropAcceptance(false); await f.runCron();
    expect((await f.signedStatus("long")).body.backgroundAccepted).toBe(true);
    expect(f.siteSnapshot("long").execution?.queue_expires_at).toBe(before.execution?.queue_expires_at);
    expect(f.workflowCreates()).toBe(1);
  });

  it("status is signed, Site-only, read-only, bounded and hides another owner's run", async () => {
    const f = fixture(); await f.signedStart("long");
    const before = f.siteSnapshot("long"); const traffic = [...f.traffic];
    const executorBefore = f.executorDb.database.prepare("SELECT * FROM research_executor_jobs").all();
    const denyFetch = vi.fn(() => { throw new Error("Global fetch forbidden"); }); vi.stubGlobal("fetch", denyFetch);
    const status = await f.signedStatus("long");
    expect(status.status).toBe(200); expect(status.body).toMatchObject({ scenarioId: "long", state: "queued", backgroundAccepted: true });
    expect(JSON.stringify(status.body).length).toBeLessThan(4096);
    expect(JSON.stringify(status.body)).not.toMatch(/candidate|secret|r2|https:|owner-task15|mutation-task15/u);
    expect(f.siteSnapshot("long")).toEqual(before); expect(f.traffic).toEqual(traffic);
    expect(f.executorDb.database.prepare("SELECT * FROM research_executor_jobs").all()).toEqual(executorBefore);
    expect(denyFetch).not.toHaveBeenCalled();
    expect(await f.research.getRun(SCENARIOS[0]!.ownerId, String(before.run!.id))).not.toBeNull();
    expect(await f.research.getRun(SCENARIOS[0]!.otherOwnerId, String(before.run!.id))).toBeNull();
    expect(Object.hasOwn(f.environment, "EXECUTOR_DB")).toBe(false);
  });

  it("gates ordered scenarios on real settled imports and admits all three uncached with the exact production fingerprint", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const f = fixture(); const fingerprint = readResearchPolicyConfiguration(f.environment)!.configuration.configFingerprint;
    expect((await f.signedStart("after-r2")).status).toBe(409);
    expect((await f.signedStart("after-d1")).status).toBe(409);
    for (const [index, scenario] of SCENARIOS.entries()) {
      const start = await f.signedStart(scenario.id);
      expect(start.status).toBe(200); expect(start.body).toMatchObject({ state: "queued", backgroundAccepted: true });
      expect(f.siteSnapshot(scenario.id).run).toMatchObject({ config_fingerprint: fingerprint, normalized_role_key: scenario.role.toLowerCase() });
      expect(f.siteSnapshot(scenario.id).execution).toMatchObject({ admission_state: "admitted", close_reason: null });
      if (index < 2) expect((await f.signedStart(SCENARIOS[index + 1]!.id)).status).toBe(409);
      expect((await f.runWorkflow(scenario.id)).state).toBe("recorded");
      vi.setSystemTime(Date.now() + 30_001); // A later independent Cron owns a new production maintenance lease.
      await f.runCron();
      expect((await f.signedStatus(scenario.id)).body).toMatchObject({ state: "ready", settled: true,
        counts: { packages: 1, imports: 1, quotaReserved: 1, quotaAccepted: 1, budgetReservations: 1, audits: 1 } });
      expect(f.siteSnapshot(scenario.id).tables.research_packages).toHaveLength(index + 1);
    }
    expect(f.workflowCreates()).toBe(3);
    expect(f.siteSnapshot("after-d1").tables.quota_ledger).toHaveLength(6);
    expect(f.siteSnapshot("after-d1").tables.ai_runs).toHaveLength(3);
    expect(f.executorDb.database.prepare("SELECT scenario_id,provider_calls,repair_calls,rejections FROM smoke_scenarios ORDER BY scenario_id").all())
      .toEqual([...SCENARIOS].sort((a, b) => a.id.localeCompare(b.id)).map(s => ({ scenario_id: s.id, provider_calls: 1, repair_calls: 0, rejections: 0 })));
  });

  it("fences subsequent writes after a delayed native D1 operation outlives the initial scope", async () => {
    const f = fixture();
    const barrier = createD1OperationBarrier(f.siteDb as unknown as D1Database,
      sql => sql.includes("INSERT INTO smoke_scenarios"));
    f.environment.SMOKE_SITE_DB = barrier.db;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = f.dispatch(await f.makeRequest("start", "long"));
    await barrier.entered;
    await vi.advanceTimersByTimeAsync(4500);
    const response = await pending;
    expect(response.status).toBe(503);
    expect(f.siteSnapshot("long").scenario).toBeUndefined();
    barrier.expire(); barrier.release();
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(barrier.lateStarts()).toBe(0);
    expect(f.siteSnapshot("long").scenario).toBeDefined(); // Native dispatched SQL may commit.
    expect(f.siteSnapshot("long").tables.research_runs).toHaveLength(0);
    expect(f.siteSnapshot("long").tables.users).toHaveLength(0);
    expect(f.traffic).toHaveLength(0);
  });

  it("bounds nonce authentication and prevents late business work when nonce SQL is delayed", async () => {
    const f = fixture();
    const barrier = createD1OperationBarrier(f.siteDb as unknown as D1Database, sql => sql.includes("research_bridge_nonces"));
    f.environment.SMOKE_SITE_DB = barrier.db;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = f.dispatch(await f.makeRequest("start", "long"));
    await barrier.entered; await vi.advanceTimersByTimeAsync(4500);
    expect((await pending).status).toBe(503);
    barrier.expire(); barrier.release(); await new Promise<void>(resolve => setImmediate(resolve));
    expect(barrier.lateStarts()).toBe(0);
    expect(f.siteSnapshot("long").tables.smoke_scenarios).toHaveLength(0);
    expect(f.siteSnapshot("long").tables.users).toHaveLength(0);
    expect(f.traffic).toHaveLength(0);
  });

  it("keeps partial admission for independent maintenance without completing reservations during replay", async () => {
    const f = fixture();
    const barrier = createD1OperationBarrier(f.siteDb as unknown as D1Database, sql => sql.includes("INSERT INTO quota_ledger"));
    f.environment.SMOKE_SITE_DB = barrier.db;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = f.dispatch(await f.makeRequest("start", "long"));
    await barrier.entered; await vi.advanceTimersByTimeAsync(4500);
    expect((await pending).status).toBe(503);
    barrier.expire(); barrier.release(); await new Promise<void>(resolve => setImmediate(resolve));
    expect(barrier.lateStarts()).toBe(0);
    vi.useRealTimers(); f.environment.SMOKE_SITE_DB = f.siteDb as unknown as D1Database;
    const partial = f.siteSnapshot("long");
    expect(partial.execution).toMatchObject({ admission_state: "pending", began_at: null });
    expect(partial.tables.quota_ledger).toHaveLength(1);
    expect(partial.tables.ai_budget_reservations).toHaveLength(0);
    expect((await f.signedStart("long")).body.backgroundAccepted).toBe(false);
    expect(f.siteSnapshot("long")).toEqual(partial); expect(f.workflowCreates()).toBe(0);
    await f.runCron();
    expect(f.siteSnapshot("long").execution).toMatchObject({ admission_state: "closed", close_reason: "interrupted" });
    expect(f.siteSnapshot("long").run).toMatchObject({ state: "failed" });
    expect(f.siteSnapshot("long").tables.quota_ledger).toHaveLength(2);
    expect(f.siteSnapshot("long").tables.ai_budget_reservations).toHaveLength(0);
    expect((await f.signedStart("after-r2")).status).toBe(409);
    expect(f.workflowCreates()).toBe(0);
  });

  it("status cannot import an existing executor result or advance either database before Cron", async () => {
    const f = fixture();
    const network = vi.fn(() => { throw new Error("Global network forbidden"); }); vi.stubGlobal("fetch", network);
    await f.signedStart("long"); expect((await f.runWorkflow("long")).state).toBe("recorded");
    const before = f.siteSnapshot("long"); const requests = [...f.traffic];
    const executorBefore = f.executorDb.database.prepare("SELECT * FROM research_executor_results").all();
    expect(executorBefore).toHaveLength(1); expect(before.tables.research_site_imports).toHaveLength(0);
    expect((await f.signedStatus("long")).body).toMatchObject({ state: "researching", settled: false, counts: { imports: 0 } });
    expect(f.siteSnapshot("long")).toEqual(before); expect(f.traffic).toEqual(requests);
    expect(f.executorDb.database.prepare("SELECT * FROM research_executor_results").all()).toEqual(executorBefore);
    expect(network).not.toHaveBeenCalled();
  });

  it("does not seed a later scenario when the previous package is ready but import accounting is not settled", async () => {
    const f = fixture(); await f.signedStart("long"); await f.runWorkflow("long");
    const barrier = createD1OperationBarrier(f.siteDb as unknown as D1Database,
      sql => sql.includes("INSERT INTO quota_ledger") && sql.includes("NOT EXISTS"));
    f.environment.SMOKE_SITE_DB = barrier.db;
    const cron = f.runCron();
    await barrier.entered;
    try {
      expect(f.siteSnapshot("long").run).toMatchObject({ state: "ready" });
      expect(f.siteSnapshot("long").tables.research_packages).toHaveLength(1);
      expect((await f.signedStart("after-r2")).status).toBe(409);
      expect(f.siteSnapshot("after-r2").scenario).toBeUndefined();
    } finally { barrier.release(); await cron; }
    expect((await f.signedStart("after-r2")).body).toMatchObject({ state: "queued", backgroundAccepted: true });
  });

  it("unknown routes stay safe 404 even with unavailable configuration", async () => {
    const f = fixture(); f.environment.ARC_AI_RESEARCH_EXECUTOR_URL = undefined;
    expect((await f.dispatch(await f.makeRequest("start", "long", { path: "/_smoke/reset" }))).status).toBe(404);
    expect(f.siteSnapshot("long").tables.smoke_scenarios).toHaveLength(0);
  });

  it("bounds and cancels a stalled control body before authentication", async () => {
    const f = fixture(); const signed = await f.makeRequest("start", "long");
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = f.dispatch(new Request(signed, { body, duplex: "half" } as RequestInit));
    await vi.advanceTimersByTimeAsync(4500);
    expect((await pending).status).toBe(503); expect(cancelled).toBe(true);
    expect(f.siteSnapshot("long").tables.smoke_scenarios).toHaveLength(0);
    expect(f.siteDb.database.prepare("SELECT count(*) n FROM research_bridge_nonces").get()).toEqual({ n: 0 });
  });
});
