# Task 2 author handoff — DONE

## Scope and authorization

- Workspace: `C:/Users/XF/.codex/worktrees/materials-replan-recovery/ui-warm-precision`.
- Starting code HEAD: `7fbb79abac39a02be1933782fe83250d466975e8`.
- Current HEAD when handing off: `e0dd885288b2a232ad68797e851f14c5aec72c8d` (root's plan amendment; author made no commits).
- Offline repairs and tests only. Every Node execution used `node work/grounded-verification/run.mjs UNIQUE-LABEL ...` with the author prefix. No live model, external network, deployment, remote migration, push, browser, or subagent was used. Every wrapper recorded `nonLoopbackDenials: 0`.
- Root retains ownership of commits, documentation, and final native workerd/D1 + real panel HTTP gate checks. Root's prior RED artifacts were not changed or rerun by the author.
- Initially Task 1 evidence semantics were left unchanged. After the existing Chinese UI phrase failed, root recorded its own 5-fail / 12-pass baseline, committed the plan amendment, and authorized the bounded short-guidance extension below.

## Final behavior

- `retainedMaterialSelfAssessmentHints` now accepts the optional current review projection. It preserves the existing fact existence, personal kind, and word-membership checks, then revalidates every user-origin fact and every grounded-v2 fact using the shared pure evidence API. Each hint is checked against only its own skill label and original level.
- All three production callers explicitly supply projection. The server uses the trusted extraction projection; `MaterialConfirmation` and `MaterialTextPanel` use the current draft projection.
- An authentic but unsupported hint is dropped while its valid edit saves successfully. The exact canonical original-hint check and prior-hint membership check remain intact. Unsupported hint removal cannot create, upgrade, restore, or mint another hint. Forged identities or changed levels still reject the write.
- Untouched legacy/unwrapped and literal-v1 extracted summaries retain previous behavior. Editing another fact does not clear such summaries' hints. Original source text, references, extraction envelopes, and previous confirmations remain immutable.
- A controlled edit render immediately hides unsupported suggestions/buttons, including while saving. Supported suggestions invoke adoption only through an explicit button click.
- Authorized compatibility delta: recognize `按指导` / `按照指导` in the existing Chinese guidance parser, requiring an existing `practiceAction` match at action index 0 for that short qualifier only. Existing actor, denial, quoting, and scope guards remain. The short alternative follows the older alternatives so `按指导示例…` and `按照指导教程…` retain their existing interpretation. No guidance noun vocabulary, practice action vocabulary, or unrelated Chinese denial logic changed.
- `tests/components/materials-ai-flow.test.tsx` and all frozen references are unchanged.

## Verification and immutable evidence

Commands used the checked-in local dependencies and the wrapper. Vitest configs spread the base config and replace `test.include`; they do not concatenate the default test suite. Scope is listed in `edited-assessment-author-20261108-regressions.config.ts`.

| Run label after `edited-assessment-author-20261108-` | Outcome | Log SHA-256 |
| --- | --- | --- |
| `red-02` | Before product edits: 65 expected failures, 36 passes, 3 files; exit 1 | `317106a3553272c46ac028c941f457d12d786717e2f75858bd16e2d392901c29` |
| `green-02` | Initial repair: 101/101, 3 files; exit 0 | `fb0b9318434d4fc183c84dee20ed4689a88fba87f24de7cc0bfc047b0edac955` |
| `green-03` | Added server-owned projection and stronger rollback check: 102/102; exit 0 | `096964e90bf8a8660c522a449313e40638a884548cea9c25d1db1557862c96e2` |
| `regressions-01` | 1 failure / 1,180 passes: existing `按指导完成 SQL 查询练习` UI fixture; reported to root without changing it | `46889c5f68e603ad53c2c464636534db203c40c18fbd9f00093c66c10aa3d9f2` |
| `guidance-red-01` | Before authorized shared delta: 15 expected failures / 532 passes, 4 files; exit 1 | `054877456490b4a92874bf0cee56d0df8f3bb95e86f5c5cd03d06d35fe5ce553` |
| `guidance-green-01` | Short-guidance tests and original UI flow: 547/547; exit 0 | `beaadd9744fbf2c2a66ee31735bea971573eb3f785d7eb519560379f1c22ab6a` |
| `guidance-prefix-red-01` | Added compatibility controls detect short alternative shadowing older instructional qualifiers: 4 failures / 496 passes; exit 1 | `59ad115f85eda29ae19e90bd18d02c75d1baecb55ed853514abfdbd28dbf0bbb` |
| `regressions-02` | Final: 20 files / 1,228 tests passed, exit 0, 11,323 ms | `70cf1e694d9a594758f6621655850bfb9178730ea70652f4835702b19c8ad7b6` |
| `guidance-root-controls-green-01` | Root's unchanged 17 guidance controls: 17/17, exit 0, 2,319 ms | `500781e13068caefb1a7a6d3c7efff5ab4ea59473f0a9bcad2e9c856bfb35476` |
| `types-03` | Final scoped TypeScript: exit 0, 4,769 ms, empty diagnostic log | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `lint-02` | Final ESLint on all 10 changed files: exit 0, 8,210 ms, empty diagnostic log | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

All listed runs have sibling `.json` wrapper metadata containing elapsed time, log hash, temporary stripped environment profile, exit code, and zero non-loopback denials. All earlier logs remain present: `red-01` exposed five malformed table-case invocations and an incorrect expected atomic error code (fixed before any product patch); `green-01` exposed seven duplicate-blockquote test queries after the behavior assertions passed; `types-01` omitted the existing `tests/setup.ts` matcher augmentation from the scoped config. Those harness issues were corrected, preserving all failed artifacts. `types-02` and `lint-01` were also successful intermediate checks.

Final `git diff --check`: clean.

## Test coverage

- Retention helper: colleague, future, conditional, denied action/guidance, whole quoted proposition, guidance removal, valid personal and quoted-tool guidance, conceptual attribution, personal uncertainty, cannot-without-uncertainty, mixed SQL/React per-hint scope, helper tool, repeated term with unsupported task, deleted fact/label, empty labels, non-personal kinds, no new hint on added term, no upgrade, untouched legacy summaries, edited legacy facts without projection/list, and grounded extracted revalidation.
- Real ReviewService with SQLite D1 adapter: legacy/unwrapped, literal-v1 and grounded save/read/replay; authentic hint dropping; exact immutable sourceRef and bucket source bytes; unchanged extraction envelope and prior confirmation; valid personal edits; per-skill removal; server-owned grounded projection; untouched legacy when another fact changes; no reintroduction after deletion; explicit source-term addition without hint minting; forged hint ID/label/candidate or modified level rejection; origin and source-range guards; owner rejection; rollback after draft write and before receipt; stale revision conflict.
- Controlled UI: immediate edit render and saving state, unsupported button/section disappearance, no invented uncertainty, original quote preserved, explicit adoption only, mixed skills, and grounded versus historical extracted behavior.
- Shared/worker compatibility: 22 shared cases plus 22 worker adapter/reminder cases for the authorized Chinese qualifier and prior longer qualifier precedence. Existing UI fixture remains unchanged and passes.
- Broad checks include source evidence, source-span provider, extraction, review points, confirmation, label membership, deletion races, source-term correction, workspace adoption, boundaries, recovery, and frozen B0 UI rehearsal.

## Final changed-file SHA-256 values

| File relative to workspace | SHA-256 |
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

## Limits and next owner

No author full-repository typecheck, build, browser, real model, or remote operation was performed. Scoped types include `worker-configuration.d.ts` and the existing test matcher setup, and exclude ignored work fixtures. The native workerd/D1 and gated real MaterialTextPanel → HTTP route GREEN runs remain root's task as requested. No unresolved author test failure remains.
