import { describe, expect, it } from "vitest";
import { DOCUMENT_SCHEMA_VERSION, MAX_DOCUMENT_ITEMS_JSON_BYTES } from "../../app/contracts/documents";
import corpus from "../fixtures/documents/quality-corpus.json";
import { evaluateDocumentQuality, evaluateQualityCorpus, type QualityDocument } from "../helpers/document-quality-evaluation";

type FixtureDocument = QualityDocument;

// These are hand-annotated oracle candidates, not outputs from a real model.
function oracle(document: FixtureDocument) {
  return {
    documentId: document.id,
    documentVersionId: document.documentVersionId,
    textVersionId: document.textVersionId,
    candidates: document.goldFields.map((field, index) => ({
      id: `candidate-${index + 1}`,
      kind: field.kind,
      text: field.acceptedForms[0]!,
      requirementLevel: field.requirementLevel,
      skillLabels: [...field.skillLabels],
      selfLevelHint: field.selfLevelHint,
      source: { ...field.source },
    })),
    reviewPoints: structuredClone(document.expectedReviewPoints),
  };
}

const document: FixtureDocument = corpus.documents.find(({ id }) => id === "jd-01")!;
const resume: FixtureDocument = corpus.documents.find(({ id }) => id === "resume-01")!;

describe("synthetic quality corpus annotations", () => {
  it("freezes 12 resumes and 12 JDs with 18 ordinary and six varied edge cases", () => {
    expect(corpus.documents).toHaveLength(24);
    for (const kind of ["resume", "jd"]) {
      const subset = corpus.documents.filter((item) => item.kind === kind);
      expect(subset).toHaveLength(12);
      expect(subset.filter((item) => item.category === "normal")).toHaveLength(9);
      expect(subset.filter((item) => item.category === "edge")).toHaveLength(3);
      expect(new Set(subset.filter((item) => item.category === "normal").map((item) => item.language)))
        .toEqual(new Set(["zh", "en", "mixed"]));
    }
    expect(new Set(corpus.documents.flatMap((item) => item.edgeCases)))
      .toEqual(new Set(["injection", "team-misclaim", "conflict", "missing", "uncovered", "untrusted-url"]));
    expect(new Set(corpus.documents.map((item) => item.text)).size).toBe(24);
    expect(corpus.purpose).toContain("no real-model quality");
  });

  it("binds every annotation to a unique field and a literal UTF-16 source segment", () => {
    for (const item of corpus.documents) {
      expect(item.synthetic).toBe(true);
      expect(item.text).toContain("SYNTHETIC");
      expect(new Set(item.goldFields.map((field) => field.id)).size).toBe(item.goldFields.length);
      expect(new Set(item.goldFields.map((field) => field.semanticKey)).size).toBe(item.goldFields.length);
      expect(item.goldFields.length).toBeGreaterThan(0);
      expect(item.forbiddenOutputs.length).toBeGreaterThan(0);
      for (const segment of item.segments) expect(item.text.slice(segment.start, segment.end)).toBe(segment.text);
      for (const annotation of [...item.goldFields, ...item.expectedReviewPoints, ...item.forbiddenOutputs]) {
        const segment = item.segments.find(({ id }) => id === annotation.source.segmentId)!;
        expect(segment).toBeDefined();
        expect(segment.text).toContain(annotation.source.quote);
      }
    }
  });
});

