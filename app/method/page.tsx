import Link from "next/link";
import { SiteHeader } from "../components/brand/site-header";
import { flagshipRole } from "../data/flagship-role";
import "./method.css";

export default function MethodPage() {
  return (
    <>
      <SiteHeader current="method" />
      <main id="main-content" tabIndex={-1} className="reading-page method-page" lang="en">
        <header className="method-intro">
          <p className="eyebrow method-kicker">A continuous learning journey</p>
          <h1>Turn a goal into daily progress.</h1>
          <p className="lede">Start with the skills your goal requires. Build on what you know, work within your time, and leave something concrete after each practice.</p>
        </header>
        <div className="method-example-context"><span>One example, three steps</span><strong>{flagshipRole.name}</strong></div>
        <ol className="method-sequence">
          <li>
            <div className="method-step-heading"><span className="section-index">01</span><h2>Know what to learn</h2></div>
            <div className="method-step-content"><p>Identify the skills your goal needs and how they depend on one another. Use your existing knowledge to choose a starting point.</p>
              <div className="method-example"><span>The example · Form submissions</span><h3>Make an interface submit data reliably</h3><p>This task combines React, TypeScript, and HTTP APIs. Learn the web and type fundamentals first, then define the boundary between client and server.</p></div>
            </div>
          </li>
          <li>
            <div className="method-step-heading"><span className="section-index">02</span><h2>Make time for today</h2></div>
            <div className="method-step-content"><p>Break the path into learning sessions with a clear time budget. Each practice explains what to do, the steps to follow, and the result to save.</p>
              <div className="method-example"><span>Example task · {flagshipRole.today.minutes} minutes</span><h3>{flagshipRole.today.title}</h3><p>{flagshipRole.today.steps.map(({ label }) => label).join("; ")}.</p></div>
            </div>
          </li>
          <li>
            <div className="method-step-heading"><span className="section-index">03</span><h2>Show what you learned</h2></div>
            <div className="method-step-content"><p>Keep your work and notes, and connect each result to the skills it demonstrates. Completion and review stay separate, so you can distinguish practice, submission, and verification.</p>
              <div className="method-example"><span>The same task · Evidence of your work</span><h3>A code change others can reproduce</h3><p>Save a Git commit or implementation notes. Record what happens with valid and empty inputs so someone else can inspect your form submission.</p></div>
            </div>
          </li>
        </ol>
        <footer className="method-next"><Link className="primary-action" href="/showcase?view=path">Explore the full example</Link></footer>
      </main>
    </>
  );
}
