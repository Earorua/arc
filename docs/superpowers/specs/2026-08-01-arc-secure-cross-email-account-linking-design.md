# Arc. Secure Cross-Email Account Linking Design

Date: 2026-08-01

Status: Approved design; written specification awaiting review

Target release: Sites version 7

Rollback release: Current public Sites version 6

## 1. Executive summary

Arc. version 7 will allow an authenticated user to connect Google and GitHub accounts whose provider emails differ without weakening the product's no-merge account boundary.

Cross-email linking is dangerous when an existing Arc. session alone authorizes the operation. Version 7 therefore requires a new OAuth round trip through an already connected provider before it permits the user to start the target-provider link. Successful reauthentication creates a server-controlled, single-use authorization grant that expires after five minutes. The grant is consumed atomically before the target OAuth flow begins.

Arc. owns this security protocol. Better Auth continues to own sessions, provider OAuth state, and the final account record, but its generic social-link endpoint cannot be called directly without an Arc.-generated internal proof. Different-email linking is enabled only behind that boundary. Existing Arc. identity fields and learning data are never silently replaced, and two existing Arc. users are never merged.

This specification refines the account-linking rules in the approved Beta Foundation design. All unrelated version 6 behavior remains unchanged.

## 2. Production evidence and problem statement

Sites version 6 is publicly deployed and has passed independent Google and GitHub sign-in. A production test began from a GitHub-authenticated Arc. account, successfully started `POST /api/auth/link-social`, completed Google OAuth, and returned safely with `email_doesn't_match`.

The result was secure but incomplete:

- the GitHub account remained the only connected provider;
- no user, account, profile, or learning data was merged or changed;
- the UI displayed a generic no-change error;
- Better Auth rejected the differing provider email before checking whether the Google identity already belonged to another Arc. user.

The current configuration uses `disableImplicitLinking: true` and `allowDifferentEmails: false`. Simply setting `allowDifferentEmails: true` would make a stolen Arc. session sufficient to attach an attacker-controlled provider identity. Version 7 must add recent proof of control over an already connected identity before relaxing that flag for explicit linking.

## 3. Goals

Version 7 must:

1. support explicit Google-to-GitHub and GitHub-to-Google linking when provider emails differ;
2. require a new OAuth round trip through an already connected source provider;
3. issue a server-controlled grant that is single-use and expires five minutes after successful reauthentication;
4. prevent direct or replayed calls to Better Auth's generic social-link endpoint;
5. preserve the current Arc. user, primary email, name, profile, and learning data;
6. refuse silent merges or ownership transfers when the target provider already belongs to another Arc. user;
7. expose calm, useful success and recovery states without revealing another account's existence or identity;
8. preserve Sites version 6 as a tested rollback point until production verification succeeds.

## 4. Non-goals

Version 7 does not add:

- automatic linking based on matching email;
- merging of two existing Arc. users;
- transfer of an OAuth identity between users;
- password authentication, passkeys, recovery codes, or support-assisted recovery;
- a general account-management center;
- a redesign of provider unlinking;
- a forced provider password prompt, which Google or GitHub may not present when their own session is already active;
- a Better Auth major or beta-version upgrade solely for this feature;
- changes to learning plans, progress, proof, AI, or public-profile behavior.

## 5. Security principles

1. **A session is necessary but insufficient.** The current Arc. session identifies the user; a fresh provider OAuth result proves recent control of an already connected identity.
2. **Fail closed.** Missing, mismatched, expired, replayed, or ambiguous state ends the operation without changing provider ownership.
3. **No implicit linking.** `disableImplicitLinking` remains enabled. Only the explicit Arc. protocol may invoke cross-email linking.
4. **One intent, one attempt.** A verified grant starts the target flow at most once. Cancellation or failure requires reauthentication again.
5. **No merge and no transfer.** A provider identity already owned by another Arc. user remains there.
6. **Minimize disclosure.** Browser-visible state never identifies another user, provider email, internal account ID, or precise ownership conflict.
7. **Keep credentials server-side.** Raw intent credentials never enter D1, URLs, JavaScript-readable storage, analytics, or ordinary logs.
8. **Preserve existing identity.** Linking does not update the Arc. user's name, primary email, image, or profile fields.

## 6. Architecture

