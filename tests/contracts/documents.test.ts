import { describe, expect, it } from "vitest";
import * as documents from "../../app/contracts/documents";
import * as api from "../../app/contracts/documents-api";

const sourceRef = { documentId: "doc-a", documentVersionId: "version-a", textVersionId: "text-a", start: 0, end: 4 };
const candidate = { id: "candidate-a", kind: "skill-claim", text: "SQL work", requirementLevel: null, skillLabels: ["SQL"], selfLevelHint: "guided", source: { segmentId: "segment-a", quote: "SQL" } };
const item = { id: "item-a", kind: "experience", text: "SQL work", origin: "extracted", sourceRef, requirementLevel: null };
const referenceContext = { ownerId: "owner-a", documentId: "doc-a", documentVersionId: "version-a", textVersionId: "text-a", lifecycle: "active", text: "SQL work 😀", segments: [{ id: "segment-a", start: 0, end: 8 }] } as const;
const draft = { id: "review-a", schemaVersion: "2026.11.1", documentId: "doc-a", documentVersionId: "version-a", textVersionId: "text-a", extractionId: null, origin: "manual", items: [], selfAssessmentHints: [], revision: 1, updatedAt: "2026-11-04T00:00:00Z" };

describe("private material domain contracts", () => {
  it("accepts a version-bound half-open source range", () => expect(documents.materialSourceRefSchema.parse(sourceRef)).toEqual(sourceRef));
  it.each([{ ownerId: "owner-b" }, { objectKey: "private/body" }, { url: "https://example.com" }, { end: 0 }, { start: 4 }])("rejects unsafe source fields or ranges: %j", (change) => expect(documents.materialSourceRefSchema.safeParse({ ...sourceRef, ...change }).success).toBe(false));
  it("validates exact owner and version membership against retained text", () => {
    expect(documents.validateMaterialSourceRef(sourceRef, "owner-a", referenceContext)).toBe(true);
    for (const context of [{ ...referenceContext, ownerId: "owner-b" }, { ...referenceContext, documentVersionId: "version-b" }, { ...referenceContext, textVersionId: "text-b" }, { ...referenceContext, lifecycle: "revoked" }, { ...referenceContext, text: "a" }]) expect(documents.validateMaterialSourceRef(sourceRef, "owner-a", context)).toBe(false);
  });
  it("resolves a unique quote only in its owner-bound segment using UTF-16 offsets", () => {
    expect(documents.resolveCandidateSourceRef(candidate.source, "owner-a", referenceContext)).toEqual({ ...sourceRef, end: 3 });
    expect(documents.resolveCandidateSourceRef(candidate.source, "owner-b", referenceContext)).toBeNull();
    expect(documents.resolveCandidateSourceRef(candidate.source, "owner-a", { ...referenceContext, text: "SQL SQL", segments: [{ id: "segment-a", start: 0, end: 7 }] })).toBeNull();
    expect(documents.resolveCandidateSourceRef({ segmentId: "segment-b", quote: "SQL" }, "owner-a", referenceContext)).toBeNull();
  });
  it("rejects split-surrogate boundaries, duplicate segments and overlapping quote matches", () => {
    const context = { ...referenceContext, text: "😀SQL", segments: [{ id: "segment-a", start: 0, end: 5 }] };
    expect(documents.resolveCandidateSourceRef(candidate.source, "owner-a", context)).toEqual({ ...sourceRef, start: 2, end: 5 });
    expect(documents.resolveCandidateSourceRef(candidate.source, "owner-a", { ...context, segments: [{ id: "segment-a", start: 1, end: 5 }] })).toBeNull();
    expect(documents.resolveCandidateSourceRef(candidate.source, "owner-a", { ...context, segments: [context.segments[0]!, context.segments[0]!] })).toBeNull();
    expect(documents.validateMaterialSourceRef({ ...sourceRef, start: 1, end: 5 }, "owner-a", context)).toBe(false);
    expect(documents.resolveCandidateSourceRef({ segmentId: "segment-a", quote: "aa" }, "owner-a", { ...context, text: "aaa", segments: [{ id: "segment-a", start: 0, end: 3 }] })).toBeNull();
  });
  it("keeps AI candidate source distinct from confirmed source refs", () => {
    expect(documents.documentCandidateSchema.parse(candidate)).toEqual(candidate);
    expect(documents.confirmedMaterialItemSchema.parse(item)).toEqual(item);
    expect(documents.documentCandidateSchema.safeParse({ ...candidate, sourceRef }).success).toBe(false);
    expect(documents.confirmedMaterialItemSchema.safeParse({ ...item, sourceRef: null }).success).toBe(false);
    expect(documents.confirmedMaterialItemSchema.safeParse({ ...item, origin: "user", sourceRef: null }).success).toBe(true);
  });
  it.each(["independent", "verified"])("rejects AI self-level %s", (selfLevelHint) => expect(documents.documentCandidateSchema.safeParse({ ...candidate, selfLevelHint }).success).toBe(false));
  it("rejects requirement and hint fields on unrelated kinds", () => {
    expect(documents.documentCandidateSchema.safeParse({ ...candidate, requirementLevel: "must" }).success).toBe(false);
    expect(documents.documentCandidateSchema.safeParse({ ...candidate, kind: "constraint" }).success).toBe(false);
    expect(documents.confirmedMaterialItemSchema.safeParse({ ...item, audit: {} }).success).toBe(false);
  });
  it("bounds and deduplicates candidates, facts and serialized payloads", () => {
    expect(documents.documentCandidatesSchema.safeParse([candidate, candidate]).success).toBe(false);
    expect(documents.documentCandidatesSchema.safeParse(Array.from({ length: 101 }, (_, i) => ({ ...candidate, id: `candidate-${i}` }))).success).toBe(false);
    expect(documents.documentCandidatesSchema.safeParse(Array.from({ length: 60 }, (_, i) => ({ ...candidate, id: `candidate-${i}`, text: "中".repeat(1000) }))).success).toBe(false);
    expect(documents.confirmedMaterialItemsSchema.safeParse([{ ...item, text: "a".repeat(1001) }]).success).toBe(false);
  });
  it("normalizes only BOM and line endings while counting code points separately", () => {
    expect(documents.normalizeDocumentText("\ufeffＡ\r\n😀\rB")).toBe("Ａ\n😀\nB");
    expect(documents.countUnicodeCodePoints("😀")).toBe(1);
    expect(documents.documentTextSchema.safeParse("😀".repeat(50000)).success).toBe(true);
    expect(documents.documentTextSchema.safeParse("😀".repeat(50001)).success).toBe(false);
  });
  it("limits selection cardinality and rejects duplicate document use", () => {
    const entry = { slot: "resume", documentId: "doc-a", documentVersionId: "version-a", confirmationId: "confirmation-a" };
    expect(documents.materialSelectionEntriesSchema.parse([])).toEqual([]);
    expect(documents.materialSelectionEntriesSchema.safeParse([entry, { ...entry, documentId: "doc-b" }]).success).toBe(false);
    expect(documents.materialSelectionEntriesSchema.safeParse([entry, { ...entry, slot: "supplement" }]).success).toBe(false);
    expect(documents.materialSelectionEntriesSchema.safeParse(Array.from({ length: 4 }, (_, i) => ({ ...entry, slot: "supplement", documentId: `doc-${i}` }))).success).toBe(false);
  });
  it("requires confirmation ownership and exact selected version", () => {
    const entry = { slot: "resume", documentId: "doc-a", documentVersionId: "version-a", confirmationId: "confirmation-a" };
    const record = { ...referenceContext, confirmationId: "confirmation-a", confirmationDocumentVersionId: "version-a", confirmationTextVersionId: "text-a", confirmationState: "active" };
    expect(documents.validateMaterialSelectionEntry(entry, "owner-a", record)).toBe(true);
    expect(documents.validateMaterialSelectionEntry(entry, "owner-b", record)).toBe(false);
    expect(documents.validateMaterialSelectionEntry(entry, "owner-a", { ...record, confirmationDocumentVersionId: "version-b" })).toBe(false);
  });
  it("keeps review drafts bounded and revisions compare-and-swap", () => {
    expect(documents.documentReviewDraftSchema.parse(draft)).toEqual(draft);
    expect(documents.reviewDraftWriteDecision(draft, { textVersionId: "text-a", extractionId: null, expectedRevision: 1 })).toEqual({ kind: "write", nextRevision: 2 });
    expect(documents.reviewDraftWriteDecision(draft, { textVersionId: "text-a", extractionId: null, expectedRevision: 0 })).toEqual({ kind: "conflict" });
    expect(documents.reviewDraftWriteDecision(draft, { textVersionId: "text-b", extractionId: null, expectedRevision: 1 })).toEqual({ kind: "conflict" });
  });
  it("never lets a late extraction overwrite edits or revoked material", () => {
    const input = { current: null, textVersionId: "text-a", ownerMatches: true, generationMatches: true, consentValid: true, materialActive: true };
    expect(documents.lateExtractionDecision(input)).toBe("initialize");
    expect(documents.lateExtractionDecision({ ...input, current: draft })).toBe("candidates-available");
    expect(documents.lateExtractionDecision({ ...input, materialActive: false })).toBe("reject");
    expect(documents.lateExtractionDecision({ ...input, consentValid: false })).toBe("reject");
    expect(documents.lateExtractionDecision({ ...input, generationMatches: false })).toBe("reject");
    expect(documents.lateExtractionDecision({ ...input, ownerMatches: false })).toBe("reject");
    expect(documents.lateExtractionDecision({ ...input, current: { ...draft, textVersionId: "text-b" } })).toBe("reject");
    expect(documents.lateExtractionDecision({ ...input, current: { ...draft, revision: 0 } })).toBe("initialize");
  });
  it("requires individual explicit selection for independent self-assessment", () => {
    const decision = { skillId: "sql", level: "independent", sourceItemIds: ["item-a"] };
    expect(documents.materialSelfAssessmentAdoptionSchema.safeParse({ mode: "single", decisions: [decision] }).success).toBe(true);
    expect(documents.materialSelfAssessmentAdoptionSchema.safeParse({ mode: "batch", decisions: [decision] }).success).toBe(false);
    expect(documents.materialSelfAssessmentAdoptionSchema.safeParse({ mode: "batch", decisions: [{ ...decision, level: "uncertain" }] }).success).toBe(true);
  });
});

