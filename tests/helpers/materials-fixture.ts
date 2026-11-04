import type { RoleBlueprint } from "../../app/contracts/intelligence";
import { PLANNING_SCHEMA_VERSION, type SkillAuditVersion, type UnitRegistry, type UnitTemplate } from "../../app/contracts/planning";
import type { PathBuildInput } from "../../app/lib/planning/path-builder";

export const MATERIALS_FIXED_NOW = "2026-11-04T08:00:00.000Z";

// Frozen acceptance policy, not an alternate/test implementation of the future engine.
export const MATERIAL_PRIORITY_RULES = {
  ranks: [
    { rank: 0, appliesTo: "confirmed-jd-must-unseen-conceptual-guided" },
    { rank: 1, appliesTo: "confirmed-jd-must-explicit-uncertain" },
    { rank: 2, appliesTo: "confirmed-jd-must-explicit-independent-calibration-only" },
    { rank: 3, appliesTo: "confirmed-responsibility-existing-practice" },
    { rank: 4, appliesTo: "confirmed-jd-preferred" },
    { rank: 5, appliesTo: "remaining-existing-tasks" },
  ],
  compareOnlyReady: true,
  prerequisiteInheritance: "minimum-descendant-rank",
  tieBreak: ["original-stable-order", "id"],
} as const;

// Literal snapshots intentionally do not call deterministicId or the builder to
// calculate their expected answers. Existing builder tests validate them independently.
const UNIT_IDS = {
  "foundation-learn-01": "path-unit-c2d7ce2f1b7e88156872bdbb6bf98351",
  "ui-learn-01": "path-unit-52a6e50eeb119588689a831200d499bc",
  "sql-learn-01": "path-unit-627b76b2255b7c6c4af9a4fe554e2dd8",
  "sql-calibrate-01": "path-unit-b283eeab7eb57341f64e2157d3c307cd",
  "analytics-learn-01": "path-unit-3635051ebae038003f8d9d3aae7acaec",
  "analytics-calibrate-01": "path-unit-10386b7794e8f2b587c3bc93cc1b29c1",
} as const;
type TemplateId = keyof typeof UNIT_IDS;

type MaterialsScenario = {
  id: string;
  input: PathBuildInput;
  signals: {
    requirements: { skillId: string; level: "must" | "preferred" | "unspecified" }[];
    practiceSkillIds: string[];
    documentText: string;
  };
  expected: {
    originalTemplates: TemplateId[];
    originalUnitIds: string[];
    initialTemplates: TemplateId[];
    initialUnitIds: string[];
    reorder: { completedUnitIds: string[]; originalUnfinishedUnitIds: string[]; expectedUnfinishedUnitIds: string[] };
    uncovered: string[];
    reviewRequired: string[];
    targetDate: {
      protectedSkillIds: string[];
      protectedUnitIds: string[];
      protectedMinutes: number;
      availableMinutes: number;
      targetWeeks: number;
      status: "infeasible";
    } | null;
  };
};

function template(skillId: string, kind: UnitTemplate["kind"]): UnitTemplate {
  const id = `${skillId}-${kind}-01`;
  const minutes = kind === "learn" ? 60 : 30;
  return {
    id, version: "2026.08.1", skillId, kind,
    title: `Complete the synthetic ${skillId} ${kind} exercise`,
    objective: `Produce a reviewable ${skillId} practice artifact.`,
    whyNow: `This authored exercise develops the next ${skillId} capability.`,
    primaryResourceId: `${skillId}-resource`, alternativeResourceIds: [],
    steps: [{ id: `${id}-step-01`, label: `Build and verify the ${skillId} example`, minutes }],
    checkpoints: [], buildTask: `Build the synthetic ${skillId} example and record observations.`,
    completionCriteria: [`The ${skillId} example is complete and reproducible.`],
    proofRequirement: `Provide the ${skillId} artifact and its verification notes.`,
    rubric: [`Level 2: The ${skillId} artifact satisfies its stated outcome.`], estimatedMinutes: minutes,
  };
}

