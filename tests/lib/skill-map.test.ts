import { describe, expect, it } from "vitest";
import { flagshipRole } from "../../app/data/flagship-role";
import { filterSkills } from "../../app/lib/skill-map";

describe("filterSkills", () => {
  it("filters by category while preserving attributable records", () => {
    const ai = filterSkills(flagshipRole.skills, "ai");

    expect(ai.map((skill) => skill.id)).toEqual(["llm-contracts", "retrieval"]);
    expect(ai.every((skill) => skill.sources.length > 0)).toBe(true);
  });
});
