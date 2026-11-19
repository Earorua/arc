// Fixed reviewed docs imports, including the loader's existing dynamic verifier path.
const modules = [
  ["materials-quality-next/current-captures", ".ts"],
  ["materials-quality-next/current-adapter", ".ts"],
  ["materials-quality-next/current-references.mjs", ""],
  ["materials-quality-v2/candidate-common.mjs", ""],
  ["materials-quality-v2/candidate-input.mjs", ""],
  ["materials-quality-v2/candidate-source.mjs", ""],
  ["materials-quality-v2/candidate-course.mjs", ""],
  ["materials-native-acceptance/verify-integrated-course-binding.mjs", ""],
  ["materials-quality-v2/capture-course-reference.mjs", ""],
] as const;

export async function loadCurrentQualityRuntime() {
  // tsx can prefer an .mts sibling even for an explicit .mjs request. Resolve all
  // known paths before importing any docs module, so an alternate never evaluates.
  for (const [path, extension] of modules) {
    const request = new URL(`../docs/verification/${path}`, import.meta.url).href;
    if (import.meta.resolve(request) !== request + extension) throw new Error("current-runtime-resolution-mismatch");
  }
  const [{ readQualificationCaptures, readSupplementCaptures }, { evaluateCurrentQuality }, { loadCurrentReviewedReferences }] = await Promise.all([
    import("../docs/verification/materials-quality-next/current-captures"),
    import("../docs/verification/materials-quality-next/current-adapter"),
    import("../docs/verification/materials-quality-next/current-references.mjs"),
  ]);
  return { readQualificationCaptures, readSupplementCaptures, evaluateCurrentQuality, loadCurrentReviewedReferences };
}
