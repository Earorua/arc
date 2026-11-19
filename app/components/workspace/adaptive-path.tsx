"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { updatePageQuery, usePageQuery } from "../../lib/use-page-query";
import type { RoleBlueprint } from "../../contracts/intelligence";
import { parsePlanningWorkspaceAtRepositoryBoundary, type PlanningWorkspace, type UnitRegistry } from "../../contracts/planning";
import { flagshipBlueprint } from "../../data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../data/flagship-unit-registry";
import { PlanningVersionBoundary } from "./planning-version-boundary";
import { SetupCompletionNotice } from "./setup-completion-notice";
import { getPathProgress } from "../../lib/planning/path-progress";
import { phaseDateLabels } from "./path-phase-dates";
import { getCurrentLearningUnit } from "../../lib/planning/current-learning-unit";
import { planningDateForInstant } from "../../lib/planning/calendar";

type AdaptivePathProps = {
  workspace: unknown;
  blueprint?: RoleBlueprint;
  registry?: UnitRegistry;
  headingLevel?: 1 | 2;
  title?: string;
  readOnly?: boolean;
  now?: () => Date;
};

const kindLabel = { learn: "Learn", calibrate: "Calibration", reinforce: "Reinforcement" } as const;
const levelLabel = { unseen: "Not started", uncertain: "Unsure", conceptual: "Understand the concepts", guided: "Need guidance", independent: "Can work independently" } as const;
const systemNow = () => new Date();

export function AdaptivePath({ workspace: value, blueprint = flagshipBlueprint, registry = flagshipUnitRegistry, headingLevel = 1, title = "Learning path", readOnly = false, now = systemNow }: AdaptivePathProps) {
  const resolved = resolvePath(value, blueprint, registry, now);
  if (!resolved) return <PlanningVersionBoundary />;
  const { workspace, path } = resolved;
  const progress = getPathProgress(workspace, path);
  const current = path.phases.findIndex(phase => phase.phaseId === progress.currentPhaseId);
  return <ResolvedAdaptivePath key={`${path.id}:${current}`} workspace={workspace} path={path} current={current} currentUnitId={readOnly ? null : resolved.currentUnitId} blueprint={blueprint} registry={registry} headingLevel={headingLevel} title={title} readOnly={readOnly} />;
}

