import { z } from "zod";
import { fingerprint } from "../../app/lib/planning/fingerprint";
import { D1ResearchRepository } from "../../app/server/research/d1-repository";
import { D1SiteExecutionRepository } from "../../app/server/research/d1-site-execution-repository";
import { D1SiteBridgeRepository } from "../../app/server/research/d1-site-bridge-repository";
import { BridgeAuthError, signBridgeMessage, verifyBridgeMessage, type BridgeMessageContext } from "../../app/server/research/executor/auth";
import { BridgeBodyError, decodeBridgeJson, readBridgeBody } from "../../app/server/research/executor/body";
import { readResearchBridgeConnection, type ResearchBridgeConnection } from "../../app/server/research/executor/connection-config";
import { D1BridgeNonceStore } from "../../app/server/research/executor/d1-nonce-store";
import { ExecutorBridgeClient } from "../../app/server/research/executor/executor-client";
import { BridgeTransport } from "../../app/server/research/executor/http-transport";
import { readResearchPolicyConfiguration } from "../../app/server/research/production-policy";
import { PublicOperationScope } from "../../app/server/research/public-operation-scope";
import { createGuardedD1, createProductionSiteBridgeHandler, createSiteBridgeOperations } from "../../app/server/research/site-bridge-factory";
import { D1SmokeEvidence } from "./evidence";
import type { SmokeSiteEnvironment } from "./environment";
import { SCENARIOS, type SmokeScenario } from "./scenarios";
import { createBridgeFetch } from "./transports";
import { smokeReplayRequestSchema } from "./replay-contract";
import { runSmokeReplay } from "./replay";

const bodySchema = z.object({ scenarioId: z.enum(["long", "after-r2", "after-d1"]) }).strict();
const bridgePaths = new Set(["begin", "accepted", "complete", "metadata", "maintenance", "outbox"]
  .map(operation => `/api/internal/research-bridge/${operation}`));
const count = z.number().int().min(0).max(10_000);
const countsSchema = z.object({ packages: count, imports: count, quotaReserved: count, quotaAccepted: count,
  budgetReservations: count, audits: count }).strict();
type ControlKey = Readonly<{ keyId: string; keyBytes: Uint8Array }>;
class ControlError extends Error {
  constructor(readonly status: 400 | 409 | 503) { super("Smoke unavailable"); }
}
function unavailable(): never { throw new ControlError(503); }
function safeResponse(status: number): Response {
  return Response.json({ code: status === 404 ? "not-found" : "unavailable" }, { status,
    headers: { "cache-control": "no-store" } });
}

function controlKey(environment: SmokeSiteEnvironment, connection: ResearchBridgeConnection): ControlKey {
  const keyId = environment.SMOKE_CONTROL_KEY_ID;
  const secret = environment.SMOKE_CONTROL_SECRET_HEX;
  if (typeof keyId !== "string" || !/^[A-Za-z0-9_-]{1,32}$/u.test(keyId)
    || typeof secret !== "string" || !/^[0-9a-f]{64}$/u.test(secret)
    || new Set([keyId, connection.siteToExecutor.keyId, connection.executorToSite.keyId]).size !== 3) unavailable();
  const keyBytes = Uint8Array.from(secret.match(/../gu)!, byte => Number.parseInt(byte, 16));
  try {
    for (const credential of [connection.siteToExecutor, connection.executorToSite]) {
      const peer = credential.copyKeyBytes();
      try {
        let difference = 0;
        for (let index = 0; index < 32; index++) difference |= peer[index]! ^ keyBytes[index]!;
        if (difference === 0) unavailable();
      } finally { peer.fill(0); }
    }
    return { keyId, keyBytes };
  } catch (error) { keyBytes.fill(0); throw error; }
}

