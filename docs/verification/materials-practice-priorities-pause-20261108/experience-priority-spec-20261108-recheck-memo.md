# Task 2 spec recheck — frozen candidate B

Verdict: **FAIL — original four administrative failures are fixed, but the new suffix rule introduces one P2 technical-reporting regression.**

Base HEAD: `c788268b5dbb4e91480ce98738274dfd08a58155`. Reviewed candidate: `experience-priority-author-20261108-spec-frozen-source.json`, SHA-256 `d5afcd9f3545c1a2bd45772b6a6efd6fa41076c27bd169c65dd161aff226d580`. All nine candidate hashes, all twelve unchanged candidate/shared targets, and the five original reviewer artifacts listed in the manifest matched at the final source check. This recheck is limited to the approved assistance object boundary and preservation of its existing behavior.

## Remaining required finding

**[P2] A terminal `reporting` word rejects technical SQL assistance** — `app/lib/materials/experience-evidence.ts:90`.

The new condition `!nestedAction && /\b(?:scheduling|planning|reporting)\s*[.!]?$/iu.test(objectHead)` classifies every non-verb-headed reporting object as administrative. It correctly rejects the previous `SQL project progress reporting` failure, but also changes `I assisted with SQL reporting.` and `I assisted with SQL query reporting.` from supported to unsupported. Course mapping remains intact; their practice pair and current-service tier-3 priority disappear.

This is a regression within the existing technical-assistance contract, not a request to add another verb, actor, or temporal grammar. `I assisted with SQL.` and `I assisted with SQL reports.` already assert sufficient personal participation; `SQL reporting` describes the corresponding technical activity without a progress/status/about-other-work qualification. The new rule uses the terminal word alone to infer an administrative activity. The original repair requirement explicitly retained technical SQL reports and prohibited this form of word-only over-rejection. `SQL query reporting` is a second minimal control; the primary finding does not depend on it.

The independent comparison compiled the preserved candidate-A predicate directly from its source snapshot, verified against SHA `e837f6a830d104bbcc5689cfed39edd11a16d3a0fa49bc5185f0ed46f34a7db2`, and compared it with candidate B (`caf049868ef709757992246447e19f01ae50606b70994143384c56767b0b7fab`). No product source was swapped or edited.

| Fact text | Expected B practice | A terms / whole | B terms / whole | B service priorities |
| --- | --- | --- | --- | --- |
| `I assisted with SQL reports.` | SQL | true / true | true / true | SQL tier 3 |
| `I assisted with SQL reporting.` | SQL | true / true | false / false | `[]` — failure |
| `I assisted with SQL query reporting.` | SQL | true / true | false / false | `[]` — failure |
| `I assisted with SQL project progress reporting.` | none | true / true | false / false | `[]` — correct repair |
| `I assisted with testing SQL reporting queries.` | SQL | true / true | true / true | SQL tier 3 |
| `I assisted with modifying SQL queries for planning.` | SQL | true / true | true / true | SQL tier 3 |

Every row remains `{status:"mapped",skillIds:["sql"],basis:"literal"}`. Service reproduction uses the real `MaterialContextService.create`, current policy `2026.11.3`, and the existing confirmed-record SQLite/D1 adapter. Expected positive priority is `{skillId:"sql",tier:3,itemIds:["material-item-4db6d50f5fc067a12df4405b08b4f5ed"]}`. The two regression inputs instead return `priorities: []`.

Required repair: distinguish the already approved administrative progress-reporting object from technical SQL reporting without rejecting all objects ending in `reporting`. Preserve the four original administrative negatives and technical controls, including the existing tests added in B. No repair was performed by the reviewer.

## What now passes

- Original sixteen-case predicate/mapping probe: all expectations pass. A byte-identical copy was used with only its result path changed.
- Original six service cases: all pass, including the four original administrative negatives and two positive technical controls. Again, only the result filename changed.
- Five focused suites: **301 tests pass** — 237 evidence tests, 25 practice-mapper tests, 32 practice service tests, the unchanged supplement lifecycle test, and the original six review service cases.
- The nine new positive evidence cases in B pass, including SQL reports, testing reporting queries, nested technical testing, and technical actions whose purpose contains reporting/planning. These controls do not cover the new reporting-noun regression above.
- Candidate A's entire 224-test source is an **exact byte prefix** of B's test source. B adds four administrative negatives and nine technical positives. No original assertion was edited.
- A-to-B source diff is exactly the four inserted lines at `experience-evidence.ts:87-90`; the evidence test append is the only other candidate-file change. The other seven Task 2 files and all five shared/legacy preservation targets match candidate A.

## Source and original evidence preservation

