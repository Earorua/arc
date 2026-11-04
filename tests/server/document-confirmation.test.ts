// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { setup, closeMaterialsFixtures } from "../helpers/material-storage-fixture";
afterEach(closeMaterialsFixtures);
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
