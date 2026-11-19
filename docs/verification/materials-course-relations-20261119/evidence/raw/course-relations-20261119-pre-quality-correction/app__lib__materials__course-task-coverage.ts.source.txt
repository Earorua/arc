import type { ConfirmedMaterialItem } from "../../contracts/documents";
import type { RoleBlueprint } from "../../contracts/intelligence";
import type { MaterialTaskCoverage } from "../../contracts/material-planning";
import type { UnitRegistry } from "../../contracts/planning";
import { validateUnitRegistry } from "../planning/registry-validation";
import { COURSE_TASK_EVIDENCE, COURSE_TASK_IDS, type CourseTaskId, type CourseTaskLeaf } from "./course-task-evidence";
import { findMaterialSkillMention } from "./grounded-skill-terms";
import { normalizeMaterialSkillLabel } from "./skill-labels";
import type { MaterialTermMapping } from "./skill-mapper";
import { courseRelationTopics, courseTaskBody, courseTaskScopes } from "./course-relation-scope";

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
  "component-keyboard": /(?:specify|repair|check) (?:component states and keyboard transitions|keyboard focus order)|(?:拆分|设计|定义)?按钮状态|(?:修复|检查)?键盘焦点顺序|(?:交付|编写)?组件说明|键盘可访问性的基本检查/iu,
  "product-outcomes": /(?:define|design) product metrics/iu,
};

// Additional ordinary formulations of the same taught task. Each full pattern
// must consume its entire owned scope; partial patterns deliberately name only a
// subset (tools, business context and broad capability requirements remain).
const additionalTasks: Partial<Record<CourseTaskId, RegExp>> = {
  "sql-schema": /(?:design|model|create|audit|review) (?:an? )?sql (?:data models?|schema)|(?:设计|建立|审查)\s*sql\s*(?:关系)?(?:数据模型|表结构|数据表)/iu,
  "sql-joins": /(?:write|wrote|use|used|implement|rehearse) (?:an? )?(?:ordinary )?sql (?:joins?|queries)|(?:编写|实现|使用)\s*sql\s*(?:连接查询|查询|联表)/iu,
  "semantic-form": /(?:build|repair|implement) (?:a )?(?:labeled )?semantic html forms?|(?:write|build|repair) accessible form labels|编写\s*accessible form labels/iu,
  "react-form": /(?:build|maintain|implement|test) (?:a )?react (?:forms?|component (?:states?|tests?))|(?:维护|构建|实现|测试)?\s*react\s*(?:表单|组件状态设计|组件测试)/iu,
  "behavior-tests": /(?:test|write|build) react component tests?|react\s*组件测试/iu,
};

const taskTerms: Record<CourseTaskId, RegExp> = {
  "sql-schema": /\bsql\b|\b(?:model|modeling|modelling|relational|schema|warehouse)\b|建模|数据模型|表结构/u,
  "sql-joins": /\bsql\b|\b(?:joins?|queries|query|reconcile)\b|查询|联表|重复行问题/u,
  "typescript-contract": /\btypescript\b|\b(?:ui|interface) logic\b|界面逻辑/u,
  "semantic-form": /\b(?:html5?|forms?|wcag)\b|表单/u,
  "react-form": /\b(?:react|forms?|prototype|component (?:states?|tests?|testing)|interaction tests?)\b|表单|组件状态设计|组件测试|交互测试/u,
  "behavior-tests": /\b(?:tests?|testing|vitest|jest|playwright)\b|测试/u,
  "component-audit": /\b(?:tokens?|components?|focus|contrast|wcag|accessible form labels)\b|组件|表单标签|焦点/u,
  "component-keyboard": /\b(?:keyboard|button states?|component descriptions?)\b|键盘|按钮状态|组件说明/u,
  "software-signals": /\b(?:logs?|logging|traces?|tracing|traced|opentelemetry|incidents)\b|日志|追踪/u,
  "release-checklist": /\b(?:checklist|deployment|rollback)\b|回滚/u,
  "product-outcomes": /\bproduct metrics\b/u,
};

