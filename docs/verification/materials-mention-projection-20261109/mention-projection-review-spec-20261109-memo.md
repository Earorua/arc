# Task 3 independent specification review

Verdict: **PASS**. No actionable in-scope specification finding remains for the frozen Task 3 implementation. This permits the separate quality review; it does not approve a release, policy activation, full-repository acceptance or the later ability-adoption contract work.

Reviewed baseline: `c36aa0e8049e3b8f245dc6004ac9d2c23b89ae29`, branch `codex/materials-replan-recovery-20261106`. The seven uncommitted files match author freeze `0f0cf48f75a46d84b65f83b11458920f147f401ecbf8575e2b76fc5742fd53c3` both before and after independent verification. The actual product/test diff and complete relevant source were read; the handoff was used as an evidence index, not as proof. The two pre-existing dirty verification documents were preserved.

Routing: read local `D:/CodexScratch/arc-source-readme-20261029/SOURCE_INDEX.md` and the fresh GitHub source text saved by root at `mention-projection-routing-20261109-source-index.md`, with its fetch record. No network request was made by this reviewer. The historical paused `714ea9e` notice is reference only; this review uses the accepted local `8cba14dd` → `afd6254` → `c36aa0e` sequence and the current explicit task authorization.

## Requirements matrix

| Requirement | Actual implementation and independent evidence | Result |
| --- | --- | --- |
| Exact v2/v3 identity; server-owned marker | `review-service.ts:33` restricts original-kind SQL to the two exact constants; `:151` and `:257` retain the actual stored marker. The common predicate gates editing and extraction switching at `:46` and `:235`. The strict request contract has no marker field (`documents-api.ts:43`). Four unknown/prefix/whitespace marker probes expose no source-add UI or original kinds and reject save. | PASS |
| Explicit same-source addition and immutable source | `review-service.ts:54` requires current/original kind, exact candidate/prior source and user provenance. `:58` passes original candidate slice, edited text, requested raw term and actual projection. Independent probes reject borrowing either the term or valid source range from another candidate; reverse canonical lookup is rejected, while the real negative alias is accepted without a hint. Authored service cases exercise exact document/version/range, provenance, owner, stale revision, duplicate addition and rollback. | PASS |
| Versioned actual UI and raw versus canonical display | `material-confirmation.tsx:9` requires the projection prop; `:14` uses the same four-argument validator, `:69` uses `findReviewedSourceTerm`, and `:76` passes only `draft.reviewProjection`. The eight-term limit and persisted reclassification gate remain. Actual component tests cover v3 negative alias, v2 negative control, quota and reclassification; the real MaterialTextPanel integration saves/reopens negative additions. | PASS |
| Removal, omission, deletion and old snapshots | `review-service.ts:63–73` retain only reviewed terms, produce explicit empty arrays on omission, and do not rescan to restore terms. Actual service and editor tests cover removed/empty/deleted state, old snapshots and reload. An independent full client/confirmation/context probe removes SQL, then sends an old-client omission and verifies no mapping or practice is recreated from the still-present literal text. | PASS |
| Topic retention without personal ability | Shared accepted helpers remain unchanged. Actual ReviewService and component tests preserve v3 SQL when personal wording changes to colleague/future wording and remove the old hint immediately and after save/reopen; restoring source wording does not resurrect the hint. The unchanged separate ability callback is exercised by an independent v3 positive-control test: confirming facts does not invoke adoption, explicitly clicking its existing button does. | PASS |
| Real review flow and planning separation | `tests/helpers/material-mention-review-fixture.ts:16–49` constructs real DocumentsClient, HTTP route factory and runtime; its only seed is inert local analysis delivery, with analysis disabled. `material-mention-review-flow.test.ts:21` runs delivery/save/restart/read/confirm/select/context. Negative/other/future SQL maps without practice; personal React plus colleague SQL gives React alone practice. Explicit learning intent, manual fallback and persisted audit/availability/target remain separate. Existing v2 analysis/editor/planning fixture is unchanged. | PASS |
| Main-JD gate and no new adoption path | Actual component tests use negative/conditional requirements at `material-confirmation-source.test.tsx:253`, preserve `unspecified`, disable confirmation until the existing user classification action, and never adopt an ability. Product diff adds no adoption route, callback, contract or planning behavior. The existing button’s later source/decision-contract binding is outside this task. | PASS |
| Historical behavior and lifecycle guards | Exact v2 locator behavior is preserved by the new argument passing. Legacy/v1/v2 helpers, validators, policy identities, source/digest rows and DB protocol code are not edited in this diff. Focused tests cover existing retention/deletion/confirmation/selection guards. Independent probes verify v2→v3, v3→v2, v3→v3 and v3→older extraction transitions require explicit adoption, preserve destination identity and leave source/extraction rows unchanged; real owner and deletion routes reject access. Root separately reports the unchanged 170 observations and six actual persisted historical reads plus eight table sets. | PASS |
| Scope and TDD evidence | Only two product files changed. No shared grammar, policy activation, migrations or adoption-path changes. Preserved REDs were inspected by failure source/message and hash, including the initial fixture errors and invalid alias assumption; they are not all counted as product RED evidence. Independent focused tests and adversarial probes pass as detailed below. | PASS |

## Independent verification

All Node invocations used the existing offline wrapper with a verified unused label and a separate `-results.json`. Each wrapper reports zero non-loopback denials.

