import { z } from "zod";
import { MAX_RESEARCH_PACKAGE_JSON_BYTES, researchPackageSchema, researchRunPublicViewSchema, researchRequestSchema, researchStateSchema, researchPublicFailureCategorySchema, type ResearchPackage, type ResearchRunPublicView } from "../../contracts/research";
import { planningSourceReferenceSchema } from "../../contracts/planning";
import type { PlanningReplayPackageReader, ResearchPlanningSourceReference } from "../planning/source-resolver";
import { canonicalJson, deterministicId } from "../../lib/planning/fingerprint";
import { readBoundedResearchJson } from "./source-audit";
import { bytes, normalizedPackageInserts, parseJson, parseStoredPackage, serialize, validateCandidate, validatePackage, validateQuality, type ExpirationPolicy } from "./d1-publication";
import type { AttachCachedPackageCommand, CreateRemoteResearchRetryCommand, CreateRemoteResearchRunCommand, CreateResearchRetryCommand, CreateResearchRunCommand, RecoverResearchRunCommand, RemoteCreationPolicy, RemoteCreationResult, RemoteResearchCreationRepository, ResearchCacheLookup, ResearchReadyPackageAuditVersions, ResearchRepository, ResearchRunRecord, SaveResearchValidationCommand, TransitionResearchRunCommand } from "./repository";
import { ResearchRepositoryError } from "./repository";
import { BRIDGE_AUTH_PROTOCOL } from "./executor/auth";
import { BRIDGE_EXECUTOR_MODE, BRIDGE_QUEUE_TTL_MS, hashBridgeJob, parseBridgeJob } from "./executor/job";
import { KIMI_RESEARCH_EXECUTION_POLICY } from "./execution-policy";
import { parseResearchValidationContext } from "./package-validator";
import { RESEARCH_CONFIGURATION_VERSIONS } from "./production-policy";
import { parseProviderRequest } from "./provider";
import { buildSiteExecutionInsert, D1SiteExecutionRepository } from "./d1-site-execution-repository";
import type { SiteAdmissionResult, SiteExecutionIdentity, SiteExecutionRecord } from "./site-execution-repository";

const PACKAGE_MAX = MAX_RESEARCH_PACKAGE_JSON_BYTES;
const QUALITY_MAX = 16_384;
const CANDIDATE_MAX = 1_048_576;
const IDEMPOTENCY_SCOPE = "role-research";
type Row = Record<string, unknown>;
type Options = { now?: () => number; createId?: () => string; createJobId?: () => string };
const boundedText = z.string().min(1).max(256).refine((value) => value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value));
const remoteIdentityText = z.string().min(1).max(160).refine((value) => value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value));
const idSchema = researchPackageSchema.shape.id;
const integerSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const identityShape = { ownerId: boundedText, id: idSchema };
const cacheShape = { normalizedRoleKey: boundedText, locale: z.enum(["zh-CN", "en-US"]), configFingerprint: boundedText };
const createSchema = z.object({ ...cacheShape, ownerId: boundedText, requestId: boundedText, mutationId: researchRequestSchema.shape.mutationId, rawRole: researchRequestSchema.shape.role, inputFingerprint: boundedText, activeExpiresAt: integerSchema }).strict();
const cacheSchema = z.object({ ...cacheShape, now: integerSchema.optional() }).strict();
const casShape = { ...identityShape, expectedVersion: integerSchema.max(Number.MAX_SAFE_INTEGER - 1) };
const errorCodeSchema = z.string().max(64).regex(/^[a-z]+(?:-[a-z]+)*$/u);
const transitionSchema = z.object({ ...casShape, from: researchStateSchema, to: researchStateSchema, retryable: z.boolean().optional(), errorCode: errorCodeSchema.optional(), failureCategory: researchPublicFailureCategorySchema.optional() }).strict();
const attachSchema = z.object({ ...casShape, package: z.unknown() }).strict();
const remoteAttachSchema = z.object({
  ownerId: remoteIdentityText,
  runId: idSchema,
  requestId: remoteIdentityText,
  jobId: z.uuid(),
  requestHash: z.string().length(64).regex(/^[0-9a-f]{64}$/u),
  expectedRunVersion: integerSchema.max(Number.MAX_SAFE_INTEGER - 1),
  expectedExecutionVersion: integerSchema.max(Number.MAX_SAFE_INTEGER - 1),
  package: z.unknown(),
}).strict();
const saveSchema = z.object({ ...casShape, ...cacheShape, result: z.unknown() }).strict();
const retrySchema = z.object({ ownerId: boundedText, requestId: boundedText, mutationId: researchRequestSchema.shape.mutationId, runId: idSchema, activeExpiresAt: integerSchema }).strict();
const remotePolicySchema = z.object({
  cacheDays: z.number().int().min(1).max(365),
  userDailyQuota: z.number().int().min(1).max(100_000),
  dailyBudgetMicros: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  monthlyBudgetMicros: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  maximumMicros: z.number().int().min(1).max(5_000_000),
}).strict();
const remoteCreateSchema = z.object({
  ...cacheShape,
  ownerId: remoteIdentityText,
  requestId: remoteIdentityText,
  mutationId: researchRequestSchema.shape.mutationId,
  rawRole: researchRequestSchema.shape.role,
  inputFingerprint: boundedText,
  policy: remotePolicySchema,
}).strict();
const remoteRetrySchema = z.object({
  ownerId: remoteIdentityText,
  runId: idSchema,
  requestId: remoteIdentityText,
  mutationId: researchRequestSchema.shape.mutationId,
  currentConfigFingerprint: boundedText,
  policy: remotePolicySchema,
}).strict();
const aliasSchema = z.object({ runId: idSchema, ...cacheShape, inputFingerprint: boundedText, retryOfRunId: idSchema.nullable() }).strict();
const recoverySchema = z.object({
  ownerId: boundedText,
  mutationId: researchRequestSchema.shape.mutationId,
  normalizedRoleKey: boundedText,
  locale: z.enum(["zh-CN", "en-US"]),
  inputFingerprint: boundedText,
  retryOfRunId: idSchema.nullable(),
}).strict();

