# Task 1 independent code-quality re-review — PASS

Reviewed on 2026-11-08 in `C:/Users/XF/.codex/worktrees/materials-replan-recovery/ui-warm-precision`, branch `codex/materials-replan-recovery-20261106`, uncommitted source over HEAD `a5745ae86eb3133068ee147a297a5e5aa47c490a`.

**PASS: the single Important/P2 quoted-proposition whole-fact finding is resolved. No remaining actionable finding within the reviewed Task 1 scope. Ready for Task 1 local integration from this code-quality gate.** This is not overall public-release approval; Task 2 wiring, later integration checks, and release gates remain separate.

## Repair assessment

Compared the actual source/test delta against the byte-for-byte snapshot saved during the initial quality FAIL review. The repair imports the existing `quoted` expression, extracts the existing prose rejection expression into `hasAssertionProse`, and adds a quoted-proposition veto only to the returned `whole` flag at `app/lib/materials/experience-evidence.ts:93`–`:98`.

The three original failures now return false for `confirmed-whole-fact`:

- `I wrote “My colleague tested SQL.”`
- `I wrote “I tested SQL.”`
- `I wrote "I tested SQL."`

All three SQL term targets remain false. Actual `I wrote SQL reports.`, quoted SQL tool objects, two real personal actions, long personal facts, and the previous negative/mixed controls still pass their original expectations. The exact original 36-case script was rerun with only its result-file path changed; the reverse substitution was checked byte-for-byte.

The repair does not duplicate a quotation parser or alter shared report/condition parsing. It reuses the existing finite prose checks without adding actor-name or skill dictionaries. The copied Boolean expression is literally identical to the old resume-fragment condition as extracted through the TypeScript AST. The existing fragment shape check remains in the fragment path and is not imposed on quoted literal tools. Eight other experience-module declarations are unchanged, including `supportsMaterialExperience`, `experienceAssertionScopes`, `uncoveredText`, and the action/claim predicates. The experience helper remains pure, with no input mutation, I/O, environment cache, or ability-level decision.

The new tests add the three exact negative quote cases and six positive quoted-tool/work controls. All previous 257 test content lines remain in order; the current file has 269 content lines. The 180 API cases assert the implementation directly. The independent preservation script also directly exercised `.NET`, `React.js`, `SQL Server`, and `SQL` as quoted tool objects against both target kinds: all eight checks pass.

## Preservation and input-bound checks

- All 28 original non-import declarations match the frozen pre-Task-1 baseline after stripping only an added `export` modifier. All 18 moved declarations remain identical and each declaration appears once.
- The two shared source files retain their original Task 1 hashes. No old self-level, reminder, source-span, or shared-parser implementation was changed by this repair.
- Sixteen historical quality artifacts were hash-verified unchanged: the initial FAIL memo, its probe/config/scripts/logs/results, and the four saved source/test files. The old 33/36 FAIL evidence remains preserved, rather than rewritten as a pass.
- Copied the four newly reviewed source/test files byte-for-byte to `work/grounded-verification/experience-evidence-quality-20261108-recheck-source-freeze/`, retaining their relative paths.
- A fresh search under `app` and `tests` still finds `supportsMaterialExperience` only in its definition and API tests. Task 1 has no production caller.
- Candidate/confirmed text remains bounded upstream to 1,000 UTF-16 code units, with at most eight distinct 100-unit labels. The helper is not itself a schema validator; later integration should continue using the existing validated inputs.

Repeated the initial review's four bounded-input shapes at 1,000 code units: many sentences and many commas, each with eight terms or a whole-fact target. All 140 calls returned the expected true result (five warmups plus 30 measured calls per shape). Local Node timings in milliseconds:

| Shape | Median | p95 | Maximum |
| --- | ---: | ---: | ---: |
| Many sentences, eight terms | 4.1323 | 8.4883 | 10.3642 |
| Many commas, eight terms | 6.2477 | 6.8289 | 7.0052 |
| Many sentences, whole fact | 0.2016 | 0.2295 | 0.4626 |
| Many commas, whole fact | 1.3690 | 1.8805 | 2.5081 |

These bounded local observations do not establish an SLA or workerd load limit. No additional performance finding was established, and no unrelated grammar expansion was undertaken.

## Reviewed source hashes

| Path | SHA-256 |
| --- | --- |
| `app/lib/materials/experience-evidence.ts` | `48bec30986f63a3937d8f89b7493bd2f570aac332ecd890fb81045ac6e091277` |
| `app/lib/materials/personal-assertion-scopes.ts` | `743f1f2a547948e00c015d8c920b15e9c3859d511a59798b620521af0c3bc94a` |
| `app/lib/materials/self-assessment-evidence.ts` | `385cf5822faf38e13855979333c0d6d5f45cb4ab5e60ca7c34d0f375f35b3f75` |
| `tests/lib/materials/experience-evidence.test.ts` | `fe3d431e722b6b0254224abfb755ddb23e41a59ca4ed5e9a6e0d5434a0af71aa` |

