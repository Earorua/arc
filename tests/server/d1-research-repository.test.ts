import { describe, expect, it } from "vitest";
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

function setup() {
  const db = createResearchD1();
  seedUser(db, "owner-a"); seedUser(db, "owner-b");
  let sequence = 0;
  const repository = new D1ResearchRepository(db as unknown as D1Database, { now: () => now, createId: () => `research-run-${++sequence}` });
  return { db, repository };
}
function command(mutationId = "mutation-research-1") { return { ownerId: "owner-a", requestId: "request-1", mutationId, rawRole: "Data Product Manager", normalizedRoleKey: "data-product-manager", locale: "en-US" as const, inputFingerprint: "input-fingerprint-1", configFingerprint: "config-fingerprint-1", activeExpiresAt: now + 60_000 }; }
async function validating(repository: D1ResearchRepository, suppliedRun?: Awaited<ReturnType<D1ResearchRepository["createOrReplay"]>>["run"]) {
  const run = suppliedRun ?? (await repository.createOrReplay(command())).run;
  const researching = await repository.transition({ id: run.id, ownerId: "owner-a", expectedVersion: 0, from: "queued", to: "researching" });
  const current = await repository.transition({ id: run.id, ownerId: "owner-a", expectedVersion: researching.stateVersion, from: "researching", to: "validating" });
  return { run, current };
}

describe("D1ResearchRepository", () => {
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
    await expect(repository.saveValidation({ id: run.id, ownerId: "owner-a", expectedVersion: current.stateVersion, result: validated, configFingerprint: "config-fingerprint-1", normalizedRoleKey: "data-product-manager", locale: "en-US" })).rejects.toMatchObject({ code: "CONFLICT" });
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

  it("persists 64 skills and 4,096 edges with the same bounded batch shape as a small package", async () => {
    const small = setup(); const smallRun = await validating(small.repository);
    await small.repository.saveValidation({ id: smallRun.run.id, ownerId: "owner-a", expectedVersion: smallRun.current.stateVersion, result: validated, configFingerprint: "config-fingerprint-1", normalizedRoleKey: "data-product-manager", locale: "en-US" });
    const large = setup(); const largeRun = await validating(large.repository);
    const packageValue = structuredClone(validated.package);
    packageValue.id = "research-package-fanout";
    const skills = Array.from({ length: 64 }, (_, index) => ({ ...packageValue.blueprint.skills[0]!, id: `fanout-skill-${index}`, prerequisiteIds: Array.from({ length: 64 }, (_, target) => `fanout-skill-${target}`) }));
    packageValue.blueprint.skills = skills;
    packageValue.blueprint.resources = [{ ...packageValue.blueprint.resources[0]!, skillIds: skills.map((skill) => skill.id) }];
    const { contentFingerprint, ...content } = packageValue;
    expect(contentFingerprint).toBeTruthy();
    packageValue.contentFingerprint = fingerprint(canonicalJson(content));
    await large.repository.saveValidation({ id: largeRun.run.id, ownerId: "owner-a", expectedVersion: largeRun.current.stateVersion, result: { ready: true, package: packageValue, quality: packageValue.qualityReport }, configFingerprint: "config-fingerprint-1", normalizedRoleKey: "data-product-manager", locale: "en-US" });
    expect(large.db.database.prepare("SELECT count(*) AS count FROM role_skill_definitions").get()).toEqual({ count: 64 });
    expect(large.db.database.prepare("SELECT count(*) AS count FROM role_skill_edges").get()).toEqual({ count: 4096 });
    expect(large.db.batches.at(-1)?.length).toBe(small.db.batches.at(-1)?.length);
  });

  it("fails closed for corrupted cached package JSON and whitelists the public view", async () => {
    const { db, repository } = setup(); const { run, current } = await validating(repository);
    await repository.saveValidation({ id: run.id, ownerId: "owner-a", expectedVersion: current.stateVersion, result: validated, configFingerprint: "config-fingerprint-1", normalizedRoleKey: "data-product-manager", locale: "en-US" });
    const publicRun = await repository.getPublicRun("owner-a", run.id);
    expect(publicRun).toMatchObject({ id: run.id, state: "ready" });
    expect(publicRun).not.toHaveProperty("ownerId"); expect(publicRun).not.toHaveProperty("candidate");
    db.database.exec("UPDATE research_packages SET package_json='{}'");
    await expect(repository.resolveReadyPackage("owner-a", run.id)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
  });

  it("creates owner-bound retry lineage only for a retryable terminal run", async () => {
    const { repository } = setup(); const run = (await repository.createOrReplay(command())).run;
    const failed = await repository.transition({ id: run.id, ownerId: "owner-a", expectedVersion: 0, from: "queued", to: "failed", retryable: true, errorCode: "service-failed", failureCategory: "service-unavailable" });
    const retry = await repository.createRetry({ ownerId: "owner-a", requestId: "request-2", mutationId: "mutation-retry-1", runId: failed.id, activeExpiresAt: now + 60_000 });
    expect(retry).toMatchObject({ replayed: false, run: { retryOfRunId: run.id, state: "queued" } });
  });
});