export class D1ResearchRepository implements ResearchRepository, RemoteResearchCreationRepository {
  private readonly now: () => number;
  private readonly createId: () => string;
  private readonly createJobId: () => string;
  private readonly executions: D1SiteExecutionRepository;
  constructor(private readonly db: D1Database, options: Options = {}) {
    this.now = () => parseContract(integerSchema, (options.now ?? Date.now)());
    this.createId = () => parseContract(idSchema, (options.createId ?? (() => crypto.randomUUID()))());
    this.createJobId = () => parseContract(z.uuid(), (options.createJobId ?? (() => crypto.randomUUID()))());
    this.executions = new D1SiteExecutionRepository(db, this);
  }

  async createOrReplay(command: CreateResearchRunCommand) {
    const result = await this.create(parseContract(createSchema, command), null);
    return { run: result.run, replayed: result.replayed };
  }

  async createRemoteOrReplay(command: CreateRemoteResearchRunCommand): Promise<RemoteCreationResult> {
    const bounded = parseContract(remoteCreateSchema, command);
    const provider = parseRemoteProviderRequest(bounded.rawRole, bounded.locale);
    return this.create({ ...bounded, rawRole: provider.role, activeExpiresAt: 0 }, null, Object.freeze(bounded.policy));
  }

  async attachRemoteCachedPackage(input: SiteExecutionIdentity & Readonly<{
    expectedRunVersion: number;
    expectedExecutionVersion: number;
    package: ResearchPackage;
  }>): Promise<SiteAdmissionResult> {
    const bounded = parseContract(remoteAttachSchema, input, ["package"]);
    const now = this.now();
    const candidate = validatePackage(bounded.package, { kind: "require-fresh", now });
    const run = await this.getRun(bounded.ownerId, bounded.runId);
    if (!run) throw new ResearchRepositoryError("NOT_FOUND");
    const pack = await this.validateCachedAttachment(run, candidate, "CONFLICT", now);
    const execution = await this.executions.read(bounded.ownerId, bounded.runId);
    if (!execution || execution.requestId !== bounded.requestId || execution.jobId !== bounded.jobId
      || execution.requestHash !== bounded.requestHash) throw new ResearchRepositoryError("CONFLICT");

    const exactReplay = await this.exactRemoteCacheResult(bounded, pack, run, execution);
    if (exactReplay) return exactReplay;
    if (run.state !== "queued" || run.stateVersion !== bounded.expectedRunVersion
      || execution.admissionState !== "pending" || execution.version !== bounded.expectedExecutionVersion
      || execution.quotaReservationId !== null || execution.budgetReservationId !== null
      || execution.admittedAt !== null || execution.closedAt !== null || execution.closeReason !== null
      || execution.beganAt !== null) throw new ResearchRepositoryError("CONFLICT");

    const sqlNow = "CAST(ROUND(unixepoch('subsec') * 1000) AS INTEGER)";
    const closeExecution = this.db.prepare(`UPDATE research_site_executions AS e
      SET admission_state='closed',closed_at=${sqlNow},close_reason='cached',version=version+1,updated_at=${sqlNow}
      WHERE e.user_id=?1 AND e.run_id=?2 AND e.request_id=?3 AND e.job_id=?4 AND e.request_hash=?5
        AND e.version=?6 AND e.version<${Number.MAX_SAFE_INTEGER} AND e.admission_state='pending'
        AND e.quota_reservation_id IS NULL AND e.budget_reservation_id IS NULL AND e.admitted_at IS NULL
        AND e.began_at IS NULL AND e.closed_at IS NULL AND e.close_reason IS NULL
        AND ${sqlNow}<e.queue_expires_at
        AND NOT EXISTS(SELECT 1 FROM quota_ledger q WHERE q.user_id=e.user_id AND q.idempotency_key=e.quota_key)
        AND NOT EXISTS(SELECT 1 FROM ai_budget_reservations b WHERE b.run_id=e.run_id OR b.request_id=e.request_id)
        AND EXISTS(SELECT 1 FROM research_runs r
          WHERE r.id=e.run_id AND r.user_id=e.user_id AND r.request_id=e.request_id
            AND r.execution_mode='cloudflare-workflow-v1' AND r.remote_quota_key=e.quota_key
            AND r.state='queued' AND r.state_version=?7 AND r.state_version<${Number.MAX_SAFE_INTEGER}
            AND r.active_slot=1 AND r.active_expires_at=e.queue_expires_at)
        AND EXISTS(SELECT 1 FROM research_packages p
          WHERE p.id=?8 AND p.normalized_role_key=?9 AND p.locale=?10 AND p.config_fingerprint=?11
            AND p.content_fingerprint=?12 AND p.package_json=?13 AND p.quality_json=?14
            AND p.expires_at>${sqlNow})`).bind(
      bounded.ownerId, bounded.runId, bounded.requestId, bounded.jobId, bounded.requestHash,
      bounded.expectedExecutionVersion, bounded.expectedRunVersion, pack.id,
      run.normalizedRoleKey, run.locale, run.configFingerprint, pack.contentFingerprint,
      serialize(pack, PACKAGE_MAX), serialize(pack.qualityReport, QUALITY_MAX),
    );
    const assertOne = () => this.db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('') END AS lifecycle_assertion");
    const readyRun = this.db.prepare(`UPDATE research_runs AS r
      SET state='ready',state_version=state_version+1,retryable=0,active_slot=NULL,active_expires_at=NULL,
        package_id=?1,quality_json=?2,candidate_json=NULL,error_code=NULL,public_failure_category=NULL,updated_at=${sqlNow}
      WHERE r.id=?3 AND r.user_id=?4 AND r.request_id=?5 AND r.state='queued' AND r.state_version=?6
        AND r.state_version<${Number.MAX_SAFE_INTEGER} AND r.execution_mode='cloudflare-workflow-v1'
        AND EXISTS(SELECT 1 FROM research_site_executions e
          WHERE e.run_id=r.id AND e.user_id=r.user_id AND e.request_id=r.request_id
            AND e.job_id=?7 AND e.request_hash=?8 AND e.quota_key=r.remote_quota_key
            AND e.admission_state='closed' AND e.close_reason='cached' AND e.closed_at IS NOT NULL
            AND e.began_at IS NULL AND e.version=?9)
        AND EXISTS(SELECT 1 FROM research_packages p
          WHERE p.id=?1 AND p.normalized_role_key=?10 AND p.locale=?11 AND p.config_fingerprint=?12
            AND p.content_fingerprint=?13 AND p.package_json=?14 AND p.quality_json=?2
            AND p.expires_at>${sqlNow})`)
      .bind(pack.id, serialize(pack.qualityReport, QUALITY_MAX), bounded.runId, bounded.ownerId,
        bounded.requestId, bounded.expectedRunVersion, bounded.jobId, bounded.requestHash,
        bounded.expectedExecutionVersion + 1, run.normalizedRoleKey, run.locale,
        run.configFingerprint, pack.contentFingerprint, serialize(pack, PACKAGE_MAX));
    try {
      await storage(() => this.db.batch([closeExecution, assertOne(), readyRun, assertOne()]));
    } catch (error) {
      const recoveredRun = await this.getRun(bounded.ownerId, bounded.runId);
      const recoveredExecution = await this.executions.read(bounded.ownerId, bounded.runId);
      const recovered = await this.exactRemoteCacheResult(bounded, pack, recoveredRun, recoveredExecution);
      if (recovered) return recovered;
      if (error instanceof ResearchRepositoryError) throw error;
      throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
    }
    const savedRun = await this.requiredRun(bounded.ownerId, bounded.runId);
    const savedExecution = await this.executions.read(bounded.ownerId, bounded.runId);
    const saved = await this.exactRemoteCacheResult(bounded, pack, savedRun, savedExecution);
    if (!saved) throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
    return saved;
  }

