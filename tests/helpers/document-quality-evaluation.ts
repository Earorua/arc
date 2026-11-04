import { z } from "zod";
import { documentCandidateSchema, documentCandidateSourceSchema, resolveCandidateSourceRef } from "../../app/contracts/documents";
import type corpus from "../fixtures/documents/quality-corpus.json";

type CorpusDocument = typeof corpus.documents[number];
export type QualityDocument = Omit<CorpusDocument, "goldFields"> & {
  goldFields: CorpusDocument["goldFields"][number][];
};
export type DocumentQualityReport = {
  documentId: string;
  passed: boolean;
  recall: number | null;
  classificationAccuracy: number | null;
  retainedSourceValidity: number | null;
  canPrefill: boolean;
  matchedFieldIds: string[];
  failures: string[];
};

export const QUALITY_THRESHOLDS = Object.freeze({ criticalRecall: 0.9, requirementClassification: 0.9, retainedSources: 1 });

const sourceSchema = documentCandidateSourceSchema;
const outputSchema = z.object({
  documentId: z.string().min(1),
  documentVersionId: z.string().min(1),
  textVersionId: z.string().min(1),
  candidates: z.array(z.unknown()).max(100),
  reviewPoints: z.array(z.object({ code: z.string().min(1), source: sourceSchema }).strict()).max(100),
}).strict();

type Candidate = z.infer<typeof documentCandidateSchema>;
type Source = z.infer<typeof sourceSchema>;

// This is deliberately a fixed-annotation evaluator: new paraphrases must be reviewed
// and added to acceptedForms before a new evaluation round, never learned from outputs.
// No LLM judge, generated field IDs, supplied labels alone, or caller boolean earns credit.
function normalized(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLowerCase();
}

function sameSource(left: Source, right: Source): boolean {
  return left.segmentId === right.segmentId && left.quote === right.quote;
}

function validSource(document: QualityDocument, source: Source): boolean {
  const segments = document.segments.filter(({ id }) => id === source.segmentId);
  if (segments.length !== 1) return false;
  const segment = segments[0]!;
  if (document.text.slice(segment.start, segment.end) !== segment.text) return false;
  // Trusted provenance is built only from fixture annotations, never result claims.
  return resolveCandidateSourceRef(source, "quality-fixture-owner", {
    ownerId: "quality-fixture-owner", documentId: document.id, documentVersionId: document.documentVersionId,
    textVersionId: document.textVersionId, lifecycle: "active", text: document.text, segments: document.segments,
  }) !== null;
}

function sameSkills(actual: string[], expected: string[]): boolean {
  const actualSet = new Set(actual.map(normalized));
  const expectedSet = new Set(expected.map(normalized));
  return actualSet.size === actual.length && actualSet.size === expectedSet.size
    && [...expectedSet].every((skill) => actualSet.has(skill));
}

// Maximum bipartite matching gives each retained candidate and each preannotated
// semantic field at most one credit, independent of result ordering and candidate IDs.
function matchFields(document: QualityDocument, candidates: Candidate[]): Map<number, number> {
  const fieldToCandidate = new Map<number, number>();
  function assign(candidateIndex: number, visited: Set<number>): boolean {
    const candidate = candidates[candidateIndex]!;
    for (const [fieldIndex, field] of document.goldFields.entries()) {
      if (visited.has(fieldIndex) || candidate.kind !== field.kind
        || !field.acceptedForms.some((text) => normalized(text) === normalized(candidate.text))
        || !sameSource(candidate.source, field.source)
        || !validSource(document, candidate.source)
        || !sameSkills(candidate.skillLabels, field.skillLabels)) continue;
      visited.add(fieldIndex);
      const previous = fieldToCandidate.get(fieldIndex);
      if (previous === undefined || assign(previous, visited)) {
        fieldToCandidate.set(fieldIndex, candidateIndex);
        return true;
      }
    }
    return false;
  }
  candidates.forEach((_, index) => assign(index, new Set()));
  return fieldToCandidate;
}

