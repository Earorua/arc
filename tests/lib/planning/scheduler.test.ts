import { describe, expect, it } from "vitest";
import {
  PLANNING_SCHEMA_VERSION,
  dailyUnitSchema,
  planVersionSchema,
  type AvailabilityVersion,
  type LearningPathVersion,
  type PathUnit,
  type UnitRegistry,
  type UnitTemplate,
} from "../../../app/contracts/planning";
import { addCalendarDays, calendarDates, weekdayForDate } from "../../../app/lib/planning/calendar";
import {
  PlanningScheduleError,
  buildPlanVersion,
  estimateCompletionDate,
} from "../../../app/lib/planning/scheduler";

const PLANNING_DATE = "2026-12-29";

type UnitSpec = Readonly<{
  id: string;
  skillId?: string;
  minutes?: number;
  prerequisites?: readonly string[];
  checkpointId?: string | null;
}>;

function pathUnit(spec: UnitSpec): PathUnit {
  const skillId = spec.skillId ?? spec.id.split("-")[0]!;
  return {
    id: spec.id,
    templateId: `${skillId}-learn-01`,
    templateVersion: "2026.08.1",
    checkpointId: spec.checkpointId ?? null,
    skillId,
    kind: "learn",
    estimatedMinutes: spec.minutes ?? 45,
    prerequisiteUnitIds: [...(spec.prerequisites ?? [])],
  };
}

function template(
  skillId: string,
  kind: "learn" | "calibrate" | "reinforce",
  minutes: number,
): UnitTemplate {
  const id = `${skillId}-${kind}-01`;
  return {
    id,
    version: "2026.08.1",
    skillId,
    kind,
    title: `${kind} ${skillId}`,
    objective: `Produce a reviewable ${kind} outcome for ${skillId}.`,
    whyNow: `This ${kind} unit is the next useful step for ${skillId}.`,
    primaryResourceId: `${skillId}-resource`,
    alternativeResourceIds: [],
    steps: [{ id: `${id}-step-01`, label: `Complete ${kind} work for ${skillId}`, minutes }],
    checkpoints: [],
    buildTask: `Build the ${kind} artifact for ${skillId}.`,
    completionCriteria: [`The ${kind} artifact for ${skillId} is reviewable.`],
    proofRequirement: `Provide proof for the ${kind} artifact for ${skillId}.`,
    rubric: [`Level 2: The ${kind} artifact for ${skillId} meets its outcome.`],
    estimatedMinutes: minutes,
  };
}

function registryFor(units: readonly PathUnit[], reinforceMinutes = 15): UnitRegistry {
  const skills = [...new Set(units.map((unit) => unit.skillId))];
  return {
    id: "test-units",
    version: "2026.08.1",
    blueprintId: "test-role",
    blueprintVersion: "2026.08.1",
    tracks: skills.map((skillId) => ({
      skillId,
      templates: [
        template(skillId, "learn", units.find((unit) => unit.skillId === skillId)!.estimatedMinutes),
        template(skillId, "calibrate", 30),
        template(skillId, "reinforce", reinforceMinutes),
      ],
    })),
  };
}

function pathFor(units: readonly PathUnit[], estimatedCompletionDate = "2027-01-31"): LearningPathVersion {
  return {
    id: "learning-path-01",
    schemaVersion: PLANNING_SCHEMA_VERSION,
    blueprintId: "test-role",
    blueprintVersion: "2026.08.1",
    registryId: "test-units",
    registryVersion: "2026.08.1",
    auditVersionId: "audit-01",
    availabilityVersionId: "availability-01",
    targetId: "target-01",
    scopeMode: "full-scope",
    phases: [{
      phaseId: "phase-01",
      name: "Foundation",
      outcome: "Complete every scheduled foundation unit.",
      unitIds: units.map((unit) => unit.id),
    }],
    units: [...units],
    deferredSkills: [],
    estimatedStartDate: PLANNING_DATE,
    estimatedCompletionDate,
    inputFingerprint: "path-input",
  };
}

