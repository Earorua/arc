import type { RoleBlueprint } from "../../contracts/intelligence";
import type { UnitRegistry, UnitTemplate } from "../../contracts/planning";

export type RegistryIssueCode =
  | "duplicate-track"
  | "duplicate-template"
  | "duplicate-step"
  | "duplicate-checkpoint"
  | "missing-skill"
  | "missing-resource"
  | "missing-kind"
  | "minute-mismatch"
  | "invalid-checkpoint"
  | "registry-version-mismatch";

export type RegistryIssue = {
  readonly code: RegistryIssueCode;
  readonly path: string;
  readonly message: string;
};

const REQUIRED_KINDS = ["learn", "calibrate", "reinforce"] as const;

export function validateUnitRegistry(
  registry: UnitRegistry,
  blueprint: RoleBlueprint,
): { valid: boolean; issues: RegistryIssue[] } {
  const issues: RegistryIssue[] = [];
  const issueKeys = new Set<string>();
  const skillsById = new Map(blueprint.skills.map((skill) => [skill.id, skill]));
  const resourcesById = new Map(blueprint.resources.map((resource) => [resource.id, resource]));
  const seenTracks = new Set<string>();
  const seenTemplates = new Set<string>();
  const seenSteps = new Set<string>();
  const seenCheckpoints = new Set<string>();
  const templatesBySkill = new Map<string, UnitTemplate[]>();

  const addIssue = (code: RegistryIssueCode, path: string, message: string) => {
    const key = `${code}\u0000${path}`;
    if (issueKeys.has(key)) return;
    issueKeys.add(key);
    issues.push({ code, path, message });
  };

  if (registry.blueprintId !== blueprint.id) {
    addIssue("registry-version-mismatch", "registry:blueprint-id", "Registry blueprint ID must match the blueprint");
  }
  if (registry.blueprintVersion !== blueprint.version) {
    addIssue(
      "registry-version-mismatch",
      "registry:blueprint-version",
      "Registry blueprint version must match the blueprint",
    );
  }

  for (const track of registry.tracks) {
    const trackPath = `track:${track.skillId}`;
    if (seenTracks.has(track.skillId)) {
      addIssue("duplicate-track", trackPath, "Skill tracks must be unique");
    } else {
      seenTracks.add(track.skillId);
    }

    if (!skillsById.has(track.skillId)) {
      addIssue("missing-skill", trackPath, "Track skill must exist in the blueprint");
    }

    const skillTemplates = templatesBySkill.get(track.skillId) ?? [];
    for (const template of track.templates) {
      const templatePath = `template:${template.id}`;
      if (seenTemplates.has(template.id)) {
        addIssue("duplicate-template", templatePath, "Template IDs must be unique across the registry");
        continue;
      }
      seenTemplates.add(template.id);
      skillTemplates.push(template);

      if (template.skillId !== track.skillId || !skillsById.has(template.skillId)) {
        addIssue(
          "missing-skill",
          `${templatePath}/skill:${template.skillId}`,
          "Template skill must exist and match its track",
        );
      }

      validateResources(template, track.skillId, resourcesById, addIssue);
      validateMinutesAndSteps(template, seenSteps, addIssue);
      validateCheckpoints(template, seenCheckpoints, addIssue);
    }
    templatesBySkill.set(track.skillId, skillTemplates);
  }

  for (const skill of blueprint.skills) {
    const templates = templatesBySkill.get(skill.id);
    if (!templates) {
      addIssue("missing-skill", `skill:${skill.id}`, "Registry must cover every blueprint skill exactly once");
      continue;
    }
    for (const kind of REQUIRED_KINDS) {
      const count = templates.filter((template) => template.kind === kind).length;
      const validCount = kind === "learn" ? count >= 1 : count === 1;
      if (!validCount) {
        addIssue(
          "missing-kind",
          `skill:${skill.id}/kind:${kind}`,
          kind === "learn"
            ? "Skill track requires at least one learn template"
            : `Skill track requires exactly one ${kind} template`,
        );
      }
    }
  }

  issues.sort((left, right) => compareOrdinal(left.code, right.code) || compareOrdinal(left.path, right.path));
  return { valid: issues.length === 0, issues };
}

