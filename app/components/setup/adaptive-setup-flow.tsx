"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RoleBlueprint } from "../../contracts/intelligence";
import { generatePlanningRequestSchema, type GeneratePlanningRequest } from "../../contracts/planning-api";
import { PLANNING_SCHEMA_VERSION, availabilityVersionSchema, dailyUnitSchema, pathBuildResultSchema, planningTargetSchema, planVersionSchema, skillAuditVersionSchema, type PlanningTarget, type UnitRegistry } from "../../contracts/planning";
import { buildLearningPaths, type PathBuildInput } from "../../lib/planning/path-builder";
import { buildPlanVersion, type PlanBuildInput } from "../../lib/planning/scheduler";
import { deterministicId, fingerprint } from "../../lib/planning/fingerprint";
import { planningDateForInstant } from "../../lib/planning/calendar";
import { AvailabilityStep, createAvailabilityDraft, isAvailabilityDraftValid, weeklyMinutesForDraft, type AvailabilityDraft } from "./availability-step";
import { createSkillAuditDraft, isSkillAuditDraftValid, SkillAuditStep, type SkillAuditDraft } from "./skill-audit-step";
import { TargetStep } from "./target-step";
import type { SetupSource } from "./setup-flow";

type AdaptiveSetupStage = "audit" | "availability" | "target" | "build";
const stages: AdaptiveSetupStage[] = ["audit", "availability", "target", "build"];
const stageLabel: Record<AdaptiveSetupStage, string> = { audit: "Audit", availability: "Availability", target: "Target", build: "Build" };

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
function safely<T>(build: () => T): T | null { try { return build(); } catch { return null; } }

