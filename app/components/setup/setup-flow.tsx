"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { LearnerLevel, SetupAnswers } from "../../lib/demo-store";
import type { ResearchPlanningData } from "../../contracts/research";
import { flagshipRole } from "../../data/flagship-role";
import { getRoleDisplayName } from "../../lib/personalized-plan";

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

export function SetupFlow({ onComplete, renderAdaptive, signedIn = false, researchEligible = false, researchRecoveryAvailable = false, renderResearch, onResearchActiveChange, onRoleChange }: {
  onComplete: (answers: SetupAnswers) => void | Promise<void>;
  renderAdaptive?: (controls: AdaptiveControls) => ReactNode;
  signedIn?: boolean; researchEligible?: boolean; researchRecoveryAvailable?: boolean;
  renderResearch?: (controls: ResearchControls) => ReactNode;
  onResearchActiveChange?: (active: boolean) => void;
  onRoleChange?: () => void;
}) {
  const [step, setStep] = useState(0);
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

  const advance = () => {
    if (step === 0 && !hasCustomRole && renderAdaptive) { setSelection({ source: { source: "flagship", roleId: flagshipRoleId }, planningData: null }); setAdaptiveStarted(true); setAdaptiveSelected(true); return; }
    setStep((current) => Math.min(current + 1, 3));
  };

  const selectFlagshipRole = () => {
    onRoleChange?.();
    setCustomRole("");
    setAnswers((current) => ({ ...current, roleId: flagshipRoleId }));
  };

  const updateCustomRole = (value: string) => {
    onRoleChange?.();
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
    setAdaptiveStarted(true); setAdaptiveSelected(true);
  };
  const weeklyMinutesValid = isFiniteIntegerInRange(answers.weeklyMinutes, 30, 2400);
  const targetWeeksValid = isFiniteIntegerInRange(answers.targetWeeks, 4, 52);

  useEffect(() => {
    if (!adaptiveSelected && (previousStep.current !== step || step === 0)) {
      questionRef.current?.focus();
      previousStep.current = step;
    }
  }, [adaptiveSelected, step]);

  return (
    <>
    <section className="setup-flow" hidden={adaptiveSelected}>
      <p className="setup-progress">{String(step + 1).padStart(2, "0")} / {step === 0 && renderAdaptive && !hasCustomRole ? "05" : "04"}</p>

      {step === 0 && (
        <>
          <h1 ref={questionRef} tabIndex={-1}>你想成为怎样的构建者？</h1>
          <button
            aria-pressed={!hasCustomRole}
            className={hasCustomRole ? "answer-choice" : "answer-choice is-selected"}
            onClick={selectFlagshipRole}
            type="button"
          >
            AI 原生全栈工程师
          </button>
          <label className="answer-field">
            或输入任意岗位
            <input
              aria-label="自定义岗位"
              onChange={(event) => updateCustomRole(event.target.value)}
              placeholder="例如：数据产品经理"
              value={customRole}
            />
          </label>
          {hasCustomRole && <p className="custom-role-disclosure">{signedIn && renderResearch && canResearchRole && researchEligible
            ? "先研究岗位，可使用有来源依据的技能评估与自适应安排。直接继续将使用按时间比例分配的基础路径。"
            : signedIn && renderResearch && canResearchRole && researchRecoveryAvailable && !researchEligible
              ? "暂时无法发起新研究。直接继续将使用按时间比例分配的基础路径。"
              : <>完整技能评估与自适应安排目前需要精选岗位蓝图或可用的研究结果。此岗位将使用按时间比例分配的基础路径。</>}</p>}
          {signedIn && renderResearch && (researchRecoveryAvailable || researchEligible && canResearchRole) && renderResearch({ role: customRole.trim(), onUseResearch: useResearch, onFlagship: selectFlagshipRole })}
          <button className="setup-next" onClick={advance} type="button">继续</button>
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
          <button className="setup-next" onClick={advance} type="button">继续</button>
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
          <button className="setup-next" disabled={!weeklyMinutesValid} onClick={advance} type="button">继续</button>
        </>
      )}

      {step === 3 && (
        <>
          <h1 ref={questionRef} tabIndex={-1}>你希望用多少周抵达目标？</h1>
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
          <button className="setup-next" disabled={!targetWeeksValid} onClick={() => void onComplete(answers)} type="button">生成学习路径</button>
        </>
      )}
    </section>
    {renderAdaptive && adaptiveStarted && <div key={selection.source.source === "research" ? selection.source.researchRunId : "flagship"} hidden={!adaptiveSelected}>{renderAdaptive({ ...selection, active: adaptiveSelected, onBackToRole: () => setAdaptiveSelected(false) })}</div>}
    </>
  );
}
