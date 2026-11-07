import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import { flagshipBlueprint } from "../../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../../app/data/flagship-unit-registry";
import { mapMaterialItems, mapMaterialItemTerms, MATERIAL_MAPPING_VERSION } from "../../../app/lib/materials/skill-mapper";
import { validateDocumentExtraction } from "../../../app/server/documents/extraction-validator";
import { KIMI_GROUNDED_TERMS_POLICY_ID } from "../../../app/server/documents/policy";
import { collectProjectionObservations } from "./collect-projections";

const maximumBytes = 8 * 1024 * 1024;
const collectorPath = fileURLToPath(new URL("./collect-projections.ts", import.meta.url));
const checkout = fileURLToPath(new URL("../../../", import.meta.url));
const temporaryParent = realpathSync(tmpdir());
const temporary = mkdtempSync(join(temporaryParent, "product-projection-test-"));
after(() => {
  const withinParent = relative(temporaryParent, realpathSync(temporary));
  assert.ok(withinParent && !withinParent.startsWith(`..${sep}`) && !withinParent.includes(sep));
  rmSync(temporary, { recursive: true });
});

function scenario(text = "SQL is required", labels: string[] = ["SQL"]) {
  return {
    id: "scenario-sql", ownerId: "Owner_01",
    reference: {
      ownerId: "Owner_01", documentId: "doc-a", documentVersionId: "version-a", textVersionId: "text-a",
      lifecycle: "active", text, segments: [{ id: "segment-1", start: 0, end: text.length }],
    },
    extraction: {
      schemaVersion: "2026.11.1",
      items: [{ id: "fact-a", kind: "requirement", text, requirementLevel: "must" as string | null,
        skillLabels: labels, selfLevelHint: null as string | null, source: { segmentId: "segment-1", quote: text } }],
      reviewPoints: [] as { code: string; source: { segmentId: string; quote: string } }[],
    },
    learningIntentItemIds: [] as string[],
  };
}

function input(scenarios: unknown[] = [scenario()]) {
  return { schemaVersion: "materials-product-projection-input-1",
    provenance: { kind: "constructed-control", description: "Locally authored synthetic component stimulus." }, scenarios };
}

function collect(scenarios: unknown[] = [scenario()]) {
  const report = collectProjectionObservations(JSON.stringify(input(scenarios)));
  assert.ok(report, "collector returns the observed SQL projection");
  return report;
}

function project(stimulus = scenario()) {
  const report = collect([stimulus]);
  const observed = report.scenarios[0];
  assert.ok(observed);
  assert.equal(observed.outcome, "projected");
  if (observed.outcome !== "projected") throw new Error("Expected projected observation");
  return observed;
}

function rejectInput(value: unknown, code = "invalid-input") {
  assert.throws(() => collectProjectionObservations(JSON.stringify(value)), { message: code });
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

let fileCounter = 0;
function inputFile(contents: string | Buffer) {
  const filename = join(temporary, `input-${fileCounter++}.json`);
  writeFileSync(filename, contents);
  return filename;
}

function cli(args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", collectorPath, ...args], {
    encoding: "utf8", windowsHide: true, timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
  });
}

test("observes the actual SQL literal projection and native mappings", () => {
  const stimulus = scenario();
  const observed = project(stimulus);
  const native = validateDocumentExtraction(stimulus.extraction, stimulus.ownerId, stimulus.reference, KIMI_GROUNDED_TERMS_POLICY_ID);
  assert.deepEqual(observed.projection, native);
  assert.deepEqual(observed.termMappings, mapMaterialItemTerms(native.items, flagshipBlueprint, flagshipUnitRegistry));
  assert.deepEqual(observed.itemMappings, mapMaterialItems(native.items, flagshipBlueprint, flagshipUnitRegistry));
  assert.deepEqual(observed.termMappings, [{ itemId: "fact-a", term: "SQL", status: "mapped", skillIds: ["sql"], basis: "literal" }]);
  assert.deepEqual(observed.itemMappings, [{ itemId: "fact-a", status: "mapped", skillIds: ["sql"], labels: ["SQL & Relational Modeling"] }]);
  assert.equal(observed.projection.reviewProjection, "grounded-skill-labels-v2");
});

test("observes a genuinely grounded contextual term without supplying a course answer", () => {
  const observed = project(scenario("Build UI tokens for accessible component focus.", ["UI tokens"]));
  assert.deepEqual(observed.projection.items[0]?.skillLabels, ["UI tokens"]);
  assert.deepEqual(observed.termMappings, [{ itemId: "fact-a", term: "UI tokens", status: "mapped", skillIds: ["design-systems"], basis: "contextual" }]);
});

