# Independent Task 2 specification review — resumed frozen source

Verdict: **PASS** for the approved Task 2 specification and its finite assist-with/in object-head repair. No outstanding in-scope specification finding was found. This review does not mark Task 3 or overall materials acceptance complete.

Reviewed branch: codex/materials-replan-recovery-20261106. HEAD: 714ea9e54d87b91a1fee4883176d4f1dd06ecf63. Product WIP checkpoint: 41bcdd7. Comparison base: c788268b5dbb4e91480ce98738274dfd08a58155. The only existing tracked local modification was docs/verification/2026-11-06-materials-grounding-pause.md; it was preserved. All reviewer writes are under ignored work/grounded-verification/.

The local AGENTS.md and both required SOURCE_INDEX.md files were read. The sole remote read was the AGENTS-required GitHub master SOURCE_INDEX through the GitHub connector. No fetch/merge/release commands from historical routing documents were executed. Every Node execution used the pinned offline wrapper and blocker. The verification-before-completion skill was applied; no agents were spawned.

Frozen author manifest: experience-priority-author-20261109-resume-frozen-source.json, SHA-256 7c3b39d88da8cce80b3e1a6eff59215508eb8cac18de9fbff328f8966c210134. Source binding: experience-priority-author-20261109-resume-source-binding.json, SHA-256 c0a400acc5554be8189708a2b5d1511f306b9e29c6d421655be02aadf723f93c. Source and tests matched this frozen identity before and after all review execution.

## Requirement-by-requirement conclusion

| Approved requirement | Independent evidence and result |
| --- | --- |
| Original source term, actual vocabulary aliases, explicit whole-fact evidence | PASS. skill-mapper.ts:57-117 keeps evidence privately in the shared resolver. Retained/contextual/manual-term relations retain the original term. No-list automatic relations keep each actual matching vocabulary word as a separate alternative. Explicit no-list whole-fact choices use confirmed-whole-fact. No new vocabulary or reverse inference from mapped course names was added. |
| Mapped personal experience/skill-claim only; per-term isolation | PASS. skill-mapper.ts:150-170 gates mapped status and allowed kinds, checks each selected relation, and deduplicates item/skill pairs. The 25 practice mapper and 32 real-service priority tests cover negative/other/future/mixed scopes, supplied SQL work, aliases in both orders, contextual/manual mapping, long/no-list facts and conservative mixed whole-fact mapping. |
| Public mapper contract, field order/grouping/choices/empty/omitted semantics | PASS. Both public projections omit the private evidence map. The preserved compatibility probe performed 1,350 deep comparisons against base c788268b across 15 facts, 15 choices, 3 catalog configurations and both public APIs, with zero differences. Public ambiguity and legacy manual behavior remain unchanged; new practice cannot restore an explicit empty retained list. |
| Approved assistance boundary and latest for/to/about/on/of object-head repair | PASS. experience-evidence.ts:78-96 narrowly handles assist/assisted/assisting with/in, including capable claims. Administrative scheduling/planning and progress/status reporting remain negative. Unqualified technical SQL reporting/query reporting and actual nested technical actions remain positive. All 16 original, 16 prior-quality and 6 reporting probe expectations were preserved. All six latest about/of cases were additionally checked through both predicate targets, pure mapping, actual service create/persist/read and unchanged audit/time/target. |
| Non-JD practice integration without changing JD/learning-intent or audit/time/target/permission rules | PASS. context-builder.ts:265 replaces only practice collection; requirements and intents continue at :287-288. learningIntentEligible at :334 is unchanged. 10 learning-intent tests, 3 context guard tests, 8 priority tests and the unchanged real supplement lifecycle test passed, including the original observability assistance fact. Existing audit, availability and target values were checked in saved snapshots. |
| New policy 2026.11.3, unchanged mapping 2026.11.5, no old preview recalculation | PASS. Only the policy constant changes. Current read/loadValid returns parsed saved preview_json. An independent baseline-source service actually created a 2026.11.2 context for denied SQL; current read and same-mutation create returned the old preview unchanged. A new mutation under current source removed the priority and used 2026.11.3. Snapshot, preview, fingerprint and token bytes of the old row remained identical; owner, bad-token and stale-confirmation rejection remained active. |
| UI separates mapping and ranking counts; old snapshot does not invent mapping count | PASS. material-context-review.tsx:145 computes the unique mapped skill set only when details exist; :198 displays ranking separately. 29 component tests passed, including mapped1/ranked0, mapped2/ranked1, duplicate course deduplication, ambiguous/nonlearning/omitted/uncovered rows and legacy details-absent snapshots. The copy says negative/other/future topics do not establish practice or ability level. |
| Keep levels, mention projection and wider scope unchanged | PASS by source diff and preserved hashes. No extraction/mention production projection, new learning-intent qualification, assessment adoption, hours/target updates, curriculum expansion, model calls or deployment changes were made. Shared scopes and self-assessment implementation/tests are unchanged. The 259 experience tests include the existing assistance/no-level-hint boundary; no new general language grammar was explored. |