Baseline helper path: `D:/CodexTemp/arc-edited-assessment-repaired-rspZeV/source/app/lib/materials/self-assessment-evidence.ts`; SHA-256 `cb07c50bfce3fd2554a5fb1b80ac4c672951d7994ce8605f4eb0a892a0836b70`.

Inspected author handoff `experience-evidence-author-20261108-quality-handoff.md`: SHA-256 `405be2e590362df598731c9be81f7ecc39ca6502893c5fa6d2bc8cad2e7ecf78`. Initial quality FAIL memo remains SHA-256 `31749b58c8f60918c9955c4e05613485abb4378383b110334654cf596b43816c`.

## Exact fresh Node commands and outcomes

Every Node invocation used the prescribed wrapper and a new `experience-evidence-quality-20261108-recheck-*` label. All three runs exited 0 and recorded **zero non-loopback denials**. No external/model/provider, deployment, migration, push, or commit was attempted. This reviewer changed only new ignored verification artifacts; production source, tests, root documentation, and earlier evidence were not edited.

```text
node work/grounded-verification/run.mjs experience-evidence-quality-20261108-recheck-probe-a work/grounded-verification/experience-evidence-quality-20261108-recheck-probe.mjs
```

36/36 original probes pass; wrapper elapsed 216 ms; denials 0.

- Log SHA-256: `4441867c3452c70324c449a9a9be30cb2935898d1d90453fdeca4af915af5b9a`.
- Wrapper outcome JSON SHA-256: `8767bfb6649c59c815702c804b88492f9584f2c1b31f0bbee0e577ea2739e53d`.
- Probe results JSON SHA-256: `ce877bae0dfa404927189297036ef79dbbb2ba883386d904d3b8a1554b99e3cc`.

```text
node work/grounded-verification/run.mjs experience-evidence-quality-20261108-recheck-unit-a node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-evidence-quality-20261108-recheck-unit.config.ts --reporter verbose
```

1 suite / 180 tests pass; wrapper elapsed 1,665 ms; denials 0. The config spreads the base config and `base.test`, replaces `include`, and sets `maxWorkers: 1`.

- Log SHA-256: `134b353810c32cfbd8cb3d91ec662c02b24e9eb9046b2944e83d64375d4bc7d8`.
- Wrapper outcome JSON SHA-256: `600ccd08fcc31540ab4353bf8e59222b5892706bb7e06ab3b77687a0dfad3682`.

```text
node work/grounded-verification/run.mjs experience-evidence-quality-20261108-recheck-preservation-a work/grounded-verification/experience-evidence-quality-20261108-recheck-preservation.mjs
```

Preservation and controls pass: 28 baseline declarations, 18 moved declarations, eight unchanged experience declarations, exact extracted prose expression, 16 unchanged historical artifacts, 257 original test content lines, eight quoted-tool controls, and four input-bound shapes / 140 calls. Wrapper elapsed 852 ms; denials 0.

- Log SHA-256: `561b400b11baee10ba0918f6a8e9f79169df831e08e87e3839effbc574b32ec1`.
- Wrapper outcome JSON SHA-256: `5198d05dbd041af83fcd74f5a5647ad34071690a8ff62000ea1f1e90c29187f5`.
- Preservation results JSON SHA-256: `dd9c2d6a18e69de2ea3a57f88d6f8ee3744765dc7aed25324120b74d4ea1436b`.

Supporting artifact hashes:

| Artifact | SHA-256 |
| --- | --- |
| `experience-evidence-quality-20261108-recheck-probe.mjs` | `0db6f2b21da27cb97a6a61db13639b1c97b15eca2919ade6c45dee8d92a316f2` |
| `experience-evidence-quality-20261108-recheck-unit.config.ts` | `392558942cdbc67799e1e39a341cc3f60a839138abebfc7b0d11f9d9655f7ab3` |
| `experience-evidence-quality-20261108-recheck-preservation.mjs` | `b7a04f867579586e34f2e1b440770e671dc47c237e59e4f0eaa50be545d8a787` |

Additional read-only checks used `git rev-parse HEAD`, `git status --short`, `git diff --no-index` against the previous source/test snapshot, `rg --line-number 'supportsMaterialExperience' app tests`, PowerShell file reads/hashes, and `git diff --check -- app/lib/materials/self-assessment-evidence.ts` (exit 0). `git diff --no-index` reported the intended differences; it was not treated as a failing test.

## Limits of this PASS

This re-review closes the one preserved quality finding and confirms the bounded repair against its source freeze. It does not claim exhaustive natural-language parsing. No concern arose that warranted repeating the previous five-suite review selection or all 13 author suites. The earlier 1,079-test quality run belongs to the preceding freeze; the current author 13-suite/1,647-test run, spec review's 65 cases, type/lint runs, 81-by-five hint comparisons, and root Node/workerd evidence are corroborating reports, not fresh independent executions counted here. The fresh independent counts are stated above.

The full-repository 9,325-test result belongs to an older baseline and is not current coverage. No Task 2 mapping/context/UI/policy implementation was reviewed here. Root owns local integration, documentation, commits, and the later public-release assessment.