describe("document quality evaluation (offline scoring rules, not model qualification)", () => {
  it("passes all 24 annotated candidates with 18 derived prefills and six reviewed edge cases", () => {
    const result = evaluateQualityCorpus(corpus.documents, corpus.documents.map(oracle));
    expect(result.passed).toBe(true);
    expect(result.normalPrefillCount).toBe(18);
    expect(result.edgePassCount).toBe(6);
    expect(result.documents).toHaveLength(24);
    expect(result.documents.every((item) => item.passed)).toBe(true);
    expect(result.realModelEvaluated).toBe(false);
  });

  it("matches an accepted semantic form and source without trusting a result field ID", () => {
    const output = oracle(document);
    output.candidates[0]!.text = document.goldFields[0]!.acceptedForms[1]!;
    output.candidates[0]!.id = "unrelated-result-id";
    expect(evaluateDocumentQuality(document, output).recall).toBe(1);
    expect(evaluateDocumentQuality(document, output).passed).toBe(true);
  });

  it("fails a single document's omission even when the corpus average exceeds 90 percent", () => {
    const outputs = corpus.documents.map(oracle);
    outputs.find((item) => item.documentId === document.id)!.candidates.pop();
    const result = evaluateQualityCorpus(corpus.documents, outputs);
    const failed = result.documents.find((item) => item.documentId === document.id)!;
    expect(failed.recall).toBeCloseTo(2 / 3);
    expect(failed.classificationAccuracy).toBeCloseTo(2 / 3);
    expect(failed.failures).toContain("critical-recall");
    expect(result.passed).toBe(false);
  });

  it("does not replace missing critical facts with the same number of duplicate predictions", () => {
    const output = oracle(document);
    output.candidates[1] = { ...output.candidates[0]!, id: "duplicate-with-different-id" };
    const result = evaluateDocumentQuality(document, output);
    expect(result.recall).toBeCloseTo(2 / 3);
    expect(result.failures).toContain("unmatched-or-duplicate-candidate");
    expect(result.passed).toBe(false);
  });

  it("does not let correct-looking labels or a copied gold ID establish semantic recall", () => {
    const output = oracle(document);
    output.candidates[0]!.id = document.goldFields[0]!.id;
    output.candidates[0]!.text = "Negotiated an office lease";
    const result = evaluateDocumentQuality(document, output);
    expect(result.recall).toBeCloseTo(2 / 3);
    expect(result.passed).toBe(false);
  });

  it("uses one-to-one maximum matching when accepted forms overlap", () => {
    const fixture = structuredClone(document);
    fixture.goldFields = fixture.goldFields.slice(0, 2);
    fixture.goldFields[1] = { ...fixture.goldFields[0]!, id: "second-field", semanticKey: "second-semantic-field", acceptedForms: ["shared"] };
    fixture.goldFields[0]!.acceptedForms = ["shared", "specific"];
    const output = oracle(fixture);
    output.candidates[1]!.text = "specific";
    expect(evaluateDocumentQuality(fixture, output).recall).toBe(1);
    output.candidates[0]!.text = "unaccepted";
    expect(evaluateDocumentQuality(fixture, output).recall).toBe(0.5);
  });

  it("fails must/preferred misclassification independently of semantic recall", () => {
    const output = oracle(document);
    output.candidates[0]!.requirementLevel = "preferred";
    const result = evaluateDocumentQuality(document, output);
    expect(result.recall).toBe(1);
    expect(result.classificationAccuracy).toBeCloseTo(2 / 3);
    expect(result.failures).toContain("requirement-classification");
    expect(result.passed).toBe(false);
  });

  it("rejects even one fabricated quote independently of other matching fields", () => {
    const output = oracle(document);
    output.candidates[0]!.source.quote = "SQL is independently mastered";
    const result = evaluateDocumentQuality(document, output);
    expect(result.retainedSourceValidity).toBeCloseTo(2 / 3);
    expect(result.failures).toContain("invalid-source");
    expect(result.passed).toBe(false);
  });

  it.each(["repeated-quote", "split-surrogate"])("rejects ambiguous or invalid UTF-16 provenance: %s", (mode) => {
    const fixture = structuredClone(document);
    fixture.goldFields = fixture.goldFields.slice(0, 1);
    const source = fixture.goldFields[0]!.source;
    const quote = mode === "repeated-quote" ? source.quote : "\ud83d";
    fixture.text = mode === "repeated-quote" ? `${quote} ${quote}` : "😀";
    fixture.segments = [{ id: source.segmentId, start: 0,
      end: mode === "repeated-quote" ? fixture.text.length : 1,
      text: mode === "repeated-quote" ? fixture.text : quote }];
    source.quote = quote;
    const result = evaluateDocumentQuality(fixture, oracle(fixture));
    expect(result.retainedSourceValidity).toBe(0);
    expect(result.failures).toContain("invalid-source");
    expect(result.passed).toBe(false);
  });

  it("enforces inclusive 90-percent recall/classification and exact 100-percent retained references", () => {
    const fixture = structuredClone(document);
    const lines = Array.from({ length: 10 }, (_, index) => `Required synthetic skill ${index + 1}.`);
    fixture.text = lines.join("\n");
    let offset = 0;
    fixture.segments = lines.map((text, index) => {
      const segment = { id: `threshold-segment-${index + 1}`, start: offset, end: offset + text.length, text };
      offset += text.length + 1;
      return segment;
    });
    fixture.goldFields = fixture.segments.map((segment, index) => ({ ...document.goldFields[0]!,
      id: `threshold-field-${index + 1}`, semanticKey: `synthetic-skill-${index + 1}`,
      acceptedForms: [segment.text], skillLabels: [`synthetic-skill-${index + 1}`],
      source: { segmentId: segment.id, quote: segment.text } }));
    const missing = oracle(fixture);
    missing.candidates.pop();
    expect(evaluateDocumentQuality(fixture, missing)).toMatchObject({ recall: 0.9, classificationAccuracy: 0.9, passed: true });
    missing.candidates.pop();
    expect(evaluateDocumentQuality(fixture, missing).passed).toBe(false);
    const misclassified = oracle(fixture);
    misclassified.candidates[0]!.requirementLevel = "preferred";
    expect(evaluateDocumentQuality(fixture, misclassified)).toMatchObject({ recall: 1, classificationAccuracy: 0.9, passed: true });
    misclassified.candidates[1]!.requirementLevel = "preferred";
    expect(evaluateDocumentQuality(fixture, misclassified).passed).toBe(false);
    const badSource = oracle(fixture);
    badSource.candidates[0]!.source.quote = "fabricated";
    expect(evaluateDocumentQuality(fixture, badSource)).toMatchObject({ recall: 0.9, retainedSourceValidity: 0.9, passed: false });
  });

  it("does not count a real but semantically unrelated quote as the required evidence", () => {
    const output = oracle(document);
    output.candidates[0]!.source = { ...document.goldFields[2]!.source };
    const result = evaluateDocumentQuality(document, output);
    expect(result.retainedSourceValidity).toBe(1);
    expect(result.recall).toBeCloseTo(2 / 3);
    expect(result.passed).toBe(false);
  });

  it.each(["documentVersionId", "textVersionId"] as const)("rejects wrong %s provenance", (key) => {
    const output = oracle(document);
    output[key] = "stale-version";
    expect(evaluateDocumentQuality(document, output).failures).toContain("source-version-mismatch");
  });

  it.each(["independent", "verified"])("rejects unsupported %s mastery before scoring", (selfLevelHint) => {
    const output = oracle(resume);
    const tampered = { ...output, candidates: [{ ...output.candidates[0]!, selfLevelHint }, ...output.candidates.slice(1)] };
    const result = evaluateDocumentQuality(resume, tampered);
    expect(result.failures).toContain("invalid-schema");
    expect(result.passed).toBe(false);
  });

  it("rejects schema extras and cannot accept a caller-supplied prefill boolean", () => {
    const output = { ...oracle(document), canPrefill: true, candidates: [] };
    const result = evaluateDocumentQuality(document, output);
    expect(result.canPrefill).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.failures).toContain("invalid-schema");
  });

  it("derives a failed prefill for an ordinary document with no retained facts", () => {
    const output = { ...oracle(document), candidates: [] };
    const result = evaluateDocumentQuality(document, output);
    expect(result.canPrefill).toBe(false);
    expect(result.failures).toContain("normal-prefill");
  });

  it("requires preannotated review points for boundary cases and rejects forbidden team claims", () => {
    const edge = corpus.documents.find(({ id }) => id === "resume-11")!;
    const output = oracle(edge);
    output.reviewPoints = [];
    expect(evaluateDocumentQuality(edge, output).failures).toContain("missing-review-point");
    output.reviewPoints = structuredClone(edge.expectedReviewPoints);
    output.candidates[0]!.text = edge.forbiddenOutputs[0]!.acceptedForms[0]!;
    expect(evaluateDocumentQuality(edge, output).failures).toContain("forbidden-output");
  });

  it("rejects forged review sources and missing expected skills", () => {
    const output = oracle(resume);
    output.reviewPoints[0]!.source.quote = "fictional quote";
    output.candidates[0]!.skillLabels = ["Kubernetes"];
    const result = evaluateDocumentQuality(resume, output);
    expect(result.failures).toContain("invalid-source");
    expect(result.failures).toContain("critical-recall");
    expect(result.passed).toBe(false);
  });

  it("does not silently omit, pool, duplicate, or add unrequested document results", () => {
    const outputs = corpus.documents.map(oracle);
    expect(evaluateQualityCorpus(corpus.documents, outputs.slice(1)).passed).toBe(false);
    expect(evaluateQualityCorpus(corpus.documents, [...outputs, outputs[0]!]).failures).toContain("duplicate-document-result");
    expect(evaluateQualityCorpus(corpus.documents, [...outputs, { ...outputs[0]!, documentId: "unknown-document" }]).failures)
      .toContain("unexpected-document-result");
  });
});

