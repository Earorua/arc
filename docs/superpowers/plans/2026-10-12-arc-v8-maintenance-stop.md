# Arc v8 Scheduled Maintenance Stop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Implement the single cohesive task below with specification then quality review.

**Goal:** Stop scheduled application work and Workflow bootstrapping in a fully settled executor while retaining status and completion paths.

**Architecture:** One strict environment parser is shared by the production/smoke scheduled entrypoints and HTTP runtime. A request-runtime flag prevents existing-submit bootstrap without disabling the shared factory used for Workflow final delivery.

**Tech Stack:** TypeScript, Vitest, existing SQLite/Miniflare fixtures, Cloudflare Workers/Workflows, existing esbuild candidate builder.

## Entry condition and scope

Conditional plan only. Execute only if the post-reconciliation observation still finds scheduled activity/maintenance after `2026-10-12T11:10:54.541Z`; otherwise defer this optional change. The design is `docs/superpowers/specs/2026-10-12-arc-v8-maintenance-stop-design.md`. Root owns that actual cloud decision. The prior user authorization covers local implementation and isolated deployment; a new paid Research still requires a separate explicit grant.

Work in the current worktree. Do not reset, stage all, commit unrelated files, change frozen evidence, deploy, query cloud services or call a model during this local task. Before edits, snapshot only the files being changed under a unique `outputs/local-durable-executor-20261012/maintenance-stop/` revision. Test fixtures are not operational evidence.

### Task 1: Scheduled stop, admission, and retained completion

Files:

- Create `worker/research-executor/maintenance-policy.ts` and `tests/server/research-executor-maintenance-policy.test.ts`.
- Modify `worker/research-executor/environment.ts`, `index.ts`, `runtime.ts`, `http-routes.ts`.
- Modify `worker/research-executor-smoke/executor-entry.ts` and `runtime.ts`.
- Extend `tests/server/research-executor-runtime.test.ts` and `tests/server/research-cloud-smoke-build.test.ts` using their existing signed-request, database and bundled-runtime fixtures.
- Update only the two changed reviewed source pins for `worker/research-executor/index.ts` and `worker/research-executor/runtime.ts` in `scripts/build-research-executor-smoke.mjs` after independent source review, as described below. Other reviewed pins and all old reports stay unchanged.
- Add the operational setting to `.env.example` with the explanation that unset preserves existing behavior and false is permitted only after draining. Do not change existing frozen Wrangler manifests or deploy new configurations in this task.

- [ ] Write failing behavioral tests before source changes. The new actual-entrypoint tests use throwing resource getters, rather than merely testing the parser:

```ts
const touched = vi.fn(() => { throw new Error("unexpected resource access"); });
const environment = Object.defineProperties({
  ARC_RESEARCH_EXECUTOR_MAINTENANCE_ENABLED: "false",
}, Object.fromEntries(["EXECUTOR_DB", "EXECUTOR_RECEIPTS", "RESEARCH_WORKFLOW",
  "OPENROUTER_API_KEY"].map(name => [name, { get: touched }])));
const context = { waitUntil: vi.fn() } as unknown as ExecutionContext;
entry.scheduled({ scheduledTime: Date.now() } as ScheduledController,
  environment as ExecutorEnvironment, context);
expect(touched).not.toHaveBeenCalled();
expect(context.waitUntil).not.toHaveBeenCalled();
```

Import the real production and smoke entrypoints in separate cases. Mock only the platform Workflow base needed to import Node-side entrypoints; do not mock the entry being tested. Invalid `"FALSE"`, `""`, and `"secret-marker"` settings throw the fixed generic error before resource access; the error never includes the supplied value. Default and exact true retain enabled maintenance/delegation and rejection behavior.

- [ ] Run the new focused test file and record the actual failing assertions (not an unrelated module-resolution failure):

```powershell
& 'C:/Program Files/nodejs/node.exe' node_modules/vitest/vitest.mjs run tests/server/research-executor-maintenance-policy.test.ts
```

- [ ] Add the optional string property to `ExecutorEnvironment` and implement the parser:

```ts
import type { ExecutorEnvironment } from "./environment";

export function readExecutorMaintenanceEnabled(
  environment: Pick<ExecutorEnvironment, "ARC_RESEARCH_EXECUTOR_MAINTENANCE_ENABLED">,
): boolean {
  const value = environment.ARC_RESEARCH_EXECUTOR_MAINTENANCE_ENABLED;
  if (value === undefined || value === "true") return true;
  if (value === "false") return false;
  throw new Error("Executor maintenance configuration unavailable");
}
```

At the first line of each actual `scheduled` handler, before observer/runtime construction:

```ts
if (!readExecutorMaintenanceEnabled(environment)) return;
```

Import that shared helper in each entrypoint. Preserve all other enabled-path behavior. Do not change `createExecutionRuntime`, the shared maintenance factory, or the Workflow implementation.

