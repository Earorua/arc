// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { setup, closeMaterialsFixtures } from "../helpers/material-storage-fixture";
afterEach(closeMaterialsFixtures);
import { createDocumentServices, DocumentService } from "../../app/server/documents/service";
import { DeletionService } from "../../app/server/documents/deletion-service";
import { D1DocumentRepository } from "../../app/server/documents/d1-repository";
import { DocumentStorage } from "../../app/server/documents/storage";
import { materialsClock } from "../helpers/materials-d1";

function addPriorWriter(fixture: ReturnType<typeof setup>, documentId: string, protocol: string | null, generation = 0) {
    const db = fixture.db.database;
    const key = ["materials", fixture.owner.ownerId, documentId, generation, "prior-version", "prior-op"].join("/");
    db.prepare(`INSERT INTO document_versions(owner_id,document_id,id,text_version_id,state,generation,revision,text_digest,object_key,utf8_bytes,code_points,segments_json,parser_version,created_at)
        SELECT owner_id,document_id,'prior-version','prior-text','pending',?,1,text_digest,?,5,5,'[]',parser_version,created_at FROM document_versions WHERE document_id=? LIMIT 1`).run(generation, key, documentId);
    db.prepare(`INSERT INTO document_text_versions(owner_id,document_id,document_version_id,id,parser_version,text_hash,object_key,created_at)
        SELECT owner_id,document_id,id,text_version_id,parser_version,text_digest,object_key,created_at FROM document_versions WHERE id='prior-version'`).run();
    db.prepare(`INSERT INTO document_storage_operations(owner_id,id,document_id,document_version_id,object_key,generation,expected_revision,state,next_attempt_at,mutation_endpoint,mutation_id,body_digest,created_at,writer_protocol)
        VALUES('owner-a','prior-op',?,'prior-version',?,?,0,'writing',0,'createDocumentVersion','prior-save','prior-digest',0,?)`).run(documentId, key, generation, protocol);
    return key;
}
function priorReceipt(fixture: ReturnType<typeof setup>, documentId: string, versionId: string, revision = 1) {
    fixture.db.database.prepare(`INSERT INTO document_mutations(owner_id,endpoint,mutation_id,body_digest,result_json,created_at)
        VALUES('owner-a','createDocumentVersion','prior-save','prior-digest',?,0)`).run(JSON.stringify({ documentId, documentVersionId: versionId, textVersionId: "prior-text", revision }));
}