test("uses the fixed grounded projection for a reviewed equivalent absent literally from the source", () => {
  const observed = project(scenario("我在指导下清洗数据。", ["data cleaning"]));
  assert.deepEqual(observed.projection.items[0]?.skillLabels, ["data cleaning"]);
  assert.deepEqual(observed.termMappings, [{ itemId: "fact-a", term: "data cleaning", status: "uncovered", skillIds: [], basis: null }]);
});

test("preserves authored input separately from filtered labels and native normalization", () => {
  const stimulus = scenario("SQL is required", [" SQL ", " Rust "]);
  const before = structuredClone(stimulus);
  const observed = project(stimulus);
  assert.deepEqual(stimulus, before);
  assert.deepEqual(observed.rawExtraction, before.extraction);
  assert.deepEqual(observed.projection.items[0]?.skillLabels, ["SQL"]);
  assert.deepEqual(observed.labelRemovals, [{ candidateId: "fact-a", submittedLabels: [" SQL ", " Rust "],
    validatedLabels: ["SQL", "Rust"], projectedLabels: ["SQL"], removedLabels: ["Rust"] }]);
});

test("retains empty lists and records their gap without inventing a null mapping", () => {
  const observed = project(scenario("SQL is required", []));
  assert.deepEqual(observed.projection.items[0]?.skillLabels, []);
  assert.deepEqual(observed.termMappings, []);
  assert.deepEqual(observed.itemMappings, []);
  assert.ok(observed.gaps.some(gap => gap.code === "empty-term-list" && gap.itemId === "fact-a"));
  assert.ok(observed.gaps.some(gap => gap.code === "native-task-coverage-absent"));
});

test("keeps a fully filtered candidate as an empty-term gap", () => {
  const observed = project(scenario("SQL is required", ["Rust"]));
  assert.deepEqual(observed.labelRemovals[0]?.removedLabels, ["Rust"]);
  assert.deepEqual(observed.termMappings, []);
  assert.deepEqual(observed.itemMappings, []);
  assert.ok(observed.gaps.some(gap => gap.code === "empty-term-list" && gap.itemId === "fact-a"));
});

test("does not invent an item or coverage for a zero-candidate projection", () => {
  const stimulus = scenario();
  stimulus.extraction.items = [];
  const observed = project(stimulus);
  assert.deepEqual(observed.projection.items, []);
  assert.deepEqual(observed.termMappings, []);
  assert.deepEqual(observed.itemMappings, []);
  assert.ok(observed.gaps.some(gap => gap.code === "native-task-coverage-absent"));
});

test("passes constraint intent only as an explicit component stimulus", () => {
  const stimulus = scenario("Practice SQL every evening.");
  stimulus.extraction.items[0]!.kind = "constraint";
  stimulus.extraction.items[0]!.requirementLevel = null;
  const withoutIntent = project(stimulus);
  assert.deepEqual(withoutIntent.termMappings, [{ itemId: "fact-a", term: "SQL", status: "non-learning", skillIds: [], basis: null }]);
  assert.deepEqual(withoutIntent.itemMappings, [{ itemId: "fact-a", status: "non-learning", skillIds: [], labels: [] }]);
  stimulus.learningIntentItemIds = ["fact-a"];
  const withIntent = project(stimulus);
  assert.deepEqual(withIntent.learningIntentItemIds, ["fact-a"]);
  assert.deepEqual(withIntent.termMappings, [{ itemId: "fact-a", term: "SQL", status: "mapped", skillIds: ["sql"], basis: "literal" }]);
  assert.equal(collect([stimulus]).scope.learningIntent, "component-stimulus-only");
});

test("preserves the native empty constraint item group even with no terms", () => {
  const stimulus = scenario("Practice SQL every evening.", []);
  stimulus.extraction.items[0]!.kind = "constraint";
  stimulus.extraction.items[0]!.requirementLevel = null;
  const observed = project(stimulus);
  assert.deepEqual(observed.termMappings, []);
  assert.deepEqual(observed.itemMappings, [{ itemId: "fact-a", status: "non-learning", skillIds: [], labels: [] }]);
  assert.ok(observed.gaps.some(gap => gap.code === "empty-term-list"));
});

