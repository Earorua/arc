import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { evaluateCandidateBatch, loadReviewedReferences } from "./candidate-evaluator.mjs";
import { REFERENCE_HASHES } from "./candidate-references.mjs";
import { validateCandidateInput } from "./candidate-input.mjs";
import { locateFrozenSpan } from "./candidate-source.mjs";
import { constructedControl, sourceControlReference, courseControlReference, planningControlReference, fieldsFor, fieldId, termsFor, courseControls, documentFor, candidateFor, planningFor } from "./candidate-controls.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const references = await loadReviewedReferences(root);
const evaluate = (input) => evaluateCandidateBatch(input, references);
const reasons = (result) => JSON.stringify(result);
const change = (mutate) => { const input = constructedControl(); mutate(input); return evaluate(input); };
async function removeTemporary(dir) {
  const resolved = path.resolve(dir); const temporaryRoot = path.resolve(tmpdir());
  assert.ok(resolved.startsWith(`${temporaryRoot}${path.sep}`) && path.basename(resolved).startsWith("candidate-"));
  await rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
test("fixed planning inputs require explicit preview acceptance for plan changes and a genuinely stale preview", () => {
  const replace = planningControlReference.cases.find(c => c.id === "replace-primary-jd-same-job");
  assert.deepEqual(replace.constraints.expectedChanges.order ?? replace.input.before.order, replace.input.before.order);
  assert.deepEqual(replace.constraints.expectedChanges.schedule ?? replace.input.before.schedule, replace.input.before.schedule);
  assert.deepEqual(replace.constraints.expectedChanges.selectedMaterials ?? replace.input.before.selectedMaterials, replace.input.before.selectedMaterials);
  assert.deepEqual(replace.constraints.expectedChanges.mainJdRequirements ?? replace.input.before.mainJdRequirements, replace.input.before.mainJdRequirements);
  const accept = planningControlReference.cases.find(c => c.id === "accept-current-primary-jd-preview");
  assert.ok(accept); assert.equal(accept.input.before.preview.baseRevision, accept.input.before.revision);
  assert.equal(accept.constraints.expectedChanges.preview.applied, true);
  assert.deepEqual(accept.constraints.expectedChanges.selectedMaterials, accept.input.before.preview.proposedContext.selectedMaterials);
  assert.notDeepEqual(accept.constraints.expectedChanges.order, accept.input.before.order);
  const stale = planningControlReference.cases.find(c => c.id === "stale-preview-reject");
  assert.notEqual(stale.input.before.preview.baseRevision, stale.input.before.revision);
  assert.equal(stale.input.action.expectedRevision, stale.input.before.revision);
});
function failure(mutate, code, axis = "source") {
  const result = change(mutate);
  assert.equal(result.passed, false);
  assert.equal(result[axis].status, "failed");
  assert.ok(reasons(result).includes(`"code":"${code}"`), `Expected ${code}: ${reasons(result).slice(0, 1200)}`);
  assert.equal(result.denominators.legacyFields, 84);
  assert.equal(result.denominators.additionalFields, 2);
  return result;
}

test("complete constructed control passes three independent axes without making quality claims", () => {
  const result = evaluate(constructedControl());
  assert.equal(result.passed, true);
  assert.deepEqual([result.source.status, result.course.status, result.planning.status], ["passed", "passed", "passed"]);
  assert.equal(result.qualificationApproved, false);
  assert.equal(result.historyRewritten, false);
  assert.equal(result.actualModelQualityEvaluated, false);
  assert.equal(result.actualProductIntegrationVerified, false);
  assert.equal(result.denominators.documents, 30);
  assert.equal(result.denominators.primaryJdExplicitClassification, 31);
  assert.equal(result.denominators.secondaryJdExplicitClassification, 1);
  assert.equal(result.denominators.unresolvedJdConflictAnchors, 2);
  assert.deepEqual(result.source.groups.map((group) => group.documents), [18, 6, 3, 3]);
  const zero = result.source.documents.find((document) => document.documentId === "supplement-05");
  assert.deepEqual(zero.metrics.criticalRecall, { status: "not-applicable", numerator: 0, denominator: 0, value: null });
  assert.deepEqual(evaluate(constructedControl()), result, "deterministic output");
});

test("source-only report stays incomplete; absence is never filled from references", () => {
  const batch = constructedControl(); delete batch.courseObservations; delete batch.planObservations;
  const result = evaluate(batch);
  assert.equal(result.source.status, "passed"); assert.equal(result.passed, false); assert.equal(result.status, "incomplete");
  assert.equal(result.course.status, "not-evaluated"); assert.equal(result.planning.status, "not-evaluated");
});

test("fixed hint accounting and optional null-hint local review are valid", () => {
  const batch = constructedControl();
  const hints = sourceControlReference.documents.flatMap((document) => document.fields.map((field) => field.expectedSelfLevelHint.allowedValues[0]));
  assert.deepEqual(["guided", "conceptual", null].map((hint) => hints.filter((value) => value === hint).length), [11, 6, 67]);
  const optional = sourceControlReference.documents[0].optionalReviews[0];
  documentFor(batch, "resume-01").reviewPoints.push({ code: optional.code, source: { segmentId: optional.source.segmentId, quote: optional.source.quote } });
  assert.equal(candidateFor(batch, "resume-01", 1).selfLevelHint, null);
  assert.equal(evaluate(batch).passed, true);
});

test("handwritten candidate shapes bind by full source and literal, with arbitrary candidate ids", () => {
  const batch = constructedControl();
  const quote1 = "2024年在青桔实验室参与销售报表项目，按导师示例编写 SQL 汇总查询。";
  const quote2 = "使用 Python 清洗空值记录，并把清洗规则写入测试。";
  const quote3 = "每周可投入四小时学习，希望补齐数据分析基础。";
  batch.documents[0] = { documentId: "resume-01", documentVersionId: "resume-01-version-1", textVersionId: "resume-01-text-1",
    candidates: [
      { id: "human-sql", text: quote1, kind: "experience", source: { segmentId: "resume-01-segment-1", quote: quote1 }, skillLabels: ["SQL 汇总查询"], selfLevelHint: "guided", requirementLevel: null },
      { id: "human-python", text: quote2, kind: "experience", source: { segmentId: "resume-01-segment-2", quote: quote2 }, skillLabels: ["Python", "清洗空值记录", "清洗规则写入测试"], selfLevelHint: null, requirementLevel: null },
      { id: "human-availability", text: quote3, kind: "constraint", source: { segmentId: "resume-01-segment-3", quote: quote3 }, skillLabels: ["数据分析基础"], selfLevelHint: null, requirementLevel: null },
    ], reviewPoints: [{ code: "confirm-self-assessment", source: { segmentId: "resume-01-segment-1", quote: quote1 } }, { code: "confirm-self-assessment", source: { segmentId: "resume-01-segment-2", quote: quote2 } }],
  };
  const observations = [
    ["human-sql", "SQL 汇总查询", "mapped", ["sql"], "contextual", "none"],
    ["human-python", "Python", "uncovered", [], "none", "none"],
    ["human-python", "清洗空值记录", "uncovered", [], "none", "none"],
    ["human-python", "清洗规则写入测试", "mapped", ["testing"], "contextual", "partial"],
    ["human-availability", "数据分析基础", "uncovered", [], "none", "none"],
  ].map(([candidateId, literal, status, skillIds, basis, coverage]) => ({ documentId: "resume-01", candidateId, literal, topic: { status, skillIds, basis }, taskCoverage: { status: coverage } }));
  batch.courseObservations = [...observations, ...batch.courseObservations.filter(o => o.documentId !== "resume-01")];
  const result = evaluate(batch); assert.equal(result.passed, true);
  assert.equal(result.source.documents[0].fields[0].candidateId, "human-sql");
  assert.equal(result.source.documents[0].fields.length, 4, "three candidates credit three legacy fields and one shared addition");
});

test("primary and secondary classification and unresolved anchors retain separate totals", () => {
  const result = evaluate(constructedControl());
  assert.ok(result.source.classification, "separate source classification metrics are required");
  assert.equal(result.source.classification.primaryJd.denominator, 31);
  assert.equal(result.source.classification.primaryJd.numerator, 31);
  assert.equal(result.source.classification.secondaryJd.denominator, 1);
  assert.equal(result.source.classification.unresolvedAnchors.denominator, 2);
});

test("every frozen finite relation, alternative and combined term has a positive control", () => {
  let exercised = 0;
  for (const document of sourceControlReference.documents) for (const field of fieldsFor(document)) {
    const account = courseControlReference.documents.find((row) => row.documentId === document.id).fields.find((row) => row.fieldId === fieldId(field));
    for (const relation of account.relations) {
      const batch = constructedControl();
      candidateFor(batch, document.id, fieldsFor(document).indexOf(field)).skillLabels = termsFor(field, relation.literal === null ? undefined : relation.literal);
      batch.courseObservations = courseControls(batch.documents);
      assert.equal(evaluate(batch).passed, true, `${fieldId(field)} / ${relation.literal}`); exercised++;
    }
  }
  assert.equal(exercised, 255, "shared facet contributes no duplicate observation");
});

for (const [name, mutate, code] of [
  ["lost negation", b => { candidateFor(b, "resume-11", 2).text = "I can configure a Kubernetes cluster myself."; }, "fact-text"],
  ["changed actor", b => { candidateFor(b, "supplement-04").text = "我完成了 Kubernetes 集群迁移。"; }, "fact-text"],
  ["changed year", b => { candidateFor(b, "resume-01").text = candidateFor(b, "resume-01").text.replace("2024", "2025"); }, "fact-text"],
  ["changed project", b => { candidateFor(b, "resume-01").text = candidateFor(b, "resume-01").text.replace("销售报表", "财务预测"); }, "fact-text"],
  ["stale document version", b => { documentFor(b, "resume-01").documentVersionId = "resume-01-version-2"; }, "document-version"],
  ["stale text version", b => { documentFor(b, "resume-01").textVersionId = "resume-01-text-2"; }, "text-version"],
  ["changed source quote", b => { candidateFor(b, "resume-01").source.quote = "SQL"; }, "unmatched-fact"],
  ["wrong segment", b => { candidateFor(b, "resume-01").source.segmentId = "resume-01-segment-2"; }, "source-span"],
  ["removed task", b => { candidateFor(b, "resume-01").skillLabels = ["SQL"]; }, "missing-term-group"],
  ["removed tool", b => { candidateFor(b, "resume-01").skillLabels = ["汇总查询"]; }, "missing-term-group"],
  ["removed all terms", b => { candidateFor(b, "resume-01").skillLabels = []; }, "missing-term-group"],
  ["invented course label", b => { candidateFor(b, "resume-01").skillLabels.push("sql"); }, "unknown-term"],
  ["changed hint to null", b => { candidateFor(b, "resume-01").selfLevelHint = null; }, "self-level-hint"],
  ["promoted coach advice", b => { candidateFor(b, "supplement-01", 1).requirementLevel = "must"; }, "requirement-level"],
  ["resolved open conflict", b => { candidateFor(b, "jd-12").requirementLevel = "must"; }, "unresolved-conflict"],
  ["duplicate fact", b => { documentFor(b, "resume-01").candidates.push({ ...structuredClone(candidateFor(b, "resume-01")), id: "duplicate" }); }, "duplicate-fact"],
  ["extra source fact", b => { documentFor(b, "supplement-05").candidates.push({ ...structuredClone(candidateFor(b, "resume-01")), id: "injected" }); }, "unmatched-fact"],
  ["lost review", b => { documentFor(b, "supplement-05").reviewPoints.pop(); }, "missing-review"],
  ["extra review", b => { documentFor(b, "resume-01").reviewPoints.push({ code: "uncovered-skill", source: structuredClone(candidateFor(b, "resume-01").source) }); }, "forbidden-review"],
  ["missing document", b => { b.documents.pop(); }, "missing-document"],
  ["missing field", b => { documentFor(b, "resume-01").candidates.pop(); }, "missing-field"],
  ["missing separate additional fact", b => { documentFor(b, "jd-12").candidates.pop(); }, "missing-field"],
]) test(`source rejects ${name}`, () => failure(mutate, code));

for (const [name, literal, docId, index] of [
  ["UI tokens do not mean OAuth tokens", "OAuth tokens", "resume-09", 0],
  ["UI tokens do not mean LLM tokens", "LLM tokens", "resume-09", 0],
  ["relational work does not mean financial modeling", "financial modeling", "jd-03", 0],
  ["API logs do not mean paper logs", "paper logs", "resume-07", 0],
  ["unit tests do not mean end-to-end tests", "end-to-end tests", "resume-05", 1],
  ["asynchronous behavior does not mean unit tests", "unit tests", "jd-05", 1],
  ["statistical t-test does not mean unit tests", "unit tests", "resume-06", 0],
]) test(`context control: ${name}`, () => failure(b => { candidateFor(b, docId, index).skillLabels = [literal]; }, "unknown-term"));

for (const [name, mutate, code] of [
  ["illegal skill", b => { b.courseObservations[0].topic.skillIds = ["invented-skill"]; }, "illegal-course-id"],
  ["wrong basis", b => { b.courseObservations[0].topic.basis = "contextual"; }, "course-basis"],
  ["partial claimed full", b => { b.courseObservations.find(o => o.taskCoverage.status === "partial").taskCoverage.status = "full"; }, "task-coverage"],
  ["none claimed full", b => { b.courseObservations.find(o => o.taskCoverage.status === "none").taskCoverage.status = "full"; }, "task-coverage"],
  ["ambiguous collapsed", b => { const o = b.courseObservations.find(o => o.topic.status === "ambiguous"); o.topic.status = "mapped"; o.topic.skillIds = o.topic.skillIds.slice(0, 1); }, "course-topic"],
  ["missing observation", b => { b.courseObservations.pop(); }, "missing-course-observation"],
  ["duplicate observation", b => { b.courseObservations.push(structuredClone(b.courseObservations[0])); }, "duplicate-course-observation"],
  ["unknown candidate", b => { b.courseObservations[0].candidateId = "unknown-candidate"; }, "unknown-course-candidate"],
  ["all uncovered", b => { for (const o of b.courseObservations) { o.topic = { status: "uncovered", skillIds: [], basis: "none" }; o.taskCoverage.status = "none"; } }, "course-topic"],
  ["all cleared", b => { b.courseObservations = []; }, "missing-course-observation"],
]) test(`course rejects ${name}`, () => failure(mutate, code, "course"));

test("course sets are unordered; multiple mapped topics remain valid", () => {
  const b = constructedControl(); for (const o of b.courseObservations) o.topic.skillIds.reverse();
  assert.equal(evaluate(b).passed, true);
});

test("source locations use UTF-16 boundaries and reject ambiguous or broken segments", () => {
  const raw = { text: "😀SQL\nother", segments: [{ id: "segment-1", start: 0, end: 5, text: "😀SQL" }] };
  assert.deepEqual(locateFrozenSpan(raw, { segmentId: "segment-1", quote: "SQL" }), { startOffset: 2, endOffset: 5, segmentStartOffset: 2, segmentEndOffset: 5 });
  assert.equal(locateFrozenSpan(raw, { segmentId: "segment-1", quote: "\ude00" }), null);
  const repeated = { text: "SQL SQL", segments: [{ id: "segment-1", start: 0, end: 7, text: "SQL SQL" }] };
  assert.equal(locateFrozenSpan(repeated, { segmentId: "segment-1", quote: "SQL" }), null);
  const acrossSegments = { ...raw, text: "😀SQL\nSQL", segments: [...raw.segments, { id: "segment-2", start: 6, end: 9, text: "SQL" }] };
  assert.equal(locateFrozenSpan(acrossSegments, { segmentId: "segment-1", quote: "SQL" }), null);
  for (const mutate of [r => r.segments.push({ ...r.segments[0] }), r => { r.segments[0].start = 1; }, r => { r.segments[0].text = "wrong"; }]) {
    const broken = structuredClone(raw); mutate(broken); assert.equal(locateFrozenSpan(broken, { segmentId: "segment-1", quote: "SQL" }), null);
  }
});

test("every source fact remains in the denominator when the batch has no candidates", () => {
  const batch = constructedControl(); for (const document of batch.documents) document.candidates = [];
  const result = evaluate(batch);
  assert.equal(result.passed, false); assert.equal(result.source.documents.length, 30);
  assert.equal(result.source.documents.reduce((total, document) => total + document.metrics.legacyRecall.denominator, 0), 84);
  assert.equal(result.source.documents.reduce((total, document) => total + document.metrics.additionalRecall.denominator, 0), 2);
  assert.equal(result.source.documents.reduce((total, document) => total + document.metrics.jdClassification.denominator, 0), 32);
  assert.equal(result.source.documents.reduce((total, document) => total + document.metrics.legacyRecall.numerator, 0), 0);
});

test("the shared learning facet rejects a duplicated candidate and uses one course observation", () => {
  const batch = constructedControl();
  const candidate = candidateFor(batch, "resume-01", 2);
  assert.equal(batch.courseObservations.filter(o => o.documentId === "resume-01" && o.candidateId === candidate.id).length, 1);
  failure(b => { documentFor(b, "resume-01").candidates.push({ ...structuredClone(candidate), id: "duplicate-facet" }); }, "duplicate-fact");
});

for (const [name, mutate, code] of [
  ["unadopted goal reorders tasks", b => planningFor(b, "unadopted-learning-intent").result.state.order.reverse(), "planning-order"],
  ["replacement applies pending context early", b => { const o = planningFor(b, "replace-primary-jd-same-job"); o.result.state.selectedMaterials = o.result.state.preview.proposedContext.selectedMaterials; }, "planning-selected-materials"],
  ["replacement applies order early", b => { const o = planningFor(b, "replace-primary-jd-same-job"); o.result.state.order = o.result.state.preview.proposedOrder; }, "planning-order"],
  ["accepted preview fails to adopt proposed context", b => { const o = planningFor(b, "accept-current-primary-jd-preview"); o.result.state.mainJdRequirements = [{ documentId: "jd-a", skillId: "sql", level: "must" }]; }, "planning-authority"],
  ["preview context digest altered", b => { planningFor(b, "accept-current-primary-jd-preview").result.state.preview.materialContextSha256 = "f".repeat(64); }, "planning-preview-context"],
  ["course prerequisite removed", b => { planningFor(b, "fact-confirm-only").result.state.tasks.find(t => t.id === "todo-react").dependencies = ["done-ts"]; }, "planning-course-prerequisite"],
  ["dependency order reversed", b => { planningFor(b, "fact-confirm-only").result.state.order = ["todo-sql-review", "todo-sql", "todo-react"]; }, "planning-topology"],
  ["confirmation silently adopts self level", b => { planningFor(b, "fact-confirm-only").result.state.selfAssessments[0].level = "guided"; }, "planning-self-assessments"],
  ["unselected self level changes", b => { planningFor(b, "explicit-guided-self-adopt").result.state.selfAssessments[1].level = "independent"; }, "planning-self-assessments"],
  ["unknown task", b => { planningFor(b, "fact-confirm-only").result.state.tasks[0].unitId = "imaginary-unit"; }, "illegal-plan-unit"],
  ["deleted task", b => planningFor(b, "fact-confirm-only").result.state.tasks.pop(), "planning-tasks"],
  ["altered content", b => { planningFor(b, "fact-confirm-only").result.state.tasks[0].content = "shortcut"; }, "planning-tasks"],
  ["altered dependency", b => { planningFor(b, "fact-confirm-only").result.state.tasks[2].dependencies = []; }, "planning-tasks"],
  ["altered minutes", b => { planningFor(b, "fact-confirm-only").result.state.tasks[0].estimatedMinutes = 0; }, "planning-tasks"],
  ["altered completion", b => { planningFor(b, "fact-confirm-only").result.state.completedRecords[0].spentMinutes = 1; }, "planning-completed-records"],
  ["altered Proof", b => { planningFor(b, "fact-confirm-only").result.state.proofs[0].artifact = "forged"; }, "planning-proofs"],
  ["altered audit", b => planningFor(b, "fact-confirm-only").result.state.audit.pop(), "planning-audit"],
  ["over budget", b => { planningFor(b, "fact-confirm-only").result.state.schedule = [{ week: 1, taskIds: ["todo-sql", "todo-sql-review", "todo-react"] }]; }, "planning-budget"],
  ["missing scenario", b => b.planObservations.pop(), "missing-planning-case"],
  ["duplicate scenario", b => b.planObservations.push(structuredClone(b.planObservations[0])), "duplicate-planning-case"],
  ["wrong immutable input", b => { b.planObservations[0].inputSha256 = "0".repeat(64); }, "planning-input-digest"],
  ["stale preview accepted", b => { planningFor(b, "stale-preview-reject").result.applyState = "accepted"; }, "planning-apply-state"],
  ["stale preview mutated state", b => { planningFor(b, "stale-preview-reject").result.state.revision++; }, "planning-revision"],
  ["revoked focus leaked", b => { planningFor(b, "withdraw-focus").result.state.focus.push({ documentId: "supplement-a", literal: "SQL 空值处理", skillIds: ["sql"] }); }, "planning-focus"],
  ["deleted material leaked", b => { planningFor(b, "delete-material").result.state.selectedMaterials.push({ documentId: "supplement-a", versionId: "supplement-a-v1", role: "supplement", jobId: "engineer" }); }, "planning-selected-materials"],
  ["excluded term leaked", b => { planningFor(b, "exclude-individual-term").result.state.focus.push({ documentId: "supplement-a", literal: "SQL 空值处理", skillIds: ["sql"] }); }, "planning-focus"],
  ["secondary must acquired authority", b => { planningFor(b, "secondary-jd-cannot-add-must").result.state.mainJdRequirements.push({ documentId: "jd-b", skillId: "react", level: "must" }); }, "planning-authority"],
  ["unresolved conflict resolved", b => { planningFor(b, "unresolved-conflict-not-hard-resolved").result.state.conflicts[0].status = "resolved"; }, "planning-conflicts"],
]) test(`planning rejects ${name}`, () => failure(mutate, code, "planning"));

for (const [name, mutate] of [
  ["unknown top key", b => { b.passed = true; }],
  ["legacy field id", b => { candidateFor(b, "resume-01").legacyId = "resume-01-field-1"; }],
  ["duplicate candidate id", b => { candidateFor(b, "resume-01", 1).id = candidateFor(b, "resume-01").id; }],
  ["duplicate document id", b => b.documents.push(structuredClone(b.documents[0]))],
  ["non-JSON bigint", b => { b.provenance.description = 1n; }],
  ["NaN", b => { b.planObservations[0].result.state.revision = NaN; }],
  ["Infinity", b => { b.planObservations[0].result.state.revision = Infinity; }],
  ["cyclic input", b => { b.loop = b; }],
  ["Date object", b => { b.provenance.description = new Date(); }],
  ["overlong text", b => { candidateFor(b, "resume-01").text = "x".repeat(1001); }],
  ["overlong label", b => { candidateFor(b, "resume-01").skillLabels = ["x".repeat(101)]; }],
  ["nine labels", b => { candidateFor(b, "resume-01").skillLabels = Array.from({ length: 9 }, (_, i) => `word-${i}`); }],
  ["101 candidates", b => { documentFor(b, "resume-01").candidates = Array.from({ length: 101 }, (_, i) => ({ ...candidateFor(b, "resume-01"), id: `candidate-${i}` })); }],
  ["101 reviews", b => { documentFor(b, "resume-01").reviewPoints = Array.from({ length: 101 }, () => structuredClone(b.documents[0].reviewPoints[0])); }],
  ["independent hint", b => { candidateFor(b, "resume-01").selfLevelHint = "independent"; }],
  ["duplicate label", b => { candidateFor(b, "resume-01").skillLabels = ["SQL", "SQL"]; }],
  ["overlong identifier", b => { candidateFor(b, "resume-01").id = "a".repeat(257); }],
  ["overlong quote", b => { candidateFor(b, "resume-01").source.quote = "x".repeat(1001); }],
  ["document JSON bytes", b => { const original = structuredClone(candidateFor(b, "resume-01")); documentFor(b, "resume-01").candidates = Array.from({ length: 100 }, (_, i) => ({ ...original, id: `candidate-${i}`, text: "字".repeat(1000), source: { ...original.source, quote: "字".repeat(1000) } })); }],
  ["accessor property", b => Object.defineProperty(b.provenance, "description", { enumerable: true, get() { throw new Error("must never execute"); } })],
  ["sparse array", b => { b.documents = new Array(30); }],
  ["unknown concrete state key", b => { b.planObservations[0].result.state.protectedDataUnchanged = true; }],
]) test(`strict input rejects ${name} without throwing`, () => {
  const result = change(mutate); assert.equal(result.passed, false); assert.equal(result.status, "error"); assert.ok(result.errors.length);
});

test("unverified or replaced reference objects cannot manufacture a pass", () => {
  for (const fake of [{}, structuredClone(references)]) assert.equal(evaluateCandidateBatch(constructedControl(), fake).status, "error");
});

test("planning self-assessment accepts unseen and rejects verified separately from Proof", () => {
  const batch = constructedControl();
  batch.planObservations[0].result.state.selfAssessments[0].level = "unseen";
  assert.deepEqual(validateCandidateInput(batch), [], "unseen is a legal wire level even when the fixed case expects conceptual");
  assert.equal(evaluate(batch).planning.status, "failed", "legal input does not override a fixed case expectation");
  batch.planObservations[0].result.state.selfAssessments[0].level = "verified";
  assert.ok(validateCandidateInput(batch).some(error => error.code === "input-enum" && error.path === "/planObservations/0/result/state/selfAssessments/0/level"));
  batch.planObservations[0].result.state.selfAssessments[0].level = "conceptual";
  candidateFor(batch, "resume-01").selfLevelHint = "verified";
  assert.ok(validateCandidateInput(batch).some(error => error.code === "input-enum" && error.path === "/documents/0/candidates/0/selfLevelHint"));
});

test("programmatic input rejects transparent outer proxies before inspection", () => {
  const batch = constructedControl(); assert.deepEqual(validateCandidateInput(batch), []);
  const report = evaluate(new Proxy(batch, {}));
  assert.equal(report.status, "error");
  assert.deepEqual(report.errors, [{ code: "input-non-json", path: "/" }]);
});

test("programmatic input rejects nested proxies without executing any trap", () => {
  const batch = constructedControl(); let trapCalls = 0;
  batch.documents[0].candidates[0].source = new Proxy(batch.documents[0].candidates[0].source, {
    getPrototypeOf(target) { trapCalls++; return Reflect.getPrototypeOf(target); },
    ownKeys(target) { trapCalls++; return Reflect.ownKeys(target); },
    getOwnPropertyDescriptor(target, key) { trapCalls++; return Reflect.getOwnPropertyDescriptor(target, key); },
    get(target, key, receiver) { trapCalls++; return Reflect.get(target, key, receiver); },
  });
  const report = evaluate(batch);
  assert.equal(trapCalls, 0, "proxy traps must never run during input inspection");
  assert.equal(report.status, "error");
  assert.deepEqual(report.errors, [{ code: "input-non-json", path: "/" }]);
});

test("programmatic input safely rejects hostile and revoked proxies", () => {
  let trapCalls = 0;
  const hostile = new Proxy(constructedControl(), { getPrototypeOf() { trapCalls++; throw null; } });
  const revoked = Proxy.revocable(constructedControl(), {}); revoked.revoke();
  for (const input of [hostile, revoked.proxy]) {
    let report; assert.doesNotThrow(() => { report = evaluate(input); });
    assert.equal(report.status, "error"); assert.deepEqual(report.errors, [{ code: "input-non-json", path: "/" }]);
  }
  assert.equal(trapCalls, 0);
});

for (const [name, digest] of [["array", ["a".repeat(64)]], ["non-coercible object", { toString: null, valueOf: null }]]) {
  const expected = { code: "input-shape", path: "/planObservations/0/result/state/proofs/0/digest" };
  test(`Proof digest ${name} is a strict API input error without coercion`, () => {
    const batch = constructedControl(); batch.planObservations[0].result.state.proofs[0].digest = digest;
    let report;
    assert.doesNotThrow(() => { report = evaluate(batch); });
    assert.equal(report.status, "error");
    assert.ok(report.errors.some(error => error.code === expected.code && error.path === expected.path));
  });
  test(`Proof digest ${name} is a strict CLI input error without coercion`, async () => {
    const batch = constructedControl(); batch.planObservations[0].result.state.proofs[0].digest = digest;
    const dir = await mkdtemp(path.join(tmpdir(), "candidate-proof-digest-"));
    try {
      const file = path.join(dir, "candidate.json"); await writeFile(file, JSON.stringify(batch));
      const cli = path.join(root, "docs/verification/materials-quality-v2/evaluate-candidates.mjs");
      const run = spawnSync(process.execPath, [cli, file], { cwd: root, encoding: "utf8", windowsHide: true });
      assert.equal(run.status, 2); assert.equal(run.stderr, "");
      const cliReport = JSON.parse(run.stdout); assert.equal(cliReport.status, "error");
      assert.ok(cliReport.errors.some(error => error.code === expected.code && error.path === expected.path));
    } finally { await removeTemporary(dir); }
  });
}

test("raw input CLI reports JSON and nonzero failed/incomplete/error states", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "candidate-cli-"));
  try {
    const file = path.join(dir, "candidate.json"); const cli = path.join(root, "docs/verification/materials-quality-v2/evaluate-candidates.mjs");
    const failed = constructedControl(); candidateFor(failed, "resume-01").text = "An invented personal claim";
    for (const [batch, status, exit] of [[constructedControl(), "passed", 0], [failed, "failed", 1], [{ ...constructedControl(), courseObservations: undefined }, "incomplete", 1], [{}, "error", 2]]) {
      await writeFile(file, JSON.stringify(batch));
      const run = spawnSync(process.execPath, [cli, file], { cwd: root, encoding: "utf8", windowsHide: true });
      assert.equal(run.status, exit, run.stderr); assert.equal(JSON.parse(run.stdout).status, status);
    }
    for (const bytes of ["{not json", "x".repeat(8 * 1024 * 1024 + 1), Buffer.from([0xc3, 0x28])]) {
      await writeFile(file, bytes); const run = spawnSync(process.execPath, [cli, file], { cwd: root, encoding: "utf8", windowsHide: true });
      assert.equal(run.status, 2); assert.equal(JSON.parse(run.stdout).status, "error"); assert.equal(run.stderr, "");
    }
  } finally { await removeTemporary(dir); }
});

