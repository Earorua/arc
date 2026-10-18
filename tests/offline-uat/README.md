# Arc v8 offline acceptance harness

This is a test entry around the actual Setup, Path, Today, Stack and Proof page
adapters, hooks, HTTP clients, authenticated route factories, services and D1
repositories. Only authentication/session selection and the provider are synthetic.
The authored `FakeResearchProvider` produces Data Product Manager with one
`data-modeling` skill; its displayed dbt source is never fetched by this harness.

Start from the worktree root:

```powershell
node tests/offline-uat/start.mjs
```

Open `http://127.0.0.1:4179/setup`. Stop with Ctrl+C. The port is strict and binds
only to IPv4 loopback. The server never loads the normal Vite configuration,
environment files, OAuth runtime, Cloudflare/Sites plugins or production bindings.
It reads the existing local fonts, PostCSS and CSS. No dependencies are installed.
Vite's isolated optimizer cache is in a dedicated temporary directory.

The initial database contains synthetic users and the local Research cohort only:
**no career goal or planning workspace is seeded**. Authenticated Research and
Flagship Build must perform the actual current-setup activation themselves.
Guest and ordinary custom-role paths retain their actual device behavior.

The collapsed **Offline UAT · test controls** panel is outside product `main`:

- Owner A / Owner B / Guest switches the live session without replacing the page.
- Fake modes include Ready, Needs review, failed, repair, retryable timeout and
  nonretryable content rejection. Disabled and exhausted-budget switches preserve
  the current database. Refresh/reload a product page when a new eligibility read
  is needed. A fresh role avoids a valid existing cache hit in budget-denial cases.
- Reset waits for paused jobs and in-flight product requests, closes the old
  database and creates a fresh one; the control then clears this loopback origin's
  browser storage and opens Setup. The selected synthetic owner is retained.
- Prestart Researching/Validating creates a real owner-bound run and pauses either
  the provider call or **after the Validating transition is committed**. Enter
  Data Product Manager and use the normal Research button to coalesce the active
  ID before reload. Resume settles that same run. This proves active-run recovery,
  **not** refresh recovery for an initial POST that never returned a run ID.
- Clear Research recovery removes only `arc:role-research:v1`. Existing cloud plans
  must still replay through fresh page controllers without an in-memory package.
- Seed unrelated device history writes one real sample completion/proof through
  the existing device store. A Guest Flagship Build can also establish a real local
  planning import candidate before switching to a fresh owner. Diagnostics show
  history counts and presence; activation must leave the device data stored.
- The reduced-motion button applies the actual authored media-rule contents.
  It is explicitly a CSS-branch simulation; it does not change an OS preference.
- Refresh diagnostics displays safe run identities/states, counters, owner goal
  labels, table counts and browser recovery/history presence. It exposes no token,
  raw research package, prompt, model receipt or accounting payload.

All HTTP requests require the exact loopback Host. Unsafe API and control requests
also require same Origin, same-origin Fetch Metadata, JSON content type and the
per-process control nonce. Unknown APIs never forward. Private files and arbitrary
`/@fs/` requests are rejected; only this process's precise Vite optimizer cache is
allowed through `@fs`. The browser's application fetch wrapper and server fetch
deny outbound traffic, a local-only CSP bounds other resources, and external link
navigation is intercepted. These test-only controls do not replace production
authentication or modify product security policy.

Verification commands:

```powershell
npx vitest run tests/offline-uat/security.test.ts tests/offline-uat/composition.test.ts tests/offline-uat/storage-smoke.test.ts
node --test tests/offline-uat/entry.test.mjs
node tests/offline-uat/miniflare-smoke.mjs
npx tsc --noEmit --incremental false
npx eslint tests/offline-uat
```

`storage-smoke.test.ts` uses **real SQLite implementing the D1 interface**, through
the existing test adapter and migrations 0000–0006. The separate Miniflare command
uses an **actual isolated, nonpersistent Miniflare/workerd D1 binding**, without
Wrangler configuration. Both run the same actual fresh-owner Research → activation
→ generation → Complete → fresh/idempotent replay → wrong-owner denial → Proof
submission/withdrawal chain. Both also inject five concurrent plan/goal changes
at the D1 batch boundary and require Conflict, full rollback, zero false success
receipts and zero foreign-key violations. This explicitly checks JSON1 guard
compatibility in workerd, not only in the SQLite adapter.

Fake usage is `null`; the real accounting code conservatively retains its local
budget reservation. This is not evidence of actual provider cost being zero.
The Proof document URL is an authored example stored as text, never fetched.
After withdrawal the server projection is Exploring; with a completed unit the
actual learner presentation may still say Practicing.

Harness launch and these smoke checks alone are not Task 13 completion. Independent
specification and quality/security review, actual 320px/1440px browser UAT, root
full gates, and the operations checkpoint are separate. No live Provider evidence,
user acceptance signature, merge, push, Sites candidate or deployment is claimed.
