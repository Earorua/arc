# Source mention boundary: independent code-quality review

Result: **PASS for the reviewed library change.** No introduced correctness, maintainability, or performance defect found. The existing no-`Intl.Segmenter` fallback has limitations documented below; this change preserves them. This is not production adoption approval, a Gate result, or a full-product repair claim.

Reviewed on 2026-11-08 in `C:/Users/XF/.codex/worktrees/materials-replan-recovery/ui-warm-precision`, base/HEAD `03c51820406528a7e711fd37750b3b16fa7f0c8d`. Independently read the actual diff, entire matcher, existing and new tests, contracts, consumer call sites, offline runner, and outbound blocker. Applied verification-before-completion. The review and its fresh execution do not rely on the author's or specification reviewer's reported outcomes.

## Findings and implementation assessment

No blocking or newly introduced findings.

- `app/lib/materials/grounded-skill-terms.ts:119`: the mode condition gates exactly the attached prefix/list/suffix denial checks. Quote-wrapper handling, cleaning-object checks, homograph handling, source offsets, and lexical boundaries still execute for both modes. The old affirmative APIs explicitly supply `affirmative` at lines 200 and 205; there is no default that could accidentally widen old consumers.
- `app/lib/materials/grounded-skill-terms.ts:176`: the two match/ground internal helpers provide a small, readable shared implementation. The new wrappers at lines 209 and 214 do not duplicate matching rules or introduce extraction/scoring logic. Existing reviewed equivalence definitions and negative-label rejection at lines 12-47 are unchanged.
- `app/lib/materials/grounded-skill-terms.ts:61`: replacing the boundary Set with a segment Map preserves the original segment-start membership check, including the end sentinel. Storing segment strings enables the nominal-suffix test without another segmentation pass. At the current 1000 UTF-16 source quote limit this adds modest linear storage.
- `app/lib/materials/grounded-skill-terms.ts:82`: the Han exception checks an all-Han multi-character token ending in `性`, the immediately following `的`, and an actual separately segmented all-Han component of at least two characters after it. It is an end-boundary exception only. Source-grapheme endpoints and start-boundary checks still precede it at lines 146-150; technical-name and namespace restrictions still follow it at lines 152-155. Tests exercise nominal examples beyond the reported fixture and explicit near misses.
- `app/lib/materials/grounded-skill-terms.ts:70`: personal headings are a finite conventional family incorporated into the existing line/list-anchored delimiter recognizer. This introduces no taxonomy, alias, arbitrary identifier prefix, or namespace substring support. Denials and homographs remain independent after a valid heading. The explicit combined heading/denial/namespace/Unicode review probes passed.
- `app/lib/materials/grounded-skill-terms.ts:160`: unique original spelling remains the selection rule. Mention mode intentionally considers both denied and affirmative occurrences, so differing original spellings can withhold a mention even when affirmative mode retains a single affirmative spelling. This is covered with explicit expectations, not an unintended weakening of affirmative selection.
- `app/lib/materials/grounded-skill-terms.ts:183`: nomination remains literal-first, eight input nominations are capped before filtering, and canonicalization only follows a literal-supported unique reviewed equivalence. Inputs are not modified. The input-label and recovered-original 100 UTF-16 limits remain at lines 44 and 147.
- `tests/lib/materials/material-skill-mentions.test.ts:19`: new tests cover all three requested examples and assert expected strings/nulls/arrays directly. They also check both affirmative APIs for unchanged denials and the two intentional shared lexical repairs. The cases at lines 168, 177, 186, 198, 217, 229, and 239 meaningfully exercise nomination limits, equivalence ambiguity, original graphemes, UTF-16 limits, negative labels, and homograph/activity safety. These are behavioral assertions, not copies of the implementation. No test framework monkeypatching appears in the product tests.
- Consumer scope: new APIs occur only at their definitions under `app/`. `app/lib/materials/skill-labels.ts:23`, `app/lib/materials/skill-labels.ts:28`, `app/lib/materials/contextual-skill-mapping.ts:41`, `app/lib/materials/contextual-skill-mapping.ts:56`, and `app/components/materials/material-confirmation.tsx:69` still use affirmative APIs. No extraction consumer, scorer, course/reference fixture, schema, migration, or model setting was changed by this patch or this reviewer.