## Fresh executions

| Label suffix | Outcome | Log SHA-256 | Non-loopback denials |
| --- | --- | --- | --- |
| prepare-01 | 9 sources / 12 fixed shared / 22 dependencies / 370 prior artifacts verified | bd34b69e587ae2fa2ebf5704dc8f893f1a212f5d67c34461d28336356a3576d1 | 0 |
| compatibility-02 | 1,350 public-mapper deep comparisons; 0 mismatches | 019c3363f94ce79483ea79359df39f63d231f4ca9a2ccfd42d86fa22b793f4a3 | 0 |
| original-probe-03 | 16 original spec predicate/mapping cases; 0 mismatches | f77bb4d4a5266707445e2375116ce88b6fc29dfbb94d80dfc6cf4c0628b1a2cf | 0 |
| quality-probe-04 | 16 previous quality predicate/mapping cases; 0 mismatches | 3856c578f3661f0461c5be1075578383f8c92d78d3f8b7e7b8b8dc38a7a7da4c | 0 |
| reporting-probe-05 | 6 technical reporting predicate/mapping cases; 0 mismatches | f9c38daa9cb5b8425a5217e8b70b928c40d6b2155a705c8b7ce0857d042eab27 | 0 |
| focused-06 | 13 files / 408 tests pass | 8d63538a3b18b3bd49f6493a3b75ada57309829edadbfcb8c9f3524d59d0932d | 0 |
| final-integrity-07 | All source/dependency/reviewer-input/prior-artifact identities unchanged | af9e465e9ba8d03014404d656faef1501abbf1014dad0f0181a46ee9abcf0240 | 0 |

- node work/grounded-verification/run.mjs experience-priority-spec-20261109-prepare-01 work/grounded-verification/experience-priority-spec-20261109-prepare.mjs before
- node work/grounded-verification/run.mjs experience-priority-spec-20261109-compatibility-02 work/grounded-verification/experience-priority-spec-20261109-compatibility-probe.mjs
- node work/grounded-verification/run.mjs experience-priority-spec-20261109-original-probe-03 work/grounded-verification/experience-priority-spec-20261109-spec-probe.mjs
- node work/grounded-verification/run.mjs experience-priority-spec-20261109-quality-probe-04 work/grounded-verification/experience-priority-spec-20261109-quality-probe.mjs
- node work/grounded-verification/run.mjs experience-priority-spec-20261109-reporting-probe-05 work/grounded-verification/experience-priority-spec-20261109-reporting-probe.mjs
- node work/grounded-verification/run.mjs experience-priority-spec-20261109-focused-06 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-priority-spec-20261109-focused.config.ts
- node work/grounded-verification/run.mjs experience-priority-spec-20261109-final-integrity-07 work/grounded-verification/experience-priority-spec-20261109-prepare.mjs after

The 408 tests comprise: experience evidence 259; public mapper 14; practice mapper 25; priority rules 8; practice-priority service 32; learning intents 10; frozen contexts 3; original supplement lifecycle 1; component choices 29; original spec service 6; previous quality service 8; technical reporting service 6; supplemental about/of plus actual historical creation/read 7. These counts are not added to the author’s earlier totals. The pure probes overlap these behaviors. The scoped suite used the repository Vitest config with an explicit include list and maxWorkers:1. SQLite ExperimentalWarning was emitted; there were no test failures.

## Baseline service and frozen history

The historical check loads exactly three modules from fixed Git base c788268b5dbb4e91480ce98738274dfd08a58155 through an in-memory esbuild loader: the old context builder, old public mapper and old planning policy. Their other dependencies are the unchanged local dependency files recorded below. It calls the actual baseline service create with the SQLite/D1 fixture; it does not fabricate or edit an old preview. The new service then reads the same in-memory store. Root’s existing historical runtime store was never opened or modified.

| File | SHA-256 before and after |
| --- | --- |
| app/server/documents/context-builder.ts | de0d52a3288249004e6fcb2a726fc848e72e00f3a7e76e86ec193c207c34d091 |
| app/lib/materials/planning-priority.ts | b34b1b4338e77babb6deb05c345d4fa97fcc787019ec5cee5cb751b6aea16acf |
| app/lib/materials/skill-mapper.ts | 6f4498453530bd5fbcb8074501bbcea958a792eee3899eb6a9c66b5f514a2889 |

