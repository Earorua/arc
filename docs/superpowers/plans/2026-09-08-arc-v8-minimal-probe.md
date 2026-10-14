# Arc v8 minimal GPT-6 diagnostic implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development with TDD, independent specification review, then independent quality/security review. Preserve the existing uncommitted GPT-6 comparison work.

**Goal:** Prepare the user-approved one-shot minimal GPT-6 request and screened error explanation, then hand off one masked-key command.

**Current status — 2026-09-08:** Preparation and both reviews are complete. The user has executed the one permitted minimal probe; it returned **HTTP 403**. The permission is consumed. The command below is historical and must not be rerun without a new, specific authorization. This does not establish API or full Research readiness.

**Architecture:** Add a standalone diagnostic module and pure error-message classifier under `scripts/live-research`. Reuse the existing key-policy/one-GET/one-POST guarded transport and masked PowerShell launcher. A separate `-ProbeMinimal` / `--probe-minimal` mode invokes the new module without importing the Research orchestration, database or application factories.

**Tech Stack:** Existing TypeScript, Vitest, Node/Vite runner and PowerShell. No dependencies, production changes or provider requests during implementation.

## Authorization and interpretation

The user approved the proposed minimal GPT-6 request plus improved screened error diagnostics. This is one new user-run inference POST after the existing key preflight, under the existing dedicated unused non-resetting test-key cap of at most USD 5. It does not renew any of the three consumed full Research attempts. The assistant does not read or create a real key. The user privately enters it after offline verification and review. No automatic retries, repairs, fallback models, additional authenticated catalog checks or production flag changes.

Only a fixed public test sentence is sent. Keep existing privacy/routing restrictions; therefore failure still does not distinguish account permission from routing/privacy constraints. Success only demonstrates this minimal request under these conditions, not full Research readiness. A response with no visible text is recorded honestly without a second call. Provider-reported message categories are clues, not independently verified causes.

## Exact request and boundaries

```ts
{
  model: "openai/gpt-6-astra",
  messages: [{ role: "user", content: "Reply exactly OK." }],
  max_tokens: 512,
  stream: false,
  provider: { require_parameters: true, data_collection: "deny", zdr: true }
}
```

Fixed endpoint `https://openrouter.ai/api/v1/chat/completions`, redirects forbidden, normal TLS, no proxy changes. No tools, response_format, system prompt, user input, account data or project content in body. Keep a 120-second overall POST/read deadline (30-second key check unchanged), max 65,536 response bytes, strict UTF-8/JSON, and cleanup of pending body reads/late transport responses. No new logging of exception messages, arbitrary response text, headers or raw metadata.

## Task 1: Minimal probe and screened explanation

Create `scripts/live-research/minimal-probe.ts`, `scripts/live-research/safe-error-explanation.ts`, `tests/server/live-minimal-probe.test.ts` (pure explanation), and `tests/server/minimal-probe-transport.test.ts` (transport/launcher). The classifier is delegated; root implements the independent transport/entry task alongside it, with separate files and the same final independent reviews.

- [x] RED: Test exact outbound body via injected fetch, one key GET then one POST; default execution has no real network; key denial produces zero POST. Tests cover 200 with visible output, 200 with error, 403, unknown error, missing/invalid JSON and bounded response/cancellation behavior.
- [x] RED: Test pure error explanation: typed diagnostic fields reuse the existing pure extractor; error.message is classified into static, finite reason phrases (authentication/key disabled, account disabled, credit, region restriction, guardrail/moderation, routing/privacy, model ID, rate limit, permission, generic provider error). Never echo substrings. Return explicit missing/invalid/unrecognized when no known phrase is found. Canary keys, bearer strings, emails, URLs, IDs, control characters and arbitrary metadata must never reach output, even if attached to a recognizable phrase.
- [x] GREEN: Implement `runMinimalProbe({executeOne?, key?, fetch?} = {})`, with an offline fixture by default and live only via explicit injected fetch plus key. It reuses `createGuardedTransport`; no calls beyond inspectKey and one POST. Summary mode is `minimal-probe-one` for live and `offline-minimal-probe` otherwise. Summary reports requested model, HTTP statuses, safe key diagnostics, screened provider diagnosis, counts (key/inference and zero Research/Repair), numeric cost/tokens only, and visible-output classification. Actual model is retained only if exactly the fixed public ID; unknown model values are suppressed. Generated text is reduced to expected OK / other text / empty. A valid nonempty successful completion is distinct from 200 with an error or malformed body; output-token exhaustion is not automatically retried. If a valid cost receipt is absent, leave cost null; never infer zero charges from failure. A reported cost above USD 5 cannot yield a passed outcome.
- [x] GREEN: Add `-ProbeMinimal` and `--probe-minimal` to `run.ps1` and `runner.mjs`. All mode pairs conflict before key input. New live mode shows its fixed model, 512 token cap, no tools/schema, one POST/no retry. Retain masked stdin handling and existing mode/default behavior. Runner chooses minimal module before full validation branch and keeps exclusive allowlisted Summary persistence.
- [x] Verify: `npm run test:unit -- tests/server/minimal-probe-transport.test.ts tests/server/live-minimal-probe.test.ts tests/server/live-research-validation.test.ts tests/server/live-account-check.test.ts tests/server/provider-failure-diagnostic.test.ts`. Test actual CLI/PowerShell conflicts, malformed key input with no network, and default offline behavior; do not invoke a valid-key live CLI in tests. Run nonincremental tsc and targeted lint, then both independent reviews.
- [x] Record verified preparation and hand off the single new command; no real call until the user runs it.

