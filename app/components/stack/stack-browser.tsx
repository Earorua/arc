"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { LearningResource, RoleBlueprint } from "../../contracts/intelligence";
import type { SkillEvidenceProjection, SkillEvidenceStatus } from "../../contracts/proof-ledger";
import type { SkillCategory } from "../../domain/learning";
import { filterSkills } from "../../lib/skill-map";

export type ProofEvidenceSummary = Readonly<{
  proofId: string;
  versionId: string;
  title: string;
}>;

type StackBrowserProps = {
  blueprint: RoleBlueprint;
  projections: readonly SkillEvidenceProjection[];
  evidence: readonly ProofEvidenceSummary[];
};

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

const formatLabels: Record<LearningResource["format"], string> = {
  course: "Course",
  documentation: "Documentation",
  guide: "Guide",
  practice: "Practice",
  reference: "Reference",
};

const languageLabels: Record<LearningResource["language"], string> = {
  en: "English",
  "zh-CN": "Chinese (Simplified)",
};

const costLabels: Record<LearningResource["cost"], string> = {
  free: "Free",
  mixed: "Free and paid",
  paid: "Paid",
};

const sourceTierLabels: Record<LearningResource["sourceTier"], string> = {
  community: "Community source",
  institutional: "Institutional source",
  practitioner: "Practitioner source",
  primary: "Primary source",
};

const statusLabels: Record<SkillEvidenceStatus, string> = {
  exploring: "Exploring",
  practicing: "Practicing",
  demonstrated: "Demonstrated",
  verified: "Verified",
};

const importanceLabels = { core: "Core", strong: "Strong", advantage: "Advantage" } as const;

export function StackBrowser({ blueprint, evidence, projections }: StackBrowserProps) {
  const [category, setCategory] = useState<SkillCategory | "all">("all");
  const { evidenceByVersion, projectionBySkill, resourcesById, skillNames } = useMemo(() => ({
    evidenceByVersion: new Map(evidence.map((item) => [item.versionId, item])),
    projectionBySkill: new Map(projections.filter(({ audience }) => audience === "internal").map((projection) => [projection.skillId, projection])),
    resourcesById: new Map(blueprint.resources.map((resource) => [resource.id, resource])),
    skillNames: new Map(blueprint.skills.map((skill) => [skill.id, skill.name])),
  }), [blueprint, evidence, projections]);
  const filteredSkills = filterSkills(blueprint.skills, category);

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
          const projection = projectionBySkill.get(skill.id) ?? emptyProjection(skill.id);
          const strongest = projection.strongestVersionId
            ? evidenceByVersion.get(projection.strongestVersionId) ?? null
            : null;
          const completedLabel = `${projection.completedUnitIds.length} completed ${projection.completedUnitIds.length === 1 ? "unit" : "units"}`;
          const next = nextAction(projection.status, projection.strongestProofId);
          return <article key={skill.id}>
            <header className="skill-summary">
              <p className="skill-kicker">{skill.category} · {skill.importance}</p>
              <h2>{skill.name}</h2>
              <p className="skill-why">{skill.why}</p>
            </header>
            <div className="skill-detail">
              <dl className="skill-facts">
                <div>
                  <dt>Learner status</dt>
                  <dd><strong className={`skill-status skill-status-${projection.status}`}>{statusLabels[projection.status]}</strong></dd>
                </div>
                <div>
                  <dt>Role importance</dt>
                  <dd>{importanceLabels[skill.importance]}</dd>
                </div>
                <div>
                  <dt>Completed work</dt>
                  <dd>{completedLabel}</dd>
                </div>
                <div>
                  <dt>Strongest proof</dt>
                  <dd className="skill-proof-link">{projection.strongestProofId
                    ? strongest && strongest.proofId === projection.strongestProofId
                      ? <Link href={`/proof?proof=${encodeURIComponent(strongest.proofId)}`}>{strongest.title}</Link>
                      : "Evidence unavailable"
                    : "None yet"}</dd>
                </div>
                <div>
                  <dt>Latest use</dt>
                  <dd>{projection.latestUsedAt ? formatLatestUse(projection.latestUsedAt) : "Not recorded"}</dd>
                </div>
                <div>
                  <dt>Next action</dt>
                  <dd><Link href={next.href}>{next.label}</Link></dd>
                </div>
                <div>
                  <dt>Claim confidence</dt>
                  <dd>{Math.round(skill.confidence * 100)}% claim confidence</dd>
                </div>
                <div>
                  <dt>Prerequisites</dt>
                  <dd>
                    {skill.prerequisiteIds.length > 0
                      ? skill.prerequisiteIds.map((id) => skillNames.get(id) ?? id).join(", ")
                      : "None"}
                  </dd>
                </div>
              </dl>

              <section className="mastery-block">
                <h3>Mastery criteria</h3>
                <ol aria-label="Mastery criteria">
                  {skill.masteryCriteria.map((criterion, index) => (
                    <li key={`${skill.id}-mastery-${index}`}>{criterion}</li>
                  ))}
                </ol>
              </section>

              <section className="resource-block">
                <h3>Learning resources</h3>
                <ul aria-label="Learning resources" className="resource-list">
                  {skill.resourceIds.map((resourceId, index) => {
                    const resource = resourcesById.get(resourceId);

                    if (!resource) {
                      return (
                        <li
                          className="resource-unavailable"
                          key={`${skill.id}-resource-${resourceId}-${index}`}
                        >
                          Resource metadata unavailable
                        </li>
                      );
                    }

                    return (
                      <li
                        className="resource-row"
                        key={`${skill.id}-resource-${resource.id}-${index}`}
                      >
                        <div className="resource-reference">
                          <a
                            href={resource.url}
                            lang={resource.language}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {resource.title}
                          </a>
                          <span>{resource.provider}</span>
                        </div>
                        <dl className="resource-metadata">
                          <div><dt>Format</dt><dd>{formatLabels[resource.format]}</dd></div>
                          <div><dt>Language</dt><dd>{languageLabels[resource.language]}</dd></div>
                          <div><dt>Cost</dt><dd>{costLabels[resource.cost]}</dd></div>
                          <div><dt>Source tier</dt><dd>{sourceTierLabels[resource.sourceTier]}</dd></div>
                          <div><dt>Freshness</dt><dd>Verified {resource.lastVerifiedAt}</dd></div>
                        </dl>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>
          </article>;
        })}
      </div>
    </section>
  );
}

function emptyProjection(skillId: string): SkillEvidenceProjection {
  return {
    skillId,
    audience: "internal",
    status: "exploring",
    completedUnitIds: [],
    strongestProofId: null,
    strongestVersionId: null,
    latestUsedAt: null,
  };
}

function nextAction(status: SkillEvidenceStatus, proofId: string | null) {
  if (status === "exploring") return { label: "Start Today", href: "/today" };
  if (status === "practicing") return { label: "Continue Today", href: "/today" };
  if (status === "demonstrated") return { label: "Add stronger proof", href: "/proof" };
  return { label: "Maintain evidence", href: proofId ? `/proof?proof=${encodeURIComponent(proofId)}` : "/proof" };
}

function formatLatestUse(value: string): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}
