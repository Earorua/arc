// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicOperationScope } from "../../app/server/research/public-operation-scope";
import { canonicalJson } from "../../app/lib/planning/fingerprint";
import { createResearchCloudSmokeFixture } from "../helpers/research-cloud-smoke-fixture";
import { createD1OperationBarrier } from "../helpers/research-bridge-fixture";
import { requireSmokeReplayAdmission } from "../../worker/research-executor-smoke/replay-admission";
import { runSmokeReplay } from "../../worker/research-executor-smoke/replay";
import { readResearchBridgeConnection } from "../../app/server/research/executor/connection-config";
import { RemoteResearchReader } from "../../app/server/research/remote-public-reader";
import { D1ResearchRepository } from "../../app/server/research/d1-repository";
import { signBridgeMessage, verifyBridgeMessage } from "../../app/server/research/executor/auth";
import { readBridgeBody } from "../../app/server/research/executor/body";
import type { ExecutorStatus } from "../../app/server/research/executor/bridge-contract";
import { BRIDGE_RECEIPT_RETENTION_MS } from "../../app/server/research/executor/receipt";
import { ExecutorBridgeClient } from "../../app/server/research/executor/executor-client";
import { KIMI_RESEARCH_EXECUTION_POLICY } from "../../app/server/research/execution-policy";
import { SCENARIOS } from "../../worker/research-executor-smoke/scenarios";
import { parseSmokeReplayReply, parseSmokeReplayRequest, parseSmokeReplayRoster, smokeReplayHash,
  smokeReplayRequestSchema, smokeReplayReplySchema, SMOKE_REPLAY_STEPS } from "../../worker/research-executor-smoke/replay-contract";

const digest = "a".repeat(64);
const approvals = () => SCENARIOS.map(s => ({ scenarioId: s.id, jobId: s.jobId, requestHash: digest,
  receiptHash: digest, receiptMetadataSha256: digest, runHash: digest, packageHash: digest,
  acceptedAt: 1000, beganAt: 1001, executionExpiresAt: 1001 + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs }));
const roster = () => ({ schemaVersion: "arc-smoke-replay-approval-v1", inventorySha256: digest,
  nativeEvidenceSha256: digest, scenarios: approvals() });
const encode = (value: unknown) => JSON.stringify(value);
const identity = () => ({ jobId: SCENARIOS[0]!.jobId, requestHash: digest, runHash: digest, packageHash: digest });
const bridgeReply = () => ({ schemaVersion: "arc-smoke-replay-v1", scenarioId: "long", step: "submit", completed: true,
  identity: identity(), original: { acceptedAt: 1000, beganAt: 1001,
    executionExpiresAt: 1001 + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs, queueExpiresAt: 121000 },
  receipt: { receiptHash: digest, metadataSha256: digest, bodyState: "available" },
  checks: { approvalMatched: true, settled: true, acceptedProofMatched: true, grantMatched: true, receiptMatched: true } });
const ownerReply = () => ({ schemaVersion: "arc-smoke-replay-v1", scenarioId: "long", step: "owner-a-get", completed: true,
  identity: identity(), checks: { approvalMatched: true, settled: true, runMatched: true,
    packageMatched: true, ready: true, backgroundAccepted: true } });
const hiddenReply = (isNull = true) => ({ schemaVersion: "arc-smoke-replay-v1", scenarioId: "long",
  step: "owner-b-get", completed: isNull, isNull });

describe("smoke replay contracts", () => {
  it("exports the strict reply schema for direct contract consumers", () => {
    expect(smokeReplayReplySchema).toBeDefined();
    for (const value of [bridgeReply(), ownerReply(), hiddenReply(), hiddenReply(false)]) {
      expect(smokeReplayReplySchema.parse(value)).toEqual(parseSmokeReplayReply(value));
    }
    expect(smokeReplayReplySchema.safeParse({ ...hiddenReply(), completed: false }).success).toBe(false);
    expect(smokeReplayReplySchema.safeParse({ ...ownerReply(), ownerId: "forbidden" }).success).toBe(false);
    expect(smokeReplayReplySchema.safeParse({ ...bridgeReply(), step: "owner-a-get" }).success).toBe(false);
  });
  it("accepts exactly the six fixed operations and owns frozen requests", () => {
    expect(SMOKE_REPLAY_STEPS).toEqual(["submit", "status", "owner-a-recover", "owner-a-get", "owner-b-recover", "owner-b-get"]);
    for (const scenario of SCENARIOS) for (const step of SMOKE_REPLAY_STEPS) {
      const source = { scenarioId: scenario.id, step };
      const result = parseSmokeReplayRequest(source);
      expect(result).toEqual(source); expect(result).not.toBe(source); expect(Object.isFrozen(result)).toBe(true);
      expect(smokeReplayRequestSchema.parse(source)).toEqual(source);
    }
  });
  it.each(["new", "reset", "start", "", undefined])("rejects step %s", step => {
    expect(() => parseSmokeReplayRequest({ scenarioId: "long", step })).toThrow();
  });
  it.each(["ownerId", "jobId", "runId", "url", "sql", "config", "configFingerprint"])("rejects request field %s", field => {
    expect(() => parseSmokeReplayRequest({ scenarioId: "long", step: "status", [field]: "forbidden" })).toThrow();
  });
  it("rejects unknown scenarios and oversized request strings", () => {
    expect(() => parseSmokeReplayRequest({ scenarioId: "other", step: "status" })).toThrow();
    expect(() => parseSmokeReplayRequest(" ".repeat(4097))).toThrow();
  });
  it("refuses undefined fields and custom serialization instead of silently dropping them", () => {
    expect(() => parseSmokeReplayRequest({ scenarioId: "long", step: "status", ownerId: undefined })).toThrow();
    expect(() => parseSmokeReplayReply({ ...ownerReply(), identity: { ...identity(), ownerId: undefined } })).toThrow();
    const toJSON = () => ({ scenarioId: "long", step: "status" });
    expect(() => parseSmokeReplayRequest({ ownerId: "forbidden", toJSON })).toThrow();
  });
  it("owns and deeply freezes a valid three-entry roster", () => {
    const source = roster(); const json = encode(source);
    expect(new TextEncoder().encode(json).length).toBeLessThan(4096);
    const result = parseSmokeReplayRoster(json, digest);
    expect(result).toEqual(source);
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.scenarios)).toBe(true);
    expect(result.scenarios.every(Object.isFrozen)).toBe(true);
    source.scenarios[0]!.requestHash = "b".repeat(64);
    expect(result.scenarios[0]!.requestHash).toBe(digest);
  });
  it("checks UTF-8 size before parsing, allowing exactly 4096 padded bytes", () => {
    const json = encode(roster()); const padded = json.padEnd(4096, " ");
    expect(parseSmokeReplayRoster(padded, digest)).toEqual(roster());
    expect(() => parseSmokeReplayRoster(`${padded} `, digest)).toThrow();
    expect(() => parseSmokeReplayRoster(`{"extra":"${"界".repeat(1366)}"}`, digest)).toThrow();
    const parse = vi.spyOn(JSON, "parse");
    expect(() => parseSmokeReplayRoster(`{"extra":"${"界".repeat(1366)}"}`, digest)).toThrow();
    expect(parse).not.toHaveBeenCalled(); parse.mockRestore();
  });
  it.each([undefined, null, "", " ", "{", "[]", "null", {}])("refuses absent or invalid JSON %s", input => {
    expect(() => parseSmokeReplayRoster(input, digest)).toThrow();
  });
  it.each([
    ["empty", (v: ReturnType<typeof roster>) => ({ ...v, scenarios: [] })],
    ["duplicate", (v: ReturnType<typeof roster>) => ({ ...v, scenarios: [v.scenarios[0], v.scenarios[0]] })],
    ["four entries", (v: ReturnType<typeof roster>) => ({ ...v, scenarios: [...v.scenarios, v.scenarios[0]] })],
    ["unknown top key", (v: ReturnType<typeof roster>) => ({ ...v, owner: "forbidden" })],
    ["unknown nested key", (v: ReturnType<typeof roster>) => ({ ...v, scenarios: [{ ...v.scenarios[0], owner: "forbidden" }] })],
    ["unknown scenario", (v: ReturnType<typeof roster>) => ({ ...v, scenarios: [{ ...v.scenarios[0], scenarioId: "other" }] })],
    ["wrong fixed job", (v: ReturnType<typeof roster>) => ({ ...v, scenarios: [{ ...v.scenarios[0], jobId: SCENARIOS[1]!.jobId }] })],
  ])("rejects roster %s", (_name, change) => { expect(() => parseSmokeReplayRoster(encode(change(roster())), digest)).toThrow(); });
  it.each(["requestHash", "receiptHash", "receiptMetadataSha256", "runHash", "packageHash"])("requires lowercase hash %s", field => {
    for (const value of [undefined, "A".repeat(64), "a".repeat(63), "g".repeat(64), 12]) {
      const v = roster(); Object.assign(v.scenarios[0]!, { [field]: value });
      expect(() => parseSmokeReplayRoster(encode(v), digest)).toThrow();
    }
  });
  it.each(["acceptedAt", "beganAt", "executionExpiresAt"])("requires safe nonnegative time %s", field => {
    for (const value of [undefined, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1000"]) {
      const v = roster(); Object.assign(v.scenarios[0]!, { [field]: value });
      expect(() => parseSmokeReplayRoster(encode(v), digest)).toThrow();
    }
  });
  it.each([1000, 1001, 1002])("TEMPORAL-001 accepts roster acknowledgement %i around begin 1001", acceptedAt => {
    const source = roster(); source.scenarios[0]!.acceptedAt = acceptedAt;
    expect(parseSmokeReplayRoster(encode(source), digest)).toEqual(source);
  });
  it.each(["submit", "status"] as const)("TEMPORAL-001 accepts %s acknowledgement before, at and after begin", step => {
    for (const acceptedAt of [1000, 1001, 1002]) {
      const source = bridgeReply(); source.step = step; source.original.acceptedAt = acceptedAt;
      expect(parseSmokeReplayReply(source)).toEqual(source);
    }
  });
  it("requires the production grant interval and separate inventory binding", () => {
    for (const patch of [{ executionExpiresAt: 1001 }, { executionExpiresAt: 1002 }]) {
      const v = roster(); Object.assign(v.scenarios[0]!, patch);
      expect(() => parseSmokeReplayRoster(encode(v), digest)).toThrow();
    }
    for (const binding of [undefined, "", "A".repeat(64), "b".repeat(64)]) {
      expect(() => parseSmokeReplayRoster(encode(roster()), binding)).toThrow();
    }
    for (const field of ["inventorySha256", "nativeEvidenceSha256"]) {
      expect(() => parseSmokeReplayRoster(encode({ ...roster(), [field]: undefined }), digest)).toThrow();
    }
  });
  it.each(["submit", "status"] as const)("TEMPORAL-001 retains %s grant and queue boundaries", step => {
    for (const patch of [{ executionExpiresAt: 1001 }, { executionExpiresAt: 1002 },
      { queueExpiresAt: 1000 }, { queueExpiresAt: 1001 }]) {
      const source = bridgeReply(); source.step = step; Object.assign(source.original, patch);
      expect(() => parseSmokeReplayReply(source)).toThrow();
    }
    const source = bridgeReply(); source.step = step; source.original.queueExpiresAt = 1002;
    expect(parseSmokeReplayReply(source)).toEqual(source);
  });
  it("hashes the raw UTF-8 identity, without JSON quoting or normalization", async () => {
    for (const value of ["run-identity", "包-é", "e\u0301"]) {
      expect(await smokeReplayHash(value)).toBe(createHash("sha256").update(value, "utf8").digest("hex"));
    }
  });
  it("accepts only safe replies for each branch and freezes nested snapshots", () => {
    for (const source of [bridgeReply(), { ...bridgeReply(), step: "status" }, ownerReply(),
      { ...ownerReply(), step: "owner-a-recover" }, hiddenReply(), { ...hiddenReply(false), step: "owner-b-recover" }]) {
      const result = parseSmokeReplayReply(source);
      expect(result).toEqual(source); expect(result).not.toBe(source); expect(Object.isFrozen(result)).toBe(true);
      if ("identity" in result) expect(Object.isFrozen(result.identity)).toBe(true);
      if ("checks" in result) expect(Object.isFrozen(result.checks)).toBe(true);
    }
  });
  it.each(["view", "body", "ownerId", "runId", "packageId"])("rejects reply data leak %s", field => {
    for (const source of [bridgeReply(), ownerReply(), hiddenReply()]) {
      expect(() => parseSmokeReplayReply({ ...source, [field]: "forbidden" })).toThrow();
    }
  });
  it("rejects wrong branches, nested extras, false checks and mismatched owner-B booleans", () => {
    for (const value of [{ ...bridgeReply(), step: "owner-a-get" }, { ...ownerReply(), step: "status" },
      { ...hiddenReply(), completed: false }, { ...hiddenReply(false), completed: true },
      { ...hiddenReply(), identity: identity() }, { ...bridgeReply(), completed: false },
      { ...bridgeReply(), identity: { ...identity(), runId: "raw" } },
      { ...bridgeReply(), original: { ...bridgeReply().original, reset: true } },
      { ...bridgeReply(), receipt: { ...bridgeReply().receipt, body: "raw" } },
      { ...bridgeReply(), checks: { ...bridgeReply().checks, settled: false } },
      { ...ownerReply(), checks: { ...ownerReply().checks, ready: false } },
      { ...bridgeReply(), receipt: { ...bridgeReply().receipt, bodyState: "missing" } },
      { ...bridgeReply(), extra: "界".repeat(1366) }]) expect(() => parseSmokeReplayReply(value)).toThrow();
  });
});

