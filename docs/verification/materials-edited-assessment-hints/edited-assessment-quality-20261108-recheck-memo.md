# Task 2 independent code-quality recheck — PASS

Reviewed 2026-11-08 in `C:/Users/XF/.codex/worktrees/materials-replan-recovery/ui-warm-precision`.

PASS for the frozen candidate with shared evidence SHA-256 `cb07c50bfce3fd2554a5fb1b80ac4c672951d7994ce8605f4eb0a892a0836b70`. The prior P2 is closed by fresh execution of the original failing assertions and their actual panel → HTTP → save/reload flows. The subsequent dotted-name regression is also covered freshly. No remaining actionable correctness, compatibility, security, or maintainability finding was identified within the authorized bounded Task 2 scope.

The original CHANGES REQUESTED memo remains unchanged at SHA-256 `4088b90ede3416c1ffeccf2ce6a226ac7239211dac30f9d2a348db747011fc91`. This PASS applies to the replacement candidate; it does not retroactively approve either earlier failed candidate. Root full-repository and final integration gates remain separate.

## Repair and quality assessment

- **Bounded current-action repair:** `self-assessment-evidence.ts:55-65` obtains the existing practice-action match once, preserves the direct-action requirement for the short qualifier, and rejects the demonstrated negative complement and nominal-plan predicates. It checks the current action before later clause punctuation, rather than rejecting an entire fact merely because another activity mentions a plan or denial. The same bounded repair covers the authorized older Chinese guidance forms.
- **Technical punctuation:** the action check at line 62 retains an ASCII dot followed by `[A-Za-z0-9_]`, so `React.js` stays inside the predicate being checked. Genuine periods followed by whitespace or Chinese text, Chinese full stops, and the existing other punctuation terminate that action check. Fresh tests preserve completed practice followed by unrelated CSS reading plans or denied CSS activity. The new quality controls also cover a quoted `“React.js”` tool name, semicolons and exclamation marks, and older `按指导示例`, `按照指导教程`, and `由老师指导` qualifiers.
- **No new rule duplication or unsafe state:** the repair remains inside the shared pure predicate. It introduces no environment/network access, imports, mutable cache, new level assignment, or input-derived regular expression. The matched practice token is reused instead of rescanning it at the return. The added substring/regex operations remain bounded by the existing 1,000-unit fact/source input limits; hint and item collections remain capped at 100. This was a structural bounds review, not a new worst-case performance benchmark.
- **Retention and guards remain intact:** the four integration production files have exactly the prior reviewed hashes. The helper filters original hints after item/kind/exact-label membership, revalidates grounded or user-origin facts with only each hint's own label and original level, and does not mint, upgrade, or restore hints. The service still supplies trusted extraction projection and checks exact canonical original hints and prior membership before filtering. Fresh server tests preserve owner, source, origin, stale revision, atomic write/receipt, replay, and forged-ID/level rejection guards.
- **Historical and UI behavior:** untouched legacy/unwrapped and literal-v1 extracted summaries retain their earlier behavior, while edited facts revalidate. Source text, sourceRef, stored extraction data, and earlier confirmations remain protected in the repository suites. Unsupported suggestions disappear on the local edit render and are removed from queued requests; supported suggestions require an explicit adoption click.
- **Determinism and mutation:** a new test performs 150 alternating retention calls over frozen valid/invalid facts and frozen original hints. It verifies stable results, unchanged inputs, original hint object identity, and no restoration after a hint has been removed.
- **Test quality:** inspected all five test-file repair diffs. Existing assertions were preserved; new shared, worker, retention, real service and controlled UI cases cover the repaired predicates and technical punctuation. The unchanged original AI-flow fixture still passes. No contract, mapper, worker reminder implementation, or `materials-ai-flow.test.tsx` diff exists against `7fbb79abac39a02be1933782fe83250d466975e8`.

## Exact closure of previous failures

The original quality probe source was copied with exactly one `flag: "wx"` result-path literal redirected. The complete copied text, after reversing that one replacement, equaled the original source. The 16 assertions and their inputs were unchanged. Its six previously failing pure cases and three failing actual panel/save cases now pass.

The earlier spec dotted-name probe was handled identically: one output-path change only, full reverse-replacement equality, all 40 original assertions unchanged. Its previous React.js nominal-plan failures now pass, including the actual panel/save/reload paths.

Across both copied probes there are **eight real MaterialTextPanel → HTTP route → ReviewService → SQLite D1 adapter → reload flows**: six invalid edits and two supported controls. For every invalid edit, the button is absent immediately while saving is gated, the submitted hint count is zero, saved revision 1 has zero hints, and the button remains absent after remount/reload. The actual SQL completion and completed React.js plus later CSS-plan controls retain exactly their original hint. All eight preserve original source text and sourceRef, invoke zero adoption callbacks, and use one synthetic provider response each with zero real model calls.

The copied source/result hashes are recorded below. The earlier failing logs and results remain immutable.

## Reminder-fixture correction

Independently inspected the nine corrected tracked reminder fixtures and the unchanged worker contract. `groundSourceReviewPoints` enumerates complete statement boundaries at `worker/document-executor/source-review-evidence.ts:235-237` and includes an item/reminder anchor only when it fits inside the local statement at lines 248-250. Personal implicit résumé context at lines 190-202 therefore requires that local item anchor.

A two-sentence quote is locatable and is not schema-invalid, but its whole-span item anchor is not contained within the first statement. The correction changes only those reminder anchors to the actual first statement; the direct worker-hint assertion still receives the whole compound text. Shared, retention, service and UI punctuation cases also retain the complete compound text.

