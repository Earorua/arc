# Task 2 technical-reporting repair — candidate C frozen

The candidate A and B FAIL reviews remain sealed and unchanged. This repair addresses B's technical-reporting regression under a new source identity. Only the evidence predicate and appended evidence tests differ from B; no commits, docs/archive edits, full-repository run, provider/model calls, network work, deployment or migration were performed.

## Change and preservation

The trailing administrative activity check now requires progress/status to qualify reporting. Unqualified SQL reporting and SQL query reporting retain personal practice, while SQL project progress reporting remains excluded. The existing scheduling/planning, nested technical-action, for/to purpose and report-about-other-work checks remain unchanged. No SQL/course-name special case, new action verb, actor parser or self-level inference was introduced.

One predicate condition changed and one explanatory comment was added. Eight new tests cover SQL/React reporting, capable phrasing and explicit progress/status reporting. The original 237 tests remain an exact byte prefix. All other seven candidate files, shared/level code and original supplement/history tests are byte-identical to B. The integrity check also verifies all 40 sealed reviewer artifacts and both earlier frozen manifests.

Before-state: experience-priority-author-20261108-reporting-before-candidate-b/ contains nine sources, the complete candidate-B patch and manifest. Before manifest SHA-256: d6f71f0cf686910f1cc0cb81266791069b44231bfe86aa91e0aafc979ddca397.

New frozen manifest: experience-priority-author-20261108-reporting-frozen-source.json, SHA-256 b9707d05962b2a1d2debc44a8486d33a8b1127aaf548a0fc4fdf4b844d5c6cc9. Exact source copies: experience-priority-author-20261108-reporting-frozen-source/.

| Candidate source | SHA-256 |
| --- | --- |
| app/lib/materials/skill-mapper.ts | f6dc1cb1302e72f3904847b9eeabe3ff8bcb4af409fb75dc0bf37f5a68f854c9 |
| app/lib/materials/experience-evidence.ts | 9f63f3f86d99f3758e39935441e13c8a26978216eac070fd19ec37ff63f13077 |
| app/lib/materials/planning-priority.ts | 9620b2a75b3826f7ccaa330bf95aab8ca5ef0608f2e4af4f3df80bdaa8dd154b |
| app/server/documents/context-builder.ts | aff6dca10db13459beb5d4da00c4e3bb43534b74ffe543f2d307c1c2d2fdd416 |
| app/components/materials/material-context-review.tsx | e74ed4b00d3c5495d7564ab4875503a6b3faebeb5744dd45ca07abab12a65389 |
| tests/lib/materials/experience-evidence.test.ts | 10d4fc9a867a51656efae4a64c2e984d3cc45d854e8cf39913391ebeff730437 |
| tests/lib/materials/practice-skill-mapping.test.ts | f28f7049081747cc55638b171f30fc9b0c4d6716e6f3e52c471dada1969941b8 |
| tests/server/material-practice-priorities.test.ts | 6b6f4222a6848748fa2eb1503e3fa887c6ae31c95bbd2d6080c7563e00a64b91 |
| tests/components/material-context-choices.test.tsx | b47bfc1a2f016eb6501fd6666d3b7a78a6d22c028f2ac6e5fd3c05ca8bace33a |

## Reviewer probe binding

All original sixteen-case/six-service and new six-case/six-service semantic expectations remain unchanged. Copies use exclusive new result paths. The new reporting pure probe also hard-coded B's current-source identity, so root explicitly authorized a literal current-source SHA rebinding in the GREEN copy. No hash check was removed or made dynamic; historical A's fixed source identity remains unchanged.

- Historical A fixed SHA: e837f6a830d104bbcc5689cfed39edd11a16d3a0fa49bc5185f0ed46f34a7db2
- Previous current SHA: caf049868ef709757992246447e19f01ae50606b70994143384c56767b0b7fab
- New current SHA: 9f63f3f86d99f3758e39935441e13c8a26978216eac070fd19ec37ff63f13077
- Original probe SHA: bdff3cb1c867fed8e044e970c540a540f3fa5d850333c82555c2bef3d933e9ec
- GREEN probe SHA: 43465a767d4a187420d0655754dd1a7ca2452a3fe4f42066f11eb05d804b2117

The binding metadata is experience-priority-author-20261108-reporting-green-probe-binding.json. The copied probe retains its original candidateB result-field name for current-candidate observations; its fixed source identity now identifies C. Reversing only the result path and current-source hash substitutions reproduces the original probe exactly, which the freeze verifies.

