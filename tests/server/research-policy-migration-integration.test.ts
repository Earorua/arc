import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { D1CloudRepository } from "../../app/server/cloud/d1-cloud-repository";
import { CloudService } from "../../app/server/cloud/service";
import { D1PlanningRepository } from "../../app/server/planning/d1-planning-repository";
import { PlanningService } from "../../app/server/planning/service";
import { PlanningSourceResolver } from "../../app/server/planning/source-resolver";
import { D1PlanningReplayPackageReader, D1ResearchRepository } from "../../app/server/research/d1-repository";
import {
  createKimiLocalValidationProvider,
  OpenRouterResearchProvider,
  type OpenRouterResearchConfig,
} from "../../app/server/research/openrouter-provider";
import {
  createResearchServiceFactory,
  readResearchProductionConfiguration,
  type ResearchProductionEnvironment,
  type ResearchServiceFactoryRuntime,
} from "../../app/server/research/service-factory";
import { candidateWithMissingCitations } from "../fixtures/research/invalid-candidates";
import { validAnnotations, validResearchCandidate } from "../fixtures/research/valid-candidate";
import { createResearchD1, seedUser, type SqliteD1 } from "../helpers/sqlite-d1";

const legacyEnvironment: ResearchProductionEnvironment = {
  ARC_ENVIRONMENT: "test",
  BETTER_AUTH_URL: "https://arc.example",
  ARC_AI_ENABLED: "true",
  ARC_AI_RESEARCH_ENABLED: "true",
  ARC_AI_USER_DAILY_QUOTA: "3",
  ARC_AI_RATE_LIMIT_PER_MINUTE: "2",
  ARC_AI_MODEL_RESEARCH: "test/research-fixed",
  ARC_AI_MODEL_ECONOMY: "test/economy-fixed",
  ARC_AI_RESEARCH_TIMEOUT_MS: "20000",
  ARC_AI_REPAIR_TIMEOUT_MS: "10000",
  ARC_AI_RESEARCH_CACHE_DAYS: "14",
  ARC_AI_SITE_DAILY_BUDGET_MICROS: "20000000",
  ARC_AI_SITE_MONTHLY_BUDGET_MICROS: "100000000",
  ARC_AI_RESEARCH_MAX_COST_MICROS: "1200",
  ARC_AI_REPAIR_MAX_COST_MICROS: "300",
  ARC_AI_IP_HASH_SALT: "synthetic-test-salt-value",
  OPENROUTER_API_KEY: "synthetic-dummy-credential",
};

const newEnvironment: ResearchProductionEnvironment = {
  ...legacyEnvironment,
  ARC_AI_RESEARCH_PROFILE: "kimi-low-output32k-v3",
  ARC_AI_MODEL_RESEARCH: "moonshotai/kimi-k3",
  ARC_AI_RESEARCH_TIMEOUT_MS: "1200000",
  ARC_AI_RESEARCH_MAX_COST_MICROS: "5000000",
  ARC_AI_REPAIR_MAX_COST_MICROS: "0",
};

const owner = "owner-policy-integration";
const otherOwner = "owner-policy-cache";
const role = "Data Product Manager";
const locale = "en-US" as const;
const baseNow = Date.parse("2026-09-13T00:00:00.000Z");
const gate = { cohortEnabled: true, rateAllowed: true };

type CapturedRequest = Readonly<{
  url: string;
  init: RequestInit;
  body: Record<string, unknown>;
}>;

function responseFor(candidate: unknown = validResearchCandidate, finishReason = "stop") {
  return Response.json({
    model: "moonshotai/kimi-k3",
    choices: [{
      finish_reason: finishReason,
      message: {
        content: JSON.stringify(candidate),
        annotations: validAnnotations.map(({ type, url, title }) => ({
          type,
          url_citation: { url, title },
        })),
      },
    }],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
      cost: 0.0001,
      server_tool_use: { web_search_requests: 2 },
    },
  });
}

