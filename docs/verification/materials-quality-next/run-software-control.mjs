// Software-only diagnostic. No transport, credential, native plan execution, or authorization path.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { constructedControl } from "../materials-quality-v2/candidate-controls.mjs";
import { evaluateSource } from "../materials-quality-v2/candidate-source.mjs";
import { evaluateCourse } from "../materials-quality-v2/candidate-course.mjs";
import { loadCurrentReviewedReferences } from "./current-references.mjs";
import { evaluateCurrentQuality } from "./current-adapter.ts";
import { KIMI_SOURCE_MENTIONS_POLICY_ID } from "../../../app/server/documents/policy.ts";

if (process.argv.length !== 3) throw new Error("Usage: node --import tsx run-software-control.mjs <new-output.json>");
const references = await loadCurrentReviewedReferences();
const control = constructedControl();
// Reuse the pre-existing scorer positive control only as a separately named software assertion.
const sourceControl = evaluateSource(control.documents, references);
const courseControl = evaluateCourse(control.courseObservations, control.documents, sourceControl.bindings, references);
if (sourceControl.report.status !== "passed" || courseControl.status !== "passed") throw new Error("Existing scorer software control failed");
// Only candidate INPUTS enter the current observer. Reference-derived course/plan observations are discarded.
const controls = control.documents.map(document => {
  const raw = references.corpora.find(doc => doc.id === document.documentId);
  return { documentId: document.documentId, documentVersionId: document.documentVersionId, textVersionId: document.textVersionId,
    sourceTextSha256: createHash("sha256").update(raw.text).digest("hex"), providerPolicyId: KIMI_SOURCE_MENTIONS_POLICY_ID,
    decodedCandidate: { schemaVersion: "2026.11.1", items: document.candidates, reviewPoints: document.reviewPoints },
    rawAssistant: { status: "not-a-model-output", assistantContent: null, finishEvidence: "not-a-model-output" },
    provenance: { kind: "constructed-control", actualModelOutput: false }, accounting: { state: "not-a-model-call", receiptVerified: false },
    captureIdentity: { collection: "existing-software-control-inputs", actualCapture: false } };
});
const actualComponentDiagnostic = await evaluateCurrentQuality({ controls }, references);
const report = { schemaVersion: "materials-current-software-diagnostic-v1", purpose: "one fixed existing-input software diagnostic; never real Kimi quality",
  realModelCalls: 0, newCorpora: 0, nativeMatrixRuns: 0, scorerSoftwareControl: { source: sourceControl.report.status, course: courseControl.status },
  actualComponentDiagnostic };
await writeFile(path.resolve(process.argv[2]), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({ output: process.argv[2], scorerSoftwareControl: report.scorerSoftwareControl,
  actualSource: actualComponentDiagnostic.source.status, actualCourse: actualComponentDiagnostic.course.status,
  adapterIssues: actualComponentDiagnostic.adapterIssues.length, courseMismatches: actualComponentDiagnostic.course.observations.filter(row => row.status === "failed").length,
  gateApproved: false, actualModelQualityEvaluated: false }));
