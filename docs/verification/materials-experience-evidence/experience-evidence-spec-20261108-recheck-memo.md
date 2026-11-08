# Task 1 independent specification re-review — PASS

Reviewed 2026-11-08 in `C:/Users/XF/.codex/worktrees/materials-replan-recovery/ui-warm-precision`, branch `codex/materials-replan-recovery-20261106`, HEAD `a5745ae86eb3133068ee147a297a5e5aa47c490a`. This PASS applies to the repaired frozen Task 1 source and the four previously evidenced categories, with the original Task 1 requirements and controls preserved. No remaining actionable finding was identified in that bounded scope. It does not erase or alter the initial FAIL record.

The reviewer inspected the actual repair diff against verified initial byte copies, reran the exact 65 saved probes under a fresh output name, independently reran the 13 selected regression suites, repeated the old-declaration comparison, and checked preservation of the initial evidence and test expectations. No product/repository-test/docs edits, commit, deployment, migration, push, real model/provider call, or external network request were made. Only new `experience-evidence-spec-20261108-recheck-*` review artifacts were added. No additional grammar hunting was performed.

## Disposition of the four original findings

Each previously failing SQL-term and confirmed-whole-fact assertion now returns false. All 10 original failures pass without changing inputs or expected values.

| Original category | Reviewed repair location | Verified disposition and positive controls |
| --- | --- | --- |
| `I wrote reports about my colleague's SQL practice.` / `I wrote notes about my colleague's SQL practice.` | `app/lib/materials/experience-evidence.ts:75` | The direct-object guard includes plural/article-omitted report/summary/note forms. Both phrases reject SQL and whole support. `I wrote SQL reports.` and actual query work with result notes remain true. |
| `Alice knows SQL.` | `app/lib/materials/experience-evidence.ts:20` | The bare-fragment fallback reuses the existing English claim predicate in addition to the practice predicate. The other actor's claim no longer becomes a skill list. `I know SQL.`, bare `SQL`, and familiarity claims remain true. No actor-name or skill dictionary was added. |
| `I built React components, my colleague wrote SQL queries.` | `app/lib/materials/experience-evidence.ts:24`, `:84`, `:88` | The experience-only comma boundary detects a short noun phrase before an existing action/claim predicate. Evidence stops before the other actor; React remains true, SQL and mixed whole false. An immediately following practice predicate continues the same actor; query testing/modification/result controls remain true. The shared parser/worker grammar is unchanged. |
| `I wrote a plan to test SQL.` | `app/lib/materials/experience-evidence.ts:75` | The plan-to object rejects the planned SQL task and whole support. Actual SQL reports, query work, mentor-provided parameter changes, and the long positive whole fact remain true. |

The repaired source still exposes the explicit terms/confirmed-whole-fact target union, admits only experience/skill-claim, preserves the separate whole-fact path, and has no production callers. The action/claim vocabulary is reused for the bounded fixes; there is no new skill dictionary, capability level, I/O, or environment dependency. Sentence masking, allowed-range intersection, technical dots, and UTF-16 source handling are unchanged by the repair.

## Independent verification results

- **Exact saved probes: 65/65 PASS.** The recheck script is byte-equal to the original after substituting only the result filename. A separate integrity check compares every case ID, input, and expected value with the initial result. All original 55 passing controls remain passing, and all 10 false positives are now false as required.
- **Regression: 13 suites / 1,638 tests PASS**, including 171 API cases. Counts were checked in the fresh Vitest summary and in the ANSI-stripped per-case log. The config is identical to the initial independent config: spread the base configuration, replace `include`, and use `maxWorkers: 1`. Execution remains in the original workspace.
- **Literal old declarations: 28/28 unchanged; 18 moved.** The fresh structure run compares all original non-import declaration bodies, ignoring only the added export modifier, to the read-only frozen baseline. Both shared files also retain their initial Task 1 byte hashes.
- **Preservation: 18 expected hashes PASS.** This covers the repaired source/test binding, initial FAIL memo, all initial review scripts/config/logs/results, and initial source/test copies. All 239 lines of the old API test source are preserved in order; the repair only adds tests. Original probe inputs and expectations remain identical, and output filenames are fresh.
- **Every Node run: exit 0, zero non-loopback denials.** All four invocations used the prescribed wrapper and unique labels. Initial artifacts were not overwritten.