## Handoff and outcome handling

### Offline verification record

- TDD RED was observed independently for the missing minimal-probe module (one failed suite, 0 tests; 693 ms) and the missing classifier module (one failed suite, 0 tests; 458 ms). The initial sandbox process-spawn failure was not counted as RED evidence.
- Classifier GREEN: 19/19 tests (460 ms). Root combined regression after the final malformed-stdin test: **5 files / 327 tests passed, 10.78 seconds**. All requests used fixtures; malformed-input CLI and conflicting-mode launcher checks stopped before network setup.
- Quality review identified one P2: a malformed completion could discard a valid usage receipt. Four new regression cases reproduced it (4 failed / 25 passed, 4.87 seconds). Safe receipt capture now precedes completion validation, preserving the failure reason and suppressing arbitrary values. Root fresh GREEN after the fix: **5 files / 331 tests passed, 11.81 seconds**, plus nonincremental TypeScript and targeted ESLint passed.
- Nonincremental TypeScript check, targeted ESLint and `git diff --check` passed. Existing SQLite experimental and Git line-ending warnings do not indicate test failures.
- Independent specification review: READY. Quality/security review found only the receipt P2 above; after the fix, focused specification review and then quality/security review both returned **READY, no residual P0/P1/P2 findings**. No real key or provider request was used in preparation. The subsequent user-run result is recorded below.

Prepared local source SHA256 (uncommitted files on HEAD `7090153b4acad7b12df6a7ee4d675b46c41871dc`):

| File under `scripts/live-research` | SHA256 |
| --- | --- |
| `minimal-probe.ts` | `225fffac735695c414780500de227f57293d7b2ef35a33c83ea7a7d7c4db407d` |
| `safe-error-explanation.ts` | `459cba6c52bb46a093ca8d8abc59bdebeeaedef28e3731b0c500748468d0eba92` |
| `run.ps1` | `99b1c79fa1814b7c5ba72515091ac07c336e67862b68b74c3dc951fcbc73f4f6` |
| `runner.mjs` | `47305aa27df034bea1e669016bb8b2d83338425e4e67da476d050a2b4858a226` |

Historical handoff command (already executed once; do not rerun):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\live-research\run.ps1 -ProbeMinimal
```

Do not use `-ExecuteOne` for this experiment. Read only the resulting new allowlisted Summary after the user reports completion. One inference POST is not a full Research run; no D1, planning, audit or proof operation is performed. If request or response fails, preserve the evidence and stop. The local cap and output limit are safeguards, not provider settlement proof. Three previous full Research POSTs remain failed 403, and production Research stays closed.

### User-run result

- UTC 2026-09-08 **12:20:25.579** / GMT+8 **20:20:25**; summary `outputs/live-research/summary-2026-09-08T12-20-25-579Z.json`, SHA256 `db1fbadcf276f5b252022cb83929fc73965ccf852b3af671fed41321f929b554`. All four prepared script hashes above were rechecked and still match.
- `minimal-probe-one` / `incomplete` / `provider-error`; requested model `openai/gpt-6-astra`, actual model null. Key 200, complete, 1,720 ms; inference 403. Exactly one key GET and one inference POST; full Research and Repair both zero.
- Numeric error code 403 recognized; standard error type missing/null. Message explanation unrecognized/category null means the fixed classifier did not recognize the string, not that no message existed. Raw text was not retained and cannot be recovered from this summary.
- Visible output not observed; all four usage/cost fields null. No receipt is not proof of zero charge. Removing search/schema did not resolve the denial; retained privacy/routing conditions and account/inference permissions remain unisolated.
- The user-run permit is consumed. Root saved the outcome and added a support-draft supplement only; no new provider request, code change, rerun, production operation, commit or push. Four total separately permitted inference POSTs (three full Research, one minimal) have returned 403.

## Sources checked 2026-09-08

- [OpenRouter Quickstart](https://openrouter.ai/docs/quickstart): standard chat-completions request; model/messages with optional bounded output.
- [OpenRouter errors](https://openrouter.ai/docs/api_reference/errors-and-debugging): JSON error code/message and optional metadata; HTTP 200 may still contain an error.
- [GPT-6 Astra model page](https://openrouter.ai/openai/gpt-6-astra): exact fixed model ID. No inference was performed to read these public pages.