## Runtime fallback observation: preexisting, nonblocking for this patch

`app/lib/materials/grounded-skill-terms.ts:53` falls back to base-code-point-plus-combining-mark splitting when `Intl.Segmenter` is absent; it is not a complete extended-grapheme implementation. `app/lib/materials/grounded-skill-terms.ts:75` through line 77 deliberately permit CJK character boundaries when word segmentation is unavailable. The new Han segment-map check at line 84 does not tighten that older broad fallback because ordinary `wordBoundary` already succeeds.

Fresh probes temporarily removed `Intl.Segmenter` before independently importing both the current module and a copy of base revision 03c5182. Both affirmative implementations produced the same outputs for all 312 comparison cases. The three limitations below also reproduce identically in base and current code; mention mode inherits them:

| Quote / nominated label | Base affirmative | Current affirmative | Current mention |
| --- | --- | --- | --- |
| `检查可访问性的。` / `可访问性` | `可访问性` | `可访问性` | `可访问性` |
| `检查键盘可访问性的基本检查。` / `盘可访问性` | `盘可访问性` | `盘可访问性` | `盘可访问性` |
| `Use OrbitInk\u200d.` / `OrbitInk` | `OrbitInk` | `OrbitInk` | `OrbitInk` |

The normal Segmenter-enabled probes reject these boundary failures. NFKC expansion, combining accents, namespaces, English word boundaries, the positive reported fixtures, and the mention/affirmative denial split worked in the fallback probe. This is not a finding introduced by this patch and does not justify expanding this batch. Do not describe the fallback as fully equivalent to `Intl.Segmenter`; a future decision to support runtimes lacking it needs an explicit grapheme/word-boundary policy.

Observation payload: `work/grounded-verification/mention-boundary-quality-20261108-fallback-observations.json`.

## Algorithm and bounded workload observations

The patch keeps the existing repeated occurrence scans and fixed reviewed equivalence inventory. Grounding indexes a quote once and examines at most eight nominations. No new nested unbounded search or regular-expression ambiguity was introduced. Mention mode short-circuits before evaluating denial regexes; homograph/list-context checks remain intact. The helper itself does not enforce the 1000 UTF-16 quote limit; the existing material contracts do (`app/contracts/documents.ts:23`, `app/contracts/documents.ts:56`, `app/contracts/documents.ts:77`). Claims here are scoped to that contract.

Each sampled call used eight nominations and a 960-1000 UTF-16 quote, with one warmup and three measured calls. These local observations are diagnostic, not a stable benchmark or worst-case complexity proof:

| Workload | Quote units | Base affirmative ms/call | Current affirmative ms/call | Current mention ms/call |
| --- | ---: | ---: | ---: | ---: |
| Eight named tools, repeated | 960 | 0.652 | 0.666 | 0.470 |
| 500 repeated one-letter terms, eight repeated nominations | 1000 | 4.330 | 4.444 | 2.463 |
| 315-member denied list | 985 | 1.027 | 0.990 | 0.471 |
| 62 repeated cleaning equivalents, eight repeated nominations | 992 | 2.781 | 2.733 | 1.489 |

No concerning regression was observed. Raw payload: `work/grounded-verification/mention-boundary-quality-20261108-timing-observations.json`.

## Fresh verification and reviewer artifacts

All Node execution used the required offline wrapper and unique run names, without a second `node` argument. No network/model/deploy/migration/push/commit operation was performed. No tracked file was edited by this reviewer.

Final exact command:

