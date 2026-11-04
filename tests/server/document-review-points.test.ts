import { describe, expect, it } from "vitest";
import { validateDocumentReviewPoints, mergeDocumentReviewPointResolutions, hasBlockingDocumentReviewPoints } from "../../app/server/documents/review-points";
import type { MaterialReferenceContext } from "../../app/contracts/documents";
const reference: MaterialReferenceContext = { ownerId: "owner-a", documentId: "doc-a", documentVersionId: "version-a", textVersionId: "text-a", lifecycle: "active", text: "SQL level statements conflict.", segments: [{ id: "segment-a", start: 0, end: 30 }] };
describe("source-bound review points", () => {
  it("validates actual model quotes and makes every new point unresolved", () => {
    const points = validateDocumentReviewPoints([{ code: "conflicting-self-assessment", source: { segmentId: "segment-a", quote: reference.text } }], "owner-a", reference);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ code: "conflicting-self-assessment", sourceRef: { documentId: "doc-a", start: 0, end: 30 }, resolution: "unresolved" });
    expect(hasBlockingDocumentReviewPoints(points)).toBe(true);
    expect(validateDocumentReviewPoints(undefined, "owner-a", reference)).toEqual([]);
  });
  it("rejects fabricated quotes, owner mismatches, extra resolution and unregistered codes", () => {
    const point = { code: "prompt-injection", source: { segmentId: "segment-a", quote: reference.text } };
    for (const invalid of [{ ...point, resolution: "confirmed" }, { ...point, code: "arbitrary-code" }, { ...point, source: { ...point.source, quote: "fabricated" } }]) expect(() => validateDocumentReviewPoints([invalid], "owner-a", reference)).toThrow();
    expect(() => validateDocumentReviewPoints([point], "owner-b", reference)).toThrow();
  });
  it("allows only explicit resolution changes and prevents deletion of a blocking point", () => {
    const current = validateDocumentReviewPoints([{ code: "team-attribution", source: { segmentId: "segment-a", quote: reference.text } }], "owner-a", reference);
    expect(mergeDocumentReviewPointResolutions(current, undefined)).toEqual(current);
    expect(() => mergeDocumentReviewPointResolutions(current, [])).toThrow();
    expect(() => mergeDocumentReviewPointResolutions(current, [{ ...current[0], code: "missing-information" }])).toThrow();
    const updated = mergeDocumentReviewPointResolutions(current, [{ ...current[0], resolution: "ignored" }]);
    expect(hasBlockingDocumentReviewPoints(updated)).toBe(false);
  });
});
