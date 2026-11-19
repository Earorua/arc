import { createHash } from "node:crypto";
import { documentExtractionSchema, type DocumentCandidate, type DocumentCandidateReviewPoint } from "../../../app/contracts/documents";
import { flagshipBlueprint } from "../../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../../app/data/flagship-unit-registry";
import { validateDocumentExtraction } from "../../../app/server/documents/extraction-validator";
import { KIMI_SOURCE_MENTIONS_POLICY_ID } from "../../../app/server/documents/policy";
import { mapMaterialItemTerms } from "../../../app/lib/materials/skill-mapper";
import { createCourseTaskCoverageEvaluator } from "../../../app/lib/materials/course-task-coverage";
import { validateCandidateInput } from "../materials-quality-v2/candidate-input.mjs";
import { evaluateSource } from "../materials-quality-v2/candidate-source.mjs";
import { evaluateCourse } from "../materials-quality-v2/candidate-course.mjs";
import { fixedDenominators } from "../materials-quality-v2/candidate-common.mjs";
import { assertCurrentReviewedReferences, isCurrentReviewedReferences, loadCurrentReviewedReferences } from "./current-references.mjs";
import { isVerifiedCaptureBatch, type CaptureBatch, type CapturedDocument } from "./current-captures";

type References = Awaited<ReturnType<typeof loadCurrentReviewedReferences>>;
type Issue = { code: string; documentId: string; candidateId?: string; literal?: string; path?: string };
type SourceInput = { documentId: string; documentVersionId: string; textVersionId: string; candidates: DocumentCandidate[]; reviewPoints: DocumentCandidateReviewPoint[] };
type Observation = { documentId: string; candidateId: string; literal: string | null;
  topic: { status: "mapped" | "ambiguous" | "uncovered" | "non-learning"; skillIds: string[]; basis: "literal" | "contextual" | "none" | "not-applicable" };
  taskCoverage: { status: "full" | "partial" | "none" | "not-applicable" } };
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const provenance = { kind: "product-observation", description: "Actual current component outputs from preserved decoded captures; no plan execution." };
const packet = (documents: SourceInput[], courseObservations?: Observation[]) => ({ schemaVersion: "materials-quality-candidate-v2.1", provenance, documents,
  ...(courseObservations ? { courseObservations } : {}) });

