import type { RoleBlueprint } from "../contracts/intelligence";

export type IntelligenceIssueCode =
  | "duplicate-skill"
  | "duplicate-resource"
  | "duplicate-phase"
  | "duplicate-reference"
  | "missing-prerequisite"
  | "missing-resource"
  | "resource-backlink-mismatch"
  | "missing-resource-skill"
  | "resource-forward-link-mismatch"
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
  const issueKeys = new Set<string>();

  function addIssue(issue: IntelligenceIssue): void {
    const key = `${issue.code}\u0000${issue.path}\u0000${issue.message}`;
    if (issueKeys.has(key)) return;
    issueKeys.add(key);
    issues.push(issue);
  }

  const seenSkillIds = new Set<string>();
  for (const skill of blueprint.skills) {
    if (seenSkillIds.has(skill.id)) {
      addIssue({
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
      addIssue({
        code: "duplicate-resource",
        path: `resources.${resource.id}`,
        message: `Resource ID ${resource.id} is duplicated.`,
      });
    }
    seenResourceIds.add(resource.id);
  }

  const seenPhaseIds = new Set<string>();
  for (const phase of blueprint.phases) {
    if (seenPhaseIds.has(phase.id)) {
      addIssue({
        code: "duplicate-phase",
        path: `phases.${phase.id}`,
        message: `Phase ID ${phase.id} is duplicated.`,
      });
    }
    seenPhaseIds.add(phase.id);
  }

  function reportDuplicateReferences(ids: readonly string[], path: string): void {
    const seenIds = new Set<string>();
    for (const id of ids) {
      if (seenIds.has(id)) {
        addIssue({
          code: "duplicate-reference",
          path,
          message: `Reference ${id} is duplicated.`,
        });
      }
      seenIds.add(id);
    }
  }

  for (const skill of blueprint.skills) {
    reportDuplicateReferences(
      skill.prerequisiteIds,
      `skills.${skill.id}.prerequisiteIds`,
    );
    reportDuplicateReferences(skill.resourceIds, `skills.${skill.id}.resourceIds`);
  }
  for (const phase of blueprint.phases) {
    reportDuplicateReferences(phase.skillIds, `phases.${phase.id}.skillIds`);
  }
  for (const resource of blueprint.resources) {
    reportDuplicateReferences(resource.skillIds, `resources.${resource.id}.skillIds`);
  }

  const skillsById = new Map(blueprint.skills.map((skill) => [skill.id, skill]));
  const resourcesById = new Map(blueprint.resources.map((resource) => [resource.id, resource]));
  const skillResourceIdsById = new Map(
    blueprint.skills.map((skill) => [skill.id, new Set(skill.resourceIds)]),
  );
  const resourceSkillIdsById = new Map(
    blueprint.resources.map((resource) => [resource.id, new Set(resource.skillIds)]),
  );

  for (const skill of blueprint.skills) {
    for (const prerequisiteId of skill.prerequisiteIds) {
      if (!skillsById.has(prerequisiteId)) {
        addIssue({
          code: "missing-prerequisite",
          path: `skills.${skill.id}.prerequisiteIds`,
          message: `Skill ${skill.id} has missing prerequisite ${prerequisiteId}.`,
        });
      }
    }
  }

  for (const resource of blueprint.resources) {
    for (const skillId of resource.skillIds) {
      if (!skillsById.has(skillId)) {
        addIssue({
          code: "missing-resource-skill",
          path: `resources.${resource.id}.skillIds`,
          message: `Resource ${resource.id} links missing skill ${skillId}.`,
        });
        continue;
      }
      if (!skillResourceIdsById.get(skillId)?.has(resource.id)) {
        addIssue({
          code: "resource-forward-link-mismatch",
          path: `resources.${resource.id}.skillIds`,
          message: `Resource ${resource.id} links skill ${skillId}, but the skill does not link back.`,
        });
      }
    }
  }

  for (const skill of blueprint.skills) {
    for (const resourceId of skill.resourceIds) {
      const resource = resourcesById.get(resourceId);
      if (!resource) {
        addIssue({
          code: "missing-resource",
          path: `skills.${skill.id}.resourceIds`,
          message: `Skill ${skill.id} links missing resource ${resourceId}.`,
        });
        continue;
      }
      if (!resourceSkillIdsById.get(resource.id)?.has(skill.id)) {
        addIssue({
          code: "resource-backlink-mismatch",
          path: `resources.${resource.id}.skillIds`,
          message: `Resource ${resource.id} does not link back to skill ${skill.id}.`,
        });
      }
    }
  }

  for (const phase of blueprint.phases) {
    for (const skillId of phase.skillIds) {
      if (!skillsById.has(skillId)) {
        addIssue({
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
      addIssue({
        code: "unplanned-skill",
        path: `skills.${skill.id}`,
        message: `Skill ${skill.id} is not assigned to a phase.`,
      });
    }
  }

  const visitColors = new Map<string, "visiting" | "visited">();
  for (const rootSkill of blueprint.skills) {
    if (visitColors.has(rootSkill.id)) continue;

    visitColors.set(rootSkill.id, "visiting");
    const stack: Array<{ skillId: string; nextPrerequisiteIndex: number }> = [
      { skillId: rootSkill.id, nextPrerequisiteIndex: 0 },
    ];

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const skill = skillsById.get(frame.skillId);
      if (!skill || frame.nextPrerequisiteIndex >= skill.prerequisiteIds.length) {
        visitColors.set(frame.skillId, "visited");
        stack.pop();
        continue;
      }

      const prerequisiteId = skill.prerequisiteIds[frame.nextPrerequisiteIndex]!;
      frame.nextPrerequisiteIndex += 1;
      if (!skillsById.has(prerequisiteId)) continue;

      const prerequisiteColor = visitColors.get(prerequisiteId);
      if (prerequisiteColor === "visiting") {
        addIssue({
          code: "prerequisite-cycle",
          path: `skills.${skill.id}.prerequisiteIds`,
          message: `Prerequisite ${prerequisiteId} creates a cycle for ${skill.id}.`,
        });
        continue;
      }
      if (prerequisiteColor === "visited") continue;

      visitColors.set(prerequisiteId, "visiting");
      stack.push({ skillId: prerequisiteId, nextPrerequisiteIndex: 0 });
    }
  }

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
      addIssue({
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