```text
node work/grounded-verification/run.mjs mention-boundary-quality-20261108-focused-02 node_modules/vitest/vitest.mjs run --config work/grounded-verification/mention-boundary-quality-20261108-probes.config.ts
```

Result: **exit 0; 3 suites; 357/357 tests passed** (190 existing matcher tests + 123 new mention tests + 44 independent quality tests); `nonLoopbackDenials: 0`. Wrapper elapsed time 1464 ms; Vitest duration 1.12 s. Read the complete saved log. The config defines an explicit include array for only those three files and does not merge the repository include array.

The 44 independent tests contain 312 base/current affirmative comparison cases with native segmentation and the same 312 with segmentation unavailable, using 24 labels across 13 surrounding frames. Each case compares both affirmative APIs. Other probes use direct expected results for 17 heading/denial/Unicode/namespace combinations, immutable input and cap behavior, fallback functionality, and bounded timing observations. Base source was read with `git show 03c5182:app/lib/materials/grounded-skill-terms.ts`; its ignored copy only rewrites the documents import to resolve from the verification directory.

The first run (`mention-boundary-quality-20261108-focused-01`) had 356 passing tests and one failed review-only fixture bound: the timing quote was 1040 units. Root cause was the fixture's repetition count, not matcher output. Reduced only that review fixture from 13 to 12 repetitions and reran the complete three-file selection above. Both run logs/results are retained; neither run attempted an outbound connection.

Final `git diff --check` exited 0 with no output. Final status remained modified `app/lib/materials/grounded-skill-terms.ts` and new `tests/lib/materials/material-skill-mentions.test.ts` only. The existing matcher tests are unchanged. `git check-ignore` confirmed the memo's verification path is ignored. All reviewer files use the `mention-boundary-quality-20261108-` prefix.

| File | SHA256 |
| --- | --- |
| `app/lib/materials/grounded-skill-terms.ts` | `fa3c23292ed421f3e9ac50a2d09e3dbf636331398160a9bac27152b1d3d7afc7` |
| `tests/lib/materials/material-skill-mentions.test.ts` | `ed3ed454a2ff8d7b49bc5f350258629622adfc962476100f3da779ad1ab0bed4` |
| `tests/lib/materials/grounded-skill-terms.test.ts` | `349e97ba59b936bb9f440a38b33942541c9a2de794bc4cef239243254538a2cd` |
| `work/grounded-verification/mention-boundary-quality-20261108-baseline.ts` | `46ee5911aedcee20d8e8c91c98ffd8d3b120f901ce35933f9b705f5ee4cd4b6f` |
| `work/grounded-verification/mention-boundary-quality-20261108-probes.test.ts` | `70a70be338a217d1799831587a5460c4e65c8e0aa7cdf921b644bfdf90f28356` |
| `work/grounded-verification/mention-boundary-quality-20261108-probes.config.ts` | `bb18505c712a8401607475d54afd2c5ae1ad1ff80e39a4e0d608f08979463793` |
| `work/grounded-verification/mention-boundary-quality-20261108-fallback-observations.json` | `e231c8ec13c50395683cc92f725064f70e325497b7f6805c212e36cf61d57289` |
| `work/grounded-verification/mention-boundary-quality-20261108-timing-observations.json` | `c4da0d33770d136f8665a2ac2216e334d8e8d1190edde46b29c973d19f219fef` |
| `work/grounded-verification/mention-boundary-quality-20261108-focused-02.log` | `aaa46d46075de89e5c3300fbef605b8af44c83589e2f400e6358640e7f133367` |

## Review limits

This reviewer did not repeat the full repository suite, workerd parity, lint/typechecking, decoder/site probes, or frozen course/reference inventory. Parent-reported results are not represented as independent reviewer execution. No production consumer switches to mention mode in this patch; negative-topic retention and downstream affirmative/adoption guards remain the next integration batch. This PASS authorizes no deployment or product-completion claim.
