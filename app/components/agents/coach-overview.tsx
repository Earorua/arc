const capabilities = [
  {
    title: "Find what is worth learning next",
    description: "Your coach uses your goal, current skills, and available time to explain what to focus on next and why.",
    example: "I have four hours a week and need stronger foundations. Where should I start?",
  },
  {
    title: "Turn goals into clear milestones",
    description: "Organize tasks into milestones with a clear outcome and completion criteria, so you always know what comes next.",
    example: "What should I be able to build on my own after this phase?",
  },
  {
    title: "Adapt as your progress changes",
    description: "When you get stuck or change your available time, ask your coach to reorder unfinished tasks. Review the changes before applying them.",
    example: "I keep getting stuck on the basics. Help me reorder my next steps.",
  },
  {
    title: "Make sense of the task at hand",
    description: "Your companion uses your current task and resources to explain concepts and break down problems. Turn on in-depth explanations when you need more detail.",
    example: "Could you explain this step with a simple example and walk me through it?",
  },
];

export function CoachOverview() {
  return <section className="coach-overview" aria-labelledby="coach-overview-title" lang="en">
    <div className="coach-overview-heading">
      <p className="section-index">WHAT YOUR COACH CAN DO</p>
      <h2 id="coach-overview-title">From what to learn,<br />to how to do it.</h2>
      <p>Your coach helps shape the path. Your companion helps with the step in front of you.</p>
    </div>
    <ol className="coach-capabilities">
      {capabilities.map((capability, index) => <li key={capability.title}>
        <span className="coach-capability-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
        <div>
          <h3>{capability.title}</h3>
          <p>{capability.description}</p>
          <blockquote><span>Try asking</span><p>“{capability.example}”</p></blockquote>
        </div>
      </li>)}
    </ol>
    <div className="coach-getting-started">
      <div><p className="section-index">HOW TO START</p><h3>Start with your goal.</h3></div>
      <ol>
        <li><strong>01 / Set up your path</strong><p>Sign in and share your goal, current skills, and available time to create a learning path.</p></li>
        <li><strong>02 / Explain what you need</strong><p>Use this page for planning. For a question about a specific task, open the learning companion in the lower corner.</p></li>
        <li><strong>03 / Review, then act</strong><p>Your path changes only after you approve a proposal. You can also bring a question from your companion to your coach for a broader review.</p></li>
      </ol>
      <p className="coach-account-note">Your goals, conversations, and planning history belong to the account you are signed in to.</p>
    </div>
  </section>;
}

export function CoachRouteArt() {
  return <div className="coach-route-art" aria-hidden="true"><span className="coach-art-label">A THOUGHTFUL WAY FORWARD</span>
    <svg viewBox="0 0 320 260" fill="none"><path d="M24 225H95Q122 225 122 198V159Q122 130 151 130H196Q225 130 225 101V64Q225 36 254 36H297" stroke="currentColor" strokeWidth="2" />
      <path d="M288 28L297 36L288 44" stroke="currentColor" strokeWidth="2" /><circle cx="34" cy="225" r="7" fill="var(--ivory)" stroke="currentColor" strokeWidth="2" />
      <circle cx="155" cy="130" r="7" fill="var(--signal)" /><circle cx="258" cy="36" r="7" fill="var(--charcoal)" />
      <path d="M34 207V50M155 112V50" stroke="var(--hairline)" strokeDasharray="3 5" />
      <text x="20" y="34">01</text><text x="143" y="34">02</text><text x="247" y="17">03</text></svg>
    <div className="coach-art-legend"><span>Understand today</span><span>Find your focus</span><span>Move toward your goal</span></div>
  </div>;
}
