CHANGES REQUESTED — one P2 task-scope defect in frozen Task A handoff 03-source, 2026-11-19.

Reviewed the ten actual source/test changes cumulatively against `24a344858cfde17888675716df488421b61fff2d`, plus the root-owned compiler/lint exclusions and B0 current-version expectation. All ten source hashes matched handoff SHA-256 `8f7e8ef262b6de568d025390fa64b6c0e5156fa345cbb42bf4d18c12c0ef11df`; narrow specification PASS SHA-256 is `85d4b1cf4c197d13bcd5db8012a132c5c1e17b1029f2506072eb5e80fb6b8167`. This is an immutable review of that freeze, before any quality-finding repair.

**P2 — preserve unknown dependent qualifiers before discarding split clauses.** At `app/lib/materials/course-relation-scope.ts:101`, the comma delimiter still accepts any clause beginning with `按`. The retained-term filter at line 102 then discards an unknown qualifier that does not repeat the term. The coverage check at `course-task-coverage.ts:145–147` sees only the supported task and returns full. This is the same qualifier-loss cause as the corrected general `following` delimiter; removing that English alternative did not close the Chinese path.

One announced two-input probe used the actual flagship blueprint/registry, `mapMaterialItemTerms`, `courseTaskScopes` and `createCourseTaskCoverageEvaluator` through `node --import tsx --input-type=module`. Its item had ID `quality-form`, kind `experience`, origin `user`, null source/requirement, and the sole retained label `HTML`. Both mappings were contextual `web-platform`. Exact observations:

| Input text | Actual retained scope | Actual coverage |
| --- | --- | --- |
| `构建带标签的语义HTML表单，按HIPAA要求。` | `构建带标签的语义html表单` | `full`, support `["semantic-form"]`, remaining `null` |
| `构建带标签的语义HTML表单，按评审反馈。` | `构建带标签的语义html表单` | `full`, support `["semantic-form"]`, remaining `null` |

The first case must retain its unknown requirement and remain partial/unassessed; recognized guidance may still be full. Correct the finite delimiter policy without adding vocabulary or a general language parser. In particular, preserve the legitimate separate tasks in `在交互社维护 React 表单，按评审反馈修复键盘焦点顺序` while retaining unknown dependent guidance. Static inspection of the same finite alternatives found that explicit action/actor starts (`交付`, `我`, `i/we/my`, actor conjunctions) are mixed with bare guidance/negation/contrast starts (`按`, `没有`, `but/whereas/while`), after which every fragment is discarded solely by term absence. Assess those alternatives consistently at this same boundary rather than repairing synonyms one at a time. Only the two inputs above were executed; this is one bounded finding, not additional claimed reproductions.

No other actionable defect found in the reviewed slice. New course support stays linked to exact current teaching leaves; the keyboard-state, product-outcome and component-token rubric quotes exist in the actual registry. Old support IDs remain readable. The mapping version advances to 2026.11.7 while explicit prior alias versions remain accepted. Actual source terms, extraction, experience predicates, self-assessment adoption, primary-JD authority and context-priority code are unchanged. New topic relations still pass through the existing personal-practice predicate. Course ambiguity and task support remain separate, manual course selection restricts support, and the UI explains combined candidate content. There are no gold imports, corpus/field identifiers or course-content edits in production changes.

The config exclusions are confined to untracked `work` and the two named immutable evidence directories; no active module or lint/compiler rule is excluded or weakened. The saved scope-check script and matching config hashes establish the same 887-file set and semantic options as the successful compiler run, with only cache/config-path differences. The 282 earlier errors belong to fourteen relocated archive copies. The B0 test changes only the current imported version expectation to 11.7; its historical 11.2 value and frozen hashes remain intact. That one-line expectation is still awaiting final full acceptance, as disclosed.

Reused evidence: all twenty distinct author raw-log hashes and wrapper exits across handoffs 01/02/03 reconcile. The initial affected run records 261 passed / 3 failed across thirteen files; the causal rerun records 50/50 across three files. The token-leaf case has a retained RED and one selected GREEN. The later relation/context/practice correction records 128/128; the following correction records one selected GREEN with twelve skipped. Compiler success and changed-file lint are recorded, with type reuse for the later regex-only delta stated explicitly. These results are not a new full-source run.

Diagnostic 02 remains source PASS and course 146/146, with result SHA-256 `60d18b0aefa3bec8ed93e2ce07455f442526044fd840f142101355426cd66ccc`. The inspected delta-reuse script/result (`437e0aa7bd299e770ec56e8b06b9688c4e66d21bbadc95988417911a977e7724`) verifies the exact removed `following` alternative, one affected actual fact/three unchanged mapping rows and 143 unaffected rows. That reuse is valid for its declared change and inputs; it does not cover the newly confirmed qualifier defect or establish model quality.

| Reviewed file | SHA-256 |
| --- | --- |
| `app/lib/materials/skill-mapper.ts` | `2fb992337c5112856ee9253d2da843f5d5bd0be3d09de970c49023345e133b1c` |
| `app/lib/materials/course-relation-scope.ts` | `3baf01ebbb123d029a3036340fd5ec89b0f34239f67ea96776fd18aa7abfdf93` |
| `app/lib/materials/course-task-coverage.ts` | `5cbca147cb1d8c707cd4e8eb32b1e02e04d6b1d6c5c16b0eb57dc635b68e640b` |
| `app/lib/materials/course-task-evidence.ts` | `f21a983255129082788321455b8b5dfd8f574cbae370682680fb7e9bbe8cadd4` |
| `app/components/materials/material-context-review.tsx` | `3fcba579de055759e72241050321224fc1de071c34d60f09791e732372fd9f01` |
| `tests/lib/materials/course-relations.test.ts` | `f3f7f15761b99f3006e3fc759aa0df78350adb99e6db94c36ecb47f8a1e0def5` |
| `tests/lib/materials/skill-mapper.test.ts` | `cb888823d9d4746a11c9234e1d78de875311c145af5615dbb7d0b8ad388e5ef1` |
| `tests/lib/materials/practice-skill-mapping.test.ts` | `7cd4c88e1af0c92e4e8de2d2b81839beeb8234766d3bd9e3d9277c6ef7da3090` |
| `tests/server/material-practice-priorities.test.ts` | `59314cf66eb8ddc3d3e5eab8b9485038e16065e26340a634e507e2bbca9f6f84` |
| `tests/components/material-context-choices.test.tsx` | `9b8742703bef4a91da9e79233652ddb624e8d1bfb194dcbce45a372bd46dd852` |
| `tsconfig.json` | `5b2551b01448b64231114c46bd22e8b9bbf0dca4bfc15043e1a4a7157afcb653` |
| `eslint.config.mjs` | `bee3126106e217f300437d68d6cea72f90a44a9b52b8e65fb16366dab093f156` |
| `tests/server/document-b0-inputs.test.ts` | `9ea8807d3f7c38c034d9f7b68aab8aad1f472febedc8767c32f919320abcf3c1` |

Reviewer writes: this memo only. Beyond the single announced two-input component probe, there were no tests, wider probes, native/full-suite reruns, network/model calls, production/test edits, staging or commits. Task B native/source rebinding, final product acceptance, model quality, Gate authorization and release remain unaccepted; the current adapter's native-drift rejection is intentional.
