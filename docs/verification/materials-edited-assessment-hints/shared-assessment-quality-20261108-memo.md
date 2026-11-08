# Task 1 independent code-quality review — PASS

Reviewed on 2026-11-08 in `C:/Users/XF/.codex/worktrees/materials-replan-recovery/ui-warm-precision`. Baseline source: `80546d0`; review HEAD: `70bafd15d4d807e397610fe619615a697a52d857`. This approval covers the five working-tree implementation/test files identified by SHA-256 below. No actionable Critical, Important, or Minor quality findings.

Ready for the root to save Task 1 and proceed to Task 2. This is not approval of hint retention callers, UI behavior, save/reload, adoption, the whole v2.1 fix, or a release gate. The root's separately recorded Task 2 red results remain outside this review.

## Quality assessment

- **Responsibility separation:** `app/lib/materials/self-assessment-evidence.ts:182` supplies the requested object-input boolean predicate without mutating facts or assigning a new level. The worker adapter at `worker/document-executor/source-review-evidence.ts:82` still reads `source.quote` and returns the proposed hint or null. Source location, complete-document quote context, requirement conflict, curriculum coverage, and review-point assembly remain worker responsibilities.
- **Import direction and reuse:** The new modules import application contracts and the existing `grounded-skill-terms` matcher. Direct inspection followed the runtime graph through documents/planning/intelligence contracts; its only external package is the existing zod import. No worker/server dependency, environment access, D1 type, fetch, separate skill vocabulary, or cycle was found. The prior independent specification review's 29-moved/33-retained AST comparison is supporting structural evidence, not represented as a fresh command by this reviewer.
- **Compatibility:** Fresh comparisons with the actual `80546d0` implementation passed 2,080 hint-input combinations and 208 review-point comparisons across 26 texts, all four kinds, all four nullable levels, optional/empty/single/multiple label sets, quoted tool names, other actors, future/conditional/reported prose, uncertainty, repeated terms, and adjacent unrelated denial. The baseline snapshot changes only two local import paths so it can execute from the ignored review folder; parser declarations are unchanged.
- **Authorized correction:** The guard at `app/lib/materials/self-assessment-evidence.ts:70` uses the same optional personal-action prefixes as the existing affirmative matcher. Fifteen independent test/build/configure variations characterize the old guided false positive before asserting the new null result. They cover fronted supervision, a supervised internship, instructional practice, and personal modifiers, with absent, empty, and SQL labels. The shared helper and both derived/model-proposed reminder paths reject the denial. Each case retains additive `did not only` behavior; unrelated denied React does not erase supported SQL.
- **Quote and state safety:** Six enclosing quote styles preserve UTF-16 offsets including an emoji and do not turn an inner sentence into evidence. Frozen input/labels and repeated interleaved shared/worker calls remain unchanged and deterministic. Existing quote-context responsibility is retained by `supportsSelfLevelHintInScope` and the worker's document-wide mask.
- **Tests and maintainability:** Added tracked tests exercise real predicates and worker behavior without mocks or weakened existing assertions. Public types keep optional readonly labels and the existing nullable proposed level. The low-level helper exports are used by the worker; scope parsing stays private. The extra denial check adds one bounded action-prefix scan rather than an independent parser.
- **Performance boundary:** Existing candidate/confirmed text and source quotes are capped at 1,000 UTF-16 units; nominated labels are capped at eight by the contracts. Three fresh 1,000-character/eight-label samples, including multiple assertion scopes, averaged 8.78–9.03 ms for the shared helper versus 8.96–9.65 ms for the baseline on this machine (10 measured calls after warm-up per sample). No extraction overhead was observed in these samples. This is a bounded comparative sample, not a worst-case regex or browser interaction latency guarantee. The helper continues to rely on validated caller bounds.

## Fresh verification

Every Node execution used the offline wrapper with a new unique label. The config explicitly replaces `test.include` with five exact paths and does not merge include arrays.

