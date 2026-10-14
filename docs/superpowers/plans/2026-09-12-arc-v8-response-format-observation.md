# Arc v8 Response Format Observation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax. The user has already chosen this workflow; do not ask again.

**Goal:** Distinguish bounded response format hints after a local outer-JSON failure without changing acceptance, requests, billing, or production behavior.

**Architecture:** A pure classifier produces two fixed enums; transport v3 carries them only after the existing local JSON.parse failure. Legacy v1/v2 remain unchanged. Existing private Summary projection is reused and verified through the guarded transport and SQLite workflow.

**Tech Stack:** TypeScript, native Fetch/ReadableStream, Vitest, SQLite test database, PowerShell, existing Sites portable build.

---

Approved 2026-09-12 by user “批准”. Authoritative existing worktree is C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta, branch codex/v8-openrouter-research-beta, HEAD7090153b4acad7b12df6a7ee4d675b46c41871dc. Reuse it and preserve all uncommitted prior work. All130 handoff hashes matched before edits. Source snapshots and approval: outputs/local-response-format-20260912. No Git writes, new Provider requests, secrets/env reads, production data/configuration or Sites save/deploy. Earlier1529 tests/build/offline results are historical, not verification of this change.

## Task 1: Classifier, v3 transport projection, local adapter

Resumed 2026-09-12: Task1 and Task2 independent SPEC and QUALITY/security PASS. Root final45-file regression1632/1632, typecheck/lint/build/default offline passed. Final independent integration QUALITY PASS (LOCAL FINAL READY), final handoff prepared and verified. Evidence: outputs/local-response-format-20260912.

Files:
- Create app/server/research/response-format-diagnostic.ts.
- Modify app/server/research/transport-diagnostic.ts and openrouter-provider.ts.
- Create tests/server/research-response-format.test.ts and openrouter-response-format.test.ts.
- Modify tests/server/openrouter-transport-observation.test.ts, research-transport-diagnostic.test.ts and live-transport-diagnostics.test.ts only where local v3 expectations intentionally change; legacy v1/v2 assertions retain old behavior.

- [x] **1. RED: add four distinct 1100-byte cases against the existing adapter.** Use the existing injected Response/provider fixture pattern. Deny global fetch; one injected POST only. This assertion must fail because responseFormat is absent, not because an import is missing:

```ts
const bodies = [
  [" ".repeat(1100), "ascii-whitespace-only"],
  ["<html>".padEnd(1100, " "), "html-like"],
  ["data: {}".padEnd(1100, " "), "sse-like"],
  ['{"choices":'.padEnd(1100, " "), "json-container-like"],
] as const;
it.each(bodies)("classifies a completed malformed body %#", async (body, kind) => {
  const observed = vi.fn();
  const injected = vi.fn<typeof fetch>(async () => new Response(body));
  const provider = createKimiLocalValidationProvider({ key: "synthetic-format", fetch: injected,
    onTransportDiagnostic: observed });
  await expect(provider.research({ role: "Data Product Manager", locale: "en-US" }))
    .rejects.toMatchObject({ code: "invalid-transport", charged: "unknown" });
  expect(observed).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    version: "transport-diagnostic-v3", phase: "outer-json", receivedBytes: 1100,
    responseFormat: { contentType: "text", bodyPrefixKind: kind },
  }));
  expect(injected).toHaveBeenCalledOnce();
});
```

Run node node_modules/vitest/vitest.mjs run tests/server/openrouter-response-format.test.ts --reporter=json --outputFile=outputs/local-response-format-20260912/task1-red.json. Expected nonzero with assertion failure for absent v3/responseFormat; preserve the output. Windows sandbox spawn EPERM is an execution failure, not RED; rerun only the same offline command with scoped escalation if needed.

- [x] **2. Implement the pure classifier and strict nested projector.** Define the two enum unions and frozen ResponseFormatDiagnostic type in the new module. Concrete body classification:

