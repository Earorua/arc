import { z } from "zod";
import {
  DOCUMENT_SCHEMA_VERSION, MAX_DOCUMENT_ITEMS_JSON_BYTES, documentCandidateReviewPointsSchema,
  documentCandidateSchema, documentCandidateSourceSchema, fitsJsonBytes, resolveCandidateSourceRef,
} from "../../app/contracts/documents";
import type corpus from "../fixtures/documents/quality-corpus.json";

type CorpusDocument = typeof corpus.documents[number];
export type QualityDocument = Omit<CorpusDocument, "goldFields"> & {
  goldFields: CorpusDocument["goldFields"][number][];
};
/** Each component has its own one-to-one assignment. Counts across columns cannot be added.
 * exactSource uses the uniquely resolved gold segment and quote. AtSource and
 * sourceIncludingTerminalOmission also allow the same span minus one final sentence mark.
 * registeredForm compares frozen normalized strings. registeredFormAtSource requires both
 * observations on the same pair. Skill denominators include fields with labels, classification
 * denominators include must/preferred requirements. strictJoint is the frozen assignment before
 * requirement-level and self-review checks. For reviews, the joint count requires exact code
 * and source together; expected minus joint is missing, returned minus joint is excess.
 */
export type DocumentQualityDiagnostics = {
  fields: {
    expected: number; returned: number; exactSource: number; sourceIncludingTerminalOmission: number;
    registeredForm: number; registeredFormAtSource: number; kindAtSource: number;
    expectedSkillSets: number; skillSetAtSource: number; expectedClassifications: number; requirementLevelAtSource: number;
    strictJoint: number;
  };
  reviews: { expected: number; returned: number; code: number; exactSource: number; strictJoint: number };
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
  diagnostics: DocumentQualityDiagnostics | null;
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

function isClassifiedField(field: QualityDocument["goldFields"][number]): boolean {
  return field.kind === "requirement" && ["must", "preferred"].includes(field.requirementLevel ?? "");
}

function compareFields(document: QualityDocument, candidates: Candidate[], validSources: boolean[]) {
  const annotations = document.goldFields.map(field => ({
    field,
    forms: new Set(field.acceptedForms.map(normalized)),
    withoutTerminal: /[.!?。！？]$/u.test(field.source.quote) && validSource(document, field.source)
      ? field.source.quote.slice(0, -1) : null,
  }));
  return candidates.map((candidate, index) => {
    const form = normalized(candidate.text);
    return annotations.map(({ field, forms, withoutTerminal }) => {
      const exactSource = validSources[index]! && sameSource(candidate.source, field.source);
      // Both quotes must resolve uniquely in the same segment. Equality to the
      // exact annotated prefix then guarantees the same start and one-character difference.
      const span = exactSource || (validSources[index]! && candidate.source.segmentId === field.source.segmentId
        && candidate.source.quote === withoutTerminal);
      const registeredForm = forms.has(form);
      const kind = candidate.kind === field.kind;
      const skills = sameSkills(candidate.skillLabels, field.skillLabels);
      return {
        exactSource, sourceIncludingTerminalOmission: span, registeredForm,
        registeredFormAtSource: span && registeredForm, kindAtSource: span && kind,
        skillSetAtSource: span && field.skillLabels.length > 0 && skills,
        requirementLevelAtSource: span && kind && isClassifiedField(field) && candidate.requirementLevel === field.requirementLevel,
        strictJoint: exactSource && registeredForm && kind && skills,
      };
    });
  });
}

// Preserve candidate order and annotation traversal in the frozen maximum matching.
// A tie in strict matches may affect the subsequent classification and self-review checks.
function maximumMatching<T extends Record<string, boolean>>(pairs: T[][], component: keyof T): Map<number, number> {
  const fieldToCandidate = new Map<number, number>();
  function assign(candidateIndex: number, visited: Set<number>): boolean {
    for (const [fieldIndex, pair] of pairs[candidateIndex]!.entries()) {
      if (visited.has(fieldIndex) || !pair[component]) continue;
      visited.add(fieldIndex);
      const previous = fieldToCandidate.get(fieldIndex);
      if (previous === undefined || assign(previous, visited)) {
        fieldToCandidate.set(fieldIndex, candidateIndex);
        return true;
      }
    }
    return false;
  }
  pairs.forEach((_, index) => assign(index, new Set()));
  return fieldToCandidate;
}

export function evaluateDocumentQuality(document: QualityDocument, output: unknown): DocumentQualityReport {
  const failures = new Set<string>();
  const parsed = outputSchema.safeParse(output);
  if (!parsed.success) {
    return { documentId: document.id, passed: false, recall: 0,
      classificationAccuracy: document.goldFields.some((field) => ["must", "preferred"].includes(field.requirementLevel ?? "")) ? 0 : null,
      retainedSourceValidity: null, canPrefill: false, matchedFieldIds: [], failures: ["invalid-schema"], diagnostics: null };
  }
  const result = parsed.data;
  const versionMatches = result.documentId === document.id
    && result.documentVersionId === document.documentVersionId && result.textVersionId === document.textVersionId;
  if (!versionMatches) failures.add("source-version-mismatch");

  const candidates: Candidate[] = [];
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
    if (document.forbiddenOutputs.some((item) => item.acceptedForms.some((text) => normalized(text) === normalized(candidate.text)))) {
      failures.add("forbidden-output");
    }
  }
  const validSources = candidates.map(candidate => versionMatches && validSource(document, candidate.source));
  const retainedSourceValidity = result.candidates.length > 0 ? validSources.filter(Boolean).length / result.candidates.length : null;
  if (retainedSourceValidity !== null && retainedSourceValidity < QUALITY_THRESHOLDS.retainedSources) failures.add("invalid-source");

  const fieldPairs = compareFields(document, candidates, validSources);
  const matches = maximumMatching(fieldPairs, "strictJoint");
  if (matches.size !== candidates.length) failures.add("unmatched-or-duplicate-candidate");
  const criticalFields = document.goldFields.map((field, index) => ({ field, index })).filter(({ field }) => field.critical);
  const classifiedFields = document.goldFields.map((field, index) => ({ field, index }))
    .filter(({ field }) => isClassifiedField(field));
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
  const reviewPairs = result.reviewPoints.map(point => {
    const valid = versionMatches && validSource(document, point.source);
    if (!valid) failures.add("invalid-source");
    return document.expectedReviewPoints.map(expected => {
      const code = point.code === expected.code;
      const exactSource = valid && sameSource(point.source, expected.source);
      return { code, exactSource, strictJoint: code && exactSource };
    });
  });
  const matchedReviews = maximumMatching(reviewPairs, "strictJoint").size;
  if (matchedReviews < document.expectedReviewPoints.length) failures.add("missing-review-point");
  if (matchedReviews < result.reviewPoints.length) failures.add("unexpected-review-point");

  // Production callers also check the original extraction. A valid empty submission
  // has zero observed counts. An unusable scoring envelope returns null.
  const usable = versionMatches && !failures.has("invalid-schema") && !failures.has("duplicate-candidate-id")
    && !failures.has("invalid-source") && documentCandidateReviewPointsSchema.safeParse(result.reviewPoints).success
    && fitsJsonBytes({
      schemaVersion: DOCUMENT_SCHEMA_VERSION, items: candidates,
      // The scoring projection turns an omitted optional review array into [].
      reviewPoints: result.reviewPoints.length ? result.reviewPoints : undefined,
    }, MAX_DOCUMENT_ITEMS_JSON_BYTES);
  const countFields = (component: keyof (typeof fieldPairs)[number][number]) => maximumMatching(fieldPairs, component).size;
  const diagnostics = usable ? {
    fields: {
      expected: document.goldFields.length, returned: candidates.length,
      exactSource: countFields("exactSource"), sourceIncludingTerminalOmission: countFields("sourceIncludingTerminalOmission"),
      registeredForm: countFields("registeredForm"), registeredFormAtSource: countFields("registeredFormAtSource"),
      kindAtSource: countFields("kindAtSource"),
      expectedSkillSets: document.goldFields.filter(field => field.skillLabels.length > 0).length,
      skillSetAtSource: countFields("skillSetAtSource"), expectedClassifications: classifiedFields.length,
      requirementLevelAtSource: countFields("requirementLevelAtSource"), strictJoint: matches.size,
    },
    reviews: {
      expected: document.expectedReviewPoints.length, returned: result.reviewPoints.length,
      code: maximumMatching(reviewPairs, "code").size, exactSource: maximumMatching(reviewPairs, "exactSource").size,
      strictJoint: matchedReviews,
    },
  } : null;

  // Offline availability proxy only. This cannot prove that the rendered review UI
  // lets 18/18 users finish without re-entry; that phase-1 interaction gate remains.
  const canPrefill = candidates.length > 0 && matches.size > 0 && failures.size === 0;
  if (document.category === "normal" && !canPrefill) failures.add("normal-prefill");
  return { documentId: document.id, passed: failures.size === 0, recall, classificationAccuracy,
    retainedSourceValidity, canPrefill, matchedFieldIds: [...matches.keys()].sort((a, b) => a - b).map((index) => document.goldFields[index]!.id),
    failures: [...failures].sort(), diagnostics };
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