/** Low-level observation API also accepts openly authored software controls; it confers no capture/accounting trust. */
export function observeCapturedDocument(capture: CapturedDocument, references: References) {
  if (!isCurrentReviewedReferences(references)) throw new Error("current-reference-unverified");
  const issues: Issue[] = [], removedTerms: { candidateId: string; literal: string }[] = [];
  const issue = (code: string, extra: Partial<Issue> = {}) => issues.push({ code, documentId: capture.documentId, ...extra });
  const raw = references.corpora.find((doc: { id: string }) => doc.id === capture.documentId);
  const identity = { documentId: capture.documentId, documentVersionId: capture.documentVersionId, textVersionId: capture.textVersionId };
  const decodedCandidate = capture.decodedCandidate;
  let sourceInput: SourceInput | null = null, projection: ReturnType<typeof validateDocumentExtraction> | null = null;
  if (!raw || capture.documentVersionId !== raw.documentVersionId || capture.textVersionId !== raw.textVersionId
    || (capture.sourceTextSha256 !== null && capture.sourceTextSha256 !== hash(raw.text))) issue("capture-document-identity");
  if (capture.providerPolicyId !== KIMI_SOURCE_MENTIONS_POLICY_ID) issue("capture-projection-policy");
  const extraction = documentExtractionSchema.safeParse(decodedCandidate);
  if (!extraction.success) issue(decodedCandidate === undefined ? "decoded-candidate-missing" : decodedCandidate === null ? "decoded-candidate-null" : "decoded-candidate-invalid");
  else {
    // The independent protocol requires actual reviewPoints. No default is supplied from production or gold.
    const actual = decodedCandidate as { items: DocumentCandidate[]; reviewPoints?: DocumentCandidateReviewPoint[] };
    const candidateInput = { ...identity, candidates: actual.items, reviewPoints: actual.reviewPoints };
    const errors = validateCandidateInput(packet([candidateInput as SourceInput]));
    if (errors.length) for (const error of errors) issue("candidate-input-unrepresentable", { path: error.path });
    else if (!issues.length) sourceInput = candidateInput as SourceInput;
  }
  if (raw && !issues.some(value => ["capture-document-identity", "capture-projection-policy"].includes(value.code))) {
    try {
      projection = validateDocumentExtraction(decodedCandidate, "current-quality-component-observer", {
        ownerId: "current-quality-component-observer", ...identity, lifecycle: "active", text: raw.text, segments: raw.segments,
      }, KIMI_SOURCE_MENTIONS_POLICY_ID);
    } catch { issue("production-extraction-invalid"); }
  }
  if (sourceInput && projection) for (const candidate of sourceInput.candidates) {
    const item = projection.items.find(item => item.id === candidate.id);
    if (!item) { issue("projected-item-missing", { candidateId: candidate.id }); continue; }
    for (const literal of candidate.skillLabels) if (!item.skillLabels?.includes(literal)) {
      removedTerms.push({ candidateId: candidate.id, literal }); issue("projected-term-removed", { candidateId: candidate.id, literal });
    }
  }
  const taskCoverage = createCourseTaskCoverageEvaluator(flagshipBlueprint, flagshipUnitRegistry);
  // This is exactly the product eligibility rule, using actual source role and projected kind only.
  const eligible = raw && projection ? projection.items.filter(item => raw.kind !== "jd" && (item.kind === "constraint" || item.kind === "requirement")).map(item => item.id) : [];
  const view = (learningIntentItemIds: string[], name: "no-choice-baseline" | "simulated-explicit-choice") => {
    const mappings = projection ? mapMaterialItemTerms(projection.items, flagshipBlueprint, flagshipUnitRegistry, { learningIntentItemIds })
      .map(detail => ({ ...detail, taskCoverage: taskCoverage(detail, projection!.items.find(item => item.id === detail.itemId)!) })) : [];
    const observations: Observation[] = [];
    for (const mapping of mappings) {
      if (mapping.status === "omitted" || mapping.basis === "manual") {
        issue("course-observation-unrepresentable", { candidateId: mapping.itemId, literal: mapping.term }); continue;
      }
      observations.push({ documentId: capture.documentId, candidateId: mapping.itemId, literal: mapping.term,
        topic: { status: mapping.status, skillIds: mapping.skillIds, basis: mapping.basis ?? (mapping.status === "non-learning" ? "not-applicable" : "none") },
        taskCoverage: { status: mapping.taskCoverage.status } });
    }
    // The independent wire protocol explicitly specifies a null literal for an actual no-label fact.
    // A dropped nonempty label list never takes this path and remains a missing observation.
    if (projection && sourceInput) for (const candidate of sourceInput.candidates) {
      const item = projection.items.find(item => item.id === candidate.id);
      if (candidate.skillLabels.length === 0 && item?.skillLabels?.length === 0)
        observations.push({ documentId: capture.documentId, candidateId: candidate.id, literal: null,
          topic: { status: "non-learning", skillIds: [], basis: "not-applicable" }, taskCoverage: { status: "not-applicable" } });
    }
    return { kind: name, learningIntentItemIds, unadoptedLearningIntentItemIds: eligible.filter(id => !learningIntentItemIds.includes(id)),
      userConfirmationPerformed: false, planWritesPerformed: false, sourceFactsChanged: false, selfAssessmentsAdopted: false, mappings, observations };
  };
  const baseline = view([], "no-choice-baseline"), simulatedExplicitChoice = view([...eligible], "simulated-explicit-choice");
  return { ...identity, rawAssistant: capture.rawAssistant, decodedCandidate,
    decodedCandidateState: decodedCandidate === undefined ? "missing" : decodedCandidate === null ? "null" : "present", sourceInput,
    sourceValidation: { status: projection ? "valid" : "invalid", policyId: KIMI_SOURCE_MENTIONS_POLICY_ID }, projection, removedTerms,
    views: { baseline, simulatedExplicitChoice }, accounting: capture.accounting, captureIdentity: capture.captureIdentity,
    originalCapture: capture.originalCapture, originalSupplementOutput: capture.originalSupplementOutput, issues };
}

