# Arc v8 Transport Observation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bounded local transport-failure diagnostics that distinguish response rejection, EOF/parse failure and application cancellation without changing Research acceptance, pricing or request behavior.

**Architecture:** A focused transport-diagnostic module projects finite metadata; the shared OpenRouter executor observes only an explicitly injected local callback. The Kimi validation runner projects one immutable failure snapshot and records its adapter start UTC. Existing guarded transport deliberately loses fetch causes; the new contract documents this rather than exposing raw errors across the boundary.

**Tech Stack:** TypeScript, Node24 built-in fetch/Response/ReadableStream, Zod4, Vitest4, existing temporary SQLite validation, Vinext/Cloudflare build.

---

用户已明确批准完整设计 `../specs/2026-09-11-arc-v8-transport-observation-design.md`。按用户既定子代理驱动/TDD/先规格后质量安全审查执行，不再询问执行方式；Sites技能默认限制子代理修改文件的规则由用户明确指定的子代理实施流程覆盖，Root独占Sites生命周期与最终构建。只使用现有权威linked worktree与依赖；不创建新工作树、不读取真实Key/env/原始正文、不发付费请求、不操作生产/Git暂存提交推送合并/Sites保存部署。技能默认commit步骤由本次边界替换为保存本地快照/哈希。

完整设计契约是每项验收依据，特别是phase/reason合法组合、EOF/字节跨字段约束、guard失因和实际取消API语义。不得为方便实现缩小契约或变更600/660/720、stream:false、12000 tokens、10/50、524288响应限额或USD5。

## File structure and baseline

- Create `app/server/research/transport-diagnostic.ts`: types, finite projection, safe one-level native error classification, bounded observation lifecycle helpers if needed. No network, global logging or content retention.
- Modify `app/server/research/openrouter-provider.ts`: optional Kimi observer, branch/byte/EOF/time/cancel observations; preserve current body, parsing, failure and cleanup behavior.
- Create `tests/server/research-transport-diagnostic.test.ts`: projection, enums, cross-fields, hostile input and no-secret boundaries.
- Create `tests/server/openrouter-transport-observation.test.ts`: injected Response/stream matrix and unchanged-result assertions.
- Modify `scripts/live-research/validation.ts`: two new safe Summary fields and explicit local observer.
- Create `tests/server/live-transport-diagnostics.test.ts`: actual guarded-transport + temporary SQLite integration, offline/null/UTC behavior.
- Root owns this plan, spec status, `docs/operations/v8-transport-observation-validation-2026-09-11.md`, checkpoint/goal/gates and ignored evidence in `outputs/local-transport-observation-20260911/`.
- Existing tests change only if a concrete new Summary field causes an exact shape/type expectation failure; implementation agent must report such a need before modifying files outside its assigned list.

Root baseline: branch codex/v8-openrouter-research-beta, HEAD7090153b4acad7b12df6a7ee4d675b46c41871dc; linked git-dir differs from common-dir and no superproject. Existing29 hashes matched before changes. Save full adapter/validation snapshots, keep original29 manifest immutable, freeze other27 files for the whole implementation. Task1 additionally freezes validation; Task2 begins only after Task1 double review.

## Task 1: Transport observation and unchanged cancellation semantics

**Files:** new transport-diagnostic.ts, modified openrouter-provider.ts, two new tests named above. No validation/guard/provider/request/config/schema edits.

- [x] **Step 1: Establish behavioral RED before creating the new module.** Add a node-environment test using the already callable Kimi factory. Passing an options variable permits the new optional callback to be ignored by the current implementation, so the test fails on missing observation, not import/type startup errors:

```ts
// @vitest-environment node
import { expect, it, vi } from "vitest";
import { createKimiLocalValidationProvider } from "../../app/server/research/openrouter-provider";

it("observes normal EOF followed by invalid JSON without initiating cancellation", async () => {
  const observed = vi.fn();
  const options = {
    key: "synthetic-transport-observation",
    fetch: vi.fn<typeof fetch>(async () => new Response('{"choices":', { status: 200 })),
    onTransportDiagnostic: observed,
  };
  await expect(createKimiLocalValidationProvider(options).research({ role: "Data Product Manager", locale: "en-US" }))
    .rejects.toMatchObject({ code: "invalid-transport", charged: "unknown" });
  expect(observed).toHaveBeenCalledOnce();
  expect(observed.mock.calls[0]?.[0]).toMatchObject({ version: "transport-diagnostic-v1",
    phase: "outer-json", reason: "invalid-json", bodyComplete: true,
    localCancellation: "none", localCancellationElapsedMs: null, nativeErrorKind: null });
});
```

