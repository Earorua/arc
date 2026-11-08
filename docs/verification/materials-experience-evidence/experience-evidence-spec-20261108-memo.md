# Task 1 independent specification review — FAIL

Reviewed 2026-11-08 in `C:/Users/XF/.codex/worktrees/materials-replan-recovery/ui-warm-precision`, branch `codex/materials-replan-recovery-20261106`, HEAD `a5745ae86eb3133068ee147a297a5e5aa47c490a`. This memo binds the initial frozen implementation, before any review repair. The reviewer read `requesting-code-review` and `verification-before-completion`, inspected the Task 1 plan/source/diff, and ran independent verification. No product, repository test, or documentation source was modified; only new review artifacts under `work/grounded-verification` were added. No commit, push, deployment, migration, real model/provider call, or external network request was performed.

The existing regression passes, and the old helper declarations are unchanged. The new predicate nevertheless accepts four evidenced categories that violate the required personal-action/target attribution. Task 1 requires bounded fixes and re-review before approval. Root acknowledged these categories as within the approved boundaries and requested no further grammar expansion during this review round.

## Blocking findings

All reproductions call the actual bundled `supportsMaterialExperience`, with `kind: "experience"`. For each listed phrase, both `{ kind: "terms", terms: ["SQL"] }` and `{ kind: "confirmed-whole-fact" }` are expected false but observed true.

1. **Report-object variants still grant the reported skill.** `I wrote reports about my colleague's SQL practice.` and `I wrote notes about my colleague's SQL practice.` each pass. At `app/lib/materials/experience-evidence.ts:57`, the guard only recognizes a singular report/summary/note preceded by an article. The plural forms reach the affirmative `wrote` branch and return all residual text as evidence. These are the same reporting-only boundary as the approved singular `I wrote a report about my colleague's SQL practice.` rejection, which independently remains false. `I wrote SQL reports.` remains a passing positive control. Four failed assertions.

2. **Another person's skill claim is accepted as a bare resume skill.** `Alice knows SQL.` passes. `resumeSkillFragment` at `app/lib/materials/experience-evidence.ts:17`–`:20` rejects selected actor/predicate words and practice verbs, but permits this three-word actor/claim sentence; `personalExperienceScope` at `:63` therefore accepts it. A personal fact kind cannot make Alice's skill the user's skill. Bare `SQL` and `I am familiar with SQL.` independently pass as intended. Two failed assertions.

3. **A comma-separated other actor borrows the first actor's action.** `I built React components, my colleague wrote SQL queries.` passes for SQL and the whole fact. The sentence consumer reuses the original scope at `app/lib/materials/experience-evidence.ts:104`–`:107`, whose shared grammar does not split this comma/actor combination; the term check at `:125`–`:126` then searches the entire retained evidence after recognizing `I built`. The React target correctly passes. The matching `and my colleague` form and English/Chinese period forms correctly reject SQL and the mixed whole. Two failed assertions. Repair should preserve the approved unchanged shared helper/worker behavior.

4. **Writing a plan grants the planned task as actual experience.** `I wrote a plan to test SQL.` passes. The action test at `app/lib/materials/experience-evidence.ts:54`–`:58` treats `wrote` as direct practice and carries the planned SQL task in the same evidence, although only preparation of a plan is asserted. This is the future/administrative-action attribution boundary, not evidence of testing SQL. Two failed assertions.

The independent probe records 65 assertions: 55 pass and 10 fail across these four categories. No implementation edit or unbounded search followed these findings.

## Verified compliant portions

- The exported API has the requested discriminated target union, only admits experience/skill-claim, does no I/O or environment access, does not mutate inputs, and has no production caller. The only new shared-parser imports are the evidence predicate and the unchanged self-assessment consumer.
- An independent TypeScript AST comparison found all 28 original non-import declarations byte-identical after removal of newly added `export` modifiers. Eighteen moved into `personal-assertion-scopes.ts`; ten stayed in `self-assessment-evidence.ts`. Shared imports are only the prior grounded-term and quotation dependencies. The original baseline file was read without mutation.
- 13 regression suites / 1,625 tests pass in the original workspace, including all 158 new API cases and existing hint/retention, grounding, source-review, source-span, requirement, reminder, review-draft, extraction, and relevant confirmation UI tests. The independently created config spreads the base config, replaces `include`, and sets `maxWorkers: 1`.
- Independent controls pass for unguided practice; actual mentor-provided parameter work; quoted tool names versus whole propositions; UTF-16 astral positioning; React.js; Chinese short guidance/current-action denial/nominal future; some SQL practice versus a denied specific production task; explicit empty terms; kind gates; bare skill/familiarity claims; nonliteral whole facts and long positive whole facts; mixed English/Chinese sentences; two positive sentences; soft-wrapped positive/negative/future actions; and report/example/conditional compound exclusion.
- Existing helper behavior is supported by the literal declaration comparison plus independently rerun regression. Root's separate native workerd/Node and frozen 81-case hint parity result is complementary evidence, not claimed as an execution performed by this reviewer.

