"use client";

import Link from "next/link";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { LearningResource, RoleBlueprint } from "../../contracts/intelligence";
import type { SkillEvidenceProjection, SkillEvidenceStatus } from "../../contracts/proof-ledger";
import type { SkillCategory } from "../../domain/learning";
import type { PlanningWorkspace } from "../../contracts/planning";
import { filterSkills } from "../../lib/skill-map";
import { navigateEvidence, useEvidenceQuery } from "../../lib/evidence-navigation";
import { safeContextReturnTo, safeReturnTo } from "../../lib/navigation-context";
import { getPathProgress } from "../../lib/planning/path-progress";
import { getCurrentLearningUnit } from "../../lib/planning/current-learning-unit";
import { planningDateForInstant } from "../../lib/planning/calendar";
import "./stack-refinement.css";

export type ProofEvidenceSummary = Readonly<{
  proofId: string;
  versionId: string;
  title: string;
}>;

type StackBrowserProps = {
  blueprint: RoleBlueprint;
  projections: readonly SkillEvidenceProjection[];
  evidence: readonly ProofEvidenceSummary[];
  evidenceReady?: boolean;
  planningWorkspace?: PlanningWorkspace | null;
  ownerKey?: string;
  now?: () => Date;
};

const categories: ReadonlyArray<readonly [SkillCategory | "all", string]> = [
  ["all", "All categories"],
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
  "zh-CN": "Simplified Chinese",
};

const costLabels: Record<LearningResource["cost"], string> = {
  free: "Free",
  mixed: "Free and paid",
  paid: "Paid",
};

const sourceTierLabels: Record<LearningResource["sourceTier"], string> = {
  community: "Community",
  institutional: "Institutional",
  practitioner: "Practitioner",
  primary: "Primary",
};

const statusLabels: Record<SkillEvidenceStatus, string> = {
  exploring: "Exploring",
  practicing: "Practicing",
  demonstrated: "Demonstrated",
  verified: "Verified",
};

const importanceLabels = { core: "Core", strong: "Important", advantage: "Additional" } as const;
const systemNow = () => new Date();

