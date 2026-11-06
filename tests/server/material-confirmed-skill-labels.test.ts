// @vitest-environment node
import { expect, it } from "vitest";
import type { ConfirmedMaterialItem, DocumentCandidate, DocumentReviewDraft } from "../../app/contracts/documents";
import { createMaterialAnalysisFixture } from "../helpers/material-analysis-e2e";
import { materialContextRequest } from "../helpers/material-planning";
import { KIMI_GROUNDED_TERMS_POLICY_ID } from "../../worker/document-executor/source-span-extraction";

const requirements: DocumentCandidate[] = [
  { id: "queries", kind: "requirement", text: "Improve slow queries", requirementLevel: "must",
    skillLabels: ["PostgreSQL", "AI", "OpenTelemetry", "Vitest"], selfLevelHint: null,
    source: { segmentId: "segment-1", quote: "PostgreSQL and Vitest are required for training." } },
  { id: "signals", kind: "requirement", text: "Inspect traces", requirementLevel: "preferred",
    skillLabels: ["OpenTelemetry"], selfLevelHint: null, source: { segmentId: "segment-1", quote: "OpenTelemetry is preferred." } },
  { id: "background", kind: "requirement", text: "React is used by our partners.", requirementLevel: "must",
    skillLabels: [], selfLevelHint: null, source: { segmentId: "segment-1", quote: "React is used by our partners." } },
];

const groundedCandidates: DocumentCandidate[] = [
  { id: "cleanup", kind: "experience", text: "Prepared warehouse records", requirementLevel: null,
    skillLabels: ["data science", "data cleaning", "QuillBin", "PostgreSQL"], selfLevelHint: "guided",
    source: { segmentId: "segment-1", quote: "我在同事的指导下练习过清洗数据，并使用 QuillBin 整理库存记录。" } },
  { id: "tools", kind: "requirement", text: "Maintain the intake form", requirementLevel: "must",
    skillLabels: ["WAI-ARIA", "PostgreSQL", "design-systems", "sql"], selfLevelHint: null,
    source: { segmentId: "segment-1", quote: "The intake specialist must use WAI-ARIA and PostgreSQL." } },
  { id: "limit", kind: "constraint", text: "每天至多用三十分钟学 TypeScript。", requirementLevel: null,
    skillLabels: ["TypeScript", "React"], selfLevelHint: null,
    source: { segmentId: "segment-1", quote: "每天至多用三十分钟学 TypeScript。" } },
];

