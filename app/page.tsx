import { ArcHomeLink } from "./components/brand/arc-home-link";
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
              <h2>Every step,<br />with <em>direction.</em></h2>
              <div className="discovery-prose">
                <p lang="en">Start with your career goal. Find the skills that matter, tasks you can finish, and work you can show.</p>
                <p>Your path connects each decision to the skills it builds, the time it takes, and the evidence it leaves.</p>
              </div>
            </div>
            <StoryRail />
          </SectionReveal>
        </section>
        <section className="discovery-product">
          <div className="discovery-section-inner">
            <SectionReveal>
              <p className="section-index" lang="en">02 · Product in action</p>
              <div className="discovery-two-col">
                <h2>Progress you<br />can point to.</h2>
                <p className="discovery-prose">A clear path. A focused session.<br />Work that shows what you can do.</p>
              </div>
              <div className="discovery-product-rows">
                <div><span aria-hidden="true">01</span><h3>Today</h3><p>Turn the next step into a task you can finish. This example uses 45 minutes a day; your schedule follows your availability.</p></div>
                <div><span aria-hidden="true">02</span><h3>Your path</h3><p>See how each stage builds on the last. This example spans 18 weeks; you set your own timeline.</p></div>
                <div><span aria-hidden="true">03</span><h3>Proof</h3><p>Save your work, track versions, and choose which results to share.</p></div>
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
                <p lang="en">Begin with a goal worth your time.</p>
              </div>
            </SectionReveal>
          </div>
        </section>
        <footer className="discovery-footer"><ArcHomeLink /><span lang="en">Learn. Build. Become.</span></footer>
      </main>
    </LearningEntry>
  );
}
