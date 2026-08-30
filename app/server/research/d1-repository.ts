import { z } from "zod";
import { researchCandidateSchema, researchPackageSchema, researchQualityReportSchema, researchRunPublicViewSchema, researchRequestSchema, researchStateSchema, researchPublicFailureCategorySchema, type ResearchPackage, type ResearchRunPublicView } from "../../contracts/research";
import { canonicalJson, fingerprint } from "../../lib/planning/fingerprint";
import { validateRoleBlueprint } from "../../lib/intelligence-validation";
import { validateUnitRegistry } from "../../lib/planning/registry-validation";
import { canonicalizePublicCitationUrl, readBoundedResearchJson } from "./source-audit";
import type { AttachCachedPackageCommand, CreateResearchRetryCommand, CreateResearchRunCommand, ResearchCacheLookup, ResearchRepository, ResearchRunRecord, SaveResearchValidationCommand, TransitionResearchRunCommand } from "./repository";
import { ResearchRepositoryError } from "./repository";

const PACKAGE_MAX = 1_900_000;
const QUALITY_MAX = 16_384;
const CANDIDATE_MAX = 1_048_576;
const IDEMPOTENCY_SCOPE = "role-research";
type Row = Record<string, unknown>;
type Options = { now?: () => number; createId?: () => string };
const boundedText = z.string().min(1).max(256).refine((value) => value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value));
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
const saveSchema = z.object({ ...casShape, ...cacheShape, result: z.unknown() }).strict();
const retrySchema = z.object({ ownerId: boundedText, requestId: boundedText, mutationId: researchRequestSchema.shape.mutationId, runId: idSchema, activeExpiresAt: integerSchema }).strict();
const aliasSchema = z.object({ runId: idSchema, ...cacheShape, inputFingerprint: boundedText, retryOfRunId: idSchema.nullable() }).strict();

export class D1ResearchRepository implements ResearchRepository {
  private readonly now: () => number;
  private readonly createId: () => string;
  constructor(private readonly db: D1Database, options: Options = {}) {
    this.now = () => parseContract(integerSchema, (options.now ?? Date.now)());
    this.createId = () => parseContract(idSchema, (options.createId ?? (() => crypto.randomUUID()))());
  }

  async createOrReplay(command: CreateResearchRunCommand) {
    return this.create(parseContract(createSchema, command), null);
  }

  private async create(command: CreateResearchRunCommand, retryOfRunId: string | null) {
    const alias = await this.findAlias(command, retryOfRunId);
    if (alias) return { run: alias, replayed: true };
    const direct = await this.getRunByMutation(command.ownerId, command.mutationId);
    if (direct) return { run: assertSameInput(direct, command, retryOfRunId), replayed: true };
    const active = await this.findActive(command);
    if (active) return this.persistAlias(command, active, retryOfRunId);
    const id = parseContract(idSchema, this.createId()); const now = parseContract(integerSchema, this.now());
    const stored = aliasJson(command, id, retryOfRunId);
    try {
      await this.db.batch([
        this.db.prepare(`INSERT INTO research_runs (id,user_id,request_id,mutation_id,raw_role,normalized_role_key,locale,input_fingerprint,config_fingerprint,state,state_version,retryable,active_slot,active_expires_at,created_at,updated_at,retry_of_run_id)
          VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'queued',0,0,1,?10,?11,?11,?12)`).bind(id, command.ownerId, command.requestId, command.mutationId, command.rawRole, command.normalizedRoleKey, command.locale, command.inputFingerprint, command.configFingerprint, command.activeExpiresAt, now, retryOfRunId),
        this.db.prepare("INSERT INTO idempotency_records (id,user_id,scope,mutation_id,response_json,created_at) VALUES (?1,?2,?3,?4,?5,?6)").bind(this.createId(), command.ownerId, IDEMPOTENCY_SCOPE, command.mutationId, stored, now),
      ]);
    } catch {
      const replay = await this.findAlias(command, retryOfRunId);
      if (replay) return { run: replay, replayed: true };
      const won = await this.getRunByMutation(command.ownerId, command.mutationId);
      if (won) return { run: assertSameInput(won, command, retryOfRunId), replayed: true };
      const joined = await this.findActive(command);
      if (joined) return this.persistAlias(command, joined, retryOfRunId);
      throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
    }
    const run = await this.getRun(command.ownerId, id);
    if (!run) throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
    return { run, replayed: false };
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
    return parsePackage(row, now);
  }

