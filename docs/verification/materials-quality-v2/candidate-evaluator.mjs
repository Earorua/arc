import { fixedDenominators } from "./candidate-common.mjs";
import { validateCandidateInput } from "./candidate-input.mjs";
import { isReviewedReferences } from "./candidate-references.mjs";
import { evaluateSource } from "./candidate-source.mjs";
import { evaluateCourse } from "./candidate-course.mjs";
import { evaluatePlanning } from "./candidate-planning.mjs";
export { loadReviewedReferences } from "./candidate-references.mjs";

export function errorReport(code, path = "/") {
  return { schemaVersion: "materials-quality-candidate-report-v2.1", status: "error", passed: false,
    qualificationApproved: false, historyRewritten: false, actualModelQualityEvaluated: false, actualProductIntegrationVerified: false,
    offline: true, referenceCorpusSynthetic: true, denominators: { ...fixedDenominators },
    source: { status: "not-evaluated" }, course: { status: "not-evaluated" }, planning: { status: "not-evaluated" }, errors: [{ code, path }] };
}

/** Pure, deterministic evaluation. References must be an immutable loader receipt. */
export function evaluateCandidateBatch(input, references) {
  if (!isReviewedReferences(references)) return errorReport("reference-unverified");
  const errors = validateCandidateInput(input);
  if (errors.length) return { ...errorReport("input-invalid"), referenceDigests: references.digests, errors };
  const source = evaluateSource(input.documents, references);
  const course = evaluateCourse(input.courseObservations, input.documents, source.bindings, references);
  const planning = evaluatePlanning(input.planObservations, references);
  const axes = [source.report.status, course.status, planning.status];
  const status = axes.includes("failed") ? "failed" : axes.includes("not-evaluated") ? "incomplete" : "passed";
  return { schemaVersion: "materials-quality-candidate-report-v2.1", status, passed: status === "passed", provenance: { ...input.provenance },
    provenanceVerified: false, qualificationApproved: false, historyRewritten: false, actualModelQualityEvaluated: false, actualProductIntegrationVerified: false,
    offline: true, referenceCorpusSynthetic: true, denominators: { ...fixedDenominators }, referenceDigests: references.digests,
    source: source.report, course, planning, errors: [] };
}
