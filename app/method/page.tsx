import { SiteHeader } from "../components/brand/site-header";

export default function MethodPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="reading-page">
        <p className="eyebrow" lang="en">Method · 01</p>
        <h1 lang="en">A path is a decision system.</h1>
        <p className="lede">路线同时考虑岗位重要度、技能依赖、个人基础、时间预算和可验证产出。</p>
        <ol className="method-list">
          <li><span>01</span><div><strong lang="en">Understand</strong><p>先解释岗位真正要求什么，以及信息来自哪里。</p></div></li>
          <li><span>02</span><div><strong lang="en">Build</strong><p>每天安排一个在现有时间内能够完成的结果。</p></div></li>
          <li><span>03</span><div><strong lang="en">Prove</strong><p>完成记录只有与项目、代码或笔记关联后才提升成熟度。</p></div></li>
        </ol>
        <p className="method-equation" lang="en">Understand → Build → Prove</p>
      </main>
    </>
  );
}
