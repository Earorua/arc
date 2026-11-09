Independent SPEC review: **PASS. No actionable spec findings.** Full Task 4 remains **HOLD** pending independent quality review and root's fresh C full acceptance.

Reviewed the Task 4 approved watcher scope, actual source and diff, source routing, retained diagnosis/RED/GREEN logs, and freeze on branch `codex/materials-replan-recovery-20261106`, HEAD `d9a021907cc679e8b7b8960f3f4a167a7304c18b`.

- `tests/offline-uat/server.mjs:200` adds only explicit `watch: null` to the actual harness server options. The existing top-level `...extra` replaces the default server object; the installed Vite implementation selects its no-op watcher for this null setting.
- `tests/offline-uat/entry.test.mjs:36–37` checks the effective setting and empty watched collection after actual harness creation, inside the existing `try/finally`. The assertions exercise the regression, and the retained RED fails specifically on `undefined` versus `null`.
- Independent byte audit confirms the complete 1,007-file freeze, 1,005 files unchanged from B, and exactly the two approved changes. Removing those exact additions recovers both baseline byte hashes. Entry CRLF, server LF, all HTTP/security/private-asset/body/provider/budget/cleanup behavior and prior assertions are preserved. The recovery test is byte-identical, retains 45,000 ms, and still creates the harness inside that test clock. CRLF-aware diff check passes.

Fresh wrapper verification: entry + compatibility recovery + public durable recovery **21 passed, 0 failed/cancelled/skipped**; wrapper duration 23,427 ms. Original compatibility recovery completed in 5,762.857 ms. Scoped ESLint and the independent source/evidence audit passed. Every wrapper reports zero non-loopback denials. No source/docs edits, commits, live model calls, migrations, deployments, or full-suite runs were performed by this reviewer.

The retained A/B/A logs support the shallow-merge watcher cause: composition SSR 54,091.789 / 1,310.102 / 45,968.899 ms, with the reversal observing FSWatcher and 9,341 directories / 40,489 entries, versus NoopWatcher in the fixed control. Cancelled A/reversal runs remain failures, not accepted passes.

The public optimizer missing-runtime warning exists in original Node B and author GREEN; it did not appear in this fresh review run. It is a separate existing observation, not established as the watcher cause, and is neither repaired nor suppressed here. `envFile` deprecation and experimental SQLite warnings remain visible. This focused PASS does not establish full Task 4 acceptance or any release readiness.

Evidence identities:

- Frozen source manifest: `88b472fd3c2421f3d89d5de6a21bd2b5f0b6cb9f9d2b021a90b0c60998221d5a`.
- Fresh focused log: `34453e80907e7fb569d61031f641f6e092e1a6ecf4e2b36936d4b97f065d5f3e`.
- Final structured results: `deaab082db91cbd5af71a27b9f9bf17eee8925b76787c41fc36c4727bd3dfc38`.

`mention-projection-recovery-watcher-spec-20261109-structured-results.json` contains the detailed checks and retained evidence hashes; wrapper `.json` files remain separate. The initial structured report is preserved separately after clarifying its network-count field to mean external calls; raw test evidence was not changed.
