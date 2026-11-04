import { documentEndpointContracts, type DocumentEndpointRequest as Request, type DocumentEndpointResponse as Response } from "../../contracts/documents-api";
import { materialSha256 } from "../../contracts/material-planning";
import { D1DocumentRepository, DocumentServiceError, documentHasPendingStorage } from "./d1-repository";
import { DocumentStorage, documentStorageKey, documentWriterProtocol, type DocumentBucket } from "./storage";
import { prepareDocumentText, segmentDocumentText } from "./text";
import type { DocumentOwner } from "./repository";
import { ReviewService } from "./review-service";
import { ConfirmationService } from "./confirmation-service";
import { SelectionService } from "./selection-service";
import { DeletionService, type DocumentDeletionPort } from "./deletion-service";
import { z } from "zod";
import { materialIdSchema } from "../../contracts/documents";
export { DocumentServiceError } from "./d1-repository";
export class DocumentService {
    constructor(readonly repo: D1DocumentRepository, readonly storage: DocumentStorage) { }
    async readDocumentMutation(owner: DocumentOwner, input: {
        endpoint: "createDocument" | "createDocumentVersion";
        mutationId: string;
    }): Promise<Response<"readDocumentMutation">> {
        const request = z.object({ endpoint: z.enum(["createDocument", "createDocumentVersion"]), mutationId: materialIdSchema }).strict().parse(input);
        const row = await this.repo.one("SELECT result_json FROM document_mutations WHERE owner_id=? AND endpoint=? AND mutation_id=?", owner.ownerId, request.endpoint, request.mutationId);
        if (!row)
            return { receipt: null };
        const receipt = documentEndpointContracts.createDocument.response.parse(JSON.parse(String(row.result_json)));
        await this.repo.version(owner.ownerId, receipt.documentId, receipt.documentVersionId);
        return { receipt };
    }
    async listDocuments(owner: DocumentOwner, input: Request<"listDocuments">): Promise<Response<"listDocuments">> {
        const request = documentEndpointContracts.listDocuments.request.parse(input);
        const rows = await this.repo.all("SELECT * FROM documents WHERE owner_id=? AND lifecycle='active' AND id>? ORDER BY id LIMIT ?", owner.ownerId, request.cursor ?? "", (request.limit ?? 30) + 1);
        const page = rows.slice(0, request.limit ?? 30);
        return {
            documents: page.map(row => this.repo.projectDocument(row)),
            nextCursor: rows.length > page.length ? String(page.at(-1)!.id) : null
        };
    }
    async readDocument(owner: DocumentOwner, input: Request<"readDocument">): Promise<Response<"readDocument">> {
        const request = documentEndpointContracts.readDocument.request.parse(input);
        const stored = await this.repo.version(owner.ownerId, request.documentId, request.versionId);
        const text = await this.storage.read(stored.objectKey);
        await this.repo.version(owner.ownerId, request.documentId, stored.version.id);
        return { document: stored.document, version: stored.version, text };
    }
    async createDocument(owner: DocumentOwner, input: Request<"createDocument">) { return this.save(owner, documentEndpointContracts.createDocument.request.parse(input), false); }
    async createDocumentVersion(owner: DocumentOwner, input: Request<"createDocumentVersion">) { return this.save(owner, documentEndpointContracts.createDocumentVersion.request.parse(input), true); }
    private async save(owner: DocumentOwner, request: Request<"createDocument"> | Request<"createDocumentVersion">, isVersion: boolean): Promise<Response<"createDocument">> {
        const endpoint = isVersion ? "createDocumentVersion" : "createDocument";
        const identity = await this.repo.identity(owner.ownerId, endpoint, request);
        const replay = await this.repo.receipt<Response<"createDocument">>(identity);
        if (replay) {
            await this.repo.document(owner.ownerId, replay.documentId);
            return replay;
        }
        let text: string;
        try {
            text = prepareDocumentText(request.text);
        }
        catch (error) {
            throw new DocumentServiceError(error instanceof Error && error.message === "TEXT_TOO_LARGE" ? "payload-too-large" : "invalid-content");
        }
        const current = "documentId" in request ? await this.repo.document(owner.ownerId, request.documentId) : null;
        if (current && "expectedRevision" in request && current.revision !== request.expectedRevision)
            throw new DocumentServiceError("conflict");
        const existing = await this.repo.one("SELECT body_digest,state FROM document_storage_operations WHERE owner_id=? AND mutation_endpoint=? AND mutation_id=?", owner.ownerId, endpoint, request.mutationId);
        if (existing)
            throw new DocumentServiceError("conflict");
        const documentId = current?.id ?? this.repo.id(), versionId = this.repo.id(), textVersionId = this.repo.id(), intentId = this.repo.id(), generation = current?.generation ?? 0, revision = current ? current.revision + 1 : 0, now = this.repo.now();
        const key = documentStorageKey(owner.ownerId, documentId, generation, versionId, intentId);
        const digest = await materialSha256(text), points = Array.from(text).length, bytes = new TextEncoder().encode(text).byteLength;
        const count = await this.repo.one("SELECT (SELECT count(*) FROM documents WHERE owner_id=? AND lifecycle<>'deleted') documents,(SELECT count(*) FROM document_versions v WHERE owner_id=? AND document_id=? AND EXISTS(SELECT 1 FROM document_storage_operations o WHERE o.owner_id=v.owner_id AND o.document_version_id=v.id AND o.state<>'deleted')) versions,(SELECT coalesce(sum(v.code_points),0) FROM document_versions v JOIN documents d ON d.owner_id=v.owner_id AND d.id=v.document_id WHERE v.owner_id=? AND d.lifecycle<>'deleted' AND EXISTS(SELECT 1 FROM document_storage_operations o WHERE o.owner_id=v.owner_id AND o.document_version_id=v.id AND o.state<>'deleted')) points", owner.ownerId, owner.ownerId, documentId, owner.ownerId);
        if ((!current && Number(count?.documents) >= 30) || Number(count?.versions) >= 10 || Number(count?.points) + points > 1000000)
            throw new DocumentServiceError("quota-exceeded");
        const statements = [
            this.repo.guard("(SELECT count(*) FROM documents WHERE owner_id=? AND lifecycle<>'deleted')<? AND (SELECT count(*) FROM document_versions v WHERE owner_id=? AND document_id=? AND EXISTS(SELECT 1 FROM document_storage_operations o WHERE o.owner_id=v.owner_id AND o.document_version_id=v.id AND o.state<>'deleted'))<10 AND (SELECT coalesce(sum(v.code_points),0) FROM document_versions v JOIN documents d ON d.owner_id=v.owner_id AND d.id=v.document_id WHERE v.owner_id=? AND d.lifecycle<>'deleted' AND EXISTS(SELECT 1 FROM document_storage_operations o WHERE o.owner_id=v.owner_id AND o.document_version_id=v.id AND o.state<>'deleted'))+?<=1000000", owner.ownerId, current ? 31 : 30, owner.ownerId, documentId, owner.ownerId, points)
        ];
        if (current)
            statements.push(this.repo.guard("EXISTS(SELECT 1 FROM documents WHERE owner_id=? AND id=? AND lifecycle='active' AND generation=? AND revision=?)", owner.ownerId, documentId, generation, current.revision));
        else
            statements.push(this.repo.statement("INSERT INTO documents(owner_id,id,kind,display_name,lifecycle,generation,revision,current_document_version_id,created_at,updated_at) VALUES(?,?,?,?,'active',0,0,?,?,?)", owner.ownerId, documentId, "kind" in request ? request.kind : "resume", "displayName" in request ? request.displayName : "", versionId, now, now));
        statements.push(this.repo.statement("INSERT INTO document_versions(owner_id,document_id,id,text_version_id,state,generation,revision,text_digest,object_key,utf8_bytes,code_points,segments_json,parser_version,created_at) VALUES(?,?,?,?,'pending',?,?,?,?,?,?,?,'2026.11.1',?)", owner.ownerId, documentId, versionId, textVersionId, generation, revision, digest, key, bytes, points, JSON.stringify(segmentDocumentText(text)), now), this.repo.statement("INSERT INTO document_text_versions(owner_id,document_id,document_version_id,id,parser_version,text_hash,object_key,created_at) VALUES(?,?,?,?,'2026.11.1',?,?,?)", owner.ownerId, documentId, versionId, textVersionId, digest, key, now), this.repo.statement("INSERT INTO document_storage_operations(owner_id,id,document_id,document_version_id,object_key,generation,expected_revision,writer_protocol,state,next_attempt_at,mutation_endpoint,mutation_id,body_digest,created_at) VALUES(?,?,?,?,?,?,?,?,'writing',?,?,?,?,?)", owner.ownerId, intentId, documentId, versionId, key, generation, current?.revision ?? 0, documentWriterProtocol, now, endpoint, request.mutationId, identity.bodyDigest, now));
        try {
            await this.repo.db.batch(statements);
        }
        catch {
            if (current) {
                const fresh = await this.repo.document(owner.ownerId, documentId);
                if (fresh.revision !== current.revision || fresh.generation !== generation)
                    throw new DocumentServiceError("conflict");
            }
            const quotas = await this.repo.one("SELECT (SELECT count(*) FROM documents WHERE owner_id=? AND lifecycle<>'deleted') documents,(SELECT count(*) FROM document_versions v WHERE owner_id=? AND document_id=? AND EXISTS(SELECT 1 FROM document_storage_operations o WHERE o.owner_id=v.owner_id AND o.document_version_id=v.id AND o.state<>'deleted')) versions,(SELECT coalesce(sum(v.code_points),0) FROM document_versions v JOIN documents d ON d.owner_id=v.owner_id AND d.id=v.document_id WHERE v.owner_id=? AND d.lifecycle<>'deleted' AND EXISTS(SELECT 1 FROM document_storage_operations o WHERE o.owner_id=v.owner_id AND o.document_version_id=v.id AND o.state<>'deleted')) points", owner.ownerId, owner.ownerId, documentId, owner.ownerId);
            throw new DocumentServiceError((!current && Number(quotas?.documents) >= 30) || Number(quotas?.versions) >= 10 || Number(quotas?.points) + points > 1000000 ? "quota-exceeded" : "conflict");
        }
        try {
            await this.storage.write(key, text, async uploadId => {
                const enrolled = await this.repo.statement(`UPDATE document_storage_operations SET r2_upload_id=?
                    WHERE owner_id=? AND id=? AND document_id=? AND generation=? AND object_key=?
                    AND writer_protocol=? AND state='writing' AND r2_upload_id IS NULL`,
                uploadId, owner.ownerId, intentId, documentId, generation, key, documentWriterProtocol).run();
                if (enrolled.meta.changes !== 1) throw new DocumentServiceError("conflict");
            });
            const receipt = { documentId, documentVersionId: versionId, textVersionId, revision };
            return await this.repo.commit(identity, receipt, [
                this.repo.statement("UPDATE documents SET current_document_version_id=?,revision=?,updated_at=? WHERE owner_id=? AND id=? AND generation=? AND revision=? AND lifecycle='active'", versionId, revision, now, owner.ownerId, documentId, generation, current?.revision ?? 0),
                this.repo.changed(),
                this.repo.statement("UPDATE document_versions SET state='ready' WHERE owner_id=? AND document_id=? AND id=? AND state='pending'", owner.ownerId, documentId, versionId),
                this.repo.changed(),
                this.repo.statement("UPDATE document_storage_operations SET state='active',writer_terminated=1 WHERE owner_id=? AND id=? AND state='writing'", owner.ownerId, intentId),
                this.repo.changed()
            ]);
        }
        catch (error) {
            await this.repo.db.batch([
                this.repo.statement("UPDATE document_storage_operations SET state='cleanup-pending' WHERE owner_id=? AND id=? AND state='writing'", owner.ownerId, intentId),
                this.repo.statement("UPDATE document_versions SET state='cleanup-pending' WHERE owner_id=? AND document_id=? AND id=? AND state='pending'", owner.ownerId, documentId, versionId)
            ]);
            throw error;
        }
    }
    async reclaimStorage(limit = 10) {
        const rows = await this.repo.all("SELECT owner_id,id,document_id,attempts FROM document_storage_operations WHERE state='cleanup-pending' AND next_attempt_at<=? ORDER BY next_attempt_at,created_at LIMIT ?", this.repo.now(), Math.min(limit, 10));
        for (const row of rows) {
            try {
                if (!await this.storage.reclaim(this.repo, String(row.owner_id), String(row.id)))
                    throw new Error("WRITER_NOT_FENCED");
                await this.repo.statement(`UPDATE documents SET lifecycle='deleted',display_name='已删除',generation=generation+1,revision=revision+1,updated_at=? WHERE owner_id=? AND id=? AND lifecycle='active' AND NOT EXISTS(SELECT 1 FROM document_versions v WHERE v.owner_id=documents.owner_id AND v.document_id=documents.id AND v.state='ready') AND NOT (${documentHasPendingStorage})`, this.repo.now(), row.owner_id, row.document_id).run();
            }
            catch {
                await this.repo.statement("UPDATE document_storage_operations SET attempts=attempts+1,next_attempt_at=? WHERE owner_id=? AND id=? AND state='cleanup-pending'", this.repo.now() + Math.min(3600000, 1000 * 2 ** Math.min(Number(row.attempts), 12)), row.owner_id, row.id).run();
            }
        }
    }
}
export function createDocumentServices(options: {
    db: D1Database;
    bucket: DocumentBucket;
    clock?: () => Date;
    id?: () => string;
    deletionPort?: DocumentDeletionPort;
}) {
    const repo = new D1DocumentRepository(options.db, options.clock, options.id), storage = new DocumentStorage(options.bucket), documents = new DocumentService(repo, storage);
    const review = new ReviewService(repo, storage), confirmation = new ConfirmationService(repo, storage), selection = new SelectionService(repo), deletion = new DeletionService(repo, storage, options.deletionPort);
    return {
        readDocumentMutation: documents.readDocumentMutation.bind(documents),
        readDocumentExtraction: review.readDocumentExtraction.bind(review),
        adoptDocumentExtraction: review.adoptDocumentExtraction.bind(review),
        deleteDocument: deletion.deleteDocument.bind(deletion),
        readDocumentDeletion: deletion.readDocumentDeletion.bind(deletion),
        readDocumentReviewDraft: review.readDocumentReviewDraft.bind(review),
        saveDocumentReviewDraft: review.saveDocumentReviewDraft.bind(review),
        createDocumentConfirmation: confirmation.createDocumentConfirmation.bind(confirmation),
        createMaterialSelection: selection.createMaterialSelection.bind(selection),
        updateMaterialSelection: selection.updateMaterialSelection.bind(selection),
        readMaterialSelection: selection.readMaterialSelection.bind(selection),
        listDocuments: documents.listDocuments.bind(documents),
        createDocument: documents.createDocument.bind(documents),
        readDocument: documents.readDocument.bind(documents),
        createDocumentVersion: documents.createDocumentVersion.bind(documents)
    };
}