```ts
export type ResponseFormatDiagnostic = Readonly<{
  contentType: "missing" | "json" | "html" | "sse" | "text" | "other" | "unavailable";
  bodyPrefixKind: "decoded-empty" | "ascii-whitespace-only" | "html-like" | "sse-like" | "json-container-like" | "other";
}>;
const asciiSpace = (code: number) => code === 9 || code === 10 || code === 13 || code === 32;
function bodyKind(text: string): ResponseFormatDiagnostic["bodyPrefixKind"] {
  if (text.length === 0) return "decoded-empty";
  let start = 0;
  while (start < text.length && asciiSpace(text.charCodeAt(start))) start++;
  if (start === text.length) return "ascii-whitespace-only";
  const prefix = text.slice(start, start + 64);
  if (/^(?:<!doctype html|<html)(?:[\t\n\r ]|>)/i.test(prefix)) return "html-like";
  if (/^(?:data:|event:|id:|retry:|:)/u.test(prefix)) return "sse-like";
  if (prefix[0] === "{" || prefix[0] === "[") return "json-container-like";
  return "other";
}
function contentTypeKind(value: string | null): ResponseFormatDiagnostic["contentType"] {
  if (value === null) return "missing";
  if (value.length > 512) return "other";
  const mime = value.split(";", 1)[0].replace(/^[\t ]+|[\t ]+$/gu, "")
    .replace(/[A-Z]/gu, (letter) => letter.toLowerCase());
  if (mime === "application/json" || /^application\/[!#$%&'*+.^_`|~0-9a-z-]+\+json$/u.test(mime)) return "json";
  if (mime === "text/html") return "html";
  if (mime === "text/event-stream") return "sse";
  if (mime === "text/plain") return "text";
  return "other";
}
export function buildResponseFormatDiagnostic(text: string, readContentType: () => string | null): ResponseFormatDiagnostic {
  let contentType: ResponseFormatDiagnostic["contentType"];
  try { contentType = contentTypeKind(readContentType()); } catch { contentType = "unavailable"; }
  return Object.freeze({ contentType, bodyPrefixKind: bodyKind(text) });
}
```

ASCII-only HTML case matching uses /i without /u to avoid Unicode case-fold surprises; tests for non-ASCII lookalikes reject them. MIME subtype grammar uses a nonempty HTTP token before +json; no whole-header serialization.

The nested projector must copy exactly the two own enumerable data properties, reject non-Object.prototype, symbols, extra keys/getters/invalid enums and trap failures, and return a new frozen pair. Use this exact inspection pattern and fixed allowed-value arrays from ResponseFormatDiagnostic:

```ts
function ownPlainData(input: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.getPrototypeOf(input) !== Object.prototype || Object.getOwnPropertySymbols(input).length) return null;
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Object.keys(descriptors).length !== keys.length) return null;
  const copy: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
    copy[key] = descriptor.value;
  }
  return copy;
}
```

Enclose reflection in the projector try/catch and return null on exceptions. Do not export raw prefix/header or add logging. Complete tests cover enum edges, MIME parameters/512 boundary, missing versus empty, header exceptions, HTML delimiters, case-sensitive SSE, JSON prefix, BOM handling in decoder, Unicode whitespace and VT/FF.

- [x] **3. Add v3 while retaining legacy projection.** Define ResearchTransportDiagnostic as common fields intersected with legacy {version:v1|v2} or {version:v3,responseFormat:ResponseFormatDiagnostic|null}; preserve existing flat legacy output. In projectTransportDiagnostic read version using ownData first; only v3 uses ownPlainData over the existing ten fields plus responseFormat. Select v2/v3 elapsed maximum1320000, then run all current field/phase constraints unchanged. For v3, require responseFormat null outside outer-json/invalid-json, allow null on that path for observer failure, otherwise call the strict nested projector. Return a fresh frozen object and reject v3 encoded JSON above2048 bytes. JSON.stringify must only see the projected safe object. Legacy v1/v2 continue to omit extra keys as they do now.

```ts
const isV3 = version === "transport-diagnostic-v3";
// Run this only after the common fields and strict v3 input are validated.
const format = isV3 ? ownData(value, "responseFormat") : null;
if (isV3 && !(phase === "outer-json" && reason === "invalid-json") && format !== null) return null;
const responseFormat = format === null ? null : projectResponseFormatDiagnostic(format);
if (format !== null && responseFormat === null) return null;
const common = { version, phase, reason, receivedBytes, bodyComplete, localCancellation,
  nativeErrorKind, headersElapsedMs, bodyEndElapsedMs, localCancellationElapsedMs };
