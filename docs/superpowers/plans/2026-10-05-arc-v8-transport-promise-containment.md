# Arc v8 Transport Promise Containment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Follow TDD, independent SPEC, then distinct QUALITY/security review. Checkboxes record verified completion only.

**Goal:** Contain an already-started transport operation's rejection when the deadline check aborts before a race is installed.

**Architecture:** Keep the existing eager-promise API and fail-closed deadline behavior. Attach a nonthrowing rejection observer before the first throwing check in `Deadline.wait`; continue racing the original promise so normal failures still propagate. Reproduce the real public-scope/D1 nonce cancellation boundary without wall-clock sleeps or external traffic.

**Tech Stack:** TypeScript, existing bridge signing and public operation scope, Vitest, Node event-loop turns, existing smoke build and strict type checks.

---

## Scope and evidence

This is a bounded corrective follow-up within the user's continuing implementation and release authorization. It restores rejection containment required by the existing cancellation design; it does not add a feature, extend deadlines, change auth policy, or authorize a Provider call. No additional generic deployment or implementation confirmation is needed. Existing serial subagent and review choices persist. Work only in the current research worktree; preserve the migration worktree and all unrelated dirty files.

The October 5 diagnostic at `outputs/local-durable-executor-20261005/replay/task5/public-timing-diagnostic/` exercised the actual exported `BridgeTransport`, `PublicOperationScope`, `createGuardedD1`, and `D1BridgeNonceStore`. Moving the injected monotonic clock to 4500 at nonce prepare caused synchronous public-scope cancellation. The request returned the expected temporary transport error but also emitted one unhandled nonce rejection. Raw D1 prepare and decode counts were zero, synthetic fetch count was one, and there was no network or fixture teardown. The diagnostic does not prove the exact origin of the earlier concurrent-suite failure.

The replay plan's original production-no-edit boundary applied to replay implementation. This follow-up explicitly permits only the transport correction below, its regression, and scoped type inclusion. Do not modify `d1-nonce-store`, public scope, auth, runtime policy, migrations, budgets, key handling, or deployment configuration. Do not change reviewed builder hash pins: `http-transport.ts` is not among its six hard-coded pins. Fresh build graphs must nevertheless record the changed input and resulting artifact hashes. Older reviewed artifacts and evidence remain immutable.

Evidence and before copies go in `outputs/local-durable-executor-20261005/replay/transport-containment/`. Do not stage, commit, or overwrite earlier reports. Cloud operations remain after all required reviews and final integration; actual-model permission remains separate.

## Task 1: Correct and verify the cancellation boundary

**Files:**
- Modify `app/server/research/executor/http-transport.ts` (`Deadline.wait` only).
- Modify `tests/server/research-bridge-transport.test.ts` (imports and one targeted regression).
- Modify `worker/research-executor-smoke/tsconfig.json` (include the transport test).

- [x] **Step 1: Save three before copies/hashes and add the real-boundary regression.** Reuse this test file's existing `connection`, `encoder`, `WALL_NOW`, signing and nonce imports. Add imports for `PublicOperationScope` and `createGuardedD1` from their existing production modules. Add inside the transport describe block:

```ts
it("contains nonce rejection when public cancellation precedes the transport wait", async () => {
  const conn = connection();
  let mono = 0;
  const scope = new PublicOperationScope(() => mono);
  const rawPrepare = vi.fn(() => { throw new Error("raw D1 must remain fenced"); });
  const db = { prepare: rawPrepare } as unknown as D1Database;
  const guard = vi.fn(() => { mono = 4500; scope.ensure(); });
  const nonces = new D1BridgeNonceStore(createGuardedD1(db, guard));
  const jobId = "00000000-0000-4000-8000-000000000001";
  const body = encoder.encode("{}");
  const decode = vi.fn(() => "unexpected");
  const fetch = vi.fn(async (request: Request) => {
    const headers = await signBridgeMessage({
      context: { direction: "site-to-executor", kind: "response", method: "POST",
        path: new URL(request.url).pathname, audience: conn.executorOrigin, jobId, status: 200 },
      body, keyId: conn.siteToExecutor.keyId,
      keyBytes: conn.siteToExecutor.copyKeyBytes(), now: () => WALL_NOW,
    });
    return new Response(body, { status: 200, headers });
  });
  const transport = new BridgeTransport({ connection: conn, nonces, fetch,
    wallNow: () => WALL_NOW, monoNow: () => mono });
  const unhandled: unknown[] = [];
  const capture = (reason: unknown) => { unhandled.push(reason); };
  process.on("unhandledRejection", capture);
  try {
    await expect(transport.request({ target: "executor", operation: "status", signal: scope.signal,
      prepare: () => ({ jobId, body }), decode })).rejects.toMatchObject({ kind: "temporary" });
    await new Promise<void>(resolve => setImmediate(resolve));
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(unhandled).toEqual([]);
    expect(guard).toHaveBeenCalledTimes(1);
    expect(rawPrepare).not.toHaveBeenCalled();
    expect(decode).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(scope.signal.aborted).toBe(true);
  } finally {
    scope.finish();
    process.removeListener("unhandledRejection", capture);
  }
});
```

