import { z } from "zod";
import { providerCitationAnnotationSchema, providerUsageSchema, researchRequestSchema, type ResearchCandidate, type ResearchPublicFailureCategory, type ResearchRunPublicView } from "../../contracts/research";
import { canonicalJson, deterministicId, fingerprint } from "../../lib/planning/fingerprint";
import type { AiRunSink, ResearchAiRunReader, ResearchAiRunRecord } from "../ai/gateway";
import type { EntitlementGate } from "../entitlements/policy";
import type { BudgetReservation, BudgetSettlement, ResearchBudgetLimits, ResearchBudgetRepository } from "./budget";
import { validateResearchCandidate, type ResearchValidationContext, type ResearchValidationResult } from "./package-validator";
import { candidateFromContent, fitsUtf8, RESEARCH_PROVIDER_LIMITS, ResearchProviderError, type ProviderResearchResult, type ResearchProvider } from "./provider";
import { ResearchRepositoryError, type ResearchRepository, type ResearchRunRecord } from "./repository";
import { canonicalizePublicCitationUrl, readBoundedResearchJson } from "./source-audit";

export type ResearchGateContext = { cohortEnabled: boolean; rateAllowed: boolean };
type Versions = Omit<ResearchValidationContext, "packageId" | "observedAt" | "expiresAt">;
export type ResearchOrchestratorConfig = { configFingerprint: string; providerName: ResearchAiRunRecord["provider"]; versions: Versions; activeTtlMs: number; cacheDays: number; budget: ResearchBudgetLimits };
export type ResearchOrchestratorDependencies = {
  repository: ResearchRepository; budget: ResearchBudgetRepository;
  entitlements: Pick<EntitlementGate, "authorizeResearch" | "readResearchReservation" | "finalize">;
  audits: AiRunSink & ResearchAiRunReader; provider: ResearchProvider; config: ResearchOrchestratorConfig;
  now?: () => number; createRequestId?: () => string;
};
const text = z.string().min(1).max(160).refine((value) => value === value.trim() && !/[\u0000-\u001f\u007f-\u009f]/u.test(value));
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const version = text.max(64);
const packageVersion = text.max(32).regex(/^\d{4}\.\d{2}\.\d+$/u);
const configSchema = z.object({
  configFingerprint: text, providerName: z.enum(["openrouter", "deterministic-mock"]), activeTtlMs: integer.min(1).max(3_600_000), cacheDays: integer.min(1).max(365),
  versions: z.object({ blueprintVersion: packageVersion, registryVersion: packageVersion, templateVersion: packageVersion, promptVersion: version, inputSchemaVersion: version, outputSchemaVersion: version, qualityVersion: version, modelConfigVersion: version }).strict(),
  budget: z.object({ dailyBudgetMicros: integer, monthlyBudgetMicros: integer, maximumMicros: integer, researchMaximumMicros: integer, repairMaximumMicros: integer }).strict().refine((b) => b.maximumMicros === b.researchMaximumMicros + b.repairMaximumMicros),
}).strict();
const active = (run: ResearchRunRecord) => ["queued", "researching", "validating"].includes(run.state);
const unavailable = () => new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
const quotaKey = (run: ResearchRunRecord) => deterministicId("research-quota", [run.ownerId, run.id, run.requestId]);
const attemptId = (run: ResearchRunRecord, purpose: ResearchAiRunRecord["purpose"]) => deterministicId("research-attempt", [run.ownerId, run.id, run.requestId, purpose]);

/** Coordinates capabilities only: no SQL, provider transport, or client-selected controls. */
export class ResearchOrchestrator {
  private readonly config: ResearchOrchestratorConfig;
  private readonly now: () => number;
  constructor(private readonly dependencies: ResearchOrchestratorDependencies) {
    try {
      this.config = configSchema.parse(readBoundedResearchJson(dependencies.config));
      if (typeof dependencies.entitlements.readResearchReservation !== "function" || typeof dependencies.audits.readResearchAttempt !== "function") throw new Error();
    } catch { throw unavailable(); }
    this.now = () => integer.max(8_640_000_000_000_000 - 366 * 86_400_000).parse((dependencies.now ?? Date.now)());
  }

