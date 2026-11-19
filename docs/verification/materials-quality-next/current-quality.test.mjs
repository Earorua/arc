import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as current from "./current-references.mjs";
import * as captures from "./current-captures.ts";
import * as adapter from "./current-adapter.ts";
import { createQualificationOutputWriter, emptyQualificationChat } from "../../../scripts/materials-qualification-capture.ts";
import { KIMI_SOURCE_MENTIONS_POLICY_ID } from "../../../app/server/documents/policy.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const sha = value => createHash("sha256").update(value).digest("hex");
const native = "docs/verification/materials-native-acceptance";
const readJson = async relative => JSON.parse(await readFile(path.join(root, relative), "utf8"));
const corpora = [...(await readJson("tests/fixtures/documents/quality-corpus.json")).documents,
  ...(await readJson("tests/fixtures/documents/supplement-quality-corpus.json")).documents];
const raw = id => corpora.find(doc => doc.id === id);
const identity = doc => ({ documentId: doc.id, documentVersionId: doc.documentVersionId, textVersionId: doc.textVersionId });
const item = (doc, index, fields = {}) => ({ id: `authored-${doc.id}-${index}`, kind: "experience", text: doc.segments[index].text,
  source: { segmentId: doc.segments[index].id, quote: doc.segments[index].text }, skillLabels: [], selfLevelHint: null, requirementLevel: null, ...fields });
const extraction = items => ({ schemaVersion: "2026.11.1", items, reviewPoints: [] });
const authored = (doc, candidate) => ({ ...identity(doc), sourceTextSha256: sha(doc.text), providerPolicyId: KIMI_SOURCE_MENTIONS_POLICY_ID,
  decodedCandidate: candidate, rawAssistant: { assistantContent: JSON.stringify(candidate), finishEvidence: "captured", finishReason: "stop" },
  provenance: { kind: "constructed-control", actualModelOutput: false }, accounting: { state: "settled", receiptVerified: false },
  captureIdentity: { collection: "authored-control" } });
let references;
async function refs() { assert.equal(typeof current.loadCurrentReviewedReferences, "function"); return references ??= await current.loadCurrentReviewedReferences(); }
async function temporary() { return mkdtemp(path.join(tmpdir(), "arc-current-quality-")); }
async function removeTemporary(dir) {
  const target = path.resolve(dir), parent = path.resolve(tmpdir());
  assert.equal(path.dirname(target), parent); assert.ok(path.basename(target).startsWith("arc-current-quality-"));
  await rm(target, { recursive: true, force: true });
}

test("current loader checks all frozen assets, integrated review and the exact accepted native delta", async () => {
  const value = await refs();
  assert.deepEqual(value.integratedCourse, { valid: true, frozenAssetsChecked: 26, frozenInputsChecked: 5, dependencies: 85, teachingUnits: 48 });
  assert.equal(value.nativeBehaviorReuse.status, "accepted-source-delta-reuse");
  assert.deepEqual(value.nativeBehaviorReuse.sourceClosure, { files: 146, unchanged: 143, reviewedChanges: 3 });
  assert.equal(value.nativeBehaviorReuse.newExecution, false);
  assert.equal(current.isCurrentReviewedReferences(structuredClone(value)), false);
  assert.equal(Object.isFrozen(value), true);
});

test("actual file drift in frozen tools, review memos, current mapping and native closure is rejected", async () => {
  const value = await refs(), dir = await temporary();
  try {
    for (const file of value.integrityFiles) {
      const destination = path.join(dir, file.path); await mkdir(path.dirname(destination), { recursive: true });
      await cp(path.join(root, file.path), destination);
    }
    for (const relative of ["docs/verification/materials-quality-v2/candidate-course.mjs", `${native}/integrated-course-quality-review.md`,
      "app/lib/materials/skill-mapper.ts", "app/server/documents/service.ts"]) {
      const target = path.join(dir, relative), bytes = await readFile(target);
      await writeFile(target, Buffer.concat([bytes, Buffer.from("\n// drift\n")]));
      await assert.rejects(current.loadCurrentReviewedReferences(dir), /current-reference-integrity|integrated-course-binding/u);
      await writeFile(target, bytes);
    }
  } finally { await removeTemporary(dir); }
});

