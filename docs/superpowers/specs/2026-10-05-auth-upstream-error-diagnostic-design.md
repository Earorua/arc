# Bounded authentication upstream-error diagnosis

Status: proposed; implementation and diagnostic deployment have not started. User design review pending.

## Problem and verified context

The operator's browser returned to the isolated migration site's sign-in page with `error=oauth` and a second `error=invalid_code`. The first value is Arc's fixed error-return marker. The installed Better Auth callback maps an exception during authorization-code validation, or an absent token result, to `invalid_code`. That value alone does not identify a bad client secret, expired/reused code, mismatched redirect/PKCE, transport failure, or token-response parsing failure.

Arc deliberately emits only `[Arc Auth] ERROR` or the corresponding severity. Raw OAuth exceptions can contain secrets and must stay private. Current Computer Use cannot complete browser verification: the native helper stopped because it could not confidently establish the current Chrome URL. Do not bypass that stop with another desktop-control mechanism. The operator has not yet confirmed that the privately saved Google ID/secret pair belongs to the same enabled original web client.

The C3 synthetic authentication migration acceptance is complete at `4cd27cf0c2bccaf674d8f2a5c63eb175fb05b7ac` (14 files / 255 tests, sequential independent SPEC and QUALITY/security approval). It does not establish real OAuth success or actual source-data migration. This small diagnosis must not redo that work or expand into account-policy changes.

## Alternatives and recommendation

1. **Private operator configuration check only.** No application change, and potentially sufficient if the ID/secret pair is wrong. Currently requires operator access, because browser automation has stopped. It cannot explain another generic failure if the pair is correct.
2. **Bounded server-log classification (recommended).** Keep every raw message/object hidden; add only allowlisted provider-error names and numeric HTTP error status to the existing server logger. Deploy the reviewed change only to the isolated shadow Worker, then observe one operator-initiated login. It distinguishes useful failure categories without handling credentials in chat.
3. **Change the public sign-in error UI.** Useful later for usability, but the existing `invalid_code` still does not reveal the underlying cause. Do not combine that unrelated presentation change into this diagnostic.

Raw debug logging, printing complete token endpoint bodies, exporting a HAR, replaying an old authorization code and rotating credentials speculatively are excluded.

## Scope and behavior

Keep the existing Better Auth logger callback as the only integration point. Introduce one pure, bounded formatter in `app/server/auth/diagnostics.ts`; the runtime calls it and writes its returned fixed-format string. There is no network call, environment read, authentication mutation, additional database table, client-side endpoint or new log sink in the formatter.

Only the installed callback's exact logger invocation shape is eligible for additional classification: severity `error`, empty message string, exactly one argument, and that argument is a non-null non-array object. This matches `logger.error("", exception)` in the authorization-code exchange catch. The logger integration is shared between providers; therefore the marker must not claim Google identity or a specific exchange stage. The operator correlates the marker with the known shadow login attempt. Other invocations retain the current severity-only output exactly.

Inspect only own data-property descriptors for `error` and `status`. Do not evaluate accessor values, invoke `toString`/`toJSON`, enumerate arbitrary fields, traverse a nested `cause`, parse message/body text, or stringify the incoming object. Put all untrusted-object inspection, including `Array.isArray`, inside the fallback catch: a revoked proxy may throw before descriptor access. Any such failure produces the existing generic severity marker and never alters the authentication response.

The only accepted error names are exact case-sensitive matches to:

- `invalid_client`
- `invalid_grant`
- `invalid_request`
- `unauthorized_client`
- `unsupported_grant_type`
- `redirect_uri_mismatch`
- `access_denied`
- `temporarily_unavailable`
- `server_error`

Accept `status` only as an integer number from 400 through 599. Never include `statusText`. For an eligible record, append only recognized fields in a fixed order: `upstream_error=<allowlisted value>` followed by `http_status=<validated integer>`. An unrecognized error with a valid status may yield only the status. A recognized error without valid status may yield only the error. If neither is accepted, return the existing marker exactly. Maximum output length is therefore bounded by the fixed severity prefix, the longest listed code and a three-digit status.

Examples of permitted strings:

```text
[Arc Auth] ERROR upstream_error=invalid_client http_status=401
[Arc Auth] ERROR upstream_error=invalid_grant http_status=400
[Arc Auth] ERROR http_status=502
[Arc Auth] ERROR
```