function recognizedTask(id: CourseTaskId, term: string, body: string): { full: boolean } | null {
  const token = normalizeMaterialSkillLabel(term);
  if (!taskTerms[id].test(token)) return null;
  // A parser implementation is a different task from choosing diagnostic signals.
  if (id === "software-signals" && /\bparser\b/u.test(body)) return null;
  for (const pattern of [tasks[id], additionalTasks[id]]) {
    const match = pattern?.exec(body);
    if (match) return { full: id !== "product-outcomes" && match.index === 0 && match[0].length === body.length };
  }
  const topics = courseRelationTopics(term, body);
  const partial: Partial<Record<CourseTaskId, boolean>> = {
    "sql-schema": /\bsql\b/u.test(body) && /\bmodel warehouse tables\b/u.test(body),
    "sql-joins": /\bjoin\b/u.test(body) && /重复行|duplicate rows/u.test(body)
      || /\bsql joins?\b/u.test(body) && /\breconcile\b/u.test(token),
    "typescript-contract": /\btypescript\b/u.test(body) && /\b(?:ui|interface) logic\b|界面逻辑/u.test(body),
    "react-form": (topics.includes("react") || /\breact\b/u.test(body)) && /\bprototype\b|原型|交互测试/u.test(body),
    "semantic-form": token === "wcag" && topics.includes("web-platform"),
    "behavior-tests": topics.includes("testing"),
    "component-audit": topics.includes("design-systems") && /\btokens?\b|表单标签|accessible form labels/u.test(body),
    "software-signals": topics.includes("observability") || /\b(?:api|software|http|runtime)\b|软件|接口|运行时|服务器/u.test(body)
      && /\b(?:logs?|traces?|tracing)\b|日志|追踪/u.test(body),
    "release-checklist": topics.includes("cloud-delivery"),
    "product-outcomes": topics.includes("product-thinking"),
  };
  if (id === "software-signals" && /^(?:explain )?the difference between (?:a )?trace and (?:a )?log$/u.test(body)) return { full: true };
  // A broad requirement identifies a partial catalog subset, not a concrete
  // source task. Concrete unsupported work must never fall through to this rule.
  const broadBody = body.replace(/^(?:同一份)?(?:补充)?说明(?:同时)?写着\s*/u, "");
  const broadRequirement = /^(?:sql|typescript)\s+(?:is )?(?:required|preferred|essential)(?: for this (?:secondary )?role)?$/u.test(broadBody)
    || /^(?:required|preferred|essential)\s*[:：]?\s*(?:sql|typescript)$/u.test(broadBody)
    || /^(?:sql|typescript)\s*(?:为|仅为|仅)?(?:必备|加分)(?:和\s*(?:sql|typescript)\s*(?:为|仅为|仅)?(?:必备|加分))?(?:[,，]\s*不是必备)?$/u.test(broadBody);
  if (broadRequirement && (id === "sql-schema" && token === "sql" || id === "typescript-contract" && token === "typescript")) return { full: false };
  return partial[id] ? { full: false } : null;
}

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
const taskBody = courseTaskBody;

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
      : leaf.field === "completionCriteria" || leaf.field === "rubric" ? unit[leaf.field][leaf.index] : unit[leaf.field]) === leaf.quote);
  }));
}

export function createCourseTaskTopicMatcher(blueprint: RoleBlueprint, registry: UnitRegistry) {
  const verified = verifiedAnchors(blueprint, registry);
  return (term: string, text: string): string[] => {
    // Task discovery cannot recover a discarded word or borrow another clause.
    const scope = text.split(/[。!?;；\n]|\.(?:\s+|$)/u).find(part => findMaterialSkillMention(part, term) !== null);
    if (!scope) return [];
    const token = taskBody(term).replace(/^(?:write|design|model|build|create|implement|audit|choose|select) (?:a |an )?/u, "");
    const contentSkills = new Set([...verified].map(id => COURSE_TASK_EVIDENCE[id].skillId));
    return [...new Set([...taskTopics.filter(([id, pattern]) => verified.has(id) && pattern.test(token))
      .map(([id]) => COURSE_TASK_EVIDENCE[id].skillId),
    ...courseRelationTopics(term, text).filter(id => contentSkills.has(id as typeof COURSE_TASK_EVIDENCE[CourseTaskId]["skillId"]))])];
  };
}

/** Evaluate alongside the mapper, retaining its historical public result shape. */
export function createCourseTaskCoverageEvaluator(blueprint: RoleBlueprint, registry: UnitRegistry, source: "flagship" | "research" = "flagship") {
  const verified = source === "flagship" ? verifiedAnchors(blueprint, registry) : new Set<CourseTaskId>();
  return (detail: MaterialTermMapping, item: ConfirmedMaterialItem): MaterialTaskCoverage => {
    if (detail.status === "omitted" || detail.status === "non-learning") return { status: "not-applicable", support: [], remaining: null };
    const bodies = courseTaskScopes(item.text, detail.term, item.skillLabels === undefined);
    const candidates = COURSE_TASK_IDS.filter(id => detail.skillIds.includes(COURSE_TASK_EVIDENCE[id].skillId));
    const support = candidates.filter(id => verified.has(id) && bodies.some(body => recognizedTask(id, detail.term, body)));
    const changedEvidence = candidates.some(id => !verified.has(id) && bodies.some(body => recognizedTask(id, detail.term, body)));
    if (!support.length) return { status: "none", support: [], remaining: changedEvidence ? "unverified-content"
      : bodies.length === 1 && taskBody(detail.term) === bodies[0] && detail.status === "mapped" ? "unspecified-task" : "unassessed-scope" };
    const additionalSentence = item.skillLabels?.length === 1 && item.text.split(/[。!?;；]|\.(?:\s+|$)/u)
      .some(part => part.trim() && findMaterialSkillMention(part, detail.term) === null);
    const full = !additionalSentence && bodies.length === 1 && support.some(id => recognizedTask(id, detail.term, bodies[0]!)?.full);
    return { status: full ? "full" : "partial", support, remaining: full ? null : "unassessed-scope" };
  };
}
