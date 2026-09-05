import type { SkillEvidenceProjection, SkillEvidenceStatus } from "../../contracts/proof-ledger";
import type { SkillNode } from "../../domain/learning";
import { calculateReadiness } from "../../lib/proof-profile";

const statusLabels: Record<SkillEvidenceStatus, string> = {
  exploring: "Exploring",
  practicing: "Practicing",
  demonstrated: "Demonstrated",
  verified: "Verified",
};

export function ProofProfile({
  projections,
  skills,
}: {
  projections: ReadonlyArray<SkillEvidenceProjection>;
  skills: ReadonlyArray<Pick<SkillNode, "id" | "importance">>;
}) {
  const readiness = calculateReadiness(skills, projections);
  const visibleStatuses = new Set(projections.filter(({ audience }) => audience === "internal").map(({ status }) => status));
  const verifiedLabel = `${readiness.verifiedSkillIds.length} verified ${readiness.verifiedSkillIds.length === 1 ? "skill" : "skills"}`;

  return (
    <section className="proof-profile" lang="en">
      <div className="profile-heading">
        <div>
          <p className="eyebrow">Capability profile</p>
          <h1>Your stack, proven.</h1>
          <p className="proof-boundary">
            Complete learning work to reach Practicing. Submit inspectable evidence to demonstrate a skill;
            Verified is reserved for evidence that passes a deterministic validator.
          </p>
        </div>
        <div className="profile-metrics">
          <div className="readiness" aria-label={`${readiness.percentage}% role readiness`}>
            <strong>{readiness.percentage}%</strong>
            <span>demonstrated readiness</span>
          </div>
          <div className="readiness" aria-label={verifiedLabel}>
            <strong>{readiness.verifiedSkillIds.length}</strong>
            <span>verified skills</span>
          </div>
        </div>
      </div>
      <ul className="proof-status-key" aria-label="Evidence status scale">
        {(Object.keys(statusLabels) as SkillEvidenceStatus[]).map((status) => (
          <li className={visibleStatuses.has(status) ? "is-current" : undefined} key={status}>
            <span aria-hidden="true">0{Object.keys(statusLabels).indexOf(status) + 1}</span>
            <strong>{statusLabels[status]}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}