The old denied-SQL preview has SQL tier 3 and policy 2026.11.2; the new context has no practice priority and policy 2026.11.3. Original preview SHA-256: bb9795ff90cbf1c230a2180b71679f0c288a92236bad4c4a5e7b97e7be6b3c73. Original snapshot SHA-256: 92c521400cfecd47d1fc517a3e452568d55c27bbaa2ed4421d8a8f15bd3012be. These remain exact after read, idempotent replay and the independent new context creation.

## Source identity before and after

| File | SHA-256 before and after |
| --- | --- |
| app/lib/materials/skill-mapper.ts | f6dc1cb1302e72f3904847b9eeabe3ff8bcb4af409fb75dc0bf37f5a68f854c9 |
| app/lib/materials/experience-evidence.ts | 12f25330b1719338eec736881d2a19dc8635dbd1c71fa997059dd9bfc21debec |
| app/lib/materials/planning-priority.ts | 9620b2a75b3826f7ccaa330bf95aab8ca5ef0608f2e4af4f3df80bdaa8dd154b |
| app/server/documents/context-builder.ts | aff6dca10db13459beb5d4da00c4e3bb43534b74ffe543f2d307c1c2d2fdd416 |
| app/components/materials/material-context-review.tsx | e74ed4b00d3c5495d7564ab4875503a6b3faebeb5744dd45ca07abab12a65389 |
| tests/lib/materials/experience-evidence.test.ts | 0b8f4d54812dfeed46beb53fd18c10b45503b68f0b989bcf1926706ead60d520 |
| tests/lib/materials/practice-skill-mapping.test.ts | f28f7049081747cc55638b171f30fc9b0c4d6716e6f3e52c471dada1969941b8 |
| tests/server/material-practice-priorities.test.ts | 6b6f4222a6848748fa2eb1503e3fa887c6ae31c95bbd2d6080c7563e00a64b91 |
| tests/components/material-context-choices.test.tsx | b47bfc1a2f016eb6501fd6666d3b7a78a6d22c028f2ac6e5fd3c05ca8bace33a |

The 12 author-bound fixed/shared paths below were checked against the frozen hashes twice. The seven overlapping Task 2 paths remain intentionally present in both tables.

| File | SHA-256 before and after |
| --- | --- |
| app/lib/materials/skill-mapper.ts | f6dc1cb1302e72f3904847b9eeabe3ff8bcb4af409fb75dc0bf37f5a68f854c9 |
| app/lib/materials/planning-priority.ts | 9620b2a75b3826f7ccaa330bf95aab8ca5ef0608f2e4af4f3df80bdaa8dd154b |
| app/server/documents/context-builder.ts | aff6dca10db13459beb5d4da00c4e3bb43534b74ffe543f2d307c1c2d2fdd416 |
| app/components/materials/material-context-review.tsx | e74ed4b00d3c5495d7564ab4875503a6b3faebeb5744dd45ca07abab12a65389 |
| tests/lib/materials/practice-skill-mapping.test.ts | f28f7049081747cc55638b171f30fc9b0c4d6716e6f3e52c471dada1969941b8 |
| tests/server/material-practice-priorities.test.ts | 6b6f4222a6848748fa2eb1503e3fa887c6ae31c95bbd2d6080c7563e00a64b91 |
| tests/components/material-context-choices.test.tsx | b47bfc1a2f016eb6501fd6666d3b7a78a6d22c028f2ac6e5fd3c05ca8bace33a |
| app/lib/materials/personal-assertion-scopes.ts | 743f1f2a547948e00c015d8c920b15e9c3859d511a59798b620521af0c3bc94a |
| app/lib/materials/self-assessment-evidence.ts | 385cf5822faf38e13855979333c0d6d5f45cb4ab5e60ca7c34d0f375f35b3f75 |
| tests/lib/materials/self-assessment-evidence.test.ts | d96fba3093470cde72cccf022b13e37293ae2074d40cb77bae25fed7af2178f5 |
| tests/server/material-supplement-flow.test.ts | 415abb22c1b72b8a2f95c1e8eeec76ee20da11e300b6726507aac8fd288301dc |
| tests/server/material-learning-intents.test.ts | 407366f94cc9fbd9862cf98b4c86733d8a0e3324c462d3acc05bf222758de21a |

Additional fixed dependency identities (all 22 matched before and after):

