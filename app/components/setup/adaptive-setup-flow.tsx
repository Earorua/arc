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
import { adaptiveDraftSchema, clearSetupDrafts, readSetupDraft, writeSetupDraft } from "./setup-draft";
import type { SetupSource } from "./setup-flow";
import { setupStepNames, useSetupNavigation } from "./setup-navigation";

type AdaptiveSetupStage = "audit" | "availability" | "confirm";
const stages: AdaptiveSetupStage[] = ["audit", "availability", "confirm"];

function toAudit(blueprint: RoleBlueprint, draft: SkillAuditDraft) {
  const evidence = blueprint.skills.flatMap((skill) => (draft.evidence[skill.id] ?? []).map((item) => ({ ...item, skillId: skill.id })));
  const raw = { schemaVersion: PLANNING_SCHEMA_VERSION, blueprintId: blueprint.id, blueprintVersion: blueprint.version, answers: blueprint.skills.map((skill) => ({ skillId: skill.id, level: draft.levels[skill.id], evidenceRefs: (draft.evidence[skill.id] ?? []).map(({ id }) => id) })), evidence, createdBy: "learner" };
  const inputFingerprint = fingerprint(raw);
  return skillAuditVersionSchema.parse({ ...raw, id: deterministicId("audit", { inputFingerprint }), inputFingerprint });
}
export function toAvailability(draft: AvailabilityDraft) {
  const raw = { schemaVersion: PLANNING_SCHEMA_VERSION, timeZone: draft.timeZone, weekdays: Object.fromEntries(Object.entries(draft.weekdays).map(([day, minutes]) => [day, Number(minutes)])), exceptions: draft.exceptions, weeklyMinutes: weeklyMinutesForDraft(draft) };
  const inputFingerprint = fingerprint(raw);
  return availabilityVersionSchema.parse({ ...raw, id: deterministicId("availability", { inputFingerprint }), inputFingerprint });
}
function toTarget(targetWeeks: number): PlanningTarget {
  const raw = { schemaVersion: PLANNING_SCHEMA_VERSION, targetWeeks }; const inputFingerprint = fingerprint(raw);
  return planningTargetSchema.parse({ ...raw, id: deterministicId("target", { inputFingerprint }), inputFingerprint });
}
function safely<T>(build: () => T): T | null { try { return build(); } catch { return null; } }

