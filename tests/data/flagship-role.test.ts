import { describe, expect, it } from "vitest";
import { flagshipRole } from "../../app/data/flagship-role";

describe("flagshipRole", () => {
  it("covers the eight approved capability categories", () => {
    expect(flagshipRole.id).toBe("ai-native-full-stack-engineer");
    expect(new Set(flagshipRole.skills.map((skill) => skill.category))).toEqual(
      new Set(["foundations", "frontend", "backend", "data", "quality", "cloud", "ai", "product"]),
    );
    expect(flagshipRole.skills).toHaveLength(16);
    expect(new Set(flagshipRole.skills.map((skill) => skill.id)).size).toBe(flagshipRole.skills.length);
  });

  it("has an 18-week path with resolvable skill references", () => {
    const skillIds = new Set(flagshipRole.skills.map((skill) => skill.id));
    expect(flagshipRole.phases.reduce((weeks, phase) => weeks + phase.weeks, 0)).toBe(18);
    for (const phase of flagshipRole.phases) {
      expect(phase.skillIds.every((id) => skillIds.has(id))).toBe(true);
    }
    for (const skill of flagshipRole.skills) {
      expect(skill.prerequisiteIds.every((id) => skillIds.has(id))).toBe(true);
    }
    expect(flagshipRole.today.skillIds.every((id) => skillIds.has(id))).toBe(true);
  });

  it("keeps every skill attributable", () => {
    for (const skill of flagshipRole.skills) {
      expect(skill.sources.length).toBeGreaterThan(0);
      expect(skill.confidence).toBeGreaterThanOrEqual(0.75);
      for (const source of skill.sources) {
        expect(source.url).toMatch(/^https:\/\//);
        expect(source.observedAt).toBe("2026-07-26");
      }
    }
  });
});