| File | SHA-256 before and after |
| --- | --- |
| app/contracts/documents.ts | 081b385f3ef2357d7f14dac08bc687caf6126f58beded75c9b230586073635e8 |
| app/contracts/material-planning.ts | d49cd8786457ab59944ce0caca9185acf2b0a006705a69ddff8180b0abe104f6 |
| app/lib/materials/personal-assertion-scopes.ts | 743f1f2a547948e00c015d8c920b15e9c3859d511a59798b620521af0c3bc94a |
| app/lib/materials/self-assessment-evidence.ts | 385cf5822faf38e13855979333c0d6d5f45cb4ab5e60ca7c34d0f375f35b3f75 |
| app/lib/materials/quotation-evidence.ts | 03a77ad110f67b56b7f1d6f28facdf9c70a92d0e7cd152ecdad806967297516a |
| app/lib/materials/contextual-skill-mapping.ts | 3c3aac73ef6c7acad4904c7a665282e447e9cad66bfadf1d9385aff7aaeba1de |
| app/lib/materials/skill-labels.ts | d2a5c3c69c1bd671a30b9597bcec44435baa21b3ce7aedd7664045217118bad0 |
| app/lib/materials/explanations.ts | 24fa658dbecea66616f8c4a2984970729e261ca364105c727d68e80052f0c199 |
| app/lib/planning/path-builder.ts | 8daa896b22a885ee20c5602ed3d4d4bec3560c856393684bd96d98f2e2b9b98d |
| app/server/planning/material-commit.ts | 94cb86d457281aa3965ab07b9fb44043e5670f05fdcd6db276ac90dddfcabc71 |
| app/server/documents/adopted-context.ts | 7d91e1ceef766ce5fe3e3afbdea3de6578fc8e59bfc7ea93c2241f6187a7c697 |
| app/data/flagship-blueprint.ts | b7aafe379b7c27eb133b378090ec50818835cdd39a9a274f7ba603aa72c46264 |
| app/data/flagship-unit-registry.ts | feda4ce53ee53ebb3cc1e80f486dc8c32014193cb79f856d44962b0501bdd4cc |
| tests/helpers/materials-d1.ts | c8662b2255728ca9036ec25129e8486e4b0703fc373291bc19d911c037b49889 |
| tests/helpers/sqlite-d1.ts | 76631541f83b52552d689bb0bb1bc38b0306284da649018446a29a58a01ae6ef |
| tests/helpers/material-planning.ts | ab55ceb41dd71aafb8c37776a0dbc6dbbb843b43e3559cbfc261728e938ce2bd |
| tests/setup.ts | 9c0e90c56dc36d5426549849f53de2bbb8de61539649393b72b91d9a85aad7e1 |
| vitest.config.ts | 85a59647517d3e09fd47ec6faebdbea508c1492fc140ca29d90e2fa8b8e40cd4 |
| package.json | 6c0453db9cd4387879050bea47b355794320b769d4ecd7f44665bf7f0758babf |
| package-lock.json | c41e4bf9d9c08a4e75b869800e5438ab884dae618d7eee5356c0d5e12427f6cd |
| node_modules/esbuild/package.json | 4316bc9a54bbf659d5760f299910d1824045178557e0aea6a1e3c64148fe8a50 |
| node_modules/vitest/package.json | caa41f04799bd42f3cfd100c4282e630d77ffc7deb1e7e4927794fcb7f137f34 |

Offline safety inputs (matched before and after):

| File | SHA-256 before and after |
| --- | --- |
| work/grounded-verification/run.mjs | 4a2fe29b3c5c0fd9c6ce06cfd436e86e8a9ef9daa8fada44e7c87021c5f28242 |
| work/materials-browser-handoff/block-outbound.cjs | 48332c5bcf02a17b7cc7fbf27e3771db7e8809afb36acd1c870b683909d10e9f |

All 370 previously preserved author/reviewer artifacts matched their sealed hashes before and after, including prior red results and FAIL memos. The original 253-test file is still an exact byte prefix of the current experience test file. All frozen source copies and all author harness inputs also matched. Six current author probe copies were first traced backwards to the original reviewer scripts with exact reversible metadata substitutions; the reviewer copies changed only exclusive output filenames. The compatibility copy changed only the current source-binding path and exclusive output filename. No behavioral assertion or historical hash check was removed or weakened.

Full identities and artifact links are in experience-priority-spec-20261109-evidence-ledger.json, SHA-256 7adead1f8471dbb228d56639908276b00ebeae161b143929b2947883b095bb92. The identity-before/after files contain all 370 preservation hashes; their own digests and every reviewer input/result digest are listed below. Paths in this table are relative to work/grounded-verification/.