test("24-file reader binds the original writer bytes and retains a null decoded candidate and raw finish", async () => {
  assert.equal(typeof captures.readQualificationCaptures, "function");
  const dir = await temporary(), doc = raw("resume-01");
  try {
    const expected = { runId: "authored-reader-run", authorizationId: "authored-reader-grant", mode: "offline-test",
      candidateCommit: "a".repeat(40), configurationSha256: "b".repeat(64), providerPolicyId: KIMI_SOURCE_MENTIONS_POLICY_ID,
      endpoint: "https://example.invalid/chat/completions", model: "authored-model", receiptRoute: { providerName: "Authored", endpointId: "authored", generationModel: "authored-model" },
      requestBodies: corpora.slice(0, 24).map(value => ({ documentId: value.id, requestBodySha256: "c".repeat(64) })) };
    const writer = createQualificationOutputWriter(dir, { runId: expected.runId, authorizationId: expected.authorizationId, mode: expected.mode,
      candidateCommit: expected.candidateCommit, configurationSha256: expected.configurationSha256 });
    expected.bindingSha256 = writer.bindingSha256;
    const audit = { status: "verified", actualModel: "authored-model", actualProvider: "Authored", actualEndpointId: "authored",
      metadataInputTokens: 1, metadataOutputTokens: 1, metadataMicroUsd: 12, metadataAttempts: 1, extractionRead: "invalid-json",
      sentAt: "2026-11-19T08:00:00Z", returnedAt: "2026-11-19T08:00:01Z", checkedAt: "2026-11-19T08:00:02Z" };
    const captured = { schemaVersion: "materials-qualification-output-v1", runId: expected.runId, authorizationId: expected.authorizationId, mode: expected.mode,
      ...identity(doc), sourceTextSha256: sha(doc.text), providerPolicyId: expected.providerPolicyId, endpoint: expected.endpoint, model: expected.model,
      requestBodySha256: "c".repeat(64), chat: { ...emptyQualificationChat(), status: "captured", httpStatus: 200, assistantContent: " \n{broken", finishReason: "length" },
      outcome: { kind: "received", candidate: null, receiptId: "authored-receipt", actualMicroUsd: 12, inputTokens: 1, outputTokens: 1, audit },
      accounting: { state: "settled", reservedMicroUsd: 72960, actualMicroUsd: 12 } };
    await writer.capture(captured);
    const result = await captures.readQualificationCaptures(writer.directory, expected);
    assert.equal(result.outputs.length, 1); assert.equal(result.missingDocumentIds.length, 23);
    assert.deepEqual(result.outputs[0].originalCapture, captured);
    assert.equal(result.outputs[0].decodedCandidate, null);
    assert.equal(result.outputs[0].rawAssistant.finishReason, "length");
    assert.equal(result.outputs[0].accounting.receiptVerified, true);
    assert.equal(result.complete, false);
    await assert.rejects(captures.readQualificationCaptures(writer.directory, { ...expected, configurationSha256: "d".repeat(64) }), /capture-integrity/u);
    const file = path.join(writer.directory, `${doc.id}.json`), original = await readFile(file, "utf8"), envelope = JSON.parse(original);
    envelope.capture.outcome.candidate = extraction([]);
    await writeFile(file, JSON.stringify(envelope));
    await assert.rejects(captures.readQualificationCaptures(writer.directory, expected), /capture-integrity/u);
  } finally { await removeTemporary(dir); }
});

test("source input keeps decoded labels and hints while projection removals remain explicit failures", async () => {
  assert.equal(typeof adapter.observeCapturedDocument, "function");
  const doc = raw("resume-01"), candidate = extraction([item(doc, 0, { skillLabels: ["SQL", "invented-topic"], selfLevelHint: "guided" })]);
  const observed = adapter.observeCapturedDocument(authored(doc, candidate), await refs());
  assert.deepEqual(observed.sourceInput.candidates, candidate.items);
  assert.deepEqual(observed.decodedCandidate, candidate);
  assert.deepEqual(observed.projection.items[0].skillLabels, ["SQL"]);
  assert.deepEqual(observed.removedTerms, [{ candidateId: candidate.items[0].id, literal: "invented-topic" }]);
  assert.ok(observed.issues.some(issue => issue.code === "projected-term-removed"));
  assert.equal(observed.views.baseline.observations.some(row => row.literal === "invented-topic"), false);
});

test("no-choice and simulated eligible choices stay separate; no-label facts use null literals", async () => {
  assert.equal(typeof adapter.observeCapturedDocument, "function");
  const doc = raw("resume-01"), candidate = extraction([item(doc, 2, { kind: "constraint", skillLabels: ["数据分析基础"] })]);
  const observed = adapter.observeCapturedDocument(authored(doc, candidate), await refs());
  assert.deepEqual(observed.views.baseline.learningIntentItemIds, []);
  assert.equal(observed.views.baseline.observations[0].topic.status, "non-learning");
  assert.deepEqual(observed.views.simulatedExplicitChoice.learningIntentItemIds, [candidate.items[0].id]);
  assert.equal(observed.views.simulatedExplicitChoice.userConfirmationPerformed, false);
  assert.equal(observed.views.simulatedExplicitChoice.planWritesPerformed, false);
  const empty = raw("supplement-03"), quote = "未来两周，我每周最多能练习 90 分钟。";
  // Supplements have one whole-document segment: author a complete sentence, not that segment's header and both facts.
  const fact = extraction([item(empty, 0, { kind: "constraint", text: quote, source: { segmentId: "segment-1", quote } })]);
  const noLabels = adapter.observeCapturedDocument(authored(empty, fact), await refs());
  assert.deepEqual(noLabels.views.baseline.mappings, []);
  assert.deepEqual(noLabels.views.baseline.observations[0], { documentId: empty.id, candidateId: fact.items[0].id, literal: null,
    topic: { status: "non-learning", skillIds: [], basis: "not-applicable" }, taskCoverage: { status: "not-applicable" } });
});

