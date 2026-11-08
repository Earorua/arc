# Task 2 independent code-quality review — frozen candidate C

**Assessment: FAIL / not ready to merge. One Important correctness issue remains.** No product, repository tests, docs or earlier review artifacts were changed by this review.

Reviewed base HEAD: `c788268b5dbb4e91480ce98738274dfd08a58155`. Candidate source manifest: `experience-priority-author-20261108-reporting-frozen-source.json`, SHA-256 `b9707d05962b2a1d2debc44a8486d33a8b1127aaf548a0fc4fdf4b844d5c6cc9`. The review followed the requesting-code-review template, verification-before-completion workflow, and systematic root-cause investigation for the newly reproduced defect.

## Strengths

- `skill-mapper.ts:56-119` keeps practice provenance private to the resolver. The public item/term projections explicitly select their original fields, and their ordering/status/manual/omission paths remain isolated from the experience predicate. Per-course alternative actual vocabulary matches avoid requiring every alias to be personally supported.
- `skill-mapper.ts:150-169` accepts only mapped experience/skill-claim relations, evaluates each relation's own retained target, and deduplicates item/skill pairs after support succeeds. Explicit unlabeled whole-fact choices remain separate from labeled term choices. Server-side item ID uniqueness makes the local `byId` lookup valid for actual service inputs.
- `context-builder.ts:265` limits the new projection to non-JD material. The surrounding choice validation, primary-JD requirements, explicit learning intents, source/owner/lifecycle/fingerprint/expiry/replay/transaction guards and saved-preview reads were inspected and remain unchanged. Policy `2026.11.3` and mapping `2026.11.5` are separate identities.
- `material-context-review.tsx:145-146,198-199` counts distinct mapped course IDs and current priorities independently. Missing historical mapping details suppress the unprovable count. The component tests cover duplicate courses and non-mapped statuses, in addition to recovery.
- The focused production tests exercise actual mapper logic, the actual service with isolated SQLite/D1 fixtures, persisted snapshots and reads, and the component/provider behavior. They are not assertions against mocked mapper results. Database fixtures close after every service case.

## Issues

### Critical

None identified in the reviewed change.

### Important

1. **[P2] Administrative progress/status reporting becomes personal SQL practice when its topic follows `on`.**

   Location: `app/lib/materials/experience-evidence.ts:89-91` (with the broad assistance acceptance at lines 78-85).

   For a confirmed resume experience with retained label `SQL`, all four of these facts return `true` for both term and confirmed-whole-fact evidence and produce `{ itemId, skillId: "sql" }`:

   - `I assisted with status reporting on SQL.`
   - `I can assist with status reporting on SQL.`
   - `I assisted with progress reporting on SQL.`
   - `I am able to assist with progress reporting on SQL.`

   The real `MaterialContextService.create()` then produces `[["sql", 3]]`, persists that incorrect priority in `preview_json`, and `read()` returns it unchanged. Expected: retain the mapped SQL topic but produce no practice priority. The same explicit administrative activity phrased as `SQL status reporting` or `SQL project progress reporting` is correctly excluded.

   Root cause: `objectHead` truncates only at `for` or `to`, while the administrative pattern is anchored to the end of that head. `status reporting on SQL` neither starts with an administrative verb from the earlier guard nor ends with `status reporting`, so it falls through as personal assistance. The direct and capable assistance paths share this bypass. This is the already-approved progress/status reporting boundary with a topic complement, not a request for arbitrary NLP expansion.

   Required repair: recognize this explicit administrative report object when its topic follows `on`, preserving the distinction between that object and actual technical actions. Keep `SQL reporting`, `SQL query reporting`, `testing SQL reporting queries`, and `modifying SQL queries for planning` positive. Preserve the four new negative expectations and the original red artifacts; add narrowly scoped regressions and rerun against a newly frozen source identity.

   Independent proof: the 16-case predicate/mapping probe has four failures and twelve passing controls; the eight-case actual-service probe has the same four failures and four passing controls. Topic mapping, policy identity and audit/availability/target preservation assertions pass before each failing priority assertion. The issue changes ordering evidence, not self-assessment levels.

### Minor

No additional actionable issue identified. The resolver now runs three times per non-JD selected document, and evidence parsing repeats per supported relation/alternative. This is a transparent bounded CPU/allocation cost, not hidden I/O or mutation. Server contracts limit each fact to 1,000 characters, eight retained labels and 100 facts per confirmation, with five selection entries and serialized byte limits. No performance benchmark or maximum-input runtime acceptance was performed, so this review makes no measured latency claim.

## Independent verification

All Node execution used the required offline wrapper. Both new Vitest configurations spread `../../vitest.config`, replace `include`, and set `maxWorkers: 1`. All new artifacts use exclusive, unique `experience-priority-quality-20261108-*` paths; result writers use `flag: "wx"`. No run label or output was reused.

Exact test commands:

```text
node work/grounded-verification/run.mjs experience-priority-quality-20261108-boundary-01 work/grounded-verification/experience-priority-quality-20261108-boundary-probe.mjs
node work/grounded-verification/run.mjs experience-priority-quality-20261108-focused-02 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-priority-quality-20261108-focused.config.ts
node work/grounded-verification/run.mjs experience-priority-quality-20261108-service-03 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-priority-quality-20261108-service.config.ts
```