function captureRequest(input: string | URL | Request, init?: RequestInit): CapturedRequest {
  if (!init || typeof init.body !== "string") throw new Error("Expected an explicit JSON request body");
  const parsed: unknown = JSON.parse(init.body);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Expected a JSON object body");
  return {
    url: input instanceof Request ? input.url : String(input),
    init,
    body: parsed as Record<string, unknown>,
  };
}

function factoryFor(
  db: SqliteD1,
  environment: ResearchProductionEnvironment,
  syntheticFetch: typeof fetch,
  now: () => number,
) {
  const createProvider = vi.fn<NonNullable<ResearchServiceFactoryRuntime["createProvider"]>>(
    (config: OpenRouterResearchConfig) => new OpenRouterResearchProvider(config, { fetch: syntheticFetch }),
  );
  return {
    createProvider,
    factory: createResearchServiceFactory({
      environment,
      getD1: () => db as unknown as D1Database,
      createProvider,
      now,
      createId: randomUUID,
    }),
  };
}

function accounting(db: SqliteD1) {
  return {
    quota: db.database.prepare(`SELECT user_id,reservation_id,idempotency_key,entry_kind,units
      FROM quota_ledger ORDER BY created_at,id`).all(),
    costs: db.database.prepare(`SELECT request_id,run_id,maximum_reserved_micros,settled_micros,status,expires_at
      FROM ai_budget_reservations ORDER BY created_at,id`).all(),
    audits: db.database.prepare(`SELECT user_id,request_id,purpose,status,error_code,model,usage_json
      FROM ai_runs ORDER BY created_at,id`).all(),
  };
}

