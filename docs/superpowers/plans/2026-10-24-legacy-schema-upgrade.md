# Legacy restore schema adaptation implementation plan

Continue the already-authorized full migration after r145's complete native cloud reconstruction. The preceding goal turn made progress: the full old database was rebuilt and verified in the owned Cloudflare account. This is a bounded schema adaptation, not a new application feature or an account merge.

**Goal:** Adapt the isolated old-data copy to the current app's schema, preserving all old values and metadata.

**Design:** Apply the existing, hash-pinned Research migrations 0007 through 0011 from the already-deployed r143 migration set. The old Sites database already contains account recovery and learning agents, so do not rerun its different-numbered migration history. Preserve `__appgarden_migrations`; do not falsely populate a new D1 migration ledger as though the complete modern sequence had run. Native schema and signed local operation evidence establish this adaptation. No Worker will be bound to this database yet.

**Files:** New tools and evidence only under `outputs/local-resource-access-20261024/account-history-r146/`. Reuse accepted typed export/import helpers from r144/r145 and schema comparison from r143 without changing them. Existing source migrations and application code remain unchanged.

## Tasks

- [x] Write a focused test that upgrades an old-schema synthetic database with two account owners, retaining original typed rows and matching the current canonical app schema. Add a refusal case for schema drift/reapplying, ensuring no writes on refusal. Run RED before implementing `schema-upgrade.mjs`.
- [x] Implement fixed migration selection/hash checks and old/new normalized schema comparison. Verify preservation using the accepted typed-row digest. Run the focused checks, including the actual local D1 runtime for the migration sequence.
- [x] Reconstruct the real private r144 snapshot in memory, apply the unchanged migration sequence, compare all original column values and metadata, verify added tables and the two fixed scan-cursor seeds, FK and quick_check. Write only schema/count/hash evidence publicly; retain any full expected typed snapshot in the XF/SYSTEM-only private backup directory.
- [x] Prepare a fixed native wrapper for the new isolated database ID `c4d33a7a-4201-4567-b1ad-988c1a4fd011` only. Check its original schema and empty Research execution tables before a single application. Keep prior source and shadow databases out of write arguments. Capture enough bounded diagnostics to reconcile an uncertain result; never retry application based on a CLI observation alone.
- [x] Obtain one bounded review of this new operation boundary, then apply and fully read back the adapted schema and original data. Mark success only after native evidence; preserve any failure/partial outcome for reconciliation.

## Completion and next scope

Expected end state: 49 business tables plus the two preserved old system metadata tables, with 835 old rows unchanged and 2 new cursor seeds (837 total). The six additional tables, two `research_runs` fields and associated indexes/triggers must structurally match the current app. No auth, account, plan, Research request, public route or secret changes.

Account/history reconciliation remains the next task. Preserve signed Research identities, avoid email-only identity merging, and refresh source snapshots before any actual merge. A final quiet-write export/delta and public release checks are still required. Do not rerun successful paid Research or existing unrelated reviews/tests.