| Label (prefix `mention-projection-review-spec-20261109-`) | Observed result | Raw log SHA-256 |
| --- | --- | --- |
| `focused-01` | 338 passed, 0 failed, 12 files | `2e31df7f620cc3b27a115cfc0f7d22003e8fa068c58862939d4f3273202ba2de` |
| `probes-01` | 12 passed, 1 local probe setup failure | `2e6292ea1c937fd42c6f02e0534d9ac9a0b7647336951dbaf61f99a6924fe58b` |
| `probes-02` | 13 passed, 0 failed | `270df658d53c4ccc9be2ea3fcd55b6ba0174c31697400cf349f4b8b13ea2b638` |

The final independently passing scope is **351 tests**. `git diff --check` also passed. The focused suite comprises the four changed test suites plus document confirmation/deletion/extraction/storage, confirmed skill labels, learning intents, practice priorities and selection regressions.

The initial independent probe supplied two sentences as one v3 candidate and failed inside the already accepted extraction statement-boundary check (`extraction-validator.ts:47`), before the intended review assertion. Its source snapshot is preserved as `mention-projection-review-spec-20261109-probes-01-source.txt` (SHA-256 `e67d00fde5c3bba8d316247a0184fe84e1d243d7269bf6ce06062a0d723fcd9b`). The only correction was the ignored fixture setup: two complete sentence candidates. The original failure remains recorded and is not reported as a product regression or a successful run.

## Author RED/GREEN audit

All eight author wrapper log hashes, all six result-file hashes, and the frozen source hashes match the author manifest. Their outputs were inspected independently:

- RED-01: 207 passed / 34 failed; the three MaterialTextPanel cases fail at the fixture's incorrect capabilities routing. These three are harness failures.
- RED-02: 207 passed / 34 failed after static-route precedence was fixed; editor cases now reach absent controls or saved-marker assertions, with other failures on source linkage, extraction adoption and persistence. These are the intended product gaps.
- GREEN-01: 240 passed / 1 failed; the remaining UI expectation assumed full-width SQL canonicalization that the unchanged helper does not provide.
- RED-03: 2 passed / 97 filtered; `never performed data cleansing` is not a discriminating baseline test and is not accepted as RED evidence.
- RED-04: 2 failed / 97 filtered for `I have no experience with data cleansing.` against the baseline component: disabled add button and missing raw alias. Its log SHA is `153892329b09cbb845619eaaf9c6791449a79aca476479e5194b6dc76f44c808`. The override log states `Task 3 baseline component override: c36aa0e`. The supplied baseline component has Git blob `7f679143c2bb5b7f40b224e5425484b4813227a7`, exactly equal to `c36aa0e:app/components/materials/material-confirmation.tsx`; the RED-04 test snapshot hash equals the current frozen test file hash.
- GREEN-02: 338 passed / 0 failed / 12 files, independently reproduced by `focused-01`.
- Scoped author TypeScript and lint records each have exit 0 and verified empty-log hash. They were audited, not independently rerun by this spec reviewer.

## Frozen file integrity

| File | SHA-256 |
| --- | --- |
| `app/server/documents/review-service.ts` | `8a98f8f6bb1f9b506434ff85e3a803294b07a3c02c4597c4c3cb95b1b7e8f378` |
| `app/components/materials/material-confirmation.tsx` | `6e328b880f71447f89cd94619dbb72dd4967ec04d9dc74a7d23112cb0cdebd8f` |
| `tests/server/document-review-draft.test.ts` | `cc0b49d830293e6dade78ed0758f1e270f624e484b69181eae18944d606ff2c1` |
| `tests/components/material-confirmation-source.test.tsx` | `b6745699b335c5ed4686eb45426740a908f1fb6b02b908ad6b15d6d92d84d136` |
| `tests/components/material-source-term-correction.test.tsx` | `55d4f555e9f82318948ba51899852299a36259065a3cd8682e13b63f0ae1db6d` |
| `tests/server/material-mention-review-flow.test.ts` | `f1bfe99e0170ad70b2ef4347ecf93865bcd0a90f11b3d266b50f211f0eef8886` |
| `tests/helpers/material-mention-review-fixture.ts` | `bf886c20b6c3ac433ca735928ed9cd29438001f6855cb6347e6412cd9c82e3d5` |

Machine-readable review evidence: `mention-projection-review-spec-20261109-results.json`, SHA-256 `8a31b3f9e75aa9461a2889d99dc5de4af5db16d19933037837c7bd1e5f3a60ff`. It records the source hashes, author log/result verification, independent wrapper/result hashes, failed fixture history and reviewer output hashes.

## Limits and handoff

This is a Task 3 specification PASS, not a quality review. The bounded independent probes use fresh in-memory SQLite D1 and memory-bucket state with real application client/HTTP/runtime/services. They do not execute a live provider or workerd. Root separately completed the 25 native flows, 25 complete Node payload comparisons, three actual context UI cases, 170 compatibility observations and six retained historical reviews; the root record explicitly preserves and explains its first random-preview-token parity failure and its fixture-only deterministic UUID correction. These root checks were read as supplementary evidence, not claimed as this reviewer's independent executions.

The preexisting Chinese guided-action false negative and whole numbered-entry quote limitation remain open. No shared grammar was changed and neither debt item is marked fixed. The future ability-adoption work must inspect the existing callback/contract/persistence gap; Task 3 preserves the separate action and does not close that later task.

No product/test-source edits, commits, remote migration, live inference, deployment or push were performed. Reviewer additions are ignored probes/configuration/evidence under the authorized `work/grounded-verification/mention-projection-review-spec-20261109-*` prefix. Frozen implementation remains unchanged for quality review.