The preserved normal controls include unguided practice, mentor-supplied query/parameter work, quoted tool names versus propositions, astral UTF-16 positions, React.js, short Chinese guidance, current-action denial and nominal future, some SQL practice versus a denied specific task, empty terms and kind gates, bare/familiarity claims, nonliteral and long whole facts, mixed actors in English/Chinese sentences, two positive sentences, soft-wrapped denial/future/affirmative actions, and report/example/conditional compound exclusions.

## Reviewed source and historical bindings

Current source hashes were checked on entry and after the fresh runs. The initial byte copies match the first review's recorded hashes. The actual author handoff inspected is `work/grounded-verification/experience-evidence-author-20261108-repair-handoff.md`; its validation claims were not used as substitutes for the fresh independent executions above.

| Path | SHA-256 |
| --- | --- |
| `app/lib/materials/experience-evidence.ts` | `33c4f603ed97d7d22d67e6e4c9b1975bbb34a6b5fd1f68f306a18c7efbf09324` |
| `app/lib/materials/personal-assertion-scopes.ts` | `743f1f2a547948e00c015d8c920b15e9c3859d511a59798b620521af0c3bc94a` |
| `app/lib/materials/self-assessment-evidence.ts` | `385cf5822faf38e13855979333c0d6d5f45cb4ab5e60ca7c34d0f375f35b3f75` |
| `tests/lib/materials/experience-evidence.test.ts` | `4bf293f1a5b17ce83c63bff22e15a7f7a7167bc9aa86fdd66325772ff5b56306` |
| Frozen baseline `D:/CodexTemp/arc-edited-assessment-repaired-rspZeV/source/app/lib/materials/self-assessment-evidence.ts` | `cb07c50bfce3fd2554a5fb1b80ac4c672951d7994ce8605f4eb0a892a0836b70` |
| Initial experience source preserved under `experience-evidence-author-20261108-repair-original-freeze/app/lib/materials/experience-evidence.ts` | `f52443fc2fa3bbfa9434064afbeacd38caa6efc7ec954e56cb90ddef406296d4` |
| Initial API test preserved under `experience-evidence-author-20261108-repair-original-freeze/tests/lib/materials/experience-evidence.test.ts` | `3fefcdcb1fc8ef3e0565abe2ad8ccc580c042beee5d6d65470bb2e925e87290c` |
| Initial FAIL memo `work/grounded-verification/experience-evidence-spec-20261108-memo.md` | `eb73aae2b93ff168a759653bc4f5146da9d046b89023bd465e6aabaaf82ce81f` |
| Initial FAIL result `work/grounded-verification/experience-evidence-spec-20261108-probe-results.json` | `e1e919b654a3cd59468e6532ed6f16ba04bbd6503c738f4edfb6dd24c3cfa6c2` |
| Author repair handoff | `c470b8c86f53be8ed30dfd9a3293ba0574c2357078604ceac3caa07cc580b995` |
| `work/grounded-verification/run.mjs` | `4a2fe29b3c5c0fd9c6ce06cfd436e86e8a9ef9daa8fada44e7c87021c5f28242` |

## Exact fresh commands and run hashes