  async findRecoveryRun(command: RecoverResearchRunCommand): Promise<ResearchRunRecord | null> {
    command = parseContract(recoverySchema, command);
    const row = await storage(() => this.db.prepare(
      "SELECT response_json FROM idempotency_records WHERE user_id=?1 AND scope=?2 AND mutation_id=?3 LIMIT 1",
    ).bind(command.ownerId, IDEMPOTENCY_SCOPE, command.mutationId).first<Row>());
    if (row) {
      if (typeof row.response_json !== "string") throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
      const alias = parseContract(aliasSchema, parseJson(row.response_json, 4096));
      if (alias.retryOfRunId !== command.retryOfRunId
        || alias.inputFingerprint !== command.inputFingerprint
        || alias.normalizedRoleKey !== command.normalizedRoleKey
        || alias.locale !== command.locale) return null;
      const run = await this.requiredRun(command.ownerId, alias.runId);
      if (run.normalizedRoleKey !== alias.normalizedRoleKey
        || run.locale !== alias.locale
        || run.inputFingerprint !== alias.inputFingerprint
        || run.configFingerprint !== alias.configFingerprint) {
        throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
      }
      return run;
    }
    const direct = await this.getRunByMutation(command.ownerId, command.mutationId);
    if (!direct) return null;
    return direct.retryOfRunId === command.retryOfRunId
      && direct.inputFingerprint === command.inputFingerprint
      && direct.normalizedRoleKey === command.normalizedRoleKey
      && direct.locale === command.locale ? direct : null;
  }