## Checks

Original administrative 16-case predicate/mapping and six-service probes pass, new reporting six-case predicate/mapping and six-service probes pass, all 245 evidence tests pass, the 14-file integration group passes 507 tests, and the separate 12-file level/extraction/review group passes 1467 tests. Focused types and lint pass. Every wrapped command has zero non-loopback denials. SQLite experimental warnings are expected.

| Run suffix | Result | Exit | Log SHA-256 | Outcome SHA-256 |
| --- | --- | --- | --- | --- |
| prepare-01 | nine source files and 40 reviewer artifacts preserved | 0 | fd8d5610fa4a39b52a2f315110e46e065f9cb6c0ee8d593670d8e5f17ed18f88 | fb3168fce532d65cdcf90657b02cee07d7c9a83a94119674505fe877adf7d3f5 |
| probe-red-02 | six cases: two expected failures, four controls pass | 1 | 3ed443d3f596a2b229e58fb9ca156df4ab026c2cb718d19a735126b24515d9bf | 6a802bf32b6dbe9eb5c2f0d67b8478d90166d07b85051f5d9ea4af29bf479efb |
| service-red-03 | six cases: two expected failures, four controls pass | 1 | dd257695cfccec242603f4b60a11ddd1e69eb2011ef586d783e46c20ae6ea69d | eff2a27a53883d5db23c7d279d6ea71a79021fd20de83a9ddce1cb40d02a26ec |
| unit-red-04 | 245 tests: four expected failures, 241 pass | 1 | 103dcc596dd188815dae200c95f25ca46577dfdc89c43d60ac1e4d0de126c6f5 | 6e73d0bf5286b893a1a145cc8abf624ea2aa8440bad4be8ce06e63821a9292fc |
| bind-green-05 | current-source fixed hash rebound; historical A hash and all behavior expectations unchanged | 0 | 26bd7e8833d5052d71d34dada203ca2a945f5b8fadee294c401898edaeed9d6a | 384175f5ead16127a25f916a40bd0ae7359881f870950d6837eef1b7af0d7dd0 |
| probe-green-06 | new reporting probe: six cases, zero mismatches | 0 | 388134bf29c957184913671a4fdd65a7724cf6ac298b3c2ff19e28ec718d56ec | 0b37a92c9512924c6c78415e00e70f91d0ec787a834d6e8116c1d248eb11d619 |
| service-green-07 | new reporting service: six tests pass | 0 | 6031b6e7cff7be7b5f767b926773c3d07c32465f69cd25624aa5bf7449546a4a | da04f6de829df62aec8f1ac383ab2cd6f9ae899339a48f390adc4deb477f3ebb |
| original-probe-08 | original administrative probe: 16 cases, zero mismatches | 0 | 6a2f97218737a18b21e321b6379f08c455cc0297817883228e1da47256b93c63 | f19cb49b807094003d8c92a410c56bea5d4344efb5cac84d52d4443d98eb720a |
| original-service-09 | original administrative service: six tests pass | 0 | 53b47c26643f7c6627abca54db6cc6ee45609790690dcdc053b5fb54ef87c56c | a02777f511b98e5bba8bfe90f6813c41e211d4686fa7f84f3edcd53c46ec2454 |
| unit-green-10 | 245 evidence tests pass | 0 | 33a70eb6702710986151cc52e7b189160f0207c423dc2314846ceca9babc3166 | ba75755a78a71347aed3a96d063d2e8d1586d7908e391546d0a0d5a22882c2dd |
| regression-11 | 14 files / 507 tests pass | 0 | 28f9f01c410d11d31cb2604fb2ece1328a42c13eb382bbf0619ff82fc7bbd218 | 80ebaac2050267bc11d43b682f53092903b9524b531441edb402e5062628c4d2 |
| level-regression-12 | 12 files / 1467 tests pass | 0 | 176484b40ff65aac14950ee87ca206ce050177a862fded2070b0e64de5d7ebe2 | eb46bfdac9e35143570609d67a8ff64c0827a66273af0de77e50c1f967e49f10 |
| types-13 | focused types pass | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 | 23d326204b66a422ad9a0a25df6fcc0a3dfa08dc577a0e3c5f70e3e4cdc76239 |
| lint-14 | focused lint pass | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 | 5c88a2eae7e688e44484b6eb8a52e960332a6650577fcee3e72848912cccfe10 |
| freeze-15 | scope, source and preservation checks pass | 0 | 66864c9b9cd142d8861db729ebd3f322f6940f6db70368d6ec7c6e36f5a50a18 | c5f9fa4c75bd98bf76c8f5eea1691c458c44bb24b1be9a7e8c6ac2b099ed6b4c |