```text
Account menu
  |
  | POST create / verify / continue
  v
Arc. account-link gateway
  |-- authenticates the Arc. session
  |-- owns intent state and transitions
  |-- creates short-lived internal proofs
  |-- returns only safe status projections
  |
  +--> D1 account_link_intents repository
  |
  +--> source-provider OAuth reauthentication
  |      \--> callback validation against the existing Arc. identity
  |
  +--> guarded Better Auth link-social flow
         \--> Google or GitHub callback
                \--> Better Auth account uniqueness rules
```

### 6.1 Account-link gateway

The gateway is the only browser-facing entry point for explicit account linking. It has four responsibilities:

- create an intent for the authenticated user and eligible target provider;
- start source-provider reauthentication with server-generated intent context;
- expose a privacy-safe status projection for the account menu;
- atomically consume a verified grant and start the target-provider link.

The browser never calls Better Auth `link-social` directly. The existing generic endpoint remains mounted for Better Auth routing but rejects requests that do not carry a valid, short-lived, server-generated internal proof bound to the intent, user, provider, phase, and expiry.

### 6.2 Reauthentication adapter

Source-provider reauthentication is logically separate from sign-in and target linking. It must complete a fresh OAuth authorization round trip and confirm that the returned provider account is already mapped to the intent's Arc. user.

The implementation may reuse Better Auth's provider client, OAuth state storage, and callback hooks, but it must not create a new Arc. user, attach a provider, or replace the intended user before verification succeeds. If the chosen provider account maps to a different Arc. user or to no account owned by the intent user, reauthentication fails and the grant is not issued.

The provider may reuse its own active login and omit a password prompt. Arc. promises a fresh OAuth round trip, not a fresh password challenge.

### 6.3 Guarded final link

The final link continues to use Better Auth's account creation and uniqueness behavior. Version 7 sets `allowDifferentEmails: true` only together with all of the following controls:

- `disableImplicitLinking: true` remains enabled;
- every explicit `link-social` request must pass the Arc. internal-proof guard;
- the proof must refer to a verified, unexpired, unconsumed intent owned by the current session user;
- the target provider must match the intent;
- the intent is consumed atomically before an authorization URL is returned;
- `updateUserInfoOnLink` remains disabled;
- an existing provider identity owned by a different user produces a terminal no-merge conflict.

The gateway calls the Better Auth server API in-process and supplies the proof only on that internal call; it is never returned with the provider authorization URL. The proof key is domain-separated from the existing authentication secret with HKDF context `arc-account-link-internal-proof-v1`, so the feature introduces neither a browser-visible secret nor cross-protocol reuse of raw authentication key material. Proofs have a maximum lifetime of 60 seconds and include a unique nonce. An external client can copy the shape of the internal header but cannot create a valid proof because signing material never leaves the Worker runtime.

## 7. Intent data model

Add an `account_link_intents` table with these logical fields:

| Field | Purpose |
| --- | --- |
| `id` | opaque server-generated identifier |
| `tokenHash` | one-way digest of the high-entropy browser credential; unique |
| `userId` | Arc. user that owns the operation |
| `sourceProvider` | already connected provider used for reauthentication |
| `targetProvider` | provider requested for linking |
| `status` | current state-machine value |
| `expiresAt` | current phase deadline |
| `verifiedAt` | successful source-provider callback time |
| `consumedAt` | target-link start time |
| `completedAt` | successful target-link callback time |
| `failureCode` | sanitized internal category, never raw provider text |
| `createdAt` | creation time |
| `updatedAt` | latest transition time |

Foreign-key deletion follows the existing user-retention policy. The table stores no provider access token, provider email, OAuth authorization code, raw browser credential, or internal signature.

The raw credential is a cryptographically random value held only in a `Secure`, `HttpOnly`, `SameSite=Lax`, host-only cookie with `Path=/`. JavaScript cannot read it. D1 stores only its digest. The cookie is cleared on success, terminal failure, cancellation detected by Arc., and explicit restart; expiry remains a final cleanup boundary.

At most one active intent for a user-target pair is allowed by transactional invalidation of any older active intent before creation. Every state transition uses a compare-and-set update so concurrent requests cannot advance the same intent twice.

## 8. State machine and timing

```text
pending_reauth
  | source identity matches
  v
verified -- five-minute grant --> expired
  | atomic Continue action
  v
consumed
  | target callback succeeds and identity is unowned
  v
completed

Any phase may end as failed when validation fails.
```

Allowed transitions are:

