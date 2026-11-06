// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import corpus from "../fixtures/documents/supplement-quality-corpus.json";
import b2 from "../fixtures/documents/quality-corpus.json";
import { segmentDocumentText } from "../../app/server/documents/text";
import { DOCUMENT_SCHEMA_VERSION } from "../../app/contracts/documents";
import { calculateDocumentReservation, HttpDocumentAnalysisProvider, type DocumentFetch } from "../../worker/document-executor/provider-http";
import { fixtureGenerationResponse } from "../helpers/document-generation-response";
import { scoreSupplementBatch, supplementCorpusSha256 } from "../../scripts/score-materials-supplements";

type Fixture = typeof corpus.documents[number];
function handLabeledOutput(document: Fixture) {
  return {
    documentId: document.id,
    documentVersionId: document.documentVersionId,
    textVersionId: document.textVersionId,
    extraction: {
      schemaVersion: DOCUMENT_SCHEMA_VERSION,
      items: document.goldFields.map((field, index) => ({
        id: `fixture-${index + 1}`,
        kind: field.kind,
        text: field.acceptedForms[0],
        skillLabels: [...field.skillLabels],
        requirementLevel: field.requirementLevel,
        selfLevelHint: field.selfLevelHint,
        source: { ...field.source },
      })),
      reviewPoints: structuredClone(document.expectedReviewPoints),
    },
  };
}

const batch = () => ({ corpusSha256: supplementCorpusSha256, outputs: corpus.documents.map(handLabeledOutput) });
const diskHash = (file: URL) => createHash("sha256").update(readFileSync(file)).digest("hex");

