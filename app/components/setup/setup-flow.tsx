"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { LearnerLevel, SetupAnswers } from "../../lib/demo-store";
import type { ResearchPlanningData } from "../../contracts/research";
import { flagshipRole } from "../../data/flagship-role";
import { claimGuestSetupDraft, clearSetupDrafts, legacyDraftSchema, readSetupDraft, writeSetupDraft, type LegacySetupDraft } from "./setup-draft";
import { getRoleDisplayName } from "../../lib/personalized-plan";
import { setupStepNames, useSetupNavigation } from "./setup-navigation";
import { updatePageQuery } from "../../lib/use-page-query";

export type SetupSource = { source: "flagship"; roleId: "ai-native-full-stack-engineer" } | { source: "research"; researchRunId: string };
type AdaptiveControls = { active: boolean; onBackToRole: () => void; source: SetupSource; planningData: ResearchPlanningData | null };
type ResearchControls = { role: string; onUseResearch: (runId: string, data: ResearchPlanningData) => void; onFlagship: () => void };

const flagshipRoleId = "ai-native-full-stack-engineer";

export function isFlagshipRoleInput(role: string): boolean {
  // Match only known aliases using the same normalization as research input.
  const normalize = (value: string) => value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
  return [flagshipRoleId, flagshipRole.name, getRoleDisplayName(flagshipRoleId)]
    .some((alias) => normalize(alias) === normalize(role));
}

function isFiniteIntegerInRange(value: number, minimum: number, maximum: number) {
  return Number.isFinite(value) && Number.isInteger(value) && value >= minimum && value <= maximum;
}