- `pending_reauth -> verified`
- `pending_reauth -> failed | expired`
- `verified -> consumed | failed | expired`
- `consumed -> completed | failed`

`completed`, `failed`, and `expired` are terminal. A consumed intent cannot return to verified.

The pending reauthentication attempt uses a ten-minute cleanup deadline. When source reauthentication succeeds, `expiresAt` is replaced with `verifiedAt + 5 minutes`. The user must start the target OAuth flow before that five-minute deadline. Atomic consumption ends the Arc. grant; the subsequently created Better Auth OAuth state controls the one-time target callback and its own bounded expiry. If target authorization is cancelled, rejected, invalid, or abandoned, the consumed grant is not reusable.

Expiry may be materialized lazily when an intent is read or advanced, with later scheduled cleanup of terminal rows. Security never depends on cleanup running on time because every transition compares the stored deadline with the server clock.

## 9. End-to-end interaction flow

### 9.1 Start

The account menu continues to show connected providers and only eligible unconnected providers. Selecting `Link Google` or `Link GitHub` opens a restrained confirmation panel:

> You're signed in with GitHub. Verify GitHub before linking Google.

The source label changes appropriately for the opposite direction. The primary action is `Verify GitHub`; the secondary action is `Cancel`.

On submit, the gateway validates the session, confirms that the source identity belongs to the user, confirms that the target is configured and not already connected, invalidates an older active intent for the same user-target pair, creates a new intent, sets the HttpOnly cookie, and starts source-provider OAuth.

### 9.2 Verification result

The callback validates provider OAuth state, the intent cookie digest, current Arc. user, source provider, returned provider account, status, and expiry. Any intent reference carried in Better Auth `additionalData` is treated as an untrusted locator until it matches the cookie digest, signed server context, D1 row, session user, provider, phase, and deadline. Success changes the intent to `verified`, sets the five-minute deadline, and redirects to `/today?link=verified`.

The account menu reads the safe status endpoint and shows:

> Identity verified

The primary action is `Continue to Google`. Target OAuth does not start automatically from a GET request. This prevents browser prefetch, restoration, or refresh from consuming the grant. After the notice is rendered, the UI removes the non-sensitive `link` query parameter with history replacement so refresh does not repeat stale messaging.

The status endpoint returns only the stage, target provider, and expiry needed for display. It never returns the intent ID, credential digest, provider account ID, source email, target email, or internal proof.

### 9.3 Continue

`Continue to Google` submits a POST to the gateway. The gateway validates the session and cookie, then performs a single conditional update from `verified` to `consumed`. Only the request that changes one row may create the internal proof and request the target authorization URL. Duplicate, concurrent, expired, or replayed requests fail safely.

### 9.4 Completion

On successful target callback, Better Auth creates the provider account for the existing Arc. user, the intent becomes `completed`, and the cookie is cleared. The UI refreshes its provider list and displays:

> Google connected. You can now sign in with either provider.

The user's existing name, primary email, image, profile, and learning state remain unchanged.

If the target provider account already belongs to another Arc. user, Better Auth's ownership constraint remains authoritative. Arc. maps the result to a generic conflict, marks the intent failed, clears the cookie, and changes neither user.

## 10. Failure behavior and user copy

All failures preserve the user's existing account and data. Provider-specific errors and internal validation details are sanitized before they reach the browser.

| Condition | Terminal behavior | User message |
| --- | --- | --- |
| source reauthentication rejected, mismatched, or invalid | mark failed; no grant | `We couldn't verify your current sign-in. Nothing changed.` |
| verified grant expired | mark expired; require restart | `Verification expired. Start again.` |
| user cancels a recognized phase | invalidate or leave consumed; clear local continuation state | `Connection cancelled. Nothing changed.` |
| target identity belongs to another user | mark failed; no merge or transfer | `This sign-in method can't be connected to this account.` |
| target callback invalid or provider unavailable | mark failed when safely attributable; otherwise keep the grant irreversibly consumed and allow a new verified flow to supersede it | `We couldn't connect this sign-in method. Nothing changed.` |
| user returns after abandoning a consumed target flow | offer a fresh start; never reactivate the old grant | `Connection wasn't completed. Start again.` |
| direct, forged, wrong-user, wrong-provider, or replayed request | deny without mutation | generic retry message; detailed category only in sanitized server diagnostics |
| success | mark completed; refresh accounts | `Google connected. You can now sign in with either provider.` |