type AdaptiveSetupFlowProps = {
  blueprint: RoleBlueprint; registry: UnitRegistry; generate: (request: GeneratePlanningRequest) => Promise<boolean>;
  source?: SetupSource;
  draftOwner?: string;
  lockedGeneration?: boolean;
  savesToAccount?: boolean;
  createsNewGoal?: boolean;
  syncUrl?: boolean;
  navigate: (path: string) => void; createMutationId: () => string; now: () => Date; timeZone: string; onBackToRole?: () => void; active?: boolean;
  buildPaths?: (input: PathBuildInput) => ReturnType<typeof buildLearningPaths>;
  buildPathsForSubmit?: (input: PathBuildInput) => ReturnType<typeof buildLearningPaths> | Promise<ReturnType<typeof buildLearningPaths>>;
  scheduleForSubmit?: (input: PlanBuildInput) => ReturnType<typeof buildPlanVersion> | Promise<ReturnType<typeof buildPlanVersion>>;
};
export function AdaptiveSetupFlow(props: AdaptiveSetupFlowProps) {
  const source = props.source?.source === "research" ? props.source.researchRunId : "flagship";
  return <OwnedAdaptiveSetupFlow key={`${props.draftOwner ?? "ephemeral"}:${source}:${props.blueprint.id}:${props.blueprint.version}`} {...props} />;
}
function OwnedAdaptiveSetupFlow({ blueprint, registry, source, generate, navigate, createMutationId, now, timeZone, onBackToRole, active = true, savesToAccount = false, createsNewGoal = false, draftOwner, lockedGeneration = false, syncUrl = false, buildPaths = buildLearningPaths, buildPathsForSubmit = buildLearningPaths, scheduleForSubmit = buildPlanVersion }: AdaptiveSetupFlowProps) {
  const recoveryLock = useRef(lockedGeneration);
  useLayoutEffect(() => { recoveryLock.current = lockedGeneration; }, [lockedGeneration]);
  const failureMessage = () => recoveryLock.current ? "The save result is still unconfirmed. Retry with the original settings." : "Arc could not save your plan. You can still edit your settings.";
  const [stageIndex, setStageIndex] = useState(0);
  const [furthestStep, setFurthestStep] = useState(1);
  const stage = stages[stageIndex]!;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [auditDraft, setAuditDraft] = useState(() => createSkillAuditDraft(blueprint));
  const [availabilityDraft, setAvailabilityDraft] = useState(() => createAvailabilityDraft(timeZone));
  const [targetWeeks, setTargetWeeks] = useState(18);
  const [selectedScope, setSelectedScope] = useState<"full-scope" | "target-date" | null>(null);
  const buildAttempt = useRef<{ key: string; mutationId: string } | null>(null);
  const [planningInstant, setPlanningInstant] = useState(() => now().toISOString());
  const draftSource = `adaptive:${source?.source === "research" ? `research:${source.researchRunId}` : "flagship"}:${blueprint.id}:${blueprint.version}:${registry.id}:${registry.version}`;
  const [draftReady, setDraftReady] = useState(!draftOwner);
  const [restored, setRestored] = useState(false);
  const [draftError, setDraftError] = useState(false);
  useEffect(() => {
    if (!draftOwner) return;
    let current = true;
    queueMicrotask(() => {
      if (!current) return;
    const draft = readSetupDraft(draftOwner, draftSource, adaptiveDraftSchema);
    const expectedIds = blueprint.skills.map(({ id }) => id);
    if (draft && Object.keys(draft.auditDraft.levels).length === expectedIds.length
      && expectedIds.every((id) => Object.hasOwn(draft.auditDraft.levels, id))
      && Object.keys(draft.auditDraft.evidence).every((id) => expectedIds.includes(id))) {
      setStageIndex(Math.min(draft.stageIndex, 2)); setFurthestStep(draft.furthestStep ?? Math.min(draft.stageIndex + 1, 3)); setAuditDraft(draft.auditDraft); setAvailabilityDraft(draft.availabilityDraft);
      setTargetWeeks(draft.targetWeeks); setSelectedScope(draft.selectedScope); setRestored(true);
      buildAttempt.current = draft.buildAttempt ?? null;
      if (draft.buildAttempt && draft.planningInstant) setPlanningInstant(draft.planningInstant);
    }
    setDraftReady(true);
    });
    return () => { current = false; };
  }, [blueprint, draftOwner, draftSource]);
  useEffect(() => {
    if (!draftReady) return;
    const saved = writeSetupDraft(draftOwner, draftSource, adaptiveDraftSchema, { stageIndex, furthestStep, auditDraft, availabilityDraft, targetWeeks, selectedScope, planningInstant, buildAttempt: buildAttempt.current });
    let current = true;
    queueMicrotask(() => { if (current) setDraftError(!saved); });
    return () => { current = false; };
  }, [draftReady, draftOwner, draftSource, stageIndex, furthestStep, auditDraft, availabilityDraft, targetWeeks, selectedScope, planningInstant]);
  const [building, setBuilding] = useState(false);
  const [newPlanConfirmed, setNewPlanConfirmed] = useState(false);
  const [buildStatus, setBuildStatus] = useState("Ready to create your plan.");
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
  const confirmationLocked = building || lockedGeneration;
  const navigateStep = useSetupNavigation({ enabled: syncUrl, ready: draftReady, active, currentStep: stageIndex + 1,
    minimumStep: confirmationLocked ? 3 : 0,
    maximumStep: confirmationLocked ? 3 : Math.min(furthestStep, !audit ? 1 : !availability ? 2 : 3),
    onNavigate: (next) => { if (confirmationLocked) { setStageIndex(2); return; } if (next === 0) onBackToRole?.(); else setStageIndex(next - 1); },
  });
  const advance = () => { const next = Math.min(stageIndex + 2, stages.length); setFurthestStep((current) => Math.max(current, next)); navigateStep(next); };
  const back = () => { if (stageIndex === 0) onBackToRole?.(); else navigateStep(stageIndex); };
  const canContinue = (stage === "audit" && audit !== null) || (stage === "availability" && availability !== null);

  const build = async () => {
    if (!active || building || (createsNewGoal && !newPlanConfirmed) || !audit || !availability || !target || !targetPaths || !scopeAvailable) return;
    const epoch = lifecycle.current;
    const current = () => epoch === lifecycle.current;
    setBuilding(true); setBuildStatus("Checking your settings…");
    try {
      const validated = await Promise.resolve().then(() => ({
        audit: skillAuditVersionSchema.parse(audit),
        availability: availabilityVersionSchema.parse(availability),
        target: planningTargetSchema.parse(target),
      }));
      if (!current()) return;
      const scope = selectedScope ?? (targetPaths.targetDate && targetPaths.targetDate.deferredSkills.length > 0 ? "full-scope" : null);
      if (scope === "target-date" && !targetPaths.targetDate) throw new Error("Path unavailable");

      setBuildStatus("Creating your learning path…");
      const submittedPaths = pathBuildResultSchema.parse(await buildPathsForSubmit({ blueprint, registry, ...validated, planningDate }));
      if (!current()) return;
      if (submittedPaths.fullScope.inputFingerprint !== targetPaths.fullScope.inputFingerprint
        || submittedPaths.targetDate?.inputFingerprint !== targetPaths.targetDate?.inputFingerprint) throw new Error("Path preview changed");
      const selectedPath = scope === "target-date" ? submittedPaths.targetDate : submittedPaths.fullScope;
      if (!selectedPath) throw new Error("Path unavailable");

      setBuildStatus("Scheduling the next seven days…");
      const schedule = await scheduleForSubmit({ path: selectedPath, registry, availability: validated.availability, planningDate, generation: "initial", baseVersionId: null, replanReason: null, completedUnitIds: new Set() });
      if (!current()) return;
      planVersionSchema.parse(schedule.plan);
      schedule.dailyUnits.forEach((unit) => dailyUnitSchema.parse(unit));

      setBuildStatus("Saving your plan…");
      const input = { ...(source ? { source } : { roleId: blueprint.id }), planningDate, ...validated, selectedScope: scope };
      const key = JSON.stringify(input);
      if (buildAttempt.current?.key !== key) buildAttempt.current = { key, mutationId: createMutationId() };
      writeSetupDraft(draftOwner, draftSource, adaptiveDraftSchema, { stageIndex, furthestStep, auditDraft, availabilityDraft, targetWeeks, selectedScope, planningInstant, buildAttempt: buildAttempt.current });
      const request = generatePlanningRequestSchema.parse({ mutationId: buildAttempt.current.mutationId, ...input });
      const saved = await generate(request);
      if (!current()) return;
      if (!saved) { setBuildStatus(failureMessage()); return; }
      clearSetupDrafts(draftOwner);
      setBuildStatus("Your plan is ready."); navigate("/path?created=1");
    } catch { if (current()) setBuildStatus(failureMessage()); }
    finally { setBuilding(false); }
  };

  return <section className="setup-flow adaptive-setup-flow">
    <p className="setup-progress">{String(stageIndex + 2).padStart(2, "0")} / 04 · {setupStepNames[stageIndex + 1]}</p>
    <ol className="setup-step-names" aria-label="Setup progress">{setupStepNames.map((name, index) => <li key={name} aria-current={index === stageIndex + 1 ? "step" : undefined}>{name}</li>)}</ol>
    {restored && <p className="setup-draft-notice">Your setup draft for this role is restored.</p>}
    {draftError && <p className="setup-draft-notice">Your draft could not be saved. Keep this page open.</p>}
    {draftOwner && <details className="setup-draft-options"><summary>Draft options</summary><button className="text-action" type="button" disabled={building || lockedGeneration} onClick={() => {
      navigateStep(1, true); setFurthestStep(1); setAuditDraft(createSkillAuditDraft(blueprint)); setAvailabilityDraft(createAvailabilityDraft(timeZone));
      setTargetWeeks(18); setSelectedScope(null); setNewPlanConfirmed(false); setRestored(false); buildAttempt.current = null;
    }}>Restart this role&apos;s setup</button></details>}
    <h1 ref={headingRef} tabIndex={-1}>{stage === "audit" ? "Assess your current skills." : stage === "availability" ? "Make a sustainable weekly schedule." : "Confirm your learning path."}</h1>
    {stage === "audit" && <SkillAuditStep blueprint={blueprint} onChange={(next) => { setAuditDraft(next); setSelectedScope(null); }} value={auditDraft} />}
    {stage === "availability" && <AvailabilityStep onChange={(next) => { setAvailabilityDraft(next); setSelectedScope(null); }} planningDate={planningDate} value={availabilityDraft} />}
    {stage === "confirm" && audit && availability && <fieldset className="setup-confirm-fields" disabled={building || lockedGeneration}><legend className="sr-only">Path timing and scope</legend><TargetStep blueprint={blueprint} error={targetBuild.failed ? "Arc could not compare the paths. Check your settings and try again." : undefined} onScopeChange={setSelectedScope} onTargetChange={(weeks) => { setTargetWeeks(weeks); setSelectedScope(null); }} result={targetPaths} selectedScope={scopeAvailable ? selectedScope : null} target={targetDraft} /></fieldset>}
    {stage === "confirm" && <div className="build-ledger">
      <dl className="setup-confirmation"><div><dt>Target role</dt><dd>{blueprint.name}</dd></div><div><dt>Weekly time</dt><dd>{availability?.weeklyMinutes} minutes</dd></div><div><dt>Target duration</dt><dd>{targetWeeks} weeks</dd></div></dl>
      <p>{lockedGeneration ? "Restoring the original settings for this plan. After saving, you can adjust your time on the path page." : "Confirm to create your path and the next seven days of tasks. Then you can start today's task."}</p>
      {lockedGeneration && <a className="text-action" href="/path">View current path</a>}
      {savesToAccount && <p>Your plan will be saved to your account. Existing local history stays on this device.</p>}
      {createsNewGoal && <label><input type="checkbox" checked={newPlanConfirmed} disabled={building}
        onChange={(event) => setNewPlanConfirmed(event.target.checked)} /> Create a new plan and keep the current plan in history</label>}
      {(!audit || !availability) && <p role="alert">Some settings need attention. Go back and review them before creating your path.</p>}
      <p role={buildStatus.includes("could not") || buildStatus.includes("unconfirmed") ? "alert" : "status"}>{buildStatus}</p>
    </div>}
    <nav className="setup-actions setup-primary-actions" aria-label="Setup steps">
      <button className="setup-back text-action" disabled={building || lockedGeneration} onClick={back} type="button">Back</button>
      {stage !== "confirm" ? <button className="setup-next" disabled={!canContinue} onClick={advance} type="button">Continue</button>
        : <button className="setup-next" disabled={building || !audit || !availability || !target || !targetPaths || !scopeAvailable || (createsNewGoal && !newPlanConfirmed)} onClick={() => void build()} type="button">{lockedGeneration ? "Retry saving original plan" : "Create path"}</button>}
    </nav>
  </section>;
}
