# Arc v8 fresh snapshot rehearsal resource preparation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development for this single local tooling task, followed by independent specification and then quality review. Only root dispatches cloud operations. No commit, staging, product change or historical evidence rewrite is part of this task.

**Goal:** Prepare and verify tools that create two fresh D1 databases and one private R2 bucket for the next mock rehearsal after the original job was settled and the old executor was closed.

**Architecture:** Carry forward the approved 2026-10-13 fresh-rehearsal design with the current r106 closed pair and repaired Site artifact. Reuse the exact bounded read transport and pure native projection/evaluation modules; a new read-only observation pair supplies fresh evidence without reopening the finished r3 repair clock. Derive the already-reviewed create-once helper, keeping exact commands and unknown-write behavior.

**Tech Stack:** Node 24 ESM, existing Wrangler 4.92 wrapper, native Cloudflare read projections, Windows PowerShell.

## Fixed context and scope

W is `C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta`.

O is `outputs/local-durable-executor-20260914/task15-smoke/cloud-ops-20261017-snapshot` under W. Write implementation, tests and reports only in O. This is an existing isolated worktree; do not create another checkout.

S is `outputs/local-durable-executor-20260914/task15-smoke/cloud-ops-20261013-guarded/scenario-ops-r9`.
D is `outputs/local-durable-executor-20261016/completed-ack-snapshot-cloud-tools-r3`.
B is `outputs/local-durable-executor-20261016/completed-ack-snapshot-cloud-run-r3`.

Accepted inputs (verify exact bytes before preparation):

| Input | SHA-256 |
| --- | --- |
| `outputs/local-durable-executor-20261016/resume-checkpoint-r106.json` | `0d14e8b82fa932448c95c0260855394c02c130a25cc5ab34700034e0b62bab23` |
| B`/drain-first.json` | `55de028ca2ca63caf195ab61d4de744c490b79e8c4873ef96964929fb19fe198` |
| B`/drain-second.json` | `b52db779e9d5c951364067a5f4ae985f728a6450aca32f3b1633acbec4850483` |
| B`/drain-summary.json` | `ac3675a727b933289b4ae78352753d73031534afbf88da229eb431756326daa6` |
| B`/repair-summary.json` | `bfb1034f43470ce27bf7e4f68377743a74c8da5c507f31559faad6d82d209543` |
| B`/r2-tombstone-read/result.json` | `55a99ab7ce3e6203ef5d170e372e0712ddaf5389fe76b4697fdc280e7008c8c0` |
| `outputs/local-durable-executor-20260914/task15-smoke/cloud-ops-20261013-guarded/create-fresh-resource-r1.mjs` | `575efc953cd1334238d5dca0fb5862b484e8975de3c94a848c3c5cd5cb7b657a` |
| D`/derivation.json` | `b7e1064af5f89352d57bf8640ca70bbcc748413d49b2737d27fc5391fb494fb4` |

The fixed account is `54eaadb89014252836694203c1e22546`. Existing Site is `arc-v8-smoke-site-20260921`, version `1b4b751d-36fb-4e92-9997-885fbbc810d5`, artifact `443e7fd5d9a54e42f5a321f24d8b5c9a3bc12f47aa222702e665bd2f030c6993`. Executor is `arc-v8-smoke-executor-20260921`, version `5717d119-0ee9-4c96-9725-1dec323d7733`, artifact `b8a8faea136b335f58042f2bf7106ecbb13db30add7a78c16e200d6e192e4cfb`. Use B's second drain for the actual current config references, Workflow IDs/versions and roster; do not use D's earlier `baseState` as the current predecessor.

Proposed names, not yet checked or created:

```js
const names = {
  siteD1: 'arc-v8-smoke-site-db-20261017-snapshot',
  executorD1: 'arc-v8-smoke-executor-db-20261017-snapshot',
  receipts: 'arc-v8-smoke-receipts-20261017-snapshot',
};
const proposedWorkflow = 'arc-v8-smoke-workflow-20261017-snapshot';
```