const projected = Object.freeze({ ...common, ...(isV3 ? { responseFormat } : {}) });
if (isV3 && new TextEncoder().encode(JSON.stringify(projected)).byteLength > 2048) return null;
return projected;
```

- [x] **4. Insert observation after the existing parse catch only.** Keep request-building code, local profile, max tokens, standard/Repair policy and native transport untouched. No additional reader, parse, timer or cancellation. Local v3 failures earlier/later than outer-json carry null; standard observations remain v1.

```ts
const transportDiagnosticVersion = localProfile ? "transport-diagnostic-v3" : "transport-diagnostic-v1";
let responseFormat: ResponseFormatDiagnostic | null = null;
// In the existing JSON.parse catch, before throwing the same error:
failAt("outer-json", "invalid-json");
if (localProfile && observeTransport) {
  try { responseFormat = buildResponseFormatDiagnostic(text, () => response.headers.get("content-type")); }
  catch { responseFormat = null; }
}
throw new ResearchProviderError("invalid-transport", false, "unknown");
// In publish input, add exactly:
...(transportDiagnosticVersion === "transport-diagnostic-v3" ? { responseFormat } : {})
```

- [x] **5. GREEN and compatibility.** Run the two new test files plus research-transport-diagnostic, openrouter-transport-observation and live-transport-diagnostics. Retain original v1/v2 tests; change local version/key expectations to v3. The existing live test injecting unknown observer properties now expects null (v3 rejects extras), while dedicated legacy tests retain omission behavior. Test valid Unicode JSON in byte chunks, valid JSON error, observer throw/reject/never-settle, classifier throw and unchanged cleanup/error; no global network.
- [x] **6. Task1 independent SPEC then QUALITY/security.** Review the diff against before snapshots, not HEAD alone. Fix concrete findings with RED/GREEN and rereview. Do not commit. Record tests, command exit codes and hashes in the task evidence directory.

## Task 2: Guarded Summary and durable behavior verification

Files: create tests/server/live-response-format.test.ts; modify tests/server/live-transport-diagnostics.test.ts for additional v3 integration coverage. scripts/live-research/validation.ts needs no change if its existing projectTransportDiagnostic callback correctly handles the new union; reuse that boundary rather than duplicate projection. Any demonstrated needed modification must be limited to that callback/type and preceded by RED.

- [x] **1. Check the existing callback and add end-to-end assertions.** Actual runValidation with injected key GET/Research POST and isolated SQLite must retain failure/unknown reservation behavior. A pre-change checkpoint from Task1 RED already proves field absence; integration tests may be green immediately if unchanged generic projection handles v3. Record that fact honestly, not as a new RED.

```ts
const result = await runValidation({ executeOne: true, key: "synthetic-format", fetch: injected });
expect(result).toMatchObject({ outcome: "incomplete", runState: "failed", researchRequestCount: 1,
  repairRequestCount: 0, researchTransportDiagnostic: { version: "transport-diagnostic-v3",
    responseFormat: { contentType: "html", bodyPrefixKind: "json-container-like" } },
  reservation: { status: "conservative-hold", maximumMicros: 5_000_000, settledMicros: 0 },
  ownerWrongReadRejected: true, secondResearchRejected: true, databaseDisposed: true,
  freshAccountActivated: false, planningGenerated: false });
