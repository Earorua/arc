// @vitest-environment node
import { expect, it } from "vitest";
import { documentExtractionSchema, SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION, type DocumentCandidate, type DocumentReviewDraft } from "../../app/contracts/documents";
import type { DocumentEndpointResponse } from "../../app/contracts/documents-api";
import { KIMI_GROUNDED_TERMS_POLICY_ID, KIMI_SOURCE_MENTIONS_POLICY_ID, KIMI_VERBATIM_TERMS_POLICY_ID } from "../../app/server/documents/policy";
import { readSourceSpanExtraction, sourceSpanPolicy } from "../../worker/document-executor/source-span-extraction";
import { createMaterialMentionReviewFixture } from "../helpers/material-mention-review-fixture";
import { materialContextRequest } from "../helpers/material-planning";
import { validateDocumentExtraction } from "../../app/server/documents/extraction-validator";
import { labelForAddedSourceTerm, supportsReviewedSkillLabel } from "../../app/lib/materials/skill-labels";

type Fixture = ReturnType<typeof createMaterialMentionReviewFixture>;
async function confirmAndSelect(f: Fixture, doc: DocumentEndpointResponse<"createDocument">, draft: DocumentReviewDraft, slot: "resume" | "supplement" | "jd" = "resume") {
  const confirmation = await f.client.request("createDocumentConfirmation", { documentId: doc.documentId,
    documentVersionId: doc.documentVersionId, textVersionId: doc.textVersionId, items: draft.items,
    reviewRevision: draft.revision, expectedRevision: doc.revision, mutationId: "confirm-mentions" });
  const inputs = materialContextRequest();
  const selectionRef = await f.client.request("createMaterialSelection", { scope: inputs.scope,
    entries: [{ slot, documentId: doc.documentId, documentVersionId: doc.documentVersionId, confirmationId: confirmation.confirmationId }],
    mutationId: "select-mentions" });
  return { confirmation, request: { ...inputs, selectionRef } };
}

function decodeMentionFact(text: string, quote = text, kind: DocumentCandidate["kind"] = "experience") {
  const format = sourceSpanPolicy(KIMI_SOURCE_MENTIONS_POLICY_ID)!.format;
  const decoded = readSourceSpanExtraction({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ format,
    items: [{ kind, source: { segmentId: "segment-1", quote }, requirementLevel: kind === "requirement" ? "preferred" : null,
      skillTerms: ["SQL"], selfLevelHint: kind === "requirement" ? null : "guided" }], reviewPoints: [],
  }) } }] }, { text, segments: [{ id: "segment-1", start: 0, end: text.length }] }, undefined, format);
  expect(decoded.extractionRead).toBe("parsed");
  return documentExtractionSchema.parse(decoded.candidate);
}

const verbatimPolicy = KIMI_VERBATIM_TERMS_POLICY_ID;

it.each([
  ["I wrote unit tests and ran a unit test.", ["unit tests", "unit test"], null, null],
  ["I used a spreadsheet under supervision, but my colleague used spreadsheets.", ["spreadsheet"], "guided", "guided"],
  ["I used spreadsheets under supervision, but my colleague used a spreadsheet.", ["spreadsheet"], "guided", null],
] as const)("keeps separate nominated spellings and attributes hints to their own source: %s", (text, terms, proposed, expected) => {
  const source = { segmentId: "s", quote: text };
  const input = { text, segments: [{ id: "s", start: 0, end: text.length }] };
  const raw = { choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ format: "source-spans-v3", reviewPoints: [],
    items: [{ kind: "experience", source, skillTerms: terms, requirementLevel: null, selfLevelHint: proposed }] }) } }] };
  const output = readSourceSpanExtraction(raw, input, undefined, sourceSpanPolicy(verbatimPolicy)!);
  expect(output.candidate).toMatchObject({ items: [{ skillLabels: terms, selfLevelHint: expected }] });
  const reference = { ...input, ownerId: "owner", lifecycle: "active" as const, documentId: "d", documentVersionId: "v", textVersionId: "t" };
  const review = validateDocumentExtraction(output.candidate, "owner", reference, verbatimPolicy);
  expect(review.items[0]?.skillLabels).toEqual(terms);
  expect(review.selfAssessmentHints.map(hint => hint.skillLabel)).toEqual(expected ? terms : []);
  if (proposed && !expected) {
    const candidate = documentExtractionSchema.parse(output.candidate);
    candidate.items[0]!.selfLevelHint = proposed;
    expect(validateDocumentExtraction(candidate, "owner", reference, verbatimPolicy).selfAssessmentHints).toEqual([]);
  }
});

