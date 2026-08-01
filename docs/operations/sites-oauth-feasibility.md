# Arc. Sites OAuth feasibility gate

**Status:** primary hosted OAuth flows passed; adversarial and account-linking checks remain open.

**Reviewed:** 2026-08-01

**Production origin:** `https://arc-precision-path.jiahe-xu.chatgpt.site`

Arc. requires an independent public account backed by Google and GitHub. The Sites-provided ChatGPT/SIWC client is intentionally not used as the Arc. product identity.

## Capability record

| Capability | Status | Evidence / completion condition |
| --- | --- | --- |
| Public HTTPS origin | passed | The Sites project is active, public, and currently serves the production origin above. |
| Hosted runtime variables and secrets | passed | Production runtime values are configured through Sites; secret values remain masked, live AI remains disabled, and no model key is present. |
| Same-origin catch-all auth route | passed-hosted | `/api/auth/:all+` completed both hosted provider callbacks and initializes runtime configuration lazily. |
| Secure production session behavior | partial-hosted | Arc. sessions were created over the public HTTPS origin, survived fresh navigation, and Google sign-out removed private session state. Code and tests enforce secure production cookies, database OAuth state, and no implicit linking; GitHub sign-out plus cancellation/invalid-state checks remain. |
| D1 runtime binding | passed-auth-path | The reviewed 19-table migration is packaged and the hosted auth path persists users, accounts, sessions, and OAuth state through D1. Product-workspace mutation smoke tests remain part of the final gate. |
| R2 runtime binding | wired-hosted-flow-pending | `PROOF_ASSETS` is deployed with owner-scoped storage code; verify a private put/get and metadata-compensation path before release. |
| Google callback | primary-flow-passed | Hosted sign-in, callback, session refresh, and Arc. sign-out passed. Cancellation, invalid-state rejection, and second-provider linking remain. |
| GitHub callback | primary-flow-passed | Hosted sign-in, callback, and session refresh passed. Sign-out, cancellation, invalid-state rejection, and second-provider linking remain. |
| Explicit provider linking | passed-code-hosted-pending | The account menu lists connected providers and starts `linkSocial` only from an authenticated Arc. session. A provider already owned by another Arc. user returns a generic recoverable conflict and never merges accounts. The hosted flow awaits deployment of this release candidate. |
| Independent Arc. identity | passed-hosted | Google/GitHub are the only product providers; real hosted sessions contain no ChatGPT identity dependency or reserved SIWC route. |
| Deterministic AI fallback | passed-local-build | The protected preview uses the mock provider only and requires the runtime kill switch, D1 cohort, rate, quota, and budget gates; no live model key is configured. |
| Production smoke and rollback | pending-release-verification | Both providers, cloud persistence, cross-user denial, migration idempotency, and the previous Sites version must be verified before release. |

Because Google and GitHub were each first used as standalone sign-ins before the explicit-linking interface existed, those external identities may currently belong to separate Arc. users. The first hosted link attempt should therefore exercise the required conflict path: no merge, no ownership disclosure, and no change to either account.

## Decision rule

Proceed on Sites while all platform-dependent rows can be verified with same-origin secure cookies and owner-managed secrets. If either external provider cannot complete its hosted flow because Sites cannot preserve the required callback, cookie, or runtime contract, move the identity-bearing worker to the approved owner-controlled Cloudflare deployment without changing the browser API or product interaction model.

## Secret boundary

- Real secrets belong only in Sites production environment variables or an owner-controlled Cloudflare secret store.
- `.env.example` contains names and non-sensitive sample limits only.
- OAuth secrets, session secrets, and model keys must never be serialized into client state, logs, source control, proof payloads, or public share responses.