export function StackBrowser({ blueprint, evidence, evidenceReady = true, projections, planningWorkspace, ownerKey, now = systemNow }: StackBrowserProps) {
  const query = useEvidenceQuery();
  const sourceReturn = safeContextReturnTo(query.get("returnTo"), "/stack");
  const origin = sourceReturn === "/stack" ? undefined : sourceReturn;
  const path = planningWorkspace?.pathVersions.find(({ id }) => id === planningWorkspace.activePathVersionId);
  const progress = planningWorkspace && path ? getPathProgress(planningWorkspace, path) : null;
  const currentUnit = planningWorkspace ? getCurrentLearningUnit(planningWorkspace, planningDateForInstant(now().toISOString(), planningWorkspace.availability.timeZone)) : null;
  const currentPhase = path?.phases.find(({ phaseId }) => phaseId === progress?.currentPhaseId);
  const currentSkillIds = new Set(path?.units.filter(({ id }) => currentPhase?.unitIds.includes(id)).map(({ skillId }) => skillId));
  const scope = currentPhase && query.get("scope") !== "all" ? "current" : "all";
  const scopedSkills = scope === "current" ? blueprint.skills.filter(({ id }) => currentSkillIds.has(id)) : blueprint.skills;
  const includeScope = Boolean(path) || query.has("scope");
  const category = categories.find(([value]) => value === query.get("category"))?.[0] ?? "all";
  const search = query.get("q") ?? "";
  const searchTerm = search.trim().toLowerCase();
  const requestedId = query.get("skill");
  const [selectedId, setSelectedId] = useState(blueprint.skills[0]?.id ?? null);
  const detailOpen = query.has("skill");
  const listPosition = useRef({ page: 0, index: 0 });
  const wasDetailOpen = useRef(detailOpen);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const indexRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const focusDetail = useRef(false);
  const focusIndex = useRef(false);
  const focusSearch = useRef(false);
  const actionRef = useRef<HTMLAnchorElement>(null);
  const evidenceRef = useRef<HTMLAnchorElement>(null);
  const storageKey = ownerKey ? `arc:stack-return:v1:${ownerKey}` : null;
  const { evidenceByVersion, projectionBySkill, resourcesById, skillNames } = useMemo(() => ({
    evidenceByVersion: new Map(evidence.map((item) => [item.versionId, item])),
    projectionBySkill: new Map(projections.filter(({ audience }) => audience === "internal").map((projection) => [projection.skillId, projection])),
    resourcesById: new Map(blueprint.resources.map((resource) => [resource.id, resource])),
    skillNames: new Map(blueprint.skills.map((skill) => [skill.id, skill.name])),
  }), [blueprint, evidence, projections]);
  const matchesSearch = (skill: RoleBlueprint["skills"][number]) =>
    skill.name.toLowerCase().includes(searchTerm) || skill.why.toLowerCase().includes(searchTerm);
  const filteredSkills = filterSkills(scopedSkills, category).filter(matchesSearch);
  const selected = requestedId !== null ? blueprint.skills.find(({ id }) => id === requestedId)
    : filteredSkills.find(({ id }) => id === selectedId) ?? filteredSkills[0];
  const returnParams = stackQuery(includeScope ? scope : null, category, search, selected?.id, origin);
  const returnHref = safeReturnTo(`/stack?${returnParams}`, "/stack");
  useLayoutEffect(() => {
    if (focusDetail.current || (detailOpen && !wasDetailOpen.current)) {
      headingRef.current?.focus();
      focusDetail.current = false;
    }
    if (focusSearch.current) {
      searchRef.current?.focus({ preventScroll: true });
      focusSearch.current = false;
      focusIndex.current = false;
    } else if (focusIndex.current || (wasDetailOpen.current && !detailOpen)) {
      const returnTarget = indexRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]') ?? searchRef.current;
      returnTarget?.focus({ preventScroll: true });
      if (indexRef.current) indexRef.current.scrollTop = listPosition.current.index;
      if (window.matchMedia("(max-width: 760px)").matches) window.scrollTo({ top: listPosition.current.page });
      focusIndex.current = false;
    }
    wasDetailOpen.current = detailOpen;
  }, [selected?.id, detailOpen, search]);

  useLayoutEffect(() => {
    if (!storageKey || !selected || !evidenceReady) return;
    const saved = readReturnPosition(storageKey, returnHref);
    if (!saved) return;
    listPosition.current = saved.list;
    const target = saved.focus === "evidence" ? evidenceRef.current : actionRef.current;
    const disclosure = target?.closest("details");
    if (disclosure) disclosure.open = true;
    (target ?? headingRef.current)?.focus({ preventScroll: true });
    if (indexRef.current) indexRef.current.scrollTop = saved.index;
    window.scrollTo({ top: saved.page });
    try { sessionStorage.removeItem(storageKey); } catch { /* Navigation still works without browser storage. */ }
  }, [storageKey, returnHref, selected, evidenceReady]);

  function rememberReturn(focus: "action" | "evidence") {
    if (!storageKey) return;
    const position = { page: window.scrollY, index: indexRef.current?.scrollTop ?? 0 };
    const saved = { href: returnHref, focus, ...position, list: detailOpen ? listPosition.current : position };
    try { sessionStorage.setItem(storageKey, JSON.stringify(saved)); } catch { /* The URL still preserves skill and filters. */ }
  }

  function proofHref(proofId: string | null) {
    const params = new URLSearchParams();
    if (proofId) params.set("proof", proofId);
    params.set("returnTo", returnHref);
    return `/proof?${params}`;
  }

  function showList() {
    focusIndex.current = true;
    if (selected) setSelectedId(selected.id);
    const next = stackQuery(includeScope ? scope : null, category, search, undefined, origin);
    navigateEvidence("/stack", next);
  }
  function selectCategory(value: SkillCategory | "all") {
    const nextSkills = filterSkills(scopedSkills, value).filter(matchesSearch);
    setSelectedId(nextSkills.find(({ id }) => id === selected?.id)?.id ?? nextSkills[0]?.id ?? null);
    navigateEvidence("/stack", stackQuery(includeScope ? scope : null, value, search, undefined, origin));
  }
  function selectScope(value: "current" | "all") {
    navigateEvidence("/stack", stackQuery(value, category, search, undefined, origin));
  }
  function updateSearch(value: string) {
    focusSearch.current = true;
    navigateEvidence("/stack", stackQuery(includeScope ? scope : null, category, value, undefined, origin), true);
  }

  return (
    <section className={`stack-browser${detailOpen ? " is-detail-open" : ""}`}>
      {origin && <Link className="text-action stack-context-return" href={origin}>{new URL(origin, "https://arc.invalid").pathname === "/today" ? "Back to Today" : "Back to previous page"}</Link>}
      <div className="stack-scope" role="group" aria-label="Skill scope">
        <button type="button" disabled={!currentPhase} aria-pressed={scope === "current"} onClick={() => selectScope("current")}>Current phase</button>
        <button type="button" aria-pressed={scope === "all"} onClick={() => selectScope("all")}>All</button>
      </div>
      <p className="stack-scope-description">{currentPhase ? `Current phase · ${currentPhase.name}` : path ? "Your current path is complete. Showing all skills." : "No path is available yet. Showing all skills."}</p>
      <div className="stack-filters" role="group" aria-label="Skill categories">
        {categories.map(([value, label]) => (
          <button
            aria-pressed={category === value}
            key={value}
            onClick={() => selectCategory(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="stack-master-detail">
        <div className="stack-index">
          <div className="stack-search">
            <label htmlFor="stack-skill-search">Search skills</label>
            <input id="stack-skill-search" ref={searchRef} type="search" placeholder="Skill name or description" value={search} onChange={(event) => updateSearch(event.target.value)} aria-controls="stack-skill-index" />
            {search && <button className="stack-search-clear text-action" type="button" onClick={() => updateSearch("")}>Clear search</button>}
          </div>
          <p className="stack-index-count">{filteredSkills.length} {filteredSkills.length === 1 ? "skill" : "skills"} · Select one to explore requirements and sources</p>
          {filteredSkills.length === 0 && <p className="stack-search-empty" role="status">{searchTerm ? "No matching skills. Clear your search or choose another category." : "No skills in this category yet."}</p>}
          <ul id="stack-skill-index" ref={indexRef} aria-label="Skill index">
            {filteredSkills.map((skill) => <li key={skill.id}>
              <button type="button" aria-label={`View ${skill.name}`} aria-controls="selected-skill-detail" aria-pressed={selected?.id === skill.id} onClick={() => {
                focusDetail.current = true;
                listPosition.current = { page: window.scrollY, index: indexRef.current?.scrollTop ?? 0 };
                setSelectedId(skill.id);
                const next = stackQuery(includeScope ? scope : null, category, search, skill.id, origin);
                navigateEvidence("/stack", next);
                if (selected?.id === skill.id && detailOpen) headingRef.current?.focus();
              }}>
                <strong>{skill.name}</strong>
                <span>{importanceLabels[skill.importance]} · {statusLabels[projectionBySkill.get(skill.id)?.status ?? "exploring"]}</span>
              </button>
            </li>)}
          </ul>
        </div>
        <div className="skill-list">
        {detailOpen && !selected && <div className="stack-unavailable" role="status">
          <h2>This skill is not in your current path</h2>
          <p>This link may belong to another path. Return to the list to view the skills and resources in your account.</p>
          <button className="text-action" onClick={showList} type="button">Back to skills</button>
        </div>}
        {(selected ? [selected] : []).map((skill) => {
          const projection = projectionBySkill.get(skill.id) ?? emptyProjection(skill.id);
          const strongest = projection.strongestVersionId
            ? evidenceByVersion.get(projection.strongestVersionId) ?? null
            : null;
          const completedLabel = `${projection.completedUnitIds.length} learning ${projection.completedUnitIds.length === 1 ? "unit" : "units"} complete`;
          const next = nextAction(skill.id, projection.status, projection.strongestProofId, currentUnit?.skillId === skill.id);
          const proofAction = next.href.startsWith("/proof");
          const nextHref = proofAction ? proofHref(projection.strongestProofId) : next.href;
          // Proof actions also remember the originating focus and scroll position.
          const showNextAction = proofAction || nextHref !== sourceReturn;
          return <article id="selected-skill-detail" key={skill.id} aria-labelledby="selected-skill-heading">
            <button className="stack-back text-action" type="button" onClick={showList}>Back to skills</button>
            <header className="skill-summary">
              <p className="skill-kicker">{categories.find(([value]) => value === skill.category)?.[1]} · {importanceLabels[skill.importance]}</p>
              <h2 id="selected-skill-heading" ref={headingRef} tabIndex={-1}>{skill.name}</h2>
              <p className="skill-why">{skill.why}</p>
            </header>
            <div className="skill-detail">
              <div className="skill-next-step">
                <p><strong className={`skill-status skill-status-${projection.status}`}>{statusLabels[projection.status]}</strong><span>{completedLabel}</span></p>
                {showNextAction && <Link className="primary-action" ref={actionRef} href={nextHref} onClick={proofAction ? () => rememberReturn("action") : undefined}>{next.label}</Link>}
              </div>
              <section className="resource-block">
                <h3>Recommended resources</h3>
                <ul aria-label="Learning resources" className="resource-list">
                  {skill.resourceIds.map((resourceId, index) => {
                    const resource = resourcesById.get(resourceId);
                    if (!resource) return <li className="resource-unavailable" key={`${resourceId}-${index}`}>Resource details are temporarily unavailable</li>;
                    return <li className="resource-row" key={`${resource.id}-${index}`}>
                      <div className="resource-reference">
                        <a href={resource.url} lang={resource.language} rel="noreferrer" target="_blank">{resource.title} <span aria-hidden="true">↗</span></a>
                        <span>{resource.provider} · {formatLabels[resource.format]}</span>
                      </div>
                      <details className="resource-audit"><summary>Resource details and source</summary>
                        <dl className="resource-metadata">
                          <div><dt>Format</dt><dd>{formatLabels[resource.format]}</dd></div>
                          <div><dt>Language</dt><dd>{languageLabels[resource.language]}</dd></div>
                          <div><dt>Cost</dt><dd>{costLabels[resource.cost]}</dd></div>
                          <div><dt>Source tier</dt><dd>{sourceTierLabels[resource.sourceTier]}</dd></div>
                          <div><dt>Last verified</dt><dd>{resource.lastVerifiedAt}</dd></div>
                        </dl>
                      </details>
                    </li>;
                  })}
                </ul>
              </section>
              <section className="mastery-block">
                <h3>Mastery criteria</h3>
                <ol aria-label="Mastery criteria">{skill.masteryCriteria.map((criterion, index) => <li key={`${skill.id}-mastery-${index}`}>{criterion}</li>)}</ol>
              </section>
              <details className="skill-audit"><summary>Skill requirements and progress</summary>
              <dl className="skill-facts">
                <div>
                  <dt>Role importance</dt>
                  <dd>{importanceLabels[skill.importance]}</dd>
                </div>
                <div>
                  <dt>Strongest proof</dt>
                  <dd className="skill-proof-link">{projection.strongestProofId
                    ? strongest && strongest.proofId === projection.strongestProofId
                      ? <Link ref={evidenceRef} href={proofHref(strongest.proofId)} onClick={() => rememberReturn("evidence")}>{strongest.title}</Link>
                      : "Proof details are temporarily unavailable"
                    : "None yet"}</dd>
                </div>
                <div>
                  <dt>Last used</dt>
                  <dd>{projection.latestUsedAt ? formatLatestUse(projection.latestUsedAt) : "Not recorded"}</dd>
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
              </details>
            </div>
          </article>;
        })}
      </div>
      </div>
    </section>
  );
}

function stackQuery(scope: "current" | "all" | null, category: SkillCategory | "all", search: string, skill?: string, origin?: string) {
  const params = new URLSearchParams();
  if (scope) params.set("scope", scope);
  if (category !== "all") params.set("category", category);
  if (search) params.set("q", search);
  if (skill) params.set("skill", skill);
  if (origin) params.set("returnTo", origin);
  return params;
}

type ReturnPosition = { href: string; focus: "action" | "evidence"; page: number; index: number; list: { page: number; index: number } };

function readReturnPosition(key: string, href: string): ReturnPosition | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? "null") as Partial<ReturnPosition> | null;
    const validPosition = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10_000_000;
    if (saved?.href !== href || !["action", "evidence"].includes(saved.focus ?? "")
      || !validPosition(saved.page) || !validPosition(saved.index) || !validPosition(saved.list?.page) || !validPosition(saved.list?.index)) return null;
    return saved as ReturnPosition;
  } catch { return null; }
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

function nextAction(skillId: string, status: SkillEvidenceStatus, proofId: string | null, hasCurrentTask: boolean) {
  if (hasCurrentTask) return { label: "Continue today’s task", href: "/today" };
  if (status === "exploring" || status === "practicing") return { label: "View skill path", href: `/path?skill=${encodeURIComponent(skillId)}` };
  if (status === "demonstrated") return { label: "Add to your proof", href: proofId ? `/proof?proof=${encodeURIComponent(proofId)}` : "/proof" };
  return { label: "Maintain your proof", href: proofId ? `/proof?proof=${encodeURIComponent(proofId)}` : "/proof" };
}

function formatLatestUse(value: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}