it("removes a verbatim term when an edit retains only a different spelling of it", () => {
  const original = "I maintained a spreadsheet.", edited = "I maintained spreadsheets.";
  expect(supportsReviewedSkillLabel(edited, "spreadsheet", "verbatim-skill-mentions-v4")).toBe(false);
  expect(labelForAddedSourceTerm(original, edited, "spreadsheet", "verbatim-skill-mentions-v4")).toBeNull();
  expect(labelForAddedSourceTerm(original, edited, "spreadsheet", SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION)).toBe("spreadsheets");
});

it.each([
  [KIMI_GROUNDED_TERMS_POLICY_ID, "spreadsheet", ["sql"]],
  [verbatimPolicy, "spreadsheets", []],
] as const)("keeps the confirmed label's attribution after an edit and restart under %s", async (policyId, nomination, expectedPractice) => {
  const text = "I used a spreadsheet, but I never used spreadsheets.", f = createMaterialMentionReviewFixture();
  try {
    const doc = await f.client.request("createDocument", { kind: "resume", displayName: "Spreadsheet practice", text, mutationId: "create" });
    const ref = { documentId: doc.documentId, textVersionId: doc.textVersionId }, policy = sourceSpanPolicy(policyId)!;
    const wire = { format: policy.format, reviewPoints: [], items: [{ kind: "experience", source: { segmentId: "segment-1", quote: text },
      skillTerms: [nomination], requirementLevel: null, selfLevelHint: null }] };
    const decoded = readSourceSpanExtraction({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(wire) } }] },
      { text, segments: [{ id: "segment-1", start: 0, end: text.length }] }, undefined, policy);
    await f.deliver(doc, documentExtractionSchema.parse(decoded.candidate).items, policyId);
    const initial = (await f.client.request("readDocumentReviewDraft", ref)).draft!;
    expect(initial.items[0]?.skillLabels).toEqual(["spreadsheets"]);
    expect(initial.items[0]).not.toHaveProperty("skillLabelProjection");
    const save = { ...ref, extractionId: initial.extractionId, selfAssessmentHints: [], expectedRevision: initial.revision, mutationId: "save" };
    const forged = [{ ...initial.items[0]!, skillLabelProjection: "verbatim-skill-mentions-v4" }];
    await expect(f.client.request("saveDocumentReviewDraft", { ...save, items: forged })).rejects.toBeDefined();
    const { draft } = await f.client.request("saveDocumentReviewDraft", { ...save, items: initial.items });
    await expect(f.client.request("createDocumentConfirmation", { ...ref, documentVersionId: doc.documentVersionId, items: forged,
      reviewRevision: draft.revision, expectedRevision: doc.revision, mutationId: "forged-confirmation" })).rejects.toBeDefined();
    const flow = await confirmAndSelect(f, doc, draft);
    const reopen = { ...ref, includeConfirmation: "current" as const };
    f.restart();
    expect(await f.client.request("readDocumentReviewDraft", reopen)).toEqual({ draft, confirmation: flow.confirmation });
    // The next draft drops the fact. Planning still resolves the selected immutable confirmation.
    await f.client.request("saveDocumentReviewDraft", { ...save, items: [], expectedRevision: draft.revision, mutationId: "clear-next-draft" });
    f.restart();
    expect((await f.client.request("readDocumentReviewDraft", reopen)).confirmation).toBeUndefined();
    const { preview } = await f.client.request("createMaterialContext", { ...flow.request,
      termMappings: [{ confirmationId: flow.confirmation.confirmationId, itemId: draft.items[0]!.id, skillLabel: "spreadsheets", skillIds: ["sql"] }] });
    expect(preview.mappingDetails?.[0]).toMatchObject({ termIndexes: [0], status: "mapped", skillIds: ["sql"], basis: "manual" });
    expect(preview.confirmedItems[0]?.skillLabelProjection).toEqual(policyId === verbatimPolicy ? "verbatim-skill-mentions-v4" : undefined);
    expect(preview.priorities.map(row => row.skillId)).toEqual(expectedPractice);
  } finally { f.dispose(); }
});

