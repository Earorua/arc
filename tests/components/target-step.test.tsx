import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PLANNING_SCHEMA_VERSION, type AvailabilityVersion, type PathBuildResult, type PlanningTarget, type SkillAuditVersion } from "../../app/contracts/planning";
import { TargetStep } from "../../app/components/setup/target-step";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { buildLearningPaths } from "../../app/lib/planning/path-builder";

function createSkillAuditVersion(): SkillAuditVersion {
  return { id: "audit-setup", schemaVersion: PLANNING_SCHEMA_VERSION, blueprintId: flagshipBlueprint.id, blueprintVersion: flagshipBlueprint.version, answers: flagshipBlueprint.skills.map(({ id }) => ({ skillId: id, level: "unseen", evidenceRefs: [] })), evidence: [], createdBy: "learner", inputFingerprint: "audit-fingerprint" };
}
function createAvailabilityVersion(): AvailabilityVersion {
  return { id: "availability-setup", schemaVersion: PLANNING_SCHEMA_VERSION, timeZone: "Asia/Shanghai", weekdays: { monday: 60, tuesday: 60, wednesday: 60, thursday: 60, friday: 60, saturday: 60, sunday: 60 }, exceptions: [], weeklyMinutes: 420, inputFingerprint: "availability-fingerprint" };
}
function createTarget(targetWeeks: number): PlanningTarget {
  return { id: "target-setup", schemaVersion: PLANNING_SCHEMA_VERSION, targetWeeks, inputFingerprint: `target-${targetWeeks}` };
}

afterEach(cleanup);

describe("TargetStep", () => {
  const props = {
    audit: createSkillAuditVersion(), availability: createAvailabilityVersion(), blueprint: flagshipBlueprint,
    registry: flagshipUnitRegistry, planningDate: "2026-08-14", selectedScope: null as "full-scope" | "target-date" | null,
    target: createTarget(18), onScopeChange: vi.fn(), onTargetChange: vi.fn(),
  };

  it("uses the deterministic builder and validates the 4..52 week boundary", async () => {
    const user = userEvent.setup();
    const builder = vi.fn(buildLearningPaths);
    function Harness() {
      const [weeks, setWeeks] = useState(18);
      return <TargetStep {...props} buildPaths={builder} onTargetChange={setWeeks} target={createTarget(weeks)} />;
    }
    render(<Harness />);
    expect(builder).toHaveBeenCalledWith(expect.objectContaining({ planningDate: "2026-08-14" }));
    await user.clear(screen.getByLabelText("Target weeks"));
    await user.type(screen.getByLabelText("Target weeks"), "3");
    expect(screen.getByLabelText("Target weeks")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("4 to 52");
  });

  it("shows honest scope choices without persisting before Build", async () => {
    const user = userEvent.setup();
    const result = buildLearningPaths({ blueprint: flagshipBlueprint, registry: flagshipUnitRegistry, audit: props.audit, availability: props.availability, target: props.target, planningDate: props.planningDate });
    const targetDate = { ...result.fullScope, id: "path-target", scopeMode: "target-date" as const, deferredSkills: [{ skillId: "observability", reason: "target-date-advantage" as const }] };
    const buildPaths = vi.fn((): PathBuildResult => ({ fullScope: result.fullScope, targetDate, infeasibleReason: null }));
    const onScopeChange = vi.fn();
    render(<TargetStep {...props} buildPaths={buildPaths} onScopeChange={onScopeChange} />);
    expect(screen.getByRole("radio", { name: /Full scope/i })).toBeEnabled();
    expect(screen.getByRole("radio", { name: /Target date/i })).toBeEnabled();
    expect(screen.getByText(/Observability/i)).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /Target date/i }));
    expect(onScopeChange).toHaveBeenCalledWith("target-date");
    expect(buildPaths).toHaveBeenCalledTimes(1);
  });

  it("omits a redundant chooser when full scope fits and explains an infeasible target", () => {
    const result = buildLearningPaths({ blueprint: flagshipBlueprint, registry: flagshipUnitRegistry, audit: props.audit, availability: props.availability, target: props.target, planningDate: props.planningDate });
    const view = render(<TargetStep {...props} buildPaths={() => ({ fullScope: result.fullScope, targetDate: { ...result.fullScope, id: "path-target", scopeMode: "target-date" }, infeasibleReason: null })} />);
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.getByText(/Full scope fits/i)).toBeInTheDocument();
    view.rerender(<TargetStep {...props} buildPaths={() => ({ fullScope: result.fullScope, targetDate: null, infeasibleReason: "Core prerequisites cannot fit inside this target." })} />);
    expect(screen.getByRole("radio", { name: /Target date/i })).toBeDisabled();
    expect(screen.getByText(/Core prerequisites cannot fit/i)).toBeInTheDocument();
  });
});