  private async create(command: CreateResearchRunCommand, retryOfRunId: string | null, remotePolicy?: RemoteCreationPolicy): Promise<RemoteCreationResult> {
    const alias = await this.findAlias(command, retryOfRunId);
    if (alias) return this.creationResult(alias, true);
    const direct = await this.getRunByMutation(command.ownerId, command.mutationId);
    if (direct) return this.creationResult(assertSameInput(direct, command, retryOfRunId), true);
    const active = await this.findActive(command);
    if (active) {
      await this.executionForWinner(active);
      const replay = await this.persistAlias(command, active, retryOfRunId);
      return this.creationResult(replay.run, replay.replayed);
    }
    const id = parseContract(idSchema, this.createId());
    const now = parseContract(integerSchema, this.now());
    const stored = aliasJson(command, id, retryOfRunId);
    let initial: SiteExecutionRecord | null = null;
    if (remotePolicy) {
      initial = await this.buildRemoteExecution(command, id, now, remotePolicy);
    }
    try {
      const runInsert = initial
        ? this.db.prepare(`INSERT INTO research_runs (id,user_id,request_id,mutation_id,raw_role,normalized_role_key,locale,input_fingerprint,config_fingerprint,state,state_version,retryable,active_slot,active_expires_at,created_at,updated_at,retry_of_run_id,execution_mode,remote_quota_key)
          VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'queued',0,0,1,?10,?11,?11,?12,?13,?14)`).bind(id, command.ownerId, command.requestId, command.mutationId, command.rawRole, command.normalizedRoleKey, command.locale, command.inputFingerprint, command.configFingerprint, initial.job.queueExpiresAt, now, retryOfRunId, BRIDGE_EXECUTOR_MODE, initial.quotaKey)
        : this.db.prepare(`INSERT INTO research_runs (id,user_id,request_id,mutation_id,raw_role,normalized_role_key,locale,input_fingerprint,config_fingerprint,state,state_version,retryable,active_slot,active_expires_at,created_at,updated_at,retry_of_run_id)
          VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'queued',0,0,1,?10,?11,?11,?12)`).bind(id, command.ownerId, command.requestId, command.mutationId, command.rawRole, command.normalizedRoleKey, command.locale, command.inputFingerprint, command.configFingerprint, command.activeExpiresAt, now, retryOfRunId);
      const aliasInsert = this.db.prepare("INSERT INTO idempotency_records (id,user_id,scope,mutation_id,response_json,created_at) VALUES (?1,?2,?3,?4,?5,?6)")
        .bind(this.createId(), command.ownerId, IDEMPOTENCY_SCOPE, command.mutationId, stored, now);
      const statements = initial
        ? [runInsert, aliasInsert, buildSiteExecutionInsert(this.db, initial), this.db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('') END AS lifecycle_assertion")]
        : [runInsert, aliasInsert];
      await this.db.batch(statements);
    } catch {
      const replay = await this.findAlias(command, retryOfRunId);
      if (replay) return this.creationResult(replay, true);
      const won = await this.getRunByMutation(command.ownerId, command.mutationId);
      if (won) return this.creationResult(assertSameInput(won, command, retryOfRunId), true);
      const joined = await this.findActive(command);
      if (joined) {
        await this.executionForWinner(joined);
        const result = await this.persistAlias(command, joined, retryOfRunId);
        return this.creationResult(result.run, result.replayed);
      }
      throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
    }
    const run = await this.getRun(command.ownerId, id);
    if (!run) throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
    return this.creationResult(run, false);
  }

  async getRun(ownerId: string, runId: string): Promise<ResearchRunRecord | null> {
    parseContract(z.object(identityShape).strict(), { ownerId, id: runId });
    const row = await storage(() => this.db.prepare("SELECT * FROM research_runs WHERE user_id=?1 AND id=?2 LIMIT 1").bind(ownerId, runId).first<Row>());
    return row ? parseRun(row) : null;
  }

  async findFreshPackage(input: ResearchCacheLookup): Promise<ResearchPackage | null> {
    input = parseContract(cacheSchema, input);
    const now = input.now ?? this.now();
    const row = await storage(() => this.db.prepare(`SELECT * FROM research_packages
      WHERE normalized_role_key=?1 AND locale=?2 AND config_fingerprint=?3 AND expires_at>?4 ORDER BY created_at DESC LIMIT 1`)
      .bind(input.normalizedRoleKey, input.locale, input.configFingerprint, now).first<Row>());
    if (!row) return null;
    return parseStoredPackage(row, { kind: "require-fresh", now });
  }

  async attachCachedPackage(command: AttachCachedPackageCommand): Promise<ResearchRunRecord> {
    const bounded = parseContract(attachSchema, command, ["package"]);
    command = { ...bounded, package: validatePackage(bounded.package, { kind: "require-fresh", now: this.now() }) };
    const run = await this.getRun(command.ownerId, command.id);
    if (!run) throw new ResearchRepositoryError("NOT_FOUND");
    const pack = await this.validateCachedAttachment(run, command.package, "CONFLICT", this.now());
    const result = await storage(() => this.db.prepare(`UPDATE research_runs SET state='ready',state_version=state_version+1,active_slot=NULL,active_expires_at=NULL,package_id=?1,quality_json=?2,updated_at=?3
      WHERE id=?4 AND user_id=?5 AND state_version=?6 AND state='queued' AND execution_mode='synchronous'`).bind(pack.id, serialize(pack.qualityReport, QUALITY_MAX), this.now(), command.id, command.ownerId, command.expectedVersion).run());
    if ((result.meta?.changes ?? 0) !== 1) throw new ResearchRepositoryError("CONFLICT");
    return this.requiredRun(command.ownerId, command.id);
  }

  private async validateCachedAttachment(
    run: ResearchRunRecord,
    candidate: ResearchPackage,
    code: "CONFLICT" | "RESEARCH_UNAVAILABLE",
    now: number,
  ): Promise<ResearchPackage> {
    const stored = await storage(() => this.db.prepare("SELECT * FROM research_packages WHERE id=?1 LIMIT 1")
      .bind(candidate.id).first<Row>());
    if (!stored) throw new ResearchRepositoryError(code);
    assertCacheIdentity(run, stored, code);
    const pack = parseStoredPackage(stored, { kind: "require-fresh", now });
    if (canonicalJson(pack) !== canonicalJson(validatePackage(candidate, { kind: "require-fresh", now }))) {
      throw new ResearchRepositoryError(code);
    }
    return pack;
  }

  private async exactRemoteCacheResult(
    command: z.infer<typeof remoteAttachSchema>,
    pack: ResearchPackage,
    run: ResearchRunRecord | null,
    execution: SiteExecutionRecord | null,
  ): Promise<SiteAdmissionResult | null> {
    if (!run || !execution || run.ownerId !== command.ownerId || run.id !== command.runId
      || run.requestId !== command.requestId || execution.ownerId !== command.ownerId
      || execution.runId !== command.runId || execution.requestId !== command.requestId
      || execution.jobId !== command.jobId || execution.requestHash !== command.requestHash
      || execution.version !== command.expectedExecutionVersion + 1
      || execution.admissionState !== "closed" || execution.closeReason !== "cached"
      || execution.closedAt === null || execution.beganAt !== null
      || execution.quotaReservationId !== null || execution.budgetReservationId !== null
      || execution.admittedAt !== null || run.executionMode !== "cloudflare-workflow-v1"
      || run.remoteQuotaKey !== execution.quotaKey || run.state !== "ready"
      || run.stateVersion !== command.expectedRunVersion + 1
      || run.activeExpiresAt !== null || run.packageId !== pack.id
      || canonicalJson(run.quality) !== canonicalJson(pack.qualityReport)) return null;
    const reservations = await storage(() => this.db.prepare(`SELECT
      EXISTS(SELECT 1 FROM quota_ledger WHERE user_id=?1 AND idempotency_key=?2) AS has_quota,
      EXISTS(SELECT 1 FROM ai_budget_reservations WHERE run_id=?3 OR request_id=?4) AS has_budget`)
      .bind(command.ownerId, execution.quotaKey, command.runId, command.requestId).first<Row>());
    if (!reservations || reservations.has_quota !== 0 || reservations.has_budget !== 0) {
      throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
    }
    return Object.freeze({ run, execution });
  }

  async transition(command: TransitionResearchRunCommand): Promise<ResearchRunRecord> {
    command = parseContract(transitionSchema, command);
    assertTransition(command);
    const terminal = command.to === "ready" || command.to === "needs-review" || command.to === "failed";
    const result = await storage(() => this.db.prepare(`UPDATE research_runs SET state=?1,state_version=state_version+1,retryable=?2,error_code=?3,public_failure_category=?4,
      active_slot=CASE WHEN ?5 THEN NULL ELSE 1 END,active_expires_at=CASE WHEN ?5 THEN NULL ELSE active_expires_at END,updated_at=?6
      WHERE id=?7 AND user_id=?8 AND state_version=?9 AND state=?10 AND execution_mode='synchronous'`)
      .bind(command.to, command.retryable ? 1 : 0, command.errorCode ?? null, command.failureCategory ?? null, terminal ? 1 : 0, this.now(), command.id, command.ownerId, command.expectedVersion, command.from).run());
    if ((result.meta?.changes ?? 0) !== 1) throw new ResearchRepositoryError("CONFLICT");
    return this.requiredRun(command.ownerId, command.id);
  }

  async saveValidation(command: SaveResearchValidationCommand): Promise<ResearchRunRecord> {
    const bounded = parseContract(saveSchema, command, ["result"]);
    const envelope = parseContract(z.discriminatedUnion("ready", [
      z.object({ ready: z.literal(true), quality: z.unknown(), package: z.unknown() }).strict(),
      z.object({ ready: z.literal(false), quality: z.unknown(), sanitizedCandidate: z.unknown() }).strict(),
    ]), bounded.result, ["package", "quality", "sanitizedCandidate"]);
    command = { ...bounded, result: envelope as SaveResearchValidationCommand["result"] };
    const run = await this.getRun(command.ownerId, command.id);
    if (!run) throw new ResearchRepositoryError("NOT_FOUND");
    if (run.executionMode !== "synchronous") throw new ResearchRepositoryError("CONFLICT");
    if (run.normalizedRoleKey !== command.normalizedRoleKey || run.locale !== command.locale || run.configFingerprint !== command.configFingerprint) throw new ResearchRepositoryError("CONFLICT");
    if (!command.result.ready) return this.saveNeedsReview({ ...command, result: command.result });
    const packageValue = validatePackage(command.result.package, { kind: "require-fresh", now: this.now() });
    if (canonicalJson(validateQuality(command.result.quality)) !== canonicalJson(packageValue.qualityReport)) throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
    if (bytes(JSON.stringify(packageValue)) > PACKAGE_MAX) return this.transition({ id: command.id, ownerId: command.ownerId, expectedVersion: command.expectedVersion, from: "validating", to: "failed", errorCode: "result-too-large", failureCategory: "invalid-result", retryable: false });
    const existing = await storage(() => this.db.prepare("SELECT * FROM research_packages WHERE content_fingerprint=?1 AND config_fingerprint=?2 LIMIT 1")
      .bind(packageValue.contentFingerprint, command.configFingerprint).first<Row>());
    if (existing) {
      assertCacheIdentity(run, existing, "CONFLICT");
      const exact = parseStoredPackage(existing, { kind: "require-fresh", now: this.now() });
      if (canonicalJson(exact) !== canonicalJson(packageValue)) throw new ResearchRepositoryError("CONFLICT");
      return this.attachReady(command, exact, []);
    }
    const results = await storage(() => this.db.batch(this.readyStatements(command, packageValue)));
    const changes = results.at(-1)?.meta?.changes ?? 0;
    if (changes !== 1) throw new ResearchRepositoryError("CONFLICT");
    return this.requiredRun(command.ownerId, command.id);
  }

  async getPublicRun(ownerId: string, runId: string): Promise<ResearchRunPublicView | null> {
    const run = await this.getRun(ownerId, runId); if (!run) return null;
    try {
      if (run.state === "ready") {
        const packageValue = await this.resolveReadyPackage(ownerId, runId);
        return researchRunPublicViewSchema.parse({ id: run.id, role: run.rawRole, locale: run.locale, state: "ready", retryable: false, packageId: packageValue.id, summary: packageValue.blueprint.summary, skillCount: packageValue.blueprint.skills.length, sourceCount: packageValue.sourceEvidence.length, observedAt: packageValue.observedAt, quality: { passed: true, issueCodes: [] }, planningData: { id: packageValue.id, blueprint: packageValue.blueprint, registry: packageValue.registry } });
      }
      if (run.state === "needs-review") return researchRunPublicViewSchema.parse({ id: run.id, role: run.rawRole, locale: run.locale, state: run.state, retryable: run.retryable, quality: { issueCodes: run.quality?.issueCodes ?? ["invalid-schema"], skillCount: run.quality?.skillCount ?? 0, sourceCount: run.quality?.sourceCount ?? 0, unitCount: run.quality?.unitCount ?? 0 } });
      if (run.state === "failed") return researchRunPublicViewSchema.parse({ id: run.id, role: run.rawRole, locale: run.locale, state: run.state, retryable: run.retryable, failureCategory: run.failureCategory ?? "internal" });
      return researchRunPublicViewSchema.parse({ id: run.id, role: run.rawRole, locale: run.locale, state: run.state, retryable: false });
    } catch { throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); }
  }