- [ ] Add signed HTTP tests before the admission implementation: valid false with acceptNew true rejects a new job; existing accepted matching submit returns the exact persisted proof without `ensureWorkflow`; existing unaccepted matching submit returns signed temporary/unavailable; conflicting content still rejects; enabled/default existing-submit bootstrap remains functional. Check actual request-scoped runtimes, not only a hand-created boolean object. Authentication nonce writes are allowed and should not be mistaken for unexpected job writes.

- [ ] At the beginning of `createHttpRuntime`, compute the mode before constructing stores:

```ts
const maintenanceEnabled = readExecutorMaintenanceEnabled(environment);
const acceptNew = maintenanceEnabled && environment.ARC_RESEARCH_EXECUTOR_ACCEPT_NEW === "true";
```

Expose `maintenanceEnabled, acceptNew` in both returned root and request-scoped runtime objects. Add `maintenanceEnabled?: boolean` to `ExecutorHttpRuntime`; optional undefined preserves existing internal fixture/runtime compatibility, while production factories always supply the parsed boolean.

In `execute`'s submit branch, preserve identity/hash/full-job matching. Replace the unknown-job closure condition and insert the stopped existing-job branch immediately before `ensureWorkflow`:

```ts
} else if (!runtime.acceptNew || runtime.maintenanceEnabled === false) {
  throw new ClosedSubmission();
}
if (runtime.maintenanceEnabled === false) {
  const proof = accepted(existing);
  if (!proof) throw new BridgeJobStoreError("unavailable");
  return proof;
}
return deadline.wait(() => runtime.ensureWorkflow(job, () => deadline.ensure()));
```

Do not change any other route or signing, nonce, deadline, body-limit or account-boundary logic.

- [ ] Add the exact field to the smoke runtime's explicit `sealed` projection:

```ts
ARC_RESEARCH_EXECUTOR_MAINTENANCE_ENABLED: environment.ARC_RESEARCH_EXECUTOR_MAINTENANCE_ENABLED,
```

Exercise the actual bundled cloud and local smoke entrypoints with false/acceptNew true. Reuse the existing signed `runtimeFixture` and build fixture to verify new work is refused, no Workflow is created and no Site acceptance call occurs. The false scheduled call must produce no smoke observer writes. Keep denied global egress and Provider-secret getter assertions.

- [ ] Verify retained paths with valid false: existing status/result/acknowledge/close retain their signatures and identities; a recorded Workflow result reaches final delivery using the real maintenance factory. A transient delivery failure retains the durable receipt. Do not mock away the factory that the regression is meant to protect; use existing DB/R2/Site fixtures or boundary spies around real stores. Eventual scheduled retries/cleanup remain paused by design, so no unsettled-work shutdown claim follows.

- [ ] Run the focused policy/runtime/maintenance tests and typecheck after source changes. Obtain independent source specification/quality review before rebinding build pins. The builder rejects changed reviewed input bytes by design; do not describe that expected refusal as a functional regression or weaken its checks.

```powershell
& 'C:/Program Files/nodejs/node.exe' node_modules/vitest/vitest.mjs run tests/server/research-executor-maintenance-policy.test.ts tests/server/research-executor-runtime.test.ts tests/server/research-executor-maintenance.test.ts
& 'C:/Program Files/nodejs/node.exe' node_modules/typescript/bin/tsc --noEmit
```

- [ ] Once the exact source is reviewed, compute its actual SHA-256 values, verify they are the reviewer-bound bytes, and replace only those two entries in the builder's `reviewed` map. Preserve the old values in the implementation evidence, keep all other pins and rejection logic, and never edit historical `task15-subtask3-before.json` or old artifacts to match new code.

```powershell
Get-FileHash -Algorithm SHA256 'worker/research-executor/index.ts', 'worker/research-executor/runtime.ts'
```

- [ ] Run the affected bundled suites and the full focused set with the new accepted pins, then typecheck the final tree. Use unique report names so failed/old builds remain inspectable:

```powershell
& 'C:/Program Files/nodejs/node.exe' node_modules/vitest/vitest.mjs run tests/server/research-executor-maintenance-policy.test.ts tests/server/research-executor-runtime.test.ts tests/server/research-executor-maintenance.test.ts tests/server/research-cloud-smoke-build.test.ts tests/server/research-cloud-smoke-composition.test.ts tests/server/research-cloud-smoke-control.test.ts
& 'C:/Program Files/nodejs/node.exe' node_modules/typescript/bin/tsc --noEmit
```

- [ ] Self-review the focused diff and record RED/GREEN, test/typecheck results and exact source hashes. Obtain final independent specification then quality review including the pin changes and bundled evidence. Build the new candidate only after local behavior passes, using a new unique report/output name supported by the existing build script; never overwrite old frozen output. Actual cloud deployment is a subsequent concrete operation using fresh zero-outstanding-work evidence and explicit maintenance false/true configurations.

## Completion boundary

Local completion means the source behavior and required regressions pass with reviews; it does not mean Cloudflare stopped invoking the Worker or Task15 passed. The root must still deploy a reviewed stopped candidate, check exact native state, prove stable expired leases/cursors with no outstanding jobs, and prepare the next rehearsal honestly. Preserve the old failed gates and saturated observer.
