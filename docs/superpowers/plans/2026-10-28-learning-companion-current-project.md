# Learning companion current-project update

> **For agentic workers:** Use superpowers:subagent-driven-development for implementation and independent specification/quality review. Preserve the shared worktree; do not deploy or call a paid provider from a subtask.

**Goal:** Adapt the approved learning companion to the released Cloudflare/Research application and correct stale task and misleading availability behavior.

**Architecture:** Keep the authenticated same-origin API and OpenRouter transport. Extend its public context using validated planning data; use the same context for the tutor prompt and the existing companion panel. No schema migration or Research executor modification.

**Tech Stack:** TypeScript, React, Vitest, Cloudflare Workers/D1, vinext.

## Task 1 — Context and availability

- [x] Add regression tests in `tests/server/agent-context.test.ts` and `tests/server/learning-agents.test.ts`: use a fixed instant, a generated Research workspace, completed and future tasks, mismatched source metadata, alternatives, and disabled model state.
- [x] Run `node node_modules/vitest/vitest.mjs run tests/server/agent-context.test.ts tests/server/learning-agents.test.ts` and verify failures demonstrate the observed defects.
- [x] Update `app/contracts/agents.ts`, `app/server/agents/context.ts`, `app/server/agents/service.ts`: expose an optional typed `learningContext` payload for backward-compatible UI and a typed availability state. Use planning response validation and planningDateForInstant; select the earliest unfinished required task with scheduledDate <= local date. Include progress and all approved current-task resources, preserve request limits. Reject mismatched Research sources rather than silently using flagship defaults.
- [x] Keep all original AgentWorkspace required fields and stored-run schema intact. Add only optional fields to maintain mixed-version reads during release.
- [x] Run the new tests and existing agent API/provider/configuration/repository tests. Obtain specification and quality review.

## Task 2 — Companion presentation

- [x] Add behavior tests in `tests/components/agent-companion.test.tsx` for Research direction, task and approved links; no task today; missing setup versus disabled model; loading/error without contradictory links; no paid auto-send.
- [x] Update `app/components/agents/agent-companion.tsx` and `agents.css` to present the context compactly within the existing design. Safe external links must use http(s) URLs without embedded credentials. Display course title/provider and preserve mobile panel bounds.
- [x] Replace the code-only shortcut with a broadly applicable task-help prompt. Keep drafted prompts editable and send only on explicit user submit.
- [x] Run component and context lifecycle regressions, typecheck and changed-file lint. Obtain specification and quality review.

## Task 3 — Delivery and verification

- [x] Update `docs/operations/dual-learning-agents.md` with the completed Cloudflare migration, the deployed 0013 migration, and the distinction between Research and the Site learning-agent configuration. Do not add secret values or raise budgets.
- [x] Run all relevant agent/planning/source tests, `node node_modules/typescript/bin/tsc --noEmit --incremental false`, changed-file ESLint, production build and existing SSR checks.
- [x] Inspect local UI using mocked account/context only in a test fixture; verify desktop/narrow behavior and no automatic paid requests.
- [x] Review the complete diff, prepare current Cloudflare publication from a freshly verified production configuration with secrets retained, and document exact outcome/remaining configuration. Do not rerun consumed release tools or restore historical DB data.
- [x] User subsequently requested activation and will enter the Site-only OpenRouter Secret. Prepare explicit enabled/model variables and conservative agent budgets (site daily/monthly 5,000,000, user daily 2,000,000, planner 2,000,000, tutor 500,000 micro-USD). Verify presence only, not secret value. Preserve every existing Research var/binding/secret. Confirm signed-in GET workspace enabled; leave first paid message to user.
