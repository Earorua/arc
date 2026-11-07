// Run from the repository root. These mutations exercise annotation checks only.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const original = JSON.parse(fs.readFileSync('docs/verification/materials-quality-v2/annotations.draft.json', 'utf8'));
const workDir = path.resolve('work');
fs.mkdirSync(workDir, { recursive: true });
const scratch = path.join(workDir, `materials-quality-v2-mutant-${process.pid}-${randomUUID()}.json`);
const validator = fileURLToPath(new URL('./validate-annotations.mjs', import.meta.url));
const field = (a, id) => a.documents.flatMap(d => d.fields).find(f => f.legacyId === id);
const cases = [
  ['missing-document', a => a.documents.pop(), /30/],
  ['duplicate-legacy-field', a => { a.documents[0].fields[1] = structuredClone(a.documents[0].fields[0]); }, /classifications|84|unique|Expected values/i],
  ['nonexistent-source', a => { a.documents[0].fields[0].source.quote += '不存在'; }, /quote not unique/],
  ['utf16-source-offset-after-emoji', a => { field(a, 'supplement-02-field-1').source.startOffset++; }, /Expected values/],
  ['nonliteral-unit-tests', a => { field(a, 'jd-05-field-2').skillTermGroups[1].alternatives.push('unit tests'); }, /nonliteral term/],
  ['missing-task-group', a => { field(a, 'jd-05-field-2').skillTermGroups.pop(); }, /missing group|missing task/],
  ['invalid-compound-group', a => { field(a, 'jd-05-field-2').combinedLiteralTerms[0].coversGroupIds.push('g99'); }, /missing group/],
  ['nonliteral-compound', a => { field(a, 'jd-05-field-2').combinedLiteralTerms[0].literal = 'TypeScript unit testing'; }, /nonliteral combined/],
  ['resource-promoted-to-preferred', a => { field(a, 'jd-11-field-3').expected.requirementLevel = 'preferred'; }, /classification changed/],
  ['positive-hint-erased', a => { field(a, 'resume-01-field-1').expectedSelfLevelHint.allowedValues = [null]; }, /Expected values/],
  ['contradictory-review-obligations', a => { a.documents[0].optionalReviews.push(structuredClone(a.documents[0].requiredReviews[0])); }, /duplicate or contradictory/],
  ['extra-additional-field', a => {
    const doc = a.documents.find(d => d.id === 'resume-01');
    const extra = structuredClone(doc.additionalFields[0]);
    extra.id = 'resume-01-additional-unregistered';
    doc.additionalFields.push(extra);
  }, /Additional field IDs must match/],
  ['declared-legacy-denominator', a => { a.denominators.legacyFields++; }, /Declared denominator legacyFields/],
  ['declared-primary-jd-denominator', a => { a.denominators.primaryJdExplicitClassification++; }, /Declared denominator primaryJdExplicitClassification/],
  ['declared-secondary-jd-denominator', a => { a.denominators.secondaryJdExplicitClassification++; }, /Declared denominator secondaryJdExplicitClassification/],
  ['declared-conflict-denominator', a => { a.denominators.unresolvedJdConflictAnchors++; }, /Declared denominator unresolvedJdConflictAnchors/],
  ['declared-additional-denominator', a => { a.denominators.additionalFields++; }, /Declared denominator additionalFields/],
  ['declared-b2-normal-count', a => { a.reportingGroups.find(g => g.id === 'b2-normal').documents++; }, /Reporting group declaration b2-normal/],
  ['declared-b2-edge-count', a => { a.reportingGroups.find(g => g.id === 'b2-edge').documents++; }, /Reporting group declaration b2-edge/],
  ['declared-supplement-normal-count', a => { a.reportingGroups.find(g => g.id === 'supplement-normal').documents++; }, /Reporting group declaration supplement-normal/],
  ['declared-supplement-edge-count', a => { a.reportingGroups.find(g => g.id === 'supplement-edge').documents++; }, /Reporting group declaration supplement-edge/],
  ['missing-reporting-group-declarations', a => { delete a.reportingGroups; }, /Reporting group declarations/],
  ['missing-reporting-group', a => { a.reportingGroups.pop(); }, /Reporting group declarations/],
  ['duplicate-reporting-group', a => { a.reportingGroups[3] = structuredClone(a.reportingGroups[0]); }, /Reporting group declarations/],
  ['extra-reporting-group', a => { a.reportingGroups.push({ id: 'unregistered-group', documents: 0 }); }, /Reporting group declarations/],
  ['swapped-document-groups-preserving-totals', a => {
    const normal = a.documents.find(d => d.id === 'resume-01');
    const edge = a.documents.find(d => d.id === 'resume-10');
    [normal.reportingGroup, edge.reportingGroup] = [edge.reportingGroup, normal.reportingGroup];
  }, /resume-01: reporting group must match frozen kind\/category/],
];
const results = [];
let ownsScratch = false;
try {
  const scratchHandle = fs.openSync(scratch, 'wx');
  ownsScratch = true;
  fs.closeSync(scratchHandle);
  for (const [name, mutate, error] of cases) {
    const copy = structuredClone(original);
    mutate(copy);
    fs.writeFileSync(scratch, JSON.stringify(copy), 'utf8');
    const result = spawnSync(process.execPath, [validator, scratch], { encoding: 'utf8' });
    assert.equal(result.status, 1, `${name} was not rejected`);
    assert.match(result.stderr, /AssertionError/, `${name} did not fail an assertion`);
    assert.match(result.stderr, error, `${name} failed for an unexpected reason`);
    results.push({ name, rejected: true });
  }
} finally {
  if (ownsScratch && fs.existsSync(scratch)) fs.unlinkSync(scratch);
}
assert.equal(fs.existsSync(scratch), false, 'Owned annotation mutation file was not removed');
console.log(JSON.stringify({ status: 'PASS', rejectedAnnotationMutations: results.length, results, scope: 'annotation-structure-only; not a candidate or production scorer' }, null, 2));
