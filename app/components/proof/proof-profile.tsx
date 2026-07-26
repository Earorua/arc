import type { ProofItem, SkillNode } from "../../domain/learning";
import { calculateReadiness, getLinkedSkillIds } from "../../lib/proof-profile";

export function ProofProfile({
  proofs,
  skills,
}: {
  proofs: ReadonlyArray<ProofItem>;
  skills: ReadonlyArray<SkillNode>;
}) {
  const readiness = calculateReadiness(skills, proofs);

  return (
    <section className="proof-profile" lang="en">
      <div className="profile-heading">
        <div>
          <p className="eyebrow">Capability profile</p>
          <h1>Your stack, proven.</h1>
        </div>
        <div className="readiness" aria-label={`${readiness.percentage}% role readiness`}>
          <strong>{readiness.percentage}%</strong>
          <span>role readiness</span>
        </div>
      </div>

      <p className="proof-boundary">
        This phase verifies device-local completion events only. External Git, URL, and file verification arrives with Persistence &amp; Proof.
      </p>

      {proofs.length === 0 ? (
        <p className="empty-proof">Complete today&apos;s unit to create your first local completion evidence.</p>
      ) : (
        <ol aria-label="Evidence">
          {proofs.map((proof) => {
            const linkedSkillCount = getLinkedSkillIds(skills, proof.skillIds).length;
            const linkedSkillLabel = linkedSkillCount === 1 ? "linked skill" : "linked skills";
            const isLocalCompletion = proof.kind === "completion";
            const kindLabel = isLocalCompletion ? "Completion evidence" : proof.kind;
            const verificationLabel = proof.verified
              ? (isLocalCompletion ? "Verified locally" : "Verified")
              : "Draft";

            return (
              <li key={proof.id}>
                <div>
                  <strong>{proof.title}</strong>
                  <span>{kindLabel} · {linkedSkillCount} {linkedSkillLabel}</span>
                </div>
                <b className={proof.verified ? "is-verified" : "is-draft"}>
                  {verificationLabel}
                </b>
              </li>
            );
          })}
        </ol>
      )}

      <button
        aria-disabled="true"
        className="share-profile"
        disabled
        title="Public profiles are not available in this preview."
        type="button"
      >
        Share public profile — Coming soon
      </button>
    </section>
  );
}
