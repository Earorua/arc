# Task 2 independent code quality review

**PASS — no new Critical, Important, or Minor issue found in the frozen Task 2 diff.** This verdict covers the versioned provider and server projection change. It does not accept Task 3 ReviewService/UI integration, the whole product, or a release.

Reviewed branch `codex/materials-replan-recovery-20261106`, base HEAD `afd6254cc8f2989520b19a46144b9ddd9779fd3e`. Read checkout AGENTS, the required local source index, and matching cached `origin/master:SOURCE_INDEX.md`; the parent already read the live GitHub index. No fetch, reset, model call, deployment, remote migration, push, or runtime activation occurred. Product source, tests, documents, helpers, grammar, existing evidence, and the two parent-owned dirty verification documents were not edited by this reviewer. New review artifacts are confined to ignored `work/grounded-verification/`.

## Findings by severity

- **Critical:** none in this change.
- **Important:** none in this change.
- **Minor:** none in this change.

An actual existing numbered-list parsing limitation was independently reproduced and remains product quality debt; it is documented below rather than concealed by changing the test expectation. The existing Chinese guided-action false negative documented by the spec reviewer also remains outside this patch's verdict.

## Code and boundary assessment

All five actual diffs were read, including the test additions, rather than relying only on the author and spec reports.

- Exact selection is explicit at `app/server/documents/policy.ts:5` and `worker/document-executor/source-span-extraction.ts:43`. The v3 prompt and schema are separate at `:33` and `:63`; the old prompt strings, wire shapes, route qualification, and generic fallback remain unchanged. The unchanged dispatcher rejects unknown extractive prefixes and mismatched qualified identities before transport. Keeping the old versioned prompt text intact avoids accidental compatibility changes.
- Parsing at `worker/document-executor/source-span-extraction.ts:103` selects a strict schema using the trusted format. Only v3 calls `groundMaterialSkillMentions` at `:118`; the existing v2 affirmative path remains separate. Quota, complete-source, unique-source, duplicate-fact, completion/refusal, requirement, and review-point processing stay in the same flow. No new grammar or dictionary is introduced.
- `app/server/documents/extraction-validator.ts:13`, `:16`, and `:24` make live selection depend on the trusted policy and stored selection depend on the exact stored marker. Strict envelopes cannot silently downgrade malformed markers into usable legacy candidates. V1/v2 and unwrapped storage remain distinct.
- The new v3 guard at `app/server/documents/extraction-validator.ts:47` checks canonical text identity, full-document statement bounds, and detached quotations after ownership/source resolution. Its reused worker helper imports at `:6` are pure source/evidence modules; inspection found no provider, credentials, I/O, or runtime configuration side effect. Reuse preserves the established grammar. Fresh focused TypeScript validation passed.
- The reversed end-to-start map at `:39` intentionally resolves an accepted list entry to its statement body for evidence evaluation. `:69` also checks the full document's quotation mask, so extracting a locally plausible clause cannot erase outer quotation scope. Source topics are independently filtered at `:57`; unsupported personal hints disappear without deleting retained topics. Negative, other-actor, and future second topics do not inherit an unrelated guided level. A quoted tool name remains usable as the object of a real personal assertion.
- Projection emits only retained nominated labels. Quotas still reject rather than silently truncate: eight labels and 100 facts/100 generated hints were exercised at their valid limits; a ninth label and over-100 projected hints reject. Ownership, revoked references, duplicate segment IDs, malformed segment ranges, and malformed stored markers also reject.
- No worker-to-site regression was observed among the accepted targeted cases. Worker output, direct canonical validation, and stored reload agree for supported marker forms, body-only numbered citations, UTF-16 offsets, wrapped lines, and the source/hint controls. Full numbered-list failures occur in the worker before projection, as detailed below.

## Fresh independent verification

All Node invocations used `node work/grounded-verification/run.mjs <unique-label> ...`. Every wrapper recorded **zero non-loopback denials**. Labels below have the common prefix `mention-projection-provider-quality-20261109-`; raw logs and wrapper metadata were preserved.

| Label suffix | Result | Raw log SHA-256 |
| --- | --- | --- |
| `suites-01` | PASS: 185 tests, the two changed provider/extraction suites | `e99e4b4ef561b79da58bf725aabe561a4405d39d1acd52be2563af8a1b741189` |
| `probes-02` | Preserved initial run: 97 pass, 6 full numbered-list failures | `d3baba87a7a8f130df55c1f1d0cd82251c9fe2f717255aaf19555cb531534d9f` |
| `numeric-baseline-03` | PASS: 36 equality comparisons across 54 observations of actual old v2/current v2/current v3 | `37defe218599501db615d76009a960969d18ca0ac8f61e0f5f93aa37c2567fbd` |
| `probes-04` | PASS: 103 checks, including six explicit existing-limitation rejection checks | `1d5ca07d4b5b34cbd79d48a2ef8d0cce81fdcaef2d6eb12417cddf8e8758d49c` |
| `compat-05` | PASS: 150 old provider cases and 20 helpers match immutable before capture | `e14c1e6669afecba0355fd7d61b9ddb8e793350d37fc2ccfdbf58f0b67cdf7c8` |
| `types-06` | PASS: focused TypeScript config, no emit | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