  async createRetry(command: CreateResearchRetryCommand) {
    command = parseContract(retrySchema, command);
    const source = await this.getRun(command.ownerId, command.runId);
    if (!source) throw new ResearchRepositoryError("NOT_FOUND");
    if (source.executionMode !== "synchronous" || !["needs-review", "failed"].includes(source.state) || !source.retryable || command.requestId === source.requestId) throw new ResearchRepositoryError("CONFLICT");
    const result = await this.create({ ownerId: command.ownerId, requestId: command.requestId, mutationId: command.mutationId, rawRole: source.rawRole, normalizedRoleKey: source.normalizedRoleKey, locale: source.locale, inputFingerprint: source.inputFingerprint, configFingerprint: source.configFingerprint, activeExpiresAt: command.activeExpiresAt }, source.id);
    return { run: result.run, replayed: result.replayed };
  }

  async createRemoteRetry(command: CreateRemoteResearchRetryCommand): Promise<RemoteCreationResult> {
    const bounded = parseContract(remoteRetrySchema, command);
    const source = await this.getRun(bounded.ownerId, bounded.runId);
    if (!source) throw new ResearchRepositoryError("NOT_FOUND");
    if (!["needs-review", "failed"].includes(source.state) || !source.retryable
      || bounded.requestId === source.requestId || bounded.currentConfigFingerprint !== source.configFingerprint) {
      throw new ResearchRepositoryError("CONFLICT");
    }
    const provider = parseRemoteProviderRequest(source.rawRole, source.locale);
    return this.create({
      ownerId: bounded.ownerId,
      requestId: bounded.requestId,
      mutationId: bounded.mutationId,
      rawRole: provider.role,
      normalizedRoleKey: source.normalizedRoleKey,
      locale: source.locale,
      inputFingerprint: source.inputFingerprint,
      configFingerprint: source.configFingerprint,
      activeExpiresAt: 0,
    }, source.id, Object.freeze(bounded.policy));
  }

