# Arc v8 fresh resource preparation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Follow the single local tooling task and its specification then quality review. The root alone performs the later cloud operations.

**Goal:** Prepare a narrowly scoped, reviewed helper for creating two empty D1 databases and one private R2 bucket for epoch `20261013-guarded`, without starting work or changing existing bindings.

**Architecture:** Derive the existing resource-creation helper with fixed new names, reuse the frozen C5 native gate and neutral Wrangler environment, and require both independent tooling acceptance and a fresh actual second drain before each mutation. Keep all old resources and records. Workflow creation, schema migration, no-start deployment, activation and scenarios follow separately after this resource-only task; no partial task is called full Task15 completion.

**Tech Stack:** Node24 ESM, pinned Wrangler4.92, existing D1/R2 commands, Windows PowerShell.

## Scope and actual inputs

Worktree root is `C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta` (W below). Do not commit/stage or modify product code. Only write the new operation directory and its local reports.

New directory O: `outputs/local-durable-executor-20260914/task15-smoke/cloud-ops-20261013-guarded`.

Existing creation source: `outputs/local-durable-executor-20260914/task15-smoke/cloud-ops-20261012-ack/create-fresh-resource-r1.mjs`, SHA-256 `6268ebb2900f2053c67e885c595aed885a87ccac5e16328ea1a8cfb945f12eac`.

Frozen C5 module: `outputs/local-durable-executor-20261012/maintenance-stop/cloud-r5/guards.mjs`; import via an exact relative path resolved from O. Its preparation is `preparation.json` in that C5 directory, SHA-256 `e10beda94faa2f764f46aac963f09e73c7aaf84b7c389e5cb266c3213da07abd`. `preparation`, `passedGate`, `verify`, `ref`, `neutral`, `fixed`, `validateCandidate`, `assert`, and `jsonRef` are actual exported APIs.

Root stop acceptance: `outputs/local-durable-executor-20261013/maintenance-stop-acceptance-r1.json`, SHA `c6455f4dd22fd5cf1323181dc99a1430530ccd27c0e6f560706825c08a7c5569`. Both actual drains passed; old executor `994b5608-2690-4327-9e80-b52ce0b6f7cc`, Site `26dff9ec-1d62-4146-afa8-71b0f7acc310`, maintenance/admission false, Cron empty. Native platform cessation is not claimed.

Name-availability read: `outputs/local-durable-executor-20261013/proposed-name-availability-r1.json`, SHA `30fb349e29c70b4b9bcccf339663007d036a0cab2e47c04caf352025aa517c03`; all four names available. This does not replace the helper's immediate list-before-create.

## Task 1: Derive the creation helper and freeze local preparation

**Files to create:**
- O`/create-fresh-resource-r1.mjs`: fixed resource creation only.
- O`/candidate-preparation.json`: exact source/candidate/tool refs and proposed names, no invented resource IDs.
- O`/derivation-report-r1.json`: source and derived hashes, exact edits, offline validation.

- [ ] Verify the source SHA before copying. Replace every `cloud-ops-20261012-ack` with `cloud-ops-20261013-guarded` and the three fixed resource suffixes `20261012-ack` with `20261013-guarded`. Preserve old files. Do not change the old evidence date paths by a blind global date replacement.

- [ ] The new CLI takes exactly `role drainGatePath drainGateSha256` (process.argv length5), with role in `siteD1`, `executorD1`, `receipts`. Replace the old root-local drain decision block with the code below; import C5 exports with aliases so existing local `hash`, `read`, and `root` remain unambiguous. Use its actual relative import `../../../local-durable-executor-20261012/maintenance-stop/cloud-r5/guards.mjs`.

