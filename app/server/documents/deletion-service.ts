import { documentEndpointContracts, type DocumentEndpointRequest as Request, type DocumentEndpointResponse as Response } from "../../contracts/documents-api";
import { D1DocumentRepository, DocumentServiceError, documentHasPendingStorage } from "./d1-repository";
import { DocumentStorage } from "./storage";
import type { DocumentOwner } from "./repository";
export interface DocumentDeletionPort {
    cancelForDocument(ownerId: string, documentId: string): Promise<{
        writersTerminated: boolean;
        resultsAbsent: boolean;
    }>;
}
export class DeletionService {
    constructor(readonly repo: D1DocumentRepository, readonly storage: DocumentStorage, readonly port?: DocumentDeletionPort) { }
    async deleteDocument(owner: DocumentOwner, input: Request<"deleteDocument">): Promise<Response<"deleteDocument">> {
        const request = documentEndpointContracts.deleteDocument.request.parse(input), identity = await this.repo.identity(owner.ownerId, "deleteDocument", request), document = await this.repo.document(owner.ownerId, request.documentId, false), replay = await this.repo.receipt<Response<"deleteDocument">>(identity);
        if (replay)
            return replay;
        const existing = await this.repo.one("SELECT id FROM document_deletion_jobs WHERE owner_id=? AND document_id=?", owner.ownerId, request.documentId);
        if (existing)
            return this.repo.commit(identity, { deletionJobId: String(existing.id), state: "cleanup-pending" as const }, []);
        if (document.lifecycle !== "active")
            throw new DocumentServiceError("gone");
        if (document.revision !== request.expectedRevision)
            throw new DocumentServiceError("conflict");
        const result = { deletionJobId: this.repo.id(), state: "cleanup-pending" as const }, now = this.repo.now(), oid = owner.ownerId, did = request.documentId;
        await this.repo.commit(identity, result, [
            this.repo.statement("UPDATE documents SET lifecycle='cleanup-pending',display_name='已删除',generation=generation+1,revision=revision+1,updated_at=? WHERE owner_id=? AND id=? AND lifecycle='active' AND revision=? AND generation=?", now, oid, did, request.expectedRevision, document.generation),
            this.repo.changed(),
            this.repo.statement("UPDATE document_versions SET state='cleanup-pending',segments_json='[]' WHERE owner_id=? AND document_id=?", oid, did),
            this.repo.statement("UPDATE document_processing_consents SET revoked_at=coalesce(revoked_at,?) WHERE owner_id=? AND document_id=?", now, oid, did),
            this.repo.statement("UPDATE document_jobs SET state='revoked',revision=revision+1,extraction_id=NULL,execution_slot=CASE WHEN dispatch_state='not-sent' OR dispatch_state='settled' THEN NULL ELSE execution_slot END,updated_at=? WHERE owner_id=? AND document_id=?", now, oid, did),
            this.repo.statement("UPDATE document_budget_reservations SET state='released',updated_at=? WHERE owner_id=? AND state='reserved' AND job_id IN(SELECT id FROM document_jobs WHERE owner_id=? AND document_id=? AND dispatch_state='not-sent')", now, oid, oid, did),
            this.repo.statement("UPDATE document_budget_reservations SET state='held-unknown',updated_at=? WHERE owner_id=? AND state='reserved' AND job_id IN(SELECT id FROM document_jobs WHERE owner_id=? AND document_id=? AND dispatch_state='may-have-sent')", now, oid, oid, did),
            this.repo.statement("UPDATE document_review_drafts SET state='revoked',items_json='[]',self_assessment_hints_json='[]',review_points_json='[]',revision=revision+1 WHERE owner_id=? AND document_id=?", oid, did),
            this.repo.statement("UPDATE document_extractions SET state='revoked',candidates_json='{}' WHERE owner_id=? AND document_id=?", oid, did),
            this.repo.statement("UPDATE document_confirmations SET state='revoked',items_json='[]',review_points_json='[]' WHERE owner_id=? AND document_id=?", oid, did),
            this.repo.statement("UPDATE material_selections SET state='revoked',revision=revision+1,updated_at=? WHERE owner_id=? AND id IN(SELECT selection_id FROM material_selection_entries WHERE owner_id=? AND document_id=?)", now, oid, oid, did),
            this.repo.statement("UPDATE material_context_versions SET state='revoked',snapshot_json='{}',preview_json='{}' WHERE owner_id=? AND id IN(SELECT context_version_id FROM material_context_dependencies WHERE owner_id=? AND document_id=?)", oid, oid, did),
            this.repo.statement("UPDATE material_plan_proposals SET state='revoked' WHERE owner_id=? AND state='pending' AND context_version_id IN(SELECT context_version_id FROM material_context_dependencies WHERE owner_id=? AND document_id=?)", oid, oid, did),
            this.repo.statement("UPDATE goal_document_links SET enabled=0 WHERE owner_id=? AND document_id=?", oid, did),
            this.repo.statement("UPDATE document_storage_operations SET state='cleanup-pending' WHERE owner_id=? AND document_id=?", oid, did),
            this.repo.statement("INSERT INTO document_deletion_jobs(owner_id,id,document_id,generation,state,next_attempt_at,created_at) VALUES(?,?,?,?,'revoked',?,?)", oid, result.deletionJobId, did, document.generation + 1, now, now),
        ]);
        // Durable tombstones are committed before any external cancellation request.
        if (this.port)
            try {
                await this.port.cancelForDocument(oid, did);
            }
            catch { /* Reconciliation retries the durable cleanup job. */ }
        return result;
    }
    async readDocumentDeletion(owner: DocumentOwner, input: Request<"readDocumentDeletion">): Promise<Response<"readDocumentDeletion">> {
        const request = documentEndpointContracts.readDocumentDeletion.request.parse(input);
        const row = await this.repo.one("SELECT * FROM document_deletion_jobs WHERE owner_id=? AND id=?", owner.ownerId, request.deletionJobId);
        if (!row)
            throw new DocumentServiceError("not-found");
        return documentEndpointContracts.readDocumentDeletion.response.parse({ deletionJobId: row.id, state: row.state, errorCode: row.error_code });
    }
    async reconcile(owner: DocumentOwner, input: Request<"readDocumentDeletion">): Promise<Response<"readDocumentDeletion">> {
        const status = await this.readDocumentDeletion(owner, input);
        if (status.state === "completed")
            return status;
        const row = (await this.repo.one("SELECT * FROM document_deletion_jobs WHERE owner_id=? AND id=?", owner.ownerId, input.deletionJobId))!, documentId = String(row.document_id), generation = Number(row.generation);
        await this.repo.statement("UPDATE document_deletion_jobs SET state='cleaning',error_code=NULL WHERE owner_id=? AND id=? AND generation=? AND state<>'completed'", owner.ownerId, input.deletionJobId, generation).run();
        try {
            let proof = { writersTerminated: true, resultsAbsent: true };
            if (this.port)
                proof = await this.port.cancelForDocument(owner.ownerId, documentId);
            else if (await this.repo.one("SELECT 1 FROM document_jobs WHERE owner_id=? AND document_id=? AND dispatch_state<>'not-sent' LIMIT 1", owner.ownerId, documentId))
                proof = { writersTerminated: false, resultsAbsent: false };
            const operations = await this.repo.all("SELECT id FROM document_storage_operations WHERE owner_id=? AND document_id=? AND generation<? AND state='cleanup-pending' ORDER BY created_at LIMIT 10", owner.ownerId, documentId, generation);
            for (const operation of operations)
                await this.storage.reclaim(this.repo, owner.ownerId, String(operation.id));
            const pendingSql = `SELECT 1 FROM documents WHERE owner_id=? AND id=? AND (${documentHasPendingStorage})`;
            const pending = await this.repo.one(pendingSql, owner.ownerId, documentId);
            if (!pending && proof.writersTerminated && proof.resultsAbsent) {
                await this.repo.db.batch([
                    this.repo.guard(`NOT EXISTS(${pendingSql})`, owner.ownerId, documentId),
                    this.repo.statement("UPDATE documents SET lifecycle='deleted',updated_at=? WHERE owner_id=? AND id=? AND generation=? AND lifecycle='cleanup-pending'", this.repo.now(), owner.ownerId, documentId, generation),
                    this.repo.changed(),
                    this.repo.statement("UPDATE document_deletion_jobs SET state='completed',error_code=NULL WHERE owner_id=? AND id=? AND generation=?", owner.ownerId, input.deletionJobId, generation),
                ]);
            }
            else
                await this.defer(owner.ownerId, input.deletionJobId, Number(row.attempts), null);
        }
        catch {
            await this.defer(owner.ownerId, input.deletionJobId, Number(row.attempts), "cleanup-failed");
        }
        return this.readDocumentDeletion(owner, input);
    }
    private async defer(ownerId: string, id: string, attempts: number, error: string | null) { await this.repo.statement("UPDATE document_deletion_jobs SET state=?,error_code=?,attempts=attempts+1,next_attempt_at=? WHERE owner_id=? AND id=? AND state<>'completed'", error ? "failed" : "cleaning", error, this.repo.now() + Math.min(3600000, 1000 * 2 ** Math.min(attempts, 12)), ownerId, id).run(); }
    async maintain(limit = 10) {
        const rows = await this.repo.all("SELECT owner_id,id FROM document_deletion_jobs WHERE state<>'completed' AND next_attempt_at<=? ORDER BY next_attempt_at LIMIT ?", this.repo.now(), Math.min(10, limit));
        for (const row of rows)
            await this.reconcile({ ownerId: String(row.owner_id) }, { deletionJobId: String(row.id) });
    }
}
