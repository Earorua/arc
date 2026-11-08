# Task 2 independent spec review — PASS

Reviewed 2026-11-08 in `C:/Users/XF/.codex/worktrees/materials-replan-recovery/ui-warm-precision`.

## Verdict and scope

PASS. No actionable spec-compliance finding was identified after reading the implementation, surrounding identity/source/write guards, the changed tests, and independently executing the checks below. This is the spec stage; a separate quality review and root integration gates remain distinct.

- Review base: `7fbb79abac39a02be1933782fe83250d466975e8`.
- HEAD at review: `e0dd885288b2a232ad68797e851f14c5aec72c8d` (plan amendment only).
- Inspected the five changed production files and all five changed/new test files. The author handoff SHA-256 was independently confirmed as `f5bbf6dae768987fc88925baf0d28fb1a8b1ec95c0ff9220ee28cb82e31c53e1`, and every code/test hash matched its final manifest before and after the targeted run.
- The root-owned plan-document working change was observed and was not edited by this reviewer. No tracked file was edited. Reviewer artifacts exist only under ignored `work/grounded-verification/edited-assessment-spec-20261108-*`.
- No network/model/deploy/migration/push/commit operation was performed. Every Node execution used `node work/grounded-verification/run.mjs UNIQUE-LABEL ...`; both runs recorded zero non-loopback denials. No subagent was spawned.

## Requirement review

1. **Original membership, current evidence, and no synthesis:** `app/lib/materials/skill-labels.ts:33-40` preserves fact lookup, personal kinds, exact listed-label membership and the old list-free legacy rule. The new optional third argument drives exactly `projection === GROUNDED_MATERIAL_REVIEW_PROJECTION || item.origin === "user"`; the shared function receives only `[hint.skillLabel]` and the existing level. `filter` returns the original hint objects without minting or modifying levels. Independent cases verify exact-case membership, same-object preservation/no input mutation, two supported original levels in a mixed SQL/React fact, no promotion, cannot-to-uncertain rejection, no minting, and no restoration after removal.

2. **All three production callers and server authority:** repository search found the three call sites. `review-service.ts:249-250` passes the trusted validated extraction projection. `material-confirmation.tsx:39` and `material-text-panel.tsx:373` pass the current draft projection. The exact canonical original-hint check remains at `review-service.ts:247-248`, followed by prior ID membership. Item provenance/source checks remain at `review-service.ts:43-73` and `:240-245`; owner/current revision/replay checks remain at `:209-239`; active-version, extraction, write and changed-row atomic guards remain at `:262-274`. The fresh 44-test server suite confirms authentic unsupported edits save with no hint, forged ID/candidate/label/level reject, owner/source/origin guard failures reject, stale revisions conflict, rollback removes both draft write and receipt, and valid retry succeeds.

3. **Historical boundary and immutable records:** the new evidence gate skips untouched unwrapped/literal-v1 extracted summaries, but applies to all user-origin edits and grounded extracted facts. Fresh tracked cases cover editing another item while preserving an untouched old summary, list-free user edits, and grounded extracted revalidation. The independent server matrix exercises all three forms through save/read/replay and compares complete extraction rows, prior confirmation rows, source bucket objects and source references before/after. No production history/extraction dispatch, schema, mapper, practice behavior, or projection version was changed.

4. **Immediate UI and explicit adoption:** `MaterialConfirmation` computes hints on every render from current items; `MaterialTextPanel` filters before setting local draft and before submitting the queued save. Edited text is marked user-origin by `material-confirmation.tsx:64-66`. Adoption is only in the explicit button handler at `:87-89`. Fresh controlled UI cases cover saving state, unsupported section/button removal, no invented uncertainty, original quote retention, zero callback on edit, mixed-skill filtering, and a supported explicit click. Independent mixed-level UI probe removes SQL while preserving React conceptual adoption. The unchanged `materials-ai-flow.test.tsx` passes all 13 cases, including the original short-guidance fixture.

5. **Required positive/negative semantic controls:** the fresh retention and shared/worker suites cover other actor, future, condition, denied action/guidance, quoted whole propositions, guidance removal, true personal practice, quoted tool names, personal uncertainty, inability without new uncertainty, repeated skill in an unsupported task, removed fact/label, empty label lists, non-personal kinds, and added terms without new hints. Per-hint scope, exact membership and preserved original levels have additional independent checks.

