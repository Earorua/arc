// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { copyFile, mkdir, readdir, readFile, writeFile, rename } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { signBridgeMessage, verifyBridgeMessage } from "../../app/server/research/executor/auth";
import { build } from "esbuild";
import { SCENARIOS } from "../../worker/research-executor-smoke/scenarios";
import { SMOKE_REPLAY_STEPS, type SmokeReplayApproval, type SmokeReplayStep } from "../../worker/research-executor-smoke/replay-contract";
import { createNativeResearchCloudSmokeFixture, runNativeSmokeSuite, snapshotState } from "../helpers/research-cloud-smoke-fixture";

vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, rename: vi.fn(actual.rename) };
});
vi.mock("esbuild", async importOriginal => {
  const actual = await importOriginal<typeof import("esbuild")>();
  return { ...actual, build: vi.fn(actual.build) };
});

describe("built native smoke composition", () => {
  it("starts through the signed paired binding chain and persists actual acceptance", async () => {
    const buildPath = "../../scripts/build-research-executor-smoke.mjs";
    const { buildSmoke } = await import(buildPath);
    const build = await buildSmoke({ profile: "local", reportName: `t15p4-native-${Date.now()}` });
    const report = await runNativeSmokeSuite({ executor: build.executor.output, site: build.site.output });
    expect(report.status).toBe("passed");
    expect(report.scenarios.map(value => value.scenarioId)).toEqual(["long", "after-r2", "after-d1"]);
    expect(report.scenarios.slice(1).every(value => value.reopened && value.imported.importPhase === 5)).toBe(true);
    for (const scenario of report.scenarios) {
      expect(scenario.replaySteps.map(value => value.step)).toEqual(SMOKE_REPLAY_STEPS);
      expect(scenario.replaySteps.every(value => value.completed)).toBe(true);
      expect(scenario.replaySteps.slice(4)).toEqual(["owner-b-recover", "owner-b-get"].map(step => ({
        schemaVersion: "arc-smoke-replay-v1", scenarioId: scenario.scenarioId, step, completed: true, isNull: true,
      })));
      expect(scenario.wrongOwnerHidden).toBe(true); expect(scenario.originalMutationRecovered).toBe(true);
      expect(scenario.approval.scenarios.find(value => value.scenarioId === scenario.scenarioId)).toMatchObject({
        receiptMetadataSha256: scenario.beforeReplay.siteReceiptMetadataSha256,
        acceptedAt: scenario.beforeReplay.acceptedAt,
      });
      expect(scenario.approvalEvidenceJson).toBeTypeOf("string");
      expect(createHash("sha256").update(Buffer.from(scenario.approvalEvidenceJson, "utf8")).digest("hex"))
        .toBe(scenario.approval.nativeEvidenceSha256);
      const retained = JSON.parse(scenario.approvalEvidenceJson) as { schemaVersion: string; scenarios: Array<typeof scenario.beforeReplay> };
      expect(retained.schemaVersion).toBe("arc-smoke-native-replay-evidence-v1");
      expect(retained.scenarios.map(value => value.scenarioId)).toEqual(scenario.approval.scenarios.map(value => value.scenarioId));
      for (const observation of retained.scenarios) {
        const original = report.scenarios.find(value => value.scenarioId === observation.scenarioId)!;
        expect(snapshotState(observation)).toEqual(snapshotState(original.beforeReplay));
        expect(observation.observedAt).toBeGreaterThanOrEqual(original.beforeReplay.observedAt);
        expect(Object.keys(observation.observations).sort()).toEqual(Object.keys(original.beforeReplay.observations).sort());
        expect(scenario.approval.scenarios.find(value => value.scenarioId === observation.scenarioId)).toMatchObject({
          jobId: observation.jobId, requestHash: observation.requestHash, receiptHash: observation.receiptHash,
          receiptMetadataSha256: observation.siteReceiptMetadataSha256, runHash: observation.runHash,
          packageHash: observation.packageHash, acceptedAt: observation.acceptedAt,
          beganAt: observation.beganAt, executionExpiresAt: observation.executionExpiresAt,
        });
        if (observation.scenarioId !== scenario.scenarioId) {
          const earlier = JSON.parse(original.approvalEvidenceJson) as typeof retained;
          expect(observation).toEqual(earlier.scenarios.find(value => value.scenarioId === observation.scenarioId));
        }
      }
      for (const snapshot of [scenario.gap, scenario.imported, scenario.beforeReplay, scenario.final]) {
        expect(snapshot.observedAt).toEqual(expect.any(Number));
        for (const name of ["job", "run", "execution", "import", "accounting", "receipt", "workflowStatus"]) {
          expect(snapshot.observations[name]).toMatchObject({ startedAt: expect.any(Number), completedAt: expect.any(Number) });
          expect(snapshot.observations[name]!.completedAt).toBeGreaterThanOrEqual(snapshot.observations[name]!.startedAt);
        }
        const state = snapshotState(snapshot);
        expect(Object.keys(state).sort()).toEqual(Object.keys(snapshot).filter(key => !["observedAt", "observations"].includes(key)).sort());
      }
    }
    expect(report.outboundAttempts).toBe(0);
  }, 180_000); // Suite startup + three independent 60s terminal bounds + genuine 30s Cron lease, no product clock changes.
  it("rejects absent and wrong approvals on a separate built pair and retains nonce protection after restart", async () => {
    const buildPath = "../../scripts/build-research-executor-smoke.mjs";
    const { buildSmoke } = await import(buildPath);
    const build = await buildSmoke({ profile: "local", reportName: `t15-replay-negative-${Date.now()}` });
    const f = await createNativeResearchCloudSmokeFixture({ executor: build.executor.output, site: build.site.output });
    try {
      expect(f.approveReplay).toBeTypeOf("function"); expect(f.replayStep).toBeTypeOf("function");
      await expect(f.approveReplay("long")).rejects.toThrow(/settled/u);
      const request = await f.makeRequest("replay", "long", "submit");
      const response = await f.dispatch(request.clone());
      expect(await f.verifyResponse(request, response.clone())).toMatchObject({ status: 503, body: { code: "unavailable" } });
      const empty = await f.snapshot("long");
      await f.reopen();
      expect(await f.verifyResponse(request, await f.dispatch(request.clone()))).toMatchObject({ status: 401 });
      await expect(f.verifyResponse(request, response.clone())).rejects.toThrow();
      expect(snapshotState(await f.snapshot("long"))).toEqual(snapshotState(empty));
      await f.start("long"); await f.waitForWorkflowTerminal("long");
      const settled = await f.snapshot("long");
      expect(settled.importPhase).toBe(5);
      // Missing approval must remain unavailable even for a successfully settled scenario.
      await expect(f.replayStep("long", "submit")).rejects.toThrow(/unavailable/u);
      const roster = await f.approveReplay("long");
      expect(f.approvalEvidence).toBeTypeOf("function");
      const originalEvidence = f.approvalEvidence(roster.nativeEvidenceSha256);
      const repeatedRoster = await f.approveReplay("long");
      const replacementEvidence = f.approvalEvidence(repeatedRoster.nativeEvidenceSha256);
      expect(createHash("sha256").update(Buffer.from(originalEvidence, "utf8")).digest("hex")).toBe(roster.nativeEvidenceSha256);
      expect(createHash("sha256").update(Buffer.from(replacementEvidence, "utf8")).digest("hex")).toBe(repeatedRoster.nativeEvidenceSha256);
      const originalRecord = JSON.parse(originalEvidence) as { scenarios: Array<{ scenarioId: string; observedAt: number; observations: Record<string, unknown> }> };
      const replacementRecord = JSON.parse(replacementEvidence) as typeof originalRecord;
      expect(replacementRecord.scenarios.map(value => value.scenarioId)).toEqual(repeatedRoster.scenarios.map(value => value.scenarioId));
      expect(replacementRecord.scenarios).toHaveLength(1);
      expect(replacementRecord.scenarios[0]!.observedAt).toBeGreaterThan(originalRecord.scenarios[0]!.observedAt);
      expect(repeatedRoster.nativeEvidenceSha256).not.toBe(roster.nativeEvidenceSha256);
      replacementRecord.scenarios[0]!.observations = {};
      expect(f.approvalEvidence(repeatedRoster.nativeEvidenceSha256)).toBe(replacementEvidence);
      expect(f.approvalEvidence(roster.nativeEvidenceSha256)).toBe(originalEvidence);
      const wrongRoster = { ...roster, scenarios: roster.scenarios.map(value => ({ ...value, requestHash: "0".repeat(64) })) };
      await f.reopen({ SMOKE_REPLAY_APPROVAL_JSON: JSON.stringify(wrongRoster), SMOKE_REPLAY_INVENTORY_SHA256: roster.inventorySha256 });
      await expect(f.replayStep("long", "submit")).rejects.toThrow(/unavailable/u);
      expect(snapshotState(await f.snapshot("long"))).toEqual(snapshotState(settled));
      expect(f.egress()).toBe(0);
    } finally { await f.dispose(); }
  }, 90_000);
});

