# Bounded Authentication Diagnostic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Obtain an actionable, secret-free observation of the shadow site's real Google login failure without changing authentication policy.

**Architecture:** A pure formatter extends the existing Better Auth logger only for its exact empty-message exception call. A separate local collector privately frames Wrangler JSON and emits a fixed allowlisted projection. Root deploys the reviewed artifact only to the existing shadow Worker and observes one operator login.

**Tech Stack:** TypeScript, Better Auth 1.6.24 / core 1.6.25, Vitest, Node ESM, Wrangler 4.92.0, Cloudflare Workers.

---

## Authority and working directory

User approved the design on 2026-10-05 and already selected subagent-driven TDD with independent SPEC then distinct QUALITY/security review. Reuse `codex/v8-cloudflare-migration`, starting at `dc77e42c42b20f5b4546633e7403c64747a59f12`, in `C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-cloudflare-migration`. Root owns documentation, commits, deployment and browser observation. Implementation agents do not commit or operate cloud accounts. Do not touch the dirty research worktree except root recovery notes.

Approved spec: `docs/superpowers/specs/2026-10-05-auth-upstream-error-diagnostic-design.md`. No real key reads, paid Provider calls, source Sites/data/DNS edits, Research flag changes, master merge or credential rotation. The Google callbacks have been checked; secret pairing remains unknown. Shadow login failure was reproduced. Passing synthetic tests is not real login acceptance.

## File responsibilities

- `app/server/auth/diagnostics.ts`: pure fixed-format diagnostic string.
- `app/server/auth/runtime.ts`: existing logger integration only.
- `tests/server/auth-diagnostics.test.ts`: hostile input and exact grammar contracts.
- `tests/server/auth-oauth-diagnostics.test.ts`: real callback/logger with synthetic token endpoint.
- `scripts/cloudflare-migration/auth-tail-format.mjs`: bounded JSON object framing and safe projection.
- `scripts/cloudflare-migration/auth-tail.mjs`: exact child launch, private streams, deadline and cleanup; CLI entry guarded from import.
- `tests/scripts/auth-tail.test.mjs`: Node tests for framing/projection and injected fake-child lifecycle, no actual cloud connection.
- `docs/operations/cloudflare-auth-diagnostic-2026-10-05.md`: commands, gates, deployment and observed result, explicitly unknown until measured.
- Ignored evidence: `outputs/cloudflare-migration-20261005/auth-diagnostic/` (only bounded results, synthetic test output, hashes and safe metadata).

### Task 1: Formatter and genuine callback contract

- [x] Read existing runtime logger, `tests/server/auth-runtime.test.ts`, unchanged `tests/helpers/auth-migration-fixture.ts` and `auth-migration-oauth.ts`, and installed callback/token-exchange catch. No shared helper edits or library monkeypatches.
- [x] Add the real callback test first. For each 401/400 case create the fixture, snapshot `preservedRows(f)` plus full accounts, start real Google state, stub only exact `https://oauth2.googleapis.com/token`, then call the real handler. Use synthetic code and secrets from the fixture. Core assertion:

```ts
const output = vi.spyOn(console, "error").mockImplementation(() => {});
const f = await harness.fixture();
const before = preservedRows(f);
const beforeAccounts = rows(f, "accounts");
const { state, cookie } = await startSocial(f, "google");
const tokenFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  expect(String(input)).toBe("https://oauth2.googleapis.com/token");
  expect(init?.method).toBe("POST");
  expect(init?.redirect).toBe("manual");
  return Response.json({ error: "invalid_client", error_description: "SENTINEL_PRIVATE" }, { status: 401 });
});
vi.stubGlobal("fetch", tokenFetch);
const response = await callback(f, "google", state, cookie, "code", "synthetic-diagnostic-code");
expect(response.status).toBe(302);
expect(new URL(response.headers.get("location")!, ORIGIN).searchParams.get("error")).toBe("invalid_code");
expect(rows(f, "verifications")).toHaveLength(0);
expect(rows(f, "sessions")).toHaveLength(0);
expect(preservedRows(f)).toEqual(before);
expect(rows(f, "accounts")).toEqual(beforeAccounts);
expect(tokenFetch).toHaveBeenCalledTimes(1);
expect(output.mock.calls).toEqual([["[Arc Auth] ERROR upstream_error=invalid_client http_status=401"]]);
```

