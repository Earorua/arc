import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const defaultRoot = fileURLToPath(new URL("../../../", import.meta.url));
const bindingPath = "docs/verification/materials-native-acceptance/course-binding.integrated.json";
const bindingSha256 = "0abfafdde4125cabf7a2b56aea7497b2e1dbd75b9c8406896fa42566af858d6a";
const hash = value => createHash("sha256").update(value).digest("hex");
const fail = message => { throw new Error(`integrated-course-binding: ${message}`); };
async function checked(root, descriptor, reason = "pinned bytes differ") {
  const bytes = await readFile(path.join(root, descriptor.path));
  if (hash(bytes) !== descriptor.sha256 || (descriptor.byteLength !== undefined && bytes.length !== descriptor.byteLength)) fail(`${reason}: ${descriptor.path}`);
  return bytes;
}
function replaceValue(object, keys, before, after) {
  const parent = keys.slice(0, -1).reduce((value, key) => value[key], object), key = keys.at(-1);
  if (parent[key] !== before) fail("declared prior display value differs");
  parent[key] = after;
}

/** Actual local files are always checked; no supplied capture or reference credential is accepted. */
export async function verifyIntegratedCourseBinding(options = {}) {
  try {
    if (options === null || typeof options !== "object" || Array.isArray(options)
      || Object.keys(options).some(key => key !== "root")) fail("only the local root option is accepted");
    if (options.root !== undefined && typeof options.root !== "string") fail("root must be a local path");
    const root = path.resolve(options.root ?? defaultRoot);
    const binding = JSON.parse(await checked(root, { path: bindingPath, sha256: bindingSha256 }));
    const prior = JSON.parse(await checked(root, binding.previous.binding));
    const previous = JSON.parse(await checked(root, binding.previous.capture));
    const review = JSON.parse(await checked(root, binding.previous.review));
    if (review.result !== "reviewed-current-course-binding" || review.specificationReview.status !== "PASS" || review.codeQualityReview.status !== "PASS"
      || review.bindingSha256 !== binding.previous.binding.sha256 || review.snapshotSha256 !== binding.previous.capture.sha256
      || prior.currentCapture.sha256 !== binding.previous.capture.sha256) fail("previous binding has no matching independent review");
    await Promise.all(Object.entries(prior.frozenAssetHashes).map(([name, sha256]) => checked(root, { path: `${prior.frozenAssetDirectory}/${name}`, sha256 })));
    await Promise.all(prior.frozenInputs.map(file => checked(root, file)));

    const currentBytes = await checked(root, binding.currentCapture), current = JSON.parse(currentBytes);
    const delta = binding.sourceDelta, oldSource = previous.sourceFiles.find(file => file.path === delta.path);
    if (!isDeepStrictEqual(previous.dependencies.find(file => file.path === delta.path), delta.before)
      || oldSource.sha256 !== delta.before.sha256 || hash(Buffer.from(oldSource.content)) !== delta.before.sha256) fail("previous role source differs");
    if (delta.replacements.length !== 5 || current.dependencies.length !== binding.dependencyCount) fail("declared narrow scope differs");

    // Derive the entire permitted new capture from the reviewed previous one.
    // Only these exact display literals change. Registry/inventory/schema stay intact.
    const expected = structuredClone(previous);
    let translated = oldSource.content;
    for (const replacement of delta.replacements) {
      const before = JSON.stringify(replacement.before), after = JSON.stringify(replacement.after);
      if (translated.split(before).length !== 2) fail("display replacement absent or repeated");
      translated = translated.replace(before, after);
      replaceValue(expected.objects.role.value, replacement.objectPath, replacement.before, replacement.after);
    }
    const renamedRole = delta.replacements[0];
    replaceValue(expected.objects.blueprint.value, ["name"], renamedRole.before, renamedRole.after);
    const translatedBytes = Buffer.from(translated);
    if (hash(translatedBytes) !== delta.after.sha256 || translatedBytes.length !== delta.after.byteLength) fail("role source exceeds the five translations");
    expected.sourceFiles = expected.sourceFiles.map(file => file.path === delta.path
      ? { ...file, content: translated, sha256: delta.after.sha256, byteLength: delta.after.byteLength } : file);
    expected.dependencies = expected.dependencies.map(file => file.path === delta.path ? delta.after : file);
    expected.capture.bundleSha256 = binding.currentCapture.bundleSha256;

    const capturePath = `${prior.frozenAssetDirectory}/capture-course-reference.mjs`;
    await checked(defaultRoot, { path: capturePath, sha256: prior.frozenAssetHashes["capture-course-reference.mjs"] });
    const { canonicalJson, captureCourseReference } = await import("../materials-quality-v2/capture-course-reference.mjs");
    for (const key of ["role", "blueprint"]) expected.objects[key].sha256 = hash(canonicalJson(expected.objects[key].value));
    if (!isDeepStrictEqual(current, expected)) fail("complete capture exceeds the reviewed display delta");

    const dependencies = new Map(await Promise.all(current.dependencies.map(async file => [file.path, await checked(root, file, "current dependency differs")])));
    let reversed = dependencies.get(delta.path).toString("utf8");
    for (const replacement of [...delta.replacements].reverse()) {
      const after = JSON.stringify(replacement.after);
      if (reversed.split(after).length !== 2) fail("actual display replacement absent or repeated");
      reversed = reversed.replace(after, JSON.stringify(replacement.before));
    }
    if (hash(Buffer.from(reversed)) !== delta.before.sha256) fail("actual role delta exceeds the pinned replacements");
    const actual = await captureCourseReference({ root });
    if (!Buffer.from(`${JSON.stringify(actual, null, 2)}\n`).equals(currentBytes)) fail("actual complete capture differs");
    return { valid: true, bindingId: binding.id, bindingSha256, reviewStatus: binding.reviewStatus,
      previousBindingReviewed: true, roleSourceReplacements: delta.replacements.length,
      teachingUnits: current.inventory.templateIds.length, dependencies: current.dependencies.length,
      frozenAssetsChecked: Object.keys(prior.frozenAssetHashes).length, frozenInputsChecked: prior.frozenInputs.length,
      currentCaptureSha256: binding.currentCapture.sha256, teachingContentChanged: false,
      historicalSemanticReviewReused: true, modelQualityApproved: false, gateApproved: false };
  } catch (error) {
    if (error.message?.startsWith("integrated-course-binding:")) throw error;
    throw new Error("integrated-course-binding: required local input unavailable or invalid", { cause: error });
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.length !== 2) fail("CLI accepts no input or hash overrides");
    console.log(JSON.stringify(await verifyIntegratedCourseBinding()));
  } catch (error) {
    console.log(JSON.stringify({ valid: false, error: error.message }));
    process.exitCode = 1;
  }
}
