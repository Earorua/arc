import type { ConfirmedMaterialItem } from "../../contracts/documents";
import type { RoleBlueprint } from "../../contracts/intelligence";
import type { MaterialTaskCoverage } from "../../contracts/material-planning";
import type { UnitRegistry } from "../../contracts/planning";
import { validateUnitRegistry } from "../planning/registry-validation";
import { COURSE_TASK_EVIDENCE, COURSE_TASK_IDS, type CourseTaskId, type CourseTaskLeaf } from "./course-task-evidence";
import { findMaterialSkillMention } from "./grounded-skill-terms";
import { normalizeMaterialSkillLabel } from "./skill-labels";
import type { MaterialTermMapping } from "./skill-mapper";

// This is a bounded reviewed task vocabulary, not a general task/NLP classifier.
// A match supplies only the named subset. Full coverage requires consuming the
// entire scope: unknown tools, domains, modifiers and extra tasks cannot vanish.
const tasks: Record<CourseTaskId, RegExp> = {
  "sql-schema": /(?:design|model|create|audit|review) (?:an? )?(?:sql |relational )(?:entities|schema|tables|(?:primary |foreign )?keys)(?:(?:, ?| and )(?:keys|primary keys|foreign keys|ownership|delete behavior|immutable versions|relations))*|(?:设计|建立|审查)SQL(?:关系)?(?:实体|表结构|数据表)(?:[、，和及与]*(?:主键|外键|键|归属|所有权|删除行为))*/iu,
  "sql-joins": /(?:write|implement|rehearse) (?:an? )?(?:ownership-safe (?:sql )?joins?|sql ownership-safe joins?)|(?:编写|实现)(?:保持归属边界的|归属安全的)SQL连接查询/iu,
  "typescript-contract": /(?:create|implement|repair) (?:a )?strict (?:typescript )?schema (?:with|plus) inferred request\/result types(?: and exhaustive narrowing)?|(?:创建|实现|修复)严格的?TypeScript\s*schema[，、和与]+推导请求[\/与和]结果类型(?:[，、和与]+穷尽收窄)?/iu,
  "semantic-form": /(?:build|repair|implement) (?:a )?labeled (?:semantic )?html form|(?:构建|修复|实现)带标签的语义HTML表单/iu,
  "react-form": /(?:build|test|implement) (?:a )?react form with loading, success, (?:failure|error) and (?:retry|recovery) states|(?:构建|测试|实现)具有加载[、，]成功[、，]失败[和与、]重试状态的React表单/iu,
  "behavior-tests": /(?:write|create) (?:a )?focused (?:software )?behaviou?r tests? from red to (?:minimal )?green|编写从RED到GREEN的聚焦软件行为测试/iu,
  "component-audit": /audit (?:one |a )?component semantics, focus and contrast|审计组件语义[、，]焦点[和与、]对比度/iu,
  "software-signals": /(?:choose|select) software (?:logs and traces|metrics, logs and traces) for (?:counts, )?event details and cross-boundary latency|为事件详情[和与]跨边界延迟选择软件日志[和与]追踪信号/iu,
  "release-checklist": /(?:write|create|author) (?:a )?release checklist with build gates, smoke checks and rollback triggers|(?:编写|创建)包含构建门禁[、，]冒烟检查[和与、]回滚触发条件的发布清单/iu,
};

/** Only these additional retained task phrases can discover a course topic. */
const taskTopics: readonly [CourseTaskId, RegExp][] = [
  ["sql-schema", /^(?:sql (?:window queries|queries|entities|keys|schema|tables)|relational entities and keys)$/u],
  ["sql-joins", /^(?:ownership-safe sql joins|sql ownership-safe joins)$/u],
  ["typescript-contract", /^strict typescript schema(?: with inferred request\/result types(?: and exhaustive narrowing)?)?$/u],
  ["semantic-form", /^labeled (?:semantic )?html form$/u],
  ["react-form", /^react form with loading, success, (?:failure|error) and (?:retry|recovery) states$/u],
  ["behavior-tests", /^focused (?:software )?behaviou?r tests? from red to (?:minimal )?green$/u],
  ["component-audit", /^component semantics, focus and contrast$/u],
  ["software-signals", /^software logs and traces$/u],
  ["release-checklist", /^release checklist$/u],
];

