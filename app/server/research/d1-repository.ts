import { researchCandidateSchema, researchPackageSchema, researchQualityReportSchema, researchRunPublicViewSchema, type ResearchPackage, type ResearchRunPublicView, type ResearchState } from "../../contracts/research";
import { canonicalJson, fingerprint } from "../../lib/planning/fingerprint";
import { readBoundedResearchJson } from "./source-audit";
import type { AttachCachedPackageCommand, CreateResearchRetryCommand, CreateResearchRunCommand, ResearchCacheLookup, ResearchRepository, ResearchRunRecord, SaveResearchValidationCommand, TransitionResearchRunCommand } from "./repository";
import { ResearchRepositoryError } from "./repository";

const PACKAGE_MAX = 1_900_000;
const QUALITY_MAX = 16_384;
const CANDIDATE_MAX = 1_048_576;
const IDEMPOTENCY_SCOPE = "role-research";
type Row = Record<string, unknown>;
type Options = { now?: () => number; createId?: () => string };

export class D1ResearchRepository implements ResearchRepository {
  private readonly now: () => number;
  private readonly createId: () => string;
  constructor(private readonly db: D1Database, options: Options = {}) {
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? (() => crypto.randomUUID());
  }

  async createOrReplay(command: CreateResearchRunCommand) {
    assertCreate(command);
    const direct = await this.getRunByMutation(command.ownerId, command.mutationId);
    if (direct) return { run: assertSameInput(direct, command), replayed: true };
    const alias = await this.findAlias(command);
    if (alias) return { run: alias, replayed: true };
    const active = await this.findActive(command);
    if (active) return this.persistAlias(command, active);
    const id = this.createId(); const now = this.now();
    const stored = serialize({ runId: id, inputFingerprint: command.inputFingerprint, normalizedRoleKey: command.normalizedRoleKey, locale: command.locale, configFingerprint: command.configFingerprint }, 4096);
    try {
      await this.db.batch([
        this.db.prepare(`INSERT INTO research_runs (id,user_id,request_id,mutation_id,raw_role,normalized_role_key,locale,input_fingerprint,config_fingerprint,state,state_version,retryable,active_slot,active_expires_at,created_at,updated_at)
          VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'queued',0,0,1,?10,?11,?11)`).bind(id, command.ownerId, command.requestId, command.mutationId, command.rawRole, command.normalizedRoleKey, command.locale, command.inputFingerprint, command.configFingerprint, command.activeExpiresAt, now),
        this.db.prepare("INSERT INTO idempotency_records (id,user_id,scope,mutation_id,response_json,created_at) VALUES (?1,?2,?3,?4,?5,?6)").bind(this.createId(), command.ownerId, IDEMPOTENCY_SCOPE, command.mutationId, stored, now),
      ]);
    } catch {
      const won = await this.getRunByMutation(command.ownerId, command.mutationId);
      if (won) return { run: assertSameInput(won, command), replayed: true };
      const joined = await this.findActive(command);
      if (joined) return this.persistAlias(command, joined);
      throw new ResearchRepositoryError("CONFLICT");
    }
    const run = await this.getRun(command.ownerId, id);
    if (!run) throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
    return { run, replayed: false };
  }

  async getRun(ownerId: string, runId: string): Promise<ResearchRunRecord | null> {
    const row = await this.db.prepare("SELECT * FROM research_runs WHERE user_id=?1 AND id=?2 LIMIT 1").bind(ownerId, runId).first<Row>();
    return row ? parseRun(row) : null;
  }

  async findFreshPackage(input: ResearchCacheLookup): Promise<ResearchPackage | null> {
    const now = input.now ?? this.now();
    const row = await this.db.prepare(`SELECT package_json,quality_json,content_fingerprint,blueprint_id,blueprint_version,registry_id,registry_version,observed_at,expires_at FROM research_packages
      WHERE normalized_role_key=?1 AND locale=?2 AND config_fingerprint=?3 AND expires_at>?4 ORDER BY created_at DESC LIMIT 1`)
      .bind(input.normalizedRoleKey, input.locale, input.configFingerprint, now).first<Row>();
    if (!row) return null;
    return parsePackage(row, now);
  }

