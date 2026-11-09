// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { setup, closeMaterialsFixtures } from "../helpers/material-storage-fixture";
afterEach(closeMaterialsFixtures);
import { D1DocumentRepository } from "../../app/server/documents/d1-repository";
import { DocumentStorage } from "../../app/server/documents/storage";
import { ReviewService } from "../../app/server/documents/review-service";
import { materialsClock } from "../helpers/materials-d1";
import { MAX_DOCUMENT_ITEMS_JSON_BYTES, SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION, utf8Bytes, type ConfirmedMaterialItem, type DocumentCandidate } from "../../app/contracts/documents";
import { KIMI_GROUNDED_TERMS_POLICY_ID, KIMI_SOURCE_MENTIONS_POLICY_ID } from "../../app/server/documents/policy";
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

async function pendingExtraction(providerPolicyId: string, candidate?: DocumentCandidate) {
    const { services, owner, db, bucket } = setup();
    const text = candidate?.source.quote ?? "我在指导下清洗数据。";
    const receipt = await services.createDocument(owner, { kind: "resume", displayName: "Practice", text, mutationId: "create" });
    db.database.prepare("INSERT INTO document_processing_consents VALUES(?,?,?,?,?,'analysis','2026.11.1',?,0,0,NULL)")
        .run(owner.ownerId, "consent", receipt.textVersionId, receipt.documentId, receipt.documentVersionId, providerPolicyId);
    db.database.prepare("INSERT INTO document_jobs(owner_id,id,text_version_id,document_id,document_version_id,consent_id,generation,document_revision,revision,state,dispatch_state,execution_slot,queued_at,queue_expires_at,provider_policy_id,price_version,policy_version,reservation_id,updated_at) VALUES(?,'job',?,?,?,'consent',0,0,0,'running','settled',NULL,0,1,?,'2026.11.1','2026.11.1','reservation',0)")
        .run(owner.ownerId, receipt.textVersionId, receipt.documentId, receipt.documentVersionId, providerPolicyId);
    const review = new ReviewService(new D1DocumentRepository(db as unknown as D1Database, materialsClock), new DocumentStorage(bucket));
    const input = { ...receipt, jobId: "job", generation: 0, documentRevision: 0, consentId: "consent",
        candidate: { schemaVersion: "2026.11.1", items: [candidate ?? { id: "practice", kind: "experience", text, requirementLevel: null,
            skillLabels: ["data cleaning"], selfLevelHint: "guided", source: { segmentId: "segment-1", quote: text } }] } };
    return { db, bucket, owner, services, receipt, review, input };
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

async function assessmentReview(projection: "legacy" | "literal" | "grounded" | "mentions", options: {
    source?: string; summary?: string; labels?: string[]; level?: DocumentCandidate["selfLevelHint"];
} = {}) {
    const source = options.source ?? "I tested SQL under supervision.";
    const f = await pendingExtraction(projection === "mentions" ? KIMI_SOURCE_MENTIONS_POLICY_ID
        : projection === "grounded" ? KIMI_GROUNDED_TERMS_POLICY_ID : "materials-openrouter-kimi-k31-pro-mxfp4-zdr-extractive-v1", {
        id: "practice", kind: "experience", text: options.summary ?? source, requirementLevel: null,
        skillLabels: options.labels ?? ["SQL"], selfLevelHint: options.level === undefined ? "guided" : options.level, source: { segmentId: "segment-1", quote: source },
    });
    expect((await f.review.acceptAiExtraction(f.owner.ownerId, f.input)).disposition).toBe("initialized");
    const ref = { documentId: f.receipt.documentId, textVersionId: f.receipt.textVersionId };
    if (projection === "legacy") {
        // Reproduce the pre-envelope capture and its original list-free draft.
        f.db.database.prepare("UPDATE document_extractions SET candidates_json=?").run(JSON.stringify(f.input.candidate));
        const initial = (await f.services.readDocumentReviewDraft(f.owner, ref)).draft!;
        const items = initial.items.map(({ skillLabels, ...item }) => { void skillLabels; return item; });
        f.db.database.prepare("UPDATE document_review_drafts SET items_json=?").run(JSON.stringify(items));
    }
    const draft = (await f.services.readDocumentReviewDraft(f.owner, ref)).draft!;
    const request = { ...ref, extractionId: draft.extractionId, items: draft.items, selfAssessmentHints: draft.selfAssessmentHints,
        expectedRevision: draft.revision, mutationId: "edit-assessment" };
    return { ...f, ref, draft, request };
}

for (const projection of ["legacy", "literal", "grounded", "mentions"] as const) {
    it.each([
        "My colleague tested SQL under supervision.",
        "I will test SQL under supervision.",
        "If I tested SQL under supervision, I would document it.",
        "I did not test SQL under supervision.",
        "The example says ‘I tested SQL under supervision.’",
        "I tested SQL.",
        "I cannot independently test SQL.",
        ...["按指导", "按照指导", "在导师指导下"].flatMap(qualifier => [
            "完成不了 SQL 查询练习", "完成 SQL 查询练习是我下周的计划。", "完成 SQL 查询练习的计划尚未执行。",
        ].map(action => qualifier + action)),
    ])(`saves an unsupported ${projection} edit without its authentic old hint: %s`, async text => {
        const f = await assessmentReview(projection);
        expect(f.draft.selfAssessmentHints).toHaveLength(1);
        const originalCapture = f.db.database.prepare("SELECT candidates_json FROM document_extractions").get();
        const originalObjects = [...f.bucket.objects];
        const request = { ...f.request, items: f.draft.items.map(item => ({ ...item, origin: "user" as const, text })) };
        const saved = await f.services.saveDocumentReviewDraft(f.owner, request);
        expect(saved.draft.items[0]).toMatchObject({ text, origin: "user", sourceRef: f.draft.items[0]!.sourceRef });
        expect(saved.draft.selfAssessmentHints).toEqual([]);
        expect(saved.draft.revision).toBe(1);
        expect((await f.services.readDocumentReviewDraft(f.owner, f.ref)).draft).toEqual(saved.draft);
        expect(await f.services.saveDocumentReviewDraft(f.owner, request)).toEqual(saved);
        expect(f.db.database.prepare("SELECT candidates_json FROM document_extractions").get()).toEqual(originalCapture);
        expect([...f.bucket.objects]).toEqual(originalObjects);
        await expect(f.services.saveDocumentReviewDraft(f.owner, { ...request, mutationId: "stale-edit" })).rejects.toMatchObject({ code: "conflict" });
    });
}

it.each([
    ["I tested SQL under supervision.", "I tested 'SQL' under supervision.", "guided"],
    ["I am familiar with SQL.", "I have only basic familiarity with SQL.", "conceptual"],
    ["I am unsure whether I can test SQL independently.", "I remain unsure whether I can test SQL independently.", "uncertain"],
    ...["按指导", "按照指导", "在导师指导下"].flatMap(qualifier => [
        "完成 SQL 查询练习后，我记录了结果。", "完成 SQL 查询练习，明天计划阅读 React 文档。", "完成 SQL 查询练习，但我无法完成 React 页面。",
    ].map(action => ["I tested SQL under supervision.", qualifier + action, "guided"] as const)),
] as const)("keeps the authentic %s assessment after a supported personal edit", async (source, text, level) => {
    const f = await assessmentReview("grounded", { source, level });
    const saved = await f.services.saveDocumentReviewDraft(f.owner, { ...f.request,
        items: f.draft.items.map(item => ({ ...item, origin: "user", text })) });
    expect(saved.draft.selfAssessmentHints).toEqual(f.draft.selfAssessmentHints);
    expect((await f.services.readDocumentReviewDraft(f.owner, f.ref)).draft).toEqual(saved.draft);
});

for (const qualifier of ["按指导", "按照指导", "在导师指导下"]) {
    it.each([
        ["完成不了 React.js 组件练习", false],
        ["完成 React.js 组件练习是我下周的计划。", false],
        ["完成 React.js 组件练习的计划尚未执行。", false],
        ["完成 React.js 组件练习后，我记录了结果。", true],
        ["完成 React.js 组件练习，明天计划阅读 CSS 文档。", true],
        ["完成 React.js 组件练习，但我无法完成 CSS 页面。", true],
        ["完成 React.js 组件练习. 阅读 CSS 文档是我下周的计划。", true],
        ["完成 React.js 组件练习.阅读 CSS 文档是我下周的计划。", true],
        ["完成 React.js 组件练习。阅读 CSS 文档是我下周的计划。", true],
    ] as const)(`saves the current dotted-skill assessment after ${qualifier}: %s`, async (action, supported) => {
        const f = await assessmentReview("grounded", { source: "I tested React.js under supervision.", labels: ["React.js"] });
        const originalObjects = [...f.bucket.objects], text = qualifier + action;
        const originalCapture = f.db.database.prepare("SELECT candidates_json FROM document_extractions").get();
        const request = { ...f.request, items: f.draft.items.map(item => ({ ...item, origin: "user" as const, text })) };
        const saved = await f.services.saveDocumentReviewDraft(f.owner, request);
        expect(saved.draft.selfAssessmentHints).toEqual(supported ? f.draft.selfAssessmentHints : []);
        expect(saved.draft.items[0]).toMatchObject({ text, origin: "user", skillLabels: ["React.js"], sourceRef: f.draft.items[0]!.sourceRef });
        expect((await f.services.readDocumentReviewDraft(f.owner, f.ref)).draft).toEqual(saved.draft);
        expect(await f.services.saveDocumentReviewDraft(f.owner, request)).toEqual(saved);
        expect([...f.bucket.objects]).toEqual(originalObjects);
        expect(f.db.database.prepare("SELECT candidates_json FROM document_extractions").get()).toEqual(originalCapture);
    });
}

it("removes only the hint whose skill lost personal support", async () => {
    const f = await assessmentReview("grounded", { source: "I tested SQL and React under supervision.", labels: ["SQL", "React"] });
    const text = "I tested SQL under supervision, but my colleague tested React under supervision.";
    const saved = await f.services.saveDocumentReviewDraft(f.owner, { ...f.request,
        items: f.draft.items.map(item => ({ ...item, origin: "user", text })) });
    expect(saved.draft.items[0]?.skillLabels).toEqual(["SQL", "React"]);
    expect(saved.draft.selfAssessmentHints).toEqual(f.draft.selfAssessmentHints.filter(hint => hint.skillLabel === "SQL"));
});

it("revalidates an authentic extracted hint using the server's grounded projection", async () => {
    const f = await assessmentReview("grounded", { source: "My colleague tested SQL under supervision." });
    expect(f.draft.items[0]?.origin).toBe("extracted");
    expect(f.draft.selfAssessmentHints).toHaveLength(1);
    const saved = await f.services.saveDocumentReviewDraft(f.owner, f.request);
    expect(saved.draft.items).toEqual(f.draft.items);
    expect(saved.draft.reviewProjection).toBe("grounded-skill-labels-v2");
    expect(saved.draft.selfAssessmentHints).toEqual([]);
    expect((await f.services.readDocumentReviewDraft(f.owner, f.ref)).draft).toEqual(saved.draft);
});

it.each(["legacy", "literal"] as const)("preserves an untouched %s summary when another fact is edited", async projection => {
    const f = await assessmentReview(projection, { summary: "Tested SQL." });
    expect(f.draft).not.toHaveProperty("reviewProjection");
    const added = await f.services.saveDocumentReviewDraft(f.owner, { ...f.request, items: [...f.draft.items, item] });
    const saved = await f.services.saveDocumentReviewDraft(f.owner, { ...f.request, expectedRevision: added.draft.revision,
        items: [added.draft.items[0]!, { ...added.draft.items[1]!, text: "I am familiar with React." }], mutationId: "edit-other-fact" });
    expect(saved.draft.items[0]).toEqual(f.draft.items[0]);
    expect(saved.draft.selfAssessmentHints).toEqual(f.draft.selfAssessmentHints);
    expect((await f.services.readDocumentReviewDraft(f.owner, f.ref)).draft).toEqual(saved.draft);
});

it("does not restore a dropped hint when its evidence is later restored", async () => {
    const f = await assessmentReview("grounded");
    const saved = await f.services.saveDocumentReviewDraft(f.owner, { ...f.request,
        items: f.draft.items.map(item => ({ ...item, origin: "user", text: "My colleague tested SQL under supervision." })) });
    const restored = await f.services.saveDocumentReviewDraft(f.owner, { ...f.request,
        items: f.draft.items.map(item => ({ ...item, origin: "user" })), expectedRevision: saved.draft.revision, mutationId: "restore-evidence" });
    expect(restored.draft.selfAssessmentHints).toEqual([]);
});

it("does not create a hint for a source term that the reader adds", async () => {
    const f = await assessmentReview("grounded", { source: "I tested SQL and React under supervision." });
    const saved = await f.services.saveDocumentReviewDraft(f.owner, { ...f.request,
        items: f.draft.items.map(item => ({ ...item, origin: "user", skillLabels: ["SQL", "React"] })),
        skillTermAddition: { itemId: "practice", sourceTerm: "React" } });
    expect(saved.draft.items[0]?.skillLabels).toEqual(["SQL", "React"]);
    expect(saved.draft.selfAssessmentHints).toEqual(f.draft.selfAssessmentHints);
});

it.each([
    { id: "forged-hint" }, { level: "uncertain" as const }, { skillLabel: "React" }, { candidateId: "other-fact" },
])("rejects altered hint identity even when the edited text has lost support: %j", async changes => {
    const f = await assessmentReview("grounded");
    await expect(f.services.saveDocumentReviewDraft(f.owner, { ...f.request,
        items: f.draft.items.map(item => ({ ...item, origin: "user", text: "My colleague tested SQL under supervision." })),
        selfAssessmentHints: [{ ...f.draft.selfAssessmentHints[0]!, ...changes }] })).rejects.toMatchObject({ code: "invalid-content" });
    expect((await f.services.readDocumentReviewDraft(f.owner, f.ref)).draft).toEqual(f.draft);
});

it("keeps the original confirmation and source immutable when dropping an unsupported assessment", async () => {
    const f = await assessmentReview("grounded");
    await f.services.createDocumentConfirmation(f.owner, { ...f.ref, documentVersionId: f.receipt.documentVersionId,
        items: f.draft.items, reviewRevision: f.draft.revision, expectedRevision: f.receipt.revision, mutationId: "confirm-original" });
    const originalConfirmation = f.db.database.prepare("SELECT * FROM document_confirmations").get();
    const originalObjects = [...f.bucket.objects];
    const saved = await f.services.saveDocumentReviewDraft(f.owner, { ...f.request,
        items: f.draft.items.map(item => ({ ...item, origin: "user", text: "My colleague tested SQL under supervision." })) });
    expect(saved.draft.selfAssessmentHints).toEqual([]);
    expect(saved.draft.items[0]?.sourceRef).toEqual(f.draft.items[0]?.sourceRef);
    expect(f.db.database.prepare("SELECT * FROM document_confirmations").get()).toEqual(originalConfirmation);
    expect([...f.bucket.objects]).toEqual(originalObjects);
});

it("requires user edit provenance and the authentic source range before retaining or dropping hints", async () => {
    const f = await assessmentReview("grounded");
    const edited: ConfirmedMaterialItem = { ...f.draft.items[0]!, text: "My colleague tested SQL under supervision." };
    await expect(f.services.saveDocumentReviewDraft(f.owner, { ...f.request, items: [edited] })).rejects.toMatchObject({ code: "invalid-content" });
    await expect(f.services.saveDocumentReviewDraft(f.owner, { ...f.request, items: [{ ...edited, origin: "user",
        sourceRef: { ...edited.sourceRef!, end: edited.sourceRef!.end - 1 } }] })).rejects.toMatchObject({ code: "invalid-content" });
    expect((await f.services.readDocumentReviewDraft(f.owner, f.ref)).draft).toEqual(f.draft);
});

it("keeps unsupported-hint removal inside the owner and atomic revision guards", async () => {
    const f = await assessmentReview("grounded");
    const request = { ...f.request, items: f.draft.items.map(item => ({ ...item, origin: "user" as const, text: "My colleague tested SQL under supervision." })) };
    await expect(f.services.saveDocumentReviewDraft({ ownerId: "owner-b" }, request)).rejects.toMatchObject({ code: "not-found" });
    f.db.failAtBatchStatement = 2;
    await expect(f.services.saveDocumentReviewDraft(f.owner, request)).rejects.toMatchObject({ code: "conflict" });
    expect((await f.services.readDocumentReviewDraft(f.owner, f.ref)).draft).toEqual(f.draft);
    expect(f.db.database.prepare("SELECT * FROM document_mutations WHERE endpoint='saveDocumentReviewDraft'").all()).toEqual([]);
    f.db.failAtBatchStatement = null;
    const saved = await f.services.saveDocumentReviewDraft(f.owner, request);
    expect(saved.draft.selfAssessmentHints).toEqual([]);
    expect(saved.draft.revision).toBe(1);
    expect(await f.services.saveDocumentReviewDraft(f.owner, request)).toEqual(saved);
});

it("keeps the server's v3 marker and negative SQL topic through delivery, save, retry and reload", async () => {
    const f = await assessmentReview("mentions", { source: "I have never used SQL.", level: null });
    expect(f.draft.reviewProjection).toBe(SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION);
    expect(f.draft.items[0]?.skillLabels).toEqual(["SQL"]);
    expect(f.draft.selfAssessmentHints).toEqual([]);
    const extraction = f.db.database.prepare("SELECT * FROM document_extractions").get();
    const versions = f.db.database.prepare("SELECT * FROM document_versions").all();
    const objects = [...f.bucket.objects];
    const saved = await f.services.saveDocumentReviewDraft(f.owner, f.request);
    expect(saved.draft.reviewProjection).toBe(SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION);
    expect(saved.draft.items).toEqual(f.draft.items);
    expect((await f.services.readDocumentReviewDraft(f.owner, f.ref)).draft).toEqual(saved.draft);
    expect(await f.services.saveDocumentReviewDraft(f.owner, f.request)).toEqual(saved);
    expect((await f.services.readDocumentExtraction(f.owner, { documentId: f.ref.documentId, extractionId: saved.draft.extractionId! })).draft.reviewProjection)
        .toBe(SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION);
    expect(f.db.database.prepare("SELECT * FROM document_extractions").get()).toEqual(extraction);
    expect(f.db.database.prepare("SELECT * FROM document_versions").all()).toEqual(versions);
    expect([...f.bucket.objects]).toEqual(objects);
});

it("accepts only an explicit v3 source-term addition to the saved original fact", async () => {
    const f = await assessmentReview("mentions", { source: "I have never used SQL.", labels: [], level: null });
    const fact = f.draft.items[0]!, correction = { ...fact, origin: "user" as const, skillLabels: ["SQL"] };
    const request = { ...f.request, items: [correction], skillTermAddition: { itemId: fact.id, sourceTerm: "SQL" } };
    await expect(f.services.saveDocumentReviewDraft(f.owner, { ...f.request, items: [correction] })).rejects.toMatchObject({ code: "invalid-content" });
    for (const reviewProjection of ["grounded-skill-labels-v2", SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION, "future-v4"]) {
        await expect(f.services.saveDocumentReviewDraft(f.owner, { ...request, reviewProjection } as never)).rejects.toBeDefined();
    }
    for (const key of ["documentId", "documentVersionId", "textVersionId"] as const) {
        await expect(f.services.saveDocumentReviewDraft(f.owner, { ...request,
            items: [{ ...correction, sourceRef: { ...fact.sourceRef!, [key]: "other-version" } }] })).rejects.toMatchObject({ code: "invalid-content" });
    }
    await expect(f.services.saveDocumentReviewDraft(f.owner, { ...request,
        items: [{ ...correction, sourceRef: { ...fact.sourceRef!, end: fact.sourceRef!.end - 1 } }] })).rejects.toMatchObject({ code: "invalid-content" });
    await expect(f.services.saveDocumentReviewDraft(f.owner, { ...request,
        items: [{ ...correction, text: "No database work." }] })).rejects.toMatchObject({ code: "invalid-content" });
    await expect(f.services.saveDocumentReviewDraft(f.owner, { ...request,
        items: [{ ...correction, kind: "constraint" }] })).rejects.toMatchObject({ code: "invalid-content" });
    await expect(f.services.saveDocumentReviewDraft({ ownerId: "owner-b" }, request)).rejects.toMatchObject({ code: "not-found" });
    f.db.failAtBatchStatement = 2;
    await expect(f.services.saveDocumentReviewDraft(f.owner, request)).rejects.toMatchObject({ code: "conflict" });
    expect((await f.services.readDocumentReviewDraft(f.owner, f.ref)).draft).toEqual(f.draft);
    f.db.failAtBatchStatement = null;
    const saved = await f.services.saveDocumentReviewDraft(f.owner, request);
    expect(saved.draft.items).toEqual([correction]);
    expect(saved.draft.selfAssessmentHints).toEqual([]);
    expect(saved.draft.reviewProjection).toBe(SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION);
    expect((await f.services.readDocumentReviewDraft(f.owner, f.ref)).draft).toEqual(saved.draft);
    expect(await f.services.saveDocumentReviewDraft(f.owner, request)).toEqual(saved);
    await expect(f.services.saveDocumentReviewDraft(f.owner, { ...request, mutationId: "stale-addition" })).rejects.toMatchObject({ code: "conflict" });
    await expect(f.services.saveDocumentReviewDraft(f.owner, { ...request, expectedRevision: saved.draft.revision,
        mutationId: "duplicate-addition" })).rejects.toMatchObject({ code: "invalid-content" });
});

it.each(["empty", "omitted", "deleted"] as const)("keeps v3 %s labels removed after reload and refuses restoration from an old snapshot", async removal => {
    const f = await assessmentReview("mentions", { source: "I have never used SQL.", level: null });
    const fact = f.draft.items[0]!;
    const { skillLabels, ...withoutLabels } = fact;
    void skillLabels;
    const items = removal === "deleted" ? [] : removal === "empty" ? [{ ...fact, skillLabels: [] }] : [withoutLabels];
    const saved = await f.services.saveDocumentReviewDraft(f.owner, { ...f.request, items });
    expect(saved.draft.items).toEqual(removal === "deleted" ? [] : [{ ...fact, skillLabels: [] }]);
    expect(saved.draft.reviewProjection).toBe(SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION);
    const read = (await f.services.readDocumentReviewDraft(f.owner, f.ref)).draft!;
    expect(read).toEqual(saved.draft);
    await expect(f.services.saveDocumentReviewDraft(f.owner, { ...f.request, expectedRevision: read.revision,
        mutationId: "old-snapshot" })).rejects.toMatchObject({ code: "invalid-content" });
    const resaved = await f.services.saveDocumentReviewDraft(f.owner, { ...f.request, items: read.items, expectedRevision: read.revision,
        mutationId: "keep-removed" });
    expect(resaved.draft.items).toEqual(read.items);
});

it("exposes v3 reclassification after reload and refuses source additions on that reclassified fact", async () => {
    const f = await assessmentReview("mentions", { source: "I have never used SQL.", level: null });
    const saved = await f.services.saveDocumentReviewDraft(f.owner, { ...f.request,
        items: f.draft.items.map(item => ({ ...item, kind: "constraint", origin: "user" })) });
    expect(saved.draft.items[0]?.skillLabels).toEqual([]);
    expect(saved.draft.reclassifiedItemIds).toEqual(["practice"]);
    const read = (await f.services.readDocumentReviewDraft(f.owner, f.ref)).draft!;
    expect(read).toEqual(saved.draft);
    await expect(f.services.saveDocumentReviewDraft(f.owner, { ...f.request, expectedRevision: read.revision,
        items: [{ ...read.items[0]!, skillLabels: ["SQL"] }], skillTermAddition: { itemId: "practice", sourceTerm: "SQL" },
        mutationId: "add-after-reclassification" })).rejects.toMatchObject({ code: "invalid-content" });
});

it("validates the exact v3 source even when the edited fact has no labels", async () => {
    const f = await assessmentReview("mentions", { source: "I have never used SQL.", labels: [], level: null });
    const fact = f.draft.items[0]!;
    await expect(f.services.saveDocumentReviewDraft(f.owner, { ...f.request,
        items: [{ ...fact, origin: "user", sourceRef: { ...fact.sourceRef!, start: 1 } }] })).rejects.toMatchObject({ code: "invalid-content" });
    expect((await f.services.readDocumentReviewDraft(f.owner, f.ref)).draft).toEqual(f.draft);
});

it("requires explicit adoption when switching a saved v3 review to an older extraction", async () => {
    const f = await assessmentReview("mentions", { source: "I have never used SQL.", level: null });
    f.db.database.prepare("INSERT INTO document_jobs(owner_id,id,text_version_id,document_id,document_version_id,consent_id,generation,document_revision,revision,state,dispatch_state,execution_slot,queued_at,queue_expires_at,provider_policy_id,price_version,policy_version,reservation_id,updated_at) VALUES(?,'legacy-job',?,?,?,'consent',0,0,0,'running','settled',NULL,0,1,'older-policy','2026.11.1','2026.11.1','old-reservation',0)")
        .run(f.owner.ownerId, f.receipt.textVersionId, f.receipt.documentId, f.receipt.documentVersionId);
    const late = await f.review.acceptAiExtraction(f.owner.ownerId, { ...f.input, jobId: "legacy-job" });
    expect(late.disposition).toBe("candidates-available");
    const proposed = await f.services.readDocumentExtraction(f.owner, { documentId: f.ref.documentId, extractionId: late.extractionId! });
    expect(proposed.draft.reviewProjection).toBeUndefined();
    await expect(f.services.saveDocumentReviewDraft(f.owner, { ...f.request, extractionId: late.extractionId!,
        items: proposed.draft.items, selfAssessmentHints: proposed.draft.selfAssessmentHints })).rejects.toMatchObject({ code: "conflict" });
    const adopted = await f.services.adoptDocumentExtraction(f.owner, { ...f.ref, extractionId: late.extractionId!,
        expectedRevision: f.draft.revision, mutationId: "explicit-adoption" });
    expect(adopted.draft.reviewProjection).toBeUndefined();
    expect(adopted.draft.items).toEqual(proposed.draft.items);
    expect((await f.services.readDocumentReviewDraft(f.owner, f.ref)).draft).toEqual(adopted.draft);
});