it.each([
  ["我在指导下清洗空值记录。", "清洗空值记录", "data cleaning"],
  ["我学习增量加载。", "增量加载", "incremental loading"],
  ["I wrote unit tests.", "unit tests", "unit testing"],
  ["掌握组件测试。", "组件测试", "component testing"],
  ["I maintained a spreadsheet.", "spreadsheet", "spreadsheets"],
] as const)("retains the source spelling in new extractions and the historical key in v3: %s", (text, term, canonical) => {
  const source = { segmentId: "segment-1", quote: text };
  const raw = { choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ format: "source-spans-v3",
    items: [{ kind: "experience", source, requirementLevel: null, skillTerms: [term, "UnmentionedTool"], selfLevelHint: null }], reviewPoints: [] }) } }] };
  const sources = { text, segments: [{ id: "segment-1", start: 0, end: text.length }] };
  expect(readSourceSpanExtraction(raw, sources, undefined, "source-spans-v3").candidate)
    .toMatchObject({ items: [{ skillLabels: [canonical], source }] });
  const policy = sourceSpanPolicy(verbatimPolicy);
  expect(policy).toBeDefined();
  expect(readSourceSpanExtraction(raw, sources, undefined, policy!).candidate)
    .toMatchObject({ items: [{ skillLabels: [term], source }] });
});

it("keeps verbatim terms through review corrections, reload, confirmation and the plan preview", async () => {
  const f = createMaterialMentionReviewFixture();
  const text = "I wrote unit tests using a spreadsheet.";
  try {
    const doc = await f.client.request("createDocument", { kind: "resume", displayName: "Testing practice", text, mutationId: "create-verbatim" });
    const item: DocumentCandidate = { id: "fact", kind: "experience", text, source: { segmentId: "segment-1", quote: text },
      requirementLevel: null, skillLabels: ["unit tests", "spreadsheets"], selfLevelHint: null };
    await f.deliver(doc, [item], verbatimPolicy);
    const ref = { documentId: doc.documentId, textVersionId: doc.textVersionId };
    const initial = (await f.client.request("readDocumentReviewDraft", ref)).draft!;
    expect(initial.reviewProjection).toBe("verbatim-skill-mentions-v4");
    expect(initial.items[0]!.skillLabels).toEqual(["unit tests"]);
    const base = { ...ref, extractionId: initial.extractionId, selfAssessmentHints: [], expectedRevision: initial.revision,
      skillTermAddition: { itemId: "fact", sourceTerm: "spreadsheet" }, mutationId: "add-verbatim" };
    const withTerms = (skillLabels: string[]) => [{ ...initial.items[0]!, origin: "user" as const, skillLabels }];
    await expect(f.client.request("saveDocumentReviewDraft", { ...base, items: withTerms(["unit tests", "spreadsheets"]) })).rejects.toBeDefined();
    const { draft } = await f.client.request("saveDocumentReviewDraft", { ...base, items: withTerms(["unit tests", "spreadsheet"]) });
    f.restart();
    expect((await f.client.request("readDocumentReviewDraft", ref)).draft).toEqual(draft);
    const flow = await confirmAndSelect(f, doc, draft);
    const { preview } = await f.client.request("createMaterialContext", flow.request);
    expect(preview.confirmedItems[0]?.skillLabels).toEqual(["unit tests", "spreadsheet"]);
    expect(preview.mappingDetails?.filter(row => row.status === "mapped").flatMap(row => row.skillIds)).toEqual(["testing"]);
    // Equal draft facts without the original V4 provenance belong to a different snapshot.
    f.db.database.prepare("UPDATE document_confirmations SET items_json=? WHERE id=?")
      .run(JSON.stringify(draft.items), flow.confirmation.confirmationId);
    expect(await f.client.request("readDocumentReviewDraft", { ...ref, includeConfirmation: "current" })).toEqual({ draft });
  } finally { f.dispose(); }
});