  async start(ownerId: string, input: unknown, context: ResearchGateContext): Promise<ResearchRunPublicView> {
    const request = researchRequestSchema.parse(readBoundedResearchJson(input));
    text.parse(ownerId);
    const rawRole = text.min(2).parse(request.role.normalize("NFKC").trim().replace(/\s+/gu, " "));
    const normalizedRoleKey = rawRole.toLowerCase();
    const created = await this.dependencies.repository.createOrReplay({ ownerId, rawRole, normalizedRoleKey, locale: request.locale, mutationId: request.mutationId,
      requestId: this.requestId(), inputFingerprint: fingerprint([normalizedRoleKey, request.locale]), configFingerprint: this.config.configFingerprint, activeExpiresAt: this.now() + this.config.activeTtlMs });
    if (created.replayed) return this.replay(created.run);
    return this.execute(created.run, context);
  }

  async get(ownerId: string, runId: string): Promise<ResearchRunPublicView | null> {
    const run = await this.dependencies.repository.getRun(ownerId, runId);
    return run ? this.replay(run) : null;
  }

  async retry(ownerId: string, runId: string, mutationId: string, context: ResearchGateContext): Promise<ResearchRunPublicView> {
    researchRequestSchema.shape.mutationId.parse(mutationId);
    let source = await this.dependencies.repository.getRun(ownerId, runId);
    if (!source) throw new ResearchRepositoryError("NOT_FOUND");
    if (source.configFingerprint !== this.config.configFingerprint) throw new ResearchRepositoryError("CONFLICT");
    await this.replay(source);
    source = (await this.dependencies.repository.getRun(ownerId, runId))!;
    const created = await this.dependencies.repository.createRetry({ ownerId, runId, mutationId, requestId: this.requestId(), activeExpiresAt: this.now() + this.config.activeTtlMs });
    return created.replayed ? this.replay(created.run) : this.execute(created.run, context);
  }

  private requestId() { return text.parse((this.dependencies.createRequestId ?? (() => crypto.randomUUID()))()); }
  private async view(run: ResearchRunRecord) {
    const view = await this.dependencies.repository.getPublicRun(run.ownerId, run.id);
    if (!view) throw unavailable(); return view;
  }
  private async current(run: ResearchRunRecord): Promise<ResearchRunRecord> {
    const current = await this.dependencies.repository.getRun(run.ownerId, run.id);
    if (!current || !active(current) || current.stateVersion !== run.stateVersion || current.state !== run.state || current.activeExpiresAt! <= this.now()) throw new ResearchRepositoryError("CONFLICT");
    return current;
  }
  private async fail(run: ResearchRunRecord, code: string, category: ResearchPublicFailureCategory, retryable = true) {
    return this.dependencies.repository.transition({ id: run.id, ownerId: run.ownerId, expectedVersion: run.stateVersion, from: run.state, to: "failed", errorCode: code, failureCategory: category, retryable });
  }
  private async advance(run: ResearchRunRecord, to: "researching" | "validating") {
    await this.current(run);
    return this.dependencies.repository.transition({ id: run.id, ownerId: run.ownerId, expectedVersion: run.stateVersion, from: run.state, to });
  }

  private async execute(initial: ResearchRunRecord, context: ResearchGateContext): Promise<ResearchRunPublicView> {
    let run = initial;
    try {
      const cached = await this.dependencies.repository.findFreshPackage({ normalizedRoleKey: run.normalizedRoleKey, locale: run.locale, configFingerprint: run.configFingerprint, now: this.now() });
      if (cached) {
        await this.current(run);
        run = await this.dependencies.repository.attachCachedPackage({ id: run.id, ownerId: run.ownerId, expectedVersion: run.stateVersion, package: cached });
      } else {
        const gate = z.object({ cohortEnabled: z.boolean(), rateAllowed: z.boolean() }).strict().parse(context);
        // A legacy admission adapter without durable lookup cannot own a paid run.
        await this.dependencies.entitlements.readResearchReservation(run.ownerId, quotaKey(run));
        const quota = await this.dependencies.entitlements.authorizeResearch({ userId: run.ownerId, purpose: "role-research", idempotencyKey: quotaKey(run), units: 1, ...gate });
        await this.current(run);
        if (!quota.allowed || quota.replayed || quota.finalStatus !== null) {
          run = await this.fail(run, "admission-denied", quota.allowed || quota.reason === "disabled" || quota.reason === "cohort" ? "service-unavailable" : quota.reason === "rate" ? "rate-limited" : "allowance-reached");
        } else {
          const { dailyBudgetMicros, monthlyBudgetMicros, maximumMicros, researchMaximumMicros } = this.config.budget;
          const cost = dailyBudgetMicros && monthlyBudgetMicros && researchMaximumMicros
            ? await this.dependencies.budget.reserve({ ownerId: run.ownerId, runId: run.id, requestId: run.requestId, expiresAt: run.activeExpiresAt!, dailyBudgetMicros, monthlyBudgetMicros, maximumMicros }) : { allowed: false as const };
          await this.current(run);
          if (!cost.allowed || !cost.providerAttemptAllowed || cost.replayed) run = await this.fail(run, "budget-denied", "allowance-reached");
          else {
            run = await this.advance(run, "researching");
            run = await this.produce(run);
          }
        }
      }
    } catch (error) {
      // A storage method may have persisted its terminal write before losing its
      // acknowledgement. Never overwrite that terminal state or its quota verdict.
      const stored = await this.dependencies.repository.getRun(initial.ownerId, initial.id);
      if (!stored) throw unavailable();
      if (active(stored)) {
        try { run = await this.fail(stored, error instanceof ResearchRepositoryError && error.code === "CONFLICT" ? "interrupted" : "storage-failure", "service-unavailable"); }
        catch { return this.replay((await this.dependencies.repository.getRun(initial.ownerId, initial.id))!); }
      } else run = stored;
    }
    return this.replay(run);
  }

