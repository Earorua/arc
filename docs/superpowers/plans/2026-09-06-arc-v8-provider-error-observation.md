# Arc v8 provider error observation

> Use the existing approved subagent-driven TDD workflow, independent specification review, then quality/security review. Root owns evidence and local commits. This plan authorizes local preparation only, not another authenticated or inference request.

**User-requested pause (2026-09-06):** The user asked to save progress before closing Codex. Implementation and tests have stopped. Only the initial test file exists; the adapter and validation helper are unchanged, and the extraction module does not yet exist. The initial focused command completed with **1 expected RED, exit 1**: callback expected once, received zero, after the existing exception/charge assertions passed. There is no GREEN or completed implementation review. This local checkpoint deliberately preserves the unfinished RED; the last full passing baseline is `748cc264e57a35171b43cfee1f336b6a07e4b139`. Resume from this RED, not from live execution. No test processes remain active.

## Evidence and purpose

On clean `748cc264e57a35171b43cfee1f336b6a07e4b139`, the user ran `-CheckAccountOnly`. The new `outputs/live-research/summary-2026-09-06T05-49-11-188Z.json` reports `completed`, Key/Catalog HTTP 200, `openai/gpt-5.6-sol` listed, limit/remaining USD 5, usage/BYOK USD 0, GET 2, Research/Repair 0. SHA256: `ed18cec0a545bac31b77b0204c9f260c984e30dc1a753b2def8955e7af551b0b`.

The earlier sole authorized Research at 04:23 UTC returned 403; its raw error is unavailable and Activity had no visible record. These newer metadata observations do not establish inference availability, prior final settlement or the cause of that 403. An independent static comparison found no proven request-construction defect. Do not change model, privacy routing, schema, search parameters, credits or proxy settings speculatively.

The [official error reference](https://openrouter.ai/docs/api_reference/errors-and-debugging) documents fixed `error.metadata.error_type` values and both top-level and choice errors. The current adapter already parses a bounded response and rejects these errors, but discards their typed category. Add an optional observer at that existing parsed boundary, avoiding a second response reader, clone, network request or new deadline. Production factories do not opt into the observer. The local helper stores only its flat allowlisted result.

## Bounded implementation

Owned implementation files:

- New `app/server/research/provider-failure-diagnostic.ts`: pure extraction/types only, no imports, network, environment, logging or storage.
- `app/server/research/openrouter-provider.ts`: optional `onFailureDiagnostic` dependency and calls at existing HTTP-non-200, HTTP-200 top-level-error and choice-error rejection paths. Do not change rejection, usage, charged, retryable, deadline or response-reading behavior.
- `scripts/live-research/validation.ts`: nullable `researchFailureDiagnostic` summary field populated by the optional callback with an independent snapshot. Default offline success and key-only reports keep null. Account-only mode is untouched.
- New `tests/server/provider-failure-diagnostic.test.ts`: pure classification, actual adapter and local validation integration fixtures. Existing tests may be read but must remain unchanged unless a direct new-field expectation requires a narrow update.

Diagnostic output contains only:

- `httpStatus`: integer 100–599 or null (do not coerce arbitrary data).
- `location`: fixed `http-error`, `top-level-error` or `choice-error`.
- `errorCode`: integer 100–599 or null, with `errorCodeState`: `recognized`, `missing` or `invalid`.
- `errorType`: exact member of the fixed official enum below, otherwise null, with `errorTypeState`: `recognized`, `missing`, `invalid` or `unrecognized`.

Official enum: `context_length_exceeded`, `max_tokens_exceeded`, `token_limit_exceeded`, `string_too_long`, `authentication`, `permission_denied`, `payment_required`, `rate_limit_exceeded`, `provider_overloaded`, `provider_unavailable`, `invalid_request`, `invalid_prompt`, `not_found`, `precondition_failed`, `payload_too_large`, `unprocessable`, `content_policy_violation`, `refusal`, `invalid_image`, `image_too_large`, `image_too_small`, `unsupported_image_format`, `image_not_found`, `image_download_failed`, `server`, `timeout`, `unmapped`.

Missing/null type is missing; non-string type is invalid; an unknown string is unrecognized. Missing/null code is missing; invalid ranges, non-finite, fractional or non-numeric codes are invalid. An absent/null error container yields missing code/type; a non-null non-record error yields invalid code/type. For a record error, absent/null metadata yields missing type, while non-null non-record metadata yields invalid type. Malformed containers never yield a recognized value. Do not infer any category from HTTP status, message text, string fragments, local budget release or account metadata. Preserve contradictions between HTTP status and an otherwise valid numeric error code as observations, not override instructions.

Never emit message, raw metadata, provider_code, provider/model identifiers from errors, request/generation IDs, headers, prompt/content, flagged_input, reasons or account identity. Unknown values must not be forwarded even if short or plausibly safe. The callback receives only a new flat object containing the above fields; errors or mutation from that observer must not change the original adapter result, exception, audit or charge decision. Isolate synchronous throws and returned rejected promises/thenables without unhandled rejection; never await the observer, so a non-resolving return cannot delay completion. No callback for successful, malformed-JSON or incomplete-body responses; existing HTTP summary remains available where observed. The observation is optional evidence and does not turn any failure into success.

## TDD and review

- [x] Start with discriminating RED via the existing adapter and an optional callback: parsed 403 with permission_denied must yield fixed fields without canary text. Confirm the old adapter failure/charge behavior remains identical. Observed 1 failed assertion / exit 1; initial sandbox process creation failed with EPERM, then the authorized local rerun produced the expected assertion failure.
- [ ] Cover recognized enum, missing/invalid/unknown values, malformed containers, contradictory numeric codes, HTTP 200 top-level/choice errors, normal success, observer exceptions/mutation, invalid JSON/body limits and timeout/cancellation regressions through existing tests.
- [ ] Run focused new tests plus existing openrouter-provider, live-research-validation and live-account-check tests; types and targeted lint. No new subprocess runner or real calls are required.
- [ ] Independent specification review then quality/security review; remediate under TDD until READY with no P0/P1/P2 findings.
- [ ] Root inspect final diff, full unit suite, nonincremental types, targeted lint and diff check. Record scopes and actual evidence, locally commit exact reviewed files, verify clean HEAD. No application UI, schema, persistence or production configuration changes; no deployment/build gate is triggered solely by this optional error observer.

## Handoff and execution boundary

Prepare a credential-free provider-support note containing the two UTC timestamps, model, statuses, no visible Activity and the limited account observation. Do not send it on the user's behalf without explicit authorization. This is the route requiring no new inference request.

After the helper is concretely reviewed and saved, root may request fresh authorization for exactly one further user-run Research using the same fixed Sol model, at most USD 5 total validation budget, no Repair or automatic retry. The fresh key preflight and all existing acceptance gates still apply. Remaining key allowance and the user reporting this read-only run do not themselves authorize that POST. If the new diagnostic lacks a recognized type, keep the cause unknown and use provider support rather than guessing or repeatedly retrying. Key revocation remains unconfirmed and is revisited after the chosen diagnostic route. No merge, push, Sites candidate, production operation or deployment until the original integration gates are met.