These are observations, not automatic root-cause decisions. `invalid_client` points to client authentication and requires private configuration verification. `invalid_grant` remains ambiguous among code/redirect/PKCE conditions. An unclassified error does not prove a network failure. Retain all existing redirect refusal, PKCE, state, session, linking and encryption safeguards.

## Data that must never be emitted

Do not emit an exception's message, stack, description, cause, request, response, URL, headers, body, account identity, email, client ID/secret, authorization code, state, verifier, token or cookie. Do not log successful token results. Do not serialize raw input even when a recognized code appears beside it. Do not write provider payloads to outputs, fixtures, Git or chat.

There is no new diagnostic flag: the bounded logger behavior is safe by construction and only extends already enabled error logging. Operational rollout remains limited to `arc-v8-migration-shadow-20260922`; it does not modify Sites, `arcmaps.net`, the smoke executor or Research settings. A future public rollout is a separate release step.

## Evidence-driven tests and review

Use TDD with the actual locked logger/fetch behavior as the contract, not a hand-invented exception shape.

1. In a new focused offline test, use the existing `fixtureHarness()` without editing shared helpers. Inside each case, replace its denied fetch with a test-local `vi.stubGlobal("fetch", stub)` which only returns an in-memory synthetic response for the exact Google token endpoint and throws for every other URL. Create `harness.fixture()`, call the existing `startSocial(f, "google")`, then `callback(f, "google", state, cookie, "code", syntheticCode)` through the real `auth.handler`. A synthetic 401 `invalid_client` and 400 `invalid_grant` must reach the installed Google provider and actual callback/logger. Assert the replacement stub was called exactly once with POST, manual redirect handling and the expected synthetic fields; real state was consumed; the response remains the existing `invalid_code` redirect; no session or user/account/business row changes occurred; and console output contains only the expected fixed marker. Add a transport exception and unknown/malformed token response case to demonstrate the generic fallback. The fixture's original denied fetch must remain unused; its existing teardown restores all globals and closes the database. No real network, real key or library monkey-patch.
2. Verify exact output for accepted codes/status combinations, plain-text/unrecognized/redirect-refusal/transport exceptions, wrong message/severity/argument shape, and missing/null/array inputs. Plain-text or unknown-code HTTP failures may retain valid numeric status only; failures with neither accepted field remain generic.
3. Add confidentiality sentinels to every disallowed field, extra arguments, unknown codes, status strings, nested causes, cyclic objects, getters, `toJSON` and `toString`. Prove they never appear and forbidden accessors are not invoked. A throwing property-descriptor trap and a revoked proxy must not escape the formatter.
4. Keep the current runtime redaction regression: ordinary warn/error calls retain exactly the current severity-only marker. Keep successful login/token/session behavior unchanged; no new retries or provider parameters.
5. Run the focused tests, relevant existing runtime/OAuth state/callback regressions, typecheck, focused lint and the actual shadow build/preflight. Do not repeat the entire migration acceptance unless code changes or failures create a concrete need.
6. Independent SPEC review followed by a distinct QUALITY/security review must cover code, tests, build artifacts, deployment scope and safe log collection before deployment.

The implementation plan must retain this actual-callback seam. An object-only formatter test or standalone provider call does not replace proof that the real callback/logger integration classifies the locked provider's failure shape.

## Shadow rollout and observation

Reuse the reviewed secret-inheritance build/deploy path. Before deployment, inspect only native remote metadata: exactly the five expected Secret names/types, known plain variables, isolated DB/R2/ASSETS bindings and current version. Refuse deployment on unexpected binding or secret-state differences. Retain both Research flags as false. Do not retrieve any secret value, use a local real-secret file, or blindly preserve unknown variables. Record the previous version as the rollback target.

Deploy the exact reviewed artifact only to the existing shadow Worker under the standing deployment authority, after this design is approved. Verify the five secrets and expected bindings remain, provider availability is unchanged, and public pages respond. This check does not prove credential validity.

