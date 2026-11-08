# Task 1 spec-repair handoff

Status: DONE. The repaired source/test files are frozen. This handoff supersedes the initial author completion status for the four reviewed boundaries; it does not rewrite the initial evidence. Root owns independent native verification, repeated spec/quality reviews, documentation, and commits. No Task 2 production wiring was performed.

## Review history and preservation

The independent spec probe found 10 false-positive outputs in 65 cases while 55 controls passed. Its original log remains unchanged at SHA-256 9de65b5648a8151ee8837619b1e608b6ae2a81355f540acadef52753076f4a56. The root-recorded initial FAIL memo SHA-256 is eb73aae2b93ff168a759653bc4f5146da9d046b89023bd465e6aabaaf82ce81f. Initial 13/1,625 author regressions and root 59/81 native results remain historical evidence, not repair validation.

Before editing, all four initial source/test files, their frozen-source manifest, and the initial handoff were copied byte-for-byte into work/grounded-verification/experience-evidence-author-20261108-repair-original-freeze/. This writer rechecked every preserved file against the initial manifest. The preserved and original handoff SHA-256 is 974082c1aeacf54d896c8594eb50065bb3d4ef459160d5248029ed63a64c3201. All initial scripts, logs, results, and handoff remain intact.

## Bounded changes

- The report-object exclusion now accepts the evidenced plural and article-omitted report/note forms. SQL reports and actual SQL queries used for reporting stay positive.
- A bare resume fragment now checks the existing English claim predicate as well as the action predicate. Actor/predicate prose such as Alice knows SQL cannot become a skill list. No actor-name or skill vocabulary was added.
- The experience-only consumer can end a personal span at a comma followed by a short noun phrase and an already recognized action/claim predicate. A verb immediately after the comma continues the same actor, preserving actual SQL work followed by query modification/result documentation. The new boundary keeps the learner's React evidence and rejects borrowed SQL; mixed whole-fact support remains false. Shared assertion/quote/report/condition grammar is unchanged.
- A plan-to object after an apparent writing action is insufficient evidence of practicing the planned task.
- Added exact failing examples and positive controls only in tests/lib/materials/experience-evidence.test.ts. No pre-existing hint, service, source-span, or UI test expectations changed. The two shared source files are byte-identical to the initial Task 1 freeze.

## Repair validation

- repair-red-25: 5 failing test cases and 166 passing controls before the repairs; failure log preserved.
- repair-comma-green-29: all 171 API tests pass after the four bounded repairs.
- repair-spec-30: all 65 independent spec probe cases pass. The execution copy differs from the reviewer script only in its fresh result-file path; this writer rechecked that exact equality. The original script/result files are untouched.
- repair-regression-31: 13 suites / 1,638 tests pass, including the 171 API tests and all previously selected hint, retention, worker source/span/reminder, actual review-service, extraction, and UI regressions.
- repair-types-32 and repair-lint-33: exit 0. Types include worker-configuration.d.ts and tests/setup.ts, excluding intentional work fixtures.
- repair-compatibility-34: all 28 original non-import declarations remain equal to the frozen baseline; 81 baseline cases match five hint/reminder outputs each. The 18 moved declarations still have unchanged bodies and patterns.
- Scoped git diff --check: exit 0. All 10 repair Node invocations use the prescribed wrapper and record 0 non-loopback denials. Wrapper SHA-256 remains 4a2fe29b3c5c0fd9c6ce06cfd436e86e8a9ef9daa8fada44e7c87021c5f28242.
- Root's repaired Node/workerd run and independent re-review are pending after this freeze. No native result is claimed by this author handoff.

## Complete changed source/test SHA-256

| Path | SHA-256 | Bytes |
| --- | --- | ---: |
| app/lib/materials/experience-evidence.ts | 33c4f603ed97d7d22d67e6e4c9b1975bbb34a6b5fd1f68f306a18c7efbf09324 | 9711 |
| app/lib/materials/personal-assertion-scopes.ts | 743f1f2a547948e00c015d8c920b15e9c3859d511a59798b620521af0c3bc94a | 12561 |
| app/lib/materials/self-assessment-evidence.ts | 385cf5822faf38e13855979333c0d6d5f45cb4ab5e60ca7c34d0f375f35b3f75 | 5526 |
| tests/lib/materials/experience-evidence.test.ts | 4bf293f1a5b17ce83c63bff22e15a7f7a7167bc9aa86fdd66325772ff5b56306 | 12361 |

## Exact repair Node commands and preserved outcomes

### experience-evidence-author-20261108-repair-red-25

```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-repair-red-25 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-evidence-author-20261108-unit.config.ts --reporter verbose
```

- Exit: 1; non-loopback denials: 0.
- Raw log SHA-256: 01691916f287e0c66414d6d95a6e103c896657ac75979fd362fe9f96ccce1a09.
- Outcome JSON SHA-256: 8cd936683f23024182546cad652161d5268eefdd90b77a05c188c54a0a0ea6dc.

### experience-evidence-author-20261108-repair-claims-26

```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-repair-claims-26 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-evidence-author-20261108-unit.config.ts --reporter verbose --testNamePattern 'Alice knows|reviewed boundaries'
```

- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: 9b85a2ec0883398e38db7e6b2b506318569e903b950edc3aaa00414aeddcb435.
- Outcome JSON SHA-256: 70baa52d3db6d54e866e5ccbb6d0426e7084d355383173285f3a26be09e24dcb.

### experience-evidence-author-20261108-repair-report-objects-27

```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-repair-report-objects-27 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-evidence-author-20261108-unit.config.ts --reporter verbose --testNamePattern 'I wrote reports about|I wrote notes about|reviewed boundaries'
```

- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: e48736abe23983629c0d182998782b0e8239b4817bbea33b1171274199645698.
- Outcome JSON SHA-256: 10e9494571b5dfcba34caed8aab30d56e642e07d5cd02eb45e310c7a9422615c.

### experience-evidence-author-20261108-repair-plan-object-28

```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-repair-plan-object-28 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-evidence-author-20261108-unit.config.ts --reporter verbose --testNamePattern 'I wrote a plan|reviewed boundaries'
```

- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: 5f4363ba5b46d88b6e75457b07010a75687d233f30d1da865b89ac01159306b3.
- Outcome JSON SHA-256: f2812cabf86cb6f85a585451a0d505a07e2f57bce6c0bc937e520a2e18e49e7c.

### experience-evidence-author-20261108-repair-comma-green-29

```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-repair-comma-green-29 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-evidence-author-20261108-unit.config.ts --reporter verbose
```

- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: b6af5d3cfb4a08f03d6f94d4824101a5e0328e480bae55047a06ab0f3a4eef92.
- Outcome JSON SHA-256: ee3cd7d7a236ae22ebad0278b597b0b91d6138a302ff6e9b598ae03ffe27e0f3.

### experience-evidence-author-20261108-repair-spec-30

```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-repair-spec-30 work/grounded-verification/experience-evidence-author-20261108-repair-spec-probe.mjs
```

- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: 53006664e0a0015a0224408cd2ac6920d8a88c6f3f2403d9cdf9a1fd1c34d19d.
- Outcome JSON SHA-256: ac888ca05b52cf5ee1bea4eba47b3b6fa4ac282418904fd4c4d893b3a0f96906.

### experience-evidence-author-20261108-repair-regression-31

```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-repair-regression-31 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-evidence-author-20261108-regression.config.ts --reporter verbose
```

- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: 8522a48c58ab2b8f71b7ced8f432f60da61b3762c4263ad708fa70b40e939175.
- Outcome JSON SHA-256: 351e475605e434690207c7ccc81282f1a69a7c564e0f606e488892a5cd15c97f.

### experience-evidence-author-20261108-repair-types-32

```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-repair-types-32 node_modules/typescript/bin/tsc -p work/grounded-verification/experience-evidence-author-20261108-tsconfig.json
```

- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.
- Outcome JSON SHA-256: d018811857cdffc655d97e74255ce729ff395ad50d284e23e159ddf7c9f8112d.

### experience-evidence-author-20261108-repair-lint-33

```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-repair-lint-33 node_modules/eslint/bin/eslint.js app/lib/materials/experience-evidence.ts app/lib/materials/personal-assertion-scopes.ts app/lib/materials/self-assessment-evidence.ts tests/lib/materials/experience-evidence.test.ts
```

- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.
- Outcome JSON SHA-256: 7d778cc5721ea970e1ad53ac54d1e8260b11cbd2431264edbdce6eb15d030358.

### experience-evidence-author-20261108-repair-compatibility-34

```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-repair-compatibility-34 work/grounded-verification/experience-evidence-author-20261108-baseline-check-repair.mjs
```

- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: b2313a42f34b362455cf08fc33b84b2c79db71cd5437423ecb5e6b9d5d961322.
- Outcome JSON SHA-256: b7114ef8eb859aa40bb891c9e80b2cd131c5406ad0a9fa310f447aa57c4b9868.


## Supporting artifacts

| Artifact in work/grounded-verification | SHA-256 |
| --- | --- |
| experience-evidence-spec-20261108-probe.mjs | ac75679f27967b03aaf206c853cd6784e1bfc1df90540e29d153ef01e1c71f87 |
| experience-evidence-spec-20261108-probe-results.json | e1e919b654a3cd59468e6532ed6f16ba04bbd6503c738f4edfb6dd24c3cfa6c2 |
| experience-evidence-author-20261108-repair-spec-probe.mjs | ee7f272d74ca98613eb2d32c453dca8a15bd61c272c532c9857a36f819127b7f |
| experience-evidence-author-20261108-repair-spec-results.json | a03e3b3545b7e3f7dbfd54d42a752433fb5faad89d8a545cf185eb3625f963bd |
| experience-evidence-author-20261108-baseline-check-repair.mjs | 2eb7908e8b0faea4f2e2a3115976a119457557627b90d596cd70881b09a4c77e |
| experience-evidence-author-20261108-repair-compatibility-results.json | 73abf6bb972b27de828534d671c07d9af7960f565599b6c48944145f9fc3f97d |
| experience-evidence-author-20261108-repair-frozen-source.json | b5e8b42ba5e4ebeb212a1ec3d718a6c60d959f38781114512ce77b63968641ca |
| experience-evidence-author-20261108-repair-diff-check.txt | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |
| experience-evidence-author-20261108-write-repair-handoff.ps1 | ab7d0f9419a9575584226a31390d9e5c5614ddf79042ef97c93f43652164b048 |
| experience-evidence-author-20261108-handoff.md | 974082c1aeacf54d896c8594eb50065bb3d4ef459160d5248029ed63a64c3201 |
| experience-evidence-author-20261108-unit.config.ts | 59533735cffd3a4183d7b11d6a9c856d359b14ceb0952c3166e855520326fc07 |
| experience-evidence-author-20261108-regression.config.ts | bd8a46fe6708cf29529385e6cfd4f9fb9768fff1e412b118232b1cd03cfd7d35 |
| experience-evidence-author-20261108-tsconfig.json | c27df9ec6b5764df7214efa12b541b62896e0886583f31b336f879b073c2bcae |
