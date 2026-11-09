// @vitest-environment node
import { expect, it } from "vitest";
import { SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION, type DocumentReviewDraft } from "../../app/contracts/documents";
import type { DocumentEndpointResponse } from "../../app/contracts/documents-api";
import { createMaterialMentionReviewFixture } from "../helpers/material-mention-review-fixture";
import { materialContextRequest } from "../helpers/material-planning";

type Fixture = ReturnType<typeof createMaterialMentionReviewFixture>;
async function confirmAndSelect(f: Fixture, doc: DocumentEndpointResponse<"createDocument">, draft: DocumentReviewDraft, slot: "resume" | "supplement" = "resume") {
  const confirmation = await f.client.request("createDocumentConfirmation", { documentId: doc.documentId,
    documentVersionId: doc.documentVersionId, textVersionId: doc.textVersionId, items: draft.items,
    reviewRevision: draft.revision, expectedRevision: doc.revision, mutationId: "confirm-mentions" });
  const inputs = materialContextRequest();
  const selectionRef = await f.client.request("createMaterialSelection", { scope: inputs.scope,
    entries: [{ slot, documentId: doc.documentId, documentVersionId: doc.documentVersionId, confirmationId: confirmation.confirmationId }],
    mutationId: "select-mentions" });
  return { confirmation, request: { ...inputs, selectionRef } };
}

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
