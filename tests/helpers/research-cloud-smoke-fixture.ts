import { readFileSync } from "node:fs";
import { mkdtemp, readdir, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { relative, resolve, sep } from "node:path";
import { Miniflare } from "miniflare";
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { canonicalJson } from "../../app/lib/planning/fingerprint";
import { PublicOperationScope } from "../../app/server/research/public-operation-scope";
import { signBridgeMessage, verifyBridgeMessage, type BridgeMessageContext } from "../../app/server/research/executor/auth";
import { readBridgeBody } from "../../app/server/research/executor/body";
import { readResearchBridgeConnection } from "../../app/server/research/executor/connection-config";
import type { BridgeJob } from "../../app/server/research/executor/job";
import { parseBridgeJob, hashBridgeJob } from "../../app/server/research/executor/job";
import { parseBridgeBeginGrant } from "../../app/server/research/executor/begin";
import { parseBridgeReceiptMetadata, decodeBridgeProviderReceipt, summarizeBridgeProviderReceipt } from "../../app/server/research/executor/receipt";
import { D1ResearchRepository } from "../../app/server/research/d1-repository";
import { D1SiteExecutionRepository } from "../../app/server/research/d1-site-execution-repository";
import { D1SiteBridgeRepository } from "../../app/server/research/d1-site-bridge-repository";
import { matchAcceptedProof } from "../../app/server/research/executor/bridge-contract";
import { createExecutorBridgeHandler } from "../../worker/research-executor/http-routes";
import { createExecutionRuntime, createHttpRuntime, createMaintenanceRuntime } from "../../worker/research-executor/runtime";
import { runResearchJob } from "../../worker/research-executor/execute-job";
import { runExecutorMaintenance } from "../../worker/research-executor/maintenance";
import type { SmokeSiteEnvironment } from "../../worker/research-executor-smoke/environment";
import { parseSmokeReplayRoster, parseSmokeReplayReply, SMOKE_REPLAY_STEPS, smokeReplayHash,
  type SmokeReplayApproval, type SmokeReplayReply, type SmokeReplayStep } from "../../worker/research-executor-smoke/replay-contract";
import { requireSmokeReplayAdmission } from "../../worker/research-executor-smoke/replay-admission";
import { D1SmokeEvidence } from "../../worker/research-executor-smoke/evidence";
import { SCENARIOS, scenarioForJob, type SmokeScenarioId } from "../../worker/research-executor-smoke/scenarios";
import { createBridgeFetch, createSyntheticProviderFetch } from "../../worker/research-executor-smoke/transports";
import siteWorker from "../../worker/research-executor-smoke/site-entry";
import { TEST_PRODUCTION_ENVIRONMENT } from "./research-bridge-fixture";
import { createResearchD1, SqliteD1 } from "./sqlite-d1";
export { signBridgeMessage, verifyBridgeMessage, readBridgeBody, SCENARIOS };
export { parseSmokeReplayRequest, parseSmokeReplayReply, parseSmokeReplayRoster, SMOKE_REPLAY_STEPS } from "../../worker/research-executor-smoke/replay-contract";

/** Cross-store observations are not atomic; compare every state field, keeping observation times in evidence. */
export function snapshotState<T extends { observedAt: number; observations: unknown }>(value: T): Omit<T, "observedAt" | "observations"> {
  const state = { ...value }; delete (state as Partial<T>).observedAt; delete (state as Partial<T>).observations;
  return state;
}

const businessTables = ["smoke_scenarios", "users", "feature_flags", "idempotency_records", "research_runs",
  "research_site_executions", "research_site_acceptances", "research_site_imports", "research_site_recoveries",
  "research_site_scan_cursors", "quota_ledger", "ai_budget_reservations", "ai_budget_buckets", "ai_runs", "research_packages"] as const;

/** Local capability double only; production receipt validation and conditional writes remain real. */
function memoryBucket(): R2Bucket {
  const objects = new Map<string, { bytes: Uint8Array; etag: string }>();
  let version = 0;
  return {
    get: async (key: string) => {
      const value = objects.get(key);
      return value ? { key, etag: value.etag, size: value.bytes.byteLength,
        body: new Response(new Uint8Array(value.bytes)).body! } : null;
    },
    put: async (key: string, body: Uint8Array, options?: { onlyIf?: { etagDoesNotMatch?: string; etagMatches?: string } }) => {
      const previous = objects.get(key);
      if ((options?.onlyIf?.etagDoesNotMatch === "*" && previous)
        || (options?.onlyIf?.etagMatches && previous?.etag !== options.onlyIf.etagMatches)) return null;
      const value = { bytes: new Uint8Array(body), etag: String(++version) };
      objects.set(key, value); return { key, etag: value.etag, size: value.bytes.byteLength };
    },
    delete: async (key: string) => { objects.delete(key); },
  } as unknown as R2Bucket;
}

/** Actual built Workers, native Workflow and separate persisted stores. No seeded business state. */
export async function createNativeResearchCloudSmokeFixture(artifacts: { executor: string; site: string }) {
  const parent = await realpath(tmpdir());
  const owned = await mkdtemp(resolve(parent, "arc15-"));
  let egress = 0;
  const options = { cf: false as const, d1Persist: resolve(owned, "d1"), r2Persist: resolve(owned, "r2"),
    workflowsPersist: resolve(owned, "wf"), workers: [
      { name: "smoke-site", modules: true, scriptPath: resolve(artifacts.site), compatibilityDate: "2026-05-15",
        bindings: { ...TEST_PRODUCTION_ENVIRONMENT, SMOKE_CONTROL_KEY_ID: "control-test", SMOKE_CONTROL_SECRET_HEX: "33".repeat(32) },
        d1Databases: { SMOKE_SITE_DB: "local-site" }, serviceBindings: { SMOKE_EXECUTOR: "smoke-executor" },
        outboundService: () => { egress++; throw Error("Native outbound denied"); } },
      { name: "smoke-executor", modules: true, scriptPath: resolve(artifacts.executor), compatibilityDate: "2026-05-15",
        bindings: { ...TEST_PRODUCTION_ENVIRONMENT, ARC_RESEARCH_EXECUTOR_ACCEPT_NEW: "true" },
        d1Databases: { EXECUTOR_DB: "local-executor" }, r2Buckets: { EXECUTOR_RECEIPTS: "local-receipts" },
        serviceBindings: { SMOKE_SITE: "smoke-site" },
        workflows: { RESEARCH_WORKFLOW: { name: "local-research", className: "ResearchWorkflow" } },
        outboundService: () => { egress++; throw Error("Native outbound denied"); } },
    ] };
  let native = new Miniflare(options);
  let disposed = false;
  const migrations: { store: string; file: string; sha256: string }[] = [];
  const siteDb = async () => await native.getD1Database("SMOKE_SITE_DB", "smoke-site") as unknown as D1Database;
  const executorDb = async () => await native.getD1Database("EXECUTOR_DB", "smoke-executor") as unknown as D1Database;
  const nonceSet = new Set<string>();
  const trace: string[] = [];
  const independentCronImports = new Set<SmokeScenarioId>();
  type ReplayBindings = Pick<SmokeSiteEnvironment, "SMOKE_REPLAY_APPROVAL_JSON" | "SMOKE_REPLAY_INVENTORY_SHA256">;
  const reopen = async (bindings?: ReplayBindings) => {
    if (bindings) {
      if (Object.keys(bindings).some(key => !["SMOKE_REPLAY_APPROVAL_JSON", "SMOKE_REPLAY_INVENTORY_SHA256"].includes(key))
        || Object.values(bindings).some(value => typeof value !== "string")) throw Error("Only plain replay bindings permitted");
      Object.assign(options.workers[0]!.bindings, bindings);
    }
    await native.dispose(); native = new Miniflare(options); await native.ready;
  };
  const makeRequest = async (operation: "start" | "status" | "replay", id: SmokeScenarioId, step?: SmokeReplayStep) => {
    const body = new TextEncoder().encode(JSON.stringify({ scenarioId: id, ...(step ? { step } : {}) }));
    const context: BridgeMessageContext = { direction: "executor-to-site", kind: "request", method: "POST",
      path: `/_smoke/${operation}`, audience: TEST_PRODUCTION_ENVIRONMENT.BETTER_AUTH_URL, jobId: "collection", status: null };
    const keyBytes = new Uint8Array(32).fill(0x33);
    const headers = await signBridgeMessage({ context, body, keyId: "control-test", keyBytes, now: Date.now });
    return new Request(new URL(context.path, context.audience), { method: "POST", headers, body });
  };
  const dispatch = async (request: Pick<Request, "url" | "method" | "headers" | "arrayBuffer">) => {
    trace.push(`site:${new URL(request.url).pathname.split("/").at(-1)}`);
    const signal = AbortSignal.timeout(5000);
    const response = await (await native.getWorker("smoke-site")).fetch(request.url, { method: request.method,
      headers: Array.from(request.headers.entries()), body: new Uint8Array(await request.arrayBuffer()), signal });
    const bytes = await readBridgeBody(response as unknown as Response, { maxBytes: 4096, timeoutMs: 5000, signal });
    return new Response(new Uint8Array(bytes), { status: response.status, headers: Array.from(response.headers.entries()) });
  };
  const verifyResponse = async (request: Pick<Request, "url" | "headers">, response: Response) => {
    const bytes = await readBridgeBody(response, { maxBytes: 4096, timeoutMs: 5000 });
    await verifyBridgeMessage({ context: { direction: "executor-to-site", kind: "response", method: "POST",
      path: new URL(request.url).pathname, audience: TEST_PRODUCTION_ENVIRONMENT.BETTER_AUTH_URL, jobId: "collection", status: response.status }, body: bytes,
      headers: response.headers, keyId: "control-test", keyBytes: new Uint8Array(32).fill(0x33), now: Date.now,
      nonces: { claim: async ({ scope, nonce }) => { const key = `${scope}:${nonce}`;
        if (nonceSet.has(key)) return false; nonceSet.add(key); return true; } } });
    // The built Site, rather than the host, must have claimed this signed request in its persisted D1.
    const persisted = await select(await siteDb(), "SELECT count(*) AS count FROM research_bridge_nonces WHERE scope=?1 AND nonce=?2",
      "executor-to-site:control-test", request.headers.get("x-arc-bridge-nonce"));
    assert.equal(persisted?.count, 1);
    return { status: response.status, body: JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown> };
  };
  const signed = async (operation: "start" | "status" | "replay", id: SmokeScenarioId, step?: SmokeReplayStep) => {
    const request = await makeRequest(operation, id, step);
    return verifyResponse(request, await dispatch(request.clone()));
  };
  type Row = Record<string, string | number | null>;
  const select = async (db: D1Database, sql: string, ...bindings: (string | number | null)[]) => {
    if (!/^SELECT\s/u.test(sql) || sql.includes(";")) throw Error("Snapshot is SELECT only");
    trace.push("snapshot:select"); return db.prepare(sql).bind(...bindings).first<Row>();
  };
  const snapshot = async (id: SmokeScenarioId) => {
    const observedAt = Date.now();
    const observations: Record<string, { startedAt: number; completedAt: number }> = {};
    const observe = async <T>(name: string, read: () => Promise<T>): Promise<T> => {
      const startedAt = Date.now(); const value = await read();
      observations[name] = { startedAt, completedAt: Date.now() }; return value;
    };
    const observedSelect = (name: string, db: D1Database, sql: string, ...bindings: (string | number | null)[]) =>
      observe(name, () => select(db, sql, ...bindings));
    const scenario = SCENARIOS.find(s => s.id === id); if (!scenario) throw Error("Unknown scenario");
    const site = await siteDb(); const executor = await executorDb();
    const evidence = await observe("evidence", () => new D1SmokeEvidence(executor).read(id));
    const job = await observedSelect("job", executor, "SELECT job_id,request_hash,job_json,grant_json,dispatch_state,dispatch_at,workflow_accepted_at FROM research_executor_jobs WHERE job_id=?1", scenario.jobId);
    const run = await observedSelect("run", site, "SELECT id,state,package_id,state_version FROM research_runs WHERE user_id=?1 AND mutation_id=?2", scenario.ownerId, scenario.mutationId);
    const execution = await observedSelect("execution", site, "SELECT request_hash,began_at,execution_expires_at FROM research_site_executions WHERE job_id=?1", scenario.jobId);
    const result = await observedSelect("result", executor, "SELECT receipt_hash,metadata_json,site_acknowledged_at,body_removed_at FROM research_executor_results WHERE job_id=?1", scenario.jobId);
    const imported = await observedSelect("import", site, "SELECT phase,receipt_hash,receipt_metadata_json FROM research_site_imports WHERE job_id=?1", scenario.jobId);
    const accounting = await observedSelect("accounting", site, `SELECT
      (SELECT count(*) FROM research_runs WHERE user_id=?1) AS runs,
      (SELECT count(*) FROM research_site_imports WHERE user_id=?1) AS imports,
      (SELECT count(*) FROM quota_ledger WHERE user_id=?1) AS quotaRows,
      (SELECT count(*) FROM quota_ledger WHERE user_id=?1 AND entry_kind='reserved') AS quotaReserved,
      (SELECT count(*) FROM quota_ledger WHERE user_id=?1 AND entry_kind='accepted') AS quotaAccepted,
      (SELECT count(*) FROM ai_budget_reservations WHERE run_id=?2) AS budgetReservations,
      (SELECT count(*) FROM ai_budget_reservations WHERE run_id=?2 AND status='settled') AS budgetSettled,
      (SELECT coalesce(sum(settled_micros),0) FROM ai_budget_reservations WHERE run_id=?2) AS settledMicros,
      (SELECT count(*) FROM research_packages WHERE id=?3) AS packages,
      (SELECT count(*) FROM ai_runs WHERE user_id=?1 AND purpose='role-research' AND status='accepted') AS audits`, scenario.ownerId, run?.id ?? null, run?.package_id ?? null);
    const buckets = await observedSelect("buckets", site, `SELECT
      (SELECT coalesce(sum(reserved_micros),0) FROM ai_budget_buckets WHERE period_kind='day') AS dayReserved,
      (SELECT coalesce(sum(settled_micros),0) FROM ai_budget_buckets WHERE period_kind='day') AS daySettled,
      (SELECT coalesce(sum(reserved_micros),0) FROM ai_budget_buckets WHERE period_kind='month') AS monthReserved,
      (SELECT coalesce(sum(settled_micros),0) FROM ai_budget_buckets WHERE period_kind='month') AS monthSettled`);
    const acceptance = await observedSelect("acceptance", site, "SELECT job_id,request_hash,workflow_id,workflow_accepted_at FROM research_site_acceptances WHERE job_id=?1", scenario.jobId);
    const delivery = await observedSelect("delivery", executor, "SELECT receipt_hash,completed_at FROM research_executor_delivery WHERE job_id=?1", scenario.jobId);
    const packageRow = await observedSelect("package", site, "SELECT expires_at FROM research_packages WHERE id=?1", run?.package_id ?? null);
    let receiptHash: string | null = null; let receiptBodyState: "missing" | "receipt" | "tombstone" = "missing";
    let latencyMs: number | null = null; let queueExpiresAt: number | null = null;
    let receiptMetadataSha256: string | null = null; let tombstoneRemovedAt: number | null = null;
    let acceptedProof: Awaited<ReturnType<typeof matchAcceptedProof>> | null = null;
    const beginGrant = job?.grant_json ? parseBridgeBeginGrant(JSON.parse(String(job.grant_json))) : null;
    const receiptStartedAt = Date.now();
    if (job) {
      const actualJob = parseBridgeJob(JSON.parse(String(job.job_json)));
      queueExpiresAt = actualJob.queueExpiresAt;
      if (actualJob.jobId !== scenario.jobId || await hashBridgeJob(actualJob) !== job.request_hash
        || job.request_hash !== execution?.request_hash) throw Error("Native identity mismatch");
      if (acceptance) {
        acceptedProof = await matchAcceptedProof({ jobId: acceptance.job_id, requestHash: acceptance.request_hash,
          workflowId: acceptance.workflow_id, workflowAcceptedAt: acceptance.workflow_accepted_at }, actualJob);
        assert.equal(acceptedProof.workflowAcceptedAt, job.workflow_accepted_at);
      }
      trace.push("snapshot:r2");
      const object = await (await native.getR2Bucket("EXECUTOR_RECEIPTS", "smoke-executor"))
        .get(`research-receipts/v1/${scenario.jobId}/${job.request_hash}.json`);
      if (object) {
        if (object.size > 2_000_000) throw Error("Native receipt too large");
        const bytes = new Uint8Array(await object.arrayBuffer());
        const raw = JSON.parse(new TextDecoder().decode(bytes));
        const metadata = raw.format === "arc-research-receipt-tombstone-v1" ? parseBridgeReceiptMetadata(raw.metadata)
          : await summarizeBridgeProviderReceipt(decodeBridgeProviderReceipt(bytes));
        receiptBodyState = raw.format === "arc-research-receipt-tombstone-v1" ? "tombstone" : "receipt";
        receiptHash = metadata.receiptHash; latencyMs = metadata.latencyMs;
        receiptMetadataSha256 = await smokeReplayHash(canonicalJson(metadata));
        tombstoneRemovedAt = raw.format === "arc-research-receipt-tombstone-v1" ? raw.removedAt as number : null;
        if (metadata.grant.jobId !== scenario.jobId || metadata.grant.requestHash !== job.request_hash) throw Error("Native receipt mismatch");
        assert.deepEqual(metadata.grant, beginGrant);
        if (result) assert.deepEqual(parseBridgeReceiptMetadata(JSON.parse(String(result.metadata_json))), metadata);
      }
    }
    observations.receipt = { startedAt: receiptStartedAt, completedAt: Date.now() };
    const siteMetadata = imported ? parseBridgeReceiptMetadata(JSON.parse(String(imported.receipt_metadata_json))) : null;
    const siteReceiptMetadataSha256 = siteMetadata ? await smokeReplayHash(canonicalJson(siteMetadata)) : null;
    if (siteMetadata) {
      assert.equal(siteMetadata.receiptHash, receiptHash); assert.deepEqual(siteMetadata.grant, beginGrant);
      assert.equal(siteReceiptMetadataSha256, receiptMetadataSha256);
    }
    const cron = await observe("cron", () => new D1SmokeEvidence(executor).readCron());
    const workflowStatus = await observe("workflowStatus", async (): Promise<Record<string, unknown> | null> => {
      if (!job) return null;
      trace.push("snapshot:workflow-status");
      const response = await (await native.getWorker("smoke-executor")).fetch("https://executor.test/__local/workflow-status",
        { method: "POST", body: JSON.stringify({ scenarioId: id }), signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw Error("Native Workflow observation unavailable");
      const bytes = await readBridgeBody(response as unknown as Response, { maxBytes: 4096, timeoutMs: 5000 });
      return { instanceId: scenario.jobId, ...JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown> };
    });
    return { observedAt, observations, scenarioId: id, jobId: scenario.jobId, requestHash: job?.request_hash ?? null,
      beginGrant, queueExpiresAt, acceptedAt: job?.workflow_accepted_at ?? null,
      beganAt: execution?.began_at ?? null, executionExpiresAt: execution?.execution_expires_at ?? null,
      acceptedProof, backgroundAccepted: acceptedProof !== null && typeof job?.workflow_accepted_at === "number",
      providerCalls: evidence?.providerCalls ?? 0, repairCalls: evidence?.repairCalls ?? 0, unexpectedTargets: evidence?.rejections ?? 0,
      fault: evidence?.fault?.marker ?? null, faultAt: evidence?.fault?.at ?? null,
      dispatchState: job?.dispatch_state ?? null, dispatchAt: job?.dispatch_at ?? null,
      resultCount: result ? 1 : 0, r2ReceiptPresent: receiptBodyState === "receipt", receiptBodyState, receiptHash,
      receiptHashMatched: !!result && result.receipt_hash === receiptHash && (!imported || imported.receipt_hash === receiptHash),
      bodyRemovedAt: result?.body_removed_at ?? null, tombstoneRemovedAt, acknowledgedAt: result?.site_acknowledged_at ?? null,
      receiptMetadataSha256, siteReceiptMetadataSha256,
      importPhase: imported?.phase ?? null, runState: run?.state ?? null, runId: run?.id ?? null, runVersion: run?.state_version ?? null,
      runHash: run ? await smokeReplayHash(String(run.id)) : null,
      packageHash: run?.package_id ? await smokeReplayHash(String(run.package_id)) : null, packageExpiresAt: packageRow?.expires_at ?? null,
      workflowStatus,
      deliveryCompleted: typeof delivery?.completed_at === "number", latencyMs, accounting, buckets, cron,
      outboundAttempts: egress };
  };
  // Serialized observations and evidence records are immutable snapshots, including their observation times.
  let approvalObservations = new Map<SmokeScenarioId, string>();
  const approvalEvidenceRecords = new Map<string, string>();
  const approvalEvidence = (digest: string): string => {
    const json = approvalEvidenceRecords.get(digest);
    if (json === undefined) throw Error("Native approval evidence unavailable");
    return json;
  };
  const approveReplay = async (id: SmokeScenarioId) => {
    const before = await snapshot(id);
    if (before.runState !== "ready" || before.importPhase !== 5 || before.accounting?.settledMicros !== 1
      || before.workflowStatus?.status !== "complete" || !before.backgroundAccepted || !before.receiptHashMatched
      || before.providerCalls !== 1 || before.repairCalls !== 0 || before.unexpectedTargets !== 0 || before.outboundAttempts !== 0
      || Number(before.packageExpiresAt) <= Date.now()
      || id !== "long" && !independentCronImports.has(id)) {
      throw Error("Independent settled native import required before replay approval");
    }
    assert.deepEqual(before.accounting, { runs: 1, imports: 1, quotaRows: 2, quotaReserved: 1, quotaAccepted: 1,
      budgetReservations: 1, budgetSettled: 1, settledMicros: 1, packages: 1, audits: 1 });
    const nextObservations = new Map(approvalObservations); nextObservations.set(id, canonicalJson(before));
    const observations = SCENARIOS.flatMap(scenario => {
      const json = nextObservations.get(scenario.id);
      return json === undefined ? [] : [JSON.parse(json) as Awaited<ReturnType<typeof snapshot>>];
    });
    const evidenceJson = canonicalJson({ schemaVersion: "arc-smoke-native-replay-evidence-v1", scenarios: observations });
    const nativeEvidenceSha256 = await smokeReplayHash(evidenceJson);
    const approvals = observations.map(value => ({ scenarioId: value.scenarioId, jobId: value.jobId, requestHash: value.requestHash,
      receiptHash: value.receiptHash, receiptMetadataSha256: value.siteReceiptMetadataSha256,
      runHash: value.runHash, packageHash: value.packageHash,
      acceptedAt: value.acceptedAt, beganAt: value.beganAt, executionExpiresAt: value.executionExpiresAt }));
    const inventorySha256 = await smokeReplayHash(canonicalJson({ scope: "local-native-only", owned,
      siteD1: options.workers[0]!.d1Databases, executorD1: options.workers[1]!.d1Databases,
      receipts: options.workers[1]!.r2Buckets, workflow: options.workers[1]!.workflows,
      siteArtifact: createHash("sha256").update(await readFile(artifacts.site)).digest("hex"),
      executorArtifact: createHash("sha256").update(await readFile(artifacts.executor)).digest("hex") }));
    const roster = parseSmokeReplayRoster(JSON.stringify({ schemaVersion: "arc-smoke-replay-approval-v1", inventorySha256,
      nativeEvidenceSha256, scenarios: approvals }), inventorySha256);
    await reopen({ SMOKE_REPLAY_APPROVAL_JSON: JSON.stringify(roster), SMOKE_REPLAY_INVENTORY_SHA256: inventorySha256 });
    approvalObservations = nextObservations;
    approvalEvidenceRecords.set(nativeEvidenceSha256, evidenceJson);
    return roster;
  };
  const replayStep = async (id: SmokeScenarioId, step: SmokeReplayStep): Promise<SmokeReplayReply> => {
    const response = await signed("replay", id, step);
    if (response.status !== 200) throw Error(`Native signed replay unavailable (${response.status})`);
    const reply = parseSmokeReplayReply(response.body);
    if (reply.scenarioId !== id || reply.step !== step) throw Error("Native signed replay response mismatch");
    return reply;
  };
  const replay = async (id: SmokeScenarioId) => {
    const steps: SmokeReplayReply[] = [];
    for (const step of SMOKE_REPLAY_STEPS) {
      const reply = await replayStep(id, step); steps.push(reply);
      if (!reply.completed) break;
    }
    return { steps, after: await snapshot(id) };
  };
  const clean = async () => {
    const actual = await realpath(owned); const rel = relative(parent, actual);
    if (actual !== owned || rel.startsWith("..") || rel.includes(sep) || !rel.startsWith("arc15-")) throw Error("Unsafe owned cleanup");
    await rm(actual, { recursive: true });
  };
  try {
    await native.ready;
    const site = await siteDb(); const executor = await executorDb();
    for (const [db, store, directory, pattern, count] of [[site, "site", "drizzle", /^00(?:0[0-9]|1[01])_/u, 12],
      [executor, "executor", "worker/research-executor/migrations", /^000[0-3]_/u, 4]] as const) {
      const files = (await readdir(directory)).filter(file => pattern.test(file)).sort();
      assert.equal(files.length, count);
      for (const file of files) {
        const sql = await readFile(resolve(directory, file), "utf8");
        for (const statement of sql.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean)) await db.prepare(statement).run();
        migrations.push({ store, file: `${directory}/${file}`, sha256: createHash("sha256").update(sql).digest("hex") });
      }
      const smokeFile = "worker/research-executor-smoke/migrations/0000_smoke_evidence.sql";
      const sql = await readFile(smokeFile, "utf8"); await db.prepare(sql).run();
      migrations.push({ store, file: smokeFile, sha256: createHash("sha256").update(sql).digest("hex") });
    }
  } catch (error) { await native.dispose(); await clean(); throw error; }
  return {
    start: (id: SmokeScenarioId) => signed("start", id),
    status: (id: SmokeScenarioId) => signed("status", id),
    snapshot, replay, approveReplay, approvalEvidence, replayStep, makeRequest, dispatch, verifyResponse,
    invokeScheduled: async () => {
      const gaps = [];
      for (const scenario of SCENARIOS.slice(1)) {
        const value = await snapshot(scenario.id);
        if (value.fault === scenario.id && value.importPhase !== 5) gaps.push(value);
      }
      const schedule = await select(await executorDb(), "SELECT lease_until FROM research_executor_maintenance_schedule WHERE singleton=1");
      const waitMs = Math.max(0, Number(schedule?.lease_until ?? 0) - Date.now() + 20);
      if (waitMs > 30_100) throw Error("Native maintenance lease exceeded bound");
      if (waitMs) await new Promise(resolve => setTimeout(resolve, waitMs));
      trace.push("executor:local-cron");
      const response = await (await native.getWorker("smoke-executor")).fetch("https://executor.test/__local/cron",
        { method: "POST", body: "{}", signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw Error("Native scheduled invocation failed");
      for (const gap of gaps) {
        const imported = await snapshot(gap.scenarioId);
        if (imported.importPhase === 5 && imported.runState === "ready"
          && imported.cron.some(event => event.phase === "end" && event.outcome === "ok" && event.at >= Number(gap.faultAt))) {
          independentCronImports.add(gap.scenarioId);
        }
      }
      return { waitedForLeaseMs: waitMs, delegated: await response.json() as unknown };
    },
    waitForWorkflowTerminal: async (id: SmokeScenarioId): Promise<Record<string, unknown>> => {
      const end = performance.now() + 60_000;
      while (performance.now() < end) {
        trace.push("executor:local-workflow-status");
        const response = await (await native.getWorker("smoke-executor")).fetch("https://executor.test/__local/workflow-status",
          { method: "POST", body: JSON.stringify({ scenarioId: id }), signal: AbortSignal.timeout(Math.max(1, Math.min(5000, end - performance.now()))) });
        const value = await response.json() as Record<string, unknown>;
        if (response.ok && ["complete", "errored", "terminated"].includes(String(value.status))) return value;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw Error("Native Workflow terminal timeout");
    },
    reopen,
    trace: () => [...trace],
    migrations: Object.freeze(migrations),
    storageIdentity: Object.freeze({ owned, site: "local-site", executor: "local-executor", receipts: "local-receipts", workflow: "local-research" }),
    egress: () => egress,
    dispose: async () => { if (!disposed) { disposed = true; await native.dispose(); await clean(); } },
  };
}

/** The local operator and the native test execute the same short, assertion-bearing chain. */
export async function runNativeSmokeSuite(artifacts: { executor: string; site: string }) {
  const harness = await createNativeResearchCloudSmokeFixture(artifacts);
  const results = [];
  const identity = (value: Awaited<ReturnType<typeof harness.snapshot>>) => ({ jobId: value.jobId,
    requestHash: value.requestHash, beginGrant: value.beginGrant, beganAt: value.beganAt,
    executionExpiresAt: value.executionExpiresAt, queueExpiresAt: value.queueExpiresAt, acceptedAt: value.acceptedAt,
    dispatchAt: value.dispatchAt, receiptHash: value.receiptHash, receiptMetadataSha256: value.receiptMetadataSha256,
    acceptedProof: value.acceptedProof, workflowStatus: value.workflowStatus });
  const stable = (before: Awaited<ReturnType<typeof harness.snapshot>>, after: Awaited<ReturnType<typeof harness.snapshot>>) => {
    // All other state is compared. Only lawful, acknowledged receipt retention may advance independently.
    for (const field of ["bodyRemovedAt", "tombstoneRemovedAt"] as const) {
      if (before[field] !== after[field]) {
        assert.equal(typeof after[field], "number"); assert.equal(typeof after.acknowledgedAt, "number");
        assert.equal(Number(after[field]) >= Number(before[field] ?? after.acknowledgedAt), true);
        assert.equal(Number(after[field]) <= after.observations.receipt!.completedAt, true);
      }
    }
    if (before.receiptBodyState !== after.receiptBodyState) {
      assert.equal(before.receiptBodyState, "receipt"); assert.equal(after.receiptBodyState, "tombstone");
      assert.equal(typeof after.tombstoneRemovedAt, "number"); assert.equal(after.r2ReceiptPresent, false);
    }
    assert.deepEqual(snapshotState(after), { ...snapshotState(before), bodyRemovedAt: after.bodyRemovedAt,
      tombstoneRemovedAt: after.tombstoneRemovedAt, receiptBodyState: after.receiptBodyState,
      r2ReceiptPresent: after.receiptBodyState === "receipt" });
  };
  const requireImported = (value: Awaited<ReturnType<typeof harness.snapshot>>) => {
    assert.equal(value.runState, "ready"); assert.equal(value.importPhase, 5); assert.equal(value.resultCount, 1);
    assert.equal(value.receiptHashMatched, true); assert.equal(value.providerCalls, 1); assert.equal(value.repairCalls, 0);
    assert.equal(value.unexpectedTargets, 0); assert.equal(value.backgroundAccepted, true);
    assert.deepEqual(value.accounting, { runs: 1, imports: 1, quotaRows: 2, quotaReserved: 1, quotaAccepted: 1, budgetReservations: 1,
      budgetSettled: 1, settledMicros: 1, packages: 1, audits: 1 });
    assert.equal(value.siteReceiptMetadataSha256, value.receiptMetadataSha256);
    assert.equal(value.workflowStatus?.status, "complete"); assert.equal(value.workflowStatus?.instanceId, value.jobId);
    assert.equal(value.outboundAttempts, 0);
  };
  try {
    for (const scenario of SCENARIOS) {
      const accepted = await harness.start(scenario.id);
      assert.equal(accepted.status, 200); assert.equal(accepted.body.backgroundAccepted, true);
      const terminal = await harness.waitForWorkflowTerminal(scenario.id);
      assert.equal(terminal.status, "complete");
      assert.equal(new TextEncoder().encode(JSON.stringify(terminal.output)).length <= 4096, true);
      assert.deepEqual(terminal.output, { jobId: scenario.jobId, state: scenario.id === "long" ? "recorded" : "unavailable",
        receiptHash: scenario.id === "long" ? (terminal.output as { receiptHash: string }).receiptHash : null });
      const gap = await harness.snapshot(scenario.id);
      assert.equal(gap.dispatchState, "claimed"); assert.equal(gap.providerCalls, 1);
      assert.equal(typeof gap.latencyMs, "number"); assert.equal(Number(gap.latencyMs) < 1_200_000, true);
      if (scenario.id === "long") assert.equal(Number(gap.latencyMs) >= 75, true);
      assert.equal(Number(gap.executionExpiresAt) - Number(gap.beganAt), 1_260_000);
      assert.equal(gap.beginGrant?.jobId, scenario.jobId); assert.equal(gap.beginGrant?.requestHash, gap.requestHash);
      const traceStart = harness.trace().length;
      await harness.status(scenario.id);
      stable(gap, await harness.snapshot(scenario.id));
      assert.equal(harness.trace().slice(traceStart).every(path => path.startsWith("snapshot:") || path === "site:status"), true);
      let scheduled: Awaited<ReturnType<typeof harness.invokeScheduled>> | null = null;
      let reopened = false;
      if (scenario.id !== "long") {
        assert.equal(gap.fault, scenario.id); assert.equal(gap.resultCount, scenario.id === "after-r2" ? 0 : 1);
        assert.equal(gap.r2ReceiptPresent, true); assert.notEqual(gap.runState, "ready"); assert.equal(gap.importPhase, null);
        await assert.rejects(() => harness.approveReplay(scenario.id), /Independent settled native import/u);
        for (const step of SMOKE_REPLAY_STEPS) await assert.rejects(() => harness.replayStep(scenario.id, step), /unavailable/u);
        stable(gap, await harness.snapshot(scenario.id));
        const storageIdentity = harness.storageIdentity;
        await harness.reopen(); reopened = true;
        assert.deepEqual(harness.storageIdentity, storageIdentity);
        stable(gap, await harness.snapshot(scenario.id));
        assert.deepEqual(await harness.waitForWorkflowTerminal(scenario.id), terminal);
        scheduled = await harness.invokeScheduled();
      } else if (gap.importPhase !== 5) scheduled = await harness.invokeScheduled();
      const imported = await harness.snapshot(scenario.id); requireImported(imported);
      const caseNumber = SCENARIOS.indexOf(scenario) + 1;
      assert.deepEqual(imported.buckets, { dayReserved: 0, daySettled: caseNumber, monthReserved: 0, monthSettled: caseNumber });
      assert.deepEqual(identity(imported), identity(gap));
      if (scenario.id !== "long") assert.equal(imported.cron.some(event => event.phase === "end" && event.outcome === "ok"), true);
      const beforeReplay = await harness.snapshot(scenario.id); stable(imported, beforeReplay);
      const approval = await harness.approveReplay(scenario.id);
      const approvalEvidenceJson = harness.approvalEvidence(approval.nativeEvidenceSha256);
      const replay = await harness.replay(scenario.id);
      assert.deepEqual(replay.steps.map(value => value.step), SMOKE_REPLAY_STEPS);
      assert.equal(replay.steps.every(value => value.completed), true);
      const approved = approval.scenarios.find(value => value.scenarioId === scenario.id)!;
      for (const reply of replay.steps) {
        if ("isNull" in reply) assert.equal(reply.isNull, true);
        else {
          assert.deepEqual(reply.identity, { jobId: beforeReplay.jobId, requestHash: beforeReplay.requestHash,
            runHash: beforeReplay.runHash, packageHash: beforeReplay.packageHash });
          if ("original" in reply) {
            assert.deepEqual(reply.original, { acceptedAt: beforeReplay.acceptedAt, beganAt: beforeReplay.beganAt,
              executionExpiresAt: beforeReplay.executionExpiresAt, queueExpiresAt: beforeReplay.queueExpiresAt });
            assert.equal(reply.receipt.receiptHash, beforeReplay.receiptHash);
            assert.equal(reply.receipt.metadataSha256, beforeReplay.siteReceiptMetadataSha256);
          }
        }
      }
      const ownerA = replay.steps.filter(value => value.step === "owner-a-recover" || value.step === "owner-a-get");
      const ownerB = replay.steps.filter(value => value.step === "owner-b-recover" || value.step === "owner-b-get");
      const originalMutationRecovered = ownerA.length === 2 && ownerA.every(value => value.completed
        && "identity" in value && value.identity.runHash === approved.runHash && value.identity.packageHash === approved.packageHash);
      const wrongOwnerHidden = ownerB.length === 2 && ownerB.every(value => value.completed && "isNull" in value && value.isNull);
      assert.equal(originalMutationRecovered, true); assert.equal(wrongOwnerHidden, true);
      requireImported(replay.after); assert.deepEqual(identity(replay.after), identity(imported)); stable(beforeReplay, replay.after);
      const repeated = await harness.start(scenario.id); assert.equal(repeated.body.jobId, scenario.jobId);
      stable(replay.after, await harness.snapshot(scenario.id));
      results.push({ scenarioId: scenario.id, terminal, gap, imported, beforeReplay, approval, approvalEvidenceJson, replaySteps: replay.steps,
        final: replay.after, reopened, scheduled, wrongOwnerHidden, originalMutationRecovered });
    }
    assert.equal(harness.egress(), 0);
    return { status: "passed", cloudElapsedProved: false, syntheticAccountingOnly: true,
      outboundAttempts: harness.egress(), scenarios: results, migrations: harness.migrations,
      storageIdentity: harness.storageIdentity, migrationsAppliedOnce: true,
      retention: "R2 receipt bodies and acknowledged tombstones are distinguished; no clock or lease edits" };
  } finally { await harness.dispose(); }
}

export type ControlRequestOptions = {
  body?: unknown; keyId?: string; secretHex?: string; path?: string; method?: "GET" | "POST";
  audience?: string; direction?: BridgeMessageContext["direction"]; jobId?: string; origin?: string;
};

/** Two empty isolated databases; starts, admissions, begin, results and imports use production code. */
export function createResearchCloudSmokeFixture() {
  const siteDb = createResearchD1();
  const executorDb = new SqliteD1();
  executorDb.database.exec("PRAGMA foreign_keys = ON");
  for (const db of [siteDb, executorDb]) db.database.function("unixepoch", { varargs: true }, (...args: unknown[]) => {
    if (args.length === 0) return Math.floor(Date.now() / 1000);
    if (args.length === 1 && args[0] === "subsec") return Date.now() / 1000;
    throw new Error("Unexpected fixture SQL clock");
  });
  for (const name of ["0000_research_bridge_nonces.sql", "0001_research_executor_jobs.sql",
    "0002_research_executor_results.sql", "0003_research_executor_maintenance.sql"]) {
    executorDb.database.exec(readFileSync(resolve("worker/research-executor/migrations", name), "utf8").replaceAll("--> statement-breakpoint", ";"));
  }
  const smokeMigration = readFileSync(resolve("worker/research-executor-smoke/migrations/0000_smoke_evidence.sql"), "utf8");
  siteDb.database.exec(smokeMigration); executorDb.database.exec(smokeMigration);
  const connection = readResearchBridgeConnection(TEST_PRODUCTION_ENVIRONMENT)!;
  const controlSecret = "33".repeat(32);
  const controlKeyId = "control-test";
  const workflows = new Map<string, string>();
  const independentImports = new Set<SmokeScenarioId>();
  const replayApprovals = new Map<SmokeScenarioId, SmokeReplayApproval>();
  const replayEpoch = crypto.randomUUID();
  const traffic: string[] = [];
  const workflowCalls: { operation: "create" | "get" | "status"; id: string }[] = [];
  const responseNonces = new Set<string>();
  let workflowCreates = 0;
  let workflowCreateResponseHook: (() => Promise<void>) | undefined;
  let dropSubmitResponse = false;
  let dropAcceptance = false;
  let disposed = false;
  const pending = new Set<Promise<unknown>>();
  const track = <T>(operation: () => Promise<T>): Promise<T> => {
    if (disposed) return Promise.reject(new Error("Fixture disposed"));
    const result = operation(); pending.add(result);
    void result.finally(() => pending.delete(result)).catch(() => undefined); return result;
  };
  const bucket = memoryBucket();
  const workflow = {
    create: async ({ id }: { id: string }) => {
      workflowCalls.push({ operation: "create", id });
      workflowCreates++;
      if (workflows.has(id)) throw new Error("Existing synthetic Workflow");
      workflows.set(id, "queued");
      const hook = workflowCreateResponseHook; workflowCreateResponseHook = undefined;
      await hook?.(); return { id };
    },
    get: async (id: string) => {
      workflowCalls.push({ operation: "get", id });
      if (!workflows.has(id)) throw new Error("Missing synthetic Workflow");
      return { id, status: async () => {
        workflowCalls.push({ operation: "status", id }); return { status: workflows.get(id)! };
      } };
    },
  } as unknown as Workflow<{ jobId: string }>;
  const executorEnvironment = { ...TEST_PRODUCTION_ENVIRONMENT, EXECUTOR_DB: executorDb as unknown as D1Database,
    EXECUTOR_RECEIPTS: bucket, RESEARCH_WORKFLOW: workflow, ARC_RESEARCH_EXECUTOR_ACCEPT_NEW: "true",
    OPENROUTER_API_KEY: "synthetic-control-fixture" };
  const siteBinding = { fetch: async (request: Request) => {
    const path = new URL(request.url).pathname; traffic.push(`site:${path}`);
    if (dropAcceptance && path.endsWith("/accepted")) throw new Error("Synthetic acceptance loss");
    return siteWorker.fetch(request, environment);
  } } as Fetcher;
  const bridgeFetch = createBridgeFetch(siteBinding, connection.siteOrigin, "site");
  const executorHandler = createExecutorBridgeHandler(createHttpRuntime(executorEnvironment, { bridgeFetch }));
  const executorBinding = { fetch: async (request: Request) => {
    const path = new URL(request.url).pathname; traffic.push(`executor:${path}`);
    const response = await executorHandler(request);
    if (dropSubmitResponse && path.endsWith("/submit")) {
      dropSubmitResponse = false; await response.body?.cancel(); throw new Error("Synthetic submit response loss");
    }
    return response;
  } } as Fetcher;
  const environment: SmokeSiteEnvironment = { ...TEST_PRODUCTION_ENVIRONMENT, SMOKE_SITE_DB: siteDb as unknown as D1Database,
    SMOKE_EXECUTOR: executorBinding, SMOKE_CONTROL_KEY_ID: controlKeyId, SMOKE_CONTROL_SECRET_HEX: controlSecret };
  Object.defineProperty(environment, "OPENROUTER_API_KEY", { get() { throw new Error("Site Provider key forbidden"); } });
  const keyBytes = (hex: string) => Uint8Array.from(hex.match(/../gu)!, byte => Number.parseInt(byte, 16));
  const makeRequest = async (operation: "start" | "status" | "replay", id: string, options: ControlRequestOptions = {}) => {
    const path = options.path ?? `/_smoke/${operation}`;
    const method = options.method ?? "POST";
    const body = new TextEncoder().encode(JSON.stringify(options.body ?? { scenarioId: id }));
    const context: BridgeMessageContext = { direction: options.direction ?? "executor-to-site", kind: "request",
      method, path, audience: options.audience ?? connection.siteOrigin, jobId: options.jobId ?? "collection", status: null };
    const headers = await signBridgeMessage({ context, body, keyId: options.keyId ?? controlKeyId,
      keyBytes: keyBytes(options.secretHex ?? controlSecret), now: Date.now });
    headers.set("content-type", "application/json");
    if (options.origin !== undefined) headers.set("origin", options.origin);
    return new Request(new URL(path, connection.siteOrigin), { method, headers, ...(method === "POST" ? { body } : {}) });
  };
  const dispatch = (request: Request) => track(() => siteWorker.fetch(request, environment));
  const signed = async (operation: "start" | "status" | "replay", id: string, body?: unknown) => {
    const response = await dispatch(await makeRequest(operation, id, { body }));
    const bytes = await readBridgeBody(response, { maxBytes: 4096, timeoutMs: 1000 });
    await verifyBridgeMessage({ context: { direction: "executor-to-site", kind: "response", method: "POST",
      path: `/_smoke/${operation}`, audience: connection.siteOrigin, jobId: "collection", status: response.status },
      body: bytes, headers: response.headers, keyId: controlKeyId, keyBytes: keyBytes(controlSecret), now: Date.now,
      nonces: { claim: async ({ scope, nonce }) => { const key = `${scope}:${nonce}`;
        if (responseNonces.has(key)) return false; responseNonces.add(key); return true; } } });
    return { status: response.status, body: JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown> };
  };
  const research = new D1ResearchRepository(siteDb as unknown as D1Database);
  const siteSnapshot = (id: SmokeScenarioId) => {
    const scenario = SCENARIOS.find(s => s.id === id)!;
    return {
      scenario: siteDb.database.prepare("SELECT * FROM smoke_scenarios WHERE scenario_id=?1").get(id),
      run: siteDb.database.prepare("SELECT * FROM research_runs WHERE user_id=?1 AND mutation_id=?2").get(scenario.ownerId, scenario.mutationId),
      execution: siteDb.database.prepare("SELECT * FROM research_site_executions WHERE job_id=?1").get(scenario.jobId),
      tables: Object.fromEntries(businessTables.map(table => [table, siteDb.database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()])),
    };
  };
  return {
    environment, siteDb, executorDb, traffic, workflowCalls, research, makeRequest, dispatch, siteSnapshot,
    approveReplay: (id: SmokeScenarioId) => track(async () => {
      const scenario = SCENARIOS.find(s => s.id === id)!;
      if (!independentImports.has(id) || workflows.get(scenario.jobId) !== "complete") {
        throw new Error("Independent successful Cron import required");
      }
      const row = siteDb.database.prepare(`SELECT r.id AS runId,r.package_id AS packageId,
        i.receipt_metadata_json AS metadataJson,i.receipt_hash AS receiptHash
        FROM smoke_scenarios s JOIN research_site_executions e ON e.job_id=s.job_id
        JOIN research_runs r ON r.id=e.run_id AND r.user_id=s.owner_id AND r.mutation_id=s.mutation_id
        JOIN research_site_imports i ON i.job_id=e.job_id AND i.run_id=r.id AND i.phase=5
        JOIN research_packages p ON p.id=r.package_id
        JOIN ai_budget_reservations b ON b.id=e.budget_reservation_id AND b.run_id=r.id
        WHERE s.scenario_id=?1 AND r.state='ready' AND p.expires_at>?2
          AND b.status='settled' AND b.settled_micros=1`).get(id, Date.now());
      if (!row) throw new Error("Current successful import required");
      const executions = new D1SiteExecutionRepository(siteDb as unknown as D1Database, research);
      const execution = await executions.read(scenario.ownerId, String(row.runId));
      if (!execution) throw new Error("Original execution required");
      const accepted = await new D1SiteBridgeRepository(siteDb as unknown as D1Database, research, executions).readAcceptance(execution);
      if (!accepted || execution.beganAt === null || execution.executionExpiresAt === null) throw new Error("Original proof required");
      const metadata = parseBridgeReceiptMetadata(JSON.parse(String(row.metadataJson)));
      const approval: SmokeReplayApproval = { scenarioId: id, jobId: scenario.jobId,
        requestHash: await hashBridgeJob(execution.job), receiptHash: String(row.receiptHash),
        receiptMetadataSha256: await smokeReplayHash(canonicalJson(metadata)),
        runHash: await smokeReplayHash(String(row.runId)), packageHash: await smokeReplayHash(String(row.packageId)),
        acceptedAt: accepted.workflowAcceptedAt, beganAt: execution.beganAt, executionExpiresAt: execution.executionExpiresAt };
      const inventorySha256 = await smokeReplayHash(`local-fixture-inventory:${replayEpoch}`);
      const next = new Map(replayApprovals); next.set(id, approval);
      const roster = parseSmokeReplayRoster(JSON.stringify({ schemaVersion: "arc-smoke-replay-approval-v1", inventorySha256,
        nativeEvidenceSha256: await smokeReplayHash(`local-independent-cron:${replayEpoch}:${canonicalJson([...next.values()])}`),
        scenarios: [...next.values()] }), inventorySha256);
      const scope = new PublicOperationScope(() => performance.now());
      try {
        await requireSmokeReplayAdmission({ environment: { ...environment, SMOKE_REPLAY_APPROVAL_JSON: JSON.stringify(roster),
          SMOKE_REPLAY_INVENTORY_SHA256: inventorySha256 }, scenarioId: id, scope });
      } finally { scope.finish(); }
      replayApprovals.set(id, approval);
      environment.SMOKE_REPLAY_APPROVAL_JSON = JSON.stringify(roster);
      environment.SMOKE_REPLAY_INVENTORY_SHA256 = inventorySha256;
      return roster;
    }),
    signedStart: (id: SmokeScenarioId) => signed("start", id), signedStatus: (id: SmokeScenarioId) => signed("status", id),
    signedReplay: (id: SmokeScenarioId, step: SmokeReplayStep) => signed("replay", id, { scenarioId: id, step }),
    workflowCreates: () => workflowCreates,
    onNextWorkflowCreateResponse: (hook: () => Promise<void>) => { workflowCreateResponseHook = hook; },
    dropNextSubmitResponse: () => { dropSubmitResponse = true; },
    setDropAcceptance: (value: boolean) => { dropAcceptance = value; },
    runWorkflow: (id: SmokeScenarioId) => track(async () => {
      const scenario = SCENARIOS.find(s => s.id === id)!;
      if (!workflows.has(scenario.jobId)) throw new Error("Workflow must be admitted through real submit");
      let current: BridgeJob | undefined;
      const evidence = new D1SmokeEvidence(executorDb as unknown as D1Database);
      const providerFetch = createSyntheticProviderFetch({ currentJob: () => {
        if (!current) throw new Error("Current real job required"); return current;
      }, evidence, timing: { long: { headersMs: 0, bodyMs: 0 }, "after-r2": { headersMs: 0, bodyMs: 0 }, "after-d1": { headersMs: 0, bodyMs: 0 } } });
      const runtime = createExecutionRuntime(executorEnvironment, { bridgeFetch, providerFetch });
      const actualGet = runtime.jobs.get.bind(runtime.jobs);
      const jobs = { get: async (jobId: string) => {
        const stored = await actualGet(jobId);
        if (!stored || (current && current.jobId !== stored.job.jobId)) throw new Error("Fixture job mismatch");
        const observed = scenarioForJob(stored.job); current = stored.job;
        await evidence.start(observed.id, Date.now()); return stored;
      }, recordBegin: runtime.jobs.recordBegin.bind(runtime.jobs), claimDispatch: runtime.jobs.claimDispatch.bind(runtime.jobs),
      closeUnclaimed: runtime.jobs.closeUnclaimed.bind(runtime.jobs) };
      workflows.set(scenario.jobId, "running");
      const result = await runResearchJob(scenario.jobId, { ...runtime, jobs });
      workflows.set(scenario.jobId, "complete"); return result;
    }),
    runCron: () => track(async () => {
      const result = await runExecutorMaintenance(createMaintenanceRuntime(executorEnvironment, { bridgeFetch }));
      for (const scenario of SCENARIOS) {
        const imported = siteDb.database.prepare(`SELECT 1 FROM research_site_imports i
          JOIN research_runs r ON r.id=i.run_id WHERE i.job_id=?1 AND i.phase=5 AND r.state='ready'`).get(scenario.jobId);
        if (imported && workflows.get(scenario.jobId) === "complete") independentImports.add(scenario.id);
      }
      return result;
    }),
    dispose: async () => { if (disposed) return; disposed = true; await Promise.allSettled([...pending]); siteDb.close(); executorDb.close(); },
  };
}