it("carries both confirmed bilingual terms into the same flagship course in the plan preview", async () => {
  const f = createMaterialMentionReviewFixture(), text = "I wrote unit tests and 单元测试.";
  try {
    const doc = await f.client.request("createDocument", { kind: "resume", displayName: "Testing practice", text, mutationId: "bilingual-resume" });
    const labels = ["unit tests", "单元测试"];
    await f.deliver(doc, [{ id: "practice", kind: "experience", text, source: { segmentId: "segment-1", quote: text },
      requirementLevel: null, skillLabels: labels, selfLevelHint: null }], verbatimPolicy);
    const ref = { documentId: doc.documentId, textVersionId: doc.textVersionId };
    const { draft } = await f.client.request("readDocumentReviewDraft", ref);
    const flow = await confirmAndSelect(f, doc, draft!);
    const { preview } = await f.client.request("createMaterialContext", flow.request);
    expect(preview.confirmedItems[0]?.skillLabels).toEqual(labels);
    expect(preview.mappingDetails).toMatchObject([{ termIndexes: [0, 1], status: "mapped", skillIds: ["testing"],
      taskCoverage: { status: "partial", support: ["behavior-tests"] } }]);
    expect(preview.priorities.map(row => row.skillId)).toEqual(["testing"]);
  } finally { f.dispose(); }
});

it.each([
  ["ASCII", "resume", "1. I tested SQL under supervision.", "1. I tested SQL under supervision."],
  ["body-only", "resume", "1. I tested SQL under supervision.", "I tested SQL under supervision."],
  ["fullwidth", "resume", "１２. I tested SQL under supervision.", "１２. I tested SQL under supervision."],
  ["emoji and CRLF", "resume", "😀 Profile.\r\n  1. I tested SQL under supervision.", "1. I tested SQL under supervision."],
  ["supplement", "supplement", "1. I tested SQL under supervision.", "1. I tested SQL under supervision."],
  ["JD requirement", "jd", "1. SQL experience is required.", "1. SQL experience is required."],
] as const)("keeps a numbered %s fact through actual save, reload, confirmation and planning", async (_name, kind, text, quote) => {
  const f = createMaterialMentionReviewFixture();
  try {
    const doc = await f.client.request("createDocument", { kind, displayName: "Numbered practice", text, mutationId: "create-numbered" });
    const sourceText = (await f.client.request("readDocument", { documentId: doc.documentId })).text!;
    expect(sourceText).toBe(text.replace(/\r\n?/gu, "\n"));
    const extraction = decodeMentionFact(sourceText, quote, kind === "jd" ? "requirement" : "experience");
    expect((await f.deliver(doc, extraction.items)).disposition).toBe("initialized");
    const ref = { documentId: doc.documentId, textVersionId: doc.textVersionId };
    const initial = (await f.client.request("readDocumentReviewDraft", ref)).draft!;
    expect(initial.selfAssessmentHints).toEqual(kind === "jd" ? [] : [{ id: "hint-candidate-1-0", candidateId: "candidate-1", skillLabel: "SQL", level: "guided" }]);
    expect(initial.items[0]).toMatchObject({ text: quote, skillLabels: ["SQL"], requirementLevel: kind === "jd" ? "must" : null,
      sourceRef: { documentId: doc.documentId, documentVersionId: doc.documentVersionId, textVersionId: doc.textVersionId,
        start: sourceText.indexOf(quote), end: sourceText.indexOf(quote) + quote.length } });
    const { draft } = await f.client.request("saveDocumentReviewDraft", { ...ref, extractionId: initial.extractionId,
      items: initial.items, selfAssessmentHints: initial.selfAssessmentHints, expectedRevision: initial.revision, mutationId: "save-numbered" });
    expect(draft.selfAssessmentHints).toEqual(initial.selfAssessmentHints);
    expect(draft.items).toEqual(initial.items);
    expect(draft.reviewProjection).toBe(SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION);
    expect(JSON.parse(String(f.db.database.prepare("SELECT candidates_json FROM document_extractions").get()!.candidates_json)).reviewProjection)
      .toBe(SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION);
    f.restart();
    expect((await f.client.request("readDocumentReviewDraft", ref)).draft).toEqual(draft);
    expect((await f.client.request("readDocument", { documentId: doc.documentId })).text).toBe(sourceText);
    const flow = await confirmAndSelect(f, doc, draft, kind);
    const context = await f.client.request("createMaterialContext", flow.request);
    expect(context.preview.confirmedItems[0]).toMatchObject({ text: quote, skillLabels: ["SQL"], sourceRef: initial.items[0]!.sourceRef });
    expect(context.preview.mappingDetails?.filter(row => row.status === "mapped").flatMap(row => row.skillIds)).toEqual(["sql"]);
    expect(context.preview.priorities.map(row => [row.skillId, row.tier])).toEqual([["sql", kind === "jd" ? 0 : 3]]);
    expect((await f.client.request("readMaterialContext", { contextVersionId: context.contextVersionId })).preview).toEqual(context.preview);
    expect((await f.client.request("readDocumentReviewDraft", { ...ref, includeConfirmation: "current" })).confirmation).toEqual(flow.confirmation);
  } finally { f.dispose(); }
});

