import { documentEndpointContracts, type DocumentEndpointRequest as Request, type DocumentEndpointResponse as Response } from "../../contracts/documents-api";
import { canonicalJson } from "../../lib/planning/fingerprint";
import { D1DocumentRepository, DocumentServiceError } from "./d1-repository";
import { DocumentStorage } from "./storage";
import { ReviewService } from "./review-service";
import { hasBlockingDocumentReviewPoints } from "./review-points";
import type { DocumentOwner } from "./repository";
export class ConfirmationService {
    readonly review: ReviewService;
    constructor(readonly repo: D1DocumentRepository, storage: DocumentStorage) { this.review = new ReviewService(repo, storage); }
    async createDocumentConfirmation(owner: DocumentOwner, input: Request<"createDocumentConfirmation">): Promise<Response<"createDocumentConfirmation">> {
        const request = documentEndpointContracts.createDocumentConfirmation.request.parse(input), identity = await this.repo.identity(owner.ownerId, "createDocumentConfirmation", request), stored = await this.repo.version(owner.ownerId, request.documentId, request.documentVersionId);
        if (stored.version.textVersionId !== request.textVersionId)
            throw new DocumentServiceError("invalid-content");
        const replay = await this.repo.receipt<Response<"createDocumentConfirmation">>(identity);
        if (replay)
            return replay;
        const row = await this.review.row(owner.ownerId, request.textVersionId);
        if (!row)
            throw new DocumentServiceError("conflict");
        const draft = this.review.project(row);
        if (draft.revision !== request.reviewRevision || canonicalJson(draft.items) !== canonicalJson(request.items) || stored.document.revision !== request.expectedRevision)
            throw new DocumentServiceError("conflict");
        if (hasBlockingDocumentReviewPoints(draft.reviewPoints))
            throw new DocumentServiceError("invalid-content");
        const result = { confirmationId: this.repo.id(), revision: request.expectedRevision + 1 };
        return this.repo.commit(identity, result, [
            this.repo.activeVersionGuard(owner.ownerId, request.documentId, request.documentVersionId, stored.document.generation),
            this.repo.guard("EXISTS(SELECT 1 FROM document_review_drafts WHERE owner_id=? AND text_version_id=? AND revision=? AND state='active' AND items_json=?)", owner.ownerId, request.textVersionId, request.reviewRevision, JSON.stringify(request.items)),
            this.repo.statement("UPDATE documents SET revision=revision+1,updated_at=? WHERE owner_id=? AND id=? AND lifecycle='active' AND revision=? AND generation=?", this.repo.now(), owner.ownerId, request.documentId, request.expectedRevision, stored.document.generation),
            this.repo.changed(),
            this.repo.statement("INSERT INTO document_confirmations(owner_id,document_id,document_version_id,id,text_version_id,review_revision,revision,origin,state,items_json,review_points_json,created_at) VALUES(?,?,?,?,?,?,?,?,'active',?,?,?)", owner.ownerId, request.documentId, request.documentVersionId, result.confirmationId, request.textVersionId, request.reviewRevision, result.revision, draft.origin, JSON.stringify(request.items), JSON.stringify(draft.reviewPoints ?? []), this.repo.now())
        ]);
    }
}
