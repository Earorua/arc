import Link from "next/link";
import { PrecisionPathHero } from "./components/brand/precision-path-hero";
import { SiteHeader } from "./components/brand/site-header";
import { LearningEntry } from "./components/account/learning-entry";
import { StoryRail } from "./components/brand/story-rail";
import { SectionReveal } from "./components/brand/section-reveal";

export default function Home() {
  return (
    <LearningEntry>
      <SiteHeader current="home" />
      <main id="main-content" tabIndex={-1} className="discovery-home">
        <PrecisionPathHero />
        <section className="editorial-section discovery-method" id="learning-method">
          <SectionReveal>
            <p className="section-index" lang="en">01 · Method</p>
            <div className="discovery-two-col">
              <h2>每一步学习，<br />都有<em>方向。</em></h2>
              <div className="discovery-prose">
                <p>路线不是课程目录。它是一组有依赖、有证据、有时间预算的决定。</p>
                <p>从你想成为谁开始，把需要掌握的技能，转化为今天能完成的一步。</p>
              </div>
            </div>
            <StoryRail />
          </SectionReveal>
        </section>
        <section className="discovery-product">
          <div className="discovery-section-inner">
            <SectionReveal>
              <p className="section-index" lang="en">02 · Product / 旗舰样例</p>
              <div className="discovery-two-col">
                <h2>让进步，<br />有迹可循。</h2>
                <p className="discovery-prose">一条路线，一次专注，<br />一份能说明能力的作品。</p>
              </div>
              <div className="discovery-product-rows">
                <div><span aria-hidden="true">01</span><h3>今日学习</h3><p>把下一步变成可完成的任务。样例每天 45 分钟，实际安排依据你的时间。</p></div>
                <div><span aria-hidden="true">02</span><h3>学习路线</h3><p>理解阶段之间的依赖。样例展示 18 周路线，实际周期由你设定。</p></div>
                <div><span aria-hidden="true">03</span><h3>作品证据</h3><p>保存作品、记录版本，决定哪些成果可以公开分享。</p></div>
              </div>
            </SectionReveal>
          </div>
        </section>
        <section className="discovery-finale" lang="en">
          <div className="discovery-section-inner">
            <SectionReveal>
              <p className="section-index">03 · Your next step</p>
              <h2>Start with direction.<br /><em>Finish with proof.</em></h2>
              <div className="discovery-finale-actions">
                <p lang="zh-CN">从一个值得投入的目标开始。</p>
              </div>
            </SectionReveal>
          </div>
        </section>
        <footer className="discovery-footer"><Link href="/" aria-label="Arc. 首页">Arc.</Link><span lang="en">Learn. Build. Become.</span></footer>
      </main>
    </LearningEntry>
  );
}