- [x] **Step 2: Run RED and preserve the actual failure output.** `node node_modules/vitest/vitest.mjs run tests/server/openrouter-transport-observation.test.ts`. Expected assertion: observer called zero times instead of once. A sandbox spawn error is not RED; use the approved offline-process escalation mechanism if needed, never change sandbox protections or call Provider. Implementer reported the genuine zero-call assertion failure after the scoped offline spawn escalation; original invalid-transport/unknown assertion passed.
- [x] **Step 3: Implement the finite module and optional callback after RED.** Export `ResearchTransportDiagnostic`, `projectTransportDiagnostic(value: unknown): Readonly<ResearchTransportDiagnostic> | null`, and `classifyNativeTransportError(value: unknown)` using the approved exact field/enum contract. Kimi options and internal execution dependencies gain:

```ts
onTransportDiagnostic?: (diagnostic: Readonly<ResearchTransportDiagnostic>) => unknown;
```

Public standard Provider constructor stays unchanged. Producer timestamps use one monotonic start and bounded elapsed values; projection rejects invalid numbers/combinations, removes unknown fields, returns a fresh frozen flat object and never serializes raw errors. Native classification reads only own error and one cause level under guarded property access; codes outside the specified allowlist become other.
- [x] **Step 4: Instrument the existing branches, leaving exception mapping and business results intact.** First local failure wins. Record fetch/headers/body-read/utf8-chunk/utf8-flush/outer-json/outer-shape at their actual rejection points. Count returned bytes up to responseBytes+1; set bodyComplete only on done. Mark bodyEnd on first EOF/read failure/size or chunk rejection/body deadline. Record cancellation only at the actual abort/cancel call, not empty helpers. Normal-EOF parse failures keep no cancellation; incomplete-body refusal keeps existing cleanup. Deadline classification dominates its later cleanup; emit at most once after local cleanup attempts, and ignore late readBody settlements.

The notification boundary must isolate synchronous and asynchronous callback failure, using a projected snapshot and a caught Promise rather than awaiting it:

```ts
const safe = projectTransportDiagnostic(candidate);
if (safe && onTransportDiagnostic) {
  try { void Promise.resolve(onTransportDiagnostic(safe)).catch(() => undefined); }
  catch { /* Observation must not change the original failure. */ }
}
```

Here candidate is the already bounded local metadata, not a Response/Error/body. The producer marks publication before invoking the callback; successful or object-level semantic failures have no transport snapshot. The new outer-shape observation must happen at the same existing non-object rejection, without moving failure ordering for HTTP errors.
- [x] **Step 5: Expand RED/GREEN across the approved matrix.** Cover fetch failure/redirect; invalid, excessive or missing content-length/body; 524288/524289 boundary; UTF8 chunk/flush; invalid JSON, null/array/scalar; native fetch/reader errors and one-level cause; deadline before headers and during read using fake/short timers; late completion/callback failure. Assert exact original error code/charged metadata, one POST, request contract unchanged, actual cancellation order, EOF and timer relationships, safe projection/no canary leakage. Schema-valid and semantic-invalid payloads exercise existing result diagnostics and keep transport null.
- [x] **Step 6: Run affected tests and static checks.** `node node_modules/vitest/vitest.mjs run tests/server/research-transport-diagnostic.test.ts tests/server/openrouter-transport-observation.test.ts tests/server/openrouter-provider.test.ts tests/server/kimi-local-validation.test.ts tests/server/provider-result-diagnostic.test.ts tests/server/research-request-contract.test.ts tests/server/research-search-policy.test.ts`; `node node_modules/typescript/bin/tsc --noEmit --incremental false`; `node node_modules/eslint/bin/eslint.js app/server/research/transport-diagnostic.ts app/server/research/openrouter-provider.ts tests/server/research-transport-diagnostic.test.ts tests/server/openrouter-transport-observation.test.ts`. Preserve actual exits/counts; synthetic injected URLs never mean actual network calls.
- [x] **Step 7: Self-review and hand off.** Return DONE/concerns with exact files, RED/GREEN outputs, hashes, scope and actual unresolved concerns; do not commit. Root checks the frozen files, then dispatches independent SPEC and only after SPEC READY independent QUALITY/SAFETY. Fix findings through original implementer and re-review before Task2.

## Task 2: Safe Summary and actual guarded-path integration

**Files:** scripts/live-research/validation.ts and new tests/server/live-transport-diagnostics.test.ts. Task1 files frozen after reviews unless a real integration defect is reported and separately corrected.

- [x] **Step 1: Write a Summary behavioral RED.** Use `runValidation({executeOne:true,key:"synthetic-transport-observation",fetch})` with an injected fetch returning existing safeKeyData for the fixed GET and truncated HTTP200 JSON for the fixed POST. Reuse full safeKey fixture fields from existing live-result-diagnostics.test.ts. Assert:

