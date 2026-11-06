// Offline annotation compatibility check. Run from the repository root with node --import tsx.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const project = new URL("../../../../", import.meta.url);
const load = createRequire(new URL("package.json", project));
const bytes = path => readFileSync(new URL(path, project));
const sha = content => createHash("sha256").update(content).digest("hex");
const { readSourceSpanExtraction, KIMI_GROUNDED_TERMS_POLICY_ID } = load("./worker/document-executor/source-span-extraction.ts");
const { findMaterialSkillEvidence } = load("./app/lib/materials/grounded-skill-terms.ts");
const { validateDocumentExtraction } = load("./app/server/documents/extraction-validator.ts");
const { evaluateDocumentQuality } = load("./tests/helpers/document-quality-evaluation.ts");
const { qualificationSegments } = load("./scripts/materials-qualification-inputs.ts");
const { mapMaterialItems } = load("./app/lib/materials/skill-mapper.ts");
const { flagshipBlueprint } = load("./app/data/flagship-blueprint.ts");
const { flagshipUnitRegistry } = load("./app/data/flagship-unit-registry.ts");
const { researchAgentFixture } = load("./tests/helpers/research-agent-fixture.ts");
const originalHashes = {
  "tests/fixtures/documents/quality-corpus.json": "69e5ddd1005f12abf24483e10dd235629ef309ba3a84e922166963ccd9aed750",
  "tests/fixtures/documents/supplement-quality-corpus.json": "9775b595f4b44563beb9e3b7f9249b171e731658b454e0f26279d2b46db213d7",
  "tests/helpers/document-quality-evaluation.ts": "6297b7bdd112833cbd8a58b3bd63f6cbaf46d86b77cbab760744fe66babec351",
};
for (const [path, expected] of Object.entries(originalHashes)) {
  assert.equal(sha(bytes(path)), expected, path);
}

function decode(wire, context) {
  const response = { choices: [{ finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(wire) } }] };
  return readSourceSpanExtraction(response, context, undefined, wire.format);
}

function inspect(doc, format) {
  const segments = doc.kind === "supplement" ? doc.segments : qualificationSegments(doc);
  const context = { text: doc.text, segments, lifecycle: "active", ownerId: "fixture", documentId: doc.id,
    documentVersionId: doc.documentVersionId, textVersionId: doc.textVersionId };
  const items = doc.goldFields.map(({ kind, source, requirementLevel, selfLevelHint, skillLabels }) => {
    if (format === "source-spans-v1") return { kind, source, requirementLevel, selfLevelHint, skillLabels };
    // Give v2 the exact phrase for every annotated concept that its own declared vocabulary can ground.
    const terms = skillLabels.map(label => findMaterialSkillEvidence(source.quote, label)).filter(Boolean);
    return { kind, source, requirementLevel, selfLevelHint, skillTerms: [...new Set(terms)] };
  });
  const { extractionRead, candidate } = decode({ format, items, reviewPoints: doc.expectedReviewPoints }, context);
  const draft = candidate && validateDocumentExtraction(candidate, context.ownerId, context, format === "source-spans-v2" ? KIMI_GROUNDED_TERMS_POLICY_ID : undefined);
  const result = evaluateDocumentQuality(doc, { documentId: doc.id, documentVersionId: doc.documentVersionId,
    textVersionId: doc.textVersionId, candidates: candidate?.items ?? [], reviewPoints: candidate?.reviewPoints ?? [] });
  const equalPoint = (a, b) => a.code === b.code && a.source.segmentId === b.source.segmentId && a.source.quote === b.source.quote;
  const missing = doc.expectedReviewPoints.filter(point => !candidate?.reviewPoints.some(other => equalPoint(point, other)));
  const additional = (candidate?.reviewPoints ?? []).filter(point => !doc.expectedReviewPoints.some(other => equalPoint(point, other)));
  const mismatchedSkills = doc.goldFields.filter((field, i) => {
    const labels = candidate?.items[i]?.skillLabels ?? [];
    return labels.length !== field.skillLabels.length || field.skillLabels.some(label => !labels.includes(label));
  });
  return { id: doc.id, category: doc.category, extractionRead, passed: Boolean(draft && result.passed), failures: result.failures,
    strictFieldMatches: result.diagnostics?.fields.strictJoint ?? 0, expectedFields: doc.goldFields.length,
    returnedReviewCount: candidate?.reviewPoints.length ?? 0,
    incompatibleSkillSets: mismatchedSkills.map(field => field.id),
    missingReviewPoints: missing.map(({ code, source }) => [code, source.segmentId]),
    additionalReviewPoints: additional.map(({ code, source }) => [code, source.segmentId]),
    reviewLabelLoss: candidate?.items.flatMap((item, i) => {
      const kept = draft.items[i].skillLabels ?? [];
      return item.skillLabels.filter(label => !kept.includes(label)).map(label => [item.id, label]);
    }) ?? [] };
}

function corpus(path) {
  const docs = JSON.parse(bytes(path)).documents;
  const control = docs.map(doc => inspect(doc, "source-spans-v1"));
  assert(control.every(row => row.extractionRead === "parsed" && row.passed), "positive control with the original annotations");
  const rows = docs.map(doc => inspect(doc, "source-spans-v2"));
  return { originalAnnotationControlPassed: control.length, v2Documents: rows,
    normalPassed: rows.filter(row => row.category === "normal" && row.passed).length,
    edgePassed: rows.filter(row => row.category === "edge" && row.passed).length };
}

function compareCatalogs() {
  const quote = "The role requires Playwright.", source = { segmentId: "original", quote };
  const context = { text: quote, segments: [{ id: source.segmentId, start: 0, end: quote.length }], lifecycle: "active",
    ownerId: "fixture", documentId: "separate-jd", documentVersionId: "revision", textVersionId: "text" };
  const result = decode({ format: "source-spans-v2", items: [{ kind: "requirement", source, skillTerms: ["Playwright"],
    requirementLevel: "must", selfLevelHint: null }], reviewPoints: [{ code: "uncovered-skill", source }] }, context);
  assert.equal(result.extractionRead, "parsed");
  const draft = validateDocumentExtraction(result.candidate, context.ownerId, context, KIMI_GROUNDED_TERMS_POLICY_ID);
  assert.equal(draft.reviewPoints.length, 0);
  const other = researchAgentFixture().sourceContext;
  const summarize = (blueprint, registry) => ({ role: blueprint.name, version: blueprint.version,
    matches: mapMaterialItems(draft.items, blueprint, registry).map(({ status, skillIds }) => ({ status, skillIds })) });
  const first = summarize(flagshipBlueprint, flagshipUnitRegistry), second = summarize(other.blueprint, other.registry);
  assert.deepEqual(first.matches, [{ status: "mapped", skillIds: ["testing"] }]);
  assert.deepEqual(second.matches, [{ status: "uncovered", skillIds: [] }]);
  return { documentOnlyIssues: draft.reviewPoints.length, term: "Playwright", catalogs: [first, second] };
}

const report = { mode: "offline-annotation-compatibility", method: "Known annotations supply facts and proposed questions; v2 receives only supported original skill phrases. These are simulated inputs, not predictions or observations of a model.",
  originalHashes, b2: corpus("tests/fixtures/documents/quality-corpus.json"),
  supplements: corpus("tests/fixtures/documents/supplement-quality-corpus.json"), sameDocumentAcrossTwoCatalogs: compareCatalogs(),
  modelRequests: 0, inferenceCostMicroUsd: 0 };
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
