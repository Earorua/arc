import { DOCUMENT_SCHEMA_VERSION, documentSchema, documentVersionSchema, type Document, type DocumentVersion } from "../../contracts/documents";
import { createDocumentMutationDigest, DOCUMENT_API_ERROR_STATUS, type DocumentEndpoint, type DocumentMutationIdentity } from "../../contracts/documents-api";
export type DocumentErrorCode = keyof typeof DOCUMENT_API_ERROR_STATUS;
export class DocumentServiceError extends Error {
    readonly status: number;
    constructor(readonly code: DocumentErrorCode) { super(code); this.name = "DocumentServiceError"; this.status = DOCUMENT_API_ERROR_STATUS[code]; }
}
export type MaterialRow = Record<string, unknown>;
/** Correlated with the documents row being tombstoned. Orphan text/version keys also block completion. */
export const documentHasPendingStorage = `EXISTS(
    SELECT 1 FROM document_storage_operations o WHERE o.owner_id=documents.owner_id AND o.document_id=documents.id
    AND (o.state<>'deleted' OR o.writer_terminated<>1)
) OR EXISTS(
    SELECT 1 FROM (
        SELECT owner_id,document_id,id AS version_id,object_key FROM document_versions UNION ALL
        SELECT owner_id,document_id,document_version_id,object_key FROM document_text_versions
    ) v WHERE v.owner_id=documents.owner_id AND v.document_id=documents.id AND NOT EXISTS(
        SELECT 1 FROM document_storage_operations o WHERE o.owner_id=v.owner_id AND o.document_id=v.document_id
        AND o.document_version_id=v.version_id AND o.object_key=v.object_key AND o.state='deleted' AND o.writer_terminated=1
    )
)`;
export type StoredVersion = {
    document: Document;
    version: DocumentVersion;
    objectKey: string;
    segments: {
        id: string;
        start: number;
        end: number;
    }[];
};
export class D1DocumentRepository {
    constructor(readonly db: D1Database, readonly clock: () => Date = () => new Date(), readonly id: () => string = () => crypto.randomUUID()) { }
    now() { return this.clock().getTime(); }
    statement(sql: string, ...values: unknown[]) { return this.db.prepare(sql).bind(...values); }
    async one(sql: string, ...values: unknown[]) { return this.statement(sql, ...values).first<MaterialRow>(); }
    async all(sql: string, ...values: unknown[]) { return (await this.statement(sql, ...values).all<MaterialRow>()).results; }
    guard(sql: string, ...values: unknown[]) { return this.statement(`SELECT json(CASE WHEN (${sql}) THEN '{}' ELSE '' END) AS material_guard`, ...values); }
    changed() { return this.guard("changes()=1"); }
    async operationForCleanup(ownerId: string, operationId: string) {
        return this.statement(`SELECT o.*, EXISTS(
            SELECT 1 FROM document_mutations m WHERE m.owner_id=o.owner_id AND m.endpoint=o.mutation_endpoint
              AND m.endpoint IN ('createDocument','createDocumentVersion') AND m.mutation_id=o.mutation_id
              AND m.body_digest=o.body_digest AND json_extract(m.result_json,'$.documentId')=o.document_id
              AND json_extract(m.result_json,'$.documentVersionId')=o.document_version_id
              AND json_extract(m.result_json,'$.textVersionId')=v.text_version_id
              AND json_extract(m.result_json,'$.revision')=v.revision
        ) committed_receipt FROM document_storage_operations o
        JOIN documents d ON d.owner_id=o.owner_id AND d.id=o.document_id AND (
            (d.lifecycle='active' AND d.generation=o.generation)
            OR (d.lifecycle='cleanup-pending' AND d.generation=o.generation+1))
        JOIN document_versions v ON v.owner_id=o.owner_id AND v.document_id=o.document_id AND v.id=o.document_version_id
          AND v.object_key=o.object_key AND v.generation=o.generation
        JOIN document_text_versions t ON t.owner_id=v.owner_id AND t.document_id=v.document_id AND t.document_version_id=v.id
          AND t.id=v.text_version_id AND t.object_key=o.object_key
        WHERE o.owner_id=? AND o.id=? AND o.state='cleanup-pending'`, ownerId, operationId).first<{
            document_id: string; document_version_id: string; object_key: string; generation: number;
            writer_protocol: string | null; r2_upload_id: string | null; committed_receipt: number;
        }>();
    }
    async identity(ownerId: string, endpoint: DocumentEndpoint, request: {
        mutationId: string;
    }): Promise<DocumentMutationIdentity> {
        return {
            ownerId,
            endpoint,
            mutationId: request.mutationId,
            bodyDigest: await createDocumentMutationDigest(ownerId, endpoint, request)
        };
    }
    async receipt<T>(identity: DocumentMutationIdentity): Promise<T | null> {
        const row = await this.one("SELECT body_digest,result_json FROM document_mutations WHERE owner_id=? AND endpoint=? AND mutation_id=?", identity.ownerId, identity.endpoint, identity.mutationId);
        if (!row)
            return null;
        if (row.body_digest !== identity.bodyDigest)
            throw new DocumentServiceError("conflict");
        return JSON.parse(String(row.result_json)) as T;
    }
    receiptStatement(identity: DocumentMutationIdentity, result: unknown) { return this.statement("INSERT INTO document_mutations(owner_id,endpoint,mutation_id,body_digest,result_json,created_at) VALUES(?,?,?,?,?,?)", identity.ownerId, identity.endpoint, identity.mutationId, identity.bodyDigest, JSON.stringify(result), this.now()); }
    async commit<T>(identity: DocumentMutationIdentity, result: T, statements: D1PreparedStatement[]): Promise<T> {
        try {
            await this.db.batch([...statements, this.receiptStatement(identity, result)]);
            return result;
        }
        catch (error) {
            const existing = await this.receipt<T>(identity);
            if (existing !== null)
                return existing;
            if (error instanceof DocumentServiceError)
                throw error;
            throw new DocumentServiceError("conflict");
        }
    }
    async document(ownerId: string, documentId: string, active = true): Promise<Document> {
        const row = await this.one("SELECT * FROM documents WHERE owner_id=? AND id=?", ownerId, documentId);
        if (!row)
            throw new DocumentServiceError("not-found");
        if (active && row.lifecycle !== "active")
            throw new DocumentServiceError("gone");
        return this.projectDocument(row);
    }
    projectDocument(row: MaterialRow): Document {
        return documentSchema.parse({
            id: row.id,
            schemaVersion: DOCUMENT_SCHEMA_VERSION,
            kind: row.kind,
            displayName: row.display_name,
            revision: row.revision,
            generation: row.generation,
            lifecycle: row.lifecycle,
            currentDocumentVersionId: row.current_document_version_id,
            createdAt: new Date(Number(row.created_at)).toISOString(),
            updatedAt: new Date(Number(row.updated_at)).toISOString()
        });
    }
    async version(ownerId: string, documentId: string, versionId?: string, textVersionId?: string): Promise<StoredVersion> {
        const document = await this.document(ownerId, documentId);
        const row = await this.one(`SELECT * FROM document_versions WHERE owner_id=? AND document_id=? AND ${textVersionId ? "text_version_id" : "id"}=?`, ownerId, documentId, textVersionId ?? versionId ?? document.currentDocumentVersionId);
        if (!row)
            throw new DocumentServiceError("not-found");
        if (row.state !== "ready")
            throw new DocumentServiceError(row.state === "pending" ? "conflict" : "gone");
        const version = documentVersionSchema.parse({
            id: row.id,
            documentId: row.document_id,
            textVersionId: row.text_version_id,
            schemaVersion: DOCUMENT_SCHEMA_VERSION,
            revision: row.revision,
            state: row.state,
            parserVersion: row.parser_version,
            textDigest: row.text_digest,
            codePoints: row.code_points,
            utf8Bytes: row.utf8_bytes,
            createdAt: new Date(Number(row.created_at)).toISOString()
        });
        return {
            document,
            version,
            objectKey: String(row.object_key),
            segments: JSON.parse(String(row.segments_json))
        };
    }
    activeVersionGuard(ownerId: string, documentId: string, versionId: string, generation: number) { return this.guard("EXISTS(SELECT 1 FROM documents d JOIN document_versions v ON v.owner_id=d.owner_id AND v.document_id=d.id WHERE d.owner_id=? AND d.id=? AND d.lifecycle='active' AND d.generation=? AND v.id=? AND v.state='ready')", ownerId, documentId, generation, versionId); }
}