  async resolveReadyPackage(ownerId: string, runId: string): Promise<ResearchPackage> {
    return this.readReadyPackage(ownerId, runId, { kind: "require-fresh", now: this.now() });
  }

  async readReadyPackageAuditVersions(ownerId: string, runId: string): Promise<ResearchReadyPackageAuditVersions> {
    const { promptVersion, inputSchemaVersion, outputSchemaVersion } = await this.readReadyPackage(ownerId, runId, { kind: "ignore-for-audit" });
    return Object.freeze({ promptVersion, inputSchemaVersion, outputSchemaVersion });
  }

  private async readReadyPackage(ownerId: string, runId: string, expiration: ExpirationPolicy): Promise<ResearchPackage> {
    const run = await this.getRun(ownerId, runId);
    if (!run) throw new ResearchRepositoryError("NOT_FOUND");
    if (run.state !== "ready") throw new ResearchRepositoryError("NOT_READY");
    const row = await storage(() => this.db.prepare("SELECT * FROM research_packages WHERE id=?1 LIMIT 1").bind(run.packageId).first<Row>());
    if (!row) throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
    assertCacheIdentity(run, row, "RESEARCH_UNAVAILABLE");
    const pack = parseStoredPackage(row, expiration);
    if (canonicalJson(run.quality) !== canonicalJson(pack.qualityReport)) throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
    return pack;
  }