6. **Authorized shared delta only:** the diff against `7fbb79` in `self-assessment-evidence.ts` is confined to the new final Chinese qualifier alternative `(按(?:照)?指导)` at line 24 and its direct existing-practice-action index-zero guard at lines 54-57. Earlier longer alternatives precede it, so `按指导示例…` and `按照指导教程…` retain precedence. The existing practice-action vocabulary, actor guard, denial logic, quote masking and assertion-scope rules are otherwise unchanged. Independent controls cover both short forms, initial `我`, Chinese/ASCII commas, quoted tool names, both older longer forms, condition/report/whole-quotation/other-actor/denial/future controls, and disallowing non-direct action after the short qualifier. The shared and worker paths agree. The additional real ReviewService matrix proves valid short/long forms retain the exact original hint, invalid forms drop it while saving, and all three historical forms preserve source and earlier confirmation data.

## Fresh verification

Configs explicitly spread the base config and replace `test.include`; no `mergeConfig` concatenation was used. The default jsdom environment remains for UI tests; the independent persistence fixture declares the node environment and uses the real ReviewService with the repository's SQLite D1 adapter and in-memory source storage.

| Wrapper label | Outcome | Log SHA-256 |
| --- | --- | --- |
| `edited-assessment-spec-20261108-targeted-01` | Exit 0; 7 suites, 657 tests; 2,947 ms; denials 0 | `55387d706a7ed39a97cbb806a72cba7423e05fa06b2fe285ee113c6b9d1619f3` |
| `edited-assessment-spec-20261108-save-01` | Exit 0; 1 suite, 24 tests; 1,616 ms; denials 0 | `5785efa87dd40523a01ada861921a812633eb2b350fcfa18aebe6cd54b7b4bf9` |

Total fresh result: **681/681 tests passed in 8 suites**, comprising **64 independent probes** and 617 existing/author tests. No failing review run occurred. The SQLite experimental warning is the only non-test diagnostic in the successful outputs.

Targeted suite counts: retained hints 38; shared evidence 97; review drafts 44; source review evidence 403; confirmation source UI 22; unchanged materials AI flow 13; independent helper/worker/UI probes 40. Separate independent persistence matrix: 8 text cases × legacy/literal/grounded = 24.

- Test/config artifacts: `edited-assessment-spec-20261108-probes.test.tsx`, `edited-assessment-spec-20261108-targeted.config.ts`, `edited-assessment-spec-20261108-save-probes.test.ts`, `edited-assessment-spec-20261108-save.config.ts`.
- Wrapper `.json` metadata and full `.log` files are preserved for both unique labels.
- `git diff --check` passed. Diff inspection confirmed no change from the base to `tests/components/materials-ai-flow.test.tsx`, `app/lib/materials/skill-mapper.ts`, contract/schema files, or worker files.

## Reviewed production hashes

| File | SHA-256 |
| --- | --- |
| `app/lib/materials/skill-labels.ts` | `d2a5c3c69c1bd671a30b9597bcec44435baa21b3ce7aedd7664045217118bad0` |
| `app/lib/materials/self-assessment-evidence.ts` | `5532f05b2f0e6d71720b0cb79896f98de876d50adfdf3e66c7012cb9400236b7` |
| `app/server/documents/review-service.ts` | `1dfafeaa80382a9a53dcf4a063c6585fad94c9dd52896e0d56b3eb8ded799700` |
| `app/components/materials/material-confirmation.tsx` | `085d355db29c4fac069bcad3f353f5de40298d2a53135aff66c0373cb79a81c4` |
| `app/components/materials/material-text-panel.tsx` | `b832754373e432f348f08f44234b39b7f5dfb39baba5e874b251d8a3f157bcf5` |

## Limits

This review did not execute native workerd/D1/R2 or the root's actual MaterialTextPanel → HTTP integration harness, a browser, full-repository types/lint/build, or the whole test repository. Those remain root-owned gates; earlier intermediate root results were not substituted for this review's fresh evidence. The spec result applies to the exact hashes above and the authorized bounded shared delta; it does not characterize unrequested general natural-language grammar behavior. The old Task 1 pure-move proof was not repeated or broadened.
