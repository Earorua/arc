# Task 2 spec review — frozen candidate A

Verdict: **FAIL — one P2 requirement gap in the approved assistance administrative exclusion.**

Review date: 2026-11-08. Base HEAD: `c788268b5dbb4e91480ce98738274dfd08a58155`. This review applies only to the nine-file candidate bound by `experience-priority-author-20261108-frozen-source.json`, SHA-256 `8fd58db6d8d7608796a42bda1f29b8d29c5b6e45ac43265a279a577f13fc190a`. All nine source hashes and all five unchanged-target hashes matched at review start and at the final source check. The root's two concurrent documentation edits are outside this candidate scope. No product, test-suite, documentation, history-store, or fixture file was changed by this reviewer.

## Required finding

**[P2] Topic-first administrative assistance becomes technical practice** — `app/lib/materials/experience-evidence.ts:86-87`.

The new assistance check rejects an administrative word at the start of the object and terminal `schedule(s)` / `plan(s)`, but the same approved `assist/assisted/assisting with/in` grammar accepts administrative object heads at the end in gerund form. These are direct instances of the requested scheduling/planning/reporting exclusion, including its capable branch, rather than additional verbs or a request for unrestricted natural-language interpretation.

Reproducible inputs, each an `experience` fact with `skillLabels: ["SQL"]`:

| Input | Expected practice | Actual predicate / mapper / service |
| --- | --- | --- |
| `I assisted with SQL demo scheduling.` | none | terms=true, whole=true; SQL pair; SQL tier 3 |
| `I can assist with SQL demo scheduling.` | none | terms=true, whole=true; SQL pair; SQL tier 3 |
| `I assisted in SQL training planning.` | none | terms=true, whole=true; SQL pair; SQL tier 3 |
| `I assisted with SQL project progress reporting.` | none | terms=true, whole=true; SQL pair; SQL tier 3 |

All four still correctly produce the public mapping `{status:"mapped",skillIds:["sql"],basis:"literal"}`. The incorrect service priority is `{skillId:"sql",tier:3,itemIds:["material-item-4db6d50f5fc067a12df4405b08b4f5ed"]}` under policy `2026.11.3`; expected priorities are `[]`. `I assisted with SQL.` and `I assisted in SQL query testing.` remain positive controls and both pass. The service reproduction uses the real `MaterialContextService.create` with the existing in-memory SQLite/D1 adapter and a confirmed resume fact.

Required repair: retain the finite assistance grammar and cover these administrative object forms without treating technical work such as SQL query testing or SQL reports as administrative by word occurrence alone. Re-run both preserved red probes with new result/output names, retain all existing 180 Task 1 tests and the unchanged supplement lifecycle fixture, and bind any repaired candidate to new hashes. No repair was made during review.

## Other requirements checked

- Public compatibility: read the resolver diff and compared both `mapMaterialItemTerms` and `mapMaterialItems` to the actual base implementation for **1,350 comparisons, zero differences**. The matrix covers retained/empty/missing labels, bare and long facts, kind differences, mixed actors, contextual matches, alias versions 2–5, ambiguous aliases, per-term/whole manual selection, duplicates, omissions, removed terms, unknown IDs, learning-intent adoption, flagship/research catalogs and an invalid registry. Fields, basis, grouping and order are compared by deep equality.
- Evidence target selection: `skill-mapper.ts:89-114` retains original term targets for labels and per-term manual/contextual choices; unlabeled automatic mappings retain each actually matched vocabulary ID/name/alias as an alternative target. Whole manual choices use `confirmed-whole-fact` only when `skillLabels` is absent. Legacy whole manual choices on reviewed labels retain their public projection but receive no practice target. No vocabulary was added.
- Practice projection: `skill-mapper.ts:150-167` outputs unique item/skill pairs only for `mapped` experience or skill-claim relations supported by the current fact's evidence. Focused mapper/service cases pass for alias alternatives in both SQL/SQLite directions, both unsupported aliases, mixed actors, negative/future facts, contextual targets, original-term manual remapping, unlabeled long facts, conservative mixed whole facts, explicit empty/deleted/omitted labels and invalid catalog/ambiguity. The assistance finding above remains an exception to the required administrative exclusion.
- Context integration: only non-JD rows use the new projection at `context-builder.ts:265`. Requirements and explicit intents remain at lines 288–290; the source, ownership, version, expiry, replay and atomic guard code is unchanged. The existing choice validator at lines 224–226 rejects new whole choices whenever `skillLabels` exists. Existing learning-intent eligibility was not expanded. The focused suites include owner/replay/expiry/selection checks and the original supplement flow.
- Current audit, availability and target remain snapshot inputs; no self-assessment mutation was introduced. Guided, unguided, mentor-supplied and limited-parameter changes remain positive in the 32-case practice service suite.
- Policy: the planning constant alone changes from `2026.11.2` to `2026.11.3`; mapping stays `2026.11.5`. `loadValid` at `context-builder.ts:191-205` still validates dependencies/fingerprint and parses the persisted preview rather than projecting it again. The focused service suite verifies new policy identity and unchanged saved re-read/replay. Root-supplied native evidence below additionally covers the genuine persisted policy-2 history.
- UI: `material-context-review.ts:145-146,198-199` counts distinct skill IDs only from mapped detail rows, shows priority count separately and omits a mapped count for snapshots lacking details. The 29 component tests pass, including 1/0, 2/1, duplicates, ambiguity, other mapping statuses, old snapshots and existing intent controls. Copy explains that course correspondence does not establish practice or a level.
- Preservation: the base experience test file remains a complete prefix of the current file after CRLF normalization. The focused run reports **224 evidence tests**, consisting of the original 180 plus the 44 appended assistance cases. Hashes also confirm unchanged shared assertion scopes, self-assessment implementation/tests, original supplement lifecycle test and learning-intent suite.

