// @vitest-environment node
import { expect, it } from "vitest";
import type { ConfirmedMaterialItem, DocumentCandidate, MaterialSelectionEntry } from "../../app/contracts/documents";
import type { PlanningWorkspace } from "../../app/contracts/planning";
import { learningContext, promptContext } from "../../app/server/agents/context";
import { createMaterialAnalysisFixture } from "../helpers/material-analysis-e2e";
import { materialContextRequest } from "../helpers/material-planning";

type Fixture = Awaited<ReturnType<typeof createMaterialAnalysisFixture>>;
async function confirmedPrimary(f: Fixture, slot: "jd" | "resume", items: ConfirmedMaterialItem[]): Promise<MaterialSelectionEntry> {
  const doc = await f.http("createDocument", { kind: slot, displayName: slot, text: items.map(item => item.text).join("\n"), mutationId: `save-${slot}` });
  const { draft } = await f.http("saveDocumentReviewDraft", { documentId: doc.documentId, textVersionId: doc.textVersionId, extractionId: null, items, selfAssessmentHints: [], expectedRevision: 0, mutationId: `review-${slot}` });
  const { confirmationId } = await f.http("createDocumentConfirmation", { documentId: doc.documentId, documentVersionId: doc.documentVersionId, textVersionId: doc.textVersionId,
    expectedRevision: doc.revision, reviewRevision: draft.revision, items: draft.items, mutationId: `confirm-${slot}` });
  return { slot, documentId: doc.documentId, documentVersionId: doc.documentVersionId, confirmationId };
}

const activeUnits = (workspace: PlanningWorkspace) => workspace.pathVersions.find(path => path.id === workspace.activePathVersionId)!.units;

