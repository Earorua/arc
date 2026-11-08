# Context-only material adoption final integrated review — PASS

Reviewed 2026-11-08 at `C:/Users/XF/.codex/worktrees/materials-replan-recovery/ui-warm-precision`. Implementation comparison base: `f875d2184033fe64a94b08d02d2fbfed61780143`; current HEAD at review: `73685fa8f0eb442fdcf023a6a91a04e54e9d599f`.

**PASS for this context-only material adoption batch. No actionable integration defect found.** This verdict covers the five product paths, seven changed/new test paths, adjacent lifecycle tests, and the approved plan's server/public-interface/UI requirements. It does not approve a new course reference binding, candidate evaluation, model quality, full 14-scenario acceptance, Gate, or public release. Root's final reporting, remaining Node verification, and any authorized local commit are separate work.

## Requirement and integration assessment

The review read the actual diff and surrounding lifecycle code against the approved v2.1 design, especially §§5.5, 6.3, and 8, and `docs/superpowers/plans/2026-11-08-materials-context-only-adoption.md`. The initial server SPEC and later replay SPEC/server final QUALITY/public SPEC/public QUALITY memos were read with their exact scope and source versions. Earlier red/failure memos are retained history; their replay-warning and private-marker findings are closed by the final implementation and evidence.

- **Explicit adoption with unchanged tasks.** `app/server/planning/service.ts:237–276` first builds the existing legal agent replan. True no-change additionally requires identical unfinished order, unchanged scheduling diff and completion date, and verified adopted semantics. First adoption, same-text/new-company JD, new version/confirmation, and focus addition/withdrawal therefore become pending proposals when their semantics change. Preview and proposal do not switch active links. The existing accept/discard transactions are reused without a new authorization route or auto-apply branch.
- **Meaningful equality and conservative history.** `app/server/documents/adopted-context.ts:21–83` reads only the authenticated owner's enabled planning links for this goal, requires same-workspace generation/accepted usage, and validates the active fingerprinted context and exact dependency tuples. It compares document/version/confirmation/text/generation/digest, explicit skill/term mappings and learning intents, course source/content versions, and policy/mapping/explanation versions. Collection ordering and absent/empty choices normalize; preview/selection/scope transport identity and unapplied audit/target do not count as adoption. Explicit detach restricts the baseline to the remaining enabled sources and their confirmations. Broken, redacted, revoked, malformed, or unprovable nonempty history cannot establish equality. No materials versus no materials remains a true no-op.
- **No-change races and atomic decisions.** `adopted-context.ts:86–106` fences the exact enabled-link count, link/dependency tuples, committed usage, and baseline context bytes/state/fingerprint. `context-builder.ts:167–180` runs that fence in the same batch as the receipt, beside the existing material guard and current owner/goal/workspace/revision/active-plan/no-pending checks. The comparison stays bounded to two SQL reads. Existing repository scope, source, expiry, request digest, replay, proposal-sidecar and acceptance guards remain intact. Acceptance switches links atomically; discard retains prior links; sidecar/acceptance write failures roll back.
- **Preserved learning state.** The reducer reorders the existing complete PathUnit objects under the prerequisite checks; it does not rebuild task contents or import frozen candidate audit/target. The tracked tests compare all ordered task objects, dependencies and minutes, completed events, retained DailyUnits, existing audit/target/availability, and all four nonempty actual Proof tables produced through ProofService. Their context-only cases explicitly assert unchanged dates/completion. Existing changed-task flows remain covered.
- **Historical replay warnings.** `service.ts:241–243,449–452` computes the same unapplied warning from the verified frozen audit answers/target and the original proposal result before any latest-workspace load. The repository reconstructs that result at the recorded sequence. Accepting a proposal does not turn a retry into a comparison with later state; public event projection leaves these inputs untouched. Exact replay preserves the original full response and does not adopt the unapplied assessment or target.
- **Private-to-public boundary.** `app/contracts/planning.ts:434–441` permits optional literal `materialProposal: true` only on recorded agent events. Strict client event/request schemas remain separate and reject injected metadata. `service.ts:384–411,454–463` validates stored workspace/result and source first, clones agent events, strips both private fingerprint and preexisting display metadata, then derives the public flag from the validated private fingerprint. The persisted event remains private and does not acquire the display flag. Old unmarked events and ordinary proposals remain compatible.
- **UI and display-only scope.** `app/components/workspace/plan-diff-review.tsx:46–98` identifies the pending active-plan proposal using the public flag and compares complete ordered PathUnit objects, planning date, full days, and completion date. It does not infer equality from the displayed week's unchanged items alone. Exact notice/action/success copy, custom accept labels, click-only current-candidate decisions, pending disabling and safe retries are covered. History arrival is neither classification input nor an action gate; existing owner/race behavior is retained. The new marker appears in the product only in the contract, public projection and UI; reducer fingerprints, scheduling, repository acceptance and digest code do not consume it. Historical material proposals do not mark a later ordinary proposal.

