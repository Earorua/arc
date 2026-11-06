// @vitest-environment node
import { expect, it } from "vitest";
import type { ConfirmedMaterialItem, DocumentCandidate, DocumentReviewDraft } from "../../app/contracts/documents";
import { createMaterialAnalysisFixture } from "../helpers/material-analysis-e2e";
import { materialContextRequest } from "../helpers/material-planning";

const requirements: DocumentCandidate[] = [
  { id: "queries", kind: "requirement", text: "Improve slow queries", requirementLevel: "must",
    skillLabels: ["PostgreSQL", "AI", "OpenTelemetry", "Vitest"], selfLevelHint: null,
    source: { segmentId: "segment-1", quote: "PostgreSQL and Vitest are required for training." } },
  { id: "signals", kind: "requirement", text: "Inspect traces", requirementLevel: "preferred",
    skillLabels: ["OpenTelemetry"], selfLevelHint: null, source: { segmentId: "segment-1", quote: "OpenTelemetry is preferred." } },
  { id: "background", kind: "requirement", text: "React is used by our partners.", requirementLevel: "must",
    skillLabels: [], selfLevelHint: null, source: { segmentId: "segment-1", quote: "React is used by our partners." } },
];

async function extractedJd(f: Awaited<ReturnType<typeof createMaterialAnalysisFixture>>, candidates = requirements) {
  const doc = await f.http("createDocument", { kind: "jd", displayName: "Query specialist", text: candidates.map(item => item.source.quote).join("\n"), mutationId: "document" });
  const consent = await f.http("createDocumentConsent", { textVersionId: doc.textVersionId, purpose: "analysis", providerPolicyId: "qualified-policy", policyVersion: "2026.11.1", mutationId: "consent" });
  const job = await f.http("createDocumentJob", { textVersionId: doc.textVersionId, consentId: consent.consentId, mutationId: "analysis" });
  await f.execute(job.jobId);
  const ref = { documentId: doc.documentId, textVersionId: doc.textVersionId };
  const draft = (await f.http("readDocumentReviewDraft", ref)).draft!;
  const save = async (base: DocumentReviewDraft, items: ConfirmedMaterialItem[], mutationId: string) =>
    (await f.http("saveDocumentReviewDraft", { ...ref, expectedRevision: base.revision, extractionId: base.extractionId, items, selfAssessmentHints: base.selfAssessmentHints, mutationId })).draft;
  return { doc, draft, save };
}

it("uses the chosen source-bound JD alias in the generated plan after fact confirmation", async () => {
  const f = await createMaterialAnalysisFixture({ candidates: requirements });
  try {
    const { doc, draft, save } = await extractedJd(f);
    expect(draft.items[0]?.skillLabels).toEqual(["PostgreSQL", "Vitest"]);
    expect(draft.selfAssessmentHints).toEqual([]);
    const inputs = materialContextRequest();
    const entry = { slot: "jd" as const, documentId: doc.documentId, documentVersionId: doc.documentVersionId };
    await expect(f.http("createMaterialSelection", { scope: inputs.scope, entries: [{ ...entry, confirmationId: draft.id }], mutationId: "premature" })).rejects.toThrow();
    const kept = await save(draft, [{ ...draft.items[0]!, skillLabels: ["PostgreSQL"] }, draft.items[2]!], "keep-queries");
    const { confirmationId } = await f.http("createDocumentConfirmation", { documentId: doc.documentId, documentVersionId: doc.documentVersionId, textVersionId: doc.textVersionId,
      items: kept.items, reviewRevision: kept.revision, expectedRevision: doc.revision, mutationId: "confirm" });
    const selectionRef = await f.http("createMaterialSelection", { scope: inputs.scope, entries: [{ ...entry, confirmationId }], mutationId: "select" });
    const { preview, contextVersionId, previewToken } = await f.http("createMaterialContext", { ...inputs, selectionRef, mutationId: "context" });
    expect(preview.overlay?.mandatorySkillIds).toEqual(["sql"]);
    expect(preview.priorities.map(priority => priority.skillId)).toEqual(["sql"]);
    expect(preview.issues.some(issue => issue.code === "uncovered")).toBe(false);
    const { source, audit, availability, target, selectedScope, planningDate } = inputs;
    const plan = await f.http("generatePlanning", { source, audit, availability, target, selectedScope, planningDate, materials: { contextVersionId, previewToken, selectionRef }, mutationId: "generate" });
    expect(plan.result.workspace.audit.answers).toEqual(audit.answers);
    const history = await f.http("readMaterialHistory", { goalId: plan.result.workspace.goalId });
    expect(history.plans.find(version => version.contextVersionId === contextVersionId)?.explanations).toContainEqual(expect.objectContaining({ skillId: "sql", ruleId: "mandatory-scope-protection-v1" }));
  } finally {
    await f.dispose();
  }
});