test("keeps source-bound hints and unresolved review points separate from projected items", () => {
  const stimulus = scenario("I used SQL with guidance.", ["Rust", "SQL"]);
  stimulus.extraction.items[0]!.kind = "experience";
  stimulus.extraction.items[0]!.requirementLevel = null;
  stimulus.extraction.items[0]!.selfLevelHint = "guided";
  stimulus.extraction.reviewPoints.push({ code: "confirm-self-assessment", source: { segmentId: "segment-1", quote: stimulus.reference.text } });
  const observed = project(stimulus);
  assert.deepEqual(observed.projection.selfAssessmentHints, [{ id: "hint-fact-a-1", candidateId: "fact-a", skillLabel: "SQL", level: "guided" }]);
  assert.equal(Object.hasOwn(observed.projection.items[0]!, "selfLevelHint"), false);
  assert.equal(observed.projection.reviewPoints[0]?.resolution, "unresolved");
  assert.deepEqual(observed.projection.reviewPoints[0]?.sourceRef, observed.projection.items[0]?.sourceRef);
});

for (const reason of ["quote", "owner", "revoked", "ambiguous-quote", "missing-segment"] as const) {
  test(`records native invalid-content for ${reason} without synthesized outputs`, () => {
    const stimulus = scenario();
    if (reason === "quote") stimulus.extraction.items[0]!.source.quote = "Invented Rust quote";
    if (reason === "owner") stimulus.ownerId = "Other_Owner";
    if (reason === "revoked") stimulus.reference.lifecycle = "revoked";
    if (reason === "ambiguous-quote") {
      stimulus.reference.text = "SQL and SQL";
      stimulus.reference.segments[0]!.end = stimulus.reference.text.length;
      stimulus.extraction.items[0]!.source.quote = "SQL";
    }
    if (reason === "missing-segment") stimulus.extraction.items[0]!.source.segmentId = "absent";
    const observed = collect([stimulus]).scenarios[0]!;
    assert.equal(observed.outcome, "rejected");
    if (observed.outcome !== "rejected") throw new Error("Expected native rejection");
    assert.deepEqual(observed.rejection, { code: "invalid-content" });
    assert.deepEqual(observed.rawExtraction, stimulus.extraction);
    for (const absent of ["projection", "termMappings", "itemMappings", "labelRemovals"]) assert.equal(Object.hasOwn(observed, absent), false);
  });
}

for (const malformed of [null, [], "candidate text", {}, { schemaVersion: "wrong", items: [] },
  { ...scenario().extraction, expectedCoverage: ["forged"] }]) {
  test(`preserves malformed canonical extraction for product rejection: ${JSON.stringify(malformed).slice(0, 45)}`, () => {
    const observed = collect([{ ...scenario(), extraction: malformed }]).scenarios[0]!;
    assert.equal(observed.outcome, "rejected");
    assert.deepEqual(observed.rawExtraction, malformed);
  });
}

function duplicateNativeReviewPoints() {
  const stimulus = scenario();
  stimulus.reference.segments.push({ ...stimulus.reference.segments[0]!, id: "segment-2" });
  stimulus.extraction.reviewPoints = ["segment-1", "segment-2"].map(segmentId => ({ code: "missing-information", source: { segmentId, quote: "SQL" } }));
  return stimulus;
}

test("propagates an unexpected native exception instead of calling it a normal rejection", () => {
  assert.throws(() => collect([duplicateNativeReviewPoints()]), error => error instanceof Error
    && error.name === "ZodError" && error.message.includes("Duplicate review point IDs"));
});

test("only accepts JSON text and rejects malformed or oversized JSON", () => {
  assert.throws(() => collectProjectionObservations(input() as unknown as string), { message: "invalid-input" });
  assert.throws(() => collectProjectionObservations("{"), { message: "invalid-json" });
  assert.throws(() => collectProjectionObservations(" ".repeat(maximumBytes + 1)), { message: "input-too-large" });
  assert.throws(() => collectProjectionObservations(`"${"数".repeat(Math.floor(maximumBytes / 3) + 1)}"`), { message: "input-too-large" });
  for (const value of [null, [], "text", {}]) rejectInput(value);
});

test("enforces scenario count, unique IDs, nonempty description, and required fields", () => {
  rejectInput(input([]));
  rejectInput(input(Array.from({ length: 513 }, (_, i) => ({ ...scenario(), id: `scenario-${i}` }))));
  rejectInput(input([scenario(), scenario()]));
  rejectInput({ ...input(), provenance: { kind: "constructed-control", description: "  " } });
  rejectInput({ ...input(), provenance: { kind: "constructed-control", description: "x".repeat(2001) } });
  const withoutExtraction: Record<string, unknown> = scenario();
  delete withoutExtraction.extraction;
  rejectInput(input([withoutExtraction]));
});

