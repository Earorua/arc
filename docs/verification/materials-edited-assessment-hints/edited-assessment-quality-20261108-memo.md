# Task 2 independent code-quality review — CHANGES REQUESTED

Reviewed 2026-11-08 in `C:/Users/XF/.codex/worktrees/materials-replan-recovery/ui-warm-precision`.

The frozen candidate has one actionable P2 correctness finding. The retention integration and existing identity/source/write guards passed the bounded review, but the newly added short Chinese guidance branch retains suggestions for explicit inability and unexecuted future plans. This candidate is not approved as PASS.

## Finding

**[P2] Reject negated or merely planned actions after the short guidance qualifier — `app/lib/materials/self-assessment-evidence.ts:57` (context: lines 52–59).**

The new `zh[1]` branch only checks whether `practiceAction` begins at index zero. A leading `完成` therefore suffices even when its remainder negates completion (`完成不了`) or makes the entire action an unexecuted plan (`完成 … 是我下周的计划`, `完成 … 的计划尚未执行`). These are bounded variants of the newly authorized `按指导` / `按照指导` family, not a request to redesign the general parser.

All six examples below return **false on the actual `7fbb79` shared evidence function and true on this candidate**. The current worker adapter returns `guided` and the retention helper keeps the original guided SQL hint in every case:

| Edited text | Required current support | Observed current support |
| --- | --- | --- |
| `按指导完成不了 SQL 查询练习` | false | true |
| `按照指导完成不了 SQL 查询练习` | false | true |
| `按指导完成 SQL 查询练习是我下周的计划。` | false | true |
| `按照指导完成 SQL 查询练习是我下周的计划。` | false | true |
| `按指导完成 SQL 查询练习的计划尚未执行。` | false | true |
| `按照指导完成 SQL 查询练习的计划尚未执行。` | false | true |

The real `MaterialTextPanel` → HTTP route → `ReviewService` → SQLite D1 adapter flow reproduced the first, third, and fifth texts independently. Each fixture began with a valid extracted `I tested SQL under supervision.` fact and its authentic original hint, then edited that fact through the real panel. For each invalid edit:

- The adoption button remained visible immediately, including while the save was gated.
- The panel submitted one original hint; save revision 1 retained that hint.
- Reading the saved draft and remounting the panel still showed the guided suggestion.
- The edited fact, original source text, and source reference were preserved correctly; no adoption callback was invoked. This is unsupported advice being retained, not a failed write or automatic adoption.

The positive control `按指导完成 SQL 查询练习后，我记录了结果。` retained its authentic hint through the same full flow. The pure tests also preserve the `按照指导` past-completion equivalent, both prior longer instructional forms, and prefix-negation/future controls. A bounded repair should reject the negated/nominal future forms in the new short family while retaining these positive controls; add matching shared/worker and save/UI regression assertions. No tracked repair was made by this reviewer.

The earlier `在导师指导下完成不了 SQL 查询练习` form was true before and after this change. That inherited limitation is recorded in the exploratory output and is **not** raised as a new regression. Similarly, exploratory report-object and instructional-noun observations are not separate findings. The six short-form cases above are sufficient to demonstrate the new branch's concrete regression.

## Review scope and other quality observations

- Base: `7fbb79abac39a02be1933782fe83250d466975e8`; HEAD during review: `e0dd885288b2a232ad68797e851f14c5aec72c8d`.
- Read all five production changes, all five changed/new test files, the surrounding service item/identity/source/revision/atomic guards, the panel save queue, the contracts' input bounds, and the existing shared evidence dependencies.
- The author handoff SHA-256 independently matched `f5bbf6dae768987fc88925baf0d28fb1a8b1ec95c0ff9220ee28cb82e31c53e1`; the spec memo matched `23408394201eaf4ffc8fb2fad9ac03697115fb8b8b685928906ed2877dfa5f1e`.
- The helper remains a filter returning original hint objects. It checks existing fact/kind/label membership first, uses each hint's own label and level, and does not mint or mutate hints. All three callers provide projection; the service's value comes from validated extraction data. Exact original-hint equality is checked before semantic filtering, and prior membership remains enforced.
- Legacy extracted summaries still bypass evidence revalidation, while all user-origin facts and grounded facts use the shared predicate. The current change keeps the existing semantics in one pure shared dependency rather than duplicating a UI/server parser. The failure above originates in that shared predicate, not in a discrepancy among callers.
- The new tracked tests use actual helpers/services/components and preserve existing assertions. All 617 targeted existing/author tests passed freshly; their missing suffix/nominal controls explain why they did not expose this finding.
- A schema-valid 127,537-byte draft with 100 items, 100 hints, and 1,000-character fact text was evaluated five times. Each call retained the same original hint objects; durations were 167.42, 143.79, 138.56, 143.40, and 142.76 ms on this machine. This is a bounded cost observation, not a browser latency or worst-case regex guarantee; no separate performance finding is asserted.
- `git diff --check` passed. All ten reviewed code/test hashes were unchanged before and after the fresh runs. The root-owned plan edits were observed and left untouched.

## Fresh verification

Every Node execution used the offline wrapper and a unique label. Configs explicitly replace `test.include` after spreading the base configuration; no include-array concatenation was used.

```powershell
node work/grounded-verification/run.mjs edited-assessment-quality-20261108-observations-01 node_modules/vitest/vitest.mjs run --maxWorkers=1 --config work/grounded-verification/edited-assessment-quality-20261108-observations.config.ts
node work/grounded-verification/run.mjs edited-assessment-quality-20261108-focused-01 node_modules/vitest/vitest.mjs run --maxWorkers=1 --config work/grounded-verification/edited-assessment-quality-20261108-focused.config.ts
```

