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

type AdaptiveSetupStage = "audit" | "availability" | "target" | "build";
const stages: AdaptiveSetupStage[] = ["audit", "availability", "target", "build"];
const stageLabel: Record<AdaptiveSetupStage, string> = { audit: "技能评估", availability: "时间安排", target: "目标范围", build: "生成计划" };

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
  navigate: (path: string) => void; createMutationId: () => string; now: () => Date; timeZone: string; onBackToRole?: () => void; active?: boolean;
  buildPaths?: (input: PathBuildInput) => ReturnType<typeof buildLearningPaths>;
  buildPathsForSubmit?: (input: PathBuildInput) => ReturnType<typeof buildLearningPaths> | Promise<ReturnType<typeof buildLearningPaths>>;
  scheduleForSubmit?: (input: PlanBuildInput) => ReturnType<typeof buildPlanVersion> | Promise<ReturnType<typeof buildPlanVersion>>;
};
export function AdaptiveSetupFlow(props: AdaptiveSetupFlowProps) {
  const source = props.source?.source === "research" ? props.source.researchRunId : "flagship";
  return <OwnedAdaptiveSetupFlow key={`${props.draftOwner ?? "ephemeral"}:${source}:${props.blueprint.id}:${props.blueprint.version}`} {...props} />;
}
function OwnedAdaptiveSetupFlow({ blueprint, registry, source, generate, navigate, createMutationId, now, timeZone, onBackToRole, active = true, savesToAccount = false, createsNewGoal = false, draftOwner, lockedGeneration = false, buildPaths = buildLearningPaths, buildPathsForSubmit = buildLearningPaths, scheduleForSubmit = buildPlanVersion }: AdaptiveSetupFlowProps) {
  const recoveryLock = useRef(lockedGeneration);
  useLayoutEffect(() => { recoveryLock.current = lockedGeneration; }, [lockedGeneration]);
  const failureMessage = () => recoveryLock.current ? "保存结果尚未确认，请按原设置重试。" : "Arc 未能保存计划，你仍可修改设置。";
  const [stageIndex, setStageIndex] = useState(0);
  const stage = stages[stageIndex]!;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [auditDraft, setAuditDraft] = useState(() => createSkillAuditDraft(blueprint));
  const [availabilityDraft, setAvailabilityDraft] = useState(() => createAvailabilityDraft(timeZone));
  const [targetWeeks, setTargetWeeks] = useState(18);
  const [selectedScope, setSelectedScope] = useState<"full-scope" | "target-date" | null>(null);
  const buildAttempt = useRef<{ key: string; mutationId: string } | null>(null);
  const [planningInstant, setPlanningInstant] = useState(() => now().toISOString());
  const draftSource = `adaptive:${source?.source === "research" ? `research:${source.researchRunId}` : "flagship"}:${blueprint.id}:${blueprint.version}:${registry.id}:${registry.version}`;
  const [draftReady, setDraftReady] = useState(false);
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
      setStageIndex(draft.stageIndex); setAuditDraft(draft.auditDraft); setAvailabilityDraft(draft.availabilityDraft);
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
    const saved = writeSetupDraft(draftOwner, draftSource, adaptiveDraftSchema, { stageIndex, auditDraft, availabilityDraft, targetWeeks, selectedScope, planningInstant, buildAttempt: buildAttempt.current });
    let current = true;
    queueMicrotask(() => { if (current) setDraftError(!saved); });
    return () => { current = false; };
  }, [draftReady, draftOwner, draftSource, stageIndex, auditDraft, availabilityDraft, targetWeeks, selectedScope, planningInstant]);
  const [building, setBuilding] = useState(false);
  const [newPlanConfirmed, setNewPlanConfirmed] = useState(false);
  const [buildStatus, setBuildStatus] = useState("已准备好生成计划。");
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
    if (!active || building || (createsNewGoal && !newPlanConfirmed) || !audit || !availability || !target || !targetPaths || !scopeAvailable) return;
    const epoch = lifecycle.current;
    const current = () => epoch === lifecycle.current;
    setBuilding(true); setBuildStatus("正在检查你的设置…");
    try {
      const validated = await Promise.resolve().then(() => ({
        audit: skillAuditVersionSchema.parse(audit),
        availability: availabilityVersionSchema.parse(availability),
        target: planningTargetSchema.parse(target),
      }));
      if (!current()) return;
      const scope = selectedScope ?? (targetPaths.targetDate && targetPaths.targetDate.deferredSkills.length > 0 ? "full-scope" : null);
      if (scope === "target-date" && !targetPaths.targetDate) throw new Error("Path unavailable");

      setBuildStatus("正在生成学习路径…");
      const submittedPaths = pathBuildResultSchema.parse(await buildPathsForSubmit({ blueprint, registry, ...validated, planningDate }));
      if (!current()) return;
      if (submittedPaths.fullScope.inputFingerprint !== targetPaths.fullScope.inputFingerprint
        || submittedPaths.targetDate?.inputFingerprint !== targetPaths.targetDate?.inputFingerprint) throw new Error("Path preview changed");
      const selectedPath = scope === "target-date" ? submittedPaths.targetDate : submittedPaths.fullScope;
      if (!selectedPath) throw new Error("Path unavailable");

      setBuildStatus("正在安排未来七天…");
      const schedule = await scheduleForSubmit({ path: selectedPath, registry, availability: validated.availability, planningDate, generation: "initial", baseVersionId: null, replanReason: null, completedUnitIds: new Set() });
      if (!current()) return;
      planVersionSchema.parse(schedule.plan);
      schedule.dailyUnits.forEach((unit) => dailyUnitSchema.parse(unit));

      setBuildStatus("正在保存计划…");
      const input = { ...(source ? { source } : { roleId: blueprint.id }), planningDate, ...validated, selectedScope: scope };
      const key = JSON.stringify(input);
      if (buildAttempt.current?.key !== key) buildAttempt.current = { key, mutationId: createMutationId() };
      writeSetupDraft(draftOwner, draftSource, adaptiveDraftSchema, { stageIndex, auditDraft, availabilityDraft, targetWeeks, selectedScope, planningInstant, buildAttempt: buildAttempt.current });
      const request = generatePlanningRequestSchema.parse({ mutationId: buildAttempt.current.mutationId, ...input });
      const saved = await generate(request);
      if (!current()) return;
      if (!saved) { setBuildStatus(failureMessage()); return; }
      clearSetupDrafts(draftOwner);
      setBuildStatus("计划已就绪。"); navigate("/path?created=1");
    } catch { if (current()) setBuildStatus(failureMessage()); }
    finally { setBuilding(false); }
  };

  return <section className="setup-flow adaptive-setup-flow">
    <p className="setup-progress">{String(stageIndex + 2).padStart(2, "0")} / 05 · {stageLabel[stage]}</p>
    <ol className="setup-step-names" aria-label="设置进度">{["选择目标", "技能评估", "时间安排", "目标范围", "确认创建"].map((name, index) => <li key={name} aria-current={index === stageIndex + 1 ? "step" : undefined}>{name}</li>)}</ol>
    {restored && <p className="setup-draft-notice">已恢复本岗位的设置草稿。</p>}
    {draftError && <p className="setup-draft-notice">暂时无法保存草稿，请保持页面打开。</p>}
    {draftOwner && <details className="setup-draft-options"><summary>草稿选项</summary><button className="text-action" type="button" disabled={building || lockedGeneration} onClick={() => {
      setStageIndex(0); setAuditDraft(createSkillAuditDraft(blueprint)); setAvailabilityDraft(createAvailabilityDraft(timeZone));
      setTargetWeeks(18); setSelectedScope(null); setNewPlanConfirmed(false); setRestored(false); buildAttempt.current = null;
    }}>重新填写此岗位</button></details>}
    <h1 ref={headingRef} tabIndex={-1}>{stage === "audit" ? "评估你目前的技能。" : stage === "availability" ? "安排一周可持续的时间。" : stage === "target" ? "确定时间与学习范围。" : "确认并生成学习计划。"}</h1>
    {stage === "audit" && <SkillAuditStep blueprint={blueprint} onChange={(next) => { setAuditDraft(next); setSelectedScope(null); }} value={auditDraft} />}
    {stage === "availability" && <AvailabilityStep onChange={(next) => { setAvailabilityDraft(next); setSelectedScope(null); }} planningDate={planningDate} value={availabilityDraft} />}
    {stage === "target" && audit && availability && <TargetStep blueprint={blueprint} error={targetBuild.failed ? "Arc 未能比较路径，请检查设置后重试。" : undefined} onScopeChange={setSelectedScope} onTargetChange={(weeks) => { setTargetWeeks(weeks); setSelectedScope(null); }} result={targetPaths} selectedScope={scopeAvailable ? selectedScope : null} target={targetDraft} />}
    {stage === "build" && <div className="build-ledger">
      <dl className="setup-confirmation"><div><dt>目标岗位</dt><dd>{blueprint.name}</dd></div><div><dt>每周时间</dt><dd>{availability?.weeklyMinutes} 分钟</dd></div><div><dt>目标周期</dt><dd>{targetWeeks} 周</dd></div></dl>
      <p>{lockedGeneration ? "正在恢复这次创建的原始设置。完成保存后，可在路线页调整时间。" : "确认后将生成路线与未来七天的任务；完成后可直接开始今日任务。"}</p>
      {lockedGeneration && <a className="text-action" href="/path">查看当前路线</a>}
      {savesToAccount && <p>生成后，计划会保存到你的账户；已有的本地历史记录仍保留在此设备上。</p>}
      {createsNewGoal && <label><input type="checkbox" checked={newPlanConfirmed} disabled={building}
        onChange={(event) => setNewPlanConfirmed(event.target.checked)} /> 创建新计划，并将当前计划保留在历史记录中</label>}
      {(!audit || !availability || !target || !targetPaths || !scopeAvailable) && <p role="alert">部分设置需要更新，请返回检查后再生成计划。</p>}
      <p role={buildStatus.includes("未能") || buildStatus.includes("尚未确认") ? "alert" : "status"}>{buildStatus}</p>
      <button className="setup-next" disabled={building || !audit || !availability || !target || !targetPaths || !scopeAvailable || (createsNewGoal && !newPlanConfirmed)} onClick={() => void build()} type="button">{lockedGeneration ? "重试保存原计划" : "生成学习路径"}</button>
    </div>}
    <nav className="setup-actions" aria-label="设置步骤">
      <button className="setup-back text-action" disabled={building || lockedGeneration} onClick={back} type="button">返回</button>
      {stage !== "build" && <button className="setup-next" disabled={!canContinue} onClick={advance} type="button">继续</button>}
    </nav>
  </section>;
}
