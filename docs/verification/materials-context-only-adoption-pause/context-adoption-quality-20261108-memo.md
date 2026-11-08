# Independent server CODE QUALITY review — FIX REQUIRED

Reviewed 2026-11-08 at HEAD/base `f875d2184033fe64a94b08d02d2fbfed61780143` in `C:/Users/XF/.codex/worktrees/materials-replan-recovery/ui-warm-precision`. Scope: the six server/test files below and their repository/contract integration. UI Task 2, full-project type/lint/build, release Gate and deployment are outside this verdict. No tracked file, commit, source fixture, migration or production configuration was changed by this reviewer; only uniquely named ignored probes/config/logs and this memo were added.

## Finding

**Important — preserve unapplied-assessment warnings on context-only proposal replay (`app/server/planning/service.ts:242`, newly reachable through `:265–274`).** A first material adoption with unchanged tasks/dates and changed audit answers returns a proposal with one `unappliedChanges` warning. Retrying exactly the same mutation returns the same planning result but `unappliedChanges: []`. If the first response is lost, the client receives no warning that the new assessment was excluded. The empty-array replay line already exists at the base commit; this repair newly routes a previously receipt-based no-change case through it, exposing the inconsistency to context-only adoption. This is a localized integration defect, not a request for unrelated redesign. Derive the same warning from the frozen material snapshot and the replay's historical workspace, or preserve it in the proposal receipt; do not compare against a later live workspace or apply the audit/target. Add pending and post-decision replay coverage.

No Critical finding. No additional Important or Minor finding in the new comparator/guard. The warning issue does **not** cause audit/target adoption, duplicate events or changed material links on replay: the characterization probe verifies those boundaries. Root has scheduled the localized fix. **This reviewed version is not a clean PASS; re-review is required after the fix.**

## Code quality assessment

- The comparator is a small server-only helper, separated from proposal lifecycle code. Discriminated read-only result types make the final guard's required evidence explicit. Raw historical snapshot JSON is retained only for the internal transaction fence and is not returned through the public API.
- Reads are bounded to six candidate link rows and one context row, with seven bound parameters in the new receipt guard. Six detects overflow beyond the legal five sources. Missing joins remain visible; active snapshot parsing/fingerprint checks and exact dependency tuples fail conservatively. Optional choices normalize to arrays; absent source versions normalize to null rather than passing undefined to the strict JSON canonicalizer.
- Semantic comparison covers exact dependencies, explicit choices and source/policy versions, sorts collection order, and filters detached source choices. It ignores transport IDs and unapplied audit/target as intended. Candidate validation and existing proposal/accept/replay fences remain in place.
- The no-change batch fences exact enabled links, context/dependency tuples, same-workspace committed usage, original snapshot/state/fingerprint, and existing workspace/source constraints. Failure is atomic. No schema change or public API shape change is introduced.

## Fresh independent evidence

1. `node work/grounded-verification/run.mjs context-adoption-quality-20261108-focused-a node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/server/material-context-only-adoption.test.ts tests/server/material-replan-atomic.test.ts tests/server/material-learning-intent-flow.test.ts tests/server/material-adopted-refs.test.ts tests/server/material-detach.test.ts`

   **50/50 tests, 5 files passed**, exit 0, non-loopback denials 0. Log SHA-256 `219edcfdfbe3b1ee43c12b10e1e1b53733647f78a0405cb502fefc3582d177ea`.

2. `node work/grounded-verification/run.mjs context-adoption-quality-20261108-probes-b node_modules/vitest/vitest.mjs run --config work/grounded-verification/context-adoption-quality-20261108-vitest.config.ts --maxWorkers=1`

   **12/12 probes passed**, exit 0, denials 0. Log SHA-256 `5b477da91cec9b0e801928d58c797dd3e7d2ba8403dbb96f51bf3b662f97941d`. This run characterizes the incorrect replay warning behavior; it is not proof that the warning contract passes. Other probes exercise five-source equality and two-read bound, sixth broken enabled link, negative generation/null choices/wrong owner/missing source/bad digest/extra-property historical JSON, explicit empty choices, initially empty link-set race, and failed no-change receipt rollback/retry. Planning tables, association tables, idempotency and mutation receipts are compared; the reused native SQLite fixture preserves complete tasks, completion events, retained DailyUnits, audit/target and the four actual Proof tables. Fixture setup was copied into an ignored file from the new test suite only to reuse native plumbing; the review probe assertions are independent.

3. Changed the ignored warning probe to assert the desired warning equality. `node work/grounded-verification/run.mjs context-adoption-quality-20261108-replay-red-a node_modules/vitest/vitest.mjs run --config work/grounded-verification/context-adoption-quality-20261108-vitest.config.ts --maxWorkers=1 -t 'preserves unapplied warnings'` fails **1 test** with actual `[]` versus the original one-element warning (11 other probes skipped), exit 1, denials 0. Log SHA-256 `5ff7dbaa16cad861fe7cb9e654adf0557eec52f13f247753c74a6ffbfc868040`. This is the retained regression red, ready for re-review.

4. `git diff --check` for the four tracked server/test modifications passed. The initial reviewer run `context-adoption-quality-20261108-probes-a` had 9 passes / 3 harness failures because I used nonexistent table `path_versions`; the schema calls it `learning_path_versions`. Only the ignored harness table name was corrected and additional existing audit/availability/idempotency tables were included. Original failed log retained, SHA-256 `fec0fb83e39b00a07b6f6aa7d59c40e6836be205957c9c72d65243b9c6eca3f4`, denials 0. This setup error is not a product finding.

## Exact reviewed source hashes (SHA-256)

| File | Hash |
|---|---|
| app/server/documents/adopted-context.ts | 7d91e1ceef766ce5fe3e3afbdea3de6578fc8e59bfc7ea93c2241f6187a7c697 |
| app/server/documents/context-builder.ts | de0d52a3288249004e6fcb2a726fc848e72e00f3a7e76e86ec193c207c34d091 |
| app/server/planning/service.ts | e93110ef1f40927dc2bda72d029adf1f05db6a320f143d86b8ca50024e1cefc0 |
| tests/server/material-context-only-adoption.test.ts | 288051d2131236705abb8235c0cce70d66c9ef7714129fdd37fefc9bd26f9fc4 |
| tests/server/material-replan-atomic.test.ts | 6b7e3892ff971edcc1880ba6262beb644d88a63f4a4fc19ab69a42661ac4d2ab |
| tests/server/material-learning-intent-flow.test.ts | afe155764c2817928b387d2b7b8b152efbc4d649367f567aa7e1021ad8c489f6 |
| work/grounded-verification/context-adoption-quality-20261108-fixture.ts | 234b840c913075c0e20281628939a495709ee2a3f790a5ac7d1b8f1aa9599e31 |
| work/grounded-verification/context-adoption-quality-20261108-probes.test.ts (desired assertion / red) | 140268ab3911a512da16c987b35fc004fd3f5bd240417b6872fe859d47371d9d |
| work/grounded-verification/context-adoption-quality-20261108-vitest.config.ts | 9aa2554b20380fab2cd6cd7ca23183b2fef3681ae1dd307cfe6548d2e8969cd2 |

All evidence is synthetic offline service/reducer/SQLite verification. It is not model quality, actual extraction, user confirmation, native workerd/D1, full 14-scenario, whole-repository or deployment acceptance evidence. Every Node process used the required outbound-blocking wrapper. No network/model/deploy/remote-migration/push operation was performed.