  private async getRunByMutation(ownerId: string, mutationId: string) {
    const row = await storage(() => this.db.prepare("SELECT * FROM research_runs WHERE user_id=?1 AND mutation_id=?2 LIMIT 1").bind(ownerId, mutationId).first<Row>());
    return row ? parseRun(row) : null;
  }
  private async findAlias(command: CreateResearchRunCommand, retryOfRunId: string | null) {
    const row = await storage(() => this.db.prepare("SELECT response_json FROM idempotency_records WHERE user_id=?1 AND scope=?2 AND mutation_id=?3 LIMIT 1").bind(command.ownerId, IDEMPOTENCY_SCOPE, command.mutationId).first<Row>());
    if (!row) return null;
    if (typeof row.response_json !== "string") throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
    const value = parseContract(aliasSchema, parseJson(row.response_json, 4096));
    if (value.retryOfRunId !== retryOfRunId || value.inputFingerprint !== command.inputFingerprint || value.normalizedRoleKey !== command.normalizedRoleKey || value.locale !== command.locale || value.configFingerprint !== command.configFingerprint) throw new ResearchRepositoryError("CONFLICT");
    const run = await this.requiredRun(command.ownerId, value.runId);
    if (run.normalizedRoleKey !== value.normalizedRoleKey || run.locale !== value.locale || run.configFingerprint !== value.configFingerprint) throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
    return run;
  }
  private async findActive(command: Pick<CreateResearchRunCommand, "ownerId" | "normalizedRoleKey" | "locale" | "configFingerprint">) {
    const row = await storage(() => this.db.prepare("SELECT * FROM research_runs WHERE user_id=?1 AND normalized_role_key=?2 AND locale=?3 AND config_fingerprint=?4 AND active_slot=1 LIMIT 1").bind(command.ownerId, command.normalizedRoleKey, command.locale, command.configFingerprint).first<Row>());
    return row ? parseRun(row) : null;
  }
  private async persistAlias(command: CreateResearchRunCommand, run: ResearchRunRecord, retryOfRunId: string | null) {
    const stored = aliasJson(command, run.id, retryOfRunId);
    try { await this.db.prepare("INSERT INTO idempotency_records (id,user_id,scope,mutation_id,response_json,created_at) VALUES (?1,?2,?3,?4,?5,?6)").bind(this.createId(), command.ownerId, IDEMPOTENCY_SCOPE, command.mutationId, stored, this.now()).run(); }
    catch { const replay = await this.findAlias(command, retryOfRunId); if (replay) return { run: replay, replayed: true }; throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); }
    return { run, replayed: true };
  }
  private async creationResult(run: ResearchRunRecord, replayed: boolean): Promise<RemoteCreationResult> {
    return { run, replayed, execution: await this.executionForWinner(run) };
  }
  private async executionForWinner(run: ResearchRunRecord): Promise<SiteExecutionRecord | null> {
    return run.executionMode === BRIDGE_EXECUTOR_MODE ? this.executions.read(run.ownerId, run.id) : null;
  }
  private async buildRemoteExecution(command: CreateResearchRunCommand, id: string, createdAt: number, policy: RemoteCreationPolicy): Promise<SiteExecutionRecord> {
    try {
      const quotaKey = deterministicId("research-quota", [command.ownerId, id, command.requestId]);
      const job = parseBridgeJob({
        protocol: BRIDGE_AUTH_PROTOCOL,
        executor: BRIDGE_EXECUTOR_MODE,
        jobId: this.createJobId(),
        runId: id,
        requestId: command.requestId,
        inputFingerprint: command.inputFingerprint,
        configFingerprint: command.configFingerprint,
        policyId: KIMI_RESEARCH_EXECUTION_POLICY.profileId,
        role: command.rawRole,
        locale: command.locale,
        createdAt,
        queueExpiresAt: createdAt + BRIDGE_QUEUE_TTL_MS,
      });
      const requestHash = await hashBridgeJob(job);
      const validationContext = parseResearchValidationContext({
        ...RESEARCH_CONFIGURATION_VERSIONS,
        packageId: deterministicId("research-package", [command.ownerId, id, command.requestId]),
        observedAt: calendarDate(createdAt),
        expiresAt: calendarDate(createdAt + policy.cacheDays * 86_400_000),
      });
      return Object.freeze({
        ownerId: command.ownerId,
        runId: id,
        requestId: command.requestId,
        jobId: job.jobId,
        requestHash,
        job,
        validationContext,
        quotaKey,
        policy,
        reservationExpiresAt: createdAt + 1_380_000,
        admissionState: "pending",
        version: 0,
        quotaReservationId: null,
        budgetReservationId: null,
        admittedAt: null,
        closedAt: null,
        closeReason: null,
        beganAt: null,
        executionExpiresAt: null,
        createdAt,
        updatedAt: createdAt,
      });
    } catch {
      throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
    }
  }
  private async requiredRun(ownerId: string, id: string) { const run = await this.getRun(ownerId, id); if (!run) throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); return run; }
  private async saveNeedsReview(command: SaveResearchValidationCommand & { result: Extract<SaveResearchValidationCommand["result"], { ready: false }> }) {
    const quality = validateQuality(command.result.quality); if (quality.passed || quality.issueCodes.length === 0) throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
    let candidate: string | null = null;
    let state: "needs-review" | "failed" = "failed";
    try {
      const safeCandidate = validateCandidate(command.result.sanitizedCandidate);
      state = "needs-review";
      const serialized = JSON.stringify(safeCandidate);
      candidate = bytes(serialized) <= CANDIDATE_MAX ? serialized : null;
    } catch { /* Null, unsafe or structurally incomplete results fail; never persist raw input. */ }
    const result = await storage(() => this.db.prepare(`UPDATE research_runs SET state=?7,state_version=state_version+1,retryable=1,active_slot=NULL,active_expires_at=NULL,quality_json=?1,candidate_json=?2,error_code=?8,public_failure_category=?9,updated_at=?3
      WHERE id=?4 AND user_id=?5 AND state_version=?6 AND state='validating' AND execution_mode='synchronous'`).bind(serialize(quality, QUALITY_MAX), candidate, this.now(), command.id, command.ownerId, command.expectedVersion, state, state === "failed" ? "invalid-result" : null, state === "failed" ? "invalid-result" : null).run());
    if ((result.meta?.changes ?? 0) !== 1) throw new ResearchRepositoryError("CONFLICT"); return this.requiredRun(command.ownerId, command.id);
  }
  private async attachReady(command: SaveResearchValidationCommand, packageValue: ResearchPackage, extra: D1PreparedStatement[]) {
    const result = await storage(() => this.db.batch([...extra, this.readyUpdate(command, packageValue)]));
    if ((result.at(-1)?.meta?.changes ?? 0) !== 1) throw new ResearchRepositoryError("CONFLICT"); return this.requiredRun(command.ownerId, command.id);
  }
  private readyStatements(command: SaveResearchValidationCommand, packageValue: ResearchPackage): D1PreparedStatement[] {
    const now = this.now();
    const gated = (sql: string, values: unknown[]) => {
      const guard = guardArgs(command, values.length);
      return this.db.prepare(`${sql} WHERE EXISTS (${guard.sql})`).bind(...values, ...guard.values);
    };
    return [
      ...normalizedPackageInserts(packageValue, command, now, gated),
      this.readyUpdate(command, packageValue),
    ];
  }
  private readyUpdate(command: SaveResearchValidationCommand, packageValue: ResearchPackage) {
    return this.db.prepare(`UPDATE research_runs SET state='ready',state_version=state_version+1,retryable=0,active_slot=NULL,active_expires_at=NULL,package_id=?1,quality_json=?2,candidate_json=NULL,error_code=NULL,public_failure_category=NULL,updated_at=?3
      WHERE id=?4 AND user_id=?5 AND state_version=?6 AND state='validating' AND execution_mode='synchronous'`).bind(packageValue.id, serialize(packageValue.qualityReport, QUALITY_MAX), this.now(), command.id, command.ownerId, command.expectedVersion);
  }
}

/** Replay-only owner-bound capability. It deliberately permits an expired package,
 * but only when every immutable planning reference field still matches D1. */
export class D1PlanningReplayPackageReader implements PlanningReplayPackageReader {
  constructor(private readonly db: D1Database) {}

  async resolveLockedPackage(ownerId: string, input: ResearchPlanningSourceReference): Promise<ResearchPackage> {
    let reference: ResearchPlanningSourceReference;
    try {
      const parsed = planningSourceReferenceSchema.parse(readBoundedResearchJson(input));
      if (parsed.source !== "research") throw new Error();
      reference = parsed;
    } catch { throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); }
    const runRow = await storage(() => this.db.prepare(
      "SELECT * FROM research_runs WHERE user_id=?1 AND id=?2 LIMIT 1",
    ).bind(ownerId, reference.researchRunId).first<Row>());
    if (!runRow) throw new ResearchRepositoryError("NOT_FOUND");
    const run = parseRun(runRow);
    if (run.ownerId !== ownerId || run.state !== "ready" || run.packageId !== reference.packageId
      || run.configFingerprint !== reference.configFingerprint) {
      throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
    }
    const packageRow = await storage(() => this.db.prepare(
      "SELECT * FROM research_packages WHERE id=?1 LIMIT 1",
    ).bind(reference.packageId).first<Row>());
    if (!packageRow) throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
    assertCacheIdentity(run, packageRow, "RESEARCH_UNAVAILABLE");
    const packageValue = parseStoredPackage(packageRow, { kind: "ignore-for-audit" });
    if (canonicalJson(run.quality) !== canonicalJson(packageValue.qualityReport)
      || packageValue.id !== reference.packageId
      || packageValue.blueprint.id !== reference.blueprintId
      || packageValue.blueprint.version !== reference.blueprintVersion
      || packageValue.registry.id !== reference.registryId
      || packageValue.registry.version !== reference.registryVersion
      || packageValue.contentFingerprint !== reference.contentFingerprint) {
      throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
    }
    return packageValue;
  }
}

