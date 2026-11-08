# Task 2 final spec recheck — frozen candidate C

Verdict: **PASS for the approved Task 2 specification and both previously reported findings. No outstanding spec finding remains within the agreed finite assistance grammar.**

Base HEAD: `c788268b5dbb4e91480ce98738274dfd08a58155`. Candidate manifest: `experience-priority-author-20261108-reporting-frozen-source.json`, SHA-256 `b9707d05962b2a1d2debc44a8486d33a8b1127aaf548a0fc4fdf4b844d5c6cc9`. Both prior FAIL memos and their red evidence remain valid historical records and were not edited or replaced.

## Findings resolved

The candidate-B to C product diff changes only the terminal reporting classification at `app/lib/materials/experience-evidence.ts:90-91`, plus its explanatory comment. Bare `reporting` no longer implies administration; the terminal exclusion requires `progress reporting` or `status reporting`. The scheduling/planning exclusions, nested technical-action check, `for/to` purpose handling, capable branch, attribution/denial/quotation rules and whole-fact conservatism remain unchanged.

The original sixteen-case predicate/mapping probe passes with every behavioral assertion preserved. The six-case reporting contrast also passes with every behavioral assertion and the fixed historical candidate-A hash preserved. Current service output independently confirms:

| Fact | Practice / service outcome |
| --- | --- |
| `I assisted with SQL demo scheduling.` | no practice; no priority |
| `I can assist with SQL demo scheduling.` | no practice; no priority |
| `I assisted in SQL training planning.` | no practice; no priority |
| `I assisted with SQL project progress reporting.` | no practice; no priority |
| `I assisted with SQL.` | SQL practice / tier 3 |
| `I assisted in SQL query testing.` | SQL practice / tier 3 |
| `I assisted with SQL reports.` | SQL practice / tier 3 |
| `I assisted with SQL reporting.` | SQL practice / tier 3 |
| `I assisted with SQL query reporting.` | SQL practice / tier 3 |
| `I assisted with testing SQL reporting queries.` | SQL practice / tier 3 |
| `I assisted with modifying SQL queries for planning.` | SQL practice / tier 3 |

Both technical reporting cases now return true for term evidence and confirmed-whole-fact evidence. All four administrative negatives remain false on both paths. All these facts retain the original public mapped SQL topic; only supported facts contribute a practice pair or service priority. New contexts remain policy `2026.11.3`.

The focused suite independently passes **7 files / 329 tests**: 245 experience-evidence tests, 14 public mapper tests, 25 practice-mapper tests, 32 practice-priority service tests, the unchanged supplement lifecycle test, and both six-test review service probes. This includes the added SQL/React and capable positive/negative controls, the original 180 Task 1 tests, and all later approved assistance cases.

## Compatibility and preservation

- All nine candidate source hashes and all twelve unchanged candidate/shared targets matched at preparation and the final source check. Candidate C changes only the experience predicate and its test file relative to B.
- Predicate SHA: `9f63f3f86d99f3758e39935441e13c8a26978216eac070fd19ec37ff63f13077`.
- Experience test SHA: `10d4fc9a867a51656efae4a64c2e984d3cc45d854e8cf39913391ebeff730437`.
- Candidate B's complete 237-test file, whose preserved source hash is `244ed72be656e3f6a85cee7c5dbc16c97c4f4247591fa06d3608945282de50ee`, is an **exact byte prefix** of the current test file. Eight controls were appended.
- All **40** earlier reviewer artifacts match their sealed hashes. This includes both FAIL memos, both red service runs/results, both pure red probes/results, all prior configs/scripts and the original 338-test/1,350-compatibility evidence.
- The other seven Task 2 files, shared assertion scopes, self-assessment implementation/tests, learning-intent suite and original supplement lifecycle test remain unchanged. In particular, the public mapper source remains `f6dc1cb1302e72f3904847b9eeabe3ff8bcb4af409fb75dc0bf37f5a68f854c9`.
- Public mapper fields/basis/grouping/order/manual/empty/omitted/ambiguity behavior remains the source-reviewed behavior from candidate A, whose 1,350 deep comparisons to base were preserved. Neither public mapping projection calls the experience predicate; C changes only that predicate. The 14 public-mapper and 25 practice-mapper tests were rerun successfully.
- The accepted source-retaining resolver, non-JD practice integration, JD requirements, explicit learning intents, choice validation, policy/mapping identities, persisted-preview reads, guards and UI count/copy changes are byte-identical to the previously inspected and accepted Task 2 files. Neither of the two repair rounds changed those paths.

Full source identities and all 40 preservation hashes are recorded in `experience-priority-spec-20261108-recheck2-identity-results.json`, SHA `c75ade6841c99a547cbb1597259a311ea69dcc343d1feba48a1eaa671b03b9f5`.

## Assertion-preserving probe bindings

The reviewer created four new probe copies. Three differ only in exclusive result output filenames. The reporting predicate copy differs only in that filename and the literal current-source SHA assertion, rebound from B (`caf049868ef709757992246447e19f01ae50606b70994143384c56767b0b7fab`) to C (`9f63f3f86d99f3758e39935441e13c8a26978216eac070fd19ec37ff63f13077`). Preparation asserted that reversing precisely those metadata changes reproduces each original script byte-for-byte.

The historical candidate-A assertion remains exactly `e837f6a830d104bbcc5689cfed39edd11a16d3a0fa49bc5185f0ed46f34a7db2`. No expected outcome, behavioral assertion, source validation or hash check was removed or generalized. The preserved probe's historical property name `candidateB` now contains the current C observation, explicitly bound by `candidateBSha256`; that naming was left intact to minimize permitted metadata changes.

## Independent commands and outcomes

