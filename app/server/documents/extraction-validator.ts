import { z } from "zod";
import { DOCUMENT_SCHEMA_VERSION, MAX_DOCUMENT_ITEMS_JSON_BYTES, boundedMaterialJson, documentCandidatesSchema, documentCandidateReviewPointsSchema, resolveCandidateSourceRef, type MaterialReferenceContext, type ConfirmedMaterialItem, materialSelfAssessmentHintsSchema } from "../../contracts/documents";
import { DocumentServiceError } from "./d1-repository";
import { validateDocumentReviewPoints } from "./review-points";
const extractionSchema = boundedMaterialJson(z.object({
    schemaVersion: z.literal(DOCUMENT_SCHEMA_VERSION),
    items: documentCandidatesSchema,
    reviewPoints: documentCandidateReviewPointsSchema.optional()
}).strict(), MAX_DOCUMENT_ITEMS_JSON_BYTES);
export function validateDocumentExtraction(candidate: unknown, ownerId: string, reference: MaterialReferenceContext) {
    const parsed = extractionSchema.safeParse(candidate);
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
            requirementLevel: item.requirementLevel
        };
    });
    const selfAssessmentHints = materialSelfAssessmentHintsSchema.parse(parsed.data.items.flatMap(item => item.selfLevelHint === null ? [] : item.skillLabels.map((label, index) => ({
        id: `hint-${item.id}-${index}`,
        candidateId: item.id,
        skillLabel: label,
        level: item.selfLevelHint
    }))));
    return {
        items,
        selfAssessmentHints,
        reviewPoints: validateDocumentReviewPoints(parsed.data.reviewPoints, ownerId, reference)
    };
}
