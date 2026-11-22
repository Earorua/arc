// node --import tsx docs/verification/materials-quality-next/replay-modal-components.mjs [new-summary-name.json]
// Reuse the November 22 receipts. Optional summaries contain identifiers and counts only.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual as equal } from "node:util";

const root = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const privateRoot = path.join(homedir(), ".arc-materials/gate-1b/materials-b2");
const packet = path.join(privateRoot, "quality-approvals/current/kimi-modal-quality-20261122-r1");
const preflight = path.join(privateRoot, "quality-preflight/20261122");
const verification = "docs/verification/materials-quality-next";
const originalCommit = "0e24a3484172967974d45bc775591e500fb706a7";
const qualificationRun = "materials-b2-modal-20261122-r1";
const supplementRun = "materials-supplement-modal-20261122-r1";
const oldPolicy = "materials-openrouter-kimi-k31-pro-mxfp4-zdr-extractive-v3";
const newPolicy = "materials-openrouter-kimi-k31-pro-mxfp4-zdr-extractive-verbatim-v4";
const ownerId = "current-quality-component-observer";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const check = (condition, message) => { if (!condition) throw new Error(`Modal replay: ${message}`); };
const same = (a, b, label) => check(equal(a, b), label); // Ignores object key order, preserves array order.
const moduleAt = (directory, name) => import(pathToFileURL(path.join(directory, name)).href);
const git = args => execFileSync("git", args, { cwd: root, windowsHide: true });
const pins = {
  qualityReport: "0ba871476e8381cfe9a1786cb9deceb0d21344df11d812a728486dc1c126e3ae",
  qualificationResult: "b3bb89aa0b40973417154322d2eb79ab7d9320ce48341cc408c393a9768c8d72",
  qualificationJournal: "a1c61a7f7e5714a26d238d1b4530971d7f311cc8c0f3089d322286e231e5b097",
  supplementResult: "62240156cdb7b0c4c951071e316293e678267e82e78f3acf1cd0b1a589cd1675",
  receiptAudit: "3e0e22cd73b8e35ab984a2bd6509f0ac4adea252f3c5adcb465114f9144c5857",
  termAudit: "77c6b7583490e346fad59442dcba7d21c0cf013e03addc7aa56f62a6f6b88685",
  requestBindings: "c16349e254118befba96cb9b729acec998aceaa3d4762ac83a4ebd926a5bf981",
};

async function pinned(file, digest) {
  const bytes = await readFile(file);
  check(sha(bytes) === digest, `input digest differs: ${path.basename(file)}`);
  return bytes;
}

async function evidence() {
  const qualification = path.join(packet, "qualification", qualificationRun);
  const [report, result, supplement, audit, terms, requests] = await Promise.all([
    [path.join(packet, "current-quality-result.json"), pins.qualityReport],
    [path.join(qualification, "result.json"), pins.qualificationResult],
    [path.join(packet, "supplement-result.json"), pins.supplementResult],
    [path.join(preflight, "modal-receipt-quality-audit.json"), pins.receiptAudit],
    [path.join(preflight, "modal-failure-provenance.json"), pins.termAudit],
    [path.join(root, verification, "modal-request-bindings.json"), pins.requestBindings],
  ].map(async ([file, digest]) => JSON.parse(await pinned(file, digest))));
  await pinned(path.join(qualification, "ledger.jsonl"), pins.qualificationJournal);
  const { qualificationResult, qualificationJournal, supplementResult, qualityReport } = pins;
  same(audit.evidenceSha256, { qualificationResult, qualificationJournal, supplementResult, qualityReport }, "audit input digests differ");
  check(terms.scoreSha256 === pins.qualityReport && audit.candidate === originalCommit, "historical audit binding differs");
  check(result.requestsSent === 24 && supplement.requestsSent === 6 && audit.uniqueReceipts === 30, "original run scope differs");
  return { report, result, audit, terms, requests };
}

