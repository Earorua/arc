import { createHash, randomUUID } from "node:crypto";
import { providerUsageSchema, researchPublicFailureCategorySchema, type ResearchIssueCode, type ResearchPublicFailureCategory, type ResearchRunPublicView } from "../../app/contracts/research";
import { D1AiRunSink } from "../../app/server/ai/d1-run-recorder";
import { D1EntitlementRepository } from "../../app/server/entitlements/d1-entitlement-repository";
import { EntitlementGate } from "../../app/server/entitlements/policy";
import { CloudService } from "../../app/server/cloud/service";
import { D1CloudRepository } from "../../app/server/cloud/d1-cloud-repository";
import { D1PlanningRepository } from "../../app/server/planning/d1-planning-repository";
import { PlanningSourceResolver } from "../../app/server/planning/source-resolver";
import { PlanningService } from "../../app/server/planning/service";
import { D1ResearchRepository, D1PlanningReplayPackageReader } from "../../app/server/research/d1-repository";
import { D1ResearchBudgetRepository } from "../../app/server/research/d1-budget-repository";
import { createKimiLocalValidationProvider, getKimiLocalValidationProfile, type KimiLocalValidationProfile } from "../../app/server/research/openrouter-provider";
import { type ProviderFailureDiagnostic } from "../../app/server/research/provider-failure-diagnostic";
import { projectResponsePreflightDiagnostic, type ResearchResponsePreflightDiagnostic } from "../../app/server/research/response-preflight-diagnostic";
import { projectResearchAttemptDiagnostic, projectResearchRunDiagnostic, projectValidationCandidateDiagnostic,
  projectValidationProviderResultDiagnostic, type ProviderResultDiagnostic, type ResearchAttemptDiagnostic,
  type ResearchCandidateDiagnostic, type ResearchRunDiagnostic } from "../../app/server/research/result-diagnostic";
import { projectTransportDiagnostic, type ResearchTransportDiagnostic } from "../../app/server/research/transport-diagnostic";
import { ResearchOrchestrator } from "../../app/server/research/orchestrator";
import { projectResearchQualityDiagnostic, type ResearchQualityDiagnostic } from "../../app/server/research/quality-diagnostic";
import { RESEARCH_PROVIDER_VERSIONS, RESEARCH_SEARCH_POLICY, ResearchProviderError, type ResearchProvider } from "../../app/server/research/provider";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { createResearchD1, seedUser } from "../../tests/helpers/sqlite-d1";
import { validResearchCandidate, validAnnotations } from "../../tests/fixtures/research/valid-candidate";
import { projectNativeFetchDiagnostic, type NativeFetchDiagnostic } from "./fetch-diagnostic";
import { createGuardedTransport, SafeValidationError, verifyKeyPolicy, type KeyCheckDiagnostics } from "./transport";

// Public acceptance metadata mirrors the only valid profile; execution and TTL values are read from the validated JSON below.
export const LIVE_POLICY = Object.freeze({ model: "moonshotai/kimi-k3", maximumMicros: 5_000_000, timeoutMs: 1_200_000 });
const OWNER = "live-validation-owner";
const WRONG_OWNER = "live-validation-other-owner";
const ROLE = "Data Product Manager";
const LOCALE = "en-US";

export function fixtureResponse() {
  return Response.json({ model: LIVE_POLICY.model,
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(validResearchCandidate),
      annotations: validAnnotations.map(({ url, title }) => ({ type: "url_citation", url_citation: { url, title } })) } }],
    usage: { prompt_tokens: 3000, completion_tokens: 6000, total_tokens: 9000, cost: 0.1, server_tool_use: { web_search_requests: 2 } },
  });
}

