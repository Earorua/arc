# Source mention boundary: independent specification review

Result: **PASS**. No concrete specification defect found in the reviewed library change and added tests. This is a library-only specification review, not production adoption approval.

Reviewed on 2026-11-08 at workspace `C:/Users/XF/.codex/worktrees/materials-replan-recovery/ui-warm-precision`, HEAD `03c51820406528a7e711fd37750b3b16fa7f0c8d`. Applied the SDD specification-review checklist and verification-before-completion workflow. Read the actual source, complete diff, existing matcher tests, new tests, wrapper, outbound blocker, and worker personal-heading definition independently. Did not rely on the author's or root agent's claimed test results.

## Scope and specification checks

- `app/lib/materials/grounded-skill-terms.ts:176-215`: both new exported functions use the same internal match/ground paths as the existing affirmative functions; exported signatures match the requested API. The mode gate at lines 119-120 affects only the attached English/Chinese prefix, suffix, and list denial checks. All other lexical/homograph/activity checks remain shared.
- Lines 42-47 reject negative nominations such as `not know X` and `不会X` in both modes. Lines 52-63 and 144-156 preserve source spelling, whole source-grapheme endpoints, original UTF-16 length, ordinary word boundaries, technical-name suffix/prefix boundaries, and namespace protection. Lines 121-139 retain cleaning-object checks and React/Excel/IT/Go/R/C safeguards.
- Lines 160-173 retain the same-spelling ambiguity rule. Lines 183-195 bind each literal nomination first, then allow only existing reviewed equivalence groups and require that the group resolve back to the same unique spelling. They do not mine other nominated-absent topics or reverse-infer a source-absent canonical nomination. Existing reviewed groups at lines 12-39 are unchanged.
- Lines 82-85 add a narrow all-Han, at-least-two-character token ending in `性`, immediately followed by `的`, with an actual following separately segmented all-Han component of at least two characters. This is only an end-boundary fallback. Start-boundary and grapheme checks at lines 146-150 remain required. It is not a blanket Han-boundary override or answer-specific branch. The requested keyboard-accessibility phrase and other nominal words pass; invalid starts, missing/non-Han/single-character following components, combining sequences, technical prefixes, and namespaces remain rejected in focused probes.
- Lines 68-71 preserve prior JD headings and add precisely the requested conventional personal-heading families at line start or the existing `-`, `*`, `•` list markers. The families are consistent with `worker/document-executor/source-review-evidence.ts:185` (bare `summary` was already in the existing English heading family). Team, attribution, report, URI, namespace, and partial-name controls remain effective.
- The exact `configure a Kubernetes cluster` phrase in `I cannot yet configure a Kubernetes cluster myself.` survives mention APIs and is rejected by affirmative APIs. The exact combined phrase `熟悉 SQL，可独立完成报表` survives the personal-heading source. The functions return labels/evidence only; no proficiency rating is introduced.
- The eight-nomination cap is still applied before filtering at line 186; both input and recovered-original limits remain 100 UTF-16 units. No public contract, source-fact field, reviewed equivalence inventory, scorer, course/reference fixture, model configuration, migration, or production consumer was changed. `rg` found the new APIs only at their definitions under `app/`.
- `tests/lib/materials/material-skill-mentions.test.ts:19-27` covers the three requested examples. The rest covers Han boundary controls, all requested personal headings, JD-preserving shared behavior via existing tests, attached English/Chinese negatives and lists, reviewed equivalents, mixed clauses, source spelling/ambiguity, Unicode/graphemes, bounds, rejected negative labels, and homograph/activity controls. Existing `grounded-skill-terms.test.ts` is unchanged from HEAD and still has 190 tests.

## Fresh verification

All Node execution used the supplied offline wrapper, without a second `node` argument. No network/model/deploy/migration/push/commit operation was performed. The wrapper reported zero non-loopback denials for both executions.

