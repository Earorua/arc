import { flagshipRole } from "../data/flagship-role";
import { SiteHeader } from "../components/brand/site-header";
import type { RoleProfile } from "../domain/learning";

export function selectSourceSpecimen(role: RoleProfile) {
  const skill = role.skills.find(({ id }) => id === "web-platform");
  const source = skill?.sources[0];

  return skill && source ? { skill, source } : null;
}

export default function IntelligencePage() {
  const specimen = selectSourceSpecimen(flagshipRole);
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="reading-page">
        <p className="eyebrow" lang="en">Intelligence · 02</p>
        <h1 lang="en">Trust is part of the interface.</h1>
        <p className="lede">每条技能结论都显示来源、观察时间和置信度。AI 推断永远不会伪装成事实。</p>
        {specimen ? (
          <dl className="source-specimen" lang="en">
            <div><dt>Skill</dt><dd>{specimen.skill.name}</dd></div>
            <div><dt>Source</dt><dd>{specimen.source.title}</dd></div>
            <div><dt>Observed at</dt><dd>{specimen.source.observedAt}</dd></div>
            <div><dt>Confidence</dt><dd>{Math.round(specimen.skill.confidence * 100)}%</dd></div>
          </dl>
        ) : (
          <p className="lede" lang="en" role="status">Source specimen is temporarily unavailable.</p>
        )}
      </main>
    </>
  );
}
