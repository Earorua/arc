# Task 1 quoted-proposition repair handoff

Status: DONE. Source/test files are frozen at the hashes below. This supersedes the previous author freeze for the quality review's quoted-proposition issue. Root owns renewed native verification, review, documentation, and commits. No Task 2 production wiring or commit was performed.

## Preserved review history

The quality probe originally passed 33 of 36 cases and exposed three whole-fact false positives: I wrote “My colleague tested SQL.”, I wrote “I tested SQL.”, and its ASCII-quote variant. Their SQL term targets already returned false. Original quality RED log SHA-256: 5cd9bc821ce36efe4ae2fcd345ed5bd1493f0111561384d030de6a8e86aa5507. Root reported the final quality FAIL memo SHA-256 as 31749b58c8f60918c9955c4e05613485abb4378383b110334654cf596b43816c. Those artifacts remain unchanged; initial native and integrity results remain historical evidence.

Before editing, all four prior source/test files, the repair frozen-source manifest, and the repair handoff were copied byte-for-byte into work/grounded-verification/experience-evidence-author-20261108-quality-original-freeze/. This writer verified those copies against the prior manifest. The preserved repair handoff SHA-256 is c470b8c86f53be8ed30dfd9a3293ba0574c2357078604ceac3caa07cc580b995. The first author freeze and its earlier preservation folder also remain untouched.

## Bounded change

- The experience-only consumer imports the existing quotation-evidence.quoted pattern; no new quotation parser, shared parser-body edit, or hint-level change was introduced.
- The existing bare-resume prose checks were extracted into hasAssertionProse without changing their conditions. The whole-fact flag now rejects quoted content recognized as assertion prose. An outer writing action cannot convert that embedded proposition into personal practice.
- The quote check does not impose the bare-resume label-shape regex, so literal quoted tool names such as .NET, React.js, SQL Server, and SQL retain support. Term-target handling remains unchanged, including genuine SQL work followed by documentation and I wrote SQL reports.
- Added the three exact RED cases and six positive quote/tool controls in the existing new API test file. No old hint/service/UI/source-span expectations changed. The two shared source files are still byte-identical to the initial Task 1 freeze.

## Validation against this freeze

- quality-red-35: the exact three whole-fact assertions fail, with 177 controls passing; saved raw RED is preserved.
- quality-green-36: all 180 API tests pass.
- quality-spec-37: unchanged independent spec probe passes 65/65.
- quality-review-38: unchanged independent quality probe passes 36/36.
- quality-regression-39: 13 suites / 1,647 tests pass, including existing hint, retention, source/span/reminder, actual review-service, extraction, and UI regressions.
- quality-types-40 and quality-lint-41: exit 0. Scoped type inputs still include worker-configuration.d.ts and tests/setup.ts and exclude intentionally invalid work fixtures.
- quality-compatibility-42: 28/28 original non-import declarations are identical to the frozen baseline; 81 cases match five hint/reminder outputs each. All 18 moved declaration bodies/patterns remain unchanged.
- Scoped git diff --check: exit 0. All eight new Node runs use the prescribed wrapper and record 0 non-loopback denials. Wrapper SHA-256 remains 4a2fe29b3c5c0fd9c6ce06cfd436e86e8a9ef9daa8fada44e7c87021c5f28242.
- The two probe execution copies and compatibility script copy differ only in their unique result-file paths. This writer verifies that exact source equality after reversing those path substitutions. Original scripts/results/logs are untouched.
- Root's renewed Node/workerd and source-integrity binding are pending after this freeze. No new native result is claimed here.

## Complete changed source/test SHA-256

| Path | SHA-256 | Bytes |
| --- | --- | ---: |
| app/lib/materials/experience-evidence.ts | 48bec30986f63a3937d8f89b7493bd2f570aac332ecd890fb81045ac6e091277 | 10178 |
| app/lib/materials/personal-assertion-scopes.ts | 743f1f2a547948e00c015d8c920b15e9c3859d511a59798b620521af0c3bc94a | 12561 |
| app/lib/materials/self-assessment-evidence.ts | 385cf5822faf38e13855979333c0d6d5f45cb4ab5e60ca7c34d0f375f35b3f75 | 5526 |
| tests/lib/materials/experience-evidence.test.ts | fe3d431e722b6b0254224abfb755ddb23e41a59ca4ed5e9a6e0d5434a0af71aa | 12838 |

## Exact Node commands and preserved outcomes

### experience-evidence-author-20261108-quality-red-35

```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-quality-red-35 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-evidence-author-20261108-unit.config.ts --reporter verbose
```

- Exit: 1; non-loopback denials: 0.
- Raw log SHA-256: 201aa7d28b75366060dc1e4aa3006b9cec8ef2bed1d754dab3cb9ad15cde9b80.
- Outcome JSON SHA-256: 66832b27fb2a7c8a648a10c09f91fea6ea07d10f87bfadd2323dea782bf74dc0.

### experience-evidence-author-20261108-quality-green-36

```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-quality-green-36 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-evidence-author-20261108-unit.config.ts --reporter verbose
```

- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: d6f3ce62ea10d905285436445a1d9a608ee46f505027f8ef5abe2bd93d0c6cd1.
- Outcome JSON SHA-256: 660d80257faa03dd464b96e8111e21130f31b0a17795eca487779f25b6c52f26.

### experience-evidence-author-20261108-quality-spec-37

