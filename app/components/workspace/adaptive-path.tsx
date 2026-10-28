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

type AdaptivePathProps = {
  workspace: unknown;
  blueprint?: RoleBlueprint;
  registry?: UnitRegistry;
  headingLevel?: 1 | 2;
  title?: string;
  readOnly?: boolean;
};

const kindLabel = { learn: "学习", calibrate: "能力校准", reinforce: "巩固" } as const;
const levelLabel = { unseen: "尚未开始", conceptual: "了解概念", guided: "需要指导", independent: "可独立完成" } as const;

export function AdaptivePath({ workspace: value, blueprint = flagshipBlueprint, registry = flagshipUnitRegistry, headingLevel = 1, title = "学习路线", readOnly = false }: AdaptivePathProps) {
  const resolved = resolvePath(value, blueprint, registry);
  if (!resolved) return <PlanningVersionBoundary />;
  const { workspace, path } = resolved;
  const completed = new Set(workspace.events.filter((event) => event.kind === "completed").map((event) => event.unitId));
  const currentPhaseIndex = path.phases.findIndex((phase) => phase.unitIds.some((id) => !completed.has(id)));
  const current = currentPhaseIndex < 0 ? path.phases.length - 1 : currentPhaseIndex;
  return <ResolvedAdaptivePath key={`${path.id}:${current}`} workspace={workspace} path={path} current={current} blueprint={blueprint} registry={registry} headingLevel={headingLevel} title={title} readOnly={readOnly} />;
}

function ResolvedAdaptivePath({ workspace, path, current, blueprint, registry, headingLevel, title, readOnly }: {
  workspace: PlanningWorkspace;
  path: PlanningWorkspace["pathVersions"][number];
  current: number;
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
  const [expanded, setExpanded] = useState(() => new Set([path.phases[current]?.phaseId]));
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
      <p className="eyebrow">{path.scopeMode === "full-scope" ? "完整学习范围" : "目标日期范围"} · {path.estimatedStartDate}—{path.estimatedCompletionDate}</p>
      <Heading id="adaptive-path-title">{title}</Heading>
      <p>{blueprint.summary}</p>
      {!readOnly && <div className="path-primary-actions"><Link className="primary-link" href="/today">继续今日学习 ↗</Link><Link href="/coach?returnTo=%2Fpath">调整学习计划</Link></div>}
    </header>
    {!readOnly && <SetupCompletionNotice />}
    {(selectedSkill || selectedUnit) && !locatedPhase && <p className="workspace-notice" role="status">这项内容不在当前路线中。你仍可查看完整路线。</p>}
    <div className="path-disclosure-controls"><p>当前阶段展开；其他阶段保留目标概览。</p><button className="text-action" type="button" onClick={() => setExpanded(new Set(allExpanded ? [path.phases[current]?.phaseId] : path.phases.map(({ phaseId }) => phaseId)))}>{allExpanded ? "仅展开当前阶段" : "展开全部阶段"}</button></div>
    <ol className="adaptive-path-rail" aria-label="学习阶段">
      {path.phases.map((phase, phaseIndex) => <li className={phaseIndex === current ? "is-current" : ""} key={phase.phaseId} aria-current={phaseIndex === current ? "step" : undefined}>
        <div className="adaptive-phase-index"><span>{String(phaseIndex + 1).padStart(2, "0")}</span><small>{phaseIndex === current ? "当前阶段" : phaseIndex < current ? "已完成阶段" : "后续阶段"}</small></div>
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
          <summary><PhaseHeading>{phase.name}</PhaseHeading><p>{phase.outcome}</p><span>{phase.unitIds.length} 个学习单元 · {expanded.has(phase.phaseId) ? "收起详情" : "展开详情"}</span></summary>
          <ol aria-label={`${phase.name} 学习单元`}>
            {phase.unitIds.map((unitId) => {
              const unit = units.get(unitId);
              const template = unit ? templates.get(unit.templateId) : undefined;
              const skill = unit ? skills.get(unit.skillId) : undefined;
              if (!unit || !template || !skill) return null;
              const checkpoint = template.checkpoints.find(item => item.id === unit.checkpointId);
              const prerequisites = unit.prerequisiteUnitIds.map((id) => skills.get(units.get(id)?.skillId ?? "")?.name).filter((name): name is string => Boolean(name));
              return <li key={unit.id} className={unit.id === selectedUnit || unit.skillId === selectedSkill ? "is-selected" : undefined}>
                <details className="path-unit-detail" open={unit.id === selectedUnit || unit.skillId === selectedSkill}>
                <summary onClick={readOnly ? undefined : event => { event.preventDefault(); updatePageQuery({ unit: selectedUnit === unit.id ? null : unit.id, skill: null }); }}><span className="unit-kind">{kindLabel[unit.kind]}</span><strong>{template.title}{checkpoint && <small className="path-checkpoint">{checkpoint.label}</small>}</strong><span className="path-unit-duration">{unit.estimatedMinutes} 分钟</span></summary>
                <p>{template.objective}</p>
                {prerequisites.length > 0 && <small>依赖于 {prerequisites.join(", ")}。 <span>{skill.why}</span></small>}
                <p className="audit-position">
                  你的自评：{levelLabel[answers.get(skill.id)?.level ?? "unseen"]}。
                </p>
                {!readOnly && <Link href={`/stack?skill=${encodeURIComponent(skill.id)}`}>查看技能与资料 ↗</Link>}
                </details>
              </li>;
            })}
          </ol>
        </details>
      </li>)}
    </ol>
    {later.length > 0 && <section className="adaptive-later" aria-labelledby="adaptive-later-title">
      <p className="section-index">后续学习</p>
      <h2 id="adaptive-later-title">暂缓的技能</h2>
      <ul>{later.map(({ skillId, reason }) => <li key={skillId}><strong>{skills.get(skillId)?.name ?? skillId}</strong><span>{reason === "target-date-advantage" ? "为守住目标日期，暂缓这项加分技能。" : "为守住目标日期，暂缓这项重要的支撑技能。"}</span></li>)}</ul>
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
