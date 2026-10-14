# Arc v8 Research Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Execute sequentially; each task requires TDD and independent SPEC followed by QUALITY/security review. User already selected this workflow; do not ask again.

**Goal:** Restore the same Research after a lost Start/Retry response without issuing a paid request during recovery.

**Architecture:** Add a session-owner recovery query over existing D1 mutation aliases, expose it through a POST read route, and retain a bounded browser identity before submitting. The hook distinguishes unresolved submissions from known runs; the existing panel handles explicit checking and informed replacement. Execution limits, provider policy, production flags and database schema remain unchanged.

**Tech Stack:** TypeScript, Zod, React, Vitest/Testing Library, SQLite D1 test adapter, existing Sites portable build.

Approved design: `docs/superpowers/specs/2026-09-13-arc-v8-research-recovery-design.md`, approved by user message “批准任务找回设计”. Reviewed design SHA before status update: `593e2c80be1f80274c4a13003f06743e62d17fac6c914718047e4761e7663426`.

Worktree is already isolated at `C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta`, branch `codex/v8-openrouter-research-beta`, HEAD `7090153b4acad7b12df6a7ee4d675b46c41871dc`. Preserve existing uncommitted changes. **No commits, staging, pushes, production/Sites operations, real Key/env/body reads or Provider calls.** The design's local-only authorization overrides skill commit defaults. Attempt17 is passed and consumed; no attempt18.

## File boundaries and task order

1. Server and transport: contracts, repository lookup, orchestrator recovery, route, client, corresponding tests.
2. Browser identity/lifecycle: focused storage module and hook, corresponding tests. Root supplies finalized Task1 types.
3. Panel/Setup interaction: user-facing status/replacement confirmation and integration tests. Root supplies finalized Task2 API.
4. Root integration checks, artifact review, final independent review, operations/checkpoint.

Root snapshots existing files before edits under `outputs/local-research-recovery-20260913/before/<sourcepath>.snapshot`; the suffix prevents TypeScript from treating snapshots as source. `before-hashes.json` maps source to snapshot and SHA. Reviewers compare to those snapshots rather than HEAD, which includes unrelated prior uncommitted work. Changes needed only to extend typed test doubles are allowed but identified explicitly. No parallel implementers.

### Task 1: Owner-bound recovery query and client

Files: modify `app/contracts/research.ts`, `app/server/research/repository.ts`, `app/server/research/d1-repository.ts`, `app/server/research/orchestrator.ts`, `app/server/http/research-route-factories.ts`, `app/lib/research-client.ts`; create `app/api/intelligence/research/recover/route.ts`; test `tests/contracts/research-contracts.test.ts`, `tests/server/research-recovery.test.ts` (new), `tests/server/research-orchestrator.test.ts`, `tests/api/research-routes.test.ts`, `tests/lib/research-client.test.ts`. Update typed mocks mechanically where required, including hook fakeClient, without changing hook behavior.

- [x] Write contract and real-repository RED tests first. Recover schema must be a strict union:

```ts
export const researchRecoverRequestSchema = z.discriminatedUnion("kind", [
  researchRequestSchema.extend({ kind: z.literal("start") }).strict(),
  researchRequestSchema.extend({ kind: z.literal("retry"), sourceRunId: researchPackageSchema.shape.id }).strict(),
]);
export type ResearchRecoverRequest = z.infer<typeof researchRecoverRequestSchema>;
```

The standalone repository test uses `createResearchD1`, `seedUser`, real `D1ResearchRepository`, and coherent normalized identity `fingerprint(["data product manager", "en-US"])`. First behavior assertion, before the method exists:

```ts
const found = await repository.findRecoveryRun({ ownerId: "owner-a", mutationId: created.run.mutationId,
  normalizedRoleKey: "data product manager", locale: "en-US", inputFingerprint,
  retryOfRunId: null });
expect(found?.id).toBe(created.run.id);
expect(db.database.prepare("SELECT count(*) AS n FROM research_runs").get()).toEqual({ n: 1 });
```