No invented IDs, Workflow creation, schema migration, binding update, deployment, Cron activation, control calls or model calls belong to this task. Existing four Workflow definitions and all old resources remain unchanged. A later no-start plan must preserve all four and add the new primary as a fifth declaration, with the former primary on a distinct legacy binding. Secret values A/B/C stay untouched and unread.

## Task 1: Prepare current-closed reads and fixed resource creation

**Files:**
- Create O`/closed-predecessor.mjs`: local input validation, recomputation of predecessor/current native proof and fresh pair gate.
- Create O`/collect-closed.mjs`: bounded fixed-target read-only collector with exclusive `first` and `second` operations.
- Create O`/create-fresh-resource-r1.mjs`: derived create-once helper.
- Create O`/candidate-preparation.json`, O`/derivation-report-r1.json`: exact source, runtime and evidence pins; proposed names only.
- Create O`/closed-predecessor.test.mjs` and focused local test evidence.
- Independent reviewers later create their reports; root alone writes O`/root-tooling-acceptance-r1.json`.

- [ ] Verify every pinned source above and retain all original files. Import existing modules without changing them. Use D's `policy.mjs`, `verify-portable.mjs`, and immutable derivation/input evidence, together with S's `guards.mjs`, `read-plans.mjs`, `read-transport.mjs`, `project.mjs`, `mapping.mjs` and `evaluate.mjs`. Do not import/run D`/run.mjs` operational methods or call its `clockCheck`.

- [ ] Implement the local predecessor verifier. Reuse `g.createValidationContext()`, D's source/artifact/portable pins and `verifyPortableEvidence`; additionally pin this task's actual sources and plan. Recompute both saved B drain mappings and scopes from their bound request/native records with `policy.evaluateRepairMapping`, at their recorded native end times. Validate recorded collector/hash/request/config/expected version identity, exact actual commands, and original repair-clock references as historical data only. Recompute `e.assertDrain` with both saved observations and actual close time; verify the completed repair summary and actual tombstone evidence pinned by r106. No saved `passed` boolean alone can substitute for native evidence. Require the exact closed pair/artifacts, safe-to-close scope with only original LONG, and all outstanding work zero. Retained 256 observer rows and one completed job are expected, not reset.

- [ ] Before implementation, add failing behavioral tests using the saved native fixtures: changing one deployment/artifact, one outstanding count, one command sequence or one proof reference must fail recomputation. The success fixture must pass actual evaluator calls. Test stale/future observation rejection and first/second identity mismatch. Test data may be cloned in memory; do not rewrite originals or create fake cloud results in operation directories.

- [ ] Implement the collector from the established D`/run.mjs` full-mapping `collect` path (not the detail subset). The only CLI modes are `first` and `second` with no arbitrary path, command, database, Worker or URL input. `first` records into O`/observations/first`; `second` into O`/observations/second`. Create the complete parent path before starting; reject an existing attempt/directory, preserving failures. Both require the actual root tooling acceptance before any child call.

Create the request with a new operation identifier and current fixed config references; preserve the actual existing read-plan selector fields:

```js
const preparedAt = Date.now();
const request = {
  schemaVersion: 'arc-fresh-closed-read-v1',
  collector: selfReference,
  preparation: preparationReference,
  readPlanSelectorOnly: true,
  phase: which === 'first' ? 'drain-first' : 'drain-second',
  scenarioId: null,
  directory,
  preparedAt,
  deadlineAt: preparedAt + 120000,
  expectedVersions: baseline.mapping.versions,
  configs: baseline.mapping.configs,
  readonlyConfigs: {},
};
```

Generate the same read-only configs with `m.readConfig`. Pin the exact `plans.commandsFor(request)` sequence/hash and all sources/configs; check those pins and the immutable 120-second deadline before every spawn. Use the unmodified `t.createReadTransport` with `g.neutralRead()`, pinned wrapper, no runtime overrides and remaining deadline. Preserve the existing fixed read allowlist, at most three transport attempts, confirmed child closure, no identity/projection retries, memory-only raw output and safe metadata. Keep the version/type check before each Worker export and exact repaired Site/unchanged Executor artifact projection. Write each checkpoint and final native evidence exclusively; incomplete reads never produce a passing proof.

