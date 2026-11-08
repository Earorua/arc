# Task 1 author handoff

Status: DONE. Source/tests are frozen; no implementation work beyond Task 1 was performed. Root owns independent native verification, spec/quality reviews, documentation, and commits.

## Implementation and preservation

- Added supportsMaterialExperience with explicit source-term and confirmed-whole-fact targets. Only experience/skill-claim kinds can support practice; an empty term list never restores evidence.
- Each term requires some supported personal action or skill claim. Another occurrence's limitation does not erase real practice or create a level. Whole-fact relations remain false across unsupported actors/actions, reports, plans, or omitted shared scopes.
- Supplied SQL that the learner actually tests/modifies, including parameter edits, supports practice. Mere scheduling/reporting does not. Independent practice is accepted without a guided level.
- Moved 18 existing declarations and their dependencies unchanged into personal-assertion-scopes.ts. The self-assessment file only replaces those declarations with imports; all 28 original non-import declarations compare equal after removing added export modifiers. No old test expectations changed. Worker APIs, source location, and statement-reminder anchoring remain unchanged.
- Sentence consumption uses Intl.Segmenter on the existing quotation mask, with whitespace replaced one UTF-16 code unit at a time to preserve soft-wrapped denial/modality and source coordinates. Sentence scopes are parsed by the existing assessmentScopes and intersected with its original allowed ranges. Omitted report/example/conditional/denial content cannot regain assertion status; technical dots and full quoted propositions have controls.
- A bounded direct-object check excludes an embedded proposition/report object after an apparent action. A real tool-use span can end before a reporting-purpose clause. Result documentation does not create new term evidence or authorize another actor's practice.
- No mapper/context/UI/contract/projection/policy/provider wiring, source-span changes, schema mutation, network/model calls, deployment, migration, push, worktree, or commit was performed. No existing verification archive or frozen reference was modified.

## Final validation

- freeze-regression-22: 13 suites / 1,625 tests passed, including 158 new pure API tests. Includes all existing self-assessment and retention tests, source-review/source-span/source-requirement/reminder tests, real review-service draft tests, extraction tests, and confirmation/source-term UI tests.
- freeze-types-23 and freeze-lint-24: exit 0. Scoped types include worker-configuration.d.ts and tests/setup.ts and exclude intentional work fixtures.
- final-compatibility-20: 28/28 original declarations identical; 81 frozen baseline cases each match on five outputs (public hint, scoped hint, implicit capability reminder, explicit capability reminder, practice-need reminder).
- Scoped git diff --check: exit 0. Native Node/workerd parity is reserved for root's independent run after this freeze.
- All 24 Node invocations used the prescribed wrapper; every run recorded zero non-loopback denials. Wrapper SHA-256: 4a2fe29b3c5c0fd9c6ce06cfd436e86e8a9ef9daa8fada44e7c87021c5f28242.
- Frozen baseline self-assessment source: D:/CodexTemp/arc-edited-assessment-repaired-rspZeV/source/app/lib/materials/self-assessment-evidence.ts, SHA-256 cb07c50bfce3fd2554a5fb1b80ac4c672951d7994ce8605f4eb0a892a0836b70. That copy remained read-only.

## RED evidence and intermediate outcomes

The initial PowerShell handoff generator failed while joining an empty git-diff output as a null array, before writing any artifact. Its original script is preserved; the fixed copy normalizes that empty output. No source/test bytes changed.

- red-missing-01 records the initial absent-module import failure; it is retained as harness history, not claimed as the meaningful behavioral RED.
- red-positive-02 is the meaningful placeholder RED: 74 failing positive assertions / 57 passing controls, all written before action implementation.
- first-action-04: six failures (quoted conceptual example, Chinese inability fallback, whole-fact scope coverage, long result continuation, punctuation control). Focused corrections retained their original failing logs.
- sentences-red-13: ten failures demonstrate cross-sentence target leakage, other-actor attribution, and the supplied-artifact bare-fragment fallback. The unchanged shared parser was not widened.
- objects-red-15: four failures demonstrate embedded report objects, tool-use/report-purpose separation, and another actor's result-documentation residue.
- final-regression-17 is preserved as a RED, despite its filename: two soft-wrap modality/denial failures / 1,623 passes. Whitespace normalization in the experience-only sentence mask fixed them; soft-wrap-green-21 passed all 158 API tests and freeze-regression-22 passed all 1,625 targeted tests.

## Changed source/test SHA-256