| Run | Result | Exit | Denials | Log SHA-256 |
| --- | --- | --- | --- | --- |
| `edited-assessment-quality-20261108-observations-01` | 2/2 observation/smoke tests; 1 suite; 13 phrase observations and five full-size filter timings | 0 | 0 | `564ab250d5c1ac32540e5a86e8dcffb5dd806935aba24afa9c728a26b01a515c` |
| `edited-assessment-quality-20261108-focused-01` | **9 failed / 624 passed**, 7 suites; 617 tracked cases passed; independent cases: 6 pure failures + 3 real panel/save failures + 7 passing controls | 1 | 0 | `70544efb8c97e599d078ddc08496728f68e2a8b0088bb86cfe6149e600200e46` |

The focused 633-test run comprises retained hints 38, shared evidence 97, review drafts 44, source review evidence 403, confirmation source UI 22, unchanged materials AI flow 13, and independent probes 16. The 30 soft assertion failures are grouped into nine failed tests; they are the expected semantic/UI symptoms described above, not 30 distinct failures. Across both fresh runs: 635 tests executed, 626 passed and nine failed. The observations test characterizes its data; its passing status is not semantic acceptance of the observed false positives.

The differential baseline is the actual pre-change shared module saved under the review prefix. Only its three import paths were adjusted for the ignored folder. Reversing those paths and comparing the complete source to `git show 7fbb79:app/lib/materials/self-assessment-evidence.ts` yielded exact equality. The old long-qualifier behavior is therefore distinguished from the newly enabled short-qualifier behavior using executable evidence.

The four route/component fixtures use the repository's real route/service/persistence pipeline. Only provider responses, network transport, and workflow scheduling are in-memory test doubles. Each used one synthetic provider response and zero real model calls. SQLite's experimental warning was the only non-assertion warning. The full logs and wrapper metadata remain preserved.

## Reviewed code/test SHA-256

| File | SHA-256 |
| --- | --- |
| `app/lib/materials/skill-labels.ts` | `d2a5c3c69c1bd671a30b9597bcec44435baa21b3ce7aedd7664045217118bad0` |
| `app/lib/materials/self-assessment-evidence.ts` | `5532f05b2f0e6d71720b0cb79896f98de876d50adfdf3e66c7012cb9400236b7` |
| `app/server/documents/review-service.ts` | `1dfafeaa80382a9a53dcf4a063c6585fad94c9dd52896e0d56b3eb8ded799700` |
| `app/components/materials/material-confirmation.tsx` | `085d355db29c4fac069bcad3f353f5de40298d2a53135aff66c0373cb79a81c4` |
| `app/components/materials/material-text-panel.tsx` | `b832754373e432f348f08f44234b39b7f5dfb39baba5e874b251d8a3f157bcf5` |
| `tests/lib/materials/retained-assessment-hints.test.ts` | `ccaf02bbc58d4fac87937b5a34fef207a8f8e5b11a7ec5f0d2b4417d4bdaa201` |
| `tests/lib/materials/self-assessment-evidence.test.ts` | `6e0ff8bfa9bc985230469acb234481cf0a60005bf3cd4e38e18b4a010e7a2088` |
| `tests/server/document-review-draft.test.ts` | `65d3ab90d67901b8a9f7952a61fc224b79aff8b4f478649e836be273328d799e` |
| `tests/server/document-source-review-evidence.test.ts` | `515beb6c86d4a16cdf9f6ee2ed2b690c4057cfa9ce85b1f16249726ba96ebe00` |
| `tests/components/material-confirmation-source.test.tsx` | `d799502c3f6d59333bc42e12bb0edd0a5f3664a5e91484f81a5013b1251db6c5` |

## Review artifact SHA-256

All names below are relative to `work/grounded-verification/`.

| Artifact | SHA-256 |
| --- | --- |
| `edited-assessment-quality-20261108-base-evidence.ts` | `495f55312d87d815cd70f4d2d6b31678946421dd474c5ea9f601103808636af1` |
| `edited-assessment-quality-20261108-red-probes.test.tsx` | `8a5d7ae4eb0d1c7200785c364abcc195b38f3c55eded2ab1b7a75834e7fec981` |
| `edited-assessment-quality-20261108-focused.config.ts` | `3951e1bb21e4663a2085f8a099ee6da48e2afd6a7a2422d62c162eb0fbac9e41` |
| `edited-assessment-quality-20261108-red-probe-results.json` | `3f6e173ebc9eda5427f6e5d0c505af730c8d4a6c04eb06783819697791ac723b` |
| `edited-assessment-quality-20261108-phrase-observations.json` | `3af5d38c0639a6af3eec4cd9b26bf44cf598647aeb19350510c32d2fd345b817` |
| `edited-assessment-quality-20261108-bounded-cost-results.json` | `77e0673dec3ddc54684eb6d0a27867d2ae837834ad93e385ae94e2d26b08ec48` |

## Limits and handoff

No tracked file was edited; reviewer artifacts are confined to the ignored review prefix. No commit, push, migration, deployment, external network operation, real model call, or subagent was performed. This review did not run native workerd/D1/R2, a real browser, full-repository tests/types/lint/build, or new broad grammar probing. The root's earlier and current candidate-specific gates are not counted as fresh evidence here.

The root was notified promptly of the reproduced finding and owns the bounded repair, replacement source identity, fresh verification, and subsequent re-review. Prior green evidence on this frozen candidate does not close this P2 finding.
