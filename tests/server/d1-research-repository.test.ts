import { afterEach, describe, expect, it } from "vitest";
import { researchCandidateSchema, type ResearchPackage } from "../../app/contracts/research";
import { D1ResearchRepository } from "../../app/server/research/d1-repository";
import type { ResearchRepositoryError } from "../../app/server/research/repository";
import { validateResearchCandidate } from "../../app/server/research/package-validator";
import { canonicalJson, fingerprint } from "../../app/lib/planning/fingerprint";
import { validAnnotations, validResearchCandidate } from "../fixtures/research/valid-candidate";
import { createResearchD1, seedUser } from "../helpers/sqlite-d1";

const now = Date.parse("2026-08-30T12:00:00.000Z");
const context = { packageId: "research-package-1", blueprintVersion: "2026.08.1", registryVersion: "2026.08.2", templateVersion: "2026.08.3", promptVersion: "research-prompt-v1", inputSchemaVersion: "research-input-v1", outputSchemaVersion: "research-output-v1", qualityVersion: "research-quality-v1", modelConfigVersion: "research-model-v1", observedAt: "2026-08-30", expiresAt: "2026-09-30" };
const validation = validateResearchCandidate(validResearchCandidate, validAnnotations, context);
if (!validation.ready) throw new Error("fixture must validate");
const validated: Extract<typeof validation, { ready: true }> = validation;
const databases: ReturnType<typeof createResearchD1>[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

function setup() {
  const db = createResearchD1();
  databases.push(db);
  seedUser(db, "owner-a"); seedUser(db, "owner-b");
  let sequence = 0;
  const repository = new D1ResearchRepository(db as unknown as D1Database, { now: () => now, createId: () => `research-run-${++sequence}` });
  return { db, repository };
}
function command(mutationId = "mutation-research-1") { return { ownerId: "owner-a", requestId: "request-1", mutationId, rawRole: "Data Product Manager", normalizedRoleKey: "data-product-manager", locale: "en-US" as const, inputFingerprint: "input-fingerprint-1", configFingerprint: "config-fingerprint-1", activeExpiresAt: now + 60_000 }; }
function saveCommand(run: { id: string; stateVersion: number }, result = validated) {
  return { id: run.id, ownerId: "owner-a", expectedVersion: run.stateVersion, result, configFingerprint: "config-fingerprint-1", normalizedRoleKey: "data-product-manager", locale: "en-US" as const };
}
function rehash(pack: ResearchPackage) {
  const { contentFingerprint, ...content } = pack;
  expect(contentFingerprint).toBeTruthy();
  pack.contentFingerprint = fingerprint(canonicalJson(content));
  return { ready: true as const, package: pack, quality: pack.qualityReport };
}
function fanoutCandidate() {
  const candidate = researchCandidateSchema.parse(validResearchCandidate);
  const resource = candidate.resources[0]!;
  const base = candidate.unitTemplates[0]!;
  candidate.skills = Array.from({ length: 64 }, (_, index) => ({ ...candidate.skills[0]!, id: `fanout-skill-${index}`, resourceIds: [resource.id] }));
  candidate.prerequisiteEdges = candidate.skills.flatMap((skill, index) => candidate.skills.slice(0, index).map((prerequisite) => ({ skillId: skill.id, prerequisiteSkillId: prerequisite.id })));
  candidate.resources = [{ ...resource, skillIds: candidate.skills.map((skill) => skill.id) }];
  candidate.stages = [{ ...candidate.stages[0]!, skillIds: candidate.skills.map((skill) => skill.id) }];
  candidate.unitTemplates = candidate.skills.flatMap((skill) => (["learn", "calibrate", "reinforce"] as const).map((kind) => ({ ...base, id: `${skill.id}-${kind}`, skillId: skill.id, kind, primaryResourceId: resource.id, alternativeResourceIds: [], steps: [{ id: `${skill.id}-${kind}-step`, label: "Practice the skill", minutes: 60 }], checkpoints: [], estimatedMinutes: 60 })));
  candidate.evidence = candidate.skills.map((skill) => ({ id: `${skill.id}-evidence`, skillId: skill.id, resourceId: resource.id }));
  return candidate;
}
async function failedRun(repository: D1ResearchRepository, mutationId = "mutation-failed") {
  const { run } = await repository.createOrReplay(command(mutationId));
  return repository.transition({ ownerId: "owner-a", id: run.id, expectedVersion: 0, from: "queued", to: "failed", retryable: true, errorCode: "service-failed", failureCategory: "service-unavailable" });
}
function retryCommand(runId: string, mutationId = "mutation-retry") {
  return { ownerId: "owner-a", requestId: "request-retry", mutationId, runId, activeExpiresAt: now + 60_000 };
}
async function validating(repository: D1ResearchRepository, suppliedRun?: Awaited<ReturnType<D1ResearchRepository["createOrReplay"]>>["run"]) {
  const run = suppliedRun ?? (await repository.createOrReplay(command())).run;
  const researching = await repository.transition({ id: run.id, ownerId: "owner-a", expectedVersion: 0, from: "queued", to: "researching" });
  const current = await repository.transition({ id: run.id, ownerId: "owner-a", expectedVersion: researching.stateVersion, from: "researching", to: "validating" });
  return { run, current };
}

describe("D1ResearchRepository", () => {
  it("keeps long canonical identifiers and shared URLs within D1 bind limits", async () => {
    const { repository, db } = setup(); const { current } = await validating(repository);
    const candidate = fanoutCandidate();
    const ids = candidate.skills.map((_, index) => `skill-${String(index).padStart(2, "0")}-${"a".repeat(247)}`);
    const resources = Array.from({ length: 32 }, (_, index) => ({ ...candidate.resources[0]!, id: `resource-${index}-${"b".repeat(150)}`, url: `https://docs.example.org/${"a".repeat(1900)}/${index}`, skillIds: ids }));
    candidate.skills = candidate.skills.map((skill, index) => ({ ...skill, id: ids[index]!, resourceIds: resources.map((resource) => resource.id) }));
    candidate.prerequisiteEdges = ids.flatMap((skillId, index) => ids.slice(0, index).map((prerequisiteSkillId) => ({ skillId, prerequisiteSkillId })));
    candidate.resources = resources; candidate.stages[0]!.skillIds = ids;
    candidate.unitTemplates = candidate.unitTemplates.map((template, index) => ({ ...template, skillId: ids[Math.floor(index / 3)]!, primaryResourceId: resources[0]!.id }));
    candidate.evidence = ids.map((skillId, index) => ({ id: `evidence-${index}`, skillId, resourceId: resources[0]!.id }));
    const annotations = resources.map((resource) => ({ type: "url_citation", url: resource.url, title: resource.title }));
    const result = validateResearchCandidate(candidate, annotations, context);
    expect(result.ready).toBe(true); if (!result.ready) throw new Error(JSON.stringify(result.quality));
    expect(new TextEncoder().encode(JSON.stringify(result.package)).length).toBeLessThan(1_900_000);
    await repository.saveValidation(saveCommand(current, result));
    expect(db.database.prepare("SELECT count(*) count FROM resource_skill_links").get()).toEqual({ count: 2048 });
    expect(db.database.prepare("SELECT count(*) count FROM role_skill_edges").get()).toEqual({ count: 2016 });
    expect(db.batches.at(-1)!.length).toBe(9);
    await expect(repository.resolveReadyPackage("owner-a", current.id)).resolves.toEqual(result.package);
  });

  it.each(["blob", "invalid-json", "wrong-role"])("fails closed for corrupt alias payload or target: %s", async (kind) => {
    const { repository, db } = setup(); const source = await failedRun(repository);
    const other = (await repository.createOrReplay({ ...command("mutation-other-role"), normalizedRoleKey: "other-role" })).run;
    if (kind === "blob") db.database.prepare("UPDATE idempotency_records SET response_json=?1 WHERE mutation_id=?2").run(new Uint8Array([123,125]), source.mutationId);
    if (kind === "invalid-json") db.database.prepare("UPDATE idempotency_records SET response_json='{' WHERE mutation_id=?1").run(source.mutationId);
    if (kind === "wrong-role") db.database.prepare("UPDATE idempotency_records SET response_json=json_set(response_json,'$.runId',?1) WHERE mutation_id=?2").run(other.id, source.mutationId);
    await expect(repository.createOrReplay(command(source.mutationId))).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(db.database.prepare("SELECT count(*) count FROM research_runs").get()).toEqual({ count: 2 });
  });

  it("retains independent input intent for raced aliases joining the same cache identity", async () => {
    const { repository } = setup(); const { run } = await repository.createOrReplay(command());
    const left = { ...command("mutation-alias-race"), inputFingerprint: "other-input" };
    const results = await Promise.all([repository.createOrReplay(left), repository.createOrReplay(left)]);
    expect(results.map((result) => result.run.id)).toEqual([run.id, run.id]);
    await repository.transition({ id: run.id, ownerId: "owner-a", expectedVersion: 0, from: "queued", to: "failed", errorCode: "service-failed", failureCategory: "internal" });
    expect((await repository.createOrReplay(left)).run.id).toBe(run.id);
    await expect(repository.createOrReplay({ ...left, inputFingerprint: "conflicting-input" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("does not accept schema-trimmed package changes with an old immutable fingerprint", async () => {
    const { repository } = setup(); const { current } = await validating(repository);
    const pack = structuredClone(validated.package); pack.blueprint.name = ` ${pack.blueprint.name} `;
    await expect(repository.saveValidation(saveCommand(current, { ...validated, package: pack }))).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect((await repository.getRun("owner-a", current.id))!.state).toBe("validating");
  });

  it("revalidates persisted candidate URL safety on internal reads", async () => {
    const { repository, db } = setup(); const { current } = await validating(repository);
    const candidate = researchCandidateSchema.parse(validResearchCandidate);
    const result = validateResearchCandidate(candidate, [], context);
    await repository.saveValidation({ ...saveCommand(current), result });
    candidate.resources[0]!.url = "http://127.0.0.1/unsafe";
    db.database.prepare("UPDATE research_runs SET candidate_json=?1").run(JSON.stringify(candidate));
    await expect(repository.getRun("owner-a", current.id)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
  });

  it("omits a safe oversized NeedsReview candidate using UTF-8 byte limits", async () => {
    const { repository, db } = setup(); const { current } = await validating(repository);
    const candidate = fanoutCandidate();
    for (const template of candidate.unitTemplates) { template.objective = "学".repeat(500); template.buildTask = "学".repeat(800); template.proofRequirement = "学".repeat(800); }
    const json = JSON.stringify(candidate);
    expect(json.length).toBeLessThan(1_048_576); expect(new TextEncoder().encode(json).length).toBeGreaterThan(1_048_576);
    const result = validateResearchCandidate(candidate, [], context); expect(result.ready).toBe(false);
    const saved = await repository.saveValidation({ ...saveCommand(current), result });
    expect(saved).toMatchObject({ state: "needs-review", candidate: null, quality: result.quality });
    expect(db.database.prepare("SELECT candidate_json FROM research_runs").get()).toEqual({ candidate_json: null });
  });

  it("never truncates a valid Ready package beyond its UTF-8 persistence limit", async () => {
    const { repository, db } = setup(); const { current } = await validating(repository);
    const candidate = fanoutCandidate();
    for (const template of candidate.unitTemplates) {
      template.objective = "学".repeat(500); template.buildTask = "学".repeat(800); template.proofRequirement = "学".repeat(800);
      template.completionCriteria = Array.from({ length: 8 }, (_, index) => "学".repeat(499) + index);
    }
    const result = validateResearchCandidate(candidate, validAnnotations, context); expect(result.ready).toBe(true); if (!result.ready) throw new Error("fixture");
    expect(JSON.stringify(result.package).length).toBeLessThan(1_900_000);
    expect(new TextEncoder().encode(JSON.stringify(result.package)).length).toBeGreaterThan(1_900_000);
    await expect(repository.saveValidation(saveCommand(current, result))).resolves.toMatchObject({ state: "failed", retryable: false, errorCode: "result-too-large", failureCategory: "invalid-result", quality: null, activeExpiresAt: null });
    expect(db.database.prepare("SELECT count(*) count FROM research_packages").get()).toEqual({ count: 0 });
  });

  it("enforces D1 statement/bind limits and immutable bindings in the real SQLite adapter", async () => {
    const { db } = setup(); const base = db.prepare("SELECT ?1 AS value");
    const first = base.bind("first"); const second = base.bind("second");
    await expect(first.first()).resolves.toEqual({ value: "first" }); await expect(second.first()).resolves.toEqual({ value: "second" });
    expect(() => db.prepare(" ".repeat(100_001))).toThrow("D1 SQL too large");
    expect(() => base.bind(...Array.from({ length: 101 }, () => 0))).toThrow("D1 parameter limit");
    expect(() => base.bind("学".repeat(666_667))).toThrow("D1 value too large");
    await expect(db.prepare("SELECT ?1 AS left_value,?2 AS right_value").bind("a".repeat(1_000_001), "a".repeat(1_000_000)).first()).rejects.toThrow("D1 row too large");
  });

  it("writes no orphan rows when save CAS loses immediately before the batch", async () => {
    const { repository, db } = setup(); const { current } = await validating(repository);
    const original = db.batch.bind(db);
    db.batch = async (statements) => {
      db.database.prepare("UPDATE research_runs SET state='failed',state_version=state_version+1,retryable=1,active_slot=NULL,active_expires_at=NULL,error_code='service-failed',public_failure_category='service-unavailable' WHERE id=?1").run(current.id);
      return original(statements);
    };
    await expect(repository.saveValidation(saveCommand(current))).rejects.toMatchObject({ code: "CONFLICT" });
    for (const table of ["role_blueprints", "role_blueprint_versions", "role_skill_definitions", "role_skill_edges", "learning_resources", "resource_skill_links", "research_packages", "research_source_audits"]) expect(db.database.prepare(`SELECT count(*) count FROM ${table}`).get()).toEqual({ count: 0 });
  });

  it("isolates every owner-bound read and mutation", async () => {
    const { repository } = setup(); const { current } = await validating(repository);
    await expect(repository.saveValidation({ ...saveCommand(current), ownerId: "owner-b" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(repository.transition({ id: current.id, ownerId: "owner-b", expectedVersion: current.stateVersion, from: "validating", to: "failed", errorCode: "service-failed", failureCategory: "service-unavailable" })).rejects.toMatchObject({ code: "CONFLICT" });
    await repository.saveValidation(saveCommand(current));
    await expect(repository.getRun("owner-b", current.id)).resolves.toBeNull(); await expect(repository.getPublicRun("owner-b", current.id)).resolves.toBeNull();
    await expect(repository.resolveReadyPackage("owner-b", current.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(repository.createRetry({ ...retryCommand(current.id), ownerId: "owner-b" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const next = (await repository.createOrReplay(command("mutation-next"))).run;
    await expect(repository.attachCachedPackage({ ownerId: "owner-b", id: next.id, expectedVersion: 0, package: validated.package })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const own = await repository.createOrReplay({ ...command(), ownerId: "owner-b" }); expect(own.run.ownerId).toBe("owner-b"); expect(own.run.id).not.toBe(current.id);
  });

  it("rejects invalid transition metadata before a raw SQL constraint failure", async () => {
    const { repository } = setup(); const { run } = await repository.createOrReplay(command());
    await expect(repository.transition({ id: run.id, ownerId: "owner-a", expectedVersion: 0, from: "queued", to: "failed", errorCode: "Provider SQL secret", failureCategory: "internal" })).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    await expect(repository.transition({ id: run.id, ownerId: "owner-a", expectedVersion: 0, from: "queued", to: "researching", retryable: true })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await repository.getRun("owner-a", run.id))!.state).toBe("queued");
  });

  it.each(["create", "cache", "attach", "transition", "save", "retry"])("maps %s storage failures to a typed unavailable error", async (method) => {
    const { repository, db } = setup(); const { current } = await validating(repository);
    if (method === "retry") await repository.transition({ id: current.id, ownerId: "owner-a", expectedVersion: current.stateVersion, from: "validating", to: "failed", retryable: true, errorCode: "service-failed", failureCategory: "internal" });
    if (method === "create" || method === "retry") db.database.exec("DROP TABLE idempotency_records");
    else if (method === "cache" || method === "attach" || method === "save") db.database.exec("DROP TABLE research_packages");
    else db.database.exec("CREATE TRIGGER fail_update BEFORE UPDATE ON research_runs BEGIN SELECT RAISE(ABORT, 'sensitive SQL detail'); END;");
    const operation = method === "create" ? repository.createOrReplay(command("mutation-next")) : method === "cache" ? repository.findFreshPackage({ normalizedRoleKey: command().normalizedRoleKey, locale: command().locale, configFingerprint: command().configFingerprint }) : method === "attach" ? repository.attachCachedPackage({ id: current.id, ownerId: "owner-a", expectedVersion: current.stateVersion, package: validated.package }) : method === "save" ? repository.saveValidation(saveCommand(current)) : method === "retry" ? repository.createRetry(retryCommand(current.id)) : repository.transition({ id: current.id, ownerId: "owner-a", expectedVersion: current.stateVersion, from: "validating", to: "failed", errorCode: "service-failed", failureCategory: "internal" });
    await expect(operation).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE", message: "RESEARCH_UNAVAILABLE" });
  });

  it.each(["same-canonical-role", "different-generated-role"] as const)("preserves two packages' immutable metadata while reusing the same global URL row: %s", async (variant) => {
    const { repository, db } = setup(); const resource = validated.package.blueprint.resources[0]!;
    db.database.prepare("INSERT INTO learning_resources(id,canonical_url,title,provider,language,cost,format,source_tier,last_verified_at) VALUES('existing-url',?1,'old title','old provider','en','paid','course','community','2020-01-01')").run(resource.url);
    const first = await validating(repository); await repository.saveValidation(saveCommand(first.current));
    const candidate = researchCandidateSchema.parse(validResearchCandidate);
    if (variant === "different-generated-role") candidate.role.id = "generated-role-id-not-input-key";
    candidate.resources[0]!.title = "Second package title";
    const result = validateResearchCandidate(candidate, validAnnotations, { ...context, packageId: "research-package-second" }); expect(result.ready).toBe(true); if (!result.ready) throw new Error("fixture");
    expect(result.package.blueprint.version).toBe(validated.package.blueprint.version);
    expect(result.package.blueprint.resources.map(({ url }) => url)).toEqual(validated.package.blueprint.resources.map(({ url }) => url));
    if (variant === "same-canonical-role") expect(result.package.blueprint.id).toBe(validated.package.blueprint.id);
    else expect(result.package.blueprint.id).not.toBe(command().normalizedRoleKey);
    const next = (await repository.createOrReplay(command("mutation-second"))).run; const second = await validating(repository, next); await repository.saveValidation(saveCommand(second.current, result));
    await expect(repository.resolveReadyPackage("owner-a", first.current.id)).resolves.toEqual(validated.package);
    await expect(repository.resolveReadyPackage("owner-a", second.current.id)).resolves.toEqual(result.package);
    expect(db.database.prepare("SELECT title,provider FROM learning_resources WHERE id='existing-url'").get()).toEqual({ title: "old title", provider: "old provider" });
    expect(db.database.prepare("SELECT count(*) count FROM resource_skill_links WHERE resource_id='existing-url'").get()).toEqual({ count: 2 });
    expect(db.database.prepare("SELECT count(DISTINCT id) role_ids,count(DISTINCT slug) slugs FROM role_blueprints").get()).toEqual({ role_ids: 2, slugs: 2 });
    expect(db.database.prepare("SELECT count(DISTINCT id) version_ids,count(DISTINCT role_id) role_ids FROM role_blueprint_versions").get()).toEqual({ version_ids: 2, role_ids: 2 });
  });

  it("rejects retry replay against an unrelated create mutation", async () => {
    const { repository } = setup(); const source = await failedRun(repository);
    await expect(repository.createRetry(retryCommand(source.id, source.mutationId))).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects retry mutation reuse for a different source run", async () => {
    const { repository } = setup(); const source = await failedRun(repository); const other = await failedRun(repository, "mutation-other-failed");
    await repository.createRetry(retryCommand(source.id));
    await expect(repository.createRetry(retryCommand(other.id))).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("keeps retry-alias intent after active dedupe and terminalization without rewriting lineage", async () => {
    const { repository } = setup(); const source = await failedRun(repository); const other = await failedRun(repository, "mutation-other-failed");
    const first = await repository.createRetry(retryCommand(source.id));
    const alias = await repository.createRetry({ ...retryCommand(other.id, "mutation-retry-alias"), requestId: "request-other-retry" });
    expect(alias.run.id).toBe(first.run.id); expect(alias.run.retryOfRunId).toBe(source.id);
    await repository.transition({ id: first.run.id, ownerId: "owner-a", from: "queued", to: "failed", expectedVersion: 0, retryable: true, errorCode: "service-failed", failureCategory: "service-unavailable" });
    const replay = await repository.createRetry(retryCommand(other.id, "mutation-retry-alias"));
    expect(replay.run.id).toBe(first.run.id); expect(replay.run.state).toBe("failed");
    await expect(repository.createRetry(retryCommand(source.id, "mutation-retry-alias"))).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(repository.createOrReplay(command("mutation-retry-alias"))).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("writes retry lineage and its alias atomically, rolling back a lineage SQL failure", async () => {
    const { repository, db } = setup(); const source = await failedRun(repository);
    db.database.exec(`CREATE TRIGGER reject_retry_insert BEFORE INSERT ON research_runs WHEN NEW.retry_of_run_id IS NOT NULL BEGIN SELECT RAISE(ABORT, 'injected lineage failure'); END;
      CREATE TRIGGER reject_retry_update BEFORE UPDATE OF retry_of_run_id ON research_runs WHEN NEW.retry_of_run_id IS NOT NULL BEGIN SELECT RAISE(ABORT, 'injected lineage failure'); END;`);
    await expect(repository.createRetry(retryCommand(source.id))).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(db.database.prepare("SELECT count(*) count FROM research_runs").get()).toEqual({ count: 1 });
    expect(db.database.prepare("SELECT count(*) count FROM idempotency_records").get()).toEqual({ count: 1 });
  });

  it("rolls back retry run and lineage when the alias insert fails", async () => {
    const { repository, db } = setup(); const source = await failedRun(repository);
    db.failAtBatchStatement = 1;
    await expect(repository.createRetry(retryCommand(source.id))).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(db.database.prepare("SELECT count(*) count FROM research_runs").get()).toEqual({ count: 1 });
  });

  it("deduplicates concurrent retries and replays both mutations after the winner finishes", async () => {
    const { repository, db } = setup(); const source = await failedRun(repository);
    const left = retryCommand(source.id); const right = { ...retryCommand(source.id, "mutation-retry-other"), requestId: "request-retry-other" };
    const results = await Promise.all([repository.createRetry(left), repository.createRetry(right)]);
    expect(results[0]!.run.id).toBe(results[1]!.run.id);
    expect(db.database.prepare("SELECT count(*) count FROM research_runs").get()).toEqual({ count: 2 });
    await repository.transition({ id: results[0]!.run.id, ownerId: "owner-a", from: "queued", to: "failed", expectedVersion: 0, retryable: true, errorCode: "service-failed", failureCategory: "service-unavailable" });
    expect((await repository.createRetry(left)).run.id).toBe(results[0]!.run.id);
    expect((await repository.createRetry(right)).run.id).toBe(results[0]!.run.id);
  });

  it("requires a new retry request identifier and does not reuse the paid request", async () => {
    const { repository } = setup(); const source = await failedRun(repository);
    await expect(repository.createRetry({ ...retryCommand(source.id), requestId: source.requestId })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("classifies a structurally complete safe ineligible candidate as NeedsReview", async () => {
    const { repository } = setup(); const { current } = await validating(repository);
    const candidate = researchCandidateSchema.parse(validResearchCandidate); candidate.prerequisiteEdges.push({ skillId: candidate.skills[0]!.id, prerequisiteSkillId: candidate.skills[0]!.id });
    const result = validateResearchCandidate(candidate, validAnnotations, context); expect(result.ready).toBe(false);
    const saved = await repository.saveValidation({ ...saveCommand(current), result });
    expect(saved).toMatchObject({ state: "needs-review", retryable: true, candidate });
    expect(saved.activeExpiresAt).toBeNull();
  });

  it.each([null, { broken: true }, { ...validResearchCandidate, role: { ...validResearchCandidate.role, summary: "<script>evil()</script>" } }])("classifies null/unsafe/unpersistable rejected candidates as Failed", async (sanitizedCandidate) => {
    const { repository } = setup(); const { current } = await validating(repository);
    const result = { ready: false as const, quality: { ...validated.quality, passed: false, issueCodes: ["invalid-schema" as const] }, sanitizedCandidate };
    const saved = await repository.saveValidation({ ...saveCommand(current), result: result as never });
    expect(saved).toMatchObject({ state: "failed", candidate: null, failureCategory: "invalid-result", retryable: true, activeExpiresAt: null });
  });

  it("rejects unsafe candidate URLs as Failed even with a claimed sanitized candidate", async () => {
    const { repository } = setup(); const { current } = await validating(repository);
    const candidate = researchCandidateSchema.parse(validResearchCandidate); candidate.resources[0]!.url = "http://127.0.0.1/private";
    const saved = await repository.saveValidation({ ...saveCommand(current), result: { ready: false, quality: { ...validated.quality, passed: false, issueCodes: ["invalid-graph"] }, sanitizedCandidate: candidate } });
    expect(saved).toMatchObject({ state: "failed", candidate: null });
  });

  it.each([
    ["ownerId", "a".repeat(257)], ["requestId", "a".repeat(257)], ["mutationId", "bad mutation"], ["mutationId", "a".repeat(129)],
    ["rawRole", "x".repeat(161)], ["rawRole", "<script>x</script>"], ["normalizedRoleKey", "x".repeat(257)],
    ["inputFingerprint", "x".repeat(257)], ["configFingerprint", "x".repeat(257)], ["activeExpiresAt", -1], ["activeExpiresAt", 1.5],
  ])("bounds create input before persistence: %s", async (field, value) => {
    const { repository, db } = setup();
    await expect(repository.createOrReplay({ ...command(), [field]: value })).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(db.database.prepare("SELECT count(*) count FROM research_runs").get()).toEqual({ count: 0 });
  });

  it("does not invoke accessor input while validating commands", async () => {
    const { repository } = setup(); let invoked = false;
    const input = { ...command(), get rawRole() { invoked = true; return "Bad role"; } };
    await expect(repository.createOrReplay(input)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(invoked).toBe(false);
  });

  it("rejects noncanonical injected run IDs before any insert", async () => {
    const { db } = setup(); const repository = new D1ResearchRepository(db as unknown as D1Database, { now: () => now, createId: () => "BAD:id" });
    await expect(repository.createOrReplay(command())).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(db.database.prepare("SELECT count(*) count FROM research_runs").get()).toEqual({ count: 0 });
  });

  it("rejects malformed read identity and CAS versions with stable errors", async () => {
    const { repository } = setup(); const { run } = await repository.createOrReplay(command());
    await expect(repository.getRun("owner-a", "BAD:id")).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    await expect(repository.findFreshPackage({ ...command(), now: Number.NaN })).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    await expect(repository.transition({ id: run.id, ownerId: "owner-a", expectedVersion: -1, from: "queued", to: "researching" })).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
  });

  it("fails closed when persisted run identity is oversized", async () => {
    const { repository, db } = setup(); const { run } = await repository.createOrReplay(command());
    db.database.prepare("UPDATE research_runs SET request_id=?1").run("a".repeat(257));
    await expect(repository.getRun("owner-a", run.id)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
  });

  it("maps read SQL errors to RESEARCH_UNAVAILABLE without raw storage details", async () => {
    const { repository, db } = setup(); db.database.exec("DROP TABLE research_runs");
    await expect(repository.getRun("owner-a", "research-run-missing")).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE", message: "RESEARCH_UNAVAILABLE" });
  });

  it("retains independently worded citation titles from validated provider annotations", async () => {
    const { repository } = setup(); const { current } = await validating(repository);
    const result = validateResearchCandidate(validResearchCandidate, validAnnotations.map((annotation) => ({ ...annotation, title: `Citation: ${annotation.title}` })), context);
    expect(result.ready).toBe(true); if (!result.ready) throw new Error("fixture");
    await repository.saveValidation(saveCommand(current, result));
    await expect(repository.resolveReadyPackage("owner-a", current.id)).resolves.toEqual(result.package);
  });

  const corruptions: [string, (pack: ResearchPackage) => void][] = [
    ["cycle", (pack) => { pack.blueprint.skills[0]!.prerequisiteIds = [pack.blueprint.skills[0]!.id]; }],
    ["quality counts", (pack) => { pack.qualityReport.sourceCount++; }],
    ["quality date", (pack) => { pack.qualityReport.observedAt = "2026-08-29"; }],
    ["registry identity", (pack) => { pack.registry.blueprintId = "unrelated-role"; }],
    ["missing source", (pack) => { pack.sourceEvidence.pop(); pack.qualityReport.sourceCount--; }],
    ["citation hash", (pack) => { pack.sourceEvidence[0]!.citationHash = "forged-hash"; }],
    ["citation hostname", (pack) => { pack.sourceEvidence[0]!.hostname = "unrelated.example"; }],
    ["citation tier", (pack) => { pack.sourceEvidence[0]!.sourceTier = "community"; }],
    ["resource date", (pack) => { pack.blueprint.resources[0]!.lastVerifiedAt = "2020-01-01"; }],
    ["noncanonical URL", (pack) => { pack.blueprint.resources[0]!.url += "#tracking"; pack.sourceEvidence[0]!.canonicalUrl += "#tracking"; pack.sourceEvidence[0]!.citationHash = fingerprint({ canonicalUrl: pack.sourceEvidence[0]!.canonicalUrl }); }],
    ["missing core authority", (pack) => { for (const resource of pack.blueprint.resources) resource.sourceTier = "community"; for (const source of pack.sourceEvidence) source.sourceTier = "community"; }],
    ["duplicate phase coverage", (pack) => { pack.blueprint.phases[1]!.skillIds.push(pack.blueprint.phases[0]!.skillIds[0]!); }],
    ["expired observation ordering", (pack) => { pack.expiresAt = "2026-08-29"; }],
  ];
  it.each(corruptions)("rejects %s on save and read even with a recomputed fingerprint", async (_name, corrupt) => {
    const first = setup(); const { current } = await validating(first.repository);
    const forged = structuredClone(validated.package); corrupt(forged); const result = rehash(forged);
    await expect(first.repository.saveValidation(saveCommand(current, result))).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    const second = setup(); const saved = await validating(second.repository);
    await second.repository.saveValidation(saveCommand(saved.current));
    second.db.database.prepare("UPDATE research_packages SET package_json=?1,quality_json=?2,content_fingerprint=?3").run(JSON.stringify(forged), JSON.stringify(forged.qualityReport), forged.contentFingerprint);
    await expect(second.repository.resolveReadyPackage("owner-a", saved.current.id)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
  });

  it("rejects mismatched external quality rather than trusting package quality alone", async () => {
    const { repository } = setup(); const { current } = await validating(repository);
    await expect(repository.saveValidation(saveCommand(current, { ...validated, quality: { ...validated.quality, skillCount: 0 } }))).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
  });

  it.each(["normalizedRoleKey", "locale", "configFingerprint"] as const)("rejects save cache identity mismatch: %s", async (field) => {
    const { repository, db } = setup(); const { current } = await validating(repository);
    const input = { ...saveCommand(current), [field]: field === "locale" ? "zh-CN" : "other" };
    await expect(repository.saveValidation(input)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.database.prepare("SELECT count(*) count FROM research_packages").get()).toEqual({ count: 0 });
  });

  it.each(["normalizedRoleKey", "locale", "configFingerprint"] as const)("rejects cached attachment across %s", async (field) => {
    const { repository } = setup(); const { current } = await validating(repository);
    await repository.saveValidation(saveCommand(current));
    const next = (await repository.createOrReplay({ ...command("mutation-next"), [field]: field === "locale" ? "zh-CN" : "other" })).run;
    await expect(repository.attachCachedPackage({ ownerId: "owner-a", id: next.id, expectedVersion: 0, package: validated.package })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it.each(["id", "normalized_role_key", "locale", "config_fingerprint", "blueprint_id", "blueprint_version", "blueprint_version_id", "registry_id", "registry_version", "observed_at", "expires_at", "created_at"])("rejects tampered persisted metadata: %s", async (field) => {
    const { repository, db } = setup(); const { current } = await validating(repository);
    await repository.saveValidation(saveCommand(current));
    // Disable FK checks only for adversarial stored-row corruption.
    db.database.exec("PRAGMA foreign_keys=OFF");
    const value = field === "locale" ? "zh-CN" : field === "expires_at" ? Date.parse("2026-10-01T00:00:00Z") : field === "observed_at" ? "2026-08-29" : field === "created_at" ? -1 : "tampered";
    db.database.prepare(`UPDATE research_packages SET ${field}=?1`).run(value);
    if (field === "id") db.database.prepare("UPDATE research_runs SET package_id='tampered'").run();
    await expect(repository.resolveReadyPackage("owner-a", current.id)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
  });

  it("uses an exclusive UTC-midnight cache expiry without renewing attachments", async () => {
    const { repository, db } = setup(); const { current } = await validating(repository);
    await repository.saveValidation(saveCommand(current));
    const expires = Date.parse("2026-09-30T00:00:00Z");
    const lookup = { normalizedRoleKey: command().normalizedRoleKey, locale: command().locale, configFingerprint: command().configFingerprint };
    await expect(repository.findFreshPackage({ ...lookup, now: expires - 1 })).resolves.toEqual(validated.package);
    await expect(repository.findFreshPackage({ ...lookup, now: expires })).resolves.toBeNull();
    const next = (await repository.createOrReplay(command("mutation-next"))).run;
    await repository.attachCachedPackage({ id: next.id, ownerId: "owner-a", expectedVersion: 0, package: validated.package });
    expect(db.database.prepare("SELECT expires_at FROM research_packages").get()).toEqual({ expires_at: expires });
    const expired = new D1ResearchRepository(db as unknown as D1Database, { now: () => expires });
    await expect(expired.resolveReadyPackage("owner-a", next.id)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
  });

  it("creates a run then replays the same owner mutation without a second row", async () => {
    const { db, repository } = setup();
    const first = await repository.createOrReplay(command());
    const replay = await repository.createOrReplay(command());
    expect(first.replayed).toBe(false); expect(replay).toEqual({ run: first.run, replayed: true });
    expect(db.database.prepare("SELECT count(*) AS count FROM research_runs").get()).toEqual({ count: 1 });
  });

  it("deduplicates an active run across mutations for the same owner and preserves owner isolation", async () => {
    const { repository } = setup();
    const first = await repository.createOrReplay(command());
    const joined = await repository.createOrReplay(command("mutation-research-2"));
    expect(joined).toMatchObject({ replayed: true, run: { id: first.run.id } });
    await expect(repository.getRun("owner-b", first.run.id)).resolves.toBeNull();
    await expect(repository.getPublicRun("owner-b", first.run.id)).resolves.toBeNull();
  });

  it("uses CAS transitions and rejects a stale version with a stable conflict", async () => {
    const { repository } = setup(); const run = (await repository.createOrReplay(command())).run;
    const researching = await repository.transition({ id: run.id, ownerId: "owner-a", expectedVersion: 0, from: "queued", to: "researching" });
    expect(researching.stateVersion).toBe(1);
    await expect(repository.transition({ id: run.id, ownerId: "owner-a", expectedVersion: 0, from: "queued", to: "researching" }))
      .rejects.toMatchObject({ code: "CONFLICT" } satisfies Partial<ResearchRepositoryError>);
  });

  it("persists a validated ready package atomically and only resolves it while fresh", async () => {
    const { repository } = setup(); const { run, current } = await validating(repository);
    const ready = await repository.saveValidation({ id: run.id, ownerId: "owner-a", expectedVersion: current.stateVersion, result: validated, configFingerprint: "config-fingerprint-1", normalizedRoleKey: "data-product-manager", locale: "en-US" });
    expect(ready.state).toBe("ready");
    await expect(repository.resolveReadyPackage("owner-a", run.id)).resolves.toEqual(validated.package);
  });

  it("does not resolve a non-ready package", async () => {
    const { repository } = setup(); const run = (await repository.createOrReplay(command())).run;
    await expect(repository.resolveReadyPackage("owner-a", run.id)).rejects.toMatchObject({ code: "NOT_READY" } satisfies Partial<ResearchRepositoryError>);
  });

  it("keeps a shared-mutation alias replayable after the joined run terminalizes", async () => {
    const { repository } = setup(); const first = (await repository.createOrReplay(command())).run;
    await repository.createOrReplay(command("mutation-alias-2"));
    const failed = await repository.transition({ id: first.id, ownerId: "owner-a", expectedVersion: 0, from: "queued", to: "failed", retryable: true, errorCode: "service-failed", failureCategory: "service-unavailable" });
    const replay = await repository.createOrReplay(command("mutation-alias-2"));
    expect(replay).toMatchObject({ replayed: true, run: { id: failed.id, state: "failed" } });
    await expect(repository.createOrReplay({ ...command("mutation-alias-2"), inputFingerprint: "changed" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("has one winning run for concurrent identical creation", async () => {
    const { db, repository } = setup();
    const results = await Promise.all([repository.createOrReplay(command()), repository.createOrReplay(command())]);
    expect(new Set(results.map((result) => result.run.id))).toEqual(new Set(["research-run-1"]));
    expect(db.database.prepare("SELECT count(*) AS count FROM research_runs").get()).toEqual({ count: 1 });
  });

  it("returns a fresh cache hit only for its role, locale, config, and TTL", async () => {
    const { repository } = setup(); const { run, current } = await validating(repository);
    await repository.saveValidation({ id: run.id, ownerId: "owner-a", expectedVersion: current.stateVersion, result: validated, configFingerprint: "config-fingerprint-1", normalizedRoleKey: "data-product-manager", locale: "en-US" });
    await expect(repository.findFreshPackage({ normalizedRoleKey: "data-product-manager", locale: "en-US", configFingerprint: "config-fingerprint-1" })).resolves.toEqual(validated.package);
    await expect(repository.findFreshPackage({ normalizedRoleKey: "other", locale: "en-US", configFingerprint: "config-fingerprint-1" })).resolves.toBeNull();
    await expect(repository.findFreshPackage({ normalizedRoleKey: "data-product-manager", locale: "zh-CN", configFingerprint: "config-fingerprint-1" })).resolves.toBeNull();
    await expect(repository.findFreshPackage({ normalizedRoleKey: "data-product-manager", locale: "en-US", configFingerprint: "other" })).resolves.toBeNull();
    await expect(repository.findFreshPackage({ normalizedRoleKey: "data-product-manager", locale: "en-US", configFingerprint: "config-fingerprint-1", now: Date.parse("2026-10-01T00:00:00.000Z") })).resolves.toBeNull();
  });

  it("rolls back every normalized row when a mid-batch failure occurs", async () => {
    const { db, repository } = setup(); const { run, current } = await validating(repository);
    db.failAtBatchStatement = 4;
    await expect(repository.saveValidation({ id: run.id, ownerId: "owner-a", expectedVersion: current.stateVersion, result: validated, configFingerprint: "config-fingerprint-1", normalizedRoleKey: "data-product-manager", locale: "en-US" })).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    for (const table of ["role_blueprints", "role_blueprint_versions", "role_skill_definitions", "role_skill_edges", "learning_resources", "resource_skill_links", "research_packages", "research_source_audits"]) {
      expect(db.database.prepare(`SELECT count(*) AS count FROM ${table}`).get()).toEqual({ count: 0 });
    }
    await expect(repository.getRun("owner-a", run.id)).resolves.toMatchObject({ state: "validating", stateVersion: current.stateVersion });
  });

  it("reuses global resources without overwriting metadata and links the actual row", async () => {
    const { db, repository } = setup(); const resource = validated.package.blueprint.resources[0]!;
    db.database.prepare("INSERT INTO learning_resources (id,canonical_url,title,provider,language,cost,format,source_tier,last_verified_at) VALUES ('preexisting',?1,'old title','old provider','en','paid','course','community','2020-01-01')").run(resource.url);
    const { run, current } = await validating(repository);
    await repository.saveValidation({ id: run.id, ownerId: "owner-a", expectedVersion: current.stateVersion, result: validated, configFingerprint: "config-fingerprint-1", normalizedRoleKey: "data-product-manager", locale: "en-US" });
    expect(db.database.prepare("SELECT id,title,provider,cost FROM learning_resources WHERE canonical_url=?1").get(resource.url)).toEqual({ id: "preexisting", title: "old title", provider: "old provider", cost: "paid" });
    expect(db.database.prepare("SELECT resource_id FROM resource_skill_links WHERE resource_id='preexisting' LIMIT 1").get()).toEqual({ resource_id: "preexisting" });
  });

  it("persists a validated 64-skill DAG with 2,016 edges using the small package batch shape", async () => {
    const small = setup(); const smallRun = await validating(small.repository);
    await small.repository.saveValidation({ id: smallRun.run.id, ownerId: "owner-a", expectedVersion: smallRun.current.stateVersion, result: validated, configFingerprint: "config-fingerprint-1", normalizedRoleKey: "data-product-manager", locale: "en-US" });
    const large = setup(); const largeRun = await validating(large.repository);
    const result = validateResearchCandidate(fanoutCandidate(), validAnnotations, { ...context, packageId: "research-package-fanout" });
    expect(result.ready).toBe(true);
    if (!result.ready) throw new Error(JSON.stringify(result.quality));
    await large.repository.saveValidation(saveCommand(largeRun.current, result));
    expect(large.db.database.prepare("SELECT count(*) AS count FROM role_skill_definitions").get()).toEqual({ count: 64 });
    expect(large.db.database.prepare("SELECT count(*) AS count FROM role_skill_edges").get()).toEqual({ count: 2016 });
    expect(large.db.batches.at(-1)?.length).toBe(small.db.batches.at(-1)?.length);
  });

  it("rejects a forged ready package whose dependency graph contains a cycle", async () => {
    const { repository } = setup(); const { run, current } = await validating(repository);
    const packageValue = structuredClone(validated.package);
    packageValue.blueprint.skills[0]!.prerequisiteIds = [packageValue.blueprint.skills[0]!.id];
    const { contentFingerprint, ...content } = packageValue;
    expect(contentFingerprint).toBeTruthy();
    packageValue.contentFingerprint = fingerprint(canonicalJson(content));
    await expect(repository.saveValidation({ id: run.id, ownerId: "owner-a", expectedVersion: current.stateVersion, result: { ready: true, package: packageValue, quality: packageValue.qualityReport }, configFingerprint: "config-fingerprint-1", normalizedRoleKey: "data-product-manager", locale: "en-US" })).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
  });

  it("fails closed for corrupted cached package JSON and whitelists the public view", async () => {
    const { db, repository } = setup(); const { run, current } = await validating(repository);
    await repository.saveValidation({ id: run.id, ownerId: "owner-a", expectedVersion: current.stateVersion, result: validated, configFingerprint: "config-fingerprint-1", normalizedRoleKey: "data-product-manager", locale: "en-US" });
    const publicRun = await repository.getPublicRun("owner-a", run.id);
    expect(publicRun).toMatchObject({ id: run.id, state: "ready" });
    expect(Object.keys(publicRun!).sort()).toEqual(["id", "role", "locale", "state", "retryable", "packageId", "summary", "skillCount", "sourceCount", "observedAt", "quality"].sort());
    db.database.exec("UPDATE research_packages SET package_json='{}'");
    await expect(repository.resolveReadyPackage("owner-a", run.id)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
  });

  it("creates owner-bound retry lineage only for a retryable terminal run", async () => {
    const { repository } = setup(); const run = (await repository.createOrReplay(command())).run;
    const failed = await repository.transition({ id: run.id, ownerId: "owner-a", expectedVersion: 0, from: "queued", to: "failed", retryable: true, errorCode: "service-failed", failureCategory: "service-unavailable" });
    const retry = await repository.createRetry({ ownerId: "owner-a", requestId: "request-2", mutationId: "mutation-retry-1", runId: failed.id, activeExpiresAt: now + 60_000 });
    expect(retry).toMatchObject({ replayed: false, run: { retryOfRunId: run.id, state: "queued" } });
  });

  it("keeps terminal runs immutable under transitions, repeated saves and cached attachment", async () => {
    const { repository } = setup(); const { current } = await validating(repository);
    const ready = await repository.saveValidation(saveCommand(current));
    await expect(repository.saveValidation(saveCommand(current))).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(repository.transition({ id: ready.id, ownerId: "owner-a", expectedVersion: ready.stateVersion, from: "ready", to: "failed", errorCode: "service-failed", failureCategory: "internal" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(repository.attachCachedPackage({ id: ready.id, ownerId: "owner-a", expectedVersion: ready.stateVersion, package: validated.package })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(repository.getRun("owner-a", ready.id)).resolves.toEqual(ready);
  });

  it("rejects a re-fingerprinted but nonidentical cached package at attachment", async () => {
    const { repository } = setup(); const { current } = await validating(repository); await repository.saveValidation(saveCommand(current));
    const next = (await repository.createOrReplay(command("mutation-next"))).run;
    const pack = structuredClone(validated.package); pack.blueprint.summary += " Updated."; rehash(pack);
    await expect(repository.attachCachedPackage({ id: next.id, ownerId: "owner-a", expectedVersion: 0, package: pack })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await repository.getRun("owner-a", next.id))!.state).toBe("queued");
  });

  it("maps statement preparation failures to a typed unavailable error", async () => {
    const { repository, db } = setup(); const { current } = await validating(repository); const prepare = db.prepare.bind(db);
    db.prepare = (sql) => { if (sql.startsWith("INSERT INTO role_blueprints")) throw new Error("raw statement details"); return prepare(sql); };
    await expect(repository.saveValidation(saveCommand(current))).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE", message: "RESEARCH_UNAVAILABLE" });
  });
});
