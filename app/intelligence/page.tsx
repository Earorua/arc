import { flagshipRole } from "../data/flagship-role";
import { SiteHeader } from "../components/brand/site-header";

export default function IntelligencePage() {
  const sample = flagshipRole.skills[0];
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="reading-page">
        <p className="eyebrow" lang="en">Intelligence · 02</p>
        <h1 lang="en">Trust is part of the interface.</h1>
        <p className="lede">每条技能结论都显示来源、观察时间和置信度。AI 推断永远不会伪装成事实。</p>
        <dl className="source-specimen" lang="en">
          <div><dt>Skill</dt><dd>{sample.name}</dd></div>
          <div><dt>Source</dt><dd>{sample.sources[0].title}</dd></div>
          <div><dt>Observed at</dt><dd>{sample.sources[0].observedAt}</dd></div>
          <div><dt>Confidence</dt><dd>{Math.round(sample.confidence * 100)}%</dd></div>
        </dl>
      </main>
    </>
  );
}