async function extractedJd(f: Awaited<ReturnType<typeof createMaterialAnalysisFixture>>, candidates = requirements, providerPolicyId = "qualified-policy") {
  const doc = await f.http("createDocument", { kind: "jd", displayName: "Query specialist", text: candidates.map(item => item.source.quote).join("\n"), mutationId: "document" });
  const consent = await f.http("createDocumentConsent", { textVersionId: doc.textVersionId, purpose: "analysis", providerPolicyId, policyVersion: "2026.11.1", mutationId: "consent" });
  const job = await f.http("createDocumentJob", { textVersionId: doc.textVersionId, consentId: consent.consentId, mutationId: "analysis" });
  await f.execute(job.jobId);
  const ref = { documentId: doc.documentId, textVersionId: doc.textVersionId };
  const draft = (await f.http("readDocumentReviewDraft", ref)).draft!;
  const save = async (base: DocumentReviewDraft, items: ConfirmedMaterialItem[], mutationId: string, skillTermAddition?: { itemId: string; sourceTerm: string }) =>
    (await f.http("saveDocumentReviewDraft", { ...ref, expectedRevision: base.revision, extractionId: base.extractionId, items, selfAssessmentHints: base.selfAssessmentHints,
      ...(skillTermAddition ? { skillTermAddition } : {}), mutationId })).draft;
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

it("carries bilingual source terms through review, reload and confirmation, then maps only the retained JD words in the selected role", async () => {
  const sourceSpanResponse = { format: "source-spans-v2", items: groundedCandidates.map(({ kind, source, skillLabels, requirementLevel, selfLevelHint }) => ({
    kind, source, skillTerms: skillLabels.map(word => word === "data cleaning" ? "清洗数据" : word), requirementLevel, selfLevelHint,
  })), reviewPoints: [{ code: "uncovered-skill", source: groundedCandidates[1]!.source }] };
  const f = await createMaterialAnalysisFixture({ sourceSpanResponse });
  try {
    const { doc, draft, save } = await extractedJd(f, groundedCandidates, KIMI_GROUNDED_TERMS_POLICY_ID);
    const ref = { documentId: doc.documentId, textVersionId: doc.textVersionId };
    expect(draft.items.map(item => item.skillLabels)).toEqual([["data cleaning", "QuillBin"], ["WAI-ARIA", "PostgreSQL"], ["TypeScript"]]);
    expect(draft.selfAssessmentHints.map(hint => hint.id)).toEqual(["hint-candidate-1-0", "hint-candidate-1-1"]);
    expect(draft.reviewPoints?.map(point => point.code)).toEqual(["confirm-self-assessment"]);
    expect(draft.reviewProjection).toBe("grounded-skill-labels-v2");
    const capture = f.db.database.prepare("SELECT candidates_json FROM document_extractions WHERE id=?").get(draft.extractionId!)!;
    expect(JSON.parse(String(capture.candidates_json)).reviewProjection).toBe(draft.reviewProjection);
    expect((await f.http("readDocumentExtraction", { documentId: doc.documentId, extractionId: draft.extractionId! })).draft.reviewProjection).toBe(draft.reviewProjection);

    const inputs = materialContextRequest();
    async function confirmAndPreview(review: DocumentReviewDraft, expectedRevision: number, name: string) {
      const { confirmationId } = await f.http("createDocumentConfirmation", { ...ref, documentVersionId: doc.documentVersionId,
        items: review.items, reviewRevision: review.revision, expectedRevision, mutationId: `confirm-${name}` });
      const scope = { ...inputs.scope, draftId: `draft-${name}` };
      const selectionRef = await f.http("createMaterialSelection", { scope, entries: [{ slot: "jd", documentId: doc.documentId,
        documentVersionId: doc.documentVersionId, confirmationId }], mutationId: `select-${name}` });
      const context = await f.http("createMaterialContext", { ...inputs, scope, selectionRef, mutationId: `context-${name}` });
      return { ...context, selectionRef, confirmationId, scope };
    }
    const initial = await confirmAndPreview(draft, doc.revision, "initial");
    expect(initial.preview.overlay?.mandatorySkillIds.toSorted()).toEqual(["design-systems", "sql"]);
    expect(initial.preview.uncoveredLabels.toSorted()).toEqual(["QuillBin", "data cleaning"]);
    await expect(f.http("createMaterialContext", { ...inputs, scope: initial.scope, selectionRef: initial.selectionRef,
      skillMappings: [{ confirmationId: initial.confirmationId, itemId: draft.items[2]!.id, skillId: "typescript" }], mutationId: "map-constraint" })).rejects.toThrow();

    const changes: ConfirmedMaterialItem[] = [
      { ...draft.items[0]!, origin: "user", text: "I cleaned data with guidance." },
      { ...draft.items[1]!, origin: "user", text: "Must check every form using WAI-ARIA." },
      draft.items[2]!,
    ];
    const saved = await save(draft, changes, "edit");
    expect(saved.items.map(item => item.skillLabels)).toEqual([["data cleaning"], ["WAI-ARIA"], ["TypeScript"]]);
    expect(saved.selfAssessmentHints.map(hint => hint.id)).toEqual(["hint-candidate-1-0"]);
    expect(await save(draft, changes, "edit")).toEqual(saved);
    expect((await f.http("readDocumentReviewDraft", { ...ref, includeConfirmation: "current" })).draft).toEqual(saved);

    const latest = await confirmAndPreview(saved, doc.revision + 1, "edited");
    expect(latest.preview.confirmedItems.map(item => item.skillLabels)).toEqual([["data cleaning"], ["WAI-ARIA"], ["TypeScript"]]);
    expect(latest.preview.uncoveredLabels).toEqual(["data cleaning"]);
    expect(latest.preview.overlay?.mandatorySkillIds).toEqual(["design-systems"]);
    expect(latest.preview.priorities.map(item => item.skillId)).toEqual(["design-systems"]);
    expect((await f.http("readMaterialContext", { contextVersionId: latest.contextVersionId })).preview).toEqual(latest.preview);
    const { source, audit, availability, target, selectedScope, planningDate } = inputs;
    const plan = await f.http("generatePlanning", { source, audit, availability, target, selectedScope, planningDate, mutationId: "generate-edited",
      materials: { contextVersionId: latest.contextVersionId, previewToken: latest.previewToken, selectionRef: latest.selectionRef } });
    expect(plan.result.workspace.audit.answers).toEqual(audit.answers);
    const { id, goalId, activePlanVersionId } = plan.result.workspace;
    expect((await f.http("readAdoptedMaterials", { workspaceId: id, goalId, baseVersionId: activePlanVersionId })).entries)
      .toEqual([expect.objectContaining({ slot: "jd", confirmationId: latest.confirmationId })]);
    const history = await f.http("readMaterialHistory", { goalId });
    const reasons = history.plans.find(version => version.contextVersionId === latest.contextVersionId)!.explanations;
    expect(reasons.filter(reason => reason.ruleId === "mandatory-scope-protection-v1").map(reason => reason.skillId)).toEqual(["design-systems"]);
  } finally {
    await f.dispose();
  }
});

it("requires each retained label to belong to the original source and last saved fact, including a rewrite back to the original summary", async () => {
  const f = await createMaterialAnalysisFixture({ candidates: groundedCandidates });
  try {
    const { draft, save } = await extractedJd(f, groundedCandidates);
    const [practice, tools, limit] = draft.items as [ConfirmedMaterialItem, ConfirmedMaterialItem, ConfirmedMaterialItem];
    await expect(save(draft, [{ ...practice, origin: "user", text: "PostgreSQL", skillLabels: ["PostgreSQL"] }], "neighbor")).rejects.toThrow();
    await expect(save(draft, [{ ...practice, origin: "user", sourceRef: tools.sourceRef, skillLabels: ["data cleaning"] }], "borrow-source")).rejects.toThrow();
    await expect(save(draft, [{ ...practice, origin: "user", skillLabels: ["data science"] }], "invented")).rejects.toThrow();
    const reworded = await save(draft, [{ ...practice, origin: "user", text: "Yesterday I cleaned data." },
      { ...limit, kind: "skill-claim", origin: "user" }], "prepare");
    expect(reworded.items.map(item => item.skillLabels)).toEqual([["data cleaning"], []]);
    const back = await save(reworded, [{ ...reworded.items[0]!, text: practice.text }], "back-to-summary");
    expect(back.items[0]?.skillLabels).toEqual([]);
    expect(back.selfAssessmentHints).toEqual([]);
    await expect(save(back, [{ ...practice, skillLabels: ["data cleaning"] }], "restore-source")).rejects.toThrow();
    await expect(save(back, [{ ...tools, id: "forged", origin: "user" }], "forge-candidate")).rejects.toThrow();
    const { skillLabels, ...withoutWords } = tools;
    expect(skillLabels).toContain("WAI-ARIA");
    await expect(save(back, [{ ...withoutWords, id: "forged", origin: "user" }], "forge-ref-only")).rejects.toThrow();
    const omitted = await save(back, [{ ...withoutWords, text: "New WAI-ARIA task", origin: "user" }], "removed-list-omitted");
    expect(omitted.items[0]?.skillLabels).toEqual([]);
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

it("authorizes one explicitly added verbatim term on the current saved fact, without granting a self-level or reopening removed words", async () => {
  const quote = "我在指导下用 QuillBin 清洗数据，并使用 PostgreSQL 归档。";
  const archived = { ...groundedCandidates[0]!, text: quote, source: { segmentId: "segment-1", quote }, skillLabels: ["QuillBin"] };
  const candidates = [archived, groundedCandidates[2]!];
  const f = await createMaterialAnalysisFixture({ candidates });
  try {
    const { doc, draft, save } = await extractedJd(f, candidates);
    const [practice, limit] = draft.items as [ConfirmedMaterialItem, ConfirmedMaterialItem];
    const withWord = (word: string): ConfirmedMaterialItem => ({ ...practice, origin: "user", skillLabels: [...practice.skillLabels!, word] });
    const intent = { itemId: practice.id, sourceTerm: "清洗数据" };
    const changes = [withWord("data cleaning"), limit];
    await expect(save(draft, changes, "implicit")).rejects.toThrow();
    await expect(save(draft, changes, "invented-word", { ...intent, sourceTerm: "data cleaning" })).rejects.toThrow();
    await expect(save(draft, changes, "borrow-term", { ...intent, sourceTerm: "TypeScript" })).rejects.toThrow();
    await expect(save(draft, changes, "wrong-id", { ...intent, itemId: "other" })).rejects.toThrow();
    await expect(save(draft, [withWord("sql"), limit], "role-guess", { ...intent, sourceTerm: "PostgreSQL" })).rejects.toThrow();
    await expect(save(draft, [{ ...changes[0]!, text: "Booked the room." }, limit], "no-longer-grounded", intent)).rejects.toThrow();
    await expect(save(draft, [{ ...changes[0]!, origin: "extracted" }, limit], "fake-origin", intent)).rejects.toThrow();
    await expect(save(draft, [{ ...changes[0]!, sourceRef: limit.sourceRef }, limit], "swapped-source", intent)).rejects.toThrow();
    await expect(save(draft, [{ ...changes[0]!, id: "manual", sourceRef: null }], "manual-source", { ...intent, itemId: "manual" })).rejects.toThrow();
    await expect(save(draft, [{ ...changes[0]!, skillLabels: ["QuillBin", "data cleaning", "PostgreSQL"] }], "extra-word", intent)).rejects.toThrow();

    const corrected = await save(draft, changes, "correct", intent);
    expect(corrected.items[0]?.skillLabels).toEqual(["QuillBin", "data cleaning"]);
    expect(corrected.selfAssessmentHints).toEqual(draft.selfAssessmentHints);
    expect(corrected.selfAssessmentHints.map(hint => hint.skillLabel)).toEqual(["QuillBin"]);
    expect(await save(draft, changes, "correct", intent)).toEqual(corrected);
    expect((await f.http("readDocumentReviewDraft", { documentId: doc.documentId, textVersionId: doc.textVersionId })).draft).toEqual(corrected);
    const kept = await save(corrected, [{ ...corrected.items[0]!, text: "I cleaned data with QuillBin." }, limit], "edit-corrected");
    expect(kept.items[0]?.skillLabels).toEqual(["QuillBin", "data cleaning"]);
    const removed = await save(kept, [{ ...kept.items[0]!, skillLabels: ["QuillBin"] }, limit], "remove-correction");
    await expect(save(removed, changes, "restore-by-put")).rejects.toThrow();
    await expect(save(draft, changes, "stale-correction", intent)).rejects.toThrow("HTTP 409");
    const read = (await f.http("readDocumentReviewDraft", { documentId: doc.documentId, textVersionId: doc.textVersionId })).draft!;
    expect(read.items[0]?.skillLabels).toEqual(["QuillBin"]);
    expect(read.revision).toBe(removed.revision);
  } finally { await f.dispose(); }
});

it("commits one of two concurrent source-term corrections at the same revision", async () => {
  const source = { segmentId: "segment-1", quote: "PostgreSQL and WAI-ARIA are required." };
  const candidate = { ...requirements[0]!, text: source.quote, source, skillLabels: [] };
  const f = await createMaterialAnalysisFixture({ candidates: [candidate] });
  try {
    const { doc, draft, save } = await extractedJd(f, [candidate]);
    const results = await Promise.allSettled(["PostgreSQL", "WAI-ARIA"].map((sourceTerm, index) => save(draft, [
      { ...draft.items[0]!, origin: "user", skillLabels: [sourceTerm] },
    ], `concurrent-${index}`, { itemId: candidate.id, sourceTerm })));
    const committed = results.filter(result => result.status === "fulfilled");
    expect(committed).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")?.reason.message).toContain("HTTP 409");
    const read = (await f.http("readDocumentReviewDraft", { documentId: doc.documentId, textVersionId: doc.textVersionId })).draft!;
    expect(read).toEqual(committed[0]!.value);
    expect(read.revision).toBe(1);
  } finally { await f.dispose(); }
});

it("saves and confirms a pre-existing extracted draft without silently adding current suggestions", async () => {
  const archivedCandidates: DocumentCandidate[] = [...requirements, { id: "guided", kind: "experience", text: "Practiced with a supervisor",
    requirementLevel: null, skillLabels: ["data cleaning", "Vitest"], selfLevelHint: "guided", source: { segmentId: "segment-1", quote: "Practiced Vitest with a supervisor." } }];
  const f = await createMaterialAnalysisFixture({ candidates: archivedCandidates });
  try {
    const { doc, draft, save } = await extractedJd(f, archivedCandidates);
    const legacyItems = draft.items.map(item => { const { skillLabels, ...fact } = item; void skillLabels; return fact; });
    const originalHints = ["data cleaning", "Vitest"].map((skillLabel, i) => ({ id: `hint-guided-${i}`, candidateId: "guided", skillLabel, level: "guided" }));
    f.db.database.prepare("UPDATE document_extractions SET candidates_json=? WHERE owner_id=? AND id=?").run(JSON.stringify({ schemaVersion: "2026.11.1", items: archivedCandidates }), "owner-a", draft.extractionId!);
    f.db.database.prepare("UPDATE document_review_drafts SET items_json=?,self_assessment_hints_json=? WHERE owner_id=? AND id=?")
      .run(JSON.stringify(legacyItems), JSON.stringify(originalHints), "owner-a", draft.id);
    const archived = await f.http("readDocumentExtraction", { documentId: doc.documentId, extractionId: draft.extractionId! });
    expect(archived.draft.items).toEqual(legacyItems);
    expect(archived.draft.selfAssessmentHints).toEqual(originalHints);
    expect(archived.draft).not.toHaveProperty("reviewProjection");
    const read = (await f.http("readDocumentReviewDraft", { documentId: doc.documentId, textVersionId: doc.textVersionId })).draft!;
    expect(read.items).toEqual(legacyItems);
    const saved = await save(read, read.items, "legacy-save");
    expect(saved.items).toEqual(legacyItems);
    expect(saved.selfAssessmentHints).toEqual(originalHints);
    const confirmed = await f.http("createDocumentConfirmation", { documentId: doc.documentId, documentVersionId: doc.documentVersionId, textVersionId: doc.textVersionId,
      items: saved.items, reviewRevision: saved.revision, expectedRevision: doc.revision, mutationId: "legacy-confirm" });
    expect(confirmed.revision).toBe(1);
  } finally {
    await f.dispose();
  }
});

it("keeps the v1 projection, literal edit rule, hint indices and saved removals when reopening an older envelope", async () => {
  const literalPractice: DocumentCandidate = { ...groundedCandidates[0]!, id: "literal", text: "Practised data cleaning",
    source: { segmentId: "segment-1", quote: "Supported data cleaning on a shipping file." }, skillLabels: ["data cleaning"] };
  const candidates = [...groundedCandidates, literalPractice];
  const f = await createMaterialAnalysisFixture({ candidates });
  try {
    const { doc, draft, save } = await extractedJd(f, candidates);
    const original = { schemaVersion: "2026.11.1", items: candidates };
    f.db.database.prepare("UPDATE document_extractions SET candidates_json=? WHERE id=?")
      .run(JSON.stringify({ reviewProjection: "literal-skill-labels-v1", candidate: original }), draft.extractionId!);
    const historicalItems = draft.items.map(item => {
      if (item.kind === "constraint") { const { skillLabels, ...fact } = item; void skillLabels; return fact; }
      return { ...item, skillLabels: item.id === "cleanup" ? ["QuillBin"] : item.id === "tools" ? ["PostgreSQL"] : ["data cleaning"] };
    });
    const hints = [
      { id: "hint-cleanup-2", candidateId: "cleanup", skillLabel: "QuillBin", level: "guided" },
      { id: "hint-literal-0", candidateId: "literal", skillLabel: "data cleaning", level: "guided" },
    ];
    f.db.database.prepare("UPDATE document_review_drafts SET items_json=?,self_assessment_hints_json=?,revision=4 WHERE id=?")
      .run(JSON.stringify(historicalItems), JSON.stringify(hints), draft.id);
    const proposed = await f.http("readDocumentExtraction", { documentId: doc.documentId, extractionId: draft.extractionId! });
    expect(proposed.expectedRevision).toBe(4);
    expect(proposed.draft.items.map(item => item.skillLabels)).toEqual([["QuillBin"], ["WAI-ARIA", "PostgreSQL"], undefined, ["data cleaning"]]);
    expect(proposed.draft.selfAssessmentHints).toEqual(hints);
    expect(proposed.draft).not.toHaveProperty("reviewProjection");
    const read = (await f.http("readDocumentReviewDraft", { documentId: doc.documentId, textVersionId: doc.textVersionId })).draft!;
    expect(read).not.toHaveProperty("reviewProjection");
    expect(read.items).toEqual(historicalItems);
    await expect(save(read, [{ ...read.items[1]!, origin: "user", skillLabels: ["PostgreSQL", "WAI-ARIA"] }], "old-add",
      { itemId: "tools", sourceTerm: "WAI-ARIA" })).rejects.toThrow();
    const changes = [...read.items.slice(0, 3), { ...read.items[3]!, origin: "user" as const, text: "I cleaned data." }];
    const saved = await save(read, changes, "old-edit");
    expect(saved.revision).toBe(5);
    expect(saved.items.map(item => item.skillLabels)).toEqual([["QuillBin"], ["PostgreSQL"], undefined, []]);
    expect(saved.selfAssessmentHints).toEqual(hints.slice(0, 1));
    expect(await save(read, changes, "old-edit")).toEqual(saved);
    await expect(save(saved, [{ ...read.items[1]!, skillLabels: ["WAI-ARIA"] }], "old-restore")).rejects.toThrow();
    await f.http("createDocumentConfirmation", { documentId: doc.documentId, documentVersionId: doc.documentVersionId, textVersionId: doc.textVersionId,
      items: saved.items, reviewRevision: saved.revision, expectedRevision: doc.revision, mutationId: "v1-confirm" });
  } finally {
    await f.dispose();
  }
});