export function evaluateDocumentQuality(document: QualityDocument, output: unknown): DocumentQualityReport {
  const failures = new Set<string>();
  const parsed = outputSchema.safeParse(output);
  if (!parsed.success) {
    return { documentId: document.id, passed: false, recall: 0,
      classificationAccuracy: document.goldFields.some((field) => ["must", "preferred"].includes(field.requirementLevel ?? "")) ? 0 : null,
      retainedSourceValidity: null, canPrefill: false, matchedFieldIds: [], failures: ["invalid-schema"] };
  }
  const result = parsed.data;
  const versionMatches = result.documentId === document.id
    && result.documentVersionId === document.documentVersionId && result.textVersionId === document.textVersionId;
  if (!versionMatches) failures.add("source-version-mismatch");

  const candidates: Candidate[] = [];
  let validCandidateSources = 0;
  const seenIds = new Set<string>();
  for (const rawCandidate of result.candidates) {
    const parsedCandidate = documentCandidateSchema.safeParse(rawCandidate);
    if (!parsedCandidate.success) {
      failures.add("invalid-schema");
      continue;
    }
    const candidate = parsedCandidate.data;
    if (seenIds.has(candidate.id)) failures.add("duplicate-candidate-id");
    seenIds.add(candidate.id);
    candidates.push(candidate);
    if (versionMatches && validSource(document, candidate.source)) validCandidateSources++;
    else failures.add("invalid-source");
    if (document.forbiddenOutputs.some((item) => item.acceptedForms.some((text) => normalized(text) === normalized(candidate.text)))) {
      failures.add("forbidden-output");
    }
  }
  const retainedSourceValidity = result.candidates.length > 0 ? validCandidateSources / result.candidates.length : null;
  if (retainedSourceValidity !== null && retainedSourceValidity < QUALITY_THRESHOLDS.retainedSources) failures.add("invalid-source");

  const matches = versionMatches ? matchFields(document, candidates) : new Map<number, number>();
  if (matches.size !== candidates.length) failures.add("unmatched-or-duplicate-candidate");
  const criticalFields = document.goldFields.map((field, index) => ({ field, index })).filter(({ field }) => field.critical);
  const classifiedFields = document.goldFields.map((field, index) => ({ field, index }))
    .filter(({ field }) => field.kind === "requirement" && ["must", "preferred"].includes(field.requirementLevel ?? ""));
  const recall = criticalFields.length > 0
    ? criticalFields.filter(({ index }) => matches.has(index)).length / criticalFields.length : null;
  const classificationAccuracy = classifiedFields.length > 0
    ? classifiedFields.filter(({ field, index }) => {
      const candidateIndex = matches.get(index);
      return candidateIndex !== undefined && candidates[candidateIndex]!.requirementLevel === field.requirementLevel;
    }).length / classifiedFields.length : null;
  if (recall !== null && recall < QUALITY_THRESHOLDS.criticalRecall) failures.add("critical-recall");
  if (classificationAccuracy !== null && classificationAccuracy < QUALITY_THRESHOLDS.requirementClassification) failures.add("requirement-classification");

  for (const [fieldIndex, candidateIndex] of matches) {
    const expected = document.goldFields[fieldIndex]!;
    const candidate = candidates[candidateIndex]!;
    if (candidate.selfLevelHint !== expected.selfLevelHint) failures.add("self-assessment-review");
    // An explicitly conflicted/unspecified requirement cannot be silently resolved.
    if (expected.requirementLevel === "unspecified" && candidate.requirementLevel !== "unspecified") failures.add("requirement-review");
  }
  const usedReviewPoints = new Set<number>();
  for (const expected of document.expectedReviewPoints) {
    const index = result.reviewPoints.findIndex((point, pointIndex) => !usedReviewPoints.has(pointIndex)
      && point.code === expected.code && sameSource(point.source, expected.source)
      && versionMatches && validSource(document, point.source));
    if (index === -1) failures.add("missing-review-point");
    else usedReviewPoints.add(index);
  }
  result.reviewPoints.forEach((point, index) => {
    if (!versionMatches || !validSource(document, point.source)) failures.add("invalid-source");
    if (!usedReviewPoints.has(index)) failures.add("unexpected-review-point");
  });

  // Offline availability proxy only. This cannot prove that the rendered review UI
  // lets 18/18 users finish without re-entry; that phase-1 interaction gate remains.
  const canPrefill = candidates.length > 0 && matches.size > 0 && failures.size === 0;
  if (document.category === "normal" && !canPrefill) failures.add("normal-prefill");
  return { documentId: document.id, passed: failures.size === 0, recall, classificationAccuracy,
    retainedSourceValidity, canPrefill, matchedFieldIds: [...matches.keys()].sort((a, b) => a - b).map((index) => document.goldFields[index]!.id),
    failures: [...failures].sort() };
}

export function evaluateQualityCorpus(documents: readonly QualityDocument[], outputs: readonly unknown[]) {
  const failures = new Set<string>();
  const expectedIds = new Set(documents.map(({ id }) => id));
  if (expectedIds.size !== documents.length) failures.add("duplicate-fixture-document");
  const outputById = new Map<string, unknown>();
  for (const output of outputs) {
    const identity = z.object({ documentId: z.string() }).safeParse(output);
    if (!identity.success) { failures.add("invalid-document-result"); continue; }
    const { documentId } = identity.data;
    if (!expectedIds.has(documentId)) failures.add("unexpected-document-result");
    if (outputById.has(documentId)) failures.add("duplicate-document-result");
    else outputById.set(documentId, output);
  }
  const reports = documents.map((document) => {
    if (!outputById.has(document.id)) failures.add("missing-document-result");
    return evaluateDocumentQuality(document, outputById.get(document.id));
  });
  const normalPrefillCount = reports.filter((report, index) => documents[index]!.category === "normal" && report.canPrefill).length;
  const edgePassCount = reports.filter((report, index) => documents[index]!.category === "edge" && report.passed).length;
  return { passed: failures.size === 0 && reports.every((report) => report.passed), documents: reports,
    normalPrefillCount, edgePassCount, failures: [...failures].sort(), realModelEvaluated: false as const };
}
