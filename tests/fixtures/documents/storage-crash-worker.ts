import { D1DocumentRepository } from "../../../app/server/documents/d1-repository";
import { DeletionService } from "../../../app/server/documents/deletion-service";
import { DocumentService } from "../../../app/server/documents/service";
import { DocumentStorage, type DocumentBucket } from "../../../app/server/documents/storage";

type Env = { DB: D1Database; ASSETS: R2Bucket };

/** Faults are outside the production writer. The stream is already inside native R2 when cleanup starts. */
function stalledBucket(env: Env, mode: string): DocumentBucket {
    const checkpoint = (phase: string) => env.DB.prepare("UPDATE fixture_writer SET phase=? WHERE mode=?").bind(phase, mode).run();
    return {
        get: key => env.ASSETS.get(key), head: key => env.ASSETS.head(key), delete: key => env.ASSETS.delete(key),
        resumeMultipartUpload: (key, id) => env.ASSETS.resumeMultipartUpload(key, id),
        async createMultipartUpload(key) {
            const native = await env.ASSETS.createMultipartUpload(key);
            return {
                key, uploadId: native.uploadId, abort: () => native.abort(),
                async uploadPart(number, text) {
                    if (mode !== "stream") return native.uploadPart(number, text);
                    const bytes = new TextEncoder().encode(text);
                    const stream = new FixedLengthStream(bytes.length);
                    const body = stream.writable.getWriter();
                    const sending = native.uploadPart(number, stream.readable);
                    void sending.catch(() => {}); // Abort can reject while the stream is still paused.
                    await body.write(bytes.subarray(0, 1));
                    await checkpoint("part-in-flight");
                    while (!await env.DB.prepare("SELECT 1 FROM fixture_writer WHERE mode=? AND released=1").bind(mode).first())
                        await scheduler.wait(25);
                    await body.write(bytes.subarray(1));
                    await body.close();
                    return sending;
                },
                async complete(parts) {
                    const result = await native.complete(parts);
                    if (mode === "crash") {
                        await env.DB.prepare("UPDATE fixture_writer SET phase='stored',part_etag=? WHERE mode=?").bind(parts[0].etag, mode).run();
                        // The test disposes this workerd process before its JS continuation or catch runs.
                        await scheduler.wait(300_000);
                    }
                    return result;
                }
            };
        }
    };
}

const storageCrashWorker = {
    async fetch(request: Request, env: Env, ctx: ExecutionContext) {
        const [, action, mode] = new URL(request.url).pathname.split("/");
        const owner = { ownerId: "owner-a" };
        const repo = new D1DocumentRepository(env.DB);
        const storage = new DocumentStorage(env.ASSETS);
        if (action === "start") {
            const writer = new DocumentService(repo, new DocumentStorage(stalledBucket(env, mode)));
            ctx.waitUntil(writer.createDocument(owner, { kind: "resume", displayName: "Synthetic", text: "offline native storage fault", mutationId: mode })
                .then(() => "returned", () => "rejected")
                .then(outcome => env.DB.prepare("UPDATE fixture_writer SET outcome=? WHERE mode=?").bind(outcome, mode).run()));
            return new Response(null, { status: 202 });
        }
        const op = await env.DB.prepare("SELECT * FROM document_storage_operations WHERE owner_id=? AND mutation_id=?").bind(owner.ownerId, mode)
            .first<{ document_id: string; object_key: string; r2_upload_id: string }>();
        if (!op) return new Response(null, { status: 404 });
        if (action === "recover") {
            const deletion = new DeletionService(repo, storage);
            const request = { documentId: op.document_id, expectedRevision: 0, mutationId: "delete-" + mode };
            const tombstone = await deletion.deleteDocument(owner, request);
            const job = { deletionJobId: tombstone.deletionJobId };
            await Promise.all([deletion.maintain(), new DocumentService(repo, storage).reclaimStorage(), deletion.reconcile(owner, job)]);
            const duplicate = await deletion.deleteDocument(owner, request);
            return Response.json({ sameJob: duplicate.deletionJobId === job.deletionJobId, state: (await deletion.reconcile(owner, job)).state });
        }
        if (action === "replay") {
            const handle = env.ASSETS.resumeMultipartUpload(op.object_key, op.r2_upload_id);
            const etag = await env.DB.prepare("SELECT part_etag FROM fixture_writer WHERE mode=?").bind(mode).first<string>("part_etag");
            const part = await handle.uploadPart(1, "late private bytes").then(() => "accepted", () => "rejected");
            const complete = etag ? await handle.complete([{ partNumber: 1, etag }]).then(() => "accepted", () => "rejected") : null;
            return Response.json({ part, complete, absent: await env.ASSETS.head(op.object_key) === null });
        }
        return new Response(null, { status: 404 });
    }
};
export default storageCrashWorker;
