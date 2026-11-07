import { errorCollector, fieldId, observationKey, sameSet } from "./candidate-common.mjs";

export function evaluateCourse(observations, documents, bindings, references) {
  if (observations === undefined) return { status: "not-evaluated", reason: "course-observations-absent", observations: [], errors: [] };
  const issues = errorCollector(); const expected = new Map();
  const candidateKeys = new Set(documents.flatMap((document) => document.candidates.map((candidate) => JSON.stringify([document.documentId, candidate.id]))));
  for (const document of documents) for (const candidate of document.candidates) {
    const binding = bindings.get(JSON.stringify([document.documentId, candidate.id]));
    if (!binding) { issues.add("course-source-unmatched", { documentId: document.documentId, candidateId: candidate.id }); continue; }
    const field = binding.fields.find((entry) => entry.legacyId) ?? binding.fields[0];
    const account = references.course.documents.find((entry) => entry.documentId === document.documentId).fields.find((entry) => entry.fieldId === fieldId(field));
    for (const literal of candidate.skillLabels.length ? candidate.skillLabels : [null]) {
      const relation = account.relations.find((entry) => entry.literal === literal);
      const location = { documentId: document.documentId, fieldId: fieldId(field), candidateId: candidate.id, literal };
      if (!relation) issues.add("unknown-course-policy", location);
      else expected.set(observationKey(document.documentId, candidate.id, literal), { relation, location });
    }
  }
  const seen = new Set(); const reports = [];
  for (const observation of observations) {
    const key = observationKey(observation.documentId, observation.candidateId, observation.literal);
    const errors = []; const expectedEntry = expected.get(key);
    const location = expectedEntry?.location ?? { documentId: observation.documentId, candidateId: observation.candidateId, literal: observation.literal };
    const issue = (code) => { const error = { code, ...location }; errors.push(error); issues.add(code, location); };
    if (seen.has(key)) issue("duplicate-course-observation"); seen.add(key);
    if (!candidateKeys.has(JSON.stringify([observation.documentId, observation.candidateId]))) issue("unknown-course-candidate");
    else if (!expectedEntry) issue("unexpected-course-literal");
    if (observation.topic.skillIds.some((skillId) => !references.skillIds.includes(skillId))) issue("illegal-course-id");
    if (expectedEntry) {
      const relation = expectedEntry.relation;
      if (observation.topic.status !== relation.topic.status || !sameSet(observation.topic.skillIds, relation.topic.skillIds)) issue("course-topic");
      if (observation.topic.basis !== relation.topic.basis) issue("course-basis");
      if (observation.taskCoverage.status !== relation.taskCoverage.status) issue("task-coverage");
    }
    reports.push({ ...location, status: errors.length ? "failed" : "passed", errors });
  }
  for (const [key, entry] of expected) if (!seen.has(key)) {
    issues.add("missing-course-observation", entry.location);
    reports.push({ ...entry.location, status: "failed", errors: [{ code: "missing-course-observation", ...entry.location }] });
  }
  return { status: issues.errors.length ? "failed" : "passed", expectedActualLiteralObservations: expected.size, receivedObservations: observations.length,
    coverageMeaning: "union-of-cited-content; ambiguous candidates remain unselected; not guaranteed per candidate skill",
    observations: reports, errors: issues.errors, omittedErrors: issues.omitted };
}
