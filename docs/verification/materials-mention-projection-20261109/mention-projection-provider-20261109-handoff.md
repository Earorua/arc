# Task 2: versioned v3 extraction and server projection

Status: DONE for independent spec → quality review. No commit was made.

Base: `codex/materials-replan-recovery-20261106` at `afd6254cc8f2989520b19a46144b9ddd9779fd3e`. The two existing dirty verification documents were preserved and are owned by the parent. Both source routing indexes and the checkout AGENTS instructions were read; the parent had already live-read the remote index, and this task read the matching cached `origin/master:SOURCE_INDEX.md` without network access.

This is an offline candidate policy only. No model calls, external requests, deployment, remote migration, push, release, credentials/configuration activation, or changes to old 26-reference evidence occurred. Every Node invocation used `node work/grounded-verification/run.mjs <unique-label> <Node args>`; every wrapper reported zero non-loopback denials. All failed test evidence remains intact.

## Delivered behavior

- Added only the exact `KIMI_SOURCE_MENTIONS_POLICY_ID = materials-openrouter-kimi-k31-pro-mxfp4-zdr-extractive-v3`, selecting strict `source-spans-v3` and persisted `source-skill-mentions-v3`.
- The new wire shape reuses the v2 fields and strict limits. V3 alone calls `groundMaterialSkillMentions`; v2 still calls `groundMaterialSkillTerms`. V1/v2 prompts, schema version, route identity, and old policy constants are unchanged.
- The v3 prompt permits nominated raw topics in negative, other-person, quotation, and future statements, without treating topic presence as personal ability or practice. Whole sentence/list boundaries, unique sources, review points, requirements, output completion checks, quotas, injection/link safeguards, and frozen route qualification remain enforced.
- Projection selection comes only from the trusted policy parameter. Stored reloading uses the stored marker, not a current default. Legacy/unwrapped and v1/v2 storage are not upgraded. Provider-supplied policy, projection, summary, ID, and candidate wrapper fields are rejected.
- V3 site validation independently rejects rewritten canonical text (`item.text !== item.source.quote`), incomplete source statements, and detached quoted statements. This stricter v3 boundary was explicitly confirmed with the parent; legitimate worker v3 candidates already satisfy it.
- V3 site hints use the existing `supportsMaterialSelfLevelHint` plus `supportsSelfLevelHintInScope` with full-document `maskQuotes` context. List markers are stripped only for the same statement-body evidence used by the worker. Incorrect guided/uncertain hints are removed while source topics remain. A single per-fact hint must fit all retained topics; SQL guidance cannot transfer to a colleague's React activity.
- Shared evidence grammar, scope modules, lexicon, and Task 1 helper files were not edited. Pure existing statement/quotation helpers are reused from `worker/document-executor/source-review-evidence.ts` by the server validator.

## Frozen files

Machine manifest: `work/grounded-verification/mention-projection-provider-20261109-freeze-results.json`.
Copies: `work/grounded-verification/mention-projection-provider-20261109-frozen-source/`.

| File | SHA-256 |
| --- | --- |
| app/server/documents/policy.ts | 10b674829aae6e26a9bb6ba6eb9e0178bcd18c87ea2c58d68642298363c8b80d |
| app/server/documents/extraction-validator.ts | ac539b8d3087bd801554d6706840aff3689263c3543403de122406182826f32a |
| worker/document-executor/source-span-extraction.ts | 8a2e82a14485f75531025c8649c22f2086e37fa12d9ca53d1adf2272d2d0310c |
| tests/server/document-extraction.test.ts | 215bde68aa0b8019ef2a100105edcb8421d882bb9f25380cfc65d70e14199708 |
| tests/server/document-source-span-provider.test.ts | 98d2a6b57ba0f1228fdd875d9178735547c12eb4e86ba59aea89596227d1f2ed |

## TDD and verification evidence

All labels below start with `mention-projection-provider-20261109-`. Each has an immutable raw `.log` and wrapper `.json` under `work/grounded-verification/`.