```js
const c5Reference = {
  path: resolve(root, 'outputs/local-durable-executor-20261012/maintenance-stop/cloud-r5/preparation.json'),
  sha256: 'e10beda94faa2f764f46aac963f09e73c7aaf84b7c389e5cb266c3213da07abd',
};
const frozen = c5Preparation(c5Reference);
const gateReference = {path: resolve(root, process.argv[3]), sha256: process.argv[4]};
const decisionBytes = c5Verify(gateReference);
const decision = c5PassedGate(gateReference, 'drain-second', c5Reference);
const first = c5PassedGate(decision.request.firstGate, 'drain-first', c5Reference, false);
c5Assert(decision.applicationStopped === true
  && decision.expectedVersions.executor === '994b5608-2690-4327-9e80-b52ce0b6f7cc'
  && decision.expectedVersions.site === '26dff9ec-1d62-4146-afa8-71b0f7acc310'
  && decision.request.deployment.sha256 === '6e6527d297314c4790d9d890afc5b36d3408cff888867d9710a7100915ca6f1e'
  && first.request.deployment.sha256 === decision.request.deployment.sha256
  && Date.parse(decision.startedAt) - Date.parse(first.endedAt) >= 60000,
  'Actual fresh stopped pair required');
```

`c5Preparation`, `c5Verify`, `c5PassedGate`, `c5Assert`, `c5Neutral`, `c5Fixed`, `c5ValidateCandidate`, `c5JsonRef`, and `c5Ref` alias the named exports above. No modification to C5 is permitted. A stale gate requires a new complete native observation sequence, never a rewritten timestamp.

- [ ] After loading O`/candidate-preparation.json`, verify its pinned input refs and actual independent root tooling acceptance before any CLI call:

```js
const prepPath = resolve(op, 'candidate-preparation.json');
const prepReference = c5Ref(prepPath);
c5Assert(p.schemaVersion === 'arc-fresh-resource-preparation-v1', 'Resource preparation schema');
c5Verify(p.sourceCreationHelper);
c5Verify(p.creationHelper);
c5Assert(p.sourceCreationHelper.sha256 === '6268ebb2900f2053c67e885c595aed885a87ccac5e16328ea1a8cfb945f12eac'
  && p.creationHelper.path === resolve(op, 'create-fresh-resource-r1.mjs'), 'Exact derived helper');
c5ValidateCandidate(p.candidateReview);
const acceptance = c5JsonRef(c5Ref(resolve(op, 'root-tooling-acceptance-r1.json')));
c5Assert(acceptance.schemaVersion === 'arc-fresh-resource-tooling-acceptance-v1'
  && acceptance.rootReviewed === true && acceptance.specPassed === true && acceptance.qualityPassed === true
  && acceptance.preparation.path === prepReference.path && acceptance.preparation.sha256 === prepReference.sha256,
  'Independent resource-tooling acceptance required');
c5Verify(acceptance.specReview);
c5Verify(acceptance.qualityReview);
```

The root writes this acceptance only after independent specification and quality reviews. The implementer must not invent or write it. Expected `p.candidateReview` is the actual C5 `candidateReview` reference, not a replacement report.

- [ ] Keep the fixed old read-config and its existing SHA validation, but replace all manual environment construction with the already reviewed neutral environment:

```js
const options = c5Neutral();
const cli = c5Fixed.wrapper.path;
const base = {...options, timeout: 60000, maxBuffer: 262144};
```

Retain `const call=promisify(execFile)` and remove its previous duplicate `base` initializer. No ambient token/env overrides, system proxy changes, logs, metrics, Provider, control routes, or secrets are introduced.

- [ ] Preserve the existing exact command construction, exclusive per-role journal, ordered prerequisites, immediate name-collision check, creation-output identity validation and native list readback. Fixed names must equal:

```js
const fixed = {
  siteD1: 'arc-v8-smoke-site-db-20261013-guarded',
  executorD1: 'arc-v8-smoke-executor-db-20261013-guarded',
  receipts: 'arc-v8-smoke-receipts-20261013-guarded',
};
```

