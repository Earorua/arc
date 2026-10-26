# Arc v8 account/history reconciliation

The user authorized full migration and selected the new Research-generated Data Product Manager plan as the default after migration. The old full snapshot is already rebuilt and upgraded in an isolated owned Cloudflare database (r146). This work preserves both histories and keeps the existing Research identity stable.

## Chosen design

Use the current Cloudflare shadow database as the active-data base. Preserve its Google owner ID, Research execution/request/package identities, receipts, quotas and all existing learning records. Exact Google/GitHub provider account IDs and the old completed account-recovery record establish identity, never email similarity. Reconcile the current GitHub login into that Google account using the existing recovery service, whose preconditions and audit behavior remain unchanged. Reauthentication will be required after actual cutover.

Import legacy learning goals and their planning/history rows under that canonical owner. All old goals become archived; the current Research goal remains active. Rewrite only explicit ownership columns and the generation idempotency envelope's ownerId when verified to equal its old row owner. Preserve IDs, payloads, timestamps and plan fingerprints otherwise. Reject unexpected event idempotency, unknown owners, unsupported populated business tables or collisions rather than silently dropping history.

The full legacy clone and private snapshots remain immutable archives of every original record, including old user/profile values, login tokens, recovery/link records, old sessions, operational history and rate limits. Those operational/auth records are not blindly replayed into the live app. Each legacy table receives an explicit disposition in the operation report. No claim of lossless live-table concatenation is made; lossless original archival and an explicit semantic mapping are both required.

Alternative approaches considered: replacing shadow with the old database would lose or complicate the signed Research history; leaving all identities separate would make the same login point to conflicting user IDs. Keeping the current Research owner and importing verified old history is the smallest coherent path.

## Access to history

The current application only reads the active goal. Add an owner-scoped, read-only history entry for archived goals with saved plans, reusing the existing planning repository and source resolver. A history read must not activate a goal, regenerate a plan, call a model, or accept mutations intended for the active goal. Unauthenticated/other-owner access is denied. The normal Today/Path flow continues to display the user-selected Research plan. This UI/API step follows the locally validated mapping; mere database insertion is not sufficient to mark history access complete.

## Verification and operation boundary

First build a local candidate from private snapshots, never mutate live source/shadow data. Validate exact provider/recovery mappings, a single active goal, preserved current Research tables, FK/quick_check, and old/new planning replay using the actual current repository. Synthetic tests cover identity mismatch, collisions/rollback and unsupported envelope rejection without exposing raw data. Private-data rehearsal prints only counts/hashes and fixed error codes.

Refresh snapshots before any cloud application; use a new isolated release candidate database, keep both existing databases intact, and require native full readback before binding a Worker. Account access changes are prepared as a concrete reviewable plan; no live account change is part of the local rehearsal. Public DNS/OAuth cutover and Research fault/replay acceptance remain later work. No new paid call is authorized.
