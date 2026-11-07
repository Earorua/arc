// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { setup, closeMaterialsFixtures } from "../helpers/material-storage-fixture";
afterEach(closeMaterialsFixtures);
import { D1DocumentRepository } from "../../app/server/documents/d1-repository";
import { DocumentStorage } from "../../app/server/documents/storage";
import { ReviewService } from "../../app/server/documents/review-service";
import { materialsClock } from "../helpers/materials-d1";
import { MAX_DOCUMENT_ITEMS_JSON_BYTES, utf8Bytes } from "../../app/contracts/documents";
import { KIMI_GROUNDED_TERMS_POLICY_ID } from "../../app/server/documents/policy";
const item = {
    id: "fact",
    kind: "skill-claim" as const,
    text: "SQL",
    origin: "user" as const,
    sourceRef: null,
    requirementLevel: null
};
it("restores manual review, conflicts on stale revision, and confirms immutable facts", async () => {
    const { services, owner } = setup();
    const receipt = await services.createDocument(owner, { kind: "resume", displayName: "R", text: "SQL", mutationId: "create" });
    const request = {
        documentId: receipt.documentId,
        textVersionId: receipt.textVersionId,
        extractionId: null,
        items: [item],
        selfAssessmentHints: [],
        expectedRevision: 0,
        mutationId: "save"
    };
    const saved = await services.saveDocumentReviewDraft(owner, request);
    expect((await services.readDocumentReviewDraft(owner, { documentId: receipt.documentId, textVersionId: receipt.textVersionId })).draft).toEqual(saved.draft);
    await expect(services.saveDocumentReviewDraft(owner, { ...request, mutationId: "stale" })).rejects.toMatchObject({ code: "conflict" });
    const confirmation = await services.createDocumentConfirmation(owner, {
        documentId: receipt.documentId,
        documentVersionId: receipt.documentVersionId,
        textVersionId: receipt.textVersionId,
        reviewRevision: saved.draft.revision,
        items: [item],
        expectedRevision: 0,
        mutationId: "confirm"
    });
    expect(confirmation.revision).toBe(1);
});
it("does not grant source authority to forged extracted items", async () => {
    const { services, owner } = setup();
    const receipt = await services.createDocument(owner, { kind: "jd", displayName: "J", text: "SQL", mutationId: "create" });
    await expect(services.saveDocumentReviewDraft(owner, {
        documentId: receipt.documentId,
        textVersionId: receipt.textVersionId,
        extractionId: null,
        items: [{
                ...item,
                origin: "extracted",
                sourceRef: { ...receipt, start: 0, end: 99, revision: undefined } as never
            }],
        selfAssessmentHints: [],
        expectedRevision: 0,
        mutationId: "save"
    })).rejects.toBeDefined();
});
it("rejects a review that cannot fit its saved draft envelope before changing the user's revision", async () => {
    const { services, owner } = setup();
    const doc = await services.createDocument(owner, { kind: "resume", displayName: "R", text: "SQL", mutationId: "create" });
    const items = Array.from({ length: 100 }, (_, index) => ({ ...item, id: `fact-${index}`, text: "甲".repeat(395) }));
    const request = { documentId: doc.documentId, textVersionId: doc.textVersionId, extractionId: null, items,
        selfAssessmentHints: [], expectedRevision: 0, mutationId: "save" };
    let remaining = MAX_DOCUMENT_ITEMS_JSON_BYTES - utf8Bytes(JSON.stringify(request));
    for (const fact of items) {
        const add = Math.min(1000 - fact.text.length, remaining);
        fact.text += "x".repeat(add);
        remaining -= add;
    }
    expect(utf8Bytes(JSON.stringify(request))).toBe(MAX_DOCUMENT_ITEMS_JSON_BYTES);
    await expect(services.saveDocumentReviewDraft(owner, request)).rejects.toMatchObject({ code: "invalid-content" });
    expect((await services.readDocumentReviewDraft(owner, { documentId: doc.documentId, textVersionId: doc.textVersionId })).draft).toBeNull();
});