| Path | SHA-256 | Bytes |
| --- | --- | ---: |
| app/lib/materials/experience-evidence.ts | f52443fc2fa3bbfa9434064afbeacd38caa6efc7ec954e56cb90ddef406296d4 | 8659 |
| app/lib/materials/personal-assertion-scopes.ts | 743f1f2a547948e00c015d8c920b15e9c3859d511a59798b620521af0c3bc94a | 12561 |
| app/lib/materials/self-assessment-evidence.ts | 385cf5822faf38e13855979333c0d6d5f45cb4ab5e60ca7c34d0f375f35b3f75 | 5526 |
| tests/lib/materials/experience-evidence.test.ts | 3fefcdcb1fc8ef3e0565abe2ad8ccc580c042beee5d6d65470bb2e925e87290c | 11524 |

## Exact Node commands and preserved outcomes

### experience-evidence-author-20261108-red-missing-01
```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-red-missing-01 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-evidence-author-20261108-unit.config.ts --reporter verbose
```
- Exit: 1; non-loopback denials: 0.
- Raw log SHA-256: d9ca15392a9db9a9f51b43d5c88569c66413dd69eb701ed87da90894bd9e6015.
- Outcome JSON SHA-256: f37439c7e7d7b050af20bcb6447804df0c813840cf869b56438c644ef2597fae.

### experience-evidence-author-20261108-red-positive-02
```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-red-positive-02 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-evidence-author-20261108-unit.config.ts --reporter verbose
```
- Exit: 1; non-loopback denials: 0.
- Raw log SHA-256: 46c5c7221b0b3a420c9f0cdb64c4a00b4fb86c2dd695df285e2d829855682462.
- Outcome JSON SHA-256: c150fe03abb20b13fd067eaec8d6d2b2a84e90600f0ff326d605d646a1c6e846.

### experience-evidence-author-20261108-move-03
```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-move-03 work/grounded-verification/experience-evidence-author-20261108-move-scopes.mjs
```
- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: f79078b089913b947281c5783c9c358c30f03cc6d2f1738b01a4c86f1a09aa0c.
- Outcome JSON SHA-256: ad0cdbb742f2babf9e1f79b758ae5322e1cd1aacd43834cebdfd92615c5611a8.

### experience-evidence-author-20261108-first-action-04
```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-first-action-04 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-evidence-author-20261108-unit.config.ts --reporter verbose
```
- Exit: 1; non-loopback denials: 0.
- Raw log SHA-256: 50fb97cd803b05e9ac1629e7b4291613e60f8ba19251f2df377e7e6ba5c2e093.
- Outcome JSON SHA-256: 9cfce434dde875240f976c703d1681f745916ce2dcacbc7891235c0f6205067b.

### experience-evidence-author-20261108-action-polarity-05
```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-action-polarity-05 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-evidence-author-20261108-unit.config.ts --reporter verbose --testNamePattern '完成不了|technical punctuation'
```
- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: b61e916453f01556b1780f8486195e26de0f14717b49c6d32d7c41f0cb935865.
- Outcome JSON SHA-256: e0fb5c361d0158e396f77857e97fc9c584e78b89a5096c37058ecaf4ff0423a7.

### experience-evidence-author-20261108-move-claims-06
```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-move-claims-06 work/grounded-verification/experience-evidence-author-20261108-move-claims.mjs
```
- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: 08b1802ba93ac4b5f0286d91c725b1f808317ba927654243073e7768f4273272.
- Outcome JSON SHA-256: f8a05c517107a90b45e6be4bd491c97951edbbfd39ef021a7d731ac92e74b32b.

### experience-evidence-author-20261108-claims-07
```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-claims-07 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-evidence-author-20261108-unit.config.ts --reporter verbose --testNamePattern 'claims|familiar with the example'
```
- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: 7cbd12afb942f10eacdfde1ce8746af696dc2416f45b6c536403096a60e55e4c.
- Outcome JSON SHA-256: ce6f6ba3f32d1e2d000fc24dc281b6f160228db89bb0434b787480d2469e9cad.

### experience-evidence-author-20261108-unit-green-08
```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-unit-green-08 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-evidence-author-20261108-unit.config.ts --reporter verbose
```
- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: 2bb72de4c130aff9f95727c8478b5143a6f5df44211a0541d1958003aa988cb4.
- Outcome JSON SHA-256: 2d8f576146debc6c28298b5ff9a838ae204f50c9ca52e63187490190b1a64ef3.

### experience-evidence-author-20261108-regression-09
```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-regression-09 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-evidence-author-20261108-regression.config.ts --reporter verbose
```
- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: 30e730c15871fae9e3fa5ba691f82f7042af2d0022391a285e4bc3ed8b4ed30e.
- Outcome JSON SHA-256: cb55bda27595f77c39760842fe74eb331061d126fcbdcad8f776ad2f922d4b08.