// The suite advances only after production import/accounting has fully settled a successful run.
// The observation row carries identity, never an independent business lifecycle.
const settledJoin = `FROM smoke_scenarios s
  JOIN research_site_executions e ON e.job_id=s.job_id AND e.user_id=s.owner_id AND e.request_id=s.request_id
  JOIN research_runs r ON r.id=e.run_id AND r.user_id=e.user_id AND r.request_id=e.request_id AND r.mutation_id=s.mutation_id
  JOIN research_site_imports i ON i.job_id=e.job_id AND i.run_id=r.id AND i.user_id=r.user_id
    AND i.request_id=e.request_id AND i.request_hash=e.request_hash
  JOIN research_packages p ON p.id=r.package_id AND p.normalized_role_key=r.normalized_role_key
    AND p.locale=r.locale AND p.config_fingerprint=r.config_fingerprint
  JOIN ai_budget_reservations b ON b.id=e.budget_reservation_id AND b.run_id=r.id AND b.request_id=e.request_id
  WHERE s.scenario_id=?1 AND r.execution_mode='cloudflare-workflow-v1' AND r.remote_quota_key=e.quota_key
    AND r.state='ready' AND r.active_slot IS NULL AND r.active_expires_at IS NULL AND i.phase=5
    AND b.status='settled' AND b.settled_micros=1
    AND EXISTS(SELECT 1 FROM quota_ledger q WHERE q.reservation_id=e.quota_reservation_id
      AND q.user_id=e.user_id AND q.idempotency_key=e.quota_key AND q.entry_kind='accepted' AND q.units=1)
    AND EXISTS(SELECT 1 FROM ai_runs a WHERE a.user_id=r.user_id
      AND a.request_id=json_extract(i.audit_json,'$.requestId') AND a.purpose='role-research' AND a.status='accepted')`;

async function claimScenario(db: D1Database, scenario: SmokeScenario): Promise<boolean> {
  const evidence = new D1SmokeEvidence(db);
  if (await evidence.read(scenario.id)) return false;
  const index = SCENARIOS.indexOf(scenario);
  const previous = SCENARIOS[index - 1];
  // A single gated INSERT serializes concurrent starts, including different scenario IDs.
  const prerequisite = previous ? `EXISTS(SELECT 1 ${settledJoin})` : "?1 IS NULL";
  const result = await db.prepare(`INSERT INTO smoke_scenarios (scenario_id,job_id,owner_id,mutation_id,request_id,started_at)
    SELECT ?2,?3,?4,?5,?6,?7 WHERE (SELECT count(*) FROM smoke_scenarios)=?8 AND ${prerequisite}
    ON CONFLICT(scenario_id) DO NOTHING`).bind(previous?.id ?? null, scenario.id, scenario.jobId,
      scenario.ownerId, scenario.mutationId, scenario.requestId, Date.now(), index).run();
  if (result.success !== true || ![0, 1].includes(result.meta.changes)) unavailable();
  if (!await evidence.read(scenario.id)) throw new ControlError(409);
  return result.meta.changes === 1;
}

async function seedFixture(db: D1Database, scenario: SmokeScenario): Promise<void> {
  const seed = (owner: string) => db.prepare(`INSERT INTO users(id,name,email,email_verified)
    VALUES(?1,?1,?2,0) ON CONFLICT(id) DO NOTHING`).bind(owner, `${owner}@example.test`);
  await db.batch([seed(scenario.ownerId), seed(scenario.otherOwnerId),
    db.prepare(`INSERT INTO feature_flags(key,enabled,cohort_json) VALUES('role-research-beta',1,?1)
      ON CONFLICT(key) DO NOTHING`).bind(JSON.stringify({ userIds: SCENARIOS.map(s => s.ownerId) }))]);
}

async function start(environment: SmokeSiteEnvironment, connection: ResearchBridgeConnection,
  db: D1Database, scenario: SmokeScenario, scope: PublicOperationScope): Promise<void> {
  const selection = readResearchPolicyConfiguration(environment);
  if (!selection || selection.executor !== "cloudflare-workflow-v1") unavailable();
  if (!await claimScenario(db, scenario)) return;
  await seedFixture(db, scenario);
  const configuration = selection.configuration;
  const research = new D1ResearchRepository(db, { createJobId: () => scenario.jobId });
  const created = await research.createRemoteOrReplay({
    ownerId: scenario.ownerId, mutationId: scenario.mutationId, requestId: scenario.requestId,
    rawRole: scenario.role, normalizedRoleKey: scenario.role.toLowerCase(), locale: scenario.locale,
    inputFingerprint: fingerprint([scenario.role.toLowerCase(), scenario.locale]),
    configFingerprint: configuration.configFingerprint,
    policy: { cacheDays: configuration.cacheDays, userDailyQuota: configuration.userDailyQuota,
      dailyBudgetMicros: configuration.budget.dailyBudgetMicros,
      monthlyBudgetMicros: configuration.budget.monthlyBudgetMicros, maximumMicros: configuration.budget.maximumMicros },
  });
  if (created.replayed) return; // A committed identity is never re-admitted by control replay.
  const execution = created.execution;
  if (!execution || execution.jobId !== scenario.jobId || execution.ownerId !== scenario.ownerId) unavailable();
  const cohort = await db.prepare("SELECT enabled,cohort_json FROM feature_flags WHERE key='role-research-beta'").first<{ enabled: number; cohort_json: string }>();
  const cohortValue = z.object({ userIds: z.array(z.string()).max(3) }).strict().safeParse(
    cohort ? JSON.parse(cohort.cohort_json) as unknown : null);
  const operations = createSiteBridgeOperations(db, scope.ensure, Date.now);
  const identity = { ownerId: execution.ownerId, runId: execution.runId, requestId: execution.requestId,
    jobId: execution.jobId, requestHash: execution.requestHash };
  const admitted = await operations.admission.admitNew(identity, { newCallsAllowed: true,
    cohortEnabled: cohort?.enabled === 1 && cohortValue.success && cohortValue.data.userIds.includes(scenario.ownerId), rateAllowed: true });
  if (admitted.execution.admissionState !== "admitted") return;
  const executor = new ExecutorBridgeClient(new BridgeTransport({ connection,
    nonces: new D1BridgeNonceStore(db), fetch: createBridgeFetch(environment.SMOKE_EXECUTOR, connection.executorOrigin, "executor"),
    wallNow: Date.now, monoNow: () => performance.now() }));
  try {
    scope.ensure();
    const accepted = await executor.submit(admitted.execution.job, { signal: scope.signal });
    scope.ensure();
    await operations.bridge.recordAcceptance(accepted);
  } catch {
    // Unknown acceptance remains this same identity. Independent production maintenance owns retries.
    scope.ensure();
  }
}

