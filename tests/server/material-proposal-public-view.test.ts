// @vitest-environment node
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { PlanDiffReview } from "../../app/components/workspace/plan-diff-review";
import { materialReplanResponseSchema } from "../../app/contracts/material-planning";
import { planningWorkspaceSchema, type PlanningWorkspace } from "../../app/contracts/planning";
import { planningMutationResponseSchema, planningWorkspaceResponseSchema } from "../../app/contracts/planning-api";
import { MaterialContextService } from "../../app/server/documents/context-builder";
import { D1PlanningRepository } from "../../app/server/planning/d1-planning-repository";
import { PlanningService } from "../../app/server/planning/service";
import { createMaterialsD1 } from "../helpers/materials-d1";
import { materialContextRequest, materialNow, materialSourceResolver, seedMaterialSelection } from "../helpers/material-planning";

const databases: ReturnType<typeof createMaterialsD1>[] = [];
afterEach(() => { databases.splice(0).forEach(db => db.close()); vi.restoreAllMocks(); });
const contextOnlyExplanation = "任务和日程保持不变。接受后将更新当前路线采用的资料与学习重点。";

async function setup() {
  const db = createMaterialsD1(); databases.push(db); seedMaterialSelection(db);
  let id = 0;
  const createId = () => `public-material-${++id}`;
  const sourceResolver = materialSourceResolver();
  const repository = new D1PlanningRepository(db as unknown as D1Database, { sourceResolver, now: materialNow, createId });
  const materials = new MaterialContextService({ db: db as unknown as D1Database, sourceResolver, planningRepository: repository, now: materialNow, createId });
  const planning = new PlanningService({ repository, materials, sourceResolver, now: materialNow, createId });
  const request = materialContextRequest();
  const { scope: draftScope, selectionRef, ...generation } = request;
  void draftScope;
  const initial = planningMutationResponseSchema.parse(await planning.generateResponse("owner-a", generation)).result.workspace;
  const scope = { kind: "goal" as const, goalId: initial.goalId, workspaceId: initial.id,
    baseVersionId: initial.activePlanVersionId, revision: initial.revision };
  const active = initial.planVersions.find(plan => plan.id === initial.activePlanVersionId)!;
  const activePath = initial.pathVersions.find(path => path.id === active.pathVersionId)!;
  const ordinaryInput = { mutationId: "public-ordinary-proposal", baseVersionId: initial.activePlanVersionId,
    event: { kind: "agent_replanned", baseRevision: initial.revision, unitOrder: activePath.units.map(unit => unit.id), planningDate: active.planningDate } };
  const storedEvent = () => {
    const row = db.database.prepare("SELECT payload_json FROM planning_events WHERE user_id='owner-a' AND goal_id='goal-a' ORDER BY sequence DESC LIMIT 1").get() as { payload_json: string };
    return JSON.parse(row.payload_json) as Record<string, unknown>;
  };
  return { db, repository, materials, planning, request, selectionRef, initial, scope, ordinaryInput, storedEvent };
}

function expectSameTasks(workspace: PlanningWorkspace) {
  const active = workspace.planVersions.find(plan => plan.id === workspace.activePlanVersionId)!;
  const candidate = workspace.planVersions.find(plan => plan.id === workspace.pendingPlanVersionId)!;
  const activePath = workspace.pathVersions.find(path => path.id === active.pathVersionId)!;
  const candidatePath = workspace.pathVersions.find(path => path.id === candidate.pathVersionId)!;
  expect(candidate.replanReason).toBe("agent_replanned");
  expect(candidatePath.units).toEqual(activePath.units);
  expect(candidate.days).toEqual(active.days);
  expect(candidate.planningDate).toBe(active.planningDate);
  expect(candidate.estimatedCompletionDate).toBe(active.estimatedCompletionDate);
}

