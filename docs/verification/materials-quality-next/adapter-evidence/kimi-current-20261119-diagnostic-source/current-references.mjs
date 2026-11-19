import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256, deepFreeze } from "../materials-quality-v2/candidate-common.mjs";
import { verifySourceLedger } from "../materials-quality-v2/candidate-source.mjs";

const defaultRoot = fileURLToPath(new URL("../../../", import.meta.url));
const native = "docs/verification/materials-native-acceptance";
const historical = "docs/verification/materials-quality-v2";
const verified = new WeakMap();
// These are independently reviewed receipts, not mutable approval fields in a binding.
const pins = Object.freeze({
  [`${native}/course-binding.integrated.json`]: "0abfafdde4125cabf7a2b56aea7497b2e1dbd75b9c8406896fa42566af858d6a",
  [`${native}/verify-integrated-course-binding.mjs`]: "4949812876d6f2b26e13aa7c1e199fe5105f6ea78fb9ec5a57d56a117d6fb19b",
  [`${native}/integrated-course-review-receipt.json`]: "e18eae6e138179ba87c7e4d2a3f765948422aa4285f72d55908f8a0a0e7a1779",
  [`${native}/planning-acceptance-receipt.json`]: "443ed4d3d35034c100487a9d5d6331e8caa3ec5835d9b087a649e6ef68c3fc3c",
  [`${native}/planning-integration-reuse-review.md`]: "6b3ce1d948b666ca3dd4371e59815da3a8485c5c94f23b493eaee3436151e048",
  [`${native}/native-evidence/manifest.json`]: "c65d84b1048dbad28f0eea7e21e81c77c4c577b43c0bb67ab77fb978fd1b6d4d",
  [`${native}/native-evidence/check.json`]: "d9026957497342116e47e7c77071839fe669119b33958adf89c304fc216461de",
  "scripts/materials-qualification-capture.ts": "f55c6df1f9580b170f29e0cb0b254d81fc4f3bc5b905c7f7d9a6f67bbde91c32",
  "scripts/materials-qualification-runner.ts": "a8a2c715d9d097795849d71c337a66b01f060add948ae346c35611e6ce0969bb",
  "scripts/collect-materials-supplements.ts": "27118e3e594040dd5eb881ab68da0d7a5b8b842b88e694f92a4ac2fa60a400ce",
  "scripts/materials-supplement-ledger.ts": "297661629ce0aa55a194fe65cbdaa13085e0ca4de6937cb05c39af33fa594f04",
});
const nativeDelta = Object.freeze({
  "app/data/flagship-role.ts": ["e57cb6a20bb27ca2622fa43677f91be9c8c964cbd48847759007824ae9b37eef", "7070068cd2edb6bb176b61f01e9e2e2f1800b24179c908e3619e11be5560572e"],
  "app/lib/materials/course-task-evidence.ts": ["ecf8aa41e10ee63ae55b91356c257a131b90e252ee0a4720c41e550f1c62e469", "9918053c28c8577cfee0f4d416290908c189cd4202964d91a35508924d39b49e"],
  "app/lib/materials/explanations.ts": ["9d953c2d15611c32062e2c98a126ad1ef65ebec8a71e24a863983ae6ea816534", "4890a600779022b9a956682076d3a3cfddc5759a154e314fed41a6c18fb5d0b8"],
});
const fail = message => { throw new Error(`current-reference-integrity: ${message}`); };
async function checked(root, file) {
  const absolute = path.resolve(root, file.path), relative = path.relative(root, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) fail("invalid relative path");
  const bytes = await readFile(absolute);
  if (sha256(bytes) !== file.sha256 || (file.byteLength !== undefined && bytes.length !== file.byteLength)) fail(`pinned bytes differ: ${file.path}`);
  return bytes;
}

