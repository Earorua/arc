"use client";

import Link from "next/link";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { LearningResource, RoleBlueprint } from "../../contracts/intelligence";
import type { SkillEvidenceProjection, SkillEvidenceStatus } from "../../contracts/proof-ledger";
import type { SkillCategory } from "../../domain/learning";
import { filterSkills } from "../../lib/skill-map";
import { navigateEvidence, useEvidenceQuery } from "../../lib/evidence-navigation";
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
};

const categories: ReadonlyArray<readonly [SkillCategory | "all", string]> = [
  ["all", "全部"],
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

export function StackBrowser({ blueprint, evidence, projections }: StackBrowserProps) {
  const query = useEvidenceQuery();
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
  const { evidenceByVersion, projectionBySkill, resourcesById, skillNames } = useMemo(() => ({
    evidenceByVersion: new Map(evidence.map((item) => [item.versionId, item])),
    projectionBySkill: new Map(projections.filter(({ audience }) => audience === "internal").map((projection) => [projection.skillId, projection])),
    resourcesById: new Map(blueprint.resources.map((resource) => [resource.id, resource])),
    skillNames: new Map(blueprint.skills.map((skill) => [skill.id, skill.name])),
  }), [blueprint, evidence, projections]);
  const matchesSearch = (skill: RoleBlueprint["skills"][number]) =>
    skill.name.toLowerCase().includes(searchTerm) || skill.why.toLowerCase().includes(searchTerm);
  const filteredSkills = filterSkills(blueprint.skills, category).filter(matchesSearch);
  const selected = requestedId !== null ? blueprint.skills.find(({ id }) => id === requestedId)
    : filteredSkills.find(({ id }) => id === selectedId) ?? filteredSkills[0];
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
  function showList() {
    focusIndex.current = true;
    const next = new URLSearchParams();
    if (category !== "all") next.set("category", category);
    if (search) next.set("q", search);
    navigateEvidence("/stack", next);
  }
  function selectCategory(value: SkillCategory | "all") {
    const nextSkills = filterSkills(blueprint.skills, value).filter(matchesSearch);
    setSelectedId(nextSkills.find(({ id }) => id === selected?.id)?.id ?? nextSkills[0]?.id ?? null);
    const next = new URLSearchParams();
    if (value !== "all") next.set("category", value);
    if (search) next.set("q", search);
    navigateEvidence("/stack", next);
  }
  function updateSearch(value: string) {
    focusSearch.current = true;
    const next = new URLSearchParams();
    if (category !== "all") next.set("category", category);
    if (value) next.set("q", value);
    navigateEvidence("/stack", next, true);
  }

  return (
    <section className={`stack-browser${detailOpen ? " is-detail-open" : ""}`}>
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
                const next = new URLSearchParams();
                if (category !== "all") next.set("category", category);
                if (search) next.set("q", search);
                next.set("skill", skill.id);
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
          const next = nextAction(skill.id, projection.status, projection.strongestProofId);
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
                <Link className="primary-action" href={next.href}>{next.label}</Link>
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
                      ? <Link href={`/proof?proof=${encodeURIComponent(strongest.proofId)}`}>{strongest.title}</Link>
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

function nextAction(skillId: string, status: SkillEvidenceStatus, proofId: string | null) {
  if (status === "exploring" || status === "practicing") return { label: "查看技能路线", href: `/path?skill=${encodeURIComponent(skillId)}` };
  if (status === "demonstrated") return { label: "补充作品证明", href: proofId ? `/proof?proof=${encodeURIComponent(proofId)}` : "/proof" };
  return { label: "维护作品证明", href: proofId ? `/proof?proof=${encodeURIComponent(proofId)}` : "/proof" };
}

function formatLatestUse(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}
