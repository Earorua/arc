// @vitest-environment node
import { expect, it, vi } from "vitest";
import { CloudService } from "../../app/server/cloud/service";
import { D1CloudRepository } from "../../app/server/cloud/d1-cloud-repository";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { D1PlanningRepository } from "../../app/server/planning/d1-planning-repository";
import { PlanningService } from "../../app/server/planning/service";
import { PlanningSourceResolver } from "../../app/server/planning/source-resolver";
import { D1ResearchRepository, D1PlanningReplayPackageReader } from "../../app/server/research/d1-repository";
import { SiteAdmissionCoordinator } from "../../app/server/research/site-admission";
import { researchSuccessEnvelopeSchema, researchErrorEnvelopeSchema, type ResearchPackage } from "../../app/contracts/research";
import { createResearchPublicFixture } from "../helpers/research-public-fixture";

function planningRequest(packageValue: ResearchPackage, researchRunId: string, mutationId: string) {
  return {
    mutationId,
    source: { source: "research" as const, researchRunId },
    planningDate: "2026-09-15",
    audit: {
      id: `${mutationId}-audit`,
      schemaVersion: "2026.08.1",
      blueprintId: packageValue.blueprint.id,
      blueprintVersion: packageValue.blueprint.version,
      answers: packageValue.blueprint.skills.map(({ id: skillId }) => ({
        skillId,
        level: "conceptual" as const,
        evidenceRefs: [],
      })),
      evidence: [],
      createdBy: "learner" as const,
      inputFingerprint: `${mutationId}-audit-fingerprint`,
    },
    availability: {
      id: `${mutationId}-availability`,
      schemaVersion: "2026.08.1",
      timeZone: "Asia/Shanghai",
      weekdays: {
        monday: 60,
        tuesday: 60,
        wednesday: 60,
        thursday: 60,
        friday: 60,
        saturday: 60,
        sunday: 60,
      },
      exceptions: [],
      weeklyMinutes: 420,
      inputFingerprint: `${mutationId}-availability-fingerprint`,
    },
    target: {
      id: `${mutationId}-target`,
      schemaVersion: "2026.08.1",
      targetWeeks: 18,
      inputFingerprint: `${mutationId}-target-fingerprint`,
    },
    selectedScope: "full-scope" as const,
  };
}

type Fixture = Awaited<ReturnType<typeof createResearchPublicFixture>>;
function accounting(f: Fixture) {
  return { quota: f.siteDb.database.prepare("SELECT * FROM quota_ledger ORDER BY rowid").all(),
    budget: f.siteDb.database.prepare("SELECT * FROM ai_budget_reservations ORDER BY id").all(),
    buckets: f.siteDb.database.prepare("SELECT * FROM ai_budget_buckets ORDER BY id").all() };
}
function planningGraph(f: Fixture) {
  const db = f.siteDb as unknown as D1Database;
  const fallback = vi.fn(async () => { throw new Error("Flagship fallback forbidden"); });
  const sourceResolver = new PlanningSourceResolver({ intelligence: { getPublished: fallback }, flagshipRegistry: flagshipUnitRegistry,
    researchRepository: new D1ResearchRepository(db, { now: f.wallNow }), replayPackageReader: new D1PlanningReplayPackageReader(db) });
  const now = () => new Date(f.wallNow());
  return { fallback, cloud: new CloudService(new D1CloudRepository(db, { now })),
    planning: new PlanningService({ repository: new D1PlanningRepository(db, { sourceResolver, now }), sourceResolver, now }) };
}
async function start(f: Fixture, mutationId: string) {
  const mutation = { role: "Data Product Manager", locale: "en-US", mutationId };
  const response = await f.dispatch(f.request("/api/intelligence/research", mutation), "owner-a");
  expect(response.status).toBe(200);
  const { run } = researchSuccessEnvelopeSchema.parse(await response.json());
  return { mutation, run, job: await f.ownedJob("owner-a", run.id) };
}