## Initial and final reviewed source hashes

The same hashes were checked before testing and again after testing. Source remained frozen throughout this review.

| Path | SHA-256 |
| --- | --- |
| `app/lib/materials/experience-evidence.ts` | `f52443fc2fa3bbfa9434064afbeacd38caa6efc7ec954e56cb90ddef406296d4` |
| `app/lib/materials/personal-assertion-scopes.ts` | `743f1f2a547948e00c015d8c920b15e9c3859d511a59798b620521af0c3bc94a` |
| `app/lib/materials/self-assessment-evidence.ts` | `385cf5822faf38e13855979333c0d6d5f45cb4ab5e60ca7c34d0f375f35b3f75` |
| `tests/lib/materials/experience-evidence.test.ts` | `3fefcdcb1fc8ef3e0565abe2ad8ccc580c042beee5d6d65470bb2e925e87290c` |
| Frozen baseline `D:/CodexTemp/arc-edited-assessment-repaired-rspZeV/source/app/lib/materials/self-assessment-evidence.ts` | `cb07c50bfce3fd2554a5fb1b80ac4c672951d7994ce8605f4eb0a892a0836b70` |
| `work/grounded-verification/run.mjs` | `4a2fe29b3c5c0fd9c6ce06cfd436e86e8a9ef9daa8fada44e7c87021c5f28242` |

## Exact independent Node commands

Every Node invocation used the prescribed wrapper. Each unique label was used once. All three runs report zero non-loopback denials. No output artifact was overwritten.

```text
node work/grounded-verification/run.mjs experience-evidence-spec-20261108-suite-01 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-evidence-spec-20261108-suite.config.ts --reporter verbose
node work/grounded-verification/run.mjs experience-evidence-spec-20261108-probe-01 work/grounded-verification/experience-evidence-spec-20261108-probe.mjs
node work/grounded-verification/run.mjs experience-evidence-spec-20261108-structure-01 work/grounded-verification/experience-evidence-spec-20261108-structure.mjs
```

| Run | Exit | Counts | Non-loopback denials | Raw log SHA-256 | Outcome JSON SHA-256 |
| --- | ---: | --- | ---: | --- | --- |
| `experience-evidence-spec-20261108-suite-01` | 0 | 13 suites / 1,625 tests pass | 0 | `c07ed16ded693be09b0b8d5d1f574b7911e06cb257b4634af859485111e8d1d8` | `be1b23c3cfa1c3aa49ccd20eb429c3d2879e8a494f56b2858b565b2df0a2cbdb` |
| `experience-evidence-spec-20261108-probe-01` | 1 | 65 assertions; 55 pass / 10 fail | 0 | `9de65b5648a8151ee8837619b1e608b6ae2a81355f540acadef52753076f4a56` | `43a27ecaeb63106473bab508047ae96a81af15cc4f1709a0ff7c24eb52c98a47` |
| `experience-evidence-spec-20261108-structure-01` | 0 | 28 original declarations identical; 18 moved | 0 | `dee58490cd356741eab6a8c9b70f4b7bf8fbc54a4603696e91e234e92e0aeff2` | `6aca71fdf62f15e013040b6d89da146892fa07b41ccc275746e66cec5d6b3b8d` |

## Frozen supporting artifacts

All paths in this table are under `work/grounded-verification`.

| Artifact | SHA-256 |
| --- | --- |
| `experience-evidence-spec-20261108-suite.config.ts` | `4171e6512bb829872e0d58774616b7b7aa7d1feacb1983bcd2a41d9de18b530d` |
| `experience-evidence-spec-20261108-probe.mjs` | `ac75679f27967b03aaf206c853cd6784e1bfc1df90540e29d153ef01e1c71f87` |
| `experience-evidence-spec-20261108-probe-results.json` | `e1e919b654a3cd59468e6532ed6f16ba04bbd6503c738f4edfb6dd24c3cfa6c2` |
| `experience-evidence-spec-20261108-structure.mjs` | `9a39003aee534a7fe74df9851020d9f0b27ac96048ecc254c49cae46b0535e97` |
| `experience-evidence-spec-20261108-structure-results.json` | `dee58490cd356741eab6a8c9b70f4b7bf8fbc54a4603696e91e234e92e0aeff2` |

## Limits and next review boundary

This review is Task 1 only. No Task 2 production mapping, context priority, UI wiring, or policy-version behavior is implemented or validated here. The reviewer did not independently rerun scoped type/lint checks or a full-repository build, and did not run workerd; those are separate author/root evidence. The finite grammar is not claimed to understand all free prose. The four saved categories are concrete false positives within the approved specification and must be resolved or explicitly narrowed before PASS. Keep this initial memo, source binding, scripts, failed logs, and results unchanged; a repair re-review must use new artifact names and fresh source hashes.
