# Task 2 implementer handoff — source frozen

Base c788268b5dbb4e91480ce98738274dfd08a58155. Scope: seven modified files plus two added test files. No commits, docs/archive edits, native acceptance, full-repository run, deployment, migration, provider call, or subagent work by the implementer.

The shared resolver now retains per-skill original source targets. Retained/manual terms use their original wording; unlabelled literal matches keep every actual vocabulary match as alternative evidence; legal whole-fact manual choices use the whole-fact guard. Both public mapping projections retain their shapes, order and semantics; mappingVersion remains 2026.11.5. New practices require a mapped relation and its own evidence. New contexts bind planning policy 2026.11.3. Facts, mappings, intent eligibility, audit, time and target retain their original paths. UI deduplicates mapped skill IDs separately from current priority count; older previews without details show only the priority count.

A real integration failure used the unchanged edited fact I assisted with observability: PRIVATE-SUPPLEMENT-SENTINEL-5c92. Root explicitly approved a scoped Task 1 predicate repair within Task 2. The new action support is assist/assisted/assisting with/in. Direct and capable paths share the same assistance object restriction; administrative/reporting/planning objects remain unsupported, and nested reporting uses the existing report-object regex. Shared assertion scopes and self-level implementation are unchanged. No help/team broadening or second skill dictionary was introduced. Original 180 guard tests remain identical; 44 assistance controls were appended.

## Frozen source

| File | SHA-256 |
| --- | --- |
| app/lib/materials/skill-mapper.ts | f6dc1cb1302e72f3904847b9eeabe3ff8bcb4af409fb75dc0bf37f5a68f854c9 |
| app/lib/materials/experience-evidence.ts | e837f6a830d104bbcc5689cfed39edd11a16d3a0fa49bc5185f0ed46f34a7db2 |
| app/lib/materials/planning-priority.ts | 9620b2a75b3826f7ccaa330bf95aab8ca5ef0608f2e4af4f3df80bdaa8dd154b |
| app/server/documents/context-builder.ts | aff6dca10db13459beb5d4da00c4e3bb43534b74ffe543f2d307c1c2d2fdd416 |
| app/components/materials/material-context-review.tsx | e74ed4b00d3c5495d7564ab4875503a6b3faebeb5744dd45ca07abab12a65389 |
| tests/lib/materials/experience-evidence.test.ts | 01865af190dea120b09eb83a7707d4a9f304662e6aaefa33ed4067580a7a9633 |
| tests/lib/materials/practice-skill-mapping.test.ts | f28f7049081747cc55638b171f30fc9b0c4d6716e6f3e52c471dada1969941b8 |
| tests/server/material-practice-priorities.test.ts | 6b6f4222a6848748fa2eb1503e3fa887c6ae31c95bbd2d6080c7563e00a64b91 |
| tests/components/material-context-choices.test.tsx | b47bfc1a2f016eb6501fd6666d3b7a78a6d22c028f2ac6e5fd3c05ca8bace33a |

Manifest: experience-priority-author-20261108-frozen-source.json SHA-256 8fd58db6d8d7608796a42bda1f29b8d29c5b6e45ac43265a279a577f13fc190a. Exact source copies are in experience-priority-author-20261108-frozen-source/.

## Checks and preserved failures

All 19 wrapped commands had zero non-loopback denials. Node SQLite experimental warnings remain expected. The final product was tested by 14 files/486 tests plus 12 separate files/1467 tests. A later test-only correction replaced an invalid independent hint input with the three valid hint levels; the final 225-test assistance/lifecycle suite, focused types and lint pass against that correction.

