# Projection probe configuration correction

The first root projection run used `mergeConfig(base, { test: { include: [...] } })`. Vitest merged the include arrays and began unrelated repository suites under the probe's Node environment. This was a harness scope error, not a production failure. Root observed repository Research output in the partial log and cancelled exec session 98314 with Ctrl-C; the tool returned exit 1. No completed wrapper metadata or projection result was produced, and the original configuration and partial log remain intact.

- Original config: `mention-boundary-projection-20261108.config.ts`.
- Aborted run: `mention-boundary-root-projection-20261108-a.log` (no completed `.json` outcome; do not count as a pass or claim its final counters).
- Corrected config: `mention-boundary-projection-20261108-focused.config.ts`, using explicit spread and replacement of `test.include`.
- Corrected run: `mention-boundary-root-projection-20261108-b`, exactly one file and 3/3 observations, exit 0, nonLoopbackDenials 0.

No product code changed for this correction. The new observations use fabricated wire fixtures through the actual source decoder and site projection; they are not real provider calls, authenticated extraction records, user confirmation, or plan adoption evidence. Two lexical boundary terms now survive those two components. The negative Kubernetes task remains filtered in production because the new mention API is intentionally not wired before adoption guards exist.
