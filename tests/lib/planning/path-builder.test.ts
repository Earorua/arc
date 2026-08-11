import { describe, expect, it } from "vitest";
import type { RoleBlueprint } from "../../../app/contracts/intelligence";
import {
  PLANNING_SCHEMA_VERSION,
  type AvailabilityVersion,
  type PlanningTarget,
  type SkillAuditVersion,
  type UnitRegistry,
} from "../../../app/contracts/planning";
import { flagshipBlueprint } from "../../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../../app/data/flagship-unit-registry";
import {
  PlanningInputError,
  createPathBuilder,
  type CompletionEstimator,
  type PathBuildInput,
} from "../../../app/lib/planning/path-builder";

type SkillSpec = {
  id: string;
  importance?: "core" | "strong" | "advantage";
  prerequisiteIds?: string[];
  phase?: number;
  learnMinutes?: number[];
};

const PLANNING_DATE = "2026-01-01";

function compactFixture(specs: SkillSpec[]): PathBuildInput {
  const maxPhase = Math.max(...specs.map((spec) => spec.phase ?? 0));
  const blueprint: RoleBlueprint = {
    id: "test-role",
    name: "Test role",
    summary: "A complete test role for deterministic path-builder behavior.",
    version: "2026.08.1",
    status: "ready",
    updatedAt: "2026-01-01",
    languagePolicy: "english-first",
    skills: specs.map((spec) => ({
      id: spec.id,
      name: `Skill ${spec.id}`,
      category: "foundations",
      importance: spec.importance ?? "strong",
      why: `Skill ${spec.id} matters to the test role outcome.`,
      confidence: 0.9,
      masteryCriteria: [
        `Explain the production boundary for ${spec.id}.`,
        `Build and verify an artifact using ${spec.id}.`,
      ],
      prerequisiteIds: spec.prerequisiteIds ?? [],
      resourceIds: [`${spec.id}-resource`],
    })),
    resources: specs.map((spec) => ({
      id: `${spec.id}-resource`,
      title: `Official ${spec.id} reference`,
      url: `https://docs.example.com/${spec.id}`,
      provider: "Example Docs",
      language: "en",
      cost: "free",
      format: "documentation",
      sourceTier: "primary",
      purpose: "primary",
      estimatedMinutes: null,
      lastVerifiedAt: "2026-01-01",
      skillIds: [spec.id],
    })),
    phases: Array.from({ length: maxPhase + 1 }, (_, phaseIndex) => ({
      id: `phase-${phaseIndex + 1}`,
      name: `Phase ${phaseIndex + 1}`,
      weeks: 1,
      outcome: `Complete all work assigned to phase ${phaseIndex + 1}.`,
      skillIds: specs
        .filter((spec) => (spec.phase ?? 0) === phaseIndex)
        .map((spec) => spec.id),
    })),
  };

  const registry: UnitRegistry = {
    id: "test-role-units",
    version: "2026.08.1",
    blueprintId: blueprint.id,
    blueprintVersion: blueprint.version,
    tracks: specs.map((spec) => ({
      skillId: spec.id,
      templates: [
        ...(spec.learnMinutes ?? [60]).map((minutes, index) => template(spec.id, "learn", index + 1, minutes)),
        template(spec.id, "calibrate", 1, 30),
        template(spec.id, "reinforce", 1, 30),
      ],
    })),
  };

  return {
    blueprint,
    registry,
    audit: auditFor(blueprint),
    availability: availability(),
    target: target(),
    planningDate: PLANNING_DATE,
  };
}