it("renders explicit material adoption from the actual proposal, same-request replay and workspace reload", async () => {
  const f = await setup();
  f.db.database.prepare("UPDATE material_selections SET scope_json=?").run(JSON.stringify(f.scope));
  f.db.database.exec("UPDATE document_confirmations SET items_json=json_set(items_json,'$[0].requirementLevel','unspecified')");
  const preview = await f.materials.create("owner-a", { ...f.request, scope: f.scope, mutationId: "public-material-context" });
  const input = { scope: f.scope, selectionRef: f.selectionRef, contextVersionId: preview.contextVersionId,
    previewToken: preview.previewToken, mutationId: "public-material-proposal" };
  const proposed = materialReplanResponseSchema.parse(JSON.parse(JSON.stringify(await f.planning.proposeMaterialReplanResponse("owner-a", input))));
  const replay = materialReplanResponseSchema.parse(JSON.parse(JSON.stringify(await f.planning.proposeMaterialReplanResponse("owner-a", input))));
  const reload = planningWorkspaceResponseSchema.parse(JSON.parse(JSON.stringify(await f.planning.getWorkspaceResponse("owner-a"))));
  if (proposed.outcome !== "proposed" || replay.outcome !== "proposed" || !reload.workspace) throw new Error("Expected a pending first-adoption proposal on every public surface");
  expect(replay).toEqual(proposed);
  expect(reload.workspace).toEqual(proposed.planning.result.workspace);
  const stored = f.storedEvent();
  expect(stored.materialContextFingerprint).toMatch(/^[0-9a-f]{64}$/u);
  expect(stored).not.toHaveProperty("materialProposal");
  const onAccept = vi.fn(async () => true); const onDiscard = vi.fn(async () => true);
  for (const [surface, response, workspace] of [
    ["proposal", proposed, proposed.planning.result.workspace],
    ["same-request replay", replay, replay.planning.result.workspace],
    ["workspace reload", reload, reload.workspace],
  ] as const) {
    expectSameTasks(workspace);
    expect(workspace.activePlanVersionId).toBe(f.initial.activePlanVersionId);
    expect(workspace.pendingPlanVersionId).not.toBeNull();
    expect.soft(workspace.events.at(-1), surface).toHaveProperty("materialProposal", true);
    const json = JSON.stringify(response);
    expect(json).not.toContain("materialContextFingerprint");
    expect(json).not.toContain(stored.materialContextFingerprint);
    expect(json).not.toContain("PRIVATE-MATERIAL-SENTINEL");
    const html = renderToStaticMarkup(createElement(PlanDiffReview, { workspace, onAccept, onDiscard }));
    expect.soft(html, surface).toContain(contextOnlyExplanation);
    expect.soft(html, surface).toContain("接受资料更新");
    expect.soft(html, surface).toContain("保留当前资料与安排");
    expect.soft(html, surface).not.toContain("接受新安排");
  }
  expect(onAccept).not.toHaveBeenCalled(); expect(onDiscard).not.toHaveBeenCalled();
  expect(f.storedEvent()).toEqual(stored);
  expect(f.db.database.prepare("SELECT count(*) AS n FROM planning_events").get()).toEqual({ n: 1 });
});

it("keeps an actual ordinary no-change agent proposal generic across response, replay and reload", async () => {
  const f = await setup();
  const proposed = planningMutationResponseSchema.parse(await f.planning.appendAgentEventResponse("owner-a", f.ordinaryInput, f.scope));
  const replay = planningMutationResponseSchema.parse(await f.planning.appendAgentEventResponse("owner-a", f.ordinaryInput, f.scope));
  const reload = planningWorkspaceResponseSchema.parse(await f.planning.getWorkspaceResponse("owner-a"));
  expect(proposed.result.outcome).toBe("proposed");
  expect(replay).toEqual(proposed);
  expect(reload.workspace).toEqual(proposed.result.workspace);
  const onAccept = vi.fn(async () => true); const onDiscard = vi.fn(async () => true);
  for (const workspace of [proposed.result.workspace, replay.result.workspace, reload.workspace!]) {
    expectSameTasks(workspace);
    expect(workspace.events.at(-1)).not.toHaveProperty("materialProposal");
    expect(workspace.events.at(-1)).not.toHaveProperty("materialContextFingerprint");
    const html = renderToStaticMarkup(createElement(PlanDiffReview, { workspace, onAccept, onDiscard }));
    expect(html).not.toContain(contextOnlyExplanation);
    expect(html).toContain("接受新安排");
    expect(html).toContain("保留当前安排");
  }
  expect(f.storedEvent()).not.toHaveProperty("materialProposal");
  expect(f.storedEvent()).not.toHaveProperty("materialContextFingerprint");
  expect(onAccept).not.toHaveBeenCalled(); expect(onDiscard).not.toHaveBeenCalled();
});

it("removes a preexisting display indicator when repository evidence does not identify a material proposal", async () => {
  const f = await setup();
  await f.planning.appendAgentEventResponse("owner-a", f.ordinaryInput, f.scope);
  const stored = await f.repository.load({ ownerId: "owner-a", goalId: f.scope.goalId });
  if (!stored) throw new Error("Expected the saved ordinary proposal");
  const workspace = planningWorkspaceSchema.parse(stored.payload);
  // Alter only the repository read boundary, leaving its real replay lineage and stored event intact.
  vi.spyOn(f.repository, "load").mockResolvedValue({ ...stored, payload: { ...workspace,
    events: workspace.events.map(event => ({ ...event, materialProposal: true })) } });
  const reload = planningWorkspaceResponseSchema.parse(await f.planning.getWorkspaceResponse("owner-a"));
  expect(reload.workspace).toEqual(workspace);
  expect(reload.workspace!.events.at(-1)).not.toHaveProperty("materialProposal");
  expect(f.storedEvent()).not.toHaveProperty("materialProposal");
});
