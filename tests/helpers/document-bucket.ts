import type { DocumentUpload } from "../../app/server/documents/storage";

export function memoryBucket() {
    const objects = new Map<string, string>();
    const uploads = new Map<string, { key: string; open: boolean; part?: string }>();
    function resumeMultipartUpload(key: string, uploadId: string): DocumentUpload {
        function current() {
            const record = uploads.get(uploadId);
            if (!record || record.key !== key) throw new Error("Unknown upload");
            return record;
        }
        return {
            key, uploadId,
            async uploadPart(partNumber, value) {
                const record = current();
                if (!record.open) throw new Error("Upload closed");
                record.part = value;
                return { partNumber, etag: uploadId };
            },
            async complete(parts) {
                const record = current();
                if (!record.open || record.part === undefined || parts[0]?.etag !== uploadId) throw new Error("Invalid upload");
                objects.set(key, record.part);
                record.open = false;
                delete record.part;
            },
            async abort() {
                const record = current();
                record.open = false;
                delete record.part;
            }
        };
    }
    return {
        objects,
        async createMultipartUpload(key: string) {
            const uploadId = crypto.randomUUID();
            uploads.set(uploadId, { key, open: true });
            return resumeMultipartUpload(key, uploadId);
        },
        resumeMultipartUpload,
        async put(key: string, value: string) { objects.set(key, value); },
        async get(key: string) { return objects.has(key) ? { text: async () => objects.get(key)! } : null; },
        async delete(key: string) { objects.delete(key); },
        async head(key: string) { return objects.has(key) ? {} : null; }
    };
}
