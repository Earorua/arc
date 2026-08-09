import { describe, expect, it } from "vitest";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { validateRoleBlueprint } from "../../app/lib/intelligence-validation";

describe("validateRoleBlueprint", () => {
  it("accepts the reviewed flagship blueprint", () => {
    expect(validateRoleBlueprint(flagshipBlueprint)).toEqual({ valid: true, issues: [] });
  });

  it("reports a missing linked resource", () => {
    const blueprint = structuredClone(flagshipBlueprint);
    blueprint.resources = blueprint.resources.filter(
      (resource) => resource.id !== "web-platform-official",
    );

    expect(validateRoleBlueprint(blueprint).issues).toContainEqual(
      expect.objectContaining({
        code: "missing-resource",
        path: "skills.web-platform.resourceIds",
      }),
    );
  });

  it("reports a two-node prerequisite cycle", () => {
    const blueprint = structuredClone(flagshipBlueprint);
    const webPlatform = blueprint.skills.find((skill) => skill.id === "web-platform");
    const typescript = blueprint.skills.find((skill) => skill.id === "typescript");
    if (!webPlatform || !typescript) throw new Error("Flagship cycle fixtures missing");
    webPlatform.prerequisiteIds = [typescript.id];
    typescript.prerequisiteIds = [webPlatform.id];

    expect(validateRoleBlueprint(blueprint).issues).toContainEqual(
      expect.objectContaining({
        code: "prerequisite-cycle",
        path: "skills.typescript.prerequisiteIds",
      }),
    );
  });

  it("requires a free alternative when a primary resource becomes paid", () => {
    const blueprint = structuredClone(flagshipBlueprint);
    const resource = blueprint.resources.find(
      (candidate) => candidate.id === "web-platform-official",
    );
    if (!resource) throw new Error("Flagship resource fixture missing");
    resource.cost = "paid";

    expect(validateRoleBlueprint(blueprint).issues).toContainEqual(
      expect.objectContaining({
        code: "free-alternative-required",
        path: "skills.web-platform.resourceIds",
      }),
    );
  });

  it("reports a duplicate skill ID", () => {
    const blueprint = structuredClone(flagshipBlueprint);
    const skill = blueprint.skills.find((candidate) => candidate.id === "web-platform");
    if (!skill) throw new Error("Flagship skill fixture missing");
    blueprint.skills.push(structuredClone(skill));

    expect(validateRoleBlueprint(blueprint).issues).toContainEqual(
      expect.objectContaining({
        code: "duplicate-skill",
        path: "skills.web-platform",
      }),
    );
  });

  it("reports a duplicate resource ID", () => {
    const blueprint = structuredClone(flagshipBlueprint);
    const resource = blueprint.resources.find(
      (candidate) => candidate.id === "web-platform-official",
    );
    if (!resource) throw new Error("Flagship resource fixture missing");
    blueprint.resources.push(structuredClone(resource));

    expect(validateRoleBlueprint(blueprint).issues).toContainEqual(
      expect.objectContaining({
        code: "duplicate-resource",
        path: "resources.web-platform-official",
      }),
    );
  });

  it("reports a missing prerequisite", () => {
    const blueprint = structuredClone(flagshipBlueprint);
    const skill = blueprint.skills.find((candidate) => candidate.id === "web-platform");
    if (!skill) throw new Error("Flagship skill fixture missing");
    skill.prerequisiteIds = ["missing-skill"];

    expect(validateRoleBlueprint(blueprint).issues).toContainEqual(
      expect.objectContaining({
        code: "missing-prerequisite",
        path: "skills.web-platform.prerequisiteIds",
      }),
    );
  });

  it("reports a resource backlink mismatch", () => {
    const blueprint = structuredClone(flagshipBlueprint);
    const resource = blueprint.resources.find(
      (candidate) => candidate.id === "web-platform-official",
    );
    if (!resource) throw new Error("Flagship resource fixture missing");
    resource.skillIds = ["typescript"];

    expect(validateRoleBlueprint(blueprint).issues).toContainEqual(
      expect.objectContaining({
        code: "resource-backlink-mismatch",
        path: "resources.web-platform-official",
      }),
    );
  });

  it("reports a phase skill that does not exist", () => {
    const blueprint = structuredClone(flagshipBlueprint);
    const phase = blueprint.phases.find((candidate) => candidate.id === "foundations");
    if (!phase) throw new Error("Flagship phase fixture missing");
    phase.skillIds.push("missing-skill");

    expect(validateRoleBlueprint(blueprint).issues).toContainEqual(
      expect.objectContaining({
        code: "missing-phase-skill",
        path: "phases.foundations.skillIds",
      }),
    );
  });

  it("reports a skill omitted from every phase", () => {
    const blueprint = structuredClone(flagshipBlueprint);
    const phase = blueprint.phases.find((candidate) => candidate.id === "foundations");
    if (!phase) throw new Error("Flagship phase fixture missing");
    phase.skillIds = phase.skillIds.filter((skillId) => skillId !== "web-platform");

    expect(validateRoleBlueprint(blueprint).issues).toContainEqual(
      expect.objectContaining({
        code: "unplanned-skill",
        path: "skills.web-platform",
      }),
    );
  });

  it("accepts a paid primary with a separate free alternative", () => {
    const blueprint = structuredClone(flagshipBlueprint);
    const skill = blueprint.skills.find((candidate) => candidate.id === "web-platform");
    const primary = blueprint.resources.find(
      (candidate) => candidate.id === "web-platform-official",
    );
    if (!skill || !primary) throw new Error("Flagship alternative fixtures missing");
    primary.cost = "paid";
    const alternative = structuredClone(primary);
    alternative.id = "web-platform-free-alternative";
    alternative.cost = "free";
    alternative.purpose = "alternative";
    blueprint.resources.push(alternative);
    skill.resourceIds.push(alternative.id);

    expect(validateRoleBlueprint(blueprint)).toEqual({ valid: true, issues: [] });
  });

  it("sorts issues by code then semantic path without array indexes", () => {
    const blueprint = structuredClone(flagshipBlueprint);
    const webPlatform = blueprint.skills.find((skill) => skill.id === "web-platform");
    const typescript = blueprint.skills.find((skill) => skill.id === "typescript");
    const resource = blueprint.resources.find(
      (candidate) => candidate.id === "web-platform-official",
    );
    if (!webPlatform || !typescript || !resource) {
      throw new Error("Flagship sorting fixtures missing");
    }
    blueprint.skills.push(structuredClone(webPlatform), structuredClone(typescript));
    blueprint.resources.push(structuredClone(resource));

    const issues = validateRoleBlueprint(blueprint).issues;
    expect(issues.map(({ code, path }) => `${code}:${path}`)).toEqual([
      "duplicate-resource:resources.web-platform-official",
      "duplicate-skill:skills.typescript",
      "duplicate-skill:skills.web-platform",
    ]);
    for (const issue of issues) {
      expect(issue.path).not.toMatch(/\[\d+\]|(?:^|\.)\d+(?:\.|$)/u);
    }
  });
});