function recoveryFactory(
  db: SqliteD1,
  environment: ResearchProductionEnvironment,
  now: () => number,
) {
  const deniedFetch = vi.fn<typeof fetch>(async () => {
    throw new Error("Recovery must not execute a provider request");
  });
  return {
    deniedFetch,
    ...factoryFor(db, environment, deniedFetch, now),
  };
}

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected global network access"));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("successful Research policy migration through production services and real local D1", () => {
  it("isolates legacy and Kimi caches while forwarding the exact successful request policy", async () => {
    const db = createResearchD1();
    try {
      seedUser(db, owner);
      seedUser(db, otherOwner);
      const controlledNow = baseNow;
      const captured: CapturedRequest[] = [];
      const activeDeadlines: number[] = [];
      const syntheticFetch = vi.fn<typeof fetch>(async (input: string | URL | Request, init?: RequestInit) => {
        captured.push(captureRequest(input, init));
        const row = db.database.prepare(`SELECT active_expires_at FROM research_runs
          WHERE state='researching' AND active_slot=1 LIMIT 1`).get() as { active_expires_at: number } | undefined;
        if (!row) throw new Error("Expected a researching run while the provider is active");
        activeDeadlines.push(row.active_expires_at);
        return responseFor();
      });

      const legacy = factoryFor(db, legacyEnvironment, syntheticFetch, () => controlledNow);
      const legacyRun = await legacy.factory.createNewCallService()!.start(owner, {
        mutationId: randomUUID(), role, locale,
      }, gate);
      expect(legacyRun.state).toBe("ready");
      if (legacyRun.state !== "ready") throw new Error("Expected the legacy Ready package");

      const selected = factoryFor(db, newEnvironment, syntheticFetch, () => controlledNow);
      const selectedRun = await selected.factory.createNewCallService()!.start(owner, {
        mutationId: randomUUID(), role, locale,
      }, gate);
      expect(selectedRun.state).toBe("ready");
      if (selectedRun.state !== "ready") throw new Error("Expected the selected-profile Ready package");
      expect(selectedRun.packageId).not.toBe(legacyRun.packageId);
      expect(syntheticFetch).toHaveBeenCalledTimes(2);

      const beforeCache = accounting(db);
      const cachedRun = await selected.factory.createNewCallService()!.start(otherOwner, {
        mutationId: randomUUID(), role, locale,
      }, gate);
      expect(cachedRun).toMatchObject({ state: "ready", packageId: selectedRun.packageId });
      if (cachedRun.state !== "ready") throw new Error("Expected the selected-profile cache hit");
      expect(syntheticFetch).toHaveBeenCalledTimes(2);
      expect(accounting(db)).toEqual(beforeCache);

      const oldConfiguration = readResearchProductionConfiguration(legacyEnvironment)!;
      const newConfiguration = readResearchProductionConfiguration(newEnvironment)!;
      expect(oldConfiguration.configFingerprint).toBe("p2-2f912248ea8be6becb1d8614acbf92ca");
      expect(newConfiguration.configFingerprint).not.toBe(oldConfiguration.configFingerprint);
      expect(activeDeadlines).toEqual([baseNow + 60_000, baseNow + 1_260_000]);

      const rows = db.database.prepare(`SELECT id,user_id,config_fingerprint,state,active_expires_at,package_id
        FROM research_runs ORDER BY created_at,id`).all() as Array<{
          id: string;
          user_id: string;
          config_fingerprint: string;
          state: string;
          active_expires_at: number | null;
          package_id: string | null;
        }>;
      expect(rows).toHaveLength(3);
      expect(rows.filter(({ config_fingerprint }) => config_fingerprint === oldConfiguration.configFingerprint)).toHaveLength(1);
      expect(rows.filter(({ config_fingerprint }) => config_fingerprint === newConfiguration.configFingerprint)).toHaveLength(2);
      expect(rows.every(({ state, active_expires_at }) => state === "ready" && active_expires_at === null)).toBe(true);
      expect(new Set(rows.filter(({ config_fingerprint }) => config_fingerprint === newConfiguration.configFingerprint)
        .map(({ package_id }) => package_id))).toEqual(new Set([selectedRun.packageId]));

      const packages = db.database.prepare(`SELECT id,config_fingerprint,content_fingerprint
        FROM research_packages ORDER BY created_at,id`).all() as Array<{
          id: string;
          config_fingerprint: string;
          content_fingerprint: string;
        }>;
      expect(packages).toHaveLength(2);
      expect(packages.map(({ config_fingerprint }) => config_fingerprint).sort()).toEqual([
        oldConfiguration.configFingerprint,
        newConfiguration.configFingerprint,
      ].sort());
      expect(packages.every(({ content_fingerprint }) => /^p2-[0-9a-f]{32}$/u.test(content_fingerprint))).toBe(true);

      const localCaptured: CapturedRequest[] = [];
      const localFetch = vi.fn<typeof fetch>(async (input: string | URL | Request, init?: RequestInit) => {
        localCaptured.push(captureRequest(input, init));
        return responseFor();
      });
      await createKimiLocalValidationProvider({
        key: "synthetic-dummy-credential",
        fetch: localFetch,
      }).research({ role, locale });
      const request = captured[1]!;
      expect(request.url).toBe("https://openrouter.ai/api/v1/chat/completions");
      expect(request.init).toMatchObject({ method: "POST", redirect: "manual" });
      expect(request.body).toEqual(localCaptured[0]!.body);
      expect(request.body).toMatchObject({
        model: "moonshotai/kimi-k3",
        stream: false,
        max_tokens: 32_768,
        reasoning: { effort: "low" },
        provider: { require_parameters: true, data_collection: "deny", zdr: true },
        max_tool_calls: 10,
        tools: [{
          type: "openrouter:web_search",
          parameters: {
            engine: "exa",
            mode: "fast",
            max_results: 5,
            max_uses: 10,
            max_total_results: 50,
            max_characters: 2_000,
          },
        }],
        response_format: {
          type: "json_schema",
          json_schema: { name: "arc_research_candidate", strict: true },
        },
      });
      const messages = request.body.messages;
      if (!Array.isArray(messages) || messages.length !== 2) throw new Error("Expected the complete Research prompt pair");
      const system = messages[0];
      if (!system || typeof system !== "object" || Array.isArray(system)) throw new Error("Expected a system message");
      const content = (system as Record<string, unknown>).content;
      expect(content).toEqual(expect.stringContaining("Apply kimi-complete-quality-v2."));
      expect(content).toEqual(expect.stringContaining("Draft all seven sections: role, skills, prerequisiteEdges, resources, stages, unitTemplates, and evidence."));
      expect(content).toEqual(expect.stringContaining("OUTPUT_CONTRACT_JSON:"));
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      db.close();
    }
  });

  it.each([
    ["ready", "new profile", newEnvironment],
    ["failed", "new profile", newEnvironment],
    ["ready", "disabled current service", { ...newEnvironment, ARC_AI_ENABLED: "false" }],
    ["failed", "disabled current service", { ...newEnvironment, ARC_AI_ENABLED: "false" }],
    ["ready", "invalid current profile", { ...newEnvironment, ARC_AI_RESEARCH_PROFILE: "unknown-profile" }],
    ["failed", "invalid current profile", { ...newEnvironment, ARC_AI_RESEARCH_PROFILE: "unknown-profile" }],
  ] satisfies Array<["ready" | "failed", string, ResearchProductionEnvironment]>)(
    "recovers a legacy %s run under %s without admission or current-provider construction",
    async (terminalState, _currentPolicy, currentEnvironment) => {
      const db = createResearchD1();
      try {
        seedUser(db, owner);
        seedUser(db, otherOwner);
        let controlledNow = baseNow;
        const legacyFetch = vi.fn<typeof fetch>(async () =>
          responseFor(validResearchCandidate, terminalState === "ready" ? "stop" : "length"));
        const original = factoryFor(db, legacyEnvironment, legacyFetch, () => controlledNow);
        const mutationId = randomUUID();
        const terminal = await original.factory.createNewCallService()!.start(owner, { mutationId, role, locale }, gate);
        expect(terminal.state).toBe(terminalState);
        expect(legacyFetch).toHaveBeenCalledOnce();

        const storedBefore = db.database.prepare(`SELECT id,request_id,config_fingerprint,state,state_version,
          active_expires_at,package_id FROM research_runs WHERE id=?1`).get(terminal.id);
        const accountingBefore = accounting(db);
        expect(accountingBefore.costs).toEqual([expect.objectContaining({ status: "settled", settled_micros: 100 })]);
        expect(accountingBefore.quota).toContainEqual(expect.objectContaining({
          entry_kind: terminalState === "ready" ? "accepted" : "failed",
          units: terminalState === "ready" ? 1 : 0,
        }));

        controlledNow += 1_000;
        const recovery = recoveryFactory(db, currentEnvironment, () => controlledNow);
        await expect(recovery.factory.createRecoveryService().get(owner, terminal.id))
          .resolves.toMatchObject({ id: terminal.id, state: terminalState });
        await expect(recovery.factory.createRecoveryService().recover(owner, {
          kind: "start", mutationId, role, locale,
        })).resolves.toMatchObject({ id: terminal.id, state: terminalState });
        await expect(recovery.factory.createRecoveryService().get(otherOwner, terminal.id)).resolves.toBeNull();
        await expect(recovery.factory.createRecoveryService().recover(otherOwner, {
          kind: "start", mutationId, role, locale,
        })).resolves.toBeNull();

        expect(recovery.createProvider).not.toHaveBeenCalled();
        expect(recovery.deniedFetch).not.toHaveBeenCalled();
        expect(accounting(db)).toEqual(accountingBefore);
        expect(db.database.prepare(`SELECT id,request_id,config_fingerprint,state,state_version,
          active_expires_at,package_id FROM research_runs WHERE id=?1`).get(terminal.id)).toEqual(storedBefore);
        expect(globalThis.fetch).not.toHaveBeenCalled();
      } finally {
        db.close();
      }
    },
  );

  it("rejects retrying a known-cost legacy failure under the new fingerprint before another reservation", async () => {
    const db = createResearchD1();
    try {
      seedUser(db, owner);
      let controlledNow = baseNow;
      let providerAttempt = 0;
      const syntheticFetch = vi.fn<typeof fetch>(async () => {
        providerAttempt += 1;
        return responseFor(validResearchCandidate, providerAttempt === 1 ? "error" : "stop");
      });
      const legacy = factoryFor(db, legacyEnvironment, syntheticFetch, () => controlledNow);
      const failed = await legacy.factory.createNewCallService()!.start(owner, {
        mutationId: randomUUID(), role, locale,
      }, gate);
      expect(failed).toMatchObject({ state: "failed", retryable: true, failureCategory: "service-unavailable" });
      if (failed.state !== "failed") throw new Error("Expected the retryable legacy provider failure");
      expect(accounting(db).costs).toEqual([expect.objectContaining({ status: "settled", settled_micros: 100 })]);
      expect(accounting(db).quota).toContainEqual(expect.objectContaining({ entry_kind: "failed", units: 0 }));
      const before = {
        accounting: accounting(db),
        run: db.database.prepare("SELECT * FROM research_runs WHERE id=?1").get(failed.id),
      };

      controlledNow += 1_000;
      const selected = factoryFor(db, newEnvironment, syntheticFetch, () => controlledNow);
      await expect(selected.factory.createNewCallService()!.retry(owner, failed.id, randomUUID(), gate))
        .rejects.toMatchObject({ code: "CONFLICT" });

      expect(syntheticFetch).toHaveBeenCalledOnce();
      expect(accounting(db)).toEqual(before.accounting);
      expect(db.database.prepare("SELECT * FROM research_runs WHERE id=?1").get(failed.id)).toEqual(before.run);

      const retried = await legacy.factory.createNewCallService()!.retry(owner, failed.id, randomUUID(), gate);
      expect(retried.state).toBe("ready");
      expect(retried.id).not.toBe(failed.id);
      expect(syntheticFetch).toHaveBeenCalledTimes(2);
      expect(accounting(db).costs).toHaveLength(2);
      expect(accounting(db).quota).toContainEqual(expect.objectContaining({ entry_kind: "accepted", units: 1 }));
      expect(db.database.prepare("SELECT * FROM research_runs WHERE id=?1").get(failed.id)).toEqual(before.run);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      db.close();
    }
  });

  it("expires the original legacy lease and settles a late known receipt without publishing it", async () => {
    const db = createResearchD1();
    let releaseFetch: () => void = () => undefined;
    let running: Promise<unknown> = Promise.resolve();
    try {
      seedUser(db, owner);
      let controlledNow = baseNow;
      let markEntered!: () => void;
      const entered = new Promise<void>((resolve) => { markEntered = resolve; });
      const release = new Promise<void>((resolve) => { releaseFetch = resolve; });
      const stalledFetch = vi.fn<typeof fetch>(async () => {
        markEntered();
        await release;
        return responseFor();
      });
      const legacy = factoryFor(db, legacyEnvironment, stalledFetch, () => controlledNow);
      const mutationId = randomUUID();
      running = legacy.factory.createNewCallService()!.start(owner, { mutationId, role, locale }, gate);
      const runningOutcome = running.then(
        () => ({ kind: "completed" as const }),
        () => ({ kind: "completed" as const }),
      );
      const entryOutcome = await Promise.race([
        entered.then(() => ({ kind: "entered" as const })),
        runningOutcome,
      ]);
      if (entryOutcome.kind !== "entered") {
        throw new Error("Research start completed before the injected provider fetch was entered");
      }

      const active = db.database.prepare(`SELECT id,state,active_expires_at,config_fingerprint
        FROM research_runs LIMIT 1`).get() as {
          id: string;
          state: string;
          active_expires_at: number;
          config_fingerprint: string;
        };
      expect(active).toMatchObject({
        state: "researching",
        active_expires_at: baseNow + 60_000,
        config_fingerprint: "p2-2f912248ea8be6becb1d8614acbf92ca",
      });

      const recovery = recoveryFactory(db, { ...newEnvironment, ARC_AI_ENABLED: "false" }, () => controlledNow);
      await expect(recovery.factory.createRecoveryService().get(owner, active.id))
        .resolves.toMatchObject({ id: active.id, state: "researching" });
      expect(db.database.prepare("SELECT active_expires_at FROM research_runs WHERE id=?1").get(active.id))
        .toEqual({ active_expires_at: baseNow + 60_000 });

      controlledNow = baseNow + 70_000;
      await expect(recovery.factory.createRecoveryService().get(owner, active.id))
        .resolves.toMatchObject({ id: active.id, state: "failed" });
      expect(accounting(db).costs).toEqual([expect.objectContaining({
        status: "conservative-hold",
        settled_micros: 0,
        expires_at: baseNow + 60_000,
      })]);
      const failedQuota = accounting(db).quota;
      expect(failedQuota).toContainEqual(expect.objectContaining({ entry_kind: "failed", units: 0 }));

      releaseFetch();
      await running.catch(() => undefined);
      await expect(recovery.factory.createRecoveryService().recover(owner, {
        kind: "start", mutationId, role, locale,
      })).resolves.toMatchObject({ id: active.id, state: "failed" });

      const finalRun = db.database.prepare(`SELECT state,state_version,active_expires_at,package_id
        FROM research_runs WHERE id=?1`).get(active.id);
      expect(finalRun).toMatchObject({ state: "failed", active_expires_at: null, package_id: null });
      expect(accounting(db).costs).toEqual([expect.objectContaining({ status: "settled", settled_micros: 100 })]);
      expect(accounting(db).quota).toEqual(failedQuota);
      const receipt = db.database.prepare(`SELECT status,error_code,usage_json FROM ai_runs
        WHERE user_id=?1 AND purpose='role-research'`).get(owner) as {
          status: string;
          error_code: string | null;
          usage_json: string;
        };
      expect(receipt).toMatchObject({ status: "rejected", error_code: "invalid-result" });
      expect(JSON.parse(receipt.usage_json)).toMatchObject({
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, costMicros: 100, webSearchRequests: 2 },
      });
      expect(db.database.prepare("SELECT count(*) AS count FROM research_packages").get()).toEqual({ count: 0 });
      expect(stalledFetch).toHaveBeenCalledOnce();
      expect(recovery.createProvider).not.toHaveBeenCalled();
      expect(recovery.deniedFetch).not.toHaveBeenCalled();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      releaseFetch();
      await running.catch(() => undefined);
      db.close();
    }
  });

  it("carries a Kimi package through activation and persistent planning replay after cache expiry", async () => {
    const db = createResearchD1();
    try {
      seedUser(db, owner);
      seedUser(db, otherOwner);
      let controlledNow = baseNow;
      const syntheticFetch = vi.fn<typeof fetch>(async () => responseFor());
      const selected = factoryFor(db, newEnvironment, syntheticFetch, () => controlledNow);
      const run = await selected.factory.createNewCallService()!.start(owner, {
        mutationId: randomUUID(), role, locale,
      }, gate);
      expect(run.state).toBe("ready");
      if (run.state !== "ready") throw new Error("Expected the selected-profile Ready package");

      const d1 = db as unknown as D1Database;
      const researchRepository = new D1ResearchRepository(d1, { now: () => controlledNow });
      const packageValue = await researchRepository.resolveReadyPackage(owner, run.id);
      const legacyRecovery = recoveryFactory(db, legacyEnvironment, () => controlledNow);
      await expect(legacyRecovery.factory.createRecoveryService().get(owner, run.id))
        .resolves.toMatchObject({ id: run.id, state: "ready", packageId: packageValue.id });
      expect(legacyRecovery.createProvider).not.toHaveBeenCalled();
      expect(legacyRecovery.deniedFetch).not.toHaveBeenCalled();
      const cloud = new CloudService(new D1CloudRepository(d1));
      await expect(cloud.getWorkspace(owner)).resolves.toBeNull();
      const activation = await cloud.importLocalState(owner, {
        migrationId: randomUUID(),
        consent: true,
        conflictResolution: "reject",
        intent: "research-setup",
        state: {
          setup: {
            roleId: packageValue.blueprint.id,
            level: "beginner",
            weeklyMinutes: 420,
            targetWeeks: 18,
          },
          completedUnitIds: [],
          proofs: [],
        },
      });
      expect(activation).toMatchObject({ status: "imported" });
      if (activation.status !== "imported" || !activation.activeGoalId) {
        throw new Error("Expected a fresh active Research goal");
      }
      const activated = await cloud.getWorkspace(owner);
      expect(activated).toMatchObject({
        activeGoalId: activation.activeGoalId,
        state: {
          setup: { roleId: packageValue.blueprint.id, level: "beginner", weeklyMinutes: 420, targetWeeks: 18 },
          completedUnitIds: [],
          proofs: [],
        },
      });

      const fallback = vi.fn(async () => { throw new Error("FLAGSHIP_FALLBACK_DENIED"); });
      const sourceResolver = new PlanningSourceResolver({
        intelligence: { getPublished: fallback },
        flagshipRegistry: flagshipUnitRegistry,
        researchRepository,
        replayPackageReader: new D1PlanningReplayPackageReader(d1),
      });
      let id = 0;
      const planningNow = () => new Date(controlledNow);
      const planningRepository = new D1PlanningRepository(d1, {
        sourceResolver,
        createId: () => `policy-planning-record-${++id}`,
        now: planningNow,
      });
      const planningService = new PlanningService({
        repository: planningRepository,
        sourceResolver,
        createId: () => `policy-planning-domain-${++id}`,
        now: planningNow,
      });
      const generated = await planningService.generateResponse(owner, {
        mutationId: randomUUID(),
        source: { source: "research", researchRunId: run.id },
        planningDate: "2026-09-13",
        audit: {
          id: "policy-audit",
          schemaVersion: "2026.08.1",
          blueprintId: packageValue.blueprint.id,
          blueprintVersion: packageValue.blueprint.version,
          answers: packageValue.blueprint.skills.map(({ id: skillId }) => ({
            skillId,
            level: "conceptual",
            evidenceRefs: [],
          })),
          evidence: [],
          createdBy: "learner",
          inputFingerprint: "policy-audit-fingerprint",
        },
        availability: {
          id: "policy-availability",
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
          inputFingerprint: "policy-availability-fingerprint",
        },
        target: {
          id: "policy-target",
          schemaVersion: "2026.08.1",
          targetWeeks: 18,
          inputFingerprint: "policy-target-fingerprint",
        },
        selectedScope: "full-scope",
      });
      expect(generated.result.workspace.dailyUnits.length).toBeGreaterThan(0);
      expect(generated.result.workspace.events).toEqual([]);
      expect(fallback).not.toHaveBeenCalled();

      const stored = await planningRepository.load({ ownerId: owner, goalId: activation.activeGoalId });
      const selectedConfiguration = readResearchProductionConfiguration(newEnvironment)!;
      expect(stored?.sourceReference).toEqual({
        source: "research",
        researchRunId: run.id,
        packageId: packageValue.id,
        blueprintId: packageValue.blueprint.id,
        blueprintVersion: packageValue.blueprint.version,
        registryId: packageValue.registry.id,
        registryVersion: packageValue.registry.version,
        configFingerprint: selectedConfiguration.configFingerprint,
        contentFingerprint: packageValue.contentFingerprint,
      });
      const templates = new Map(packageValue.registry.tracks.flatMap(({ templates }) =>
        templates.map((template) => [template.id, template] as const)));
      for (const unit of generated.result.workspace.dailyUnits) {
        const authored = templates.get(unit.templateId);
        expect(authored).toBeDefined();
        expect(unit).toMatchObject({
          objective: authored!.objective,
          primaryResourceId: authored!.primaryResourceId,
          alternativeResourceIds: authored!.alternativeResourceIds,
        });
      }

      controlledNow = baseNow + 15 * 86_400_000;
      const expiredResearch = new D1ResearchRepository(d1, { now: () => controlledNow });
      await expect(expiredResearch.resolveReadyPackage(owner, run.id))
        .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
      const expiredFallback = vi.fn(async () => { throw new Error("FLAGSHIP_FALLBACK_DENIED"); });
      const expiredResolver = new PlanningSourceResolver({
        intelligence: { getPublished: expiredFallback },
        flagshipRegistry: flagshipUnitRegistry,
        researchRepository: expiredResearch,
        replayPackageReader: new D1PlanningReplayPackageReader(d1),
      });
      const freshPlanning = new PlanningService({
        repository: new D1PlanningRepository(d1, {
          sourceResolver: expiredResolver,
          createId: () => `policy-planning-replay-${++id}`,
          now: planningNow,
        }),
        sourceResolver: expiredResolver,
        createId: () => `policy-planning-replay-domain-${++id}`,
        now: planningNow,
      });
      await expect(freshPlanning.getWorkspaceResponse(owner)).resolves.toEqual({
        workspace: generated.result.workspace,
        sourceContext: generated.sourceContext,
      });
      await expect(freshPlanning.getWorkspaceResponse(otherOwner))
        .rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(expiredFallback).not.toHaveBeenCalled();
      expect(syntheticFetch).toHaveBeenCalledOnce();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      db.close();
    }
  });

  it("keeps a substantive invalid Kimi candidate in needs-review with Repair disabled", async () => {
    const db = createResearchD1();
    try {
      seedUser(db, owner);
      const captured: CapturedRequest[] = [];
      const syntheticFetch = vi.fn<typeof fetch>(async (input: string | URL | Request, init?: RequestInit) => {
        captured.push(captureRequest(input, init));
        return responseFor(candidateWithMissingCitations());
      });
      const selected = factoryFor(db, newEnvironment, syntheticFetch, () => baseNow);
      const run = await selected.factory.createNewCallService()!.start(owner, {
        mutationId: randomUUID(), role, locale,
      }, gate);

      expect(run).toMatchObject({ state: "needs-review", retryable: true });
      if (run.state !== "needs-review") throw new Error("Expected a quality review result");
      expect(run.quality.issueCodes).toContain("missing-skill-source");
      expect(syntheticFetch).toHaveBeenCalledOnce();
      expect(captured[0]!.body.model).toBe("moonshotai/kimi-k3");
      expect(db.database.prepare("SELECT count(*) AS count FROM research_packages").get()).toEqual({ count: 0 });
      expect(db.database.prepare("SELECT count(*) AS count FROM planning_workspaces").get()).toEqual({ count: 0 });
      expect(accounting(db).audits).toEqual([expect.objectContaining({
        purpose: "role-research",
        status: "rejected",
        error_code: "invalid-result",
        model: "moonshotai/kimi-k3",
      })]);
      expect(accounting(db).costs).toEqual([expect.objectContaining({ status: "settled", settled_micros: 100 })]);
      expect(accounting(db).quota).toContainEqual(expect.objectContaining({ entry_kind: "rejected", units: 0 }));
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      db.close();
    }
  });
});
