# Native planning behavior acceptance

Date: 2026-11-19. **Accepted for the complete bounded native behavior protocol.** Collection and independent assertions: **14/14 passed**. Specification and final code-quality reviews: **PASS**. This is offline behavioral evidence, not model-quality, Gate 1B or publication approval.

## What was actually verified

The fixed matrix ran once in local workerd/Miniflare D1 and R2, with a separate fresh database/bucket per case. It collected actual document, review, selection, context, planning, completion and Proof service records. The declared upstream synthetic extraction/review fixtures initialize only non-evaluated starting boundaries. No expected after-state was inserted.

| Behavior | Observed result |
| --- | --- |
| Confirm facts only | Confirmation saved; current plan, audit, completion and Proof retained. |
| Adopt guided self-assessment | Explicit setup choice passed through native generation and persisted reload. |
| Reject bulk independent | Actual adoption contract rejected it; the supplemental UI observation verifies the bulk control is absent with selected materials. |
| Choose individual independent | Explicit individual setup choice persisted; it remains self-report, not verified competence. |
| Leave learning intent unadopted | Supplemental intent remained unadopted without granting ability or hard authority. |
| Adopt a soft focus | Current context stayed active until explicit acceptance; new context survived reload. |
| Withdraw one focus | The item choice was removed; other material choices and progress remained. |
| Delete a material | Links/proposal dependencies were revoked and old-context reuse rejected. Physical cleanup receipt remains `cleanup-pending`; no completed cleanup is claimed. |
| Exclude one retained term | Exact term exclusion persisted; another term stayed available. |
| Replace primary JD for the same role | Proposed JD C remained separate from adopted JD A; resume/supplement retained. |
| Accept current primary-JD preview | Current plan and adopted context switched together and reloaded consistently. |
| Keep secondary JD subordinate | Only primary JD supplied must requirements; an explicitly selected secondary focus stayed soft. |
| Preserve unresolved conflict | Actual confirmation rejected the unresolved source-bound review point. |
| Reject stale preview | Legal selection change invalidated the proposal; acceptance rejected without applying it. |

Every existing-plan case started with a real completed task and nonempty Proof records. Assertions preserve the complete audit, goal/source/workspace identity, availability/version history, target, task content and dependencies, historical DailyUnits, completion events and four Proof tables. Candidate/current plan boundaries, accepted pending-task membership, prerequisite order and daily budget are checked independently of production expected-state generation.

The two setup cases reuse the accepted five UI adoption/persistence cases and add native generation/reload. The bulk guard combines an actual contract rejection with a new one-case UI observation. These are explicitly labelled behavior bindings; they are not fourteen existing-plan HTTP mutations.

## Results, identity and limits

- Native matrix: one run, 14 collected, 14 passed, 0 failed/missing, 0 outbound attempts, 0 source drift, no case retries. Its 66 assertion groups are checks within those fourteen cases, not additional scenarios.
- Targeted worker types, script syntax and final lint passed; exact commands and direct-tool-output provenance are in [collector notes](planning-collector.md).
- Supplemental UI: one final file/test passed. The first configuration accidentally included unrelated tests; that attempt was stopped and is retained without an acceptance claim. The final exact-file run and correction are documented in the [addendum](planning-ui-evidence-addendum.md).
- Executed application bytes were committed as `47b0e0a`; the run began at its documentation parent plus that frozen patch. The manifest pins the actual 146-file imported closure, worker bundle, inputs, runtime and migration files rather than relying only on HEAD timing.
- Original fourteen-case references and historical scorer remain untouched. This new native interpretation has its own binding ID, inputs, digests and checker.

Readable [collection manifest](native-evidence/manifest.json), [index](native-evidence/collection.json) and [check results](native-evidence/check.json) accompany the [lossless raw archive](native-evidence/native-planning-20261119-matrix-01.zip). All eighteen archive entries were verified byte-for-byte against the original outputs; [archive digests](native-evidence/archive-manifest.json) and [author receipt](planning-evidence-20261119.json) retain their identities. The original local raw directory remains intact.

See [specification review](planning-spec-review.md) and [code-quality review](planning-quality-review.md). Both reused the existing raw results; neither repeated the matrix or other tests. No paid model call, remote migration or deployment occurred. Remaining work is current-mainline integration and its final regression, newly authorized Kimi synthetic quality evaluation, hosted B3/B4/B5, physical cleanup/accounting/rollback checks, Gate sign-off and public release with post-release verification.