function template(skillId: string, kind: "learn" | "calibrate" | "reinforce", sequence: number, minutes: number) {
  const id = `${skillId}-${kind}-${String(sequence).padStart(2, "0")}`;
  const firstMinutes = minutes > 60 ? Math.floor(minutes / 2) : minutes;
  const secondMinutes = minutes - firstMinutes;
  const steps = [
    { id: `${id}-step-01`, label: `Complete ${id} step one`, minutes: firstMinutes },
    ...(secondMinutes > 0 ? [{ id: `${id}-step-02`, label: `Complete ${id} step two`, minutes: secondMinutes }] : []),
  ];
  const checkpoints = minutes > 60
    ? steps.map((step, index) => ({
      id: `${id}-checkpoint-${String(index + 1).padStart(2, "0")}`,
      label: `Checkpoint ${index + 1}`,
      stepIds: [step.id],
      estimatedMinutes: step.minutes,
    }))
    : [];
  return {
    id,
    version: "2026.08.1" as const,
    skillId,
    kind,
    title: `Complete ${id}`,
    objective: `Produce a reviewable outcome for ${id}.`,
    whyNow: `This unit establishes the next required capability for ${skillId}.`,
    primaryResourceId: `${skillId}-resource`,
    alternativeResourceIds: [],
    steps,
    checkpoints,
    buildTask: `Build and document the ${id} artifact.`,
    completionCriteria: [`The ${id} artifact is complete and reviewable.`],
    proofRequirement: `Provide the ${id} artifact and its verification result.`,
    rubric: [`Level 2: The ${id} artifact meets its stated outcome.`],
    estimatedMinutes: minutes,
  };
}

function auditFor(
  blueprint: RoleBlueprint,
  levels: Readonly<Record<string, "unseen" | "conceptual" | "guided" | "independent">> = {},
): SkillAuditVersion {
  return {
    id: "audit-01",
    schemaVersion: PLANNING_SCHEMA_VERSION,
    blueprintId: blueprint.id,
    blueprintVersion: blueprint.version,
    answers: blueprint.skills.map((skill) => ({
      skillId: skill.id,
      level: levels[skill.id] ?? "unseen",
      evidenceRefs: [],
    })),
    evidence: [],
    createdBy: "device-01",
    inputFingerprint: "audit-input",
  };
}

function availability(): AvailabilityVersion {
  return {
    id: "availability-01",
    schemaVersion: PLANNING_SCHEMA_VERSION,
    timeZone: "UTC",
    weekdays: {
      monday: 60,
      tuesday: 60,
      wednesday: 60,
      thursday: 60,
      friday: 60,
      saturday: 0,
      sunday: 0,
    },
    exceptions: [],
    weeklyMinutes: 300,
    inputFingerprint: "availability-input",
  };
}

function target(targetWeeks = 4): PlanningTarget {
  return {
    id: "target-01",
    schemaVersion: PLANNING_SCHEMA_VERSION,
    targetWeeks,
    inputFingerprint: "target-input",
  };
}

const immediateEstimator: CompletionEstimator = (_units, _availability, planningDate) => planningDate;

