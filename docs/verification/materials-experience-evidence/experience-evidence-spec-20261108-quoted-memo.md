# Task 1 quoted-proposition specification re-review — PASS

Reviewed 2026-11-08 in `C:/Users/XF/.codex/worktrees/materials-replan-recovery/ui-warm-precision`, branch `codex/materials-replan-recovery-20261106`, uncommitted source over HEAD `a5745ae86eb3133068ee147a297a5e5aa47c490a`. This verdict binds the new quoted-proposition repair below. It preserves the earlier specification FAIL/PASS and quality FAIL records as historical evidence. No remaining actionable specification finding was identified in this bounded repair.

Only new `work/grounded-verification/experience-evidence-spec-20261108-quoted-*` artifacts were written. No product/repository-test/docs edits, commit, deployment, push, migration, real model/provider call, or external network request occurred. No further grammar expansion was investigated.

## Exact finding disposition

The quality review's three variants now return false for both the explicit whole-fact path and the already-protected SQL term path:

- `I wrote “My colleague tested SQL.”`
- `I wrote “I tested SQL.”`
- `I wrote "I tested SQL."`

At `app/lib/materials/experience-evidence.ts:93`–`:97`, the consumer checks quoted contents using the existing `quoted` expression and suppresses whole-fact support when those contents are assertion prose. An outer writing action therefore does not authorize the quoted activity. It retains the original evidence string and does not change term-target matching.

At `app/lib/materials/experience-evidence.ts:13`–`:24`, the prior resume-fragment prose condition is extracted into `hasAssertionProse`. An independent AST check proves that expression is text-identical to the prior condition and that `resumeSkillFragment` differs only by calling the extracted helper. No new quotation parser, skill dictionary, actor-name vocabulary, capability level, I/O, or environment-dependent state is introduced. The other eight experience declarations are unchanged, including `supportsMaterialExperience`, sentence-scope consumption, actor boundaries, and uncovered-text handling. All 28 original self-assessment/shared declarations remain unchanged.

Positive controls pass for quoted SQL under supervision, quoted SQL independently, `I wrote ‘SQL’ queries.`, quoted `.NET`, quoted `React.js`, and quoted `SQL Server`. Actual SQL reports/query work, result notes, parameter-only changes, prior mixed-actor protections, technical dots, soft wraps, source-scope checks, and long/nonliteral whole facts remain supported as required. `rg` still finds no production caller; Task 2 has not been wired.

## Fresh independent verification

- **180/180 API tests PASS** in the original workspace using a new config that spreads the base, replaces `include` with the API file, and sets `maxWorkers: 1`. This includes the three exact negative variants, their SQL-term controls, and the six added positive quote/tool controls.
- **65/65 original specification probes PASS.** The execution copy differs only in the fresh result-file path. All inputs and expected values compare exactly with the original saved specification result; all ten first-review false positives remain fixed.
- **36/36 original quality probes PASS.** The execution copy likewise changes only its result-file path. All inputs and expected values compare exactly with the original quality result; the three original whole-fact failures are now fixed.
- **Integrity PASS:** nine fixed source/history hash bindings; 33 preserved historical artifacts, including the three prior review reports; original prose expression unchanged; eight other experience declarations unchanged; all 28 original shared declarations unchanged; all 258 entries of the prior API test source retained in order. Test changes are additions only.
- **All four Node invocations exit 0 and record zero non-loopback denials.** Each label was used once, and no prior output was overwritten.

The current change is limited to the reviewed quotation guard and a mechanically checked extraction. Following the requested focused verification boundary, this reviewer did not repeat the entire 13-suite regression already covered in the prior re-review. The author's current 13-suite/1,647-test, type/lint, and 81-by-five hint results are separate evidence; the four fresh executions above are the independent evidence for this verdict.

## Reviewed source and preserved history

The four current hashes matched on entry and after verification. The pre-repair byte copies were checked against the previous freeze before inspecting the exact source and test diffs.

| Path | SHA-256 |
| --- | --- |
| `app/lib/materials/experience-evidence.ts` | `48bec30986f63a3937d8f89b7493bd2f570aac332ecd890fb81045ac6e091277` |
| `app/lib/materials/personal-assertion-scopes.ts` | `743f1f2a547948e00c015d8c920b15e9c3859d511a59798b620521af0c3bc94a` |
| `app/lib/materials/self-assessment-evidence.ts` | `385cf5822faf38e13855979333c0d6d5f45cb4ab5e60ca7c34d0f375f35b3f75` |
| `tests/lib/materials/experience-evidence.test.ts` | `fe3d431e722b6b0254224abfb755ddb23e41a59ca4ed5e9a6e0d5434a0af71aa` |
| Pre-repair experience source under `experience-evidence-author-20261108-quality-original-freeze/app/lib/materials/experience-evidence.ts` | `33c4f603ed97d7d22d67e6e4c9b1975bbb34a6b5fd1f68f306a18c7efbf09324` |
| Pre-repair API test under `experience-evidence-author-20261108-quality-original-freeze/tests/lib/materials/experience-evidence.test.ts` | `4bf293f1a5b17ce83c63bff22e15a7f7a7167bc9aa86fdd66325772ff5b56306` |
| Original shared-helper baseline `D:/CodexTemp/arc-edited-assessment-repaired-rspZeV/source/app/lib/materials/self-assessment-evidence.ts` | `cb07c50bfce3fd2554a5fb1b80ac4c672951d7994ce8605f4eb0a892a0836b70` |
| Initial spec FAIL `experience-evidence-spec-20261108-memo.md` | `eb73aae2b93ff168a759653bc4f5146da9d046b89023bd465e6aabaaf82ce81f` |
| Previous spec PASS `experience-evidence-spec-20261108-recheck-memo.md` | `7bca4b592b4f6f4e1c29397f696de40dbdf241c7913bb5e57fdb4c181cbb964b` |
| Initial quality FAIL `experience-evidence-quality-20261108-memo.md` | `31749b58c8f60918c9955c4e05613485abb4378383b110334654cf596b43816c` |
| Inspected author handoff `experience-evidence-author-20261108-quality-handoff.md` | `405be2e590362df598731c9be81f7ecc39ca6502893c5fa6d2bc8cad2e7ecf78` |

