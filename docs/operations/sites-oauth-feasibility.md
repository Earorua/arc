# Arc. Sites OAuth feasibility gate

**Status:** implementation gate open; owner credentials are still required for live provider validation.

**Reviewed:** 2026-07-28

**Production origin:** `https://arc-precision-path.jiahe-xu.chatgpt.site`

Arc. requires an independent public account backed by Google and GitHub. The Sites-provided ChatGPT/SIWC client is intentionally not used as the Arc. product identity.

## Capability record

| Capability | Status | Evidence / completion condition |
| --- | --- | --- |
| Public HTTPS origin | passed | The Sites project is active, public, and currently serves the production origin above. |
| Hosted runtime variables and secrets | passed | The Sites project exposes production environment-variable management. Revision `0` currently contains no entries; no secret value was read or written during this check. |
| Same-origin catch-all auth route | passed-local-build | `/api/auth/:all+` is present in the production route manifest and initializes runtime configuration lazily; hosted GET/POST dispatch remains part of preview validation. |
| Secure production session cookies | passed-code-hosted-pending | Auth policy tests require `Secure`, `HttpOnly`, `SameSite=Lax`, Arc.-scoped cookie names, database OAuth state, and no implicit account linking. Hosted refresh and sign-out still require provider credentials. |
| D1 runtime binding | declared-preview-pending | `.openai/hosting.json` declares logical binding `DB`; apply the reviewed 19-table migration in an isolated preview and verify prepared read/write before release. |
| R2 runtime binding | declared-preview-pending | `.openai/hosting.json` declares logical binding `PROOF_ASSETS`; verify private owner-only put/get/delete and metadata compensation in an isolated preview before release. |
| Google callback | blocked-on-owner-credential | Register `https://arc-precision-path.jiahe-xu.chatgpt.site/api/auth/callback/google`, configure the client ID/secret in Sites, then test success, cancellation, invalid state, refresh, and sign-out. |
| GitHub callback | blocked-on-owner-credential | Register `https://arc-precision-path.jiahe-xu.chatgpt.site/api/auth/callback/github`, configure the client ID/secret in Sites, then test success, cancellation, invalid state, refresh, and sign-out. |
| Independent Arc. identity | passed-code-hosted-pending | Google/GitHub are the only product providers; ChatGPT identity helpers and reserved SIWC routes are absent. Hosted callbacks remain credential-gated. |
| Deterministic AI fallback | passed-local-build | The protected preview uses the mock provider only and requires the runtime kill switch, D1 cohort, rate, quota, and budget gates; no live model key is configured. |
| Production smoke and rollback | pending-release-verification | Both providers, cloud persistence, cross-user denial, migration idempotency, and the previous Sites version must be verified before release. |

## Decision rule

Proceed on Sites while all platform-dependent rows can be verified with same-origin secure cookies and owner-managed secrets. If either external provider cannot complete its hosted flow because Sites cannot preserve the required callback, cookie, or runtime contract, move the identity-bearing worker to the approved owner-controlled Cloudflare deployment without changing the browser API or product interaction model.

## Secret boundary

- Real secrets belong only in Sites production environment variables or an owner-controlled Cloudflare secret store.
- `.env.example` contains names and non-sensitive sample limits only.
- OAuth secrets, session secrets, and model keys must never be serialized into client state, logs, source control, proof payloads, or public share responses.
