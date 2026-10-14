# Arc v8 Kimi Budget and Timeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved fixed local Kimi low-reasoning candidate with coordinated 600/660/720-second deadlines and meaningful offline evidence.

**Architecture:** Keep the standard OpenRouter adapter contract and a single private execution/parser path. A named local factory and the local validation runner consume a strictly checked fixed JSON profile; PowerShell consumes that same profile before any key prompt. Existing orchestration, budget, quality, owner, and planning semantics stay authoritative.

**Tech Stack:** TypeScript, Zod, Vitest fake timers, native SQLite test D1, PowerShell, Node/Vite.

---

Approved by user on 2026-09-09 following `2026-09-08-arc-v8-kimi-budget-timeout-design.md`. This is local implementation approval only. No real credentials/env reads, authenticated network, inference, retries, production changes, Git commits/push/merge, Sites candidate or deployment. Six previous inference permits are consumed. Existing worktree and 22 dirty files are retained at HEAD `7090153b4acad7b12df6a7ee4d675b46c41871dc`.

Baseline: root ran adapter, validation, failure-summary tests: **181/181 passed, 8.09 seconds**. Initial restricted run failed to start with spawn EPERM; the approved local subprocess run passed. EPERM is not RED.

## File responsibilities

- `app/server/research/openrouter-provider.ts`: existing exported standard provider, private shared executor, strict profile reader, named local factory.
- `app/server/research/local-validation-profile.json`: six exact approved nonsecret fields.
- `scripts/live-research/validation.ts`: fixed local provider, lease and fingerprint, safe policy/elapsed summary.
- `scripts/live-research/run.ps1`: strict profile check, mode-specific bounded deadline and safe prompt; retain output forwarding.
- `tests/server/kimi-local-validation.test.ts`: actual validation chain and local adapter edge cases, synthetic fetch only.
- `tests/server/openrouter-provider.test.ts`: standard constructor scope regression.
- `tests/server/live-research-validation.test.ts`: exact request and summary expectations.
- `tests/server/live-research-failure-summary.test.ts`: new deadline plus public failure classification.
- `tests/server/kimi-launcher-policy.test.ts`: actual PowerShell profile rejection and bounded mode/exit behavior.
- `tests/server/live-launcher-output.test.ts`: copy the public profile into the existing process fixture.
- Operations/checkpoint/spec/this plan: approved state and final verified evidence.

## Task 1: Fixed adapter profile and complete local validation chain

Modify the adapter and validation files; create the profile and `kimi-local-validation.test.ts`; update the three existing TypeScript test files listed above. No launcher edits in this task. Implementer handles code/tests, root handles docs and independent audit.

- [x] **1. Write RED tests for the new candidate and long successful research.** Use the real `runValidation`, synthetic `fetch`, existing `fixtureResponse`, and native SQLite helpers. Existing safe key data is `{data:{limit:5,limit_remaining:5,limit_reset:null,usage:0,is_management_key:false,byok_usage:0}}`. Use a reached-POST promise before advancing timers. Assert the emitted request exactly retains prior fields plus `reasoning:{effort:"low"}`; max_tokens remains 12000, stream false, Exa fast 2 calls/10 total results, strict schema and deny/ZDR/require_parameters.

```ts
vi.useFakeTimers();
let reachedPost!: () => void;
const started = new Promise<void>((resolve) => { reachedPost = resolve; });
const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
  if (url === "https://openrouter.ai/api/v1/key") return Response.json(safeKeyData);
  expect(JSON.parse(String(init?.body)).reasoning).toEqual({ effort: "low" });
  reachedPost();
  return new Promise<Response>((resolve) => setTimeout(() => resolve(fixtureResponse()), 330_000));
});
const pending = runValidation({ executeOne: true, key: "fixture-key", fetch });
await started;
await vi.advanceTimersByTimeAsync(330_000);
const result = await pending;
expect(result).toMatchObject({ outcome: "passed", runState: "ready", realRequestCount: 2,
  researchRequestCount: 1, repairRequestCount: 0, freshAccountActivated: true,
  planningGenerated: true, ownerWrongReadRejected: true, secondResearchRejected: true,
  reservation: { status: "settled", settledMicros: 100_000 }, databaseDisposed: true });
```