- [ ] The current read's mapping context uses the saved closed config objects, existing schema baseline, saved actual Workflow versions and expected corrected artifacts; `allowNewLatestVersions` is false. Recompute `scopeFromNative`, require all lifecycle outstanding counts zero, and compare stable lease/cursors/native events/rosters to the saved second drain. `first` must start after the old closure propagation horizon and at least 60 seconds after the old second drain. `second` must start at least 60 seconds after the new first ends. Use the existing `e.assertDrain` for those comparisons, with the actual historical close time. This does not renew or claim acceptance for the old r9/r3 operation.

- [ ] Validate the new gate by recomputing both complete new observations, their original fixed inputs and exclusive attempt records. Bind `second` to the exact first reference. Retain existing 15-minute observation freshness from the start (`g.assertFresh`), including a no-future-end check; recheck it immediately before each create attempt. Passing records include `applicationSettled: true`, `task15Accepted: false`, `platformInvocationAbsenceProved: false`. No proof may combine successful fragments from different collections.

- [ ] Derive resource creation from the exact 20261013 helper. Replace its old C5 predecessor validation with the new fresh pair validator and bind the current repaired artifact acceptance. Keep fixed account, role order, read-config hash, neutral Wrangler environment, wrapper pin, timeout60000/maxBuffer262144, immediate list-before-create and name-collision refusal, exclusive attempt journal, precise create-output/native-ID validation, and subsequent native list readback. Keep the command forms exactly:

```js
['d1', 'create', names[role], '--no-update-config', '--config', config]
['r2', 'bucket', 'create', names[role], '--no-update-config', '--config', config]
```

CLI remains exactly `role gatePath gateSha256`, with role `siteD1`, `executorD1`, or `receipts`. The supplied gate must be the exact O second-read result, not an arbitrary valid-looking file. Before each CLI child and immediately before the write journal, validate all current preparation/runtime pins and fresh gate. Require prior created-role results in order. A failed/unknown write remains journaled, gets only safe failure metadata and cannot be repeated or converted into adoption of a pre-existing resource. Do not copy or print credential/log contents.

- [ ] Prepare local manifests after final source bytes. Include actual refs for original helper, all new runtime files, D/S imports and portable acceptance graph, baseline closure/native/configs and this plan, fixed account and proposed names. No fabricated root acceptance or cloud resource IDs. Root acceptance must bind the final preparation hash, all exact runtime pins, and distinct SPEC then QUALITY reports. Verify those report statuses and file hashes before transport, rather than merely checking that report files exist.

- [ ] Run the focused Node test file, syntax checks, and real CLI pre-transport refusals for invalid role and missing gate. Expected syntax/test exit0; invalid-role/missing-gate exit1 with zero child/cloud calls. Record actual outputs/hashes and inspect the derivation delta for command, target, secret and retry scope. Do not rerun unchanged broad product suites or build a different product candidate.

- [ ] Return DONE/DONE_WITH_CONCERNS/NEEDS_CONTEXT with changed files, test results and any limits. Independent specification review precedes a different quality reviewer. Implementer must not write root approval or dispatch a cloud command.

## Root dispatch after local acceptance

Root first runs the two fixed complete read observations, with the existing minimum 60-second gap. These are new read-only operations with their own actual timestamps, not old-clock renewal. If both pass, root may create `siteD1`, then `executorD1`, then `receipts`, each once and within the actual gate freshness. Inspect every result; on unknown outcome reconcile only the affected name. A stale or failed gate stops mutations and requires a separately reviewed fresh observation, never editing evidence timestamps.

After actual resources exist, verify the R2 Objects list is empty and public access is disabled, then prepare the next schema/no-start plan from actual returned IDs. The old bucket intentionally retains the original tombstone. Do not delete it. Finish all next-stage tools before user attendance/C input and Cron activation. Task15, Task16 and Task17 remain incomplete.

## Self-review

This task changes only preparation for a new isolated storage epoch. It carries forward the existing reviewed creation path and bounded native transport. Exact current versions, repaired artifact, original completed job, all legacy Workflows, frozen old clocks, credentials and unknown-write behavior are retained. Fresh observations are required before mutation; no stale saved state is treated as a current cloud read. Product behavior and public/model access are unchanged.