```ts
expect(summary).toMatchObject({ outcome: "incomplete", reason: "research-failed",
  researchAttemptDiagnostic: { errorCode: "invalid-transport", charged: "unknown" },
  researchTransportDiagnostic: { phase: "outer-json", reason: "invalid-json", bodyComplete: true,
    localCancellation: "none" },
  reservation: { status: "conservative-hold", maximumMicros: 5_000_000, settledMicros: 0 },
  freshAccountActivated: false, planningGenerated: false, repairRequestCount: 0,
  ownerWrongReadRejected: true, secondResearchRejected: true, databaseDisposed: true });
expect(summary.researchStartedAt).toEqual(expect.any(String));
```

- [x] **Step 2: Run RED.** `node node_modules/vitest/vitest.mjs run tests/server/live-transport-diagnostics.test.ts`; expected missing Summary fields, not startup/import failure. Record before source edit.
- [x] **Step 3: Extend Summary type/defaults and observer.** Import Task1 type/projector. Add two fields to type and initialization:

```ts
researchTransportDiagnostic: Readonly<ResearchTransportDiagnostic> | null;
researchStartedAt: string | null;
```

Both initialize to null. Explicit fixed-Kimi callback projects the snapshot inside try/catch; it must not propagate failures or be able to alter accepted candidate/usage. Set `summary.researchStartedAt = new Date().toISOString()` immediately before the adapter call alongside performance.now; only a real-mode injected adapter invocation populates it. Default offline path, Key-only mode and pre-adapter failures keep null. Preserve one-invocation guard and existing researchElapsedMs policy.
- [x] **Step 4: GREEN and guarded boundaries.** Through actual createGuardedTransport, inject native fetch headers-timeout, generic fetch failure and redirect: expect fetch-error/other, headersElapsed null and unchanged original unavailable/error state. Then return HTTP200 with reader body-timeout: expect body-read/body-read-error/body-timeout. Check normal EOF rejection, actual size cancellation, HTTP status and logical counts. Fake streams/time only; no actual Provider, raw outputs or key files.
- [x] **Step 5: Preserve full flow.** Synthetic good response still passes Ready, trustworthy usage and settled budget, owner/second-request rejection, activation/planning and disposal, with transport null and valid start UTC. Default offline does zero actual network and both new fields null; Key-only path preserves its diagnostics and no POST. Test callback/projection faults leave original behavior unchanged. Unknown extra fields and secrets never reach Summary. Existing provider/candidate observations remain valid for semantic failure.
- [x] **Step 6: Verify and double review.** Run `node node_modules/vitest/vitest.mjs run tests/server/live-transport-diagnostics.test.ts tests/server/live-research-validation.test.ts tests/server/live-result-diagnostics.test.ts tests/server/live-research-failure-summary.test.ts tests/server/openrouter-transport-observation.test.ts tests/server/research-transport-diagnostic.test.ts`; then nonincremental tsc and eslint for validation/new test. Hand off immutable candidate with RED/GREEN evidence; independent SPEC then QUALITY/SAFETY before completion. No Task1 changes without reporting the demonstrated dependency.

## Root integration and recovery

- [x] Run the union of related transport/adapter/request/result/candidate/runner/validation/environment tests once on the final code; use the 16-file previous regression list plus 3 new tests, adding another relevant test only for a specific risk. Run nonincremental type check and changed-file lint. Do not add separate counts together as unique tests.
- [x] Use Sites local build only, one literal command per exec: `node C:/Users/XF/.codex/plugins/cache/openai-bundled/sites/0.1.66/scripts/build-site.mjs`. Inspect actual build exit, Worker default fetch export and client/hosting/migration output agreement using existing local checks. Root only; no Sites save/deploy, no browser or server needed for this server-only diagnostic slice.
- [x] Independent final integration review of final diffs, Task1/2 double reviews and Root verification evidence. Record exact current candidate hashes and unchanged protected27; preserve original Summary and original baseline. Fix actual findings and repeat only affected checks.
- [x] Update operations evidence, checkpoint, goal and release gates to describe implemented/local-tested diagnostics, with actual counts and remaining root-cause/real/online gaps. Preserve full release goal; neither offline pass nor diagnosis grants a twelfth request. Prepare the next concrete action from evidence without issuing a new live command automatically.

Root plan self-review: Task1 covers all approved failure, byte/EOF, timing, cancellation and observer safety clauses; Task2 covers guard information loss, Summary UTC/defaults and real integration boundaries; final steps cover existing request/quality/budget invariants and mandatory local build. Existing29 baseline is not claimed unchanged after intended edits; stage protection and final hashes identify the real candidate. No dependency installation, production changes, raw logging or unapproved commits are included.