  private validationContext(run: ResearchRunRecord): ResearchValidationContext {
    return { ...this.config.versions, packageId: deterministicId("research-package", [run.ownerId, run.id, run.requestId]),
      observedAt: new Date(this.now()).toISOString().slice(0, 10), expiresAt: new Date(this.now() + this.config.cacheDays * 86_400_000).toISOString().slice(0, 10) };
  }

  private async produce(initial: ResearchRunRecord): Promise<ResearchRunRecord> {
    let run = initial;
    const request = { role: run.rawRole, locale: run.locale };
    const first = await this.call(run, "role-research", () => this.dependencies.provider.research(request));
    if (first instanceof ResearchProviderError) return this.providerFailure(run, first);
    try { run = await this.advance(run, "validating"); }
    catch (error) {
      // A late success is still billing evidence, never permission to publish
      // or repair after the owner of the active CAS has expired.
      await this.receipt(run, "role-research", first.result, first.latencyMs, "invalid-result");
      throw error;
    }
    const context = this.validationContext(run);
    let validation = validateResearchCandidate(candidateFromContent(extractJson(first.result.content)), first.result.annotations, context);
    const repairCandidate = !validation.ready && validation.quality.issueCodes.includes("invalid-schema") && this.config.budget.repairMaximumMicros > 0
      ? mechanicallyRepairable(first.result.content, first.result.annotations, context) : null;
    await this.receipt(run, "role-research", first.result, first.latencyMs, repairCandidate ? "repair-required" : validation.ready ? null : "invalid-result");
    if (repairCandidate) {
      const repaired = await this.call(run, "role-research-repair", () => this.dependencies.provider.repair({ ...request, originalContent: first.result.content, annotations: first.result.annotations }));
      if (repaired instanceof ResearchProviderError) return this.providerFailure(run, repaired);
      const candidate = candidateFromContent(extractJson(repaired.result.content));
      let originalOnly = candidate !== null && canonicalJson(candidate) === canonicalJson(repairCandidate);
      try {
        const urls = new Set(first.result.annotations.map((a) => canonicalizePublicCitationUrl(a.url)));
        originalOnly &&= repaired.result.annotations.every((a) => urls.has(canonicalizePublicCitationUrl(a.url)));
      } catch { originalOnly = false; }
      validation = validateResearchCandidate(originalOnly ? candidate : null, first.result.annotations, context);
      await this.receipt(run, "role-research-repair", repaired.result, repaired.latencyMs, validation.ready ? null : "invalid-result");
    }
    await this.current(run);
    return this.dependencies.repository.saveValidation({ id: run.id, ownerId: run.ownerId, expectedVersion: run.stateVersion, normalizedRoleKey: run.normalizedRoleKey, locale: run.locale, configFingerprint: run.configFingerprint, result: validation });
  }