Extend assertions to the actual locked fetch body (synthetic code, client ID/secret, redirect URI and PKCE verifier). Reject every other endpoint. For 400 use `invalid_grant`. Add transport throw and malformed/unknown response cases; preserve numeric status where the installed library supplies it. Inspect resulting safe marker rather than logging raw inputs. The original fixture denied-fetch remains unused.

- [x] Run `node node_modules/vitest/vitest.mjs run tests/server/auth-oauth-diagnostics.test.ts`; verify RED is the missing classified marker, not broken fixture or unexpected fetch representation. Save synthetic evidence.
- [x] Add pure formatter tests for every accepted code; status bounds 399/400/599/600/fraction/NaN/string; ineligible levels/messages/arg counts/null/arrays; own versus inherited properties; getters, nested causes, cycles, `toJSON`/`toString`, throwing descriptor proxy and revoked proxy. Forbidden sentinels never emitted and accessors never called.
- [x] Implement `formatAuthDiagnostic(level: string, message: unknown, args: readonly unknown[]): string`. Use the following algorithm, with exactly the approved allowlist:

```ts
const codes = new Set(["invalid_client", "invalid_grant", "invalid_request", "unauthorized_client", "unsupported_grant_type", "redirect_uri_mismatch", "access_denied", "temporarily_unavailable", "server_error"]);
export function formatAuthDiagnostic(level: string, message: unknown, args: readonly unknown[]): string {
  const marker = `[Arc Auth] ${level.toUpperCase()}`;
  if (level !== "error" || message !== "" || args.length !== 1) return marker;
  try {
    const value = args[0];
    if (!value || typeof value !== "object" || Array.isArray(value)) return marker;
    const error = Object.getOwnPropertyDescriptor(value, "error");
    const status = Object.getOwnPropertyDescriptor(value, "status");
    const code = error && "value" in error ? error.value : undefined;
    const http = status && "value" in status ? status.value : undefined;
    let result = marker;
    if (typeof code === "string" && codes.has(code)) result += ` upstream_error=${code}`;
    if (typeof http === "number" && Number.isInteger(http) && http >= 400 && http <= 599) result += ` http_status=${http}`;
    return result;
  } catch { return marker; }
}
```

Integrate the import and replace only the logger callback, retaining the current console severity branches:

```ts
log: (level, message, ...args) => {
  const marker = formatAuthDiagnostic(level, message, args);
  if (level === "error") console.error(marker);
  else if (level === "warn") console.warn(marker);
  else console.log(marker);
}
```

Do not change provider options or authentication response.

- [x] Run the two new files plus `tests/server/auth-runtime.test.ts`, `auth-policy.test.ts`, `auth-migration-oauth-state.test.ts`, `auth-migration-link-callback.test.ts`; typecheck with `node node_modules/typescript/bin/tsc --noEmit --incremental false`; focused ESLint. Fix implementation or evidence-driven fixture mismatch, not weakened expectations.
- [x] Self-review; fresh SPEC reviewer reads source/spec/tests; after approval a distinct QUALITY/security reviewer checks confidentiality, real callback seam and scope. Fix and re-review findings. Root commits only these four implementation files and reviewed tests after gates pass.

Task 1 completed at 1a465ee7fecf3c3e9e4daf75146469565437d9d1: 97 tests / 6 files, typecheck/lint passed; independent SPEC PASS then distinct QUALITY/security READY. Historical stale typecheck/lint files preserved and fresh successful receipts corrected. Task 2 completed at bddd676be1d532c1164263f801603ede02225daf with 56 tests, SPEC re-review PASS then distinct QUALITY/security READY after Q1 fix; no deployment yet.

### Task 2: Bounded private Wrangler collector

- [x] Add Node tests first for `createAuthTailFramer(onEvent)` returning `{ push(text), end() }` and `projectAuthTailEvent(event)` returning a safe record or null. Test the minimum event below split at every boundary, pretty printed, with escaped quotes/braces, multiple adjacent objects, and sensitive fields outside `logs`:

