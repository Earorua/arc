# Task 2 P2 repair author handoff — DONE, frozen for independent review

## Candidate and scope

- Workspace: `C:/Users/XF/.codex/worktrees/materials-replan-recovery/ui-warm-precision`.
- Repair started from root's known-failing checkpoint `32528d541215aa407d6a26b28b26d641fee64bf5`.
- Observed HEAD at final verification: `0f066875af76294bb5f1fe7a27df393ef927cb68` (root-owned documentation progress). The author made no commits and did not edit documentation or the separate experience-attribution plan.
- All source and test files were frozen before sending the ready notification. No edits to source/tests followed the final test/type/lint runs or the freeze.
- This is author verification of the replacement candidate. The original 681-case spec PASS and P2 quality memo remain evidence for their original identity, not approval of this replacement. Root owns fresh spec review, quality review, and final gates.

## Concrete repair

The shared Chinese guidance branch now obtains the existing `practiceAction` match once, preserves the leading-action requirement for the short qualifier, and checks the remainder of that action up to the next punctuation boundary. It rejects the negative complement `不了`, a predicate presenting the action as a plan, and the explicit unexecuted-plan form. These checks apply to both the short `按指导` / `按照指导` qualifiers and the prior `在导师指导下` family.

The repair does not search the entire fact for generic `不` or `计划`. The completed SQL action remains supported when a following clause records its result, describes future React reading, or denies ability to finish a React page. The existing practice-action vocabulary, qualifier precedence, actor/source/label guards, whole-proposition quotation masking, quoted-tool handling, and English denial handling remain in place.

Only one production file changed relative to the checkpoint: `app/lib/materials/self-assessment-evidence.ts`. Five existing tracked test files gained the bounded regression matrix. No schema, mapping, practice-priority, source envelope, confirmation, or history behavior was changed.

## Tracked TDD cases

For each of `按指导`, `按照指导`, and `在导师指导下`, the tests reject:

- `完成不了 SQL 查询练习`
- `完成 SQL 查询练习是我下周的计划。`
- `完成 SQL 查询练习的计划尚未执行。`

For each qualifier, they retain:

- `完成 SQL 查询练习后，我记录了结果。`
- `完成 SQL 查询练习，明天计划阅读 React 文档。`
- `完成 SQL 查询练习，但我无法完成 React 页面。`

The matrix runs through the shared predicate, worker self-level adapter and confirmation reminders, retention for both historical and grounded edits, actual ReviewService save/read/replay, and immediate controlled UI renders. Service negatives run for unwrapped legacy, literal-v1, and grounded-v2. Positive UI cases still require an explicit supported-button click for adoption. The service tests preserve sourceRef, original stored text and extraction capture, and revision/identity/owner guards.

## Fresh verification

Every Node execution used `node work/grounded-verification/run.mjs` with a new `edited-assessment-repair-20261108-*` label. Every run recorded `nonLoopbackDenials: 0`. All prior artifacts remain intact. Configs replace `test.include` after spreading the base configuration and use `--maxWorkers=1` for test runs.

| Label after `edited-assessment-repair-20261108-` | Outcome | Elapsed ms | Log SHA-256 |
| --- | --- | --- | --- |
| `red-01` | Before product edit: 81 expected failures / 658 passes, 5 files, exit 1 | 7,986 | `1d5c247d1ccc3692b15019e0e11378878f1803aed2069874a3184aa47ff4ba7c` |
| `green-01` | 739/739 tracked focused cases, 5 files, exit 0 | 7,825 | `c5ec27f2896aa0e67863c54e0efa99dfe15b28db53ecfd4229f22e1e3b213947` |
| `regressions-01` | 1,363/1,363 cases, 20 files, exit 0 | 33,826 | `f41407fbedfb95420478af530c936ff7602d26fac9c0c048d04dcadaea1efbfa` |
| `reviewer-green-01` | 16/16 unchanged reviewer assertions, including 4 real panel/HTTP flows, exit 0 | 4,274 | `78c68e8f5ecb3b44b81cf52f0e039727e2fdba874fc6ef087e49f7033e6d31a5` |
| `controls-green-01` | Root's unchanged 18 action-boundary + 17 earlier guidance controls, 35/35, exit 0 | 1,470 | `8f1b854d76aaf88448ebb4543e5531fea5192e79d0e9fab39816b7699217bc4a` |
| `types-01` | Scoped TypeScript, exit 0; empty diagnostics | 2,446 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `lint-01` | ESLint on all 10 Task 2 files, exit 0; empty diagnostics | 5,588 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

