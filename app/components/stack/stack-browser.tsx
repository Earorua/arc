"use client";

import { useState } from "react";
import type { SkillCategory, SkillNode } from "../../domain/learning";
import { filterSkills } from "../../lib/skill-map";

const categories: ReadonlyArray<readonly [SkillCategory | "all", string]> = [
  ["all", "All"],
  ["foundations", "Foundations"],
  ["frontend", "Frontend"],
  ["backend", "Backend"],
  ["data", "Data"],
  ["quality", "Quality"],
  ["cloud", "Cloud"],
  ["ai", "AI"],
  ["product", "Product"],
];

export function StackBrowser({ skills }: { skills: ReadonlyArray<SkillNode> }) {
  const [category, setCategory] = useState<SkillCategory | "all">("all");
  const filteredSkills = filterSkills(skills, category);

  return (
    <section lang="en">
      <div className="stack-filters" role="group" aria-label="Skill categories">
        {categories.map(([value, label]) => (
          <button
            aria-pressed={category === value}
            key={value}
            onClick={() => setCategory(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="skill-list">
        {filteredSkills.map((skill) => {
          const source = skill.sources[0];

          return (
            <article key={skill.id}>
              <div>
                <p>{skill.category} · {skill.importance}</p>
                <h2>{skill.name}</h2>
                <span>{skill.why}</span>
              </div>
              <dl>
                <div><dt>Confidence</dt><dd>{Math.round(skill.confidence * 100)}%</dd></div>
                <div>
                  <dt>Source</dt>
                  <dd>{source ? <a href={source.url}>{source.title}</a> : "Source unavailable"}</dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
    </section>
  );
}