test("rejects duplicate, unknown, malformed, or excessive learning intent IDs", () => {
  for (const ids of [["fact-a", "fact-a"], ["not-submitted"], ["Bad ID"], Array.from({ length: 101 }, (_, i) => `fact-${i}`)]) {
    rejectInput(input([{ ...scenario(), learningIntentItemIds: ids }]));
  }
  rejectInput(input([{ ...scenario(), extraction: null, learningIntentItemIds: ["fact-a"] }]));
  const stimulus = scenario();
  stimulus.extraction.schemaVersion = "malformed";
  stimulus.learningIntentItemIds = ["fact-a"];
  assert.equal(collect([stimulus]).scenarios[0]?.outcome, "rejected");
});

test("rejects unexpected wrapper, provenance, scenario, reference, and segment keys", () => {
  rejectInput({ ...input(), courseObservations: [{ expected: "forged" }] });
  rejectInput({ ...input(), provenance: { ...input().provenance, approved: true } });
  for (const key of ["providerPolicyId", "blueprint", "registry", "aliases", "expectedOutputs", "expectedCoverage", "scorerAnswer", "userMappings"]) {
    rejectInput(input([{ ...scenario(), [key]: {} }]));
  }
  const stimulus = scenario();
  rejectInput(input([{ ...stimulus, reference: { ...stimulus.reference, authenticated: true } }]));
  rejectInput(input([{ ...stimulus, reference: { ...stimulus.reference, segments: [{ ...stimulus.reference.segments[0], trusted: true }] } }]));
});

test("validates source fixture identity syntax and bounds before projection", () => {
  for (const field of ["documentId", "documentVersionId", "textVersionId"] as const) {
    for (const value of ["", "Bad Id", "a".repeat(257)]) {
      const stimulus = scenario();
      stimulus.reference[field] = value;
      rejectInput(input([stimulus]));
    }
  }
  for (const value of ["", "owner with spaces", "x".repeat(257)]) {
    rejectInput(input([{ ...scenario(), ownerId: value }]));
    rejectInput(input([{ ...scenario(), reference: { ...scenario().reference, ownerId: value } }]));
  }
  for (const text of ["", "x".repeat(50_001)]) {
    rejectInput(input([{ ...scenario(), reference: { ...scenario().reference, text } }]));
  }
  rejectInput(input([{ ...scenario(), reference: { ...scenario().reference, lifecycle: "deleted" } }]));
});

test("rejects duplicate segments and invalid or split-surrogate offsets", () => {
  const original = scenario();
  rejectInput(input([{ ...original, reference: { ...original.reference, segments: [original.reference.segments[0], original.reference.segments[0]] } }]));
  for (const segment of [{ id: "segment-1", start: -1, end: 1 }, { id: "segment-1", start: 0.5, end: 1 },
    { id: "segment-1", start: 1, end: 1 }, { id: "segment-1", start: 0, end: 999_999 }, { id: "bad id", start: 0, end: 1 }]) {
    rejectInput(input([{ ...original, reference: { ...original.reference, segments: [segment] } }]));
  }
  for (const segment of [{ id: "segment-1", start: 1, end: 2 }, { id: "segment-1", start: 0, end: 1 }]) {
    rejectInput(input([{ ...original, reference: { ...original.reference, text: "😀SQL", segments: [segment] } }]));
  }
  rejectInput(input([{ ...original, reference: { ...original.reference,
    segments: Array.from({ length: 1001 }, (_, i) => ({ id: `segment-${i}`, start: 0, end: 1 })) } }]));
});

test("accepts whole astral source boundaries and never substitutes task or planning answers", () => {
  const stimulus = scenario("😀 SQL is required.");
  const report = collect([stimulus]);
  assert.equal(report.scenarios[0]?.outcome, "projected");
  assert.equal(Object.hasOwn(report, "courseObservations"), false);
  assert.equal(Object.hasOwn(report, "planObservations"), false);
  assert.equal(report.actualModelQualityEvaluated, false);
  assert.equal(report.actualProductIntegrationVerified, false);
  assert.equal(report.qualificationApproved, false);
  assert.equal(report.realModelCalls, 0);
  assert.equal(report.candidateEvaluation.status, "incomplete");
  assert.equal(report.scope.userConfirmation, "not-performed");
});