describe("document HTTP contracts", () => {
  const scope = { kind: "draft", draftId: "draft-a", previousGoalId: null };
  const selectionRef = { selectionId: "selection-a", selectionRevision: 1 };
  const audit = { id: "audit-a", schemaVersion: "2026.08.1", blueprintId: "ai-native-full-stack-engineer", blueprintVersion: "2026.08.1", answers: [], evidence: [], createdBy: "owner-a", inputFingerprint: "p2-audit" };
  const availability = { id: "availability-a", schemaVersion: "2026.08.1", timeZone: "UTC", weekdays: { monday: 60, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 0, sunday: 0 }, exceptions: [], weeklyMinutes: 60, inputFingerprint: "p2-time" };
  const target = { id: "target-a", schemaVersion: "2026.08.1", targetWeeks: 8, inputFingerprint: "p2-target" };
  const planning = { mutationId: "mutation-a", planningDate: "2026-11-04", audit, availability, target, selectedScope: "full-scope" };
  const requests = {
    listDocuments: { limit: 30 }, createDocument: { kind: "resume", displayName: "Resume", text: "SQL", mutationId: "mutation-a" },
    readDocument: { documentId: "doc-a", versionId: "version-a" }, createDocumentVersion: { documentId: "doc-a", text: "SQL", expectedRevision: 1, mutationId: "mutation-a" },
    readDocumentReviewDraft: { documentId: "doc-a", textVersionId: "text-a" }, saveDocumentReviewDraft: { documentId: "doc-a", textVersionId: "text-a", extractionId: null, expectedRevision: 1, items: [item], selfAssessmentHints: [], mutationId: "mutation-a" },
    createDocumentConfirmation: { documentId: "doc-a", documentVersionId: "version-a", textVersionId: "text-a", reviewRevision: 1, expectedRevision: 1, items: [item], mutationId: "mutation-a" },
    createMaterialSelection: { scope, entries: [], mutationId: "mutation-a" }, readMaterialSelection: { selectionId: "selection-a" }, updateMaterialSelection: { selectionId: "selection-a", entries: [], expectedRevision: 1, mutationId: "mutation-a" },
    createDocumentConsent: { textVersionId: "text-a", purpose: "analysis", policyVersion: "2026.11.1", providerPolicyId: "policy-a", mutationId: "mutation-a" },
    createDocumentJob: { textVersionId: "text-a", consentId: "consent-a", mutationId: "mutation-a", previousJobId: "job-previous" }, readDocumentJob: { jobId: "job-a" }, cancelDocumentJob: { jobId: "job-a", expectedRevision: 1, mutationId: "mutation-a" },
    revokeDocumentConsent: { consentId: "consent-a", mutationId: "mutation-a" }, createMaterialContext: { ...planning, scope, selectionRef, source: { source: "flagship", roleId: "ai-native-full-stack-engineer" } }, generatePlanning: { ...planning, roleId: "ai-native-full-stack-engineer" },
    materialReplan: { scope: { kind: "goal", goalId: "goal-a", workspaceId: "workspace-a", baseVersionId: "plan-a", revision: 1 }, selectionRef, contextVersionId: "context-a", previewToken: "a".repeat(64), mutationId: "mutation-a" },
    readMaterialContext: { contextVersionId: "context-a" }, deleteDocument: { documentId: "doc-a", expectedRevision: 1, mutationId: "mutation-a" }, readDocumentDeletion: { deletionJobId: "deletion-a" },
    readDocumentCapabilities: {}, readDocumentMutation: { mutationId: "save-a", endpoint: "createDocument" },
    readDocumentExtraction: { documentId: "doc-a", extractionId: "extract-a" },
    adoptDocumentExtraction: { documentId: "doc-a", textVersionId: "text-a", extractionId: "extract-a", expectedRevision: 1, mutationId: "adopt-a" },
    readMaterialHistory: { goalId: "goal-a" },
    readAdoptedMaterials: { goalId: "goal-a", workspaceId: "workspace-a", baseVersionId: "plan-a" },
    detachAdoptedMaterial: { scope: { kind: "goal", goalId: "goal-a", workspaceId: "workspace-a", baseVersionId: "plan-a", revision: 3 },
      entry: { slot: "jd", documentId: "doc-a", documentVersionId: "version-a", confirmationId: "confirm-a" }, mutationId: "detach-a" },
    readMaterialGenerationReceipt: { goalId: "goal-a", mutationId: "mutation-a", contextVersionId: "context-a" },
  } satisfies Record<api.DocumentEndpoint, unknown>;
  it.each(Object.entries(requests))("accepts the exact %s request and rejects caller ownership", (name, request) => {
    const contract = api.documentEndpointContracts[name as api.DocumentEndpoint];
    expect(contract.request.parse(request)).toEqual(request);
    expect(contract.request.safeParse({ ...request, ownerId: "owner-b" }).success).toBe(false);
    if (contract.method !== "GET") {
      const { mutationId, ...withoutMutation } = request as Record<string, unknown>;
      void mutationId;
      expect(contract.request.safeParse(withoutMutation).success).toBe(false);
    }
  });
  it("preserves strict boundaries with explicit phase 1 recovery and history endpoints", () => {
    expect(Object.keys(api.documentEndpointContracts)).toHaveLength(29);
    for (const endpoint of Object.values(api.documentEndpointContracts)) {
      expect(endpoint.request.safeParse({ ownerId: "caller-owner" }).success).toBe(false);
      expect(endpoint.response.safeParse({ arbitrary: "body" }).success).toBe(false);
    }
  });
  it("bounds creation, consent versions and mutation IDs", () => {
    const input = { kind: "resume", displayName: "My resume", text: "SQL work", mutationId: "mutation-a" };
    expect(api.createDocumentRequestSchema.parse(input)).toEqual(input);
    expect(api.createDocumentRequestSchema.safeParse({ ...input, ownerId: "owner-a" }).success).toBe(false);
    expect(api.createDocumentRequestSchema.safeParse({ ...input, mutationId: "" }).success).toBe(false);
    expect(api.createDocumentRequestSchema.safeParse({ ...input, text: "a".repeat(50001) }).success).toBe(false);
    const consent = { textVersionId: "text-a", purpose: "analysis", policyVersion: "2026.11.1", providerPolicyId: "policy-a", mutationId: "mutation-a" };
    expect(api.createDocumentConsentRequestSchema.safeParse(consent).success).toBe(true);
    expect(api.createDocumentConsentRequestSchema.safeParse({ ...consent, policyVersion: "" }).success).toBe(false);
    expect(api.createDocumentConsentRequestSchema.safeParse({ ...consent, purpose: "agent" }).success).toBe(false);
  });
  it("returns bounded metadata and finite job errors without private bodies", () => {
    expect(api.documentJobResponseSchema.safeParse({ jobId: "job-a", revision: 1, state: "cost-unknown", costState: "held-unknown", extractionId: null, errorCode: "outcome-unknown" }).success).toBe(true);
    expect(api.documentJobResponseSchema.safeParse({ jobId: "job-a", revision: 1, state: "failed", costState: "released", extractionId: null, errorCode: "SQL private resume" }).success).toBe(false);
    expect(api.listDocumentsRequestSchema.safeParse({ limit: 31 }).success).toBe(false);
  });
  it("binds mutation digests to owner, endpoint and exact canonical body", async () => {
    const first = await api.createDocumentMutationDigest("owner-a", "createDocument", { mutationId: "mutation-a", text: "SQL" });
    expect(first).toMatch(/^[0-9a-f]{64}$/u);
    expect(await api.createDocumentMutationDigest("owner-a", "createDocument", { text: "SQL", mutationId: "mutation-a" })).toBe(first);
    expect(await api.createDocumentMutationDigest("owner-b", "createDocument", { mutationId: "mutation-a", text: "SQL" })).not.toBe(first);
    expect(await api.createDocumentMutationDigest("owner-a", "createDocumentVersion", { mutationId: "mutation-a", text: "SQL" })).not.toBe(first);
    expect(await api.createDocumentMutationDigest("owner-a", "createDocument", { mutationId: "mutation-b", text: "SQL" })).toBe(first);
    expect(await api.createDocumentMutationDigest("owner-a", "createDocument", { mutationId: "mutation-a", nested: { createdAt: "a" } })).not.toBe(await api.createDocumentMutationDigest("owner-a", "createDocument", { mutationId: "mutation-a", nested: { createdAt: "b" } }));
    expect(api.documentMutationReplayDecision({ ownerId: "owner-a", endpoint: "createDocument", mutationId: "mutation-a", bodyDigest: first }, { ownerId: "owner-a", endpoint: "createDocument", mutationId: "mutation-a", bodyDigest: "f".repeat(64) }, true)).toBe("conflict");
    expect(api.documentMutationReplayDecision({ ownerId: "owner-a", endpoint: "createDocument", mutationId: "mutation-a", bodyDigest: first }, { ownerId: "owner-a", endpoint: "createDocument", mutationId: "mutation-a", bodyDigest: first }, false)).toBe("gone");
    const receipt = { ownerId: "owner-a", endpoint: "createDocument", mutationId: "mutation-a", bodyDigest: first };
    expect(api.documentMutationReplayDecision(null, receipt, true)).toBe("create");
    expect(api.documentMutationReplayDecision(receipt, receipt, true)).toBe("replay");
    expect(api.documentMutationReplayDecision(receipt, { ...receipt, ownerId: "owner-b" }, true)).toBe("conflict");
  });
  it("caps consumed request bytes and freezes finite HTTP errors", () => {
    expect(api.isDocumentRequestBodyWithinLimit(512 * 1024)).toBe(true);
    expect(api.isDocumentRequestBodyWithinLimit(512 * 1024 + 1)).toBe(false);
    expect(api.isDocumentRequestBodyWithinLimit(-1)).toBe(false);
    expect(api.documentApiErrorSchema.parse({ code: "gone", status: 410 })).toEqual({ code: "gone", status: 410 });
    expect(api.documentApiErrorSchema.safeParse({ code: "gone", status: 200 }).success).toBe(false);
    expect(api.documentApiErrorSchema.safeParse({ code: "gone", status: 410, text: "private" }).success).toBe(false);
  });
});