The new gate validation is at script start. Immediately before recording a mutation attempt, call `c5PassedGate(gateReference, 'drain-second', c5Reference)` again so preceding native reads cannot consume its freshness unnoticed. Record `gateReference` and the root tooling acceptance file reference in the attempt alongside the retained drain hash. A failed/unknown create stays journaled and must be reconciled read-only; do not retry or adopt a pre-existing resource. Preserve stdout/stderr hashes without raw dumps.

- [ ] Write candidate preparation after the helper is final. Use actual `c5Ref` values (not fabricated hashes), the C5 candidate review and known account:

```js
{
  schemaVersion: 'arc-fresh-resource-preparation-v1',
  preparedAt: new Date().toISOString(),
  accountId: '54eaadb89014252836694203c1e22546',
  proposedOnly: {
    siteD1Name: 'arc-v8-smoke-site-db-20261013-guarded',
    executorD1Name: 'arc-v8-smoke-executor-db-20261013-guarded',
    privateR2Name: 'arc-v8-smoke-receipts-20261013-guarded',
    workflowName: 'arc-v8-smoke-workflow-20261013-guarded'
  },
  sourceCreationHelper: c5Ref(resolve(root, 'outputs/local-durable-executor-20260914/task15-smoke/cloud-ops-20261012-ack/create-fresh-resource-r1.mjs')),
  creationHelper: c5Ref(resolve(op, 'create-fresh-resource-r1.mjs')),
  candidateReview: frozen.candidateReview,
  report: frozen.report,
  status: 'PREPARED_NOT_EXECUTED',
  cloudCalls: 0
}
```

- [ ] Validate parser and pre-transport refusal with actual commands; no cloud commands by the implementer. Since this is a bounded operational adaptation, do not add tests that merely mirror substitutions. Inspect the final delta for command/account/credential scope, and verify changed guards actually refuse an invalid role and missing gate before `execFile` can run.

```powershell
& 'C:/Program Files/nodejs/node.exe' --check 'outputs/local-durable-executor-20260914/task15-smoke/cloud-ops-20261013-guarded/create-fresh-resource-r1.mjs'
& 'C:/Program Files/nodejs/node.exe' 'outputs/local-durable-executor-20260914/task15-smoke/cloud-ops-20261013-guarded/create-fresh-resource-r1.mjs' invalid missing 0
& 'C:/Program Files/nodejs/node.exe' 'outputs/local-durable-executor-20260914/task15-smoke/cloud-ops-20261013-guarded/create-fresh-resource-r1.mjs' siteD1 missing 0
```

Expected: syntax exit0; invalid role exit1 before loading credential/runtime data; missing gate exit1 before any child process. Record exact results in derivation report; do not classify refusals as cloud failures.

- [ ] Obtain independent specification then quality/safety review of the actual derived file/preparation and this delta. Reviewers write only their reports in O. Root verifies their hash-bound findings, then writes `root-tooling-acceptance-r1.json`. No commits are part of this task.

## Root operation after acceptance

Only the root may dispatch, one resource at a time, in `siteD1`, `executorD1`, `receipts` order. Pass an actual fresh C5 second-drain reference and hash from its real output. These are runtime evidence inputs, not invented plan placeholders. If the existing second drain expires before dispatch, collect a fresh first/second pair through the already reviewed C5 tools. No mutation occurs from stale or partial reads.

After all three actual creation results validate, prepare the next schema/no-start subplan using their returned IDs. Do not create a Workflow here (it belongs to reviewed no-start deployment), enable Cron, attach a bucket publicly, modify old resources, call any Worker control route, request C, or invoke OpenRouter. Keep Task15 and the overall release goal active.

## Self-review

This resource-only subplan covers design phases1–3 only up to empty resource creation. It preserves source/build, credentials, native drain freshness, one-attempt operations and all old evidence. Later schema/deployment/activation/scenarios are explicitly outside the current local task and still required; nothing is claimed completed by this plan. Code deltas, signatures and actual existing imported APIs are spelled out. No guessed cloud IDs or CLI endpoints are used.
