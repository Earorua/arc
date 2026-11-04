// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { setup, closeMaterialsFixtures } from "../helpers/material-storage-fixture";
afterEach(closeMaterialsFixtures);
it("selects a confirmed version without a goal and preserves it when the library gains a new version", async () => {
    const { services, owner, db } = setup();
    const receipt = await services.createDocument(owner, { kind: "jd", displayName: "JD", text: "SQL", mutationId: "create" });
    const { draft } = await services.saveDocumentReviewDraft(owner, {
        documentId: receipt.documentId,
        textVersionId: receipt.textVersionId,
        extractionId: null,
        items: [],
        selfAssessmentHints: [],
        expectedRevision: 0,
        mutationId: "save"
    });
    const confirmation = await services.createDocumentConfirmation(owner, {
        documentId: receipt.documentId,
        documentVersionId: receipt.documentVersionId,
        textVersionId: receipt.textVersionId,
        reviewRevision: draft.revision,
        items: [],
        expectedRevision: 0,
        mutationId: "confirm"
    });
    const entry = {
        slot: "jd" as const,
        documentId: receipt.documentId,
        documentVersionId: receipt.documentVersionId,
        confirmationId: confirmation.confirmationId
    };
    const selected = await services.createMaterialSelection(owner, {
        scope: { kind: "draft", draftId: "draft", previousGoalId: null },
        entries: [entry],
        mutationId: "select"
    });
    await services.createDocumentVersion(owner, {
        documentId: receipt.documentId,
        text: "SQL updated",
        expectedRevision: 1,
        mutationId: "new-version"
    });
    const read = await services.readMaterialSelection(owner, { selectionId: selected.selectionId });
    expect(read.selection.entries).toEqual([entry]);
    expect(read.versions[0]?.state).toBe("superseded");
    await expect(services.createMaterialSelection({ ownerId: "owner-b" }, {
        scope: { kind: "draft", draftId: "draft", previousGoalId: null },
        entries: [entry],
        mutationId: "steal"
    })).rejects.toMatchObject({ code: "not-found" });
    db.database.prepare("INSERT INTO material_selections VALUES('owner-b','s','{}',0,'active',NULL,NULL,0,0)").run();
    expect(() => db.database.prepare("INSERT INTO material_selection_entries VALUES('owner-b','s','jd',?,?,?)").run(entry.documentId, entry.documentVersionId, entry.confirmationId)).toThrow(/FOREIGN KEY/u);
    await services.updateMaterialSelection(owner, { selectionId: selected.selectionId, entries: [], expectedRevision: 0, mutationId: "update" });
    await expect(services.updateMaterialSelection(owner, { selectionId: selected.selectionId, entries: [entry], expectedRevision: 0, mutationId: "stale" })).rejects.toMatchObject({ code: "conflict" });
});
