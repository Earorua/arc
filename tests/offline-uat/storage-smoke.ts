import assert from "node:assert/strict";
import { createOfflineComposition } from "./composition";
import { offlinePlanningRequest } from "./planning-fixture";
import { createDemoState } from "../../app/lib/demo-store";
import { CloudService } from "../../app/server/cloud/service";
import { D1CloudRepository } from "../../app/server/cloud/d1-cloud-repository";

/** Same actual service/repository chain, exercised against either disposable DB. */
export async function verifyOfflineStorage(db: D1Database) {
  const origin = "http://127.0.0.1:4179";
  const app = await createOfflineComposition(db, origin);
  const owner = "owner-a";
  assert.equal(await app.cloud.getWorkspace(owner), null, "fresh account must not have a seeded goal");
  const run = await app.createResearch().start(owner, { role: "Data Product Manager", locale: "en-US", mutationId: "offline-storage-research" }, { cohortEnabled: true, rateAllowed: true });
  assert.equal(run.state, "ready"); assert.ok(run.planningData);
  const setup = { roleId: run.planningData.blueprint.name, level: "beginner", weeklyMinutes: 420, targetWeeks: 18 };
  await app.cloud.importLocalState(owner, { migrationId: "offline-storage-activation", intent: "research-setup", consent: true, conflictResolution: "reject", state: { setup, completedUnitIds: [], proofs: [] } });
  const generated = await app.planning.generate(owner, offlinePlanningRequest(run.planningData.blueprint, { source: "research", researchRunId: run.id }, "offline-storage-generate"));
  assert.ok(generated.workspace.activePlanVersionId);
  const unit = generated.workspace.dailyUnits[0]; assert.ok(unit);
  const event = { mutationId: "offline-storage-complete", baseVersionId: generated.workspace.activePlanVersionId,
    event: { kind: "completed", unitId: unit.id, actualMinutes: unit.estimatedMinutes, planningDate: new Date().toISOString().slice(0, 10) } };
  const completed = await app.planning.appendEvent(owner, event);
  assert.equal(completed.workspace.events.at(-1)?.kind, "completed");
  const fresh = await createOfflineComposition(db, origin);
  const replayed = await fresh.planning.getWorkspaceResponse(owner);
  assert.deepEqual(replayed.workspace, completed.workspace);
  assert.equal(replayed.sourceContext?.reference.source, "research");
  assert.deepEqual(await fresh.planning.appendEvent(owner, event), completed);
  const foreign = await fresh.dispatch(new Request(`${origin}/api/intelligence/research/${run.id}`, { headers: { "x-arc-uat-owner": "owner-b" } }));
  assert.equal(foreign.status, 404);
  const proof = await fresh.proof.create(owner, { mutationId: "offline-storage-proof", baseRevision: 0, intent: "submit", validatorKey: null,
    dailyUnitId: unit.id, title: "Offline measurement artifact", kind: "document", summary: "Annotated model with explicit grain, metric ownership, and a resolved ambiguity.",
    artifactUrl: "https://example.com/arc-offline-proof", assetId: null, skillIds: [unit.skillId], completionCriteria: unit.completionCriteria, visibility: "private" });
  assert.equal(proof.outcome, "demonstrated");
  const withdrawal = await fresh.proof.withdraw(owner, proof.workspace.versions[0].proofId, { mutationId: "offline-storage-withdraw", baseRevision: 1 });
  assert.equal(withdrawal.workspace.projections.find((value) => value.skillId === unit.skillId && value.audience === "internal")?.status, "exploring");
  const counts = await db.prepare("SELECT (SELECT count(*) FROM career_goals WHERE user_id=?1) goals,(SELECT count(*) FROM planning_workspaces WHERE user_id=?1) workspaces,(SELECT count(*) FROM learning_events WHERE user_id=?1) imported_completions").bind(owner).first();
  assert.deepEqual({ ...counts }, { goals: 1, workspaces: 1, imported_completions: 0 });
  assert.equal(app.counters.fakeResearchCalls, 1); assert.equal(fresh.counters.fakeResearchCalls, 0);
  await app.dispose(); await fresh.dispose();
  return { ready: 1, currentSetupActivation: 1, generation: 1, completion: 1, freshReplay: 1, idempotentReplay: 1, crossOwner404: 1, demonstratedProof: 1, withdrawal: 1 };
}