  async attachCachedPackage(command: AttachCachedPackageCommand): Promise<ResearchRunRecord> {
    const stored = await this.db.prepare("SELECT package_json,quality_json,content_fingerprint,blueprint_id,blueprint_version,registry_id,registry_version,observed_at,expires_at FROM research_packages WHERE id=?1 LIMIT 1").bind(command.package.id).first<Row>();
    if (!stored) throw new ResearchRepositoryError("CONFLICT");
    const pack = parsePackage(stored, this.now());
    if (canonicalJson(pack) !== canonicalJson(validatePackage(command.package, this.now()))) throw new ResearchRepositoryError("CONFLICT");
    const result = await this.db.prepare(`UPDATE research_runs SET state='ready',state_version=state_version+1,active_slot=NULL,active_expires_at=NULL,package_id=?1,quality_json=?2,updated_at=?3
      WHERE id=?4 AND user_id=?5 AND state_version=?6 AND state='queued'`).bind(pack.id, serialize(pack.qualityReport, QUALITY_MAX), this.now(), command.id, command.ownerId, command.expectedVersion).run();
    if ((result.meta?.changes ?? 0) !== 1) throw new ResearchRepositoryError("CONFLICT");
    return this.requiredRun(command.ownerId, command.id);
  }

  async transition(command: TransitionResearchRunCommand): Promise<ResearchRunRecord> {
    assertTransition(command);
    const terminal = command.to === "ready" || command.to === "needs-review" || command.to === "failed";
    const result = await this.db.prepare(`UPDATE research_runs SET state=?1,state_version=state_version+1,retryable=?2,error_code=?3,public_failure_category=?4,
      active_slot=CASE WHEN ?5 THEN NULL ELSE 1 END,active_expires_at=CASE WHEN ?5 THEN NULL ELSE active_expires_at END,updated_at=?6
      WHERE id=?7 AND user_id=?8 AND state_version=?9 AND state=?10`)
      .bind(command.to, command.retryable ? 1 : 0, command.errorCode ?? null, command.failureCategory ?? null, terminal ? 1 : 0, this.now(), command.id, command.ownerId, command.expectedVersion, command.from).run();
    if ((result.meta?.changes ?? 0) !== 1) throw new ResearchRepositoryError("CONFLICT");
    return this.requiredRun(command.ownerId, command.id);
  }

  async saveValidation(command: SaveResearchValidationCommand): Promise<ResearchRunRecord> {
    if (!command.result.ready) return this.saveNeedsReview({ ...command, result: command.result });
    const packageValue = validatePackage(command.result.package, this.now());
    const existing = await this.db.prepare("SELECT package_json,quality_json,content_fingerprint,blueprint_id,blueprint_version,registry_id,registry_version,observed_at,expires_at FROM research_packages WHERE content_fingerprint=?1 AND config_fingerprint=?2 LIMIT 1")
      .bind(packageValue.contentFingerprint, command.configFingerprint).first<Row>();
    if (existing) {
      const exact = parsePackage(existing, this.now());
      if (canonicalJson(exact) !== canonicalJson(packageValue)) throw new ResearchRepositoryError("CONFLICT");
      return this.attachReady(command, exact, []);
    }
    const statements = this.readyStatements(command, packageValue);
    let results: D1Result<unknown>[];
    try { results = await this.db.batch(statements); }
    catch { throw new ResearchRepositoryError("CONFLICT"); }
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
    const existing = await this.getRunByMutation(command.ownerId, command.mutationId);
    if (existing) return { run: existing, replayed: true };
    const source = await this.getRun(command.ownerId, command.runId);
    if (!source || !["needs-review", "failed"].includes(source.state) || !source.retryable) throw new ResearchRepositoryError("CONFLICT");
    const result = await this.createOrReplay({ ownerId: command.ownerId, requestId: command.requestId, mutationId: command.mutationId, rawRole: source.rawRole, normalizedRoleKey: source.normalizedRoleKey, locale: source.locale, inputFingerprint: source.inputFingerprint, configFingerprint: source.configFingerprint, activeExpiresAt: command.activeExpiresAt });
    if (!result.replayed) {
      const updated = await this.db.prepare("UPDATE research_runs SET retry_of_run_id=?1 WHERE id=?2 AND user_id=?3 AND state='queued'").bind(source.id, result.run.id, command.ownerId).run();
      if ((updated.meta?.changes ?? 0) !== 1) throw new ResearchRepositoryError("CONFLICT");
      result.run = await this.requiredRun(command.ownerId, result.run.id);
    }
    return result;
  }