- [x] Run `node node_modules/vitest/vitest.mjs run tests/contracts/research-contracts.test.ts tests/server/research-recovery.test.ts --reporter=verbose`; capture actual feature-missing RED, not a sandbox spawn failure.
- [x] Implement bounded lookup with signature `findRecoveryRun(command: RecoverResearchRunCommand): Promise<ResearchRunRecord | null>`, where command contains exactly six fields: ownerId, mutationId, normalizedRoleKey, locale, inputFingerprint, retryOfRunId. Use existing identity validators and prepared owner-scoped SQL. Alias first; direct mutation fallback only if no alias. Request intent mismatch returns null. Malformed owned alias/target returns existing safe unavailable error. Alias target must match stored role/locale/input/config identity and owner, but alias retry intent need not equal a joined target's original retryOfRunId. No create/update/alias insertion in this lookup.
- [x] Add `recover(ownerId: string, input: unknown)` to orchestrator: strict bounded schema parse; normalize role exactly as start; compute input fingerprint; query stored identity independently of current config; if found return existing replay, else null. Never call execute/start/retry or renew lease. Add real state/ledger tests for active, terminal, expired, known/unknown cost, foreign owner, old config, start/retry alias joining, corrupt alias. Assert zero new Provider research/repair and zero new run/alias/call audit.
- [x] Add route handler `createResearchRecoverHandler(deps)`: POST body with mutation security and bounded fatal UTF8; read-kind wrapper with fixed read account limit120; use recovery factory without Key/cohort dependencies. Always cancel unread body on rejection, including read-kind POST errors. Found public states all HTTP200, including failed/needs-review; identity mismatch/foreign/absent → same NOT_FOUND. No raw errors, request-body logging, private diagnostics or cacheable responses.

```ts
import { createResearchRecoverHandler, productionResearchRouteDependencies } from "../../../../server/http/research-route-factories";
export const dynamic = "force-dynamic";
export const POST = createResearchRecoverHandler(productionResearchRouteDependencies);
```

- [x] Extend client interface with `recoverResearch(input: ResearchRecoverRequest, signal: AbortSignal): Promise<ResearchClientResult>`. Separate HTTP body from semantic operation kind in the internal request helper: recover is POST with query semantics, Start/Retry retain mutation semantics. Validate expected role/locale; retry sourceRunId is not expected target runId. Keep bounded response reader, safe errors and cancellation.
- [x] Run `node node_modules/vitest/vitest.mjs run tests/contracts/research-contracts.test.ts tests/server/research-recovery.test.ts tests/server/research-orchestrator.test.ts tests/api/research-routes.test.ts tests/lib/research-client.test.ts --reporter=verbose`; run `node node_modules/typescript/bin/tsc --noEmit --incremental false`. Record results and scoped lint.
- [x] Independent SPEC then separate QUALITY/security review; fix concrete findings with regression tests and re-review. Capture file list/snapshots and receipts; no Git commit.

### Task 2: Durable browser recovery identity and hook

Files: create `app/lib/research-recovery-storage.ts`; modify `app/lib/use-role-research.ts`; test `tests/lib/research-recovery-storage.test.ts` (new), `tests/lib/use-role-research.test.tsx`. Mechanically update `RoleResearchController` test literals if new fields are required; no panel behavior yet.

- [x] RED: submit a Start whose response never arrives, unmount, mount a fresh hook with the same storage/session, and assert recoverResearch called with the original mutation identity while startResearch remains called once. Repeat for Retry, including a successor ID different from the source. Also RED storage.setItem failure must result in zero paid POST.

```ts
expect(client.startResearch).toHaveBeenCalledTimes(1);
expect(client.recoverResearch).toHaveBeenCalledWith(
  { kind: "start", mutationId: "mutation-persisted", role: "Data Product Manager", locale: "en-US" },
  expect.any(AbortSignal),
);
```