async function extractBaseline(directory) {
  // Keep the historical loader and the course capture's real-root dependency check intact.
  // The only source written here comes from the pinned local Git object.
  const archive = path.join(directory, "source.tar");
  git(["archive", "--format=tar", `--output=${archive}`, originalCommit, "app", "worker", "build", "scripts", "drizzle",
    "tests/fixtures", "tests/helpers", "docs/superpowers/specs", "docs/verification/materials-native-acceptance",
    "docs/verification/materials-course-relations-20261119", "docs/verification/materials-quality-v2",
    `${verification}/current-references.mjs`, `${verification}/current-captures.ts`, "package.json", "tsconfig.json"]);
  execFileSync("tar", ["-xf", archive, "-C", directory], { windowsHide: true });
  const dependencies = path.join(directory, "node_modules");
  await mkdir(dependencies);
  await cp(path.join(root, "node_modules/zod"), path.join(dependencies, "zod"), { recursive: true });
  for (const tool of ["esbuild", "typescript"]) {
    await symlink(path.join(root, "node_modules", tool), path.join(dependencies, tool), process.platform === "win32" ? "junction" : "dir");
  }
}

async function readOriginalCaptures(directory, { report, requests, result }) {
  const { readQualificationCaptures, readSupplementCaptures } = await moduleAt(directory, `${verification}/current-captures.ts`);
  const qualificationId = report.componentObservations[0].captureIdentity;
  const supplementId = report.componentObservations[24].captureIdentity;
  const issuance = await pinned(path.join(packet, "supplement-issuance.json"), supplementId.issuanceSha256);
  const regular = requests.records.filter(row => row.group === "resume-jd");
  const [primary, supplemental] = await Promise.all([
    readQualificationCaptures(path.join(packet, "captures", qualificationRun), {
      bindingSha256: qualificationId.bindingSha256, runId: qualificationRun, authorizationId: result.authorizationId,
      mode: "authorized-live", candidateCommit: originalCommit, configurationSha256: qualificationId.configurationSha256,
      providerPolicyId: oldPolicy, endpoint: result.endpoint, model: result.model, receiptRoute: result.receiptRoute,
      requestBodies: regular.map(({ documentId, requestBodySha256 }) => ({ documentId, requestBodySha256 })),
    }),
    readSupplementCaptures({ issuance: issuance.toString("utf8"), issuanceSha256: supplementId.issuanceSha256,
      directory: path.join(root, "work/materials-supplement-collection"), mode: "authorized-live" }),
  ]);
  check(primary.complete && supplemental.complete && supplemental.binding.runId === supplementRun, "capture batch incomplete");
  same(primary.outputs.map(row => row.documentId), regular.map(row => row.documentId), "qualification identities differ");
  same(supplemental.outputs.map(row => row.documentId), requests.records.filter(row => row.group === "supplement").map(row => row.documentId), "supplement identities differ");
  const captures = [...primary.outputs, ...supplemental.outputs];
  check(captures.length === 30 && new Set(captures.map(c => c.documentId)).size === 30
    && new Set(captures.map(c => c.accounting.receiptId)).size === 30, "duplicate or missing identity");
  for (const [i, c] of captures.entries()) {
    const historical = report.componentObservations[i];
    for (const key of ["documentId", "documentVersionId", "textVersionId", "rawAssistant", "captureIdentity", "accounting", "decodedCandidate"])
      same(c[key], historical[key], `${c.documentId} historical ${key} differs`);
    check(c.accounting.receiptVerified && c.accounting.state === "settled" && c.providerPolicyId === oldPolicy, `${c.documentId} receipt differs`);
  }
  return captures;
}

async function product(directory) {
  const [decoder, validator, mapper, tasks, blueprint, registry] = await Promise.all([
    "worker/document-executor/source-span-extraction.ts", "app/server/documents/extraction-validator.ts",
    "app/lib/materials/skill-mapper.ts", "app/lib/materials/course-task-coverage.ts",
    "app/data/flagship-blueprint.ts", "app/data/flagship-unit-registry.ts",
  ].map(file => moduleAt(directory, file)));
  return { ...decoder, ...validator, ...mapper, blueprint: blueprint.flagshipBlueprint, units: registry.flagshipUnitRegistry,
    coverage: tasks.createCourseTaskCoverageEvaluator(blueprint.flagshipBlueprint, registry.flagshipUnitRegistry) };
}