```js
const event = { eventTimestamp: 1791165971000, outcome: "ok", logs: [{ message: ["[Arc Auth] ERROR upstream_error=invalid_client http_status=401"] }], event: { request: { url: "https://example.invalid/?code=PRIVATE_SENTINEL" } }, exceptions: [{ message: "PRIVATE_SENTINEL" }] };
assert.deepEqual(projectAuthTailEvent(event), { timestamp: new Date(1791165971000).toISOString(), outcome: "ok", messages: ["[Arc Auth] ERROR upstream_error=invalid_client http_status=401"] });
```

Timestamp accepts only valid safe integer milliseconds in the supported date range; output canonical ISO. Allow native outcomes `ok`, `exception`, `exceededCpu`, `exceededMemory`, `canceled`, `unknown` after comparing the locked CLI source; do not invent successful outcome for unknown input. Ignore invalid event projection. Emit only exact full-string markers, never substrings or marker-bearing objects. Other fields are never projected.

- [x] Run `node --test tests/scripts/auth-tail.test.mjs` and record RED. Implement a string/escape/bracket-depth state machine with bounded UTF-8 bytes per frame (256 KiB), only whitespace between top-level objects, JSON.parse only complete frames, and fixed errors `invalid-framing` / `frame-too-large` / `invalid-json`. Reset frame after emission; incomplete nonempty end is invalid. Tests must cover invalid prefixes/trailing data, nested/bracket errors, end mid-string, Unicode byte accounting and the size boundary.
- [x] Exact permitted diagnostic grammar, with anchored matching and actual end-of-string (reject trailing newlines):

```js
const code = "(?:invalid_client|invalid_grant|invalid_request|unauthorized_client|unsupported_grant_type|redirect_uri_mismatch|access_denied|temporarily_unavailable|server_error)";
const marker = new RegExp(`^\\[Arc Auth\\] ERROR(?: upstream_error=${code})?(?: http_status=[45][0-9]{2})?$`);
const permitted = (value) => typeof value === "string" && marker.test(value) && !/[\r\n]/.test(value);
```

Keep only permitted strings from native `logs[].message[]`; bounded frame already limits parsed input. Return `{timestamp, outcome, messages}` only, with no JSON copy or spread of the original object. Messages may be empty for a native CPU-failure event; that alone is not an OAuth category.

- [x] Add lifecycle tests before the wrapper: injected fake child yields arbitrary stderr, split stdout, emits error/close, and records kill. Inject time/abort handling to exercise timeout and operator stop without real waiting. Assert zero raw stream writes, shell false, windowsHide true, piped stdout/stderr, worker exact and all privacy env flags exact. Never spawn real Wrangler in tests.
- [x] Implement `collectAuthTail({spawnChild, emit, signal, timeoutMs})` with safe defaults, `timeoutMs` clamped/validated to 1..300000, and CLI entry calling it for at most 300000 ms. Only root-controlled test injection can replace spawn; CLI takes no worker/command override. Child launch:

```js
spawnChild(process.execPath, [lockedWranglerPath, "tail", "arc-v8-migration-shadow-20260922", "--format", "json", "--config", shadowConfigPath], {
  cwd: repositoryRoot,
  shell: false,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, WRANGLER_LOG: "error", WRANGLER_WRITE_LOGS: "false", WRANGLER_SEND_METRICS: "false", WRANGLER_SEND_ERROR_REPORTS: "false", CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false" }
});
```

Derive locked path, shadowConfigPath (dist/server/wrangler.json) and repositoryRoot from import.meta.url; no directory search or external binary resolution. Locked Wrangler tail logger.json directly prints JSON even at error level; error level suppresses unrelated startup messages. Do not apply that setting to deployment metadata logRaw, which it suppresses. Use UTF-8 decoding that retains split multibyte sequences. Drain stderr without output/storage. Emit safe projected records and fixed control codes only: `collector-started`, `collector-timeout`, `collector-stopped`, `child-failure`, plus fixed framing codes. No raw exception text. On all terminal paths kill child, clear deadline/listeners and settle once; no orphan process. CLI uses SIGINT/SIGTERM for operator stop and never retries. A child which exits before requested stop is failure even exit 0. Pending malformed/incomplete JSON remains a fixed failure.

