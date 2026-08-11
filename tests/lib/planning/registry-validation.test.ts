import { describe, expect, it } from "vitest";
import type { UnitRegistry } from "../../../app/contracts/planning";
import { flagshipBlueprint } from "../../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../../app/data/flagship-unit-registry";
import { validateUnitRegistry, type RegistryIssueCode } from "../../../app/lib/planning/registry-validation";

function cloneRegistry(): UnitRegistry {
  return structuredClone(flagshipUnitRegistry);
}

function expectOnlyIssue(registry: UnitRegistry, code: RegistryIssueCode, path: string) {
  const result = validateUnitRegistry(registry, flagshipBlueprint);
  expect(result.valid).toBe(false);
  expect(result.issues).toHaveLength(1);
  expect(result.issues[0]).toMatchObject({ code, path });
}

describe("validateUnitRegistry", () => {
  it("accepts the curated flagship registry without mutating it", () => {
    const registry = cloneRegistry();
    const before = JSON.stringify(registry);
    expect(validateUnitRegistry(registry, flagshipBlueprint)).toEqual({ valid: true, issues: [] });
    expect(JSON.stringify(registry)).toBe(before);
  });

  it("reports duplicate-track", () => {
    const registry = cloneRegistry();
    registry.tracks.push({ skillId: "web-platform", templates: [] });
    expectOnlyIssue(registry, "duplicate-track", "track:web-platform");
  });

  it("reports duplicate-template", () => {
    const registry = cloneRegistry();
    const track = registry.tracks[0]!;
    track.templates.push(structuredClone(track.templates[0]!));
    expectOnlyIssue(registry, "duplicate-template", `template:${track.templates[0]!.id}`);
  });

  it("reports duplicate-step", () => {
    const registry = cloneRegistry();
    const template = registry.tracks[0]!.templates[1]!;
    template.steps.push({ ...template.steps[0]! });
    template.steps[0]!.minutes = 15;
    template.steps[1]!.minutes = template.estimatedMinutes - 15;
    expectOnlyIssue(registry, "duplicate-step", `template:${template.id}/step:${template.steps[0]!.id}`);
  });

  it("reports duplicate-step across templates", () => {
    const registry = cloneRegistry();
    const first = registry.tracks[0]!.templates[1]!;
    const second = registry.tracks[0]!.templates[2]!;
    second.steps[0]!.id = first.steps[0]!.id;
    expectOnlyIssue(registry, "duplicate-step", `template:${second.id}/step:${first.steps[0]!.id}`);
  });

  it("reports duplicate-checkpoint", () => {
    const registry = cloneRegistry();
    const template = registry.tracks[0]!.templates[0]!;
    template.checkpoints[1]!.id = template.checkpoints[0]!.id;
    expectOnlyIssue(registry, "duplicate-checkpoint", `template:${template.id}/checkpoint:${template.checkpoints[0]!.id}`);
  });

  it("reports duplicate-checkpoint across templates", () => {
    const registry = cloneRegistry();
    const first = registry.tracks[0]!.templates[0]!;
    const second = registry.tracks[1]!.templates[0]!;
    second.checkpoints[0]!.id = first.checkpoints[0]!.id;
    expectOnlyIssue(
      registry,
      "duplicate-checkpoint",
      `template:${second.id}/checkpoint:${first.checkpoints[0]!.id}`,
    );
  });

  it("reports missing-skill", () => {
    const registry = cloneRegistry();
    registry.tracks = registry.tracks.filter((track) => track.skillId !== "web-platform");
    expectOnlyIssue(registry, "missing-skill", "skill:web-platform");
  });

  it("reports missing-resource", () => {
    const registry = cloneRegistry();
    registry.tracks[0]!.templates[0]!.primaryResourceId = "missing-official";
    expectOnlyIssue(
      registry,
      "missing-resource",
      `template:${registry.tracks[0]!.templates[0]!.id}/resource:missing-official`,
    );
  });

  it("reports missing-kind", () => {
    const registry = cloneRegistry();
    const track = registry.tracks[0]!;
    track.templates = track.templates.filter((template) => template.kind !== "reinforce");
    expectOnlyIssue(registry, "missing-kind", `skill:${track.skillId}/kind:reinforce`);
  });

  it("reports minute-mismatch", () => {
    const registry = cloneRegistry();
    const template = registry.tracks[0]!.templates[1]!;
    template.estimatedMinutes += 1;
    expectOnlyIssue(registry, "minute-mismatch", `template:${template.id}`);
  });

  it("reports invalid-checkpoint", () => {
    const registry = cloneRegistry();
    const template = registry.tracks[0]!.templates[0]!;
    template.checkpoints[0]!.stepIds = [template.steps[1]!.id];
    template.checkpoints[0]!.estimatedMinutes = template.steps[1]!.minutes;
    template.checkpoints[1]!.stepIds = [template.steps[0]!.id];
    template.checkpoints[1]!.estimatedMinutes = template.steps[0]!.minutes;
    expectOnlyIssue(registry, "invalid-checkpoint", `template:${template.id}/checkpoints`);
  });

  it("reports registry-version-mismatch", () => {
    const registry = cloneRegistry();
    registry.blueprintVersion = "2026.08.999";
    expectOnlyIssue(registry, "registry-version-mismatch", "registry:blueprint-version");
  });

  it("sorts and deduplicates multiple issues deterministically by code then semantic path", () => {
    const registry = cloneRegistry();
    const template = registry.tracks[1]!.templates[1]!;
    registry.blueprintVersion = "2026.08.999";
    template.primaryResourceId = "missing-official";
    template.estimatedMinutes += 1;
    template.steps.push({ ...template.steps[0]! });
    template.steps[0]!.minutes = 15;
    template.steps[1]!.minutes = template.estimatedMinutes - 16;

    const result = validateUnitRegistry(registry, flagshipBlueprint);
    expect(result.issues.map(({ code, path }) => `${code}:${path}`)).toEqual([
      `duplicate-step:template:${template.id}/step:${template.steps[0]!.id}`,
      `minute-mismatch:template:${template.id}`,
      `missing-resource:template:${template.id}/resource:missing-official`,
      "registry-version-mismatch:registry:blueprint-version",
    ]);
    expect(new Set(result.issues.map(({ code, path }) => `${code}:${path}`))).toHaveLength(result.issues.length);
  });
});