test("changed references or a partial current course registry stop loading", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "candidate-reference-"));
  let copiedEsbuild;
  try {
    // Copy only the input closure; runtime dependencies are never executed before hashes pass.
    const manifest = JSON.parse(await readFile(new URL("course-reference.snapshot.json", import.meta.url), "utf8"));
    const files = new Set([...sourceControlReference.inputHashes, ...sourceControlReference.basis, ...manifest.dependencies].map(file => file.path));
    for (const file of Object.keys(REFERENCE_HASHES)) files.add(`docs/verification/materials-quality-v2/${file}`);
    for (const file of files) { await mkdir(path.dirname(path.join(dir, file)), { recursive: true }); await cp(path.join(root, file), path.join(dir, file)); }
    for (const name of ["esbuild", "typescript", "zod", `@esbuild/${process.platform}-${process.arch}`]) await cp(path.join(root, "node_modules", name), path.join(dir, "node_modules", name), { recursive: true });
    copiedEsbuild = await import(pathToFileURL(path.join(dir, "node_modules/esbuild/lib/main.js")).href);
    assert.equal((await loadReviewedReferences(dir)).source.documents.length, 30, "copied trust root must load before mutation");
    const courseFile = path.join(dir, "app/data/flagship-unit-registry.ts");
    const original = await readFile(courseFile); await writeFile(courseFile, "export const flagshipUnitRegistry = { tracks: [] };\n");
    await assert.rejects(loadReviewedReferences(dir), /reference-integrity/u); await writeFile(courseFile, original);
    for (const file of ["docs/verification/materials-quality-v2/course-annotations.draft.json", "docs/verification/materials-quality-v2/course-reference.snapshot.json", "docs/verification/materials-quality-v2/planning-reference-cases.json", "tests/fixtures/documents/quality-corpus.json", "tests/fixtures/documents/supplement-quality-corpus.json", "tests/helpers/document-quality-evaluation.ts", sourceControlReference.basis[0].path]) {
      const target = path.join(dir, file); const bytes = await readFile(target); await writeFile(target, Buffer.concat([bytes, Buffer.from("\n")]));
      await assert.rejects(loadReviewedReferences(dir), /reference-integrity/u, file); await writeFile(target, bytes);
    }
    const sourceFile = path.join(dir, "docs/verification/materials-quality-v2/annotations.draft.json");
    const annotation = JSON.parse(await readFile(sourceFile, "utf8")); annotation.documents.pop(); await writeFile(sourceFile, JSON.stringify(annotation));
    await assert.rejects(loadReviewedReferences(dir), /reference-integrity/u);
  } finally { copiedEsbuild?.stop(); await removeTemporary(dir); }
});