it.each([
  "1. My colleague tested SQL under supervision.",
  "1. I will test SQL under supervision.",
  "1. I did not test SQL under supervision.",
  '1. My mentor said, "I tested SQL under supervision."',
])("removes the hint and personal practice when a numbered fact is edited to %s", async editedText => {
  const f = createMaterialMentionReviewFixture(), text = "1. I tested SQL under supervision.";
  try {
    const doc = await f.client.request("createDocument", { kind: "resume", displayName: "Edited numbered practice", text, mutationId: "create-edit" });
    await f.deliver(doc, decodeMentionFact(text).items);
    const ref = { documentId: doc.documentId, textVersionId: doc.textVersionId };
    const initial = (await f.client.request("readDocumentReviewDraft", ref)).draft!;
    expect(initial.selfAssessmentHints).toHaveLength(1);
    const { draft } = await f.client.request("saveDocumentReviewDraft", { ...ref, extractionId: initial.extractionId,
      items: [{ ...initial.items[0]!, text: editedText, origin: "user" }], selfAssessmentHints: initial.selfAssessmentHints,
      expectedRevision: initial.revision, mutationId: "edit-numbered" });
    expect(draft.selfAssessmentHints).toEqual([]);
    expect(draft.items[0]).toMatchObject({ text: editedText, skillLabels: ["SQL"], sourceRef: initial.items[0]!.sourceRef });
    f.restart();
    expect((await f.client.request("readDocumentReviewDraft", ref)).draft).toEqual(draft);
    const flow = await confirmAndSelect(f, doc, draft);
    const { preview } = await f.client.request("createMaterialContext", flow.request);
    expect(preview.mappingDetails?.filter(row => row.status === "mapped").flatMap(row => row.skillIds)).toEqual(["sql"]);
    expect(preview.priorities).toEqual([]);
    expect((await f.client.request("readDocument", { documentId: doc.documentId })).text).toBe(text);
  } finally { f.dispose(); }
});

it.each(["empty", "omitted", "deleted"] as const)("does not restore %s numbered source topics or hints through a saved review", async removal => {
  const f = createMaterialMentionReviewFixture(), text = "1. I tested SQL under supervision.";
  try {
    const doc = await f.client.request("createDocument", { kind: "resume", displayName: "Removed numbered topic", text, mutationId: "create-removal" });
    await f.deliver(doc, decodeMentionFact(text).items);
    const ref = { documentId: doc.documentId, textVersionId: doc.textVersionId };
    const initial = (await f.client.request("readDocumentReviewDraft", ref)).draft!, fact = initial.items[0]!;
    const { skillLabels: removed, ...withoutLabels } = fact;
    void removed;
    const save = { ...ref, extractionId: initial.extractionId, selfAssessmentHints: initial.selfAssessmentHints,
      expectedRevision: initial.revision, mutationId: "remove-numbered" };
    const { draft } = await f.client.request("saveDocumentReviewDraft", { ...save,
      items: removal === "deleted" ? [] : removal === "omitted" ? [withoutLabels] : [{ ...fact, skillLabels: [] }] });
    expect(draft.items).toEqual(removal === "deleted" ? [] : [{ ...fact, skillLabels: [] }]);
    expect(draft.selfAssessmentHints).toEqual([]);
    f.restart();
    expect((await f.client.request("readDocumentReviewDraft", ref)).draft).toEqual(draft);
    await expect(f.client.request("saveDocumentReviewDraft", { ...save, items: initial.items, expectedRevision: draft.revision,
      mutationId: "restore-old-numbered" })).rejects.toBeDefined();
    const resaved = await f.client.request("saveDocumentReviewDraft", { ...save, items: draft.items, selfAssessmentHints: draft.selfAssessmentHints,
      expectedRevision: draft.revision, mutationId: "resave-removed-numbered" });
    expect(resaved.draft.items).toEqual(draft.items);
    expect(resaved.draft.selfAssessmentHints).toEqual([]);
  } finally { f.dispose(); }
});

