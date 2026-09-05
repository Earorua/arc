# Arc v8 Goal 2 — offline acceptance record

Status: **Preparation only. Task 11 is in progress; Task 13 gates and browser UAT have not run.**

This record distinguishes engineering checks, browser observations, and user acceptance. A pending row is not acceptance evidence. The latest completed prerequisite is Task 10: code `0cdfe0ac565d5e15da9c6d16730ed38fe27105a4`, closure checkpoint `3be96e9ad32251ef177739fb79c514fb42384a47`. Its verification is recorded in the resume checkpoint and must not be substituted for the final Task 13 gate.

## Execution boundary

- Worktree: `C:\Users\XF\Documents\Codex\2026-07-26\sites-plugin-sites-openai-bundled-2\.worktrees\v8-openrouter-research-beta`.
- Branch: `codex/v8-openrouter-research-beta`.
- Only authored Fake Provider results and disposable local databases are permitted.
- No real credentials, real or paid Provider calls, production variables/flags/D1/R2, merge into `master`, push, Sites candidate, or deployment.
- Live Provider evidence and explicit user acceptance remain separate, unperformed gates.

## Final automated gates

Record the exact tested commit, clean-tree status, command exit codes, and actual counts after Task 11 has passed both independent reviews.

| Gate | Result |
| --- | --- |
| Full unit suite | Pending |
| Full ESLint | Pending |
| TypeScript without incremental caching | Pending |
| Local production build | Pending |
| Rendered HTML and client bundle checks | Pending |
| Explicit migration/security suite | Pending |
| Committed-source secret and production-boundary scans | Pending |
| Diff check | Pending |
| Independent Task 11 specification review | Pending |
| Independent Task 11 quality/security review | Pending |

## Browser composition and evidence limits

The planned isolated loopback harness mounts the actual Setup, Path, Today, Stack, and Proof page adapters, hooks, clients, route handlers, services, and repositories. It substitutes local test sessions and `FakeResearchProvider` through a test-only entry point. It does not load production environment files or normal deployment configuration. Unknown API routes and outbound application requests must fail closed.

The existing SQLite test helper implements the D1 interface against real SQLite. This is distinct from the separate, nonpersistent Miniflare/workerd D1 check. Record both separately; neither is production D1 evidence.

For an active Researching/Validating refresh scenario, the harness first pauses a genuinely persisted owner-bound run. The ordinary Research action coalesces onto that run and receives its ID before reload. This verifies active-run replay and recovery by GET. It does not prove that the browser can recover an initial POST which has never returned a run ID.

Browser observations must use ordinary visible controls. Read-only DOM measurements support, but do not replace, visual inspection. Record the actual reduced-motion test mechanism; do not imply that the system preference was changed when only CSS or component contracts were tested.

## Functional and visual inventory

| Scenario | Observable acceptance criteria | Result |
| --- | --- | --- |
| Guest Flagship | Role confirmation, real skill audit, availability, target and Build lead to usable Path and Today. | Pending |
| Eligible custom role | Explicit Research action reaches Ready; summary, skill/source counts, observed date and quality check are visible; Use opens the research skill audit and builds a research-backed plan. | Pending |
| Research workspace | Path shows research phase/unit content; Today shows research resource, steps and minutes; Stack and Proof show researched skills; heading uses the researched role. Refresh preserves the same source with no browser-stored package. | Pending |
| Active refresh recovery | Researching and Validating each survive reload after receipt of the persisted run ID; recovery does not create another Provider call. | Pending |
| Needs review | Stable issues appear; Use is absent; only allowed Retry and Flagship actions are offered; retry can reach a usable terminal state. | Pending |
| Failed | Retryable and non-retryable failures have distinct valid actions; terminal state survives refresh; no raw Provider detail appears. | Pending |
| Disabled and exhausted budget | New Research is unavailable or safely rejected; Flagship remains usable; existing owner research plans and replay remain intact. | Pending |
| Complete and replan | Complete persists; Delay proposes a real research-registry diff; Keep and Accept both work; fresh page/controller replay retains the corresponding decision. | Pending |
| Proof evidence | A completed research unit remains linkable; submitted evidence projects onto the researched skill; withdrawal updates the projection without foreign skills. | Pending |
| Owner isolation | Switching to another synthetic owner immediately removes the prior owner's source-derived content; the other owner's GET cannot read the first run; returning to the owner restores authorized data. | Pending |
| Narrow and wide layouts | Setup research region is one column at 320px and has clear hierarchy at 1440px; controls and content are readable without horizontal clipping; screenshots and element bounds agree. | Pending |
| Keyboard and live state | Keyboard reaches each action; focus follows status/stage transitions; polite live state and busy/alert semantics are correct; action targets are at least 44px. | Pending |
| Reduced motion | Verify the authored reduced-motion branch suppresses research transitions; record browser versus contract evidence precisely. | Pending |
| Interrupted initial submission | Leaving/hiding Setup before the first response returns to an actionable state; explicit resubmission reuses its mutation; resume alone sends no new POST. | Pending |
| Source change during Build | A stale async preflight cannot save an old role/source or navigate after source/account change; ordinary Back preserves edits for the same source. | Pending |

## Disposable storage verification

| Storage path | Required evidence | Result |
| --- | --- | --- |
| SQLite implementing D1 | Real migrations and repository/services; research generation, events/replan, fresh-service replay, owner isolation, and no foreign-key errors. | Pending |
| Local Miniflare/workerd D1 | Isolated nonpersistent binding; migrations, Ready package, planning generation/event/replay and owner isolation; dispose binding after execution. | Pending |

## Remaining gates

Agent-assisted engineering UAT: pending. Explicit user acceptance: pending. Live Provider evidence: not authorized and not performed. Merge, push, production configuration/storage changes, Sites candidate and deployment: not authorized and not performed.

Do not describe Goal 2 as fully complete while the applicable remaining gates are outstanding.