| Run suffix | Result | Exit | Log SHA-256 | Outcome SHA-256 |
| --- | --- | --- | --- | --- |
| service-red-01 | 5 tests: 4 expected priority failures, 1 positive pass; first meaningful service RED | 1 | 8c91eec95c5ce134cd07b012f26cc95f41d47f51683bf3e77bfb2cabf2d93f0b | 4042bc4ef932d6e7d14b748f015e29d57034c933546af5653877ac6827176791 |
| focused-red-02 | 86 tests: 40 fail / 46 pass (9 service/policy, 6 UI, 25 missing projection API) | 1 | 8dd6eae22da405f3f9bd820a0579dc56e846cf0762fa58b3f4ffc0f77e0ffb5a | 6362b99bc408be981760082413e4e08e81fe94a8a415f2c3a66ba08287d3d3b4 |
| focused-green-03 | 3 files / 86 pass | 0 | fe900104267d2f5dfeecc8496cbadf39e6a48262cc62898d0d65e2c516b333b7 | d1c7f77fc8fbcb5d98ba1462d1e90f95b2a237d2b4d90278f75a0d2447732b1f |
| regression-04 | 14 files: 441 pass / 1 real assistance lifecycle regression | 1 | bb5a51508aa2afe926849ac35dc4cbd2312817481443a08a3d1bee8f7880810e | bee137692c5ff8fe52d9168e84ad5a225786295a737b3db89a2184d83fd36a17 |
| types-05 | pass before assistance extension | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 | 762c391bdec763196ab0ff4e880481d75a4d9f41b766ba7e1dfa8981bcb26563 |
| lint-06 | pass before assistance extension | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 | c5f4dde9dfa53bba2c87e2562f63e8b3d9e306e007a234ab571e9fbc9ae3f2f0 |
| assisted-probe-07 | diagnostic: assisted false, tested true, scheduling false; not acceptance | 0 | aec6f1c404966667bf61314a54a4e3027d6e02644a5bec27973f10f7dd7ee488 | dbaa457282f234f4194f8db1a17da4599e0b1fbcd90946f9f2b955ba896cdc27 |
| assistance-red-08 | 217 tests: 15 fail / 202 pass, original supplement flow unchanged | 1 | ae6aa05ff16a0628317e9a7305ca60ca6a2f7e5ee5f19d967bb9cd8bb57bd424 | 8745c9ad84f21c7f7b61e61653d1cb074b8d018f2dec15edbc2585957b2814d7 |
| assistance-green-09 | 2 files / 217 pass | 0 | a0eaf216807c170115b67a62022067c4c67ae9512bd9c6ee8c0897ec2eab3736 | 7999f98db8690714cf4407a2ce12e3ef9214d467e4e852fd8caee331e72dc28c |
| assistance-boundary-red-10 | 225 tests: 7 fail / 218 pass, capable and reporting object bypasses | 1 | 6b72c3c1e85f1eaa0170f834dbbb8b0e9f0a7c49470b1056408a9efb6c318098 | 85196ba837b3c8b6154fd8321000f5d2cce9f1ce44732ee06026c8528cacd013 |
| assistance-boundary-green-11 | 2 files / 225 pass | 0 | 95b2d28cddbb678b697c7c79749d6a08023aa29fcbb4d3e15e0381829f479dd0 | 9d0cf4251cf3f03a9e8bc224e53baa6323e7e76e85134dabeae96616efb671b2 |
| regression-12 | 14 files / 486 pass; product source final, before test-only hint-enum correction | 0 | e58ee638f71e990f3714ea27a5c4f49bdddbebcc9567cb48d3f66f6b9ac8bdf1 | 025cba18f64a425d5f8374ab52670cafa712179ef04e02e0729f71de603b440f |
| level-regression-13 | 12 files / 1467 pass | 0 | ed065c79834ab88e9ae2c51bcf488953fdf683e42af5c6b4f128935de8348fb9 | c103f29c293aec2eaddbf1d620179ecf5aa70eaaec8c7205e446f9438818dd5d |
| types-14 | fail: new test supplied independent, excluded by existing hint API type | 2 | 4d3cbb67327c0822185b6a843eeb76b17c53f536060c6cfc642e63b6173ac65e | 9977c4d071f30b1a17a35fd297b127fa71d75c7d31cb7331b8aa57b7f1aa4023 |
| lint-15 | pass | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 | 28233b0d598d00ea8097b10b9860056a5ce35e313370f5447abbfb7c0eca9417 |
| assistance-final-16 | 2 files / 225 pass after valid conceptual/guided/uncertain test correction | 0 | 08737102cc31cb9b5fb03f80d430c8463baab84caab62d2e37e7829c76ec9845 | 688eef6e19f04df3f6689ce59904eef4a6c6dd051516b9324c7c8a627c09fb85 |
| types-final-17 | pass | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 | 2453c4432c10025b994fb3ca9b2a86dd9805e34d0c6320b9a26f87841f7026c1 |
| lint-final-18 | pass | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 | c3b90470b7aefbbb8b737317097557c5ea82a404e5de63ee03455a8d7d5fdab8 |
| freeze-19 | pass: nine frozen files, original 180 tests unchanged, unchanged shared/level/lifecycle files, logs verified | 0 | 45b6d444e7f97d2c93203f045955136db21529e5af72cc936ba3fdd590ece7ad | ee835a407fe6c304932d89f1644e783fe4febe7e1c3e675e1db5100b278ee887 |