/** This credential is private to this version. The historical loader/WeakSet is never used. */
export async function loadCurrentReviewedReferences(root = defaultRoot) {
  try {
    if (typeof root !== "string") fail("root must be a local path");
    root = path.resolve(root);
    const files = new Map();
    const take = async file => {
      const bytes = await checked(root, file);
      const previous = files.get(file.path);
      if (previous && previous.sha256 !== file.sha256) fail(`conflicting binding: ${file.path}`);
      files.set(file.path, { path: file.path, sha256: file.sha256, byteLength: bytes.length });
      return bytes;
    };
    const json = async file => JSON.parse(await take(file));
    await Promise.all(Object.entries(pins).map(([path, sha256]) => take({ path, sha256 })));
    const binding = await json({ path: `${native}/course-binding.integrated.json`, sha256: pins[`${native}/course-binding.integrated.json`] });
    const prior = await json(binding.previous.binding);
    await Promise.all([binding.previous.capture, binding.previous.review, binding.currentCapture].map(take));
    if (Object.keys(prior.frozenAssetHashes).length !== 26 || prior.frozenInputs.length !== 5) fail("frozen scope differs");
    await Promise.all(Object.entries(prior.frozenAssetHashes).map(([name, sha256]) => take({ path: `${historical}/${name}`, sha256 })));
    await Promise.all(prior.frozenInputs.map(take));
    const review = await json({ path: `${native}/integrated-course-review-receipt.json`, sha256: pins[`${native}/integrated-course-review-receipt.json`] });
    if (review.result !== "reviewed-integrated-display-only-binding" || review.bindingId !== binding.id
      || review.checks.specificationReview !== "PASS" || review.checks.codeQualityReview !== "PASS") fail("integrated review is not accepted");
    await Promise.all(review.files.map(file => take({ ...file, path: `${native}/${file.path}` })));

    const receipt = await json({ path: `${native}/planning-acceptance-receipt.json`, sha256: pins[`${native}/planning-acceptance-receipt.json`] });
    await Promise.all(receipt.files.map(file => take({ ...file, path: `${native}/${file.path}` })));
    const manifest = await json({ path: `${native}/native-evidence/manifest.json`, sha256: pins[`${native}/native-evidence/manifest.json`] });
    const check = await json({ path: `${native}/native-evidence/check.json`, sha256: pins[`${native}/native-evidence/check.json`] });
    if (receipt.status !== "accepted-bounded-native-protocol" || receipt.reviews.specification !== "PASS" || receipt.reviews.quality !== "PASS"
      || manifest.sourceClosure.length !== 146 || new Set(manifest.sourceClosure.map(file => file.path)).size !== 146
      || manifest.sourceClosureDigest !== sha256(`${JSON.stringify(manifest.sourceClosure, null, 2)}\n`)
      || receipt.sourceClosureDigest !== manifest.sourceClosureDigest || receipt.nativeResults.matrixRuns !== 1
      || check.status !== "passed" || check.counts.passed !== 14 || check.counts.failed !== 0 || check.counts.notCollected !== 0
      || check.manifestSha256 !== pins[`${native}/native-evidence/manifest.json`]) fail("native receipt mismatch");
    let changes = 0;
    await Promise.all(manifest.sourceClosure.map(async file => {
      const delta = nativeDelta[file.path];
      if (delta) { if (delta[0] !== file.sha256) fail("native delta before hash differs"); changes++; }
      await take({ path: file.path, sha256: delta?.[1] ?? file.sha256 });
    }));
    if (changes !== 3) fail("native three-file delta differs");
    const archive = JSON.parse(await readFile(path.join(root, native, "native-evidence/archive-manifest.json")));
    await take({ path: `${native}/native-evidence/${archive.archive}`, sha256: archive.archiveSha256, byteLength: archive.archiveBytes });
    const snapshot = JSON.parse(await readFile(path.join(root, binding.currentCapture.path)));
    await Promise.all(snapshot.dependencies.map(take));
    // Execute the reviewed verifier itself on actual files. Never provide a historical capture in place of source.
    await checked(defaultRoot, { path: `${native}/verify-integrated-course-binding.mjs`, sha256: pins[`${native}/verify-integrated-course-binding.mjs`] });
    const { verifyIntegratedCourseBinding } = await import("../materials-native-acceptance/verify-integrated-course-binding.mjs");
    const integrated = await verifyIntegratedCourseBinding({ root });
    const source = JSON.parse(await readFile(path.join(root, historical, "annotations.draft.json")));
    const course = JSON.parse(await readFile(path.join(root, historical, "course-annotations.draft.json")));
    // Only original document bytes/identities/roles enter observations. Gold fields never leave this reader.
    const corpora = (await Promise.all(source.inputHashes.slice(0, 2).map(async file => JSON.parse(await readFile(path.join(root, file.path))).documents)))
      .flat().map(({ id, documentVersionId, textVersionId, text, segments, kind }) => ({ id, documentVersionId, textVersionId, text, segments, kind }));
    verifySourceLedger(source, corpora);
    const references = { schemaVersion: "materials-current-reviewed-references-v1", source, course, corpora, snapshot,
      skillIds: snapshot.inventory.blueprintSkillIds,
      integratedCourse: { valid: true, frozenAssetsChecked: integrated.frozenAssetsChecked, frozenInputsChecked: integrated.frozenInputsChecked,
        dependencies: integrated.dependencies, teachingUnits: integrated.teachingUnits },
      nativeBehaviorReuse: { status: "accepted-source-delta-reuse", newExecution: false, originalApplicationCommit: receipt.applicationCommit,
        originalSourceClosureDigest: manifest.sourceClosureDigest, sourceClosure: { files: 146, unchanged: 143, reviewedChanges: 3 },
        nativeCasesPassed: 14, matrixRuns: 1, reviewMemoSha256: pins[`${native}/planning-integration-reuse-review.md`],
        currentEnglishSerializedBytesTestedByOriginalRun: false, crossVersionPreviewReuseApproved: false },
      digests: { assets: prior.frozenAssetHashes, frozenInputs: prior.frozenInputs, integratedBinding: pins[`${native}/course-binding.integrated.json`],
        integratedReview: pins[`${native}/integrated-course-review-receipt.json`], currentCapture: binding.currentCapture.sha256,
        nativeAcceptance: pins[`${native}/planning-acceptance-receipt.json`] },
      integrityFiles: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)) };
    deepFreeze(references); verified.set(references, root); return references;
  } catch (error) {
    if (error.message?.startsWith("current-reference-integrity:") || error.message?.startsWith("integrated-course-binding:")) throw error;
    throw new Error("current-reference-integrity: required local input unavailable or invalid", { cause: error });
  }
}

export function isCurrentReviewedReferences(references) { return verified.has(references); }
/** Recheck bytes at report time so a retained object does not conceal subsequent source drift. */
export async function assertCurrentReviewedReferences(references) {
  if (!verified.has(references)) throw new Error("current-reference-unverified");
  const root = verified.get(references);
  await Promise.all(references.integrityFiles.map(file => checked(root, file)));
  // Observation functions are imports from this checkout, even when a drift probe uses a separate root.
  if (root !== path.resolve(defaultRoot)) await Promise.all(references.integrityFiles.map(file => checked(defaultRoot, file)));
}
