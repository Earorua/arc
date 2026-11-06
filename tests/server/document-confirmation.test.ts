// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { setup, closeMaterialsFixtures } from "../helpers/material-storage-fixture";
afterEach(closeMaterialsFixtures);
async function confirmedJd() {
    const { services, owner, db } = setup();
    const doc = await services.createDocument(owner, { kind: "jd", displayName: "公司 B", text: "SQL is required", mutationId: "new-jd" });
    const ref = { documentId: doc.documentId, textVersionId: doc.textVersionId };
    const item = { id: "req", kind: "requirement" as const, text: "SQL is required", origin: "user" as const, sourceRef: null, requirementLevel: "must" as const };
    const save = { ...ref, extractionId: null, items: [item], selfAssessmentHints: [], expectedRevision: 0, mutationId: "review-jd" };
    const { draft } = await services.saveDocumentReviewDraft(owner, save);
    const receipt = await services.createDocumentConfirmation(owner, { ...ref, documentVersionId: doc.documentVersionId, items: draft.items,
        reviewRevision: draft.revision, expectedRevision: doc.revision, mutationId: "confirm-jd" });
    return { services, owner, db, doc, ref: { ...ref, includeConfirmation: "current" as const }, save, draft, receipt };
}
it("returns the existing confirmation only for the owner's unchanged, reviewed current version", async () => {
    const { services, owner, db, ref, save, draft, receipt } = await confirmedJd();
    expect(await services.readDocumentReviewDraft(owner, { documentId: ref.documentId, textVersionId: ref.textVersionId })).toEqual({ draft });
    expect(await services.readDocumentReviewDraft(owner, ref)).toEqual({ draft, confirmation: receipt });
    await expect(services.readDocumentReviewDraft({ ownerId: "other-owner" }, ref)).rejects.toMatchObject({ code: "not-found" });
    const { draft: edited } = await services.saveDocumentReviewDraft(owner, { ...save, expectedRevision: draft.revision, mutationId: "edit-jd" });
    expect(edited.items).toEqual(draft.items);
    expect((await services.readDocumentReviewDraft(owner, ref)).confirmation).toBeUndefined();
    expect(db.database.prepare("SELECT count(*) n FROM document_confirmations").get()).toMatchObject({ n: 1 });
});
it("does not offer a confirmation with different facts or review decisions, or a revoked or superseded version", async () => {
    const { services, owner, db, doc, ref, draft, receipt } = await confirmedJd();
    const set = (field: string, value: string) => db.database.prepare(`UPDATE document_confirmations SET ${field}=? WHERE id=?`).run(value, receipt.confirmationId);
    set("items_json", "[]");
    expect((await services.readDocumentReviewDraft(owner, ref)).confirmation).toBeUndefined();
    set("items_json", JSON.stringify(draft.items));
    set("review_points_json", '[{"resolution":"ignored"}]');
    expect((await services.readDocumentReviewDraft(owner, ref)).confirmation).toBeUndefined();
    set("review_points_json", "[]");
    set("state", "revoked");
    expect((await services.readDocumentReviewDraft(owner, ref)).confirmation).toBeUndefined();
    set("state", "active");
    const replacement = await services.createDocumentVersion(owner, { documentId: doc.documentId, text: "New JD", expectedRevision: receipt.revision, mutationId: "replace-jd" });
    expect((await services.readDocumentReviewDraft(owner, ref)).confirmation).toBeUndefined();
    expect((await services.readDocumentReviewDraft(owner, { documentId: doc.documentId, textVersionId: replacement.textVersionId })).confirmation).toBeUndefined();
    await services.deleteDocument(owner, { documentId: doc.documentId, expectedRevision: replacement.revision, mutationId: "delete-jd" });
    await expect(services.readDocumentReviewDraft(owner, ref)).rejects.toMatchObject({ code: "gone" });
});
it("keeps the current version reusable after a separate historical review and never falls back to a revoked version's predecessor", async () => {
    const { services, owner, db, doc, save, draft, receipt } = await confirmedJd();
    const version = await services.createDocumentVersion(owner, { documentId: doc.documentId, text: "SQL reporting", expectedRevision: receipt.revision, mutationId: "new-version" });
    const currentRef = { documentId: doc.documentId, textVersionId: version.textVersionId, includeConfirmation: "current" as const };
    const { draft: review } = await services.saveDocumentReviewDraft(owner, { ...save, textVersionId: version.textVersionId, mutationId: "new-review" });
    const request = { documentId: doc.documentId, documentVersionId: version.documentVersionId, textVersionId: version.textVersionId,
        items: review.items, reviewRevision: review.revision, expectedRevision: version.revision, mutationId: "current-confirm" };
    const current = await services.createDocumentConfirmation(owner, request);
    const historic = await services.createDocumentConfirmation(owner, { ...request, documentVersionId: doc.documentVersionId, textVersionId: doc.textVersionId,
        items: draft.items, reviewRevision: draft.revision, expectedRevision: current.revision, mutationId: "historical-confirm" });
    expect((await services.readDocumentReviewDraft(owner, currentRef)).confirmation).toEqual({ confirmationId: current.confirmationId, revision: historic.revision });
    const latest = await services.createDocumentConfirmation(owner, { ...request, expectedRevision: historic.revision, mutationId: "newer-confirm" });
    db.database.prepare("UPDATE document_confirmations SET state='revoked' WHERE id=?").run(latest.confirmationId);
    expect((await services.readDocumentReviewDraft(owner, currentRef)).confirmation).toBeUndefined();
});
it("requires current reviewed facts and rejects stale confirmation without new rows", async () => {
    const { services, owner, db } = setup();
    const doc = await services.createDocument(owner, { kind: "jd", displayName: "J", text: "SQL", mutationId: "create" });
    const request = {
        documentId: doc.documentId,
        textVersionId: doc.textVersionId,
        extractionId: null,
        items: [],
        selfAssessmentHints: [],
        expectedRevision: 0,
        mutationId: "review"
    };
    const { draft } = await services.saveDocumentReviewDraft(owner, request);
    const confirm = {
        documentId: doc.documentId,
        documentVersionId: doc.documentVersionId,
        textVersionId: doc.textVersionId,
        items: [],
        reviewRevision: draft.revision,
        expectedRevision: 0,
        mutationId: "confirm"
    };
    const first = await services.createDocumentConfirmation(owner, confirm);
    expect(await services.createDocumentConfirmation(owner, confirm)).toEqual(first);
    await expect(services.createDocumentConfirmation(owner, { ...confirm, mutationId: "stale" })).rejects.toMatchObject({ code: "conflict" });
    expect(db.database.prepare("SELECT count(*) n FROM document_confirmations").get()).toMatchObject({ n: 1 });
    await expect(services.createDocumentConfirmation(owner, { ...confirm, expectedRevision: 1, reviewRevision: 0, mutationId: "old-review" })).rejects.toMatchObject({ code: "conflict" });
});