### experience-evidence-author-20261108-types-10
```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-types-10 node_modules/typescript/bin/tsc -p work/grounded-verification/experience-evidence-author-20261108-tsconfig.json
```
- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.
- Outcome JSON SHA-256: 5fa6357828f2f4c6058cf991cd942078c9823d22ec33a843749c977d40396eee.

### experience-evidence-author-20261108-lint-11
```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-lint-11 node_modules/eslint/bin/eslint.js app/lib/materials/experience-evidence.ts app/lib/materials/personal-assertion-scopes.ts app/lib/materials/self-assessment-evidence.ts tests/lib/materials/experience-evidence.test.ts
```
- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.
- Outcome JSON SHA-256: a70136c835a3d538ba68097b0ec834c8d01459a11d8edbe711978724a77919e9.

### experience-evidence-author-20261108-compatibility-12
```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-compatibility-12 work/grounded-verification/experience-evidence-author-20261108-baseline-check.mjs
```
- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: d8619dba8e258092cde230aab17b73d07ba7c2a41555583456931a7610294279.
- Outcome JSON SHA-256: 5e8afe6f7250e0d55eaa1e2318e232e0fc4861b3c282a25e0e61a18fe1e5253b.

### experience-evidence-author-20261108-sentences-red-13
```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-sentences-red-13 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-evidence-author-20261108-unit.config.ts --reporter verbose
```
- Exit: 1; non-loopback denials: 0.
- Raw log SHA-256: 61c95fc887e928e691e5bfd28bf2a021d3a8d338f881dc739e232693c95ae3a1.
- Outcome JSON SHA-256: 170a71985732a13aa87a7d59c32657f7e270ff3b494517e82a597569d7f77aa5.

### experience-evidence-author-20261108-sentences-green-14
```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-sentences-green-14 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-evidence-author-20261108-unit.config.ts --reporter verbose
```
- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: f32c0ef881d1861d9b1cf3ee5b5bac1688e25a31d104e228ff7928512c8599fc.
- Outcome JSON SHA-256: 5c8f4058ed52a9cfa408d57fb9bf1793a3b8d1c3267e41bf2a21807a64507970.

### experience-evidence-author-20261108-objects-red-15
```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-objects-red-15 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-evidence-author-20261108-unit.config.ts --reporter verbose
```
- Exit: 1; non-loopback denials: 0.
- Raw log SHA-256: 51af8c2903dce70cc11836939dc3a090e26b70630e92f92897a08cf97e39a723.
- Outcome JSON SHA-256: 29972ebc4925da2f6094a1df7875a95a3ddbd6c05d97f5b2ff4fb9355241018c.

### experience-evidence-author-20261108-objects-green-16
```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-objects-green-16 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-evidence-author-20261108-unit.config.ts --reporter verbose
```
- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: 354ec91d65f645bc4efabe6b63f610f182ff8bb3163e783d8b38349061e8b4fe.
- Outcome JSON SHA-256: 5693f8590cbd1e37c9891fc916a0fe190845b8ac725207e8cc29d96dd9981d8f.

### experience-evidence-author-20261108-final-regression-17
```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-final-regression-17 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-evidence-author-20261108-regression.config.ts --reporter verbose
```
- Exit: 1; non-loopback denials: 0.
- Raw log SHA-256: 69ca0073ab8a57eb237a392c1f3172bc58e33f7ea722c28a7d8d8548d393f3c4.
- Outcome JSON SHA-256: 81f9412953fbf36bb7bc7465dfd806d9d8588d222743a32a00964e9f06b9ba88.

### experience-evidence-author-20261108-final-types-18
```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-final-types-18 node_modules/typescript/bin/tsc -p work/grounded-verification/experience-evidence-author-20261108-tsconfig.json
```
- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.
- Outcome JSON SHA-256: 21ef45a193b1af07891afe6e10e3c729317754ecfd5e23934ac6ab732371a32a.

### experience-evidence-author-20261108-final-lint-19
```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-final-lint-19 node_modules/eslint/bin/eslint.js app/lib/materials/experience-evidence.ts app/lib/materials/personal-assertion-scopes.ts app/lib/materials/self-assessment-evidence.ts tests/lib/materials/experience-evidence.test.ts
```
- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.
- Outcome JSON SHA-256: 4725962ee6656c22b610c0f5347e9570ef550f2363029f379562a0be4b5dc765.

