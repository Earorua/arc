"use client";

import { useState } from "react";
import type { LearnerLevel, SetupAnswers } from "../../lib/demo-store";

const flagshipRoleId = "ai-native-full-stack-engineer";

export function SetupFlow({ onComplete }: { onComplete: (answers: SetupAnswers) => void }) {
  const [step, setStep] = useState(0);
  const [customRole, setCustomRole] = useState("");
  const [answers, setAnswers] = useState<SetupAnswers>({
    roleId: flagshipRoleId,
    level: "beginner",
    weeklyMinutes: 420,
    targetWeeks: 18,
  });

  const advance = () => setStep((current) => Math.min(current + 1, 3));

  const selectFlagshipRole = () => {
    setCustomRole("");
    setAnswers((current) => ({ ...current, roleId: flagshipRoleId }));
  };

  const updateCustomRole = (value: string) => {
    setCustomRole(value);
    setAnswers((current) => ({ ...current, roleId: value.trim() || flagshipRoleId }));
  };

  return (
    <section className="setup-flow" aria-live="polite">
      <p className="setup-progress">{String(step + 1).padStart(2, "0")} / 04</p>

      {step === 0 && (
        <>
          <h1>你想成为怎样的构建者？</h1>
          <button
            className={customRole ? "answer-choice" : "answer-choice is-selected"}
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
          <button className="setup-next" lang="en" onClick={advance} type="button">Continue</button>
        </>
      )}

      {step === 1 && (
        <>
          <h1>你现在处于哪个阶段？</h1>
          <div className="answer-grid">
            {(["new", "beginner", "intermediate", "advanced"] as LearnerLevel[]).map((level) => (
              <button
                className={answers.level === level ? "answer-choice is-selected" : "answer-choice"}
                key={level}
                lang="en"
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
          <h1>你每周真正拥有多少时间？</h1>
          <label className="answer-field" lang="en">
            Weekly minutes
            <input
              aria-label="Weekly minutes"
              max="2400"
              min="30"
              onChange={(event) => setAnswers((current) => ({ ...current, weeklyMinutes: Number(event.target.value) }))}
              type="number"
              value={answers.weeklyMinutes}
            />
          </label>
          <button className="setup-next" lang="en" onClick={advance} type="button">Continue</button>
        </>
      )}

      {step === 3 && (
        <>
          <h1>你希望用多少周抵达目标？</h1>
          <label className="answer-field" lang="en">
            Target weeks
            <input
              aria-label="Target weeks"
              max="52"
              min="4"
              onChange={(event) => setAnswers((current) => ({ ...current, targetWeeks: Number(event.target.value) }))}
              type="number"
              value={answers.targetWeeks}
            />
          </label>
          <button className="setup-next" lang="en" onClick={() => onComplete(answers)} type="button">Build my path</button>
        </>
      )}
    </section>
  );
}
