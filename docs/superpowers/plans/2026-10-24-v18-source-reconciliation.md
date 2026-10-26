# Preserve public v18 while integrating migration Research

Goal: carry the already published v18 logout, showcase, private intelligence and optional learning-agent features into a local migration candidate without losing the current Research/executor/account-recovery and source-authority work.

Scope: existing isolated `work/v18-integration-r139`. Public commit `e2c012c01d55935c2eb542ebf3fdd6799f1aea5f`, common base `4d122dbc74d2322c17c88c1f4c08294924de1b42`. The prepared normalized three-way comparison has 61 public-only paths, four clean merges, one migration-journal reconciliation and one migration-test conflict. This is source preparation; it does not apply databases, activate paid agents, deploy public DNS or certify a complete old-data export.

1. Refresh the stage with the 21 accepted r139 authority changes and verify all other baseline files, allowing only the already copied public account-menu regression. Retain the prior failed runner result as infrastructure failure (zero tests, temp EPERM). Run that regression with a workspace-local temp directory to demonstrate the actual pre-merge logout gap.
2. Apply the verified public-only files and four clean merges into the stage. Preserve all canonical migrations 0000 through 0012. Reconcile public 0008 learning-agent SQL as a new 0013 migration and snapshot linked to canonical 0012; never import the divergent public migration journal or overwrite canonical snapshots. Keep agents disabled by their existing defaults.
3. Combine migration-safety expectations for both feature lines, then run only affected account/agent/workspace/planning/schema/authority tests and typecheck. Verify the appended migration against an in-memory SQLite database and unchanged prior migration bytes; no cloud writes or real model requests.
4. Review the actual integration boundary once, including source-authority guards, account ownership, defaults, and the new migration. Build a local candidate. Only then integrate the reviewed source into the canonical checkout. Cloud schema or public release remain separate steps after existing export and migration requirements.

No new product design is introduced: this preserves features already live in v18 and the user's approved migration behavior. New source-authority policy remains current; saved-plan history stays unchanged.