export type ValidationSummary = {
  mode: "offline-dry-run" | "live-one" | "key-check-only";
  timestamp: string; outcome: "passed" | "incomplete";
  reason: string | null; requestedModel: string; actualModel: string | null;
  keyHttpStatus: number | null; researchHttpStatus: number | null;
  keyDiagnostics: KeyCheckDiagnostics | null;
  researchFailureDiagnostic: ProviderFailureDiagnostic | null;
  providerResultDiagnostic: ProviderResultDiagnostic | null;
  researchCandidateDiagnostic: ResearchCandidateDiagnostic | null;
  researchAttemptDiagnostic: ResearchAttemptDiagnostic | null;
  researchRunDiagnostic: ResearchRunDiagnostic | null;
  researchTransportDiagnostic: Readonly<ResearchTransportDiagnostic> | null;
  researchNativeFetchDiagnostic: NativeFetchDiagnostic | null;
  researchResponsePreflightDiagnostic: ResearchResponsePreflightDiagnostic | null;
  researchQualityDiagnostic: ResearchQualityDiagnostic | null;
  realRequestCount: number; researchRequestCount: number; repairRequestCount: number;
  runId: string | null; runState: ResearchRunPublicView["state"] | null; failureCategory: ResearchPublicFailureCategory | null;
  quality: { passed: boolean; issueCodes: ResearchIssueCode[]; issueCount: number };
  citationCount: number; skillCount: number; auditCount: number;
  usage: ReturnType<typeof providerUsageSchema.parse> | null;
  reservation: { status: string; maximumMicros: number; settledMicros: number } | null;
  ownerWrongReadRejected: boolean; secondResearchRejected: boolean;
  freshAccountActivated: boolean; planningGenerated: boolean; planningUnitCount: number; databaseDisposed: boolean;
  researchPolicy: Readonly<Pick<KimiLocalValidationProfile, "profileId" | "reasoningEffort" | "maxOutputTokens" | "outputPolicyVersion" | "researchTimeoutMs" | "activeTtlMs" | "launcherTimeoutMs">> | null;
  researchElapsedMs: number | null;
  researchStartedAt: string | null;
};

export function validationFingerprint(profile: Readonly<{
  profileId: string;
  model: string;
  reasoningEffort: string;
  maxOutputTokens: number;
  outputPolicyVersion: string;
  researchTimeoutMs: number;
  activeTtlMs: number;
  launcherTimeoutMs: number;
}>): string {
  return createHash("sha256").update(JSON.stringify({
    profile,
    versions: { ...RESEARCH_PROVIDER_VERSIONS, blueprintVersion: "2026.09.1", registryVersion: "2026.09.1", templateVersion: "2026.09.1" },
    budget: { maximumMicros: LIVE_POLICY.maximumMicros, repairMaximumMicros: 0 },
    output: { maxTokens: profile.maxOutputTokens, outputPolicyVersion: profile.outputPolicyVersion, strictJsonSchema: true },
    search: RESEARCH_SEARCH_POLICY,
    privacy: { dataCollection: "deny", zdr: true, requireParameters: true },
  })).digest("hex");
}