Three additional fresh quality probes independently verify this contract for `. `, `.`, and `。`: they assert the exact two statement strings with `React.js` intact; require the full compound candidate to yield `guided`; require no local confirmation reminder for whole-span anchors; then require the exact first-statement reminder when given first-statement anchors. All three pass. The fixture correction is appropriate and does not weaken the full-action hint check.

## Fresh verification

All Node commands used the required offline wrapper and new `edited-assessment-quality-recheck-20261108-*` labels. The Vitest config explicitly replaces `test.include` after spreading the base config. No previous output was overwritten.

```powershell
node work/grounded-verification/run.mjs edited-assessment-quality-recheck-20261108-focused-01 node_modules/vitest/vitest.mjs run --maxWorkers=1 --config work/grounded-verification/edited-assessment-quality-recheck-20261108-focused.config.ts
node work/grounded-verification/run.mjs edited-assessment-quality-recheck-20261108-lint-01 node_modules/eslint/bin/eslint.js app/lib/materials/skill-labels.ts app/lib/materials/self-assessment-evidence.ts app/server/documents/review-service.ts app/components/materials/material-confirmation.tsx app/components/materials/material-text-panel.tsx tests/lib/materials/retained-assessment-hints.test.ts tests/lib/materials/self-assessment-evidence.test.ts tests/server/document-review-draft.test.ts tests/server/document-source-review-evidence.test.ts tests/components/material-confirmation-source.test.tsx --no-cache
```

| Run | Result | Exit | Elapsed ms | Non-loopback denials | Log SHA-256 |
| --- | --- | --- | --- | --- | --- |
| `edited-assessment-quality-recheck-20261108-focused-01` | **998/998 tests, 9 suites** | 0 | 17,983 | 0 | `cf1a76245dc508fc6a0b165c013537d2e98e78347eaad98e2f3aa7df62a61d6e` |
| `edited-assessment-quality-recheck-20261108-lint-01` | All ten Task 2 code/test files; empty diagnostic log | 0 | 5,285 | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

Suite counts: retained hints 128; shared evidence 142; real review drafts 107; worker source review evidence 448; confirmation-source UI 76; unchanged materials AI flow 13; exact original quality probes 16; exact dotted-name spec probes 40; new quality controls 28. Total: **914 repository tests plus 84 independent probes**. The 28 new probes comprise 24 phrase/qualifier controls, one frozen-input determinism test, and three reminder-citation checks. No recheck run failed. SQLite experimental warnings were the only test diagnostics outside normal results.

`git diff --check` passed. All ten code/test hashes matched the freeze both before and after execution, recorded in `edited-assessment-quality-recheck-20261108-source-before.json` and `edited-assessment-quality-recheck-20261108-source-after.json`.

## Frozen reviewed identity

HEAD during the recheck: `fcfb6cda6ffd1f5d98e0d2d61ae4590f392abede`. Relative to checkpoint `32528d5`, the repair consists of the shared evidence module and five related test files; the four original integration production files are unchanged.

Author punctuation handoff independently verified at SHA-256 `c0fd9f5ff53485e8dc64a88edc356475a6145b86323448e7b94d96a6c7615b60`. Second spec recheck memo independently verified at SHA-256 `97c5816c241061033f13d5cd4f52ba43b1de04e1623ae6ed604ab995b099c064`.

| File relative to workspace | SHA-256 |
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

## Review artifacts

All paths below are relative to `work/grounded-verification/`.

| Artifact | SHA-256 |
| --- | --- |
| Original `edited-assessment-quality-20261108-red-probes.test.tsx` | `8a5d7ae4eb0d1c7200785c364abcc195b38f3c55eded2ab1b7a75834e7fec981` |
| Original `edited-assessment-quality-20261108-red-probe-results.json` | `3f6e173ebc9eda5427f6e5d0c505af730c8d4a6c04eb06783819697791ac723b` |
| Original `edited-assessment-spec-recheck-20261108-boundaries.test.tsx` | `2529953f2de7cdb4bf1308492509e6a1c24f5848047aa227200fcac7d7b897c5` |
| `edited-assessment-quality-recheck-20261108-original-probes.test.tsx` | `d023c738523fb1f08942f49ff0bdc17f59ca871665fb6d5e8af9e01200267fcd` |
| `edited-assessment-quality-recheck-20261108-original-probe-results.json` | `f89d71d8ed45efe5c72e484eb5d450a33afac65e1ee1a2816a32097d49cd9957` |
| `edited-assessment-quality-recheck-20261108-dotted-probes.test.tsx` | `05e56b0887ac6810585d0c4c8b2e767a89d7a8edc62e2f24dae13aabd1126f28` |
| `edited-assessment-quality-recheck-20261108-dotted-probe-results.json` | `2b0bbbe6a6ec276ae17a452f82d9a11876dea53f2216b2219c02cb136463fd41` |
| `edited-assessment-quality-recheck-20261108-controls.test.ts` | `19215dfe98a6242f6897a3a8df640ea2548c1b6f1bb893c2f9ae456afa2d786e` |
| `edited-assessment-quality-recheck-20261108-focused.config.ts` | `809f4bb3a4f6cb0bb8ad3d47a370e206963aff5d6067f4dc43676ba3b2ae5da8` |

## Limits and handoff

No tracked source or documentation was edited. Only ignored recheck artifacts and this requested ignored memo were created. No commit, push, external network/model call, deployment, migration, subagent, or real browser was used. Native workerd/D1/R2, full-repository tests/types/lint/build, and root final acceptance were not rerun by this reviewer and are not implied by this quality PASS. The existing parser's behavior outside the authorized phrase/action/punctuation families was not expanded into a general grammar redesign.

The repaired candidate is ready for root's remaining final checks and integration. Keep prior failed evidence and this replacement-identity approval distinct.
