// @vitest-environment node
import { expect, it } from "vitest";
import type { ConfirmedMaterialItem, DocumentCandidate, MaterialSelectionEntry } from "../../app/contracts/documents";
import type { LearningPathVersion, PlanningWorkspace } from "../../app/contracts/planning";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { learningContext, promptContext } from "../../app/server/agents/context";
import { KIMI_GROUNDED_TERMS_POLICY_ID } from "../../app/server/documents/policy";
import { D1ProofRepository } from "../../app/server/proof/d1-proof-repository";
import { ProofService } from "../../app/server/proof/service";
import { createMaterialAnalysisFixture } from "../helpers/material-analysis-e2e";
import { materialContextRequest } from "../helpers/material-planning";

type Fixture = Awaited<ReturnType<typeof createMaterialAnalysisFixture>>;
const privateText = "PRIVATE-COACH-INTENT-SENTINEL-83bf";
const candidates: DocumentCandidate[] = [
  { id: "coach-focus", kind: "constraint", text: `Coach suggests 20 minutes for observability (${privateText}).`,
    skillLabels: ["observability"], selfLevelHint: null, requirementLevel: null,
    source: { segmentId: "segment-1", quote: `Coach suggests 20 minutes for observability (${privateText}).` } },
  { id: "coach-typescript", kind: "requirement", text: "Coach says TypeScript is optional.",
    skillLabels: ["TypeScript"], selfLevelHint: null, requirementLevel: "preferred",
    source: { segmentId: "segment-1", quote: "Coach says TypeScript is optional." } },
  { id: "coach-sql", kind: "requirement", text: "Coach says SQL is mandatory.",
    skillLabels: ["SQL"], selfLevelHint: null, requirementLevel: "must",
    source: { segmentId: "segment-1", quote: "Coach says SQL is mandatory." } },
];
const sourceSpanResponse = { format: "source-spans-v2", items: candidates.map(({ kind, source, skillLabels, requirementLevel, selfLevelHint }) => ({
  kind, source, skillTerms: skillLabels, requirementLevel, selfLevelHint,
})), reviewPoints: [] };
const activePath = (workspace: PlanningWorkspace) => workspace.pathVersions.find(path => path.id === workspace.activePathVersionId)!;
const activePlan = (workspace: PlanningWorkspace) => workspace.planVersions.find(plan => plan.id === workspace.activePlanVersionId)!;
const scopeFor = (workspace: PlanningWorkspace) => ({ kind: "goal" as const, goalId: workspace.goalId, workspaceId: workspace.id,
  revision: workspace.revision, baseVersionId: workspace.activePlanVersionId });
const proofRows = (f: Fixture) => Object.fromEntries(
  ["proof_items", "proof_versions", "proof_review_events", "user_skill_projections"].map(table =>
    [table, f.db.database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]),
);

async function confirmedPrimary(f: Fixture): Promise<MaterialSelectionEntry> {
  const items: ConfirmedMaterialItem[] = [
    { id: "jd-must", kind: "requirement", text: "TypeScript", requirementLevel: "must", sourceRef: null, origin: "user" },
    { id: "jd-preferred", kind: "requirement", text: "SQL", requirementLevel: "preferred", sourceRef: null, origin: "user" },
  ];
  const doc = await f.http("createDocument", { kind: "jd", displayName: "Primary JD", text: "TypeScript required. SQL preferred.", mutationId: "save-jd" });
  const { draft } = await f.http("saveDocumentReviewDraft", { documentId: doc.documentId, textVersionId: doc.textVersionId,
    extractionId: null, items, selfAssessmentHints: [], expectedRevision: 0, mutationId: "review-jd" });
  const { confirmationId } = await f.http("createDocumentConfirmation", { documentId: doc.documentId, documentVersionId: doc.documentVersionId,
    textVersionId: doc.textVersionId, expectedRevision: doc.revision, reviewRevision: draft.revision, items: draft.items, mutationId: "confirm-jd" });
  return { slot: "jd", documentId: doc.documentId, documentVersionId: doc.documentVersionId, confirmationId };
}

