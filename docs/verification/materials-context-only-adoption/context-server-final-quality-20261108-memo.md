# Server context-only adoption CODE QUALITY re-review — PASS

Reviewed 2026-11-08 in `C:/Users/XF/.codex/worktrees/materials-replan-recovery/ui-warm-precision`, HEAD `73685fa8f0eb442fdcf023a6a91a04e54e9d599f`. Comparison base for the adoption implementation is `f875d2184033fe64a94b08d02d2fbfed61780143`.

**PASS for the requested server scope. No actionable Critical, Important, or Minor finding remains.** The Important replay-warning finding in `docs/verification/materials-context-only-adoption-pause/context-adoption-quality-20261108-initial-finding.md` is resolved. The original desired-warning probe now passes unchanged, together with the pending and accepted replay coverage.

Scope: `app/server/documents/adopted-context.ts`, `app/server/documents/context-builder.ts`, the comparator/no-change/replay-warning integration in `app/server/planning/service.ts`, and the three requested server test files below. The concurrent `clientWorkspace` public `materialProposal` projection was read only for integration; its API/UI design and broader correctness remain under the separate review. No unexpected interaction with this server scope was observed. This is not a UI verdict, whole-repository check, release Gate, or deployment acceptance claim.

## Review assessment

- `service.ts:241–243,449–452`: first response and exact proposal retry share the same small pure warning helper. It compares frozen audit answers and the complete frozen target against the historical proposal workspace. Audit ID alone remains outside the comparison, and simultaneous audit/target differences produce one warning. The replay branch precedes the latest workspace load at line 244. `D1PlanningRepository.findMutation` reconstructs the result at the recorded sequence; the warning is not computed against the accepted or otherwise latest workspace.
- Pending and accepted retries retain the complete original response and make no table changes. The replay probe suite also makes `repository.load` reject, proving that exact retries do not depend on that latest-workspace read. Audit-only, target-only, combined, ID-only, and unchanged controls all passed. The concurrent public projection changes event metadata only; it preserves the audit and target consumed by this helper.
- `adopted-context.ts` is unchanged from the initial quality review (identical hash). Its bounded comparison retains broken enabled rows, rejects unprovable historical evidence, and requires committed usage for the same owner/goal/workspace. It compares exact dependency tuples, explicit mappings and intents, policy/mapping/explanation versions, and source references/versions. Collection order and absent/empty choices normalize; missing optional historical source versions do not reach canonical JSON as `undefined`. Detached sources and their choices are excluded from current adoption.
- `service.ts:264–270` returns true no-change only after unchanged task order, unchanged diff items and completion date, and a successful adoption comparison. Otherwise the existing explicit proposal/accept/discard transaction path is used. `context-builder.ts:167–180` includes the exact enabled-link/snapshot fence in the same batch as the no-change receipt, alongside existing candidate-source and workspace guards. The helper remains read-only and bounded to two SQL reads; failed receipt writes roll back and retry idempotently.
- The scoped tests preserve full task objects, completed events, retained DailyUnits, old audit/target/availability, and populated rows in all four actual Proof tables. Adjacent acceptance/detachment regressions still pass. The two added warning tests assert complete response equality both while pending and after acceptance, rather than checking only a warning count.

## Fresh verification

Every Node process was launched through the required isolated outbound-blocking wrapper. All three commands exited 0, with `nonLoopbackDenials: 0`. Complete logs were read; they contain the expected experimental native SQLite notice and no test failures.

1. `node work/grounded-verification/run.mjs context-server-final-quality-20261108-focused-a node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/server/material-context-only-adoption.test.ts tests/server/material-replan-atomic.test.ts tests/server/material-learning-intent-flow.test.ts tests/server/material-adopted-refs.test.ts tests/server/material-detach.test.ts`

   **52/52 passed, 5 files.** This includes 41 tests in the three scoped test files and 11 adjacent adopted-reference/detachment regressions. Log SHA-256: `7994b36b01b071289d54387190c83c1fdc00857f25bb5009028733d0d8318d22`.

2. `node work/grounded-verification/run.mjs context-server-final-quality-20261108-boundary-probes-a node_modules/vitest/vitest.mjs run --config work/grounded-verification/context-adoption-quality-20261108-vitest.config.ts --maxWorkers=1`

   **12/12 passed.** Reruns the archived independent quality probes: legal five-source equality/two-read bound, sixth broken enabled link, invalid historical JSON/dependencies, explicit empty choices, initially empty-link-set race, receipt failure rollback/retry, and the formerly failing desired replay-warning assertion. Log SHA-256: `e8b321be90609cf33a95d79d43d4e86c5cbda5121d26b880ef5b2ca8da6b4326`.