The scoped Vitest config spreads `../../vitest.config`, replaces `include`, and uses `maxWorkers: 1`.

```text
node work/grounded-verification/run.mjs experience-priority-spec-20261108-recheck2-prepare-10 work/grounded-verification/experience-priority-spec-20261108-recheck2-prepare.mjs
node work/grounded-verification/run.mjs experience-priority-spec-20261108-recheck2-original-probe-11 work/grounded-verification/experience-priority-spec-20261108-recheck2-original-probe.mjs
node work/grounded-verification/run.mjs experience-priority-spec-20261108-recheck2-reporting-12 work/grounded-verification/experience-priority-spec-20261108-recheck2-reporting-probe.mjs
node work/grounded-verification/run.mjs experience-priority-spec-20261108-recheck2-focused-13 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-priority-spec-20261108-recheck2-focused.config.ts
```

| Label suffix | Result | Log SHA-256 | Non-loopback denials |
| --- | --- | --- | --- |
| `prepare-10` | exit 0; identities, byte prefix, 40 sealed files and exact copy changes pass | `c75ade6841c99a547cbb1597259a311ea69dcc343d1feba48a1eaa671b03b9f5` | 0 |
| `original-probe-11` | exit 0; all 16 original cases pass | `6a2f97218737a18b21e321b6379f08c455cc0297817883228e1da47256b93c63` | 0 |
| `reporting-12` | exit 0; all six reporting cases pass | `388134bf29c957184913671a4fdd65a7724cf6ac298b3c2ff19e28ec718d56ec` | 0 |
| `focused-13` | exit 0; seven suites / 329 tests pass | `fed25b1f8dec32d8accc27482955fdaad05ee2613c937ba083ff9fa893e8f789` | 0 |

An initial read-only `git diff --no-index` invocation used a mistyped preserved-source path; it made no changes and was corrected. The corrected B-to-C diff was inspected. This was not a test failure or evidence replacement.

## Input and result identities

Paths are relative to `work/grounded-verification/` with prefix `experience-priority-spec-20261108-recheck2-`.

| Suffix | SHA-256 |
| --- | --- |
| `prepare.mjs` | `a94e8c55828a281d6893f4d9f7d3eb4ecc69b07650a9ce4718e5e375dd11433a` |
| `focused.config.ts` | `8bb5d1bc39d3c1a47bbc05df48d08a243f8225f79cf74050809ca0ebaae57c37` |
| `original-probe.mjs` | `5ef115b56d5ea1583868bd11a819f2fb6fe538ff032dd5895065b4df8782dfc7` |
| `original-probe-results.json` | `6a2f97218737a18b21e321b6379f08c455cc0297817883228e1da47256b93c63` |
| `original-service.test.ts` | `318bb9fe39e1df8a908af9734f834c5e83f80504c84d64d252e06b69f57c18cf` |
| `original-service-results.json` | `91b654c8bf18dd577efcb23069f4b3f9d473cc011b8b9e81d0f24d74269d67a5` |
| `reporting-probe.mjs` | `ab42374a1b4bef76a3ccd3b4088e0566956b7d1b8a47bfafa25697abbfeefb3e` |
| `reporting-results.json` | `388134bf29c957184913671a4fdd65a7724cf6ac298b3c2ff19e28ec718d56ec` |
| `reporting-service.test.ts` | `99816a4e7c57ff44edf59f8b578828a3a05435fe3cb11f4f3aa05a357a011d02` |
| `reporting-service-results.json` | `8d5915214c2d232ef9bb944d7fd754a87e404a177aca58c55305d9e0ae05b8ca` |

## Root evidence and limits

Root-provided wrapper/results were read and their log hashes checked, but these larger checks were not rerun by this reviewer:

| Root run | Outcome inspected | Log SHA-256 |
| --- | --- | --- |
| `experience-priority-root-cases-20261108-final-d` | PASS, exit 0, denials 0; root reports 37 real local HTTP/runtime cases | `51c256354d8bd0bc134e499e29f2c2d79988cd6265ddc0b610b682d0352ae79e` |
| `experience-priority-node-parity-20261108-final-d` | PASS, exit 0, denials 0; root reports 37 full Node/native comparisons | `d5db78ed4e14e02223dc1a5758ad4f0d217fec073dffb188dce2a3039af77012` |
| `experience-priority-root-ui-20261108-final-c` | exit 0, denials 0; root reports three real provider/HTTP/runtime UI cases | `1093d25498f1c55b27608ad99d4ffa6ba512a3f4d8612ba1e1504fc3ac8d0f30` |
| `experience-priority-history-read-20261108-new-c` | PASS, exit 0, denials 0; observed preview retains policy `2026.11.2` | `850d9c8ee2911806ddf4b8a60dd05458d632cebbefc73657eb835ad58345b99a` |

Their result hashes are respectively `905a61eab90d0fbe4569ea666b3c7681a9f437640212f9b49e582f937a3c92c0`, `1c450b1e469cf082aafe060989ff00b38c7dc80a30199658156c5081bd3a14f8`, `1c1c059053c12971be2b338683a917ad2ca96156911a44758394ff8e4ae03edc`, and `54003c22d7a44215921298a631c43416827ec7e7f0b87d90c8f6bb20b17a2f92`.

The independent review service probes use the real service with the existing SQLite/D1 adapter and seeded confirmed facts; they are not substitutes for the root's native flow. No full-repository, browser, production, real-model or arbitrary-natural-language acceptance claim is made. All Node commands used the required wrapper. Outbound requests and real-model calls by this review: **0**. No product/test-suite/docs edits, commits, deployment, migrations, pushes or subagents occurred.

Candidate-C source review/testing is complete and stopped. This PASS memo, new green evidence and all earlier red evidence are sealed for the root's independent quality-review coordination.