async function pendingExtraction(providerPolicyId: string) {
    const { services, owner, db, bucket } = setup();
    const text = "我在指导下清洗数据。";
    const receipt = await services.createDocument(owner, { kind: "resume", displayName: "Practice", text, mutationId: "create" });
    db.database.prepare("INSERT INTO document_processing_consents VALUES(?,?,?,?,?,'analysis','2026.11.1',?,0,0,NULL)")
        .run(owner.ownerId, "consent", receipt.textVersionId, receipt.documentId, receipt.documentVersionId, providerPolicyId);
    db.database.prepare("INSERT INTO document_jobs(owner_id,id,text_version_id,document_id,document_version_id,consent_id,generation,document_revision,revision,state,dispatch_state,execution_slot,queued_at,queue_expires_at,provider_policy_id,price_version,policy_version,reservation_id,updated_at) VALUES(?,'job',?,?,?,'consent',0,0,0,'running','settled',NULL,0,1,?,'2026.11.1','2026.11.1','reservation',0)")
        .run(owner.ownerId, receipt.textVersionId, receipt.documentId, receipt.documentVersionId, providerPolicyId);
    const review = new ReviewService(new D1DocumentRepository(db as unknown as D1Database, materialsClock), new DocumentStorage(bucket));
    const input = { ...receipt, jobId: "job", generation: 0, documentRevision: 0, consentId: "consent",
        candidate: { schemaVersion: "2026.11.1", items: [{ id: "practice", kind: "experience", text, requirementLevel: null,
            skillLabels: ["data cleaning"], selfLevelHint: "guided", source: { segmentId: "segment-1", quote: text } }] } };
    return { db, owner, services, receipt, review, input };
}

it.each(["materials-openrouter-kimi-k31-pro-mxfp4-zdr-extractive-v1", KIMI_GROUNDED_TERMS_POLICY_ID])(
    "binds a delivered extraction to its persisted job policy %s despite a spoofed result policy", async providerPolicyId => {
        const { db, owner, services, receipt, review, input } = await pendingExtraction(providerPolicyId);
        const grounded = providerPolicyId === KIMI_GROUNDED_TERMS_POLICY_ID;
        expect((await review.acceptAiExtraction(owner.ownerId, { ...input,
            policyVersion: grounded ? "literal-skill-labels-v1" : KIMI_GROUNDED_TERMS_POLICY_ID })).disposition).toBe("initialized");
        const draft = (await services.readDocumentReviewDraft(owner, { documentId: receipt.documentId, textVersionId: receipt.textVersionId })).draft!;
        expect(draft.items[0]?.skillLabels).toEqual(grounded ? ["data cleaning"] : []);
        expect(draft.reviewProjection).toBe(grounded ? "grounded-skill-labels-v2" : undefined);
        const capture = JSON.parse(String(db.database.prepare("SELECT candidates_json FROM document_extractions").get()!.candidates_json));
        expect(capture.reviewProjection).toBe(grounded ? "grounded-skill-labels-v2" : "literal-skill-labels-v1");
        expect((await services.readDocumentExtraction(owner, { documentId: receipt.documentId, extractionId: draft.extractionId! })).draft.items).toEqual(draft.items);
    });

it("rejects a delivery when the job policy changes between validation and the atomic write", async () => {
    const { db, owner, review, input } = await pendingExtraction(KIMI_GROUNDED_TERMS_POLICY_ID);
    const commit = db.batch.bind(db);
    vi.spyOn(db, "batch").mockImplementationOnce(statements => {
        db.database.prepare("UPDATE document_jobs SET provider_policy_id='older-policy' WHERE id='job'").run();
        return commit(statements);
    });
    expect(await review.acceptAiExtraction(owner.ownerId, input)).toEqual({ extractionId: null, disposition: "rejected" });
    expect(db.database.prepare("SELECT * FROM document_extractions").all()).toEqual([]);
    expect(db.database.prepare("SELECT state FROM document_jobs WHERE id='job'").get()?.state).toBe("running");
});

