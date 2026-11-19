"use client";

import { HomeLearningAction } from "../brand/home-learning-action";
import { ArcWordmark } from "../brand/arc-home-link";
import { useRef, type KeyboardEvent } from "react";
import { flagshipRole } from "../../data/flagship-role";
import { updatePageQuery, usePageQuery } from "../../lib/use-page-query";

const views = [
  { id: "path", label: "Path" },
  { id: "today", label: "Today" },
  { id: "proof", label: "Proof" },
] as const;

const phaseOutcomes: Record<string, { title: string; outcome: string }> = {
  foundations: { title: "Build the product foundations", outcome: "Create an accessible React interface, shaping interactions and type contracts together." },
  systems: { title: "Connect the whole system", outcome: "Connect the interface to a validated API and store real application data in a relational database." },
  intelligence: { title: "Ground your AI in evidence", outcome: "Give model outputs a reliable structure and trace important conclusions to their sources." },
  production: { title: "Ship work others can inspect", outcome: "Deploy, observe, and refine the product, then use your work to explain your skills." },
};

export function CaseShowcase() {
  const search = usePageQuery();
  const view = search.get("view");
  const active = Math.max(0, views.findIndex(({ id }) => id === view));
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const totalWeeks = flagshipRole.phases.reduce((sum, phase) => sum + phase.weeks, 0);

  function setActive(index: number) {
    if (active === index) return;
    updatePageQuery({ view: views[index].id });
  }

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % views.length;
    else if (event.key === "ArrowLeft") next = (index + views.length - 1) % views.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = views.length - 1;
    else return;
    event.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <main id="main-content" tabIndex={-1} className="showcase-page">
      <section className="showcase-intro" aria-labelledby="showcase-title">
        <div>
          <p className="eyebrow">Product in action</p>
          <h1 id="showcase-title">A learning path,<br /> in motion.</h1>
        </div>
        <div className="showcase-intro-actions"><p className="showcase-lede">Explore the path, a daily task, and the resulting work for an {flagshipRole.name}.</p>
          <p className="showcase-sample-label">A public example. Your own plan comes next.</p>
        </div>
      </section>

      <section className="showcase-case" aria-labelledby="showcase-role">
        <aside className="showcase-context">
          <p className="section-index">The example</p>
          <h2 id="showcase-role">{flagshipRole.name}</h2>
          <p>Follow one complete path from a product interface to a deployed AI application.</p>
          <dl className="showcase-facts">
            <div><dt>Duration</dt><dd>{totalWeeks}<span> weeks</span></dd></div>
            <div><dt>Daily task</dt><dd>{flagshipRole.today.minutes}<span> min</span></dd></div>
            <div><dt>Skill map</dt><dd>{flagshipRole.skills.length}<span> skills</span></dd></div>
          </dl>
          <p className="showcase-sample-note">Your path will reflect your goals, experience, and available time.</p>
        </aside>

        <div className="showcase-preview">
          <p className="showcase-story-label">Follow the journey · Path → Today → Proof</p>
          <div className="showcase-tabs" role="tablist" aria-label="Product example views">
            {views.map((view, index) => (
              <button
                aria-controls={`showcase-panel-${view.id}`}
                aria-selected={active === index}
                id={`showcase-tab-${view.id}`}
                key={view.id}
                onClick={() => setActive(index)}
                onKeyDown={event => navigateTabs(event, index)}
                ref={element => { tabRefs.current[index] = element; }}
                role="tab"
                tabIndex={active === index ? 0 : -1}
                type="button"
              >
                <strong>{view.label}</strong>
              </button>
            ))}
          </div>

          <div aria-labelledby="showcase-tab-path" className="showcase-panel" hidden={active !== 0} id="showcase-panel-path" role="tabpanel" tabIndex={0}>
            <div className="showcase-panel-heading">
              <p className="section-index" lang="en">A direction, made concrete</p>
              <h3>Every stage leads somewhere.</h3>
              <p>Build the foundations, then put them to work. Know why you are learning and what you will be able to do.</p>
            </div>
            <ol className="showcase-roadmap">
              {flagshipRole.phases.map((phase, index) => {
                const firstWeek = 1 + flagshipRole.phases.slice(0, index).reduce((sum, previous) => sum + previous.weeks, 0);
                return <li key={phase.id}>
                  <span className="showcase-phase-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <p className="showcase-week">Weeks {firstWeek}–{firstWeek + phase.weeks - 1} <span lang="en">/ {phase.name}</span></p>
                    <h4>{phaseOutcomes[phase.id].title}</h4>
                    <p>{phaseOutcomes[phase.id].outcome}</p>
                  </div>
                </li>;
              })}
            </ol>
          </div>

          <div aria-labelledby="showcase-tab-today" className="showcase-panel" hidden={active !== 1} id="showcase-panel-today" role="tabpanel" tabIndex={0}>
            <div className="showcase-panel-heading">
              <p className="section-index" lang="en">One focused session</p>
              <h3>One clear step for today.</h3>
              <p>Turn a larger goal into one practice you can finish and revisit.</p>
            </div>
            <div className="showcase-task">
              <span className="showcase-duration"><strong>{flagshipRole.today.minutes}</strong><span lang="en">MIN</span></span>
              <div><p className="section-index" lang="en">Today&apos;s example</p><h4>{flagshipRole.today.title}</h4></div>
            </div>
            <ol className="showcase-steps">
              {flagshipRole.today.steps.map((step, index) => <li key={step.id}><span aria-hidden="true">0{index + 1}</span>{step.label}</li>)}
            </ol>
            <div className="showcase-deliverable"><span>What you will save</span><strong>A Git commit or implementation notes</strong></div>
            <p className="showcase-skills">Skills in practice: {flagshipRole.today.skillIds.map(id => flagshipRole.skills.find(skill => skill.id === id)?.name).join(" · ")}</p>
          </div>

          <div aria-labelledby="showcase-tab-proof" className="showcase-panel" hidden={active !== 2} id="showcase-panel-proof" role="tabpanel" tabIndex={0}>
            <div className="showcase-panel-heading">
              <p className="section-index" lang="en">Make the work inspectable</p>
              <h3>Let your work show what you learned.</h3>
              <p>Keep the result, the process, and the skills together so you can review your progress and others can understand it.</p>
            </div>
            <article className="showcase-proof" aria-label="Example work evidence">
              <div className="showcase-proof-label"><span lang="en">PROOF / 001</span><span>Example · Unverified</span></div>
              <h4>A form submission with type validation</h4>
              <p>Build an inspectable submission flow, from input validation and server processing to feedback.</p>
              <dl>
                <div><dt>Code</dt><dd><code>feat: validate form submissions</code></dd></div>
                <div><dt>Notes</dt><dd>Explain the client and server boundary and how validation failures are handled.</dd></div>
                <div><dt>Steps</dt><dd>Submit valid and empty inputs, recording successful results and error feedback.</dd></div>
                <div><dt>Skills</dt><dd>React · TypeScript · HTTP & API Design</dd></div>
              </dl>
            </article>
            <p className="showcase-proof-note">This example shows how work is recorded. It is not a real learner submission or a verified qualification.</p>
          </div>
          <div className="showcase-preview-footer"><span className="wordmark" role="img" aria-label="Arc." lang="en"><ArcWordmark /></span><span>From direction to action to evidence.</span></div>
        </div>
      </section>

      <section className="showcase-next" aria-labelledby="showcase-next-title">
        <div><p className="section-index">Make it your own</p><h2 id="showcase-next-title">Start with your goal.</h2></div>
        <HomeLearningAction />
      </section>
    </main>
  );
}