  async resolveReadyPackage(ownerId: string, runId: string): Promise<ResearchPackage> {
    const row = await this.db.prepare(`SELECT p.package_json,p.quality_json,p.content_fingerprint,p.blueprint_id,p.blueprint_version,p.registry_id,p.registry_version,p.observed_at,p.expires_at FROM research_runs r JOIN research_packages p ON p.id=r.package_id
      WHERE r.user_id=?1 AND r.id=?2 AND r.state='ready' LIMIT 1`).bind(ownerId, runId).first<Row>();
    if (!row) {
      const run = await this.getRun(ownerId, runId);
      if (!run) throw new ResearchRepositoryError("NOT_FOUND");
      throw new ResearchRepositoryError("NOT_READY");
    }
    return parsePackage(row, this.now());
  }

  private async getRunByMutation(ownerId: string, mutationId: string) {
    const row = await this.db.prepare("SELECT * FROM research_runs WHERE user_id=?1 AND mutation_id=?2 LIMIT 1").bind(ownerId, mutationId).first<Row>();
    return row ? parseRun(row) : null;
  }
  private async findAlias(command: CreateResearchRunCommand) {
    const row = await this.db.prepare("SELECT response_json FROM idempotency_records WHERE user_id=?1 AND scope=?2 AND mutation_id=?3 LIMIT 1").bind(command.ownerId, IDEMPOTENCY_SCOPE, command.mutationId).first<Row>();
    if (!row || typeof row.response_json !== "string") return null;
    const value = parseJson(row.response_json, 4096) as { runId?: unknown; inputFingerprint?: unknown; normalizedRoleKey?: unknown; locale?: unknown; configFingerprint?: unknown };
    if (value.inputFingerprint !== command.inputFingerprint || value.normalizedRoleKey !== command.normalizedRoleKey || value.locale !== command.locale || value.configFingerprint !== command.configFingerprint) throw new ResearchRepositoryError("CONFLICT");
    return typeof value.runId === "string" ? this.requiredRun(command.ownerId, value.runId) : null;
  }
  private async findActive(command: Pick<CreateResearchRunCommand, "ownerId" | "normalizedRoleKey" | "locale" | "configFingerprint">) {
    const row = await this.db.prepare("SELECT * FROM research_runs WHERE user_id=?1 AND normalized_role_key=?2 AND locale=?3 AND config_fingerprint=?4 AND active_slot=1 LIMIT 1").bind(command.ownerId, command.normalizedRoleKey, command.locale, command.configFingerprint).first<Row>();
    return row ? parseRun(row) : null;
  }
  private async persistAlias(command: CreateResearchRunCommand, run: ResearchRunRecord) {
    const stored = serialize({ runId: run.id, inputFingerprint: command.inputFingerprint, normalizedRoleKey: command.normalizedRoleKey, locale: command.locale, configFingerprint: command.configFingerprint }, 4096);
    try { await this.db.prepare("INSERT INTO idempotency_records (id,user_id,scope,mutation_id,response_json,created_at) VALUES (?1,?2,?3,?4,?5,?6)").bind(this.createId(), command.ownerId, IDEMPOTENCY_SCOPE, command.mutationId, stored, this.now()).run(); }
    catch { const replay = await this.findAlias(command); if (replay) return { run: replay, replayed: true }; throw new ResearchRepositoryError("CONFLICT"); }
    return { run, replayed: true };
  }
  private async requiredRun(ownerId: string, id: string) { const run = await this.getRun(ownerId, id); if (!run) throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); return run; }
  private async saveNeedsReview(command: SaveResearchValidationCommand & { result: Extract<SaveResearchValidationCommand["result"], { ready: false }> }) {
    const quality = validateQuality(command.result.quality); if (quality.passed || quality.issueCodes.length === 0) throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
    const candidate = command.result.sanitizedCandidate ? serializeCandidate(command.result.sanitizedCandidate) : null;
    const result = await this.db.prepare(`UPDATE research_runs SET state='needs-review',state_version=state_version+1,retryable=1,active_slot=NULL,active_expires_at=NULL,quality_json=?1,candidate_json=?2,updated_at=?3
      WHERE id=?4 AND user_id=?5 AND state_version=?6 AND state='validating'`).bind(serialize(quality, QUALITY_MAX), candidate, this.now(), command.id, command.ownerId, command.expectedVersion).run();
    if ((result.meta?.changes ?? 0) !== 1) throw new ResearchRepositoryError("CONFLICT"); return this.requiredRun(command.ownerId, command.id);
  }
  private async attachReady(command: SaveResearchValidationCommand, packageValue: ResearchPackage, extra: D1PreparedStatement[]) {
    const result = await this.db.batch([...extra, this.readyUpdate(command, packageValue)]);
    if ((result.at(-1)?.meta?.changes ?? 0) !== 1) throw new ResearchRepositoryError("CONFLICT"); return this.requiredRun(command.ownerId, command.id);
  }
  private readyStatements(command: SaveResearchValidationCommand, packageValue: ResearchPackage): D1PreparedStatement[] {
    const now = this.now(); const ids = normalizedIds(packageValue.id);
    const gated = (sql: string, values: unknown[]) => {
      const guard = guardArgs(command, values.length);
      return this.db.prepare(`${sql} WHERE EXISTS (${guard.sql})`).bind(...values, ...guard.values);
    };
    const skills = packageValue.blueprint.skills.map((skill) => ({ id: `${packageValue.id}:${skill.id}`, skillKey: skill.id, name: skill.name, category: skill.category, importance: skill.importance, payload: skill }));
    const edges = packageValue.blueprint.skills.flatMap((skill) => skill.prerequisiteIds.map((from) => ({ id: `${packageValue.id}:${from}:${skill.id}`, from, to: skill.id, relation: "prerequisite" })));
    const resources = packageValue.blueprint.resources.map((resource) => ({ ...resource, id: `${packageValue.id}:${resource.id}` }));
    const links = packageValue.blueprint.resources.flatMap((resource) => resource.skillIds.map((skillKey) => ({ id: `${packageValue.id}:${resource.id}:${skillKey}:${resource.purpose}`, skillKey, canonicalUrl: resource.url, purpose: resource.purpose })));
    const audits = packageValue.sourceEvidence.map((audit) => ({ id: `${packageValue.id}:${audit.canonicalUrl}`, ...audit }));
    return [
      gated("INSERT INTO role_blueprints (id,slug,name,status,current_version,created_at,updated_at) SELECT ?1,?2,?3,'ready',?4,?5,?5", [ids.roleId, ids.roleSlug, packageValue.blueprint.name, packageValue.blueprint.version, now]),
      gated("INSERT INTO role_blueprint_versions (id,role_id,version,status,blueprint_json,source_coverage_json,published_at,created_at) SELECT ?1,?2,?3,'ready',?4,?5,?6,?6", [ids.versionId, ids.roleId, packageValue.blueprint.version, serialize(packageValue.blueprint, PACKAGE_MAX), "{}", now]),
      gated("INSERT INTO role_skill_definitions (id,blueprint_version_id,skill_key,name,category,importance,payload_json,created_at) SELECT value->>'id',?1,value->>'skillKey',value->>'name',value->>'category',value->>'importance',value->>'payload',?2 FROM json_each(?3)", [ids.versionId, now, serialize(skills, PACKAGE_MAX)]),
      gated("INSERT INTO role_skill_edges (id,blueprint_version_id,from_skill_key,to_skill_key,relation,created_at) SELECT value->>'id',?1,value->>'from',value->>'to',value->>'relation',?2 FROM json_each(?3)", [ids.versionId, now, serialize(edges, PACKAGE_MAX)]),
      gated("INSERT OR IGNORE INTO learning_resources (id,canonical_url,title,provider,language,cost,format,source_tier,last_verified_at,created_at,updated_at) SELECT value->>'id',value->>'url',value->>'title',value->>'provider',value->>'language',value->>'cost',value->>'format',value->>'sourceTier',value->>'lastVerifiedAt',?1,?1 FROM json_each(?2)", [now, serialize(resources, PACKAGE_MAX)]),
      gated("INSERT INTO resource_skill_links (id,blueprint_version_id,skill_key,resource_id,purpose,created_at) SELECT value->>'id',?1,value->>'skillKey',(SELECT id FROM learning_resources WHERE canonical_url=value->>'canonicalUrl'),value->>'purpose',?2 FROM json_each(?3)", [ids.versionId, now, serialize(links, PACKAGE_MAX)]),
      gated("INSERT INTO research_packages (id,normalized_role_key,locale,config_fingerprint,content_fingerprint,package_json,quality_json,blueprint_id,blueprint_version,blueprint_version_id,registry_id,registry_version,observed_at,expires_at,created_at) SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15", [packageValue.id, command.normalizedRoleKey, command.locale, command.configFingerprint, packageValue.contentFingerprint, serialize(packageValue, PACKAGE_MAX), serialize(packageValue.qualityReport, QUALITY_MAX), packageValue.blueprint.id, packageValue.blueprint.version, ids.versionId, packageValue.registry.id, packageValue.registry.version, packageValue.observedAt, expiryMs(packageValue.expiresAt), now]),
      gated("INSERT INTO research_source_audits (id,package_id,canonical_url,title,hostname,source_tier,observed_at,citation_hash) SELECT value->>'id',?1,value->>'canonicalUrl',value->>'title',value->>'hostname',value->>'sourceTier',value->>'observedAt',value->>'citationHash' FROM json_each(?2)", [packageValue.id, serialize(audits, PACKAGE_MAX)]),
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
function validatePackage(value: unknown, now: number) { try { const packageValue = researchPackageSchema.parse(readBoundedResearchJson(value)); if (!packageValue.qualityReport.passed || expiryMs(packageValue.expiresAt) <= now) throw new Error(); const { contentFingerprint, ...rest } = packageValue; if (fingerprint(canonicalJson(rest)) !== contentFingerprint) throw new Error(); return packageValue; } catch { throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); } }
function parsePackage(row: Row, now: number) { if (typeof row.package_json !== "string" || typeof row.quality_json !== "string" || typeof row.content_fingerprint !== "string") throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); const packageValue = validatePackage(parseJson(row.package_json, PACKAGE_MAX), now); const quality = validateQuality(parseJson(row.quality_json, QUALITY_MAX)); if (!quality.passed || canonicalJson(quality) !== canonicalJson(packageValue.qualityReport) || packageValue.contentFingerprint !== row.content_fingerprint || row.blueprint_id !== packageValue.blueprint.id || row.blueprint_version !== packageValue.blueprint.version || row.registry_id !== packageValue.registry.id || row.registry_version !== packageValue.registry.version || row.observed_at !== packageValue.observedAt || row.expires_at !== expiryMs(packageValue.expiresAt)) throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); return packageValue; }
function serializeCandidate(value: unknown) { try { return serialize(researchCandidateSchema.parse(readBoundedResearchJson(value)), CANDIDATE_MAX); } catch { throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); } }
function parseRun(row: Row): ResearchRunRecord { try { const state = row.state as ResearchState; if (!['queued','researching','validating','ready','needs-review','failed'].includes(state) || typeof row.id !== "string" || typeof row.user_id !== "string" || typeof row.request_id !== "string" || typeof row.mutation_id !== "string" || typeof row.raw_role !== "string" || typeof row.normalized_role_key !== "string" || (row.locale !== "en-US" && row.locale !== "zh-CN") || typeof row.input_fingerprint !== "string" || typeof row.config_fingerprint !== "string" || !Number.isSafeInteger(row.state_version) || !Number.isSafeInteger(row.created_at) || !Number.isSafeInteger(row.updated_at)) throw new Error(); return { id: row.id, ownerId: row.user_id, requestId: row.request_id, mutationId: row.mutation_id, rawRole: row.raw_role, normalizedRoleKey: row.normalized_role_key, locale: row.locale, inputFingerprint: row.input_fingerprint, configFingerprint: row.config_fingerprint, state, stateVersion: row.state_version as number, retryable: row.retryable === 1, activeExpiresAt: row.active_expires_at === null ? null : number(row.active_expires_at), packageId: nullableString(row.package_id), errorCode: nullableString(row.error_code), failureCategory: nullableFailure(row.public_failure_category), quality: row.quality_json === null ? null : validateQuality(parseJson(string(row.quality_json), QUALITY_MAX)), candidate: row.candidate_json === null ? null : researchCandidateSchema.parse(parseJson(string(row.candidate_json), CANDIDATE_MAX)), retryOfRunId: nullableString(row.retry_of_run_id), createdAt: row.created_at as number, updatedAt: row.updated_at as number }; } catch (error) { if (error instanceof ResearchRepositoryError) throw error; throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); } }
function number(value: unknown) { if (!Number.isSafeInteger(value)) throw new Error(); return value as number; }
function string(value: unknown) { if (typeof value !== "string") throw new Error(); return value; }
function nullableString(value: unknown) { return value === null ? null : string(value); }
function nullableFailure(value: unknown) { if (value === null) return null; if (!['timeout','rate-limited','allowance-reached','service-unavailable','content-rejected','invalid-result','internal'].includes(value as string)) throw new Error(); return value as ResearchRunRecord["failureCategory"]; }
function assertCreate(command: CreateResearchRunCommand) { if (!command.ownerId || !command.requestId || !command.mutationId || !command.rawRole || !command.normalizedRoleKey || !command.inputFingerprint || !command.configFingerprint || !Number.isSafeInteger(command.activeExpiresAt) || !['en-US','zh-CN'].includes(command.locale)) throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); }
function assertSameInput(run: ResearchRunRecord, command: CreateResearchRunCommand) { if (run.inputFingerprint !== command.inputFingerprint || run.normalizedRoleKey !== command.normalizedRoleKey || run.locale !== command.locale || run.configFingerprint !== command.configFingerprint) throw new ResearchRepositoryError("CONFLICT"); return run; }
function assertTransition(command: TransitionResearchRunCommand) { const normal = (command.from === "queued" && command.to === "researching") || (command.from === "researching" && command.to === "validating"); const failure = ['queued','researching','validating'].includes(command.from) && command.to === "failed"; if (!normal && !failure) throw new ResearchRepositoryError("CONFLICT"); if (failure && (!command.errorCode || !command.failureCategory)) throw new ResearchRepositoryError("CONFLICT"); }
