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
| Same-origin catch-all auth route | pending-code-verification | Build and deploy `/api/auth/[...all]`, then verify GET/POST dispatch without a static-build initialization. |
| Secure production session cookies | pending-code-verification | Confirm `Secure`, `HttpOnly`, `SameSite=Lax`, Arc.-scoped cookie names, refresh, and sign-out on the hosted origin. |
| D1 runtime binding | pending-resource-wiring | Declare logical binding `DB`, deploy a preview, apply the reviewed migration, and verify a prepared read/write. |
| R2 runtime binding | pending-resource-wiring | Declare logical binding `PROOF_ASSETS`, deploy a preview, and verify owner-only put/get/delete behavior. |
| Google callback | blocked-on-owner-credential | Register `https://arc-precision-path.jiahe-xu.chatgpt.site/api/auth/callback/google`, configure the client ID/secret in Sites, then test success, cancellation, invalid state, refresh, and sign-out. |
| GitHub callback | blocked-on-owner-credential | Register `https://arc-precision-path.jiahe-xu.chatgpt.site/api/auth/callback/github`, configure the client ID/secret in Sites, then test success, cancellation, invalid state, refresh, and sign-out. |
| Independent Arc. identity | pending-code-verification | Verify no Arc. route depends on ChatGPT headers, `/signin-with-chatgpt`, or the Sites SIWC client. |
| Production smoke and rollback | pending-release-verification | Both providers, cloud persistence, cross-user denial, migration idempotency, and the previous Sites version must be verified before release. |

## Decision rule

Proceed on Sites while all platform-dependent rows can be verified with same-origin secure cookies and owner-managed secrets. If either external provider cannot complete its hosted flow because Sites cannot preserve the required callback, cookie, or runtime contract, move the identity-bearing worker to the approved owner-controlled Cloudflare deployment without changing the browser API or product interaction model.

## Secret boundary

- Real secrets belong only in Sites production environment variables or an owner-controlled Cloudflare secret store.
- `.env.example` contains names and non-sensitive sample limits only.
- OAuth secrets, session secrets, and model keys must never be serialized into client state, logs, source control, proof payloads, or public share responses.