  async attachCachedPackage(command: AttachCachedPackageCommand): Promise<ResearchRunRecord> {
    const bounded = parseContract(attachSchema, command, ["package"]);
    command = { ...bounded, package: validatePackage(bounded.package, this.now()) };
    const run = await this.getRun(command.ownerId, command.id);
    if (!run) throw new ResearchRepositoryError("NOT_FOUND");
    const stored = await storage(() => this.db.prepare("SELECT * FROM research_packages WHERE id=?1 LIMIT 1").bind(command.package.id).first<Row>());
    if (!stored) throw new ResearchRepositoryError("CONFLICT");
    assertCacheIdentity(run, stored, "CONFLICT");
    const pack = parsePackage(stored, this.now());
    if (canonicalJson(pack) !== canonicalJson(validatePackage(command.package, this.now()))) throw new ResearchRepositoryError("CONFLICT");
    const result = await storage(() => this.db.prepare(`UPDATE research_runs SET state='ready',state_version=state_version+1,active_slot=NULL,active_expires_at=NULL,package_id=?1,quality_json=?2,updated_at=?3
      WHERE id=?4 AND user_id=?5 AND state_version=?6 AND state='queued'`).bind(pack.id, serialize(pack.qualityReport, QUALITY_MAX), this.now(), command.id, command.ownerId, command.expectedVersion).run());
    if ((result.meta?.changes ?? 0) !== 1) throw new ResearchRepositoryError("CONFLICT");
    return this.requiredRun(command.ownerId, command.id);
  }

