import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { requireArcUser } from "../../app/server/auth/session";
import { CloudService } from "../../app/server/cloud/service";
import { D1CloudRepository } from "../../app/server/cloud/d1-cloud-repository";
import { createWorkspaceHandlers, createMigrationHandler, createLearningEventHandler } from "../../app/server/http/cloud-route-factories";
import { createPlanningWorkspaceHandler, createPlanningGenerateHandler, createPlanningEventHandler, createPlanningReplanHandler } from "../../app/server/http/planning-route-factories";
import { createProofWorkspaceHandler, createProofCreateHandler, createProofReviseHandler, createProofWithdrawHandler, createProofVisibilityHandler } from "../../app/server/http/proof-route-factories";
import { D1RateLimiter } from "../../app/server/http/rate-limit";
import { D1OperationalEventSink } from "../../app/server/observability/d1-events";
import { BuiltinIntelligenceRepository } from "../../app/server/intelligence/builtin-repository";
import { IntelligenceService } from "../../app/server/intelligence/service";
import { PlanningSourceResolver } from "../../app/server/planning/source-resolver";
import { D1PlanningRepository } from "../../app/server/planning/d1-planning-repository";
import { PlanningService } from "../../app/server/planning/service";
import { D1ProofRepository } from "../../app/server/proof/d1-proof-repository";
import { ProofService } from "../../app/server/proof/service";
import { D1ResearchRepository, D1PlanningReplayPackageReader } from "../../app/server/research/d1-repository";

import { createResearchPublicFixture } from "../helpers/research-public-fixture";

