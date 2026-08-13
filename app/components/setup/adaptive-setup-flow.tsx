"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RoleBlueprint } from "../../contracts/intelligence";
import { generatePlanningRequestSchema, type GeneratePlanningRequest } from "../../contracts/planning-api";
import { PLANNING_SCHEMA_VERSION, availabilityVersionSchema, planningTargetSchema, skillAuditVersionSchema, type PlanningTarget, type UnitRegistry } from "../../contracts/planning";
import { buildLearningPaths } from "../../lib/planning/path-builder";
import { buildPlanVersion } from "../../lib/planning/scheduler";
import { deterministicId, fingerprint } from "../../lib/planning/fingerprint";
import { planningDateForInstant } from "../../lib/planning/calendar";
import { AvailabilityStep, createAvailabilityDraft, isAvailabilityDraftValid, weeklyMinutesForDraft, type AvailabilityDraft } from "./availability-step";
import { createSkillAuditDraft, isSkillAuditDraftValid, SkillAuditStep, type SkillAuditDraft } from "./skill-audit-step";
import { TargetStep } from "./target-step";

type AdaptiveSetupStage = "role" | "audit" | "availability" | "target" | "build";
const stages: AdaptiveSetupStage[] = ["role", "audit", "availability", "target", "build"];
const stageLabel: Record<AdaptiveSetupStage, string> = { role: "Role", audit: "Audit", availability: "Availability", target: "Target", build: "Build" };

function toAudit(blueprint: RoleBlueprint, draft: SkillAuditDraft) {
  const evidence = blueprint.skills.flatMap((skill) => (draft.evidence[skill.id] ?? []).map((item) => ({ ...item, skillId: skill.id })));
  const raw = { schemaVersion: PLANNING_SCHEMA_VERSION, blueprintId: blueprint.id, blueprintVersion: blueprint.version, answers: blueprint.skills.map((skill) => ({ skillId: skill.id, level: draft.levels[skill.id], evidenceRefs: (draft.evidence[skill.id] ?? []).map(({ id }) => id) })), evidence, createdBy: "learner" };
  const inputFingerprint = fingerprint(raw);
  return skillAuditVersionSchema.parse({ ...raw, id: deterministicId("audit", { inputFingerprint }), inputFingerprint });
}
function toAvailability(draft: AvailabilityDraft) {
  const raw = { schemaVersion: PLANNING_SCHEMA_VERSION, timeZone: draft.timeZone, weekdays: Object.fromEntries(Object.entries(draft.weekdays).map(([day, minutes]) => [day, Number(minutes)])), exceptions: draft.exceptions, weeklyMinutes: weeklyMinutesForDraft(draft) };
  const inputFingerprint = fingerprint(raw);
  return availabilityVersionSchema.parse({ ...raw, id: deterministicId("availability", { inputFingerprint }), inputFingerprint });
}
function toTarget(targetWeeks: number): PlanningTarget {
  const raw = { schemaVersion: PLANNING_SCHEMA_VERSION, targetWeeks }; const inputFingerprint = fingerprint(raw);
  return planningTargetSchema.parse({ ...raw, id: deterministicId("target", { inputFingerprint }), inputFingerprint });
}