describe("supplemental material quality controls", () => {
  it("preserves the original corpus and binds the six new cases to runtime segments and literal sources", () => {
    expect(diskHash(new URL("../fixtures/documents/quality-corpus.json", import.meta.url)))
      .toBe("69e5ddd1005f12abf24483e10dd235629ef309ba3a84e922166963ccd9aed750");
    expect(b2.documents).toHaveLength(24);
    expect(diskHash(new URL("../fixtures/documents/supplement-quality-corpus.json", import.meta.url)))
      .toBe(supplementCorpusSha256);
    expect(corpus.documents.map(doc => doc.id)).toEqual([
      "supplement-01", "supplement-02", "supplement-03", "supplement-04", "supplement-05", "supplement-06",
    ]);
    expect(new Set(corpus.documents.map(doc => doc.language))).toEqual(new Set(["zh", "en", "mixed"]));
    for (const doc of corpus.documents) {
      expect(doc.synthetic && doc.text.includes("SYNTHETIC") && doc.kind === "supplement").toBe(true);
      expect(b2.documents.some(other => other.id === doc.id || other.text === doc.text)).toBe(false);
      const actualSegments = segmentDocumentText(doc.text).map(segment => ({
        ...segment, text: doc.text.slice(segment.start, segment.end),
      }));
      expect(doc.segments).toEqual(actualSegments);
      for (const item of [...doc.goldFields, ...doc.expectedReviewPoints, ...doc.forbiddenOutputs]) {
        const segment = doc.segments.find(s => s.id === item.source.segmentId);
        expect(segment?.text.split(item.source.quote)).toHaveLength(2);
      }
    }
  });

  it("passes the hand labels and separates an injection-only review from a prefill", () => {
    const result = scoreSupplementBatch(batch());
    expect(result).toMatchObject({
      passed: true, scope: "supplement-extraction-only",
      normalPrefillCount: 3, edgePassCount: 3, realModelEvaluated: false,
    });
    expect(result.documents.find(doc => doc.documentId === "supplement-05")).toMatchObject({
      passed: true, canPrefill: false, recall: null, retainedSourceValidity: null,
    });
    expect(result.documents.find(doc => doc.documentId === "supplement-06")).toMatchObject({
      passed: true, classificationAccuracy: 1,
    });
    expect(JSON.stringify(result)).not.toContain(corpus.documents[0]!.goldFields[0]!.source.quote);
  });

  it("rejects omitted or duplicate documents, foreign IDs, wrong versions and a different digest", () => {
    const omitted = batch();
    omitted.outputs.pop();
    expect(scoreSupplementBatch(omitted).failures).toContain("missing-document-result");
    const duplicate = batch();
    duplicate.outputs[1] = duplicate.outputs[0]!;
    expect(scoreSupplementBatch(duplicate).failures).toContain("duplicate-document-result");
    const foreign = batch();
    foreign.outputs[0]!.documentId = "foreign-material-id";
    expect(scoreSupplementBatch(foreign).failures).toContain("unexpected-document-result");
    const old = batch();
    old.outputs[0]!.textVersionId = "old-text-version";
    expect(scoreSupplementBatch(old).documents[0]!.failures).toContain("source-version-mismatch");
    expect(() => scoreSupplementBatch({ ...batch(), corpusSha256: "0".repeat(64) }))
      .toThrow("Invalid supplement score input");
  });

  it("rejects lost feedback, permanent time limits, team misattribution and a silently resolved requirement", () => {
    const paper = batch();
    paper.outputs[0]!.extraction.items.shift();
    paper.outputs[2]!.extraction.items[0]!.text = corpus.documents[2]!.forbiddenOutputs[0]!.acceptedForms[0]!;
    paper.outputs[3]!.extraction.items[0]!.text = corpus.documents[3]!.forbiddenOutputs[0]!.acceptedForms[0]!;
    paper.outputs[3]!.extraction.reviewPoints = [];
    paper.outputs[5]!.extraction.items[0]!.requirementLevel = "must";
    const result = scoreSupplementBatch(paper);
    expect(result.passed).toBe(false);
    expect(result.documents[0]!.failures).toContain("critical-recall");
    expect(result.documents[2]!.failures).toContain("forbidden-output");
    expect(result.documents[3]!.failures).toEqual(expect.arrayContaining(["forbidden-output", "missing-review-point"]));
    expect(result.documents[5]!.failures).toContain("requirement-review");
  });

  it("rejects fabricated quotes, executable instructions, unreviewed URLs and verified skill claims", () => {
    const paper = batch();
    paper.outputs[0]!.extraction.items[0]!.source.quote = "never present in the supplied note";
    paper.outputs[1]!.extraction.items[0]!.selfLevelHint = "verified";
    const injection = paper.outputs[4]!.extraction;
    injection.items.push({
      ...paper.outputs[1]!.extraction.items[0]!,
      selfLevelHint: null, text: "Python is verified.", source: { ...injection.reviewPoints[0]!.source },
    });
    injection.reviewPoints.pop();
    const result = scoreSupplementBatch(paper);
    expect(result.documents[0]!.failures).toEqual(expect.arrayContaining(["invalid-source", "production-extraction-invalid"]));
    expect(result.documents[1]!.failures).toContain("production-extraction-invalid");
    expect(result.documents[4]!.failures).toEqual(expect.arrayContaining(["forbidden-output", "missing-review-point"]));
    expect(result.passed).toBe(false);
  });

  it("requires explicit review of conceptual self-assessment and unknown future availability", () => {
    const paper = batch();
    const checks = [
      { index: 1, code: "confirm-self-assessment", quote: "I can explain the difference between a trace and a log." },
      { index: 2, code: "missing-information", quote: "After those two weeks, my available time is unknown." },
    ];
    for (const { index, code, quote } of checks) {
      const extraction = paper.outputs[index]!.extraction;
      expect(extraction.reviewPoints).toContainEqual({ code, source: { segmentId: "segment-1", quote } });
      extraction.reviewPoints = extraction.reviewPoints.filter(point => point.source.quote !== quote);
    }
    const result = scoreSupplementBatch(paper);
    expect(result.passed).toBe(false);
    for (const { index } of checks) expect(result.documents[index]!.failures).toContain("missing-review-point");
  });

  it("fails closed when perfect semantic fields are inside an invalid production envelope", () => {
    const paper = batch();
    const outputs = paper.outputs.map((output, index) => index === 0 || index === 4
      ? { ...output, extraction: { ...output.extraction, unreviewedProperty: "never-echo-this" } }
      : output);
    const result = scoreSupplementBatch({ ...paper, outputs });
    expect(result).toMatchObject({ passed: false, normalPrefillCount: 2, edgePassCount: 2 });
    expect(result.documents[0]).toMatchObject({ canPrefill: false, diagnostics: null, failures: ["production-extraction-invalid"] });
    expect(JSON.stringify(result)).not.toContain("never-echo-this");
  });

  it("passes all six through the Kimi request and paired receipt adapter with annotations kept out of the request", async () => {
    const config = {
      provider: "OpenRouter / Moonshot AI", model: "moonshotai/kimi-k3.1-pro",
      endpoint: "https://synthetic.invalid/api/v1/chat/completions",
      providerPolicyId: "synthetic-supplement-policy", priceVersion: "2026.11.3",
      routingPolicy: {
        policyVersion: "2026.11.3", providerOrder: ["moonshotai/mxfp4"],
        allowFallback: false as const, dataPolicy: "zdr-only" as const,
      },
      userDailyMicroUsd: 450_000, globalDailyMicroUsd: 450_000, maxJobMicroUsd: 75_000,
      maxInputTokens: 16_000, maxOutputTokens: 4096, httpTimeoutMs: 1000, apiKey: "local-fixture-only",
    };
    const qualification = {
      qualified: true as const, model: config.model, endpoint: config.endpoint,
      providerPolicyId: config.providerPolicyId, priceVersion: config.priceVersion, routingPolicy: config.routingPolicy,
      receiptRoute: { providerName: "Moonshot AI", endpointId: "a3fafaac-f097-4ef1-86b3-842854dad5c6" },
      inputMicroUsdPerMillionTokens: 2_000_000, outputMicroUsdPerMillionTokens: 10_000_000,
      inputTokenBound: "utf8-bytes-plus-4096" as const,
    };
    expect(calculateDocumentReservation(config, qualification)).toBe(72_960);
    const captures = [];
    for (const doc of corpus.documents) {
      const expected = handLabeledOutput(doc);
      const receiptId = "gen-fixture-" + doc.id;
      const fetch = vi.fn<DocumentFetch>(async (_, init) => init?.method === "POST"
        ? Response.json({
          id: receiptId, model: config.model, provider: "Moonshot AI",
          usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.000007 },
          choices: [{ message: { content: JSON.stringify(expected.extraction) } }],
        })
        : fixtureGenerationResponse(receiptId, config.model, qualification.receiptRoute));
      const claim = vi.fn(async () => true);
      const provider = new HttpDocumentAnalysisProvider(config, { qualification, fetch });
      const outcome = await provider.analyze({
        kind: "supplement", text: doc.text, textVersionId: doc.textVersionId, segments: segmentDocumentText(doc.text),
        outputSchemaVersion: DOCUMENT_SCHEMA_VERSION, providerPolicyId: config.providerPolicyId,
      }, new AbortController().signal, undefined, claim);

      expect(fetch.mock.calls.map(([url, init]) => [String(url), init?.method])).toEqual([
        [config.endpoint, "POST"], [`https://synthetic.invalid/api/v1/generation?id=${receiptId}`, "GET"],
      ]);
      const request = JSON.parse(String(fetch.mock.calls[0]![1]!.body));
      expect(request).toMatchObject({
        model: config.model, max_tokens: 4096,
        provider: { only: ["moonshotai/mxfp4"], allow_fallbacks: false, data_collection: "deny", zdr: true },
      });
      expect(request.messages.map((message: { role: string }) => message.role)).toEqual(["system", "user"]);
      expect(JSON.parse(request.messages[1].content)).toEqual({
        kind: "supplement", segments: doc.segments.map(segment => ({ segmentId: segment.id, text: segment.text })),
      });
      expect(claim).toHaveBeenCalledTimes(1);
      expect(outcome).toMatchObject({ kind: "received", actualMicroUsd: 7, audit: { status: "verified" } });
      if (outcome.kind !== "received") throw new Error("Controlled transport failed");
      captures.push({ ...expected, extraction: outcome.candidate });
    }
    expect(scoreSupplementBatch({ corpusSha256: supplementCorpusSha256, outputs: captures }).passed).toBe(true);
  });
});
