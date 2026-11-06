import { expect, it } from "vitest";
import { validateDocumentExtraction } from "../../app/server/documents/extraction-validator";
const reference = {
    ownerId: "owner",
    documentId: "doc",
    documentVersionId: "version",
    textVersionId: "text",
    lifecycle: "active",
    text: "SQL is required",
    segments: [{ id: "segment-1", start: 0, end: 15 }]
};
const candidate = {
    schemaVersion: "2026.11.1",
    items: [
        {
            id: "fact",
            kind: "requirement",
            text: "SQL required",
            requirementLevel: "must",
            skillLabels: ["SQL"],
            selfLevelHint: null,
            source: { segmentId: "segment-1", quote: "SQL" }
        }
    ]
};
it("resolves exact owner-bound source offsets and rejects invented identities or quotes", () => {
    expect(validateDocumentExtraction(candidate, "owner", reference).items[0]?.sourceRef).toEqual({ documentId: "doc", documentVersionId: "version", textVersionId: "text", start: 0, end: 3 });
    expect(() => validateDocumentExtraction(candidate, "other", reference)).toThrow();
    expect(() => validateDocumentExtraction({ ...candidate, ownerId: "owner" }, "owner", reference)).toThrow();
    expect(() => validateDocumentExtraction(candidate, "owner", { ...reference, text: "SQL and SQL", segments: [{ id: "segment-1", start: 0, end: 11 }] })).toThrow();
    expect(() => validateDocumentExtraction(candidate, "owner", { ...reference, lifecycle: "revoked" })).toThrow();
    expect(() => validateDocumentExtraction({ ...candidate, items: [{ ...candidate.items[0], selfLevelHint: "independent" }] }, "owner", reference)).toThrow();
});
it("enforces one byte budget across candidates and source-bound review points", () => {
    const spans = Array.from({ length: 100 }, (_, index) => `${index}-SQL-${"x".repeat(440)}`);
    let offset = 0;
    const segments = spans.map((span, index) => { const start = offset; offset += span.length; return { id: `segment-${index}`, start, end: offset }; });
    const oversized = {
        schemaVersion: "2026.11.1",
        items: spans.map((_, index) => ({ ...candidate.items[0]!, id: `fact-${index}`, text: "x".repeat(900), source: { segmentId: `segment-${index}`, quote: "SQL" } })),
        reviewPoints: spans.map((quote, index) => ({ code: "missing-information", source: { segmentId: `segment-${index}`, quote } })),
    };
    expect(new TextEncoder().encode(JSON.stringify(oversized)).byteLength).toBeGreaterThan(128 * 1024);
    expect(() => validateDocumentExtraction(oversized, "owner", { ...reference, text: spans.join(""), segments })).toThrow("invalid-content");
});
it("preserves an explicit empty skill list even when the new source-span fact itself names a skill", () => {
    const fact = { ...candidate.items[0]!, text: "SQL is required", skillLabels: [], source: { segmentId: "segment-1", quote: "SQL is required" } };
    expect(validateDocumentExtraction({ ...candidate, items: [fact] }, "owner", reference).items[0]?.skillLabels).toEqual([]);
    expect(() => validateDocumentExtraction({ reviewProjection: "literal-skill-labels-v1", candidate }, "owner", reference)).toThrow("invalid-content");
});
it("projects only hints supported by the cited words, preserving the original hint indices", () => {
    const fact = { ...candidate.items[0]!, kind: "experience", requirementLevel: null, skillLabels: ["Rust", "SQL"], selfLevelHint: "guided" };
    const { items, selfAssessmentHints } = validateDocumentExtraction({ ...candidate, items: [fact] }, "owner", reference);
    expect(items[0]?.skillLabels).toEqual(["SQL"]);
    expect(selfAssessmentHints).toEqual([{ id: "hint-fact-1", candidateId: "fact", skillLabel: "SQL", level: "guided" }]);
});
it("also bounds the stored projection with its verified source references and skill words", () => {
    const span = "PostgreSQL";
    const candidateItems = Array.from({ length: 100 }, (_, index) => ({
        ...candidate.items[0]!, id: `fact-${index}`, text: "x".repeat(900), skillLabels: [span], source: { segmentId: "segment-1", quote: span },
    }));
    const input = { schemaVersion: "2026.11.1", items: candidateItems };
    expect(new TextEncoder().encode(JSON.stringify(input)).byteLength).toBeLessThan(128 * 1024);
    const longId = "a".repeat(240);
    expect(() => validateDocumentExtraction(input, "owner", { ...reference, documentId: longId, documentVersionId: longId, textVersionId: longId,
        text: span, segments: [{ id: "segment-1", start: 0, end: span.length }] })).toThrow("invalid-content");
});