it("preserves numbered review ownership, source, marker, revision and reclassification guards through HTTP", async () => {
  const f = createMaterialMentionReviewFixture(), text = "1. I tested SQL under supervision.";
  try {
    const doc = await f.client.request("createDocument", { kind: "resume", displayName: "Guarded numbered practice", text, mutationId: "create-guards" });
    await f.deliver(doc, decodeMentionFact(text).items);
    const ref = { documentId: doc.documentId, textVersionId: doc.textVersionId };
    const initial = (await f.client.request("readDocumentReviewDraft", ref)).draft!, fact = initial.items[0]!;
    const save = { ...ref, extractionId: initial.extractionId, items: initial.items, selfAssessmentHints: initial.selfAssessmentHints,
      expectedRevision: initial.revision, mutationId: "save-guards" };
    await expect(f.clientFor("owner-b").request("saveDocumentReviewDraft", save)).rejects.toBeDefined();
    await expect(f.client.request("saveDocumentReviewDraft", { ...save, reviewProjection: SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION } as never)).rejects.toBeDefined();
    for (const sourceRef of [{ ...fact.sourceRef!, textVersionId: "stale-text" }, { ...fact.sourceRef!, start: fact.sourceRef!.start + 3 }]) {
      await expect(f.client.request("saveDocumentReviewDraft", { ...save, items: [{ ...fact, origin: "user", sourceRef }] })).rejects.toBeDefined();
    }
    expect((await f.client.request("readDocumentReviewDraft", ref)).draft).toEqual(initial);
    const { draft } = await f.client.request("saveDocumentReviewDraft", { ...save,
      items: [{ ...fact, kind: "constraint", origin: "user" }], mutationId: "reclassify-numbered" });
    expect(draft).toMatchObject({ items: [{ skillLabels: [] }], selfAssessmentHints: [], reclassifiedItemIds: [fact.id] });
    await expect(f.client.request("saveDocumentReviewDraft", { ...save, mutationId: "stale-numbered" })).rejects.toBeDefined();
    await expect(f.client.request("saveDocumentReviewDraft", { ...save, items: [{ ...draft.items[0]!, skillLabels: ["SQL"] }],
      skillTermAddition: { itemId: fact.id, sourceTerm: "SQL" }, expectedRevision: draft.revision, mutationId: "add-reclassified-numbered" })).rejects.toBeDefined();
    f.restart();
    expect((await f.client.request("readDocumentReviewDraft", ref)).draft).toEqual(draft);
    expect(f.trace.some(row => row.endpoint === "saveDocumentReviewDraft" && row.status === 409)).toBe(true);
  } finally { f.dispose(); }
});

