import type { RoleBlueprint } from "../../contracts/intelligence";
import { parsePlanningWorkspaceAtRepositoryBoundary, type PlanningWorkspace, type UnitRegistry } from "../../contracts/planning";
import { flagshipBlueprint } from "../../data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../data/flagship-unit-registry";
import { PlanningVersionBoundary } from "./planning-version-boundary";

type AdaptivePathProps = {
  workspace: unknown;
  blueprint?: RoleBlueprint;
  registry?: UnitRegistry;
};

const kindLabel = { learn: "Learn", calibrate: "Calibration", reinforce: "Reinforce" } as const;
const levelLabel = { unseen: "Not started", conceptual: "Conceptual", guided: "Guided", independent: "Independent" } as const;

export function AdaptivePath({ workspace: value, blueprint = flagshipBlueprint, registry = flagshipUnitRegistry }: AdaptivePathProps) {
  const resolved = resolvePath(value, blueprint, registry);
  if (!resolved) return <PlanningVersionBoundary />;
  const { workspace, path } = resolved;
  const completed = new Set(workspace.events.filter((event) => event.kind === "completed").map((event) => event.unitId));
  const currentPhaseIndex = path.phases.findIndex((phase) => phase.unitIds.some((id) => !completed.has(id)));
  const current = currentPhaseIndex < 0 ? path.phases.length - 1 : currentPhaseIndex;
  const templates = new Map(registry.tracks.flatMap((track) => track.templates).map((template) => [template.id, template]));
  const units = new Map(path.units.map((unit) => [unit.id, unit]));
  const skills = new Map(blueprint.skills.map((skill) => [skill.id, skill]));
  const answers = new Map(workspace.audit.answers.map((answer) => [answer.skillId, answer]));
  const prerequisiteSkillIds = new Set(path.units.flatMap((unit) => unit.prerequisiteUnitIds.map((id) => units.get(id)?.skillId).filter((id): id is string => Boolean(id))));
  const later = path.deferredSkills.filter(({ skillId }) => {
    const skill = skills.get(skillId);
    return skill?.importance !== "core" && !prerequisiteSkillIds.has(skillId);
  });

  return <section className="adaptive-path" aria-labelledby="adaptive-path-title">
    <header className="adaptive-path-heading">
      <p className="eyebrow">{path.scopeMode === "full-scope" ? "Full scope" : "Target-date scope"} · {path.estimatedStartDate}—{path.estimatedCompletionDate}</p>
      <h1 id="adaptive-path-title">Your precise path.</h1>
      <p>{blueprint.summary}</p>
    </header>
    <ol className="adaptive-path-rail" aria-label="Ordered learning path">
      {path.phases.map((phase, phaseIndex) => <li className={phaseIndex === current ? "is-current" : ""} key={phase.phaseId} aria-current={phaseIndex === current ? "step" : undefined}>
        <div className="adaptive-phase-index"><span>{String(phaseIndex + 1).padStart(2, "0")}</span><small>{phaseIndex === current ? "Current phase" : phaseIndex < current ? "Completed phase" : "Upcoming phase"}</small></div>
        <div className="adaptive-phase-copy">
          <h2>{phase.name}</h2>
          <p>{phase.outcome}</p>
          <ol aria-label={`${phase.name} units`}>
            {phase.unitIds.map((unitId) => {
              const unit = units.get(unitId);
              const template = unit ? templates.get(unit.templateId) : undefined;
              const skill = unit ? skills.get(unit.skillId) : undefined;
              if (!unit || !template || !skill) return null;
              const prerequisites = unit.prerequisiteUnitIds.map((id) => skills.get(units.get(id)?.skillId ?? "")?.name).filter((name): name is string => Boolean(name));
              return <li key={unit.id}>
                <div><span className="unit-kind">{kindLabel[unit.kind]}</span><strong>{template.title}</strong></div>
                <p>{template.objective}</p>
                {prerequisites.length > 0 && <small>Builds on {prerequisites.join(", ")}. <span>{skill.why}</span></small>}
                <p className="audit-position">
                  Your self-assessment: {levelLabel[answers.get(skill.id)?.level ?? "unseen"]}.
                </p>
              </li>;
            })}
          </ol>
        </div>
      </li>)}
    </ol>
    {later.length > 0 && <section className="adaptive-later" aria-labelledby="adaptive-later-title">
      <p className="section-index">Later</p>
      <h2 id="adaptive-later-title">Deliberately deferred—not discarded.</h2>
      <ul>{later.map(({ skillId, reason }) => <li key={skillId}><strong>{skills.get(skillId)?.name ?? skillId}</strong><span>{reason === "target-date-advantage" ? "Advantage skill deferred to protect the target date." : "Strong supporting skill deferred to protect the target date."}</span></li>)}</ul>
    </section>}
  </section>;
}

function resolvePath(value: unknown, blueprint: RoleBlueprint, registry: UnitRegistry) {
  try {
    const workspace = parsePlanningWorkspaceAtRepositoryBoundary(value);
    const path = workspace.pathVersions.find(({ id }) => id === workspace.activePathVersionId);
    if (!path || path.blueprintId !== blueprint.id || path.blueprintVersion !== blueprint.version
      || path.registryId !== registry.id || path.registryVersion !== registry.version
      || registry.blueprintId !== blueprint.id || registry.blueprintVersion !== blueprint.version) return null;
    return { workspace, path } satisfies { workspace: PlanningWorkspace; path: NonNullable<typeof path> };
  } catch { return null; }
}