test("null, malformed and missing extraction fields cannot become valid empty source documents", async () => {
  assert.equal(typeof adapter.observeCapturedDocument, "function");
  const doc = raw("resume-04");
  for (const candidate of [null, { schemaVersion: "2026.11.1", items: [] }, { schemaVersion: "wrong", items: [], reviewPoints: [] },
    extraction([{ ...item(doc, 1), skillLabels: null }])]) {
    const observed = adapter.observeCapturedDocument(authored(doc, candidate), await refs());
    assert.equal(observed.sourceInput, null); assert.ok(observed.issues.length > 0);
    assert.deepEqual(observed.decodedCandidate, candidate); assert.equal(observed.views.baseline.observations.length, 0);
  }
  const report = await adapter.evaluateCurrentQuality({ controls: [authored(doc, null)] }, await refs());
  assert.equal(report.course.status, "not-evaluated");
  assert.equal(report.source.status, "failed");
  assert.equal(report.componentObservations[0].decodedCandidateState, "null");
});

test("the authored SQL joins probe exposes the real reference mismatch without model or plan claims", async () => {
  assert.equal(typeof adapter.evaluateCurrentQuality, "function");
  const doc = raw("resume-04"), candidate = extraction([item(doc, 1, { skillLabels: ["SQL joins"] })]);
  const result = await adapter.evaluateCurrentQuality({ controls: [authored(doc, candidate)] }, await refs());
  assert.equal(result.provenance.kind, "constructed-control");
  assert.equal(result.gateApproved, false); assert.equal(result.actualModelQualityEvaluated, false);
  assert.equal(result.actualProductIntegrationVerified, false);
  assert.equal(result.captureAccounting.status, "incomplete");
  assert.equal(result.course.view, "simulated-explicit-choice");
  assert.ok(result.course.errors.some(error => error.documentId === "resume-04" && error.literal === "SQL joins" && error.code === "course-topic"));
  assert.ok(result.course.errors.some(error => error.documentId === "resume-04" && error.literal === "SQL joins" && error.code === "task-coverage"));
  assert.equal(Object.hasOwn(result, "planObservations"), false);
  assert.equal(result.nativeBehaviorReuse.newExecution, false);
  await assert.rejects(adapter.evaluateCurrentQuality({ controls: [] }, structuredClone(await refs())), /current-reference-unverified/u);
});