async function prepareFlow(f: Fixture) {
  const jd = await confirmedPrimary(f);
  const { scope: draftScope, source, audit, availability, target, planningDate, selectedScope } = materialContextRequest();
  const planningInputs = { source, audit, availability, target, planningDate, selectedScope };
  const primarySelection = await f.http("createMaterialSelection", { scope: draftScope, entries: [jd], mutationId: "select-jd" });
  const initialContext = await f.http("createMaterialContext", { ...planningInputs, scope: draftScope, selectionRef: primarySelection, mutationId: "preview-jd" });
  const initial = await f.http("generatePlanning", { ...planningInputs,
    materials: { selectionRef: primarySelection, contextVersionId: initialContext.contextVersionId, previewToken: initialContext.previewToken }, mutationId: "generate-jd" });
  expect(f.providerCalls()).toBe(0);
  const completedUnit = initial.result.workspace.dailyUnits[0]!;
  const { workspace: before } = await f.runtime.planning.appendEvent("owner-a", { baseVersionId: initial.result.workspace.activePlanVersionId,
    mutationId: "complete-before-coach", event: { kind: "completed", unitId: completedUnit.id, actualMinutes: completedUnit.estimatedMinutes, planningDate } });
  const proof = new ProofService({ repository: new D1ProofRepository(f.db as unknown as D1Database), blueprint: flagshipBlueprint, registry: flagshipUnitRegistry });
  const submitted = await proof.create("owner-a", { mutationId: "existing-proof", baseRevision: 0, intent: "submit", validatorKey: null,
    dailyUnitId: completedUnit.id, title: "Existing learning artifact", kind: "document", summary: "Evidence from the completed task before coach advice.",
    artifactUrl: "https://example.com/completed-learning", assetId: null, skillIds: [completedUnit.skillId],
    completionCriteria: completedUnit.completionCriteria, visibility: "private" });
  expect(submitted.outcome).toBe("demonstrated");
  const proofBefore = await proof.getWorkspace("owner-a");
  const proofStorageBefore = proofRows(f);

  const doc = await f.http("createDocument", { kind: "supplement", displayName: "Coach advice", text: candidates.map(item => item.source.quote).join("\n"), mutationId: "save-coach" });
  const consent = await f.http("createDocumentConsent", { textVersionId: doc.textVersionId, purpose: "analysis", providerPolicyId: KIMI_GROUNDED_TERMS_POLICY_ID,
    policyVersion: "2026.11.1", mutationId: "consent-coach" });
  const job = await f.http("createDocumentJob", { textVersionId: doc.textVersionId, consentId: consent.consentId, mutationId: "analyze-coach" });
  await f.execute(job.jobId);
  expect(await f.http("readDocumentJob", { jobId: job.jobId })).toMatchObject({ state: "succeeded", errorCode: null });
  const { draft } = await f.http("readDocumentReviewDraft", { documentId: doc.documentId, textVersionId: doc.textVersionId });
  expect(draft!.origin).toBe("ai");
  expect(draft!.reviewProjection).toBe("grounded-skill-labels-v2");
  expect(draft!.items.map(item => item.kind)).toEqual(["constraint", "requirement", "requirement"]);
  expect(draft!.items.map(item => item.skillLabels)).toEqual([["observability"], ["TypeScript"], ["SQL"]]);
  expect(draft!.selfAssessmentHints).toEqual([]);
  const confirmed = await f.http("createDocumentConfirmation", { documentId: doc.documentId, documentVersionId: doc.documentVersionId,
    textVersionId: doc.textVersionId, expectedRevision: doc.revision, reviewRevision: draft!.revision, items: draft!.items, mutationId: "confirm-coach" });
  const coach: MaterialSelectionEntry = { slot: "supplement", documentId: doc.documentId, documentVersionId: doc.documentVersionId, confirmationId: confirmed.confirmationId };
  const scope = scopeFor(before);
  const selectionRef = await f.http("createMaterialSelection", { scope, entries: [jd, coach], mutationId: "select-coach" });
  const learningIntents = draft!.items.map(item => ({ confirmationId: coach.confirmationId, itemId: item.id }));
  const termMappings = [{ confirmationId: coach.confirmationId, itemId: draft!.items[0]!.id, skillLabel: "observability", skillIds: ["observability"] }];
  expect(await f.runtime.planning.getWorkspace("owner-a")).toEqual(before);
  expect(f.providerCalls()).toBe(1); // This is the fixture provider; all planning is deterministic and offline.
  return { jd, coach, coachRevision: confirmed.revision, scope, selectionRef, planningInputs, before, proof, proofBefore, proofStorageBefore,
    sourceContext: initial.sourceContext, initialContext, learningIntents, termMappings };
}