it("recovers a writer lost after storing the text and before its D1 receipt", async () => {
    const { services, owner, db, bucket } = setup();
    const initial = await services.createDocument(owner, { kind: "resume", displayName: "R", text: "old", mutationId: "create" });
    const repository = new D1DocumentRepository(db as unknown as D1Database, materialsClock);
    const storage = new DocumentStorage(bucket);
    const documents = new DocumentService(repository, storage);
    const cleaner = new DeletionService(repository, storage);
    const atCommit = Promise.withResolvers<void>();
    vi.spyOn(repository, "commit").mockImplementationOnce(async () => {
        atCommit.resolve();
        return new Promise<never>(() => {});
    });
    void documents.createDocumentVersion(owner, { documentId: initial.documentId, text: "lost writer", expectedRevision: 0, mutationId: "lost" });
    await atCommit.promise;
    expect(bucket.objects.size).toBe(2);
    expect(db.database.prepare("SELECT state,writer_terminated FROM document_storage_operations WHERE mutation_id='lost'").get()).toMatchObject({ state: "writing", writer_terminated: 0 });
    const request = { documentId: initial.documentId, expectedRevision: 0, mutationId: "delete" };
    const deletion = await services.deleteDocument(owner, request);
    const job = { deletionJobId: deletion.deletionJobId };
    await Promise.all([cleaner.maintain(), documents.reclaimStorage(), cleaner.reconcile(owner, job)]);
    expect((await cleaner.readDocumentDeletion(owner, job)).state).toBe("completed");
    expect(await services.deleteDocument(owner, request)).toEqual(deletion);
    expect((await services.deleteDocument(owner, { ...request, mutationId: "delete-again" })).deletionJobId).toBe(job.deletionJobId);
    expect((await cleaner.reconcile(owner, job)).state).toBe("completed");
    expect(bucket.objects.size).toBe(0);
});
it("fences an in-flight completion before deletion and refuses to resurrect its document", async () => {
    const { services, owner, db, bucket } = setup();
    const initial = await services.createDocument(owner, { kind: "resume", displayName: "R", text: "old", mutationId: "create" });
    let unblock!: () => void, started!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    const pending = new Promise<void>(resolve => { unblock = resolve; });
    const slow = createDocumentServices({
        db: db as unknown as D1Database,
        clock: materialsClock,
        bucket: {
            ...bucket,
            async createMultipartUpload(key) {
                const upload = await bucket.createMultipartUpload(key);
                return { ...upload, async complete(parts) { started(); await pending; await upload.complete(parts); } };
            }
        }
    });
    const late = slow.createDocumentVersion(owner, { documentId: initial.documentId, text: "late", expectedRevision: 0, mutationId: "late" });
    await entered;
    const deletion = await services.deleteDocument(owner, { documentId: initial.documentId, expectedRevision: 0, mutationId: "delete" });
    const cleaner = new DeletionService(new D1DocumentRepository(db as unknown as D1Database, materialsClock), new DocumentStorage(bucket));
    expect((await cleaner.reconcile(owner, { deletionJobId: deletion.deletionJobId })).state).toBe("completed");
    expect(bucket.objects.size).toBe(0);
    unblock();
    await expect(late).rejects.toMatchObject({ code: "unavailable" });
    expect((await cleaner.reconcile(owner, { deletionJobId: deletion.deletionJobId })).state).toBe("completed");
    expect(bucket.objects.size).toBe(0);
    expect(db.database.prepare("SELECT lifecycle FROM documents").get()).toMatchObject({ lifecycle: "deleted" });
    expect(db.database.prepare("SELECT count(*) n FROM document_storage_operations WHERE state<>'deleted'").get()).toMatchObject({ n: 0 });
});
it("closes admission before an allocated but unenrolled handle can send its first byte", async () => {
    const { services, owner, db, bucket } = setup();
    const initial = await services.createDocument(owner, { kind: "resume", displayName: "R", text: "old", mutationId: "create" });
    const opened = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    const sent = vi.fn();
    const writer = createDocumentServices({ db: db as unknown as D1Database, clock: materialsClock, bucket: {
        ...bucket,
        async createMultipartUpload(key) {
            const handle = await bucket.createMultipartUpload(key);
            opened.resolve();
            await release.promise;
            return { ...handle, async uploadPart(n, text) { sent(); return handle.uploadPart(n, text); } };
        }
    } });
    const saving = writer.createDocumentVersion(owner, { documentId: initial.documentId, text: "late", expectedRevision: 0, mutationId: "unadmitted" });
    await opened.promise;
    const deletion = await services.deleteDocument(owner, { documentId: initial.documentId, expectedRevision: 0, mutationId: "delete" });
    const cleaner = new DeletionService(new D1DocumentRepository(db as unknown as D1Database), new DocumentStorage(bucket));
    expect((await cleaner.reconcile(owner, { deletionJobId: deletion.deletionJobId })).state).toBe("completed");
    release.resolve();
    await expect(saving).rejects.toMatchObject({ code: "conflict" });
    expect(sent).not.toHaveBeenCalled();
    expect(bucket.objects.size).toBe(0);
});
it.each(["no receipt", "wrong receipt", "stale revision", "unknown protocol", "wrong generation"] as const)(
    "keeps an unproven writer pending despite a flag, empty key, elapsed time and positive executor response (%s)", async (fault) => {
        const fixture = setup(), { services, owner, db, bucket } = fixture;
        const initial = await services.createDocument(owner, { kind: "resume", displayName: "R", text: "old", mutationId: "create" });
        const key = addPriorWriter(fixture, initial.documentId, fault === "unknown protocol" ? "other-writer" : null, fault === "wrong generation" ? 3 : 0);
        if (fault !== "no receipt") priorReceipt(fixture, initial.documentId, fault === "wrong receipt" ? "stale-version" : "prior-version", fault === "stale revision" ? 7 : 1);
        // Old cleanup could mark an ambiguous raw PUT deleted on the basis of its writer flag.
        db.database.exec("UPDATE document_storage_operations SET state='deleted',writer_terminated=1 WHERE id='prior-op'");
        const repo = new D1DocumentRepository(db as unknown as D1Database, () => new Date("2030-01-01"));
        const cleaner = new DeletionService(repo, new DocumentStorage(bucket), { cancelForDocument: async () => ({ writersTerminated: true, resultsAbsent: true }) });
        const deletion = await services.deleteDocument(owner, { documentId: initial.documentId, expectedRevision: 0, mutationId: "delete" });
        const job = { deletionJobId: deletion.deletionJobId };
        await Promise.all([new DocumentService(repo, new DocumentStorage(bucket)).reclaimStorage(), cleaner.maintain()]);
        expect((await cleaner.reconcile(owner, job)).state).toBe("cleaning");
        await bucket.put(key, "late legacy bytes");
        expect((await cleaner.reconcile(owner, job)).state).toBe("cleaning");
        expect(await (await bucket.get(key))!.text()).toBe("late legacy bytes");
        expect(db.database.prepare("SELECT lifecycle FROM documents").get()).toMatchObject({ lifecycle: "cleanup-pending" });
    });
