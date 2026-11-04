// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { createMaterialsD1 } from "../helpers/materials-d1";
import { materialContextRequest, materialNow, materialSourceResolver, seedMaterialSelection } from "../helpers/material-planning";
import { MaterialContextService } from "../../app/server/documents/context-builder";
import { PlanningService } from "../../app/server/planning/service";
import { D1PlanningRepository } from "../../app/server/planning/d1-planning-repository";
import { SelectionService } from "../../app/server/documents/selection-service";
import { D1DocumentRepository } from "../../app/server/documents/d1-repository";
const databases: ReturnType<typeof createMaterialsD1>[] = [];
afterEach(() => databases.splice(0).forEach(db => db.close()));
async function setup(noPriorities = false, withCompletion = false) {
  const db = createMaterialsD1(); databases.push(db); seedMaterialSelection(db);
  let id = 0; const sourceResolver = materialSourceResolver();
  const repository = new D1PlanningRepository(db as unknown as D1Database, { sourceResolver, now: materialNow, createId: () => `stored-${++id}` });
  const materials = new MaterialContextService({ db: db as unknown as D1Database, sourceResolver, planningRepository: repository, now: materialNow, createId: () => `context-${++id}` });
  const service = new PlanningService({ repository, materials, sourceResolver, now: materialNow, createId: () => `event-${++id}` });
  const request = materialContextRequest(); const { scope: draftScope, selectionRef, ...generation } = request; void draftScope;
  let initial = await service.generate("owner-a", generation);
  if (withCompletion) initial = await service.appendEvent("owner-a", { mutationId: "complete-before-material", baseVersionId: initial.workspace.activePlanVersionId, event: { kind: "completed", unitId: initial.workspace.dailyUnits[0]!.id, actualMinutes: 60, planningDate: request.planningDate } });
  const scope = { kind: "goal" as const, goalId: "goal-a", workspaceId: initial.workspace.id, baseVersionId: initial.workspace.activePlanVersionId, revision: initial.workspace.revision };
  db.database.prepare("UPDATE material_selections SET scope_json=?").run(JSON.stringify(scope));
  if (noPriorities) db.database.exec("UPDATE document_confirmations SET items_json=json_set(items_json,'$[0].requirementLevel','unspecified')");
  const preview = await materials.create("owner-a", { ...request, scope, mutationId: "replan-context" });
  const input = { scope, selectionRef, contextVersionId: preview.contextVersionId, previewToken: preview.previewToken, mutationId: "material-proposal" };
  return { db, service, materials, initial, input, request };
}
describe("material proposal transactions", () => {
  it("keeps ordinary replan acceptance available when material planning is closed", async () => {
    const { db, initial } = await setup();
    const service = new PlanningService({ repository: new D1PlanningRepository(db as unknown as D1Database, {
      sourceResolver: materialSourceResolver(), now: materialNow, allowMaterialAcceptance: false,
    }), sourceResolver: materialSourceResolver(), now: materialNow });
    const workspace = initial.workspace;
    const proposed = await service.appendAgentEventResponse("owner-a", { mutationId: "ordinary-proposal", baseVersionId: workspace.activePlanVersionId,
      event: { kind: "agent_replanned", baseRevision: workspace.revision, planningDate: "2026-11-04",
        unitOrder: workspace.pathVersions.find(path => path.id === workspace.activePathVersionId)!.units.map(unit => unit.id) } },
      { goalId: workspace.goalId, workspaceId: workspace.id, revision: workspace.revision });
    expect((await service.acceptReplan("owner-a", { mutationId: "ordinary-accept", baseVersionId: workspace.activePlanVersionId,
      candidatePlanVersionId: proposed.result.workspace.pendingPlanVersionId! })).outcome).toBe("accepted");
  });
  it("blocks new material accepts when planning is closed but retains discard and successful receipt recovery", async () => {
    const { db, service, input } = await setup();
    const proposed = await service.proposeMaterialReplanResponse("owner-a", input);
    if (proposed.outcome !== "proposed") throw new Error("expected proposal");
    const workspace = proposed.planning.result.workspace;
    const closed = new PlanningService({ repository: new D1PlanningRepository(db as unknown as D1Database, {
      sourceResolver: materialSourceResolver(), now: materialNow, allowMaterialAcceptance: false,
    }), sourceResolver: materialSourceResolver(), now: materialNow });
    const decision = { mutationId: "closed-accept", baseVersionId: workspace.activePlanVersionId, candidatePlanVersionId: workspace.pendingPlanVersionId! };
    await expect(closed.acceptReplan("owner-a", decision)).rejects.toMatchObject({ code: "PLANNING_UNAVAILABLE" });
    expect(db.database.prepare("SELECT state FROM material_plan_proposals").get()).toMatchObject({ state: "pending" });
    const accepted = await service.acceptReplan("owner-a", decision);
    expect(await closed.acceptReplan("owner-a", decision)).toEqual(accepted);
    const next = await setup();
    const pending = await next.service.proposeMaterialReplanResponse("owner-a", next.input);
    if (pending.outcome !== "proposed") throw new Error("expected proposal");
    const closedNext = new PlanningService({ repository: new D1PlanningRepository(next.db as unknown as D1Database, {
      sourceResolver: materialSourceResolver(), now: materialNow, allowMaterialAcceptance: false,
    }), sourceResolver: materialSourceResolver(), now: materialNow });
    const nextWorkspace = pending.planning.result.workspace;
    expect((await closedNext.discardReplan("owner-a", { mutationId: "closed-discard", baseVersionId: nextWorkspace.activePlanVersionId,
      candidatePlanVersionId: nextWorkspace.pendingPlanVersionId! })).outcome).toBe("discarded");
  });
  it("revokes old pending proposals when the same goal selects a new material set", async () => {
    const { db, service, input } = await setup();
    const proposed = await service.proposeMaterialReplanResponse("owner-a", input);
    if (proposed.outcome !== "proposed") throw new Error("expected proposal");
    const workspace = proposed.planning.result.workspace;
    const selections = new SelectionService(new D1DocumentRepository(db as unknown as D1Database, materialNow));
    await selections.createMaterialSelection({ ownerId: "owner-a" }, {
      scope: { ...input.scope, revision: workspace.revision }, entries: [], mutationId: "select-no-materials",
    });
    expect(db.database.prepare("SELECT state FROM material_plan_proposals").get()).toMatchObject({ state: "revoked" });
    const decision = { mutationId: "accept-old-materials", baseVersionId: workspace.activePlanVersionId, candidatePlanVersionId: workspace.pendingPlanVersionId! };
    await expect(service.acceptReplan("owner-a", decision)).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await service.discardReplan("owner-a", { ...decision, mutationId: "discard-old-materials" })).outcome).toBe("discarded");
  });
  it("keeps the exact unfinished set and guards the legacy accept path with proposalRevision", async () => {
    const { db, service, initial, input } = await setup();
    const proposed = await service.proposeMaterialReplanResponse("owner-a", input);
    expect(proposed.outcome).toBe("proposed"); if (proposed.outcome !== "proposed") return;
    const workspace = proposed.planning.result.workspace;
    expect(workspace.activePlanVersionId).toBe(initial.workspace.activePlanVersionId);
    expect(workspace.revision).toBe(1);
    const originalPath = initial.workspace.pathVersions.find(path => path.id === initial.workspace.activePathVersionId)!;
    const candidatePlan = workspace.planVersions.find(plan => plan.id === workspace.pendingPlanVersionId)!;
    const candidatePath = workspace.pathVersions.find(path => path.id === candidatePlan.pathVersionId)!;
    expect(candidatePath.units.map(unit => unit.id).sort()).toEqual(originalPath.units.map(unit => unit.id).sort());
    expect(db.database.prepare("SELECT input_revision,proposal_revision,state FROM material_plan_proposals").get()).toMatchObject({ input_revision: 0, proposal_revision: 1, state: "pending" });
    const candidate = workspace.pendingPlanVersionId!;
    const accepted = await service.acceptReplan("owner-a", { mutationId: "accept-material", baseVersionId: workspace.activePlanVersionId, candidatePlanVersionId: candidate });
    expect(accepted.workspace.activePlanVersionId).toBe(candidate);
    expect(db.database.prepare("SELECT state FROM material_plan_proposals").get()).toMatchObject({ state: "accepted" });
  });
  it("deletion invalidates legacy accept while allowing discard and history redaction", async () => {
    const { db, service, materials, input } = await setup();
    const proposed = await service.proposeMaterialReplanResponse("owner-a", input);
    expect(proposed.outcome).toBe("proposed"); if (proposed.outcome !== "proposed") return;
    const workspace = proposed.planning.result.workspace;
    db.database.exec("UPDATE documents SET lifecycle='revoked',generation=1; UPDATE material_context_versions SET state='revoked',snapshot_json='{}',preview_json='{}'; UPDATE material_plan_proposals SET state='revoked'");
    const decision = { mutationId: "accept-revoked", baseVersionId: workspace.activePlanVersionId, candidatePlanVersionId: workspace.pendingPlanVersionId! };
    await expect(service.acceptReplan("owner-a", decision)).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await service.discardReplan("owner-a", { ...decision, mutationId: "discard-revoked" })).outcome).toBe("discarded");
    const history = await materials.history("owner-a", "goal-a");
    expect(history.plans[0]?.explanations[0]?.message).toBe("依据已删除");
    expect(JSON.stringify(history)).not.toContain("PRIVATE-MATERIAL-SENTINEL");
    expect(db.database.prepare("SELECT id FROM career_goals WHERE active_slot=1").get()).toMatchObject({ id: "goal-a" });
    await expect(materials.history("owner-b", "goal-a")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("rejects a concurrent same-key proposal with a different material request digest", async () => {
    const { service, materials, request, input } = await setup();
    const other = await materials.create("owner-a", { ...request, scope: input.scope, mutationId: "other-context" });
    const results = await Promise.allSettled([
      service.proposeMaterialReplanResponse("owner-a", input),
      service.proposeMaterialReplanResponse("owner-a", { ...input, contextVersionId: other.contextVersionId, previewToken: other.previewToken }),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
  });
  it("preserves completed records and the exact remaining task set through accept", async () => {
    const { service, initial, input } = await setup(false, true);
    const proposed = await service.proposeMaterialReplanResponse("owner-a", input);
    if (proposed.outcome !== "proposed") throw new Error("expected proposal");
    const workspace = proposed.planning.result.workspace;
    const accepted = await service.acceptReplan("owner-a", { mutationId: "accept-with-progress", baseVersionId: workspace.activePlanVersionId, candidatePlanVersionId: workspace.pendingPlanVersionId! });
    const before = initial.workspace.pathVersions.find(path => path.id === initial.workspace.activePathVersionId)!;
    const after = accepted.workspace.pathVersions.find(path => path.id === accepted.workspace.activePathVersionId)!;
    expect(accepted.workspace.events[0]).toEqual(initial.workspace.events[0]);
    expect(after.units.map(unit => unit.id).sort()).toEqual(before.units.map(unit => unit.id).sort());
    const completedId = initial.workspace.events[0]!.kind === "completed" ? initial.workspace.events[0]!.unitId : "missing";
    expect(after.units.findIndex(unit => unit.id === completedId)).toBe(before.units.findIndex(unit => unit.id === completedId));
  });
  it("returns no-change without adding a pending plan or planning event", async () => {
    const { db, service, input } = await setup(true);
    expect(await service.proposeMaterialReplanResponse("owner-a", input)).toMatchObject({ outcome: "no-change" });
    expect(db.database.prepare("SELECT revision,pending_plan_version_id FROM planning_workspaces").get()).toMatchObject({ revision: 0, pending_plan_version_id: null });
    expect(db.database.prepare("SELECT count(*) AS n FROM planning_events").get()).toMatchObject({ n: 0 });
    const receipt = db.database.prepare("SELECT result_json FROM document_mutations WHERE endpoint='POST /api/planning/material-replans'").get() as { result_json: string } | undefined;
    expect(receipt).toBeTruthy();
    expect(JSON.parse(receipt!.result_json)).toMatchObject({ outcome: "no-change", contextVersionId: input.contextVersionId });
  });
  it("rechecks deletion after legacy accept validation and rolls back every acceptance write", async () => {
    const { db, service, input } = await setup();
    const proposed = await service.proposeMaterialReplanResponse("owner-a", input);
    if (proposed.outcome !== "proposed") throw new Error("expected proposal");
    const workspace = proposed.planning.result.workspace;
    const batch = db.batch.bind(db);
    db.batch = async statements => { db.database.exec("UPDATE documents SET lifecycle='revoked',generation=1"); return batch(statements); };
    await expect(service.acceptReplan("owner-a", { mutationId: "raced-accept", baseVersionId: workspace.activePlanVersionId, candidatePlanVersionId: workspace.pendingPlanVersionId! })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.database.prepare("SELECT revision,active_plan_version_id FROM planning_workspaces").get()).toMatchObject({ revision: 1, active_plan_version_id: workspace.activePlanVersionId });
    expect(db.database.prepare("SELECT state FROM material_plan_proposals").get()).toMatchObject({ state: "pending" });
    expect(db.database.prepare("SELECT count(*) AS n FROM document_usage_links WHERE kind='accepted'").get()).toMatchObject({ n: 0 });
  });
  it("rolls back a proposal sidecar failure with the planning event", async () => {
    const { db, service, input } = await setup();
    db.database.exec("CREATE TRIGGER fail_material_proposal BEFORE INSERT ON material_plan_proposals BEGIN SELECT RAISE(ABORT,'injected'); END");
    await expect(service.proposeMaterialReplanResponse("owner-a", input)).rejects.toBeTruthy();
    expect(db.database.prepare("SELECT revision,pending_plan_version_id FROM planning_workspaces").get()).toMatchObject({ revision: 0, pending_plan_version_id: null });
    expect(db.database.prepare("SELECT count(*) AS n FROM planning_events").get()).toMatchObject({ n: 0 });
    expect(db.database.prepare("SELECT count(*) AS n FROM document_usage_links").get()).toMatchObject({ n: 0 });
  });
});
