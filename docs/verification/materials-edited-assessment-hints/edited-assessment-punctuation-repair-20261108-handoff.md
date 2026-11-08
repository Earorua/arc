# Task 2 punctuation repair — DONE, frozen for independent review

## Candidate and bounded change

- Workspace: `C:/Users/XF/.codex/worktrees/materials-replan-recovery/ui-warm-precision`.
- Prior shared candidate: `8a44bd187cb5f2bf1f16f9eeb04b5039f237cedd6f65f12ca513ecd0f7da8768`.
- Final shared candidate: `cb07c50bfce3fd2554a5fb1b80ac4c672951d7994ce8605f4eb0a892a0836b70`.
- HEAD at final checks: `fcfb6cda6ffd1f5d98e0d2d61ae4590f392abede`, root's documentation commit. The author made no commits or documentation edits.
- All source/tests were frozen after the final regression/type/lint checks and before notification to root. Only this ignored memo was written afterward.

This round changes one production separator expression and its comment. The Chinese action predicate check retains an ASCII dot followed by `[A-Za-z0-9_]`, keeping the technical name `React.js` intact. Actual ASCII sentence periods followed by whitespace or Chinese text, Chinese full stops, commas, semicolons, and the existing other punctuation remain action boundaries. The denial and nominal-plan predicates themselves are unchanged.

There is no worker/parser redesign or new experience-attribution work. The existing SQL cases, longer qualifier precedence, original hint identity/source/level guards, retained membership, trusted projection, legacy compatibility, and explicit-adoption behavior remain covered. The four integration production files are unchanged. The previous quality/spec memos, frozen patch, RED results, and author handoffs remain intact; they are not approvals of this replacement candidate.

## Tracked RED and GREEN

The new tracked React.js matrix runs for `按指导`, `按照指导`, and `在导师指导下`. It includes inability, both nominal-plan forms, actual completion, later CSS reading plans, denied CSS activity, genuine ASCII sentence periods with and without a following space, and Chinese sentence punctuation. The tests cover the shared predicate, direct worker adapter, statement-bound reminders, both retention projections, service save/read/replay with immutable source data, and controlled UI with explicit-click-only adoption.

All Node executions used `node work/grounded-verification/run.mjs` and unique `edited-assessment-punctuation-repair-20261108-*` labels. Every metadata record has `nonLoopbackDenials: 0`. Test commands used `--maxWorkers=1`; new configs replace `test.include` after spreading the base config.

| Label suffix | Result | Exit | Elapsed ms | Log SHA-256 |
| --- | --- | --- | --- | --- |
| `red-01` | 45 failures / 856 passes: 36 target failures and 9 reminder-fixture expectation failures, preserved | 1 | 8,688 | `239c6e39a91329ac4a06bed9fb691b71ba90377c8e4c36cde8dbebb4cd2b40b7` |
| `red-02` | Before product edit, after fixture correction: 36 target failures / 865 passes | 1 | 8,726 | `01148d2def455841d4a5e86ea9866235a7f1077255b5e68d40389271672f8e1b` |
| `green-01` | 901/901 focused tracked tests, 5 files | 0 | 8,521 | `a620a815f87a4ce1c3fa5c1d7172b6ddd450c3820f5a432fe275229d0ec3b7ff` |
| `regressions-01` | 1,525/1,525 tests, same 20-file regression scope | 0 | 34,251 | `0454fb50cbb84e5bef9df5429be623b9da547bf76335b491bdd2426cf7719c63` |
| `spec-green-01` | 40/40 unchanged spec assertions, including 4 actual panel/HTTP/save/reload flows | 0 | 4,243 | `4dce14dd8ba9f1a3d345037484f86c8241993a10c2995c8566d7cc1bb808bd80` |
| `controls-green-01` | Root's unchanged 18 action-boundary + 17 guidance controls, 35/35 | 0 | 1,473 | `b407f88bf90a27db06c869f50058e48b144e83a5e971d5d44a72937e099e8fe1` |
| `types-01` | Scoped TypeScript, empty diagnostic log | 0 | 2,478 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `lint-01` | ESLint on all 10 Task 2 files, empty diagnostic log | 0 | 4,753 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

`git diff --check` passed. Sibling wrapper `.json` files preserve stripped environment profiles, durations, exits, and log hashes. No artifact was overwritten.

## Exact reminder-fixture correction and contract evidence

The first RED's nine extra failures were the three genuine sentence-boundary positives for each of the three qualifiers. The direct `groundSourceSelfLevelHint` assertion already passed for the full compound text. The later reminder expectation failed because its synthetic item and requested reminder both cited the complete two-sentence source.

The unchanged worker implementation explains this distinction:

