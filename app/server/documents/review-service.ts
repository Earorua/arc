import { DOCUMENT_SCHEMA_VERSION, documentReviewDraftSchema, validateMaterialSourceRef, type ConfirmedMaterialItem, type DocumentReviewDraft, type MaterialReferenceContext, type MaterialReviewPoint } from "../../contracts/documents";
import { documentEndpointContracts, type DocumentEndpointRequest as Request, type DocumentEndpointResponse as Response, type DocumentMutationIdentity } from "../../contracts/documents-api";
import { canonicalJson } from "../../lib/planning/fingerprint";
import { containsMaterialSkillLabel, retainedMaterialSelfAssessmentHints } from "../../lib/materials/skill-labels";
import { D1DocumentRepository, DocumentServiceError, type MaterialRow } from "./d1-repository";
import { DocumentStorage } from "./storage";
import { serializeDocumentExtraction, validateDocumentExtraction, validateStoredDocumentExtraction } from "./extraction-validator";
import { mergeDocumentReviewPointResolutions } from "./review-points";
import type { DocumentOwner } from "./repository";
import { z } from "zod";
import { materialIdSchema, materialRevisionSchema } from "../../contracts/documents";
export type ExtractionApplication = {
    jobId: string;
    documentId: string;
    documentVersionId: string;
    textVersionId: string;
    generation: number;
    documentRevision: number;
    consentId: string;
    candidate: unknown;
    modelVersion?: string;
    policyVersion?: string;
};

function parseDraft(input: unknown): DocumentReviewDraft {
    const parsed = documentReviewDraftSchema.safeParse(input);
    if (!parsed.success) throw new DocumentServiceError("invalid-content");
    return parsed.data;
}

function reviewedItem(item: ConfirmedMaterialItem, candidate: ConfirmedMaterialItem | undefined, prior: ConfirmedMaterialItem | undefined): ConfirmedMaterialItem {
    const { skillLabels, ...fact } = item;
    const sameSource = candidate && canonicalJson(item.sourceRef) === canonicalJson(candidate.sourceRef);
    const sameFact = sameSource && item.text === candidate.text && item.kind === candidate.kind;
    if (item.origin === "extracted" && (!sameFact || item.requirementLevel !== candidate.requirementLevel))
        throw new DocumentServiceError("invalid-content");
    if (skillLabels?.some(label => !sameSource || !candidate.skillLabels?.includes(label) || !prior?.skillLabels?.includes(label)))
        throw new DocumentServiceError("invalid-content");
    if (!sameFact) {
        if (!prior?.skillLabels) return fact;
        const labels = sameSource && item.kind === candidate.kind ? skillLabels ?? [] : [];
        return { ...fact, skillLabels: labels.filter(label => containsMaterialSkillLabel(fact.text, label)) };
    }
    // An older client can omit the field. Never resurrect a discarded word by rescanning this fact.
    if (!skillLabels && (prior?.skillLabels || (!prior && candidate.skillLabels))) return { ...fact, skillLabels: [] };
    return item;
}

