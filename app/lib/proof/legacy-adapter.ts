import type { ProofItem } from "../../domain/learning";

export function legacyProofsToPracticingSkills(
  proofs: readonly ProofItem[],
): Set<string> {
  return new Set(
    proofs
      .filter(({ kind, verified }) => kind === "completion" || verified)
      .flatMap(({ skillIds }) => skillIds),
  );
}
