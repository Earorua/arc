# Arc v8 read-only account diagnostics implementation plan

> **For agentic workers:** Use the already approved superpowers:subagent-driven-development workflow with TDD, independent specification review, then quality/security review. Root owns evidence and local Git commits. Do not send authenticated requests or read credentials during implementation or review.

**Goal:** Give the user a masked, read-only diagnostic command for the existing limited test key after a real Research HTTP 403 and no visible Activity record.

**Architecture:** Add a separate account-check module and an exclusive launcher mode. It makes at most one current-key GET followed by one user-model-catalog GET; it has no Research transport, database, planning or application imports. The existing live and key-only policies stay unchanged. The new report contains fixed labels, validated numbers and one exact-model membership boolean, never opaque metadata or raw errors.

**Tech stack:** Existing PowerShell masked prompt, Node/Vite TypeScript loader, native fetch injection and Vitest. No new dependency or hosted service.

## Context and authorization

- Starting clean HEAD: `97eb8eb85725074ed4f840f0d6404ff99055739e`, branch `codex/v8-openrouter-research-beta`, authoritative existing feature worktree.
- User wants to resolve the API-key issue and complete real validation, merge and GitHub backup. They now confirm **personal account**, **no Activity record**, and **the test key has not been revoked**. Account credit is user-confirmed; the actual key remains private.
- The first actual attempt at `31f80525c0efe556146f2830b1c049f1055de964` returned Key 200 / Research 403, Research POST 1, Repair 0, usage null. The sole Research allowance is consumed. This diagnostic extension and its later user-run GETs do not authorize another inference call.
- Root may prepare and test this local helper within the approved troubleshooting workflow. Only the user enters the existing dedicated key through the reviewed masked command after local verification. No reading environment/key files or browser Keys UI; no credentials in chat, arguments, environment, files or logs.
- No model changes, weaker privacy routing, proxy changes, production operations, merge, push, Sites candidate or deployment. Keep the running 4179 preview.

## Exact design

Owned implementation files:

- Create `scripts/live-research/account-check.ts`: standalone `runAccountCheck({ key, fetch })`, no implicit/default fetch, environment or database access.
- Modify `scripts/live-research/runner.mjs`: accept only exclusive `--check-account-only`, load this module instead of `validation.ts`, save its allowlisted report using the existing exclusive output writer.
- Modify `scripts/live-research/run.ps1`: exclusive `-CheckAccountOnly`, reuse the existing hidden prompt and stdin channel. Explain that this reads the existing dedicated limited key and model catalog and cannot invoke Research.
- Create `tests/server/live-account-check.test.ts`; only narrowly update existing helper subprocess tests if needed for the third mode.

Allowed requests, in order:

1. `GET https://openrouter.ai/api/v1/key`, at most once, 32,768-byte response limit.
2. Only after a valid limited, non-management key observation: `GET https://openrouter.ai/api/v1/models/user`, at most once, 8,388,608-byte response limit and at most 10,000 entries.

Both requests must use `redirect: error`, Bearer only to those exact fixed HTTPS URLs, no request body, and a 30-second deadline covering request and full body. Reject redirects, invalid UTF-8, malformed JSON, oversized or malformed claimed lengths, late responses and stalled bodies. Cancel incomplete reads and clear local key references in `finally`. Never follow any URL present in a response. All failures have fixed categories and only numeric HTTP status. No retries, POST, Repair, credit query, key management, account-setting writes, or fallback to another domain.

Reject any HTTP-200 envelope with a present non-null top-level `error` as fixed `invalid-response`, even if valid-looking `data` is also present. Do this before extracting key observations or catalog membership. Absent/null `error` remains compatible. This prevents contradictory provider data from producing a completed or definitive-negative metadata observation.

The key observation validates the existing USD 5/non-reset/non-management/non-provisioning/unexpired policy but permits existing nonnegative finite usage, including a positive BYOK aggregate, for this read-only mode. It does not relax `verifyKeyPolicy` or the live helper's unused-key/zero-BYOK requirement. Emit only validated numeric `limitUsd`, `remainingUsd`, `usageUsd`, `byokUsageUsd`; invalid/missing fields remain null rather than being coerced to zero. Reject invalid policy before the catalog GET. Report valid usage even when a different policy field causes rejection. Never emit label, name, hash, identity, full key metadata, raw errors or response bodies. A numeric zero is the observed per-key aggregate at that check, not proof of final settlement, refunds or causation of the earlier 403.

For the catalog, validate a `data` array with bounded, nonempty string IDs on every entry; ignore other model fields. Omit both `offset` and `limit`, which the official reference specifies returns the full list. If `total_count` is present, require an integer from 0 to 10,000 equal to `data.length`; if `links` is present, require an object and any supplied `links.next` to be null. Partial or malformed pagination metadata means incomplete; never follow pagination links. Missing pagination metadata remains accepted because the documented examples omit it. Emit only `requestedModel: openai/gpt-5.6-sol` and `modelListed: true | false | null`, using exact ID equality. Empty valid data means false; malformed/missing/oversized data means null/incomplete, never false or success. Do not output the catalog or perform model requests.

