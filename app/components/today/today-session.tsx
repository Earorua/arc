"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { LearningUnit } from "../../domain/learning";

type TodaySessionProps = { onComplete: (unit: LearningUnit) => void; unit: LearningUnit };

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

  const complete = () => {
    if (completionStarted.current) return;
    completionStarted.current = true;
    setIsCompleting(true);
    onComplete(unit);
  };

  return (
    <section className="today-session">
      <p className="eyebrow" lang="en">Tuesday · Build session</p>
      <div className="time-budget">
        <strong>{unit.minutes}</strong>
        <span lang="en">minutes</span>
      </div>
      <h1>{unit.title}</h1>

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

      <AnimatePresence>
        {ready && (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="deliverable-bar"
            initial={{ opacity: 0, y: 12 }}
            lang="en"
          >
            <span>Deliverable · {unit.deliverable}</span>
            <button disabled={isCompleting} onClick={complete} type="button">Complete & move to Proof</button>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
