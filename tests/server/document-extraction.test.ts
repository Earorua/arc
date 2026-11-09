import { expect, it } from "vitest";
import { serializeDocumentExtraction, validateDocumentExtraction, validateStoredDocumentExtraction } from "../../app/server/documents/extraction-validator";
import { KIMI_GROUNDED_TERMS_POLICY_ID, KIMI_SOURCE_MENTIONS_POLICY_ID } from "../../app/server/documents/policy";
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

it.each([undefined, "qualified-policy", "materials-openrouter-kimi-k31-pro-mxfp4-zdr-extractive-v1", KIMI_GROUNDED_TERMS_POLICY_ID])(
    "selects the edit projection only from the trusted provider policy %s", providerPolicyId => {
        const text = "我在指导下清洗数据。每天学习 TypeScript 三十分钟。";
        const original = { ...reference, text, segments: [{ id: "segment-1", start: 0, end: text.length }] };
        const extraction = { schemaVersion: "2026.11.1", items: [
            { ...candidate.items[0]!, kind: "experience", text, requirementLevel: null, skillLabels: ["data cleaning"], selfLevelHint: "guided",
                source: { segmentId: "segment-1", quote: "我在指导下清洗数据。" } },
            { ...candidate.items[0]!, id: "limit", kind: "constraint", text, requirementLevel: null, skillLabels: ["TypeScript"],
                source: { segmentId: "segment-1", quote: "每天学习 TypeScript 三十分钟。" } },
        ] };
        const grounded = providerPolicyId === KIMI_GROUNDED_TERMS_POLICY_ID;
        const review = validateDocumentExtraction(extraction, "owner", original, providerPolicyId);
        expect(review.reviewProjection).toBe(grounded ? "grounded-skill-labels-v2" : undefined);
        expect(review.items.map(item => item.skillLabels)).toEqual(grounded ? [["data cleaning"], ["TypeScript"]] : [[], undefined]);
        expect(review.selfAssessmentHints).toEqual(grounded ? [{ id: "hint-fact-0", candidateId: "fact", skillLabel: "data cleaning", level: "guided" }] : []);
        const json = serializeDocumentExtraction(extraction, providerPolicyId);
        expect(JSON.parse(json).reviewProjection).toBe(grounded ? "grounded-skill-labels-v2" : "literal-skill-labels-v1");
        expect(validateStoredDocumentExtraction(json, "owner", original)).toEqual(review);
        expect(() => validateDocumentExtraction({ ...extraction, reviewProjection: "grounded-skill-labels-v2" }, "owner", original, providerPolicyId)).toThrow("invalid-content");
    });

it("keeps historical unwrapped captures separate from the explicit v1 and v2 envelopes", () => {
    const text = "我在指导下清洗数据。";
    const original = { ...reference, text, segments: [{ id: "segment-1", start: 0, end: text.length }] };
    const extraction = { schemaVersion: "2026.11.1", items: [{ ...candidate.items[0]!, kind: "experience", text,
        requirementLevel: null, skillLabels: ["data cleaning"], selfLevelHint: "guided", source: { segmentId: "segment-1", quote: text } }] };
    const legacy = validateStoredDocumentExtraction(JSON.stringify(extraction), "owner", original);
    expect(legacy.items[0]).not.toHaveProperty("skillLabels");
    expect(legacy).not.toHaveProperty("reviewProjection");
    expect(legacy.selfAssessmentHints.map(hint => hint.skillLabel)).toEqual(["data cleaning"]);
});