| Label suffix | Exit / tests | Raw log SHA-256 |
| --- | --- | --- |
| red-01 | 1; 1 failed, 1 passed, 115 skipped | e887e2f4251c43b453ab7d32e42eff6d37c3cab0291d8611c7de9ea51125784d |
| green-02 | 0; 127 passed | 1be4bc35e0d7e900add0eb3ca4ee0574bc9fe7052aa441c469f8d6d2b289cd6e |
| server-red-03 | 1; 13 failed, 17 passed | eb0d84867e50329676dcd2073b4a5b9da4c9f8f04dc7e8f8d8a1d182fc86e880 |
| server-green-04 | 0; 147 passed | 947c855995b4d98ce127ddf9efeb0bbf7af6dcff8ea2cc3de643f5b8131f3d45 |
| contracts-05 | 0; 185 passed | b4c229df668183af455834e9a211724223c9a4830edbacb614a5eb3e574e481b |
| suites-06 | 0; 1,342 passed in 11 files | 11041e6ba886ae220ad4cf71f61a89c3d05f72b87cd92077444688f8fe61522a |
| types-07 | 0; focused tsc | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |
| lint-08 | 0; ESLint, five owned files | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |
| compat-09 | 0; 150 provider cases + 20 helpers matched | 94f072655b02b50647a7a2db9fd9a78123a88f5ca2b89f9d41269819044a6c7b |
| bundle-10 | 0; local executor ESM bundle, 0 warnings | a7b62bd0dd509c210aae8574d45073935ab910b3ce2cbaba48c50226fe5cc855 |

`red-01` exercised the real `HttpDocumentAnalysisProvider` using its injected synthetic POST/receipt fetch. The required negative Kubernetes phrase was accepted/filtered under v2, while v3 failed before any fetch because the policy did not yet exist. `green-02` then passed the complete decode → `validateDocumentExtraction` path. `server-red-03` separately demonstrated unsupported level acceptance and missing canonical/source-context checks before implementing the v3-only server defenses. No RED evidence was replaced.

The 11-suite final run covered: source-span provider 155, extraction 30, source review evidence 448, source requirement evidence 124, provider 7, receipt credential privacy 8, review points 3, review draft 107, grounded skill terms 190, shared self-assessment evidence 142, retained assessment hints 128. Total 1,342. The only suite warning was the existing Node SQLite ExperimentalWarning from the database-backed review draft tests; all suites passed.

Focused TypeScript config: `work/grounded-verification/mention-projection-provider-20261109-tsconfig.json`. Bundle script/results: `mention-projection-provider-20261109-bundle.mjs` / `mention-projection-provider-20261109-bundle-results.json`. The executor bundle is 818,933 bytes, SHA-256 `3a964ac29523b546ab003ef15c1f6503774b271c382248a68fa17cf292ce48e1`; it was generated locally and never deployed.

Compatibility command (inside the wrapper):

```text
work/grounded-verification/mention-projection-compatibility-20261109.mjs . work/grounded-verification/mention-projection-provider-20261109-compat-results.json work/grounded-verification/mention-projection-compatibility-before-20261109-b-results.json
```

The immutable compatibility harness, before-capture, complete request/prompt data, and all 170 observations were preserved. Result `COMPATIBILITY_MATCHED`, observed SHA-256 `4b8f798db0a43a034a82690133c1e9cb0ba5f3d83091492a9c59211e6a9a5a07`. This includes the preexisting v2 behavior of “I have never configured SQL for production.”; no shared matcher was changed to fit a different assumption. The new negative-retention comparison uses the actual filtered phrase “I cannot yet configure a Kubernetes cluster myself.” and separate `never used SQL` fixtures.

## Self-review

- New production changes are confined to the three authorized policy/extraction files. The two authorized test files add 60 cases. The previous v2 unknown-version test now uses v4, since v3 is explicitly implemented.
- Exact policy matching and the unchanged provider dispatcher preserve rejection of unknown prefix versions, wrong routes, and client policy mismatch before any send. Strict shape tests cover cross-version replies, extra policy/marker/candidate/ID/text fields, wrong source, quota overflow, refusal, tool calls, and truncation.
- Negative/other-person/future/quoted and mixed-actor topics survive v3 without incorrect level hints. Supported personal conceptual/guided/uncertain evidence still produces hints. Detached quoted and omitted-attribution examples are paired with the supported personal statement in both provider and server coverage.
- Role negation/conditions remain unspecified. Conflicting requirement points, prompt-injection points, and untrusted-link points remain grounded. No nomination produces no topic; an unsupported nomination is filtered without adding another tool from the sentence.
- The server is independently tested with forged direct canonical candidates, including contradictory text, detached quotation, wrong source, and unsupported guided/uncertain levels. Stored v3 reloading repeats these validations; old markers remain separate.
- `git diff --check` passed. No further implementation concern was found in this scope. Task 3 ReviewService/UI integration and independent spec/quality review remain for the parent; this handoff does not claim the whole product or release is complete.