async function identityHash(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

async function status(db: D1Database, scenario: SmokeScenario): Promise<Record<string, unknown>> {
  const observation = await new D1SmokeEvidence(db).read(scenario.id);
  const base = { scenarioId: scenario.id, state: observation ? "initializing" : "not-started", backgroundAccepted: false };
  if (!observation) return base;
  const research = new D1ResearchRepository(db);
  const run = await research.findRecoveryRun({ ownerId: scenario.ownerId, mutationId: scenario.mutationId,
    normalizedRoleKey: scenario.role.toLowerCase(), locale: scenario.locale,
    inputFingerprint: fingerprint([scenario.role.toLowerCase(), scenario.locale]), retryOfRunId: null });
  if (!run) return base;
  const executions = new D1SiteExecutionRepository(db, research);
  const execution = await executions.read(scenario.ownerId, run.id);
  if (!execution || execution.jobId !== scenario.jobId || execution.requestId !== scenario.requestId
    || run.requestId !== scenario.requestId || run.mutationId !== scenario.mutationId) unavailable();
  const acceptance = await new D1SiteBridgeRepository(db, research, executions).readAcceptance(execution);
  const counts = countsSchema.parse(await db.prepare(`SELECT
    (SELECT count(*) FROM research_packages WHERE id=?1) AS packages,
    (SELECT count(*) FROM research_site_imports WHERE job_id=?2) AS imports,
    (SELECT count(*) FROM quota_ledger WHERE user_id=?3 AND idempotency_key=?4 AND entry_kind='reserved') AS quotaReserved,
    (SELECT count(*) FROM quota_ledger WHERE user_id=?3 AND idempotency_key=?4 AND entry_kind='accepted') AS quotaAccepted,
    (SELECT count(*) FROM ai_budget_reservations WHERE run_id=?5 AND request_id=?6) AS budgetReservations,
    (SELECT count(*) FROM ai_runs a JOIN research_site_imports i ON i.user_id=a.user_id
      AND a.request_id=json_extract(i.audit_json,'$.requestId') WHERE i.job_id=?2 AND a.user_id=?3) AS audits`)
    .bind(run.packageId, scenario.jobId, scenario.ownerId, execution.quotaKey, run.id, scenario.requestId).first());
  const settled = await db.prepare(`SELECT 1 AS settled ${settledJoin} LIMIT 1`).bind(scenario.id).first();
  return { scenarioId: scenario.id, state: run.state, backgroundAccepted: acceptance !== null,
    jobId: scenario.jobId, requestHash: execution.requestHash, configFingerprint: run.configFingerprint,
    identity: { ownerHash: await identityHash(scenario.ownerId), mutationHash: await identityHash(scenario.mutationId),
      runHash: await identityHash(run.id) }, startedAt: observation.startedAt, createdAt: run.createdAt,
    queueExpiresAt: execution.job.queueExpiresAt, beganAt: execution.beganAt,
    executionExpiresAt: execution.executionExpiresAt, acceptedAt: acceptance?.workflowAcceptedAt ?? null,
    counts, settled: settled !== null };
}

async function signedResponse(context: BridgeMessageContext, key: ControlKey, value: unknown, code: number,
  scope: PublicOperationScope): Promise<Response> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  if (bytes.byteLength > 4096) unavailable();
  const headers = await scope.run(() => signBridgeMessage({ context: { ...context, kind: "response", status: code },
    body: bytes, ...key, now: Date.now }));
  headers.set("cache-control", "no-store"); headers.set("content-type", "application/json");
  return new Response(bytes, { status: code, headers });
}

