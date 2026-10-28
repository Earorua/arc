import type { SkillEvidenceProjection, SkillEvidenceStatus } from "../../contracts/proof-ledger";
import type { SkillNode } from "../../domain/learning";
import { calculateReadiness } from "../../lib/proof-profile";

const statusLabels: Record<SkillEvidenceStatus, string> = {
  exploring: "待探索",
  practicing: "练习中",
  demonstrated: "已有作品证明",
  verified: "已通过验证",
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
  const verifiedLabel = `${readiness.verifiedSkillIds.length} 项技能已通过验证`;

  return (
    <section className="proof-profile">
      <div className="profile-heading">
        <div>
          <p className="eyebrow">技能证明概览</p>
          <h2>作品如何证明技能</h2>
          <p className="proof-boundary">
            完成学习任务表示「练习中」；提交可查阅的作品并通过结构审核后，才有作品证明技能。
            只有通过确定性验证器的作品，才标为「已通过验证」。
          </p>
        </div>
        <div className="profile-metrics">
          <div className="readiness" aria-label={`岗位准备度 ${readiness.percentage}%`}>
            <strong>{readiness.percentage}%</strong>
            <span>有作品支持的准备度</span>
          </div>
          <div className="readiness" aria-label={verifiedLabel}>
            <strong>{readiness.verifiedSkillIds.length}</strong>
            <span>已通过验证的技能</span>
          </div>
        </div>
      </div>
      <ul className="proof-status-key" aria-label="技能证明状态">
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