type AddIssue = (code: RegistryIssueCode, path: string, message: string) => void;

function validateResources(
  template: UnitTemplate,
  trackSkillId: string,
  resourcesById: Map<string, RoleBlueprint["resources"][number]>,
  addIssue: AddIssue,
) {
  for (const resourceId of [template.primaryResourceId, ...template.alternativeResourceIds]) {
    const resource = resourcesById.get(resourceId);
    if (!resource || !resource.skillIds.includes(trackSkillId)) {
      addIssue(
        "missing-resource",
        `template:${template.id}/resource:${resourceId}`,
        "Referenced resource must exist and link back to the template skill",
      );
    }
  }
}

function validateMinutesAndSteps(template: UnitTemplate, seenSteps: Set<string>, addIssue: AddIssue) {
  for (const step of template.steps) {
    if (seenSteps.has(step.id)) {
      addIssue(
        "duplicate-step",
        `template:${template.id}/step:${step.id}`,
        "Step IDs must be unique within a template",
      );
    }
    seenSteps.add(step.id);
  }
  const stepMinutes = template.steps.reduce((sum, step) => sum + step.minutes, 0);
  if (stepMinutes !== template.estimatedMinutes) {
    addIssue("minute-mismatch", `template:${template.id}`, "Template estimate must equal its step-minute total");
  }
}

function validateCheckpoints(template: UnitTemplate, seenCheckpoints: Set<string>, addIssue: AddIssue) {
  const checkpointPath = `template:${template.id}/checkpoints`;
  for (const checkpoint of template.checkpoints) {
    if (seenCheckpoints.has(checkpoint.id)) {
      addIssue(
        "duplicate-checkpoint",
        `template:${template.id}/checkpoint:${checkpoint.id}`,
        "Checkpoint IDs must be unique within a template",
      );
    }
    seenCheckpoints.add(checkpoint.id);
  }

  if (template.estimatedMinutes <= 60) {
    if (template.checkpoints.length > 0) {
      addIssue("invalid-checkpoint", checkpointPath, "Templates of 60 minutes or less must remain atomic");
    }
    return;
  }
  if (template.checkpoints.length === 0) {
    addIssue("invalid-checkpoint", checkpointPath, "Templates longer than 60 minutes require checkpoints");
    return;
  }

  const stepsById = new Map(template.steps.map((step) => [step.id, step]));
  const expectedStepIds = template.steps.map((step) => step.id);
  const coveredStepIds: string[] = [];
  let checkpointTotal = 0;
  let invalid = false;

  for (const checkpoint of template.checkpoints) {
    const uniqueStepIds = new Set(checkpoint.stepIds);
    if (uniqueStepIds.size !== checkpoint.stepIds.length) invalid = true;
    let includedMinutes = 0;
    for (const stepId of checkpoint.stepIds) {
      const step = stepsById.get(stepId);
      if (!step) invalid = true;
      else includedMinutes += step.minutes;
      coveredStepIds.push(stepId);
    }
    if (checkpoint.estimatedMinutes !== includedMinutes) invalid = true;
    if (checkpoint.estimatedMinutes < 30 || checkpoint.estimatedMinutes > 60) invalid = true;
    checkpointTotal += checkpoint.estimatedMinutes;
  }

  if (coveredStepIds.length !== expectedStepIds.length
    || coveredStepIds.some((stepId, index) => stepId !== expectedStepIds[index])) invalid = true;
  if (checkpointTotal !== template.estimatedMinutes) invalid = true;
  if (invalid) {
    addIssue(
      "invalid-checkpoint",
      checkpointPath,
      "Checkpoints must cover steps exactly once in contiguous source order with matching minutes",
    );
  }
}

function compareOrdinal(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
