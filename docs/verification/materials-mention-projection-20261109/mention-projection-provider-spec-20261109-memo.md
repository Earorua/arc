# Task 2 independent specification review

**PASS — no Task 2 specification defect found in the frozen five-file change.** This is an offline provider/server projection review, not acceptance of Task 3 ReviewService/UI persistence, the full product, or a release.

Reviewed branch `codex/materials-replan-recovery-20261106`, HEAD `afd6254cc8f2989520b19a46144b9ddd9779fd3e`. Read checkout AGENTS, the local source index, and matching cached `origin/master:SOURCE_INDEX.md`; parent had already read the live GitHub index. Preserved both pre-existing dirty verification documents. No application, test, baseline, helper, grammar, configuration, or release file was edited. All new artifacts are under ignored `work/grounded-verification/`.

## Contract findings

- Exact v3 policy identity is isolated at `app/server/documents/policy.ts:5`; `worker/document-executor/source-span-extraction.ts:43` accepts it explicitly. The unchanged trusted provider dispatcher at `worker/document-executor/provider-http.ts:42` still rejects unknown extractive prefixes, wrong route qualification, and input/config policy mismatch before transport.
- The v3 prompt at `worker/document-executor/source-span-extraction.ts:33` separates negative, other-person, quoted, and future topics from personal ability, includes finite term/item/review quotas, requires complete copied context, and retains the untrusted-data/no-tools/no-links instructions. The strict schema at `:63` reuses the v2 item fields and accepts only `source-spans-v3`; parsing at `:103` selects the schema from trusted format. V3 alone uses `groundMaterialSkillMentions` at `:118`; v2 remains on `groundMaterialSkillTerms`, and v1 remains on its prior path.
- Existing statement/source uniqueness, detached quotation, refusal/truncation, quota, review-point, and requirement grounding remain in the same worker flow (`:111`, `:116`, `:125`, `:132`). Rejected over-limit outputs are not truncated. No nominations produce no added topics.
- Server marker selection and reload are explicit at `app/server/documents/extraction-validator.ts:13`, `:15`, and `:24`. Raw candidates cannot nominate their projection through extra fields. Unwrapped history and v1/v2 envelopes retain their prior modes.
- The server independently verifies the v3 extractive contract at `app/server/documents/extraction-validator.ts:47`, retains only source-supported nominated labels at `:57`, and requires both existing personal evidence and full-document quote scope for hints at `:69`. Direct forged canonical hints were probed independently of the worker. Negative/other/future/quoted topics remain while unsupported guided/uncertain hints disappear; supported guided/conceptual/uncertain controls remain. Mixed actors and repeated-topic tasks do not borrow the personal hint. Rewritten canonical text, incomplete context, and detached quoted statements reject under v3. These stronger checks do not alter v2.
- Document schema version, old IDs/prompts, and old observations are unchanged. The immutable before-capture comparison matched all 150 old-provider cases and 20 helper observations, including the actual baseline behavior of “never configured SQL.” No evidence grammar or frozen reference was changed.

## Independently executed evidence

All labels are under `work/grounded-verification/` and start with `mention-projection-provider-spec-20261109-`. Every Node invocation used the required `run.mjs` wrapper, and every wrapper recorded zero non-loopback denials. No real model request, deployment, remote migration, or push occurred.

| Label suffix | Result | Raw log SHA-256 |
| --- | --- | --- |
| `suites-01` | PASS: 185 tests in the two provider/extraction suites | `3b7f9c072e7192f653f725f504e2add75bc1295490140058a71d6f81bc9dd089` |
| `probes-02` | Preserved initial run: 70 pass, 2 failures investigated below | `9c419c3dae51536b6d9fc9e50f1f120355aba928934700cdd1361fcb0103a5f1` |
| `compat-03` | PASS: 150 provider cases + 20 helpers identical to immutable before capture | `ea38cc43deac81fa26139be6f0927521801c60869db80bf40eb2671d024c99f0` |
| `probes-04` | PASS: 74 independent probes, 0 failures | `d4ab53c5b0bc729fe97f8cb595ff2cc2e579ecba0a38248ade63d764f6f851b1` |
| `baseline-05` | PASS: 2 exact Chinese sentences match actual old source and current source | `1146a53f0ca286c1b9902ce92b147878d98d6fc26d3a847b89c26be5442844dc` |

The two original failed probes both used the exact same sentence, `我在指导下清洗数据。`: one through the worker and one directly through the canonical server boundary. They were not two different source sentences. The worker assertion incorrectly expected raw `清洗数据` after canonicalization; the accepted alias behavior is `data cleaning`. Separately, expecting a guided hint exposed an **existing shared-grammar false negative for this normal personal action phrase**, which remains relevant to later product quality evaluation. It must not be described as the source containing no action.

The immutable before capture already has v2 output `skillLabels: ["data cleaning"]`, `selfLevelHint: null`, and no projected hints for `我在指导下清洗数据。`; generic/v1 retain their prior raw label and guided hint. To verify the grammar provenance directly, `baseline-05` compiled the actual preserved source at `D:/CodexTemp/arc-experience-priority-P3jdvc/source` and the current source:

| Exact sentence | Before and current v2 worker label | Before and current guided hint / shared helper |
| --- | --- | --- |
| `我在指导下清洗数据。` | `data cleaning` | `null` / `false` |
| `我在指导下练习清洗数据。` | `data cleaning` | `guided` / `true` |

The second sentence was added as a positive control in probe revision B. Revision B tests the existing null behavior for the first sentence and the recognized guided behavior for the second. Only new ignored probe artifacts were revised; the original source/bundle/result remain. This Task 2 review does not expand or endorse the coverage of the frozen evidence grammar.

Final result files: `mention-projection-provider-spec-20261109-probes-04-results.json`, `mention-projection-provider-spec-20261109-compat-03-results.json`, and `mention-projection-provider-spec-20261109-baseline-05-results.json`. Compatibility observed SHA-256 is `4b8f798db0a43a034a82690133c1e9cb0ba5f3d83091492a9c59211e6a9a5a07`. `git diff --check` also passed.

## Frozen source identity

All five files matched the author freeze manifest before independent probes and again at review completion:

| File | SHA-256 |
| --- | --- |
| `app/server/documents/policy.ts` | `10b674829aae6e26a9bb6ba6eb9e0178bcd18c87ea2c58d68642298363c8b80d` |
| `app/server/documents/extraction-validator.ts` | `ac539b8d3087bd801554d6706840aff3689263c3543403de122406182826f32a` |
| `worker/document-executor/source-span-extraction.ts` | `8a2e82a14485f75531025c8649c22f2086e37fa12d9ca53d1adf2272d2d0310c` |
| `tests/server/document-extraction.test.ts` | `215bde68aa0b8019ef2a100105edcb8421d882bb9f25380cfc65d70e14199708` |
| `tests/server/document-source-span-provider.test.ts` | `98d2a6b57ba0f1228fdd875d9178735547c12eb4e86ba59aea89596227d1f2ed` |

Task 3's missing persisted read marker/add-term/UI integration is intentionally outside this Task 2 verdict. The earlier paused verification state is not reclassified by this review.
