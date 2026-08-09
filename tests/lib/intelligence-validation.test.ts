import { describe, expect, it } from "vitest";
import type { RoleBlueprint } from "../../app/contracts/intelligence";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { validateRoleBlueprint } from "../../app/lib/intelligence-validation";

function createForwardChainBlueprint(skillCount: number): RoleBlueprint {
  const skillIds = Array.from({ length: skillCount }, (_, index) => `skill-${index}`);
  const skills: RoleBlueprint["skills"] = skillIds.map((id, index) => ({
    id,
    name: `Skill ${index}`,
    category: "foundations",
    importance: "core",
    why: "A purpose-built valid skill for graph validation tests.",
    confidence: 0.9,
    masteryCriteria: [
      "Explain this skill in a production system.",
      "Produce a verified artifact using this skill.",
    ],
    prerequisiteIds: index + 1 < skillCount ? [skillIds[index + 1]!] : [],
    resourceIds: [`resource-${index}`],
  }));
  const resources: RoleBlueprint["resources"] = skillIds.map((skillId, index) => ({
    id: `resource-${index}`,
    title: `Resource ${index}`,
    url: `https://example.com/resources/${index}`,
    provider: "Example Provider",
    language: "en",
    cost: "free",
    format: "documentation",
    sourceTier: "primary",
    purpose: "primary",
    estimatedMinutes: null,
    lastVerifiedAt: "2026-08-10",
    skillIds: [skillId],
  }));

  return {
    id: "forward-chain",
    name: "Forward Chain",
    summary: "A purpose-built valid blueprint for graph validation regression tests.",
    version: "2026.08.1",
    status: "ready",
    updatedAt: "2026-08-10",
    languagePolicy: "english-first",
    skills,
    resources,
    phases: [
      {
        id: "all-skills",
        name: "All Skills",
        weeks: 1,
        outcome: "Complete every skill in the generated validation blueprint.",
        skillIds,
      },
    ],
  };
}