Use a distinct report mode `account-check-only` and `outcome: completed | incomplete`. `completed` means both metadata observations were obtained and validated, even when `modelListed` is false. It is never Research success. Include timestamp, fixed failure category, key/catalog statuses and bounded diagnostics, request counts, and literal Research/Repair counts 0. Keep the existing report modes and exit semantics unchanged; only account `completed` exits 0 in the new mode. Reject every conflicting mode combination before prompting or reading stdin.

## Task 1: Implement under TDD

- [x] Write discriminating fixture tests before implementation. A used limited key (`limit: 5`, `limit_remaining: 4.75`, `usage: 0.25`) must produce only two exact GETs and the safe numeric observation; exact Sol membership yields true, another model only yields false, and malformed catalog yields null/incomplete. The same used key must remain rejected by existing `verifyKeyPolicy`.
- [x] Test invalid key and all conflicting CLI/PowerShell modes before input/network; rejected management/unlimited/reset/expired policy stops after one GET. Confirm no provider, database or application operations.
- [x] Cover network/HTTP/body/UTF-8/JSON/shape/size/timeout failures, including claimed and actual size limits, delayed and never-completing bodies, late response cancellation and second-GET denial after key failure. Canary strings in metadata/errors/catalog must never appear in serialized summary or child stdout/stderr.
- [x] Exercise the real Node runner branch and exit/report semantics with explicit synthetic fetch injection in the child and synthetic stdin. Remove only the fixture report created by that child after verifying its emitted Summary path has the exact workspace output parent and strict timestamp filename. Do not leave `account-check-only` fixture reports where later work could mistake them for user observations; never remove an existing user report or recursively clean the output directory.
- [x] Run `npm run test:unit -- tests/server/live-account-check.test.ts tests/server/live-research-validation.test.ts`, observe intended RED, then implement the smallest standalone GET-only path and run to GREEN. One bounded subprocess per test; retain the existing 30-second child / 35-second outer convention.
- [x] Run nonincremental TypeScript, targeted ESLint and `git diff --check`; report actual counts and any concern to root. Do not commit or invoke the real command.

Illustrative fixture assertion (the implementation can choose equivalent nested safe fields):

```ts
const fetch = vi.fn(async (url, init) => {
  expect(init.method).toBe("GET");
  expect(init.redirect).toBe("error");
  expect(init.body).toBeUndefined();
  if (url === "https://openrouter.ai/api/v1/key") return Response.json({ data: {
    limit: 5, limit_remaining: 4.75, usage: 0.25, byok_usage: 0,
    limit_reset: null, is_management_key: false, is_provisioning_key: false,
  } });
  expect(url).toBe("https://openrouter.ai/api/v1/models/user");
  return Response.json({ data: [{ id: "openai/gpt-5.6-sol" }] });
});
const result = await runAccountCheck({ key: "synthetic-account-check-key", fetch });
expect(result).toMatchObject({ mode: "account-check-only", outcome: "completed",
  modelListed: true, researchRequestCount: 0, repairRequestCount: 0 });
expect(fetch).toHaveBeenCalledTimes(2);
```

## Task 2: Review, verify and hand off

- [x] Independent specification review and P2 remediation re-review: no unresolved P0/P1/P2 findings, READY. The final review independently ran 22 synthetic Node assertions.
- [x] Independent quality/security review after specification approval; one P2 remediated under TDD, then sequential specification and quality/security re-reviews returned no unresolved P0/P1/P2 findings.
- [x] Root inspects the final remediated diff and runs full unit suite, nonincremental types and targeted lint. The suite includes the default no-network PowerShell launcher. No fresh build/D1/UI gate is required for metadata-only helper code that does not change application behavior.
- [x] Record results and user updates in the operational checkpoint and live plan. This delivery contains only the seven reviewed source/tests/docs files. Root locally commits this snapshot and reports the verified clean HEAD in the handoff; ignored diagnostic outputs are excluded.
- [x] User ran the masked `-CheckAccountOnly` command on clean `748cc264e57a35171b43cfee1f336b6a07e4b139` and replied “已运行”. Root read only the new `account-check-only` report below. No new Research request is authorized by this command. Key revocation remains unconfirmed and will be revisited after the chosen follow-up diagnostic route.

## Source and interpretation boundaries

