# Task 1 mention-boundary implementation evidence

Status: DONE for the shared matcher/API task only. No consumer wiring, practice/hint changes, Git commit/push, remote migration, deployment, real model call, or network action was performed. Root's actual decoder-to-site projection run `mention-boundary-root-projection-20261108-b` passed 3/3 fixtures: the two lexical losses are fixed in those components, while the denied Kubernetes task remains filtered because the new mention APIs are not wired. Full integration and confirmation/planning safety acceptance remain unresolved pending downstream adoption guards and wiring. No Gate/model qualification claim is made.

## Product files

- Modified `app/lib/materials/grounded-skill-terms.ts`
  - SHA256: `fa3c23292ed421f3e9ac50a2d09e3dbf636331398160a9bac27152b1d3d7afc7`
- Added `tests/lib/materials/material-skill-mentions.test.ts`
  - SHA256: `ed3ed454a2ff8d7b49bc5f350258629622adfc962476100f3da779ad1ab0bed4`
- Existing `tests/lib/materials/grounded-skill-terms.test.ts` was not modified.

## Behavior and self-review

- Added `findMaterialSkillMention` and `groundMaterialSkillMentions`; both share the existing indexed literal/reviewed matcher via an internal `MatchMode`.
- Mention mode bypasses only attached denial prefix/suffix/list exclusion. Negative-label rejection, technical/homograph/cleaning-object checks, whole source graphemes, English/word starts, namespaces, unique spelling, reviewed equivalents, and the eight-nomination/100-UTF-16 limits remain shared.
- Grounding still verifies the nominated literal before returning a reviewed canonical label. It does not mine un-nominated source text or reverse-infer missing labels.
- Han end fallback applies only to multi-character all-Han terms ending 性, immediately followed by 的 and a separately segmented multi-character Han component. It does not bypass term starts or original grapheme endpoints. A following single-character noun is intentionally outside this fallback; existing complete-boundary behavior is unchanged.
- Added the ten conventional personal headings to the existing line/list-marker anchored heading grammar. JD heading behavior and namespace/URI/name protections remain intact. This delimiter support does not itself establish a proficiency rating.
- New cases cover the three reported quotes, multiple nominal phrases, malformed/partial controls, headings, EN/ZH denied lists, mixed clauses, reviewed forms, no nominations, ambiguity, repetition, Unicode transformations, length/count limits, negative labels, and lexical homographs/cleaning objects.
- Self-review required no further source changes after the first GREEN run. `git diff --check` passed.

## Offline verification

Every Node command ran through `node work/grounded-verification/run.mjs` with a unique label. All recorded `nonLoopbackDenials` values were 0. Wrapper JSON files and corresponding logs are kept beside this memo.

| Label | Command arguments after the label | Result | Log SHA256 |
| --- | --- | --- | --- |
| `mention-boundary-author-20261108-red` | `node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/lib/materials/material-skill-mentions.test.ts` | 123/123 assertion failures, exit 1; expected missing APIs plus CJK/personal-heading lexical failures | `c9a49c5b90524a0ca27eb0abc9b8b7b8557f438af911e2c26f4b202b04544ffc` |
| `mention-boundary-author-20261108-green-1` | `node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/lib/materials/material-skill-mentions.test.ts tests/lib/materials/grounded-skill-terms.test.ts` | 313/313 passed (123 new, 190 existing), 2 files, exit 0 | `a3509633bf64d3efa264911574362eae6696a52c4a624458ab230789f1bcc264` |
| `mention-boundary-author-20261108-lint` | `node_modules/eslint/bin/eslint.js app/lib/materials/grounded-skill-terms.ts tests/lib/materials/material-skill-mentions.test.ts` | Clean, exit 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `mention-boundary-author-20261108-types` | `node_modules/typescript/bin/tsc -p work/grounded-verification/mention-boundary-author-20261108-tsconfig.json` | Clean, exit 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

The scoped type configuration includes the two matcher test files, matcher source, and `worker-configuration.d.ts`; it excludes ignored `work` fixtures and disables incremental output. No fixture was deleted or modified.

An initial read-only ICU segmentation probe is retained as `mention-boundary-author-20261108-segmentation.mjs`, with wrapper output under `mention-boundary-author-20261108-segmentation-run.{json,log}` (exit 0, nonLoopbackDenials 0).

Root separately reported 1,052/1,052 tests across ten consumer/library suites and 34 Node/workerd parity cases on this source. Those are root-owned verification claims and are not substituted for the author checks above.
