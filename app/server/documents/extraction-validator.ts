import { z } from "zod";
import { documentExtractionSchema, GROUNDED_MATERIAL_REVIEW_PROJECTION, MAX_DOCUMENT_ITEMS_JSON_BYTES, fitsJsonBytes, utf8Bytes, resolveCandidateSourceRef, type MaterialReferenceContext, type ConfirmedMaterialItem, materialSelfAssessmentHintsSchema } from "../../contracts/documents";
import { supportsReviewedSkillLabel } from "../../lib/materials/skill-labels";
import { DocumentServiceError } from "./d1-repository";
import { validateDocumentReviewPoints } from "./review-points";
import { KIMI_GROUNDED_TERMS_POLICY_ID } from "./policy";

// The server writes this envelope only after validating the provider's canonical candidate.
// Unwrapped historical captures originally projected facts without a skill-word list.
const storedProjection = z.enum(["literal-skill-labels-v1", GROUNDED_MATERIAL_REVIEW_PROJECTION]);
const storedExtractionSchema = z.object({ reviewProjection: storedProjection, candidate: z.unknown() }).strict();
function extractionProjection(providerPolicyId?: string) {
    return providerPolicyId === KIMI_GROUNDED_TERMS_POLICY_ID ? GROUNDED_MATERIAL_REVIEW_PROJECTION : "literal-skill-labels-v1";
}
export function serializeDocumentExtraction(candidate: unknown, providerPolicyId?: string) {
    const json = JSON.stringify({ reviewProjection: extractionProjection(providerPolicyId), candidate });
    if (utf8Bytes(json) > MAX_DOCUMENT_ITEMS_JSON_BYTES) throw new DocumentServiceError("invalid-content");
    return json;
}
export function validateStoredDocumentExtraction(json: string, ownerId: string, reference: MaterialReferenceContext) {
    const raw: unknown = JSON.parse(json);
    const stored = storedExtractionSchema.safeParse(raw);
    return stored.success ? projectExtraction(stored.data.candidate, ownerId, reference, stored.data.reviewProjection) : projectExtraction(raw, ownerId, reference, "legacy");
}
export function validateDocumentExtraction(candidate: unknown, ownerId: string, reference: MaterialReferenceContext, providerPolicyId?: string) {
    return projectExtraction(candidate, ownerId, reference, extractionProjection(providerPolicyId));
}
function projectExtraction(candidate: unknown, ownerId: string, reference: MaterialReferenceContext, projection: "legacy" | z.infer<typeof storedProjection>) {
    const parsed = documentExtractionSchema.safeParse(candidate);
    if (!parsed.success)
        throw new DocumentServiceError("invalid-content");
    const reviewProjection = projection === GROUNDED_MATERIAL_REVIEW_PROJECTION ? projection : undefined;
    const items: ConfirmedMaterialItem[] = parsed.data.items.map(item => {
        const sourceRef = resolveCandidateSourceRef(item.source, ownerId, reference);
        if (!sourceRef)
            throw new DocumentServiceError("invalid-content");
        return {
            id: item.id,
            kind: item.kind,
            text: item.text,
            origin: "extracted",
            sourceRef,
            requirementLevel: item.requirementLevel,
            ...(reviewProjection || (projection === "literal-skill-labels-v1" && item.kind !== "constraint") ? {
                skillLabels: item.skillLabels.filter(label => supportsReviewedSkillLabel(item.source.quote, label, reviewProjection))
            } : {})
        };
    });
    const hints = parsed.data.items.flatMap((item, itemIndex) => item.selfLevelHint === null ? [] : item.skillLabels.flatMap((label, index) => {
        if (projection !== "legacy" && !items[itemIndex]!.skillLabels?.includes(label)) return [];
        return [{ id: `hint-${item.id}-${index}`, candidateId: item.id, skillLabel: label, level: item.selfLevelHint }];
    }));
    const selfAssessmentHints = materialSelfAssessmentHintsSchema.safeParse(hints);
    if (!selfAssessmentHints.success) throw new DocumentServiceError("invalid-content");
    const review = {
        ...(reviewProjection ? { reviewProjection } : {}),
        items,
        selfAssessmentHints: selfAssessmentHints.data,
        reviewPoints: validateDocumentReviewPoints(parsed.data.reviewPoints, ownerId, reference)
    };
    if (!fitsJsonBytes(review, MAX_DOCUMENT_ITEMS_JSON_BYTES))
        throw new DocumentServiceError("invalid-content");
    return review;
}
