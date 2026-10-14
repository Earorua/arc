# Arc v8 GPT-6 model comparison implementation plan

> **Execution update, 2026-09-08:** The user has run this attempt. Summary `summary-2026-09-07T17-15-12-358Z.json` confirms requested `openai/gpt-6-astra`, key HTTP 200, inference HTTP 403, one POST and no Repair. The permission is consumed; the handoff command below is historical and must not be run again without a new instruction. See the current resume checkpoint for exact evidence. The preparation checks below remain valid but do not establish real Research success.

> **For agentic workers:** Use superpowers:subagent-driven-development and TDD; review specification compliance before quality/security. This is the existing approved isolated validation workflow with a user-requested model substitution.

**Goal:** Prepare one user-run Research comparison using `openai/gpt-6-astra` in place of Sol, without changing the deployed website.

**Architecture:** Keep the current masked PowerShell launcher, anonymous stdin key delivery, guarded transport, actual Research adapter and ephemeral database. Change only the fixed diagnostic model and its descriptive fingerprint; align the optional account catalog check and launcher display. No configurable model selectors or new request modes.

**Tech Stack:** TypeScript, Vitest, PowerShell; existing Node/Vite isolated runner.

## Scope and evidence

The user requested trying another model, then specified GPT-6. This authorizes one new comparison attempt under the existing USD 5 test-key ceiling, not repeated runs. The previous two Sol POST permits remain consumed. The assistant prepares and verifies locally; the user privately enters the key and executes once. No real key is read by the assistant and no real request is sent during preparation.

The [OpenRouter model page](https://openrouter.ai/openai/gpt-6-astra), checked 2026-09-08, lists `openai/gpt-6-astra`, tools and JSON Schema support, and standard USD 10/M input and USD 50/M output rates; endpoint rates vary. Catalog existence does not prove this account or the full routing combination works. Retain the external key cap and receipt checks; do not present the local reservation as a provider billing guarantee.

The comparison changes the model only: role, locale, strict schema, web search, data retention policy, 12,000 output-token limit, two-search limit, 120-second Research deadline and 30-second key deadline stay unchanged. Repair and automatic application retries stay disabled. A new failure does not prove the account is at fault; a success does not establish the old failure's precise cause or authorize production Research.

## Task 1: Fixed local model substitution

Files: `scripts/live-research/validation.ts`, `scripts/live-research/account-check.ts`, `scripts/live-research/run.ps1`; existing tests `tests/server/live-research-validation.test.ts`, `tests/server/live-account-check.test.ts`.

- [x] RED: Change the actual outbound-body expectation to `model: "openai/gpt-6-astra"`, account catalog fixture/expected model to the same exact ID, and add the model expectation to the existing masked-launcher source check. Run the two test files; confirm mismatches with the still-Sol implementation.
- [x] GREEN: Replace the fixed model literals in the three scripts with `openai/gpt-6-astra` and the config fingerprint with `live-validation-gpt-6-astra-v1`. Do not alter any other transport, request or policy behavior.
- [x] Run `npm run test:unit -- tests/server/live-research-validation.test.ts tests/server/live-account-check.test.ts`; expect all tests to pass with synthetic fetch only. Run nonincremental type checking and targeted lint.
- [x] Independent specification review, then independent quality/security review; resolve material findings.
- [x] Record preparation and next command in `docs/operations/v8-resume-checkpoint.md`. Preserve older summaries and dated support notes as historical Sol evidence.

## Handoff

After offline checks and reviews, run once in the user's interactive PowerShell from the authoritative worktree:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\live-research\run.ps1 -ExecuteOne
```

The first prompt must show `openai/gpt-6-astra`. Enter the dedicated, unused, non-resetting test key capped at no more than USD 5 only in the masked prompt. The existing policy rejects keys with prior usage or inconsistent limits. The run issues one key GET then at most one Research POST. Stop after the result; do not retry. Only the allowlisted Summary file is needed for diagnosis; no key or raw response should be sent in chat.

Preparation is not a real GPT-6 result. Production flags, credentials, D1/R2, Sites versions/deployments, and master remain untouched.

## Verification evidence

- Implementer RED: 10 failures and 165 passes, 6.86 seconds; expected old-model mismatches. GREEN: 175/175, 6.56 seconds.
- Root independent verification: both test files, 175/175, 6.52 seconds; nonincremental `tsc --noEmit --incremental false`, targeted ESLint, and `git diff --check` passed. Existing SQLite experimental warning only; no new runtime warning or failure.
- Independent specification review: P0/P1/P2 = 0/0/0, READY. Subsequent independent quality/security review: 0/0/0, READY for local configuration and operator handoff only.
- No real Key GET or inference POST occurred in preparation. Tests use synthetic credentials/responses and the default offline launcher.
- Changes are saved in the local working tree, not committed, pushed or deployed in this preparation turn. Git HEAD remains `7090153b4acad7b12df6a7ee4d675b46c41871dc`; the expected local changes are the three scripts, two tests, this plan and the checkpoint.