function addWebPlatformAlternative(
  blueprint: RoleBlueprint,
  options: {
    cost: RoleBlueprint["resources"][number]["cost"];
    purpose: RoleBlueprint["resources"][number]["purpose"];
    linked: boolean;
  },
): void {
  const skill = blueprint.skills.find((candidate) => candidate.id === "web-platform");
  const primary = blueprint.resources.find(
    (candidate) => candidate.id === "web-platform-official",
  );
  if (!skill || !primary) throw new Error("Flagship alternative fixtures missing");

  primary.cost = "paid";
  const alternative = structuredClone(primary);
  alternative.id = "web-platform-policy-alternative";
  alternative.cost = options.cost;
  alternative.purpose = options.purpose;
  blueprint.resources.push(alternative);
  if (options.linked) skill.resourceIds.push(alternative.id);
}

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
        path: "resources.web-platform-official.skillIds",
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

  it("validates a 12,000-skill forward prerequisite chain without overflowing", () => {
    const blueprint = createForwardChainBlueprint(12_000);
    let result: ReturnType<typeof validateRoleBlueprint> | undefined;

    expect(() => {
      result = validateRoleBlueprint(blueprint);
    }).not.toThrow();
    expect(result).toEqual({ valid: true, issues: [] });
  });

  it("emits each byte-identical issue only once", () => {
    const blueprint = structuredClone(flagshipBlueprint);
    const skill = blueprint.skills.find((candidate) => candidate.id === "web-platform");
    const resource = blueprint.resources.find(
      (candidate) => candidate.id === "web-platform-official",
    );
    const phase = blueprint.phases.find((candidate) => candidate.id === "foundations");
    if (!skill || !resource || !phase) throw new Error("Flagship dedup fixtures missing");

    skill.prerequisiteIds.push("missing-skill", "missing-skill");
    skill.resourceIds.push("missing-resource", "missing-resource");
    phase.skillIds.push("missing-phase-skill", "missing-phase-skill");
    blueprint.skills.push(structuredClone(skill), structuredClone(skill));
    blueprint.resources.push(structuredClone(resource), structuredClone(resource));

    const issues = validateRoleBlueprint(blueprint).issues;
    expect(issues.map(({ code, path }) => `${code}:${path}`)).toEqual([
      "duplicate-resource:resources.web-platform-official",
      "duplicate-skill:skills.web-platform",
      "missing-phase-skill:phases.foundations.skillIds",
      "missing-prerequisite:skills.web-platform.prerequisiteIds",
      "missing-resource:skills.web-platform.resourceIds",
    ]);
    expect(new Set(issues.map((issue) => JSON.stringify(issue))).size).toBe(issues.length);
  });

  describe("iterative prerequisite cycle detection", () => {
    it("reports one self-cycle at the owning prerequisite path", () => {
      const blueprint = createForwardChainBlueprint(1);
      blueprint.skills[0]!.prerequisiteIds = ["skill-0"];

      const cycleIssues = validateRoleBlueprint(blueprint).issues.filter(
        (issue) => issue.code === "prerequisite-cycle",
      );
      expect(cycleIssues.map((issue) => issue.path)).toEqual([
        "skills.skill-0.prerequisiteIds",
      ]);
    });

    it("reports one back edge for a three-node cycle", () => {
      const blueprint = createForwardChainBlueprint(3);
      blueprint.skills[2]!.prerequisiteIds = ["skill-0"];

      const cycleIssues = validateRoleBlueprint(blueprint).issues.filter(
        (issue) => issue.code === "prerequisite-cycle",
      );
      expect(cycleIssues.map((issue) => issue.path)).toEqual([
        "skills.skill-2.prerequisiteIds",
      ]);
    });

    it("reports one back edge for each disconnected cycle", () => {
      const blueprint = createForwardChainBlueprint(4);
      blueprint.skills[0]!.prerequisiteIds = ["skill-1"];
      blueprint.skills[1]!.prerequisiteIds = ["skill-0"];
      blueprint.skills[2]!.prerequisiteIds = ["skill-3"];
      blueprint.skills[3]!.prerequisiteIds = ["skill-2"];

      const cycleIssues = validateRoleBlueprint(blueprint).issues.filter(
        (issue) => issue.code === "prerequisite-cycle",
      );
      expect(cycleIssues.map((issue) => issue.path)).toEqual([
        "skills.skill-1.prerequisiteIds",
        "skills.skill-3.prerequisiteIds",
      ]);
    });

    it("accepts an acyclic shared-dependency diamond", () => {
      const blueprint = createForwardChainBlueprint(4);
      blueprint.skills[0]!.prerequisiteIds = ["skill-1", "skill-2"];
      blueprint.skills[1]!.prerequisiteIds = ["skill-3"];
      blueprint.skills[2]!.prerequisiteIds = ["skill-3"];
      blueprint.skills[3]!.prerequisiteIds = [];

      expect(validateRoleBlueprint(blueprint)).toEqual({ valid: true, issues: [] });
    });
  });

  describe("free alternative policy", () => {
    it("requires a linked free alternative for a mixed primary", () => {
      const blueprint = structuredClone(flagshipBlueprint);
      const primary = blueprint.resources.find(
        (candidate) => candidate.id === "web-platform-official",
      );
      if (!primary) throw new Error("Flagship primary fixture missing");
      primary.cost = "mixed";

      expect(validateRoleBlueprint(blueprint).issues).toEqual([
        expect.objectContaining({
          code: "free-alternative-required",
          path: "skills.web-platform.resourceIds",
        }),
      ]);
    });

    it.each([
      { label: "a free resource with reference purpose", cost: "free", purpose: "reference" },
      { label: "a paid alternative", cost: "paid", purpose: "alternative" },
    ] as const)("does not accept $label", ({ cost, purpose }) => {
      const blueprint = structuredClone(flagshipBlueprint);
      addWebPlatformAlternative(blueprint, { cost, purpose, linked: true });

      expect(validateRoleBlueprint(blueprint).issues).toEqual([
        expect.objectContaining({
          code: "free-alternative-required",
          path: "skills.web-platform.resourceIds",
        }),
      ]);
    });

    it("does not accept an unlinked free alternative", () => {
      const blueprint = structuredClone(flagshipBlueprint);
      addWebPlatformAlternative(blueprint, {
        cost: "free",
        purpose: "alternative",
        linked: false,
      });

      expect(validateRoleBlueprint(blueprint).issues).toEqual([
        expect.objectContaining({
          code: "free-alternative-required",
          path: "skills.web-platform.resourceIds",
        }),
      ]);
    });
  });

  it("does not duplicate a diagnostic for repeated resource IDs in one skill", () => {
    const blueprint = structuredClone(flagshipBlueprint);
    const skill = blueprint.skills.find((candidate) => candidate.id === "web-platform");
    const resource = blueprint.resources.find(
      (candidate) => candidate.id === "web-platform-official",
    );
    if (!skill || !resource) throw new Error("Flagship repeated-resource fixtures missing");
    skill.resourceIds.push(resource.id, resource.id);
    resource.skillIds = ["typescript"];

    expect(validateRoleBlueprint(blueprint).issues).toEqual([
      expect.objectContaining({
        code: "resource-backlink-mismatch",
        path: "resources.web-platform-official.skillIds",
      }),
    ]);
  });

  it("does not mutate its input", () => {
    const blueprint = structuredClone(flagshipBlueprint);
    const beforeValidation = structuredClone(blueprint);

    validateRoleBlueprint(blueprint);

    expect(blueprint).toEqual(beforeValidation);
  });
});