function mentionReference(text: string) {
    return { ...reference, text, segments: [{ id: "segment-1", start: 0, end: text.length }] };
}
function mentionExtraction(text: string, labels = ["SQL"], level: "guided" | "conceptual" | "uncertain" | null = "guided") {
    return { ...candidate, items: [{ ...candidate.items[0]!, kind: "skill-claim", text, requirementLevel: null,
        skillLabels: labels, selfLevelHint: level, source: { segmentId: "segment-1", quote: text } }] };
}
it.each([
    ["I cannot yet configure a Kubernetes cluster myself.", ["configure a Kubernetes cluster"], "guided"],
    ["I cannot yet configure a Kubernetes cluster myself.", ["configure a Kubernetes cluster"], "uncertain"],
    ["I have never used SQL for production.", ["SQL"], "guided"],
    ["My colleague tested React under supervision.", ["React"], "guided"],
    ["I plan to test React under supervision.", ["React"], "guided"],
    ['My mentor said, "I tested React under supervision."', ["React"], "guided"],
    ["I tested SQL under supervision and my colleague tested React under supervision.", ["SQL", "React"], "guided"],
] as const)("independently removes an unsupported v3 level while retaining source topics: %s (%s, %s)", (text, labels, level) => {
    const extraction = mentionExtraction(text, [...labels], level);
    const review = validateDocumentExtraction(extraction, "owner", mentionReference(text), KIMI_SOURCE_MENTIONS_POLICY_ID);
    expect(review).toMatchObject({ reviewProjection: "source-skill-mentions-v3", items: [{ text, skillLabels: labels,
        sourceRef: { start: 0, end: text.length } }], selfAssessmentHints: [] });
    expect(validateStoredDocumentExtraction(serializeDocumentExtraction(extraction, KIMI_SOURCE_MENTIONS_POLICY_ID), "owner", mentionReference(text))).toEqual(review);
});
it.each([
    ["I tested SQL under supervision.", "guided"],
    ["I am familiar with SQL.", "conceptual"],
    ["I am unsure about my SQL proficiency.", "uncertain"],
    ["- I tested SQL under supervision.", "guided"],
] as const)("retains a v3 level supported by the full personal statement: %s", (text, level) => {
    const review = validateDocumentExtraction(mentionExtraction(text, ["SQL"], level), "owner", mentionReference(text), KIMI_SOURCE_MENTIONS_POLICY_ID);
    expect(review.selfAssessmentHints).toEqual([{ id: "hint-fact-0", candidateId: "fact", skillLabel: "SQL", level }]);
});
it.each(["1. I tested SQL under supervision.", "１２. I tested SQL under supervision."])(
    "independently accepts the complete numbered v3 source without rewriting it: %s", text => {
        const original = mentionReference(text), extraction = mentionExtraction(text);
        const review = validateDocumentExtraction(extraction, "owner", original, KIMI_SOURCE_MENTIONS_POLICY_ID);
        expect(review.items[0]).toMatchObject({ text, skillLabels: ["SQL"], sourceRef: {
            documentId: "doc", documentVersionId: "version", textVersionId: "text", start: 0, end: text.length,
        } });
        expect(review.selfAssessmentHints).toEqual([{ id: "hint-fact-0", candidateId: "fact", skillLabel: "SQL", level: "guided" }]);
        expect(validateStoredDocumentExtraction(serializeDocumentExtraction(extraction, KIMI_SOURCE_MENTIONS_POLICY_ID), "owner", original)).toEqual(review);
    });