it.each([
  ["negative SQL", "I have never used SQL.", ["SQL"], []],
  ["another actor's SQL", "My colleague wrote SQL queries.", ["SQL"], []],
  ["future SQL", "I plan to learn SQL next month.", ["SQL"], []],
  ["personal React and colleague SQL", "I built React components; my colleague wrote SQL queries.", ["React", "SQL"], ["react"]],
] as const)("keeps %s mapped without inventing personal practice through the real client and saved review", async (_name, text, labels, practice) => {
  const f = createMaterialMentionReviewFixture();
  try {
    const doc = await f.client.request("createDocument", { kind: "resume", displayName: "Mention review", text, mutationId: "create-mentions" });
    expect((await f.deliver(doc, [{ id: "fact", kind: "experience", text, requirementLevel: null, skillLabels: [...labels], selfLevelHint: null,
      source: { segmentId: "segment-1", quote: text } }])).disposition).toBe("initialized");
    const ref = { documentId: doc.documentId, textVersionId: doc.textVersionId };
    const initial = (await f.client.request("readDocumentReviewDraft", ref)).draft!;
    const extraction = f.db.database.prepare("SELECT * FROM document_extractions").get();
    const originalVersion = f.db.database.prepare("SELECT * FROM document_versions").get();
    const originalObjects = [...f.bucket.objects];
    const save = { ...ref, extractionId: initial.extractionId, items: initial.items, selfAssessmentHints: initial.selfAssessmentHints,
      expectedRevision: initial.revision, mutationId: "save-mentions" };
    const { draft } = await f.client.request("saveDocumentReviewDraft", save);
    const flow = await confirmAndSelect(f, doc, draft);
    const context = await f.client.request("createMaterialContext", flow.request);
    const { preview } = context;
    expect(preview.confirmedItems[0]).toMatchObject({ text, skillLabels: labels, sourceRef: initial.items[0]!.sourceRef });
    expect(preview.mappingDetails?.filter(row => row.status === "mapped").flatMap(row => row.skillIds).sort())
      .toEqual(labels.map(label => label.toLowerCase()).sort());
    expect(preview.priorities.map(row => row.skillId)).toEqual(practice);
    expect(preview.priorities.every(row => row.tier === 3 && !row.learningIntentItemIds?.length)).toBe(true);
    expect(draft.selfAssessmentHints).toEqual([]);
    const snapshot = f.db.database.prepare("SELECT snapshot_json FROM material_context_versions WHERE id=?").get(context.contextVersionId)!;
    expect(JSON.parse(String(snapshot.snapshot_json))).toMatchObject({ audit: flow.request.audit, availability: flow.request.availability, target: flow.request.target });
    f.restart();
    expect((await f.client.request("readMaterialContext", { contextVersionId: context.contextVersionId })).preview).toEqual(preview);
    expect(await f.client.request("createMaterialContext", flow.request)).toEqual(context);
    const reloaded = await f.client.request("readDocumentReviewDraft", { ...ref, includeConfirmation: "current" });
    expect(reloaded.confirmation).toEqual(flow.confirmation);
    expect(reloaded.draft).toEqual(draft);
    expect(initial.reviewProjection).toBe(SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION);
    expect(draft.reviewProjection).toBe(SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION);
    expect(await f.client.request("saveDocumentReviewDraft", save)).toEqual({ draft });
    expect(f.db.database.prepare("SELECT * FROM document_extractions").get()).toEqual(extraction);
    expect(f.db.database.prepare("SELECT * FROM document_versions").get()).toEqual(originalVersion);
    expect([...f.bucket.objects]).toEqual(originalObjects);
    expect(f.trace.filter(row => row.endpoint === "saveDocumentReviewDraft").every(row => !Object.hasOwn(row.body as object, "reviewProjection"))).toBe(true);
  } finally { f.dispose(); }
});

it("requires separate learning-intent adoption for a v3 supplemental topic and preserves planning inputs", async () => {
  const f = createMaterialMentionReviewFixture(), text = "I plan to learn SQL.";
  try {
    const doc = await f.client.request("createDocument", { kind: "supplement", displayName: "Learning intention", text, mutationId: "create-intent" });
    await f.deliver(doc, [{ id: "intent", kind: "constraint", text, requirementLevel: null, skillLabels: ["SQL"], selfLevelHint: null,
      source: { segmentId: "segment-1", quote: text } }]);
    const initial = (await f.client.request("readDocumentReviewDraft", { documentId: doc.documentId, textVersionId: doc.textVersionId })).draft!;
    const { draft } = await f.client.request("saveDocumentReviewDraft", { documentId: doc.documentId, textVersionId: doc.textVersionId,
      extractionId: initial.extractionId, items: initial.items, selfAssessmentHints: initial.selfAssessmentHints,
      expectedRevision: initial.revision, mutationId: "save-intent" });
    const flow = await confirmAndSelect(f, doc, draft, "supplement");
    const before = await f.client.request("createMaterialContext", flow.request);
    expect(before.preview.priorities).toEqual([]);
    expect(before.preview.itemReferences?.[0]?.learningIntentEligible).toBe(true);
    const learningIntents = [{ confirmationId: flow.confirmation.confirmationId, itemId: "intent" }];
    const after = await f.client.request("createMaterialContext", { ...flow.request, learningIntents, mutationId: "adopt-intent" });
    expect(after.preview.priorities).toEqual([{ skillId: "sql", tier: 3, itemIds: [after.preview.confirmedItems[0]!.id],
      practiceItemIds: [], learningIntentItemIds: [after.preview.confirmedItems[0]!.id] }]);
    expect(after.preview.confirmedItems).toEqual(before.preview.confirmedItems);
    expect(draft.selfAssessmentHints).toEqual([]);
    const row = f.db.database.prepare("SELECT snapshot_json FROM material_context_versions WHERE id=?").get(after.contextVersionId)!;
    expect(JSON.parse(String(row.snapshot_json))).toMatchObject({ learningIntents, audit: flow.request.audit,
      availability: flow.request.availability, target: flow.request.target });
    expect((await f.client.request("readDocumentReviewDraft", { documentId: doc.documentId, textVersionId: doc.textVersionId })).draft).toEqual(draft);
  } finally { f.dispose(); }
});

