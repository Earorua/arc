import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const defaultRoot = fileURLToPath(new URL("../../../", import.meta.url));
const bindingPath = "docs/verification/materials-native-acceptance/course-binding.json";
const bindingSha256 = "2c04bc8a15443703454b704102c6a9c3299d92c1fd198ceeebad6b750853ca67";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fail = (message) => { throw new Error(`course-binding-integrity: ${message}`); };

async function checkedBytes(root, file, digest, byteLength, message = "pinned bytes differ") {
  const bytes = await readFile(path.join(root, file));
  if (hash(bytes) !== digest || (byteLength !== undefined && bytes.length !== byteLength)) fail(`${message}: ${file}`);
  return bytes;
}

/**
 * Recapture only from local files. The root option supports isolated drift probes;
 * callers cannot supply a capture, binding, digest or reviewed-reference credential.
 */
export async function verifyCourseBinding(options = {}) {
  try {
    if (options === null || typeof options !== "object" || Array.isArray(options)
      || Object.keys(options).some((key) => key !== "root")) fail("only the local root option is accepted");
    const rootOption = options.root ?? defaultRoot;
    if (typeof rootOption !== "string") fail("root must be a local path");
    const root = path.resolve(rootOption);
    const binding = JSON.parse(await checkedBytes(root, bindingPath, bindingSha256));
    const frozenFiles = Object.fromEntries(await Promise.all(Object.entries(binding.frozenAssetHashes).map(async ([name, digest]) => [
      name, await checkedBytes(root, `${binding.frozenAssetDirectory}/${name}`, digest),
    ])));
    const source = JSON.parse(frozenFiles["annotations.draft.json"]);
    const sourceReview = JSON.parse(frozenFiles["source-review-verification.json"]);
    const courseReview = JSON.parse(frozenFiles["course-review-verification.json"]);
    if (!sourceReview.sourceReviewPassed || !sourceReview.annotationToolsQualityReviewPassed
      || !courseReview.independentReviews.specification.passed || !courseReview.independentReviews.codeQuality.passed) fail("missing historical independent review");
    const frozenInputs = [...source.inputHashes, ...source.basis].map(({ path: file, sha256 }) => ({ path: file, sha256 }));
    if (!isDeepStrictEqual(frozenInputs, binding.frozenInputs)) fail("original input or basis descriptors differ");
    await Promise.all(frozenInputs.map((file) => checkedBytes(root, file.path, file.sha256)));

    const reviewed = JSON.parse(frozenFiles["course-reference.snapshot.json"]);
    const currentBytes = await checkedBytes(root, binding.currentCapture.path, binding.currentCapture.sha256, binding.currentCapture.byteLength);
    const current = JSON.parse(currentBytes);
    const change = binding.permittedDependencyChange;
    if (!isDeepStrictEqual(reviewed.dependencies.find((file) => file.path === change.path), change.before)) fail("reviewed schema dependency differs");
    // Compare the entire snapshots. These are the only two permitted differences:
    // the one dependency descriptor and the separately pinned generated bundle.
    const expectedCurrent = structuredClone(reviewed);
    expectedCurrent.dependencies = reviewed.dependencies.map((file) => file.path === change.path ? change.after : file);
    expectedCurrent.capture.bundleSha256 = binding.currentCapture.bundleSha256;
    if (!isDeepStrictEqual(current, expectedCurrent)) fail("complete course or dependency closure differs");
    if (current.dependencies.length !== binding.dependencyCount) fail("dependency count differs");
    const dependencies = new Map(await Promise.all(current.dependencies.map(async (file) => [
      file.path, await checkedBytes(root, file.path, file.sha256, file.byteLength, "current dependency differs"),
    ])));
    const planningText = dependencies.get(change.path).toString("utf8");
    const replacement = change.sourceReplacement;
    if (planningText.split(replacement.after).length !== 2) fail("specific schema replacement is absent or repeated");
    const previousBytes = Buffer.from(planningText.replace(replacement.after, replacement.before));
    if (hash(previousBytes) !== change.before.sha256 || previousBytes.length !== change.before.byteLength) fail("schema delta exceeds the pinned replacement");

    // Execute the unchanged adjacent capture implementation, after checking the
    // exact module bytes actually imported as well as the probe root's copy.
    const captureName = "capture-course-reference.mjs";
    await checkedBytes(defaultRoot, `${binding.frozenAssetDirectory}/${captureName}`, binding.frozenAssetHashes[captureName]);
    const { captureCourseReference } = await import("../materials-quality-v2/capture-course-reference.mjs");
    const recaptured = await captureCourseReference({ root });
    if (!Buffer.from(`${JSON.stringify(recaptured, null, 2)}\n`).equals(currentBytes)) fail("actual complete current capture differs");
    return {
      valid: true,
      bindingId: binding.id,
      bindingSha256,
      reviewStatus: binding.reviewStatus,
      currentCourseEquivalent: true,
      frozenAssetsChecked: Object.keys(frozenFiles).length,
      frozenInputsChecked: frozenInputs.length,
      courseDependenciesChecked: current.dependencies.length,
      unchangedCourseDependencies: current.dependencies.length - 1,
      courseSkills: current.inventory.blueprintSkillIds.length,
      courseUnits: current.inventory.templateIds.length,
      reviewedCaptureSha256: binding.reviewedCapture.sha256,
      currentCaptureSha256: binding.currentCapture.sha256,
      currentBundleSha256: binding.currentCapture.bundleSha256,
      allowedDependencyChange: { path: change.path, before: change.before, after: change.after, sourceCommit: change.sourceCommit },
      historicalCourseSemanticJudgments: "reused-unchanged-independent-reviews",
      actualModelOrProductQualityEvaluated: false,
      newGateApproved: false,
    };
  } catch (error) {
    if (error.message?.startsWith("course-binding-integrity:")) throw error;
    throw new Error("course-binding-integrity: required local input unavailable or invalid", { cause: error });
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.length !== 2) fail("CLI accepts no input, hash, root or output overrides");
    console.log(JSON.stringify(await verifyCourseBinding()));
  } catch (error) {
    console.log(JSON.stringify({ valid: false, error: error.message }));
    process.exitCode = 1;
  }
}