describe("createPathBuilder", () => {
  it.each(["unseen", "conceptual", "guided"] as const)(
    "selects every ordered learn template for a %s answer",
    (level) => {
      const input = compactFixture([{ id: "typescript", learnMinutes: [30, 45] }]);
      input.audit = auditFor(input.blueprint, { typescript: level });

      const result = createPathBuilder(immediateEstimator)(input);

      expect(result.fullScope.units.map((unit) => unit.templateId)).toEqual([
        "typescript-learn-01",
        "typescript-learn-02",
      ]);
      expect(result.fullScope.units[1]?.prerequisiteUnitIds).toEqual([
        result.fullScope.units[0]?.id,
      ]);
    },
  );

  it("selects only calibration for an independent answer", () => {
    const input = compactFixture([{ id: "typescript", learnMinutes: [30, 45] }]);
    input.audit = auditFor(input.blueprint, { typescript: "independent" });

    const result = createPathBuilder(immediateEstimator)(input);

    expect(result.fullScope.units).toEqual([
      expect.objectContaining({
        skillId: "typescript",
        kind: "calibrate",
        templateId: "typescript-calibrate-01",
      }),
    ]);
    expect(result.targetDate?.deferredSkills.map((item) => item.skillId)).not.toContain("typescript");
  });

  it("expands checkpoints and chains prerequisite skills before dependents", () => {
    const input = compactFixture([
      { id: "dependent", prerequisiteIds: ["foundation"], phase: 0 },
      { id: "foundation", phase: 1, learnMinutes: [90] },
    ]);

    const result = createPathBuilder(immediateEstimator)(input);
    const units = result.fullScope.units;
    const foundationUnits = units.filter((unit) => unit.skillId === "foundation");
    const dependent = units.find((unit) => unit.skillId === "dependent")!;

    expect(units.map((unit) => unit.skillId)).toEqual(["foundation", "foundation", "dependent"]);
    expect(foundationUnits).toHaveLength(2);
    expect(foundationUnits[1]?.prerequisiteUnitIds).toEqual([foundationUnits[0]?.id]);
    expect(dependent.prerequisiteUnitIds).toEqual([foundationUnits[1]?.id]);
  });

  it("uses phase index, then blueprint skill index, then ordinal ID for stable ready ties", () => {
    const input = compactFixture([
      { id: "later-phase", phase: 1 },
      { id: "zeta", phase: 0 },
      { id: "alpha", phase: 0 },
    ]);

    const result = createPathBuilder(immediateEstimator)(input);

    expect(result.fullScope.units.map((unit) => unit.skillId)).toEqual([
      "zeta",
      "alpha",
      "later-phase",
    ]);
  });

  it("includes every Flagship skill in the full-scope source of truth", () => {
    const input: PathBuildInput = {
      blueprint: flagshipBlueprint,
      registry: flagshipUnitRegistry,
      audit: auditFor(flagshipBlueprint),
      availability: availability(),
      target: target(52),
      planningDate: PLANNING_DATE,
    };

    const result = createPathBuilder(immediateEstimator)(input);

    expect(new Set(result.fullScope.units.map((unit) => unit.skillId))).toEqual(
      new Set(flagshipBlueprint.skills.map((skill) => skill.id)),
    );
    expect(result.fullScope.deferredSkills).toEqual([]);
  });

  it("defers advantage before eligible strong and stops at the first fitting schedule", () => {
    const input = compactFixture([
      { id: "core", importance: "core" },
      { id: "strong", importance: "strong" },
      { id: "advantage", importance: "advantage" },
    ]);
    const calls: string[][] = [];
    const estimator: CompletionEstimator = (units) => {
      calls.push(units.map((unit) => unit.skillId));
      return units.length > 2 ? "2026-02-01" : "2026-01-20";
    };

    const result = createPathBuilder(estimator)(input);

    expect(result.targetDate?.deferredSkills).toEqual([
      { skillId: "advantage", reason: "target-date-advantage" },
    ]);
    expect(result.targetDate?.units.map((unit) => unit.skillId)).toEqual(["core", "strong"]);
    expect(calls.at(-1)).toEqual(["core", "strong"]);
  });

  it("never defers core skills or their transitive prerequisites", () => {
    const input = compactFixture([
      { id: "advantage-root", importance: "advantage" },
      { id: "strong-middle", importance: "strong", prerequisiteIds: ["advantage-root"] },
      { id: "core-leaf", importance: "core", prerequisiteIds: ["strong-middle"] },
      { id: "optional", importance: "advantage" },
    ]);
    const estimator: CompletionEstimator = (units) => units.length > 3 ? "2026-02-01" : "2026-01-20";

    const result = createPathBuilder(estimator)(input);

    expect(result.targetDate?.deferredSkills).toEqual([
      { skillId: "optional", reason: "target-date-advantage" },
    ]);
    expect(result.targetDate?.units.map((unit) => unit.skillId)).toEqual([
      "advantage-root",
      "strong-middle",
      "core-leaf",
    ]);
  });

  it("recomputes prerequisite protection before considering a strong skill", () => {
    const input = compactFixture([
      { id: "core", importance: "core" },
      { id: "strong-base", importance: "strong" },
      { id: "advantage-child", importance: "advantage", prerequisiteIds: ["strong-base"] },
    ]);
    const estimator: CompletionEstimator = (units) => units.length > 1 ? "2026-02-01" : "2026-01-20";

    const result = createPathBuilder(estimator)(input);

    expect(result.targetDate?.deferredSkills).toEqual([
      { skillId: "advantage-child", reason: "target-date-advantage" },
      { skillId: "strong-base", reason: "target-date-strong" },
    ]);
    expect(result.targetDate?.units.map((unit) => unit.skillId)).toEqual(["core"]);
  });

  it("returns an explicit infeasible result when protected scope cannot fit", () => {
    const input = compactFixture([{ id: "core", importance: "core" }]);
    const result = createPathBuilder(() => "2026-02-01")(input);

    expect(result.targetDate).toBeNull();
    expect(result.infeasibleReason).toMatch(/target date/i);
    expect(result.fullScope.units).toHaveLength(1);
  });

  it("does not mutate inputs and returns deeply immutable path data", () => {
    const input = compactFixture([{ id: "typescript", learnMinutes: [90] }]);
    const before = JSON.stringify(input);

    const result = createPathBuilder(immediateEstimator)(input);

    expect(JSON.stringify(input)).toBe(before);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.fullScope)).toBe(true);
    expect(Object.isFrozen(result.fullScope.units)).toBe(true);
    expect(result.fullScope.units.every(Object.isFrozen)).toBe(true);
  });

  it("produces byte-identical output and stable IDs for identical inputs", () => {
    const input = compactFixture([{ id: "typescript", learnMinutes: [90, 30] }]);
    const build = createPathBuilder(immediateEstimator);

    const first = build(input);
    const second = build(structuredClone(input));

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.fullScope.id).toBe(second.fullScope.id);
    expect(first.fullScope.units.map((unit) => unit.id)).toEqual(
      second.fullScope.units.map((unit) => unit.id),
    );
  });

  it("uses the inclusive target deadline without shortening authored minutes", () => {
    const input = compactFixture([{ id: "core", importance: "core", learnMinutes: [90] }]);
    const seenMinutes: number[][] = [];
    const estimator: CompletionEstimator = (units) => {
      seenMinutes.push(units.map((unit) => unit.estimatedMinutes));
      return "2026-01-28";
    };

    const result = createPathBuilder(estimator)(input);

    expect(result.targetDate).not.toBeNull();
    expect(seenMinutes).toContainEqual([45, 45]);
    expect(result.targetDate?.units.map((unit) => unit.estimatedMinutes)).toEqual([45, 45]);
  });

  it("strict-parses every input and reports sorted, confidential public issues", () => {
    const input = compactFixture([{ id: "core", importance: "core" }]);
    input.audit.evidence = [{
      id: "secret-evidence",
      skillId: "core",
      kind: "other",
      url: "https://secret.example.com/private",
      note: "DO-NOT-LEAK-EVIDENCE-NOTE",
    }];
    input.audit.answers[0] = { ...input.audit.answers[0]!, evidenceRefs: ["secret-evidence"] };
    (input.target as PlanningTarget & { unexpected?: string }).unexpected = "DO-NOT-LEAK-INPUT";

    let caught: unknown;
    try {
      createPathBuilder(immediateEstimator)(input);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(PlanningInputError);
    const error = caught as PlanningInputError;
    expect(error.issues).toEqual([...error.issues].sort((left, right) =>
      left.code.localeCompare(right.code) || left.path.localeCompare(right.path)));
    const serialized = JSON.stringify({ message: error.message, issues: error.issues });
    expect(serialized).not.toContain("DO-NOT-LEAK");
    expect(serialized).not.toContain("secret.example.com");
  });

  it("runs semantic blueprint, registry, audit coverage, and availability-horizon validation", () => {
    const input = compactFixture([
      { id: "core", importance: "core" },
      { id: "extra", importance: "advantage" },
    ]);
    input.blueprint.skills[0]!.prerequisiteIds = ["missing"];
    input.registry.tracks[0]!.templates = input.registry.tracks[0]!.templates.filter(
      (item) => item.kind !== "reinforce",
    );
    input.audit.answers = [input.audit.answers[0]!, {
      skillId: "not-in-blueprint",
      level: "unseen",
      evidenceRefs: [],
    }];
    input.availability.exceptions = [{ date: "2027-01-02", minutes: 30, reason: null }];

    expect(() => createPathBuilder(immediateEstimator)(input)).toThrowError(PlanningInputError);
    try {
      createPathBuilder(immediateEstimator)(input);
    } catch (error) {
      const codes = (error as PlanningInputError).issues.map((issue) => issue.code);
      expect(codes).toEqual(expect.arrayContaining([
        "audit-answer-extra",
        "audit-answer-missing",
        "availability-horizon-invalid",
        "blueprint-missing-prerequisite",
        "registry-missing-kind",
      ]));
    }
  });
});