## Independently executed commands and outcomes

All Node commands used the required offline wrapper. Both review Vitest configs spread `../../vitest.config`, replace `include`, and set `maxWorkers: 1`. No full-repository run was performed.

```text
node work/grounded-verification/run.mjs experience-priority-spec-20261108-focused-01 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-priority-spec-20261108-focused.config.ts
node work/grounded-verification/run.mjs experience-priority-spec-20261108-compatibility-02 work/grounded-verification/experience-priority-spec-20261108-compatibility-probe.mjs
node work/grounded-verification/run.mjs experience-priority-spec-20261108-assistance-03 work/grounded-verification/experience-priority-spec-20261108-assistance-probe.mjs
node work/grounded-verification/run.mjs experience-priority-spec-20261108-assistance-service-04 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-priority-spec-20261108-assistance-service.config.ts
```

| Wrapper label suffix | Outcome | Log SHA-256 | Non-loopback denials |
| --- | --- | --- | --- |
| `focused-01` | exit 0; 8 suites / 338 tests pass | `c6a56aa1da6a319b94ea75a094a69d1ad8e10c51befbea09d24641ae9828ccba` | 0 |
| `compatibility-02` | exit 0; 1,350 comparisons / zero differences; source hashes and original test prefix pass | `7fd694b547e90244278131823186178d77d2963d2b7790077953af97981ae30c` | 0 |
| `assistance-03` | exit 1; 4 failures among 16 predicate/mapping cases | `81f0d8a2d4b16e1bb98d543776800c99b8d8197333cfaeed33b5ec41103f4760` | 0 |
| `assistance-service-04` | exit 1; 4 administrative failures / 2 positive controls pass | `c4fc992a4cf01d4c50c8743ac9145501f13b5d6ab91f90d007541dc5d01ac99c` | 0 |

Outbound network operations and real-model calls by this review: **0**. Existing synthetic supplement transport remains test-local. All first-run red and green logs/results remain untouched. Probe output files use `-results.json` and exclusive creation, separate from wrapper `.json`/`.log` names.

## Probe and result identities

All paths below are relative to `work/grounded-verification/` and start with `experience-priority-spec-20261108-`.

| Suffix | SHA-256 |
| --- | --- |
| `focused.config.ts` | `acacece3e260305225ccc94306cd5568ae476862d4759fad37d31db027d1d1a1` |
| `compatibility-probe.mjs` | `aed6922f5cd355aa65771850d32ceebff04c21541b5aaa8ea3b31236f59f9c7a` |
| `compatibility-results.json` | `7fd694b547e90244278131823186178d77d2963d2b7790077953af97981ae30c` |
| `assistance-probe.mjs` | `380d89e0c3d3f1a2a3a04f1183b9742ce81d9df6ea1c042c68a391efdacee30f` |
| `assistance-results.json` | `81f0d8a2d4b16e1bb98d543776800c99b8d8197333cfaeed33b5ec41103f4760` |
| `assistance-service.config.ts` | `d3744781164b99d395d6ff76e48adcd83a4fab187d564936e260e99d40745273` |
| `assistance-service.test.ts` | `09a4c332b8b86f05d86da59dc3653915df0eb858e709901ff8c3adecebaa39dd` |
| `assistance-service-results.json` | `8ae3c4238ab9423f1f2c328eb2beb31ca0b92bec3aa0b1cf4793c4b1feb292d0` |