export class ReviewService {
    constructor(readonly repo: D1DocumentRepository, readonly storage: DocumentStorage) { }
    private retainReviewPoints(current: MaterialRow | null, incoming: readonly MaterialReviewPoint[] = []): MaterialReviewPoint[] {
        const points = new Map(incoming.map(point => [point.id, point]));
        for (const point of current ? this.project(current).reviewPoints ?? [] : [])
            points.set(point.id, point);
        return [...points.values()];
    }
    async readDocumentExtraction(owner: DocumentOwner, input: {
        documentId: string;
        extractionId: string;
    }): Promise<{
        draft: DocumentReviewDraft;
        expectedRevision: number;
    }> {
        const request = z.object({ documentId: materialIdSchema, extractionId: materialIdSchema }).strict().parse(input);
        const row = await this.repo.one("SELECT e.*,j.document_version_id,j.generation,c.revoked_at FROM document_extractions e JOIN document_jobs j ON j.owner_id=e.owner_id AND j.id=e.job_id JOIN document_processing_consents c ON c.owner_id=j.owner_id AND c.id=j.consent_id WHERE e.owner_id=? AND e.document_id=? AND e.id=? AND e.state='active' AND j.state='succeeded'", owner.ownerId, request.documentId, request.extractionId);
        if (!row)
            throw new DocumentServiceError("not-found");
        const { stored, reference } = await this.reference(owner.ownerId, request.documentId, String(row.text_version_id));
        if (row.revoked_at !== null || row.generation !== stored.document.generation || row.document_version_id !== stored.document.currentDocumentVersionId)
            throw new DocumentServiceError("gone");
        const validated = validateStoredDocumentExtraction(String(row.candidates_json), owner.ownerId, reference), current = await this.row(owner.ownerId, String(row.text_version_id));
        const revision = current ? Number(current.revision) : 0;
        return {
            expectedRevision: revision,
            draft: parseDraft({
                id: current?.id ?? request.extractionId,
                schemaVersion: DOCUMENT_SCHEMA_VERSION,
                documentId: request.documentId,
                documentVersionId: stored.version.id,
                textVersionId: stored.version.textVersionId,
                extractionId: request.extractionId,
                origin: "ai",
                items: validated.items,
                selfAssessmentHints: validated.selfAssessmentHints,
                reviewPoints: this.retainReviewPoints(current, validated.reviewPoints),
                revision,
                updatedAt: new Date(Number(row.created_at)).toISOString()
            })
        };
    }
    async adoptDocumentExtraction(owner: DocumentOwner, input: {
        documentId: string;
        textVersionId: string;
        extractionId: string;
        expectedRevision: number;
        mutationId: string;
    }): Promise<Response<"saveDocumentReviewDraft">> {
        const request = z.object({
            documentId: materialIdSchema,
            textVersionId: materialIdSchema,
            extractionId: materialIdSchema,
            expectedRevision: materialRevisionSchema,
            mutationId: materialIdSchema
        }).strict().parse(input);
        const proposed = await this.readDocumentExtraction(owner, { documentId: request.documentId, extractionId: request.extractionId });
        if (proposed.draft.textVersionId !== request.textVersionId)
            throw new DocumentServiceError("conflict");
        return this.saveDocumentReviewDraft(owner, {
            ...request,
            items: proposed.draft.items,
            selfAssessmentHints: proposed.draft.selfAssessmentHints,
            reviewPoints: proposed.draft.reviewPoints
        }, await this.repo.identity(owner.ownerId, "adoptDocumentExtraction", request));
    }
    project(row: MaterialRow): DocumentReviewDraft {
        return parseDraft({
            id: row.id,
            schemaVersion: DOCUMENT_SCHEMA_VERSION,
            documentId: row.document_id,
            documentVersionId: row.document_version_id,
            textVersionId: row.text_version_id,
            extractionId: row.extraction_id,
            origin: row.origin,
            items: JSON.parse(String(row.items_json)),
            selfAssessmentHints: JSON.parse(String(row.self_assessment_hints_json)),
            reviewPoints: JSON.parse(String(row.review_points_json ?? "[]")),
            revision: row.revision,
            updatedAt: new Date(Number(row.updated_at)).toISOString()
        });
    }
    async row(ownerId: string, textVersionId: string) { return this.repo.one("SELECT * FROM document_review_drafts WHERE owner_id=? AND text_version_id=? AND state='active'", ownerId, textVersionId); }
    async reference(ownerId: string, documentId: string, textVersionId: string) {
        const stored = await this.repo.version(ownerId, documentId, undefined, textVersionId);
        const text = await this.storage.read(stored.objectKey);
        const reference: MaterialReferenceContext = {
            ownerId,
            documentId,
            documentVersionId: stored.version.id,
            textVersionId,
            lifecycle: stored.document.lifecycle,
            text,
            segments: stored.segments
        };
        return { stored, reference };
    }
    async readDocumentReviewDraft(owner: DocumentOwner, input: Request<"readDocumentReviewDraft">): Promise<Response<"readDocumentReviewDraft">> {
        const { documentId, textVersionId, includeConfirmation } = documentEndpointContracts.readDocumentReviewDraft.request.parse(input);
        await this.repo.version(owner.ownerId, documentId, undefined, textVersionId);
        if (!includeConfirmation) {
            const row = await this.row(owner.ownerId, textVersionId);
            return { draft: row ? this.project(row) : null };
        }
        // Only the current document and exact saved review can offer its existing confirmation.
        // Retained historical drafts remain readable when the document has a newer version.
        const row = await this.repo.one(`
            SELECT r.*, c.id AS confirmation_id, d.revision AS document_revision
            FROM document_review_drafts r
            JOIN documents d ON d.owner_id=r.owner_id AND d.id=r.document_id AND d.lifecycle='active'
            JOIN document_versions v ON v.owner_id=r.owner_id AND v.document_id=r.document_id
                AND v.id=r.document_version_id AND v.text_version_id=r.text_version_id AND v.state='ready'
            LEFT JOIN document_confirmations c ON c.owner_id=r.owner_id AND c.document_id=r.document_id
                AND c.document_version_id=r.document_version_id AND c.text_version_id=r.text_version_id
                AND d.current_document_version_id=c.document_version_id AND c.state='active'
                AND c.revision=(SELECT max(last.revision) FROM document_confirmations last
                    WHERE last.owner_id=r.owner_id AND last.document_id=r.document_id AND last.document_version_id=r.document_version_id)
                AND c.review_revision=r.revision AND c.origin=r.origin AND c.items_json=r.items_json
                AND c.review_points_json=r.review_points_json
            WHERE r.owner_id=? AND r.document_id=? AND r.text_version_id=? AND r.state='active'`,
            owner.ownerId, documentId, textVersionId);
        if (!row) return { draft: null };
        return { draft: this.project(row), ...(row.confirmation_id ? { confirmation: {
            confirmationId: String(row.confirmation_id), revision: Number(row.document_revision)
        } } : {}) };
    }
    async saveDocumentReviewDraft(owner: DocumentOwner, input: Request<"saveDocumentReviewDraft">, adoptionIdentity?: DocumentMutationIdentity): Promise<Response<"saveDocumentReviewDraft">> {
        const request = documentEndpointContracts.saveDocumentReviewDraft.request.parse(input), identity = adoptionIdentity ?? await this.repo.identity(owner.ownerId, "saveDocumentReviewDraft", request);
        const { stored, reference } = await this.reference(owner.ownerId, request.documentId, request.textVersionId);
        const replay = await this.repo.receipt<{
            draftId: string;
            revision: number;
        }>(identity);
        if (replay) {
            const row = await this.row(owner.ownerId, request.textVersionId);
            if (!row || Number(row.revision) !== replay.revision)
                throw new DocumentServiceError("conflict");
            return { draft: this.project(row) };
        }
        const current = await this.row(owner.ownerId, request.textVersionId);
        if ((current ? Number(current.revision) : 0) !== request.expectedRevision)
            throw new DocumentServiceError("conflict");
        if (current?.extraction_id && request.extractionId === null)
            throw new DocumentServiceError("conflict");
        let extraction: ReturnType<typeof validateDocumentExtraction> | null = null;
        if (request.extractionId) {
            const row = await this.repo.one("SELECT candidates_json FROM document_extractions WHERE owner_id=? AND id=? AND text_version_id=? AND state='active'", owner.ownerId, request.extractionId, request.textVersionId);
            if (!row)
                throw new DocumentServiceError("invalid-content");
            extraction = validateStoredDocumentExtraction(String(row.candidates_json), owner.ownerId, reference);
        }
        const priorReview = !adoptionIdentity && current && current.extraction_id === request.extractionId ? this.project(current) : extraction;
        const items = request.items.map(item => {
            if (item.sourceRef && !validateMaterialSourceRef(item.sourceRef, owner.ownerId, reference))
                throw new DocumentServiceError("invalid-content");
            return reviewedItem(item, extraction?.items.find(candidate => candidate.id === item.id), priorReview?.items.find(prior => prior.id === item.id));
        });
        if (request.selfAssessmentHints.some(hint => !extraction?.selfAssessmentHints.some(candidate => canonicalJson(candidate) === canonicalJson(hint))))
            throw new DocumentServiceError("invalid-content");
        const selfAssessmentHints = retainedMaterialSelfAssessmentHints(items, request.selfAssessmentHints.filter(hint =>
            priorReview?.selfAssessmentHints.some(prior => prior.id === hint.id)));
        const basePoints = this.retainReviewPoints(current, extraction?.reviewPoints);
        const reviewPoints = mergeDocumentReviewPointResolutions(basePoints, request.reviewPoints);
        const revision = request.expectedRevision + 1, id = current ? String(current.id) : this.repo.id(), origin = request.extractionId ? (request.items.some(item => item.origin === "user") ? "mixed" : "ai") : "manual", now = this.repo.now();
        const draft = parseDraft({
            id, schemaVersion: DOCUMENT_SCHEMA_VERSION, documentId: request.documentId, documentVersionId: stored.version.id,
            textVersionId: request.textVersionId, extractionId: request.extractionId, origin, items, selfAssessmentHints, reviewPoints,
            revision, updatedAt: new Date(now).toISOString()
        });
        const write = this.repo.statement("INSERT INTO document_review_drafts(owner_id,id,document_id,document_version_id,text_version_id,extraction_id,origin,items_json,self_assessment_hints_json,review_points_json,revision,state,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,'active',?) ON CONFLICT(owner_id,text_version_id) DO UPDATE SET extraction_id=excluded.extraction_id,origin=excluded.origin,items_json=excluded.items_json,self_assessment_hints_json=excluded.self_assessment_hints_json,review_points_json=excluded.review_points_json,revision=excluded.revision,updated_at=excluded.updated_at WHERE document_review_drafts.revision=? AND document_review_drafts.state='active'", owner.ownerId, id, request.documentId, stored.version.id, request.textVersionId, request.extractionId, origin, JSON.stringify(items), JSON.stringify(selfAssessmentHints), JSON.stringify(reviewPoints), revision, now, request.expectedRevision);
        const extractionGuards = request.extractionId && request.extractionId !== current?.extraction_id ? [
            this.repo.guard("EXISTS(SELECT 1 FROM document_extractions e JOIN document_jobs j ON j.owner_id=e.owner_id AND j.id=e.job_id JOIN document_processing_consents c ON c.owner_id=j.owner_id AND c.id=j.consent_id JOIN documents d ON d.owner_id=j.owner_id AND d.id=j.document_id WHERE e.owner_id=? AND e.id=? AND e.text_version_id=? AND e.state='active' AND j.state='succeeded' AND c.revoked_at IS NULL AND d.lifecycle='active' AND d.generation=j.generation AND d.current_document_version_id=j.document_version_id)", owner.ownerId, request.extractionId, request.textVersionId)
        ] : [];
        await this.repo.commit(identity, { draftId: id, revision }, [
            this.repo.activeVersionGuard(owner.ownerId, request.documentId, stored.version.id, stored.document.generation),
            ...extractionGuards,
            ...(current ? [] : [
                this.repo.guard("NOT EXISTS(SELECT 1 FROM document_review_drafts WHERE owner_id=? AND text_version_id=?)", owner.ownerId, request.textVersionId)
            ]),
            write,
            this.repo.changed()
        ]);
        return { draft };
    }
    async acceptAiExtraction(ownerId: string, input: ExtractionApplication): Promise<{
        extractionId: string | null;
        disposition: "initialized" | "candidates-available" | "rejected";
    }> {
        const previous = await this.repo.one("SELECT id FROM document_extractions WHERE owner_id=? AND job_id=? AND state='active'", ownerId, input.jobId);
        if (previous) {
            await this.repo.document(ownerId, input.documentId);
            return { extractionId: String(previous.id), disposition: "candidates-available" };
        }
        let context: Awaited<ReturnType<ReviewService["reference"]>>;
        try {
            context = await this.reference(ownerId, input.documentId, input.textVersionId);
        }
        catch (error) {
            if (error instanceof DocumentServiceError && ["not-found", "gone", "conflict"].includes(error.code))
                return { extractionId: null, disposition: "rejected" };
            throw new DocumentServiceError("unavailable");
        }
        const validated = validateDocumentExtraction(input.candidate, ownerId, context.reference), id = this.repo.id(), now = this.repo.now();
        const captureJson = serializeDocumentExtraction(input.candidate);
        const draft = parseDraft({
            id: this.repo.id(), schemaVersion: DOCUMENT_SCHEMA_VERSION, documentId: input.documentId, documentVersionId: input.documentVersionId,
            textVersionId: input.textVersionId, extractionId: id, origin: "ai", ...validated, revision: 0, updatedAt: new Date(now).toISOString()
        });
        try {
            const results = await this.repo.db.batch([
                this.repo.guard("EXISTS(SELECT 1 FROM document_jobs j JOIN documents d ON d.owner_id=j.owner_id AND d.id=j.document_id JOIN document_processing_consents c ON c.owner_id=j.owner_id AND c.id=j.consent_id WHERE j.owner_id=? AND j.id=? AND j.state='running' AND j.document_id=? AND j.document_version_id=? AND j.text_version_id=? AND j.generation=? AND j.consent_id=? AND d.lifecycle='active' AND d.generation=? AND d.revision=? AND d.current_document_version_id=? AND c.revoked_at IS NULL AND c.text_version_id=j.text_version_id AND c.generation=d.generation)", ownerId, input.jobId, input.documentId, input.documentVersionId, input.textVersionId, input.generation, input.consentId, input.generation, input.documentRevision, input.documentVersionId),
                this.repo.statement("INSERT INTO document_extractions(owner_id,id,job_id,document_id,text_version_id,candidates_json,state,created_at,model_version,policy_version) VALUES(?,?,?,?,?,?,'active',?,?,?)", ownerId, id, input.jobId, input.documentId, input.textVersionId, captureJson, now, input.modelVersion ?? null, input.policyVersion ?? DOCUMENT_SCHEMA_VERSION),
                this.repo.statement("INSERT INTO document_review_drafts(owner_id,id,document_id,document_version_id,text_version_id,extraction_id,origin,items_json,self_assessment_hints_json,review_points_json,revision,state,updated_at) VALUES(?,?,?,?,?,?,'ai',?,?,?,0,'active',?) ON CONFLICT(owner_id,text_version_id) DO UPDATE SET extraction_id=excluded.extraction_id,origin='ai',items_json=excluded.items_json,self_assessment_hints_json=excluded.self_assessment_hints_json,review_points_json=excluded.review_points_json,updated_at=excluded.updated_at WHERE document_review_drafts.revision=0 AND document_review_drafts.items_json='[]' AND document_review_drafts.self_assessment_hints_json='[]' AND document_review_drafts.extraction_id IS NULL AND document_review_drafts.state='active'", ownerId, draft.id, input.documentId, input.documentVersionId, input.textVersionId, id, JSON.stringify(draft.items), JSON.stringify(draft.selfAssessmentHints), JSON.stringify(draft.reviewPoints), now),
                this.repo.statement("UPDATE document_jobs SET extraction_id=?,state='succeeded',revision=revision+1,updated_at=? WHERE owner_id=? AND id=? AND state='running'", id, now, ownerId, input.jobId),
                this.repo.changed(),
            ]);
            return { extractionId: id, disposition: results[2]?.meta.changes ? "initialized" : "candidates-available" };
        }
        catch (error) {
            // A failed logical guard is terminal. An unavailable database must leave
            // the executor's durable result pending for a later delivery attempt.
            if (error instanceof Error && /malformed JSON/iu.test(error.message))
                return { extractionId: null, disposition: "rejected" };
            throw new DocumentServiceError("unavailable");
        }
    }
}
