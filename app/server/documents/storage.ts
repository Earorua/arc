import { D1DocumentRepository, DocumentServiceError } from "./d1-repository";

export const documentWriterProtocol = "r2-multipart-v1";
export function documentStorageKey(ownerId: string, documentId: string, generation: number, versionId: string, operationId: string) {
    return "materials-multipart/v1/" + [ownerId, documentId, String(generation), versionId, operationId].map(encodeURIComponent).join("/");
}

export interface DocumentUpload {
    readonly key: string;
    readonly uploadId: string;
    uploadPart(partNumber: number, value: string): Promise<R2UploadedPart>;
    complete(parts: R2UploadedPart[]): Promise<unknown>;
    abort(): Promise<void>;
}
export interface DocumentBucket {
    createMultipartUpload(key: string): Promise<DocumentUpload>;
    resumeMultipartUpload(key: string, uploadId: string): DocumentUpload;
    get(key: string): Promise<{
        text(): Promise<string>;
    } | null>;
    delete(key: string): Promise<unknown>;
    head(key: string): Promise<unknown | null>;
}
/** Private object identifiers never leave the server. */
export class DocumentStorage {
    constructor(readonly bucket: DocumentBucket) { }
    async write(key: string, text: string, enroll: (uploadId: string) => Promise<void>) {
        let upload: DocumentUpload | undefined;
        try {
            upload = await this.bucket.createMultipartUpload(key);
            if (upload.key !== key || !upload.uploadId)
                throw new DocumentServiceError("unavailable");
            // An unenrolled handle has no parts. Only the one durable enrollment may send bytes.
            await enroll(upload.uploadId);
            const part = await upload.uploadPart(1, text);
            await upload.complete([part]);
        }
        catch (error) {
            if (upload?.key === key)
                try { await upload.abort(); } catch { /* Maintenance repeats the enrolled abort. */ }
            if (error instanceof DocumentServiceError)
                throw error;
            throw new DocumentServiceError("unavailable");
        }
    }
    async read(key: string) {
        try {
            const object = await this.bucket.get(key);
            if (!object)
                throw new DocumentServiceError("unavailable");
            return await object.text();
        }
        catch {
            throw new DocumentServiceError("unavailable");
        }
    }
    async abortUpload(key: string, uploadId: string) {
        const handle = this.bucket.resumeMultipartUpload(key, uploadId);
        if (!uploadId || handle.key !== key || handle.uploadId !== uploadId)
            throw new Error("STORAGE_UPLOAD_MISMATCH");
        await handle.abort();
    }
    async reclaim(repo: D1DocumentRepository, ownerId: string, operationId: string) {
        const op = await repo.operationForCleanup(ownerId, operationId);
        if (!op) return false;
        const key = op.object_key;
        if (op.writer_protocol === documentWriterProtocol) {
            if (key !== documentStorageKey(ownerId, op.document_id, op.generation, op.document_version_id, operationId))
                return false;
            if (op.r2_upload_id !== null && op.committed_receipt !== 1) {
                // R2 fences both uploadPart and complete on this exact handle. Any error is inconclusive.
                await this.abortUpload(key, op.r2_upload_id);
            } else if (op.r2_upload_id === null && await this.bucket.head(key) !== null) {
                // Tombstoning closed D1 enrollment before any part could be sent. An object contradicts that proof.
                return false;
            }
        } else {
            const legacyKey = ["materials", ownerId, op.document_id, op.generation, op.document_version_id, operationId].join("/");
            if (op.writer_protocol !== null || op.r2_upload_id !== null || key !== legacyKey || op.committed_receipt !== 1)
                return false;
        }
        await this.bucket.delete(key);
        if (await this.bucket.head(key) !== null)
            throw new Error("STORAGE_NOT_ABSENT");
        await repo.statement(`UPDATE document_storage_operations SET state='deleted',writer_terminated=1
            WHERE owner_id=? AND id=? AND state='cleanup-pending' AND generation=? AND object_key=? AND r2_upload_id IS ?`,
        ownerId, operationId, op.generation, key, op.r2_upload_id).run();
        return true;
    }
}