function decoderEnvelope(capture) {
  const chat = capture.rawAssistant;
  if (chat.finishEvidence === "captured") return { finish_reason: chat.topLevelFinishReason,
    native_finish_reason: chat.topLevelNativeFinishReason, choices: [{ finish_reason: chat.finishReason,
      native_finish_reason: chat.nativeFinishReason, message: { content: chat.assistantContent } }] };
  // The six supplemental bodies have a recorded successful decode but no recorded finish flags.
  // Supply the necessary successful condition only for their body replay. Do not claim observing a stop flag.
  check(capture.captureIdentity.collection === "supplement-6" && chat.finishEvidence === "not-recorded"
    && chat.rawCaptured && chat.extractionRead === "parsed", `${capture.documentId} unsupported supplemental finish evidence`);
  return { choices: [{ finish_reason: "stop", message: { content: chat.assistantContent } }] };
}

function extract(captures, corpora, component, policy) {
  const format = policy === oldPolicy ? "source-spans-v3" : component.sourceSpanPolicy(policy);
  check(format && (policy === oldPolicy || format.format === "source-spans-v3"), "requested decoder policy unavailable");
  return captures.map(capture => {
    const { documentId, documentVersionId, textVersionId } = capture;
    const doc = corpora.find(value => value.id === documentId);
    check(doc?.documentVersionId === documentVersionId && doc?.textVersionId === textVersionId
      && (capture.sourceTextSha256 === null || capture.sourceTextSha256 === sha(doc.text)), `${documentId} source identity differs`);
    const source = { text: doc.text, segments: doc.segments };
    const envelope = decoderEnvelope(capture);
    // The audit retained the final read state, not an independent generation-only flag.
    // Score it after decoding. In particular, the five truncations must be detected from the captured chat flags.
    const { candidate, extractionRead } = component.readSourceSpanExtraction(envelope, source, undefined, format);
    if (policy === oldPolicy) {
      same(candidate, capture.decodedCandidate, `${documentId} V3 decoded candidate differs`);
      same(extractionRead, capture.accounting.audit.extractionRead, `${documentId} V3 extraction state differs`);
    }
    const identity = { documentId, documentVersionId, textVersionId };
    const context = { ...identity, ...source, ownerId, lifecycle: "active" };
    let projection;
    try { projection = component.validateDocumentExtraction(candidate, ownerId, context, policy); }
    catch (error) { if (candidate !== null || error.code !== "invalid-content") throw error; }
    const sourceInput = candidate && { ...identity, candidates: candidate.items, reviewPoints: candidate.reviewPoints };
    return { documentId, kind: doc.kind, extractionRead, sourceInput, projection: projection ?? null };
  });
}

function courseView(row, component) {
  if (!row.projection) return [];
  const { items } = row.projection;
  const learningIntentItemIds = items.filter(item => row.kind !== "jd" && (item.kind === "constraint" || item.kind === "requirement")).map(item => item.id);
  const mappings = component.mapMaterialItemTerms(items, component.blueprint, component.units, { learningIntentItemIds });
  const observations = mappings.map(mapping => {
    check(mapping.status !== "omitted" && mapping.basis !== "manual", `${row.documentId} course observation is unrepresentable`);
    const item = items.find(item => item.id === mapping.itemId);
    return { documentId: row.documentId, candidateId: item.id, literal: mapping.term,
      topic: { status: mapping.status, skillIds: mapping.skillIds, basis: mapping.basis ?? (mapping.status === "non-learning" ? "not-applicable" : "none") },
      taskCoverage: { status: component.coverage(mapping, item).status } };
  });
  for (const candidate of row.sourceInput.candidates) {
    const item = items.find(item => item.id === candidate.id);
    if (candidate.skillLabels.length === 0 && item?.skillLabels?.length === 0) observations.push({
      documentId: row.documentId, candidateId: candidate.id, literal: null,
      topic: { status: "non-learning", skillIds: [], basis: "not-applicable" }, taskCoverage: { status: "not-applicable" },
    });
  }
  return observations;
}