```powershell
node work/grounded-verification/run.mjs shared-assessment-quality-20261108-focused-a node_modules/vitest/vitest.mjs run --config work/grounded-verification/shared-assessment-quality-20261108-vitest.config.ts --maxWorkers=1
node work/grounded-verification/run.mjs shared-assessment-quality-20261108-lint-a node_modules/eslint/bin/eslint.js app/lib/materials/self-assessment-evidence.ts app/lib/materials/quotation-evidence.ts worker/document-executor/source-review-evidence.ts tests/lib/materials/self-assessment-evidence.test.ts tests/server/document-source-review-evidence.test.ts --no-cache
```

| Run | Result | Child / wrapper exit | Non-loopback denials | Log SHA-256 |
| --- | --- | --- | --- | --- |
| `shared-assessment-quality-20261108-focused-a` | 744 tests passed in 5 files | 0 / 0 | 0 | `04bf44b5ad921231b97a9d800f996cb0f68ac59d099e44f7fc927e7f3f10986f` |
| `shared-assessment-quality-20261108-lint-a` | Five reviewed files; no diagnostics | 0 / 0 | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

Test total: 75 shared evidence + 381 source review + 115 source-span provider + 124 source requirement + 49 independent quality probes = 744. The independent probe contains 26 differential cases, 15 denial/additive cases, six quote-style cases, one immutability/determinism case, and one timing sample case. `shared-assessment-quality-20261108-probe-results.json` records comparison counts and raw timing means. Full wrapper `.log` and `.json` files are alongside this memo. A separate `git diff --check` of the reviewed paths exited 0.

## Reviewed source SHA-256

All five hashes matched the root-supplied frozen review target after the fresh executions.

| File | SHA-256 |
| --- | --- |
| `app/lib/materials/self-assessment-evidence.ts` | `c134d3b6c41b20172368eb2a2b37277308019901a70cf7940f44e68308f587dd` |
| `app/lib/materials/quotation-evidence.ts` | `03a77ad110f67b56b7f1d6f28facdf9c70a92d0e7cd152ecdad806967297516a` |
| `worker/document-executor/source-review-evidence.ts` | `e0cbed00b6e2d49c12d4932fddd28457b33ab2a429e4471c711003db520a5ab6` |
| `tests/lib/materials/self-assessment-evidence.test.ts` | `1edda4e384d4ead989e4211b1ec167758c036e5d666def6f4c2db6f81fd42cf0` |
| `tests/server/document-source-review-evidence.test.ts` | `3c8fca67073e888bba6f51cb4e41c542d5380cba362c55a03db34cd02a51c8a0` |

| Review artifact under `work/grounded-verification/` | SHA-256 |
| --- | --- |
| `shared-assessment-quality-20261108-baseline-source.ts` | `2b9690f58f117f056e23b2a50998b285360d13f4113e5e25b75472c2d6715241` |
| `shared-assessment-quality-20261108-vitest.config.ts` | `6b597e0660fbaec7930ecbcf309c6aca8a18f1c915b6eb68d11b02dfcea31f81` |
| `shared-assessment-quality-20261108-probe.test.ts` | `6b0b59abbf70bca6baaf988282c1b8afb48af01270ef2b6ddca870e094a98e31` |
| `shared-assessment-quality-20261108-probe-results.json` | `106fcbbf18e1ae9a6c132ac77b3192dada5752d59ee82443888e91e220c15aa5` |
| `shared-assessment-quality-20261108-focused-a.json` | `78c376d4a9d47ed0bec98ede1e46f7fbe251a28b9c2c90f5f501c09eaeb117b3` |
| `shared-assessment-quality-20261108-lint-a.json` | `d73548613abf581ffe1e0132ec5857fbb84ca15a3fdbf85d8b4d5fedf3e8226b` |

## Limits

This reviewer did not rerun native workerd/D1/R2, typecheck, browser UI, build, or the full repository suite. The root's earlier native parity and the author's prior typecheck are not counted as fresh quality-review executions. Existing parser limitations outside the approved `did not` correction were not broadened or treated as new regressions. Task 2 integration is still required to make edited facts drop stale hints.

Only ignored `work/grounded-verification/shared-assessment-quality-20261108-*` artifacts were created. No tracked file was edited, no model request, external network action, migration, deployment, commit, or push was performed. The five implementation hashes and working-tree change set were unchanged by this review.