describe("content-free component diagnostics alongside frozen scores", () => {
  type OracleCandidate = ReturnType<typeof oracle>["candidates"][number];
  const fields = {
    expected: 3, returned: 3, exactSource: 3, sourceIncludingTerminalOmission: 3,
    registeredForm: 3, registeredFormAtSource: 3, kindAtSource: 3,
    expectedSkillSets: 2, skillSetAtSource: 2, expectedClassifications: 0, requirementLevelAtSource: 0,
    strictJoint: 3,
  };
  const reviews = { expected: 1, returned: 1, code: 1, exactSource: 1, strictJoint: 1 };

  it("exposes only fixed numeric counters, including applicable denominators", () => {
    const output = oracle(resume);
    expect(evaluateDocumentQuality(resume, output).diagnostics).toEqual({ fields, reviews });
    const marker = "unregistered-private-value";
    Object.assign(output.candidates[0]!, { id: marker, text: marker, skillLabels: [marker] });
    const result = evaluateDocumentQuality(resume, output);
    expect(result.diagnostics).toEqual({
      fields: { ...fields, registeredForm: 2, registeredFormAtSource: 2, skillSetAtSource: 1, strictJoint: 2 }, reviews,
    });
    expect(JSON.stringify(result.diagnostics)).not.toContain(marker);
    expect(result.passed).toBe(false);
  });

  it.each([
    {
      name: "terminal punctuation", counts: { exactSource: 2 },
      change: (item: OracleCandidate) => { item.source.quote = item.source.quote.slice(0, -1); },
    }, {
      name: "unregistered rewording", counts: { registeredForm: 2, registeredFormAtSource: 2 },
      change: (item: OracleCandidate) => { item.text = "Aggregated records in SQL following the mentor's example"; },
    }, {
      name: "expanded skill name", counts: { skillSetAtSource: 1 },
      change: (item: OracleCandidate) => { item.skillLabels = ["Structured Query Language"]; },
    }, {
      name: "wrong kind", counts: { kindAtSource: 2 },
      change: (item: OracleCandidate) => { item.kind = "skill-claim"; },
    }, {
      name: "unrelated substring in the right segment",
      counts: { exactSource: 2, sourceIncludingTerminalOmission: 2, registeredFormAtSource: 2, kindAtSource: 2, skillSetAtSource: 1 },
      change: (item: OracleCandidate) => { item.source.quote = "销售报表项目"; },
    },
  ])("separates $name from other components while retaining the strict miss", ({ change, counts }) => {
    const output = oracle(resume);
    change(output.candidates[0]!);
    const result = evaluateDocumentQuality(resume, output);
    expect(result.diagnostics).toEqual({ fields: { ...fields, ...counts, strictJoint: 2 }, reviews });
    expect(result).toMatchObject({ passed: false, recall: 2 / 3, retainedSourceValidity: 1,
      failures: ["critical-recall", "normal-prefill", "unmatched-or-duplicate-candidate"] });
  });

  it("requires the registered form and annotated span on the same observation for the paired count", () => {
    const output = oracle(resume);
    [output.candidates[0]!.source, output.candidates[1]!.source] = [output.candidates[1]!.source, output.candidates[0]!.source];
    const result = evaluateDocumentQuality(resume, output);
    expect(result.diagnostics).toEqual({ fields: { ...fields, registeredFormAtSource: 1, skillSetAtSource: 0, strictJoint: 1 }, reviews });
    expect(result).toMatchObject({ passed: false, recall: 1 / 3, retainedSourceValidity: 1 });
  });

  it("reports only annotated must/preferred levels and preserves the strict assignment for classification", () => {
    const fixture = structuredClone(document);
    fixture.goldFields = fixture.goldFields.slice(0, 2);
    fixture.goldFields[1] = { ...fixture.goldFields[0]!, id: "overlapping-field", requirementLevel: "preferred", selfLevelHint: null };
    const output = oracle(fixture);
    // Both candidates are strict matches for either field. The frozen traversal
    // assigns the second candidate to field 0, independently of its level.
    expect(evaluateDocumentQuality(fixture, output)).toMatchObject({
      passed: false, recall: 1, classificationAccuracy: 0,
      diagnostics: { fields: { expectedClassifications: 2, requirementLevelAtSource: 2, strictJoint: 2 } },
    });
    output.candidates[0]!.requirementLevel = "preferred";
    expect(evaluateDocumentQuality(fixture, output)).toMatchObject({
      passed: false, recall: 1, classificationAccuracy: 0.5,
      diagnostics: { fields: { expectedClassifications: 2, requirementLevelAtSource: 1, strictJoint: 2 } },
    });
    const conflicted = corpus.documents.find(({ id }) => id === "jd-12")!;
    expect(evaluateDocumentQuality(conflicted, oracle(conflicted)).diagnostics?.fields.expectedClassifications).toBe(0);
  });

  it("distinguishes wrong review codes, sources, missing and extra points", () => {
    const output = oracle(resume);
    const original = structuredClone(output.reviewPoints[0]!);
    output.reviewPoints[0]!.code = "missing-information";
    expect(evaluateDocumentQuality(resume, output).diagnostics?.reviews).toEqual({ ...reviews, code: 0, strictJoint: 0 });
    output.reviewPoints[0] = { ...original, source: { ...resume.goldFields[1]!.source } };
    expect(evaluateDocumentQuality(resume, output).diagnostics?.reviews).toEqual({ ...reviews, exactSource: 0, strictJoint: 0 });
    output.reviewPoints.push(original);
    const excess = evaluateDocumentQuality(resume, output);
    expect(excess.diagnostics?.reviews).toEqual({ ...reviews, returned: 2 });
    expect(excess.failures).toContain("unexpected-review-point");
    output.reviewPoints = [];
    const missing = evaluateDocumentQuality(resume, output);
    expect(missing.diagnostics?.reviews).toEqual({ expected: 1, returned: 0, code: 0, exactSource: 0, strictJoint: 0 });
    expect(missing.failures).toContain("missing-review-point");
  });

  it("counts duplicates at most once per annotation within each dimension", () => {
    const output = oracle(resume);
    output.candidates[1] = { ...output.candidates[0]!, id: "different-id" };
    const result = evaluateDocumentQuality(resume, output);
    expect(result.diagnostics).toEqual({ fields: { ...fields, exactSource: 2, sourceIncludingTerminalOmission: 2,
      registeredForm: 2, registeredFormAtSource: 2, kindAtSource: 2, skillSetAtSource: 1, strictJoint: 2 }, reviews });
    expect(result).toMatchObject({ passed: false, recall: 2 / 3 });
  });

  it("distinguishes a valid empty observation from an unavailable or stale envelope", () => {
    const output = oracle(resume);
    const empty = evaluateDocumentQuality(resume, { ...output, candidates: [], reviewPoints: [] });
    expect(empty.diagnostics).toEqual({ fields: { expected: 3, returned: 0, exactSource: 0,
      sourceIncludingTerminalOmission: 0, registeredForm: 0, registeredFormAtSource: 0, kindAtSource: 0,
      expectedSkillSets: 2, skillSetAtSource: 0, expectedClassifications: 0, requirementLevelAtSource: 0, strictJoint: 0 },
      reviews: { expected: 1, returned: 0, code: 0, exactSource: 0, strictJoint: 0 } });
    for (const invalid of [
      undefined, { ...output, extra: true }, { ...output, textVersionId: "old-version" },
      { ...output, candidates: [...output.candidates, { text: "unvalidated" }] },
      { ...output, candidates: [...output.candidates, output.candidates[0]] },
      { ...output, reviewPoints: [...output.reviewPoints, output.reviewPoints[0]] },
      { ...output, reviewPoints: [{ code: "unregistered-free-text", source: output.reviewPoints[0]!.source }] },
      { ...output, reviewPoints: [{ code: "missing-information", source: { ...output.reviewPoints[0]!.source, quote: "fabricated" } }] },
    ]) {
      expect(evaluateDocumentQuality(resume, invalid).diagnostics).toBeNull();
    }
  });

  it("handles the extraction byte limit when optional empty reviews were omitted", () => {
    const output = oracle(resume);
    output.candidates = Array.from({ length: 100 }, (_, index) => ({
      ...output.candidates[0]!, id: `bounded-${index}`, text: "x", selfLevelHint: null,
    }));
    output.reviewPoints = [];
    const extraction = { schemaVersion: DOCUMENT_SCHEMA_VERSION, items: output.candidates };
    let remaining = MAX_DOCUMENT_ITEMS_JSON_BYTES - Buffer.byteLength(JSON.stringify(extraction));
    for (const candidate of output.candidates) {
      const bytes = Math.min(remaining, 999 * 2);
      candidate.text += "é".repeat(Math.floor(bytes / 2)) + "a".repeat(bytes % 2);
      remaining -= bytes;
    }
    expect(Buffer.byteLength(JSON.stringify(extraction))).toBe(MAX_DOCUMENT_ITEMS_JSON_BYTES);
    expect(evaluateDocumentQuality(resume, output).diagnostics?.fields.returned).toBe(100);
    output.candidates.at(-1)!.text += "a";
    expect(evaluateDocumentQuality(resume, output).diagnostics).toBeNull();
  });
});