function baselineInput(): PathBuildInput {
  const specifications = [
    { id: "foundation", importance: "core" as const, prerequisiteIds: [] },
    { id: "ui", importance: "advantage" as const, prerequisiteIds: [] },
    { id: "sql", importance: "strong" as const, prerequisiteIds: ["foundation"] },
    { id: "analytics", importance: "strong" as const, prerequisiteIds: ["sql"] },
  ];
  const blueprint: RoleBlueprint = {
    id: "materials-role", name: "Synthetic materials planning role",
    summary: "Four authored skills used only for private-material planning acceptance fixtures.",
    version: "2026.08.1", status: "ready", updatedAt: "2026-11-04", languagePolicy: "english-first",
    skills: specifications.map((skill) => ({
      ...skill, name: `Synthetic ${skill.id}`, category: "foundations", confidence: 0.9,
      why: `The ${skill.id} skill contributes to the synthetic role outcome.`,
      masteryCriteria: [`Explain the ${skill.id} boundary.`, `Build and verify a ${skill.id} example.`],
      resourceIds: [`${skill.id}-resource`],
    })),
    resources: specifications.map(({ id }) => ({
      id: `${id}-resource`, title: `Synthetic ${id} reference`, url: `https://docs.example.com/${id}`,
      provider: "Synthetic Example Docs", language: "en", cost: "free", format: "documentation",
      sourceTier: "primary", purpose: "primary", estimatedMinutes: null, lastVerifiedAt: "2026-11-04", skillIds: [id],
    })),
    phases: [{ id: "materials-phase-01", name: "Synthetic practice", weeks: 4,
      outcome: "Complete the four existing practice tracks.", skillIds: specifications.map(({ id }) => id) }],
  };
  const registry: UnitRegistry = {
    id: "materials-role-units", version: "2026.08.1", blueprintId: blueprint.id, blueprintVersion: blueprint.version,
    tracks: specifications.map(({ id }) => ({ skillId: id,
      templates: [template(id, "learn"), template(id, "calibrate"), template(id, "reinforce")] })),
  };
  return {
    blueprint, registry,
    audit: { id: "materials-audit-01", schemaVersion: PLANNING_SCHEMA_VERSION,
      blueprintId: blueprint.id, blueprintVersion: blueprint.version,
      answers: specifications.map(({ id }) => ({ skillId: id, level: "unseen", evidenceRefs: [] })),
      evidence: [], createdBy: "materials-device-01", inputFingerprint: "materials-audit-input" },
    availability: { id: "materials-availability-01", schemaVersion: PLANNING_SCHEMA_VERSION, timeZone: "UTC",
      weekdays: { monday: 60, tuesday: 60, wednesday: 60, thursday: 60, friday: 60, saturday: 0, sunday: 0 },
      exceptions: [], weeklyMinutes: 300, inputFingerprint: "materials-availability-input" },
    target: { id: "materials-target-01", schemaVersion: PLANNING_SCHEMA_VERSION, targetWeeks: 4, inputFingerprint: "materials-target-input" },
    planningDate: "2026-11-04",
  };
}

function scenario(
  id: string,
  initialTemplates: TemplateId[],
  options: {
    levels?: Record<string, SkillAuditVersion["answers"][number]["level"]>;
    originalTemplates?: TemplateId[];
    completedTemplates?: TemplateId[];
    signals?: Partial<MaterialsScenario["signals"]>;
    uncovered?: string[];
    reviewRequired?: string[];
  } = {},
): MaterialsScenario {
  const input = baselineInput();
  for (const answer of input.audit.answers) answer.level = options.levels?.[answer.skillId] ?? answer.level;
  const originalTemplates = options.originalTemplates ?? ["foundation-learn-01", "ui-learn-01", "sql-learn-01", "analytics-learn-01"];
  const completed = options.completedTemplates ?? [];
  return {
    id, input,
    signals: { requirements: [], practiceSkillIds: [], documentText: "", ...options.signals },
    expected: {
      originalTemplates, originalUnitIds: originalTemplates.map((name) => UNIT_IDS[name]),
      initialTemplates, initialUnitIds: initialTemplates.map((name) => UNIT_IDS[name]),
      reorder: { completedUnitIds: completed.map((name) => UNIT_IDS[name]),
        originalUnfinishedUnitIds: originalTemplates.filter((name) => !completed.includes(name)).map((name) => UNIT_IDS[name]),
        expectedUnfinishedUnitIds: initialTemplates.filter((name) => !completed.includes(name)).map((name) => UNIT_IDS[name]) },
      uncovered: options.uncovered ?? [], reviewRequired: options.reviewRequired ?? [], targetDate: null,
    },
  };
}

