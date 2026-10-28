"use client";

import Link from "next/link";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
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
  const [category, setCategory] = useState<SkillCategory | "all">("all");
  const [selectedId, setSelectedId] = useState(blueprint.skills[0]?.id ?? null);
  const [detailOpen, setDetailOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const indexRef = useRef<HTMLUListElement>(null);
  const focusDetail = useRef(false);
  const focusIndex = useRef(false);
  const { evidenceByVersion, projectionBySkill, resourcesById, skillNames } = useMemo(() => ({
    evidenceByVersion: new Map(evidence.map((item) => [item.versionId, item])),
    projectionBySkill: new Map(projections.filter(({ audience }) => audience === "internal").map((projection) => [projection.skillId, projection])),
    resourcesById: new Map(blueprint.resources.map((resource) => [resource.id, resource])),
    skillNames: new Map(blueprint.skills.map((skill) => [skill.id, skill.name])),
  }), [blueprint, evidence, projections]);
  const filteredSkills = filterSkills(blueprint.skills, category);
  const selected = filteredSkills.find(({ id }) => id === selectedId) ?? filteredSkills[0];
  useLayoutEffect(() => {
    if (focusDetail.current) {
      headingRef.current?.focus();
      focusDetail.current = false;
    }
    if (focusIndex.current) {
      indexRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus();
      focusIndex.current = false;
    }
  }, [selected?.id, detailOpen]);
  function selectCategory(value: SkillCategory | "all") {
    const nextSkills = filterSkills(blueprint.skills, value);
    setSelectedId(nextSkills.find(({ id }) => id === selected?.id)?.id ?? nextSkills[0]?.id ?? null);
    setCategory(value);
    setDetailOpen(false);
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
          <p className="stack-index-count">{filteredSkills.length} 项技能 · 选择一项查看要求与来源</p>
          <ul ref={indexRef} aria-label="技能索引">
            {filteredSkills.map((skill) => <li key={skill.id}>
              <button type="button" aria-label={`查看 ${skill.name}`} aria-controls="selected-skill-detail" aria-pressed={selected?.id === skill.id} onClick={() => {
                focusDetail.current = true;
                setSelectedId(skill.id);
                setDetailOpen(true);
                if (selected?.id === skill.id && detailOpen) headingRef.current?.focus();
              }}>
                <strong>{skill.name}</strong>
                <span>{importanceLabels[skill.importance]} · {statusLabels[projectionBySkill.get(skill.id)?.status ?? "exploring"]}</span>
              </button>
            </li>)}
          </ul>
        </div>
        <div className="skill-list">
        {(selected ? [selected] : []).map((skill) => {
          const projection = projectionBySkill.get(skill.id) ?? emptyProjection(skill.id);
          const strongest = projection.strongestVersionId
            ? evidenceByVersion.get(projection.strongestVersionId) ?? null
            : null;
          const completedLabel = `已完成 ${projection.completedUnitIds.length} 个学习单元`;
          const next = nextAction(projection.status, projection.strongestProofId);
          return <article id="selected-skill-detail" key={skill.id} aria-labelledby="selected-skill-heading">
            <button className="stack-back text-action" type="button" onClick={() => {
              focusIndex.current = true;
              setDetailOpen(false);
            }}>返回技能列表</button>
            <header className="skill-summary">
              <p className="skill-kicker">{categories.find(([value]) => value === skill.category)?.[1]} · {importanceLabels[skill.importance]}</p>
              <h2 id="selected-skill-heading" ref={headingRef} tabIndex={-1}>{skill.name}</h2>
              <p className="skill-why">{skill.why}</p>
            </header>
            <div className="skill-detail">
              <dl className="skill-facts">
                <div>
                  <dt>学习状态</dt>
                  <dd><strong className={`skill-status skill-status-${projection.status}`}>{statusLabels[projection.status]}</strong></dd>
                </div>
                <div>
                  <dt>岗位重要度</dt>
                  <dd>{importanceLabels[skill.importance]}</dd>
                </div>
                <div>
                  <dt>已完成学习</dt>
                  <dd>{completedLabel}</dd>
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
                  <dt>下一步</dt>
                  <dd><Link href={next.href}>{next.label}</Link></dd>
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

              <section className="mastery-block">
                <h3>掌握标准</h3>
                <ol aria-label="掌握标准">
                  {skill.masteryCriteria.map((criterion, index) => (
                    <li key={`${skill.id}-mastery-${index}`}>{criterion}</li>
                  ))}
                </ol>
              </section>

              <section className="resource-block">
                <h3>学习资料</h3>
                <ul aria-label="学习资料" className="resource-list">
                  {skill.resourceIds.map((resourceId, index) => {
                    const resource = resourcesById.get(resourceId);

                    if (!resource) {
                      return (
                        <li
                          className="resource-unavailable"
                          key={`${skill.id}-resource-${resourceId}-${index}`}
                        >
                          资料信息暂不可用
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
                          <div><dt>形式</dt><dd>{formatLabels[resource.format]}</dd></div>
                          <div><dt>语言</dt><dd>{languageLabels[resource.language]}</dd></div>
                          <div><dt>费用</dt><dd>{costLabels[resource.cost]}</dd></div>
                          <div><dt>来源层级</dt><dd>{sourceTierLabels[resource.sourceTier]}</dd></div>
                          <div><dt>核验日期</dt><dd>{resource.lastVerifiedAt}</dd></div>
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
      </div>
      {filteredSkills.length === 0 && <p role="status">这个分类暂时没有技能。</p>}
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
  if (status === "exploring") return { label: "开始今日学习", href: "/today" };
  if (status === "practicing") return { label: "继续今日学习", href: "/today" };
  if (status === "demonstrated") return { label: "补充作品证明", href: "/proof" };
  return { label: "维护作品证明", href: proofId ? `/proof?proof=${encodeURIComponent(proofId)}` : "/proof" };
}

function formatLatestUse(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}
