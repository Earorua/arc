# Public Research cohort — prepared, not applied

The fixed remote SELECT confirmed one enabled `role-research-beta` row containing only the previously approved Google owner. `observation.json` retains the exact row and its timestamp. The read wrote zero rows and did not call a provider.

`packet.json` SHA `eab439e3dc7aaaff7b394aede4f6a3ea944ba8c2796a9499d9a3c05487705baa` supplies the missing cohort component of the r176 public configuration packet. `enable.sql` changes only that feature to an empty policy (`{}`), which the accepted application interprets as all authenticated users subject to the other feature switches, authorization, quotas and cost limits. It compares every original column before the UPDATE and returns the actual changed row. Refresh the row at cutover and require exactly one returned row plus native readback; zero rows is stale state, never success.

`restore-restricted.sql.template` requires the actual successful public row's `updated_at` value before it can restore the former restricted scope. It retains a truthful new update timestamp. Keep the original observation for audit. This is a template, not an issued rollback command. Close new admissions before any rollback; existing accepted jobs still require their ordinary drain/settlement.

Local in-memory SQLite validation passed: intended enable and restore each affect one row, stale enable/restore affect zero, and an unrelated flag remains unchanged. This is SQL behavior evidence only. No remote UPDATE, worker deployment, domain change, model request or public activation was performed.

Remaining order stays r163: actual Task15 cloud acceptance; final private export/backup/business-delta and domain/login/isolation checks; fresh credit/config readbacks; then the deliberate public cohort and runtime activation. The prepared statements do not bypass those remaining tasks or authorize another agent-paid Research.
