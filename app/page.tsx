import Link from "next/link";
import { PrecisionPathHero } from "./components/brand/precision-path-hero";
import { SiteHeader } from "./components/brand/site-header";
import { LearningEntry } from "./components/account/learning-entry";

export default function Home() {
  return (
    <LearningEntry>
      <SiteHeader />
      <main id="main-content">
        <PrecisionPathHero />
        <section className="editorial-section method-preview">
          <p className="section-index" lang="en">
            01 · Method
          </p>
          <h2>路线不是课程目录。它是一组有依赖、有证据、有时间预算的决定。</h2>
          <Link href="/method">
            了解学习方法 →
          </Link>
        </section>
        <section className="editorial-section product-preview">
          <p className="section-index" lang="en">
            02 · PRODUCT / 旗舰样例
          </p>
          <div>
            <strong>今日学习</strong>
            <span>把下一步变成可完成的任务。样例每天 45 分钟，实际安排依据你的时间。</span>
          </div>
          <div>
            <strong>学习路线</strong>
            <span>理解阶段之间的依赖。样例展示 18 周路线，实际周期由你设定。</span>
          </div>
          <div>
            <strong>作品证据</strong>
            <span>保存作品、记录版本，决定哪些成果可以公开分享。</span>
          </div>
          <Link href="/showcase">体验 Today、Path 与 Proof 完整样例 ↗</Link>
        </section>
        <section className="final-cta" lang="en">
          <h2>
            Start with direction.
            <br />
            Finish with proof.
          </h2>
          <Link className="primary-action" href="/setup" lang="zh-CN">
            建立我的学习路线 →
          </Link>
        </section>
      </main>
    </LearningEntry>
  );
}
