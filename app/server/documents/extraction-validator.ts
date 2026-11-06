import { z } from "zod";
import { documentExtractionSchema, MAX_DOCUMENT_ITEMS_JSON_BYTES, fitsJsonBytes, utf8Bytes, resolveCandidateSourceRef, type MaterialReferenceContext, type ConfirmedMaterialItem, materialSelfAssessmentHintsSchema } from "../../contracts/documents";
import { containsMaterialSkillLabel } from "../../lib/materials/skill-labels";
import { DocumentServiceError } from "./d1-repository";
import { validateDocumentReviewPoints } from "./review-points";

// The server writes this envelope only after validating the provider's canonical candidate.
// Unwrapped historical captures originally projected facts without a skill-word list.
const reviewProjection = "literal-skill-labels-v1";
const storedExtractionSchema = z.object({ reviewProjection: z.literal(reviewProjection), candidate: z.unknown() }).strict();
export function serializeDocumentExtraction(candidate: unknown) {
    const json = JSON.stringify({ reviewProjection, candidate });
    if (utf8Bytes(json) > MAX_DOCUMENT_ITEMS_JSON_BYTES) throw new DocumentServiceError("invalid-content");
    return json;
}
export function validateStoredDocumentExtraction(json: string, ownerId: string, reference: MaterialReferenceContext) {
    const raw: unknown = JSON.parse(json);
    const stored = storedExtractionSchema.safeParse(raw);
    return stored.success ? validateDocumentExtraction(stored.data.candidate, ownerId, reference) : projectExtraction(raw, ownerId, reference, "legacy");
}
export function validateDocumentExtraction(candidate: unknown, ownerId: string, reference: MaterialReferenceContext) {
    return projectExtraction(candidate, ownerId, reference, reviewProjection);
}
function projectExtraction(candidate: unknown, ownerId: string, reference: MaterialReferenceContext, projection: "legacy" | typeof reviewProjection) {
    const parsed = documentExtractionSchema.safeParse(candidate);
    if (!parsed.success)
        throw new DocumentServiceError("invalid-content");
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
            ...(projection === reviewProjection && item.kind !== "constraint" ? {
                skillLabels: item.skillLabels.filter(label => containsMaterialSkillLabel(item.source.quote, label))
            } : {})
        };
    });
    const hints = parsed.data.items.flatMap((item, itemIndex) => item.selfLevelHint === null ? [] : item.skillLabels.flatMap((label, index) => {
        if (projection === reviewProjection && !items[itemIndex]!.skillLabels?.includes(label)) return [];
        return [{ id: `hint-${item.id}-${index}`, candidateId: item.id, skillLabel: label, level: item.selfLevelHint }];
    }));
    const selfAssessmentHints = materialSelfAssessmentHintsSchema.safeParse(hints);
    if (!selfAssessmentHints.success) throw new DocumentServiceError("invalid-content");
    const review = {
        items,
        selfAssessmentHints: selfAssessmentHints.data,
        reviewPoints: validateDocumentReviewPoints(parsed.data.reviewPoints, ownerId, reference)
    };
    if (!fitsJsonBytes(review, MAX_DOCUMENT_ITEMS_JSON_BYTES))
        throw new DocumentServiceError("invalid-content");
    return review;
}