it("accepts the first public run before independent work and recovers its persisted result", async () => {
  const f = await createResearchPublicFixture({ wallNow: Date.parse("2026-09-20T12:00:00Z") });
  try {
    expect(f.businessCounts()).toMatchObject({ research_runs: 0, research_site_executions: 0,
      research_site_acceptances: 0, research_executor_jobs: 0, research_executor_results: 0,
      ai_budget_reservations: 0, ai_runs: 0, research_packages: 0 });
    const mutation = { role: "Data Product Manager", locale: "en-US", mutationId: "public-first-run" };
    const response = await f.dispatch(f.request("/api/intelligence/research", mutation), "owner-a");
    expect(response.status).toBe(200);
    const { run } = researchSuccessEnvelopeSchema.parse(await response.json());
    expect(run).toMatchObject({ state: "queued", backgroundAccepted: true });
    expect(f.syntheticProviderCalls()).toBe(0);
    expect(f.workflowCreates()).toBe(1);
    const job = await f.ownedJob("owner-a", run.id);
    expect(f.siteFile).not.toBe(f.executorFile);
    expect(f.siteDb.database.prepare("SELECT job_id,request_hash,workflow_id,workflow_accepted_at FROM research_site_acceptances").get())
      .toEqual({ job_id: job.jobId, request_hash: job.requestHash, workflow_id: job.jobId, workflow_accepted_at: f.wallNow() });
    expect(f.executorDb.database.prepare("SELECT dispatch_state FROM research_executor_jobs").get()).toEqual({ dispatch_state: "unclaimed" });
    await f.reopen();
    await f.runWorkflowBody(job.jobId);
    expect(f.businessCounts().research_executor_results).toBe(1);
    await f.reopen();
    let entered!: () => void;
    let release!: () => void;
    const atCallback = new Promise<void>(resolve => { entered = resolve; });
    const callbackAllowed = new Promise<void>(resolve => { release = resolve; });
    f.setInterceptor("site", "complete", async (_request, dispatch) => { entered(); await callbackAllowed; return dispatch(); });
    const cron = f.runCron();
    let callbackTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([atCallback, cron.then(() => { throw new Error("Cron finished without callback"); }),
        new Promise<never>((_resolve, reject) => { callbackTimer = setTimeout(() => reject(new Error("Callback not reached")), 5000); })]);
      const recovered = await f.dispatch(f.request("/api/intelligence/research/recover", { kind: "start", ...mutation }), "owner-a");
      expect(recovered.status).toBe(200);
      expect(researchSuccessEnvelopeSchema.parse(await recovered.json()).run).toMatchObject({ id: run.id, state: "ready" });
    } finally { clearTimeout(callbackTimer); release(); await cron; f.setInterceptor("site", "complete", null); }
    expect(f.syntheticProviderCalls()).toBe(1);
    expect(f.repairCalls()).toBe(0);
    expect(f.siteKeyReads()).toBe(0);
    expect(f.siteProviderCreates()).toBe(0);
    expect(f.businessCounts()).toMatchObject({ research_runs: 1, research_site_executions: 1, research_site_acceptances: 1,
      research_executor_jobs: 1, research_executor_results: 1, ai_budget_reservations: 1, ai_runs: 1, research_packages: 1, research_site_imports: 1 });
    expect(f.executorDb.database.prepare("SELECT dispatch_state FROM research_executor_jobs").get()).toEqual({ dispatch_state: "claimed" });
    expect(f.siteDb.database.prepare("SELECT sum(units) n FROM quota_ledger WHERE entry_kind='accepted'").get()).toEqual({ n: 1 });
    expect(f.siteDb.database.prepare("SELECT status,settled_micros FROM ai_budget_reservations").get()).toEqual({ status: "settled", settled_micros: 100000 });
    expect(f.siteDb.database.prepare("SELECT phase FROM research_site_imports").get()).toEqual({ phase: 5 });
    const counts = f.businessCounts(); const settled = accounting(f); const cursors = f.collectionCursors();
    const beforeTraffic = f.traffic.length;
    const admit = vi.spyOn(SiteAdmissionCoordinator.prototype, "admitNew");
    try {
      expect((await f.dispatch(f.request("/api/intelligence/research/" + run.id), "owner-b")).status).toBe(404);
      expect((await f.dispatch(f.request("/api/intelligence/research/recover", { kind: "start", ...mutation }), "owner-b")).status).toBe(404);
      expect(f.traffic).toHaveLength(beforeTraffic);
      for (let i = 0; i < 2; i++) {
        expect((await f.dispatch(f.request("/api/intelligence/research/" + run.id), "owner-a")).status).toBe(200);
        expect((await f.dispatch(f.request("/api/intelligence/research/recover", { kind: "start", ...mutation }), "owner-a")).status).toBe(200);
      }
      expect(admit).not.toHaveBeenCalled();
      expect(f.traffic.slice(beforeTraffic).filter(t => ["submit", "begin"].includes(t.operation))).toEqual([]);
      expect(f.collectionCursors()).toEqual(cursors);
    } finally { admit.mockRestore(); }
    expect(f.businessCounts()).toEqual(counts); expect(accounting(f)).toEqual(settled);
    await f.reopen();
    expect(f.businessCounts()).toEqual(counts); expect(accounting(f)).toEqual(settled);
    const packageValue = await f.research.resolveReadyPackage("owner-a", run.id);
    const graph = planningGraph(f);
    const activated = await graph.cloud.importLocalState("owner-a", { migrationId: "public-activate", consent: true,
      conflictResolution: "reject", intent: "research-setup", state: {
        setup: { roleId: packageValue.blueprint.id, level: "beginner", weeklyMinutes: 420, targetWeeks: 18 }, completedUnitIds: [], proofs: [] } });
    expect(activated.activeGoalId).toBeTruthy();
    const planRequest = { ...planningRequest(packageValue, run.id, "public-plan"), planningDate: "2026-09-20" };
    const generated = await graph.planning.generateResponse("owner-a", planRequest);
    expect(generated.result.workspace.dailyUnits.length).toBeGreaterThan(0);
    expect(generated.sourceContext?.reference).toEqual({ source: "research", researchRunId: run.id, packageId: packageValue.id,
      blueprintId: packageValue.blueprint.id, blueprintVersion: packageValue.blueprint.version,
      registryId: packageValue.registry.id, registryVersion: packageValue.registry.version,
      configFingerprint: job.job.configFingerprint, contentFingerprint: packageValue.contentFingerprint });
    expect(graph.fallback).not.toHaveBeenCalled();
    await f.reopen();
    const newGraph = planningGraph(f);
    expect(await newGraph.planning.getWorkspaceResponse("owner-a")).toEqual({ workspace: generated.result.workspace, sourceContext: generated.sourceContext });
    await expect(newGraph.planning.getWorkspaceResponse("owner-b")).rejects.toMatchObject({ name: "PlanningNotFoundError" });
    const cloudWorkspace = await newGraph.cloud.getWorkspace("owner-a");
    expect(cloudWorkspace).not.toBeNull();
    if (!cloudWorkspace) throw new Error("Expected reopened owner workspace");
    expect(cloudWorkspace.activeGoalId).toBe(activated.activeGoalId);
    expect(await newGraph.planning.generateResponse("owner-a", planRequest)).toEqual(generated);
    expect(newGraph.fallback).not.toHaveBeenCalled();
    const beforeCache = f.businessCounts();
    const cachedResponse = await f.dispatch(f.request("/api/intelligence/research", { ...mutation, mutationId: "public-owner-b-cache" }), "owner-b");
    expect(cachedResponse.status).toBe(200);
    expect(researchSuccessEnvelopeSchema.parse(await cachedResponse.json()).run.state).toBe("ready");
    expect(f.businessCounts()).toMatchObject({ ...beforeCache, research_runs: 2, research_site_executions: 2 });
    expect(f.siteDb.database.prepare("SELECT admission_state,close_reason,quota_reservation_id,budget_reservation_id FROM research_site_executions WHERE user_id='owner-b'").get())
      .toEqual({ admission_state: "closed", close_reason: "cached", quota_reservation_id: null, budget_reservation_id: null });
    expect(accounting(f)).toEqual(settled); expect(f.syntheticProviderCalls()).toBe(1); expect(f.workflowCreates()).toBe(1);
    f.setWallNow(f.wallNow() + 60000);
    f.siteDb.database.prepare("UPDATE feature_flags SET cohort_json=?1 WHERE key='role-research-beta'").run(JSON.stringify({ userIds: ["owner-a"] }));
    const deniedCache = await f.dispatch(f.request("/api/intelligence/research", { ...mutation, mutationId: "public-owner-b-denied-cache" }), "owner-b");
    expect(deniedCache.status).toBe(429);
    expect(researchErrorEnvelopeSchema.parse(await deniedCache.json()).error.code).toBe("ALLOWANCE_REACHED");
    expect(f.businessCounts()).toMatchObject({ ...beforeCache, research_runs: 2, research_site_executions: 2 });
    expect(accounting(f)).toEqual(settled);
    expect(f.siteKeyReads()).toBe(0); expect(f.siteProviderCreates()).toBe(0);
  } finally { await f.dispose(); }
}, 30_000);

