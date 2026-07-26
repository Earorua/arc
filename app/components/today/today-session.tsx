"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { LearningUnit } from "../../domain/learning";

export function TodaySession({ onComplete, unit }: { onComplete: (unit: LearningUnit) => void; unit: LearningUnit }) {
  const [done, setDone] = useState<string[]>([]);
  const ready = done.length === unit.steps.length;

  const toggleStep = (id: string) => {
    setDone((current) => current.includes(id)
      ? current.filter((doneId) => doneId !== id)
      : [...current, id]);
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
            <button onClick={() => onComplete(unit)} type="button">Complete & move to Proof</button>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