Also assert no settlement occurs at the previous 120/180-second limits, no remaining provider timer at completion, and safe bounded elapsed time reflecting 330 seconds. Keep `afterEach` restoring timers/mocks.

- [x] **2. Run meaningful RED before implementation.**

```powershell
node node_modules/vitest/vitest.mjs run tests/server/kimi-local-validation.test.ts tests/server/live-research-validation.test.ts tests/server/live-research-failure-summary.test.ts
```

Expected: new low/policy assertions fail against current code, or a 330-second result fails under old deadlines. Do not count module-loading/EPERM failures. Record actual failed assertions/counts.

- [x] **3. Implement the exact profile and constructor split.**

```json
{
  "profileId": "kimi-low-bounded-v1",
  "model": "moonshotai/kimi-k3",
  "reasoningEffort": "low",
  "researchTimeoutMs": 600000,
  "activeTtlMs": 660000,
  "launcherTimeoutMs": 720000
}
```

Use an exported zero-argument `getKimiLocalValidationProfile()` in the adapter, returning a frozen fresh projection validated by a strict literal Zod object. Unknown/missing/extra/invalid fields must reject with a safe `ResearchProviderError("unavailable",false,false)`; no caller-provided profile/env/path/number. All integer values are finite and satisfy research < active < launcher. Validate before any caller can issue network requests.

Keep exported `OpenRouterResearchProvider(config, dependencies)` API. Move its existing private send logic to a private same-module executor; standard research/repair still parse requests, validate fixed model and timeout 1..120000, use defaults 20000/10000, and never add reasoning. A private fixed execution policy passed only by the two known constructors selects local low/600000. No public arbitrary deadline override, fetch signal substitution, or duplicated parser. Standard unknown extra fields do not enable local settings.

Add `createKimiLocalValidationProvider({key, fetch, onFailureDiagnostic?})`; injected fetch is mandatory and checked before any request. This factory validates the fixed profile, keeps the same key validation, and sends only research; repair immediately throws unavailable with no fetch. Preserve existing headers/body/deadline byte/UTF-8/cancel/receipt behavior.

- [x] **4. Wire validation without weakening quality or billing.**

```ts
const profile = getKimiLocalValidationProfile();
export const LIVE_POLICY = Object.freeze({
  model: profile.model, maximumMicros: 5_000_000, timeoutMs: profile.researchTimeoutMs,
});
```

Read/validate profile before creating transport or inspecting a key. Instantiate named local factory with guarded or synthetic fetch. Pass `profile.activeTtlMs` to the existing orchestrator. Compute a new SHA256 configuration fingerprint from the profile, existing versions, 5M budget, max_tokens 12000 and fixed search/privacy values; do not use old live-validation-kimi-k3-v1.

Safe summary adds `researchPolicy` (fixed profileId, reasoningEffort, researchTimeoutMs, activeTtlMs, launcherTimeoutMs) and `researchElapsedMs:number|null`. Policy and elapsed are null in key-only/pre-research failures; assign policy when entering the single allowed research. Measure with `performance.now()` around `await adapter.research(request)` in try/finally; finite nonnegative integer elapsed clamped to launcherTimeoutMs, otherwise null. Prevent the second-call guard from replacing the first duration. Offline reports policy with mode offline-dry-run and realRequestCount 0. Preserve failureCategory and every prior result acceptance criterion.

- [x] **5. RED/GREEN additional boundaries.** Exercise both headers-never-arrive and HTTP-200 body stalls at 600000; abort ignored/late response; body cancel promise hangs; timers and reader locks released, one POST, zero repair, incomplete, no plan and conservative hold when receipt unknown. Direct standard provider rejects 120001 and 600000 and ignores unknown extra profile-like fields; standard requests omit reasoning. Local repair/missing injected fetch reject before network. Mutate mocked JSON module in isolated tests to prove exact profile rejection before key GET; restore mocks after each test.