it("keeps owner-authorized acceptance visible with gates and bridge closed, without new calls", async () => {
  const f = await createResearchPublicFixture();
  try {
    const { run, mutation } = await start(f, "public-closed-config");
    f.setNewCallsAllowed(false); f.setBridgeEnabled(false);
    const before = f.businessCounts(); const cursors = f.collectionCursors(); const traffic = f.traffic.length;
    const recovered = await f.dispatch(f.request("/api/intelligence/research/recover", { kind: "start", ...mutation }), "owner-a");
    expect(recovered.status).toBe(200);
    expect(researchSuccessEnvelopeSchema.parse(await recovered.json()).run).toMatchObject({ id: run.id, state: "queued", backgroundAccepted: true });
    expect((await f.dispatch(f.request("/api/intelligence/research", { ...mutation, mutationId: "public-blocked-start" }), "owner-a")).status).toBe(503);
    expect(f.traffic).toHaveLength(traffic); expect(f.businessCounts()).toEqual(before); expect(f.collectionCursors()).toEqual(cursors);
    expect(f.syntheticProviderCalls()).toBe(0); expect(f.siteKeyReads()).toBe(0); expect(f.siteProviderCreates()).toBe(0);
  } finally { await f.dispose(); }
}, 30000);

it("enforces actual public session, input, Origin and shared IP rate gates before creating more work", async () => {
  const f = await createResearchPublicFixture();
  try {
    const mutation = { role: "Data Product Manager", locale: "en-US", mutationId: "public-real-http-gates" };
    expect((await f.dispatch(f.request("/api/intelligence/research", mutation), null)).status).toBe(401);
    expect((await f.dispatch(f.request("/api/intelligence/research", { ...mutation, ownerId: "owner-b", model: "client-choice" }), "owner-a")).status).toBe(400);
    const foreignOrigin = f.request("/api/intelligence/research", mutation);
    foreignOrigin.headers.set("origin", "https://foreign.test");
    expect((await f.dispatch(foreignOrigin, "owner-a")).status).toBe(400);
    expect(f.businessCounts().research_runs).toBe(0);
    const first = await f.dispatch(f.request("/api/intelligence/research", mutation), "owner-a");
    expect(first.status).toBe(200); const firstRun = researchSuccessEnvelopeSchema.parse(await first.json()).run;
    const replay = await f.dispatch(f.request("/api/intelligence/research", mutation), "owner-a");
    expect(replay.status).toBe(200); expect(researchSuccessEnvelopeSchema.parse(await replay.json()).run.id).toBe(firstRun.id);
    const ipDenied = await f.dispatch(f.request("/api/intelligence/research", { ...mutation, mutationId: "public-shared-ip-denied" }), "owner-b");
    expect(ipDenied.status).toBe(429); expect(researchErrorEnvelopeSchema.parse(await ipDenied.json()).error.code).toBe("RATE_LIMITED");
    expect(f.businessCounts()).toMatchObject({ research_runs: 1, research_site_executions: 1, research_executor_jobs: 1, ai_budget_reservations: 1 });
    expect(f.syntheticProviderCalls()).toBe(0); expect(f.workflowCreates()).toBe(1);
    expect(f.siteKeyReads()).toBe(0); expect(f.siteProviderCreates()).toBe(0);
  } finally { await f.dispose(); }
}, 30000);

