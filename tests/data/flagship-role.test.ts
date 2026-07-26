import { describe, expect, it } from "vitest";
import { flagshipRole } from "../../app/data/flagship-role";

describe("flagshipRole", () => {
  it("covers the eight approved capability categories", () => {
    expect(flagshipRole.id).toBe("ai-native-full-stack-engineer");
    expect(new Set(flagshipRole.skills.map((skill) => skill.category))).toEqual(
      new Set(["foundations", "frontend", "backend", "data", "quality", "cloud", "ai", "product"]),
    );
    expect(flagshipRole.skills.length).toBeGreaterThanOrEqual(16);
  });

  it("has an 18-week path with valid skill references", () => {
    const skillIds = new Set(flagshipRole.skills.map((skill) => skill.id));
    expect(flagshipRole.phases.reduce((weeks, phase) => weeks + phase.weeks, 0)).toBe(18);
    for (const phase of flagshipRole.phases) {
      expect(phase.skillIds.every((id) => skillIds.has(id))).toBe(true);
    }
  });

  it("keeps every skill attributable", () => {
    for (const skill of flagshipRole.skills) {
      expect(skill.sources.length).toBeGreaterThan(0);
      expect(skill.sources[0].url).toMatch(/^https:\/\//);
      expect(skill.confidence).toBeGreaterThanOrEqual(0.75);
    }
  });
});