export function AdaptiveSetupFlow({ blueprint, registry, source, generate, navigate, createMutationId, now, timeZone, onBackToRole, active = true, buildPaths = buildLearningPaths, buildPathsForSubmit = buildLearningPaths, scheduleForSubmit = buildPlanVersion }: {
  blueprint: RoleBlueprint; registry: UnitRegistry; generate: (request: GeneratePlanningRequest) => Promise<boolean>;
  source?: SetupSource;
  navigate: (path: string) => void; createMutationId: () => string; now: () => Date; timeZone: string; onBackToRole?: () => void; active?: boolean;
  buildPaths?: (input: PathBuildInput) => ReturnType<typeof buildLearningPaths>;
  buildPathsForSubmit?: (input: PathBuildInput) => ReturnType<typeof buildLearningPaths> | Promise<ReturnType<typeof buildLearningPaths>>;
  scheduleForSubmit?: (input: PlanBuildInput) => ReturnType<typeof buildPlanVersion> | Promise<ReturnType<typeof buildPlanVersion>>;
}) {
  const [stageIndex, setStageIndex] = useState(0);
  const stage = stages[stageIndex]!;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [auditDraft, setAuditDraft] = useState(() => createSkillAuditDraft(blueprint));
  const [availabilityDraft, setAvailabilityDraft] = useState(() => createAvailabilityDraft(timeZone));
  const [targetWeeks, setTargetWeeks] = useState(18);
  const [selectedScope, setSelectedScope] = useState<"full-scope" | "target-date" | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildStatus, setBuildStatus] = useState("Ready to build.");
  const [planningInstant] = useState(() => now().toISOString());
  const lifecycle = useRef(0);
  const sourceKey = source?.source === "research" ? source.researchRunId : blueprint.id;
  useLayoutEffect(() => { lifecycle.current += 1; return () => { lifecycle.current += 1; }; }, [active, sourceKey]);
  const planningDate = useMemo(() => {
    try { return planningDateForInstant(planningInstant, availabilityDraft.timeZone); }
    catch { return planningDateForInstant(planningInstant, timeZone || "UTC"); }
  }, [availabilityDraft.timeZone, planningInstant, timeZone]);
  const audit = useMemo(() => isSkillAuditDraftValid(blueprint, auditDraft) ? safely(() => toAudit(blueprint, auditDraft)) : null, [auditDraft, blueprint]);
  const availability = useMemo(() => isAvailabilityDraftValid(availabilityDraft, planningDate) ? safely(() => toAvailability(availabilityDraft)) : null, [availabilityDraft, planningDate]);
  const target = useMemo(() => Number.isInteger(targetWeeks) && targetWeeks >= 4 && targetWeeks <= 52 ? safely(() => toTarget(targetWeeks)) : null, [targetWeeks]);
  const targetDraft: PlanningTarget = target ?? {
    id: "target-draft", schemaVersion: PLANNING_SCHEMA_VERSION, targetWeeks, inputFingerprint: "target-draft",
  };
  const targetBuild = useMemo(() => {
    if (!audit || !availability || !target) return { paths: null, failed: false };
    try { return { paths: buildPaths({ blueprint, registry, audit, availability, target, planningDate }), failed: false }; }
    catch { return { paths: null, failed: true }; }
  }, [audit, availability, blueprint, buildPaths, planningDate, registry, target]);
  const targetPaths = targetBuild.paths;
  const needsScopeChoice = Boolean(targetPaths && (targetPaths.targetDate === null || targetPaths.targetDate.deferredSkills.length > 0));
  const scopeAvailable = selectedScope === "full-scope" ? targetPaths !== null : selectedScope === "target-date" ? targetPaths?.targetDate != null : !needsScopeChoice;

  useEffect(() => { if (active) headingRef.current?.focus(); }, [active, stage]);
  const advance = () => setStageIndex((current) => Math.min(current + 1, stages.length - 1));
  const back = () => { if (stageIndex === 0) onBackToRole?.(); else setStageIndex((current) => current - 1); };
  const canContinue = (stage === "audit" && audit !== null) || (stage === "availability" && availability !== null) || (stage === "target" && audit !== null && availability !== null && target !== null && targetPaths !== null && scopeAvailable);

  const build = async () => {
    if (!active || building || !audit || !availability || !target || !targetPaths || !scopeAvailable) return;
    const epoch = lifecycle.current;
    const current = () => epoch === lifecycle.current;
    setBuilding(true); setBuildStatus("Validating your inputs…");
    try {
      const validated = await Promise.resolve().then(() => ({
        audit: skillAuditVersionSchema.parse(audit),
        availability: availabilityVersionSchema.parse(availability),
        target: planningTargetSchema.parse(target),
      }));
      if (!current()) return;
      const scope = selectedScope ?? (targetPaths.targetDate && targetPaths.targetDate.deferredSkills.length > 0 ? "full-scope" : null);
      if (scope === "target-date" && !targetPaths.targetDate) throw new Error("Path unavailable");

      setBuildStatus("Building the learning path…");
      const submittedPaths = pathBuildResultSchema.parse(await buildPathsForSubmit({ blueprint, registry, ...validated, planningDate }));
      if (!current()) return;
      if (submittedPaths.fullScope.inputFingerprint !== targetPaths.fullScope.inputFingerprint
        || submittedPaths.targetDate?.inputFingerprint !== targetPaths.targetDate?.inputFingerprint) throw new Error("Path preview changed");
      const selectedPath = scope === "target-date" ? submittedPaths.targetDate : submittedPaths.fullScope;
      if (!selectedPath) throw new Error("Path unavailable");

      setBuildStatus("Building the seven-day schedule…");
      const schedule = await scheduleForSubmit({ path: selectedPath, registry, availability: validated.availability, planningDate, generation: "initial", baseVersionId: null, replanReason: null, completedUnitIds: new Set() });
      if (!current()) return;
      planVersionSchema.parse(schedule.plan);
      schedule.dailyUnits.forEach((unit) => dailyUnitSchema.parse(unit));

      setBuildStatus("Saving your plan…");
      const request = generatePlanningRequestSchema.parse({ mutationId: createMutationId(), ...(source ? { source } : { roleId: blueprint.id }), planningDate, ...validated, selectedScope: scope });
      const saved = await generate(request);
      if (!current()) return;
      if (!saved) { setBuildStatus("Arc could not save this plan. Your answers are still editable."); return; }
      setBuildStatus("Plan ready."); navigate("/path");
    } catch { if (current()) setBuildStatus("Arc could not save this plan. Your answers are still editable."); }
    finally { setBuilding(false); }
  };

  return <section className="setup-flow adaptive-setup-flow">
    <p className="setup-progress">{String(stageIndex + 2).padStart(2, "0")} / 05 · {stageLabel[stage]}</p>
    <h1 ref={headingRef} tabIndex={-1}>{stage === "audit" ? "Audit each skill, honestly." : stage === "availability" ? "Write a week you can repeat." : stage === "target" ? "Choose scope against time." : "Build the plan from your answers."}</h1>
    {stage === "audit" && <SkillAuditStep blueprint={blueprint} onChange={(next) => { setAuditDraft(next); setSelectedScope(null); }} value={auditDraft} />}
    {stage === "availability" && <AvailabilityStep onChange={(next) => { setAvailabilityDraft(next); setSelectedScope(null); }} planningDate={planningDate} value={availabilityDraft} />}
    {stage === "target" && audit && availability && <TargetStep blueprint={blueprint} error={targetBuild.failed ? "Arc could not compare these paths. Review the inputs and try again." : undefined} onScopeChange={setSelectedScope} onTargetChange={(weeks) => { setTargetWeeks(weeks); setSelectedScope(null); }} result={targetPaths} selectedScope={scopeAvailable ? selectedScope : null} target={targetDraft} />}
    {stage === "build" && <div className="build-ledger">{source?.source === "research" && <p>Build saves this research plan to your account. Your existing device history stays on this device.</p>}<p role={buildStatus.includes("could not") ? "alert" : "status"}>{buildStatus}</p><button className="setup-next" disabled={building} onClick={() => void build()} type="button">Build my path</button></div>}
    <nav className="setup-actions" aria-label="Setup steps">
      <button className="setup-back text-action" disabled={building} onClick={back} type="button">Back</button>
      {stage !== "build" && <button className="setup-next" disabled={!canContinue} onClick={advance} type="button">Continue</button>}
    </nav>
  </section>;
}
