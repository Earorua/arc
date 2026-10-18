# Arc v8 production private bridge implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for this single coupled implementation task, followed by specification and quality/security review. The user already authorized local implementation and currently requests local preparation only. Do not ask for another implementation approval, deploy, commit, contact cloud services, invoke r6 tools or read secrets.

**Goal:** Make the actual Site/Executor factories support explicit private service bindings while preserving signed protocol, bounded execution, closed-admission recovery and separate Provider transport.

**Architecture:** A small production binding adapter and transport selector sit below the existing BridgeTransport. All production bridge composition points select the same way. Default legacy transport remains compatible; selected private mode never falls back.

**Tech stack:** TypeScript, Cloudflare Request/Response/Fetcher interfaces, existing Vitest + SQLite D1 fixtures, Node24.

**Spec:** `docs/superpowers/specs/2026-10-15-arc-v8-production-private-bridge-design.md` in the main worktree.

**Code worktree (C):** `C:/Users/XF/.codex/worktrees/arc-v8-release-integration/v8-openrouter-research-beta`.

**Evidence (E):** `C/outputs/release-private-bridge-20261015`. Baseline snapshot/manifest already created and verified. Existing candidate is detached at ddfa1b45fcca44827c86dc418ff6f734eeb19bb4, with accepted uncommitted changes; retain it and do not reset or create a worktree.

## Task 1 — bounded adapter, factory wiring and regressions

### Files and ownership

Create `app/server/research/executor/service-binding-transport.ts` and `tests/server/research-service-binding-transport.test.ts`. Modify only `app/server/research/executor/connection-config.ts`, `app/server/research/service-factory.ts`, `app/server/research/site-bridge-factory.ts`, `worker/research-executor/runtime.ts`, `worker-configuration.d.ts`, and focused factory/runtime test files as required. New focused integration tests may live in `tests/server/research-service-binding-integration.test.ts`. No modifications to mock adapter, archived manifests, build target, migrations, UI or Provider policy.

- [ ] Read the spec and baseline snapshot. Save an exact before/after file inventory in E. Use E for logs, not the frozen Task15 directories.
- [ ] Add a behavior-level failing regression to the existing Site factory fixture: set private mode with missing Executor binding; `createNewCallService()` must return null before database writes even though a legacy override exists. Run and preserve RED. Add a success regression with the explicit binding and no runtime fetch override; the signed submit reaches that binding, global fetch remains unused.
- [ ] Add adapter unit tests before implementation. Use fixed test origins `https://site.example` and `https://executor.example`, fake non-secret bodies, a receiver-sensitive fetch method, local AbortController and controlled streams. Test all the spec's acceptance cases with real Request/Response and the existing body reader.
- [ ] Implement the new module with these public signatures (type-only import of connection types avoids a runtime cycle):

```ts
export type ResearchBridgeTarget = "site" | "executor";
export type ResearchServiceBinding = { fetch(request: Request): Promise<Response> };
export function createResearchServiceBindingFetch(
  binding: ResearchServiceBinding, peerOrigin: string, target: ResearchBridgeTarget,
): typeof fetch;
export function resolveResearchBridgeFetch(
  environment: ResearchBridgeEnvironment, connection: ResearchBridgeConnection,
  target: ResearchBridgeTarget, legacyOverride?: typeof fetch,
): typeof fetch | null;
```

The adapter validates the exact arguments and route arrays in the spec; its forwarding operation is:

```ts
const bytes = await readBridgeBody(request, {
  maxBytes: BRIDGE_BODY_LIMITS.request, timeoutMs: 5_000, signal: request.signal,
});
if (request.signal.aborted) throw new DOMException("Aborted", "AbortError");
const response = await binding.fetch(new Request(request, {
  body: new Uint8Array(bytes), redirect: "manual", signal: request.signal,
}));
if (request.signal.aborted || response.redirected || (response.status >= 300 && response.status < 400)) {
  void response.body?.cancel().catch(() => undefined);
  if (request.signal.aborted) throw new DOMException("Aborted", "AbortError");
  throw new Error("Research bridge transport unavailable");
}
return response;
```

Wrap thrown non-abort errors in that same fixed error. Preserve the outer BridgeTransport timeout; response authentication remains there. The resolver catches invalid binding/configuration and returns null; it only uses legacyOverride/global fetch when mode is undefined.

- [ ] Add the optional mode and two binding fields to ResearchBridgeEnvironment (type-only binding import) and the relevant Site Worker declarations. Replace Site's `runtime.fetch ?? fetch` and Executor's `overrides.bridgeFetch ?? globalThis.fetch` at composition with the resolver. In Site's recovery composition, a null selection creates a null Executor delegate, preserving local reads. New remote-call configuration/service creation must return null when resolver fails. Site bridge returns existing unavailable handler on null; Executor bridge throws existing unavailable error on null. Do not change Provider fetch or admission/policy semantics.
- [ ] Verify GREEN for new cases and then extend integration cases for signed bidirectional calls, disabled-admission recovery and production Executor HTTP/execution/maintenance paths. Use existing D1 bridge fixtures. A stubbed global fetch that throws and a separately injected Provider fetch prove routing separation. Do not use source-string-only assertions as proof of runtime composition.
- [ ] Run targeted regressions and both type checks from C, saving command, exit code and full safe output in E:

```powershell
& 'C:\Program Files\nodejs\node.exe' node_modules/vitest/vitest.mjs run tests/server/research-service-binding-transport.test.ts tests/server/research-service-binding-integration.test.ts tests/server/research-service-factory.test.ts tests/server/research-bridge-transport.test.ts tests/server/research-executor-runtime.test.ts tests/server/research-executor-private-integration.test.ts tests/api/research-bridge-routes.test.ts --maxWorkers=1
& 'C:\Program Files\nodejs\node.exe' node_modules/typescript/bin/tsc --noEmit
& 'C:\Program Files\nodejs\node.exe' node_modules/typescript/bin/tsc --noEmit -p worker/research-executor/tsconfig.json
git -c core.safecrlf=false diff --check
```

Expected: all selected suites and both type checks pass. If new test cases are placed in existing files, omit only the uncreated new integration path. Preserve a genuine RED log and explain the missing behavior, not a harness/import error. No deploy/build script should overwrite accepted artifact paths.

- [ ] Self-review against the spec, save `E/implementation-report.md` and a changed-file manifest with hashes and test evidence. Do not commit; this is an incremental local candidate, not a public release.
- [ ] Independent SPEC reviewer verifies actual code and relevant runtime evidence. Resolve findings before QUALITY starts. Independent QUALITY/security reviewer checks fallback/cancellation/signing/recovery/provider separation and diff against E/baseline. Resolve findings, retain evidence and hand back to Root for current checkpoint update.

## Subsequent component, deliberately not part of Task 1

An exact `research-acceptance` target and paired config preflight are still needed. Prepare a separate schema/design against actual target source; do not modify the shadow allowlist or silently inject bindings into generated Wrangler output here. Operational resource inventory, secret setup, cohort proof and any paid request remain after their respective real-world gates.