3. `node work/grounded-verification/run.mjs context-server-final-quality-20261108-replay-probes-a node_modules/vitest/vitest.mjs run --config work/grounded-verification/context-replay-spec-20261108-vitest.config.ts --maxWorkers=1`

   **10/10 passed.** Reruns the independent replay SPEC probes for five input variations across pending/accepted retry and no-change receipt behavior. Full planning, material-association, receipt, and Proof table snapshots remain equal across exact retries; the latest workspace load is prohibited by the probe. Log SHA-256: `3846d5b7ad006018872f45b0a62429e19869c8f292c14f5d89330adc4e28b4d0`.

4. `git diff --check -- app/server/documents/adopted-context.ts app/server/documents/context-builder.ts app/server/planning/service.ts tests/server/material-context-only-adoption.test.ts tests/server/material-replan-atomic.test.ts tests/server/material-learning-intent-flow.test.ts`

   Exit 0, no output. This check covers the current working diff; it is not a full lint/type/build run.

These are reruns of the preserved review-owned probe suites; no new probes or tracked test changes were authored in this re-review. The preserved original failing warning log remains documented in the initial finding. The warning probe is counted within the 12-probe run, not as a separate additional test.

## Exact reviewed file snapshots

SHA-256 values were reread after verification. The whole-file `service.ts` hash includes the concurrent public projection; the verdict on that file is limited to the server behavior described above. Its current working diff changes only `clientWorkspace` at lines 454–463; the replay/no-change method and helper were also reread directly.

| File | SHA-256 |
|---|---|
| `app/server/documents/adopted-context.ts` | `7d91e1ceef766ce5fe3e3afbdea3de6578fc8e59bfc7ea93c2241f6187a7c697` |
| `app/server/documents/context-builder.ts` | `de0d52a3288249004e6fcb2a726fc848e72e00f3a7e76e86ec193c207c34d091` |
| `app/server/planning/service.ts` | `38ed8060e2405202afe83fdaa4d67362cc93f5b71f6f8174cd866007664f331b` |
| `tests/server/material-context-only-adoption.test.ts` | `fadd0d21508bed564acb10196088920ad30c30b4d31a03beba38afb0c12b0ecf` |
| `tests/server/material-replan-atomic.test.ts` | `6b7e3892ff971edcc1880ba6262beb644d88a63f4a4fc19ab69a42661ac4d2ab` |
| `tests/server/material-learning-intent-flow.test.ts` | `afe155764c2817928b387d2b7b8b152efbc4d649367f567aa7e1021ad8c489f6` |
| Adjacent `tests/server/material-adopted-refs.test.ts` | `c4b1c1224c0303387214ceecaf40b6ba283c922a49f87829055ca67f5737775f` |
| Adjacent `tests/server/material-detach.test.ts` | `935b87dcaef3a1dd4ea7ce2f84cdd2acdc8d747017b5b18b6e55abdb43914830` |
| `work/grounded-verification/context-adoption-quality-20261108-fixture.ts` | `234b840c913075c0e20281628939a495709ee2a3f790a5ac7d1b8f1aa9599e31` |
| `work/grounded-verification/context-adoption-quality-20261108-probes.test.ts` | `140268ab3911a512da16c987b35fc004fd3f5bd240417b6872fe859d47371d9d` |
| `work/grounded-verification/context-adoption-quality-20261108-vitest.config.ts` | `9aa2554b20380fab2cd6cd7ca23183b2fef3681ae1dd307cfe6548d2e8969cd2` |
| `work/grounded-verification/context-replay-spec-20261108-probes.test.ts` | `fcfbbb9017693820adc04575ff71bdfe5e4f5f24748aaa7a34920001c58a1cd4` |
| `work/grounded-verification/context-replay-spec-20261108-vitest.config.ts` | `bb87354a8f93e6b614c14e86d3f64c8ca807d90bcd6f40c93ea14040896aefc5` |
| `work/grounded-verification/run.mjs` | `4a2fe29b3c5c0fd9c6ce06cfd436e86e8a9ef9daa8fada44e7c87021c5f28242` |

No tracked file, commit, production configuration, schema, or migration was changed by this reviewer. Only uniquely named ignored run logs/metadata and this memo were added. No network/model/deploy/migrate/push operation was performed. Evidence is synthetic offline service/reducer/native SQLite verification, not native workerd/D1, actual extraction/model quality, full 14-scenario acceptance, or deployment readiness.
