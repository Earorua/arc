"use client";

import type { RoleBlueprint } from "../../contracts/intelligence";
import type { PathBuildResult, PlanningTarget } from "../../contracts/planning";

function skillNames(ids: string[], blueprint: RoleBlueprint): string {
  const byId = new Map(blueprint.skills.map((skill) => [skill.id, skill.name]));
  return ids.map((id) => byId.get(id) ?? id).join(", ");
}

export function TargetStep({ blueprint, target, selectedScope, onTargetChange, onScopeChange, result: paths, error }: {
  blueprint: RoleBlueprint;
  target: PlanningTarget; selectedScope: "full-scope" | "target-date" | null;
  onTargetChange: (weeks: number) => void; onScopeChange: (scope: "full-scope" | "target-date") => void;
  result: PathBuildResult | null; error?: string;
}) {
  const targetValid = Number.isInteger(target.targetWeeks) && target.targetWeeks >= 4 && target.targetWeeks <= 52;
  const equivalent = paths?.targetDate !== null && paths?.targetDate?.deferredSkills.length === 0
    && paths.targetDate.estimatedCompletionDate === paths.fullScope.estimatedCompletionDate;
  return <div className="target-ledger">
    <label className="ledger-field">目标周数<input aria-describedby={!targetValid ? "target-weeks-error" : undefined} aria-invalid={!targetValid} aria-label="目标周数" min="4" max="52" step="1" type="number" value={Number.isNaN(target.targetWeeks) ? "" : target.targetWeeks} onChange={(event) => onTargetChange(event.target.value === "" ? Number.NaN : Number(event.target.value))} /></label>
    {!targetValid && <p id="target-weeks-error" role="alert">请输入 4 至 52 的整数。</p>}
    {error && <p role="alert">{error}</p>}
    {paths && equivalent && <div className="scope-summary"><strong>时间足够覆盖全部技能。</strong><span>预计于 {paths.fullScope.estimatedCompletionDate} 完成，无需延后技能。</span></div>}
    {paths && !equivalent && <fieldset className="scope-choices">
      <legend>选择要生成的学习范围</legend>
      <label><input checked={selectedScope === "full-scope"} name="scope" onChange={() => onScopeChange("full-scope")} type="radio" /><span><strong>完整范围</strong> · 预计完成于 {paths.fullScope.estimatedCompletionDate}<small>延后技能：无。</small></span></label>
      <label><input checked={selectedScope === "target-date"} disabled={!paths.targetDate} name="scope" onChange={() => onScopeChange("target-date")} type="radio" /><span><strong>按目标日期</strong>{paths.targetDate ? ` · 预计完成于 ${paths.targetDate.estimatedCompletionDate}` : " · 暂不可用"}<small>{paths.targetDate ? `延后技能：${skillNames(paths.targetDate.deferredSkills.map(({ skillId }) => skillId), blueprint) || "无"}.` : paths.infeasibleReason}</small></span></label>
    </fieldset>}
  </div>;
}