- [x] Run Node tests, `node --check` on both modules and focused ESLint. Self-review and sequential fresh SPEC then distinct QUALITY/security reviews; root commits only approved modules/tests.

### Task 3: Reviewed build and release evidence

- [x] Run combined targeted regression, typecheck and focused lint once after final code; no unrelated broad suite unless findings justify it.
- [x] Build with process-only nonsecret settings:

```powershell
$env:ARC_CLOUDFLARE_TARGET='cloudflare.shadow.json'
$env:CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV='false'
node scripts/run-vinext.mjs build
node --experimental-strip-types scripts/check-cloudflare-build.mjs cloudflare.shadow.json
```

Expected: build and exact-target preflight exit 0. Record SHA256 for deployed dist files and relevant source; do not read or package real env files. Verify five required Secret names, four plain vars, isolated DB/R2/ASSETS and both AI flags false in generated config. No auth payload fixtures in dist.
- [x] Create `docs/operations/cloudflare-auth-diagnostic-2026-10-05.md` describing approved scope, commands above, collector exact command `node scripts/cloudflare-migration/auth-tail.mjs`, its permitted fields and inconclusive timeout semantics. Add actual test/build evidence; do not preclaim cloud success.
- [ ] Final independent integration reviewer examines all implementation, tests, collector, build metadata and operational sequence; fix issues with required regression/re-review. Root commit and authorized migration-branch backup; verify remote HEAD rather than assume push success.

### Task 4: Shadow-only deployment and one observed login

- [ ] Fresh native metadata check, restricted projection only: current version/rollback target, exactly five secret names/types, four known plain vars and isolated bindings. Follow existing secret-inheritance path documented in `docs/operations/cloudflare-auth-secret-inheritance-2026-10-04.md` and `cloudflare-shadow-auth-setup.md`. Unknown differences stop deployment for diagnosis.
- [ ] Deploy only reviewed `dist/server/wrangler.json` artifact with locked CLI, child log/metrics/reporting flags off and no raw credential output. Recheck hashes immediately before deployment. Preserve required Secrets through the reviewed path. Record resulting version and verify names/types/bindings, public pages and provider availability. Do not interpret configuration presence as working credentials.
- [ ] Run reviewed collector, then use Computer Use to open the shadow sign-in page for one Google attempt. Operator handles personal authentication if needed. Stop collector after the attempt (or 300 s maximum); do not repeat login automatically or collect raw URLs/HAR. Record only safe category/status/native outcome and verified logged-in UI where available.
- [ ] Interpret measured evidence: invalid_client => private pair check; invalid_grant => investigate code/redirect/PKCE; generic/missing/timeout => unknown, not network proof. Record next evidence-driven step. If no actionable observation, task remains incomplete.
- [ ] Update M operations note and W recovery documents with exact HEAD, gates, deployment and safe result; commit/backup only reviewed M paths. Goal remains active until the broader public Arc release actually passes.

## Plan self-review

Coverage: Task 1 covers exact logger invocation, own-data access, fallback and genuine callback invariants; Task 2 covers private multiline collection, bounds and cleanup; Task 3 covers tests/build/reviews; Task 4 covers metadata, restricted deployment and bounded observation. Source/account continuity, real Research and public cutover remain separate outstanding work. Function names and test commands above are the agreed interfaces; no new credential or public-auth policy is introduced.

### Collector termination clarification

The 300-second bound applies to receiving/projecting log data. At every terminal condition the collector destroys private stdout/stderr streams immediately. It requests same-user native SIGKILL and confirms child close before claiming cleanup. If the OS refuses termination (kill false/throw), emit fixed child-failure, retain private error guards, and wait for actual close; do not claim successful cleanup, detach an orphan, retry collection or start the login attempt. An OS-level kill refusal requires operator/controller intervention and can keep cleanup waiting beyond the collection deadline. Synthetic refusal-then-close tests must prove no subsequent input is projected. This is an explicit failure condition, not a guarantee that software can override OS process termination policy.