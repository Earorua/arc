import type { z } from "zod";
import type { materialContextPreviewSchema, materialExplanationSchema } from "../../contracts/material-planning";
type Explanation = z.infer<typeof materialExplanationSchema>;
type Preview = z.infer<typeof materialContextPreviewSchema>;
export const MATERIAL_EXPLANATION_VERSION = "2026.11.3" as const;

/** Fixed templates contain no imported prose; revocation replaces the entire projection. */
export function explainMaterialPreview(preview: Preview | null, available: boolean): Explanation[] {
  if (!available || !preview) return [{ ruleId: "source-unavailable-v1", changeKind: "unavailable", skillId: null, unitIds: [], reasonItemIds: [], message: "依据已删除", sourceAvailability: "unavailable" }];
  const result: Explanation[] = preview.priorities.flatMap((priority): Explanation[] => {
    if (priority.tier === 3 && priority.learningIntentItemIds?.length) return [
      ...(priority.practiceItemIds?.length ? [{ ruleId: "confirmed-practice-v1", changeKind: "reordered" as const, skillId: priority.skillId, unitIds: [], reasonItemIds: [...priority.practiceItemIds], sourceAvailability: "available" as const, message: "已确认经历对应的现有练习优先安排。" }] : []),
      { ruleId: "confirmed-learning-intent-v1", changeKind: "reordered", skillId: priority.skillId, unitIds: [], reasonItemIds: [...priority.learningIntentItemIds], sourceAvailability: "available", message: "你采用的本轮学习重点优先安排现有任务；能力自评和学习工时保持不变。" },
    ];
    return [{
    ruleId: priority.tier === 0 ? "mandatory-gap-first-v1" : priority.tier === 1 ? "mandatory-calibration-learning-v1" : priority.tier === 2 ? "mandatory-calibration-v1" : priority.tier === 3 ? "confirmed-practice-v1" : "preferred-after-mandatory-v1",
    changeKind: "reordered", skillId: priority.skillId, unitIds: [], reasonItemIds: [...priority.itemIds], sourceAvailability: "available",
    message: priority.tier === 0 ? "主 JD 的必备技能优先安排学习；前置任务和完整工时保留。" : priority.tier === 1 ? "必备技能采用你确认的不确定自评，保留校准与后续学习。" : priority.tier === 2 ? "必备技能采用你单项确认的独立自评，安排校准。" : priority.tier === 3 ? "已确认经历对应的现有练习优先安排。" : "主 JD 的加分要求在必备要求后优先安排。",
    }];
  });
  for (const skillId of preview.overlay?.mandatorySkillIds ?? []) result.push({ ruleId: "mandatory-scope-protection-v1", changeKind: "protected", skillId, unitIds: [], reasonItemIds: preview.priorities.find(p => p.skillId === skillId)?.itemIds ?? [], message: "必备技能及其前置任务不会为赶截止日期而裁掉或缩短。", sourceAvailability: "available" });
  for (const issue of preview.issues) result.push({ ruleId: `${issue.code}-v1`, changeKind: issue.code === "uncovered" ? "uncovered" : "unapplied", skillId: issue.skillIds.length === 1 ? issue.skillIds[0]! : null, unitIds: [], reasonItemIds: [...issue.itemIds], message: issue.code === "target-infeasible" ? "完整的必备范围无法在目标日期内完成，未缩短任务或超出每日预算。" : issue.code === "uncovered" ? "该内容未被现有学习目录覆盖，未新增课程或任务。" : issue.code === "learning-intent-not-adopted" ? "该建议或主题尚未被你采用为本轮学习重点，不改变任务排序。" : issue.code === "mapping-omitted" ? "你选择不将这些词用于本轮课程映射；原始事实仍保留。" : "该项需要进一步核对，尚未作为确定的规划依据。", sourceAvailability: "available" });
  return result;
}