/** Isolated empty business storage; all public/domain/private handlers remain production code. */
export async function createResearchPublicComposition(origin: string) {
  const f = await createResearchPublicFixture({ publicOrigin: origin });
  const settings = { mode: "ready", disabled: false, exhausted: false };
  const now = () => new Date(f.wallNow());
  const milliseconds = f.wallNow;
  // Reconstruct each public graph from the current handle, including after a storage restart.
  function cloudRoutes(owner: string | null) {
    const db = f.siteDb as unknown as D1Database;
    const repository = new D1ResearchRepository(db, { now: milliseconds });
    const sourceResolver = new PlanningSourceResolver({ intelligence: new IntelligenceService(new BuiltinIntelligenceRepository()),
      flagshipRegistry: flagshipUnitRegistry, researchRepository: repository, replayPackageReader: new D1PlanningReplayPackageReader(db) });
    const planningRepository = new D1PlanningRepository(db, { sourceResolver, now });
    const planning = new PlanningService({ repository: planningRepository, sourceResolver, now });
    const cloud = new CloudService(new D1CloudRepository(db, { now }));
    const proof = new ProofService({ repository: new D1ProofRepository(db, milliseconds), blueprint: flagshipBlueprint, registry: flagshipUnitRegistry,
      planningSource: { repository: planningRepository, resolver: sourceResolver }, now });

    const events = new D1OperationalEventSink(db);
    const shared = {
      requireUser: (headers: Headers) => requireArcUser(headers, async () => owner === "owner-a" || owner === "owner-b"
        ? { user: { id: owner, name: owner, email: owner + "@example.test" } } : null),
      rateLimiter: new D1RateLimiter(db, { now: milliseconds }), recordEvent: events.record.bind(events), now: milliseconds,
    };
    const cloudDeps = { ...shared, createService: () => cloud };
    const planningDeps = { ...shared, createService: () => planning };
    const proofDeps = { ...shared, createService: () => proof };
    const workspace = createWorkspaceHandlers(cloudDeps);
    const routes: Record<string, (request: Request) => Promise<Response>> = {
      "GET /api/workspace": workspace.GET, "PUT /api/workspace": workspace.PUT,
      "POST /api/migrations/local-state": createMigrationHandler(cloudDeps),
      "POST /api/learning/events": createLearningEventHandler(cloudDeps),
      "GET /api/planning/workspace": createPlanningWorkspaceHandler(planningDeps),
      "POST /api/planning/generate": createPlanningGenerateHandler(planningDeps),
      "POST /api/planning/events": createPlanningEventHandler(planningDeps),
      "POST /api/planning/replans/accept": createPlanningReplanHandler(planningDeps, "accept"),
      "POST /api/planning/replans/discard": createPlanningReplanHandler(planningDeps, "discard"),
      "GET /api/proofs/workspace": createProofWorkspaceHandler(proofDeps),
      "POST /api/proofs": createProofCreateHandler(proofDeps),
    };
    return async (request: Request) => {
      const path = new URL(request.url).pathname;
      const handler = routes[`${request.method} ${path}`];
      if (handler) return handler(request);
      const proofPath = /^\/api\/proofs\/([a-z0-9-]+)\/(versions|withdraw|visibility)$/u.exec(path);
      if (proofPath && request.method === "POST") {
        const factory = { versions: createProofReviseHandler, withdraw: createProofWithdrawHandler, visibility: createProofVisibilityHandler }[proofPath[2] as "versions" | "withdraw" | "visibility"];
        return factory(proofDeps, proofPath[1])(request);
      }
      if (request.method === "GET" && path === "/api/auth/providers") return Response.json({ providers: [] });
      if (request.method === "GET" && path === "/api/account-link/status") return Response.json({ stage: null, targetProvider: null, expiresAt: null });
      return Response.json({ error: "Unknown offline API route" }, { status: 404 });
    };

  }
  const ownedJob = async (owner: string | null, runId: string) => {
    if (owner !== "owner-a" && owner !== "owner-b") throw new Error("Owner required");
    return f.ownedJob(owner, runId);
  };
  async function workflow(owner: string | null, runId: string) {
    const execution = await ownedJob(owner, runId);
    await f.runWorkflowBody(execution.jobId);
  }
  async function resume(owner: string | null) {
    if (owner !== "owner-a" && owner !== "owner-b") throw new Error("Owner required");
    const runs = f.siteDb.database.prepare("SELECT id FROM research_runs WHERE user_id=?1 AND execution_mode='cloudflare-workflow-v1' AND state IN ('queued','researching','validating') ORDER BY created_at").all(owner) as Array<{ id: string }>;
    for (const run of runs) await workflow(owner, run.id);
    await f.runCron();
  }
  return {
    get db() { return f.siteDb; },
    dispatch: (request: Request) => {
      const owner = request.headers.get("x-arc-uat-owner");
      return new URL(request.url).pathname.startsWith("/api/intelligence/research") ? f.dispatch(request, owner) : cloudRoutes(owner)(request);
    },
    workflow, resume, cron: f.runCron, reopen: f.reopen, dispose: f.dispose,
    configure: (input: { mode?: string; disabled?: boolean; exhausted?: boolean }) => {
      if (input.mode !== undefined && input.mode !== "ready" || input.exhausted !== undefined && input.exhausted !== false
        || input.disabled !== undefined && typeof input.disabled !== "boolean") throw new Error("Unsupported durable configuration");
      if (input.disabled !== undefined) { settings.disabled = input.disabled; f.setNewCallsAllowed(!input.disabled); }
    },
    diagnostics: async () => {
      const db = f.siteDb.database;
      const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
      return {
        composition: "public-durable", database: "Two persistent disposable SQLite files and local R2",
        settings: { ...settings }, counts: f.businessCounts(),
        counters: { syntheticProviderCalls: f.syntheticProviderCalls(), repairCalls: f.repairCalls(),
          siteKeyReads: f.siteKeyReads(), siteProviderCreates: f.siteProviderCreates(), workflowCreates: f.workflowCreates() },
        accounting: { acceptedQuotaUnits: n("SELECT coalesce(sum(units),0) n FROM quota_ledger WHERE entry_kind='accepted'"),
          settledMicros: n("SELECT coalesce(sum(settled_micros),0) n FROM ai_budget_reservations"),
          completedImports: n("SELECT count(*) n FROM research_site_imports WHERE phase=5") },
        goals: db.prepare("SELECT user_id,role_id FROM career_goals WHERE active_slot=1 ORDER BY user_id").all(),
        runs: db.prepare("SELECT id,user_id,state,retryable FROM research_runs ORDER BY created_at DESC LIMIT 8").all(), paused: null,
      };
    },
  };
}
