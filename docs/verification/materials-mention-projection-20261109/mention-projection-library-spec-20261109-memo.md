# Task 1 independent specification review

**PASS.** No Task 1 specification failure found. Reviewed the actual implementation and new test file against accepted baseline `8cba14ddabc3de6a72af10fe6490f51293559acc`; did not rely on the author handoff as proof. Branch is `codex/materials-replan-recovery-20261106`. No source, repository test, or documentation files were changed by this review. All new files are under ignored `work/grounded-verification`.

Read local AGENTS and local source index, plus cached `origin/master:SOURCE_INDEX.md` to preserve the offline-only boundary. The indexes' historical paused SHA was not used to replace the accepted local baseline.

## Requirement findings

- `app/contracts/documents.ts:4-8,146`: document schema version and v2 marker remain unchanged; exact v3 marker added; discriminator accepts only exact v2/v3; stored marker remains optional and rejects unknown values.
- `app/lib/materials/skill-labels.ts:22-32`: only v3 uses the existing mention locator. V2 keeps affirmative matching; legacy/unknown runtime marker keeps the old literal support branch. No dictionary or second lexical locator was introduced.
- `app/lib/materials/skill-labels.ts:35-39`: optional fourth argument selects v3 source nomination, then separately verifies the nominated concept in the current fact. Missing raw terms, canonical reverse inference, stale facts and ambiguous source spellings are rejected. Omission/v2 preserves old additions.
- `app/lib/materials/skill-labels.ts:42-49`: v2/v3 and user-edited facts reuse personal-evidence validation. Legacy unedited behavior remains unchanged. Negative, other-actor, quoted, future and conditional SQL topics remain discoverable while unsupported conceptual/guided/uncertain hints are removed. Mixed SQL/React actor cases retain only the personally supported hint. Deleted facts/labels, explicit empty lists and reclassification do not recreate hints; no hint is invented.
- `app/contracts/documents.ts:13,28,81,95` and unchanged shared matcher preserve eight labels, 100 UTF-16 units per label, 100 facts, quote/context limits, reviewed equivalents, titles, Chinese suffixes, grapheme boundaries and complete technical names. Helpers neither rewrite the fact nor its source range.
- New repository tests at `tests/lib/materials/reviewed-source-mentions.test.ts:33,56,70,84,116,133,145,157,164,183,191,196,203,218` cover the required identities, compatibility, nomination, lexical and personal-evidence boundaries.

## Independent execution

Every Node process was launched through `node work/grounded-verification/run.mjs`; evidence labels were checked unused first. Both executions exited 0 with `nonLoopbackDenials: 0`.

| Label | Actual result | Log SHA-256 |
| --- | --- | --- |
| `mention-projection-library-spec-20261109-suites-a` | 4 files, 507 passed, 0 failed: new 66; retained hints 128; mentions 123; affirmative grounding 190 | `dcfa11a3792b70c2ded4b69972961b3a1021e600fa9c176787f84e743e1331d5` |
| `mention-projection-library-spec-20261109-probes-a` | 1 independent probe file, 51 passed, 0 failed | `0412ade340966d18da2a96286fd6875553d6531f8fc5bbb225e7428a4d386efb` |

The 51 probes include **7,560 baseline differential cases**: 600 old support cases, 1,200 old addition cases and 5,760 old hint cases. The baseline helper was read using `git show 8cba...:app/lib/materials/skill-labels.ts` into an ignored copy with only its three import paths rewritten; dependencies remain the unchanged current shared implementations. Extra probes independently exercise exact marker rejection, schema quotas, whole fact/source preservation, actor/time/quotation separation, deleted/reclassified state and lexical safeguards. Reports are the corresponding `-results.json`; wrapper metadata are `.json`; raw logs are `.log`.

The exact original sentence `I have never configured SQL for production.` independently returns v2 `true` / `SQL` from the accepted baseline, and is preserved. `I have never used SQL for production.` independently returns baseline v2 `false` / `null`, with v3 `true` / `SQL`. This is compatible behavior, not a finding against Task 1. Original RED evidence was read but never changed.

`git diff --check` passes. Source hashes were independently checked before and after execution and stayed frozen:

| File | SHA-256 |
| --- | --- |
| `app/contracts/documents.ts` | `a66e8e843dca7817c2e36253702c10434f184aba3ae1b3be7c52d254695b9b9e` |
| `app/lib/materials/skill-labels.ts` | `a724c5c6b276462ba0ff1a635e42f05aedace5a26bc858e8ab761e91a4e09b4c` |
| `tests/lib/materials/reviewed-source-mentions.test.ts` | `d54b8958d12df32955e75ea4e7ebea4017965cab101c09e69b748913b2b637a2` |
| `app/lib/materials/grounded-skill-terms.ts` (unchanged) | `fa3c23292ed421f3e9ac50a2d09e3dbf636331398160a9bac27152b1d3d7afc7` |

Scope: Task 1 library specification only. Provider/service wiring, UI, practice attribution integration and final acceptance belong to later tasks and are not claimed here. No model call, network access, deployment, migration, push or commit was performed by this review.