/** No network, environment, application factory or persistent database is used by default. */
export async function runValidation(options: { executeOne?: boolean; checkKeyOnly?: boolean; key?: string; fetch?: typeof globalThis.fetch } = {}): Promise<ValidationSummary> {
  const summary: ValidationSummary = {
    mode: options.checkKeyOnly === true ? "key-check-only" : options.executeOne === true ? "live-one" : "offline-dry-run", timestamp: new Date().toISOString(), outcome: "incomplete", reason: null,
    requestedModel: LIVE_POLICY.model, actualModel: null, keyHttpStatus: null, researchHttpStatus: null, keyDiagnostics: null, researchFailureDiagnostic: null,
    providerResultDiagnostic: null, researchCandidateDiagnostic: null, researchAttemptDiagnostic: null, researchRunDiagnostic: null,
    researchTransportDiagnostic: null, researchNativeFetchDiagnostic: null, researchResponsePreflightDiagnostic: null, researchQualityDiagnostic: null,
    realRequestCount: 0, researchRequestCount: 0, repairRequestCount: 0,
    runId: null, runState: null, failureCategory: null, quality: { passed: false, issueCodes: [], issueCount: 0 },
    citationCount: 0, skillCount: 0, auditCount: 0, usage: null, reservation: null,
    ownerWrongReadRejected: false, secondResearchRejected: false, freshAccountActivated: false, planningGenerated: false,
    planningUnitCount: 0, databaseDisposed: false, researchPolicy: null, researchElapsedMs: null, researchStartedAt: null,
  };
  const db = createResearchD1();
  const d1 = db as unknown as D1Database;
  let provider: ResearchProvider | null = null;
  let transport: ReturnType<typeof createGuardedTransport> | null = null;
  let key: string | undefined = "offline-fixture-key";
  let nativeFetchObservationOpen = true;
  try {
    const profile = getKimiLocalValidationProfile();
    if (options.executeOne === true && options.checkKeyOnly === true) throw new SafeValidationError("transport-denied");
    if (options.executeOne === true || options.checkKeyOnly === true) {
      key = options.key;
      if (!options.fetch) throw new SafeValidationError("transport-denied");
      transport = createGuardedTransport(key!, options.fetch, options.executeOne === true ? {
        checkKeyOnly: options.checkKeyOnly,
        onResearchFetchDiagnostic: (diagnostic) => {
          if (!nativeFetchObservationOpen) return;
          try { summary.researchNativeFetchDiagnostic = projectNativeFetchDiagnostic(diagnostic); }
          catch { /* Observation only. */ }
        },
      } : { checkKeyOnly: options.checkKeyOnly });
      await transport.inspectKey();
      if (options.checkKeyOnly === true) { summary.outcome = "passed"; return summary; }
    } else {
      const fixture = { data: { limit: 5, limit_remaining: 5, limit_reset: null, usage: 0, is_management_key: false, byok_usage: 0 } };
      verifyKeyPolicy(fixture);
      let rejected = false;
      try { verifyKeyPolicy({ data: { ...fixture.data, limit: null } }); } catch { rejected = true; }
      if (!rejected) throw new SafeValidationError("validation-incomplete");
    }
    seedUser(db, OWNER); seedUser(db, WRONG_OWNER);
    const repository = new D1ResearchRepository(d1);
    const budgets = new D1ResearchBudgetRepository(d1);
    const audits = new D1AiRunSink(d1);
    const entitlements = new EntitlementGate(new D1EntitlementRepository(d1), {
      ARC_AI_ENABLED: "true", ARC_AI_USER_DAILY_QUOTA: "1", ARC_AI_RATE_LIMIT_PER_MINUTE: "1",
    });
    const adapter = createKimiLocalValidationProvider({ key: key!,
      fetch: transport?.fetch ?? (async () => { summary.researchRequestCount++; summary.researchHttpStatus = 200; return fixtureResponse(); }),
      onFailureDiagnostic: (diagnostic) => {
        summary.researchFailureDiagnostic = {
          httpStatus: diagnostic.httpStatus, location: diagnostic.location, errorCode: diagnostic.errorCode,
          errorCodeState: diagnostic.errorCodeState, errorType: diagnostic.errorType, errorTypeState: diagnostic.errorTypeState,
        };
      },
      onResultDiagnostic: (diagnostic) => {
        try { summary.providerResultDiagnostic = projectValidationProviderResultDiagnostic(diagnostic); } catch { /* Observation only. */ }
      },
      onTransportDiagnostic: (diagnostic) => {
        try { summary.researchTransportDiagnostic = projectTransportDiagnostic(diagnostic); } catch { /* Observation only. */ }
      },
      onResponsePreflightDiagnostic: (diagnostic) => {
        try { summary.researchResponsePreflightDiagnostic = projectResponsePreflightDiagnostic(diagnostic); }
        catch { /* Observation only. */ }
      },
    });
    let invoked = false;
    provider = {
      research: async (request) => {
        if (invoked) throw new ResearchProviderError("unavailable", false, false);
        invoked = true;
        summary.researchPolicy = Object.freeze({ profileId: profile.profileId, reasoningEffort: profile.reasoningEffort,
          maxOutputTokens: profile.maxOutputTokens, outputPolicyVersion: profile.outputPolicyVersion,
          researchTimeoutMs: profile.researchTimeoutMs, activeTtlMs: profile.activeTtlMs, launcherTimeoutMs: profile.launcherTimeoutMs });
        if (options.executeOne === true) summary.researchStartedAt = new Date().toISOString();
        const started = performance.now();
        try { return await adapter.research(request); }
        finally {
          if (summary.researchElapsedMs === null) {
            const elapsed = performance.now() - started;
            summary.researchElapsedMs = Number.isFinite(elapsed)
              ? Math.round(Math.min(profile.launcherTimeoutMs, Math.max(0, elapsed))) : null;
          }
        }
      },
      repair: async () => { throw new ResearchProviderError("unavailable", false, false); },
    };
    const requestId = randomUUID();
    const orchestrator = new ResearchOrchestrator({ repository, budget: budgets, audits, entitlements, provider,
      createRequestId: () => requestId,
      onCandidateDiagnostic: (diagnostic) => {
        try { summary.researchCandidateDiagnostic = projectValidationCandidateDiagnostic(diagnostic); }
        catch { /* Observation only. */ }
      },
      onQualityDiagnostic: (diagnostic) => {
        try { summary.researchQualityDiagnostic = projectResearchQualityDiagnostic(diagnostic); }
        catch { /* Observation only. */ }
      },
      config: { configFingerprint: validationFingerprint(profile), providerName: "openrouter",
        versions: { ...RESEARCH_PROVIDER_VERSIONS, blueprintVersion: "2026.09.1", registryVersion: "2026.09.1", templateVersion: "2026.09.1" },
        activeTtlMs: profile.activeTtlMs, cacheDays: 7,
        budget: { dailyBudgetMicros: LIVE_POLICY.maximumMicros, monthlyBudgetMicros: LIVE_POLICY.maximumMicros,
          maximumMicros: LIVE_POLICY.maximumMicros, researchMaximumMicros: LIVE_POLICY.maximumMicros, repairMaximumMicros: 0 },
      },
    });
    const run = await orchestrator.start(OWNER, { role: ROLE, locale: LOCALE, mutationId: randomUUID() }, { cohortEnabled: true, rateAllowed: true });
    if (transport) summary.researchRequestCount = transport.counts().postCount;
    summary.runId = run.id; summary.runState = run.state;
    if (run.state === "failed") {
      const category = researchPublicFailureCategorySchema.safeParse(run.failureCategory);
      if (category.success) summary.failureCategory = category.data;
    }
    if (run.state === "ready" || run.state === "needs-review") {
      summary.quality = { passed: run.state === "ready", issueCodes: [...run.quality.issueCodes], issueCount: run.quality.issueCodes.length };
      summary.skillCount = run.state === "ready" ? run.skillCount : run.quality.skillCount;
      summary.citationCount = run.state === "ready" ? run.sourceCount : run.quality.sourceCount;
    }
    const rows = db.database.prepare("SELECT request_id,purpose FROM ai_runs").all() as { request_id: string; purpose: string }[];
    summary.auditCount = rows.length;
    summary.repairRequestCount = rows.filter((row) => row.purpose === "role-research-repair").length;
    if (rows.length === 1) {
      const receipt = await audits.readResearchAttempt(OWNER, rows[0]!.request_id);
      summary.actualModel = receipt?.model === LIVE_POLICY.model ? LIVE_POLICY.model : null;
      summary.usage = receipt?.usage ? { ...receipt.usage } : null;
      try { summary.researchAttemptDiagnostic = projectResearchAttemptDiagnostic(receipt); } catch { /* Observation only. */ }
    }
    try {
      const record = await repository.getRun(OWNER, run.id);
      summary.researchRunDiagnostic = projectResearchRunDiagnostic(record);
    } catch { /* Observation only. */ }
    const reservation = await budgets.findReservation(OWNER, run.id, requestId);
    if (reservation) summary.reservation = { status: reservation.status, maximumMicros: reservation.maximumMicros, settledMicros: reservation.settledMicros };
    const wrongRead = await orchestrator.get(WRONG_OWNER, run.id);
    let wrongResolveRejected = false;
    try { await repository.resolveReadyPackage(WRONG_OWNER, run.id); } catch { wrongResolveRejected = true; }
    summary.ownerWrongReadRejected = wrongRead === null && wrongResolveRejected;
    try { await provider.research({ role: ROLE, locale: LOCALE }); } catch { summary.secondResearchRejected = true; }

    if (run.state === "ready") {
      const packageValue = await repository.resolveReadyPackage(OWNER, run.id);
      // A research-only resolver fails closed if planning ever attempts a Flagship fallback.
      const resolver = new PlanningSourceResolver({ intelligence: { getPublished: async () => { throw new Error("FLAGSHIP_FALLBACK_DENIED"); } },
        flagshipRegistry: flagshipUnitRegistry, researchRepository: repository, replayPackageReader: new D1PlanningReplayPackageReader(d1) });
      const cloud = new CloudService(new D1CloudRepository(d1));
      const before = await cloud.getWorkspace(OWNER);
      const activation = await cloud.importLocalState(OWNER, {
        migrationId: randomUUID(), consent: true, conflictResolution: "reject", intent: "research-setup",
        state: { setup: { roleId: packageValue.blueprint.id, level: "beginner", weeklyMinutes: 420, targetWeeks: 18 }, completedUnitIds: [], proofs: [] },
      });
      const after = await cloud.getWorkspace(OWNER);
      summary.freshAccountActivated = before === null && activation.status === "imported" && !!after?.activeGoalId
        && after.state.setup.roleId === packageValue.blueprint.id && after.state.completedUnitIds.length === 0 && after.state.proofs.length === 0;
      const planning = new PlanningService({ repository: new D1PlanningRepository(d1, { sourceResolver: resolver }), sourceResolver: resolver });
      const generated = await planning.generate(OWNER, {
        mutationId: randomUUID(), source: { source: "research", researchRunId: run.id }, planningDate: new Date().toISOString().slice(0, 10),
        audit: { id: "live-audit", schemaVersion: "2026.08.1", blueprintId: packageValue.blueprint.id, blueprintVersion: packageValue.blueprint.version,
          answers: packageValue.blueprint.skills.map(({ id: skillId }) => ({ skillId, level: "conceptual", evidenceRefs: [] })),
          evidence: [], createdBy: "learner", inputFingerprint: "live-audit-fingerprint" },
        availability: { id: "live-availability", schemaVersion: "2026.08.1", timeZone: "Asia/Shanghai",
          weekdays: { monday: 60, tuesday: 60, wednesday: 60, thursday: 60, friday: 60, saturday: 60, sunday: 60 },
          exceptions: [], weeklyMinutes: 420, inputFingerprint: "live-availability-fingerprint" },
        target: { id: "live-target", schemaVersion: "2026.08.1", targetWeeks: 18, inputFingerprint: "live-target-fingerprint" }, selectedScope: "full-scope",
      });
      summary.planningUnitCount = generated.workspace.dailyUnits.length;
      summary.planningGenerated = summary.planningUnitCount > 0 && !!generated.workspace.activePlanVersionId;
    }
    summary.outcome = run.state === "ready" && summary.actualModel !== null && summary.usage !== null
      && summary.usage.costMicros > 0 && summary.usage.costMicros <= LIVE_POLICY.maximumMicros
      && summary.usage.promptTokens > 0 && summary.usage.completionTokens > 0 && summary.usage.totalTokens > 0
      && summary.usage.webSearchRequests > 0 && summary.usage.webSearchRequests <= RESEARCH_SEARCH_POLICY.maxUses && summary.citationCount > 0 && summary.skillCount > 0
      && summary.reservation?.status === "settled" && summary.reservation.settledMicros === summary.usage.costMicros
      && summary.ownerWrongReadRejected && summary.secondResearchRejected && summary.freshAccountActivated && summary.planningGenerated
      && summary.auditCount === 1 && summary.researchRequestCount === 1 && summary.repairRequestCount === 0 ? "passed" : "incomplete";
    if (summary.outcome !== "passed") summary.reason = run.state === "needs-review" ? "quality-needs-review" : run.state === "failed" ? "research-failed" : "validation-incomplete";
  } catch (error) { summary.reason = error instanceof SafeValidationError ? error.code : "validation-incomplete"; }
  finally {
    nativeFetchObservationOpen = false;
    if (transport) {
      const counts = transport.counts();
      summary.realRequestCount = counts.getCount + counts.postCount;
      summary.researchRequestCount = counts.postCount;
      summary.keyHttpStatus = counts.keyHttpStatus;
      summary.researchHttpStatus = counts.researchHttpStatus;
      summary.keyDiagnostics = transport.diagnostics();
      transport.clear();
    }
    key = undefined; provider = null; db.close(); summary.databaseDisposed = true;
  }
  return summary;
}