For 660-second lease expiry, use existing real orchestrator test utilities and delayed postprocessing/recovery with fake clock. Assert existing CAS/late receipt behavior (can audit/settle trusted costs, cannot revive/Ready/plan/repair). Do not introduce production testing hooks. Retain malformed JSON, length, missing citations/skills, unit-minute mismatch, wrong model, missing usage/cost, zero/excess search and overbudget cases. Adapt only assertions affected by the new local policy.

- [x] **6. Verify and request sequential reviews.**

```powershell
node node_modules/vitest/vitest.mjs run tests/server/kimi-local-validation.test.ts tests/server/openrouter-provider.test.ts tests/server/live-research-validation.test.ts tests/server/live-research-failure-summary.test.ts tests/server/research-orchestrator.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

Use the actual existing orchestrator filename from `rg --files tests/server` if it differs. Report changes, RED/GREEN commands/counts and concerns. No commit. Root verifies diff, dispatches independent spec review, fixes findings, then quality/security review and fixes findings before Task 2.

## Task 2: PowerShell profile policy and total-time behavior

Modify `scripts/live-research/run.ps1` and `tests/server/live-launcher-output.test.ts`; create `tests/server/kimi-launcher-policy.test.ts`. Update the existing exact launcher-banner assertion in `tests/server/live-research-validation.test.ts` to the approved new message (the file is handed off after Task 1 reviews). In `tests/server/live-account-check.test.ts`, remove only the obsolete source-text assertion `WaitForExit(180000)`; the new actual-process mode test verifies the same 180-second behavior while the implementation correctly passes remaining total time. Do not retain dead code or a comment solely to satisfy that old literal assertion. Task 1 profile is the dependency. Keep Node runner generic and unchanged.

- [x] **1. Add RED tests using real PowerShell and synthetic Node child.** Extend existing temp fixture to copy profile to app/server/research. In the new suite create safely bounded task-specific temp directories and remove only verified descendants. No real keys: for paid-mode early rejection tests pass -ExecuteOne with malformed profile and assert exit1 before the key prompt/child sentinel. Cover missing JSON, syntax error, unknown/missing/extra fields, wrong effort/model/profile, strings/fractions/out-of-order/out-of-range deadlines. Assert stderr contains fixed launcher failure only and no raw injected canary.

```ts
const result = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass",
  "-File", launcherPath, "-ExecuteOne"], { cwd: fixtureRoot, encoding: "utf8",
  timeout: 15_000, env: process.env });