const fixtures: ReturnType<typeof createResearchCloudSmokeFixture>[] = [];
function fixture() { const f = createResearchCloudSmokeFixture(); fixtures.push(f); return f; }
afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  await Promise.all(fixtures.splice(0).map(f => f.dispose())); });
async function admission(f: ReturnType<typeof fixture>, scenarioId: typeof SCENARIOS[number]["id"] = "long") {
  const scope = new PublicOperationScope(() => performance.now());
  try { return await requireSmokeReplayAdmission({ environment: f.environment, scenarioId, scope }); }
  finally { scope.finish(); }
}
async function complete(f: ReturnType<typeof fixture>, id: typeof SCENARIOS[number]["id"] = "long") {
  expect((await f.signedStart(id)).status).toBe(200);
  expect((await f.runWorkflow(id)).state).toBe("recorded");
  vi.setSystemTime(Date.now() + 30_001); await f.runCron();
}
async function approved() {
  vi.useFakeTimers({ toFake: ["Date"] }); const f = fixture();
  await complete(f); await f.approveReplay("long"); return f;
}
async function replay(f: ReturnType<typeof fixture>, step: typeof SMOKE_REPLAY_STEPS[number],
  scenarioId: typeof SCENARIOS[number]["id"] = "long", suppliedScope?: PublicOperationScope) {
  const scope = suppliedScope ?? new PublicOperationScope(() => performance.now());
  try { return await runSmokeReplay({ environment: f.environment,
    connection: readResearchBridgeConnection(f.environment)!, request: { scenarioId, step }, scope }); }
  finally { if (!suppliedScope) scope.finish(); }
}
/** Intercept only a real authenticated local exchange and re-sign synthetic negative DTOs. */
function changeSignedExecutorReply(f: ReturnType<typeof fixture>, operation: "status" | "submit",
  change: (value: ExecutorStatus) => unknown, responseStatus = operation === "submit" ? 202 : 200) {
  const actualFetch = f.environment.SMOKE_EXECUTOR.fetch.bind(f.environment.SMOKE_EXECUTOR);
  const connection = readResearchBridgeConnection(f.environment)!;
  f.environment.SMOKE_EXECUTOR = { fetch: async (request: Request) => {
    const response = await actualFetch(request);
    const path = new URL(request.url).pathname;
    if (!path.endsWith(`/${operation}`)) return response;
    const body = new TextEncoder().encode(JSON.stringify(change(await response.json() as ExecutorStatus)));
    const headers = await signBridgeMessage({ context: { direction: "site-to-executor", kind: "response", method: "POST",
      path, audience: connection.executorOrigin, jobId: request.headers.get("x-arc-bridge-job-id")!, status: responseStatus },
      body, keyId: connection.siteToExecutor.keyId, keyBytes: connection.siteToExecutor.copyKeyBytes(), now: Date.now });
    headers.set("content-type", "application/json");
    return new Response(body, { status: responseStatus, headers });
  } } as Fetcher;
}