  private async call(run: ResearchRunRecord, purpose: ResearchAiRunRecord["purpose"], action: () => Promise<ProviderResearchResult>) {
    await this.current(run); const startedAt = this.now();
    let returned: ProviderResearchResult | null = null;
    try {
      const result = await action(); returned = result;
      if (!fitsUtf8(result.content, RESEARCH_PROVIDER_LIMITS.contentBytes) || !result.content.trim()) throw new ResearchProviderError("invalid-transport", false, true, result);
      const annotations = z.array(providerCitationAnnotationSchema).max(256).safeParse(readBoundedResearchJson(result.annotations));
      if (!annotations.success) throw new ResearchProviderError("invalid-transport", false, true, result);
      return { result: { ...result, annotations: annotations.data }, latencyMs: this.now() - startedAt };
    } catch (error) {
      const failure = error instanceof ResearchProviderError ? error : returned ? new ResearchProviderError("invalid-transport", false, true, returned) : new ResearchProviderError("unavailable", true, "unknown");
      await this.dependencies.audits.record({ ...this.auditBase(run, purpose, this.now() - startedAt), model: failure.actualModel, usage: failure.usage, charged: failure.charged, status: "failed", errorCode: failure.code });
      return failure;
    }
  }
  private providerFailure(run: ResearchRunRecord, error: ResearchProviderError) {
    const category: ResearchPublicFailureCategory = error.code === "timeout" ? "timeout" : error.code === "rate" ? "rate-limited" : error.code === "balance" ? "allowance-reached" : error.code === "filtered" ? "content-rejected" : error.code === "invalid-transport" ? "invalid-result" : "service-unavailable";
    return this.fail(run, error.code, category, error.retryable);
  }
  private auditBase(run: ResearchRunRecord, purpose: ResearchAiRunRecord["purpose"], latencyMs: number) {
    const { promptVersion, inputSchemaVersion, outputSchemaVersion } = this.config.versions;
    return { userId: run.ownerId, requestId: attemptId(run, purpose), purpose, provider: this.config.providerName, promptVersion, inputSchemaVersion, outputSchemaVersion, latencyMs: Math.max(0, Math.round(latencyMs)) };
  }
  private receipt(run: ResearchRunRecord, purpose: ResearchAiRunRecord["purpose"], result: ProviderResearchResult, latencyMs: number, errorCode: "repair-required" | "invalid-result" | null) {
    const usage = providerUsageSchema.safeParse(result.usage);
    return this.dependencies.audits.record({ ...this.auditBase(run, purpose, latencyMs), model: result.actualModel, usage: usage.success ? usage.data : null, charged: true, status: errorCode ? "rejected" : "accepted", errorCode });
  }

  private async replay(initial: ResearchRunRecord): Promise<ResearchRunPublicView> {
    let run = initial; let reclaimed = false;
    if (active(run)) {
      if (run.activeExpiresAt! > this.now()) return this.view(run);
      try { run = await this.fail(run, "interrupted", "service-unavailable"); reclaimed = true; }
      catch (error) {
        if (!(error instanceof ResearchRepositoryError) || error.code !== "CONFLICT") throw unavailable();
        const winner = await this.dependencies.repository.getRun(run.ownerId, run.id);
        if (!winner) throw unavailable(); return this.replay(winner);
      }
    }
    await this.reconcile(run, reclaimed);
    return this.view(run);
  }