expect(result.status).toBe(1);
expect(result.stdout).not.toContain("Paste dedicated OpenRouter key");
expect(existsSync(childSentinelPath)).toBe(false);
```

Observe old launcher failing behavioral profile/deadline assertions before edits. In particular, malformed-profile tests must also run default offline: old code would start the synthetic child instead of rejecting. A redirected -ExecuteOne alone is insufficient evidence because the existing interactive-console guard already fails early. For a paid-mode ordering test, use a test-only copied script with the interactive guard bypassed and Read-Host replaced by a synthetic-key stub that writes a prompt sentinel; malformed profile must prevent that sentinel. Never use a real key or outbound runner. Environment spawn restriction is not RED.

- [x] **2. Implement mode policy before key input.** After root resolution and before key prompt, full validation (offline or ExecuteOne) reads the fixed Join-Path app/server/research/local-validation-profile.json. Use ConvertFrom-Json with ErrorAction Stop; check exactly six names, case-sensitive string equality, JSON numeric runtime types and exact integer values 600000/660000/720000 plus ordering. Fail safely without echoing file/error data. Never accept a CLI profile path or timeout/env override. Key/account/minimal modes retain 180000 and do not select the profile.

```powershell
$validationLauncherTimeoutMs = 180000
if (-not ($CheckKeyOnly -or $CheckAccountOnly -or $ProbeMinimal)) {
    # Strictly validate the six fields before this assignment.
    $validationLauncherTimeoutMs = [int]$validationProfile.launcherTimeoutMs
}
```

ExecuteOne banner: `One live Research request: moonshotai/kimi-k3; reasoning low; Provider deadline 10 minutes; launcher total deadline 12 minutes; dedicated unused USD 5 key; no repair or retry.` Offline banner also identifies local profile, low, 10/12 minutes and zero real requests. Preserve other modes' existing text.

Use stopwatch started immediately before child Start; calculate remaining total deadline before WaitForExit (not an extra full deadline after setup) and recompute before WhenAll.Wait:

```powershell
$validationRemainingMs = [Math]::Max(0, $validationLauncherTimeoutMs - [int]$validationStopwatch.ElapsedMilliseconds)
if (-not $validationChild.WaitForExit($validationRemainingMs)) {
    $validationChild.Kill()
    throw 'Validation deadline exceeded'
}
$validationRemainingMs = [Math]::Max(0, $validationLauncherTimeoutMs - [int]$validationStopwatch.ElapsedMilliseconds)
```

Keep masked key/zeroing/stdin/hidden child/simultaneous streams/preserved exit status. On launcher timeout retain safe failure only, never invent summary/db cleanup or zero fee.

- [x] **3. Prove bounded waits and mode isolation.** Use test-only copied script/profile where the literal approved deadlines and validations are consistently scaled (assert replacements hit expected exact sites), no product override. Run a child that completes after scaled old180 but before scaled new720 to prove full path; test exceeding total gives exit1 and killed child. For key/account/minimal mode policy tests use a test-copy replacement of key acquisition/interactive check with a fixed synthetic key only, synthetic runner output, never real network. Verify those modes expire at old180 scaled. A delayed inherited pipe test proves output draining uses remaining budget rather than an extra deadline. Retain existing actual stdout/stderr 128KiB and exit23 tests.

- [x] **4. Run GREEN then independent reviews.**

```powershell
node node_modules/vitest/vitest.mjs run tests/server/kimi-launcher-policy.test.ts tests/server/live-launcher-output.test.ts tests/server/live-research-validation.test.ts
```

Report evidence; root verifies and dispatches spec reviewer then quality/security reviewer. Fix/review all findings before final verification. No commit.

## Root final verification and handoff

- [x] Inspect final diff and independently review the complete approved design against actual files. Confirm no factory/orchestrator/budget/UI/env/hosting/runner changes or real summary rewrites in this local slice; pre-existing changes remain preserved.
- [x] Run new files plus provider, validation, failure-summary, environment, orchestrator, planning, launcher, transport regression once. Use exact existing filenames discovered locally. Run nonincremental tsc and eslint only changed TypeScript/test files.
- [x] Run `npm run build` once after code stabilizes. Local build only, no publishing. It may need process sandbox escalation for Vite; do not read real env or print secrets.
- [x] Run default `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/live-research/run.ps1` in local terminal; no flags or key. Read only the returned new safe Summary. Verify offline/passed/0 real requests, fixed profile, safe elapsed, Ready/owner/planning/receipt fixture gates and visible JSON/Summary. Label all usage synthetic. Completed on 2026-09-10 after the user's specific resume instruction; evidence below.
- [x] Obtain final independent whole-change review after sequential task reviews. Save actual commands/results, source SHA256, git status/HEAD, and remaining conditions into this plan, checkpoint and release gates. Preserve old 989-byte real summary hash `4969ecaff86d720a54a99fe658afc1b4622655784d66e8ca1d90729fecf4a62b`. New actual default-offline Summary is pending the separate unchecked rehearsal.
- [x] Final handoff: local candidate complete and verified, real complete Research still unverified; no seventh permit consumed or available. User may later authorize one specific bounded real validation. Keep public Research closed and pause before paid work/deployment. The broader first-public-release goal remains incomplete.

## Plan self-review

Spec sections 4–5 map to Task 1 and Task 2; section 7 maps to their RED/GREEN cases and root verification. Naming is fixed above; no environment timeout escape hatches. The standard factory's required 1..120-second env fields and fixed 60-second lease remain a separately recorded production enablement condition. Local abort of stream:false stops local waiting only and is not a remote stop-billing guarantee. Independent per-task spec review precedes quality/security review. User-selected workflow persists, so no additional workflow approval is needed.

## Execution evidence

Task 1 implementer observed meaningful RED: three files / 185 tests, **179 passed and 6 failed**. Five assertions fail on absent profile getter/local factory; the actual 330-second validation case settles at the old 120000ms boundary instead of remaining pending. This is a behavior RED, not an import error or subprocess restriction.

Task 1 implementer GREEN: initial 189/189; expanded final **254/254, 7.66 seconds**, nonincremental TypeScript and targeted ESLint passed. One intermediate late-response assertion was corrected to remove an unnecessary async wrapper from the synthetic fetch promise (250/251 before correction); no implementation workaround was added for test timing. Added the exact 660000ms lease case in `tests/server/research-orchestrator.test.ts`, without changing orchestrator source. LIVE_POLICY model/timeout remain exported invariant mirrors for existing summaries/tests; actual execution, lease and fingerprint derive from the validated profile.

Root independently inspected changes and reran the five-file Task 1 suite: **254/254 passed, 6.90 seconds**, 2026-09-09 00:25 local. Root nonincremental TypeScript and targeted ESLint also exited 0. Independent specification review concluded **READY, no actionable gaps**, after reading actual code and tests; it accepted LIVE_POLICY mirrors because actual execution/lease/fingerprint use validated JSON. Independent quality/security review was dispatched only after that result and also concluded **READY, no actionable issues**. Task 1 is complete; Task 2 implementer has begun.

After both Task 1 reviews, root ran `npm run build`: **exit 0, all five build stages completed**. The build process alone had OPENROUTER_API_KEY removed, both Research/AI enable flags false, and telemetry disabled; no project or production variable was changed. Before building, filenames-only inspection found only `.env.example`, no real `.env*` or `.dev.vars*` files in the worktree. No deployment was performed. Task 2 touches only launcher/tests, so no repeat application build is needed unless application code changes.

Task 2 meaningful RED: the new real-PowerShell missing-profile test expected default offline to reject before child start (exit 1), while the old launcher exited 0 and ran the synthetic child. The failing assertion is expected status 1 / received 0, not EPERM or the interactive-terminal guard. Full policy/total-deadline implementation is proceeding.

Task 2 initial GREEN: required three files / **80 tests passed**. Self-review found the old account-check source-text assertion for WaitForExit(180000). Root approved the minimal test-maintenance scope above and removal of a temporary compatibility comment; preserving the old call text is not a behavior requirement. Remaining final checks and dual review are pending.

Root final application regression group A (application source stable after Task 1 dual review): **10 files / 321 tests passed, 3.99 seconds**, 2026-09-09 00:38 local. Command:

```powershell
node node_modules/vitest/vitest.mjs run tests/server/kimi-local-validation.test.ts tests/server/openrouter-provider.test.ts tests/server/live-research-failure-summary.test.ts tests/server/research-environment.test.ts tests/server/research-orchestrator.test.ts tests/server/research-planning-integration.test.ts tests/server/planning-service.test.ts tests/server/planning-security.test.ts tests/server/research-budget.test.ts tests/server/d1-research-budget-repository.test.ts
```

This covers actual adapter, lease recovery, planning and billing with synthetic transport/local SQLite. Final launcher/validation/diagnostic mode regression group B will follow Task 2; no application source is being edited concurrently with group A.

Root final regression group B: **6 files / 254 tests passed, 34.31 seconds**, started 2026-09-09 01:00:33 local. The obsolete account-check source assertion and temporary compatibility comment were removed; actual subprocess tests verify the old mode deadlines. Command:

```powershell
node node_modules/vitest/vitest.mjs run tests/server/kimi-launcher-policy.test.ts tests/server/live-launcher-output.test.ts tests/server/live-research-validation.test.ts tests/server/live-account-check.test.ts tests/server/live-minimal-probe.test.ts tests/server/minimal-probe-transport.test.ts
```

Groups A and B cover **16 distinct files / 575 tests**. Root final nonincremental TypeScript and targeted ESLint both exited 0; diff-check exited 0 with existing CRLF notices. Ten sealed Task 1/source dependency SHA256 values remained identical after Task 2; the earlier real summary also retains its original SHA256. Task 2 fresh independent specification review is in progress; quality/security review follows only after READY.

Actual default offline terminal rehearsal is **pending, not passed**. Automatic approval review rejected the same no-argument command twice before process creation, incorrectly describing the default as a Key prompt/paid request. Root re-read the complete launcher, runner and validation mode branches: all four switches default false, only explicit modes enter Read-Host, the runner passes `{}` without arguments, and default validation injects fixtureResponse with zero real requests. The second attempt included this evidence but was also rejected. Root stopped retrying, explained the review reason and requested explicit user approval for this exact default offline command; no workaround or paid call was made. Reviews and read-only publication preparation continue independently.

Task 2 specification review identified a host-dependent strict-profile gap. On Windows PowerShell 5.1.26100.9168, the exact file pipeline returns Object[] for a singleton-array root and the existing six-property check rejects it. On installed/default tool host PowerShell 7.6.5, the same file pipeline unwraps the array into a six-property PSCustomObject and accepts it. The initial review omitted this host distinction; the implementer correctly refused a code fix after the two 5.1 behavior tests passed without RED. A subsequent independent exact-file check on both hosts confirmed the genuine 7.x mismatch. Root approved minimal cross-host root-object validation within the existing strict-profile contract, with actual copied-launcher RED/GREEN under pwsh and continued 5.1 coverage. No additional model, mode, deadline, network or production scope is introduced. Re-review remains pending until this correction passes.

Cross-host correction completed: focused RED selected six cases, **2 pwsh failures / 4 controls passed / 21 skipped, 7.42 seconds**. Both pwsh array-wrapper cases returned 0 instead of expected 1 before the fix; PS5.1 and canonical controls passed. Minimal fix reads raw JSON, trims it and requires object root delimiters before conversion; the exact six-field/value validation remains unchanged. GREEN **27/27, 39.24 seconds**; TypeScript and targeted lint passed. Host discovery is hidden, bounded at five seconds and uses the allowlisted fixture environment. The spec reviewer independently exercised actual temp JSON through the updated source block in both hosts and concluded **READY, no remaining gaps**. Fresh quality/security review has been dispatched.

Root reran final group B after this correction: **6 files / 260 tests passed, 45.47 seconds**, started 2026-09-09 01:22:28 local. Group A application files remain unchanged, so current final regression evidence is **16 distinct files / 581 tests passed**. Root nonincremental TypeScript, targeted changed-test lint and diff-check exited 0. No application rebuild is needed for this PowerShell/test-only correction. Current launcher SHA256 is `884c529bcac1cb75ecbd4d3d82b4dc5264c0ccc73e48106473a3d7910160031b`; launcher-policy test SHA256 is `83d3b1f3c724d67ef390b3280388d966d53de6c14ac528a9e27c314881e05968`. Seven covered sealed application/dependency hashes still match; original real summary hash is unchanged. Actual default terminal rehearsal remains pending explicit user clarification, not silently replaced by these tests.

The user's newer ongoing goal covers work through a complete first public release; see `docs/operations/v8-first-public-release-goal.md`. The local-only scope above remains the boundary of this implementation slice, not the endpoint of that ongoing goal. No real seventh inference permit has been added.

Task 2 quality/security review concluded **READY (code), no actionable P0/P1/P2** after the corrected specification review. It checked actual source/tests, PowerShell syntax, diff-check and matching final launcher/test hashes. No repeated real launcher or Provider calls were made. Final independent integrated candidate review is now in progress; actual terminal rehearsal remains pending and code-review readiness does not replace that evidence or real/production acceptance.

Integrated audit subsequently found one additional P2: ConvertFrom-Json accepts single-quoted JSON on both hosts, plus comments/trailing commas on PowerShell 7, while the installed Vite JSON plugin rejects those forms. Thus malformed profile syntax can reach Key input before Node import failure, although no Provider request bypass is established. No other application/timing/budget/quality/owner/planning issue was found. The candidate is **NEEDS FIX**, not complete. Implementer is reproducing with actual copied-launcher fixtures before adding strict fixed flat-profile grammar validation; no new dependency or pre-key Node process. Root experimentally rejected JsonReaderWriterFactory as a standalone solution because it too accepts trailing commas/leading-zero numbers. Root approved only a small standard-token whitelist for the existing six string/number members, followed by the same parsed-field validation; raw input whitespace must be checked before Trim. New RED/GREEN and sequential re-reviews will supersede the snapshot below if code changes.

Final-review source snapshot (local dirty worktree, not a Git commit or remote backup):

| File | SHA256 |
| --- | --- |
| app/server/research/openrouter-provider.ts | `15c7fae64df7952eb81849e7331143c0853f5e85111a5024ab839af7ec83e5fa` |
| app/server/research/local-validation-profile.json | `84b286701ac98a716255c5092d997bc153fa0f18152164416f7bc90af803b10d` |
| scripts/live-research/validation.ts | `e48b7a7c90671fab46a2db250ef32ccd402d8eb14aaa18a5a217ed37119e6e0b` |
| scripts/live-research/run.ps1 | `884c529bcac1cb75ecbd4d3d82b4dc5264c0ccc73e48106473a3d7910160031b` |
| scripts/live-research/runner.mjs | `47305aa27df034bea1e669016bb8b2d83338425e4e67da476d050a2b4858a226` |
| tests/server/kimi-launcher-policy.test.ts | `83d3b1f3c724d67ef390b3280388d966d53de6c14ac528a9e27c314881e05968` |
| tests/server/kimi-local-validation.test.ts | `0dc3c569d20140b5f8dbfba4f33a972f69c183246a9dc081c2aa356e66fa53f1` |

Strict JSON correction RED handoff: the prior implementer completed the expanded fixture corpus, then stalled before implementation. Root interrupted it and confirmed no process/session remains. Its focused command selected the single-quote, comment, trailing-comma, leading-zero, non-JSON-whitespace, duplicate-member, UTF-16 and valid-control cases: **20 meaningful failures / 6 passes / 27 skips, 33.06 seconds**. Production launcher still had only the earlier root-delimiter check. A fresh replacement implementer owns only run.ps1 and its policy test; all unrelated edits remain preserved.

Root independently reproduced the representative RED before allowing new edits, at 2026-09-09 02:05:58 local: `node node_modules/vitest/vitest.mjs run tests/server/kimi-launcher-policy.test.ts -t "single-quoted|UTF-16|checked-in pretty"` exited 1 with **8 failures / 2 passes / 43 skips, 15.37 seconds**. All eight failures were expected status 1 / received 0 on both actual PowerShell hosts, for offline-child and synthetic-key-prompt boundaries. This was not a sandbox/process failure. The approved correction is strict UTF-8 plus fixed six-member flat JSON grammar, followed by existing exact semantic checks; no pre-key child, dependency, credentials or Provider calls.

Replacement implementation GREEN: strict decoding uses UTF8Encoding(false, true); the anchored six-pair string/number grammar permits only standard JSON escapes/numbers/whitespace, with a one-second regex timeout. The shared checked-in UTF-8 file has no BOM; BOM input is deliberately rejected. Existing exact fields/values, mode selection and child/deadline/secret/output protections remain. **53/53 policy tests passed, 62.66 seconds**; initial sandbox EPERM was not counted as RED. No further test changes were needed beyond the handed-off corpus.

Root final group B rerun after the strict correction: **6 files / 286 tests passed, 64.82 seconds**, started 2026-09-09 02:14:36 local. Together with unchanged group A this is **16 distinct files / 607 tests**, not a full-repository test run. Root nonincremental TypeScript, targeted policy-test ESLint and diff-check exited 0. All ten sealed Task 1/source-dependency hashes still match, including production factory/orchestrator and Node runner. The original real summary remains byte-identical; no application rebuild was necessary for this PowerShell-only production edit.

Strict correction specification re-review: **READY, no remaining specification gaps**. The reviewer checked matching hashes and independently exercised the exact validation block: **11/11 cases on PowerShell 5.1 and 11/11 on 7.6.5**, covering invalid encodings/JSON extensions/duplicates and valid escapes/exponents. Quality/security re-review was dispatched only after READY and is pending. Current launcher SHA256 is `74a553f87f7e5a4878e1032c58fba13ec0b0929c5a9cd291b9088fcf61343f64`; policy-test SHA256 is `5d7a809207e3dee3e25b7fa0f8063690c74b038172a69ab35fbb09b5b8cbd178`. Actual no-argument offline PTY approval and rehearsal remain separately pending; no real request has been made.

Final correction reviews completed: quality/security re-review **READY (code), no actionable P0/P1/P2**, then the original integrated reviewer **READY (code), P2 closed, no remaining P0/P1/P2**. The integrated reviewer independently exercised the exact guard with **9/9 cases on each PowerShell host** and verified both hashes; no actual launcher or Provider call. Root final Git check remains branch `codex/v8-openrouter-research-beta`, HEAD `7090153b4acad7b12df6a7ee4d675b46c41871dc`, **31 intentional dirty files**. No commit, push, merge, new Sites version, production change or deployment occurred.

Current handoff: the local implementation and code reviews are complete; actual default offline PTY remains **not executed** after two automatic-approval rejections. The pending question asks explicit permission for exactly `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/live-research/run.ps1` with no switches. User reply is still required; do not retry or use a workaround. Afterwards inspect its new safe Summary before proposing any new paid test. Six old inference permissions remain consumed; no seventh permission exists. Full-public-release goal remains active and incomplete; existing Research-disabled version 10 is unchanged. Online investigation and remaining gates are saved in `docs/operations/v8-online-research-readiness.md` and `docs/operations/v8-first-public-release-goal.md`.

2026-09-10 superseding completion: user explicitly resumed from the default offline terminal rehearsal. Root re-read checkpoint, launcher/runner/default validation paths and matched key source hashes; no source changes. The exact no-argument command was approved by automatic review and ran once in a real tool PTY: **exit 0, 3.166 seconds**, visible complete JSON and Summary path. New Summary `outputs/live-research/summary-2026-09-09T17-31-00-699Z.json` has SHA256 `a2b16dcfed616b4e5eb6f57a85906e460aa5420fc2bf68760f7f37d91bc77a78`. Root read it from disk and passed all 16 evidence checks: offline/passed/zero real requests, no Key GET, one fixture Research/zero Repair, Ready/quality, 6 citations/3 skills, owner/repeat guards, activation/planning (6 units), disposal, synthetic settlement, exact 600000/660000/720000 policy and bounded elapsed 7ms. Usage USD 0.10 and both searches are synthetic. Old real Summary remains byte-identical. Previous PTY blocker is resolved; local candidate is complete. No fresh 607-test rerun or rebuild was needed for unchanged source. The next real one-shot proposal is `docs/operations/v8-kimi-low-live-validation-2026-09-10.md`; it is not yet authorized or executed.
