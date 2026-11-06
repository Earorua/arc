// @vitest-environment node
import { expect, it } from "vitest";
import type { ConfirmedMaterialItem, MaterialSelectionEntry } from "../../app/contracts/documents";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { planningEventInputSchema, type PlanningWorkspace } from "../../app/contracts/planning";
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
function expectLegacyProposalEvents(workspace: PlanningWorkspace) {
  for (const event of workspace.events) {
    if (event.kind !== "agent_replanned") continue;
    // The prior browser contract accepted exactly the input body plus these five server metadata fields.
    const body = Object.fromEntries(Object.entries(event).filter(([key]) =>
      !["eventId", "mutationId", "sequence", "targetPlanVersionId", "occurredAt"].includes(key)));
    expect(planningEventInputSchema.safeParse(body).success).toBe(true);
  }
}
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
    const forContext = (row: { contextVersionId: string; planVersionId: string }) => row.contextVersionId === contextVersionId && row.planVersionId === input.candidatePlanVersionId;
    const legacy = await f.http("readMaterialHistory", { goalId: workspace.goalId });
    expect(legacy.plans.filter(forContext)).toHaveLength(decision === "accept" ? 1 : 0);
    expect(legacy.plans.every(row => !Object.hasOwn(row, "proposalState"))).toBe(true);
    const detailed = await f.http("readMaterialHistory", { goalId: workspace.goalId, includeProposalState: "current" });
    expect(detailed.plans.filter(forContext)).toHaveLength(1);
    expect(detailed.plans.find(forContext)).toMatchObject(decision === "accept" ? { kind: "accepted" } : { kind: "proposal", proposalState: "discarded" });
    const after = await f.http("readAdoptedMaterials", adoptedScope(result.workspace));
    expect(after.entries).toHaveLength(3);
    expect(after.entries).toEqual(expect.arrayContaining([decision === "accept" ? companyB : initial.jd, initial.resume, initial.supplement]));
    expect(result.workspace.events.find(event => event.kind === "completed")).toEqual(workspace.events[0]);
    const completedUnit = (w: PlanningWorkspace) => w.pathVersions.find(path => path.id === w.activePathVersionId)!.units.find(unit => unit.id === unitId);
    expect(completedUnit(workspace)).toBeDefined();
    expect(completedUnit(result.workspace)).toEqual(completedUnit(workspace));
  } finally { await f.dispose(); }
});
it("re-proposes discarded B with distinct immutable decisions and keeps completed work and adopted links through acceptance", async () => {
  const f = await createMaterialAnalysisFixture();
  try {
    const initial = await initialPlan(f);
    let companyB = await confirm(f, "jd", "company-b", flagshipBlueprint.skills.at(-1)!.id);
    const unitId = initial.workspace.dailyUnits[0]!.id;
    const { workspace: completed } = await f.runtime.planning.appendEvent("owner-a", { mutationId: "complete-before-b", baseVersionId: initial.workspace.activePlanVersionId,
      event: { kind: "completed", unitId, actualMinutes: 60, planningDate: initial.input.planningDate } });
    const earlierPlans = new Set(completed.planVersions.map(plan => plan.id));
    const previous = await f.http("readAdoptedMaterials", adoptedScope(completed));
    const attempts: { id: string; context: string; state: string }[] = [];
    const immutablePlans: PlanningWorkspace["planVersions"] = [];
    let current = completed;
    for (const n of [1, 2, 3]) {
      if (n === 3) {
        const { draft } = await f.http("readDocumentReviewDraft", { documentId: companyB.documentId, textVersionId: companyB.textVersionId });
        const receipt = await f.http("createDocumentConfirmation", { documentId: companyB.documentId, documentVersionId: companyB.documentVersionId,
          textVersionId: companyB.textVersionId, items: draft!.items, reviewRevision: draft!.revision,
          expectedRevision: companyB.revision, mutationId: "confirm-same-b-again" });
        companyB = { ...companyB, ...receipt };
      }
      const scope = { kind: "goal" as const, ...adoptedScope(current), revision: current.revision };
      const selectionRef = await f.http("createMaterialSelection", { scope, entries: [companyB, initial.resume, initial.supplement].map(asSelection), mutationId: `select-b-${n}` });
      const { contextVersionId, previewToken } = await f.http("createMaterialContext", { ...initial.input, scope, selectionRef, mutationId: `preview-b-${n}` });
      const request = { scope, selectionRef, contextVersionId, previewToken, mutationId: `propose-b-${n}` };
      if (n === 2) {
        for (const mutationId of ["decide-b-1", "complete-before-b"]) {
          await expect(f.http("materialReplan", { ...request, mutationId })).rejects.toThrow("HTTP 409");
        }
        const { source, audit, availability, target, planningDate, selectedScope } = initial.input;
        await expect(f.http("generatePlanning", { source, audit, availability, target, planningDate, selectedScope, mutationId: "decide-b-1" })).rejects.toThrow("HTTP 409");
      }
      const proposal = await f.http("materialReplan", request);
      if (proposal.outcome !== "proposed") throw new Error("B should produce an actionable proposal");
      const pending = proposal.planning.result.workspace, candidate = pending.pendingPlanVersionId!;
      const detailed = await f.http("readMaterialHistory", { goalId: current.goalId, includeProposalState: "current" });
      expect(detailed.plans.find(row => row.contextVersionId === contextVersionId && row.planVersionId === candidate))
        .toMatchObject({ kind: "proposal", proposalState: "pending" });
      expectLegacyProposalEvents(pending);
      expectLegacyProposalEvents((await f.runtime.planning.getWorkspaceResponse("owner-a")).workspace!);
      expectLegacyProposalEvents((await f.runtime.planning.getSavedWorkspaceResponse("owner-a", pending.goalId)).workspace!);
      const persisted = f.db.database.prepare("SELECT e.payload_json,p.context_fingerprint FROM planning_events e JOIN material_plan_proposals p ON p.owner_id=e.user_id AND p.goal_id=e.goal_id AND p.proposal_revision=e.sequence WHERE e.user_id=? AND e.mutation_id=?").get("owner-a", request.mutationId)!;
      expect(JSON.parse(String(persisted.payload_json)).materialContextFingerprint).toBe(persisted.context_fingerprint);
      expect(attempts.map(a => a.id)).not.toContain(candidate);
      immutablePlans.push(pending.planVersions.find(plan => plan.id === candidate)!);
      expect(await f.freshRuntime().planning.proposeMaterialReplanResponse("owner-a", request)).toEqual(proposal);
      await expect(f.http("materialReplan", { ...request, mutationId: `racing-b-${n}` })).rejects.toThrow("HTTP 409");
      expect(await f.http("readAdoptedMaterials", adoptedScope(pending))).toEqual(previous);
      if (attempts.length) {
        await expect(f.runtime.planning.acceptReplan("owner-a", { mutationId: `stale-decision-${n}`,
          baseVersionId: pending.activePlanVersionId, candidatePlanVersionId: attempts[0]!.id })).rejects.toMatchObject({ code: "INVALID_INPUT" });
        const conflictingRetry = { mutationId: "decide-b-1", baseVersionId: pending.activePlanVersionId, candidatePlanVersionId: candidate };
        await expect(f.runtime.planning.discardReplan("owner-a", conflictingRetry)).rejects.toMatchObject({ code: "CONFLICT" });
        await expect(f.runtime.planning.acceptReplan("owner-a", conflictingRetry)).rejects.toMatchObject({ code: "CONFLICT" });
        const earlier = await f.runtime.planning.discardReplan("owner-a", { ...conflictingRetry, candidatePlanVersionId: attempts[0]!.id });
        expect(earlier.outcome).toBe("discarded");
        expect((await f.runtime.planning.getWorkspace("owner-a"))?.pendingPlanVersionId).toBe(candidate);
      }
      const decision = { mutationId: `decide-b-${n}`, candidatePlanVersionId: candidate, baseVersionId: pending.activePlanVersionId };
      const decided = n === 3 ? await f.runtime.planning.acceptReplan("owner-a", decision) : await f.runtime.planning.discardReplan("owner-a", decision);
      current = decided.workspace;
      expectLegacyProposalEvents(current);
      attempts.push({ id: candidate, context: contextVersionId, state: n === 3 ? "accepted" : "discarded" });
      await expect(f.http("materialReplan", { ...request, mutationId: `stale-preview-${n}` })).rejects.toThrow("HTTP 409");
      expect(current.pendingPlanVersionId).toBeNull();
      expect(current.events.filter(event => event.kind === "completed")).toEqual(completed.events);
      expect(current.dailyUnits.filter(unit => earlierPlans.has(unit.planVersionId))).toEqual(completed.dailyUnits);
    }
    expect((await f.http("readAdoptedMaterials", adoptedScope(current))).entries).toEqual(expect.arrayContaining([companyB, initial.resume, initial.supplement]));
    expect(f.db.database.prepare("SELECT candidate_plan_version_id AS id,context_version_id AS context,state FROM material_plan_proposals ORDER BY proposal_revision").all()).toEqual(attempts);
    expect(f.db.database.prepare("SELECT count(*) AS n FROM document_mutations WHERE endpoint='POST /api/planning/material-replans'").get()).toEqual({ n: 3 });
    expect(current.planVersions.filter(plan => attempts.some(attempt => attempt.id === plan.id))).toEqual(immutablePlans);
    expect(current.events.filter(event => event.kind === "agent_replanned")).toHaveLength(3);
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
