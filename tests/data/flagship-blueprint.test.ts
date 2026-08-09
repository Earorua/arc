import { describe, expect, it } from "vitest";
import { roleBlueprintSchema } from "../../app/contracts/intelligence";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipRole } from "../../app/data/flagship-role";

describe("flagshipBlueprint", () => {
  it("publishes the reviewed 16-skill, eight-category flagship", () => {
    expect(roleBlueprintSchema.parse(flagshipBlueprint)).toEqual(flagshipBlueprint);
    expect(flagshipBlueprint.id).toBe("ai-native-full-stack-engineer");
    expect(flagshipBlueprint.status).toBe("ready");
    expect(flagshipBlueprint.skills).toHaveLength(16);
    expect(new Set(flagshipBlueprint.skills.map((skill) => skill.category))).toEqual(
      new Set(["foundations", "frontend", "backend", "data", "quality", "cloud", "ai", "product"]),
    );
  });

  it("gives every skill mastery criteria and resolvable resources", () => {
    const resourceIds = new Set(flagshipBlueprint.resources.map((resource) => resource.id));
    for (const skill of flagshipBlueprint.skills) {
      expect(skill.masteryCriteria).toHaveLength(2);
      expect(skill.resourceIds.every((id) => resourceIds.has(id))).toBe(true);
    }
  });

  it("preserves exact first-party attribution from every reviewed v7 skill", () => {
    for (const legacySkill of flagshipRole.skills) {
      const source = legacySkill.sources[0];
      expect(source).toBeDefined();
      if (!source) throw new Error(`Flagship source missing for ${legacySkill.id}`);

      const skill = flagshipBlueprint.skills.find((candidate) => candidate.id === legacySkill.id);
      const resource = flagshipBlueprint.resources.find(
        (candidate) => candidate.id === `${legacySkill.id}-official`,
      );
      expect(skill).toBeDefined();
      expect(resource).toBeDefined();
      if (!skill || !resource) throw new Error(`Flagship mapping missing for ${legacySkill.id}`);

      expect(resource.id).toBe(`${legacySkill.id}-official`);
      expect(resource.title).toBe(source.title);
      expect(resource.url).toBe(source.url);
      expect(resource.lastVerifiedAt).toBe(source.observedAt);
      expect(resource.provider).toBe(new URL(source.url).hostname.replace(/^www\./u, ""));
      expect(resource.skillIds).toEqual([legacySkill.id]);
      expect(skill.resourceIds).toEqual([resource.id]);
      expect(skill.masteryCriteria).toEqual([
        `Explain where ${legacySkill.name} belongs in a production full-stack system and justify one trade-off.`,
        `Produce a reviewable artifact that applies ${legacySkill.name} and states how the result was verified.`,
      ]);
    }
  });

  it("keeps official sources English-first, free and attributable", () => {
    expect(flagshipBlueprint.resources).toHaveLength(16);
    for (const resource of flagshipBlueprint.resources) {
      expect(resource.language).toBe("en");
      expect(resource.cost).toBe("free");
      expect(resource.sourceTier).toBe("primary");
      expect(resource.url).toMatch(/^https:\/\//u);
    }
  });
});