describe("signed replay Site endpoint", () => {
  const controlResponseNonces = new Set<string>();
  async function verifiedResponse(response: Response) {
    const body = await readBridgeBody(response, { maxBytes: 4096, timeoutMs: 1000 });
    await verifyBridgeMessage({ context: { direction: "executor-to-site", kind: "response", method: "POST",
      path: "/_smoke/replay", audience: "https://site.test", jobId: "collection", status: response.status }, body,
      headers: response.headers, keyId: "control-test", keyBytes: new Uint8Array(32).fill(0x33), now: Date.now,
      nonces: { claim: async ({ scope, nonce }) => { const key = `${scope}:${nonce}`;
        if (controlResponseNonces.has(key)) return false; controlResponseNonces.add(key); return true; } } });
    return { status: response.status, body: JSON.parse(new TextDecoder().decode(body)) as unknown };
  }

  it.each(["normal create response", "lost create response"] as const)(
    "TEMPORAL-001 preserves the original delayed acknowledgement through %s and all signed replays", async mode => {
      vi.useFakeTimers({ toFake: ["Date"] }); const f = fixture(); const scenario = SCENARIOS[0]!;
      const outbound = vi.fn(() => { throw new Error("External fetch forbidden"); }); vi.stubGlobal("fetch", outbound);
      const beganAt = Date.now(); const acknowledgementDelayMs = 11_835;
      const readJob = () => f.executorDb.database.prepare(`SELECT job_json,request_hash,grant_json,
        dispatch_state,dispatch_at,workflow_accepted_at FROM research_executor_jobs WHERE job_id=?1`).get(scenario.jobId);
      const observations: { result: Awaited<ReturnType<typeof f.runWorkflow>>; job: ReturnType<typeof readJob>;
        execution: ReturnType<typeof f.siteSnapshot>["execution"] }[] = [];
      f.onNextWorkflowCreateResponse(async () => {
        const result = await f.runWorkflow("long");
        observations.push({ result, job: readJob(), execution: f.siteSnapshot("long").execution });
        vi.setSystemTime(Date.now() + acknowledgementDelayMs);
        if (mode === "lost create response") throw new Error("Synthetic Workflow create response loss");
      });

      const started = await f.signedStart("long");
      // Assert after bootstrap returns: it deliberately catches create failures, including hook errors.
      expect(observations).toHaveLength(1); const observed = observations[0]!;
      expect(observed.result.state).toBe("recorded");
      expect(observed.job).toMatchObject({ dispatch_state: "claimed", dispatch_at: beganAt, workflow_accepted_at: null });
      expect(observed.execution).toMatchObject({ began_at: beganAt,
        execution_expires_at: beganAt + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs });
      expect(started.status).toBe(200);
      const expectedCalls = (mode === "lost create response" ? ["create", "get", "status"] : ["create"])
        .map(operation => ({ operation, id: scenario.jobId }));
      expect(f.workflowCalls).toEqual(expectedCalls);
      const acceptedAt = beganAt + acknowledgementDelayMs;
      expect(readJob()).toEqual({ ...observed.job, workflow_accepted_at: acceptedAt });
      expect(acceptedAt).toBeGreaterThan(Number(observed.execution!.began_at));
      const originalJob = JSON.parse(String(observed.job!.job_json));
      const originalGrant = JSON.parse(String(observed.job!.grant_json));

      vi.setSystemTime(Date.now() + 30_001); await f.runCron();
      const approvedRoster = await f.approveReplay("long");
      expect(approvedRoster.scenarios).toHaveLength(1);
      expect(approvedRoster.scenarios[0]).toMatchObject({ acceptedAt, beganAt,
        executionExpiresAt: observed.execution!.execution_expires_at, requestHash: observed.job!.request_hash });
      const original = await admission(f);
      expect(original.accepted.workflowAcceptedAt).toBe(acceptedAt);
      expect(original.approval).toEqual(approvedRoster.scenarios[0]);
      expect(original.execution.job).toEqual(originalJob);
      expect(original.execution.requestHash).toBe(observed.job!.request_hash);
      expect(original.execution.beganAt).toBe(observed.execution!.began_at);
      expect(original.execution.executionExpiresAt).toBe(observed.execution!.execution_expires_at);
      expect(original.metadata.grant).toEqual(originalGrant);
      const before = f.siteSnapshot("long");
      for (const step of SMOKE_REPLAY_STEPS) {
        const result = await f.signedReplay("long", step);
        expect(result.status).toBe(200); const reply = parseSmokeReplayReply(result.body);
        expect(reply).toMatchObject({ scenarioId: "long", step, completed: true });
        if ("identity" in reply) expect(reply.identity).toEqual({ jobId: scenario.jobId,
          requestHash: observed.job!.request_hash, runHash: original.approval.runHash, packageHash: original.approval.packageHash });
        if ("original" in reply) expect(reply.original).toEqual({ acceptedAt, beganAt,
          executionExpiresAt: observed.execution!.execution_expires_at, queueExpiresAt: originalJob.queueExpiresAt });
        if ("isNull" in reply) expect(reply.isNull).toBe(true);
      }
      expect(f.siteSnapshot("long")).toEqual(before);
      expect(readJob()).toEqual({ ...observed.job, workflow_accepted_at: acceptedAt });
      expect(f.executorDb.database.prepare("SELECT provider_calls,repair_calls FROM smoke_scenarios WHERE scenario_id=?1")
        .get("long")).toEqual({ provider_calls: 1, repair_calls: 0 });
      expect(f.workflowCreates()).toBe(1); expect(f.workflowCalls).toEqual(expectedCalls);

      const honestRoster = f.environment.SMOKE_REPLAY_APPROVAL_JSON!;
      const changed = JSON.parse(honestRoster); changed.scenarios[0].acceptedAt = acceptedAt + 1;
      f.environment.SMOKE_REPLAY_APPROVAL_JSON = encode(changed);
      const traffic = [...f.traffic];
      try {
        await expect(admission(f)).rejects.toThrow();
        expect(f.traffic).toEqual(traffic); expect(f.siteSnapshot("long")).toEqual(before);
      } finally { f.environment.SMOKE_REPLAY_APPROVAL_JSON = honestRoster; }
      expect((await admission(f)).accepted.workflowAcceptedAt).toBe(acceptedAt);
      expect(outbound).not.toHaveBeenCalled();
    });

  it("verifies all six signed actions for every independently imported scenario with unchanged business counts", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); const f = fixture();
    const outbound = vi.fn(() => { throw new Error("External fetch forbidden"); }); vi.stubGlobal("fetch", outbound);
    for (const scenario of SCENARIOS) {
      await complete(f, scenario.id); await f.approveReplay(scenario.id);
      const before = f.siteSnapshot(scenario.id);
      for (const step of SMOKE_REPLAY_STEPS) {
        const trafficStart = f.traffic.length;
        const result = await f.signedReplay(scenario.id, step);
        expect(result.status).toBe(200); expect(parseSmokeReplayReply(result.body)).toMatchObject({ scenarioId: scenario.id, step, completed: true });
        expect(new TextEncoder().encode(JSON.stringify(result.body)).length).toBeLessThanOrEqual(4096);
        expect(f.traffic.slice(trafficStart).filter(path => path.startsWith("executor:"))).toEqual(step === "submit"
          ? ["executor:/internal/research-bridge/status", "executor:/internal/research-bridge/submit"]
          : step === "status" ? ["executor:/internal/research-bridge/status"] : []);
      }
      expect(f.siteSnapshot(scenario.id)).toEqual(before);
      expect(f.executorDb.database.prepare("SELECT provider_calls,repair_calls FROM smoke_scenarios WHERE scenario_id=?1")
        .get(scenario.id)).toEqual({ provider_calls: 1, repair_calls: 0 });
    }
    expect(f.workflowCreates()).toBe(3); expect(outbound).not.toHaveBeenCalled();
    expect(Object.hasOwn(f.environment, "EXECUTOR_DB")).toBe(false); expect(Object.hasOwn(f.environment, "EXECUTOR_RECEIPTS")).toBe(false);
  });

  it.each(["missing-roster", "failed", "unsettled", "expired"] as const)("refuses %s before any bridge or reader action", async state => {
    const f = await approved();
    if (state === "missing-roster") delete f.environment.SMOKE_REPLAY_APPROVAL_JSON;
    if (state === "failed") f.siteDb.database.exec("UPDATE research_runs SET state='failed'");
    if (state === "unsettled") f.siteDb.database.exec("UPDATE ai_budget_reservations SET status='reserved',settled_micros=0");
    if (state === "expired") vi.setSystemTime(Number(f.siteDb.database.prepare("SELECT expires_at FROM research_packages").get()!.expires_at));
    const before = f.siteSnapshot("long"); const traffic = [...f.traffic];
    const status = vi.spyOn(ExecutorBridgeClient.prototype, "status"); const submit = vi.spyOn(ExecutorBridgeClient.prototype, "submit");
    const get = vi.spyOn(RemoteResearchReader.prototype, "get"); const recover = vi.spyOn(RemoteResearchReader.prototype, "recover");
    for (const step of SMOKE_REPLAY_STEPS) expect(await f.signedReplay("long", step)).toEqual({ status: 503, body: { code: "unavailable" } });
    expect(f.siteSnapshot("long")).toEqual(before); expect(f.traffic).toEqual(traffic); expect(f.workflowCreates()).toBe(1);
    for (const call of [status, submit, get, recover]) expect(call).not.toHaveBeenCalled();
  });

  it.each(["database", "binding", "reader"] as const)("signs only a safe error for a %s exception", async failure => {
    const f = await approved(); const before = f.siteSnapshot("long"); f.traffic.length = 0;
    const fail = () => { throw new Error("SELECT provider-canary secret-canary raw-stack"); };
    if (failure === "database") vi.spyOn(f.siteDb, "prepare").mockImplementation(fail);
    if (failure === "binding") f.environment.SMOKE_EXECUTOR = { fetch: fail } as unknown as Fetcher;
    if (failure === "reader") vi.spyOn(RemoteResearchReader.prototype, "get").mockImplementation(fail);
    expect(await f.signedReplay("long", failure === "reader" ? "owner-a-get" : "submit")).toEqual({ status: 503, body: { code: "unavailable" } });
    expect(f.siteSnapshot("long")).toEqual(before); expect(f.workflowCreates()).toBe(1);
  });

  it("fences submit when the real Request disconnects immediately after status resolves", async () => {
    const f = await approved(); const before = f.siteSnapshot("long"); f.traffic.length = 0;
    const controller = new AbortController(); const actualStatus = ExecutorBridgeClient.prototype.status;
    const status = vi.spyOn(ExecutorBridgeClient.prototype, "status").mockImplementation(async function (this: ExecutorBridgeClient, job, options) {
      const result = await actualStatus.call(this, job, options); controller.abort(); return result;
    });
    const submit = vi.spyOn(ExecutorBridgeClient.prototype, "submit");
    const request = new Request(await f.makeRequest("replay", "long", { body: { scenarioId: "long", step: "submit" } }), { signal: controller.signal });
    expect(await verifiedResponse(await f.dispatch(request))).toEqual({ status: 503, body: { code: "unavailable" } });
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(status).toHaveBeenCalledOnce(); expect(submit).not.toHaveBeenCalled();
    expect(f.traffic).toEqual(["executor:/internal/research-bridge/status"]); expect(f.siteSnapshot("long")).toEqual(before);
  });

  it("fences a live reader refresh after the real Request disconnects", async () => {
    const f = await approved(); const before = f.siteSnapshot("long"); f.traffic.length = 0;
    let readerActive = false; let refreshing = false;
    const actualGet = RemoteResearchReader.prototype.get;
    vi.spyOn(RemoteResearchReader.prototype, "get").mockImplementation(function (this: RemoteResearchReader, owner, run) {
      readerActive = true; return actualGet.call(this, owner, run);
    });
    const actualFinish = PublicOperationScope.prototype.finish;
    vi.spyOn(PublicOperationScope.prototype, "finish").mockImplementation(function (this: PublicOperationScope) {
      if (readerActive) refreshing = true; actualFinish.call(this);
    });
    const barrier = createD1OperationBarrier(f.siteDb as unknown as D1Database, () => refreshing);
    f.environment.SMOKE_SITE_DB = barrier.db;
    const controller = new AbortController();
    const request = new Request(await f.makeRequest("replay", "long", { body: { scenarioId: "long", step: "owner-a-get" } }), { signal: controller.signal });
    const pending = f.dispatch(request);
    try {
      await barrier.entered; controller.abort();
      expect(await verifiedResponse(await pending)).toEqual({ status: 503, body: { code: "unavailable" } });
      barrier.expire(); barrier.release(); await new Promise<void>(resolve => setImmediate(resolve));
      expect(barrier.lateStarts()).toBe(0); expect(f.traffic).toEqual([]); expect(f.siteSnapshot("long")).toEqual(before);
    } finally { barrier.release(); }
  });

  it.each(["disconnect", "timer"] as const)("fences request-auth nonce SQL on %s without scheduling any replay operation", async mode => {
    const f = await approved(); const before = f.siteSnapshot("long"); f.traffic.length = 0;
    const initialNonces = Number(f.siteDb.database.prepare("SELECT count(*) n FROM research_bridge_nonces").get()!.n);
    const barrier = createD1OperationBarrier(f.siteDb as unknown as D1Database, sql => sql.includes("INSERT INTO research_bridge_nonces"));
    f.environment.SMOKE_SITE_DB = barrier.db;
    const prepared = vi.spyOn(f.siteDb, "prepare"); const controller = new AbortController();
    const request = new Request(await f.makeRequest("replay", "long", { body: { scenarioId: "long", step: "submit" } }), { signal: controller.signal });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }); const pending = f.dispatch(request);
    try {
      await barrier.entered; const statements = prepared.mock.calls.length;
      if (mode === "disconnect") controller.abort(); else await vi.advanceTimersByTimeAsync(4500);
      expect(await verifiedResponse(await pending)).toEqual({ status: 503, body: { code: "unavailable" } });
      expect(Number(f.siteDb.database.prepare("SELECT count(*) n FROM research_bridge_nonces").get()!.n)).toBe(initialNonces);
      barrier.expire(); barrier.release(); await new Promise<void>(resolve => setImmediate(resolve));
      expect(barrier.lateStarts()).toBe(0); expect(prepared).toHaveBeenCalledTimes(statements);
      // The already dispatched native nonce INSERT may commit after fencing; no rollback is claimed.
      expect(Number(f.siteDb.database.prepare("SELECT count(*) n FROM research_bridge_nonces").get()!.n)).toBe(initialNonces + 1);
      expect(f.traffic).toEqual([]); expect(f.siteSnapshot("long")).toEqual(before); expect(f.workflowCreates()).toBe(1);
    } finally { barrier.release(); }
  });

  it("shares one 4500ms budget across body reading and request nonce SQL", async () => {
    const f = await approved(); const before = f.siteSnapshot("long"); f.traffic.length = 0;
    const signed = await f.makeRequest("replay", "long", { body: { scenarioId: "long", step: "submit" } });
    const bytes = new Uint8Array(await signed.arrayBuffer());
    const barrier = createD1OperationBarrier(f.siteDb as unknown as D1Database, sql => sql.includes("INSERT INTO research_bridge_nonces"));
    f.environment.SMOKE_SITE_DB = barrier.db;
    let bodyController!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({ start(controller) { bodyController = controller; } });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const request = new Request(signed.url, { method: "POST", headers: signed.headers, body: stream, duplex: "half" } as RequestInit);
    const pending = f.dispatch(request);
    try {
      await vi.advanceTimersByTimeAsync(3500); bodyController.enqueue(bytes); bodyController.close();
      await barrier.entered; await vi.advanceTimersByTimeAsync(1000);
      expect(await verifiedResponse(await pending)).toEqual({ status: 503, body: { code: "unavailable" } });
      barrier.expire(); barrier.release(); await new Promise<void>(resolve => setImmediate(resolve));
      expect(barrier.lateStarts()).toBe(0); expect(f.traffic).toEqual([]); expect(f.siteSnapshot("long")).toEqual(before);
    } finally { barrier.release(); }
  });
});