The final 20-file suite includes source evidence, source spans, extraction, review points, confirmation, grounded word membership, deletion races, source-term correction, workspace adoption, boundaries, recovery, and the existing frozen B0 UI rehearsal. Existing `materials-ai-flow.test.tsx` remains unchanged and passes.

`git diff --check` passed. Wrapper `.json` files retain exact command outcomes, stripped temporary environment profile paths, durations, and log hashes. There were no harness-error retries in this repair round.

## Unchanged independent probes and real UI outcome

The original reviewer probe uses a fixed output filename with `flag: "wx"`; rerunning that file directly would collide with its preserved RED observations. A copy was therefore made under the repair prefix, changing exactly one output-path literal. Reverse replacement was compared with the complete original file and was exactly equal. All test logic, inputs, expectations, and original baseline imports were unchanged.

| Probe artifact | SHA-256 |
| --- | --- |
| Original `edited-assessment-quality-20261108-red-probes.test.tsx` | `8a5d7ae4eb0d1c7200785c364abcc195b38f3c55eded2ab1b7a75834e7fec981` |
| Output-redirected `edited-assessment-repair-20261108-reviewer-probes.test.tsx` | `0a85928eb0f45ee082830641e78abb0fb200ba088abd181d05be226b9fe08860` |
| New `edited-assessment-repair-20261108-reviewer-probe-results.json` | `f89d71d8ed45efe5c72e484eb5d450a33afac65e1ee1a2816a32097d49cd9957` |

For all three invalid real panel edits, the observations now record: `immediatelyShown: false`, request hint count 0, saved hint count 0, `reloadedShown: false`, saved revision 1, preserved source, and zero adoption callback calls. The completed-action positive records all four retention indicators as true/1 while preserving source and making zero adoption calls. Each flow used one synthetic provider response and zero real model calls.

The root's original 18- and 17-case source files were used without modification by a new repair config. Their old wrapper outputs and the original quality/spec memos were not overwritten.

## Frozen final Task 2 file identity

Paths below are relative to the workspace stated above. Six of these ten files changed in this repair round; all ten hashes identify the complete replacement candidate.

| File | SHA-256 |
| --- | --- |
| `app/lib/materials/skill-labels.ts` | `d2a5c3c69c1bd671a30b9597bcec44435baa21b3ce7aedd7664045217118bad0` |
| `app/lib/materials/self-assessment-evidence.ts` | `8a44bd187cb5f2bf1f16f9eeb04b5039f237cedd6f65f12ca513ecd0f7da8768` |
| `app/server/documents/review-service.ts` | `1dfafeaa80382a9a53dcf4a063c6585fad94c9dd52896e0d56b3eb8ded799700` |
| `app/components/materials/material-confirmation.tsx` | `085d355db29c4fac069bcad3f353f5de40298d2a53135aff66c0373cb79a81c4` |
| `app/components/materials/material-text-panel.tsx` | `b832754373e432f348f08f44234b39b7f5dfb39baba5e874b251d8a3f157bcf5` |
| `tests/lib/materials/retained-assessment-hints.test.ts` | `a213ef382d2164171f65982cc628b06ec234afa43e40bccbbc8ca15c0d7d8e79` |
| `tests/lib/materials/self-assessment-evidence.test.ts` | `e8909b80059cc944917e3241d60f08c564cd00cf450ff004a56d54ce6dac9001` |
| `tests/server/document-review-draft.test.ts` | `df91d91ed0ecb9ee78e0076a318024b993ca98df8bd519b7672d19d38d46bd0a` |
| `tests/server/document-source-review-evidence.test.ts` | `096d5024c341d4b5ad22f856e1e067c3df5d2c9979b52393264590c7e7bf9577` |
| `tests/components/material-confirmation-source.test.tsx` | `673152ad915c83f5d82d60384117167a2bce5d3e6cad519b8eb76cd36431c681` |

## Limits

This repairs the concrete inability-complement and action-as-plan forms in the authorized scope; it does not claim a complete Chinese grammar classifier. No full-repository tests/types/build, native workerd/D1/R2, browser session, real model, external network operation, push, migration, deployment, or subagent was run by the author. Scoped types include `worker-configuration.d.ts` and test matcher setup and exclude ignored work fixtures. Root owns the remaining independent reviews and final acceptance checks on this frozen identity.
