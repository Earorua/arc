/** TEST ONLY: constructed controls are not model or actual product observations. */
import { readFileSync } from "node:fs";

const read = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
export const sourceControlReference = read("annotations.draft.json");
export const courseControlReference = read("course-annotations.draft.json");
export const planningControlReference = read("planning-reference-cases.json");
export const fieldsFor = (document) => [...document.fields, ...document.additionalFields.filter((field) => !field.scoring.linkedLegacyAndAdditionalFacetMayShareCandidate)];
export const fieldId = (field) => field.legacyId ?? field.id;
const wireSource = ({ segmentId, quote }) => ({ segmentId, quote });

export function termsFor(field, selectedLiteral) {
  const selected = selectedLiteral === undefined ? [] : [selectedLiteral];
  for (const group of field.skillTermGroups) {
    if (!selected.some((literal) => group.alternatives.includes(literal)
      || field.combinedLiteralTerms.some((term) => term.literal === literal && term.coversGroupIds.includes(group.id)))) selected.push(group.alternatives[0]);
  }
  return [...new Set(selected)];
}

export function courseControls(documents) {
  return documents.flatMap((document) => document.candidates.flatMap((candidate) => {
    const reference = sourceControlReference.documents.find((entry) => entry.id === document.documentId);
    const field = fieldsFor(reference).find((entry) => entry.source.segmentId === candidate.source.segmentId && entry.source.quote === candidate.source.quote);
    if (!field) return [];
    const account = courseControlReference.documents.find((entry) => entry.documentId === document.documentId).fields.find((entry) => entry.fieldId === fieldId(field));
    return (candidate.skillLabels.length ? candidate.skillLabels : [null]).map((literal) => {
      const relation = account.relations.find((entry) => entry.literal === literal);
      if (!relation) throw new Error(`Control has no frozen course relation: ${fieldId(field)} / ${literal}`);
      return { documentId: document.documentId, candidateId: candidate.id, literal,
        topic: { status: relation.topic.status, skillIds: [...relation.topic.skillIds], basis: relation.topic.basis },
        taskCoverage: { status: relation.taskCoverage.status } };
    });
  }));
}

export function constructedControl() {
  const documents = sourceControlReference.documents.map((document) => ({
    documentId: document.id, documentVersionId: document.documentVersionId, textVersionId: document.textVersionId,
    candidates: fieldsFor(document).map((field, index) => ({ id: `candidate-${index + 1}`, text: field.factTextMatch.text,
      kind: field.expected.kind, source: wireSource(field.source), skillLabels: termsFor(field),
      selfLevelHint: field.expectedSelfLevelHint.allowedValues[0], requirementLevel: field.expected.requirementLevel })),
    reviewPoints: document.requiredReviews.map((review) => ({ code: review.code, source: wireSource(review.source) })),
  }));
  return { schemaVersion: "materials-quality-candidate-v2.1", provenance: { kind: "constructed-control", description: "Test-only control built from independently frozen source/course truth and synthetic planning invariants; not a quality measurement." },
    documents, courseObservations: courseControls(documents),
    planObservations: planningControlReference.cases.map((testCase) => ({ caseId: testCase.id, inputSha256: testCase.inputSha256,
      result: { applyState: testCase.constraints.applyState, rejectionCode: testCase.constraints.rejectionCode,
        state: { ...structuredClone(testCase.input.before), ...structuredClone(testCase.constraints.expectedChanges) } } })),
  };
}

export const documentFor = (batch, id) => batch.documents.find((document) => document.documentId === id);
export const candidateFor = (batch, documentId, index = 0) => documentFor(batch, documentId).candidates[index];
export const planningFor = (batch, caseId) => batch.planObservations.find((entry) => entry.caseId === caseId);