- Candidate B predicate SHA: `caf049868ef709757992246447e19f01ae50606b70994143384c56767b0b7fab`.
- Candidate B evidence tests SHA: `244ed72be656e3f6a85cee7c5dbc16c97c4f4247591fa06d3608945282de50ee`.
- Candidate A manifest remains `8fd58db6d8d7608796a42bda1f29b8d29c5b6e45ac43265a279a577f13fc190a`.
- Original FAIL memo remains `a91086611184ef3a11aa7c2c9ca97e6d23a6f1454803d432ec637b601cfcb627`.
- Original predicate RED log/results remain `81f0d8a2d4b16e1bb98d543776800c99b8d8197333cfaeed33b5ec41103f4760`.
- Original service RED log remains `c4fc992a4cf01d4c50c8743ac9145501f13b5d6ab91f90d007541dc5d01ac99c`; results remain `8ae3c4238ab9423f1f2c328eb2beb31ca0b92bec3aa0b1cf4793c4b1feb292d0`.
- Original wrapper outcomes, probe source bytes, first 338-test log, and 1,350-comparison result were additionally hash-checked. Full preservation identities are recorded in `experience-priority-spec-20261108-recheck-identity-results.json`, SHA `7e2872528ee03e6729aa1721745ab915e88628449db60f185a9a9151ab230ab9`.

## Independent commands and outcomes

Both Vitest configs spread `../../vitest.config`, replace `include`, and set `maxWorkers: 1`. All commands used unique new wrapper labels; no old `.json`, `.log`, or memo was overwritten.

```text
node work/grounded-verification/run.mjs experience-priority-spec-20261108-recheck-prepare-05 work/grounded-verification/experience-priority-spec-20261108-recheck-prepare.mjs
node work/grounded-verification/run.mjs experience-priority-spec-20261108-recheck-original-probe-06 work/grounded-verification/experience-priority-spec-20261108-recheck-original-probe.mjs
node work/grounded-verification/run.mjs experience-priority-spec-20261108-recheck-focused-07 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-priority-spec-20261108-recheck-focused.config.ts
node work/grounded-verification/run.mjs experience-priority-spec-20261108-recheck-reporting-08 work/grounded-verification/experience-priority-spec-20261108-recheck-reporting-probe.mjs
node work/grounded-verification/run.mjs experience-priority-spec-20261108-recheck-reporting-service-09 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-priority-spec-20261108-recheck-reporting-service.config.ts
```

| Label suffix | Result | Log SHA-256 | Non-loopback denials |
| --- | --- | --- | --- |
| `prepare-05` | exit 0; all hash/preservation assertions pass | `7e2872528ee03e6729aa1721745ab915e88628449db60f185a9a9151ab230ab9` | 0 |
| `original-probe-06` | exit 0; original 16 cases pass | `e767841b8e1a04406dcc01fddd26012ab974a1af9c4d84aa3e4764091d4f6f11` | 0 |
| `focused-07` | exit 0; five suites / 301 tests pass | `16b8a7dcb0fd8177e88cad870fffae5d7710c41fcf8e7b228b79a49ca0fb81e8` | 0 |
| `reporting-08` | exit 1; two reporting regressions / four controls pass | `3ed443d3f596a2b229e58fb9ca156df4ab026c2cb718d19a735126b24515d9bf` | 0 |
| `reporting-service-09` | exit 1; two service failures / four controls pass | `249fbeb7e74674f672f9c621aad29b17a131579e0b1a749eed174df07938501d` | 0 |

## New review artifact identities

Paths are relative to `work/grounded-verification/` with prefix `experience-priority-spec-20261108-recheck-`.

| Suffix | SHA-256 |
| --- | --- |
| `prepare.mjs` | `f846986b7fbdd32b7a347d0d7ddc72c3a530c0b5716770e0bb9c3c9f7e89ec0e` |
| `original-probe.mjs` | `cd299b0c52c0cb139cc51b1787c48589f37ca784f9ef8e80466d919e97727d18` |
| `original-service.test.ts` | `8955ff3e20e3ccb802e040829f1e9c9cc0302086d7ced104f5a326f651bda756` |
| `original-service-results.json` | `a57bf4debcd388bcfd1f35f524831d87bb22b27a61aefb8b5aec363736492a26` |
| `focused.config.ts` | `69be8e7f6f4392c4591ef5bae99a82ce60f06db6408b2a710532b3365e5d0985` |
| `reporting-probe.mjs` | `bdff3cb1c867fed8e044e970c540a540f3fa5d850333c82555c2bef3d933e9ec` |
| `reporting-results.json` | `3ed443d3f596a2b229e58fb9ca156df4ab026c2cb718d19a735126b24515d9bf` |
| `reporting-service.config.ts` | `32c5d5f0fc9f552fafc663e7e56ba1ce3b0e50de4dc49779d2d273a0cfa1a426` |
| `reporting-service.test.ts` | `f13eb26f9f243b6749d540e4d41ed83828da4ee434f980b6fe2e35d45d008d4a` |
| `reporting-service-results.json` | `2fe50582aa0c89d835f9cc536d8e2ce2a18f94652f24df1c1a096f6b88a01bfd` |

Outbound requests and real-model calls by this recheck: **0**. No product/tests/docs edits, commits, deployments, migrations, pushes, or other agents were used. Existing synthetic provider transport remains test-local.

The root reports candidate-B native 35-case, UI and historical-read checks passing; those were not repeated here and do not cover the reporting regression. No full-repository, browser, production, or arbitrary-language acceptance claim is made. Candidate-B source inspection/testing is now stopped; this FAIL memo and all new red/green evidence are sealed for the root's repair and quality-review coordination.