export function AdaptiveSetupFlow({ blueprint, registry, generate, navigate, createMutationId, now, timeZone, initialStage = "role" }: {
  blueprint: RoleBlueprint; registry: UnitRegistry; generate: (request: GeneratePlanningRequest) => Promise<boolean>;
  navigate: (path: string) => void; createMutationId: () => string; now: () => Date; timeZone: string; initialStage?: AdaptiveSetupStage;
}) {
  const [stageIndex, setStageIndex] = useState(() => stages.indexOf(initialStage));
  const stage = stages[stageIndex]!;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const [auditDraft, setAuditDraft] = useState(() => createSkillAuditDraft(blueprint));
  const [availabilityDraft, setAvailabilityDraft] = useState(() => createAvailabilityDraft(timeZone));
  const [targetWeeks, setTargetWeeks] = useState(18);
  const [selectedScope, setSelectedScope] = useState<"full-scope" | "target-date" | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildStatus, setBuildStatus] = useState("Ready to build.");
  const [planningInstant] = useState(() => now().toISOString());
  const planningDate = useMemo(() => {
    try { return planningDateForInstant(planningInstant, availabilityDraft.timeZone); }
    catch { return planningDateForInstant(planningInstant, timeZone || "UTC"); }
  }, [availabilityDraft.timeZone, planningInstant, timeZone]);
  const audit = useMemo(() => isSkillAuditDraftValid(blueprint, auditDraft) ? toAudit(blueprint, auditDraft) : null, [auditDraft, blueprint]);
  const availability = useMemo(() => isAvailabilityDraftValid(availabilityDraft, planningDate) ? toAvailability(availabilityDraft) : null, [availabilityDraft, planningDate]);
  const target = useMemo(() => Number.isInteger(targetWeeks) && targetWeeks >= 4 && targetWeeks <= 52 ? toTarget(targetWeeks) : null, [targetWeeks]);
  const targetDraft: PlanningTarget = target ?? {
    id: "target-draft", schemaVersion: PLANNING_SCHEMA_VERSION, targetWeeks, inputFingerprint: "target-draft",
  };
  const targetPaths = useMemo(() => {
    if (!audit || !availability || !target) return null;
    try { return buildLearningPaths({ blueprint, registry, audit, availability, target, planningDate }); } catch { return null; }
  }, [audit, availability, blueprint, planningDate, registry, target]);
  const needsScopeChoice = Boolean(targetPaths && (targetPaths.targetDate === null || targetPaths.targetDate.deferredSkills.length > 0));

  useEffect(() => { if (firstRender.current) { firstRender.current = false; return; } headingRef.current?.focus(); }, [stage]);
  const advance = () => setStageIndex((current) => Math.min(current + 1, stages.length - 1));
  const back = () => setStageIndex((current) => Math.max(current - 1, 0));
  const canContinue = stage === "role" || (stage === "audit" && audit !== null) || (stage === "availability" && availability !== null) || (stage === "target" && audit !== null && availability !== null && target !== null && (!needsScopeChoice || selectedScope !== null));

  const build = async () => {
    if (building || !audit || !availability || !target) return;
    setBuilding(true); setBuildStatus("Validating your inputs…");
    try {
      const requestBase = await Promise.resolve().then(() => ({ audit: skillAuditVersionSchema.parse(audit), availability: availabilityVersionSchema.parse(availability), target: planningTargetSchema.parse(target) }));
      const paths = await Promise.resolve().then(() => buildLearningPaths({ blueprint, registry, ...requestBase, planningDate }));
      const scope = selectedScope ?? (paths.targetDate && paths.targetDate.deferredSkills.length > 0 ? "full-scope" : null);
      const path = scope === "target-date" ? paths.targetDate : paths.fullScope;
      if (!path) throw new Error("Path unavailable");
      setBuildStatus("Building the seven-day schedule…");
      await Promise.resolve().then(() => buildPlanVersion({ path, registry, availability, planningDate, generation: "initial", baseVersionId: null, replanReason: null, completedUnitIds: new Set() }));
      setBuildStatus("Saving your plan…");
      const request = generatePlanningRequestSchema.parse({ mutationId: createMutationId(), roleId: blueprint.id, planningDate, audit, availability, target, selectedScope: scope });
      const saved = await generate(request);
      if (!saved) { setBuildStatus("Arc could not save this plan. Your answers are still editable."); return; }
      setBuildStatus("Plan ready."); navigate("/path");
    } catch { setBuildStatus("Arc could not save this plan. Your answers are still editable."); }
    finally { setBuilding(false); }
  };

  return <section className="setup-flow adaptive-setup-flow">
    <p className="setup-progress">{String(stageIndex + 1).padStart(2, "0")} / 05 · {stageLabel[stage]}</p>
    <h1 ref={headingRef} tabIndex={-1}>{stage === "role" ? "Choose the reviewed role blueprint." : stage === "audit" ? "Audit each skill, honestly." : stage === "availability" ? "Write a week you can repeat." : stage === "target" ? "Choose scope against time." : "Build the plan from your answers."}</h1>
    {stage === "role" && <div className="role-ledger"><p className="eyebrow">Reviewed blueprint</p><h2>{blueprint.name}</h2><p>{blueprint.summary}</p></div>}
    {stage === "audit" && <SkillAuditStep blueprint={blueprint} onChange={setAuditDraft} value={auditDraft} />}
    {stage === "availability" && <AvailabilityStep onChange={setAvailabilityDraft} planningDate={planningDate} value={availabilityDraft} />}
    {stage === "target" && audit && availability && <TargetStep audit={audit} availability={availability} blueprint={blueprint} registry={registry} onScopeChange={setSelectedScope} onTargetChange={(weeks) => { setTargetWeeks(weeks); setSelectedScope(null); }} planningDate={planningDate} selectedScope={selectedScope} target={targetDraft} />}
    {stage === "build" && <div className="build-ledger"><p role={buildStatus.includes("could not") ? "alert" : "status"}>{buildStatus}</p><button className="setup-next" disabled={building} onClick={() => void build()} type="button">Build my path</button></div>}
    <nav className="setup-actions" aria-label="Setup steps">
      {stageIndex > 0 && <button className="text-action" disabled={building} onClick={back} type="button">Back</button>}
      {stage !== "build" && <button className="setup-next" disabled={!canContinue} onClick={advance} type="button">Continue</button>}
    </nav>
  </section>;
}