it("uses a reviewed supplement to reorder existing practice while preserving primary JD precedence, progress, audit and privacy", async () => {
  const privateText = "PRIVATE-SUPPLEMENT-SENTINEL-5c92";
  const practiceQuote = `Guided observability exercise ${privateText}.`;
  const candidates: DocumentCandidate[] = [
    { id: "project-practice", kind: "experience", text: "Guided observability exercise", skillLabels: ["observability"], selfLevelHint: "guided",
      requirementLevel: null, source: { segmentId: "segment-1", quote: practiceQuote } },
    { id: "typescript-optional", kind: "requirement", text: "TypeScript optional", skillLabels: ["typescript"], selfLevelHint: null,
      requirementLevel: "preferred", source: { segmentId: "segment-1", quote: "TypeScript optional here." } },
    { id: "sql-must", kind: "requirement", text: "SQL mandatory", skillLabels: ["sql"], selfLevelHint: null,
      requirementLevel: "must", source: { segmentId: "segment-1", quote: "SQL mandatory here." } },
  ];
  const f = await createMaterialAnalysisFixture({ candidates });
  try {
    const jd = await confirmedPrimary(f, "jd", [
      { id: "jd-must", kind: "requirement", text: "TypeScript", requirementLevel: "must", sourceRef: null, origin: "user" },
      { id: "jd-preferred", kind: "requirement", text: "SQL", requirementLevel: "preferred", sourceRef: null, origin: "user" },
    ]);
    const resume = await confirmedPrimary(f, "resume", [
      { id: "resume-practice", kind: "experience", text: "Web Platform", requirementLevel: null, sourceRef: null, origin: "user" },
    ]);
    const { scope: draftScope, source, audit, availability, target, planningDate, selectedScope } = materialContextRequest();
    const planningInputs = { source, audit, availability, target, planningDate, selectedScope };
    const selection = await f.http("createMaterialSelection", { scope: draftScope, entries: [jd, resume], mutationId: "primary-selection" });
    const initialContext = await f.http("createMaterialContext", { ...planningInputs, scope: draftScope, selectionRef: selection, mutationId: "primary-context" });
    expect(initialContext.preview.overlay?.skillRanks.observability).toBe(5);
    const initial = await f.http("generatePlanning", { ...planningInputs, materials: { contextVersionId: initialContext.contextVersionId, previewToken: initialContext.previewToken, selectionRef: selection }, mutationId: "primary-plan" });
    const initialWorkspace = initial.result.workspace;
    const completed = await f.runtime.planning.appendEvent("owner-a", { mutationId: "complete-work", baseVersionId: initialWorkspace.activePlanVersionId,
      event: { kind: "completed", unitId: initialWorkspace.dailyUnits[0]!.id, actualMinutes: 60, planningDate: planningInputs.planningDate } });
    const before = completed.workspace;
    const scope = { kind: "goal" as const, goalId: before.goalId, workspaceId: before.id, revision: before.revision, baseVersionId: before.activePlanVersionId };
    const supplement = await f.http("createDocument", { kind: "supplement", displayName: "Project notes", text: candidates.map(item => item.source.quote).join("\n"), mutationId: "save-supplement" });
    const consent = await f.http("createDocumentConsent", { textVersionId: supplement.textVersionId, purpose: "analysis", providerPolicyId: "qualified-policy", policyVersion: "2026.11.1", mutationId: "consent-supplement" });
    const job = await f.http("createDocumentJob", { textVersionId: supplement.textVersionId, consentId: consent.consentId, mutationId: "analyze-supplement" });
    await f.execute(job.jobId);
    expect(f.providerCalls()).toBe(1);
    expect(await f.http("readDocumentJob", { jobId: job.jobId })).toMatchObject({ state: "succeeded" });
    const draft = (await f.http("readDocumentReviewDraft", { documentId: supplement.documentId, textVersionId: supplement.textVersionId })).draft!;
    expect(draft.origin).toBe("ai");
    expect(draft.selfAssessmentHints).toEqual([expect.objectContaining({ candidateId: "project-practice", level: "guided" })]);
    expect((await f.runtime.planning.getWorkspace("owner-a"))?.activePlanVersionId).toBe(before.activePlanVersionId);
    const editedText = `I assisted with observability: ${privateText}.`;
    const { draft: edited } = await f.http("saveDocumentReviewDraft", { documentId: supplement.documentId, textVersionId: supplement.textVersionId, extractionId: draft.extractionId,
      items: draft.items.map(item => item.id === "project-practice" ? { ...item, origin: "user", text: editedText } : item),
      selfAssessmentHints: draft.selfAssessmentHints, expectedRevision: draft.revision, mutationId: "review-supplement" });
    const { confirmationId } = await f.http("createDocumentConfirmation", { documentId: supplement.documentId, documentVersionId: supplement.documentVersionId, textVersionId: supplement.textVersionId,
      expectedRevision: supplement.revision, reviewRevision: edited.revision, items: edited.items, mutationId: "confirm-supplement" });
    const selectionRef = await f.http("createMaterialSelection", { scope, entries: [jd, resume, { slot: "supplement", documentId: supplement.documentId, documentVersionId: supplement.documentVersionId, confirmationId }], mutationId: "with-supplement" });
    const { contextVersionId, previewToken, preview } = await f.http("createMaterialContext", { ...planningInputs, selectionRef, scope, mutationId: "supplement-context" });
    expect(preview.confirmedItems).toContainEqual(expect.objectContaining({ text: editedText, origin: "user" }));
    expect(preview.itemReferences?.filter(ref => ref.confirmationId === confirmationId).map(ref => ref.itemId).sort()).toEqual(["project-practice", "sql-must", "typescript-optional"]);
    expect(preview.overlay?.mandatorySkillIds).toEqual(["typescript"]);
    const priority = (skill: string) => preview.priorities.find(item => item.skillId === skill);
    const itemRef = (source: string, item: string) => preview.itemReferences!.find(ref => ref.confirmationId === source && ref.itemId === item)!.id;
    expect(priority("observability")).toEqual({ skillId: "observability", tier: 3, itemIds: [itemRef(confirmationId, "project-practice")] });
    expect(priority("typescript")).toEqual({ skillId: "typescript", tier: 0, itemIds: [itemRef(jd.confirmationId, "jd-must")] });
    expect(priority("sql")).toEqual({ skillId: "sql", tier: 4, itemIds: [itemRef(jd.confirmationId, "jd-preferred")] });
    const proposal = await f.http("materialReplan", { scope, selectionRef, contextVersionId, previewToken, mutationId: "propose-supplement" });
    if (proposal.outcome !== "proposed") throw new Error("Expected a change in unfinished practice order");
    const staged = proposal.planning.result.workspace;
    expect(staged.activePlanVersionId).toBe(before.activePlanVersionId);
    const accepted = await f.runtime.planning.acceptReplan("owner-a", { baseVersionId: staged.activePlanVersionId, candidatePlanVersionId: staged.pendingPlanVersionId!, mutationId: "accept-supplement" });
    const after = accepted.workspace;
    const oldUnits = activeUnits(before), newUnits = activeUnits(after);
    expect(newUnits.findIndex(unit => unit.skillId === "observability")).toBeLessThan(oldUnits.findIndex(unit => unit.skillId === "observability"));
    expect(newUnits.map(unit => unit.id).sort()).toEqual(oldUnits.map(unit => unit.id).sort());
    expect(after.events[0]).toEqual(before.events[0]);
    const completedUnitId = initialWorkspace.dailyUnits[0]!.id;
    const completedIndex = oldUnits.findIndex(unit => unit.id === completedUnitId);
    expect(completedIndex).toBeGreaterThanOrEqual(0);
    expect(newUnits[completedIndex]).toEqual(oldUnits[completedIndex]);
    expect(after.audit).toEqual(before.audit);
    expect(after.audit.answers.find(answer => answer.skillId === "observability")?.level).toBe("conceptual");
    const history = await f.http("readMaterialHistory", { goalId: before.goalId });
    const explanations = history.plans.find(plan => plan.contextVersionId === contextVersionId)!.explanations;
    expect(explanations).toContainEqual(expect.objectContaining({ ruleId: "confirmed-practice-v1", skillId: "observability", reasonItemIds: [itemRef(confirmationId, "project-practice")] }));
    expect(explanations).toContainEqual(expect.objectContaining({ ruleId: "mandatory-scope-protection-v1", skillId: "typescript", reasonItemIds: [itemRef(jd.confirmationId, "jd-must")] }));
    const agent = learningContext({ workspace: after, sourceContext: initial.sourceContext });
    const prompt = promptContext(agent, { requestId: "00000000-0000-4000-8000-000000000001", goalId: after.goalId, baseVersionId: after.activePlanVersionId, revision: after.revision, page: "today", message: "What's next?", deep: false }, true);
    for (const publicValue of [after, history, prompt, f.db.database.prepare("SELECT response_json FROM idempotency_records").all()]) {
      expect(JSON.stringify(publicValue)).not.toContain(privateText);
    }
  } finally {
    await f.dispose();
  }
});