function score(rows, component, scorers, references) {
  const documents = rows.flatMap(row => row.sourceInput ? [row.sourceInput] : []);
  const observations = rows.map(row => courseView(row, component));
  const courseObservations = observations.flat();
  const errors = scorers.validateCandidateInput({ schemaVersion: "materials-quality-candidate-v2.1",
    provenance: { kind: "product-observation", description: "Offline component replay of preserved Modal response bodies." }, documents, courseObservations });
  check(errors.length === 0, "component output does not satisfy frozen scoring input");
  const { report: source, bindings } = scorers.evaluateSource(documents, references);
  const course = scorers.evaluateCourse(courseObservations, documents, bindings, references);
  return { rows, source, observations, course };
}

function countCodes(errors) {
  const counts = {};
  for (const { code } of errors) counts[code] = (counts[code] ?? 0) + 1;
  return counts;
}

function metrics({ rows, source, course }) {
  check(!source.omittedErrors && !course.omittedErrors, "frozen scorer omitted errors");
  const docs = source.documents;
  const totals = Object.fromEntries(Object.keys(docs[0].metrics).map(key => [key, ["numerator", "denominator"].map(
    part => docs.reduce((sum, doc) => sum + doc.metrics[key][part], 0))]));
  const outside = course.errors.filter(err => err.code === "unexpected-course-literal").length;
  const truncatedIds = new Set(rows.filter(row => row.extractionRead === "output-limit").map(row => row.documentId));
  const missingByDecode = Object.fromEntries(["missing-field", "missing-review"].map(code => {
    const missing = source.errors.filter(error => error.code === code);
    const truncated = missing.filter(error => truncatedIds.has(error.documentId)).length;
    return [code, { truncated, other: missing.length - truncated }];
  }));
  return { documents: rows.length, drafts: rows.filter(row => row.sourceInput).length,
    projected: rows.filter(row => row.projection).length, truncated: rows.filter(row => row.extractionRead === "output-limit").length,
    sourcePassed: docs.filter(d => d.status === "passed").length, sourceStatus: source.status,
    groups: Object.fromEntries(source.groups.map(g => [g.id, [g.passed, g.documents]])), fields: totals,
    classifications: Object.fromEntries(Object.entries(source.classification).map(([key, m]) => [key, [m.numerator, m.denominator]])),
    sourceErrors: countCodes(source.errors), missingByDecode, courseStatus: course.status, expectedCourse: course.expectedActualLiteralObservations,
    matchedCourse: course.observations.filter(o => o.status === "passed").length, outsideReference: outside,
    receivedCourse: course.receivedObservations, courseObservationErrors: countCodes(course.observations.flatMap(o => o.errors)) };
}

const obsKey = ({ documentId, candidateId, literal }) => JSON.stringify([documentId, candidateId, literal]);
function compareTerms(old, current, evidenceTerms, captures) {
  const unknown = result => new Set(result.source.errors.filter(e => e.code === "unknown-term").map(obsKey));
  const before = unknown(old), after = unknown(current);
  const formerlyUnknown = evidenceTerms.termProvenance.map(entry => {
    const capture = captures.find(v => v.documentId === entry.documentId);
    const i = capture.decodedCandidate.items.findIndex(item => item.id === entry.candidateId);
    const wireTerms = JSON.parse(capture.rawAssistant.assistantContent).items[i].skillTerms;
    const original = { documentId: entry.documentId, candidateId: entry.candidateId, literal: entry.reported };
    const key = obsKey(original);
    check(before.has(key) && entry.wire.every(term => wireTerms.includes(term))
      && entry.changedByDecoder === !wireTerms.includes(entry.reported), `${entry.documentId} original provenance differs`);
    const row = current.rows.find(r => r.documentId === entry.documentId);
    const observed = current.course.observations.filter(o => o.documentId === entry.documentId && o.candidateId === entry.candidateId);
    const decoded = row.sourceInput?.candidates.find(x => x.id === entry.candidateId)?.skillLabels ?? [];
    const projected = row.projection?.items.find(x => x.id === entry.candidateId)?.skillLabels ?? [];
    return { documentId: entry.documentId, candidateId: entry.candidateId, literalSha256: sha(entry.reported),
      origin: entry.changedByDecoder ? "local-rewrite" : "model-nomination", originalUnknownStillPresent: after.has(key),
      wireLiteralDecoded: entry.wire.every(term => decoded.includes(term)), wireLiteralProjected: entry.wire.every(term => projected.includes(term)),
      wireLiteralRecognized: entry.wire.every(term => observed.some(o => o.literal === term && o.fieldId)),
      wireCourseMatched: entry.wire.every(term => observed.some(o => o.literal === term && o.status === "passed")) };
  });
  same(formerlyUnknown.length, before.size, "historic unknown-term inventory differs");
  const groups = Object.fromEntries(["local-rewrite", "model-nomination"].map(origin => {
    const terms = formerlyUnknown.filter(t => t.origin === origin);
    return [origin, { count: terms.length, stillUnknown: terms.filter(t => t.originalUnknownStillPresent).length,
      wireLiteralDecoded: terms.filter(t => t.wireLiteralDecoded).length, wireLiteralProjected: terms.filter(t => t.wireLiteralProjected).length,
      wireRecognized: terms.filter(t => t.wireLiteralRecognized).length, wireCourseMatched: terms.filter(t => t.wireCourseMatched).length }];
  }));
  same([groups["local-rewrite"].count, groups["model-nomination"].count], [5, 9], "original term-source counts differ");
  return { groups, newlyUnknown: [...after].filter(k => !before.has(k)).length, rows: formerlyUnknown };
}

