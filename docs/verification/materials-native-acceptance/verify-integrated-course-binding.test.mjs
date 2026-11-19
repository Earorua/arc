import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { verifyCourseBinding } from "./verify-course-binding.mjs";
import { loadReviewedReferences } from "../materials-quality-v2/candidate-references.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const directory = "docs/verification/materials-native-acceptance";
let verify, fixtureRoot;

before(async () => {
  const verificationModule = await import("./verify-integrated-course-binding.mjs").catch(error => {
    if (error.code === "ERR_MODULE_NOT_FOUND" && error.message.includes("verify-integrated-course-binding.mjs")) return null;
    throw error;
  });
  verify = verificationModule?.verifyIntegratedCourseBinding;
  if (!verify) return;
  const prior = JSON.parse(await readFile(path.join(root, directory, "course-binding.json"), "utf8"));
  const binding = JSON.parse(await readFile(path.join(root, directory, "course-binding.integrated.json"), "utf8"));
  const capture = JSON.parse(await readFile(path.join(root, binding.currentCapture.path), "utf8"));
  fixtureRoot = await mkdtemp(path.join(tmpdir(), "course-integrated-binding-"));
  const files = new Set([
    `${directory}/course-binding.integrated.json`, binding.currentCapture.path,
    ...Object.values(binding.previous).map(file => file.path),
    ...Object.keys(prior.frozenAssetHashes).map(name => `${prior.frozenAssetDirectory}/${name}`),
    ...prior.frozenInputs.map(file => file.path), ...capture.dependencies.map(file => file.path),
    "node_modules/zod/package.json",
  ]);
  for (const file of files) {
    await mkdir(path.dirname(path.join(fixtureRoot, file)), { recursive: true });
    await cp(path.join(root, file), path.join(fixtureRoot, file));
  }
});

after(async () => {
  if (!fixtureRoot) return;
  assert.equal(path.dirname(path.resolve(fixtureRoot)), path.resolve(tmpdir()));
  assert.ok(path.basename(fixtureRoot).startsWith("course-integrated-binding-"));
  await rm(fixtureRoot, { recursive: true });
});

function verifier() {
  assert.equal(typeof verify, "function", "a separate integrated binding verifier is required");
  return verify;
}

async function changed(file, change, expected = /integrated-course-binding:/u) {
  const check = verifier(), absolute = path.join(fixtureRoot, file), original = await readFile(absolute);
  try {
    await writeFile(absolute, change(original));
    await assert.rejects(check({ root: fixtureRoot }), expected);
  } finally { await writeFile(absolute, original); }
}

test("accepts only the integrated display delta while previous loaders reject the new source", async () => {
  const result = await verifier()();
  assert.equal(result.valid, true);
  assert.equal(result.roleSourceReplacements, 5);
  assert.equal(result.teachingUnits, 48);
  assert.equal(result.dependencies, 85);
  assert.equal(result.frozenAssetsChecked, 26);
  assert.equal(result.teachingContentChanged, false);
  assert.equal(result.modelQualityApproved, false);
  assert.equal(result.gateApproved, false);
  assert.equal((await verify({ root: fixtureRoot })).valid, true);
  await assert.rejects(verifyCourseBinding(), /course-binding-integrity:/u);
  await assert.rejects(loadReviewedReferences(root), /reference-integrity:/u);
});

test("rejects a sixth role edit, teaching content changes and other dependency drift", async () => {
  for (const file of ["app/data/flagship-role.ts", "app/data/flagship-unit-registry.ts", "app/contracts/planning.ts"]) {
    await changed(file, bytes => Buffer.concat([bytes, Buffer.from("\n// unreviewed edit\n")]), /integrated-course-binding: current dependency differs/u);
  }
});

test("rejects altered current or prior binding evidence and frozen reference bytes", async () => {
  for (const file of ["course-binding.integrated.json", "course-reference.integrated.snapshot.json", "course-binding.json", "course-reference.current.snapshot.json", "course-binding-review-receipt.json"]) {
    await changed(`${directory}/${file}`, bytes => Buffer.concat([bytes, Buffer.from("\n")]));
  }
  await changed("docs/verification/materials-quality-v2/course-annotations.draft.json", bytes => Buffer.concat([bytes, Buffer.from("\n")]));
});

test("rejects caller-supplied captures, hashes and substituted historical captures", async () => {
  await assert.rejects(verifier()({ root: fixtureRoot, capture: {} }), /integrated-course-binding: only the local root option is accepted/u);
  await assert.rejects(verify({ root: fixtureRoot, sha256: "0".repeat(64) }), /integrated-course-binding: only the local root option is accepted/u);
  const old = await readFile(path.join(root, directory, "course-reference.current.snapshot.json"));
  await changed(`${directory}/course-reference.integrated.snapshot.json`, () => old);
});
