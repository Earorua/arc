# Independent server SPEC review — PASS

Reviewed 2026-11-08 in `C:/Users/XF/.codex/worktrees/materials-replan-recovery/ui-warm-precision`, branch `codex/materials-replan-recovery-20261106`, HEAD/base `f875d2184033fe64a94b08d02d2fbfed61780143`. Reviewed actual uncommitted production/test differences and the two new files, not author reports. No actionable server specification defect found in the six-file version bound below. No tracked file was edited by this reviewer. Only uniquely named, ignored review probes/config/logs and this memo were added.

## Requirements checked

- `app/server/planning/service.ts:265` gates genuine no-change on exact unfinished unit order, every scheduling diff item unchanged, estimated completion date unchanged, and adopted-context equality. Unequal adoption falls through to the existing `saveEvent` material proposal transaction. Preview/proposal never switches current links; existing accept/discard transactions remain authoritative.
- `app/server/documents/adopted-context.ts:21` reads the current owner's enabled planning links for the goal, requires generation/accepted usage for the same workspace/context, rejects proposal-only evidence, keeps broken left-joined dependencies visible, checks the exact dependency tuple and valid fingerprinted active snapshot. Draft generation scope is accepted through its same-workspace committed usage, while goal snapshots must also match goal/workspace.
- `adopted-context.ts:67` compares slot/document/version/confirmation/text/generation/digest, explicit skill/term mappings and learning intents, sourceReference/sourceVersions, policy/mapping/explanation versions. It sorts collections and term skill IDs, equates absent/empty choice collections, ignores transport identity and unapplied audit/target, and filters partial-detach baselines to enabled dependencies and their confirmations. Missing optional historical sourceVersions safely becomes null and does not equal a current known version.
- Unknown, revoked, malformed/redacted, broken, or mismatched baseline evidence cannot establish equality. Empty current/candidate material sets remain genuine no-change. Baseline expiry/selection transport state is not mistaken for adoption loss; current candidate validation remains in the existing material guard.
- `adopted-context.ts:86` fences enabled-link count, exact current link/dependency tuples, same-workspace committed usage, and baseline state/snapshot/fingerprint in the final receipt batch. `context-builder.ts:167` retains the existing candidate material guard and workspace/goal/revision/active-plan/no-pending guard beside this new guard.
- Existing ownership, source/selection/confirmation, expiry, revision, idempotency/replay, and proposal/accept transaction code was not weakened; APIs, migrations, and public course/source models were not changed.

## Fresh independent execution

1. Ran:

   `node work/grounded-verification/run.mjs context-adoption-spec-20261108-focused-a node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/server/material-context-only-adoption.test.ts tests/server/material-replan-atomic.test.ts tests/server/material-learning-intent-flow.test.ts tests/server/material-adopted-refs.test.ts tests/server/material-detach.test.ts`

   Result: **5 files, 50/50 passed**, exit 0, non-loopback denials 0. Log SHA-256 `f21308985c52c659f2f18fd73ecab4c5f51f6f178418e3f5b8d05d56518bf6c6`. New suite includes first adoption, same-text JD replacement, new version/confirmation, SQL→React under declared prerequisites, focus add/withdraw, true no-op, fresh selection/empty choices, ordering normalization, missing optional sourceVersions, invalid baselines, explicit detach and completion/detach/deletion races. Existing focused suites cover proposal-sidecar rollback, post-validation acceptance invalidation, and same-key/different-body rejection.

