"use client";

import { useRef, useState } from "react";
import type { LearningUnit } from "../../domain/learning";

type TodaySessionProps = { onComplete: (unit: LearningUnit) => boolean | Promise<boolean>; unit: LearningUnit };

export function TodaySession(props: TodaySessionProps) {
  return <StatefulTodaySession key={props.unit.id} {...props} />;
}

function StatefulTodaySession({ onComplete, unit }: TodaySessionProps) {
  const [done, setDone] = useState<string[]>([]);
  const [isCompleting, setIsCompleting] = useState(false);
  const completionStarted = useRef(false);
  const ready = unit.steps.length > 0 && unit.steps.every((step) => done.includes(step.id));

  const toggleStep = (id: string) => {
    setDone((current) => current.includes(id)
      ? current.filter((doneId) => doneId !== id)
      : [...current, id]);
  };

  const complete = async () => {
    if (completionStarted.current) return;
    completionStarted.current = true;
    setIsCompleting(true);
    const completed = await onComplete(unit);

    if (!completed) {
      completionStarted.current = false;
      setIsCompleting(false);
    }
  };

  return (
    <section className="today-session" lang="zh-CN">
      <p className="eyebrow">今日学习 · 主要任务</p>
      <div className="time-budget">
        <strong>{unit.minutes}</strong>
        <span>分钟</span>
      </div>
      <h1>{unit.title}</h1>
      <section className="today-deliverable"><h2>本次交付</h2><p>{unit.deliverable}</p></section>

      <div className="task-steps">
        {unit.steps.map((step, index) => (
          <label key={step.id}>
            <input
              aria-label={step.label}
              checked={done.includes(step.id)}
              onChange={() => toggleStep(step.id)}
              type="checkbox"
            />
            <span lang="en">{String(index + 1).padStart(2, "0")}</span>
            <strong>{step.label}</strong>
          </label>
        ))}
      </div>

        {ready && (
          <div className="deliverable-bar">
            <span>检查交付内容后，记录这次进度。</span>
            <button disabled={isCompleting} onClick={() => void complete()} type="button">完成任务</button>
          </div>
        )}
    </section>
  );
}