```text
node work/grounded-verification/run.mjs experience-evidence-spec-20261108-recheck-suite-01 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-evidence-spec-20261108-recheck-suite.config.ts --reporter verbose
node work/grounded-verification/run.mjs experience-evidence-spec-20261108-recheck-probe-01 work/grounded-verification/experience-evidence-spec-20261108-recheck-probe.mjs
node work/grounded-verification/run.mjs experience-evidence-spec-20261108-recheck-structure-01 work/grounded-verification/experience-evidence-spec-20261108-recheck-structure.mjs
node work/grounded-verification/run.mjs experience-evidence-spec-20261108-recheck-integrity-01 work/grounded-verification/experience-evidence-spec-20261108-recheck-integrity.mjs
```

All run names below begin `experience-evidence-spec-20261108-recheck-`; each has its own `.log` and wrapper outcome `.json` in `work/grounded-verification`.

| Run suffix | Exit | Counts | Denials | Raw log SHA-256 | Outcome JSON SHA-256 |
| --- | ---: | --- | ---: | --- | --- |
| `suite-01` | 0 | 13 suites / 1,638 tests / 171 API cases | 0 | `10d3c1931b351462e78d058ae48e019eae83790dd609d20eb5b9882f09c847a4` | `cb3bbfd72567495d74dd9e85c4bfcd317314acbd9ac8f1c3ba5d8dd74bbc749a` |
| `probe-01` | 0 | 65 pass / 0 fail | 0 | `53006664e0a0015a0224408cd2ac6920d8a88c6f3f2403d9cdf9a1fd1c34d19d` | `3c51c2d3d87c971695e97d11daecf43c46e3f37623db587ecedcefd7c0544229` |
| `structure-01` | 0 | 28 identical declarations / 18 moved | 0 | `329b3222b93ac61d2c56e4e81440af12ede19c504e9110a834cc664828d63cc0` | `d7f7b319e022353da25f98c3f89caaff84bf29fcc0f5befbf93fb9eacf4e301a` |
| `integrity-01` | 0 | 18 hashes / 65 unchanged inputs and expectations / 239 original test lines preserved | 0 | `a9d06d5e61cbd2c05b8a383ca9fcdf98273361f1116e689ee50d8164716c5ba1` | `983a55f8687aa2ac0910600bfc001f56a78dd92167178713c54383e86973c7c9` |

## Fresh supporting artifact hashes

All paths below are under `work/grounded-verification` and begin `experience-evidence-spec-20261108-recheck-`.

| Artifact suffix | SHA-256 |
| --- | --- |
| `suite.config.ts` | `4171e6512bb829872e0d58774616b7b7aa7d1feacb1983bcd2a41d9de18b530d` |
| `probe.mjs` | `f7e1aeaac1372cbc2f8de90edc65c6887115b6495561f12e2ed7a550dd2e4ce7` |
| `probe-results.json` | `a03e3b3545b7e3f7dbfd54d42a752433fb5faad89d8a545cf185eb3625f963bd` |
| `structure.mjs` | `72cb626e3a2df626574daa5fa7d755d86994ecea98b0a3638fd77b15ebd1c24a` |
| `structure-results.json` | `329b3222b93ac61d2c56e4e81440af12ede19c504e9110a834cc664828d63cc0` |
| `integrity.mjs` | `447bba4c9e18afd13b483247acb439b1658e294b0ec252feced0e249f838dbdd` |
| `integrity-results.json` | `a9d06d5e61cbd2c05b8a383ca9fcdf98273361f1116e689ee50d8164716c5ba1` |

## Limits

This is Task 1 specification approval for the reviewed frozen repair and bounded grammar, not a claim to understand every free-prose construction. Task 2 is not implemented or approved here. No production mapper/context/UI/policy-version behavior, complete repository build, or live provider behavior was tested. Scoped type/lint and the 81-by-five dynamic hint comparison are author/root evidence, not independent executions in this re-review; literal old-declaration equality and the selected hint/worker regressions were independently rerun. Root owns native Node/workerd parity, broader source/reference integrity, quality review, and any eventual commit. Initial failure artifacts and this re-review's artifacts must remain unchanged.