function availability(overrides: Partial<AvailabilityVersion> = {}): AvailabilityVersion {
  return {
    id: "availability-01",
    schemaVersion: PLANNING_SCHEMA_VERSION,
    timeZone: "America/New_York",
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
    ...overrides,
  };
}

function buildInput(
  units: readonly PathUnit[],
  overrides: Partial<Parameters<typeof buildPlanVersion>[0]> = {},
) {
  return {
    path: pathFor(units),
    registry: registryFor(units),
    availability: availability(),
    planningDate: PLANNING_DATE,
    generation: "initial" as const,
    baseVersionId: null,
    replanReason: null,
    completedUnitIds: new Set<string>(),
    ...overrides,
  };
}

describe("estimateCompletionDate", () => {
  it("schedules one full required unit per available date in dependency order", () => {
    const units = [
      pathUnit({ id: "alpha-unit", minutes: 60 }),
      pathUnit({ id: "beta-unit", minutes: 45, prerequisites: ["alpha-unit"] }),
    ];
    const result = estimateCompletionDate({
      units,
      availability: availability(),
      planningDate: "2026-12-31",
    });

    expect(result).toBe("2027-01-01");
  });

  it("uses exception minutes before weekday minutes and never partially schedules a unit", () => {
    const units = [pathUnit({ id: "alpha-unit", minutes: 60 })];
    const inputAvailability = availability({
      exceptions: [{ date: "2026-12-29", minutes: 30, reason: "Short day" }],
    });

    expect(estimateCompletionDate({
      units,
      availability: inputAvailability,
      planningDate: PLANNING_DATE,
    })).toBe("2026-12-30");

    inputAvailability.exceptions[0] = { date: "2026-12-29", minutes: 60, reason: "Open day" };
    expect(estimateCompletionDate({
      units,
      availability: inputAvailability,
      planningDate: PLANNING_DATE,
    })).toBe("2026-12-29");
  });

  it("does not bypass the next required unit with a shorter later unit", () => {
    const units = [
      pathUnit({ id: "alpha-unit", minutes: 60 }),
      pathUnit({ id: "beta-unit", minutes: 30 }),
    ];
    const inputAvailability = availability({
      exceptions: [{ date: PLANNING_DATE, minutes: 30, reason: "Short day" }],
    });

    expect(estimateCompletionDate({
      units,
      availability: inputAvailability,
      planningDate: PLANNING_DATE,
    })).toBe("2026-12-31");
  });

  it("excludes completed required units without mutating caller state", () => {
    const units = [
      pathUnit({ id: "alpha-unit", minutes: 60 }),
      pathUnit({ id: "beta-unit", minutes: 60, prerequisites: ["alpha-unit"] }),
    ];
    const before = JSON.stringify(units);
    const completed = new Set(["alpha-unit"]);

    const result = estimateCompletionDate({
      units,
      availability: availability(),
      planningDate: PLANNING_DATE,
      completedUnitIds: completed,
    });

    expect(result).toBe(PLANNING_DATE);
    expect(JSON.stringify(units)).toBe(before);
    expect([...completed]).toEqual(["alpha-unit"]);
  });

  it("returns the planning date when every required unit is already complete", () => {
    const units = [pathUnit({ id: "alpha-unit" })];
    expect(estimateCompletionDate({
      units,
      availability: availability(),
      planningDate: PLANNING_DATE,
      completedUnitIds: new Set(["alpha-unit"]),
    })).toBe(PLANNING_DATE);
  });

  it("reports UNIT_NEVER_FITS before horizon exhaustion for an oversized atomic unit", () => {
    const units = [pathUnit({ id: "alpha-unit", minutes: 90 })];

    expectScheduleError(
      () => estimateCompletionDate({ units, availability: availability(), planningDate: PLANNING_DATE }),
      "UNIT_NEVER_FITS",
    );
  });

  it("allows the final required unit to land on exact horizon day 3660", () => {
    const planningDate = "2026-12-28";
    const units = Array.from({ length: 523 }, (_, index) => pathUnit({
      id: `skill-${index + 1}-unit`,
      skillId: `skill-${index + 1}`,
      minutes: 60,
      prerequisites: index === 0 ? [] : [`skill-${index}-unit`],
    }));
    const sparse = availability({
      weekdays: {
        monday: 0,
        tuesday: 0,
        wednesday: 0,
        thursday: 0,
        friday: 0,
        saturday: 60,
        sunday: 0,
      },
      weeklyMinutes: 60,
    });

    expect(estimateCompletionDate({ units, availability: sparse, planningDate }))
      .toBe(addCalendarDays(planningDate, 3_659));
  });

  it("reports SCHEDULE_HORIZON_EXCEEDED when completion would require day 3661 or later", () => {
    const planningDate = "2026-12-28";
    const units = Array.from({ length: 524 }, (_, index) => pathUnit({
      id: `skill-${index + 1}-unit`,
      skillId: `skill-${index + 1}`,
      minutes: 60,
      prerequisites: index === 0 ? [] : [`skill-${index}-unit`],
    }));
    const sparse = availability({
      weekdays: {
        monday: 0,
        tuesday: 0,
        wednesday: 0,
        thursday: 0,
        friday: 0,
        saturday: 60,
        sunday: 0,
      },
      weeklyMinutes: 60,
    });

    expectScheduleError(
      () => estimateCompletionDate({ units, availability: sparse, planningDate }),
      "SCHEDULE_HORIZON_EXCEEDED",
    );
  });

  it("completes on the first day near year 9999 without eagerly overflowing the horizon", () => {
    const units = [pathUnit({ id: "alpha-unit", minutes: 60 })];
    const alwaysAvailable = availability({
      weekdays: {
        monday: 60,
        tuesday: 60,
        wednesday: 60,
        thursday: 60,
        friday: 60,
        saturday: 60,
        sunday: 60,
      },
      weeklyMinutes: 420,
    });

    expect(estimateCompletionDate({
      units,
      availability: alwaysAvailable,
      planningDate: "9999-12-31",
    })).toBe("9999-12-31");
  });

  it("keeps UNIT_NEVER_FITS precedence near the representable year boundary", () => {
    const units = [pathUnit({ id: "alpha-unit", minutes: 90 })];
    const inputAvailability = availability();

    expectScheduleError(() => estimateCompletionDate({
      units,
      availability: inputAvailability,
      planningDate: "9999-12-31",
    }), "UNIT_NEVER_FITS");
  });

  it("reports horizon exhaustion when a near-year-boundary unit could fit only later", () => {
    const units = [pathUnit({ id: "alpha-unit", minutes: 60 })];
    const inputAvailability = availability({
      weekdays: {
        monday: 60,
        tuesday: 60,
        wednesday: 60,
        thursday: 60,
        friday: 60,
        saturday: 60,
        sunday: 60,
      },
      weeklyMinutes: 420,
    });
    const currentWeekday = weekdayForDate("9999-12-31");
    inputAvailability.weekdays[currentWeekday] = 30;
    inputAvailability.weeklyMinutes = 390;

    expectScheduleError(() => estimateCompletionDate({
      units,
      availability: inputAvailability,
      planningDate: "9999-12-31",
    }), "SCHEDULE_HORIZON_EXCEEDED");
  });

  it("keeps calendar dates exact across a DST boundary", () => {
    const units = [
      pathUnit({ id: "alpha-unit" }),
      pathUnit({ id: "beta-unit", prerequisites: ["alpha-unit"] }),
      pathUnit({ id: "gamma-unit", prerequisites: ["beta-unit"] }),
    ];
    const weekends = availability({
      weekdays: {
        monday: 45,
        tuesday: 0,
        wednesday: 0,
        thursday: 0,
        friday: 0,
        saturday: 45,
        sunday: 45,
      },
      weeklyMinutes: 135,
    });

    expect(estimateCompletionDate({
      units,
      availability: weekends,
      planningDate: "2026-10-31",
    })).toBe("2026-11-02");
  });

  it("validates unique IDs, prerequisite resolution, and iterative acyclicity", () => {
    const invalidCases = [
      [pathUnit({ id: "alpha-unit", prerequisites: ["missing-unit"] })],
      [pathUnit({ id: "alpha-unit" }), pathUnit({ id: "alpha-unit" })],
      [
        pathUnit({ id: "alpha-unit", prerequisites: ["beta-unit"] }),
        pathUnit({ id: "beta-unit", prerequisites: ["alpha-unit"] }),
      ],
      [pathUnit({ id: "alpha-unit", prerequisites: ["alpha-unit"] })],
    ];

    for (const units of invalidCases) {
      expectScheduleError(() => estimateCompletionDate({
        units,
        availability: availability(),
        planningDate: PLANNING_DATE,
      }), "INVALID_SCHEDULE_INPUT");
    }
  });

  it("schedules an unordered valid DAG by eligibility while retaining declared tie order", () => {
    const units = [
      pathUnit({ id: "dependent-unit", prerequisites: ["foundation-unit"] }),
      pathUnit({ id: "foundation-unit" }),
      pathUnit({ id: "parallel-unit" }),
    ];

    expect(estimateCompletionDate({
      units,
      availability: availability(),
      planningDate: PLANNING_DATE,
    })).toBe("2026-12-31");
  });

  it.each(["past", "day-366"] as const)(
    "rejects a %s availability exception outside the supported horizon",
    (position) => {
      const exceptionDate = position === "past"
        ? addCalendarDays(PLANNING_DATE, -1)
        : addCalendarDays(PLANNING_DATE, 366);
      const units = [pathUnit({ id: "alpha-unit" })];
      expectScheduleError(() => estimateCompletionDate({
        units,
        availability: availability({
          exceptions: [{ date: exceptionDate, minutes: 60, reason: "Out of range" }],
        }),
        planningDate: PLANNING_DATE,
      }), "INVALID_SCHEDULE_INPUT");
    },
  );
});