function compareScoring(old, current) {
  const oldFields = new Map(old.source.documents.flatMap(d => d.fields.map(f => [f.fieldId, f])));
  const fields = current.source.documents.flatMap(d => d.fields.map(f => ({ documentId: d.documentId, fieldId: f.fieldId,
    before: oldFields.get(f.fieldId).passed, after: f.passed, errorsBefore: countCodes(oldFields.get(f.fieldId).errors), errorsAfter: countCodes(f.errors) })));
  const actual = new Map(current.course.observations.map(o => [obsKey(o), o]));
  const expected = old.course.observations.filter(o => o.fieldId);
  const paired = expected.map(o => {
    const found = actual.get(obsKey(o));
    return { documentId: o.documentId, candidateId: o.candidateId, fieldId: o.fieldId, literalSha256: sha(JSON.stringify(o.literal)),
      before: o.status, after: found?.fieldId ? found.status : "missing", errorsBefore: countCodes(o.errors), errorsAfter: countCodes(found?.errors ?? []) };
  });
  const documentResults = current.source.documents.map(d => {
    const previous = old.source.documents.find(o => o.documentId === d.documentId);
    const oldRow = old.rows.find(r => r.documentId === d.documentId), currentRow = current.rows.find(r => r.documentId === d.documentId);
    return { documentId: d.documentId, group: d.reportingGroup, readBefore: oldRow.extractionRead, readAfter: currentRow.extractionRead,
      sourceBefore: previous.status, sourceAfter: d.status, projectedBefore: Boolean(oldRow.projection), projectedAfter: Boolean(currentRow.projection) };
  });
  return { documentResults, fieldResults: fields, unchangedLiteralCourse: { originalExpected: paired.length, stillExpected: paired.filter(o => o.after !== "missing").length,
    nowMatched: paired.filter(o => o.after === "passed").length, originallyUnmatched: paired.filter(o => o.before !== "passed"),
    regressions: paired.filter(o => o.before === "passed" && o.after !== "passed") } };
}

