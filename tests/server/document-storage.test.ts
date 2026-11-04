// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { setup, closeMaterialsFixtures } from "../helpers/material-storage-fixture";
import { DocumentService, createDocumentServices } from "../../app/server/documents/service";
import { D1DocumentRepository } from "../../app/server/documents/d1-repository";
import { DocumentStorage } from "../../app/server/documents/storage";
import { materialsClock } from "../helpers/materials-d1";
afterEach(closeMaterialsFixtures);
it("releases an aborted version reservation only after its private object is reclaimed", async () => {
    const { services, owner, db, bucket } = setup();
    const doc = await services.createDocument(owner, { kind: "resume", displayName: "R", text: "SQL", mutationId: "create" });
    for (let n = 1; n < 9; n++)
        await services.createDocumentVersion(owner, { documentId: doc.documentId, text: `text${n}`, expectedRevision: n - 1, mutationId: `v-${n}` });
    const broken = createDocumentServices({
        db: db as unknown as D1Database,
        clock: materialsClock,
        bucket: { ...bucket, createMultipartUpload: async () => { throw Error("offline"); } }
    });
    await expect(broken.createDocumentVersion(owner, { documentId: doc.documentId, text: "aborted", expectedRevision: 8, mutationId: "broken" })).rejects.toMatchObject({ code: "unavailable" });
    const service = new DocumentService(new D1DocumentRepository(db as unknown as D1Database, materialsClock), new DocumentStorage(bucket));
    await service.reclaimStorage();
    expect((await services.createDocumentVersion(owner, { documentId: doc.documentId, text: "recovered", expectedRevision: 8, mutationId: "recovered" })).revision).toBe(9);
});
it("persists normalized private text and replays identical creates without quota consumption", async () => {
    const { db, bucket, services, owner } = setup();
    const request = { kind: "resume" as const, displayName: "Resume", text: "\uFEFF经历\r\nSQL", mutationId: "create-1" };
    const receipt = await services.createDocument(owner, request);
    expect(await services.createDocument(owner, request)).toEqual(receipt);
    expect(bucket.objects.size).toBe(1);
    expect(db.database.prepare("SELECT count(*) n FROM document_versions").get()).toMatchObject({ n: 1 });
    expect((await services.readDocument(owner, { documentId: receipt.documentId })).text).toBe("经历\nSQL");
    await expect(services.readDocument({ ownerId: "owner-b" }, { documentId: receipt.documentId })).rejects.toMatchObject({ code: "not-found" });
    await expect(services.createDocument(owner, { ...request, text: "changed" })).rejects.toMatchObject({ code: "conflict" });
});
it("rejects stale version writes and version quotas before writing R2", async () => {
    const { bucket, services, owner } = setup();
    const receipt = await services.createDocument(owner, { kind: "jd", displayName: "JD", text: "SQL", mutationId: "create" });
    for (let n = 1; n < 10; n++)
        await services.createDocumentVersion(owner, {
            documentId: receipt.documentId,
            text: `SQL ${n}`,
            expectedRevision: n - 1,
            mutationId: `version-${n}`
        });
    await expect(services.createDocumentVersion(owner, { documentId: receipt.documentId, text: "stale", expectedRevision: 0, mutationId: "stale" })).rejects.toMatchObject({ code: "conflict" });
    await expect(services.createDocumentVersion(owner, { documentId: receipt.documentId, text: "over", expectedRevision: 9, mutationId: "over" })).rejects.toMatchObject({ code: "quota-exceeded" });
    expect(bucket.objects.size).toBe(10);
});
it("makes quota races admit at most one final document and no orphan object", async () => {
    const { bucket, services, owner } = setup();
    for (let n = 0; n < 29; n++)
        await services.createDocument(owner, { kind: "resume", displayName: "R", text: "SQL", mutationId: `create-${n}` });
    const results = await Promise.allSettled(["last-a", "last-b"].map(mutationId => services.createDocument(owner, { kind: "resume", displayName: "R", text: "SQL", mutationId })));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(bucket.objects.size).toBe(30);
});
it("recovers only owner-bound active write receipts without retaining private bodies", async () => {
    const { services, owner, db } = setup();
    const receipt = await services.createDocument(owner, { kind: "resume", displayName: "R", text: "PRIVATE-MATERIAL-SENTINEL-7f91", mutationId: "recover" });
    expect(await services.readDocumentMutation(owner, { endpoint: "createDocument", mutationId: "recover" })).toEqual({ receipt });
    expect(await services.readDocumentMutation({ ownerId: "owner-b" }, { endpoint: "createDocument", mutationId: "recover" })).toEqual({ receipt: null });
    expect(JSON.stringify(db.database.prepare("SELECT * FROM document_mutations").all())).not.toContain("PRIVATE-MATERIAL-SENTINEL-7f91");
    await services.deleteDocument(owner, { documentId: receipt.documentId, expectedRevision: 0, mutationId: "delete" });
    await expect(services.readDocumentMutation(owner, { endpoint: "createDocument", mutationId: "recover" })).rejects.toMatchObject({ code: "gone" });
});