function expectPreservedPlan(before: PlanningWorkspace, after: PlanningWorkspace, path: LearningPathVersion, planId: string) {
  const original = activePath(before);
  const sortedUnits = (units: LearningPathVersion["units"]) => [...units].sort((left, right) => left.id.localeCompare(right.id));
  expect(sortedUnits(path.units)).toEqual(sortedUnits(original.units)); // Exact IDs, templates, duration and dependencies.
  expect(path.units.reduce((total, unit) => total + unit.estimatedMinutes, 0)).toBe(original.units.reduce((total, unit) => total + unit.estimatedMinutes, 0));
  const completed = before.events.filter(event => event.kind === "completed");
  expect(after.events.filter(event => event.kind === "completed")).toEqual(completed);
  const earlier = new Set(completed.map(event => event.unitId));
  for (const unit of path.units) {
    for (const prerequisite of unit.prerequisiteUnitIds) expect(earlier.has(prerequisite)).toBe(true);
    earlier.add(unit.id);
  }
  for (const event of completed) {
    const index = original.units.findIndex(unit => unit.id === event.unitId);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(path.units[index]).toEqual(original.units[index]);
  }
  expect(after.dailyUnits).toEqual(expect.arrayContaining(before.dailyUnits));
  expect(after.audit).toEqual(before.audit);
  expect(after.availability).toEqual(before.availability);
  expect(after.availabilityVersions).toEqual(before.availabilityVersions);
  expect(after.target).toEqual(before.target);
  const plan = after.planVersions.find(value => value.id === planId)!;
  expect(plan.days.map(({ date, budgetMinutes }) => ({ date, budgetMinutes }))).toEqual(
    activePlan(before).days.map(({ date, budgetMinutes }) => ({ date, budgetMinutes })),
  );
}