Only the provider name changes in direction-specific copy. No message states that another Arc. user exists or reveals which email owns an identity.

## 11. Threat model and required controls

| Threat | Required control |
| --- | --- |
| stolen but otherwise valid Arc. session | fresh source-provider OAuth round trip before a grant exists |
| direct call to Better Auth `link-social` | global server-side guard requiring a valid Arc. internal proof |
| forged internal header | keyed signature over intent, user, provider, phase, expiry, and nonce using server-only material |
| CSRF or login-CSRF | same-site HttpOnly cookie, provider OAuth state, origin checks, POST-only mutations, and session binding |
| raw-token theft from D1 | D1 stores only a one-way digest of a high-entropy credential |
| URL or analytics leakage | no raw credential, signature, provider email, or account ID in URL/query parameters |
| replay | compare-and-set state transitions and single-use provider OAuth state |
| duplicate click or concurrent request | exactly one `verified -> consumed` update may succeed |
| wrong connected provider selected during reauthentication | returned provider account must map to the intent user and source provider |
| session changes during the flow | every mutable step rebinds to the current authenticated user and fails on mismatch |
| expired browser page | server clock and stored expiry are authoritative |
| target provider already owned | database uniqueness plus no-merge error mapping |
| profile takeover through link metadata | provider profile updates on link remain disabled |
| sensitive diagnostic leakage | stable failure codes, surrogate user identifiers, and no tokens, emails, or provider payloads in ordinary logs |

## 12. Component boundaries

Implementation should keep the feature in focused units:

| Unit | Responsibility | Depends on |
| --- | --- | --- |
| intent domain | states, deadlines, allowed transitions, safe projections | server clock and typed values only |
| intent repository | creation, lookup by digest, invalidation, compare-and-set transitions | D1/Drizzle |
| internal-proof service | create and verify short-lived signed proofs | server-only signing material |
| reauthentication service | start source OAuth and validate returned identity | provider adapter, intent service |
| link gateway routes | authenticate, orchestrate, normalize responses | domain services and Better Auth server API |
| Better Auth guard/hooks | deny bypass, bind OAuth state, settle callback results | proof and intent services |
| account-link UI | confirmation, verified continuation, notices, accessibility | safe gateway/status contract |

Route handlers and React components must not implement state transitions themselves. Better Auth hooks must delegate domain decisions rather than embedding D1 queries and copy mapping inline.

## 13. Testing strategy

### 13.1 Domain and persistence tests

- every allowed state transition and rejection of every disallowed transition;
- the five-minute boundary immediately before, at, and after expiry;
- the ten-minute pending-reauth cleanup boundary;
- terminal states cannot be revived;
- an older active intent is invalidated when a new one is created;
- lookup uses the credential digest rather than a raw token;
- conditional consume succeeds once under duplicate and concurrent requests;
- migration generation contains no destructive table or column drop unrelated to this feature.

### 13.2 Gateway and security tests

- unauthenticated, expired-session, wrong-user, wrong-provider, wrong-phase, missing-cookie, and expired-intent requests are denied;
- the public Better Auth link endpoint is denied without internal proof;
- malformed, expired, replayed, wrong-intent, and wrong-provider proofs are denied;
- browser-supplied `additionalData` cannot manufacture trusted intent context;
- source reauthentication must resolve to an existing source-provider account owned by the same Arc. user;
- direct target linking cannot bypass the verified and atomically consumed grant;
- logs and serialized responses contain no raw credential, signature, authorization code, access token, provider email, or provider account ID;
- `disableImplicitLinking` stays enabled and profile updates on link stay disabled.

### 13.3 Callback and integration tests

- GitHub-authenticated user links an unowned Google identity with the same email;
- GitHub-authenticated user links an unowned Google identity with a different email;
- Google-authenticated user links an unowned GitHub identity with a different email;
- target identity already owned by another Arc. user produces no merge and no data mutation;
- choosing a different source-provider identity fails reauthentication;
- source cancellation, target cancellation, callback error, invalid OAuth state, network failure, stale tab, duplicate click, and refresh are recoverable;
- a consumed grant cannot be reused after target cancellation;
- success preserves the original Arc. primary email, name, image, profile, and learning records;
- after sign-out, either linked provider can independently sign back into the same Arc. user.

### 13.4 UI and accessibility tests