describe("smoke replay production composition", () => {
  it.each(SMOKE_REPLAY_STEPS)("requires admission before any client or reader factory for %s", async step => {
    const f = fixture(); const prepared = vi.spyOn(f.siteDb, "prepare");
    const get = vi.spyOn(RemoteResearchReader.prototype, "get");
    const recover = vi.spyOn(RemoteResearchReader.prototype, "recover");
    const binding = vi.spyOn(f.environment, "SMOKE_EXECUTOR", "get");
    await expect(replay(f, step)).rejects.toThrow();
    expect(prepared).not.toHaveBeenCalled(); expect(binding).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled(); expect(recover).not.toHaveBeenCalled(); expect(f.traffic).toEqual([]);
  });
  it("preflights the original status in the same submit request without creating another workflow", async () => {
    const f = await approved(); const original = await admission(f); const before = f.siteSnapshot("long"); f.traffic.length = 0;
    const status = vi.spyOn(ExecutorBridgeClient.prototype, "status");
    const submit = vi.spyOn(ExecutorBridgeClient.prototype, "submit");
    const reply = await replay(f, "submit");
    expect(f.traffic.filter(path => path.startsWith("executor:"))).toEqual([
      "executor:/internal/research-bridge/status", "executor:/internal/research-bridge/submit"]);
    expect(f.traffic.filter(path => path.startsWith("site:"))).toEqual(["site:/api/internal/research-bridge/accepted"]);
    expect(reply.step).toBe("submit"); expect(reply.completed).toBe(true);
    expect(status).toHaveBeenCalledExactlyOnceWith(original.execution.job, { signal: expect.any(AbortSignal) });
    expect(submit).toHaveBeenCalledExactlyOnceWith(original.execution.job, { signal: status.mock.calls[0]![1]!.signal });
    if (reply.step !== "submit") throw new Error("Expected submit reply");
    expect(reply.identity).toEqual({ jobId: original.execution.jobId, requestHash: original.execution.requestHash,
      runHash: original.approval.runHash, packageHash: original.approval.packageHash });
    expect(reply.receipt.metadataSha256).toBe(await smokeReplayHash(canonicalJson(original.metadata)));
    expect(f.workflowCreates()).toBe(1); expect(f.siteSnapshot("long")).toEqual(before);
  });
  it.each(SMOKE_REPLAY_STEPS)("maps %s to the real operation and returns only the bounded contract", async step => {
    const f = await approved(); f.traffic.length = 0;
    const result = await replay(f, step);
    expect(result.step).toBe(step); expect(result.completed).toBe(true);
    expect(parseSmokeReplayReply(result)).toEqual(result);
    expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThanOrEqual(4096);
    expect(f.traffic.filter(path => path.startsWith("executor:"))).toEqual(step === "submit" ? ["executor:/internal/research-bridge/status", "executor:/internal/research-bridge/submit"]
      : step === "status" ? ["executor:/internal/research-bridge/status"] : []);
    expect(f.workflowCreates()).toBe(1);
  });
  it("replays all six operations for all fixed scenarios with Provider 1 / Repair 0 / Workflow 1", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); const f = fixture();
    const outbound = vi.fn(() => { throw new Error("External fetch forbidden"); }); vi.stubGlobal("fetch", outbound);
    for (const scenario of SCENARIOS) {
      await complete(f, scenario.id); await f.approveReplay(scenario.id);
      const before = f.siteSnapshot(scenario.id);
      for (const step of SMOKE_REPLAY_STEPS) expect((await replay(f, step, scenario.id)).completed).toBe(true);
      expect(f.siteSnapshot(scenario.id)).toEqual(before);
      expect(f.executorDb.database.prepare("SELECT provider_calls,repair_calls FROM smoke_scenarios WHERE scenario_id=?1")
        .get(scenario.id)).toEqual({ provider_calls: 1, repair_calls: 0 });
    }
    expect(f.workflowCreates()).toBe(3); expect(outbound).not.toHaveBeenCalled();
  });
  it.each(["owner-a-get", "owner-a-recover", "owner-b-get", "owner-b-recover"] as const)(
    "uses the original run or the same original selection for %s", async step => {
      const f = await approved(); const original = await admission(f); const scenario = SCENARIOS[0]!;
      const method = step.endsWith("recover") ? "recover" : "get";
      const call = vi.spyOn(RemoteResearchReader.prototype, method);
      await replay(f, step);
      expect(call).toHaveBeenCalledExactlyOnceWith(step.startsWith("owner-b") ? scenario.otherOwnerId : scenario.ownerId,
        method === "get" ? original.run.id : { kind: "start", role: scenario.role, locale: scenario.locale, mutationId: scenario.mutationId });
    });
  it.each(["owner-b-get", "owner-b-recover"] as const)("never serializes an unexpected canary view for %s", async step => {
    const f = await approved(); const canary = { id: "PRIVATE-CANARY", summary: "PRIVATE-BODY",
      toJSON() { throw new Error("Must not serialize owner B view"); } };
    vi.spyOn(RemoteResearchReader.prototype, step.endsWith("get") ? "get" : "recover").mockResolvedValueOnce(canary as never);
    const result = await replay(f, step);
    expect(result).toEqual({ schemaVersion: "arc-smoke-replay-v1", scenarioId: "long", step, completed: false, isNull: false });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|identity|view|ownerId/u);
  });
  it.each(["null", "run", "package", "ready", "accepted"] as const)("rejects an owner A view with wrong %s", async fault => {
    const f = await approved(); const original = await admission(f);
    const view = { id: original.run.id, state: "ready", packageId: original.run.packageId, backgroundAccepted: true };
    const changed = fault === "null" ? null : { ...view, ...(fault === "run" ? { id: "other" }
      : fault === "package" ? { packageId: "other" } : fault === "ready" ? { state: "researching" } : { backgroundAccepted: false }) };
    vi.spyOn(RemoteResearchReader.prototype, "get").mockResolvedValueOnce(changed as never);
    await expect(replay(f, "owner-a-get")).rejects.toThrow();
  });
  it("retains original metadata and owner visibility after real acknowledged-body retention cleanup", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); const f = fixture();
    // A transient local cleanup failure retains the already-acknowledged body until the next real Cron.
    const execute = f.executorDb.execute.bind(f.executorDb);
    const cleanupFailure = vi.spyOn(f.executorDb, "execute").mockImplementation((sql, values, mode) => {
      if (/UPDATE research_executor_results\s+SET cleanup_requested_at/u.test(sql)) throw new Error("Synthetic cleanup unavailable");
      return execute(sql, values, mode);
    });
    await complete(f); await f.approveReplay("long"); cleanupFailure.mockRestore();
    const before = await replay(f, "status");
    const beforeOwners = await Promise.all(SMOKE_REPLAY_STEPS.slice(2).map(step => replay(f, step)));
    const beforeSite = f.siteSnapshot("long");
    vi.setSystemTime(Date.now() + BRIDGE_RECEIPT_RETENTION_MS + 1); await f.runCron();
    const after = await replay(f, "status");
    expect(before.step).toBe("status"); expect(after.step).toBe("status");
    if (before.step !== "status" || after.step !== "status") throw new Error("Expected status reply");
    expect(before.receipt.bodyState).toBe("available"); expect(after.receipt.bodyState).toBe("removed");
    expect(after).toEqual({ ...before, receipt: { ...before.receipt, bodyState: "removed" } });
    const retained = f.executorDb.database.prepare("SELECT site_acknowledged_at,body_removed_at FROM research_executor_results").get()!;
    expect(retained.site_acknowledged_at).toEqual(expect.any(Number)); expect(retained.body_removed_at).toEqual(expect.any(Number));
    expect(await Promise.all(SMOKE_REPLAY_STEPS.slice(2).map(step => replay(f, step)))).toEqual(beforeOwners);
    expect(f.siteSnapshot("long")).toEqual(beforeSite); expect(f.workflowCreates()).toBe(1);
  });
});