it("does not restore discarded labels on modified, removed or manually supplied facts", async () => {
  const f = await createMaterialAnalysisFixture({ candidates: requirements });
  try {
    const { draft, save } = await extractedJd(f);
    const query = draft.items[0]!;
    const kept = await save(draft, [{ ...query, skillLabels: ["PostgreSQL"], origin: "user", requirementLevel: "preferred" }], "classify");
    expect(kept.items[0]?.skillLabels).toEqual(["PostgreSQL"]);
    for (const origin of ["user", "extracted"] as const) {
      await expect(save(kept, [{ ...query, origin, skillLabels: ["Vitest"] }], `restore-${origin}`)).rejects.toThrow();
    }
    await expect(save(kept, [draft.items[1]!], "restore-removed")).rejects.toThrow();
    await expect(save(kept, [{ ...query, id: "manual", origin: "user", sourceRef: null, skillLabels: ["sql"] }], "manual-label")).rejects.toThrow();
    const edited = await save(kept, [{ ...kept.items[0]!, text: "Coordinate the Vitest training calendar" }], "rewrite");
    expect(edited.items[0]?.skillLabels).toEqual([]);
    const revisedAgain = await save(edited, [{ ...edited.items[0]!, text: "Reschedule the Vitest training calendar" }], "rewrite-again");
    expect(revisedAgain.items[0]?.skillLabels).toEqual([]);
    await expect(save(revisedAgain, [{ ...query, skillLabels: ["PostgreSQL"] }], "restore-after-rewrite")).rejects.toThrow();
  } finally {
    await f.dispose();
  }
});

it("saves and confirms a pre-existing extracted draft without silently adding current suggestions", async () => {
  const archivedCandidates: DocumentCandidate[] = [...requirements, { id: "guided", kind: "experience", text: "Practiced with a supervisor",
    requirementLevel: null, skillLabels: ["Vitest"], selfLevelHint: "guided", source: { segmentId: "segment-1", quote: "Practiced Vitest with a supervisor." } }];
  const f = await createMaterialAnalysisFixture({ candidates: archivedCandidates });
  try {
    const { doc, draft, save } = await extractedJd(f, archivedCandidates);
    const legacyItems = draft.items.map(item => { const { skillLabels, ...fact } = item; void skillLabels; return fact; });
    f.db.database.prepare("UPDATE document_extractions SET candidates_json=? WHERE owner_id=? AND id=?").run(JSON.stringify({ schemaVersion: "2026.11.1", items: archivedCandidates }), "owner-a", draft.extractionId!);
    f.db.database.prepare("UPDATE document_review_drafts SET items_json=? WHERE owner_id=? AND id=?").run(JSON.stringify(legacyItems), "owner-a", draft.id);
    const archived = await f.http("readDocumentExtraction", { documentId: doc.documentId, extractionId: draft.extractionId! });
    expect(archived.draft.items).toEqual(legacyItems);
    const read = (await f.http("readDocumentReviewDraft", { documentId: doc.documentId, textVersionId: doc.textVersionId })).draft!;
    expect(read.items).toEqual(legacyItems);
    const saved = await save(read, read.items, "legacy-save");
    expect(saved.items).toEqual(legacyItems);
    expect(saved.selfAssessmentHints).toEqual([{ id: "hint-guided-0", candidateId: "guided", skillLabel: "Vitest", level: "guided" }]);
    const confirmed = await f.http("createDocumentConfirmation", { documentId: doc.documentId, documentVersionId: doc.documentVersionId, textVersionId: doc.textVersionId,
      items: saved.items, reviewRevision: saved.revision, expectedRevision: doc.revision, mutationId: "legacy-confirm" });
    expect(confirmed.revision).toBe(1);
  } finally {
    await f.dispose();
  }
});
