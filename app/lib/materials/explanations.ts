import type { z } from "zod";
import type { materialContextPreviewSchema, materialExplanationSchema } from "../../contracts/material-planning";
import { COURSE_TASK_EVIDENCE } from "./course-task-evidence";
type Explanation = z.infer<typeof materialExplanationSchema>;
type Preview = z.infer<typeof materialContextPreviewSchema>;
export const MATERIAL_EXPLANATION_VERSION = "2026.11.5" as const;

/** Fixed templates contain no imported prose; revocation replaces the entire projection. */
export function explainMaterialPreview(preview: Preview | null, available: boolean): Explanation[] {
  if (!available || !preview) return [{ ruleId: "source-unavailable-v1", changeKind: "unavailable", skillId: null, unitIds: [], reasonItemIds: [], message: "Source evidence deleted", sourceAvailability: "unavailable" }];
  const result: Explanation[] = preview.priorities.flatMap((priority): Explanation[] => {
    if (priority.tier === 3 && priority.learningIntentItemIds?.length) return [
      ...(priority.practiceItemIds?.length ? [{ ruleId: "confirmed-practice-v1", changeKind: "reordered" as const, skillId: priority.skillId, unitIds: [], reasonItemIds: [...priority.practiceItemIds], sourceAvailability: "available" as const, message: "Existing practice related to your confirmed experience is prioritized." }] : []),
      { ruleId: "confirmed-learning-intent-v1", changeKind: "reordered", skillId: priority.skillId, unitIds: [], reasonItemIds: [...priority.learningIntentItemIds], sourceAvailability: "available", message: "Your chosen learning focus prioritizes existing tasks. Self-assessment and study time stay unchanged." },
    ];
    return [{
    ruleId: priority.tier === 0 ? "mandatory-gap-first-v1" : priority.tier === 1 ? "mandatory-calibration-learning-v1" : priority.tier === 2 ? "mandatory-calibration-v1" : priority.tier === 3 ? "confirmed-practice-v1" : "preferred-after-mandatory-v1",
    changeKind: "reordered", skillId: priority.skillId, unitIds: [], reasonItemIds: [...priority.itemIds], sourceAvailability: "available",
    message: priority.tier === 0 ? "Must-have skills from the primary JD are prioritized, retaining prerequisites and full task durations." : priority.tier === 1 ? "Must-have skills use your confirmed Uncertain self-assessment, retaining calibration and later learning." : priority.tier === 2 ? "Must-have skills use your individually confirmed Independent self-assessment and receive calibration tasks." : priority.tier === 3 ? "Existing practice related to your confirmed experience is prioritized." : "Preferred requirements from the primary JD follow must-have requirements.",
    }];
  });
  for (const skillId of preview.overlay?.mandatorySkillIds ?? []) result.push({ ruleId: "mandatory-scope-protection-v1", changeKind: "protected", skillId, unitIds: [], reasonItemIds: preview.priorities.find(p => p.skillId === skillId)?.itemIds ?? [], message: "Must-have skills and their prerequisites are not removed or shortened to meet a deadline.", sourceAvailability: "available" });
  for (const status of ["full", "partial", "none"] as const) {
    const details = preview.mappingDetails?.filter(detail => detail.taskCoverage?.status === status) ?? [];
    if (!details.length) continue;
    result.push({ ruleId: `course-task-${status}-v1`, changeKind: "unapplied", skillId: null,
      unitIds: [...new Set(details.flatMap(detail => detail.taskCoverage!.support.map(id => COURSE_TASK_EVIDENCE[id].unitId)))],
      reasonItemIds: [...new Set(details.map(detail => detail.itemId))], sourceAvailability: "available",
      message: status === "full" ? "Course content supports the recognized narrow task. Coverage does not establish ability or an adopted priority; no courses or tasks were added."
        : status === "partial" ? "Course content supports part of the concrete task; the remaining requirements are unverified. Coverage does not establish ability or an adopted priority; no courses or tasks were added."
        : "Course content has not been verified to support the concrete task. A topic match or manual choice does not establish full coverage, ability or an adopted priority.",
    });
  }
  for (const issue of preview.issues) result.push({ ruleId: `${issue.code}-v1`, changeKind: issue.code === "uncovered" ? "uncovered" : "unapplied", skillId: issue.skillIds.length === 1 ? issue.skillIds[0]! : null, unitIds: [], reasonItemIds: [...issue.itemIds], message: issue.code === "target-infeasible" ? "The full must-have scope cannot fit the target date. Tasks were not shortened and daily budgets were not exceeded." : issue.code === "uncovered" ? "The current learning catalog does not cover this content. No courses or tasks were added." : issue.code === "learning-intent-not-adopted" ? "You have not selected this suggestion or topic as a focus, so it does not change task priorities." : issue.code === "mapping-omitted" ? "You excluded these terms from this course mapping. The original facts are retained." : "This item needs further review and is not yet a confirmed planning basis.", sourceAvailability: "available" });
  return result;
}