## Fresh independent verification

One focused integrated rerun was executed; the whole suite was not rerun.

```powershell
node work/grounded-verification/run.mjs context-adoption-final-review-20261108-integrated-focused node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/server/material-context-only-adoption.test.ts tests/server/material-replan-atomic.test.ts tests/server/material-learning-intent-flow.test.ts tests/server/material-adopted-refs.test.ts tests/server/material-detach.test.ts tests/server/material-proposal-public-view.test.ts tests/components/materials-plan-diff.test.tsx tests/components/plan-diff-review.test.tsx tests/lib/planning/agent-replanned.test.ts
```

**9 files, 90/90 tests passed**, exit 0, `nonLoopbackDenials: 0`. Complete log read; only expected native SQLite experimental notices. Log SHA-256: `e999e66724d73d1a09a33e187106173d4ca1806704b5fab3a1f390a4242b4712`.

The EOL-aware `git diff --check` from the implementation base over all five product and seven changed/new test paths exited 0 with no output. Fresh PowerShell byte hashing checked **all 994 entries**, and a separate Git inventory comparison checked the complete non-doc source path set: zero hash or inventory differences against `context-adoption-snapshot-20261108-results.json`. Snapshot manifest identity: `3a5205089a301e2b8cc1dfec630a46dcf14c09fb9dfc67dbb02eed7f3febc5a2`; manifest file byte SHA-256: `a4a6e14895142e991f48ae5d74e5548f201fe91d246a27b743ef7a6de1c79fe2`.

Root's separate retained run metadata and log hashes were checked, without rerunning those commands: Vitest groups report 367/8,539 + 2/50 + 2/99 = **371 files, 8,688 tests**; types/build pass, lint has 0 errors and 4 existing warnings, render has 5 passes, and final native workerd/D1 evidence lists 11 checks. Each available wrapper record has exit 0, matching log bytes, and zero non-loopback denials. The full Node run had no completion metadata at this review checkpoint and is **not counted as passed here**. These root runs and the workerd evidence are separate from this reviewer's 90-test execution.

## Frozen-reference boundary

The current course-binding script/results and independent public-quality integrity artifact were inspected. Complete exported course objects, course source-file contents and inventory are unchanged. The 85 dependency paths are unchanged, 84 dependency records match, and only `app/contracts/planning.ts` has changed bytes; the bundle bytes differ. A fresh Git diff confirms no change in `app/data` or any frozen `docs/verification/materials-quality-v2` file relative to the implementation base.

The retained evidence correctly says the unchanged old evaluator still rejects current source with the pinned-byte integrity failure. The original frozen references, evaluator and declared hashes remain intact. Current content equality does **not** approve the new dependency binding or make a candidate evaluation valid against the old pin. This review provides no implicit approval and requests no weakening or rewriting of the old references.