it.each([
    "1. My colleague tested SQL under supervision.",
    "1. I will test SQL under supervision.",
    "1. I did not test SQL under supervision.",
    "1. I tested SQL\r\nnot under supervision.",
    '1. My mentor said, "I tested SQL under supervision."',
])("independently removes a forged numbered v3 hint without removing its topic: %s", text => {
    const review = validateDocumentExtraction(mentionExtraction(text), "owner", mentionReference(text), KIMI_SOURCE_MENTIONS_POLICY_ID);
    expect(review).toMatchObject({ items: [{ text, skillLabels: ["SQL"] }], selfAssessmentHints: [] });
});
it.each([
    ["1. I tested SQL\r\nnot under supervision.", "1. I tested SQL"],
    ["1. I tested SQL\r\nnot under supervision.", "I tested SQL"],
    ["1. I tested SQL under supervision.\r\n2. My colleague used React.", "1. I tested SQL under supervision.\r\n2. My colleague used React."],
    ["1. \n", "1."],
    ["  １２. \r\n", "１２."],
    ['The worksheet says “Begin.\r\n1. I tested SQL under supervision.\r\nEnd.”', "1. I tested SQL under supervision."],
])("independently rejects an incomplete or detached numbered source: %s (%s)", (text, quote) => {
    expect(() => validateDocumentExtraction(mentionExtraction(quote), "owner", mentionReference(text), KIMI_SOURCE_MENTIONS_POLICY_ID)).toThrow("invalid-content");
});
it("retains the numbered v3 quotation and source identity checks independently of provider decoding", () => {
    const text = "1. I tested SQL under supervision.", extraction = mentionExtraction(text), original = mentionReference(text);
    expect(() => validateDocumentExtraction({ ...extraction, items: [{ ...extraction.items[0], text: text.slice(3) }] },
        "owner", original, KIMI_SOURCE_MENTIONS_POLICY_ID)).toThrow("invalid-content");
    expect(() => validateDocumentExtraction(extraction, "other-owner", original, KIMI_SOURCE_MENTIONS_POLICY_ID)).toThrow("invalid-content");
    expect(() => validateDocumentExtraction(extraction, "owner", { ...original, lifecycle: "revoked" }, KIMI_SOURCE_MENTIONS_POLICY_ID)).toThrow("invalid-content");
});
it.each([
    ["I did not test SQL under supervision.", "I tested SQL under supervision."],
    ["I tested SQL under supervision.", "I did not test SQL under supervision."],
    ["My colleague tested SQL under supervision.", "I tested SQL under supervision."],
])("refuses contradictory v3 canonical text without losing the actual source context: %s", (text, forged) => {
    const extraction = mentionExtraction(text);
    extraction.items[0]!.text = forged;
    expect(() => validateDocumentExtraction(extraction, "owner", mentionReference(text), KIMI_SOURCE_MENTIONS_POLICY_ID)).toThrow("invalid-content");
});
it.each([
    "The worksheet illustrates an example: “Begin. I tested SQL under supervision. End.”",
    "It is false to claim that I tested SQL under supervision.",
    "It is false to claim that\nI tested SQL under supervision.",
])("refuses a v3 quote detached from its original attribution: %s", text => {
    const extraction = mentionExtraction("I tested SQL under supervision.");
    expect(() => validateDocumentExtraction(extraction, "owner", mentionReference(text), KIMI_SOURCE_MENTIONS_POLICY_ID)).toThrow("invalid-content");
});
it("requires v3 source labels to be nominated and grounded without adding other mentioned tools", () => {
    const text = "I tested SQL under supervision and my colleague used React.";
    for (const [nominated, expected] of [[[], []], [["SQL", "Rust"], ["SQL"]]]) {
        const review = validateDocumentExtraction(mentionExtraction(text, nominated, null), "owner", mentionReference(text), KIMI_SOURCE_MENTIONS_POLICY_ID);
        expect(review.items[0]?.skillLabels).toEqual(expected);
        expect(review.selfAssessmentHints).toEqual([]);
    }
});
it("selects and reloads v3 only from its exact trusted policy and stored marker", () => {
    const text = "I have never used SQL for production.", extraction = mentionExtraction(text, ["SQL"], null), original = mentionReference(text);
    const cases = [
        [undefined, "literal-skill-labels-v1", undefined, ["SQL"]],
        ["materials-openrouter-kimi-k31-pro-mxfp4-zdr-extractive-v1", "literal-skill-labels-v1", undefined, ["SQL"]],
        [KIMI_GROUNDED_TERMS_POLICY_ID, "grounded-skill-labels-v2", "grounded-skill-labels-v2", []],
        [KIMI_SOURCE_MENTIONS_POLICY_ID, "source-skill-mentions-v3", "source-skill-mentions-v3", ["SQL"]],
        [KIMI_SOURCE_MENTIONS_POLICY_ID + "-forged", "literal-skill-labels-v1", undefined, ["SQL"]],
    ] as const;
    for (const [policyId, marker, projection, labels] of cases) {
        const json = serializeDocumentExtraction(extraction, policyId);
        expect(JSON.parse(json).reviewProjection).toBe(marker);
        const review = validateStoredDocumentExtraction(json, "owner", original);
        expect(review.reviewProjection).toBe(projection);
        expect(review.items[0]?.skillLabels).toEqual(labels);
        expect(review).toEqual(validateDocumentExtraction(extraction, "owner", original, policyId));
    }
    const legacy = validateStoredDocumentExtraction(JSON.stringify(extraction), "owner", original);
    expect(legacy).not.toHaveProperty("reviewProjection");
    expect(legacy.items[0]).not.toHaveProperty("skillLabels");
});
it("rejects forged v3 policy, marker, candidate and source fields at the site boundary", () => {
    const text = "I tested SQL under supervision.", extraction = mentionExtraction(text), original = mentionReference(text);
    for (const extra of [{ reviewProjection: "source-skill-mentions-v3" }, { providerPolicyId: KIMI_SOURCE_MENTIONS_POLICY_ID }, { candidate: extraction }]) {
        expect(() => validateDocumentExtraction({ ...extraction, ...extra }, "owner", original, KIMI_SOURCE_MENTIONS_POLICY_ID)).toThrow("invalid-content");
    }
    for (const source of [{ segmentId: "other", quote: text }, { segmentId: "segment-1", quote: "I tested Rust under supervision." },
        { segmentId: "segment-1", quote: text, reviewProjection: "source-skill-mentions-v3" }]) {
        expect(() => validateDocumentExtraction({ ...extraction, items: [{ ...extraction.items[0], source }] }, "owner", original, KIMI_SOURCE_MENTIONS_POLICY_ID)).toThrow("invalid-content");
    }
    expect(() => validateStoredDocumentExtraction(JSON.stringify({ reviewProjection: "source-skill-mentions-v3", candidate: extraction,
        providerPolicyId: KIMI_SOURCE_MENTIONS_POLICY_ID }), "owner", original)).toThrow("invalid-content");
});