describe("buildPlanVersion", () => {
  it("builds exactly seven consecutive dates with rest, open, and scheduled states", () => {
    const units = [
      pathUnit({ id: "alpha-unit", minutes: 45 }),
      pathUnit({ id: "beta-unit", minutes: 45, prerequisites: ["alpha-unit"] }),
    ];
    const result = buildPlanVersion(buildInput(units, {
      availability: availability({
        exceptions: [{ date: "2026-12-30", minutes: 30, reason: "Short day" }],
      }),
    }));

    expect(result.plan.days).toHaveLength(7);
    expect(result.plan.days.map((day) => day.date)).toEqual(calendarDates(PLANNING_DATE, 7));
    expect(result.plan.days[0]).toMatchObject({ status: "scheduled", budgetMinutes: 60 });
    expect(result.plan.days[1]).toMatchObject({ status: "open", budgetMinutes: 30, primaryUnitId: null });
    expect(result.plan.days[2]).toMatchObject({ status: "scheduled", budgetMinutes: 60 });
    expect(result.plan.days[4]).toMatchObject({
      date: "2027-01-02",
      status: "rest",
      budgetMinutes: 0,
      primaryUnitId: null,
      stretchUnitId: null,
    });
  });

  it("lets an exception turn a recurring rest day into a scheduled day", () => {
    const units = Array.from({ length: 5 }, (_, index) => pathUnit({
      id: `skill-${index + 1}-unit`,
      skillId: `skill-${index + 1}`,
      minutes: 45,
      prerequisites: index === 0 ? [] : [`skill-${index}-unit`],
    }));
    const result = buildPlanVersion(buildInput(units, {
      availability: availability({
        exceptions: [{ date: "2027-01-02", minutes: 45, reason: "Weekend session" }],
      }),
    }));

    expect(result.plan.days[4]).toMatchObject({
      date: "2027-01-02",
      status: "scheduled",
      budgetMinutes: 45,
      primaryUnitId: "skill-5-unit",
    });
  });

  it("keeps a short day open instead of bypassing the next required unit", () => {
    const units = [
      pathUnit({ id: "alpha-unit", minutes: 60 }),
      pathUnit({ id: "beta-unit", minutes: 30 }),
    ];
    const result = buildPlanVersion(buildInput(units, {
      availability: availability({
        exceptions: [{ date: PLANNING_DATE, minutes: 30, reason: "Short day" }],
      }),
    }));

    expect(result.plan.days[0]).toMatchObject({ status: "open", primaryUnitId: null });
    expect(result.plan.days[1]).toMatchObject({ primaryUnitId: "alpha-unit" });
    expect(result.plan.days[2]).toMatchObject({ primaryUnitId: "beta-unit" });
  });

  it("places at most one eligible required primary per day without minute overrun", () => {
    const units = [
      pathUnit({ id: "alpha-unit", minutes: 45 }),
      pathUnit({ id: "beta-unit", minutes: 45, prerequisites: ["alpha-unit"] }),
      pathUnit({ id: "gamma-unit", minutes: 45, prerequisites: ["beta-unit"] }),
    ];
    const { plan, dailyUnits } = buildPlanVersion(buildInput(units));
    const dailyById = new Map(dailyUnits.map((unit) => [unit.id, unit]));
    const primaryUnits = dailyUnits.filter((unit) => unit.required);

    expect(primaryUnits.map((unit) => unit.id)).toEqual(units.map((unit) => unit.id));
    expect(primaryUnits.map((unit) => unit.scheduledDate)).toEqual([
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
    ]);
    for (const day of plan.days) {
      const primary = dailyById.get(day.primaryUnitId ?? "");
      const stretch = dailyById.get(day.stretchUnitId ?? "");
      expect((primary?.estimatedMinutes ?? 0) + (stretch?.estimatedMinutes ?? 0))
        .toBeLessThanOrEqual(day.budgetMinutes);
    }
  });

  it("adds at most one full matching-skill reinforce stretch with a contextual stable ID", () => {
    const units = [pathUnit({ id: "alpha-unit", minutes: 45 })];
    const first = buildPlanVersion(buildInput(units));
    const repeated = buildPlanVersion(structuredCloneBuildInput(buildInput(units)));
    const stretch = first.dailyUnits.find((unit) => unit.slot === "stretch")!;

    expect(stretch).toMatchObject({
      skillId: "alpha",
      kind: "reinforce",
      required: false,
      scheduledDate: PLANNING_DATE,
      estimatedMinutes: 15,
    });
    expect(first.plan.days[0]?.stretchUnitId).toBe(stretch.id);
    expect(JSON.stringify(first)).toBe(JSON.stringify(repeated));
    expect(stretch.id).toMatch(/^daily-unit-/u);
  });

  it("scopes optional stretch IDs to their plan-version context", () => {
    const units = [pathUnit({ id: "alpha-unit", minutes: 45 })];
    const initial = buildPlanVersion(buildInput(units));
    const proposed = buildPlanVersion(buildInput(units, {
      generation: "proposed",
      baseVersionId: initial.plan.id,
      replanReason: "delayed",
    }));

    expect(proposed.plan.id).not.toBe(initial.plan.id);
    expect(proposed.plan.days[0]?.stretchUnitId).not.toBe(initial.plan.days[0]?.stretchUnitId);
    expect(proposed.plan.days[0]?.primaryUnitId).toBe(initial.plan.days[0]?.primaryUnitId);
  });

  it("does not add stretch when the full reinforce template cannot fit", () => {
    const units = [pathUnit({ id: "alpha-unit", minutes: 45 })];
    const input = buildInput(units);
    input.registry = registryFor(units, 30);

    const result = buildPlanVersion(input);

    expect(result.dailyUnits.filter((unit) => unit.slot === "stretch")).toEqual([]);
    expect(result.plan.days[0]?.stretchUnitId).toBeNull();
  });

  it("keeps optional stretch outside the promised completion date", () => {
    const units = [
      pathUnit({ id: "alpha-unit", minutes: 45 }),
      pathUnit({ id: "beta-unit", minutes: 45, prerequisites: ["alpha-unit"] }),
    ];
    const input = buildInput(units);
    const expected = estimateCompletionDate({
      units,
      availability: input.availability,
      planningDate: input.planningDate,
    });

    const result = buildPlanVersion(input);

    expect(result.plan.estimatedCompletionDate).toBe(expected);
    expect(result.dailyUnits.some((unit) => unit.slot === "stretch")).toBe(true);
  });

  it("excludes completed required units and treats their dependencies as satisfied", () => {
    const units = [
      pathUnit({ id: "alpha-unit", minutes: 45 }),
      pathUnit({ id: "beta-unit", minutes: 45, prerequisites: ["alpha-unit"] }),
    ];
    const result = buildPlanVersion(buildInput(units, {
      completedUnitIds: new Set(["alpha-unit"]),
    }));

    expect(result.dailyUnits.filter((unit) => unit.required).map((unit) => unit.id)).toEqual(["beta-unit"]);
    expect(result.plan.days[0]?.primaryUnitId).toBe("beta-unit");
  });

  it("projects content for a declared checkpoint without leaking other checkpoint steps", () => {
    const unit = pathUnit({
      id: "alpha-unit",
      minutes: 30,
      checkpointId: "alpha-learn-01-checkpoint-01",
    });
    const input = buildInput([unit]);
    const learn = input.registry.tracks[0]!.templates[0]!;
    learn.steps = [
      { id: "alpha-learn-01-step-01", label: "First checkpoint", minutes: 30 },
      { id: "alpha-learn-01-step-02", label: "Second checkpoint", minutes: 30 },
    ];
    learn.checkpoints = [
      {
        id: "alpha-learn-01-checkpoint-01",
        label: "First checkpoint",
        stepIds: ["alpha-learn-01-step-01"],
        estimatedMinutes: 30,
      },
      {
        id: "alpha-learn-01-checkpoint-02",
        label: "Second checkpoint",
        stepIds: ["alpha-learn-01-step-02"],
        estimatedMinutes: 30,
      },
    ];
    learn.estimatedMinutes = 60;

    const result = buildPlanVersion(input);
    const primary = result.dailyUnits.find((daily) => daily.required)!;

    expect(primary.checkpointId).toBe("alpha-learn-01-checkpoint-01");
    expect(primary.steps.map((step) => step.id)).toEqual(["alpha-learn-01-step-01"]);
    expect(primary.estimatedMinutes).toBe(30);
  });

  it("returns contract-valid, byte-identical output and does not mutate inputs", () => {
    const units = [pathUnit({ id: "alpha-unit", minutes: 45 })];
    const input = buildInput(units);
    const before = snapshotBuildInput(input);

    const first = buildPlanVersion(input);
    const second = buildPlanVersion(structuredCloneBuildInput(input));

    expect(planVersionSchema.parse(first.plan)).toEqual(first.plan);
    expect(first.dailyUnits.map((unit) => dailyUnitSchema.parse(unit))).toEqual(first.dailyUnits);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.plan.id).toBe(second.plan.id);
    expect(snapshotBuildInput(input)).toBe(before);
  });

  it("uses parsed domain inputs for IDs while excluding runtime metadata and ambient clock", () => {
    const units = [pathUnit({ id: "alpha-unit", minutes: 45 })];
    const input = buildInput(units);
    const first = buildPlanVersion(input);
    const originalNow = Date.now;
    Date.now = () => 123;
    try {
      const second = buildPlanVersion(structuredCloneBuildInput(input));
      expect(second.plan.id).toBe(first.plan.id);
      expect(second.plan.inputFingerprint).toBe(first.plan.inputFingerprint);
    } finally {
      Date.now = originalNow;
    }
  });

  it("strict-parses public inputs and reports a deterministic typed error", () => {
    const units = [pathUnit({ id: "alpha-unit" })];
    const input = buildInput(units) as ReturnType<typeof buildInput> & { unexpected?: string };
    input.unexpected = "private-value";

    expectScheduleError(() => buildPlanVersion(input), "INVALID_SCHEDULE_INPUT");
  });

  it("validates availability horizon and path graph at the plan boundary", () => {
    const validUnits = [pathUnit({ id: "alpha-unit" })];
    expectScheduleError(() => buildPlanVersion(buildInput(validUnits, {
      availability: availability({
        exceptions: [{
          date: addCalendarDays(PLANNING_DATE, 366),
          minutes: 60,
          reason: "Out of range",
        }],
      }),
    })), "INVALID_SCHEDULE_INPUT");

    const cyclic = [
      pathUnit({ id: "alpha-unit", prerequisites: ["beta-unit"] }),
      pathUnit({ id: "beta-unit", prerequisites: ["alpha-unit"] }),
    ];
    expectScheduleError(() => buildPlanVersion(buildInput(cyclic)), "INVALID_SCHEDULE_INPUT");
  });

  it("contains hostile object traps at the typed public boundary", () => {
    const hostile = new Proxy({}, {
      ownKeys() {
        throw new Error("DO-NOT-LEAK-PROXY-DETAIL");
      },
    });

    let caught: unknown;
    try {
      estimateCompletionDate(hostile as Parameters<typeof estimateCompletionDate>[0]);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(PlanningScheduleError);
    expect((caught as PlanningScheduleError).code).toBe("INVALID_SCHEDULE_INPUT");
    expect((caught as Error).message).not.toContain("DO-NOT-LEAK");
  });

  it.each(["estimate", "plan"] as const)(
    "rejects a top-level own getter without invoking it at the %s boundary",
    (boundary) => {
      let getterCalls = 0;
      const units = [pathUnit({ id: "alpha-unit" })];
      const input = boundary === "estimate"
        ? {
          availability: availability(),
          planningDate: PLANNING_DATE,
        } as Partial<Parameters<typeof estimateCompletionDate>[0]>
        : buildInput(units) as Partial<Parameters<typeof buildPlanVersion>[0]>;
      Object.defineProperty(input, boundary === "estimate" ? "units" : "path", {
        enumerable: true,
        get() {
          getterCalls += 1;
          throw new Error("DO-NOT-INVOKE-TOP-LEVEL-GETTER");
        },
      });

      const operation = boundary === "estimate"
        ? () => estimateCompletionDate(input as Parameters<typeof estimateCompletionDate>[0])
        : () => buildPlanVersion(input as Parameters<typeof buildPlanVersion>[0]);
      expectScheduleError(operation, "INVALID_SCHEDULE_INPUT");
      expect(getterCalls).toBe(0);
    },
  );

  it.each(["estimate", "plan"] as const)(
    "contains a nested accessor failure during %s schema parsing",
    (boundary) => {
      const units = [pathUnit({ id: "alpha-unit" })];
      const inputAvailability = availability();
      let getterCalls = 0;
      Object.defineProperty(inputAvailability.weekdays, "monday", {
        enumerable: true,
        get() {
          getterCalls += 1;
          throw new Error("DO-NOT-LEAK-NESTED-GETTER");
        },
      });
      const operation = boundary === "estimate"
        ? () => estimateCompletionDate({
          units,
          availability: inputAvailability,
          planningDate: PLANNING_DATE,
        })
        : () => buildPlanVersion(buildInput(units, { availability: inputAvailability }));

      expectScheduleError(operation, "INVALID_SCHEDULE_INPUT");
      expect(getterCalls).toBe(0);
    },
  );

  it.each(["estimate", "plan"] as const)(
    "contains a nested proxy failure during %s schema parsing",
    (boundary) => {
      const units = [pathUnit({ id: "alpha-unit" })];
      const inputAvailability = availability();
      inputAvailability.weekdays = new Proxy(inputAvailability.weekdays, {
        ownKeys() {
          throw new Error("DO-NOT-LEAK-NESTED-PROXY");
        },
      });
      const operation = boundary === "estimate"
        ? () => estimateCompletionDate({
          units,
          availability: inputAvailability,
          planningDate: PLANNING_DATE,
        })
        : () => buildPlanVersion(buildInput(units, { availability: inputAvailability }));

      expectScheduleError(operation, "INVALID_SCHEDULE_INPUT");
    },
  );

  it.each(["estimate", "plan"] as const)(
    "contains a hostile completed-unit Set iterator at the %s boundary",
    (boundary) => {
      class HostileSet extends Set<string> {
        override [Symbol.iterator](): SetIterator<string> {
          throw new Error("DO-NOT-LEAK-SET-ITERATOR");
        }
      }
      const units = [pathUnit({ id: "alpha-unit" })];
      const completedUnitIds = new HostileSet(["alpha-unit"]);
      const operation = boundary === "estimate"
        ? () => estimateCompletionDate({
          units,
          availability: availability(),
          planningDate: PLANNING_DATE,
          completedUnitIds,
        })
        : () => buildPlanVersion(buildInput(units, { completedUnitIds }));

      expectScheduleError(operation, "INVALID_SCHEDULE_INPUT");
    },
  );

  it("does not reparse availability on every horizon day at maximum supported shape", () => {
    const units = Array.from({ length: 524 }, (_, index) => pathUnit({
      id: `skill-${index + 1}-unit`,
      skillId: `skill-${index + 1}`,
      minutes: 60,
      prerequisites: index === 0 ? [] : [`skill-${index}-unit`],
    }));
    const sparse = availability({
      weekdays: {
        monday: 0,
        tuesday: 0,
        wednesday: 0,
        thursday: 0,
        friday: 0,
        saturday: 60,
        sunday: 0,
      },
      weeklyMinutes: 60,
    });
    const OriginalDateTimeFormat = Intl.DateTimeFormat;
    const originalSetHas = Set.prototype.has;
    let constructorCalls = 0;
    let setHasCalls = 0;
    Intl.DateTimeFormat = function (...args: ConstructorParameters<typeof Intl.DateTimeFormat>) {
      constructorCalls += 1;
      return new OriginalDateTimeFormat(...args);
    } as typeof Intl.DateTimeFormat;
    Set.prototype.has = function (this: Set<unknown>, value: unknown): boolean {
      setHasCalls += 1;
      return originalSetHas.call(this, value);
    } as typeof Set.prototype.has;
    try {
      expectScheduleError(() => estimateCompletionDate({
        units,
        availability: sparse,
        planningDate: "2026-12-28",
      }), "SCHEDULE_HORIZON_EXCEEDED");
    } finally {
      Intl.DateTimeFormat = OriginalDateTimeFormat;
      Set.prototype.has = originalSetHas;
    }

    expect(constructorCalls).toBeLessThanOrEqual(3);
    expect(setHasCalls).toBeLessThan(50_000);
  });
});

function expectScheduleError(
  operation: () => unknown,
  code: "INVALID_SCHEDULE_INPUT" | "UNIT_NEVER_FITS" | "SCHEDULE_HORIZON_EXCEEDED",
) {
  let caught: unknown;
  try {
    operation();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(PlanningScheduleError);
  expect((caught as PlanningScheduleError).code).toBe(code);
}

function snapshotBuildInput(input: ReturnType<typeof buildInput>): string {
  return JSON.stringify({
    ...input,
    completedUnitIds: [...input.completedUnitIds],
  });
}

function structuredCloneBuildInput(input: ReturnType<typeof buildInput>): ReturnType<typeof buildInput> {
  const cloned = structuredClone({
    ...input,
    completedUnitIds: [...input.completedUnitIds],
  });
  return {
    ...cloned,
    completedUnitIds: new Set(cloned.completedUnitIds),
  };
}
