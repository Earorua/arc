/** Reviewed current-course leaves. IDs keep private per-term previews compact. */
export const COURSE_TASK_IDS = ["sql-schema", "sql-joins", "typescript-contract", "semantic-form", "react-form", "behavior-tests", "component-audit", "software-signals", "release-checklist"] as const;
export type CourseTaskId = typeof COURSE_TASK_IDS[number];
export type CourseTaskLeaf = { field: "objective" | "buildTask" | "title"; quote: string }
  | { field: "steps"; leafId: string; quote: string } | { field: "completionCriteria"; index: number; quote: string };
export const COURSE_TASK_EVIDENCE = {
  "sql-schema": { skillId: "sql", label: "关系实体、键、归属与删除规则", unitId: "sql-learn-01", field: "buildTask", quote: "Create an additive relational schema with ownership boundaries: model immutable versions, keys, relations, and delete behavior.", additionalLeaves: [{ field: "steps", leafId: "sql-learn-01-step-01", quote: "Model entities, immutable versions, keys, and ownership" }] },
  "sql-joins": { skillId: "sql", label: "保持归属边界的连接查询", unitId: "sql-reinforce-01", field: "objective", quote: "Write joins and constraints that preserve tenant ownership and relational invariants." },
  "typescript-contract": { skillId: "typescript", label: "严格 schema、推导类型与穷尽收窄", unitId: "typescript-learn-01", field: "buildTask", quote: "Implement a strict schema plus inferred request/result types: model one UI action and every discriminated result.", additionalLeaves: [{ field: "completionCriteria", index: 1, quote: "Every result variant is handled through exhaustive narrowing." }] },
  "semantic-form": { skillId: "web-platform", label: "带标签的语义表单", unitId: "web-platform-learn-01", field: "steps", leafId: "web-platform-learn-01-step-01", quote: "Build a labeled form and record the native event sequence", additionalLeaves: [{ field: "objective", quote: "Trace an accessible form submission from semantic controls through DOM events, HTTP exchange, and rendered response." }] },
  "react-form": { skillId: "react", label: "React 表单加载、成功、失败与重试", unitId: "react-learn-01", field: "completionCriteria", index: 1, quote: "Tests observe loading, success, error, and successful retry.", additionalLeaves: [{ field: "buildTask", quote: "Build a tested form with loading, success, and recovery states: include accessible error feedback and duplicate-submit protection." }] },
  "behavior-tests": { skillId: "testing", label: "聚焦行为测试的 RED/GREEN", unitId: "testing-learn-01", field: "buildTask", quote: "Create a focused test proving a meaningful failure before implementation: drive one behavior from RED to minimal GREEN." },
  "component-audit": { skillId: "design-systems", label: "组件语义、焦点与对比度审计", unitId: "design-systems-calibrate-01", field: "objective", quote: "Audit one component for semantic role, accessible name, focus indication, and state contrast." },
  "software-signals": { skillId: "observability", label: "软件日志与追踪信号选择", unitId: "observability-reinforce-01", field: "objective", quote: "Select the appropriate signal type for counts, event details, and cross-boundary latency.", additionalLeaves: [{ field: "title", quote: "Rehearse metrics, logs and traces" }] },
  "release-checklist": { skillId: "cloud-delivery", label: "构建、冒烟检查与回滚清单", unitId: "cloud-delivery-learn-01", field: "buildTask", quote: "Create a build, smoke-check, and rollback checklist: define reversible gates, owners, triggers, and recovery for one release." },
} as const;

export const COURSE_TASK_REMAINING_LABELS = {
  "unspecified-task": "仅有主题名称，未明确具体任务",
  "unassessed-scope": "其余要求尚未核验；原文中的工具、领域和限定条件仍保留",
  "unverified-content": "当前课程正文未通过对应任务证据核验",
  "course-choice": "课程对应仍有歧义，需要先明确选择",
} as const;