  async transition(command: TransitionResearchRunCommand): Promise<ResearchRunRecord> {
    command = parseContract(transitionSchema, command);
    assertTransition(command);
    const terminal = command.to === "ready" || command.to === "needs-review" || command.to === "failed";
    const result = await storage(() => this.db.prepare(`UPDATE research_runs SET state=?1,state_version=state_version+1,retryable=?2,error_code=?3,public_failure_category=?4,
      active_slot=CASE WHEN ?5 THEN NULL ELSE 1 END,active_expires_at=CASE WHEN ?5 THEN NULL ELSE active_expires_at END,updated_at=?6
      WHERE id=?7 AND user_id=?8 AND state_version=?9 AND state=?10`)
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
    if (run.normalizedRoleKey !== command.normalizedRoleKey || run.locale !== command.locale || run.configFingerprint !== command.configFingerprint) throw new ResearchRepositoryError("CONFLICT");
    if (!command.result.ready) return this.saveNeedsReview({ ...command, result: command.result });
    const packageValue = validatePackage(command.result.package, this.now());
    if (canonicalJson(validateQuality(command.result.quality)) !== canonicalJson(packageValue.qualityReport)) throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
    if (bytes(JSON.stringify(packageValue)) > PACKAGE_MAX) return this.transition({ id: command.id, ownerId: command.ownerId, expectedVersion: command.expectedVersion, from: "validating", to: "failed", errorCode: "result-too-large", failureCategory: "invalid-result", retryable: false });
    const existing = await storage(() => this.db.prepare("SELECT * FROM research_packages WHERE content_fingerprint=?1 AND config_fingerprint=?2 LIMIT 1")
      .bind(packageValue.contentFingerprint, command.configFingerprint).first<Row>());
    if (existing) {
      assertCacheIdentity(run, existing, "CONFLICT");
      const exact = parsePackage(existing, this.now());
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
        return researchRunPublicViewSchema.parse({ id: run.id, role: run.rawRole, locale: run.locale, state: "ready", retryable: false, packageId: packageValue.id, summary: packageValue.blueprint.summary, skillCount: packageValue.blueprint.skills.length, sourceCount: packageValue.sourceEvidence.length, observedAt: packageValue.observedAt, quality: { passed: true, issueCodes: [] } });
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
    if (!["needs-review", "failed"].includes(source.state) || !source.retryable || command.requestId === source.requestId) throw new ResearchRepositoryError("CONFLICT");
    return this.create({ ownerId: command.ownerId, requestId: command.requestId, mutationId: command.mutationId, rawRole: source.rawRole, normalizedRoleKey: source.normalizedRoleKey, locale: source.locale, inputFingerprint: source.inputFingerprint, configFingerprint: source.configFingerprint, activeExpiresAt: command.activeExpiresAt }, source.id);
  }

  async resolveReadyPackage(ownerId: string, runId: string): Promise<ResearchPackage> {
    const run = await this.getRun(ownerId, runId);
    if (!run) throw new ResearchRepositoryError("NOT_FOUND");
    if (run.state !== "ready") throw new ResearchRepositoryError("NOT_READY");
    const row = await storage(() => this.db.prepare("SELECT * FROM research_packages WHERE id=?1 LIMIT 1").bind(run.packageId).first<Row>());
    if (!row) throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
    assertCacheIdentity(run, row, "RESEARCH_UNAVAILABLE");
    const pack = parsePackage(row, this.now());
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
      WHERE id=?4 AND user_id=?5 AND state_version=?6 AND state='validating'`).bind(serialize(quality, QUALITY_MAX), candidate, this.now(), command.id, command.ownerId, command.expectedVersion, state, state === "failed" ? "invalid-result" : null, state === "failed" ? "invalid-result" : null).run());
    if ((result.meta?.changes ?? 0) !== 1) throw new ResearchRepositoryError("CONFLICT"); return this.requiredRun(command.ownerId, command.id);
  }
  private async attachReady(command: SaveResearchValidationCommand, packageValue: ResearchPackage, extra: D1PreparedStatement[]) {
    const result = await storage(() => this.db.batch([...extra, this.readyUpdate(command, packageValue)]));
    if ((result.at(-1)?.meta?.changes ?? 0) !== 1) throw new ResearchRepositoryError("CONFLICT"); return this.requiredRun(command.ownerId, command.id);
  }
  private readyStatements(command: SaveResearchValidationCommand, packageValue: ResearchPackage): D1PreparedStatement[] {
    const now = this.now(); const ids = normalizedIds(packageValue.id);
    const gated = (sql: string, values: unknown[]) => {
      const guard = guardArgs(command, values.length);
      return this.db.prepare(`${sql} WHERE EXISTS (${guard.sql})`).bind(...values, ...guard.values);
    };
    // Expand relationships inside SQLite. Repeating long URLs/IDs per link in JS
    // can exceed D1's bind limit even for a package below the canonical limit.
    const skills = serialize(packageValue.blueprint.skills, PACKAGE_MAX);
    const resources = serialize(packageValue.blueprint.resources, PACKAGE_MAX);
    const audits = serialize(packageValue.sourceEvidence, PACKAGE_MAX);
    return [
      gated("INSERT INTO role_blueprints (id,slug,name,status,current_version,created_at,updated_at) SELECT ?1,?2,?3,'ready',?4,?5,?5", [ids.roleId, ids.roleSlug, packageValue.blueprint.name, packageValue.blueprint.version, now]),
      gated("INSERT INTO role_blueprint_versions (id,role_id,version,status,blueprint_json,source_coverage_json,published_at,created_at) SELECT ?1,?2,?3,'ready',?4,?5,?6,?6", [ids.versionId, ids.roleId, packageValue.blueprint.version, serialize(packageValue.blueprint, PACKAGE_MAX), "{}", now]),
      gated("INSERT INTO role_skill_definitions (id,blueprint_version_id,skill_key,name,category,importance,payload_json,created_at) SELECT ?4||':'||(value->>'id'),?1,value->>'id',value->>'name',value->>'category',value->>'importance',value,?2 FROM json_each(?3)", [ids.versionId, now, skills, packageValue.id]),
      gated("INSERT INTO role_skill_edges (id,blueprint_version_id,from_skill_key,to_skill_key,relation,created_at) SELECT ?4||':'||edge.value||':'||(skill.value->>'id'),?1,edge.value,skill.value->>'id','prerequisite',?2 FROM json_each(?3) skill JOIN json_each(skill.value->'prerequisiteIds') edge", [ids.versionId, now, skills, packageValue.id]),
      gated("INSERT OR IGNORE INTO learning_resources (id,canonical_url,title,provider,language,cost,format,source_tier,last_verified_at,created_at,updated_at) SELECT ?3||':'||(value->>'id'),value->>'url',value->>'title',value->>'provider',value->>'language',value->>'cost',value->>'format',value->>'sourceTier',value->>'lastVerifiedAt',?1,?1 FROM json_each(?2)", [now, resources, packageValue.id]),
      gated("INSERT INTO resource_skill_links (id,blueprint_version_id,skill_key,resource_id,purpose,created_at) SELECT ?4||':'||(resource.value->>'id')||':'||skill.value||':'||(resource.value->>'purpose'),?1,skill.value,(SELECT lr.id FROM learning_resources lr WHERE lr.canonical_url=resource.value->>'url'),resource.value->>'purpose',?2 FROM json_each(?3) resource JOIN json_each(resource.value->'skillIds') skill", [ids.versionId, now, resources, packageValue.id]),
      gated("INSERT INTO research_packages (id,normalized_role_key,locale,config_fingerprint,content_fingerprint,package_json,quality_json,blueprint_id,blueprint_version,blueprint_version_id,registry_id,registry_version,observed_at,expires_at,created_at) SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15", [packageValue.id, command.normalizedRoleKey, command.locale, command.configFingerprint, packageValue.contentFingerprint, serialize(packageValue, PACKAGE_MAX), serialize(packageValue.qualityReport, QUALITY_MAX), packageValue.blueprint.id, packageValue.blueprint.version, ids.versionId, packageValue.registry.id, packageValue.registry.version, packageValue.observedAt, expiryMs(packageValue.expiresAt), now]),
      gated("INSERT INTO research_source_audits (id,package_id,canonical_url,title,hostname,source_tier,observed_at,citation_hash) SELECT ?1||':'||(value->>'canonicalUrl'),?1,value->>'canonicalUrl',value->>'title',value->>'hostname',value->>'sourceTier',value->>'observedAt',value->>'citationHash' FROM json_each(?2)", [packageValue.id, audits]),
      this.readyUpdate(command, packageValue),
    ];
  }
  private readyUpdate(command: SaveResearchValidationCommand, packageValue: ResearchPackage) {
    return this.db.prepare(`UPDATE research_runs SET state='ready',state_version=state_version+1,retryable=0,active_slot=NULL,active_expires_at=NULL,package_id=?1,quality_json=?2,candidate_json=NULL,error_code=NULL,public_failure_category=NULL,updated_at=?3
      WHERE id=?4 AND user_id=?5 AND state_version=?6 AND state='validating'`).bind(packageValue.id, serialize(packageValue.qualityReport, QUALITY_MAX), this.now(), command.id, command.ownerId, command.expectedVersion);
  }
}

function guardArgs(command: SaveResearchValidationCommand, offset: number) { return { sql: `SELECT 1 FROM research_runs WHERE id=?${offset + 1} AND user_id=?${offset + 2} AND state_version=?${offset + 3} AND state='validating'`, values: [command.id, command.ownerId, command.expectedVersion] }; }
function normalizedIds(packageId: string) { return { roleId: `research-role-${packageId}`, roleSlug: `research-${packageId}`, versionId: `research-role-version-${packageId}` }; }
function expiryMs(date: string) { const value = Date.parse(`${date}T00:00:00.000Z`); if (!Number.isSafeInteger(value)) throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); return value; }
function bytes(value: string) { return new TextEncoder().encode(value).byteLength; }
function serialize(value: unknown, limit: number) { try { const bounded = readBoundedResearchJson(value); const result = JSON.stringify(bounded); if (typeof result !== "string" || bytes(result) > limit) throw new Error(); return result; } catch { throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); } }
function parseJson(value: string, limit: number) { if (bytes(value) > limit) throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); try { return readBoundedResearchJson(JSON.parse(value) as unknown); } catch { throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); } }
function validateQuality(value: unknown) { try { return researchQualityReportSchema.parse(readBoundedResearchJson(value)); } catch { throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); } }
function validatePackage(value: unknown, now: number) {
  try {
    const snapshot = readBoundedResearchJson(value);
    const packageValue = researchPackageSchema.parse(snapshot);
    if (canonicalJson(snapshot) !== canonicalJson(packageValue)
      || !packageValue.qualityReport.passed
      || expiryMs(packageValue.expiresAt) <= now) {
      throw new Error();
    }
    const { contentFingerprint, ...rest } = packageValue;
    if (fingerprint(canonicalJson(rest)) !== contentFingerprint) throw new Error();
    assertPackageIntegrity(packageValue);
    return packageValue;
  } catch {
    throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
  }
}
function validateCandidate(value: unknown) {
  try {
    const candidate = researchCandidateSchema.parse(readBoundedResearchJson(value));
    for (const resource of candidate.resources) if (canonicalizePublicCitationUrl(resource.url) !== resource.url) throw new Error();
    return candidate;
  } catch { throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); }
}
function assertPackageIntegrity(packageValue: ResearchPackage) {
  const { blueprint, registry, sourceEvidence, qualityReport } = packageValue;
  if (blueprint.status !== "ready" || blueprint.updatedAt !== packageValue.observedAt || packageValue.expiresAt <= packageValue.observedAt || registry.blueprintId !== blueprint.id || registry.blueprintVersion !== blueprint.version || qualityReport.observedAt !== packageValue.observedAt || qualityReport.skillCount !== blueprint.skills.length || qualityReport.sourceCount !== sourceEvidence.length || qualityReport.unitCount !== registry.tracks.reduce((total, track) => total + track.templates.length, 0)) throw new Error();
  if (validateRoleBlueprint(blueprint).issues.length || validateUnitRegistry(registry, blueprint).issues.length) throw new Error();
  const evidence = new Map(sourceEvidence.map((source) => [source.canonicalUrl, source]));
  if (evidence.size !== sourceEvidence.length || evidence.size !== blueprint.resources.length) throw new Error();
  for (const resource of blueprint.resources) {
    const source = evidence.get(resource.url);
    // Citation titles come from annotations and need not equal resource titles.
    if (!source || source.sourceTier !== resource.sourceTier || source.observedAt !== packageValue.observedAt || resource.lastVerifiedAt !== packageValue.observedAt || source.hostname !== new URL(resource.url).hostname || canonicalizePublicCitationUrl(resource.url) !== resource.url || source.citationHash !== fingerprint({ canonicalUrl: resource.url })) throw new Error();
  }
  const phaseSkills = blueprint.phases.flatMap((phase) => phase.skillIds);
  if (new Set(phaseSkills).size !== phaseSkills.length) throw new Error();
  const resources = new Map(blueprint.resources.map((resource) => [resource.id, resource]));
  for (const skill of blueprint.skills) {
    if (!skill.resourceIds.length || (skill.importance === "core" && !skill.resourceIds.some((id) => ["primary", "institutional"].includes(resources.get(id)!.sourceTier)))) throw new Error();
  }
  for (const template of registry.tracks.flatMap((track) => track.templates)) {
    if (resources.get(template.primaryResourceId)!.cost !== "free" && !template.alternativeResourceIds.some((id) => resources.get(id)!.cost === "free")) throw new Error();
  }
}
function parsePackage(row: Row, now: number) {
  if (typeof row.package_json !== "string" || typeof row.quality_json !== "string" || typeof row.content_fingerprint !== "string") throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
  parseContract(z.object(cacheShape).strict(), { normalizedRoleKey: row.normalized_role_key, locale: row.locale, configFingerprint: row.config_fingerprint });
  parseContract(integerSchema, row.created_at);
  const packageValue = validatePackage(parseJson(row.package_json, PACKAGE_MAX), now);
  const quality = validateQuality(parseJson(row.quality_json, QUALITY_MAX));
  if (row.id !== packageValue.id || !quality.passed || canonicalJson(quality) !== canonicalJson(packageValue.qualityReport)
    || packageValue.contentFingerprint !== row.content_fingerprint || row.blueprint_id !== packageValue.blueprint.id
    || row.blueprint_version !== packageValue.blueprint.version || row.blueprint_version_id !== normalizedIds(packageValue.id).versionId
    || row.registry_id !== packageValue.registry.id || row.registry_version !== packageValue.registry.version
    || row.observed_at !== packageValue.observedAt || row.expires_at !== expiryMs(packageValue.expiresAt)) throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
  return packageValue;
}
function assertCacheIdentity(run: ResearchRunRecord, row: Row, code: "CONFLICT" | "RESEARCH_UNAVAILABLE") {
  if (run.normalizedRoleKey !== row.normalized_role_key || run.locale !== row.locale || run.configFingerprint !== row.config_fingerprint) throw new ResearchRepositoryError(code);
}
function parseRun(row: Row): ResearchRunRecord {
  const identity = parseContract(createSchema.omit({ activeExpiresAt: true }), {
    ownerId: row.user_id, requestId: row.request_id, mutationId: row.mutation_id, rawRole: row.raw_role,
    normalizedRoleKey: row.normalized_role_key, locale: row.locale, inputFingerprint: row.input_fingerprint, configFingerprint: row.config_fingerprint,
  });
  const run: ResearchRunRecord = {
    ...identity, id: parseContract(idSchema, row.id), state: parseContract(researchStateSchema, row.state),
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
