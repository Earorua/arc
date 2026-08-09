import { describe, expect, it } from "vitest";
import { roleBlueprintSchema } from "../../app/contracts/intelligence";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";

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
