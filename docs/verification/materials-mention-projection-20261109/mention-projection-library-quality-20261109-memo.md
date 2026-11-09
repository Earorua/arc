# Task 1 independent code-quality review

**PASS.** No Critical, Important, or Minor actionable finding in the frozen three-file Task 1 patch. This is a review of the versioned library helpers and their new tests, not acceptance of pending provider, service, UI, or end-to-end wiring.

Reviewed baseline: `8cba14ddabc3de6a72af10fe6490f51293559acc` on `codex/materials-replan-recovery-20261106`. Actual branch, HEAD, and dirty state were checked before review. Read the local AGENTS and source index, plus the full cached `origin/master:SOURCE_INDEX.md`; root confirmed its current live GitHub read matches this text. Historical source-routing checkpoints were not used to replace the accepted baseline. The original author handoff and specification review were read as context; fresh evidence below comes from this reviewer.

## Quality assessment

- `app/contracts/documents.ts:5-8,146`: exact marker constants, an `unknown`-accepting type guard using strict equality, and the two-value optional schema keep the version boundary explicit. No coercion, broad truthiness, or prefix dispatch was introduced. Independent probes include zero-width/NUL suffixes, fullwidth punctuation, a boxed string, an array, coercion traps, a Symbol, and a BigInt.
- `app/lib/materials/skill-labels.ts:22-39`: the new locator is a small adapter to existing APIs. Support checks retain the legacy literal branch; only v3 selects mention semantics. Source addition grounds the nominated raw term in the quote first, then validates the resulting concept in the current fact. Independent cases verify rejection when only the edited fact has ambiguous spellings/reviewed equivalents or an incomplete technical name, while compatible source/fact spelling differences retain the source label.
- `app/lib/materials/skill-labels.ts:42-49`: hint retention remains a filter of supplied hints using candidate ID, retained-label membership, eligible fact kind, and the existing personal-evidence checker. V3 changes only the decision to require that evidence. It does not generate hints, change levels, search neighboring facts for evidence, or mutate inputs. Fresh probes freeze nested input objects and arrays, reverse item order, keep another fact with valid evidence for the same skill, and exercise all three hint levels.
- `tests/lib/materials/reviewed-source-mentions.test.ts`: tests distinguish legacy, v2, and v3, verify the unchanged schema/quotas, separate topic discovery from personal support, and exercise lexical/source/deletion boundaries. The existing configured-SQL exception is explicitly preserved instead of changing the shared matcher to fit the original plan assumption. The known used-SQL denial demonstrates the intended version difference.
- Shared matching and personal scope code have no diff. No new dictionary, parallel lexical implementation, dependency, hidden state, or unrelated production behavior is introduced. Responsibilities remain clear: marker discrimination, topic/source matching, and personal-evidence validation are separate.

## Fresh verification

Both Node commands used `node work/grounded-verification/run.mjs` with labels checked unused before execution. Both wrapper outcomes exited 0 and report `nonLoopbackDenials: 0`.

| Label | Result | Raw log SHA-256 |
| --- | --- | --- |
| `mention-projection-library-quality-20261109-probes-a` | 31 independent probes passed; 0 failed, 0 pending | `37d3bcc7dc8db3aea7f3b03f0c85f956f4694391a1286444213e59bc07a4cb4b` |
| `mention-projection-library-quality-20261109-focused-a` | New repository suite: 66 passed; 0 failed, 0 pending | `10c7b70ec1918f43a70f257931c1fef4cd8a7ecad283139e8183d2580f8b6029` |

The associated JSON reports use `-results.json`, and wrapper metadata/logs use `.json`/`.log`. Probe source is `mention-projection-library-quality-20261109-probes.test.ts`; isolated configuration is `mention-projection-library-quality-20261109-vitest.config.ts`. No additional full-repository run was needed for this bounded review; author and specification-review runs are separately recorded and are not counted as fresh executions here.

`git diff --check` passed. Source SHA-256 values checked before and after execution remained frozen:

| File | SHA-256 |
| --- | --- |
| `app/contracts/documents.ts` | `a66e8e843dca7817c2e36253702c10434f184aba3ae1b3be7c52d254695b9b9e` |
| `app/lib/materials/skill-labels.ts` | `a724c5c6b276462ba0ff1a635e42f05aedace5a26bc858e8ab761e91a4e09b4c` |
| `tests/lib/materials/reviewed-source-mentions.test.ts` | `d54b8958d12df32955e75ea4e7ebea4017965cab101c09e69b748913b2b637a2` |
| `app/lib/materials/grounded-skill-terms.ts` (unchanged) | `fa3c23292ed421f3e9ac50a2d09e3dbf636331398160a9bac27152b1d3d7afc7` |
| `app/lib/materials/self-assessment-evidence.ts` (unchanged) | `385cf5822faf38e13855979333c0d6d5f45cb4ab5e60ca7c34d0f375f35b3f75` |
| `app/lib/materials/personal-assertion-scopes.ts` (unchanged) | `743f1f2a547948e00c015d8c920b15e9c3859d511a59798b620521af0c3bc94a` |

Only ignored `work/grounded-verification` probe, configuration, result, log, and memo files were created by this reviewer. Concurrent root documentation changes were observed and preserved. No source, repository test, or documentation edit, model call, network request, deployment, migration, push, or commit was performed by this review.
