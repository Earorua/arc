# Task 1 independent specification review — PASS

Reviewed on 2026-11-08 in `C:/Users/XF/.codex/worktrees/materials-replan-recovery/ui-warm-precision`. Baseline source: `80546d0`; checkout HEAD: `70bafd15d4d807e397610fe619615a697a52d857`. The implementation reviewed is the five working-tree files identified by hashes below. No actionable specification findings.

This review covers the shared self-assessment extraction and the root-authorized English actor-local `did not` correction. Task 2 retention callers, UI behavior, save/reload behavior, and stale-hint repair are outside this approval. The root's separately reported Task 2 red result does not contradict this Task 1 result.

## Specification assessment

| Requirement | Independent result |
| --- | --- |
| Shared API and personal-kind/null gating | `supportsMaterialSelfLevelHint` has the requested typed object signature and explicit boolean return. It rejects null, requirement, and constraint inputs. |
| Reuse existing semantics instead of duplicating the parser | AST comparison against the actual `80546d0` worker source verified all 29 moved declarations. Apart from exports/helper renames, the only semantic delta is the explicitly authorized actor-local `did not` guard. The removed parser declarations do not remain duplicated in the worker. |
| Thin worker adapter and stable exports | `groundSourceSelfLevelHint` uses `item.source.quote` and retains the prior hint-or-null result. Independent contradictory-summary probes confirm that source.quote is authoritative. All four public worker exports remain unchanged. |
| Preserve worker-only responsibilities | 33 remaining worker declarations match the baseline after the expected helper-call substitutions. Source location, detached outer-quote handling, requirement/priority conflict, curriculum-gap, and review-point generation remain in the worker. |
| Preserve document-wide quote masking | The worker masks the entire source document before slicing it for `supportedCodes`. The shared in-scope helper accepts that masked slice. Independent multi-sentence outer-quote probes pass for guided, conceptual, and uncertain levels, including model-proposed reminders. |
| Pure application dependency direction | The shared runtime graph contains only the two new modules, grounded-skill-terms, and app contracts documents/planning/intelligence; the sole external package is the existing zod dependency. No app-to-worker/server dependency, relative import cycle, D1 type, environment read, or fetch call appears in this graph. |
| Bounded authorized behavior change | The new guard examines the action immediately after the current `I` actor and excludes additive `not only`. Fresh probes cover test/build/configure, fronted guidance, instructional practice, positive SQL beside denied React, and a different actor's denial. Both the hint and false confirm-self-assessment reminder are absent for denied action. |
| No unintended hint/adoption behavior | No new independent level, uncertain level, hint mutation, or adoption is introduced. Absence of guidance yields false without modifying the fact. No retention, UI/server save, schema/policy, mapper, practice, or mention-consumer file was changed for Task 1. |
| Tests preserve existing expectations | The worker test diff only adds four denial cases and two positive controls; it removes no test or assertion. All four requested suites pass fresh, including all existing source-span and requirement cases. |

## Fresh verification

Every Node execution used the mandated offline wrapper and a new unique log label. The test config replaces `test.include` explicitly with five exact paths; it does not merge include arrays.

```powershell
node work/grounded-verification/run.mjs shared-assessment-spec-20261108-focused-a node_modules/vitest/vitest.mjs run --config work/grounded-verification/shared-assessment-spec-20261108-vitest.config.ts --maxWorkers=1
node work/grounded-verification/run.mjs shared-assessment-spec-20261108-source-check-a work/grounded-verification/shared-assessment-spec-20261108-source-check.mjs
```

| Run | Result | Process / wrapper exit | Non-loopback denials | Wrapper log SHA-256 |
| --- | --- | --- | --- | --- |
| `shared-assessment-spec-20261108-focused-a` | 717 tests passed, 5 files | 0 / 0 | 0 | `194aa26b7ba1f2cddabc0d63c2ebfea6e6419104ac56f188a56c2d0de1ac036a` |
| `shared-assessment-spec-20261108-source-check-a` | Structural comparison and runtime import graph PASS | 0 / 0 | 0 | `fe78fb098b728282d7f8214c843eaec4dd7b420600266867e7cc7a8182370072` |

The test total is 75 shared evidence + 381 source review + 115 source-span provider + 124 source requirement + 22 independent specification probes. Both wrapper `.json` files and complete `.log` files are alongside this memo. `shared-assessment-spec-20261108-source-check-results.json` records all 29 moved names, all four public worker exports, the exact allowed guard, runtime graph, and implementation hashes.

The independent probes additionally cover frozen input/labels, repeat-call determinism, UTF-16 offset preservation with an emoji inside a quote, nonpersonal kinds across all proposed levels, repeated SQL in another unsupported task, and per-label SQL/React support.

## Reviewed source SHA-256

Hashes were checked before inspection and again after the fresh executions; all match the root-supplied review target.

| File | SHA-256 |
| --- | --- |
| `app/lib/materials/self-assessment-evidence.ts` | `c134d3b6c41b20172368eb2a2b37277308019901a70cf7940f44e68308f587dd` |
| `app/lib/materials/quotation-evidence.ts` | `03a77ad110f67b56b7f1d6f28facdf9c70a92d0e7cd152ecdad806967297516a` |
| `worker/document-executor/source-review-evidence.ts` | `e0cbed00b6e2d49c12d4932fddd28457b33ab2a429e4471c711003db520a5ab6` |
| `tests/lib/materials/self-assessment-evidence.test.ts` | `1edda4e384d4ead989e4211b1ec167758c036e5d666def6f4c2db6f81fd42cf0` |
| `tests/server/document-source-review-evidence.test.ts` | `3c8fca67073e888bba6f51cb4e41c542d5380cba362c55a03db34cd02a51c8a0` |

Review artifact hashes:

| Artifact under `work/grounded-verification/` | SHA-256 |
| --- | --- |
| `shared-assessment-spec-20261108-probe.test.ts` | `7553393020da4fe3be9f1dfc52a13c15587c6235f5c905b76e485bc8f0140d38` |
| `shared-assessment-spec-20261108-vitest.config.ts` | `aea8d0def1b7258fe9dbabc38da56a606f425027cce9f693cb37e9d9df2773c9` |
| `shared-assessment-spec-20261108-source-check.mjs` | `553fa6b84f92b0db020b18fb0d0d90b026eba6d80709d063796c34de432663ec` |
| `shared-assessment-spec-20261108-source-check-results.json` | `fe78fb098b728282d7f8214c843eaec4dd7b420600266867e7cc7a8182370072` |

## Scope and limits

This is a specification review, not the subsequent code-quality review or approval of the whole hint-retention feature. No local workerd, D1/R2, UI, full-repository suite, build, typecheck, or lint was rerun by this reviewer; the PASS above uses only the fresh commands recorded here plus direct source/diff inspection. The AST comparison ignores comments and deliberately normalizes the expected helper renames/export changes and the single authorized guard. The import traversal checks relative static runtime imports and external package names, not zod internals. Existing parser limitations outside the authorized correction were not expanded or silently repaired.

Only ignored `work/grounded-verification/shared-assessment-spec-20261108-*` artifacts were created. No tracked file was edited, no commit/push/model request/deployment/migration was performed, and no network action was requested. The working-tree implementation and its source hashes remained unchanged throughout this review.
