// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { setup, closeMaterialsFixtures } from "../helpers/material-storage-fixture";
afterEach(closeMaterialsFixtures);
import { DeletionService } from "../../app/server/documents/deletion-service";
import { D1DocumentRepository } from "../../app/server/documents/d1-repository";
import { DocumentStorage } from "../../app/server/documents/storage";
import { materialsClock } from "../helpers/materials-d1";
it("revokes reads and drafts immediately and completes only after private objects are absent", async () => {
    const { services, owner, db, bucket } = setup();
    const receipt = await services.createDocument(owner, {
        kind: "resume",
        displayName: "PRIVATE-MATERIAL-SENTINEL-7f91",
        text: "PRIVATE-MATERIAL-SENTINEL-7f91",
        mutationId: "create"
    });
    const request = { documentId: receipt.documentId, expectedRevision: 0, mutationId: "delete" };
    const deletion = await services.deleteDocument(owner, request);
    expect(await services.deleteDocument(owner, request)).toEqual(deletion);
    await expect(services.readDocument(owner, { documentId: receipt.documentId })).rejects.toMatchObject({ code: "gone" });
    const service = new DeletionService(new D1DocumentRepository(db as unknown as D1Database, materialsClock), new DocumentStorage(bucket));
    expect((await service.reconcile(owner, { deletionJobId: deletion.deletionJobId })).state).toBe("completed");
    expect(bucket.objects.size).toBe(0);
    expect(db.database.prepare("SELECT display_name,lifecycle FROM documents").get()).toMatchObject({ display_name: "已删除", lifecycle: "deleted" });
});
it("keeps cleanup pending across a storage deletion failure and retries safely", async () => {
    const { services, owner, db, bucket } = setup();
    const receipt = await services.createDocument(owner, { kind: "resume", displayName: "R", text: "SQL", mutationId: "create" });
    const deletion = await services.deleteDocument(owner, { documentId: receipt.documentId, expectedRevision: 0, mutationId: "delete" });
    let fails = true;
    const service = new DeletionService(new D1DocumentRepository(db as unknown as D1Database, materialsClock), new DocumentStorage({
        ...bucket,
        delete: async (key: string) => {
            if (fails)
                throw Error("offline");
            await bucket.delete(key);
        }
    }));
    expect((await service.reconcile(owner, { deletionJobId: deletion.deletionJobId })).state).toBe("failed");
    expect(bucket.objects.size).toBe(1);
    fails = false;
    expect((await service.reconcile(owner, { deletionJobId: deletion.deletionJobId })).state).toBe("completed");
});