- only configured, unconnected providers are offered;
- the confirmation, verified, loading, success, conflict, cancellation, and expiry states use approved copy;
- no GET or render path starts target OAuth;
- focus enters the confirmation panel, returns predictably on close, and moves to the result notice after callback;
- all actions work by keyboard and expose useful accessible names and live-region announcements;
- reduced-motion behavior and narrow mobile layouts remain consistent with Warm Precision;
- the non-sensitive result query parameter is removed after display and is not replayed on refresh.

### 13.5 Release verification

The release candidate must pass the focused tests, the complete existing suite, ESLint, `tsc --noEmit`, the five-stage Vinext production build, rendered-HTML checks, migration review, and client/server secret-boundary scans. The current baseline of 51 files and 244 tests may grow, but no existing check may be removed merely to reach green status.

## 14. Observability and retention

Security-relevant events use stable categories such as intent created, source verified, grant consumed, link completed, link conflict, expired, replay denied, and bypass denied. Records may include request ID, intent surrogate, provider category, phase, result code, and timing. They must not contain raw credentials, signatures, provider tokens, authorization codes, full provider responses, or provider emails.

Terminal intents are retained only for the minimum operational window needed to diagnose the beta and then deleted by a bounded cleanup process. A consumed intent whose target OAuth state can no longer complete is also cleanup-eligible and remains permanently unusable. Retention duration is runtime policy rather than UI behavior. Cleanup failure cannot reactivate an intent.

## 15. Visual and interaction requirements

Account linking remains subordinate to the learning experience. It uses the existing account menu rather than a new settings route. Surfaces follow Warm Precision:

- compact editorial copy rather than security jargon;
- one primary action per state;
- ivory and charcoal foundations with restrained vermilion emphasis;
- no celebratory animation that competes with Today;
- visible but quiet progress through `Verify` and `Continue`;
- mobile-safe panel sizing and touch targets;
- keyboard access, visible focus, screen-reader status announcements, and reduced motion.

The experience must make the second authorization intentional without turning account linking into a multi-page wizard.

## 16. Release and rollback plan

1. Implement and verify the feature locally without changing the public version.
2. Run the complete automated and build verification matrix.
3. Save the verified artifact as Sites version 7 without publishing it.
4. Report verification evidence, remaining limitations, and the exact saved version to the user.
5. Publish version 7 only after separate, explicit approval.
6. Run production checks in this order: existing-provider sign-in, source reauthentication, unowned cross-email link where a safe test identity is available, conflict/no-merge path, sign-out, and sign-in with each linked provider.
7. Stop testing and restore version 6 if production shows an ownership mutation, bypass, replay, account switch, inaccessible account, critical UI failure, or other security invariant violation.

Ordinary provider cancellation or an expected no-merge conflict is not a rollback condition when the account remains unchanged and the recovery message is correct.

## 17. Acceptance criteria

Version 7 is ready for deployment approval only when:

- cross-email linking cannot begin from an Arc. session alone;
- source-provider reauthentication proves an account already owned by the same Arc. user;
- the resulting grant is server-controlled, single-use, and expires five minutes after verification;
- direct and forged calls to the generic link endpoint are rejected;
- duplicate, concurrent, expired, and replayed attempts cause no second link operation;
- an unowned target identity can link despite a different provider email;
- a target identity owned by another user is never merged, transferred, or disclosed;
- linking preserves existing Arc. identity fields and all learning data;
- cancellation and every tested failure leave the account usable and unchanged;
- either linked provider signs into the same Arc. user after sign-out;
- the complete automated, build, migration, accessibility, and secret-boundary verification suite passes;
- version 7 is saved separately and version 6 remains available for rollback;
- production publication occurs only after explicit user approval.

## 18. Decision record

- Chosen approach: current-provider OAuth reauthentication followed by a server-side single-use grant.
- Rejected approach: relying only on a fresh Arc. session, because a stolen session could attach an attacker-controlled provider.
- Deferred approach: a general account merge center, because it requires independent recovery, provenance, conflict-resolution, and audit design.
- Grant duration: five minutes from successful source reauthentication.
- Grant consumption: atomic and irreversible before the target OAuth flow starts.
- Cross-email setting: permitted only for explicit, guarded linking; implicit linking remains disabled.
- Ownership conflict: no merge, no transfer, and no disclosure.
- Profile behavior: the original Arc. user fields remain authoritative.
- UX: explicit `Verify` and `Continue` actions in the existing account menu.
- Release: save version 7 first; public deployment requires separate approval; retain version 6 for rollback.