The new imports are:

```ts
import { PublicOperationScope } from "../../app/server/research/public-operation-scope";
import { createGuardedD1 } from "../../app/server/research/site-bridge-factory";
```

- [x] **Step 2: Run meaningful RED before editing transport.**

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-bridge-transport.test.ts -t "contains nonce rejection when public cancellation precedes the transport wait"
```

Expected nonzero: one observed unhandled `BridgeAuthError` despite the handled temporary outer failure. Preserve the failing assertion and captured error evidence; do not weaken the assertion. The installed Vitest omits its separate unhandled-error summary when another process listener exists, so this test's explicit capture may produce the required RED through `expect(unhandled).toEqual([])` without that separate summary. Do not change Vitest reporting configuration. If the harness cannot observe the Node event in Vitest, use a small isolated subprocess equivalent to the already executed diagnostic and assert zero unhandled rejections; diagnose that harness adjustment before editing production.

- [x] **Step 3: Make the smallest containment correction and include the test in strict types.** At the beginning of existing `Deadline.wait`:

```ts
async wait<T>(work: Promise<T>): Promise<T> {
  // The operation may already reject while synchronously cancelling this deadline.
  void work.catch(() => undefined);
  const remaining = this.remaining();
```

Leave the rest of the method and `Promise.race([work, timeout, aborted])` unchanged. The observer does not replace or transform the original work promise; normal rejection classification still flows through the race. Preserve abort listener/timer cleanup and every existing deadline/key cleanup path. Add exactly `"../../tests/server/research-bridge-transport.test.ts"` to the smoke tsconfig `files` array; retain strict settings.

- [x] **Step 4: Run GREEN, regression, types/lint and fresh artifacts.** First run the same focused RED command and the complete bridge transport test file; both must pass without unhandled errors. Then run the following gates with `VITEST_MAX_WORKERS=1` recorded for the full suite, because earlier concurrent runs exposed independent host-timing sensitivity. Do not adjust product or test deadlines.

```powershell
$env:VITEST_MAX_WORKERS = '1'
node node_modules/vitest/vitest.mjs run tests/server/research-cloud-smoke-transports.test.ts tests/server/research-cloud-smoke-control.test.ts tests/server/research-cloud-smoke-replay.test.ts tests/server/research-cloud-smoke-build.test.ts tests/server/research-cloud-smoke-composition.test.ts tests/server/research-cloud-smoke-launcher.test.ts tests/server/remote-public-reader.test.ts tests/server/research-bridge-transport.test.ts tests/server/research-public-integration.test.ts tests/server/research-executor-runtime.test.ts tests/server/research-executor-maintenance.test.ts tests/server/site-import-validation.test.ts
node node_modules/typescript/bin/tsc --project worker/research-executor-smoke/tsconfig.json --noEmit --incremental false
node node_modules/eslint/bin/eslint.js app/server/research/executor/http-transport.ts tests/server/research-bridge-transport.test.ts
node scripts/build-research-executor-smoke.mjs --profile local --report-name task15-containment-local-20261005
node scripts/build-research-executor-smoke.mjs --profile cloud --report-name task15-containment-cloud-candidate-20261005
node scripts/test-research-cloud-smoke.mjs local --report-name task15-containment-native-20261005
npm.cmd run build
rg -n --hidden --no-ignore --glob '*.js' --glob '*.json' --glob '*.mjs' '/_smoke/replay|SMOKE_REPLAY_APPROVAL_JSON|SMOKE_REPLAY_INVENTORY_SHA256|arc-smoke-replay-v1' dist
```

Restore the caller's prior process variable value after the checks. Use fresh unique report names if any exist; do not remove earlier evidence. Require test/type/lint/build exit0 and final exclusion scan exit1/no matches on the actual freshly built `dist`; exit2 is an error. Verify all 18 native signed steps, unchanged single effects and zero outbound attempts. Retain all earlier concurrency failures and qualify historical cause; the deterministic regression proves this specific boundary repair, not all possible load behavior.

- [x] **Step 5: Freeze, self-review, and obtain independent review.** Record exact commands/times/exits, before/after source hashes, changed graph inputs and new artifact hashes. Verify only the three listed source files changed for this follow-up and every old hard-coded pin remains unchanged. SPEC reviewer must inspect the regression and unchanged failure/deadline behavior; a different QUALITY reviewer checks rejection containment without hiding transport errors and listener/key cleanup. Resolve findings before final independent integration of replay plus this repair. Only then select the new reviewed cloud candidate; previously frozen bundles do not contain this fix. No cloud success or public completion claim follows from local checks alone.

## Self-review

The deterministic reproduction maps directly to Step1/2; early observer plus unchanged race maps to Step3; no-write/no-decode/fail-closed and native end-to-end checks map to Step4. Step5 preserves exact evidence and supersedes old cloud artifacts only after review. This plan has one corrective task, three owned source files, no migrations or authorization changes, and retains the user's existing serial subagent choice.