function guardArgs(command: SaveResearchValidationCommand, offset: number) { return { sql: `SELECT 1 FROM research_runs WHERE id=?${offset + 1} AND user_id=?${offset + 2} AND state_version=?${offset + 3} AND state='validating' AND execution_mode='synchronous'`, values: [command.id, command.ownerId, command.expectedVersion] }; }
function assertCacheIdentity(run: ResearchRunRecord, row: Row, code: "CONFLICT" | "RESEARCH_UNAVAILABLE") {
  if (run.normalizedRoleKey !== row.normalized_role_key || run.locale !== row.locale || run.configFingerprint !== row.config_fingerprint) throw new ResearchRepositoryError(code);
}
export function parseRun(row: Row): ResearchRunRecord {
  const identity = parseContract(createSchema.omit({ activeExpiresAt: true }), {
    ownerId: row.user_id, requestId: row.request_id, mutationId: row.mutation_id, rawRole: row.raw_role,
    normalizedRoleKey: row.normalized_role_key, locale: row.locale, inputFingerprint: row.input_fingerprint, configFingerprint: row.config_fingerprint,
  });
  const executionMode = parseContract(z.enum(["synchronous", "cloudflare-workflow-v1"]), row.execution_mode);
  const remoteQuotaKey = parseContract(z.string().min(8).max(128).nullable(), row.remote_quota_key);
  if ((executionMode === "synchronous") !== (remoteQuotaKey === null)) {
    throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
  }
  const run: ResearchRunRecord = {
    ...identity, id: parseContract(idSchema, row.id), executionMode, remoteQuotaKey,
    state: parseContract(researchStateSchema, row.state),
    stateVersion: parseContract(integerSchema, row.state_version), retryable: parseContract(z.union([z.literal(0), z.literal(1)]), row.retryable) === 1,
    activeExpiresAt: parseContract(integerSchema.nullable(), row.active_expires_at), packageId: parseContract(idSchema.nullable(), row.package_id),
    errorCode: parseContract(errorCodeSchema.nullable(), row.error_code), failureCategory: parseContract(researchPublicFailureCategorySchema.nullable(), row.public_failure_category),
    quality: row.quality_json === null ? null : validateQuality(parseJson(string(row.quality_json), QUALITY_MAX)),
    candidate: row.candidate_json === null ? null : validateCandidate(parseJson(string(row.candidate_json), CANDIDATE_MAX)),
    retryOfRunId: parseContract(idSchema.nullable(), row.retry_of_run_id), createdAt: parseContract(integerSchema, row.created_at), updatedAt: parseContract(integerSchema, row.updated_at),
  };
  const active = ["queued", "researching", "validating"].includes(run.state);
  if ((active && (run.activeExpiresAt === null || row.active_slot !== 1 || run.retryable)) || (!active && (run.activeExpiresAt !== null || row.active_slot !== null))
    || (run.state === "ready" && (!run.packageId || !run.quality?.passed || run.retryable || run.candidate !== null))
    || (run.state === "needs-review" && (!run.quality || run.quality.passed))
    || (run.state === "failed" && (!run.failureCategory || !run.errorCode)) || run.updatedAt < run.createdAt) throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
  return run;
}
function string(value: unknown) { if (typeof value !== "string") throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); return value; }
function calendarDate(value: number) { return new Date(value).toISOString().slice(0, 10); }
function parseRemoteProviderRequest(role: string, locale: "zh-CN" | "en-US") {
  try { return parseProviderRequest({ role, locale }); }
  catch { throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); }
}
function assertSameInput(run: ResearchRunRecord, command: CreateResearchRunCommand, retryOfRunId: string | null) { if (run.retryOfRunId !== retryOfRunId || run.inputFingerprint !== command.inputFingerprint || run.normalizedRoleKey !== command.normalizedRoleKey || run.locale !== command.locale || run.configFingerprint !== command.configFingerprint) throw new ResearchRepositoryError("CONFLICT"); return run; }
function assertTransition(command: TransitionResearchRunCommand) {
  const normal = (command.from === "queued" && command.to === "researching")
    || (command.from === "researching" && command.to === "validating");
  const failure = ["queued", "researching", "validating"].includes(command.from)
    && command.to === "failed";
  if (!normal && !failure) throw new ResearchRepositoryError("CONFLICT");
  if (failure && (!command.errorCode || !command.failureCategory)) {
    throw new ResearchRepositoryError("CONFLICT");
  }
  if (normal && (command.retryable || command.errorCode || command.failureCategory)) {
    throw new ResearchRepositoryError("CONFLICT");
  }
}

function aliasJson(command: CreateResearchRunCommand, runId: string, retryOfRunId: string | null) {
  return serialize({ runId, retryOfRunId, inputFingerprint: command.inputFingerprint, normalizedRoleKey: command.normalizedRoleKey, locale: command.locale, configFingerprint: command.configFingerprint }, 4096);
}

/** Snapshot command envelopes without invoking accessors. Large untrusted payloads
 * are validated separately, allowing a rejected unsafe candidate to become Failed. */
function parseContract<T>(schema: z.ZodType<T>, value: unknown, opaqueKeys: readonly string[] = []): T {
  try {
    if (!opaqueKeys.length) return schema.parse(readBoundedResearchJson(value));
    if (value === null || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length) throw new Error();
    const plain: Record<string, unknown> = {};
    const opaque: Record<string, unknown> = {};
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (!descriptor.enumerable || !("value" in descriptor)) throw new Error();
      Object.defineProperty(opaqueKeys.includes(key) ? opaque : plain, key, { value: descriptor.value, enumerable: true });
    }
    return schema.parse({ ...readBoundedResearchJson(plain) as Row, ...opaque });
  } catch { throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); }
}

async function storage<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) { if (error instanceof ResearchRepositoryError) throw error; throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); }
}