Official [current-key reference](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key) documents the key usage fields. Official [models operation reference](https://openrouter.ai/docs/client-sdks/typescript/api-reference/models/models) describes `listForUser` as filtered by provider preferences, privacy settings and guardrails. Official [provider logging documentation](https://openrouter.ai/docs/guides/privacy/provider-logging) identifies the `/api/v1/models/user` path. Official [IP allowlist support article](https://openrouter.zendesk.com/hc/en-us/articles/51691163230363-Why-am-I-getting-a-403-your-IP-address-is-not-in-the-allowlist-for-this-account) limits that particular setting to Enterprise organizations; the user's personal-account statement excludes that setting, not every possible network or geographic restriction.

The current [full endpoint reference](https://openrouter.ai/docs/api/api-reference/models/list-models-filtered-by-user-provider-preferences-privacy-settings-and-guardrails) confirms API-key Bearer authentication, exact GET URL, full-list behavior when both pagination arguments are omitted, and optional response pagination handling above. Its generic 403 example mentions management keys, while the authentication section and operation description do not mandate management credentials. This helper will treat any 403 as an incomplete metadata observation; it never asks for or switches to a management key.

Model listing is a metadata observation. It cannot prove successful inference, compatibility with the full Research schema/tools/ZDR request, or the exact cause of the earlier 403. Missing catalog membership warrants account/provider preference investigation; present membership with another denial may still require a separately approved bounded diagnostic attempt or provider support. No second paid attempt is authorized by remaining credit alone.

## Implementation and verification evidence

- Implementer initial TDD: **99 expected RED / 52 passed**; the existing 49 helper tests passed. A later synchronous injected-fetch error case added **2 RED / 102 passed** before its narrow classification fix.
- Initial focused regression: **153/153 passed** (104 new account tests plus 49 existing helper tests). Six temporary test-harness timeouts came from dynamic imports inside fake timers; after the initial missing-capability RED, tests switched to static imports as in the existing transport tests. No deadline or assertion was relaxed.
- Quality/security review reproduced one **P2** diagnostic-integrity issue: HTTP 200 with valid-looking data plus non-null `error` was accepted. Remediation added 22 cases: **18 RED / 157 passed**, then **175/175 passed** (126 account tests plus 49 existing helper tests). The only implementation correction was a shared rejection immediately after JSON parsing, before extracting observations.
- Root full suite on the final remediated implementation: **136 files / 2,533 tests passed**, **58.95 seconds**, exit 0. This includes actual default Node/PowerShell offline launchers and synthetic account-mode child success/failure paths. It supersedes the pre-remediation 2,511-test result.
- Root nonincremental TypeScript, targeted ESLint and diff check exited 0. Application, existing Research/key-only transport and validation, existing helper test file, offline-preview harness and dependencies have no diff.
- Account-mode child tests use explicit synthetic fetch injection and remove only their own verified fixture report; retained latest reports are `offline-dry-run / passed / realRequestCount: 0`. They are not user account observations. No actual account GET, new Research, credential read, production operation, merge, push or deployment has occurred during preparation.
- Initial independent specification review returned **P0/P1/P2: 0/0/0, READY** (static review). The final specification re-review again returned **0/0/0, READY** and independently passed **22/22** direct Node synthetic assertions. Its selected Vitest invocation could not start because sandbox process creation returned `EPERM`; that attempt is not counted as passing. Root's separately authorized full suite above executed successfully.
- Final independent quality/security re-review returned **P0/P1/P2: 0/0/0, READY**, closing the original P2. It statically inspected the final changes and independently passed **6/6** in-memory synthetic assertions covering contradictory envelopes and absent/null controls. It did not repeat the full suite or send real requests.
- The helper was locally saved at clean `748cc264e57a35171b43cfee1f336b6a07e4b139` and the reviewed command handed off. The user-run observation is recorded below; no second Research is authorized.

## Actual user-run account observation

- Report: `outputs/live-research/summary-2026-09-06T05-49-11-188Z.json`, timestamp **2026-09-06 05:49:11.188 UTC** (13:49 Beijing), mode `account-check-only`, outcome `completed`, reason null.
- Key HTTP **200**, complete/no failure, **5,408 ms**. Catalog HTTP **200**, complete/no failure, **1,386 ms**. Exact `openai/gpt-5.6-sol` membership **true**.
- Observed Key limit **USD 5**, remaining **USD 5**, usage **USD 0**, BYOK usage **USD 0**. This is a per-key aggregate at that timestamp; it is not an account-balance query or final settlement proof for the earlier request.
- Actual requests **2 GETs**, Research **0**, Repair **0**. This report is distinct from the cleaned account-mode test fixtures and retained offline summaries. SHA256: `ed18cec0a545bac31b77b0204c9f260c984e30dc1a753b2def8955e7af551b0b`.
- Root confirmed branch and clean execution HEAD before reading the allowlisted report. No credential, environment, raw error or private account record was read. The original Research 403 remains unresolved; successful catalog membership does not validate the full schema/search/privacy combination.
- Next local preparation is `2026-09-06-arc-v8-provider-error-observation.md`: fixed typed-error observations at the existing parsed boundary, plus a provider-support note. No second POST, merge, push or deployment has been authorized by these metadata results.