/** The pause is at D1 batch entry, after repository reads, not a second client preflight. */
export async function verifyAtomicSetupGuards(db: D1Database) {
  const app = await createOfflineComposition(db, "http://127.0.0.1:4179");
  const cases = [
    { operation: "save", race: "plan" }, { operation: "save", race: "replacement" },
    { operation: "activation", race: "plan" }, { operation: "activation", race: "replacement" },
    { operation: "new-activation", race: "plan" },
  ] as const;
  for (const { operation, race } of cases) {
    const owner = `offline-${operation}-${race}`;
    await db.prepare("INSERT INTO users (id,name,email,email_verified) VALUES (?1,?1,?2,0)").bind(owner, `${owner}@example.test`).run();
    const state = createDemoState();
    if (operation !== "new-activation") await app.cloud.importLocalState(owner, { migrationId: `${owner}-initial`, consent: true, conflictResolution: "reject", state });
    const original = await app.cloud.getWorkspace(owner);
    let beforeBatch: (() => Promise<void>) | null = async () => {
      if (race === "replacement") await db.prepare("UPDATE career_goals SET active_slot=NULL,status='archived' WHERE user_id=?1 AND active_slot=1").bind(owner).run();
      if (race === "replacement" || operation === "new-activation") await app.cloud.importLocalState(owner, { migrationId: `${owner}-concurrent`, consent: true, conflictResolution: "reject", state });
      await app.planning.generate(owner, offlinePlanningRequest(undefined, undefined, `${owner}-plan`));
    };
    const guardedDb = {
      prepare: db.prepare.bind(db),
      batch: async (statements: D1PreparedStatement[]) => { const action = beforeBatch; beforeBatch = null; await action?.(); return db.batch(statements); },
    } as unknown as D1Database;
    const guardedCloud = new CloudService(new D1CloudRepository(guardedDb));
    const setup = { ...state.setup, weeklyMinutes: 300 };
    const result = operation === "save"
      ? guardedCloud.saveSetup(owner, { mutationId: `${owner}-rejected-save`, intent: "research-setup", setup })
      : guardedCloud.importLocalState(owner, { migrationId: `${owner}-rejected-activation`, intent: "research-setup", consent: true, conflictResolution: "reject", state: { ...state, setup } });
    await assert.rejects(result, (error: unknown) => !!error && typeof error === "object" && "code" in error && error.code === "CONFLICT");
    assert.equal(beforeBatch, null, "concurrent real plan must have run at batch boundary");
    assert.equal((await app.cloud.getWorkspace(owner))?.state.setup.weeklyMinutes, 420);
    if (original) assert.deepEqual({ ...await db.prepare("SELECT role_id,weekly_minutes FROM career_goals WHERE id=?1").bind(original.activeGoalId).first() }, { role_id: state.setup.roleId, weekly_minutes: 420 });
    assert.deepEqual({ ...await db.prepare("SELECT (SELECT count(*) FROM idempotency_records WHERE user_id=?1 AND mutation_id=?2) receipts,(SELECT count(*) FROM migration_runs WHERE user_id=?1 AND migration_id=?3) migrations,(SELECT count(*) FROM planning_workspaces WHERE user_id=?1) plans").bind(owner, `${owner}-rejected-save`, `${owner}-rejected-activation`).first() }, { receipts: 0, migrations: 0, plans: 1 });
  }
  assert.deepEqual((await db.prepare("PRAGMA foreign_key_check").all()).results, []);
  await app.dispose();
  return { atomicConflictCases: cases.length, falseSuccessReceipts: 0, foreignKeyViolations: 0 };
}
