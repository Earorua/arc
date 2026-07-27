import type { SkillCategory, SkillNode } from "../domain/learning";

export function filterSkills(
  skills: ReadonlyArray<SkillNode>,
  category: SkillCategory | "all",
): SkillNode[] {
  return category === "all" ? [...skills] : skills.filter((skill) => skill.category === category);
}