For one subsequent operator-initiated Google login, observe only fixed Arc diagnostic messages for this Worker. Implement and review a bounded CLI wrapper before deployment; never invoke raw `wrangler tail` with stdout/stderr connected to tool output or a file. The wrapper must launch the locked Wrangler CLI for the exact shadow Worker with JSON format, shell disabled and `windowsHide: true`; capture both child streams privately in memory. Set child-only `WRANGLER_WRITE_LOGS=false`, `WRANGLER_SEND_METRICS=false`, `WRANGLER_SEND_ERROR_REPORTS=false` and `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false`. The locked CLI explicitly honors WRANGLER_WRITE_LOGS in `shouldLogToDisk`; reducing WRANGLER_LOG verbosity alone does not disable disk logging.

Wrangler JSON output contains complete multiline events, so the wrapper must frame JSON objects across chunks with correct string/escape handling, not assume one event per line. Limit a frame to 256 KiB and stop with a fixed safe failure code on oversize, invalid framing, or child failure. Do not echo malformed input, child stderr or caught error messages. The only emitted projection is a validated timestamp, an allowlisted native event outcome, and exact fixed-format Arc messages that match the grammar above. Do not output or store request URLs, entire events, exception fields or arbitrary log messages. A synthetic collector test must include split/chunked/multiline JSON, misleading marker substrings, arbitrary stdout/stderr, malformed/oversize events and credential sentinels, proving only the projection is emitted and raw data is never written to disk.

Stop and clean up the child after the agreed operator attempt or after at most 300 seconds. Emit a fixed timeout observation if needed; it is not a login failure and never triggers an automatic retry. Absence of a marker likewise proves neither success nor a transport failure. Read-only native event outcome may separately distinguish a platform limit, without presuming Workers Paid status.

The operator continues to perform personal authentication and enter any secret directly in the appropriate dashboard. A successful new shadow login is not original-account continuity or source-data restore. No paid OpenRouter call is included. No production DNS or original data changes are included.

## Completion and stopping conditions

This diagnosis is complete only when the offline confidentiality/contract checks pass, distinct reviews pass, a correctly scoped shadow deployment is verified, and an actual operator attempt produces either a bounded actionable error category or verified login. Record unknown/timeout honestly; never convert it to success.

If the operator's private configuration check resolves login first, do not deploy this diagnostic solely to finish the plan. If safe collection cannot separate the permitted marker from raw events, stop before collecting and choose a reviewed safe path. If the root cause remains unknown, preserve the bounded evidence and choose the next test based on it; do not loosen authentication checks.

## Source anchors inspected on October 5

- `app/server/auth/runtime.ts`: existing severity-only logger; provider options; auth policy unchanged.
- `app/components/account/sign-in-panel.tsx`: fixed `errorCallbackURL`.
- `node_modules/better-auth/dist/api/routes/callback.mjs`: empty-message exception logging and generic `invalid_code` redirect.
- `node_modules/@better-auth/core/dist/social-providers/google.mjs`: Google token endpoint and validation delegation.
- `node_modules/@better-auth/core/dist/oauth2/validate-authorization-code.mjs`: throws the fetch error object.
- `node_modules/@better-fetch/fetch/dist/index.js`: unsuccessful response produces a plain object with provider JSON fields plus numeric status/statusText.
- `node_modules/@better-auth/core/dist/oauth2/reject-redirects.mjs`: manual redirect refusal. The saved September 22 dry-run bundle already includes this mechanism; no evidence supports blaming unsupported `redirect: error` here.
- `tests/server/auth-runtime.test.ts`: current raw-error redaction contract.
- `tests/helpers/auth-migration-fixture.ts` and `auth-migration-oauth.ts`: genuine state/callback seam with per-test cleanup; installed Vitest restores the original global even after test-local stub replacement.
- `node_modules/wrangler/wrangler-dist/cli.js`: `shouldLogToDisk` at 49773, JSON logger at 49853, disk-write guard at 49923, full pretty/JSON tail event emitters at 240824–240898. These sources require private framing/projection in addition to disabling disk logs.
- Google official token endpoint reference: https://developers.google.com/identity/openid-connect/reference

Self-review: no credential-changing action, unbounded diagnostic field, whole-request capture, source-data migration, public release claim or expanded paid-request authorization is part of this design. Implementation and deployment remain unperformed.

Independent design review proposed two targeted revisions: require the real callback seam and specify safe Wrangler collection. Both are incorporated above. The ignored report is `outputs/cloudflare-migration-20261005/diagnostic-design-review.json`; this design review does not replace implementation SPEC/QUALITY reviews or user design approval.
