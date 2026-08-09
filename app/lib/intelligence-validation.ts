import type { RoleBlueprint } from "../contracts/intelligence";

export type IntelligenceIssueCode =
  | "duplicate-skill"
  | "duplicate-resource"
  | "missing-prerequisite"
  | "missing-resource"
  | "resource-backlink-mismatch"
  | "missing-phase-skill"
  | "unplanned-skill"
  | "prerequisite-cycle"
  | "free-alternative-required";

export interface IntelligenceIssue {
  code: IntelligenceIssueCode;
  path: string;
  message: string;
}

export interface IntelligenceValidationResult {
  valid: boolean;
  issues: IntelligenceIssue[];
}

export function validateRoleBlueprint(
  blueprint: RoleBlueprint,
): IntelligenceValidationResult {
  const issues: IntelligenceIssue[] = [];
  const seenSkillIds = new Set<string>();
  for (const skill of blueprint.skills) {
    if (seenSkillIds.has(skill.id)) {
      issues.push({
        code: "duplicate-skill",
        path: `skills.${skill.id}`,
        message: `Skill ID ${skill.id} is duplicated.`,
      });
    }
    seenSkillIds.add(skill.id);
  }

  const seenResourceIds = new Set<string>();
  for (const resource of blueprint.resources) {
    if (seenResourceIds.has(resource.id)) {
      issues.push({
        code: "duplicate-resource",
        path: `resources.${resource.id}`,
        message: `Resource ID ${resource.id} is duplicated.`,
      });
    }
    seenResourceIds.add(resource.id);
  }

  const skillsById = new Map(blueprint.skills.map((skill) => [skill.id, skill]));
  const resourcesById = new Map(blueprint.resources.map((resource) => [resource.id, resource]));

  for (const skill of blueprint.skills) {
    for (const prerequisiteId of skill.prerequisiteIds) {
      if (!skillsById.has(prerequisiteId)) {
        issues.push({
          code: "missing-prerequisite",
          path: `skills.${skill.id}.prerequisiteIds`,
          message: `Skill ${skill.id} has missing prerequisite ${prerequisiteId}.`,
        });
      }
    }
  }

  for (const skill of blueprint.skills) {
    for (const resourceId of skill.resourceIds) {
      const resource = resourcesById.get(resourceId);
      if (!resource) {
        issues.push({
          code: "missing-resource",
          path: `skills.${skill.id}.resourceIds`,
          message: `Skill ${skill.id} links missing resource ${resourceId}.`,
        });
        continue;
      }
      if (!resource.skillIds.includes(skill.id)) {
        issues.push({
          code: "resource-backlink-mismatch",
          path: `resources.${resource.id}`,
          message: `Resource ${resource.id} does not link back to skill ${skill.id}.`,
        });
      }
    }
  }

  for (const phase of blueprint.phases) {
    for (const skillId of phase.skillIds) {
      if (!skillsById.has(skillId)) {
        issues.push({
          code: "missing-phase-skill",
          path: `phases.${phase.id}.skillIds`,
          message: `Phase ${phase.id} links missing skill ${skillId}.`,
        });
      }
    }
  }

  const plannedSkillIds = new Set(blueprint.phases.flatMap((phase) => phase.skillIds));
  for (const skill of blueprint.skills) {
    if (!plannedSkillIds.has(skill.id)) {
      issues.push({
        code: "unplanned-skill",
        path: `skills.${skill.id}`,
        message: `Skill ${skill.id} is not assigned to a phase.`,
      });
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(skillId: string): void {
    if (visited.has(skillId)) return;
    const skill = skillsById.get(skillId);
    if (!skill) return;

    visiting.add(skillId);
    for (const prerequisiteId of skill.prerequisiteIds) {
      if (!skillsById.has(prerequisiteId)) continue;
      if (visiting.has(prerequisiteId)) {
        issues.push({
          code: "prerequisite-cycle",
          path: `skills.${skill.id}.prerequisiteIds`,
          message: `Prerequisite ${prerequisiteId} creates a cycle for ${skill.id}.`,
        });
        continue;
      }
      visit(prerequisiteId);
    }
    visiting.delete(skillId);
    visited.add(skillId);
  }

  for (const skill of blueprint.skills) visit(skill.id);

  for (const skill of blueprint.skills) {
    const hasPaidPrimary = skill.resourceIds.some((resourceId) => {
      const resource = resourcesById.get(resourceId);
      return (
        resource?.purpose === "primary" &&
        (resource.cost === "paid" || resource.cost === "mixed")
      );
    });
    const hasFreeAlternative = skill.resourceIds.some((resourceId) => {
      const resource = resourcesById.get(resourceId);
      return resource?.purpose === "alternative" && resource.cost === "free";
    });
    if (hasPaidPrimary && !hasFreeAlternative) {
      issues.push({
        code: "free-alternative-required",
        path: `skills.${skill.id}.resourceIds`,
        message: `Skill ${skill.id} needs a free alternative resource.`,
      });
    }
  }

  issues.sort((left, right) => {
    if (left.code < right.code) return -1;
    if (left.code > right.code) return 1;
    if (left.path < right.path) return -1;
    if (left.path > right.path) return 1;
    return 0;
  });

  return { valid: issues.length === 0, issues };
}