- [x] Run targeted hook/storage suites and observe missing durable behavior. Implement strict v2 single-slot storage (UTF8 bytes≤2048) with ownerHint and discriminated pending/known identity. Pending requires exact start/retry recover body; known may hold only runId/role/locale for v1 migration. No credentials, content or full account. Reject unknown fields, invalid combinations, oversized and mismatched-owner records. Legacy v1 is owner-checked by GET before display/migration.
- [x] Persist pending identity before each Start/Retry; if persistence fails retain an actionable local storage error and do not send. Same explicit action uses one mutationId; current operation/epoch prevents double submission. Validate and persist final target runId only for the current mounted owner and epoch; failed persistence after a response keeps the existing pending locator for later recovery.
- [x] Add hook `recoveryUncertain: boolean` and `replacementPending: boolean`; add `confirmReplacement(): Promise<boolean>` and `cancelReplacement(): void`. Preserve current start/refresh/retry/reset API. `start(input)` with an unresolved prior locator records the requested replacement in memory, sets replacementPending, and returns false without Provider POST. `confirmReplacement()` rechecks owner/context/eligibility and performs one new Start with a freshly persisted identity; cancel retains original locator and issues no POST. Pending replacement is never persisted or carried across owner/epoch changes.
- [x] Refresh uses pending recover before known GET; found active/ready/failed/needs-review are legitimate states. NotFound/401/429/network/schema errors halt autopoll and retain pending locator until owner cleanup, while exposing manual status checking. Start/Retry are never invoked by mount, resume, polling or NOT_FOUND. Existing active polling delays1/2/4/5sec and lifecycle cancellation remain. Preserve pending locator on reset/role/Flagship navigation; reset may clear display, not silently cancel the server or authorize replacement. Known resolved reset keeps old behavior. Owner changes clear current slot and mask prior render; initial pending session does not read/display recovery.
- [x] Test query states, storage failure, real remounts, race before server record exists, owner transitions, hidden/resume, stale completion, StrictMode, broken storage, v1 migration, repeated manual query, replacement confirmation/cancel, no eligibility writes, and normal ready planningData. Update only prior tests whose expected semantics intentionally changed (lost-response explicit resubmit now requires confirmation), preserving security assertions.
- [x] Run `node node_modules/vitest/vitest.mjs run tests/lib/research-recovery-storage.test.ts tests/lib/use-role-research.test.tsx tests/lib/research-client.test.ts --reporter=verbose`; typecheck and scoped lint. SPEC then separate QUALITY/security, fix and re-review; no commit.

### Task 3: Setup panel recovery and informed replacement

Files: modify `app/components/setup/role-research-panel.tsx`, `app/setup/page.tsx`, and only necessary parts of `app/components/setup/setup-flow.tsx`; test `tests/components/role-research-panel.test.tsx`, `tests/components/setup-flow.test.tsx`, `tests/pages/setup.test.tsx`, plus `tests/components/research-recovery-interaction.test.tsx` (new if integration clearer). Synchronize the existing local UAT adapter in `tests/offline-uat/composition.ts` with the new recover route and `tests/offline-uat/main.tsx` with both recovery keys; keep `tests/offline-uat/README.md` accurate about those keys and the new coverage. Add `tests/offline-uat/research-recovery.test.mjs` for actual loopback HTTP coverage. This is test infrastructure, not a new product route or public probe.

- [x] RED user interaction: unknown prior request displays Check research status, that button queries only; selecting another role and Research requests confirmation rather than silently dropping the prior locator; cancel issues no POST; confirmation calls confirmReplacement once; restored failed/needs-review exposes valid explicit Retry only when eligible.

```tsx
expect(screen.getByRole("button", { name: "Check research status" })).toBeEnabled();
await user.click(screen.getByRole("button", { name: "Check research status" }));
expect(controller.refresh).toHaveBeenCalledOnce();
expect(controller.start).not.toHaveBeenCalled();
```

- [x] Run panel/Setup suites for actual missing UI RED. Implement restrained inline status/confirmation in existing panel, accessible focus/announcement, no new visual redesign. Copy: “Checking your previous research…” / “The status of your previous research is not confirmed.” Confirm explanation says previous task may still run or incur cost and a new task may cost again; actions “Start new research” and “Keep checking previous research”. Keep Use Flagship and sign-in appropriate. Do not claim background completion, cancellation or refunded costs.
- [x] Include unresolved locator/replacement state in Setup's recovery-available condition, so changed eligibility and role navigation cannot hide the recovery surface. Preserve original locator role/locale separate from current editable role. User can check old task while deciding a new role; new role submission still follows confirmation. Check v1 known result path and normal Use this research → activation/planning.
- [x] Add actual loopback HTTP RED against the existing disposable harness: submit once through the real client/route, intentionally discard its completed response in the test transport, then recover by the same mutation and assert the same run, one FakeProvider call and no extra budget admission. Existing composition dispatch lacks POST recover, so this fails before wiring. Wire `createResearchRecoverHandler` in its fixed route map, never a paid factory or network fallback. Add foreign-owner and read-while-disabled checks. Update the local control panel to inspect/clear both v1 and v2 keys and accurately describe which scenario its prestart control covers. Run `node --test tests/offline-uat/research-recovery.test.mjs`; preserve envFile/envDir false, outbound deny, scoped control nonce and cleanup. Do not print bodies, cookies or credentials.
- [x] Run `node node_modules/vitest/vitest.mjs run tests/components/role-research-panel.test.tsx tests/components/setup-flow.test.tsx tests/pages/setup.test.tsx tests/components/research-setup-activation.test.tsx tests/components/research-recovery-interaction.test.tsx --reporter=verbose` (include new interaction file only if created). Typecheck/scoped lint. SPEC then separate QUALITY/security; no commit.