## Source identity

| Candidate path | SHA-256 |
| --- | --- |
| `app/lib/materials/skill-mapper.ts` | `f6dc1cb1302e72f3904847b9eeabe3ff8bcb4af409fb75dc0bf37f5a68f854c9` |
| `app/lib/materials/experience-evidence.ts` | `e837f6a830d104bbcc5689cfed39edd11a16d3a0fa49bc5185f0ed46f34a7db2` |
| `app/lib/materials/planning-priority.ts` | `9620b2a75b3826f7ccaa330bf95aab8ca5ef0608f2e4af4f3df80bdaa8dd154b` |
| `app/server/documents/context-builder.ts` | `aff6dca10db13459beb5d4da00c4e3bb43534b74ffe543f2d307c1c2d2fdd416` |
| `app/components/materials/material-context-review.tsx` | `e74ed4b00d3c5495d7564ab4875503a6b3faebeb5744dd45ca07abab12a65389` |
| `tests/lib/materials/experience-evidence.test.ts` | `01865af190dea120b09eb83a7707d4a9f304662e6aaefa33ed4067580a7a9633` |
| `tests/lib/materials/practice-skill-mapping.test.ts` | `f28f7049081747cc55638b171f30fc9b0c4d6716e6f3e52c471dada1969941b8` |
| `tests/server/material-practice-priorities.test.ts` | `6b6f4222a6848748fa2eb1503e3fa887c6ae31c95bbd2d6080c7563e00a64b91` |
| `tests/components/material-context-choices.test.tsx` | `b47bfc1a2f016eb6501fd6666d3b7a78a6d22c028f2ac6e5fd3c05ca8bace33a` |

## Root-provided complementary evidence and limits

These were not rerun by this reviewer. Their wrapper/result artifacts were read; they supplement the independently executed checks above and do not erase the new red finding.

- `experience-priority-root-cases-20261108-final-b`: root reports 31 local workerd/D1/R2 scenarios, exit 0, denials 0; log `3e88364a4592ea719bf80196ff2fba11126973187a36778b3adc70de2d19b82a`, results `9a21b44b2258031130ecca7131e7b8f2c012baff5456bbd74cc58c36f36fc981`.
- `experience-priority-node-parity-20261108-final-b`: root reports 31 Node/native public-preview, read, text, draft and snapshot comparisons, exit 0, denials 0; log `133a7f85a8d5b91de06add1aee4abd8c460a4663cd5b579c46696a2c56d41b31`, results `ec01163dc947c44635021e16d31c9d3ad99c16476db4ebb76800b2c978be661b`.
- `experience-priority-root-ui-20261108-final-a`: root reports real provider/review component plus HTTP/runtime controls 1/0, 2/1 and 1/1, exit 0, denials 0; log `ed4633fbff1ff1253cdb5eff8b7f0c82f7e8194424e6d8b8da42883c0db6abeb`, results `36467e449aa085974c6612f1de3eaddf8bf1a71a2eb08a0a73c6e3adf9981ca0`.
- `experience-priority-history-read-20261108-new-a`: status PASS, exit 0, denials 0; observed read retains the persisted policy `2026.11.2`, original SQL tier 3, and original fingerprint for the negative SQL fact. Root reports full old public response and before/after rows unchanged. Log `82f8e40d0a30a356b4371555d2a3df84544e7e27efb9cb2f4140a6668e72db15`, results `93545d8a752ea10dd34940f775ebc27ee4bc4f6725f0a736ed1ec95ac3bc5402`. The original persisted D1 store/fixture was not modified or recreated by this reviewer.

This review makes no full-repository, production deployment, real-model, visual-browser or arbitrary-language completeness claim. No commits, network requests, deployments, migrations, pushes or subagents were used. The root owns broader verification and any repair. Review of candidate A is sealed; source inspection and testing have stopped so the author may repair it under a new candidate identity.