test("six-document adapter reopens only the originally pinned ledger and keeps its missing telemetry explicit", async () => {
  assert.equal(typeof captures.readSupplementCaptures, "function");
  const { inspectSupplementSettings } = await import("../../../scripts/collect-materials-supplements.ts");
  const ledger = await import("../../../scripts/materials-supplement-ledger.ts");
  const dir = await temporary();
  try {
    const endpoint = "https://openrouter.ai/api/v1/chat/completions";
    const routingPolicy = { policyVersion: "2026.11.3", providerOrder: ["moonshotai/mxfp4"], allowFallback: false, dataPolicy: "zdr-only" };
    const config = { provider: "OpenRouter / Moonshot AI", model: "moonshotai/kimi-k3.1-pro", endpoint, providerPolicyId: KIMI_SOURCE_MENTIONS_POLICY_ID,
      routingPolicy, priceVersion: "2026.11.3", maxInputTokens: 16000, maxOutputTokens: 4096, maxJobMicroUsd: 75000,
      userDailyMicroUsd: 450000, globalDailyMicroUsd: 450000, httpTimeoutMs: 5000 };
    const qualification = { qualified: true, endpoint, model: config.model, providerPolicyId: config.providerPolicyId, priceVersion: config.priceVersion, routingPolicy,
      receiptRoute: { providerName: "Moonshot AI", endpointId: "a3fafaac-f097-4ef1-86b3-842854dad5c6", generationModel: "moonshotai/kimi-k3.1-pro-20261023" },
      inputMicroUsdPerMillionTokens: 2000000, outputMicroUsdPerMillionTokens: 10000000, inputTokenBound: "utf8-bytes-plus-4096" };
    const scope = await inspectSupplementSettings({ config, qualification });
    const at = "2026-11-19T08:00:00Z", ledgerSha256 = ledger.registerSupplementLedger(dir);
    const issued = { config, qualification, authorization: { purpose: ledger.supplementPurpose, id: "authored-supplement-grant", issuedBy: "authored-software-test",
      runId: "authored-supplement-run", candidateCommit: "a".repeat(40), configurationSha256: scope.configurationSha256,
      credentialSha256: sha(ledger.supplementFixtureToken), ledgerSha256, corpusSha256: scope.corpusSha256, outputSchemaVersion: "2026.11.1",
      documents: scope.documents, approvedAt: at, expiresAt: "2026-11-19T10:00:00Z", maxRequests: 6, perRequestMicroUsd: 75000,
      totalBudgetMicroUsd: 450000, maxMetadataReadsPerDocument: 3 } };
    const issuance = JSON.stringify(issued), issuanceSha256 = sha(issuance), binding = ledger.readPinnedSupplementIssuance(issuance, issuanceSha256, "offline-test").binding;
    const db = ledger.openSupplementLedger(dir, issued.authorization.runId, ledgerSha256), doc = scope.documents[0];
    const audit = { status: "verified", actualModel: qualification.receiptRoute.generationModel, actualProvider: "Moonshot AI",
      actualEndpointId: qualification.receiptRoute.endpointId, metadataInputTokens: 1, metadataOutputTokens: 1, metadataMicroUsd: 12,
      metadataAttempts: 1, extractionRead: "invalid-json", sentAt: at, returnedAt: at, checkedAt: at };
    try {
      db.start(binding, at); db.reserve(doc, 72960, at); db.markSending(doc.documentId, at);
      const rawDigest = db.capture(doc.documentId, " \n{broken");
      assert.equal(db.claim(doc.documentId, "authored-supplement-receipt", { actualMicroUsd: 12, inputTokens: 1, outputTokens: 1, sentAt: at, returnedAt: at }), true);
      db.finishAttempt(doc.documentId, "settled", 12, audit, null, { receiptId: "authored-supplement-receipt", rawDigest, extractionJson: "null" });
      db.finish({ status: "quality-failed", mode: "offline-test" }, binding);
    } finally { db.close(); }
    const result = await captures.readSupplementCaptures({ issuance, issuanceSha256, directory: dir, mode: "offline-test" });
    assert.equal(result.outputs.length, 1); assert.equal(result.missingDocumentIds.length, 5); assert.equal(result.complete, false);
    assert.equal(result.outputs[0].decodedCandidate, null); assert.equal(result.outputs[0].rawAssistant.assistantContent, " \n{broken");
    assert.equal(result.outputs[0].rawAssistant.finishEvidence, "not-recorded");
    assert.equal(result.outputs[0].captureIdentity.requestBodyEvidence, "not-recorded");
    assert.deepEqual(result.outputs[0].accounting.audit, audit);
    await assert.rejects(captures.readSupplementCaptures({ issuance: issuance + " ", issuanceSha256, directory: dir, mode: "offline-test" }), /supplement-authorization-invalid/u);
    const first = raw("resume-01"), expected = { runId: "authored-cross-batch-run", authorizationId: "authored-cross-batch-grant", mode: "offline-test",
      candidateCommit: "a".repeat(40), configurationSha256: "b".repeat(64), providerPolicyId: config.providerPolicyId,
      endpoint, model: config.model, receiptRoute: qualification.receiptRoute,
      requestBodies: corpora.slice(0, 24).map(value => ({ documentId: value.id, requestBodySha256: "c".repeat(64) })) };
    const writer = createQualificationOutputWriter(path.join(dir, "qualification"), { runId: expected.runId, authorizationId: expected.authorizationId,
      mode: expected.mode, candidateCommit: expected.candidateCommit, configurationSha256: expected.configurationSha256 });
    expected.bindingSha256 = writer.bindingSha256;
    await writer.capture({ schemaVersion: "materials-qualification-output-v1", runId: expected.runId, authorizationId: expected.authorizationId, mode: expected.mode,
      ...identity(first), sourceTextSha256: sha(first.text), providerPolicyId: config.providerPolicyId, endpoint, model: config.model, requestBodySha256: "c".repeat(64),
      chat: { ...emptyQualificationChat(), status: "captured", httpStatus: 200, assistantContent: "{broken" },
      outcome: { kind: "received", candidate: null, receiptId: "authored-supplement-receipt", actualMicroUsd: 12, inputTokens: 1, outputTokens: 1, audit },
      accounting: { state: "settled", actualMicroUsd: 12, reservedMicroUsd: 72960 } });
    const qualificationBatch = await captures.readQualificationCaptures(writer.directory, expected);
    await assert.rejects(adapter.evaluateCurrentQuality({ qualification: qualificationBatch, supplement: result }, await refs()), /duplicate-receipt/u);
  } finally { await removeTemporary(dir); }
});
