# Arc v8 account/history reconciliation implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline. One bounded review covers the completed new mapping/operation; do not reopen unchanged app or schema reviews.

**Goal:** Prepare and prove a complete account/history mapping that preserves the new Research plan as default and retains accessible legacy history.

**Architecture:** Current shadow is the active-data base; exact providers plus old recovery establish common ownership. Existing recovery service reconciles the new GitHub login. Explicitly import legacy learning rows, archive old goals, retain the full old clone and original private backups. Validate real repository reads before a new isolated cloud candidate.

**Tech stack:** Node SQLite, existing TypeScript recovery/planning repositories, Vitest, standard Wrangler for read-only snapshot export.

## Local mapping and replay (this batch)

- [x] Refresh the shadow snapshot using standard pinned Wrangler export into the existing ACL-protected private directory. Record only path/hash/counts; verify no active Research and fixed database/account identity.
- [x] Create `outputs/local-resource-access-20261024/account-history-r147/reconcile.test.mjs` with synthetic current/legacy schemas and matched providers. Tests require both providers to resolve to the retained current Google owner, exactly one current active goal, archived old goals, old planning envelope owner remapped, and unchanged current Research-like values. Identity mismatch and unsupported old envelope must reject before modifications; a colliding import must roll back recovery and imports together. Run RED.
- [x] Implement `reconcile.mjs` with fixed table disposition, exact identity checks, the existing pinned recovery service, and an outer local transaction. The D1 adapter supports prepared bind/all/first/run and transactional batch without weakening real recovery predicates. Preserve original column types; archive all operational/auth history in the untouched old clone. Run focused tests GREEN.
- [x] Build the actual private candidate in memory with refreshed shadow and pinned old r144 data. Use the current application planning repository, source resolver, and replay package reader to load both the new Research workspace and old flagship workspace under the canonical owner. Retired/foreign owner reads must not expose them. Print only fixed classifications and counts/hashes. Keep candidate files exclusively in the private backup directory.
- [x] Obtain a bounded independent review of the new mapping and its evidence. Save r147 checkpoint with exact completed work and any remaining gaps; no cloud account merge or paid call yet.

## Subsequent implementation boundary

- [x] Implement the owner-scoped read-only archived-plan history API/view following the existing route authentication and error conventions. Cover owner isolation, no mutation/model calls, and rendering the retained old workspace. Preserve normal active-goal routing.
- [x] Prepare a new isolated release candidate from freshly reconciled snapshots, review the exact cloud operation, apply once, fully read back, then validate authenticated old-history/new-plan access. Do not overwrite the old archive or current shadow.
- [ ] Complete the remaining Research fault/replay work and final quiet-write/delta/public DNS/OAuth cutover and rollback checks.