The reporting RED pure-probe log is byte-identical to the sealed reviewer result, SHA 3ed443d3f596a2b229e58fb9ca156df4ab026c2cb718d19a735126b24515d9bf. Actual-service RED preserves two failures and four passing controls. The unit RED file is separately preserved and matches the final appended test source.

Exact commands:

~~~text
node work/grounded-verification/run.mjs experience-priority-author-20261108-reporting-prepare-01 work/grounded-verification/experience-priority-author-20261108-reporting-prepare.mjs
node work/grounded-verification/run.mjs experience-priority-author-20261108-reporting-probe-red-02 work/grounded-verification/experience-priority-author-20261108-reporting-reviewer-red-probe.mjs
node work/grounded-verification/run.mjs experience-priority-author-20261108-reporting-service-red-03 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-priority-author-20261108-reporting-reviewer-red-service.config.ts
node work/grounded-verification/run.mjs experience-priority-author-20261108-reporting-unit-red-04 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-priority-author-20261108-reporting-unit.config.ts
node work/grounded-verification/run.mjs experience-priority-author-20261108-reporting-bind-green-05 work/grounded-verification/experience-priority-author-20261108-reporting-bind-green.mjs
node work/grounded-verification/run.mjs experience-priority-author-20261108-reporting-probe-green-06 work/grounded-verification/experience-priority-author-20261108-reporting-reviewer-green-probe.mjs
node work/grounded-verification/run.mjs experience-priority-author-20261108-reporting-service-green-07 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-priority-author-20261108-reporting-reviewer-green-service.config.ts
node work/grounded-verification/run.mjs experience-priority-author-20261108-reporting-original-probe-08 work/grounded-verification/experience-priority-author-20261108-reporting-original-probe.mjs
node work/grounded-verification/run.mjs experience-priority-author-20261108-reporting-original-service-09 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-priority-author-20261108-reporting-original-service.config.ts
node work/grounded-verification/run.mjs experience-priority-author-20261108-reporting-unit-green-10 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-priority-author-20261108-reporting-unit.config.ts
node work/grounded-verification/run.mjs experience-priority-author-20261108-reporting-regression-11 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-priority-author-20261108-regression.config.ts
node work/grounded-verification/run.mjs experience-priority-author-20261108-reporting-level-regression-12 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-priority-author-20261108-level-regression.config.ts
node work/grounded-verification/run.mjs experience-priority-author-20261108-reporting-types-13 node_modules/typescript/bin/tsc --project work/grounded-verification/experience-priority-author-20261108-final-tsconfig.json --noEmit --pretty false
node work/grounded-verification/run.mjs experience-priority-author-20261108-reporting-lint-14 node_modules/eslint/bin/eslint.js app/lib/materials/skill-mapper.ts app/lib/materials/experience-evidence.ts app/lib/materials/planning-priority.ts app/server/documents/context-builder.ts app/components/materials/material-context-review.tsx tests/lib/materials/experience-evidence.test.ts tests/lib/materials/practice-skill-mapping.test.ts tests/server/material-practice-priorities.test.ts tests/components/material-context-choices.test.tsx
node work/grounded-verification/run.mjs experience-priority-author-20261108-reporting-freeze-15 work/grounded-verification/experience-priority-author-20261108-reporting-freeze.mjs
~~~

Input/script/config and standalone result hashes are in the frozen manifest. All Vitest configs spread the repository base, replace include and use maxWorkers=1. Focused types include worker-configuration.d.ts/tests/setup.ts and exclude ignored harness fixtures.

## Limits and next owner

- No full-repository, native runtime, persisted historical store, visual browser or real-model acceptance performed during this author repair.
- All original probe behavior expectations were preserved. The new reporting GREEN pure probe also received root-authorized exact current-source hash rebinding; historical candidate A's fixed hash remains unchanged.
- Service probes use real MaterialContextService with the existing confirmed-record SQLite/D1 adapter. Root owns independent HTTP/runtime acceptance.
- Root owns the 37-case real HTTP/runtime native run, parity/history/UI acceptance, independent specification re-review then quality review, full-repository checks, archives and commits. Product/test edits have stopped.
