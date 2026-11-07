import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sha256, deepFreeze } from "./candidate-common.mjs";
import { verifySourceLedger } from "./candidate-source.mjs";
import { verifyPlanningReference } from "./candidate-planning.mjs";

const assetDirectory = "docs/verification/materials-quality-v2";
const defaultRoot = fileURLToPath(new URL("../../../", import.meta.url));
const verified = new WeakSet();
export const REFERENCE_HASHES = Object.freeze({
  "annotations.draft.json": "e512e3fca67fd9133cae4e9186cb054c3044d79b090d567daaba24cb85bd9ef9",
  "source-review-verification.json": "8e2fc2715be731a8dda200b581914920751a50ab16a88f222e3efcd308bebd3b",
  "course-annotations.draft.json": "c602035d36fba77a36287149891b775c2ed9420d64612f0cbd76309fc02d6bcf",
  "course-reference.snapshot.json": "bf458308b5811f60b61f6e5fa24f6910642a7276615f0b212d930d04868d9676",
  "course-review-verification.json": "3cde20901af973bb446c931aab64b57f66dae9683c6d78277dec1cec1c4598dc",
  "capture-course-reference.mjs": "3735c41c91d7d5dbaaf9ebf5b0037dd8a4b3c09f225fdac6d3d734a000db4423",
  "validate-course-annotations.mjs": "f03741ca32f54e73163d07c0a353c9491513274214f8d058e5304b8469f30886",
  "planning-reference-cases.json": "b4980e489b40857514e85afb1fafad15efa8a8976bfd388d0af378430e9a2c51",
});

async function checkedBytes(root, relative, digest) {
  const bytes = await readFile(path.join(root, relative));
  if (sha256(bytes) !== digest) throw new Error("reference-integrity: pinned bytes differ");
  return bytes;
}

/** The CLI has no override for its trust root. The API root supports offline drift probes. */
export async function loadReviewedReferences(root = defaultRoot) {
  try {
    if (typeof root !== "string") throw new Error("reference-integrity: root must be a path");
    root = path.resolve(root);
    const files = Object.fromEntries(await Promise.all(Object.entries(REFERENCE_HASHES).map(async ([name, digest]) => [name, await checkedBytes(root, `${assetDirectory}/${name}`, digest)])));
    const source = JSON.parse(files["annotations.draft.json"]);
    const course = JSON.parse(files["course-annotations.draft.json"]);
    const snapshot = JSON.parse(files["course-reference.snapshot.json"]);
    const planning = JSON.parse(files["planning-reference-cases.json"]);
    const courseProof = JSON.parse(files["course-review-verification.json"]);
    const sourceProof = JSON.parse(files["source-review-verification.json"]);
    if (!sourceProof.sourceReviewPassed || !sourceProof.annotationToolsQualityReviewPassed || !courseProof.independentReviews.specification.passed || !courseProof.independentReviews.codeQuality.passed) throw new Error("reference-integrity: missing independent review");
    // All 3 immutable original inputs (legacy scorer read only as bytes), both
    // basis documents and all 85 course dependency files pass BEFORE evaluation.
    const inputs = new Map(await Promise.all([...source.inputHashes, ...source.basis, ...snapshot.dependencies].map(async (file) => [file.path, await checkedBytes(root, file.path, file.sha256)])));
    const { captureCourseReference } = await import(pathToFileURL(path.join(root, assetDirectory, "capture-course-reference.mjs")).href);
    const { validateCourseAnnotations } = await import(pathToFileURL(path.join(root, assetDirectory, "validate-course-annotations.mjs")).href);
    const currentReference = await captureCourseReference({ root });
    const result = validateCourseAnnotations(course, { snapshot, sourceAnnotationText: files["annotations.draft.json"].toString("utf8"), currentReference });
    if (!result.valid) throw new Error("reference-integrity: complete current course mismatch");
    const corpora = source.inputHashes.slice(0, 2).flatMap((file) => JSON.parse(inputs.get(file.path)).documents).map(({ id, documentVersionId, textVersionId, text, segments }) => ({ id, documentVersionId, textVersionId, text, segments }));
    verifySourceLedger(source, corpora);
    const references = { source, course, snapshot, planning, corpora, skillIds: snapshot.inventory.blueprintSkillIds,
      digests: { assets: { ...REFERENCE_HASHES }, frozenInputs: [...source.inputHashes, ...source.basis].map(({ path: file, sha256: digest }) => ({ path: file, sha256: digest })),
        courseObjects: Object.fromEntries(Object.entries(snapshot.objects).map(([name, object]) => [name, object.sha256])), courseDependencies: snapshot.dependencies.length } };
    verifyPlanningReference(planning, references);
    deepFreeze(references); verified.add(references); return references;
  } catch (error) {
    if (error.message?.startsWith("reference-integrity:")) throw error;
    throw new Error("reference-integrity: required local input unavailable or invalid");
  }
}

export function isReviewedReferences(references) { return verified.has(references); }