it("initializes AI review once and preserves user edits when a later extraction arrives", async () => {
    const { services, owner, db, bucket } = setup();
    const receipt = await services.createDocument(owner, { kind: "resume", displayName: "R", text: "SQL experience", mutationId: "create" });
    const repo = new D1DocumentRepository(db as unknown as D1Database, materialsClock);
    const review = new ReviewService(repo, new DocumentStorage(bucket));
    async function extract(jobId: string) {
        db.database.prepare("INSERT OR IGNORE INTO document_processing_consents VALUES(?,?,?,?,?,'analysis','2026.11.1',?,0,0,NULL)").run(owner.ownerId, "consent", receipt.textVersionId, receipt.documentId, receipt.documentVersionId, KIMI_GROUNDED_TERMS_POLICY_ID);
        db.database.prepare("INSERT INTO document_jobs(owner_id,id,text_version_id,document_id,document_version_id,consent_id,generation,document_revision,revision,state,dispatch_state,execution_slot,queued_at,queue_expires_at,provider_policy_id,price_version,policy_version,reservation_id,updated_at) VALUES(?,?,?,?,?,'consent',0,0,0,'running','settled',NULL,0,1,?,'2026.11.1','2026.11.1','reservation',0)").run(owner.ownerId, jobId, receipt.textVersionId, receipt.documentId, receipt.documentVersionId, KIMI_GROUNDED_TERMS_POLICY_ID);
        return review.acceptAiExtraction(owner.ownerId, {
            ...receipt,
            jobId,
            generation: 0,
            documentRevision: 0,
            consentId: "consent",
            candidate: {
                schemaVersion: "2026.11.1",
                reviewPoints: jobId === "job-2" ? [] : [{ code: "team-attribution", source: { segmentId: "segment-1", quote: "SQL experience" } }],
                items: [
                    {
                        id: "candidate",
                        kind: "skill-claim",
                        text: "SQL experience",
                        skillLabels: ["SQL"],
                        requirementLevel: null,
                        selfLevelHint: "guided",
                        source: { segmentId: "segment-1", quote: "SQL experience" }
                    }
                ]
            }
        });
    }
    expect((await extract("job-1")).disposition).toBe("initialized");
    const initial = (await services.readDocumentReviewDraft(owner, { documentId: receipt.documentId, textVersionId: receipt.textVersionId })).draft!;
    expect(initial.reviewPoints).toHaveLength(1);
    await expect(services.createDocumentConfirmation(owner, {
        documentId: receipt.documentId,
        documentVersionId: receipt.documentVersionId,
        textVersionId: receipt.textVersionId,
        reviewRevision: initial.revision,
        items: initial.items,
        expectedRevision: 0,
        mutationId: "unresolved"
    })).rejects.toMatchObject({ code: "invalid-content" });
    await expect(services.saveDocumentReviewDraft(owner, {
        documentId: receipt.documentId,
        textVersionId: receipt.textVersionId,
        extractionId: initial.extractionId,
        items: initial.items,
        selfAssessmentHints: initial.selfAssessmentHints,
        reviewPoints: [],
        expectedRevision: 0,
        mutationId: "drop-warning"
    })).rejects.toBeDefined();
    await expect(services.saveDocumentReviewDraft(owner, {
        documentId: receipt.documentId,
        textVersionId: receipt.textVersionId,
        extractionId: null,
        items: initial.items.map(point => ({ ...point, origin: "user" as const })),
        selfAssessmentHints: [],
        expectedRevision: 0,
        mutationId: "clear-provenance"
    })).rejects.toMatchObject({ code: "conflict" });
    await services.saveDocumentReviewDraft(owner, {
        documentId: receipt.documentId,
        textVersionId: receipt.textVersionId,
        extractionId: initial.extractionId,
        items: [...initial.items, item],
        selfAssessmentHints: initial.selfAssessmentHints,
        expectedRevision: initial.revision,
        mutationId: "edit"
    });
    const late = await extract("job-2");
    expect(late.disposition).toBe("candidates-available");
    expect((await services.readDocumentReviewDraft(owner, { documentId: receipt.documentId, textVersionId: receipt.textVersionId })).draft?.items).toHaveLength(2);
    const proposed = await services.readDocumentExtraction(owner, { documentId: receipt.documentId, extractionId: late.extractionId! });
    expect(proposed.draft.items).toHaveLength(1);
    expect(proposed.expectedRevision).toBe(1);
    await expect(services.saveDocumentReviewDraft(owner, {
        documentId: receipt.documentId, textVersionId: receipt.textVersionId, extractionId: late.extractionId!,
        items: proposed.draft.items, selfAssessmentHints: proposed.draft.selfAssessmentHints,
        expectedRevision: proposed.expectedRevision, mutationId: "switch-without-adoption"
    })).rejects.toMatchObject({ code: "conflict" });
    const adopted = await services.adoptDocumentExtraction(owner, {
        documentId: receipt.documentId,
        textVersionId: receipt.textVersionId,
        extractionId: late.extractionId!,
        expectedRevision: 1,
        mutationId: "adopt-late"
    });
    expect(adopted.draft.items).toHaveLength(1);
    expect(adopted.draft.revision).toBe(2);
    expect(adopted.draft.reviewPoints).toHaveLength(1);
    db.failAtBatchStatement = 1;
    await expect(extract("job-delivery-retry")).rejects.toMatchObject({ code: "unavailable" });
    db.failAtBatchStatement = null;
    const resolved = await services.saveDocumentReviewDraft(owner, {
        documentId: receipt.documentId,
        textVersionId: receipt.textVersionId,
        extractionId: adopted.draft.extractionId,
        items: adopted.draft.items,
        selfAssessmentHints: adopted.draft.selfAssessmentHints,
        reviewPoints: adopted.draft.reviewPoints!.map(point => ({ ...point, resolution: "confirmed" as const })),
        expectedRevision: 2,
        mutationId: "resolve-warning"
    });
    await services.createDocumentConfirmation(owner, {
        documentId: receipt.documentId,
        documentVersionId: receipt.documentVersionId,
        textVersionId: receipt.textVersionId,
        items: resolved.draft.items,
        reviewRevision: resolved.draft.revision,
        expectedRevision: 0,
        mutationId: "confirm-resolved"
    });
    expect(JSON.parse(String(db.database.prepare("SELECT review_points_json FROM document_confirmations").get()!.review_points_json))[0].resolution).toBe("confirmed");
});