test("records deterministic exact input and canonical ordered scenario hashes without mutation", () => {
  const first = scenario();
  const second = { ...scenario("Use UI tokens for accessible component focus.", ["UI tokens"]), id: "scenario-ui" };
  const wrapper = input([first, second]);
  const json = JSON.stringify(wrapper, null, 2);
  const before = structuredClone(wrapper);
  const report = collectProjectionObservations(json);
  assert.ok(report);
  assert.deepEqual(report, collectProjectionObservations(json));
  assert.deepEqual(wrapper, before);
  assert.equal(report.inputSha256, sha256(json));
  assert.deepEqual(report.scenarios.map(observed => [observed.id, observed.inputSha256]),
    [first, second].map(stimulus => [stimulus.id, sha256(canonical(stimulus))]));
  const compact = collectProjectionObservations(JSON.stringify(wrapper));
  assert.ok(compact);
  assert.notEqual(compact.inputSha256, report.inputSha256);
  assert.deepEqual(compact.scenarios, report.scenarios);
  const observed = report.scenarios[0]!;
  assert.deepEqual(observed.sourceFixture, { kind: "constructed-control", authenticatedRepositoryRecord: false, reference: first.reference });
  assert.deepEqual(observed.rawExtraction, first.extraction);
});

test("records actual catalog fingerprints and declared partial code evidence", () => {
  const report = collect();
  assert.equal(report.product.providerPolicyId, KIMI_GROUNDED_TERMS_POLICY_ID);
  assert.equal(report.product.mappingVersion, MATERIAL_MAPPING_VERSION);
  assert.deepEqual(report.product.blueprint, { id: flagshipBlueprint.id, version: flagshipBlueprint.version, canonicalSha256: sha256(canonical(flagshipBlueprint)) });
  assert.deepEqual(report.product.registry, { id: flagshipUnitRegistry.id, version: flagshipUnitRegistry.version, canonicalSha256: sha256(canonical(flagshipUnitRegistry)) });
  assert.equal(report.product.codeProvenance.scope, "declared-relevant-files-only");
  assert.equal(report.product.codeProvenance.completeRuntimeAttestation, false);
  const codePaths = report.product.codeProvenance.files.map(file => file.path);
  assert.ok(codePaths.includes("app/server/documents/extraction-validator.ts"));
  assert.ok(codePaths.includes("app/lib/materials/skill-mapper.ts"));
  assert.ok(codePaths.includes("docs/verification/materials-product-observations/collect-projections.ts"));
  for (const file of report.product.codeProvenance.files) assert.equal(file.sha256, sha256(readFileSync(resolve(checkout, file.path))));
});

test("CLI emits a collected incomplete report with exit 1 and leaves the input untouched", () => {
  const text = JSON.stringify(input());
  const filename = inputFile(text);
  const result = cli([filename]);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  const report = JSON.parse(result.stdout);
  assert.equal(report.candidateEvaluation.status, "incomplete");
  assert.equal(report.scenarios[0]?.outcome, "projected");
  assert.deepEqual(report, collectProjectionObservations(text));
  assert.equal(readFileSync(filename, "utf8"), text);
});

test("CLI reports usage errors for missing, extra, or option arguments", () => {
  for (const args of [[], ["one.json", "two.json"], ["--help"], ["-"], ["https://example.invalid/input.json"], ["\\\\server\\share\\input.json"]]) {
    const result = cli(args);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "projection-collector: usage\n");
  }
});

test("CLI rejects invalid UTF-8 and over-limit file bytes before parsing", () => {
  for (const [contents, code] of [[Buffer.from([0xc3, 0x28]), "invalid-utf8"], [Buffer.alloc(maximumBytes + 1, 32), "input-too-large"]] as const) {
    const result = cli([inputFile(contents)]);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, `projection-collector: ${code}\n`);
  }
});

test("CLI gives short stable input and unexpected-implementation errors", () => {
  for (const [filename, code] of [[join(temporary, "does-not-exist.json"), "unreadable-input"], [temporary, "unreadable-input"],
    [inputFile("{"), "invalid-json"], [inputFile(JSON.stringify(input([duplicateNativeReviewPoints()]))), "implementation-error"]]) {
    const result = cli([filename!]);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, `projection-collector: ${code}\n`);
  }
});

test("importing the API does not run the CLI", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval",
    `await import(${JSON.stringify(new URL("./collect-projections.ts", import.meta.url).href)});`],
  { encoding: "utf8", windowsHide: true, timeout: 30_000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});