Task3 SPEC found a retained failed-source Retry query indication gap. Root authorized a minimal hook correction within the approved recovery behavior: a read of a pending locator sets `restoring` even when an older source view exists; known-v2 GET polling and paid submissions retain prior semantics. Regression must cover real-hook deferred Retry loss → manual query heading/focus. Task2-reviewed hook snapshot is preserved under Task3 evidence; the revised hook is included in Task3 re-review and final integration.
### Task 4: Root integrated verification and handoff

- [x] Read actual source/diffs and review receipts; verify all approved design sections map to Tasks1–3, especially pending identity priority, legal alias joins, query semantics, lost retry successor and user-confirmed replacement.
- [x] Run the combined changed backend/client/hook/Setup suites plus `tests/server/d1-research-repository.test.ts`, `tests/server/research-environment.test.ts`, `tests/server/research-planning-integration.test.ts`, `tests/lib/use-planning-workspace.test.tsx`. Run nonincremental typecheck and lint changed TS/TSX. Broaden only for new failures/dependencies.
- [x] Run Sites portable local build with `node C:/Users/XF/.codex/plugins/cache/openai-curated-remote/sites/0.1.62/scripts/build-site.mjs`; inspect recover route presence, Worker default fetch, migration/hosting pairing and absence of local harness credential diagnostics. Preserve actual exit codes and protect file hashes. A sandbox child-process EPERM may use narrowly scoped escalation; never record it as behavioral RED.
- [x] Since ResearchRepository/Orchestrator/Client contracts change, run one default **offline** launcher exercise after passing integration checks if the graph is affected. The command must omit ExecuteOne/Probe flags; verify no real requests, Ready/activation/planning/owner/repeat/cleanup. Do not run real validation or repeat old unchanged 525 diagnostics merely for activity.
- [x] Independent final integration QUALITY/security review after successful checks. Resolve findings. Record precise source/build/test evidence, update `docs/operations/v8-resume-checkpoint.md` and an operations validation report; no Git writes. Full public-release goal remains incomplete until later production policy/execution/auth/data/release work is actually verified.

## Final local result

2026-09-13: Tasks1–4 completed. Resume verified275 saved files unchanged; prior19-file645-test/typecheck/scoped-lint evidence retained. New sequential NodeHTTP21/21, portable build,108-file artifact verification and default no-flags offline launcher passed. Ready/activation/6planning units/owner/repeat/disposal passed,0real requests. Independent final integration QUALITY/security reviewer PASS with no actionable findings; source35/build108/baseline29/protected13 hashes independently verified. Final evidence: `outputs/local-research-recovery-20260913/final-integration-review.json`, `task4-command-receipts.json`, `final-handoff-hashes.json` and `final-handoff-verification.json`. Next is a separate successful-policy migration and hosting execution design; no production/Git/paid action was performed or implied by this local pass.

## Historical user-requested pause after passing Root regression

2026-09-13: Tasks1–3 and their separate SPEC/QUALITY reviews are complete. Root's 19-file645-test run, nonincremental TypeScript and22-file scoped ESLint all exited0 before shutdown. All started checks have ended. No build/profile/preview/default offline launcher/final integration review started. Continue the remaining Task4 items plus the three sequential NodeHTTP suites listed in `outputs/local-research-recovery-20260913/root-suite-plan.json`; do not rerun the645 passing tests unless source changes or a concrete new failure warrants it. Preserve current Git/Provider/production boundaries. User pause is not a new goal blocker or completion.
## Self-review

Coverage: server contract→Task1; browser identity and lost Start/Retry→Task2; unknown-state product actions→Task3; full local integration/freeze→Task4. All states and operation names agree across tasks. Existing worktree/no-Git scope and explicit workflow are already authorized. No additional permission gate between tasks.

