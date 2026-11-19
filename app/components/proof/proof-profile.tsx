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
    <section className="proof-profile">
      <div className="profile-heading">
        <div>
          <p className="eyebrow">Skill evidence overview</p>
          <h2>How your work demonstrates your skills</h2>
          <p className="proof-boundary">
            Completing a task marks a skill as Practicing. Submit reviewable work and pass a structural review to mark it Demonstrated.
            Only work that passes an automated validator is marked Verified.
          </p>
        </div>
        <div className="profile-metrics">
          <div className="readiness" aria-label={`Role readiness ${readiness.percentage}%`}>
            <strong>{readiness.percentage}%</strong>
            <span>Readiness supported by proof</span>
          </div>
          <div className="readiness" aria-label={verifiedLabel}>
            <strong>{readiness.verifiedSkillIds.length}</strong>
            <span>Verified skills</span>
          </div>
        </div>
      </div>
      <ul className="proof-status-key" aria-label="Skill evidence status">
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