/** Aggregate only authenticated local capture readers, or an explicitly separate software-control input. */
export async function evaluateCurrentQuality(input: { qualification?: CaptureBatch; supplement?: CaptureBatch; controls?: CapturedDocument[];
  courseView?: "baseline" | "simulated-explicit-choice" }, references: References) {
  await assertCurrentReviewedReferences(references);
  if (input.controls && (input.qualification || input.supplement)) throw new Error("current-quality: controls and captured runs must remain separate");
  if (input.qualification && (!isVerifiedCaptureBatch(input.qualification) || input.qualification.collection !== "qualification-24")) throw new Error("current-quality: unverified qualification capture");
  if (input.supplement && (!isVerifiedCaptureBatch(input.supplement) || input.supplement.collection !== "supplement-6")) throw new Error("current-quality: unverified supplement capture");
  const batches = [input.qualification, input.supplement].filter((batch): batch is CaptureBatch => Boolean(batch));
  const captures = input.controls ?? batches.flatMap(batch => batch.outputs);
  if (captures.length > 30 || new Set(captures.map(capture => capture.documentId)).size !== captures.length) throw new Error("current-quality: duplicate or excess captured documents");
  const receiptIds = captures.flatMap(capture => capture.accounting.receiptId ? [capture.accounting.receiptId] : []);
  if (new Set(receiptIds).size !== receiptIds.length) throw new Error("current-quality: duplicate-receipt across captured documents");
  const observations = captures.map(capture => observeCapturedDocument(capture, references));
  const documents = observations.flatMap(observation => observation.sourceInput ? [observation.sourceInput] : []);
  const selectedView = input.courseView ?? "simulated-explicit-choice";
  const courseObservations = observations.flatMap(observation => selectedView === "baseline" ? observation.views.baseline.observations : observation.views.simulatedExplicitChoice.observations);
  const validation = validateCandidateInput(packet(documents, courseObservations));
  if (validation.length) throw new Error("current-quality: unrepresentable adapter batch");
  // These are the unchanged independent pure scorers and thresholds. No old trust credential or planning after-state is constructed.
  const source = evaluateSource(documents, references), course = evaluateCourse(courseObservations, documents, source.bindings, references);
  const issues = observations.flatMap(observation => observation.issues);
  const captureComplete = Boolean(input.qualification?.complete && input.supplement?.complete && captures.length === 30);
  const missing = references.corpora.filter((doc: { id: string }) => !captures.some(capture => capture.documentId === doc.id)).map((doc: { id: string }) => doc.id);
  const live = batches.length === 2 && batches.every(batch => batch.mode === "authorized-live");
  const failed = issues.length > 0 || source.report.status === "failed" || course.status === "failed";
  return { schemaVersion: "materials-current-quality-report-v1", status: failed ? "failed" : captureComplete ? "passed" : "incomplete",
    provenance: { kind: input.controls ? "constructed-control" : "captured-output", modelReceiptsIndependentlyRequeried: false },
    qualificationApproved: false, gateApproved: false, releaseApproved: false, historyRewritten: false,
    actualModelQualityEvaluated: captureComplete && live, actualProductIntegrationVerified: false, referenceCorpusSynthetic: true,
    denominators: { ...fixedDenominators }, referenceDigests: references.digests,
    captureAccounting: { status: captureComplete ? "complete" : "incomplete", meaning: "all 30 outputs recorded with settled locally verified receipt accounting",
      startupWindowVerified: false, budgetAuthorizationVerified: false, originalQualificationJournalVerified: false,
      capturedDocuments: captures.length, expectedDocuments: 30,
      missingDocumentIds: missing, receiptVerifiedDocuments: captures.filter(capture => capture.accounting.receiptVerified).length,
      collections: batches.map(batch => ({ collection: batch.collection, mode: batch.mode, complete: batch.complete, binding: batch.binding,
        missingDocumentIds: batch.missingDocumentIds, limitations: batch.limitations })) },
    source: source.report, course: { ...course, view: selectedView, observationScope: "current-component-potential-relations; simulated IDs are not actual user adoption" },
    componentObservations: observations, adapterIssues: issues, nativeBehaviorReuse: references.nativeBehaviorReuse,
    limitations: ["Startup, budget and approval evidence remains in the original run journal/operator packet; this report does not verify or grant a live authorization.",
      "Native behavior is separately reused from its original accepted run and reviewed source delta; it is not a current plan execution.",
      "A local quality measurement cannot authorize a paid call, production qualification, migration, deployment or release."] };
}
