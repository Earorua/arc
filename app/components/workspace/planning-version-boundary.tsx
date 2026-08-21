export function PlanningVersionBoundary() {
  return (
    <section className="planning-version-recovery" role="alert">
      <p className="section-index">Plan version unavailable.</p>
      <h2>Arc cannot safely read this saved plan with the current learning catalogue.</h2>
      <p>Arc kept this saved plan unchanged so its learning history is not rewritten.</p>
      <p>A compatible rebuild is not available in this Phase 2 build.</p>
    </section>
  );
}