async function currentSourceDigest() {
  const files = git(["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "app", "worker"]).toString().split("\0").filter(Boolean).sort();
  const digests = await Promise.all(files.map(async file => [file, sha(await readFile(path.join(root, file)))]));
  return { files: digests.length, sha256: sha(JSON.stringify(digests)) };
}

async function main(directory) {
  const data = await evidence();
  await extractBaseline(directory);
  const loader = await moduleAt(directory, `${verification}/current-references.mjs`);
  const references = await loader.loadCurrentReviewedReferences();
  await loader.assertCurrentReviewedReferences(references);
  same(references.digests, data.report.referenceDigests, "reviewed references differ from the historical run");
  const captures = await readOriginalCaptures(directory, data);
  const beforeHash = await currentSourceDigest();
  const [historical, local, input, source, course] = await Promise.all([product(directory), product(root),
    ...["input", "source", "course"].map(name => moduleAt(directory, `docs/verification/materials-quality-v2/candidate-${name}.mjs`))]);
  const scorers = { ...input, ...source, ...course };
  const oldRows = extract(captures, references.corpora, historical, oldPolicy);
  const baseline = score(oldRows, historical, scorers, references);
  same(baseline.source, data.report.source, "V3 full source score differs");
  const { view, observationScope, ...recordedCourse } = data.report.course;
  check(view === "simulated-explicit-choice" && typeof observationScope === "string", "historical course view differs");
  same(baseline.course, recordedCourse, "V3 full course score differs");
  const compatible = extract(captures, references.corpora, local, oldPolicy);
  for (const [i, obs] of data.report.componentObservations.entries()) {
    for (const key of ["sourceInput", "projection"]) {
      same(oldRows[i][key], obs[key], `${obs.documentId} historical ${key} differs`);
      same(compatible[i][key], obs[key], `${obs.documentId} current V3 ${key} differs`);
    }
    same(baseline.observations[i], obs.views.simulatedExplicitChoice.observations, `${obs.documentId} historical course view differs`);
  }
  const newRows = extract(captures, references.corpora, local, newPolicy);
  const withHistoricalCourse = score(newRows, historical, scorers, references);
  const candidate = score(newRows, local, scorers, references);
  same(await currentSourceDigest(), beforeHash, "product source changed during execution");
  const truncated = captures.filter(c => c.accounting.audit.extractionRead === "output-limit").map(c => ({
    documentId: c.documentId, maxTokens: c.accounting.audit.metadataOutputTokens, assistantCharacters: c.rawAssistant.assistantContent?.length ?? 0 }));
  same(truncated, data.terms.truncated, "historic truncation evidence differs");
  for (const t of truncated) {
    const capture = captures.find(c => c.documentId === t.documentId);
    check(capture.rawAssistant.finishReason === "length" && t.maxTokens === data.requests.configurations["resume-jd"].config.maxOutputTokens,
      `${t.documentId} historic output limit differs`);
  }
  const termOrigins = compareTerms(baseline, candidate, data.terms, captures);
  const changes = compareScoring(baseline, candidate);
  const report = { schemaVersion: "modal-offline-component-replay-20261122-v1", mode: "offline-components", originalCommit,
    newModelCalls: 0, nativePlanExecutions: 0, gateApproved: false, releaseApproved: false,
    sourceInputs: pins, baselineReferenceFilesVerified: references.integrityFiles.length, candidateProduct: beforeHash,
    replayScriptSha256: sha(await readFile(fileURLToPath(import.meta.url))), bodiesRead: { qualification: 24, supplement: 6 },
    finishEvidence: { captured: 24, reconstructedStopForPreviouslyParsedSupplementBodies: 6 }, truncated,
    baseline: metrics(baseline), newDecodeAndProjectionWithHistoricalCourse: metrics(withHistoricalCourse), candidate: metrics(candidate),
    termOrigins, ...changes };
  return report;
}

const outputName = process.argv[2];
check(process.argv.length <= 3 && (!outputName || /^[a-z0-9][a-z0-9-]{1,100}\.json$/u.test(outputName)), "expected an optional new private summary filename");
// No transport is used by any replay operation. Also fail closed if an imported component tries fetch.
globalThis.fetch = () => { throw new Error("Modal replay: unexpected network request"); };
const temporary = await mkdtemp(path.join(tmpdir(), "arc-modal-replay-"));
try {
  const report = await main(temporary);
  if (outputName) await writeFile(path.join(preflight, outputName), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ mode: report.mode, ...Object.fromEntries(["baseline", "newDecodeAndProjectionWithHistoricalCourse", "candidate"].map(k => [k, report[k]])),
    termOrigins: report.termOrigins.groups, newlyUnknown: report.termOrigins.newlyUnknown, unchangedLiteralCourse: report.unchangedLiteralCourse,
    ...(outputName ? { outputName } : {}) }, null, 2));
} finally {
  check(path.dirname(path.resolve(temporary)) === path.resolve(tmpdir()) && path.basename(temporary).startsWith("arc-modal-replay-"), "unexpected scratch path");
  await rm(temporary, { recursive: true, force: true, maxRetries: 3 });
}