function ResolvedAdaptivePath({ workspace, path, current, currentUnitId, blueprint, registry, headingLevel, title, readOnly }: {
  workspace: PlanningWorkspace;
  path: PlanningWorkspace["pathVersions"][number];
  current: number;
  currentUnitId: string | null;
  blueprint: RoleBlueprint;
  registry: UnitRegistry;
  headingLevel: 1 | 2;
  title: string;
  readOnly: boolean;
}) {
  const query = usePageQuery();
  const selectedSkill = readOnly ? null : query.get("skill");
  const selectedUnit = readOnly ? null : query.get("unit");
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!selectedSkill && !selectedUnit) return;
    const summary = section.current?.querySelector<HTMLElement>(".is-selected .path-unit-detail > summary");
    summary?.focus({ preventScroll: true });
    summary?.scrollIntoView?.({ block: "nearest" });
  }, [selectedSkill, selectedUnit]);
  const locatedPhase = path.phases.find(phase => phase.unitIds.some(id => path.units.some(unit => unit.id === id && (unit.id === selectedUnit || unit.skillId === selectedSkill))));
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const PhaseHeading = headingLevel === 1 ? "h2" : "h3";
  const [expanded, setExpanded] = useState(() => new Set(current < 0 ? [] : [path.phases[current].phaseId]));
  const progress = getPathProgress(workspace, path);
  const phaseDates = phaseDateLabels(workspace, path);
  const activePlan = workspace.planVersions.find(plan => plan.id === workspace.activePlanVersionId);
  const allExpanded = path.phases.every(({ phaseId }) => expanded.has(phaseId));
  const templates = new Map(registry.tracks.flatMap((track) => track.templates).map((template) => [template.id, template]));
  const units = new Map(path.units.map((unit) => [unit.id, unit]));
  const skills = new Map(blueprint.skills.map((skill) => [skill.id, skill]));
  const answers = new Map(workspace.audit.answers.map((answer) => [answer.skillId, answer]));
  const prerequisiteSkillIds = new Set(path.units.flatMap((unit) => unit.prerequisiteUnitIds.map((id) => units.get(id)?.skillId).filter((id): id is string => Boolean(id))));
  const later = path.deferredSkills.filter(({ skillId }) => {
    const skill = skills.get(skillId);
    return skill?.importance !== "core" && !prerequisiteSkillIds.has(skillId);
  });

  return <section ref={section} className="adaptive-path" aria-labelledby="adaptive-path-title">
    <header className="adaptive-path-heading">
      <p className="eyebrow">{path.scopeMode === "full-scope" ? "Full learning scope" : "Scope for your target date"} · Estimated path dates {path.estimatedStartDate}—{activePlan?.estimatedCompletionDate ?? path.estimatedCompletionDate}</p>
      <Heading id="adaptive-path-title">{title}</Heading>
      <p>{blueprint.summary}</p>
      {!readOnly && <div className="path-primary-actions">{currentUnitId && <Link className="primary-link" href="/today">Continue today’s task ↗</Link>}<Link href="/coach?returnTo=%2Fpath">Adjust your plan</Link></div>}
    </header>
    {!readOnly && <SetupCompletionNotice />}
    {(selectedSkill || selectedUnit) && !locatedPhase && <p className="workspace-notice" role="status">This item is not in your current path. You can still explore the full path.</p>}
    <div className="path-disclosure-controls"><p>{current < 0 ? "All learning units are complete." : "Your current phase is expanded. Other phases show an overview of their goals."}</p><button className="text-action" type="button" onClick={() => setExpanded(new Set(allExpanded ? current < 0 ? [] : [path.phases[current].phaseId] : path.phases.map(({ phaseId }) => phaseId)))}>{allExpanded ? current < 0 ? "Collapse all phases" : "Show current phase only" : "Expand all phases"}</button></div>
    <ol className="adaptive-path-rail" aria-label="Learning phases">
      {path.phases.map((phase, phaseIndex) => <li className={phaseIndex === current ? "is-current" : ""} key={phase.phaseId} aria-current={phaseIndex === current ? "step" : undefined}>
        <div className="adaptive-phase-index"><span>{String(phaseIndex + 1).padStart(2, "0")}</span><small>{phase.unitIds.every(id => progress.completedUnitIds.has(id)) ? "Completed phase" : phaseIndex === current ? "Current phase" : "Upcoming phase"}</small></div>
        <details className="adaptive-phase-copy" open={expanded.has(phase.phaseId) || locatedPhase?.phaseId === phase.phaseId} onToggle={(event) => {
          const open = event.currentTarget.open;
          if (!open && locatedPhase?.phaseId === phase.phaseId) updatePageQuery({ unit: null, skill: null }, true);
          setExpanded(previous => {
            if (previous.has(phase.phaseId) === open) return previous;
            const next = new Set(previous);
            if (open) next.add(phase.phaseId); else next.delete(phase.phaseId);
            return next;
          });
        }}>
          <summary><PhaseHeading>{phase.name}</PhaseHeading><p>{phase.outcome}</p><p className="path-phase-range">{phaseDates.get(phase.phaseId)}</p><span>{phase.unitIds.filter(id => progress.completedUnitIds.has(id)).length} / {phase.unitIds.length} learning units complete · {expanded.has(phase.phaseId) ? "Hide details" : "Show details"}</span></summary>
          <ol aria-label={`${phase.name} learning units`}>
            {phase.unitIds.map((unitId) => {
              const unit = units.get(unitId);
              const template = unit ? templates.get(unit.templateId) : undefined;
              const skill = unit ? skills.get(unit.skillId) : undefined;
              if (!unit || !template || !skill) return null;
              const checkpoint = template.checkpoints.find(item => item.id === unit.checkpointId);
              const prerequisites = unit.prerequisiteUnitIds.map((id) => skills.get(units.get(id)?.skillId ?? "")?.name).filter((name): name is string => Boolean(name));
              return <li key={unit.id} className={unit.id === selectedUnit || unit.skillId === selectedSkill ? "is-selected" : undefined}>
                <details className="path-unit-detail" open={unit.id === selectedUnit || unit.skillId === selectedSkill}>
                <summary onClick={readOnly ? undefined : event => { event.preventDefault(); updatePageQuery({ unit: selectedUnit === unit.id ? null : unit.id, skill: null }); }}><span className="unit-kind">{kindLabel[unit.kind]}</span><strong>{template.title}{checkpoint && <small className="path-checkpoint">{checkpoint.label}</small>}</strong><span className="path-unit-duration">{unit.estimatedMinutes} min</span><span className="path-unit-status">{progress.completedUnitIds.has(unit.id) ? "Completed" : unit.id === currentUnitId ? "Current task" : progress.prerequisitesSatisfiedUnitIds.has(unit.id) ? "Prerequisites met" : "To learn"}</span></summary>
                <p>{template.objective}</p>
                {prerequisites.length > 0 && <small>Requires {prerequisites.join(", ")}. <span>{skill.why}</span></small>}
                <p className="audit-position">
                  Your self-assessment: {levelLabel[answers.get(skill.id)?.level ?? "unseen"]}.
                </p>
                {!readOnly && unit.id === currentUnitId && <p><Link href="/today">Start your current task</Link></p>}
                {!readOnly && <Link href={`/stack?skill=${encodeURIComponent(skill.id)}`}>View skills and resources ↗</Link>}
                </details>
              </li>;
            })}
          </ol>
        </details>
      </li>)}
    </ol>
    {later.length > 0 && <section className="adaptive-later" aria-labelledby="adaptive-later-title">
      <p className="section-index">Learn later</p>
      <h2 id="adaptive-later-title">Deferred skills</h2>
      <ul>{later.map(({ skillId, reason }) => <li key={skillId}><strong>{skills.get(skillId)?.name ?? skillId}</strong><span>{reason === "target-date-advantage" ? "This additional skill is deferred to keep your target date." : "This supporting skill is deferred to keep your target date."}</span></li>)}</ul>
    </section>}
  </section>;
}

function resolvePath(value: unknown, blueprint: RoleBlueprint, registry: UnitRegistry, now: () => Date) {
  try {
    const workspace = parsePlanningWorkspaceAtRepositoryBoundary(value);
    const path = workspace.pathVersions.find(({ id }) => id === workspace.activePathVersionId);
    if (!path || path.blueprintId !== blueprint.id || path.blueprintVersion !== blueprint.version
      || path.registryId !== registry.id || path.registryVersion !== registry.version
      || registry.blueprintId !== blueprint.id || registry.blueprintVersion !== blueprint.version) return null;
    const today = planningDateForInstant(now().toISOString(), workspace.availability.timeZone);
    const currentUnitId = getCurrentLearningUnit(workspace, today)?.id ?? null;
    return { workspace, path, currentUnitId };
  } catch { return null; }
}
