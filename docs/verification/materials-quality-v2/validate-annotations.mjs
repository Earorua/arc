// Run from the repository root. This validates annotation structure, not candidates.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const target = process.argv[2] ?? 'docs/verification/materials-quality-v2/annotations.draft.json';
const inputs = [
  ['tests/fixtures/documents/quality-corpus.json', '69e5ddd1005f12abf24483e10dd235629ef309ba3a84e922166963ccd9aed750'],
  ['tests/fixtures/documents/supplement-quality-corpus.json', '9775b595f4b44563beb9e3b7f9249b171e731658b454e0f26279d2b46db213d7'],
  ['tests/helpers/document-quality-evaluation.ts', '6297b7bdd112833cbd8a58b3bd63f6cbaf46d86b77cbab760744fe66babec351'],
];
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for (const [file, hash] of inputs) assert.equal(digest(file), hash, `Frozen hash changed: ${file}`);
assert.ok(fs.existsSync(target), 'Independent annotation draft is absent');
const a = JSON.parse(fs.readFileSync(target, 'utf8'));
const docs = inputs.slice(0, 2).flatMap(([file]) => JSON.parse(fs.readFileSync(file, 'utf8')).documents);
const byId = new Map(docs.map(d => [d.id, d]));
assert.equal(a.status, 'draft-not-approved');
assert.equal(a.separateCourseReviewPending, true);
assert.deepEqual(a.inputHashes.map(x => [x.path, x.sha256]), inputs);
assert.equal(a.thresholds.criticalRecallPerDocument, 0.9);
assert.equal(a.thresholds.applicableJdClassificationPerDocument, 0.9);
assert.equal(a.thresholds.sourceValidity, 1);
assert.equal(a.documents.length, 30);
assert.deepEqual(a.documents.map(d => d.id).sort(), docs.map(d => d.id).sort());
assert.equal(new Set(a.documents.map(d => d.id)).size, 30);
const jobRequirementActorMismatches = a.documents.flatMap(d => [...d.fields, ...d.additionalFields])
  .filter(f => ['primary-jd-requirement', 'secondary-jd-requirement'].includes(f.expected.sourceRole) && f.semanticScope.actor !== 'target-role')
  .map(f => ({ fieldId: f.legacyId ?? f.id, sourceRole: f.expected.sourceRole, actor: f.semanticScope.actor }));