Additional probes cover 12 list-marker forms × full/body citations × guided/conceptual/uncertain levels; nonzero UTF-16 offsets after an astral character; six restored terminal punctuation forms; LF/CRLF soft wrapping; segment splits that must not discard attribution or quotation openers; source uniqueness within a segment; quoted names; mixed actors/times; exact and over-limit quotas; reference ownership/lifecycle/ranges; and malformed persisted markers.

Compatibility observed SHA-256 is `4b8f798db0a43a034a82690133c1e9cb0ba5f3d83091492a9c59211e6a9a5a07`, matching the immutable `mention-projection-compatibility-before-20261109-b-results.json`. `git diff --check` passed. Final source identity and unchanged tracked-path state are recorded in `mention-projection-provider-quality-20261109-final-07-results.json`.

## Existing numbered-list limitation, preserved explicitly

The six initial failures are real product limitations, not evidence that the source lacks a complete action or a supported assessment. Exact documents used the prefix `Résumé 🧪.\n\n`, followed by `1. ` or `１２. ` and one of:

- `I tested SQL under supervision.` — guided.
- `I am familiar with SQL.` — conceptual.
- `I am unsure about my SQL proficiency.` — uncertain.

For example, the exact document is `Résumé 🧪.\n\n1. I tested SQL under supervision.` and the submitted full quote is `1. I tested SQL under supervision.`. The unchanged statement helper uses `Intl.Segmenter` at `worker/document-executor/source-statements.ts:19`; the resulting bounds are `[0,10]` for `Résumé 🧪.`, `[12,14]` for `1.`, and `[15,46]` for the body. The full quote therefore fails the worker's complete-statement check; its body-only quote succeeds and retains SQL/guided. The two other levels behave analogously. The ASCII-hyphen control succeeds with both full and body-only quotes.

`numeric-baseline-03` compiled the actual preserved old source at `D:/CodexTemp/arc-experience-priority-P3jdvc/source`, not a simulation of the old behavior. Its 18 v2 observations exactly equal current v2; current v2 exactly equals current v3. All 54 observations, source input hashes, compiled hashes, exact text/quotes, and statement bounds are retained in `mention-projection-provider-quality-20261109-numeric-baseline-03-results.json`. The shared `source-statements.ts` SHA-256 is identical in old/current source: `245287bb6f2bbac461bd759f17579ef7cf6b8c101c5e68fcbfb8747f6fcdb065`.

Thus this is **case (2): the old v2 worker already rejects the same full quote, while body-only citations succeed**, not case (1), where v3 worker accepts an output and the new site validator then rejects it. Revision B additionally confirms the direct v3 site and stored-site boundaries reject these full quotes consistently. It preserves the original failing probe source, compiled artifact, result JSON, and raw log, and records the limitation explicitly. A later v3-scoped quality step should address numbered full-list citations without altering frozen v1/v2 behavior or loosening source-context checks.

The separate normal Chinese action `我在指导下清洗数据。` remains an existing guided-hint false negative in the immutable shared grammar, as the spec review proved. This review neither broadens that grammar nor describes the phrase as lacking an action.

## Frozen source identity

All five files matched the author freeze before testing and at completion:

| File | SHA-256 |
| --- | --- |
| `app/server/documents/policy.ts` | `10b674829aae6e26a9bb6ba6eb9e0178bcd18c87ea2c58d68642298363c8b80d` |
| `app/server/documents/extraction-validator.ts` | `ac539b8d3087bd801554d6706840aff3689263c3543403de122406182826f32a` |
| `worker/document-executor/source-span-extraction.ts` | `8a2e82a14485f75531025c8649c22f2086e37fa12d9ca53d1adf2272d2d0310c` |
| `tests/server/document-extraction.test.ts` | `215bde68aa0b8019ef2a100105edcb8421d882bb9f25380cfc65d70e14199708` |
| `tests/server/document-source-span-provider.test.ts` | `98d2a6b57ba0f1228fdd875d9178735547c12eb4e86ba59aea89596227d1f2ed` |

Task 3 marker persistence, source-addition guard, and UI work remain pending and are intentionally outside this Task 2 verdict. The existing paused product verification state is not reclassified by this review.