it.each([["I wrote SQL queries.", ["sql"]], ["I have never used SQL.", []]] as const)(
  "preserves manual fallback behavior through the same review and planning routes: %s", async (text, practice) => {
    const f = createMaterialMentionReviewFixture();
    try {
      const doc = await f.client.request("createDocument", { kind: "resume", displayName: "Manual review", text, mutationId: "create-manual" });
      const { draft } = await f.client.request("saveDocumentReviewDraft", { documentId: doc.documentId, textVersionId: doc.textVersionId,
        extractionId: null, items: [{ id: "manual", kind: "experience", text, origin: "user", sourceRef: null, requirementLevel: null }],
        selfAssessmentHints: [], expectedRevision: 0, mutationId: "save-manual" });
      const flow = await confirmAndSelect(f, doc, draft);
      const { preview } = await f.client.request("createMaterialContext", flow.request);
      expect(preview.mappingDetails?.[0]).toMatchObject({ status: "mapped", skillIds: ["sql"], basis: "literal" });
      expect(preview.priorities.map(row => row.skillId)).toEqual(practice);
      expect(draft).not.toHaveProperty("reviewProjection");
      expect(draft.items[0]).not.toHaveProperty("skillLabels");
      expect((await f.client.request("readDocumentReviewDraft", { documentId: doc.documentId, textVersionId: doc.textVersionId })).draft).toEqual(draft);
      const row = f.db.database.prepare("SELECT snapshot_json FROM material_context_versions").get()!;
      expect(JSON.parse(String(row.snapshot_json))).toMatchObject({ audit: flow.request.audit, availability: flow.request.availability, target: flow.request.target });
    } finally { f.dispose(); }
  });

it("keeps the source-add quota at eight v3 topics and does not restore a ninth word by omission", async () => {
  const f = createMaterialMentionReviewFixture(), labels = ["SQL", "React", "TypeScript", "Docker", "Python", "Rust", "Vitest", "WAI-ARIA"];
  const text = `I have never used ${labels.join(", ")} or CSS.`;
  try {
    const doc = await f.client.request("createDocument", { kind: "resume", displayName: "Topics", text, mutationId: "create-topics" });
    await f.deliver(doc, [{ id: "many", kind: "experience", text, requirementLevel: null, skillLabels: labels, selfLevelHint: null,
      source: { segmentId: "segment-1", quote: text } }]);
    const ref = { documentId: doc.documentId, textVersionId: doc.textVersionId };
    const initial = (await f.client.request("readDocumentReviewDraft", ref)).draft!;
    const save = { ...ref, extractionId: initial.extractionId, selfAssessmentHints: [], expectedRevision: initial.revision, mutationId: "ninth-topic" };
    const item = { ...initial.items[0]!, origin: "user" as const };
    await expect(f.client.request("saveDocumentReviewDraft", { ...save, items: [{ ...item, skillLabels: [...labels, "CSS"] }],
      skillTermAddition: { itemId: item.id, sourceTerm: "CSS" } })).rejects.toBeDefined();
    expect((await f.client.request("readDocumentReviewDraft", ref)).draft).toEqual(initial);
    const room = await f.client.request("saveDocumentReviewDraft", { ...save, items: [{ ...item, skillLabels: labels.slice(0, 7) }], mutationId: "make-room" });
    const corrected = await f.client.request("saveDocumentReviewDraft", { ...save, expectedRevision: room.draft.revision,
      items: [{ ...room.draft.items[0]!, skillLabels: [...labels.slice(0, 7), "CSS"] }],
      skillTermAddition: { itemId: item.id, sourceTerm: "CSS" }, mutationId: "eighth-topic" });
    expect(corrected.draft.items[0]?.skillLabels).toEqual([...labels.slice(0, 7), "CSS"]);
    expect(corrected.draft.selfAssessmentHints).toEqual([]);
    expect((await f.client.request("readDocumentReviewDraft", ref)).draft).toEqual(corrected.draft);
  } finally { f.dispose(); }
});
