// Offline differential audit, not a model evaluation. All proposals come from known annotations.
// Run from the repository root with node --import tsx and keep the JSON output with the source revision.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const project = new URL("../../../", import.meta.url);
const load = createRequire(new URL("package.json", project));
const bytes = path => readFileSync(new URL(path, project));
const sha = value => createHash("sha256").update(value).digest("hex");
const { readSourceSpanExtraction, KIMI_GROUNDED_TERMS_POLICY_ID } = load("./worker/document-executor/source-span-extraction.ts");
const { findMaterialSkillEvidence } = load("./app/lib/materials/grounded-skill-terms.ts");
const { validateDocumentExtraction } = load("./app/server/documents/extraction-validator.ts");
const { evaluateDocumentQuality } = load("./tests/helpers/document-quality-evaluation.ts");
const { qualificationSegments } = load("./scripts/materials-qualification-inputs.ts");

const frozenHashes = {
  "tests/fixtures/documents/quality-corpus.json": "69e5ddd1005f12abf24483e10dd235629ef309ba3a84e922166963ccd9aed750",
  "tests/fixtures/documents/supplement-quality-corpus.json": "9775b595f4b44563beb9e3b7f9249b171e731658b454e0f26279d2b46db213d7",
  "tests/helpers/document-quality-evaluation.ts": "6297b7bdd112833cbd8a58b3bd63f6cbaf46d86b77cbab760744fe66babec351",
};
for (const [path, expected] of Object.entries(frozenHashes)) assert.equal(sha(bytes(path)), expected, path);
const sourceFiles = [
  "worker/document-executor/source-span-extraction.ts", "worker/document-executor/source-statements.ts",
  "worker/document-executor/source-review-evidence.ts", "worker/document-executor/source-requirement-evidence.ts",
  "app/lib/materials/grounded-skill-terms.ts", "app/lib/materials/skill-mapper.ts",
  "app/server/documents/extraction-validator.ts", "app/server/documents/policy.ts",
];
const key = point => JSON.stringify([point.source.segmentId, point.source.quote, point.code]);
const normalize = value => value.normalize("NFKC").trim().toLowerCase();
const skillSet = labels => JSON.stringify(labels.map(normalize).sort());
const outcomes = [];
for (const path of Object.keys(frozenHashes).filter(path => path.endsWith(".json"))) {
  for (const doc of JSON.parse(bytes(path)).documents) {
    const segments = doc.kind === "supplement" ? doc.segments : qualificationSegments(doc);
    const context = { text: doc.text, segments, lifecycle: "active", ownerId: "fixture", documentId: doc.id,
      documentVersionId: doc.documentVersionId, textVersionId: doc.textVersionId };
    function decode(format) {
      const items = doc.goldFields.map(({ kind, source, requirementLevel, selfLevelHint, skillLabels }) => ({
        kind, source, requirementLevel, selfLevelHint,
        ...(format === "source-spans-v1" ? { skillLabels } : {
          skillTerms: [...new Set(skillLabels.map(label => findMaterialSkillEvidence(source.quote, label)).filter(Boolean))],
        }),
      }));
      const wire = { format, items, reviewPoints: doc.expectedReviewPoints };
      const response = { choices: [{ finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(wire) } }] };
      const decoded = readSourceSpanExtraction(response, context, undefined, format);
      const score = evaluateDocumentQuality(doc, { documentId: doc.id, documentVersionId: doc.documentVersionId,
        textVersionId: doc.textVersionId, candidates: decoded.candidate?.items ?? [], reviewPoints: decoded.candidate?.reviewPoints ?? [] });
      return { ...decoded, score, proposedItems: items };
    }
    assert.equal(decode("source-spans-v1").score.passed, true, `${doc.id}: frozen annotation control`);
    const actual = decode("source-spans-v2");
    assert.equal(actual.extractionRead, "parsed", `${doc.id}: source-span decode`);
    const draft = validateDocumentExtraction(actual.candidate, context.ownerId, context, KIMI_GROUNDED_TERMS_POLICY_ID);
    const fields = doc.goldFields.map((field, index) => {
      const item = actual.candidate.items.find(item => item.source.segmentId === field.source.segmentId && item.source.quote === field.source.quote);
      const select = record => record ? Object.fromEntries(["kind", "skillLabels", "selfLevelHint", "requirementLevel"].map(name => [name, record[name]])) : null;
      const differences = ["kind", "selfLevelHint", "requirementLevel"].filter(name => item?.[name] !== field[name]);
      if (skillSet(item?.skillLabels ?? []) !== skillSet(field.skillLabels)) differences.push("skillLabels");
      if (!item) differences.push("missingFact");
      return { id: field.id, quote: field.source.quote, proposedTerms: actual.proposedItems[index].skillTerms,
        expected: select(field), actual: select(item), differences };
    });
    const expectedReviews = new Set(doc.expectedReviewPoints.map(key));
    const actualReviews = new Set(actual.candidate.reviewPoints.map(key));
    outcomes.push({ id: doc.id, category: doc.category, kind: doc.kind, fields,
      missingReviews: doc.expectedReviewPoints.filter(point => !actualReviews.has(key(point))),
      additionalReviews: actual.candidate.reviewPoints.filter(point => !expectedReviews.has(key(point))),
      sitePreservesTerms: actual.candidate.items.every((item, index) => skillSet(item.skillLabels) === skillSet(draft.items[index].skillLabels ?? [])),
      frozenScore: actual.score });
  }
}
const fields = outcomes.flatMap(row => row.fields);
const axes = ["kind", "skillLabels", "selfLevelHint", "requirementLevel", "missingFact"];
process.stdout.write(JSON.stringify({
  mode: "offline-annotation-differential-audit", modelRequests: 0, inferenceCostMicroUsd: 0,
  method: "Known gold supplies every fact, proposed hint and question. v2 receives only original phrases supported by the current vocabulary. This diagnoses compatibility, not model predictions, recall, or readiness. No gold/scorer change is applied.",
  frozenHashes, sourceHashes: Object.fromEntries(sourceFiles.map(path => [path, sha(bytes(path))])),
  summary: { documents: outcomes.length, fields: fields.length, v1ControlPassed: outcomes.length,
    differences: Object.fromEntries(axes.map(axis => [axis, fields.filter(field => field.differences.includes(axis)).length])),
    missingReviewCount: outcomes.reduce((n, row) => n + row.missingReviews.length, 0),
    additionalReviewCount: outcomes.reduce((n, row) => n + row.additionalReviews.length, 0),
    sitePreservesAllTerms: outcomes.every(row => row.sitePreservesTerms),
    groups: ["resume", "jd", "supplement"].map(kind => ({ kind,
      normal: outcomes.filter(row => row.kind === kind && row.category === "normal" && row.frozenScore.passed).length,
      edge: outcomes.filter(row => row.kind === kind && row.category === "edge" && row.frozenScore.passed).length })) },
  documents: outcomes,
}, null, 2) + "\n");