describe("bounded operator driver", () => {
  let sequence = 0;
  const name = () => `t15p4-driver-${Date.now()}-${sequence++}`;
  const driver = async () => { const path = "../../scripts/test-research-cloud-smoke.mjs"; return (await import(path)).runSmokeDriver; };
  const input = () => ({ isTTY: false, read: async () => new TextEncoder().encode("33".repeat(32)) });
  let artifactPromise: Promise<unknown> | undefined;
  const setup = async () => {
    const buildPath = "../../scripts/build-research-executor-smoke.mjs";
    const { buildSmoke } = await import(buildPath);
    const artifact = await (artifactPromise ??= buildSmoke({ profile: "cloud", reportName: name() })) as Awaited<ReturnType<typeof buildSmoke>>;
    const directory = resolve("outputs/local-durable-executor-20260914/task15-smoke", name()); await mkdir(directory);
    const accountId = randomUUID().replaceAll("-", "");
    const inventory = { schemaVersion: "arc-smoke-isolation-v1", verified: true, isolated: true, verifiedAt: Date.now(), accountId,
      controlOrigin: "https://smoke.example.test", controlKeyId: "synthetic-control", artifactReportSha256: createHash("sha256").update(await readFile(artifact.report)).digest("hex"),
      resources: {
        siteWorker: { id: "site-id", name: "site-worker", revision: "site-revision", artifactSha256: artifact.site.sha256, entry: artifact.site.output, peerId: "executor-id" },
        executorWorker: { id: "executor-id", name: "executor-worker", revision: "executor-revision", artifactSha256: artifact.executor.sha256, entry: artifact.executor.output, peerId: "site-id", public: false },
        siteD1: { id: "site-db-id", name: "site-db" }, executorD1: { id: "executor-db-id", name: "executor-db" },
        receipts: { id: "receipts-id", name: "receipts-bucket", private: true }, workflow: { id: "workflow-id", name: "research-workflow", workerId: "executor-id" },
      } };
    const inventoryPath = resolve(directory, "inventory.json");
    const save = () => writeFile(inventoryPath, JSON.stringify(inventory)); await save();
    const approvalPath = resolve(directory, "approval.json");
    const roster = { schemaVersion: "arc-smoke-replay-approval-v1", inventorySha256: createHash("sha256").update(await readFile(inventoryPath)).digest("hex"),
      nativeEvidenceSha256: "e".repeat(64), scenarios: [{ scenarioId: "long", jobId: SCENARIOS[0]!.jobId,
        requestHash: "a".repeat(64), receiptHash: "b".repeat(64), receiptMetadataSha256: "c".repeat(64), runHash: "d".repeat(64),
        packageHash: "f".repeat(64), acceptedAt: 1000, beganAt: 2000, executionExpiresAt: 1_262_000 }] };
    const saveApproval = () => writeFile(approvalPath, JSON.stringify(roster)); await saveApproval();
    const args = (mode = "status") => [mode, "--inventory", inventoryPath, "--artifact-report", artifact.report, "--scenario", "long", "--report-name", name(),
      ...(mode === "replay" ? ["--approval", approvalPath] : [])];
    return { args, inventory, inventoryPath, artifact, save, approvalPath, roster, saveApproval };
  };
  const reply = async (request: Request, body: unknown, status = 200) => {
    const bytes = new TextEncoder().encode(JSON.stringify(body));
    const headers = await signBridgeMessage({ context: { direction: "executor-to-site", kind: "response", method: "POST",
      path: new URL(request.url).pathname, audience: new URL(request.url).origin, jobId: "collection", status },
      body: bytes, keyId: "synthetic-control", keyBytes: new Uint8Array(32).fill(0x33), now: Date.now });
    return new Response(bytes, { status, headers });
  };
  const accepted = () => ({ scenarioId: "long", state: "researching", jobId: SCENARIOS[0]!.jobId,
    requestHash: "a".repeat(64), acceptedAt: Date.now(), backgroundAccepted: true, secret: "never-echo-this", content: "candidate-never-echo" });
  const replayReply = (step: SmokeReplayStep, approved: Omit<SmokeReplayApproval, "scenarioId"> & { scenarioId: string }) => {
    const common = { schemaVersion: "arc-smoke-replay-v1", scenarioId: approved.scenarioId, step, completed: true };
    if (step.startsWith("owner-b")) return { ...common, isNull: true };
    const identity = { jobId: approved.jobId, requestHash: approved.requestHash, runHash: approved.runHash, packageHash: approved.packageHash };
    if (step.startsWith("owner-a")) return { ...common, identity, checks: { approvalMatched: true, settled: true,
      runMatched: true, packageMatched: true, ready: true, backgroundAccepted: true } };
    return { ...common, identity, original: { acceptedAt: approved.acceptedAt, beganAt: approved.beganAt,
      executionExpiresAt: approved.executionExpiresAt, queueExpiresAt: 900_000 }, receipt: { receiptHash: approved.receiptHash,
      metadataSha256: approved.receiptMetadataSha256, bodyState: "available" }, checks: { approvalMatched: true, settled: true,
      acceptedProofMatched: true, grantMatched: true, receiptMatched: true } };
  };
  it("replays six fixed signed steps from one pre-existing approval without claiming new acceptance", async () => {
    const f = await setup(); const run = await driver(); const requests: Request[] = []; const bodies: unknown[] = [];
    const approvalBefore = await readFile(f.approvalPath);
    const transport = vi.fn(async (request: Request) => {
      requests.push(request); const body = await request.json() as { step: SmokeReplayStep }; bodies.push(body);
      return reply(request, replayReply(body.step, f.roster.scenarios[0]!));
    });
    const result = await run(f.args("replay"), { transport, input: input() });
    expect(result).toMatchObject({ status: "passed", accepted: false, scenarioId: "long", lastCompletedStep: "owner-b-get", cloudElapsedProved: false });
    expect(bodies).toEqual(SMOKE_REPLAY_STEPS.map(step => ({ scenarioId: "long", step })));
    expect(requests.map(request => new URL(request.url).pathname)).toEqual(SMOKE_REPLAY_STEPS.map(() => "/_smoke/replay"));
    expect(new Set(requests.map(request => request.headers.get("x-arc-bridge-nonce"))).size).toBe(6);
    expect(requests.every(request => request.redirect === "error" && new URL(request.url).origin === f.inventory.controlOrigin)).toBe(true);
    expect(result.steps.map((value: { step: string }) => value.step)).toEqual(SMOKE_REPLAY_STEPS);
    expect(result).toMatchObject({ inventorySha256: f.roster.inventorySha256, nativeEvidenceSha256: f.roster.nativeEvidenceSha256,
      approvalFileSha256: createHash("sha256").update(approvalBefore).digest("hex") });
    expect(await readFile(f.approvalPath)).toEqual(approvalBefore);
    for (let index = 0; index < 6; index++) expect(JSON.parse(await readFile(resolve(result.report, "..", `step-${index + 1}.json`), "utf8")))
      .toMatchObject({ step: SMOKE_REPLAY_STEPS[index], result: "completed" });
  }, 30_000);
  it.each(SMOKE_REPLAY_STEPS)("stops at %s on a signed rejection and retains preceding evidence", async stopped => {
    const f = await setup(); const run = await driver(); const position = SMOKE_REPLAY_STEPS.indexOf(stopped);
    const transport = vi.fn(async (request: Request) => {
      const { step } = await request.json() as { step: SmokeReplayStep };
      return reply(request, step === stopped ? { code: "unavailable" } : replayReply(step, f.roster.scenarios[0]!), step === stopped ? 409 : 200);
    });
    const result = await run(f.args("replay"), { transport, input: input() });
    expect(result).toMatchObject({ status: "rejected", accepted: false, lastCompletedStep: SMOKE_REPLAY_STEPS[position - 1] ?? null });
    expect(transport).toHaveBeenCalledTimes(position + 1);
    expect(result.steps.slice(0, -1).map((value: { step: string }) => value.step)).toEqual(SMOKE_REPLAY_STEPS.slice(0, position));
    expect(result.steps.at(-1)).toMatchObject({ step: stopped, result: "rejected", httpStatus: 409 });
  }, 30_000);
  it("clears redirected input bytes on successful and malformed decoding", async () => {
    const f = await setup(); const run = await driver();
    for (const source of ["33".repeat(32), "bad-secret-never-echo", "33".repeat(34)]) {
      const bytes = Buffer.from(source); const transport = vi.fn((request: Request) => reply(request, accepted()));
      const result = await run(f.args(), { transport, input: { isTTY: false, read: async () => bytes } });
      expect(result.status).toBe(source.length === 64 ? "accepted" : "refused");
      expect(bytes.every(byte => byte === 0)).toBe(true);
    }
  }, 30_000);
  it.each(SMOKE_REPLAY_STEPS.flatMap(step => ["throw", "unsigned", "oversize", "wrong-step", "timeout"].map(fault => ({ step, fault }))))
    ("stops at $step for $fault without fallback or duplicate requests", async ({ step: stopped, fault }) => {
      const f = await setup(); const run = await driver(); const position = SMOKE_REPLAY_STEPS.indexOf(stopped); const args = f.args("replay");
      const directory = resolve("outputs/local-durable-executor-20260914/task15-smoke", args[8]!);
      let signal: AbortSignal | undefined;
      const transport = vi.fn(async (request: Request) => {
        const { step } = await request.json() as { step: SmokeReplayStep };
        const index = SMOKE_REPLAY_STEPS.indexOf(step);
        if (index > 0) expect(JSON.parse(await readFile(resolve(directory, `step-${index}.json`), "utf8"))).toMatchObject({ result: "completed" });
        if (step !== stopped) return reply(request, replayReply(step, f.roster.scenarios[0]!));
        if (fault === "throw") throw Error("secret-never-echo candidate-never-echo");
        if (fault === "unsigned") return Response.json(replayReply(step, f.roster.scenarios[0]!));
        if (fault === "oversize") return reply(request, { content: "secret-never-echo".repeat(400) });
        if (fault === "timeout") { signal = request.signal; return new Promise<Response>(() => undefined); }
        return reply(request, replayReply(SMOKE_REPLAY_STEPS[(index + 1) % 6]!, f.roster.scenarios[0]!));
      });
      const result = await run(args, { transport, input: input() });
      expect(result).toMatchObject({ status: "unknown", accepted: false, lastCompletedStep: SMOKE_REPLAY_STEPS[position - 1] ?? null });
      expect(transport).toHaveBeenCalledTimes(position + 1);
      expect(result.steps).toHaveLength(position + 1);
      expect(result.steps.slice(0, position).every((value: { result: string }) => value.result === "completed")).toBe(true);
      if (fault === "timeout") expect(signal?.aborted).toBe(true);
      for (const file of (await readdir(directory)).filter(file => file.endsWith(".json"))) {
        const text = await readFile(resolve(directory, file), "utf8"); expect(text).not.toContain("secret-never-echo"); expect(text).not.toContain("candidate-never-echo");
      }
    }, 15_000);
  it("refuses malformed approvals and unapproved scenarios before reading input", async () => {
    const f = await setup(); const run = await driver(); const read = vi.fn(input().read); const transport = vi.fn();
    const original = JSON.stringify(f.roster);
    for (const content of ["{}", "x".repeat(4097), JSON.stringify({ ...f.roster, inventorySha256: "0".repeat(64) }),
      JSON.stringify({ ...f.roster, secret: "secret-never-echo" }), JSON.stringify({ ...f.roster, scenarios: [] })]) {
      await writeFile(f.approvalPath, content);
      expect(await run(f.args("replay"), { input: { isTTY: false, read }, transport })).toMatchObject({ status: "refused", code: "approval-invalid" });
    }
    await writeFile(f.approvalPath, original);
    const unapproved = f.args("replay"); unapproved[6] = "after-r2";
    expect((await run(unapproved, { input: { isTTY: false, read }, transport })).status).toBe("refused");
    const missing = f.args("replay"); missing[10] = `${f.approvalPath}.missing`;
    expect((await run(missing, { input: { isTTY: false, read }, transport })).status).toBe("refused");
    // Even whitespace changes to the inventory invalidate the exact-byte approval digest.
    await writeFile(f.inventoryPath, `${JSON.stringify(f.inventory)}\n`);
    expect((await run(f.args("replay"), { input: { isTTY: false, read }, transport })).status).toBe("refused");
    expect(read).not.toHaveBeenCalled(); expect(transport).not.toHaveBeenCalled();
  }, 30_000);
  it("refuses arbitrary replay controls and approval in other modes before input", async () => {
    const f = await setup(); const run = await driver(); const read = vi.fn(input().read); const transport = vi.fn();
    for (const flag of ["--step", "--url", "--owner", "--job", "--run", "--duration", "--retries", "--secret", "--unknown"]) {
      expect((await run([...f.args("replay"), flag, "secret-never-echo"], { input: { isTTY: false, read }, transport })).status).toBe("refused");
    }
    for (const args of [f.args("replay").slice(0, -2), [...f.args("status"), "--approval", f.approvalPath], [...f.args("start"), "--approval", f.approvalPath]]) {
      expect((await run(args, { input: { isTTY: false, read }, transport })).status).toBe("refused");
    }
    expect(read).not.toHaveBeenCalled(); expect(transport).not.toHaveBeenCalled();
  }, 30_000);
  it.each(["identity", "time", "receipt", "queue", "scenario", "unknown-field", "capability", "isolation"])
    ("rejects a signed %s mismatch with safe evidence", async fault => {
      const f = await setup(); const run = await driver(); let calls = 0;
      const transport = vi.fn(async (request: Request) => {
        const { step } = await request.json() as { step: SmokeReplayStep }; calls++;
        const body = replayReply(step, f.roster.scenarios[0]!);
        if (calls === (fault === "isolation" ? 5 : 2)) {
          if (fault === "identity" && "identity" in body) body.identity.requestHash = "0".repeat(64);
          if (fault === "time" && "original" in body) body.original.acceptedAt++;
          if (fault === "receipt" && "receipt" in body) body.receipt.receiptHash = "0".repeat(64);
          if (fault === "queue" && "original" in body) body.original.queueExpiresAt++;
          if (fault === "scenario") body.scenarioId = "after-r2";
          if (fault === "unknown-field") Object.assign(body, { secret: "secret-never-echo", content: "candidate-never-echo" });
          if (fault === "capability") Object.assign(body, { ownerId: "secret-never-echo", jobId: "candidate-never-echo" });
          if (fault === "isolation") Object.assign(body, { completed: false, isNull: false });
        }
        return reply(request, body);
      });
      const result = await run(f.args("replay"), { transport, input: input() });
      expect(result.status).toBe(fault === "isolation" ? "failed" : "unknown");
      expect(transport).toHaveBeenCalledTimes(fault === "isolation" ? 5 : 2);
      expect(JSON.stringify(result)).not.toMatch(/secret-never-echo|candidate-never-echo/u);
      for (const file of (await readdir(resolve(result.report, ".."))).filter(file => file.endsWith(".json"))) {
        expect(await readFile(resolve(result.report, "..", file), "utf8")).not.toMatch(/secret-never-echo|candidate-never-echo/u);
      }
    }, 30_000);
  it.each([400, 401, 409, 500, 503, 302])("classifies a production-signed HTTP %s without a retry", async status => {
    const f = await setup(); const run = await driver();
    const transport = vi.fn((request: Request) => reply(request, { secret: "secret-never-echo" }, status));
    const result = await run(f.args("replay"), { transport, input: input() });
    expect(result).toMatchObject({ status: [400, 401, 409].includes(status) ? "rejected" : "unknown", lastCompletedStep: null, accepted: false });
    expect(transport).toHaveBeenCalledTimes(1); expect(JSON.stringify(result)).not.toContain("secret-never-echo");
  }, 30_000);
  it("rejects a reused response nonce across replay invocations before the next step", async () => {
    const f = await setup(); const run = await driver(); let cached: Response | undefined;
    const transport = vi.fn(async (request: Request) => {
      const { step } = await request.json() as { step: SmokeReplayStep };
      if (step === "submit") { cached ??= await reply(request, replayReply(step, f.roster.scenarios[0]!)); return cached.clone(); }
      return reply(request, replayReply(step, f.roster.scenarios[0]!));
    });
    expect((await run(f.args("replay"), { transport, input: input() })).status).toBe("passed");
    expect(await run(f.args("replay"), { transport, input: input() })).toMatchObject({ status: "unknown", lastCompletedStep: null });
    expect(transport).toHaveBeenCalledTimes(7);
  }, 30_000);
  it.each(["step", "report"])("retains validated steps after %s persistence fails and erases the allocated signing key", async failure => {
    const f = await setup(); const run = await driver(); const args = f.args("replay");
    const directory = resolve("outputs/local-durable-executor-20260914/task15-smoke", args[8]!);
    const keys: Uint8Array[] = []; const from = Uint8Array.from.bind(Uint8Array);
    const allocation = vi.spyOn(Uint8Array, "from").mockImplementation((...values: Parameters<typeof Uint8Array.from>) => {
      const bytes = from(...values); if (bytes.length === 32 && bytes.every(byte => byte === 0x33)) keys.push(bytes); return bytes;
    });
    const transport = vi.fn(async (request: Request) => {
      const { step } = await request.json() as { step: SmokeReplayStep };
      if (step === "owner-a-recover") await mkdir(resolve(directory, failure === "step" ? "step-3.json" : "report.json"));
      return reply(request, replayReply(step, f.roster.scenarios[0]!));
    });
    try {
      const result = await run(args, { transport, input: input() });
      expect(result).toMatchObject({ status: "refused", lastCompletedStep: failure === "step" ? "owner-a-recover" : "owner-b-get" });
      expect(result.steps).toHaveLength(failure === "step" ? 3 : 6); expect(transport).toHaveBeenCalledTimes(failure === "step" ? 3 : 6);
      expect(keys).toHaveLength(1); expect(keys[0]!.every(byte => byte === 0)).toBe(true);
      expect(JSON.parse(await readFile(resolve(directory, "failure.json"), "utf8"))).toMatchObject(result);
    } finally { allocation.mockRestore(); }
  }, 30_000);
  it.each(["authentication", "nonce persistence"])("never resumes after late %s completion", async boundary => {
    const f = await setup(); const run = await driver(); let release: (() => void) | undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const originalVerify = crypto.subtle.verify.bind(crypto.subtle);
    const originalRename = vi.mocked(rename).getMockImplementation()!;
    const verify = boundary === "authentication" ? vi.spyOn(crypto.subtle, "verify").mockImplementationOnce(async (...args) => {
      await gate; return originalVerify(...args);
    }) : null;
    if (boundary === "nonce persistence") vi.mocked(rename).mockImplementationOnce(async (...args) => { await gate; return originalRename(...args); });
    const transport = vi.fn(async (request: Request) => reply(request, replayReply("submit", f.roster.scenarios[0]!)));
    try {
      const began = performance.now(); const result = await run(f.args("replay"), { transport, input: input() });
      expect(result).toMatchObject({ status: "unknown", lastCompletedStep: null }); expect(performance.now() - began).toBeLessThan(8000);
      release!(); await new Promise(resolve => setTimeout(resolve, 50)); expect(transport).toHaveBeenCalledTimes(1);
    } finally { release!(); verify?.mockRestore(); }
  }, 15_000);
  it.each(["success", "rejection", "transport"])("erases the signing key after replay %s", async outcome => {
    const f = await setup(); const run = await driver(); const keys: Uint8Array[] = [];
    const from = Uint8Array.from.bind(Uint8Array);
    const allocation = vi.spyOn(Uint8Array, "from").mockImplementation((...values: Parameters<typeof Uint8Array.from>) => {
      const bytes = from(...values); if (bytes.length === 32 && bytes.every(byte => byte === 0x33)) keys.push(bytes); return bytes;
    });
    let verifiedRequestKey = false;
    const transport = vi.fn(async (request: Request) => {
      const bytes = new Uint8Array(await request.clone().arrayBuffer());
      await verifyBridgeMessage({ context: { direction: "executor-to-site", kind: "request", method: "POST", path: "/_smoke/replay",
        audience: f.inventory.controlOrigin, jobId: "collection", status: null }, body: bytes, headers: request.headers,
        keyId: f.inventory.controlKeyId, keyBytes: keys[0]!, now: Date.now, nonces: { claim: async () => true } });
      verifiedRequestKey = true;
      if (outcome === "transport") throw Error("secret-never-echo");
      const { step } = await request.json() as { step: SmokeReplayStep };
      return reply(request, outcome === "rejection" ? {} : replayReply(step, f.roster.scenarios[0]!), outcome === "rejection" ? 401 : 200);
    });
    try {
      const result = await run(f.args("replay"), { transport, input: input() });
      expect(result.status).toBe({ success: "passed", rejection: "rejected", transport: "unknown" }[outcome]);
      expect(verifiedRequestKey).toBe(true); expect(keys).toHaveLength(1); expect(keys[0]!.every(byte => byte === 0)).toBe(true);
    } finally { allocation.mockRestore(); }
  }, 30_000);
  it.each(["helper", "reused directory", "setup"])("does not read credentials when %s setup fails", async failure => {
    const f = await setup(); const run = await driver(); const read = vi.fn(input().read); const transport = vi.fn();
    const args = f.args("replay");
    if (failure === "helper") vi.mocked(build).mockRejectedValueOnce(Error("secret-never-echo"));
    if (failure === "reused directory") await mkdir(resolve("outputs/local-durable-executor-20260914/task15-smoke", args[8]!));
    if (failure === "setup") args[2] = `${f.inventoryPath}.missing`;
    expect(await run(args, { transport, input: { isTTY: false, read } })).toMatchObject({ status: "refused", lastCompletedStep: null, steps: [] });
    expect(read).not.toHaveBeenCalled(); expect(transport).not.toHaveBeenCalled();
  }, 30_000);
  it("never persists caller-supplied error codes from credential failures", async () => {
    const f = await setup(); const run = await driver(); const args = f.args("replay");
    const result = await run(args, { input: { isTTY: false, read: async () => { throw Object.assign(Error(), { safeCode: "secret-never-echo" }); } } });
    expect(result).toMatchObject({ status: "refused", code: "operation-unavailable" });
    expect(await readFile(resolve("outputs/local-durable-executor-20260914/task15-smoke", args[8]!, "failure.json"), "utf8")).not.toContain("secret-never-echo");
  }, 30_000);
  it("refuses missing inventory and secret arguments before transport", async () => {
    const path = "../../scripts/test-research-cloud-smoke.mjs";
    const { runSmokeDriver } = await import(path);
    const transport = vi.fn(() => { throw Error("Network forbidden"); });
    const result = await runSmokeDriver(["start", "--scenario", "long", "--secret", "33".repeat(32)], { transport });
    expect(result.status).toBe("refused");
    expect(JSON.stringify(result)).not.toContain("33".repeat(32));
    expect(transport).not.toHaveBeenCalled();
  });
  it("rejects malformed/missing inventory, a local/source artifact and hash mismatch without transport", async () => {
    const f = await setup(); const run = await driver(); const transport = vi.fn();
    const bad = f.args(); bad[2] = `${f.inventoryPath}.missing`;
    expect((await run(bad, { transport, input: input() })).status).toBe("refused");
    const original = structuredClone(f.inventory);
    await writeFile(f.inventoryPath, "{}");
    expect((await run(f.args(), { transport, input: input() })).status).toBe("refused");
    Object.assign(f.inventory, original); f.inventory.resources.siteWorker.entry = "worker/research-executor-smoke/site-entry.ts"; await f.save();
    expect((await run(f.args(), { transport, input: input() })).status).toBe("refused");
    f.inventory.resources.siteWorker.entry = original.resources.siteWorker.entry;
    f.inventory.resources.executorWorker.artifactSha256 = "f".repeat(64); await f.save();
    expect((await run(f.args(), { transport, input: input() })).status).toBe("refused");
    const local = f.args(); local[4] = "outputs/local-durable-executor-20260914/task15-smoke/build/local/task15-short-local-artifact/report.json";
    expect((await run(local, { transport, input: input() })).status).toBe("refused");
    expect(transport).not.toHaveBeenCalled();
  }, 30_000);
  it("requires bounded redirected input and refuses unknown scenarios and unsigned responses", async () => {
    const f = await setup(); const run = await driver(); const transport = vi.fn(async () => Response.json(accepted()));
    for (const channel of [{ isTTY: true, read: input().read }, { isTTY: false, read: async () => new Uint8Array() },
      { isTTY: false, read: async () => new TextEncoder().encode("33".repeat(33)) }]) {
      expect((await run(f.args(), { transport, input: channel })).status).toBe("refused");
    }
    const unknown = f.args(); unknown[6] = "unknown";
    expect((await run(unknown, { transport, input: input() })).status).toBe("refused");
    expect(transport).not.toHaveBeenCalled();
    expect(await run(f.args(), { transport, input: input() })).toMatchObject({ status: "refused", code: "response-authentication" });
    expect(transport).toHaveBeenCalledTimes(1);
  }, 30_000);
  it("verifies one bounded status and persists response nonce rejection across invocations", async () => {
    const f = await setup(); const run = await driver(); let cached: Response | undefined;
    const transport = vi.fn(async (request: Request) => { cached ??= await reply(request, accepted()); return cached.clone(); });
    const result = await run(f.args(), { transport, input: input() });
    expect(result).toMatchObject({ status: "accepted", accepted: true, cloudElapsedProved: false });
    expect(JSON.stringify(result)).not.toContain("never-echo");
    expect(transport).toHaveBeenCalledTimes(1);
    expect(await run(f.args(), { transport, input: input() })).toMatchObject({ status: "refused", code: "response-authentication" });
    expect(transport).toHaveBeenCalledTimes(2);
  }, 30_000);
  it("reconciles the same start identity, and labels ambiguous transport results pending", async () => {
    const f = await setup(); const run = await driver(); const paths: string[] = []; const bodies: unknown[] = [];
    const transport = vi.fn(async (request: Request) => { paths.push(new URL(request.url).pathname); bodies.push(await request.json());
      return reply(request, paths.length === 1 ? { scenarioId: "long", state: "initializing", backgroundAccepted: false } : accepted()); });
    expect(await run(f.args("start"), { transport, input: input() })).toMatchObject({ status: "accepted", accepted: true });
    expect(paths).toEqual(["/_smoke/start", "/_smoke/status"]); expect(bodies).toEqual([{ scenarioId: "long" }, { scenarioId: "long" }]);
    const failed = vi.fn(async () => { throw Error("Synthetic ambiguous timeout secret-never-echo"); });
    const pending = await run(f.args("start"), { transport: failed, input: input() });
    expect(pending).toMatchObject({ status: "pending", accepted: false, scenarioId: "long" });
    expect(failed).toHaveBeenCalledTimes(3); expect(JSON.stringify(pending)).not.toContain("secret-never-echo");
    expect(await run(f.args("start"), { transport: (request: Request) => reply(request, { code: "unavailable" }, 409), input: input() }))
      .toMatchObject({ status: "rejected", accepted: false, httpStatus: 409 });
  }, 30_000);
  it("aborts an unresponsive start within ten seconds without claiming acceptance", async () => {
    const f = await setup(); const run = await driver(); let signal: AbortSignal | undefined;
    const transport = vi.fn((request: Request) => { signal = request.signal; return new Promise<Response>(() => undefined); });
    const began = performance.now();
    const report = await run(f.args("start"), { transport, input: input() });
    expect(report).toMatchObject({ status: "pending", accepted: false, reason: "acceptance-unknown" });
    expect(signal?.aborted).toBe(true); expect(transport).toHaveBeenCalledTimes(1);
    expect(performance.now() - began).toBeLessThan(15_000);
  }, 30_000);
  it("refuses an acceptance body whose durable proof belongs to another scenario", async () => {
    const f = await setup(); const run = await driver();
    const transport = vi.fn((request: Request) => reply(request, { ...accepted(), jobId: SCENARIOS[1]!.jobId }));
    expect(await run(f.args(), { transport, input: input() })).toMatchObject({ status: "refused", accepted: false, code: "response-identity" });
    expect(transport).toHaveBeenCalledTimes(1);
  }, 30_000);
  it("rejects a digest-pinned artifact report that lost its sealed build verification", async () => {
    const f = await setup(); const run = await driver();
    const directory = resolve("outputs/local-durable-executor-20260914/task15-smoke/build/cloud", name()); await mkdir(directory);
    const candidate = structuredClone(f.artifact); candidate.aliasEdges = [];
    candidate.report = resolve(directory, "report.json");
    for (const role of ["site", "executor"] as const) {
      const target = resolve(directory, `${role}.js`); await copyFile(candidate[role].output, target);
      candidate[role].output = target; f.inventory.resources[`${role}Worker`].entry = target;
    }
    const bytes = JSON.stringify(candidate); await writeFile(candidate.report, bytes);
    f.inventory.artifactReportSha256 = createHash("sha256").update(bytes).digest("hex"); await f.save();
    const args = f.args(); args[4] = candidate.report;
    const transport = vi.fn((request: Request) => reply(request, accepted()));
    expect((await run(args, { transport, input: input() })).status).toBe("refused");
    expect(transport).not.toHaveBeenCalled();
  }, 30_000);
  it("forbids redirects on the single inventory-bound control target", async () => {
    const f = await setup(); const run = await driver();
    let observed: Request | undefined;
    const transport = vi.fn((request: Request) => {
      observed = request;
      return reply(request, accepted());
    });
    expect((await run(f.args(), { transport, input: input() })).status).toBe("accepted");
    expect(observed?.redirect).toBe("error");
    expect(new URL(observed!.url).origin).toBe(f.inventory.controlOrigin);
  }, 30_000);
  it("refuses unknown inventory fields instead of echoing a credential-like value", async () => {
    const f = await setup(); const run = await driver();
    Object.assign(f.inventory.resources.siteWorker, { controlSecret: "inventory-secret-never-echo" }); await f.save();
    const transport = vi.fn((request: Request) => reply(request, accepted()));
    const result = await run(f.args(), { transport, input: input() });
    expect(JSON.stringify(result)).not.toContain("inventory-secret-never-echo");
    expect(result.status).toBe("refused"); expect(transport).not.toHaveBeenCalled();
  }, 30_000);
  it("refuses a reused report name without changing any existing report files", async () => {
    const f = await setup(); const run = await driver(); const args = f.args();
    const transport = vi.fn((request: Request) => reply(request, accepted()));
    const original = await run(args, { transport, input: input() }); expect(original.status).toBe("accepted");
    const directory = resolve(original.report, ".."); const files = await readdir(directory);
    expect((await run(args, { transport, input: input() })).status).toBe("refused");
    expect(await readdir(directory)).toEqual(files); expect(transport).toHaveBeenCalledTimes(1);
  }, 30_000);
});