expect(result.researchAttemptDiagnostic).toMatchObject({ charged: "unknown", errorCode: "invalid-transport" });
expect(JSON.stringify(result)).not.toContain("CANARY-private");
```

- [x] **2. Cover strict re-projection and noninterference.** Inject getter/symbol/extra nested values via mocked projector at the observation boundary; retain null and unchanged original business state. Compare normalized durable SQLite rows, attempt/usage/quota/budget/public outcome for baseline observation, observer suppressed, thrown/rejected/pending callback equivalents, including cleanup. Use existing createTestDatabase/fixture patterns; do not add product hooks solely for tests. Verify successful fixture still passes/activates/plans and default offline invokes no real fetch/env/Key path.
- [x] **3. Verify request byte identity.** Capture injected POST body with observer enabled/disabled for local, standard and Repair. Compare to before-source module or prior immutable recorded body fingerprints; do not derive both expected/actual from the new implementation. Preserve low32768/10search50/USD5/20–21–22 and standard body hashes. No response-format words belong in prompts or production factory.
- [x] **4. Run targeted integration files, full nonincremental tsc, targeted lint.** Commands: node node_modules/vitest/vitest.mjs run tests/server/live-response-format.test.ts tests/server/live-transport-diagnostics.test.ts tests/server/openrouter-response-format.test.ts tests/server/research-response-format.test.ts --reporter=json --outputFile=outputs/local-response-format-20260912/task2-green.json; node node_modules/typescript/bin/tsc --noEmit --incremental false; node node_modules/eslint/bin/eslint.js followed by exact changed TS files. Expected exits0; preserve failures and fix before review.
- [x] **5. Task2 independent SPEC then QUALITY/security.** Verify no new real requests, configuration, DB schema or public fields. Fix findings, preserve exact scope and do not commit.

## Task 3: Root gates and handoff

- [x] Derive the relevant regression list from transport/provider/local Summary/orchestrator/security dependencies plus new tests; reuse historical exact42-suite list where relevant and add the three new files. Execute once with a JSON report, check actual suite paths, counts and zero failed/skipped. Do not claim old1529 results for this candidate.
- [x] Run nonincremental tsc and changed-file lint on the final candidate; no tests after-only feature claims.
- [x] Run node C:/Users/XF/.codex/plugins/cache/openai-curated-remote/sites/0.1.62/scripts/configure-execution-profile.mjs, then in a separate command node C:/Users/XF/.codex/plugins/cache/openai-curated-remote/sites/0.1.62/scripts/build-site.mjs. Verify successful exit and Worker/assets/hosting/migrations. No dependency installation unless actually needed; no save/deploy.
- [x] Run default PowerShell offline command once: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/live-research/run.ps1, with no paid/probe switches. Require exit0 and new safe Summary offline/passed/zero real/Ready/activation/plan/owner isolation/second rejection/disposal; this is synthetic only.
- [x] Independent final integration review of exact candidate, task reviews, relevant tests/build/offline artifacts and protected hashes. Record results and only then report local completion.
- [x] Update recovery/status/operations with approval consumed as design approval only; no16 permission. Freeze a new final candidate and handoff manifest, preserving old109 as baseline with explicit allowed changes. Complete full public-release goal only after its separate real/online conditions are proven; this plan does not do so.

Root plan self-review: approved classification/privacy/version/lifecycle requirements map to Task1; actual Summary, request identity and durable state to Task2; regression/build/offline/review/handoff to Task3. Code snippets use the same names and existing helper conventions. The dirty existing worktree and no-Git/no-paid constraints override generic skill commit/new-worktree prompts. Implementation choices that preserve this approved design need no extra user confirmation.

Root regression follow-up: initial45-file run1631passed/1failed because tests/server/live-output-budget.test.ts still required localv2. Isolated RED and two-line test-only correction to v3 plus responseFormat:null are preserved in root-regression-task1-*; deadline, charged-unknown, budget, abort and zero-timer assertions unchanged. Independent delta SPEC PASS; final integration QUALITY also PASS for this correction. Corrected final45-file run1632passed,0failed/pending/skipped. Legacy v1/v2 matrix unchanged.
