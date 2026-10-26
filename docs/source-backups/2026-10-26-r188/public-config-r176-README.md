# Public configuration packet — prepared, not deployed

The previous goal turn made concrete progress: original U6 closure was reconciled, the fresh Executor-only smoke store was verified, the launcher cycle was fixed, and reviewed U7 materials were issued. This continuation prepared actual future release configurations and verified local packaging. Neither turn proves public release or complete Task15 cloud acceptance.

`packet.json` SHA `408bebdcf0d14be27745f5a162f0828c9b2e9d124cbea22a59e22a8d718f2998` pins six configurations and the unchanged r160/r158 artifacts. All129 artifact hashes and sizes match. `dry-run-result.json` SHA `15589b456c5fa794316a5b73a9df39e67908a58c3a6ec7c4e20b4888d1e13be1` records successful strict local packaging for the apex Site and active private Executor. No deploy command without `--dry-run` was run. No domain, DNS, cohort, database or provider mutation occurred.

| File | Future purpose |
| --- | --- |
| site.cutover.closed.json | Set canonical auth origin and exact apex Custom Domain, keep Research closed and shadow entry available during transition |
| executor.public.closed.json | Canonical origin, private Executor, admission/maintenance/Cron closed |
| site.public.closed.json | Apex only after verification, Research closed |
| site.public.active.json | Apex only, Research enabled after final data/login/cohort checks |
| executor.public.active.json | Private service-bound execution and minute maintenance enabled |
| executor.public.drain.json | Stop accepting new work while retaining maintenance for accepted tasks |

The script checks that only origin, exact apex route, Site workers.dev availability, Research switches and maintenance schedule differ from the accepted baseline. It preserves secrets by required names, bindings, placement, saved plan/history, model profile, quotas and budget limits. Current agent-paid submissions allowed: zero. Before a real change, refresh actual versions, DNS/rules, credit usage and cohort row; this local packet grants no new model-spending permission and does not replace those observations.

Use `outputs/local-resource-access-20261025/public-cutover-r163/RUNBOOK.md` for the remaining order: actual Task15 fault/replay completion, old-write freeze/fresh private export, owned backup/business delta preserving the new default, coordinated domain/OAuth transition, then public activation and post-release checks. WWW routing still needs the actual current zone/rules inventory before preparing a mutation; do not overwrite an unobserved ruleset. No production write-quiet window has started.

At2026-10-26T09:44:20Z, U7 terminal/control directories were empty and the local process inventory found no node/PowerShell process with that U7 command scope. Thus this is pending user input, not a verified live-process wait. The already issued `scenario-ops-r7/long-start-command-r1.ps1` remains the sole start command. Do not regenerate it or run it on the user's behalf; C is entered only by the user in its masked prompt. Reinspect actual records on the next turn before interpreting any later answer. Goal remains active and incomplete.