describe("smoke replay authenticated preflight", () => {
  const faults: [string, (value: ExecutorStatus) => unknown][] = [
    ["missing accepted", s => ({ ...s, accepted: null })],
    ["different accepted identity", s => ({ ...s, accepted: { ...s.accepted!, requestHash: "b".repeat(64) } })],
    ["different accepted time", s => ({ ...s, accepted: { ...s.accepted!, workflowAcceptedAt: s.accepted!.workflowAcceptedAt - 1 } })],
    ["unclaimed", s => ({ ...s, dispatchState: "unclaimed", metadata: null, bodyState: null })],
    ["closed", s => ({ ...s, dispatchState: "closed", metadata: null, bodyState: null,
      unsent: { jobId: s.jobId, requestHash: s.requestHash, state: "closed", closedAt: Date.now(), grant: s.metadata!.grant } })],
    ["missing metadata", s => ({ ...s, metadata: null, bodyState: null })],
    ["receipt mismatch", s => ({ ...s, metadata: { ...s.metadata!, receiptHash: "b".repeat(64) } })],
    ["metadata mismatch", s => ({ ...s, metadata: { ...s.metadata!, latencyMs: s.metadata!.latencyMs + 1 } })],
    ["different original grant", s => ({ ...s, metadata: { ...s.metadata!, grant: { ...s.metadata!.grant,
      beganAt: s.metadata!.grant.beganAt - 1, executionExpiresAt: s.metadata!.grant.executionExpiresAt - 1 } } })],
    ["missing body", s => ({ ...s, bodyState: "missing" })],
  ];
  it.each(faults)("refuses %s before submit even after a prior successful status request", async (_name, change) => {
    const f = await approved(); expect((await replay(f, "status")).completed).toBe(true);
    const before = f.siteSnapshot("long"); f.traffic.length = 0;
    changeSignedExecutorReply(f, "status", change);
    await expect(replay(f, "submit")).rejects.toThrow();
    expect(f.traffic).toEqual(["executor:/internal/research-bridge/status"]);
    expect(f.workflowCreates()).toBe(1); expect(f.siteSnapshot("long")).toEqual(before);
    await expect(replay(f, "status")).rejects.toThrow();
  });
  it("refuses an authenticated rejected status before submit", async () => {
    const f = await approved(); f.traffic.length = 0;
    changeSignedExecutorReply(f, "status", () => ({ code: "temporary" }), 503);
    await expect(replay(f, "submit")).rejects.toThrow();
    expect(f.traffic).toEqual(["executor:/internal/research-bridge/status"]); expect(f.workflowCreates()).toBe(1);
  });
  it("requires submit's accepted proof to match the admitted and just-observed original", async () => {
    const f = await approved(); f.traffic.length = 0;
    changeSignedExecutorReply(f, "submit", value => ({ ...value, workflowAcceptedAt: 1 }));
    await expect(replay(f, "submit")).rejects.toThrow(); expect(f.workflowCreates()).toBe(1);
    expect(f.traffic.filter(path => path.startsWith("executor:"))).toEqual([
      "executor:/internal/research-bridge/status", "executor:/internal/research-bridge/submit"]);
  });
});

