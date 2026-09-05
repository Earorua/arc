import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { requireArcUser } from "../../app/server/auth/session";
import { CloudService } from "../../app/server/cloud/service";
import { D1CloudRepository } from "../../app/server/cloud/d1-cloud-repository";
import { D1AiRunSink } from "../../app/server/ai/d1-run-recorder";
import { D1FeatureCohort } from "../../app/server/entitlements/d1-feature-cohort";
import { D1EntitlementRepository } from "../../app/server/entitlements/d1-entitlement-repository";
import { EntitlementGate } from "../../app/server/entitlements/policy";
import { createWorkspaceHandlers, createMigrationHandler, createLearningEventHandler } from "../../app/server/http/cloud-route-factories";
import { createResearchEligibilityHandler } from "../../app/server/http/research-eligibility-route";
import { createResearchStartHandler, createResearchGetHandler, createResearchRetryHandler } from "../../app/server/http/research-route-factories";
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
import { D1ResearchBudgetRepository } from "../../app/server/research/d1-budget-repository";
import { FakeResearchProvider } from "../../app/server/research/fake-provider";
import { RESEARCH_PROVIDER_VERSIONS, ResearchProviderError, type ResearchProvider } from "../../app/server/research/provider";
import { ResearchOrchestrator } from "../../app/server/research/orchestrator";
import type { TransitionResearchRunCommand } from "../../app/server/research/repository";

export const OFFLINE_OWNERS = ["owner-a", "owner-b"] as const;
export const OFFLINE_MODES = ["ready", "needs-review", "failed", "repair", "timeout", "filtered"] as const;
export type OfflineMode = typeof OFFLINE_MODES[number];

