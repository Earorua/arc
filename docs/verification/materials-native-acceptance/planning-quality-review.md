# Native planning code-quality review

Date: 2026-11-19. Independent reviewer: `native_planning_quality`. Reviewed after specification PASS on `codex/materials-replan-recovery-20261106`, with application bytes committed as `47b0e0a` and the native acceptance files still uncommitted.

**Result: PASS for the bounded offline collector and its 14 behavior bindings.** No actionable Critical, Important or Minor issue remains. This is not approval of mainline integration, model quality, hosted deployment, Gate 1B or publication.

## Review observations

- Inputs, native observation collection and independent assertions are separate. The worker uses actual Cloud, document, context, planning and Proof services. Direct writes are limited to the declared synthetic identity and upstream extraction/review-point fixtures before the evaluated action. No after-state is seeded to satisfy the checker.
- Recorded failed calls retain actual exception details. The checker requires the expected rejection and protected state, so the worker's bounded `attempt` helper cannot turn an unexpected success or unrelated exception into a pass. Collection failures and source drift also fail the run. Partial collections remain explicitly labelled with missing categories.
- The checker imports no application implementation or old scorer. Its assertions cover the complete protected audit, source/goal/workspace identity, availability, target, task contents, historical plan/path/DailyUnit records, completion events and four Proof tables. It distinguishes a pending proposal from the active plan, checks actual acceptance identifiers and persisted links, and compares responses with fresh service/repository reloads. Candidate prerequisites and daily budgets are checked independently.
- Each case uses isolated local D1/R2, fixed legal inputs and a rejecting outbound handler. Evidence writes refuse overwriting. The collector records source, runtime, migration and tool identities and detects end-of-run drift; raw results remain available even when a case fails. This is suitable for the fixed acceptance task without adding a general test framework.
- Setup adoption and batch rejection retain their explicit UI/contract interpretation. The five historical UI tests are not misrepresented as the missing bulk-control assertion in the corrected report. The supplemental one-case observation exercises actual setup/provider state, proves control absence after material selection, and preserves individual choice. Physical deletion cleanup is correctly reported as pending rather than completed.

## Evidence inspected without rerunning tests

Read all 14 raw case records and their traces/snapshots: every case was collected, all expected rejection paths were present, every existing-plan case retained its pre-existing Proof, and outbound attempts were zero. The recorded checker result is **14 passed, 0 failed, 0 missing**, across 66 assertion groups. No native matrix, checker, application test or broad suite was rerun by this reviewer.

Read-only byte verification matched all 14 raw case hashes and 194 bound files: 146 imported source files, six infrastructure files, 16 migrations and 26 historical reference assets. All seven UI supplement artifacts and five bound application/fixture files also matched. The final UI log records **1/1 passed**, exit 0 and zero non-loopback denials. The interrupted wrong-scope attempt is explicitly retained and excluded from acceptance; the final configuration replaces the include list and filters the exact probe file.

The collector notes distinguish direct tool output for types/lint/syntax from saved matrix evidence; they do not invent separately recorded subprocess exit codes. No additional probe was necessary to resolve the inspected concerns.

| Reviewed artifact | SHA-256 |
| --- | --- |
| `planning-inputs.json` | `1dc54a3f857cf2d03940005e48bbe7e5a6993d83e6b659638e28eeb936c40064` |
| `planning-worker.ts` | `7d82e3e0ac65c21bd8934b7d0f7e63e995849512371b0b08540c94dd9c72e201` |
| `collect-planning.mjs` | `ef747d47f4fc6305b0c3ccaa800c7e9eefb1d0fa15e8224b2b5a47ef3686b2d6` |
| `check-planning.mjs` | `51ce03f02fceefb4fac44c1fe7b2f7f4176177760fc6442904fdd3b0a62ce124` |
| Recorded native check | `d9026957497342116e47e7c77071839fe669119b33958adf89c304fc216461de` |
| UI supplement manifest | `79c7bef78ecae875dbbfad70fa99a1c4e2314af37a726024c65a22c28f095675` |
| Lossless native ZIP | `e2729128e5dad7f09f16b2955ce4daf8c7ddf2a53a34efcafc34a2cb293627ae` |

Only this review memo was written. Product code, collector/checker, frozen inputs, original results and prior reviews were not edited.