Short artifact paths in this section are under `work/grounded-verification`. The exact 33 historical file bindings, byte lengths, and hashes are retained in `experience-evidence-spec-20261108-quoted-history-binding.json`; the integrity execution rechecks every entry. This preservation includes earlier failed and passing scripts, logs, results, configs, and memos.

## Exact commands and execution evidence

```text
node work/grounded-verification/run.mjs experience-evidence-spec-20261108-quoted-api-01 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-evidence-spec-20261108-quoted-api.config.ts --reporter verbose
node work/grounded-verification/run.mjs experience-evidence-spec-20261108-quoted-spec-01 work/grounded-verification/experience-evidence-spec-20261108-quoted-spec-probe.mjs
node work/grounded-verification/run.mjs experience-evidence-spec-20261108-quoted-quality-01 work/grounded-verification/experience-evidence-spec-20261108-quoted-quality-probe.mjs
node work/grounded-verification/run.mjs experience-evidence-spec-20261108-quoted-integrity-01 work/grounded-verification/experience-evidence-spec-20261108-quoted-integrity.mjs
```

Every run name below starts `experience-evidence-spec-20261108-quoted-`, with `.log` and wrapper outcome `.json` under `work/grounded-verification`.

| Run suffix | Exit | Counts | Denials | Raw log SHA-256 | Outcome JSON SHA-256 |
| --- | ---: | --- | ---: | --- | --- |
| `api-01` | 0 | 1 suite / 180 tests pass | 0 | `acfacdc081cf42ef237192b77a5696ececd71847e82751ab00d270baebec633f` | `c50a651d7ccb91dad52e6889136be90cd12596dc2fbf681146096df1811d6cd3` |
| `spec-01` | 0 | 65 pass / 0 fail | 0 | `53006664e0a0015a0224408cd2ac6920d8a88c6f3f2403d9cdf9a1fd1c34d19d` | `d97174abb7738d505a3c6472703d82c305979de1cac393c826f8d28c23304305` |
| `quality-01` | 0 | 36 pass / 0 fail | 0 | `4441867c3452c70324c449a9a9be30cb2935898d1d90453fdeca4af915af5b9a` | `21a669cc869be331bee502bb006da0d73393e2edfdddef7f2818385d0f55cf8a` |
| `integrity-01` | 0 | 9 fixed hashes / 33 preserved artifacts / 28 shared declarations / 8 other experience declarations / 258 prior test entries | 0 | `b45af305f892da3677f5845c58a8348b2a2aa4155df05f3fc1fba037af458698` | `a3cb3e543c985d189a1146c26e87b4128127af4c8a08263390c1fe0745fa0a9e` |

## Supporting artifact hashes

All artifact suffixes below belong to `work/grounded-verification/experience-evidence-spec-20261108-quoted-`.

| Artifact suffix | SHA-256 |
| --- | --- |
| `api.config.ts` | `392558942cdbc67799e1e39a341cc3f60a839138abebfc7b0d11f9d9655f7ab3` |
| `spec-probe.mjs` | `4176d5cb3585289802f1ff8697709edff2a7d027ba660cc6da7c2153fef127ad` |
| `spec-results.json` | `05854acb86ea8c1bf1881d1f363a14e1bd5282460458bc6e5a0d34508dc69b07` |
| `quality-probe.mjs` | `0e01691b94ae722631846234866c647c00c4261a466048065bc444cfcbc7cbcb` |
| `quality-results.json` | `ce877bae0dfa404927189297036ef79dbbb2ba883386d904d3b8a1554b99e3cc` |
| `integrity.mjs` | `bb9ee3b1947045a461d1e6e857b0af9d503dc8012db0689978b42ff90d0acfa3` |
| `integrity-results.json` | `b45af305f892da3677f5845c58a8348b2a2aa4155df05f3fc1fba037af458698` |
| `history-binding.json` | `b157ac4eb95cf6b27a60d8461ec912e959bab8e1e709863912b0f4147ef2eb10` |

## Limits

This is specification approval for the frozen Task 1 quoted-proposition repair, with unchanged saved specification controls. It is not approval of Task 2 production integration or a claim of complete natural-language understanding. This reviewer did not repeat the entire repository, type/lint checks, dynamic hint comparison, performance tests, or native workerd runs. Root owns native parity and broader source/reference integrity; the independent quality re-review follows this specification review. Preserve all previous and current review artifacts unchanged.
