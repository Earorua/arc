import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadReviewedReferences } from "../materials-quality-v2/candidate-references.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const acceptanceDirectory = "docs/verification/materials-native-acceptance";
const frozenDirectory = "docs/verification/materials-quality-v2";
let verifyCourseBinding, temporaryRoot;

before(async () => {
  const verificationModule = await import("./verify-course-binding.mjs").catch((error) => {
    if (error.code === "ERR_MODULE_NOT_FOUND" && error.message.includes("verify-course-binding.mjs")) return null;
    throw error;
  });
  verifyCourseBinding = verificationModule?.verifyCourseBinding;
  if (!verifyCourseBinding) return;
  const binding = JSON.parse(await readFile(new URL("./course-binding.json", import.meta.url), "utf8"));
  const snapshot = JSON.parse(await readFile(path.join(root, binding.currentCapture.path), "utf8"));
  temporaryRoot = await mkdtemp(path.join(tmpdir(), "course-binding-20261119-"));
  const files = new Set([
    `${acceptanceDirectory}/course-binding.json`, binding.currentCapture.path,
    ...Object.keys(binding.frozenAssetHashes).map((name) => `${frozenDirectory}/${name}`),
    ...binding.frozenInputs.map((file) => file.path), ...snapshot.dependencies.map((file) => file.path),
    "node_modules/zod/package.json",
  ]);
  for (const file of files) {
    await mkdir(path.dirname(path.join(temporaryRoot, file)), { recursive: true });
    await cp(path.join(root, file), path.join(temporaryRoot, file));
  }
});

after(async () => {
  if (!temporaryRoot) return;
  const resolved = path.resolve(temporaryRoot);
  assert.equal(path.dirname(resolved), path.resolve(tmpdir()));
  assert.ok(path.basename(resolved).startsWith("course-binding-20261119-"));
  await rm(resolved, { recursive: true });
});

function verifier() {
  assert.equal(typeof verifyCourseBinding, "function", "a separately versioned current course binding verifier is required");
  return verifyCourseBinding;
}

test("binds the complete current course to reviewed facts without approving quality or the Gate", async () => {
  const result = await verifier()();
  assert.equal(result.valid, true);
  assert.equal(result.reviewStatus, "pending-independent-review");
  assert.equal(result.actualModelOrProductQualityEvaluated, false);
  assert.equal(result.newGateApproved, false);
  assert.equal(result.frozenAssetsChecked, 26);
  assert.equal(result.frozenInputsChecked, 5);
  assert.equal(result.courseDependenciesChecked, 85);
  assert.equal(result.unchangedCourseDependencies, 84);
  assert.equal(result.courseSkills, 16);
  assert.equal(result.courseUnits, 48);
  assert.equal(result.currentCaptureSha256, "9a02b60878d5d581353efb66545a56d81c9da254fd59efc3db34456015a8bed8");
  assert.equal(result.allowedDependencyChange.path, "app/contracts/planning.ts");
  assert.equal((await verifyCourseBinding({ root: temporaryRoot })).valid, true, "copied input closure must pass before drift probes");
});

test("the frozen loader still rejects the current planning schema dependency", async () => {
  verifier();
  await assert.rejects(loadReviewedReferences(root), /reference-integrity: pinned bytes differ/u);
});

async function rejectChangedFile(relative, change, expected) {
  const verify = verifier();
  const file = path.join(temporaryRoot, relative);
  const original = await readFile(file);
  try {
    await writeFile(file, change(original));
    await assert.rejects(verify({ root: temporaryRoot }), expected);
  } finally {
    await writeFile(file, original);
  }
}

test("rejects same-version course edits and other dependency drift", async () => {
  await rejectChangedFile("app/data/flagship-unit-registry.ts", (bytes) => Buffer.concat([bytes, Buffer.from("\n// same catalog version, changed source\n")]), /course-binding-integrity: current dependency differs: app\/data\/flagship-unit-registry\.ts/u);
  await rejectChangedFile("app/domain/learning.ts", (bytes) => Buffer.concat([bytes, Buffer.from("\n// unrelated drift\n")]), /course-binding-integrity: current dependency differs: app\/domain\/learning\.ts/u);
  await rejectChangedFile("app/contracts/planning.ts", (bytes) => Buffer.concat([bytes, Buffer.from("\n// additional schema drift\n")]), /course-binding-integrity: current dependency differs: app\/contracts\/planning\.ts/u);
});

test("rejects corrupted historical references, original inputs and basis bytes", async () => {
  for (const file of [
    `${frozenDirectory}/course-reference.snapshot.json`, `${frozenDirectory}/annotations.draft.json`,
    `${frozenDirectory}/course-annotations.draft.json`, `${frozenDirectory}/candidate-references.mjs`,
    "tests/fixtures/documents/quality-corpus.json", "tests/helpers/document-quality-evaluation.ts",
    "docs/superpowers/specs/2026-11-07-materials-quality-contract-v2.md",
  ]) {
    await rejectChangedFile(file, (bytes) => Buffer.concat([bytes, Buffer.from("\n")]), /course-binding-integrity: pinned bytes differ/u);
  }
});

test("rejects rewritten binding pins or a substituted old capture", async () => {
  await rejectChangedFile(`${acceptanceDirectory}/course-binding.json`, (bytes) => Buffer.concat([bytes, Buffer.from("\n")]), /course-binding-integrity: pinned bytes differ/u);
  const oldBytes = await readFile(path.join(root, frozenDirectory, "course-reference.snapshot.json"));
  await rejectChangedFile(`${acceptanceDirectory}/course-reference.current.snapshot.json`, () => oldBytes, /course-binding-integrity: pinned bytes differ/u);
  await assert.rejects(verifier()({ root: temporaryRoot, currentReference: JSON.parse(oldBytes) }), /course-binding-integrity: only the local root option is accepted/u);
});
