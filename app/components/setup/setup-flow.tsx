"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LearnerLevel, SetupAnswers } from "../../lib/demo-store";

const flagshipRoleId = "ai-native-full-stack-engineer";

function isFiniteIntegerInRange(value: number, minimum: number, maximum: number) {
  return Number.isFinite(value) && Number.isInteger(value) && value >= minimum && value <= maximum;
}

export function SetupFlow({ onComplete, renderAdaptive }: { onComplete: (answers: SetupAnswers) => void | Promise<void>; renderAdaptive?: (controls: { active: boolean; onBackToRole: () => void }) => ReactNode }) {
  const [step, setStep] = useState(0);
  const [adaptiveSelected, setAdaptiveSelected] = useState(false);
  const [adaptiveStarted, setAdaptiveStarted] = useState(false);
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
    if (step === 0 && !hasCustomRole && renderAdaptive) { setAdaptiveStarted(true); setAdaptiveSelected(true); return; }
    setStep((current) => Math.min(current + 1, 3));
  };

  const selectFlagshipRole = () => {
    setCustomRole("");
    setAnswers((current) => ({ ...current, roleId: flagshipRoleId }));
  };

  const updateCustomRole = (value: string) => {
    setCustomRole(value);
    setAnswers((current) => ({ ...current, roleId: value.trim() || flagshipRoleId }));
  };

  const hasCustomRole = customRole.trim().length > 0;
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
      <p className="setup-progress">{String(step + 1).padStart(2, "0")} / 04</p>

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
          {hasCustomRole && <p className="custom-role-disclosure">Full skill audit and adaptive scheduling currently require Arc&apos;s reviewed AI-Native Full-Stack Engineer blueprint. This custom role will keep the proportional v7 path.</p>}
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
    {renderAdaptive && adaptiveStarted && <div hidden={!adaptiveSelected}>{renderAdaptive({ active: adaptiveSelected, onBackToRole: () => setAdaptiveSelected(false) })}</div>}
    </>
  );
}