| Run | Result | Log SHA-256 | Non-loopback denials |
| --- | --- | --- | --- |
| `boundary-01` | exit 1; 16 cases, 4 failures / 12 controls pass | `b9fd78c3b5c8f66c8bb77629945949a700d892b341471fd061d73edf3e856166` | 0 |
| `focused-02` | exit 0; 7 files / 358 tests pass | `a1a9dbc705bc16d6d8bd4c9c521a300c84173f5224d072da52e87f00c2d739b5` | 0 |
| `service-03` | exit 1; 8 tests, 4 failures / 4 controls pass | `2ce5c7ef947d9a1d7938818fe89ee46bd82240a765c1961bbb1c98a9c692c43b` | 0 |

The focused suite contains 245 experience-evidence tests, 14 public mapper tests, 25 practice mapper tests, 32 practice priority tests, 3 existing context tests, 10 learning-intent tests and 29 component choice tests. Its pass does not negate the separately preserved red reproductions.

Outbound calls and real-model calls initiated by this review: **0**. No HTTP/native workerd acceptance, browser, deployment, migration, push, commit, full-repository run or other agent was used. The service reproduction uses actual application service code with the existing seeded confirmation and SQLite/D1 adapter; it is not a full document-ingestion or HTTP lifecycle test.

## Frozen source and artifact identities

All nine candidate hashes matched at initial inspection and again after the final test. The final identity capture also verified all twelve unchanged candidate/shared hashes and all forty sealed earlier reviewer artifacts. The two pre-existing modified docs are root-owned and excluded from the nine-file source freeze. The working-tree HEAD remains the stated base.

Identity record: `experience-priority-quality-20261108-identity-results.json`, SHA-256 `68c829981334e9c6e1f7cd82e348e1df89acd0aff27bef608d8709f4543fbc2f`.

| Candidate file | SHA-256 |
| --- | --- |
| `app/lib/materials/skill-mapper.ts` | `f6dc1cb1302e72f3904847b9eeabe3ff8bcb4af409fb75dc0bf37f5a68f854c9` |
| `app/lib/materials/experience-evidence.ts` | `9f63f3f86d99f3758e39935441e13c8a26978216eac070fd19ec37ff63f13077` |
| `app/lib/materials/planning-priority.ts` | `9620b2a75b3826f7ccaa330bf95aab8ca5ef0608f2e4af4f3df80bdaa8dd154b` |
| `app/server/documents/context-builder.ts` | `aff6dca10db13459beb5d4da00c4e3bb43534b74ffe543f2d307c1c2d2fdd416` |
| `app/components/materials/material-context-review.tsx` | `e74ed4b00d3c5495d7564ab4875503a6b3faebeb5744dd45ca07abab12a65389` |
| `tests/lib/materials/experience-evidence.test.ts` | `10d4fc9a867a51656efae4a64c2e984d3cc45d854e8cf39913391ebeff730437` |
| `tests/lib/materials/practice-skill-mapping.test.ts` | `f28f7049081747cc55638b171f30fc9b0c4d6716e6f3e52c471dada1969941b8` |
| `tests/server/material-practice-priorities.test.ts` | `6b6f4222a6848748fa2eb1503e3fa887c6ae31c95bbd2d6080c7563e00a64b91` |
| `tests/components/material-context-choices.test.tsx` | `b47bfc1a2f016eb6501fd6666d3b7a78a6d22c028f2ac6e5fd3c05ca8bace33a` |

Paths below are relative to `work/grounded-verification/`, all with prefix `experience-priority-quality-20261108-`:

| Suffix | SHA-256 |
| --- | --- |
| `boundary-probe.mjs` | `406951d42023a7f7e9d29ea14fe7f0ec1eb2f786b2e572801848c7c9b5022822` |
| `boundary-results.json` | `b9fd78c3b5c8f66c8bb77629945949a700d892b341471fd061d73edf3e856166` |
| `focused.config.ts` | `410720ef578d5681113736436b3fed0a0dec7c08ba20998122e754fa5e230ddf` |
| `service.test.ts` | `ef355f5c1d36c7dcfb5729394c2e5fefaf4b4d04b97f2af7e6b1db1d6c43d135` |
| `service.config.ts` | `48726f50d5d184056f42617a54e8b1e0c7d1641f70eefe31fa886e1970ab2dd5` |
| `service-results.json` | `30a76340647e948f827b85f331c0da59c47fb65f1fb845a7681e0455f4491532` |

## Assessment and handoff

**Ready to merge: No; fix the Important finding first.** Contract separation, scope isolation, persisted-result handling and existing regression coverage are otherwise sound in the inspected candidate, but this concrete input still asserts unsupported personal practice and changes planning priority.

The earlier SPEC PASS and root's complementary runtime/parity/UI/historical checks are separate evidence. Their reported results were not represented as independently rerun here. No additional grammar expansion or unrelated redesign is requested.

Candidate-C source testing is now stopped. This FAIL memo, both red probes and all exact expectations remain preserved for a source-hash-bound re-review after the repair.
