import type { ProofItem, SkillNode } from "../../domain/learning";
import { calculateReadiness } from "../../lib/proof-profile";

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

      {proofs.length === 0 ? (
        <p className="empty-proof">Complete today&apos;s unit to create your first verified proof.</p>
      ) : (
        <ol aria-label="Evidence">
          {proofs.map((proof) => {
            const linkedSkillLabel = proof.skillIds.length === 1 ? "linked skill" : "linked skills";

            return (
              <li key={proof.id}>
                <div>
                  <strong>{proof.title}</strong>
                  <span>{proof.kind} · {proof.skillIds.length} {linkedSkillLabel}</span>
                </div>
                <b className={proof.verified ? "is-verified" : "is-draft"}>
                  {proof.verified ? "Verified" : "Draft"}
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