async function control(request: Request, environment: SmokeSiteEnvironment, connection: ResearchBridgeConnection,
  path: "/_smoke/start" | "/_smoke/status" | "/_smoke/replay"): Promise<Response> {
  let key: ControlKey;
  try { key = controlKey(environment, connection); } catch { return safeResponse(503); }
  try {
    const context: BridgeMessageContext = { direction: "executor-to-site", kind: "request", method: "POST", path,
      audience: connection.siteOrigin, jobId: "collection", status: null };
    const scope = new PublicOperationScope(() => performance.now());
    const abort = () => scope.finish();
    let errorStatus = 503;
    try {
      request.signal.addEventListener("abort", abort, { once: true });
      if (request.signal.aborted) abort();
      const db = createGuardedD1(environment.SMOKE_SITE_DB, scope.ensure);
      const body = await scope.run(() => readBridgeBody(request, { maxBytes: 4096, timeoutMs: 4500, signal: scope.signal }));
      await scope.run(() => verifyBridgeMessage({ context, body, headers: request.headers, ...key,
        nonces: new D1BridgeNonceStore(db), now: Date.now }));
      let value: unknown;
      if (path === "/_smoke/replay") {
        const parsed = smokeReplayRequestSchema.safeParse(decodeBridgeJson(body));
        if (!parsed.success) throw new ControlError(400);
        value = await scope.run(() => runSmokeReplay({ environment, connection, request: parsed.data, scope }));
      } else {
        const parsed = bodySchema.safeParse(decodeBridgeJson(body));
        if (!parsed.success) throw new ControlError(400);
        const scenario = SCENARIOS.find(s => s.id === parsed.data.scenarioId)!;
        if (path === "/_smoke/start") await scope.run(() => start(environment, connection, db, scenario, scope));
        value = await scope.run(() => status(db, scenario));
      }
      return await signedResponse(context, key, value, 200, scope);
    } catch (error) {
      if (error instanceof ControlError) errorStatus = error.status;
      else if (error instanceof BridgeAuthError && ["unauthorized", "expired", "replay"].includes(error.code)) errorStatus = 401;
      else if (error instanceof BridgeBodyError) errorStatus = error.code === "body-limit" ? 413 : error.code === "invalid-json" ? 400 : 503;
    } finally { request.signal.removeEventListener("abort", abort); scope.finish(); }
    // A fresh short response-only scope has no database capability after the initial phase is fenced.
    const responseScope = new PublicOperationScope(() => performance.now(), 500);
    try { return await signedResponse(context, key, { code: "unavailable" }, errorStatus, responseScope); }
    catch { return safeResponse(503); }
    finally { responseScope.finish(); }
  } finally { key.keyBytes.fill(0); }
}

const worker = {
  async fetch(request: Request, environment: SmokeSiteEnvironment): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (request.method !== "POST" || url.search || url.hash || url.username || url.password || request.headers.has("origin")) return safeResponse(404);
      if (!bridgePaths.has(url.pathname) && url.pathname !== "/_smoke/start" && url.pathname !== "/_smoke/status"
        && url.pathname !== "/_smoke/replay") return safeResponse(404);
      const connection = readResearchBridgeConnection(environment);
      if (!connection) return safeResponse(503);
      if (url.origin !== connection.siteOrigin) return safeResponse(404);
      if (bridgePaths.has(url.pathname)) {
        const bridgeFetch = createBridgeFetch(environment.SMOKE_EXECUTOR, connection.executorOrigin, "executor");
        return await createProductionSiteBridgeHandler({ environment, getD1: () => environment.SMOKE_SITE_DB, fetch: bridgeFetch })(request);
      }
      if (url.pathname === "/_smoke/start" || url.pathname === "/_smoke/status" || url.pathname === "/_smoke/replay") {
        return await control(request, environment, connection, url.pathname);
      }
      return safeResponse(404);
    } catch { return safeResponse(503); }
  },
};
export default worker;