| File | SHA-256 before and after |
| --- | --- |
| experience-priority-spec-20261109-identity-before-results.json | f9be5a442519e9ac44f2b314b6f5ab0d467d8b9a278f155a91f7370aceb81726 |
| experience-priority-spec-20261109-identity-after-results.json | fbf7aa5a3a24d7e4a896396e26ce307eb8c58da3b8c08b51aaf154fcee014d30 |
| experience-priority-spec-20261109-compatibility-results.json | 019c3363f94ce79483ea79359df39f63d231f4ca9a2ccfd42d86fa22b793f4a3 |
| experience-priority-spec-20261109-spec-probe-results.json | f77bb4d4a5266707445e2375116ce88b6fc29dfbb94d80dfc6cf4c0628b1a2cf |
| experience-priority-spec-20261109-quality-probe-results.json | 3856c578f3661f0461c5be1075578383f8c92d78d3f8b7e7b8b8dc38a7a7da4c |
| experience-priority-spec-20261109-reporting-probe-results.json | f9c38daa9cb5b8425a5217e8b70b928c40d6b2155a705c8b7ce0857d042eab27 |
| experience-priority-spec-20261109-spec-service-results.json | c16dbb16b97731a7c8648e9481757393454c8e5c4ff20c7b862e3f599800879b |
| experience-priority-spec-20261109-quality-service-results.json | f07144bf0f91c226cd1f7b9e8c94d22c8c1ea3d2ebedf69a758d857c4b7aeabf |
| experience-priority-spec-20261109-reporting-service-results.json | 8ad7860407c66f780668fb7787be39adf8b39dc9700b7e8436959b233297ec12 |
| experience-priority-spec-20261109-supplemental-service-results.json | b0a5fbfa8ce9097d2db3814c769725c4d0db7d33809ca3e200e418b148dee246 |
| experience-priority-spec-20261109-prepare.mjs | 2ef8128f8dc3fb56ea4e47ac0f32d616133fb6409c524a28687a00150950435f |
| experience-priority-spec-20261109-focused.config.ts | a42ba6ce34cc18d96a336da3b0607322746131c08b6559d7598e9589524f1646 |
| experience-priority-spec-20261109-supplemental-service.test.ts | ca4e530c702877d60460177515b1c74b9c374bedaa992d5aa094d610fee03814 |
| experience-priority-spec-20261109-compatibility-probe.mjs | a128d7a6e27d8368ed6908413c67b25fc46044d0b0077855f9f184d03dd06629 |
| experience-priority-spec-20261109-spec-probe.mjs | 2c928caaec7b57088540f8deed6d247a9ebc640b9ec042de87056a91cbb10c96 |
| experience-priority-spec-20261109-quality-probe.mjs | 2295f06aacefca8fea7cbcf35f27ec8d356b6397b433bd0f0122992ac7efbea3 |
| experience-priority-spec-20261109-reporting-probe.mjs | a8febdedd720304ab9e320cc95a0ab7a48bb418986efc13f75dc81db5ac1a501 |
| experience-priority-spec-20261109-spec-service.test.ts | 760a97274ae41b9a772b00a4020c89d629a9be846420ad1ac7eee6b110814409 |
| experience-priority-spec-20261109-quality-service.test.ts | 0c7b699922da8de116bf00c9d0d050a916e517d57ef8047abb4e444e05675bf9 |
| experience-priority-spec-20261109-reporting-service.test.ts | 9569fc5f78026c5cd3dffdaa54080187e05f937c807a598a5ee1db3ec55daeaf |
| experience-priority-spec-20261109-finalize.mjs | 0a473d62adf949165e014b3a8a36f5980cfc030e240bcd3321c20ad8268c43aa |

## Limits and handoff

This is an independent Task 2 specification PASS, not an independent code-quality signoff, whole-repository pass, browser/workerd/native acceptance or release approval. Service probes use real MaterialContextService with confirmed-record SQLite/D1 fixtures; the original supplement lifecycle exercises its existing runtime/HTTP helper flow. Full native ingestion/persistence, historical workerd store, Node/native parity, browser UI and full-repository checks remain root-owned Task 3 work. Type/lint results reported by the author were not claimed as independently rerun here. No arbitrary-natural-language completeness claim is made beyond the approved finite grammar.

No product/test/docs edits, commits, pushes, deployment, remote migrations, real-model calls or additional agents occurred. The only remote request was the required routing read; all executable checks reported zero non-loopback denials. Current source testing stopped after final-integrity-07. This memo and ledger only record already completed checks; earlier red/green evidence is unchanged.