it("recognizes the earlier successful post-PUT commit for its exact legacy version", async () => {
    const f = setup(), { services, owner, db, bucket } = f;
    const initial = await services.createDocument(owner, { kind: "resume", displayName: "R", text: "old", mutationId: "create" });
    const key = addPriorWriter(f, initial.documentId, null);
    await bucket.put(key, "committed earlier");
    priorReceipt(f, initial.documentId, "prior-version");
    const deletion = await services.deleteDocument(owner, { documentId: initial.documentId, expectedRevision: 0, mutationId: "delete" });
    const cleaner = new DeletionService(new D1DocumentRepository(db as unknown as D1Database), new DocumentStorage(bucket));
    expect((await cleaner.reconcile(owner, { deletionJobId: deletion.deletionJobId })).state).toBe("completed");
    expect(bucket.objects.size).toBe(0);
});
it("refuses a handle scoped to a different owner and an ambiguous native abort, then retries and verifies readback", async () => {
    const { services, owner, db, bucket } = setup();
    const initial = await services.createDocument(owner, { kind: "resume", displayName: "A", text: "first", mutationId: "mine" });
    const other = await services.createDocument({ ownerId: "owner-b" }, { kind: "resume", displayName: "B", text: "other", mutationId: "other" });
    const foreign = db.database.prepare("SELECT object_key,r2_upload_id FROM document_storage_operations WHERE owner_id='owner-b'").get()!;
    const deletion = await services.deleteDocument(owner, { documentId: initial.documentId, expectedRevision: 0, mutationId: "delete" });
    const job = { deletionJobId: deletion.deletionJobId };
    const repo = new D1DocumentRepository(db as unknown as D1Database);
    db.database.exec("DELETE FROM document_mutations WHERE mutation_id='mine'");
    const foreignHandle = bucket.resumeMultipartUpload(String(foreign.object_key), String(foreign.r2_upload_id));
    const foreignAbort = vi.spyOn(foreignHandle, "abort");
    const mismatched = new DeletionService(repo, new DocumentStorage({ ...bucket, resumeMultipartUpload: () => foreignHandle }));
    expect((await mismatched.reconcile(owner, job)).state).toBe("failed");
    expect((await repo.document(owner.ownerId, initial.documentId, false)).lifecycle).toBe("cleanup-pending");
    expect(foreignAbort).not.toHaveBeenCalled();
    const failedAbort = new DeletionService(repo, new DocumentStorage({ ...bucket, resumeMultipartUpload: (key, id) => ({
        ...bucket.resumeMultipartUpload(key, id), abort: async () => { throw new Error("unknown upload or unavailable"); }
    }) }));
    expect((await failedAbort.reconcile(owner, job)).state).toBe("failed");
    const failedDelete = new DeletionService(repo, new DocumentStorage({ ...bucket, delete: async () => {} }));
    expect((await failedDelete.reconcile(owner, job)).state).toBe("failed");
    expect(bucket.objects.size).toBe(2);
    const recovered = new DeletionService(repo, new DocumentStorage(bucket));
    expect((await recovered.reconcile(owner, job)).state).toBe("completed");
    expect(bucket.objects.size).toBe(1);
    expect((await services.readDocument({ ownerId: "owner-b" }, { documentId: other.documentId })).text).toBe("other");
});
it("keeps a registered text/version key with no corresponding writer operation pending", async () => {
    const { services, owner, db, bucket } = setup();
    const doc = await services.createDocument(owner, { kind: "resume", displayName: "R", text: "orphan", mutationId: "create" });
    db.database.exec("DELETE FROM document_storage_operations");
    const deletion = await services.deleteDocument(owner, { documentId: doc.documentId, expectedRevision: 0, mutationId: "delete" });
    const cleaner = new DeletionService(new D1DocumentRepository(db as unknown as D1Database), new DocumentStorage(bucket));
    expect((await cleaner.reconcile(owner, { deletionJobId: deletion.deletionJobId })).state).toBe("cleaning");
    expect(bucket.objects.size).toBe(1);
});