it.each(["discard", "accept"] as const)("reorders coach-only advice only after adoption, preserving the plan and Proof through %s", async decision => {
  const f = await createMaterialAnalysisFixture({ sourceSpanResponse });
  try {
    const flow = await prepareFlow(f);
    const { before, scope, selectionRef, planningInputs, coach, jd, learningIntents, termMappings } = flow;
    const unadopted = await f.http("createMaterialContext", { ...planningInputs, scope, selectionRef, mutationId: "preview-unadopted" });
    expect(unadopted.preview.overlay?.skillRanks).toEqual(flow.initialContext.preview.overlay?.skillRanks);
    expect(unadopted.preview.overlay?.skillRanks.observability).toBe(5);
    expect(unadopted.preview.issues).toContainEqual(expect.objectContaining({ code: "learning-intent-not-adopted" }));
    // The preview alone never adopts the new coach source. Proposing it would require an
    // explicit context-only decision even before any individual learning intent is selected.
    expect(await f.runtime.planning.getWorkspace("owner-a")).toEqual(before);
    expect(proofRows(f)).toEqual(flow.proofStorageBefore);

    const adopted = await f.http("createMaterialContext", { ...planningInputs, scope, selectionRef, learningIntents, termMappings, mutationId: "preview-adopted" });
    const { preview } = adopted;
    const ref = (confirmationId: string, itemId: string) => preview.itemReferences!.find(item => item.confirmationId === confirmationId && item.itemId === itemId)!.id;
    expect(preview.confirmedItems).toEqual(unadopted.preview.confirmedItems);
    expect(preview.confirmedItems.some(item => item.kind === "experience")).toBe(false);
    expect(preview.overlay?.skillRanks).toMatchObject({ observability: 3, typescript: 0, sql: 4 });
    expect(preview.overlay?.mandatorySkillIds).toEqual(["typescript"]);
    expect(preview.priorities.find(item => item.skillId === "observability")).toMatchObject({ tier: 3,
      itemIds: [ref(coach.confirmationId, termMappings[0]!.itemId)], learningIntentItemIds: [ref(coach.confirmationId, termMappings[0]!.itemId)] });
    expect(preview.priorities.find(item => item.skillId === "typescript")).toEqual({ skillId: "typescript", tier: 0, itemIds: [ref(jd.confirmationId, "jd-must")] });
    expect(preview.priorities.find(item => item.skillId === "sql")).toEqual({ skillId: "sql", tier: 4, itemIds: [ref(jd.confirmationId, "jd-preferred")] });
    expect(preview.planning?.fullScope.totalMinutes).toBe(unadopted.preview.planning?.fullScope.totalMinutes);
    expect(preview.overlay?.semanticFingerprint).not.toBe(unadopted.preview.overlay?.semanticFingerprint);
    expect((await f.http("readMaterialContext", { contextVersionId: adopted.contextVersionId })).preview).toEqual(preview);
    const saved = f.db.database.prepare("SELECT snapshot_json FROM material_context_versions WHERE id=?").get(adopted.contextVersionId) as { snapshot_json: string };
    expect(JSON.parse(saved.snapshot_json)).toMatchObject({ learningIntents, termMappings, audit: before.audit, availability: before.availability });
    expect(await f.runtime.planning.getWorkspace("owner-a")).toEqual(before);

    const proposal = await f.http("materialReplan", { scope, selectionRef, contextVersionId: adopted.contextVersionId,
      previewToken: adopted.previewToken, mutationId: "propose-adopted" });
    if (proposal.outcome !== "proposed") throw new Error("Explicitly adopted coach advice must change existing unfinished order");
    const staged = proposal.planning.result.workspace;
    const candidatePlan = staged.planVersions.find(plan => plan.id === staged.pendingPlanVersionId)!;
    const candidatePath = staged.pathVersions.find(path => path.id === candidatePlan.pathVersionId)!;
    expect(staged.activePlanVersionId).toBe(before.activePlanVersionId);
    expect(activePath(staged)).toEqual(activePath(before));
    expect(candidatePath.units.findIndex(unit => unit.skillId === "observability")).toBeLessThan(activePath(before).units.findIndex(unit => unit.skillId === "observability"));
    expectPreservedPlan(before, staged, candidatePath, candidatePlan.id);
    expect(await flow.proof.getWorkspace("owner-a")).toEqual(flow.proofBefore);
    expect(proofRows(f)).toEqual(flow.proofStorageBefore);

    const input = { baseVersionId: staged.activePlanVersionId, candidatePlanVersionId: candidatePlan.id, mutationId: `decide-${decision}` };
    const result = decision === "accept" ? await f.runtime.planning.acceptReplan("owner-a", input) : await f.runtime.planning.discardReplan("owner-a", input);
    const after = result.workspace;
    expect(result.outcome).toBe(decision === "accept" ? "accepted" : "discarded");
    expect(after.pendingPlanVersionId).toBeNull();
    expect(after.activePlanVersionId).toBe(decision === "accept" ? candidatePlan.id : before.activePlanVersionId);
    expect(activePath(after)).toEqual(decision === "accept" ? candidatePath : activePath(before));
    expectPreservedPlan(before, after, activePath(after), after.activePlanVersionId);
    expect(await f.runtime.planning.getWorkspace("owner-a")).toEqual(after);
    expect(await flow.proof.getWorkspace("owner-a")).toEqual(flow.proofBefore);
    expect(proofRows(f)).toEqual(flow.proofStorageBefore);
    const history = await f.http("readMaterialHistory", { goalId: before.goalId, includeProposalState: "current" });
    const entry = history.plans.find(plan => plan.contextVersionId === adopted.contextVersionId)!;
    expect(entry).toMatchObject(decision === "accept" ? { kind: "accepted" } : { kind: "proposal", proposalState: "discarded" });
    expect(entry.explanations).toContainEqual(expect.objectContaining({ ruleId: "confirmed-learning-intent-v1", skillId: "observability",
      reasonItemIds: [ref(coach.confirmationId, termMappings[0]!.itemId)] }));
    expect(entry.explanations.some(item => item.ruleId === "confirmed-practice-v1")).toBe(false);
    const prompt = promptContext(learningContext({ workspace: after, sourceContext: flow.sourceContext }), {
      requestId: "00000000-0000-4000-8000-000000000001", goalId: after.goalId, baseVersionId: after.activePlanVersionId,
      revision: after.revision, page: "today", message: "What is next?", deep: false,
    }, true);
    for (const publicValue of [after, history, prompt, await flow.proof.getWorkspace("owner-a"), f.db.database.prepare("SELECT response_json FROM idempotency_records").all()]) {
      expect(JSON.stringify(publicValue)).not.toContain(privateText);
    }
    expect(f.providerCalls()).toBe(1);
  } finally { await f.dispose(); }
});