assert.deepEqual(jobRequirementActorMismatches, [], 'Job requirement sourceRole requires target-role actor');
const observedLegacy = [];
const additionalIds = [];
let references = 0, literalAlternatives = 0, combinedAlternatives = 0, requiredReviews = 0, optionalReviews = 0;
const classifications = { 'primary-jd-classified': 0, 'secondary-jd-classified': 0, 'unresolved-jd-conflict': 0 };
const hints = { guided: 0, conceptual: 0, uncertain: 0, null: 0 };
const groups = { 'b2-normal': 0, 'b2-edge': 0, 'supplement-normal': 0, 'supplement-edge': 0 };
const codes = new Set(['confirm-self-assessment', 'conflicting-self-assessment', 'team-attribution', 'conflicting-requirement', 'prompt-injection', 'untrusted-resource-url', 'missing-information', 'uncovered-skill']);
const countExact = (text, quote) => text.split(quote).length - 1;
function checkSource(source, doc) {
  assert.ok(source.quote.length > 0, `${doc.id}: empty quote`);
  const seg = doc.segments.find(s => s.id === source.segmentId);
  assert.ok(seg, `${doc.id}: unknown segment ${source.segmentId}`);
  assert.equal(countExact(seg.text, source.quote), 1, `${doc.id}: quote not unique in segment`);
  assert.equal(countExact(doc.text, source.quote), 1, `${doc.id}: quote not unique in document`);
  assert.equal(source.documentVersionId, doc.documentVersionId);
  assert.equal(source.textVersionId, doc.textVersionId);
  assert.equal(source.offsetUnit, 'utf16-code-unit');
  assert.equal(source.segmentStartOffset, seg.text.indexOf(source.quote));
  assert.equal(source.segmentEndOffset, source.segmentStartOffset + source.quote.length);
  assert.equal(source.startOffset, seg.start + source.segmentStartOffset);
  assert.equal(source.endOffset, source.startOffset + source.quote.length);
  assert.equal(seg.text.slice(source.segmentStartOffset, source.segmentEndOffset), source.quote);
  assert.equal(doc.text.slice(source.startOffset, source.endOffset), source.quote);
  assert.equal(doc.text.slice(seg.start, seg.end), seg.text, `${doc.id}: frozen segment differs`);
  references++;
}
function checkField(f, doc, isLegacy) {
  checkSource(f.source, doc);
  assert.equal(f.factTextMatch.mode, 'exact-source-quote');
  assert.equal(f.factTextMatch.text, f.source.quote);
  assert.equal(f.expected.requirementLevel === null, f.expected.kind !== 'requirement');
  assert.ok(f.expected.sourceRole);
  assert.equal(f.separateCourseReviewPending, true);
  assert.ok(f.courseReviewProposalReference);
  const required = f.skillTermGroups;
  const optional = f.optionalSkillTermGroups;
  assert.ok(Array.isArray(required) && Array.isArray(optional));
  const termIds = [...required, ...optional].map(g => g.id);
  assert.equal(new Set(termIds).size, termIds.length, `${f.id ?? f.legacyId}: repeated term-group ID`);
  for (const g of [...required, ...optional]) {
    assert.ok(g.alternatives.length > 0);
    assert.equal(new Set(g.alternatives).size, g.alternatives.length);
    for (const literal of g.alternatives) {
      assert.ok(literal.length > 0 && f.source.quote.includes(literal), `${f.id ?? f.legacyId}: nonliteral term ${literal}`);
      literalAlternatives++;
    }
  }
  for (const g of optional) assert.ok(g.reason?.length > 0);
  const seenCombined = new Set();
  for (const combined of f.combinedLiteralTerms) {
    assert.ok(combined.literal.length > 0 && f.source.quote.includes(combined.literal), `${f.id ?? f.legacyId}: nonliteral combined term`);
    assert.ok(!seenCombined.has(combined.literal), `${f.id ?? f.legacyId}: duplicate combined alternative`);
    seenCombined.add(combined.literal);
    assert.ok(combined.coversGroupIds.length > 1);
    assert.equal(new Set(combined.coversGroupIds).size, combined.coversGroupIds.length);
    for (const id of combined.coversGroupIds) assert.ok(required.some(g => g.id === id), `${f.id ?? f.legacyId}: combined term references missing group`);
    assert.ok(combined.reason?.length > 0);
    combinedAlternatives++;
  }
  if (f.learningTermPolicy.learningBearing) assert.ok(required.length > 0, `${f.id ?? f.legacyId}: empty learning terms`);
  else assert.ok(f.learningTermPolicy.emptyTermsReason?.length > 0);
  for (const dimension of f.learningTermPolicy.requiredDimensions) {
    assert.ok(required.some(g => g.dimension === dimension), `${f.id ?? f.legacyId}: missing ${dimension}`);
  }
  assert.equal(f.learningTermPolicy.unlistedTerms, 'forbidden');
  const allowed = f.expectedSelfLevelHint.allowedValues;
  assert.ok(allowed.length >= 1 && allowed.length <= 2);
  assert.equal(new Set(allowed).size, allowed.length);
  for (const hint of allowed) assert.ok([null, 'conceptual', 'guided', 'uncertain'].includes(hint));
  assert.ok(f.expectedSelfLevelHint.reason?.length > 0);
  if (allowed.some(x => x !== null)) assert.ok(f.expectedSelfLevelHint.evidenceLiterals.length > 0);
  for (const literal of f.expectedSelfLevelHint.evidenceLiterals) assert.ok(f.source.quote.includes(literal));
  assert.ok(f.semanticScope.actor && f.semanticScope.polarity && f.semanticScope.notes);
  assert.ok(f.semanticScope.requiredLiteralSpans.length > 0);
  for (const literal of f.semanticScope.requiredLiteralSpans) assert.ok(f.source.quote.includes(literal));
  assert.ok(Array.isArray(f.semanticScope.forbiddenInferences));
  if (isLegacy) {
    const old = doc.goldFields.find(g => g.id === f.legacyId);
    assert.ok(old);
    assert.deepEqual(f.legacy, old, `Old gold changed: ${f.legacyId}`);
    assert.equal(f.source.quote, old.source.quote);
    assert.equal(f.source.segmentId, old.source.segmentId);
    assert.equal(f.expected.kind, old.kind, `${f.legacyId}: unreviewed wire-kind change`);
    const reviewedLevel = ['jd-11-field-3', 'supplement-01-field-2'].includes(f.legacyId) ? 'unspecified' : old.requirementLevel;
    assert.equal(f.expected.requirementLevel, reviewedLevel, `${f.legacyId}: classification changed outside reviewed exceptions`);
    observedLegacy.push(f.legacyId);
    if (f.expected.classificationGroup in classifications) classifications[f.expected.classificationGroup]++;
    hints[String(allowed[0])]++;
  } else {
    additionalIds.push(f.id);
    assert.equal(f.scoring.denominator, 'additional-only');
    assert.equal(f.scoring.changesLegacyDenominator, false);
  }
}
for (const d of a.documents) {
  const doc = byId.get(d.id);
  assert.equal(d.documentVersionId, doc.documentVersionId);
  assert.equal(d.textVersionId, doc.textVersionId);
  assert.equal(d.kind, doc.kind);
  assert.equal(d.category, doc.category);
  const expectedReportingGroup = `${doc.kind === 'supplement' ? 'supplement' : 'b2'}-${doc.category}`;
  assert.equal(d.reportingGroup, expectedReportingGroup, `${d.id}: reporting group must match frozen kind/category`);
  assert.equal(d.sourceTextSha256, crypto.createHash('sha256').update(doc.text, 'utf8').digest('hex'));
  groups[d.reportingGroup]++;
  assert.equal(d.fields.length, doc.goldFields.length);
  for (const f of d.fields) checkField(f, doc, true);
  for (const f of d.additionalFields) checkField(f, doc, false);
  assert.deepEqual(d.legacyExpectedReviewPoints, doc.expectedReviewPoints);
  assert.deepEqual(d.legacyForbiddenOutputs, doc.forbiddenOutputs);
  const seen = new Set();
  for (const [kind, reviews] of [['required', d.requiredReviews], ['optional', d.optionalReviews], ['forbidden', d.forbiddenReviews]]) {
    for (const r of reviews) {
      assert.ok(codes.has(r.code));
      assert.ok(r.reason?.length > 0);
      checkSource(r.source, doc);
      const key = `${r.code}|${r.source.segmentId}|${r.source.quote}`;
      assert.ok(!seen.has(key), `${d.id}: duplicate or contradictory ${kind} review ${r.code}`);
      seen.add(key);
      if (kind === 'required') requiredReviews++;
      if (kind === 'optional') optionalReviews++;
    }
  }
  assert.equal(d.reviewPolicy.unlistedCodeSourcePairs, 'forbidden');
  assert.equal(d.reviewPolicy.maxOccurrencesPerCodeSourcePair, 1);
}
const allOld = docs.flatMap(d => d.goldFields.map(g => g.id));
assert.equal(observedLegacy.length, 84);
assert.equal(new Set(observedLegacy).size, 84);
assert.deepEqual(observedLegacy.sort(), allOld.sort());
assert.equal(new Set(additionalIds).size, additionalIds.length);
assert.ok(additionalIds.includes('resume-01-additional-1'));
assert.ok(additionalIds.includes('jd-12-additional-1'));
assert.deepEqual([...additionalIds].sort(), ['jd-12-additional-1', 'resume-01-additional-1'], 'Additional field IDs must match the exact reviewed set');
assert.deepEqual(classifications, { 'primary-jd-classified': 31, 'secondary-jd-classified': 1, 'unresolved-jd-conflict': 2 });
assert.deepEqual(groups, { 'b2-normal': 18, 'b2-edge': 6, 'supplement-normal': 3, 'supplement-edge': 3 });
const actualDenominators = {
  legacyFields: observedLegacy.length,
  primaryJdExplicitClassification: classifications['primary-jd-classified'],
  secondaryJdExplicitClassification: classifications['secondary-jd-classified'],
  unresolvedJdConflictAnchors: classifications['unresolved-jd-conflict'],
  additionalFields: additionalIds.length,
};
assert.ok(a.denominators && typeof a.denominators === 'object' && !Array.isArray(a.denominators), 'Declared denominators must be an object');
for (const [key, actual] of Object.entries(actualDenominators)) {
  assert.equal(a.denominators[key], actual, `Declared denominator ${key} must match the actual fixed count`);
}
assert.ok(Array.isArray(a.reportingGroups), 'Reporting group declarations must be an array');
assert.equal(a.reportingGroups.length, Object.keys(groups).length, 'Reporting group declarations must contain exactly four groups');
const declaredGroupIds = a.reportingGroups.map(g => g.id);
assert.equal(new Set(declaredGroupIds).size, declaredGroupIds.length, 'Reporting group declarations must have unique IDs');
assert.deepEqual([...declaredGroupIds].sort(), Object.keys(groups).sort(), 'Reporting group declarations must match the complete fixed set');
for (const group of a.reportingGroups) {
  assert.equal(group.documents, groups[group.id], `Reporting group declaration ${group.id} must match the actual fixed count`);
}
assert.ok(hints.guided > 0 && hints.conceptual > 0, 'Non-null positive hints were lost');
assert.deepEqual(hints, { guided: 11, conceptual: 6, uncertain: 0, null: 67 });
const s5 = a.documents.find(d => d.id === 'supplement-05');
assert.equal(s5.fields.length, 0);
assert.deepEqual(s5.requiredReviews.map(r => r.code).sort(), ['prompt-injection', 'untrusted-resource-url']);
assert.equal(s5.externalAccessPolicy.fetchCount, 0);
const find = id => a.documents.flatMap(d => d.fields).find(f => f.legacyId === id);
assert.equal(find('jd-11-field-3').expected.sourceRole, 'resource-reference');
assert.equal(find('supplement-01-field-2').expected.sourceRole, 'learning-advice');
for (const id of ['resume-09-field-2', 'resume-12-field-1', 'resume-12-field-2', 'resume-06-field-3']) assert.deepEqual(find(id).expectedSelfLevelHint.allowedValues, [null]);
const r12 = a.documents.find(d => d.id === 'resume-12');
assert.ok(r12.requiredReviews.some(r => r.code === 'confirm-self-assessment' && r.source.quote === find('resume-12-field-1').source.quote));
assert.ok(r12.requiredReviews.some(r => r.code === 'missing-information'));
assert.ok(![...r12.requiredReviews, ...r12.optionalReviews].some(r => r.code === 'conflicting-self-assessment'));
for (const [file, hash] of inputs) assert.equal(digest(file), hash);
console.log(JSON.stringify({ status: 'PASS', documents: a.documents.length, legacyFields: observedLegacy.length, uniqueLegacyFields: new Set(observedLegacy).size, additionalFields: additionalIds.length, groups, classifications, hints, checkedReferences: references, checkedLiteralAlternatives: literalAlternatives, checkedCombinedAlternatives: combinedAlternatives, requiredReviews, optionalReviews, frozenHashesUnchanged: true, productionImports: 0, candidateOutputsRead: 0, annotationSha256: digest(target) }, null, 2));