1. Exact command:

   ```text
   node work/grounded-verification/run.mjs mention-boundary-spec-20261108-focused-01 node_modules/vitest/vitest.mjs run tests/lib/materials/grounded-skill-terms.test.ts tests/lib/materials/material-skill-mentions.test.ts --environment node
   ```

   Result: exit 0; 2 suites, 313/313 tests passed (190 existing + 123 new); `nonLoopbackDenials: 0`. Log: `work/grounded-verification/mention-boundary-spec-20261108-focused-01.log`; wrapper result: `work/grounded-verification/mention-boundary-spec-20261108-focused-01.json`. Log SHA256: `b44a59b4ded07e104812b989aae5c56d67435812be419f4e216dd3a77e9984ad`.

2. Exact command:

   ```text
   node work/grounded-verification/run.mjs mention-boundary-spec-20261108-probes-run-01 node_modules/vitest/vitest.mjs run --config work/grounded-verification/mention-boundary-spec-20261108-probes-01.config.ts
   ```

   Result: exit 0; 1 suite, 81/81 independent boundary tests passed; `nonLoopbackDenials: 0`. Log: `work/grounded-verification/mention-boundary-spec-20261108-probes-run-01.log`; wrapper result: `work/grounded-verification/mention-boundary-spec-20261108-probes-run-01.json`. Log SHA256: `5e311c4970074e16620ad70aaead369498abc1f355fb18001366790c07bd47a0`.

   These probes add other Han nominal words and invalid following components, capitalization/CRLF/list-heading combinations, complete and partial namespaces, denied React/Excel/IT/Go/R/C with technical context, ordinary homographs, data-cleaning object safeguards, compatibility forms/Greek/combining/emoji graphemes, mixed-denial spelling ambiguity, literal-before-canonical binding, and both input-nomination and original-UTF-16 limits. Several table tests contain multiple heading/prefix subcases and all four API assertions.

3. `git diff --check`: exit 0, no output. `git diff HEAD -- tests/lib/materials/grounded-skill-terms.test.ts` and `git diff HEAD -- app/contracts`: empty. Final tracked status remained only modified `app/lib/materials/grounded-skill-terms.ts` plus untracked `tests/lib/materials/material-skill-mentions.test.ts`. Review artifacts are under the instructed ignored prefix; no tracked file was edited by this reviewer.

## Verified SHA256

| File | SHA256 |
| --- | --- |
| `app/lib/materials/grounded-skill-terms.ts` | `fa3c23292ed421f3e9ac50a2d09e3dbf636331398160a9bac27152b1d3d7afc7` |
| `tests/lib/materials/material-skill-mentions.test.ts` | `ed3ed454a2ff8d7b49bc5f350258629622adfc962476100f3da779ad1ab0bed4` |
| `tests/lib/materials/grounded-skill-terms.test.ts` | `349e97ba59b936bb9f440a38b33942541c9a2de794bc4cef239243254538a2cd` |
| `work/grounded-verification/mention-boundary-spec-20261108-probes-01.test.ts` | `927e1fcc8c7ae3e87685f67c33b03615edd3733bc68a7f8d6b602098abead138` |
| `work/grounded-verification/mention-boundary-spec-20261108-probes-01.config.ts` | `0dc397c1f9694a6da5ce9673f29bd0b322bf9e4dcd4afcef8c0c86c22291a26e` |

## Limits and remaining integration work

- Independently executed the focused Node suites and independent probes only. Did not independently rerun workerd parity, broad integration, or full repository tests; parent-reported results are not represented here as reviewer execution.
- This review checks the supplied library specification, not exhaustive natural-language polarity interpretation. Existing conservative homograph and denial vocabulary behavior is preserved rather than generalized.
- Full source facts and their negation are untouched by this patch. No consumer switches to the new APIs. Therefore passing this library review does **not** establish that production negative-topic retention is repaired, nor that retained mentions may safely affect hints, self-assessment, practice priority, or planning. The next adoption batch must supply and verify those affirmative/adoption guards.