it("expires an accepted unbegun public queue without starting a Provider or moving either collection cursor", async () => {
  const f = await createResearchPublicFixture();
  try {
    const { run, job } = await start(f, "public-expired-queue");
    f.setWallNow(job.job.queueExpiresAt + 1);
    const cursors = f.collectionCursors(); const traffic = f.traffic.length;
    const response = await f.dispatch(f.request("/api/intelligence/research/" + run.id), "owner-a");
    expect(response.status).toBe(200); expect(researchSuccessEnvelopeSchema.parse(await response.json()).run.state).toBe("failed");
    expect(f.siteDb.database.prepare("SELECT status,settled_micros FROM ai_budget_reservations").get()).toEqual({ status: "released", settled_micros: 0 });
    expect(f.collectionCursors()).toEqual(cursors); expect(f.traffic).toHaveLength(traffic);
    expect(f.syntheticProviderCalls()).toBe(0); expect(f.workflowCreates()).toBe(1);
  } finally { await f.dispose(); }
}, 30000);

it("bounds a real signed result body by the time remaining after status and fences late body release", async () => {
  const f = await createResearchPublicFixture();
  let release: (() => void) | undefined;
  try {
    const { run, job } = await start(f, "public-result-body-stall");
    await f.runWorkflowBody(job.jobId); await f.reopen();
    const before = f.businessCounts(); const settled = accounting(f); const cursors = f.collectionCursors();
    const siteNonces = () => (f.siteDb.database.prepare("SELECT count(*) n FROM research_bridge_nonces").get() as { n: number }).n;
    const initialNonces = siteNonces();
    let bodyEntered = false; let cancelled = false;
    const observed: { signal?: AbortSignal } = {};
    f.setInterceptor("executor", "status", async (_request, dispatch) => {
      // Leave time for real signature/nonce/metadata and R2 work under concurrent test load.
      // A fresh4500ms result budget would still violate the observed wall bound below.
      const response = await dispatch(); f.setMonoNow(f.monoNow() + 3500); return response;
    });
    f.setInterceptor("executor", "result", async (request, dispatch) => {
      observed.signal = request.signal;
      const response = await dispatch(); const bytes = new Uint8Array(await response.arrayBuffer());
      return new Response(new ReadableStream<Uint8Array>({ start(controller) {
        bodyEntered = true; controller.enqueue(bytes.slice(0, 1));
        release = () => { if (!cancelled) { controller.enqueue(bytes.slice(1)); controller.close(); } };
      }, cancel() { cancelled = true; } }), { status: response.status, headers: response.headers });
    });
    const started = performance.now();
    const response = await f.dispatch(f.request("/api/intelligence/research/" + run.id), "owner-a");
    expect(response.status).toBe(200); expect(researchSuccessEnvelopeSchema.parse(await response.json()).run.state).toBe("researching");
    expect(bodyEntered).toBe(true); expect(performance.now() - started).toBeLessThan(2500);
    expect(observed.signal?.aborted).toBe(true); expect(cancelled).toBe(true);
    expect(siteNonces()).toBe(initialNonces + 1); // status verified; incomplete result never claims its response nonce.
    const queries = f.siteDb.preparedSql.length;
    release?.(); await new Promise(resolve => setTimeout(resolve, 25));
    expect(f.siteDb.preparedSql.length).toBe(queries);
    expect(siteNonces()).toBe(initialNonces + 1);
    expect(f.businessCounts()).toEqual(before); expect(accounting(f)).toEqual(settled); expect(f.collectionCursors()).toEqual(cursors);
    expect(f.syntheticProviderCalls()).toBe(1); expect(f.repairCalls()).toBe(0);
    f.setInterceptor("executor", "status", null); f.setInterceptor("executor", "result", null);
    const resumed = await f.dispatch(f.request("/api/intelligence/research/" + run.id), "owner-a");
    expect(resumed.status).toBe(200); expect(researchSuccessEnvelopeSchema.parse(await resumed.json()).run.state).toBe("ready");
    expect(f.syntheticProviderCalls()).toBe(1);
  } finally { release?.(); await f.dispose(); }
}, 30000);
