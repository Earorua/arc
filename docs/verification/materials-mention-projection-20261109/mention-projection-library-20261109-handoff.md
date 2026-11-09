# Task 1 source-mention projection library handoff

Status: DONE; three source/test files frozen for independent spec and quality reviews. No commit made.

Baseline: `codex/materials-replan-recovery-20261106` at `8cba14ddabc3de6a72af10fe6490f51293559acc`, initially clean. Read local `AGENTS.md`, the local source index, and the GitHub master source index via its raw URL. The indexes' historical paused SHA was treated as routing context, not as an instruction to replace the accepted local baseline. Only required source-index reading used the network; all execution/verification used the offline wrapper.

## Changes

- `app/contracts/documents.ts`: adds exact `source-skill-mentions-v3` marker; accepts only optional v2/v3 review projections; exports the exact-match `isSourceLinkedMaterialReviewProjection` type guard. Existing document schema version, v2 marker and quotas remain unchanged.
- `app/lib/materials/skill-labels.ts`: adds `findReviewedSourceTerm`; v3 uses the existing mention locator, v2/omitted locator calls remain affirmative. Source additions accept an optional projection and require a nominated raw term in the quote plus support in the current fact. Legacy literal edit rules remain intact. V2/v3 and user edits revalidate retained self-assessment hints through the existing personal-evidence validator.
- `tests/lib/materials/reviewed-source-mentions.test.ts`: 66 tests covering marker/schema constraints, compatibility, nomination and current-fact checks, reviewed equivalents, source spelling, case ambiguity, lexical boundaries, quotas, actor/quotation/future/negative separation, edits, reclassification, explicit empty/deleted labels and no hint invention.

No shared locator, lexical/scope implementation, dictionary, provider, server or UI files changed by this task. Existing `retained-assessment-hints`, `material-skill-mentions` and `grounded-skill-terms` test files were reused unchanged. The root agent's concurrent plan edit is outside this agent's changes.

## Evidence-based example correction

The initial plan incorrectly assumed v2 rejects `I have never configured SQL for production.`. The original implementation returns `true` from `supportsReviewedSkillLabel` and `SQL` from `labelForAddedSourceTerm` for v2 and omitted projection. The initial RED run records the incorrect assumptions failing; the corrected RED run locks those existing responses before production changes.

The paired existing denial form `I have never used SQL for production.` returns `false` for v2 support and `null` for v2/omitted additions. This form now demonstrates the v3-only routing change. The exact original configured sentence remains explicitly covered for v3 topic retention and rejection of conceptual, guided and uncertain hints. Root approved preserving compatibility and updated the plan.

Baseline SHA-256 values:

| File | SHA-256 |
| --- | --- |
| `app/contracts/documents.ts` | `081b385f3ef2357d7f14dac08bc687caf6126f58beded75c9b230586073635e8` |
| `app/lib/materials/skill-labels.ts` | `d2a5c3c69c1bd671a30b9597bcec44435baa21b3ce7aedd7664045217118bad0` |
| `app/lib/materials/grounded-skill-terms.ts` (unchanged) | `fa3c23292ed421f3e9ac50a2d09e3dbf636331398160a9bac27152b1d3d7afc7` |

## Verification outcomes

All execution used `node work/grounded-verification/run.mjs <unique-label> <node-args>` after verifying its evidence paths did not exist. Every outcome reports `nonLoopbackDenials: 0`. No raw npm/Node child invocation, deployment, migration, model call or push was performed.

| Outcome label | Result |
| --- | --- |
| `mention-projection-library-20261109-red` | Exit 1; 41 failed / 22 passed. Includes the two disproven compatibility assumptions. Original test source preserved as `mention-projection-library-20261109-red-test.source.txt`. |
| `mention-projection-library-20261109-red-corrected` | Exit 1; 42 failed / 24 passed. Expected missing v3 functionality; original configured-sentence compatibility assertions pass. Corrected pre-implementation test source preserved as `mention-projection-library-20261109-red-corrected-test.source.txt`. |
| `mention-projection-library-20261109-green` | Exit 0; 4 suites / 507 tests passed: new suite 66, retained hints 128, source mentions 123, grounded terms 190. |
| `mention-projection-library-20261109-tsc` | Exit 0; scoped TypeScript check with `mention-projection-library-20261109-tsconfig.json`. |
| `mention-projection-library-20261109-lint` | Exit 0; ESLint on the three changed source/test files. |

Each outcome has a `.json` metadata record and `.log`; Vitest reports use `-results.json`. `git diff --check` passed. Self-review found no unaddressed task-scope issue: all v3 branching is explicit, old behavior is preserved, current facts retain their text, absent/deleted terms are not reconstructed, and no hint is created or upgraded.

## Frozen changed-file SHA-256

| File | SHA-256 |
| --- | --- |
| `app/contracts/documents.ts` | `a66e8e843dca7817c2e36253702c10434f184aba3ae1b3be7c52d254695b9b9e` |
| `app/lib/materials/skill-labels.ts` | `a724c5c6b276462ba0ff1a635e42f05aedace5a26bc858e8ab761e91a4e09b4c` |
| `tests/lib/materials/reviewed-source-mentions.test.ts` | `d54b8958d12df32955e75ea4e7ebea4017965cab101c09e69b748913b2b637a2` |

Remaining work belongs to the broader approved plan: independent review, provider/server/UI wiring and integration verification. This task does not claim those stages complete.
