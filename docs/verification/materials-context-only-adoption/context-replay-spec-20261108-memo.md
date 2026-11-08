# Replay-warning SPEC re-review — PASS

Reviewed 2026-11-08 at HEAD/base `73685fa8f0eb442fdcf023a6a91a04e54e9d599f` in `C:/Users/XF/.codex/worktrees/materials-replan-recovery/ui-warm-precision`.

Scope is only the late `unappliedChanges` replay repair in `PlanningService.proposeMaterialReplanResponse` and `materialUnappliedChanges`, with the two added tracked warning tests. This is not a fresh review of the adopted-context comparator, the whole server, or the concurrent public `materialProposal`/UI work. No tracked source, migration, fixture, or configuration was modified by this reviewer; only ignored verification files were added. No commit was made.

## Findings

**PASS; no concrete spec finding in this scoped repair.**

- The original proposal and exact replay share the same comparison: canonical frozen `audit.answers` and complete `target` versus the original proposal workspace. A changed audit ID alone stays outside the comparison, matching prior semantics. Both changed inputs produce the same single warning rather than duplicates.
- Replay calls the helper with `verified.commit.snapshot` and `replay.result.workspace` before the latest-workspace read. The repository reconstructs that result at the recorded proposal sequence; acceptance is not substituted for the original result. Independent probes force `repository.load` to throw if called during exact retry and still pass before and after acceptance.
- Audit-only, target-only, and combined changes preserve identical full proposal responses, including warnings, on both retries. Audit-ID-only and unchanged-input controls preserve empty warnings. The context-only proposal keeps original tasks/dates, completed events, retained DailyUnits, audit, target and all four populated real Proof tables. Material links remain unchanged until explicit acceptance. Retries leave planning, material association, receipt, and Proof tables byte-for-value unchanged.
- Existing no-change semantics remain: audit/target differences retain warnings in the receipt; audit-ID-only/unchanged inputs do not warn; the initial response adds only one no-change receipt and exact retry writes nothing. This conclusion is limited to warning extraction and replay semantics, not a re-review of the previously approved comparator/transaction guard.

## Fresh commands and results

Every Node invocation used the required isolated outbound-blocking wrapper. All three commands exited 0 with `nonLoopbackDenials: 0`; complete logs were read.

1. `node work/grounded-verification/run.mjs context-replay-spec-20261108-focused-a node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/server/material-context-only-adoption.test.ts`
   - 26/26 tests passed. Log SHA-256: `da4d3f02b6c3e7657688eb1f65e519e22113ad239fe685d459bfafa11311c646`.
2. `node work/grounded-verification/run.mjs context-replay-spec-20261108-probes-a node_modules/vitest/vitest.mjs run --config work/grounded-verification/context-replay-spec-20261108-vitest.config.ts --maxWorkers=1`
   - 10/10 independent probes passed. Log SHA-256: `80360541a2eb145117701d2f50090cc854ff3b1656596565cabc1505f6be9414`.
3. `node work/grounded-verification/run.mjs context-replay-spec-20261108-prior-red-now-green-a node_modules/vitest/vitest.mjs run --config work/grounded-verification/context-adoption-quality-20261108-vitest.config.ts --maxWorkers=1 -t 'preserves unapplied warnings'`
   - Archived desired-warning probe now passes: 1 passed, 11 unrelated probes skipped. Log SHA-256: `ab693b4bbedc3497ccd238f3be7c0e72955a6348eac6416afbc4875bd1bc546b`.

The independent assertions reuse the existing ignored native SQLite/Proof fixture solely for setup; the new probe assertions and latest-read failure injection are review-owned. The original archived red remains documented in `docs/verification/materials-context-only-adoption-pause/context-adoption-quality-20261108-initial-finding.md`.

## Source/evidence snapshots (SHA-256)

These are point-in-time hashes, not a claim to have reviewed concurrent edits in other functions. The replay method and helper were reread after test execution and again at handoff.

| File | SHA-256 |
|---|---|
| `app/server/planning/service.ts` | `db9b9b98ac2a5145ca7e745711105c91bf3e2e55cd80cc3f600377f013c87d71` |
| `tests/server/material-context-only-adoption.test.ts` | `fadd0d21508bed564acb10196088920ad30c30b4d31a03beba38afb0c12b0ecf` |
| `work/grounded-verification/context-replay-spec-20261108-probes.test.ts` | `fcfbbb9017693820adc04575ff71bdfe5e4f5f24748aaa7a34920001c58a1cd4` |
| `work/grounded-verification/context-replay-spec-20261108-vitest.config.ts` | `bb87354a8f93e6b614c14e86d3f64c8ca807d90bcd6f40c93ea14040896aefc5` |
| Reused `context-adoption-quality-20261108-fixture.ts` | `234b840c913075c0e20281628939a495709ee2a3f790a5ac7d1b8f1aa9599e31` |
| `work/grounded-verification/run.mjs` | `4a2fe29b3c5c0fd9c6ce06cfd436e86e8a9ef9daa8fada44e7c87021c5f28242` |

Evidence is synthetic offline service/reducer/native SQLite verification only. No network, model, deploy, migration, or push operation was performed. No claim is made about UI, native workerd/D1, whole-repository checks, full acceptance gates, or release readiness.
