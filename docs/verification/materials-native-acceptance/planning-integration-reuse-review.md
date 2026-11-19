# Native planning evidence reuse after English integration

Date: 2026-11-19. Reviewer: independent `native_planning_quality`. This is a narrow source-delta review, not a new native execution or final application acceptance.

**Decision: reuse the accepted 14-case native behavioral evidence; no native-case rerun is warranted by the three inspected changes.** This decision is conditional on the final source retaining the hashes below and the other 143 imported files remaining unchanged. Current English UI and final integrated application validation remain separate requirements.

## Compared source

The accepted native manifest contains 146 imported files. A read-only comparison found exactly three changed files and 143 byte-identical files. `47b0e0a` and `ef1b26b` have identical application versions of these three files. The current worktree is undergoing a local merge of fetched `origin/master` `60e7cb6`; no checkout or index changes were made by this review.

| Changed file | Accepted SHA-256 | Reviewed current SHA-256 |
| --- | --- | --- |
| `app/data/flagship-role.ts` | `e57cb6a20bb27ca2622fa43677f91be9c8c964cbd48847759007824ae9b37eef` | `7070068cd2edb6bb176b61f01e9e2e2f1800b24179c908e3619e11be5560572e` |
| `app/lib/materials/course-task-evidence.ts` | `ecf8aa41e10ee63ae55b91356c257a131b90e252ee0a4720c41e550f1c62e469` | `9918053c28c8577cfee0f4d416290908c189cd4202964d91a35508924d39b49e` |
| `app/lib/materials/explanations.ts` | `9d953c2d15611c32062e2c98a126ad1ef65ebec8a71e24a863983ae6ea816534` | `4890a600779022b9a956682076d3a3cfddc5759a154e314fed41a6c18fb5d0b8` |

`flagship-role.ts` changes only the role display name, today's summary title and its three step labels. The role name also supplies the blueprint display name. The separate [integrated course binding](integrated-course-result.md) records the five translations, unchanged 48 teaching units and reviewed dependency equivalence; this review does not repeat that capture or its four tests.

`course-task-evidence.ts` translates the nine display labels and four remaining-scope labels. Task IDs, course/skill IDs, leaf selectors, exact teaching quotes and additional leaf checks are unchanged. The coverage evaluator and mapping logic remain byte-identical.

`explanations.ts` translates fixed message templates and changes `MATERIAL_EXPLANATION_VERSION` from `2026.11.4` to `2026.11.5`. Every condition, rule ID, change kind, source-availability value, unit/item/skill projection and source-deletion early return is unchanged. No source prose is newly imported into messages.

## What may be reused

The recorded native transactions remain evidence for the unchanged service/contract rules: confirmation does not adopt ability; explicit choices precede generation or acceptance; primary-JD authority is exclusive; a proposal does not silently replace the current plan; withdrawal, deletion, term exclusion and stale acceptance retain their guards; completed work, audits and Proof are preserved. The three changes do not alter those decisions, transaction paths, schema guards, task content, dependency order or budgets.

This is semantic evidence reuse supported by an inspected delta. It is **not** a claim that the integrated source was used in the original run or that all current serialized outputs are byte-identical to the originals.

## Version and validation boundaries

- The translated blueprint name changes `sourceVersions.contentDigest`. Existing `verifyReference` and material-acceptance checks still reject a mismatched source digest. A preview created before integration must not be described as automatically valid under the new display binding; it can require recreation under the current source.
- Explanation version is included in context snapshots/fingerprints and adoption comparison. A new version can yield a new context identity or require an explicit context proposal even when the resulting task order is unchanged. This is the existing version boundary, not a new automatic adoption path. The old run does not demonstrate cross-version preview/token reuse or byte-identical identifiers.
- Stored historical snapshots and native results keep their original versions and bytes. History display uses current fixed explanation templates; English message wording and current version expectations belong to the integration's focused/final checks. This review does not assert that those checks have already finished.
- The original UI test file has since been translated and a bulk-control guard case added. Its old five-case result and the earlier one-case supplement remain historical evidence for their recorded source. Current English setup, adoption controls and rendering must rely on the new English-targeted tests and final integration acceptance. Do not loosen the original collector's accepted-UI-byte check to relabel the old run as current.

The old native manifest (`c65d84b1048dbad28f0eea7e21e81c77c4c577b43c0bb67ab77fb978fd1b6d4d`), check result (`d9026957497342116e47e7c77071839fe669119b33958adf89c304fc216461de`), input, worker, checker and lossless ZIP were read-only checked and remain unchanged. No manifest hash was substituted, no historical result was rescored, and no test or native matrix was run. Only this memo was written. Root should verify this exact three-file delta again at final source freeze; any additional behavioral change needs its own bounded assessment.
