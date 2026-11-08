# Repaired UI Task 2 independent SPEC review — PASS

Base: `73685fa8f0eb442fdcf023a6a91a04e54e9d599f`. Reviewed 2026-11-08 against the revised approved public-marker design. No actionable blocker found. The previous P1 (private marker removed before the UI could read it) is resolved in actual service responses. Original review, probe, and failure evidence were preserved.

## Verified requirements

- Recorded/public agent events accept optional literal `materialProposal: true`; old events remain valid. Strict event inputs and request envelopes reject client injection. Other event kinds reject the marker.
- `clientWorkspace` clones agent events, removes both private fingerprint and any supplied public flag, and derives true only from the schema-validated private fingerprint. Ordinary events remain unmarked. Public proposal/replay/reload responses pass response schemas; persisted material events retain the fingerprint and omit the public flag. The spoofed repository flag test passes.
- UI reads the public flag, matching active proposal event and candidate reason, then compares full ordered PathUnit objects, planning date, complete days, and estimated completion date. Outside-week reorder and changed dates retain generic UI; private fingerprint alone and ordinary no-change proposals do not qualify.
- Exact context-only notice, both action labels and both success messages are present. Explicit acceptLabel remains honored. Render/history arrival makes no decision; clicks pass current candidate ID, pending disables both actions, and failed decisions expose a safe role=alert and permit retry.
- No private-history dependency for the notice or controls. Existing uncertain-skill copy, private-history owner/race handling, and generic behaviors are preserved.
- Product diff is limited to contract metadata, its public projection, and UI classification. `materialProposal` occurs only in the schema, serializer and UI; no storage, digest, scheduling, or authorization implementation changed by this repair. No frozen course/evaluator references were edited by this reviewer.

## Fresh independent verification

| Run suffix (prefix `public-material-spec-20261108-`) | Result | Log SHA-256 |
| --- | --- | --- |
| focused | 50/50 tests, 6 files passed | `00d1ea27c125d38d48a6c8a37ce3add23eb03b9f30fd915329776086c7b6317d` |
| original-probe | Original real-service SSR regression: 1/1 passed | `33a1924f51ee776d4b1c939b9804da5de5d2f27c8bfc43f0f0754010d9703558` |
| eslint | All 7 reviewed source/test files, exit 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| typecheck-final | Scoped source/test closure, exit 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

Focused files: materials-plan-diff, plan-diff-review, basic-time-edit, agent-replanned, material-adopted-refs, material-proposal-public-view. EOL-aware scoped diff check passed. All Node runs used `work/grounded-verification/run.mjs`; all reported nonLoopbackDenials 0.

Typecheck harness note: initial reviewer attempts omitted worker ambient declarations, then collided with the wrapper's same-name JSON output. These setup failures are retained under `...-types` and `...-types-complete`. The final standalone `public-material-spec-20261108-typecheck.config.json` includes the tracked worker declarations and uses a distinct run name; it passes without source edits.

This is a Task 2 SPEC pass. It is not an independent browser/workerd/global-suite/model/Gate result; root's separate evidence and frozen-reference approval remain outside this review.

## Exact reviewed SHA-256 hashes

All seven byte hashes were rechecked unchanged after verification.

| File | SHA-256 |
| --- | --- |
| app/contracts/planning.ts | `861260a27d55287661034d5e0a5ca175d6571400031ac3c9d58cb9608b67db93` |
| app/server/planning/service.ts | `38ed8060e2405202afe83fdaa4d67362cc93f5b71f6f8174cd866007664f331b` |
| app/components/workspace/plan-diff-review.tsx | `c173c958d17737b68fe7e1603a5a6e13bca77299baf0bdb39bd81cd6d97a333b` |
| tests/components/materials-plan-diff.test.tsx | `8be3d47b2dab3af62fd3d5f8f71b2af347384a44bbab920dc75674710fa91767` |
| tests/lib/planning/agent-replanned.test.ts | `211a75fe92b8e884ad318b1ec7d865a88025213eb0df75395dd3ec4f54265942` |
| tests/server/material-adopted-refs.test.ts | `c4b1c1224c0303387214ceecaf40b6ba283c922a49f87829055ca67f5737775f` |
| tests/server/material-proposal-public-view.test.ts | `57f5a08a99dab6cb7db26162d8d8e6ea8f07cce4a422cea3177002d2ec0e09d7` |

Reviewer writes were confined to uniquely named ignored verification configuration/logs and this memo. No source changes or Git operations that alter state.