export function materialsPlanningFixture(): { baseline: PathBuildInput; scenarios: MaterialsScenario[] } {
  const original: TemplateId[] = ["foundation-learn-01", "ui-learn-01", "sql-learn-01", "analytics-learn-01"];
  const analyticsFirst: TemplateId[] = ["foundation-learn-01", "sql-learn-01", "analytics-learn-01", "ui-learn-01"];
  const mustSignals: MaterialsScenario["signals"] = {
    requirements: [{ skillId: "analytics", level: "must" }], practiceSkillIds: [],
    documentText: "[SYNTHETIC] JD requires analytics; the user explicitly confirmed learning is needed.",
  };
  const must = scenario("jd-must", analyticsFirst, { signals: mustSignals });
  // Target-date adaptation must protect this closure rather than drop analytics.
  // These literals are future-engine expectations; phase 0 tests only their inputs.
  must.expected.targetDate = { protectedSkillIds: ["foundation", "sql", "analytics"],
    protectedUnitIds: analyticsFirst.slice(0, 3).map((name) => UNIT_IDS[name]),
    protectedMinutes: 180, availableMinutes: 75, targetWeeks: 1, status: "infeasible" };
  return {
    baseline: baselineInput(),
    scenarios: [
      scenario("no-materials", original),
      must,
      scenario("resume-practice", ["ui-learn-01", "foundation-learn-01", "sql-learn-01", "analytics-learn-01"], {
        levels: { ui: "guided" }, signals: { practiceSkillIds: ["ui"],
          documentText: "[SYNTHETIC] User confirmed guided UI responsibilities; no independent mastery is inferred." },
      }),
      scenario("uncertain-sql", ["foundation-learn-01", "sql-calibrate-01", "sql-learn-01", "analytics-learn-01", "ui-learn-01"], {
        levels: { sql: "uncertain" }, signals: mustSignals,
        originalTemplates: ["foundation-learn-01", "ui-learn-01", "sql-calibrate-01", "sql-learn-01", "analytics-learn-01"],
        completedTemplates: ["foundation-learn-01", "sql-calibrate-01"],
      }),
      scenario("uncovered-conflict", original, {
        signals: { requirements: [{ skillId: "kubernetes", level: "must" }, { skillId: "sql", level: "unspecified" }],
          documentText: "[SYNTHETIC] Kubernetes is required. SQL self-assessment conflicts and remains unconfirmed. Course text: https://invalid.example/kubernetes-course" },
        uncovered: ["Kubernetes"], reviewRequired: ["conflicting-sql-self-assessment", "untrusted-course-url"],
      }),
      scenario("independent-must", ["foundation-learn-01", "sql-learn-01", "analytics-calibrate-01", "ui-learn-01"], {
        levels: { analytics: "independent" }, signals: { ...mustSignals,
          documentText: "[SYNTHETIC] JD requires analytics; the user individually selected independent for analytics." },
        originalTemplates: ["foundation-learn-01", "ui-learn-01", "sql-learn-01", "analytics-calibrate-01"],
      }),
      scenario("jd-preferred", analyticsFirst, { signals: { requirements: [{ skillId: "analytics", level: "preferred" }],
        documentText: "[SYNTHETIC] Analytics is preferred; no must requirement is supplied." } }),
    ],
  };
}