// Remove only an explicitly recognized task wrapper. Everything else remains
// unassessed; this does not make the statement personal experience or ability.
function taskBody(value: string) {
  return normalizeMaterialSkillLabel(value).trim().replace(/[。.!]$/u, "").trim()
    .replace(/^(?:(?:i|we) (?:need to|want to|will|can)|(?:learn|need|want) to|must|should|required to) /u, "");
}

function verifiedAnchors(blueprint: RoleBlueprint, registry: UnitRegistry): Set<CourseTaskId> {
  if (blueprint.id !== "ai-native-full-stack-engineer" || blueprint.version !== "2026.08.1" || blueprint.status !== "ready"
    || registry.id !== "ai-native-full-stack-engineer-units" || registry.version !== "2026.08.1"
    || !validateUnitRegistry(registry, blueprint).valid) return new Set();
  return new Set(COURSE_TASK_IDS.filter(id => {
    const anchor = COURSE_TASK_EVIDENCE[id];
    const unit = registry.tracks.find(track => track.skillId === anchor.skillId)?.templates.find(unit => unit.id === anchor.unitId);
    if (!unit) return false;
    const leaves: readonly CourseTaskLeaf[] = [anchor, ...("additionalLeaves" in anchor ? anchor.additionalLeaves : [])];
    return leaves.every(leaf => (leaf.field === "steps" ? unit.steps.find(step => step.id === leaf.leafId)?.label
      : leaf.field === "completionCriteria" ? unit.completionCriteria[leaf.index] : unit[leaf.field]) === leaf.quote);
  }));
}

export function createCourseTaskTopicMatcher(blueprint: RoleBlueprint, registry: UnitRegistry) {
  const verified = verifiedAnchors(blueprint, registry);
  return (term: string, text: string): string[] => {
    // Task discovery cannot recover a discarded word or borrow another clause.
    const scope = text.split(/[。!?;；\n]|\.(?:\s+|$)/u).find(part => findMaterialSkillMention(part, term) !== null);
    if (!scope) return [];
    const token = taskBody(term).replace(/^(?:write|design|model|build|create|implement|audit|choose|select) (?:a |an )?/u, "");
    return [...new Set(taskTopics.filter(([id, pattern]) => verified.has(id) && pattern.test(token))
      .map(([id]) => COURSE_TASK_EVIDENCE[id].skillId))];
  };
}

/** Evaluate alongside the mapper, retaining its historical public result shape. */
export function createCourseTaskCoverageEvaluator(blueprint: RoleBlueprint, registry: UnitRegistry, source: "flagship" | "research" = "flagship") {
  const verified = source === "flagship" ? verifiedAnchors(blueprint, registry) : new Set<CourseTaskId>();
  return (detail: MaterialTermMapping, item: ConfirmedMaterialItem): MaterialTaskCoverage => {
    if (detail.status === "omitted" || detail.status === "non-learning") return { status: "not-applicable", support: [], remaining: null };
    if (detail.status === "ambiguous") return { status: "none", support: [], remaining: "course-choice" };
    // A soft line wrap cannot detach an unknown modifier from its task sentence.
    const scopes = item.skillLabels?.length === 1
      ? [item.text] : item.text.split(/[。!?;；]|\.(?:\s+|$)/u).filter(part => findMaterialSkillMention(part, detail.term) !== null);
    // Legacy whole facts and exact retained phrases remain assessable. A name
    // invented through manual mapping is not task evidence.
    const bodies = (item.skillLabels === undefined ? [item.text] : scopes).map(taskBody);
    const candidates = COURSE_TASK_IDS.filter(id => detail.skillIds.includes(COURSE_TASK_EVIDENCE[id].skillId));
    const support = candidates.filter(id => verified.has(id) && bodies.some(body => tasks[id].test(body)));
    const changedEvidence = candidates.some(id => !verified.has(id) && bodies.some(body => tasks[id].test(body)));
    if (!support.length) return { status: "none", support: [], remaining: changedEvidence ? "unverified-content"
      : bodies.length === 1 && taskBody(detail.term) === bodies[0] && detail.status === "mapped" ? "unspecified-task" : "unassessed-scope" };
    const full = bodies.length === 1 && support.some(id => {
      const match = tasks[id].exec(bodies[0]!);
      return match?.index === 0 && match[0].length === bodies[0]!.length;
    });
    return { status: full ? "full" : "partial", support, remaining: full ? null : "unassessed-scope" };
  };
}
