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
  ["all", "全部分类"],
  ["foundations", "基础"],
  ["frontend", "前端"],
  ["backend", "后端"],
  ["data", "数据"],
  ["quality", "质量"],
  ["cloud", "云服务"],
  ["ai", "AI"],
  ["product", "产品"],
];

const formatLabels: Record<LearningResource["format"], string> = {
  course: "课程",
  documentation: "文档",
  guide: "指南",
  practice: "练习",
  reference: "参考资料",
};

const languageLabels: Record<LearningResource["language"], string> = {
  en: "英语",
  "zh-CN": "简体中文",
};

const costLabels: Record<LearningResource["cost"], string> = {
  free: "免费",
  mixed: "免费与付费",
  paid: "付费",
};

const sourceTierLabels: Record<LearningResource["sourceTier"], string> = {
  community: "社区来源",
  institutional: "机构来源",
  practitioner: "从业者来源",
  primary: "一手来源",
};

const statusLabels: Record<SkillEvidenceStatus, string> = {
  exploring: "待探索",
  practicing: "练习中",
  demonstrated: "已有作品证明",
  verified: "已通过验证",
};

const importanceLabels = { core: "核心", strong: "重要", advantage: "加分项" } as const;
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
      {origin && <Link className="text-action stack-context-return" href={origin}>{new URL(origin, "https://arc.invalid").pathname === "/today" ? "返回今日学习" : "返回来源页面"}</Link>}
      <div className="stack-scope" role="group" aria-label="技能范围">
        <button type="button" disabled={!currentPhase} aria-pressed={scope === "current"} onClick={() => selectScope("current")}>当前阶段</button>
        <button type="button" aria-pressed={scope === "all"} onClick={() => selectScope("all")}>全部</button>
      </div>
      <p className="stack-scope-description">{currentPhase ? `当前阶段 · ${currentPhase.name}` : path ? "当前路线已全部完成，当前显示全部技能。" : "暂无可用路线，当前显示全部技能。"}</p>
      <div className="stack-filters" role="group" aria-label="技能分类">
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
            <label htmlFor="stack-skill-search">搜索技能</label>
            <input id="stack-skill-search" ref={searchRef} type="search" placeholder="技能名称或说明" value={search} onChange={(event) => updateSearch(event.target.value)} aria-controls="stack-skill-index" />
            {search && <button className="stack-search-clear text-action" type="button" onClick={() => updateSearch("")}>清除搜索</button>}
          </div>
          <p className="stack-index-count">{filteredSkills.length} 项技能 · 选择一项查看要求与来源</p>
          {filteredSkills.length === 0 && <p className="stack-search-empty" role="status">{searchTerm ? "没有匹配的技能。可清除搜索或切换分类。" : "这个分类暂时没有技能。"}</p>}
          <ul id="stack-skill-index" ref={indexRef} aria-label="技能索引">
            {filteredSkills.map((skill) => <li key={skill.id}>
              <button type="button" aria-label={`查看 ${skill.name}`} aria-controls="selected-skill-detail" aria-pressed={selected?.id === skill.id} onClick={() => {
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
          <h2>这项技能不在当前路线中</h2>
          <p>链接可能来自另一条路线。返回列表可查看当前账户的技能与资料。</p>
          <button className="text-action" onClick={showList} type="button">返回技能列表</button>
        </div>}
        {(selected ? [selected] : []).map((skill) => {
          const projection = projectionBySkill.get(skill.id) ?? emptyProjection(skill.id);
          const strongest = projection.strongestVersionId
            ? evidenceByVersion.get(projection.strongestVersionId) ?? null
            : null;
          const completedLabel = `已完成 ${projection.completedUnitIds.length} 个学习单元`;
          const next = nextAction(skill.id, projection.status, projection.strongestProofId, currentUnit?.skillId === skill.id);
          const proofAction = next.href.startsWith("/proof");
          const nextHref = proofAction ? proofHref(projection.strongestProofId) : next.href;
          // Proof actions also remember the originating focus and scroll position.
          const showNextAction = proofAction || nextHref !== sourceReturn;
          return <article id="selected-skill-detail" key={skill.id} aria-labelledby="selected-skill-heading">
            <button className="stack-back text-action" type="button" onClick={showList}>返回技能列表</button>
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
                <h3>推荐资料</h3>
                <ul aria-label="学习资料" className="resource-list">
                  {skill.resourceIds.map((resourceId, index) => {
                    const resource = resourcesById.get(resourceId);
                    if (!resource) return <li className="resource-unavailable" key={`${resourceId}-${index}`}>资料信息暂不可用</li>;
                    return <li className="resource-row" key={`${resource.id}-${index}`}>
                      <div className="resource-reference">
                        <a href={resource.url} lang={resource.language} rel="noreferrer" target="_blank">{resource.title} <span aria-hidden="true">↗</span></a>
                        <span>{resource.provider} · {formatLabels[resource.format]}</span>
                      </div>
                      <details className="resource-audit"><summary>资料信息与来源</summary>
                        <dl className="resource-metadata">
                          <div><dt>形式</dt><dd>{formatLabels[resource.format]}</dd></div>
                          <div><dt>语言</dt><dd>{languageLabels[resource.language]}</dd></div>
                          <div><dt>费用</dt><dd>{costLabels[resource.cost]}</dd></div>
                          <div><dt>来源层级</dt><dd>{sourceTierLabels[resource.sourceTier]}</dd></div>
                          <div><dt>核验日期</dt><dd>{resource.lastVerifiedAt}</dd></div>
                        </dl>
                      </details>
                    </li>;
                  })}
                </ul>
              </section>
              <section className="mastery-block">
                <h3>掌握标准</h3>
                <ol aria-label="掌握标准">{skill.masteryCriteria.map((criterion, index) => <li key={`${skill.id}-mastery-${index}`}>{criterion}</li>)}</ol>
              </section>
              <details className="skill-audit"><summary>技能要求与学习记录</summary>
              <dl className="skill-facts">
                <div>
                  <dt>岗位重要度</dt>
                  <dd>{importanceLabels[skill.importance]}</dd>
                </div>
                <div>
                  <dt>最有力的作品</dt>
                  <dd className="skill-proof-link">{projection.strongestProofId
                    ? strongest && strongest.proofId === projection.strongestProofId
                      ? <Link ref={evidenceRef} href={proofHref(strongest.proofId)} onClick={() => rememberReturn("evidence")}>{strongest.title}</Link>
                      : "作品信息暂不可用"
                    : "暂无"}</dd>
                </div>
                <div>
                  <dt>最近使用</dt>
                  <dd>{projection.latestUsedAt ? formatLatestUse(projection.latestUsedAt) : "未记录"}</dd>
                </div>
                <div>
                  <dt>前置技能</dt>
                  <dd>
                    {skill.prerequisiteIds.length > 0
                      ? skill.prerequisiteIds.map((id) => skillNames.get(id) ?? id).join(", ")
                      : "无"}
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
  if (hasCurrentTask) return { label: "继续今日学习", href: "/today" };
  if (status === "exploring" || status === "practicing") return { label: "查看技能路线", href: `/path?skill=${encodeURIComponent(skillId)}` };
  if (status === "demonstrated") return { label: "补充作品证明", href: proofId ? `/proof?proof=${encodeURIComponent(proofId)}` : "/proof" };
  return { label: "维护作品证明", href: proofId ? `/proof?proof=${encodeURIComponent(proofId)}` : "/proof" };
}

function formatLatestUse(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}