### experience-evidence-author-20261108-final-compatibility-20
```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-final-compatibility-20 work/grounded-verification/experience-evidence-author-20261108-baseline-check-final.mjs
```
- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: 5256cfa1c204f237763cbfb79c13588d528af577c9a7777d156d2bb358ea6719.
- Outcome JSON SHA-256: d624db4798aadf272d250c2eae4d8af4a2a7c6f3f950e9775b260b603886cf53.

### experience-evidence-author-20261108-soft-wrap-green-21
```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-soft-wrap-green-21 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-evidence-author-20261108-unit.config.ts --reporter verbose
```
- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: b704212fed6bc7642d701d948bbcebfd1dc0ab4f939bda57bd786f8fec11406f.
- Outcome JSON SHA-256: 2faf9bff3f56650bdb500d51ee695f867544fb2fbd4a92e4de089cb9053874e8.

### experience-evidence-author-20261108-freeze-regression-22
```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-freeze-regression-22 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-evidence-author-20261108-regression.config.ts --reporter verbose
```
- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: e3aaec43a36fdcccb9c6d764911800acbc85426df94cd296e5e464cdacc24b32.
- Outcome JSON SHA-256: 02d0dc7928ba96c4664780cb76573a41efd8f6ada1e694d66ea47f98786ea0d5.

### experience-evidence-author-20261108-freeze-types-23
```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-freeze-types-23 node_modules/typescript/bin/tsc -p work/grounded-verification/experience-evidence-author-20261108-tsconfig.json
```
- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.
- Outcome JSON SHA-256: e3d86526912fc8c9264941da99538aef56a848362b665d7448efa8598dcce8d1.

### experience-evidence-author-20261108-freeze-lint-24
```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-freeze-lint-24 node_modules/eslint/bin/eslint.js app/lib/materials/experience-evidence.ts app/lib/materials/personal-assertion-scopes.ts app/lib/materials/self-assessment-evidence.ts tests/lib/materials/experience-evidence.test.ts
```
- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.
- Outcome JSON SHA-256: b8b63665784d0390e5f198d433034d300b76a3b6270f91ea26527c0b0b8be4de.


## Supporting artifacts

| Artifact in work/grounded-verification | SHA-256 |
| --- | --- |
| experience-evidence-author-20261108-baseline-check-final.mjs | be139663e2578b8ecc464f4b14cea679398238687e1cafd8e8dc1836496dc271 |
| experience-evidence-author-20261108-baseline-check.mjs | ee72d7756602588ac226ba74ae8a8d701f9bf4a0b131535f6b9d8ae61c5dec23 |
| experience-evidence-author-20261108-compatibility-final-results.json | 73abf6bb972b27de828534d671c07d9af7960f565599b6c48944145f9fc3f97d |
| experience-evidence-author-20261108-compatibility-results.json | 73abf6bb972b27de828534d671c07d9af7960f565599b6c48944145f9fc3f97d |
| experience-evidence-author-20261108-declaration-comparison.json | c4ff22970879a1a168fc6d3ca127ae57bda38b55063c5b0325e6b3f239c17200 |
| experience-evidence-author-20261108-diff-check.txt | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |
| experience-evidence-author-20261108-frozen-source.json | e76129877ee05589af1cdd4ffd47b638a6e141b62af6e63eb52bd02f66bb21d7 |
| experience-evidence-author-20261108-move-claims.mjs | c9292fee717bfa6042fa3d35c05b21ea684da2e705eb65df0bd1a9e27a10c2d8 |
| experience-evidence-author-20261108-move-scopes.mjs | c5a47abbeef20a615ad54f7403a50fb1b1462fe8f009a77547dba6e6b8ac8fd7 |
| experience-evidence-author-20261108-regression.config.ts | bd8a46fe6708cf29529385e6cfd4f9fb9768fff1e412b118232b1cd03cfd7d35 |
| experience-evidence-author-20261108-tsconfig.json | c27df9ec6b5764df7214efa12b541b62896e0886583f31b336f879b073c2bcae |
| experience-evidence-author-20261108-unit.config.ts | 59533735cffd3a4183d7b11d6a9c856d359b14ceb0952c3166e855520326fc07 |
| experience-evidence-author-20261108-write-handoff-fixed.ps1 | e1ca6e1a9b0e23d8a7bb0305d98ef89ae682436fddee9e0f630bfb180f88376a |
| experience-evidence-author-20261108-write-handoff.ps1 | 3d5a9399851813b704b43ce999dc6a100d63aadb0f5643db4adc0845d3d37f3c |
