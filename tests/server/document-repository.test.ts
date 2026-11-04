// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { setup, closeMaterialsFixtures } from "../helpers/material-storage-fixture";
afterEach(closeMaterialsFixtures);
it("rolls back the confirmation and document revision when the final mutation guard fails", async () => {
    const { services, owner, db } = setup();
    const doc = await services.createDocument(owner, { kind: "jd", displayName: "JD", text: "SQL", mutationId: "create" });
    const { draft } = await services.saveDocumentReviewDraft(owner, {
        documentId: doc.documentId,
        textVersionId: doc.textVersionId,
        extractionId: null,
        items: [],
        selfAssessmentHints: [],
        expectedRevision: 0,
        mutationId: "save"
    });
    db.failAtBatchStatement = 5;
    await expect(services.createDocumentConfirmation(owner, {
        documentId: doc.documentId,
        documentVersionId: doc.documentVersionId,
        textVersionId: doc.textVersionId,
        items: [],
        reviewRevision: draft.revision,
        expectedRevision: 0,
        mutationId: "confirm"
    })).rejects.toMatchObject({ code: "conflict" });
    db.failAtBatchStatement = null;
    expect(db.database.prepare("SELECT revision FROM documents").get()).toMatchObject({ revision: 0 });
    expect(db.database.prepare("SELECT count(*) n FROM document_confirmations").get()).toMatchObject({ n: 0 });
    expect(db.database.prepare("SELECT count(*) n FROM document_mutations WHERE endpoint='createDocumentConfirmation'").get()).toMatchObject({ n: 0 });
});
it("admits only one concurrent save at the expected draft revision", async () => {
    const { services, owner } = setup();
    const doc = await services.createDocument(owner, { kind: "resume", displayName: "R", text: "SQL", mutationId: "create" });
    const request = {
        documentId: doc.documentId,
        textVersionId: doc.textVersionId,
        extractionId: null,
        items: [],
        selfAssessmentHints: [],
        expectedRevision: 0
    };
    const outcomes = await Promise.allSettled(["one", "two"].map(mutationId => services.saveDocumentReviewDraft(owner, { ...request, mutationId })));
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect((await services.readDocumentReviewDraft(owner, { documentId: doc.documentId, textVersionId: doc.textVersionId })).draft?.revision).toBe(1);
});
