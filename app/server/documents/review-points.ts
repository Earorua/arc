import {
  documentCandidateReviewPointsSchema, materialReviewPointsSchema, resolveCandidateSourceRef, MATERIAL_HIGH_IMPACT_REVIEW_CODES,
  type MaterialReferenceContext, type MaterialReviewPoint,
} from "../../contracts/documents";
import { canonicalJson, deterministicId } from "../../lib/planning/fingerprint";
import { DocumentServiceError } from "./d1-repository";

export { MATERIAL_HIGH_IMPACT_REVIEW_CODES } from "../../contracts/documents";

/** The model may raise a source-bound question; only the user can resolve it. */
export function validateDocumentReviewPoints(input: unknown, ownerId: string, reference: MaterialReferenceContext): MaterialReviewPoint[] {
  const parsed = documentCandidateReviewPointsSchema.safeParse(input === undefined ? [] : input);
  if (!parsed.success) throw new DocumentServiceError("invalid-content");
  return materialReviewPointsSchema.parse(parsed.data.map(point => {
    const sourceRef = resolveCandidateSourceRef(point.source, ownerId, reference);
    if (!sourceRef) throw new DocumentServiceError("invalid-content");
    return { id: deterministicId("review-point", { code: point.code, sourceRef }), code: point.code, sourceRef, resolution: "unresolved" as const };
  }));
}

/** Omitting the optional compatibility field preserves existing questions; deletion cannot bypass review. */
export function mergeDocumentReviewPointResolutions(current: readonly MaterialReviewPoint[] | undefined, input: unknown): MaterialReviewPoint[] {
  const existing = materialReviewPointsSchema.parse(current ?? []);
  if (input === undefined) return existing;
  const parsed = materialReviewPointsSchema.safeParse(input);
  if (!parsed.success || parsed.data.length !== existing.length) throw new DocumentServiceError("invalid-content");
  const byId = new Map(existing.map(point => [point.id, point]));
  for (const point of parsed.data) {
    const prior = byId.get(point.id);
    if (!prior || point.code !== prior.code || canonicalJson(point.sourceRef) !== canonicalJson(prior.sourceRef)) throw new DocumentServiceError("invalid-content");
  }
  return parsed.data;
}

export function hasBlockingDocumentReviewPoints(points: readonly MaterialReviewPoint[] | undefined): boolean {
  return (points ?? []).some(point => point.resolution === "unresolved"
    && (MATERIAL_HIGH_IMPACT_REVIEW_CODES as readonly string[]).includes(point.code));
}
