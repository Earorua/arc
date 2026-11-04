// @vitest-environment node
import { expect, it } from "vitest";
import type { ConfirmedMaterialItem, MaterialSelectionEntry } from "../../app/contracts/documents";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import type { PlanningWorkspace } from "../../app/contracts/planning";
import { createMaterialAnalysisFixture } from "../helpers/material-analysis-e2e";
import { materialContextRequest } from "../helpers/material-planning";

type Fixture = Awaited<ReturnType<typeof createMaterialAnalysisFixture>>;
async function confirm(f: Fixture, slot: MaterialSelectionEntry["slot"], id: string, skill = "TypeScript") {
  const doc = await f.http("createDocument", { kind: slot, displayName: `PRIVATE-${id}`, text: "PRIVATE-source-text", mutationId: `save-${id}` });
  const item: ConfirmedMaterialItem = { id, kind: slot === "jd" ? "requirement" : "experience", text: skill, origin: "user", sourceRef: null, requirementLevel: slot === "jd" ? "must" : null };
  const { draft } = await f.http("saveDocumentReviewDraft", { documentId: doc.documentId, textVersionId: doc.textVersionId, extractionId: null, items: [item], selfAssessmentHints: [], expectedRevision: 0, mutationId: `draft-${id}` });
  const { confirmationId, revision } = await f.http("createDocumentConfirmation", { expectedRevision: doc.revision, reviewRevision: draft.revision, items: draft.items, mutationId: `confirm-${id}`,
    documentId: doc.documentId, documentVersionId: doc.documentVersionId, textVersionId: doc.textVersionId });
  return { ...doc, slot, revision, confirmationId };
}
const asSelection = ({ slot, documentId, documentVersionId, confirmationId }: MaterialSelectionEntry) => ({ slot, documentId, documentVersionId, confirmationId });
const adoptedScope = (workspace: PlanningWorkspace) => ({ goalId: workspace.goalId, workspaceId: workspace.id, baseVersionId: workspace.activePlanVersionId });
async function initialPlan(f: Fixture) {
  const jd = await confirm(f, "jd", "company-a"), resume = await confirm(f, "resume", "resume"), supplement = await confirm(f, "supplement", "notes");
  const { scope, source, availability, audit, target, planningDate, selectedScope } = materialContextRequest();
  const input = { source, availability, audit, target, planningDate, selectedScope };
  const selectionRef = await f.http("createMaterialSelection", { scope, entries: [jd, resume, supplement].map(asSelection), mutationId: "select-initial" });
  const { contextVersionId, previewToken } = await f.http("createMaterialContext", { ...input, scope, selectionRef, mutationId: "preview-initial" });
  const { result: { workspace } } = await f.http("generatePlanning", { ...input, materials: { selectionRef, contextVersionId, previewToken }, mutationId: "generate-initial" });
  return { workspace, input, jd, resume, supplement };
}
it("reads only the active goal's adopted confirmations, pins old versions, rejects a wrong owner/plan and retains other links after deletion", async () => {
  const f = await createMaterialAnalysisFixture();
  try {
    const { workspace, jd, resume, supplement } = await initialPlan(f);
    await confirm(f, "jd", "company-b");
    const request = adoptedScope(workspace);
    const response = await f.http("readAdoptedMaterials", request);
    expect(response.entries).toHaveLength(3);
    expect(response.entries).toEqual(expect.arrayContaining([jd, resume, supplement]));
    expect(JSON.stringify(response)).not.toContain("PRIVATE");
    await expect(f.http("readAdoptedMaterials", request, "owner-b")).rejects.toThrow("HTTP 404");
    await expect(f.http("readAdoptedMaterials", { ...request, baseVersionId: "plan-stale" })).rejects.toThrow("HTTP 404");
    await expect(f.http("readAdoptedMaterials", { ...request, goalId: "goal-wrong" })).rejects.toThrow("HTTP 404");
    await expect(f.http("readAdoptedMaterials", { ...request, workspaceId: "workspace-wrong" })).rejects.toThrow("HTTP 404");
    const newVersion = await f.http("createDocumentVersion", { documentId: resume.documentId, expectedRevision: resume.revision, text: "PRIVATE-new-resume", mutationId: "new-resume" });
    expect((await f.http("readAdoptedMaterials", request)).entries).toContainEqual({ ...resume, revision: newVersion.revision });
    await f.http("deleteDocument", { documentId: jd.documentId, expectedRevision: jd.revision, mutationId: "delete-adopted-jd" });
    expect((await f.http("readAdoptedMaterials", request)).entries).toEqual(expect.arrayContaining([{ ...resume, revision: newVersion.revision }, supplement]));
    expect((await f.http("readAdoptedMaterials", request)).entries).toHaveLength(2);
    f.db.database.prepare("UPDATE document_confirmations SET state='revoked' WHERE owner_id=? AND id=?").run("owner-a", supplement.confirmationId);
    await expect(f.http("readAdoptedMaterials", request)).rejects.toThrow("HTTP 410");
  } finally { await f.dispose(); }
});
it.each(["accept", "discard"] as const)("keeps A adopted while B is pending and atomically reflects %s while preserving completed work", async decision => {
  const f = await createMaterialAnalysisFixture();
  try {
    const initial = await initialPlan(f);
    const companyB = await confirm(f, "jd", "company-b", flagshipBlueprint.skills.at(-1)!.id);
    const unitId = initial.workspace.dailyUnits[0]!.id;
    const { workspace } = await f.runtime.planning.appendEvent("owner-a", { mutationId: "complete-before-b", baseVersionId: initial.workspace.activePlanVersionId,
      event: { kind: "completed", unitId, actualMinutes: 60, planningDate: initial.input.planningDate } });
    const adopted = await f.http("readAdoptedMaterials", adoptedScope(workspace));
    const entries = adopted.entries.map(entry => asSelection(entry.slot === "jd" ? companyB : entry));
    const scope = { kind: "goal" as const, ...adoptedScope(workspace), revision: workspace.revision };
    const selectionRef = await f.http("createMaterialSelection", { scope, entries, mutationId: "select-company-b" });
    const { contextVersionId, previewToken } = await f.http("createMaterialContext", { ...initial.input, scope, selectionRef, mutationId: "preview-company-b" });
    const proposal = await f.http("materialReplan", { scope, selectionRef, contextVersionId, previewToken, mutationId: "propose-company-b" });
    if (proposal.outcome !== "proposed") throw new Error("Company B should prioritize a different unfinished skill");
    const pending = proposal.planning.result.workspace;
    expect(await f.http("readAdoptedMaterials", adoptedScope(pending))).toEqual(adopted);
    const input = { mutationId: "decide-company-b", candidatePlanVersionId: pending.pendingPlanVersionId!, baseVersionId: pending.activePlanVersionId };
    const result = decision === "accept" ? await f.runtime.planning.acceptReplan("owner-a", input) : await f.runtime.planning.discardReplan("owner-a", input);
    const after = await f.http("readAdoptedMaterials", adoptedScope(result.workspace));
    expect(after.entries).toHaveLength(3);
    expect(after.entries).toEqual(expect.arrayContaining([decision === "accept" ? companyB : initial.jd, initial.resume, initial.supplement]));
    expect(result.workspace.events.find(event => event.kind === "completed")).toEqual(workspace.events[0]);
    const completedUnit = (w: PlanningWorkspace) => w.pathVersions.find(path => path.id === w.activePathVersionId)!.units.find(unit => unit.id === unitId);
    expect(completedUnit(workspace)).toBeDefined();
    expect(completedUnit(result.workspace)).toEqual(completedUnit(workspace));
  } finally { await f.dispose(); }
});
it("returns an empty selection for an active plan that adopted no material", async () => {
  const f = await createMaterialAnalysisFixture();
  try {
    const { source, availability, audit, target, planningDate, selectedScope } = materialContextRequest();
    const { result: { workspace } } = await f.http("generatePlanning", { source, availability, audit, target, planningDate, selectedScope, mutationId: "generate-plain" });
    await expect(f.http("readAdoptedMaterials", { goalId: workspace.goalId, workspaceId: workspace.id, baseVersionId: workspace.activePlanVersionId })).resolves.toEqual({ entries: [] });
  } finally { await f.dispose(); }
});
it("does not expose live-looking links if their context was only proposed for the workspace", async () => {
  const f = await createMaterialAnalysisFixture();
  try {
    const { workspace } = await initialPlan(f);
    f.db.database.prepare("UPDATE document_usage_links SET kind='proposal' WHERE owner_id=? AND workspace_id=? AND kind='generation'").run("owner-a", workspace.id);
    await expect(f.http("readAdoptedMaterials", adoptedScope(workspace))).rejects.toThrow("HTTP 410");
  } finally { await f.dispose(); }
});