```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-quality-spec-37 work/grounded-verification/experience-evidence-author-20261108-quality-spec-probe.mjs
```

- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: 53006664e0a0015a0224408cd2ac6920d8a88c6f3f2403d9cdf9a1fd1c34d19d.
- Outcome JSON SHA-256: 068d5966ae84180899ad68c768147e45c5ff6db9c8542dfef6bd20f213effe4e.

### experience-evidence-author-20261108-quality-review-38

```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-quality-review-38 work/grounded-verification/experience-evidence-author-20261108-quality-review-probe.mjs
```

- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: 4441867c3452c70324c449a9a9be30cb2935898d1d90453fdeca4af915af5b9a.
- Outcome JSON SHA-256: 115e26ed0d24ec8ce5b2f40394e3844fa6d1796b8435a1b5bcbec6a0759b8548.

### experience-evidence-author-20261108-quality-regression-39

```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-quality-regression-39 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-evidence-author-20261108-regression.config.ts --reporter verbose
```

- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: f37a875d9181a61575b37bbd590fed833bfe952c5df4ff5901e7ad02388e6165.
- Outcome JSON SHA-256: 2e5f6bd1e06f93b550a920064275860a54bf623098f3611953170d59ad8e9fdb.

### experience-evidence-author-20261108-quality-types-40

```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-quality-types-40 node_modules/typescript/bin/tsc -p work/grounded-verification/experience-evidence-author-20261108-tsconfig.json
```

- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.
- Outcome JSON SHA-256: b7b9784e1d9d11a1267a1f9557dc5668ac6e81f3f7e208c3ae8599e33c6404f0.

### experience-evidence-author-20261108-quality-lint-41

```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-quality-lint-41 node_modules/eslint/bin/eslint.js app/lib/materials/experience-evidence.ts app/lib/materials/personal-assertion-scopes.ts app/lib/materials/self-assessment-evidence.ts tests/lib/materials/experience-evidence.test.ts
```

- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.
- Outcome JSON SHA-256: 7766370391fcd689d3794f00c5d0a8ed4482e6cd696f83f25a4e7d1d2a5d1ea7.

### experience-evidence-author-20261108-quality-compatibility-42

```text
node work/grounded-verification/run.mjs experience-evidence-author-20261108-quality-compatibility-42 work/grounded-verification/experience-evidence-author-20261108-baseline-check-quality.mjs
```

- Exit: 0; non-loopback denials: 0.
- Raw log SHA-256: 24bdee14c3c8849c6e941b0b656aa1721391ae4eac3da7fc0dded3a5e189a573.
- Outcome JSON SHA-256: bb877acff9be146d71765ba691e803709b10d3a7f0ac6ae843934225a238e02d.


## Supporting artifacts

| Artifact in work/grounded-verification | SHA-256 |
| --- | --- |
| experience-evidence-spec-20261108-probe.mjs | ac75679f27967b03aaf206c853cd6784e1bfc1df90540e29d153ef01e1c71f87 |
| experience-evidence-quality-20261108-probe.mjs | 2182d41a80aa95a2b3d2d193d953dcc66c15a90bd314d3f349cd28081d04c1b6 |
| experience-evidence-quality-20261108-probe-results.json | 4e40f63c355bc03cd03e9c4a8a18046a9249ba0fff90535d9a38a8b6647d6ad9 |
| experience-evidence-author-20261108-quality-spec-probe.mjs | ebd5bea46d670a1eeb33d956f1cc066d44c1ced11bbd60757b130c53b1b03ecd |
| experience-evidence-author-20261108-quality-spec-results.json | 05854acb86ea8c1bf1881d1f363a14e1bd5282460458bc6e5a0d34508dc69b07 |
| experience-evidence-author-20261108-quality-review-probe.mjs | a49101894b52f7b13b0b35eeae551185cf573b9af0e723b7355f25d4c18a5536 |
| experience-evidence-author-20261108-quality-review-results.json | ce877bae0dfa404927189297036ef79dbbb2ba883386d904d3b8a1554b99e3cc |
| experience-evidence-author-20261108-baseline-check-quality.mjs | 790c5945d80f50156ff877f274d15b4f2c93a884db80240bca4a731d537987ec |
| experience-evidence-author-20261108-quality-compatibility-results.json | 73abf6bb972b27de828534d671c07d9af7960f565599b6c48944145f9fc3f97d |
| experience-evidence-author-20261108-quality-frozen-source.json | cfd2787f2aa37e7a19916404ecbf7a2025a437df22c21bc031764035863b02f9 |
| experience-evidence-author-20261108-quality-diff-check.txt | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |
| experience-evidence-author-20261108-write-quality-handoff.ps1 | 1cf928bebaffbe76742731116e0af1e70477b02fdf8aa8534c3281501269bc6e |
| experience-evidence-author-20261108-repair-handoff.md | c470b8c86f53be8ed30dfd9a3293ba0574c2357078604ceac3caa07cc580b995 |
| experience-evidence-author-20261108-unit.config.ts | 59533735cffd3a4183d7b11d6a9c856d359b14ceb0952c3166e855520326fc07 |
| experience-evidence-author-20261108-regression.config.ts | bd8a46fe6708cf29529385e6cfd4f9fb9768fff1e412b118232b1cd03cfd7d35 |
| experience-evidence-author-20261108-tsconfig.json | c27df9ec6b5764df7214efa12b541b62896e0886583f31b336f879b073c2bcae |