it("invalidates the adopted-choice preview when the selection revision removes its coach source", async () => {
  const f = await createMaterialAnalysisFixture({ sourceSpanResponse });
  try {
    const flow = await prepareFlow(f);
    const { scope, selectionRef, planningInputs, learningIntents, termMappings, before } = flow;
    const context = await f.http("createMaterialContext", { ...planningInputs, scope, selectionRef, learningIntents, termMappings, mutationId: "preview-before-remove" });
    const updated = await f.http("updateMaterialSelection", { selectionId: selectionRef.selectionId, expectedRevision: selectionRef.selectionRevision,
      entries: [flow.jd], mutationId: "remove-coach" });
    expect(updated).toEqual({ selectionId: selectionRef.selectionId, selectionRevision: selectionRef.selectionRevision + 1 });
    await expect(f.http("readMaterialContext", { contextVersionId: context.contextVersionId })).rejects.toThrow("HTTP 409");
    await expect(f.http("materialReplan", { scope, selectionRef, contextVersionId: context.contextVersionId,
      previewToken: context.previewToken, mutationId: "propose-stale-choices" })).rejects.toThrow("HTTP 409");
    await expect(f.http("createMaterialContext", { ...planningInputs, scope, selectionRef: updated, learningIntents, termMappings,
      mutationId: "reuse-removed-choices" })).rejects.toThrow("HTTP 400");
    const refreshed = await f.http("createMaterialContext", { ...planningInputs, scope, selectionRef: updated, mutationId: "preview-without-coach" });
    expect(refreshed.preview.overlay?.skillRanks.observability).toBe(5);
    expect(await f.http("materialReplan", { scope, selectionRef: updated, contextVersionId: refreshed.contextVersionId,
      previewToken: refreshed.previewToken, mutationId: "propose-without-coach" })).toMatchObject({ outcome: "no-change" });
    expect(await f.runtime.planning.getWorkspace("owner-a")).toEqual(before);
    expect(proofRows(f)).toEqual(flow.proofStorageBefore);
    expect(f.providerCalls()).toBe(1);
  } finally { await f.dispose(); }
});

it("blocks acceptance after deleting the adopted coach source and still permits discard without changing progress or Proof", async () => {
  const f = await createMaterialAnalysisFixture({ sourceSpanResponse });
  try {
    const flow = await prepareFlow(f);
    const { scope, selectionRef, planningInputs, learningIntents, termMappings, before } = flow;
    const context = await f.http("createMaterialContext", { ...planningInputs, scope, selectionRef, learningIntents, termMappings, mutationId: "preview-before-delete" });
    const proposal = await f.http("materialReplan", { scope, selectionRef, contextVersionId: context.contextVersionId,
      previewToken: context.previewToken, mutationId: "propose-before-delete" });
    if (proposal.outcome !== "proposed") throw new Error("Expected a pending coach-intent replan");
    const staged = proposal.planning.result.workspace;
    await f.http("deleteDocument", { documentId: flow.coach.documentId, expectedRevision: flow.coachRevision, mutationId: "delete-coach" });
    await expect(f.http("readMaterialContext", { contextVersionId: context.contextVersionId })).rejects.toThrow("HTTP 409");
    const decision = { baseVersionId: staged.activePlanVersionId, candidatePlanVersionId: staged.pendingPlanVersionId!, mutationId: "accept-deleted-coach" };
    await expect(f.runtime.planning.acceptReplan("owner-a", decision)).rejects.toMatchObject({ code: "CONFLICT" });
    const { workspace: after } = await f.runtime.planning.discardReplan("owner-a", { ...decision, mutationId: "discard-deleted-coach" });
    expect(after.activePlanVersionId).toBe(before.activePlanVersionId);
    expect(after.pendingPlanVersionId).toBeNull();
    expect(activePath(after)).toEqual(activePath(before));
    expectPreservedPlan(before, after, activePath(after), after.activePlanVersionId);
    expect(await flow.proof.getWorkspace("owner-a")).toEqual(flow.proofBefore);
    expect(proofRows(f)).toEqual(flow.proofStorageBefore);
    const history = await f.http("readMaterialHistory", { goalId: before.goalId, includeProposalState: "current" });
    expect(history.plans.find(plan => plan.contextVersionId === context.contextVersionId)).toMatchObject({ sourceAvailability: "unavailable",
      explanations: [{ ruleId: "source-unavailable-v1", reasonItemIds: [] }] });
    expect(JSON.stringify(history)).not.toContain(privateText);
    expect(f.providerCalls()).toBe(1);
  } finally { await f.dispose(); }
});