- `worker/document-executor/source-review-evidence.ts:207` documents that reminders are grounded in complete, uniquely locatable statements.
- Lines 233–237 enumerate `groundedStatementBoundaries(sources.text)` into statement entries.
- Lines 248–250 add an anchor to a statement only when `anchor.start >= outerStart && anchor.end <= end`.
- `supportedCodes` at lines 190–202 derives personal-item/implicit résumé context from those local anchors. Without that local personal-item context, an implicit phrase beginning with `按指导` does not become an unanchored personal-assessment reminder.

A full two-sentence quote is locatable; this is not a claim that the source is schema-invalid. Its item anchor simply is not contained within the first statement, and is not a local personal anchor for the following unrelated statement. Changing reminder scoping would be separate worker behavior work and was not authorized.

Before any product edit, only the nine reminder fixtures were corrected: their `reminderAction` now explicitly cites the first completed sentence, with its original ASCII or Chinese sentence punctuation, while `document(quote)` retains the whole two-sentence source. The direct worker-adapter assertion still receives the entire original compound candidate. Full compound text is also unchanged in shared, retention, service, and controlled UI tests. The revised reminder assertions test the existing statement-bound contract rather than weakening the full-action predicate check. The complete first RED log remains at the hash above, and the corrected RED still reproduces all 36 target failures.

## Exact independent spec copy

The original spec probe writes an existing RED results path with `flag: "wx"`. It was copied under the new prefix with exactly one results-path literal redirected. Reverse replacement was compared with the complete original source and was exactly equal. Assertions, inputs, imports, and test logic were unchanged.

| Artifact under `work/grounded-verification/` | SHA-256 |
| --- | --- |
| Original `edited-assessment-spec-recheck-20261108-boundaries.test.tsx` | `2529953f2de7cdb4bf1308492509e6a1c24f5848047aa227200fcac7d7b897c5` |
| New `edited-assessment-punctuation-repair-20261108-spec-probes.test.tsx` | `c961f3b87b031211b18477d58be5ea65ce88088e3d53559b3d0069228a9d41f7` |
| New `edited-assessment-punctuation-repair-20261108-spec-probe-results.json` | `2b0bbbe6a6ec276ae17a452f82d9a11876dea53f2216b2219c02cb136463fd41` |

All 40 assertions pass. Both React.js nominal-plan panel edits hide their button immediately, submit zero hints, save revision 1 with zero hints, and remain hidden after reload. The inability control also drops its hint; the actual-completion plus unrelated CSS-plan control keeps its original hint. Source text and sourceRef remain unchanged and adoption callbacks stay at zero. Each flow uses one synthetic provider response and zero real model calls.

## Final frozen identity

All paths below are relative to the workspace above. These are the complete ten Task 2 code/test hashes, not only this round's changed lines.

| File | SHA-256 |
| --- | --- |
| `app/lib/materials/skill-labels.ts` | `d2a5c3c69c1bd671a30b9597bcec44435baa21b3ce7aedd7664045217118bad0` |
| `app/lib/materials/self-assessment-evidence.ts` | `cb07c50bfce3fd2554a5fb1b80ac4c672951d7994ce8605f4eb0a892a0836b70` |
| `app/server/documents/review-service.ts` | `1dfafeaa80382a9a53dcf4a063c6585fad94c9dd52896e0d56b3eb8ded799700` |
| `app/components/materials/material-confirmation.tsx` | `085d355db29c4fac069bcad3f353f5de40298d2a53135aff66c0373cb79a81c4` |
| `app/components/materials/material-text-panel.tsx` | `b832754373e432f348f08f44234b39b7f5dfb39baba5e874b251d8a3f157bcf5` |
| `tests/lib/materials/retained-assessment-hints.test.ts` | `6c9c099c258fc7cf71bee4e24e64d69c355d651388509393125052c366bc2892` |
| `tests/lib/materials/self-assessment-evidence.test.ts` | `d96fba3093470cde72cccf022b13e37293ae2074d40cb77bae25fed7af2178f5` |
| `tests/server/document-review-draft.test.ts` | `9db81934b1155abc00e2f08bf1152a17885c6cd07bc6ba76bec906d5bfa34d54` |
| `tests/server/document-source-review-evidence.test.ts` | `4731c998d61f63770a79ee3980e9b136a49ac35f2c1b453c56a326184ae21980` |
| `tests/components/material-confirmation-source.test.tsx` | `7e073660388dac2d66e8f55497825a35e908597166cd636d4786e46bd1164698` |

## Limits and next owner

This is bounded author verification of technical-dot segmentation, not a general grammar or sentence-segmentation redesign and not independent spec/quality approval. No full-repository checks/build, native workerd/D1/R2, real browser, external network/model operation, commit, push, deployment, migration, or subagent was performed by the author. Scoped types include worker configuration and test matcher setup and exclude ignored work fixtures. Root owns fresh spec/quality reviews and final acceptance on this frozen identity.