2. Added independent ignored `context-adoption-spec-20261108-probes.test.ts` and config, then ran:

   `node work/grounded-verification/run.mjs context-adoption-spec-20261108-probes-c node_modules/vitest/vitest.mjs run --config work/grounded-verification/context-adoption-spec-20261108-vitest.config.ts --maxWorkers=1`

   Result: **12/12 passed**, exit 0, non-loopback denials 0. Log SHA-256 `5b5a638b7ff758cd3ad9429f1d89856a9fef231018036a02aee63ed0b37ceccf`.

   Independent cases: term-mapping-only change with unchanged full task order/dates; explicit discard then accept; proposal/accept/discard replay without duplicated workspace/association changes; fresh equivalent mapping no-op; owner/workspace boundary at the helper; changed mapping/explanation versions; missing dependency, wrong dependency digest, wrong-goal snapshot, redacted snapshot; final no-op races changing baseline snapshot, usage, or dependency; accepted-usage insert failure after link writes with complete transaction rollback.

   These probes use native MaterialContextService, SelectionService, PlanningService, D1 repositories, the real SQLite adapter, and native ProofService. Assertions preserve full PathUnit objects (including prerequisites and minutes), completed events, retained DailyUnits, audit/target, and all four nonempty Proof ledger tables. Scheduling equality is asserted before claiming term-only behavior.

3. `git diff --check` completed with exit 0. This is a SPEC review; no independent full-project typecheck, build, browser/UI, or release Gate claim is made.

## Retained reviewer-harness failures

- `context-adoption-spec-20261108-probes-a`: all 12 failed during reviewer fixture setup because the chosen `https://example.test/proof` violates the existing public HTTPS URL schema. It never reached material comparison. Only that probe URL was changed to `https://example.com/proof`; no network fetch was performed. Log SHA-256 `039fd53e0d42b81bdb3085399984c76bc527d673c28acf9d5fc8dbba8f5f930b`, denials 0.
- `context-adoption-spec-20261108-probes-b`: 11 passed; the remaining reviewer setup tried to assign usage to a nonexistent workspace and correctly failed SQLite's existing composite foreign key. Replaced this invalid fixture construction with a direct helper owner/workspace boundary test using an otherwise verified commit. No constraint or product assertion was weakened. Log SHA-256 `651170cc31148ffd9179f57d3b4e8a5df9c0b0bc36f9f6fedc0fd9a44f2bc64d`, denials 0.
- Original a/b log and JSON files are retained. Neither failed attempt is counted as evidence of a product regression or as a passed behavior test; final c is the successful probe version.

## Exact reviewed source hashes (SHA-256)

| File | SHA-256 |
|---|---|
| app/server/documents/adopted-context.ts | 7d91e1ceef766ce5fe3e3afbdea3de6578fc8e59bfc7ea93c2241f6187a7c697 |
| app/server/documents/context-builder.ts | de0d52a3288249004e6fcb2a726fc848e72e00f3a7e76e86ec193c207c34d091 |
| app/server/planning/service.ts | e93110ef1f40927dc2bda72d029adf1f05db6a320f143d86b8ca50024e1cefc0 |
| tests/server/material-context-only-adoption.test.ts | 288051d2131236705abb8235c0cce70d66c9ef7714129fdd37fefc9bd26f9fc4 |
| tests/server/material-replan-atomic.test.ts | 6b7e3892ff971edcc1880ba6262beb644d88a63f4a4fc19ab69a42661ac4d2ab |
| tests/server/material-learning-intent-flow.test.ts | afe155764c2817928b387d2b7b8b152efbc4d649367f567aa7e1021ad8c489f6 |
| work/grounded-verification/context-adoption-spec-20261108-probes.test.ts | ec9df36d39384a2c119e2d01ca34b496ed9ad46b23e6fc338d15482719c3b990 |
| work/grounded-verification/context-adoption-spec-20261108-vitest.config.ts | 26a201c9a5c6cbe4bad395322730b238f25f595b0b6b3d2a001a603fa7188d76 |

## Evidence limits

Confirmations/documents here are explicitly synthetic seeded controls, not evidence of extraction, user confirmation, real-model input quality, or realistic prioritization outcomes. The native reducer/service/SQLite/Proof state transitions are what these tests establish. The constrained prerequisite-chain case is a synthetic legal source control, not the unchanged flagship source. Root's separate actual flagship and workerd/D1 reports were not substituted for independent evidence here. UI Task 2 is outside this server-only verdict and remains queued; this pass does not claim all 14 scenarios, overall behavior acceptance, Gate, deployment, public release, remote migration, or push. No network/model/deploy/remote-migration/push action was taken.
