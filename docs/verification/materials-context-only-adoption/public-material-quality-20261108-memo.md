# Public material proposal CODE QUALITY / integration review — PASS

Reviewed 2026-11-08 at `C:/Users/XF/.codex/worktrees/materials-replan-recovery/ui-warm-precision`, HEAD/public-repair base `73685fa8f0eb442fdcf023a6a91a04e54e9d599f`. The complete context-only UI implementation was also compared with `f875d2184033fe64a94b08d02d2fbfed61780143`.

**PASS for the requested public proposal repair and the limited evidence-integrity claim. No actionable Critical, Important, or Minor finding.** The seven reviewed source/test files match the fresh SPEC memo and root's 994-file frozen source snapshot. No tracked source or test was edited by this reviewer.

## Code and integration assessment

- `app/contracts/planning.ts:418–441`: the strict request event input remains separate from recorded-event metadata. Only recorded `agent_replanned` events allow optional literal `materialProposal: true`; older events remain valid. Request injection and invalid values are rejected. This adds no storage field, reducer calculation, or authorization branch.
- `app/server/planning/service.ts:384,404,454–463`: both workspace reads and saved/replayed results validate the complete stored schema and source before projecting public events. Projection clones every agent event, removes both the private fingerprint and a preexisting public indicator, then derives the indicator from validated private evidence. Repository state is not mutated. The existing D1 repository keeps private replay lineage and checks material commit/fingerprint agreement before saving. The public repair does not alter those paths.
- `app/components/workspace/plan-diff-review.tsx:46–58`: classification uses the current pending proposal's latest active-plan event, its public indicator, candidate reason, full ordered PathUnit objects, planning date, complete days, and completion date. The reducer prohibits intervening nondecision events while a proposal is pending, making the event selection consistent with actual server lifecycle. Historical material proposals do not cause a later ordinary proposal to inherit the materials notice.
- `plan-diff-review.tsx:64–98`: existing action/error handling is reused; exact materials notice, both actions, both success messages, custom accept label, pending disabling, safe failure/retry, and click-only candidate decisions remain intact. Private history is neither the classification source nor an action gate. Ordinary no-change and changed-task proposals retain generic text.
- The revised component fixture represents the public response shape. The actual-service SQLite/SSR test closes the prior private-fingerprint blind spot by parsing proposal, exact-retry, and reload responses and checking stored-event privacy separately. The schema tests distinguish recorded events from client inputs. Existing adopted-reference tests cover real acceptance/discard and retained history, rather than only fake UI props.

## Additional uncovered interaction checked

The requested tests separately covered material and ordinary proposals, but did not render an ordinary proposal after a real material proposal had been accepted or discarded. The reviewer-owned ignored probe covers both histories through the real D1 repository and planning/material services:

1. Propose unchanged tasks with a verified material context, then explicitly accept or discard.
2. Propose an ordinary no-change agent update. Confirm the old material event remains marked but the current event is unmarked, and render both the actual response and saved-workspace reload with generic copy.
3. Discard the ordinary proposal, then retry both earlier requests. Confirm each returns its original full response and all persisted planning-event rows are unchanged, with a private fingerprint only on the material event and no persisted public flag.

Both lifecycle variants pass. Three further boundary cases supply `null`, a short fingerprint, and invalid hex through repository read/replay payloads. Each is rejected as `PLANNING_UNAVAILABLE` before a public marker can be derived. These probes do not replace the existing input-injection or component-click coverage.

## Limited evidence-integrity assessment

The assertions in `work/grounded-verification/context-adoption-course-binding-20261108.mjs` and its results are honest within their stated scope. A fresh independent capture equals the complete recorded capture. Complete course export objects, full course source-file contents, and inventory equal the frozen original. All 85 dependency paths are identical; exactly `app/contracts/planning.ts` differs and 84 dependency records remain identical. Bundle bytes differ, as the original evidence explicitly reports.

The review additionally compares all 26 files in `docs/verification/materials-quality-v2` byte-for-byte with `f875d21`; every frozen reference, evaluator, verification asset, and helper is unchanged. Every pinned reference asset matches its declared hash. Across the old evaluator's source inputs, basis documents, and course dependencies, the only failed byte pin is `app/contracts/planning.ts`. Invoking the unchanged `loadReviewedReferences` still rejects current source with `reference-integrity: pinned bytes differ`.

This is evidence of unchanged course content and an explicitly unresolved dependency binding. It does **not** approve a new reference, qualify a model, or pass a Gate. The original result's false approval/Gate fields and note that the capture utility's historical ID/date do not create a new approved identity are accurate. A separately approved new reference binding remains future work.

## Fresh verification and exact commands

All three Node commands ran through the required isolated offline wrapper, exited 0, and reported `nonLoopbackDenials: 0`. Complete logs were read. The only test notices were the expected native SQLite experimental notices.

1. `node work/grounded-verification/run.mjs public-material-quality-20261108-focused node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/components/materials-plan-diff.test.tsx tests/lib/planning/agent-replanned.test.ts tests/server/material-adopted-refs.test.ts tests/server/material-proposal-public-view.test.ts`

   **36/36 tests passed, 4 files.** Log SHA-256: `e34b7fdbdf67860a0509423bed6d8963ffe01fa07973a3a98af7b606a902615e`.