Exact commands are in experience-priority-author-20261108-command-ledger.json, SHA-256 1a8423120b42519448dee6b13369639e9c4d4957f73547ba96b411d125ad5adf. Vitest configs spread the repository base and replace include; every config uses maxWorkers=1. Focused types include worker-configuration.d.ts/tests/setup.ts and exclude ignored work fixtures.

The initial new projection test used a guessed React Product UI label; source inspection corrected it to the published React 19 before the first green run. No pre-existing expectation was changed. The types-14 failure was likewise a new-test input error, not a product contract change; its source is preserved in before-type-fixture.test.source.txt. The real assistance lifecycle failure and all RED/green logs remain original. Pre-assistance sources/patch and the broader pre-implementation RED-02 source snapshot are preserved. The narrow RED-01 test file was subsequently expanded before source freezing; its original log/config remain and this limitation is explicit in the manifest.

## Review boundaries

Source assertions for policy identity were searched: new contexts require 2026.11.3; old historical fixtures and the root's real policy2 store were not edited. Existing supplement lifecycle and legacy historical-read tests remain unchanged. Root owns persisted-old-to-new read acceptance, native workerd/D1/R2 and strict Node parity, actual UI recovery/visual checks, independent spec then quality review, full repository checks, source archive and commits. New unit service tests seed confirmed records; existing lifecycle regressions run actual HTTP/runtime services with SQLite/R2 adapters and a synthetic provider transport. No provider/network acceptance is claimed.

## Harness input hashes

| Input | SHA-256 |
| --- | --- |
| experience-priority-author-20261108-assistance.config.ts | 5dbe6eb6bdc38830605615260ba7595e79cc6ee7f2fd38d772381db92a260a72 |
| experience-priority-author-20261108-assisted-probe.mjs | d651d1ae5482098891c16a0fdaa53490b5a20c60b49abe338b71de25ccc40909 |
| experience-priority-author-20261108-final-tsconfig.json | 7f91db09cd1875e6f3e4f36b9ade46bfd74ce0d79a11855589e3fe20faecfd9d |
| experience-priority-author-20261108-focused.config.ts | 2c25e094afb604e0cb2e4136a79328dc1a5904c8c21f4dc47f9015ae7297f9b5 |
| experience-priority-author-20261108-freeze.mjs | 18779a5d55953998ee852d1f22fc3d1d3581092e78e2c45e22aaae81662cb959 |
| experience-priority-author-20261108-level-regression.config.ts | e2dad7dbbbded54a50112f8411b6dd52ac495fad7c3ea6d54c8cb68296fdde3d |
| experience-priority-author-20261108-move-assistance-tests.ps1 | a89ed94b76c21b4cb5095ba29b1fcbf8674da75e2c65b2d596e3ad45e069744c |
| experience-priority-author-20261108-regression.config.ts | d1d37d0fb563847a930ff0a2bec4cc32558ec3e73e3eb5baf0658647eb43eaa3 |
| experience-priority-author-20261108-service-red.config.ts | 06cec80b53558471896308439de1dfbe617aa02c880c1fd0a52a0e8e522e2e2c |
| experience-priority-author-20261108-tsconfig.json | d0e408f5dfbf90b2765bdbb70057342eb5e09483eec1bb97945944316e0a8dcc |
| work/grounded-verification/run.mjs | 4a2fe29b3c5c0fd9c6ce06cfd436e86e8a9ef9daa8fada44e7c87021c5f28242 |
| work/materials-browser-handoff/block-outbound.cjs | 48332c5bcf02a17b7cc7fbf27e3771db7e8809afb36acd1c870b683909d10e9f |
