import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { materialIdSchema } from "../app/contracts/documents";
import { validateDocumentExtraction } from "../app/server/documents/extraction-validator";
import { evaluateQualityCorpus } from "../tests/helpers/document-quality-evaluation";
import type supplementCorpus from "../tests/fixtures/documents/supplement-quality-corpus.json";

export const supplementCorpusSha256 = "9775b595f4b44563beb9e3b7f9249b171e731658b454e0f26279d2b46db213d7";
const corpusUrl = new URL("../tests/fixtures/documents/supplement-quality-corpus.json", import.meta.url);
const captureSchema = z.strictObject({
  documentId: materialIdSchema,
  documentVersionId: materialIdSchema,
  textVersionId: materialIdSchema,
  extraction: z.unknown(),
});
const batchSchema = z.strictObject({
  corpusSha256: z.literal(supplementCorpusSha256),
  outputs: z.array(captureSchema).max(12),
});
const fieldsForScoring = z.object({
  items: z.array(z.unknown()).max(100),
  reviewPoints: z.array(z.unknown()).max(100).default([]),
});

export function readFrozenSupplementDocuments() {
  const bytes = readFileSync(corpusUrl);
  if (createHash("sha256").update(bytes).digest("hex") !== supplementCorpusSha256) {
    throw new Error("Unexpected supplement quality corpus");
  }
  const corpus: typeof supplementCorpus = JSON.parse(bytes.toString("utf8"));
  return corpus.documents;
}

/** Scores stored extractions against frozen annotations. No credentials or transport are involved. */
export function scoreSupplementBatch(input: unknown) {
  const batch = batchSchema.safeParse(input);
  if (!batch.success) throw new Error("Invalid supplement score input");
  const documents = readFrozenSupplementDocuments();
  const invalidExtractions = new Set<string>();
  const ownerId = "supplement-quality-fixture";
  const outputs = batch.data.outputs.map(({ extraction, ...identity }) => {
    const document = documents.find(doc => doc.id === identity.documentId);
    if (document) {
      try {
        validateDocumentExtraction(extraction, ownerId, {
          ownerId,
          documentId: document.id,
          documentVersionId: document.documentVersionId,
          textVersionId: document.textVersionId,
          text: document.text,
          segments: document.segments,
          lifecycle: "active",
        });
      } catch {
        invalidExtractions.add(document.id);
      }
    }
    // Keep submitted version IDs so the quality evaluator can detect stale captures.
    const fields = fieldsForScoring.safeParse(extraction);
    if (!fields.success) return identity;
    return { ...identity, candidates: fields.data.items, reviewPoints: fields.data.reviewPoints };
  });
  const result = evaluateQualityCorpus(documents, outputs);
  const reports = result.documents.map(report => invalidExtractions.has(report.documentId)
    ? { ...report, passed: false, canPrefill: false, failures: [...report.failures, "production-extraction-invalid"].sort() }
    : report);
  const normalPrefillCount = reports.filter((report, index) => documents[index]!.category === "normal" && report.canPrefill).length;
  const edgePassCount = reports.filter((report, index) => documents[index]!.category === "edge" && report.passed).length;
  return {
    ...result,
    scope: "supplement-extraction-only",
    corpusSha256: supplementCorpusSha256,
    documents: reports,
    normalPrefillCount,
    edgePassCount,
    passed: result.passed && normalPrefillCount === 3 && edgePassCount === 3,
  };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const path = process.argv[2];
    if (process.argv.length !== 3 || !path) throw new Error();
    const file = statSync(path);
    const maxBytes = 1024 * 1024;
    if (!file.isFile() || file.size > maxBytes) throw new Error();
    const bytes = readFileSync(path);
    if (bytes.length > maxBytes) throw new Error();
    const result = scoreSupplementBatch(JSON.parse(bytes.toString("utf8")));
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    process.exitCode = result.passed ? 0 : 1;
  } catch {
    process.stderr.write("Invalid supplement score input. Supply one local JSON capture for the frozen corpus.\n");
    process.exitCode = 2;
  }
}