describe("smoke replay continuation fences", () => {
  it.each(["finish", "timer"] as const)("fences the initial approval SELECT on %s", async mode => {
    const f = await approved(); f.traffic.length = 0; const before = f.siteSnapshot("long");
    const barrier = createD1OperationBarrier(f.siteDb as unknown as D1Database, sql => sql.includes("idempotency_records"));
    f.environment.SMOKE_SITE_DB = barrier.db; vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const scope = new PublicOperationScope(() => performance.now());
    const result = replay(f, "submit", "long", scope); const rejected = expect(result).rejects.toThrow();
    try {
      await barrier.entered; if (mode === "finish") scope.finish(); else await vi.advanceTimersByTimeAsync(4500);
      await rejected; barrier.expire(); barrier.release(); await new Promise<void>(resolve => setImmediate(resolve));
      expect(barrier.lateStarts()).toBe(0); expect(f.traffic).toEqual([]); expect(f.siteSnapshot("long")).toEqual(before);
    } finally { scope.finish(); barrier.release(); }
  });
  it.each(["finish", "timer"] as const)("fences reader work SQL after outer %s while the inner scope is live", async mode => {
    const f = await approved(); const before = f.siteSnapshot("long"); f.traffic.length = 0;
    let publicRead = false;
    const actualPublicRead = D1ResearchRepository.prototype.getPublicRun;
    vi.spyOn(D1ResearchRepository.prototype, "getPublicRun").mockImplementation(function (this: D1ResearchRepository, owner, run) {
      publicRead = true; return actualPublicRead.call(this, owner, run);
    });
    const barrier = createD1OperationBarrier(f.siteDb as unknown as D1Database, () => publicRead);
    f.environment.SMOKE_SITE_DB = barrier.db;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const scope = new PublicOperationScope(() => performance.now());
    const result = replay(f, "owner-a-get", "long", scope); const rejected = expect(result).rejects.toThrow();
    try {
      await barrier.entered;
      if (mode === "finish") scope.finish(); else await vi.advanceTimersByTimeAsync(4500);
      await rejected; barrier.expire(); barrier.release();
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(barrier.lateStarts()).toBe(0); expect(f.traffic).toEqual([]);
      expect(f.siteSnapshot("long")).toEqual(before);
    } finally { scope.finish(); barrier.release(); }
  });
  it("prevents a new refresh scope from escaping a finished outer scope", async () => {
    const f = await approved(); f.traffic.length = 0;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const scope = new PublicOperationScope(() => performance.now());
    let refreshing = false;
    const actualFinish = PublicOperationScope.prototype.finish;
    vi.spyOn(PublicOperationScope.prototype, "finish").mockImplementation(function (this: PublicOperationScope) {
      if (this !== scope) refreshing = true;
      actualFinish.call(this);
    });
    const barrier = createD1OperationBarrier(f.siteDb as unknown as D1Database, () => refreshing);
    f.environment.SMOKE_SITE_DB = barrier.db;
    const result = replay(f, "owner-a-get", "long", scope); const rejected = expect(result).rejects.toThrow();
    try {
      await barrier.entered; scope.finish(); await rejected;
      barrier.expire(); barrier.release(); await new Promise<void>(resolve => setImmediate(resolve));
      expect(barrier.lateStarts()).toBe(0); expect(f.traffic).toEqual([]);
    } finally { scope.finish(); barrier.release(); }
  });
  it("keeps the real verified Ready fallback on inner refresh timeout while the outer scope remains live", async () => {
    const f = await approved(); const before = f.siteSnapshot("long"); f.traffic.length = 0;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const scope = new PublicOperationScope(() => performance.now()); let refreshing = false;
    const actualFinish = PublicOperationScope.prototype.finish;
    vi.spyOn(PublicOperationScope.prototype, "finish").mockImplementation(function (this: PublicOperationScope) {
      if (this !== scope) refreshing = true; actualFinish.call(this);
    });
    const barrier = createD1OperationBarrier(f.siteDb as unknown as D1Database, () => refreshing);
    f.environment.SMOKE_SITE_DB = barrier.db;
    const result = replay(f, "owner-a-get", "long", scope);
    try {
      await barrier.entered; await vi.advanceTimersByTimeAsync(500);
      expect((await result).completed).toBe(true); expect(scope.signal.aborted).toBe(false);
      barrier.expire(); barrier.release(); await new Promise<void>(resolve => setImmediate(resolve));
      expect(barrier.lateStarts()).toBe(0); expect(f.traffic).toEqual([]); expect(f.siteSnapshot("long")).toEqual(before);
    } finally { scope.finish(); barrier.release(); }
  });
  it.each(["finish", "timer"] as const)("fences response-auth nonce SQL on %s without pretending dispatched SQL rolls back", async mode => {
    const f = await approved(); f.traffic.length = 0; const before = f.siteSnapshot("long");
    const barrier = createD1OperationBarrier(f.siteDb as unknown as D1Database, sql => sql.includes("INSERT INTO research_bridge_nonces"));
    f.environment.SMOKE_SITE_DB = barrier.db; vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const scope = new PublicOperationScope(() => performance.now());
    const result = replay(f, "submit", "long", scope); const rejected = expect(result).rejects.toThrow();
    try {
      await barrier.entered; if (mode === "finish") scope.finish(); else await vi.advanceTimersByTimeAsync(4500);
      await rejected; barrier.expire(); barrier.release(); await new Promise<void>(resolve => setImmediate(resolve));
      expect(barrier.lateStarts()).toBe(0); expect(f.traffic).toEqual(["executor:/internal/research-bridge/status"]);
      expect(f.siteSnapshot("long")).toEqual(before); expect(f.workflowCreates()).toBe(1);
    } finally { scope.finish(); barrier.release(); }
  });
  it.each(["finish", "timer"] as const)("aborts a stalled status binding on %s and cancels its late response", async mode => {
    const f = await approved(); f.traffic.length = 0;
    let enter!: () => void; let release!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const resumed = new Promise<void>(resolve => { release = resolve; });
    const actualFetch = f.environment.SMOKE_EXECUTOR.fetch.bind(f.environment.SMOKE_EXECUTOR);
    let bindingSignal: AbortSignal | undefined; const cancel = vi.fn();
    f.environment.SMOKE_EXECUTOR = { fetch: async (request: Request) => {
      bindingSignal = request.signal;
      const response = await actualFetch(request);
      const actualCancel = response.body!.cancel.bind(response.body!);
      vi.spyOn(response.body!, "cancel").mockImplementation(reason => { cancel(); return actualCancel(reason); });
      enter(); await resumed; return response;
    } } as Fetcher;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const scope = new PublicOperationScope(() => performance.now());
    const result = replay(f, "submit", "long", scope); const rejected = expect(result).rejects.toThrow();
    try {
      await entered; if (mode === "finish") scope.finish(); else await vi.advanceTimersByTimeAsync(4500);
      await rejected; expect(bindingSignal?.aborted).toBe(true);
      release(); await new Promise<void>(resolve => setImmediate(resolve));
      expect(cancel).toHaveBeenCalled(); expect(f.traffic).toEqual(["executor:/internal/research-bridge/status"]);
      expect(f.workflowCreates()).toBe(1);
    } finally { scope.finish(); release(); }
  });
  it("refuses a rejected binding before submit", async () => {
    const f = await approved(); const calls: string[] = [];
    f.environment.SMOKE_EXECUTOR = { fetch: async (request: Request): Promise<Response> => {
      calls.push(new URL(request.url).pathname); throw new Error("Synthetic binding rejection");
    } } as Fetcher;
    await expect(replay(f, "submit")).rejects.toThrow();
    expect(calls).toEqual(["/internal/research-bridge/status"]); expect(f.workflowCreates()).toBe(1);
  });
  it("cancels a returned status body when the late guard detects expiry before the wall timer fires", async () => {
    const f = await approved(); f.traffic.length = 0;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let mono = 0; const scope = new PublicOperationScope(() => mono);
    const actualFetch = f.environment.SMOKE_EXECUTOR.fetch.bind(f.environment.SMOKE_EXECUTOR); const cancel = vi.fn();
    f.environment.SMOKE_EXECUTOR = { fetch: async (request: Request) => {
      const response = await actualFetch(request);
      const actualCancel = response.body!.cancel.bind(response.body!);
      vi.spyOn(response.body!, "cancel").mockImplementation(reason => { cancel(); return actualCancel(reason); });
      expect(request.signal.aborted).toBe(false); mono = 4500; return response;
    } } as Fetcher;
    try {
      await expect(replay(f, "submit", "long", scope)).rejects.toThrow();
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(cancel).toHaveBeenCalled(); expect(scope.signal.aborted).toBe(true);
      expect(f.traffic).toEqual(["executor:/internal/research-bridge/status"]);
    } finally { scope.finish(); }
  });
  it("does not schedule submit after cancellation immediately after the real status resolves", async () => {
    const f = await approved(); f.traffic.length = 0;
    const scope = new PublicOperationScope(() => performance.now());
    const actualStatus = ExecutorBridgeClient.prototype.status;
    vi.spyOn(ExecutorBridgeClient.prototype, "status").mockImplementation(async function (this: ExecutorBridgeClient, job, options) {
      const result = await actualStatus.call(this, job, options); scope.finish(); return result;
    });
    const submit = vi.spyOn(ExecutorBridgeClient.prototype, "submit");
    await expect(replay(f, "submit", "long", scope)).rejects.toThrow();
    expect(submit).not.toHaveBeenCalled(); expect(f.traffic).toEqual(["executor:/internal/research-bridge/status"]);
  });
});
/** Immutable production rows are altered only in a SELECT's source, never by disabling their triggers. */
function substituteReads(f: ReturnType<typeof fixture>, table: string, patch: Record<string, unknown> = {}, duplicate = false) {
  const columns = f.siteDb.database.prepare(`PRAGMA table_info(${table})`).all().map(row => String(row.name));
  const literal = (v: unknown) => v === null ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replaceAll("'", "''")}'`;
  const projection = columns.map(c => Object.hasOwn(patch, c) ? `${literal(patch[c])} AS ${c}` : c).join(",");
  const original = f.siteDb.execute.bind(f.siteDb);
  vi.spyOn(f.siteDb, "execute").mockImplementation((sql, values, mode) => {
    if (mode === "run") throw new Error("Admission must be read-only");
    if (!new RegExp(`\\b${table}\\b`, "u").test(sql)) return original(sql, values, mode);
    const source = `SELECT ${projection} FROM ${table}`;
    const replaced = sql.replaceAll(new RegExp(`\\b${table}\\b`, "gu"), "replay_test_source");
    return original(`WITH replay_test_source AS (${source}${duplicate ? ` UNION ALL ${source}` : ""}) ${replaced}`, values, mode);
  });
}