## Exact reviewed source and evidence SHA-256

The fourteen source/test hashes below were reread after the focused run and match the corresponding 994-file snapshot entries. The plan/spec and evidence hashes identify the documentation and evidence actually reviewed.

| File | SHA-256 |
| --- | --- |
| `app/server/documents/adopted-context.ts` | `7d91e1ceef766ce5fe3e3afbdea3de6578fc8e59bfc7ea93c2241f6187a7c697` |
| `app/server/documents/context-builder.ts` | `de0d52a3288249004e6fcb2a726fc848e72e00f3a7e76e86ec193c207c34d091` |
| `app/server/planning/service.ts` | `38ed8060e2405202afe83fdaa4d67362cc93f5b71f6f8174cd866007664f331b` |
| `app/contracts/planning.ts` | `861260a27d55287661034d5e0a5ca175d6571400031ac3c9d58cb9608b67db93` |
| `app/components/workspace/plan-diff-review.tsx` | `c173c958d17737b68fe7e1603a5a6e13bca77299baf0bdb39bd81cd6d97a333b` |
| `tests/server/material-context-only-adoption.test.ts` | `fadd0d21508bed564acb10196088920ad30c30b4d31a03beba38afb0c12b0ecf` |
| `tests/server/material-replan-atomic.test.ts` | `6b7e3892ff971edcc1880ba6262beb644d88a63f4a4fc19ab69a42661ac4d2ab` |
| `tests/server/material-learning-intent-flow.test.ts` | `afe155764c2817928b387d2b7b8b152efbc4d649367f567aa7e1021ad8c489f6` |
| `tests/server/material-adopted-refs.test.ts` | `c4b1c1224c0303387214ceecaf40b6ba283c922a49f87829055ca67f5737775f` |
| `tests/server/material-proposal-public-view.test.ts` | `57f5a08a99dab6cb7db26162d8d8e6ea8f07cce4a422cea3177002d2ec0e09d7` |
| `tests/components/materials-plan-diff.test.tsx` | `8be3d47b2dab3af62fd3d5f8f71b2af347384a44bbab920dc75674710fa91767` |
| `tests/lib/planning/agent-replanned.test.ts` | `211a75fe92b8e884ad318b1ec7d865a88025213eb0df75395dd3ec4f54265942` |
| `tests/server/material-detach.test.ts` | `935b87dcaef3a1dd4ea7ce2f84cdd2acdc8d747017b5b18b6e55abdb43914830` |
| `tests/components/plan-diff-review.test.tsx` | `0e52cc940b7355ef69b19b4d290e3efec722597f8b14a70a2d67b88239f30d5c` |
| `docs/superpowers/plans/2026-11-08-materials-context-only-adoption.md` | `e9781a3bd43faff09aa87d0b9e6a385c63c84735ff04ff83dfd8c111a69d3075` |
| `docs/superpowers/specs/2026-09-11-arc-private-materials-personalized-planning-design.zh-CN.md` | `5d978e38d1c3b4a85eb83327e800df2c561aef598a63edc6c61c433acba21822` |
| `work/grounded-verification/context-adoption-course-binding-20261108-results.json` | `0df6f19ff6f536c652df3559c94d90ddc8d7dc3b45bb120fdb430a9bec6cb1bd` |
| `work/grounded-verification/public-material-quality-20261108-integrity-results.json` | `e4c829a60a6f122995df285156539a8500534c5a15256bc425a9ab00cfb72817` |
| `work/grounded-verification/run.mjs` | `4a2fe29b3c5c0fd9c6ce06cfd436e86e8a9ef9daa8fada44e7c87021c5f28242` |

Reviewer writes are confined to the unique ignored focused-run log/metadata and this memo. No tracked source, test, documentation, configuration, migration or frozen reference was edited. No new probe was necessary after the integrated coverage and source inspection. No network/model/deployment/remote migration/push/commit action was performed.

