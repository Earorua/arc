import type { SkillCategory } from "../domain/learning";

export function filterSkills<T extends { category: SkillCategory }>(
  skills: ReadonlyArray<T>,
  category: SkillCategory | "all",
): T[] {
  return category === "all" ? [...skills] : skills.filter((skill) => skill.category === category);
}
