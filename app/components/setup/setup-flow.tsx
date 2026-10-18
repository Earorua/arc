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
              aria-label="Custom role"
              onChange={(event) => updateCustomRole(event.target.value)}
              placeholder="例如：数据产品经理"
              value={customRole}
            />
          </label>
          {hasCustomRole && <p className="custom-role-disclosure">{signedIn && renderResearch && canResearchRole && researchEligible
            ? "Research this role to use a source-backed skill audit and adaptive schedule. Continue keeps the proportional v7 path."
            : signedIn && renderResearch && canResearchRole && researchRecoveryAvailable && !researchEligible
              ? "New research is currently unavailable. Continue keeps the proportional v7 path."
              : <>Full skill audit and adaptive scheduling currently require Arc&apos;s reviewed AI-Native Full-Stack Engineer blueprint. This custom role will keep the proportional v7 path.</>}</p>}
          {signedIn && renderResearch && (researchRecoveryAvailable || researchEligible && canResearchRole) && renderResearch({ role: customRole.trim(), onUseResearch: useResearch, onFlagship: selectFlagshipRole })}
          <button className="setup-next" lang="en" onClick={advance} type="button">Continue</button>
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
                lang="en"
                aria-pressed={answers.level === level}
                onClick={() => setAnswers((current) => ({ ...current, level }))}
                type="button"
              >
                {level[0].toUpperCase() + level.slice(1)}
              </button>
            ))}
          </div>
          <button className="setup-next" lang="en" onClick={advance} type="button">Continue</button>
        </>
      )}

      {step === 2 && (
        <>
          <h1 ref={questionRef} tabIndex={-1}>你每周真正拥有多少时间？</h1>
          <label className="answer-field" lang="en">
            Weekly minutes
            <input
              aria-label="Weekly minutes"
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
          {!weeklyMinutesValid && <p id="weekly-minutes-error" role="alert">Enter a whole number from 30 to 2400.</p>}
          <button className="setup-next" disabled={!weeklyMinutesValid} lang="en" onClick={advance} type="button">Continue</button>
        </>
      )}

      {step === 3 && (
        <>
          <h1 ref={questionRef} tabIndex={-1}>你希望用多少周抵达目标？</h1>
          <label className="answer-field" lang="en">
            Target weeks
            <input
              aria-label="Target weeks"
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
          {!targetWeeksValid && <p id="target-weeks-error" role="alert">Enter a whole number from 4 to 52.</p>}
          <button className="setup-next" disabled={!targetWeeksValid} lang="en" onClick={() => void onComplete(answers)} type="button">Build my path</button>
        </>
      )}
    </section>
    {renderAdaptive && adaptiveStarted && <div key={selection.source.source === "research" ? selection.source.researchRunId : "flagship"} hidden={!adaptiveSelected}>{renderAdaptive({ ...selection, active: adaptiveSelected, onBackToRole: () => setAdaptiveSelected(false) })}</div>}
    </>
  );
}