describe("smoke replay current-state admission", () => {
  it("rejects missing approval before preparing any database operation", async () => {
    const f = fixture(); const prepared = vi.spyOn(f.siteDb, "prepare");
    await expect(admission(f)).rejects.toThrow(); expect(prepared).not.toHaveBeenCalled(); expect(f.traffic).toEqual([]);
  });
  it("rejects malformed, unbound or unselected approvals before database access", async () => {
    const f = fixture(); const prepared = vi.spyOn(f.siteDb, "prepare");
    for (const json of ["", "{", encode({ ...roster(), scenarios: [] }), encode({ ...roster(), scenarios: [approvals()[1]] })]) {
      f.environment.SMOKE_REPLAY_APPROVAL_JSON = json; f.environment.SMOKE_REPLAY_INVENTORY_SHA256 = digest;
      await expect(admission(f)).rejects.toThrow();
    }
    f.environment.SMOKE_REPLAY_APPROVAL_JSON = encode(roster()); f.environment.SMOKE_REPLAY_INVENTORY_SHA256 = "b".repeat(64);
    await expect(admission(f)).rejects.toThrow(); expect(prepared).not.toHaveBeenCalled(); expect(f.traffic).toEqual([]);
  });
  it("fixture approval requires a completed independently imported success", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); const f = fixture();
    await expect(f.approveReplay("long")).rejects.toThrow();
    await f.signedStart("long"); await expect(f.approveReplay("long")).rejects.toThrow();
    await f.runWorkflow("long"); await expect(f.approveReplay("long")).rejects.toThrow();
    expect(f.environment.SMOKE_REPLAY_APPROVAL_JSON).toBeUndefined();
    vi.setSystemTime(Date.now() + 30_001); await f.runCron(); await expect(f.approveReplay("long")).resolves.toBeDefined();
  });
  it("fixture approval refuses current accounting corruption and preserves the prior approval", async () => {
    const f = await approved(); const previous = f.environment.SMOKE_REPLAY_APPROVAL_JSON;
    f.siteDb.database.exec("DELETE FROM quota_ledger WHERE entry_kind='accepted'");
    await expect(f.approveReplay("long")).rejects.toThrow();
    expect(f.environment.SMOKE_REPLAY_APPROVAL_JSON).toBe(previous);
  });
  it("admits all three locally completed approved identities without traffic or business mutations", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); const f = fixture();
    for (const scenario of SCENARIOS) {
      await complete(f, scenario.id); const approvedRoster = await f.approveReplay(scenario.id);
      const before = f.siteSnapshot(scenario.id); const traffic = [...f.traffic];
      const beforeSql = f.siteDb.preparedSql.length;
      const result = await admission(f, scenario.id);
      expect(result.scenario).toEqual(scenario); expect(result.run.id).toBe(before.run!.id);
      expect(result.run.packageId).toBe(before.run!.package_id);
      expect(result.execution.jobId).toBe(scenario.jobId);
      expect(result.accepted.workflowAcceptedAt).toBe(result.approval.acceptedAt);
      expect(result.approval).toEqual(approvedRoster.scenarios.find(s => s.scenarioId === scenario.id));
      expect(result.approval.receiptMetadataSha256).toBe(await smokeReplayHash(canonicalJson(result.metadata)));
      expect(result.approval.runHash).toBe(await smokeReplayHash(result.run.id));
      expect(result.approval.packageHash).toBe(await smokeReplayHash(result.run.packageId!));
      expect(f.siteSnapshot(scenario.id)).toEqual(before); expect(f.traffic).toEqual(traffic);
      expect(f.siteDb.preparedSql.slice(beforeSql).every(sql => /^\s*SELECT\b/u.test(sql))).toBe(true);
      const settledSql = f.siteDb.preparedSql.slice(beforeSql).find(sql => sql.includes("receipt_metadata_json"))!;
      expect(settledSql).toBeDefined(); expect(settledSql).not.toMatch(/candidate_json|package_json/u);
    }
    expect(parseSmokeReplayRoster(f.environment.SMOKE_REPLAY_APPROVAL_JSON, f.environment.SMOKE_REPLAY_INVENTORY_SHA256).scenarios).toHaveLength(3);
  });
  it("cannot approve or admit a failed original after-D1 identity", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); const f = fixture();
    await complete(f); await complete(f, "after-r2");
    await f.signedStart("after-d1");
    vi.setSystemTime(Date.now() + 200_000); await f.runCron();
    expect(f.siteSnapshot("after-d1").run?.state).toBe("failed");
    await expect(f.approveReplay("after-d1")).rejects.toThrow();
    f.environment.SMOKE_REPLAY_APPROVAL_JSON = encode(roster()); f.environment.SMOKE_REPLAY_INVENTORY_SHA256 = digest;
    const before = f.siteSnapshot("after-d1"); const traffic = [...f.traffic];
    await expect(admission(f, "after-d1")).rejects.toThrow();
    expect(f.siteSnapshot("after-d1")).toEqual(before); expect(f.traffic).toEqual(traffic);
  });
  it.each(["not-started", "running", "unimported"])("rejects %s even with an operator-shaped approval", async state => {
    const f = fixture();
    if (state !== "not-started") await f.signedStart("long");
    if (state === "unimported") await f.runWorkflow("long");
    f.environment.SMOKE_REPLAY_APPROVAL_JSON = encode(roster()); f.environment.SMOKE_REPLAY_INVENTORY_SHA256 = digest;
    const before = f.siteSnapshot("long"); const traffic = [...f.traffic];
    await expect(admission(f)).rejects.toThrow(); expect(f.siteSnapshot("long")).toEqual(before); expect(f.traffic).toEqual(traffic);
  });
  it.each([
    ["quota reserved missing", "DELETE FROM quota_ledger WHERE entry_kind='reserved'"],
    ["quota accepted missing", "DELETE FROM quota_ledger WHERE entry_kind='accepted'"],
    ["quota owner mismatch", "UPDATE quota_ledger SET user_id='other-owner-task15-long' WHERE entry_kind='accepted'"],
    ["quota reservation mismatch", "UPDATE quota_ledger SET reservation_id='other' WHERE entry_kind='accepted'"],
    ["quota key mismatch", "UPDATE quota_ledger SET idempotency_key='other-key' WHERE entry_kind='accepted'"],
    ["quota units mismatch", "UPDATE quota_ledger SET units=2 WHERE entry_kind='accepted'"],
    ["failed terminal", "UPDATE quota_ledger SET entry_kind='failed' WHERE entry_kind='accepted'"],
    ["rejected terminal", "UPDATE quota_ledger SET entry_kind='rejected' WHERE entry_kind='accepted'"],
    ["budget unsettled", "UPDATE ai_budget_reservations SET status='reserved',settled_micros=0"],
    ["budget amount mismatch", "UPDATE ai_budget_reservations SET settled_micros=2"],
    ["audit missing", "DELETE FROM ai_runs"],
    ["audit rejected", "UPDATE ai_runs SET status='rejected'"],
    ["audit purpose mismatch", "UPDATE ai_runs SET purpose='other'"],
    ["audit request mismatch", "UPDATE ai_runs SET request_id='other'"],
    ["package role mismatch", "UPDATE research_packages SET normalized_role_key='other'"],
    ["package locale mismatch", "UPDATE research_packages SET locale='zh-CN'"],
    ["package config mismatch", "UPDATE research_packages SET config_fingerprint='p2-00000000000000000000000000000000'"],
  ])("rejects persisted %s before traffic", async (_name, sql) => {
    const f = await approved(); f.siteDb.database.exec(sql);
    const before = f.siteSnapshot("long"); const traffic = [...f.traffic];
    await expect(admission(f)).rejects.toThrow(); expect(f.siteSnapshot("long")).toEqual(before); expect(f.traffic).toEqual(traffic);
  });
  it.each([
    ["smoke_scenarios", { owner_id: "other-owner-task15-long" }],
    ["smoke_scenarios", { mutation_id: "other" }],
    ["smoke_scenarios", { request_id: "other" }],
    ["smoke_scenarios", { job_id: SCENARIOS[1]!.jobId }],
    ["research_site_imports", { phase: 4 }],
    ["research_site_imports", { user_id: "other-owner-task15-long" }],
    ["research_site_imports", { request_id: "other" }],
    ["research_site_imports", { request_hash: "b".repeat(64) }],
    ["research_site_imports", { receipt_hash: "b".repeat(64) }],
    ["research_site_imports", { config_fingerprint: "p2-00000000000000000000000000000000" }],
    ["research_site_imports", { resolution_json: encode({ state: "ready", packageId: "other", quotaStatus: "accepted" }) }],
    ["research_site_executions", { admission_state: "closed", closed_at: 1, close_reason: "expired" }],
    ["research_site_acceptances", { workflow_accepted_at: 1 }],
    ["research_site_acceptances", { request_hash: "b".repeat(64) }],
    ["research_runs", { mutation_id: "other" }],
    ["research_runs", { active_slot: 1 }],
    ["research_runs", { retry_of_run_id: "other" }],
    ["ai_budget_reservations", { request_id: "other" }],
    ["ai_budget_reservations", { id: "other" }],
    ["ai_budget_reservations", { run_id: "other" }],
  ] as const)("rejects immutable read corruption in %s: %j", async (table, patch) => {
    const f = await approved(); const before = f.siteSnapshot("long"); const traffic = [...f.traffic];
    substituteReads(f, table, patch); await expect(admission(f)).rejects.toThrow();
    expect(f.siteSnapshot("long")).toEqual(before); expect(f.traffic).toEqual(traffic);
  });
  it.each(["smoke_scenarios", "research_runs", "research_site_executions", "research_site_imports",
    "research_site_acceptances", "research_packages", "quota_ledger", "ai_budget_reservations", "ai_runs"])("requires exact counts for %s", async table => {
    const f = await approved(); const before = f.siteSnapshot("long"); const traffic = [...f.traffic];
    substituteReads(f, table, {}, true); await expect(admission(f)).rejects.toThrow();
    expect(f.siteSnapshot("long")).toEqual(before); expect(f.traffic).toEqual(traffic);
  });
  it("matches the complete canonical receipt metadata and original grant", async () => {
    const f = await approved();
    const row = f.siteDb.database.prepare("SELECT receipt_metadata_json FROM research_site_imports").get()!;
    const metadata = JSON.parse(String(row.receipt_metadata_json));
    const traffic = [...f.traffic]; const before = f.siteSnapshot("long");
    for (const changed of [{ ...metadata, latencyMs: metadata.latencyMs + 1 },
      { ...metadata, grant: { ...metadata.grant, requestHash: "b".repeat(64) } },
      { ...metadata, grant: { ...metadata.grant, beganAt: metadata.grant.beganAt + 1,
        executionExpiresAt: metadata.grant.executionExpiresAt + 1 } },
      { ...metadata, extra: "forbidden" }]) {
      substituteReads(f, "research_site_imports", { receipt_metadata_json: encode(changed) });
      await expect(admission(f)).rejects.toThrow(); vi.restoreAllMocks();
    }
    expect(f.siteSnapshot("long")).toEqual(before); expect(f.traffic).toEqual(traffic);
  });
  it.each(["requestHash", "receiptHash", "receiptMetadataSha256", "runHash", "packageHash", "acceptedAt"])("matches approved %s", async field => {
    const f = await approved(); const v = JSON.parse(f.environment.SMOKE_REPLAY_APPROVAL_JSON!);
    v.scenarios[0][field] = field === "acceptedAt" ? 1 : "b".repeat(64);
    f.environment.SMOKE_REPLAY_APPROVAL_JSON = encode(v);
    const before = f.siteSnapshot("long"); const traffic = [...f.traffic];
    await expect(admission(f)).rejects.toThrow(); expect(f.siteSnapshot("long")).toEqual(before); expect(f.traffic).toEqual(traffic);
  });
  it("rejects at the original package expiry boundary without editing any deadlines", async () => {
    const f = await approved();
    const expiry = f.siteDb.database.prepare("SELECT expires_at FROM research_packages").get()!.expires_at as number;
    vi.setSystemTime(expiry - 1); await expect(admission(f)).resolves.toBeDefined();
    vi.setSystemTime(expiry); const before = f.siteSnapshot("long"); const traffic = [...f.traffic];
    await expect(admission(f)).rejects.toThrow(); expect(f.siteSnapshot("long")).toEqual(before); expect(f.traffic).toEqual(traffic);
    await expect(f.approveReplay("long")).rejects.toThrow();
  });
  it("also rejects package expiry according to the Site SQL clock", async () => {
    const f = await approved(); const expiry = Number(f.siteDb.database.prepare("SELECT expires_at FROM research_packages").get()!.expires_at);
    f.siteDb.database.function("unixepoch", { varargs: true }, () => expiry / 1000);
    await expect(admission(f)).rejects.toThrow();
  });
  it("fences an expired scope before any SQL and stops after a delayed read", async () => {
    const f = await approved(); const prepared = vi.spyOn(f.siteDb, "prepare");
    const scope = new PublicOperationScope(() => performance.now()); scope.finish();
    await expect(requireSmokeReplayAdmission({ environment: f.environment, scenarioId: "long", scope })).rejects.toThrow();
    expect(prepared).not.toHaveBeenCalled(); vi.restoreAllMocks();
    const barrier = createD1OperationBarrier(f.siteDb as unknown as D1Database, sql => sql.includes("idempotency_records"));
    f.environment.SMOKE_SITE_DB = barrier.db; vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = admission(f); const rejection = expect(pending).rejects.toThrow();
    await barrier.entered; await vi.advanceTimersByTimeAsync(4500); await rejection;
    barrier.expire(); barrier.release(); await new Promise<void>(resolve => setImmediate(resolve));
    expect(barrier.lateStarts()).toBe(0);
  });
});