/** A fresh, disposable DB is supplied by the caller; no production runtime is used. */
export async function createOfflineComposition(db: D1Database, origin: string) {
  const now = () => new Date();
  const milliseconds = () => now().getTime();
  for (const owner of OFFLINE_OWNERS) await db.prepare("INSERT OR IGNORE INTO users (id,name,email,email_verified) VALUES (?1,?1,?2,0)").bind(owner, `${owner}@example.test`).run();
  await db.prepare("INSERT OR REPLACE INTO feature_flags (key,enabled,cohort_json) VALUES ('role-research-beta',1,?1)").bind(JSON.stringify({ userIds: OFFLINE_OWNERS })).run();
  let paused: { stage: "researching" | "validating"; id: string | null; reached(id: string): void; wait: Promise<void>; release(): void } | null = null;
  const jobs = new Set<Promise<unknown>>();
  let currentRunId: string | null = null;
  async function pauseAt(stage: "researching" | "validating", id: string) {
    if (paused?.stage !== stage || paused.id !== null) return;
    paused.id = id; paused.reached(id); await paused.wait;
  }
  class PausableRepository extends D1ResearchRepository {
    override async transition(command: TransitionResearchRunCommand) {
      const result = await super.transition(command);
      if (command.to === "researching") currentRunId = result.id;
      if (command.to === "validating") await pauseAt("validating", result.id);
      return result;
    }
  }
  const repository = new PausableRepository(db, { now: milliseconds });
  const settings = { mode: "ready" as OfflineMode, disabled: false, exhausted: false };
  const counters = { researchInvocations: 0, fakeResearchCalls: 0, fakeRepairCalls: 0 };
  const provider: ResearchProvider = {
    research: async (request) => {
      counters.researchInvocations++;
      if (currentRunId) await pauseAt("researching", currentRunId);
      if (settings.mode === "timeout") throw new ResearchProviderError("timeout", true, false);
      if (settings.mode === "filtered") throw new ResearchProviderError("filtered", false, false);
      counters.fakeResearchCalls++;
      return new FakeResearchProvider({ mode: settings.mode }).research(request);
    },
    repair: async (request) => {
      counters.fakeRepairCalls++;
      return new FakeResearchProvider({ mode: "repair" }).repair(request);
    },
  };
  const entitlements = new EntitlementGate(new D1EntitlementRepository(db, { now: milliseconds }), {
    ARC_AI_ENABLED: "true", ARC_AI_USER_DAILY_QUOTA: "100", ARC_AI_RATE_LIMIT_PER_MINUTE: "100",
  }, { now });
  const createResearch = () => new ResearchOrchestrator({ repository, provider,
    budget: new D1ResearchBudgetRepository(db, { now: milliseconds }), entitlements,
    audits: new D1AiRunSink(db, { now: milliseconds }), now: milliseconds,
    config: { configFingerprint: "offline-fake-config-v1", providerName: "deterministic-mock",
      versions: { ...RESEARCH_PROVIDER_VERSIONS, blueprintVersion: "2026.08.1", registryVersion: "2026.08.1", templateVersion: "2026.08.1" },
      activeTtlMs: 3_600_000, cacheDays: 7,
      budget: { dailyBudgetMicros: settings.exhausted ? 0 : 100_000, monthlyBudgetMicros: 1_000_000, maximumMicros: 1200, researchMaximumMicros: 1000, repairMaximumMicros: 200 },
    },
  });
  const sourceResolver = new PlanningSourceResolver({ intelligence: new IntelligenceService(new BuiltinIntelligenceRepository()),
    flagshipRegistry: flagshipUnitRegistry, researchRepository: repository, replayPackageReader: new D1PlanningReplayPackageReader(db) });
  const planningRepository = new D1PlanningRepository(db, { sourceResolver, now });
  const planning = new PlanningService({ repository: planningRepository, sourceResolver, now });
  const cloud = new CloudService(new D1CloudRepository(db, { now }));
  const proof = new ProofService({ repository: new D1ProofRepository(db, milliseconds), blueprint: flagshipBlueprint, registry: flagshipUnitRegistry,
    planningSource: { repository: planningRepository, resolver: sourceResolver }, now });
  const cohort = new D1FeatureCohort(db);
  const shared = {
    requireUser: (headers: Headers) => requireArcUser(headers, async () => {
      const owner = headers.get("x-arc-uat-owner");
      return OFFLINE_OWNERS.some((id) => id === owner) ? { user: { id: owner, name: owner, email: `${owner}@example.test` } } : null;
    }),
    rateLimiter: new D1RateLimiter(db, { now: milliseconds }),
    recordEvent: new D1OperationalEventSink(db).record.bind(new D1OperationalEventSink(db)),
    now: milliseconds,
  };
  const cloudDeps = { ...shared, createService: () => cloud };
  const planningDeps = { ...shared, createService: () => planning };
  const proofDeps = { ...shared, createService: () => proof };
  const researchDeps = { ...shared, createReadService: createResearch, createWriteService: () => settings.disabled ? null : createResearch(),
    cohortEnabled: (owner: string) => cohort.allows("role-research-beta", owner), configuredOrigin: () => origin,
    deriveIpSubject: async () => "offline-loopback-ip", rateLimitPerMinute: () => 100,
  };
  const workspace = createWorkspaceHandlers(cloudDeps);
  const routes: Record<string, (request: Request) => Promise<Response>> = {
    "GET /api/workspace": workspace.GET, "PUT /api/workspace": workspace.PUT,
    "POST /api/migrations/local-state": createMigrationHandler(cloudDeps),
    "POST /api/learning/events": createLearningEventHandler(cloudDeps),
    "GET /api/intelligence/research/eligibility": createResearchEligibilityHandler({ ...shared, configured: () => !settings.disabled, cohortEnabled: researchDeps.cohortEnabled }),
    "POST /api/intelligence/research": createResearchStartHandler(researchDeps),
    "GET /api/planning/workspace": createPlanningWorkspaceHandler(planningDeps),
    "POST /api/planning/generate": createPlanningGenerateHandler(planningDeps),
    "POST /api/planning/events": createPlanningEventHandler(planningDeps),
    "POST /api/planning/replans/accept": createPlanningReplanHandler(planningDeps, "accept"),
    "POST /api/planning/replans/discard": createPlanningReplanHandler(planningDeps, "discard"),
    "GET /api/proofs/workspace": createProofWorkspaceHandler(proofDeps),
    "POST /api/proofs": createProofCreateHandler(proofDeps),
  };
  async function dispatch(request: Request) {
    const path = new URL(request.url).pathname;
    const handler = routes[`${request.method} ${path}`];
    if (handler) return handler(request);
    const researchPath = /^\/api\/intelligence\/research\/([a-z0-9-]+)(\/retry)?$/u.exec(path);
    if (researchPath && request.method === (researchPath[2] ? "POST" : "GET")) {
      return (researchPath[2] ? createResearchRetryHandler(researchDeps, researchPath[1]) : createResearchGetHandler(researchDeps, researchPath[1]))(request);
    }
    const proofPath = /^\/api\/proofs\/([a-z0-9-]+)\/(versions|withdraw|visibility)$/u.exec(path);
    if (proofPath && request.method === "POST") {
      const factory = { versions: createProofReviseHandler, withdraw: createProofWithdrawHandler, visibility: createProofVisibilityHandler }[proofPath[2] as "versions" | "withdraw" | "visibility"];
      return factory(proofDeps, proofPath[1])(request);
    }
    if (request.method === "GET" && path === "/api/auth/providers") return Response.json({ providers: [] });
    if (request.method === "GET" && path === "/api/account-link/status") return Response.json({ stage: null, targetProvider: null, expiresAt: null });
    return Response.json({ error: "Unknown offline API route" }, { status: 404 });
  }
  async function resume() {
    paused?.release();
    await Promise.allSettled([...jobs]);
    paused = null;
  }
  async function prestart(owner: string, stage: "researching" | "validating") {
    if (paused || !OFFLINE_OWNERS.some((id) => id === owner) || !["researching", "validating"].includes(stage)) throw new Error("Invalid offline prestart");
    let release!: () => void;
    let reached!: (id: string) => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const at = new Promise<string>((resolve) => { reached = resolve; });
    paused = { stage, id: null, reached, wait, release };
    const job = createResearch().start(owner, { role: "Data Product Manager", locale: "en-US", mutationId: crypto.randomUUID() }, { cohortEnabled: true, rateAllowed: true });
    jobs.add(job);
    void job.finally(() => jobs.delete(job)).catch(() => undefined);
    try {
      return await Promise.race([at, job.then(() => { throw new Error("Run completed before pause; reset the scenario first"); })]);
    } catch (error) { paused = null; release(); throw error; }
  }
  async function diagnostics() {
    const counts: Record<string, number> = {};
    for (const table of ["career_goals", "planning_workspaces", "planning_events", "learning_events", "proof_items", "proof_versions", "migration_runs", "research_runs", "ai_runs"]) {
      const row = await db.prepare(`SELECT count(*) count FROM ${table}`).first<{ count: number }>();
      counts[table] = row?.count ?? 0;
    }
    const goals = (await db.prepare("SELECT user_id,role_id FROM career_goals WHERE active_slot=1 ORDER BY user_id").all()).results;
    const runs = (await db.prepare("SELECT id,user_id,state,retryable FROM research_runs ORDER BY created_at DESC LIMIT 8").all()).results;
    return { database: "Disposable SQLite implementing the D1 interface", settings: { ...settings }, counters: { ...counters }, counts, goals, runs, paused: paused?.id ? { stage: paused.stage, runId: paused.id } : null };
  }
  return { dispatch, db, createResearch, repository, cloud, planning, proof, sourceResolver, counters, settings,
    prestart, resume, dispose: resume, diagnostics,
    configure: (input: { mode?: string; disabled?: boolean; exhausted?: boolean }) => {
      if (input.mode !== undefined) {
        if (!OFFLINE_MODES.some((mode) => mode === input.mode)) throw new Error("Invalid offline mode");
        settings.mode = input.mode as OfflineMode;
      }
      for (const name of ["disabled", "exhausted"] as const) if (input[name] !== undefined) {
        if (typeof input[name] !== "boolean") throw new Error("Invalid offline switch");
        settings[name] = input[name];
      }
    },
  };
}