type SetupFlowProps = {
  onComplete: (answers: SetupAnswers) => void | Promise<void>;
  renderAdaptive?: (controls: AdaptiveControls) => ReactNode;
  signedIn?: boolean; researchEligible?: boolean; researchRecoveryAvailable?: boolean;
  renderResearch?: (controls: ResearchControls) => ReactNode;
  onResearchActiveChange?: (active: boolean) => void;
  onRoleChange?: () => void;
  draftOwner?: string;
  recoveredResearch?: { runId: string; planningData: ResearchPlanningData } | null;
  creationMode?: boolean;
  basicCreationAllowed?: boolean;
  syncUrl?: boolean;
  researchChecking?: boolean;
  onRetryResearchAvailability?: () => void;
};
export function SetupFlow(props: SetupFlowProps) {
  return <OwnedSetupFlow key={props.draftOwner ?? "ephemeral"} {...props} />;
}
function OwnedSetupFlow({ onComplete, renderAdaptive, signedIn = false, researchEligible = false, researchRecoveryAvailable = false, renderResearch, onResearchActiveChange, onRoleChange, draftOwner, recoveredResearch, creationMode = false, basicCreationAllowed = true, syncUrl = false, researchChecking = false, onRetryResearchAvailability }: SetupFlowProps) {
  const [step, setStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const [adaptiveSelected, setAdaptiveSelected] = useState(false);
  const [adaptiveStarted, setAdaptiveStarted] = useState(false);
  const [selection, setSelection] = useState<{ source: SetupSource; planningData: ResearchPlanningData | null }>({ source: { source: "flagship", roleId: flagshipRoleId }, planningData: null });
  const previousStep = useRef(step);
  const questionRef = useRef<HTMLHeadingElement>(null);
  const [customRole, setCustomRole] = useState("");
  const [answers, setAnswers] = useState<SetupAnswers>({
    roleId: flagshipRoleId,
    level: "beginner",
    weeklyMinutes: 420,
    targetWeeks: 18,
  });

  const [draftReady, setDraftReady] = useState(!draftOwner);
  const [restored, setRestored] = useState(false);
  const [guestAvailable, setGuestAvailable] = useState(false);
  const [restoringSource, setRestoringSource] = useState<SetupSource | null>(null);
  const [draftError, setDraftError] = useState(false);
  const [draftEpoch, setDraftEpoch] = useState(0);
  const restore = (draft: LegacySetupDraft) => {
    setStep(draft.source.source === "research" ? 0 : draft.step); setFurthestStep(draft.furthestStep ?? draft.step); setCustomRole(draft.customRole); setAnswers(draft.answers); setRestored(true);
    if (draft.source.source === "flagship") {
      setSelection({ source: draft.source, planningData: null });
      setAdaptiveStarted(draft.adaptiveStarted); setAdaptiveSelected(draft.adaptiveSelected);
    } else if (draft.adaptiveStarted) setRestoringSource(draft.source);
  };
  useEffect(() => {
    if (!draftOwner) return;
    let current = true;
    queueMicrotask(() => {
      if (!current) return;
      const draft = readSetupDraft(draftOwner, "flow", legacyDraftSchema);
      if (draft) restore(draft);
      setGuestAvailable(Boolean(draftOwner !== "guest" && readSetupDraft("guest", "flow", legacyDraftSchema)));
      setDraftReady(true);
    });
    return () => { current = false; };
  }, [draftOwner]);
  useEffect(() => {
    if (restoringSource?.source !== "research" || recoveredResearch?.runId !== restoringSource.researchRunId) return;
    let current = true;
    queueMicrotask(() => {
      if (!current) return;
      setSelection({ source: restoringSource, planningData: recoveredResearch.planningData });
      setAdaptiveStarted(true); setAdaptiveSelected(true); setRestoringSource(null);
    });
    return () => { current = false; };
  }, [recoveredResearch, restoringSource]);
  useEffect(() => {
    if (!draftReady || restoringSource) return;
    const saved = writeSetupDraft(draftOwner, "flow", legacyDraftSchema, { step, furthestStep, customRole, answers, source: selection.source, adaptiveSelected, adaptiveStarted });
    let current = true;
    queueMicrotask(() => { if (current) setDraftError(!saved); });
    return () => { current = false; };
  }, [draftReady, draftOwner, step, furthestStep, customRole, answers, selection.source, adaptiveSelected, adaptiveStarted, restoringSource]);
  const resetDraft = () => {
    clearSetupDrafts(draftOwner); navigateStep(0, true); setFurthestStep(0); setCustomRole("");
    setAnswers({ roleId: flagshipRoleId, level: "beginner", weeklyMinutes: 420, targetWeeks: 18 });
    setSelection({ source: { source: "flagship", roleId: flagshipRoleId }, planningData: null });
    setAdaptiveSelected(false); setAdaptiveStarted(false); setRestoringSource(null); setRestored(false);
    setDraftEpoch((value) => value + 1);
  };

  useEffect(() => {
    let current = true;
    queueMicrotask(() => { if (current && !basicCreationAllowed) setStep(0); });
    return () => { current = false; };
  }, [basicCreationAllowed]);
  const advance = () => {
    if (!basicCreationAllowed) return;
    if (step === 0 && !hasCustomRole && renderAdaptive) { setSelection({ source: { source: "flagship", roleId: flagshipRoleId }, planningData: null }); setAdaptiveStarted(true); setAdaptiveSelected(true); if (syncUrl) updatePageQuery({ step: "foundation" }); return; }
    const next = Math.min(step + 1, 3); setFurthestStep((current) => Math.max(current, next)); navigateStep(next);
  };

  const selectFlagshipRole = () => {
    setRestoringSource(null); onRoleChange?.();
    if (selection.source.source === "research") { setAdaptiveStarted(false); setSelection({ source: { source: "flagship", roleId: flagshipRoleId }, planningData: null }); }
    setFurthestStep(0);
    setCustomRole("");
    setAnswers((current) => ({ ...current, roleId: flagshipRoleId }));
  };

  const updateCustomRole = (value: string) => {
    setRestoringSource(null); onRoleChange?.();
    if (selection.source.source === "research") { setAdaptiveStarted(false); setSelection({ source: { source: "flagship", roleId: flagshipRoleId }, planningData: null }); }
    setFurthestStep(0);
    setCustomRole(value);
    setAnswers((current) => ({ ...current, roleId: value.trim() || flagshipRoleId }));
  };

  const hasCustomRole = customRole.trim().length > 0;
  const canResearchRole = hasCustomRole && !isFlagshipRoleInput(customRole);
  const researchActive = step === 0 && !adaptiveSelected;
  useLayoutEffect(() => { onResearchActiveChange?.(researchActive); }, [onResearchActiveChange, researchActive]);
  const useResearch = (researchRunId: string, planningData: ResearchPlanningData) => {
    if (!signedIn || !renderAdaptive) return;
    setSelection({ source: { source: "research", researchRunId }, planningData });
    setAdaptiveStarted(true); setAdaptiveSelected(true); if (syncUrl) updatePageQuery({ step: "foundation" });
  };
  const weeklyMinutesValid = isFiniteIntegerInRange(answers.weeklyMinutes, 30, 2400);
  const targetWeeksValid = isFiniteIntegerInRange(answers.targetWeeks, 4, 52);
  const canResumeAdaptive = adaptiveStarted && Boolean(renderAdaptive) && (selection.source.source === "research" ? Boolean(selection.planningData) : !hasCustomRole);
  const navigateStep = useSetupNavigation({ enabled: syncUrl, ready: draftReady && !restoringSource, active: !adaptiveSelected,
    currentStep: step, maximumStep: canResumeAdaptive ? 3 : !basicCreationAllowed ? 0 : Math.min(furthestStep, weeklyMinutesValid ? 3 : 2),
    onNavigate: (next) => { if (next > 0 && canResumeAdaptive) setAdaptiveSelected(true); else setStep(next); },
  });

  useEffect(() => {
    if (!adaptiveSelected && (previousStep.current !== step || step === 0)) {
      questionRef.current?.focus();
      previousStep.current = step;
    }
  }, [adaptiveSelected, step]);

  return (
    <>
    {!adaptiveSelected && draftOwner && <div className="setup-draft-bar">
      {restored && <p>已恢复上次的设置草稿，可继续或重新开始。</p>}
      {guestAvailable && <div><p>此设备有访客草稿。由你选择是否用于当前账户。</p><button className="text-action" type="button" onClick={() => {
        const draft = claimGuestSetupDraft(draftOwner); if (draft) { restore(draft); setGuestAvailable(false); setDraftEpoch((value) => value + 1); }
      }}>继续访客草稿</button></div>}
      <details><summary>草稿选项</summary><button className="text-action" type="button" onClick={resetDraft}>重新开始设置</button><p>只清除本次设置草稿，已保存计划与岗位研究仍会保留。</p></details>
      {draftError && <p>暂时无法保存草稿，请保持此页面打开后完成设置。</p>}
    </div>}
    <section className="setup-flow" hidden={adaptiveSelected}>
      <p className="setup-progress">{String(step + 1).padStart(2, "0")} / 04</p>
      <ol className="setup-step-names" aria-label="设置进度">{setupStepNames.map((name, index) => <li key={name} aria-current={index === step ? "step" : undefined}>{name}</li>)}</ol>
      {!basicCreationAllowed && <p className="setup-intent">已有计划时，请先研究一个新岗位，再使用研究结果创建新目标。</p>}
      {creationMode && <p className="setup-intent">创建新目标 · 保存前会再次确认；有当前计划时，会说明历史归档方式。</p>}

      {step === 0 && (
        <>
          <h1 ref={questionRef} tabIndex={-1}>你想学习哪个岗位或方向？</h1>
          {basicCreationAllowed && <button
            aria-pressed={!hasCustomRole}
            className={hasCustomRole ? "answer-choice" : "answer-choice is-selected"}
            onClick={selectFlagshipRole}
            type="button"
          >
            AI 原生全栈工程师
          </button>}
          <label className="answer-field">
            {basicCreationAllowed ? "或输入任意岗位" : "输入你想研究的新岗位"}
            <input
              aria-label="自定义岗位"
              onChange={(event) => updateCustomRole(event.target.value)}
              maxLength={basicCreationAllowed ? 200 : 160}
              placeholder="例如：数据产品经理"
              value={customRole}
            />
          </label>
          {hasCustomRole && basicCreationAllowed && <p className="custom-role-disclosure">{signedIn && renderResearch && canResearchRole && researchEligible
            ? "先研究岗位，可使用有来源依据的技能评估与自适应安排。直接继续将使用按时间比例分配的基础路径。"
            : signedIn && renderResearch && canResearchRole && researchRecoveryAvailable && !researchEligible
              ? "暂时无法发起新研究。直接继续将使用按时间比例分配的基础路径。"
              : <>完整技能评估与自适应安排目前需要精选岗位蓝图或可用的研究结果。此岗位将使用按时间比例分配的基础路径。</>}</p>}
          {signedIn && renderResearch && (researchRecoveryAvailable || researchEligible && canResearchRole) && renderResearch({ role: customRole.trim(), onUseResearch: useResearch, onFlagship: selectFlagshipRole })}
          {!basicCreationAllowed && <div className="setup-research-availability">
            {!researchEligible && <p role="status">{!signedIn ? "此设备已有学习计划，暂不支持将本地计划归档后创建新目标。你可以继续当前路线。" : researchChecking ? "正在检查岗位研究是否可用…" : "岗位研究暂不可用，当前无法创建新路线。你的现有计划与学习记录会继续保留。"}</p>}
            {researchEligible && (!canResearchRole || customRole.trim().length < 2) && <p>请输入至少 2 个字符的新岗位名称，研究后即可继续创建。</p>}
            {signedIn && !researchEligible && onRetryResearchAvailability && <div className="setup-actions">
              <button className="text-action" disabled={researchChecking} onClick={onRetryResearchAvailability} type="button">重新检查岗位研究</button>
            </div>}
          </div>}
        </>
      )}

      {step === 1 && (
        <>
          <h1 ref={questionRef} tabIndex={-1}>你现在处于哪个阶段？</h1>
          <div className="answer-grid">
            {(["new", "beginner", "intermediate", "advanced"] as LearnerLevel[]).map((level) => (
              <button
                className={answers.level === level ? "answer-choice is-selected" : "answer-choice"}
                key={level}
                aria-pressed={answers.level === level}
                onClick={() => setAnswers((current) => ({ ...current, level }))}
                type="button"
              >
                {{ new: "零基础", beginner: "初学", intermediate: "进阶", advanced: "熟练" }[level]}
              </button>
            ))}
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h1 ref={questionRef} tabIndex={-1}>你每周真正拥有多少时间？</h1>
          <label className="answer-field">
            每周分钟数
            <input
              aria-label="每周分钟数"
              aria-describedby={weeklyMinutesValid ? undefined : "weekly-minutes-error"}
              aria-invalid={!weeklyMinutesValid}
              max="2400"
              min="30"
              onChange={(event) => setAnswers((current) => ({ ...current, weeklyMinutes: Number(event.target.value) }))}
              type="number"
              step="1"
              value={answers.weeklyMinutes}
            />
          </label>
          {!weeklyMinutesValid && <p id="weekly-minutes-error" role="alert">请输入 30 至 2400 的整数。</p>}
        </>
      )}

      {step === 3 && (
        <>
          <h1 ref={questionRef} tabIndex={-1}>确认你的学习路线。</h1>
          <dl className="setup-confirmation"><div><dt>学习目标</dt><dd>{getRoleDisplayName(answers.roleId)}</dd></div><div><dt>每周时间</dt><dd>{answers.weeklyMinutes} 分钟</dd></div></dl>
          <label className="answer-field">
            目标周数
            <input
              aria-label="目标周数"
              aria-describedby={targetWeeksValid ? undefined : "target-weeks-error"}
              aria-invalid={!targetWeeksValid}
              max="52"
              min="4"
              onChange={(event) => setAnswers((current) => ({ ...current, targetWeeks: Number(event.target.value) }))}
              type="number"
              step="1"
              value={answers.targetWeeks}
            />
          </label>
          {!targetWeeksValid && <p id="target-weeks-error" role="alert">请输入 4 至 52 的整数。</p>}
        </>
      )}
      {basicCreationAllowed && <nav className="setup-actions setup-primary-actions" aria-label="设置步骤">
        {step > 0 && <button className="setup-back text-action" onClick={() => navigateStep(step - 1)} type="button">返回</button>}
        {step < 3 ? <button className="setup-next" disabled={step === 2 && !weeklyMinutesValid} onClick={advance} type="button">继续</button>
          : <button className="setup-next" disabled={!targetWeeksValid || !weeklyMinutesValid} onClick={() => void onComplete(answers)} type="button">创建路线</button>}
      </nav>}
    </section>
    {renderAdaptive && adaptiveStarted && <div key={`${draftEpoch}:${selection.source.source === "research" ? selection.source.researchRunId : "flagship"}`} hidden={!adaptiveSelected}>{renderAdaptive({ ...selection, active: adaptiveSelected, onBackToRole: () => { setAdaptiveSelected(false); navigateStep(0); } })}</div>}
    </>
  );
}