2. `node work/grounded-verification/run.mjs public-material-quality-20261108-interactions node_modules/vitest/vitest.mjs run --config work/grounded-verification/public-material-quality-20261108-vitest.config.ts --maxWorkers=1`

   **5/5 independent probes passed.** Log SHA-256: `2f33924c578f05d3b79bc0d45b037b5d0b63f9c4ac7742779f3c4264e629a40f`.

3. `node work/grounded-verification/run.mjs public-material-quality-20261108-integrity-check work/grounded-verification/public-material-quality-20261108-integrity.mjs`

   **Limited integrity verification passed.** Log SHA-256: `fa76e614ba27f87dd1eb29b84ac59936408692a5dfe5a9f73e8a13949be59dd0`. Full compared hashes are retained in `public-material-quality-20261108-integrity-results.json`.

4. `git -c core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol diff --check -- app/contracts/planning.ts app/server/planning/service.ts app/components/workspace/plan-diff-review.tsx tests/components/materials-plan-diff.test.tsx tests/lib/planning/agent-replanned.test.ts tests/server/material-adopted-refs.test.ts`

   Exit 0, no output. The initial plain Git whitespace check treated the existing CRLF line ending as trailing whitespace; the EOL-aware check above passed without source changes.

This review did not rerun the full repository, browser, workerd/D1, typecheck, lint, or build. Those results remain root's separate evidence; this review's new execution is scoped native Node/SQLite, React SSR/component tests, and offline course capture. No network, model, deployment, migration, commit, or push action was performed.

## Exact reviewed SHA-256 snapshots

All seven source/test byte hashes were reread unchanged after verification and independently matched the corresponding entries in root's `context-adoption-snapshot-20261108-results.json` (994-file manifest identity `3a5205089a301e2b8cc1dfec630a46dcf14c09fb9dfc67dbb02eed7f3febc5a2`; only the seven scoped entries were compared by this review).

| File | SHA-256 |
| --- | --- |
| `app/contracts/planning.ts` | `861260a27d55287661034d5e0a5ca175d6571400031ac3c9d58cb9608b67db93` |
| `app/server/planning/service.ts` | `38ed8060e2405202afe83fdaa4d67362cc93f5b71f6f8174cd866007664f331b` |
| `app/components/workspace/plan-diff-review.tsx` | `c173c958d17737b68fe7e1603a5a6e13bca77299baf0bdb39bd81cd6d97a333b` |
| `tests/components/materials-plan-diff.test.tsx` | `8be3d47b2dab3af62fd3d5f8f71b2af347384a44bbab920dc75674710fa91767` |
| `tests/lib/planning/agent-replanned.test.ts` | `211a75fe92b8e884ad318b1ec7d865a88025213eb0df75395dd3ec4f54265942` |
| `tests/server/material-adopted-refs.test.ts` | `c4b1c1224c0303387214ceecaf40b6ba283c922a49f87829055ca67f5737775f` |
| `tests/server/material-proposal-public-view.test.ts` | `57f5a08a99dab6cb7db26162d8d8e6ea8f07cce4a422cea3177002d2ec0e09d7` |

| Evidence file | SHA-256 |
| --- | --- |
| `docs/verification/materials-quality-v2/course-reference.snapshot.json` | `bf458308b5811f60b61f6e5fa24f6910642a7276615f0b212d930d04868d9676` |
| `work/grounded-verification/context-adoption-course-binding-20261108.mjs` | `d488333e5f3d137d8e0901f475b22dd54c8ebede6deb966789113d155b3ec413` |
| `work/grounded-verification/context-adoption-course-binding-20261108-results.json` | `0df6f19ff6f536c652df3559c94d90ddc8d7dc3b45bb120fdb430a9bec6cb1bd` |
| `work/grounded-verification/context-adoption-course-capture-20261108-results.json` | `9a02b60878d5d581353efb66545a56d81c9da254fd59efc3db34456015a8bed8` |
| `work/grounded-verification/public-material-quality-20261108-probes.test.ts` | `d87f5c6b71a1f4c190f9f413752a5d579e0bcb49c84f254a26c18b4110f23867` |
| `work/grounded-verification/public-material-quality-20261108-vitest.config.ts` | `117ef360cb65399bc0a6fa6f75f695a5071d42e34d2e38920606a97b7f91bfe8` |
| `work/grounded-verification/public-material-quality-20261108-integrity.mjs` | `6e120aea29996692e5845591f253b783697937f1ebdce7c553aeb90a4208476c` |
| `work/grounded-verification/public-material-quality-20261108-integrity-results.json` | `e4c829a60a6f122995df285156539a8500534c5a15256bc425a9ab00cfb72817` |
| `work/grounded-verification/run.mjs` | `4a2fe29b3c5c0fd9c6ce06cfd436e86e8a9ef9daa8fada44e7c87021c5f28242` |

Reviewer writes are confined to ignored `public-material-quality-20261108-*` probes, configuration, logs, results, and this memo. Source status is unchanged from review start.