  private async settleCost(run: ResearchRunRecord, cost: BudgetReservation | null, settlement: BudgetSettlement) {
    assertCostConsistency(cost, settlement);
    if (cost && cost.status !== "settled" && cost.status !== "released") await this.dependencies.budget.settle(run.ownerId, cost.id, settlement);
  }
  private async reconcile(run: ResearchRunRecord, reclaimed: boolean) {
    let cost: BudgetReservation | null = null;
    try {
      cost = await this.dependencies.budget.findReservation(run.ownerId, run.id, run.requestId);
      const quota = await this.dependencies.entitlements.readResearchReservation(run.ownerId, quotaKey(run));
      const first = await this.dependencies.audits.readResearchAttempt(run.ownerId, attemptId(run, "role-research"));
      const repair = await this.dependencies.audits.readResearchAttempt(run.ownerId, attemptId(run, "role-research-repair"));
      if (run.state === "ready" && run.stateVersion === 1) {
        if (cost || quota || first || repair) throw unavailable(); return;
      }
      const noProvider = run.stateVersion === 1;
      const interrupted = run.errorCode === "interrupted";
      let complete = noProvider ? !first && !repair : !!first && (first.errorCode === "repair-required" ? !!repair : !repair);
      if (!noProvider && (!quota || !cost)) complete = false;
      if (first && (first.purpose !== "role-research" || first.userId !== run.ownerId || first.requestId !== attemptId(run, "role-research"))) complete = false;
      if (repair && (repair.purpose !== "role-research-repair" || repair.userId !== run.ownerId || repair.requestId !== attemptId(run, "role-research-repair"))) complete = false;
      if (first && repair && (first.provider !== repair.provider || first.promptVersion !== repair.promptVersion || first.inputSchemaVersion !== repair.inputSchemaVersion || first.outputSchemaVersion !== repair.outputSchemaVersion)) complete = false;
      if (run.state === "ready" && first) {
        const published = await this.dependencies.repository.readReadyPackageAuditVersions(run.ownerId, run.id);
        if (first.promptVersion !== published.promptVersion || first.inputSchemaVersion !== published.inputSchemaVersion || first.outputSchemaVersion !== published.outputSchemaVersion) complete = false;
      }
      const finalReceipt = repair ?? first;
      if (run.state === "ready" && finalReceipt?.status !== "accepted") complete = false;
      if (run.state === "needs-review" && finalReceipt?.status !== "rejected") complete = false;
      const status = run.state === "ready" ? "accepted" : run.state === "needs-review" ? "rejected" : "failed";
      if (quota?.finalStatus && quota.finalStatus !== status) throw unavailable();
      if (!complete && (run.state === "ready" || run.state === "needs-review")) throw unavailable();
      if (!noProvider && (!quota || !cost)) throw unavailable();
      const settlement = noProvider && complete ? { kind: "not-charged" as const } : !complete || reclaimed ? { kind: "unknown" as const } : receiptSettlement([first, repair].filter((value): value is ResearchAiRunRecord => value !== null));
      assertCostConsistency(cost, settlement);
      if (quota) await this.dependencies.entitlements.finalize(quota.reservationId, status, status === "accepted" ? 1 : 0);
      await this.settleCost(run, cost, settlement);
      if (!complete && !interrupted) throw unavailable();
    } catch {
      try { await this.settleCost(run, cost, { kind: "unknown" }); } catch { /* Still fail closed if the accounting store itself is unavailable. */ }
      throw unavailable();
    }
  }
}

function assertCostConsistency(cost: BudgetReservation | null, settlement: BudgetSettlement) {
  if (cost && (cost.status === "settled" || cost.status === "released") && settlement.kind !== "unknown") {
    const actual = settlement.kind === "actual" ? settlement.actualMicros : 0;
    if (actual !== cost.settledMicros) throw unavailable();
  }
}

function receiptSettlement(receipts: ResearchAiRunRecord[]): BudgetSettlement {
  if (receipts.every((r) => r.charged === false)) return { kind: "not-charged" };
  if (receipts.some((r) => r.charged !== false && !r.usage)) return { kind: "unknown" };
  const actualMicros = receipts.reduce((sum, r) => sum + (r.charged === false ? 0 : r.usage!.costMicros), 0);
  return Number.isSafeInteger(actualMicros) ? { kind: "actual", actualMicros } : { kind: "unknown" };
}
function extractJson(content: string) {
  const value = content.trim(); const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```$/u.exec(value);
  return fence ? fence[1] : value;
}
/** Only delete syntactic trailing commas outside strings; never fill missing facts. */
function mechanicallyRepairable(content: string, annotations: unknown, context: ResearchValidationContext): ResearchCandidate | null {
  const input = extractJson(content); let result = ""; let quoted = false; let escaped = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (!quoted && char === "," && /^\s*[}\]]/u.test(input.slice(i + 1))) continue;
    result += char;
    if (quoted && escaped) escaped = false;
    else if (quoted && char === "\\") escaped = true;
    else if (char === '"') quoted = !quoted;
  }
  // One missing envelope brace is recoverable only when every inner field is
  // already complete and the entire candidate passes the real quality validator.
  const numericCandidate = (json: string) => {
    try {
      const value: unknown = JSON.parse(json, (key, value: unknown) =>
        ["weeks", "minutes", "estimatedMinutes"].includes(key) && typeof value === "string" && /^\d{1,6}$/u.test(value) ? Number(value) : value);
      return candidateFromContent(JSON.stringify(value));
    } catch { return null; }
  };
  const candidate = numericCandidate(result) ?? (result.endsWith("]") ? numericCandidate(`${result}}`) : null);
  if (!candidate || result === input && candidateFromContent(input)) return null;
  const validation: ResearchValidationResult = validateResearchCandidate(candidate, annotations, context);
  return validation.ready ? candidate : null;
}
