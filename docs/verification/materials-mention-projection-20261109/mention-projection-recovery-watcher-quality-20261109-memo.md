Independent QUALITY review: **PASS. No actionable findings.** The patch is ready for root's fresh C acceptance gate. Full Task 4 remains **HOLD** until that gate completes.

Reviewed the actual two-file diff, surrounding harness and recovery code, installed Vite implementation, Task 4 scope, source routing, frozen inputs, and raw author/spec/diagnostic evidence on `codex/materials-replan-recovery-20261106`, HEAD `d9a021907cc679e8b7b8960f3f4a167a7304c18b`.

- Correctness: `server.mjs:200` preserves `watch:null` in the full HTTP server configuration that replaces the base server object through `...extra`. Both harness compositions share this path. Installed Vite 8.1.5 selects NoopWatcher for null; other options and merge behavior remain unchanged.
- Coverage: `entry.test.mjs:36–37` observes the actual started harness. Checking both effective null configuration and the empty watched collection catches the regression without timing assumptions; the null check also prevents an initially empty asynchronous FSWatcher from creating a false pass. The retained RED fails specifically on undefined versus null.
- Cleanup/security: the assertions are inside existing `try/finally`. Vite's no-op watcher supports the unchanged close path. Host, CORS, filesystem restrictions, HTTP origin/auth/nonce checks, outbound isolation, provider/budget assertions, cache cleanup and fetch restoration remain intact. The existing public recovery test checks idempotent close, restored fetch and deleted cache.
- Scope: a fresh independent audit matched all 1,007 frozen source files, with 1,005 unchanged from B. Removing exactly the three additions recovers both baseline byte hashes. The recovery tests, original 45-second clock and startup within that clock are unchanged. Entry CRLF, server LF and CRLF-aware whitespace checks pass.

Quality audit ran through the required offline wrapper: exit 0, 1,258 ms, zero non-loopback denials. It freshly verified the spec run's raw evidence: **21 passed, 0 failed/cancelled/skipped**, plus scoped lint exit 0. No additional test suite was run; no new concern justified duplicating that recent coverage. No source or handoff-document edits were made.

Original Node B remains 289 passed / 1 cancelled. Root's fresh full C gate is still required. The public optimizer missing-runtime warning occurred in original B and author GREEN but not the spec run; it remains a separate observation and is not claimed fixed. Local A/B/A timing is evidence for this checkout, not a universal performance guarantee.

Evidence SHA-256:

- Frozen source manifest: `88b472fd3c2421f3d89d5de6a21bd2b5f0b6cb9f9d2b021a90b0c60998221d5a`.
- Fresh quality audit results: `998c0b40f1896109026c3e5be4caba6a5d6f68fc3b720c6fa590758ecffcc7c6`.
- Quality structured results: `12c23ee776d904d5da60ea883ca593ba99f0fd2c77b0d52e7bbd9b4c03bf5bd4`.
- Audited final spec report: `deaab082db91cbd5af71a27b9f9bf17eee8925b76787c41fc36c4727bd3dfc38`; retained initial report `348a06…def03` has identical source/run evidence.

The structured quality result records file hashes, review reasoning, verified logs and limits. Its separate audit results and wrapper `.json` retain distinct filenames. No external network, models, migrations, deployment, push, commits or full-suite runs were performed by this reviewer.
