# Dual learning agents implementation plan

> **For agentic workers:** Execute in this isolated worktree with test-first implementation and independent specification/quality review. The user approved the conversational design and requested building on 2026-10-14.

**Goal:** Add a deep learning planner and a persistent, minimizable tutoring companion to Arc.

**Architecture:** The existing Setup establishes a validated source, audit and deterministic base plan. The planner reads that catalog and learner state, produces a strategy and dependency-valid priority order, and proposes a replayable event; the existing diff/accept flow activates it. Tutoring reads the same current workspace and owner/goal-scoped history. OpenAI Responses background jobs persist provider identifiers for recovery; tutoring streams only public answer deltas. The existing Research executor is left intact.

**Tech Stack:** React 19, TypeScript, Zod, Cloudflare Workers/D1, OpenAI Responses HTTP API, Vitest/Testing Library.

## Boundaries

- Isolated snapshot branch; do not change the source worktree, deployed site, cloud bindings or existing research operations.
- Service-side model configuration: planner gpt-6-astra/max, tutor gpt-6-astra/low, deep tutoring high. No keys in the client, no paid requests in development.
- Agent availability requires an explicit enable flag, key and bounded budgets. Missing configuration is a truthful disabled state.
- Guests can see/minimize the companion; live requests require existing Arc authentication and a current learning goal.
- Planner never invents completion or changes learned-unit records. New roles continue through existing validated Research/Setup.
- A new learner completes Setup, then can request the first deep strategy from the planner. Existing learners can ask for revisions and send a tutoring difficulty to the planner.
- Optional web research stays in the existing validated Research flow; the planner is grounded in its current approved resource catalog.
- Visual thesis: small warm ivory-and-vermilion companion beside a quiet paper-like chat panel; planner page uses the existing editorial typography. Content: current goal, a single planning request, run state, rationale, candidate diff. Motion: companion breathing/blink, brief panel entrance; reduced-motion support.

## Tasks

- [x] 1. Add failing reducer tests for replayable agent_replanned, exact unfinished-unit permutation, dependency precedence, immutable completed history, accept/discard and stale workspace guards. Implement contracts, reducer and guarded planning-service entry.
- [x] 2. Add provider tests for max-effort background Responses, strict structured outputs, safe failures, streamed deltas, cancellation and incomplete output. Implement bounded transport, prompts and typed provider interface.
- [x] 3. Add D1 tests for owner/goal isolation, idempotency, atomic budget reservation, run recovery and stored tutoring history. Add agent_runs schema and additive migration.
- [x] 4. Add service/API tests for authentication, same-origin writes, goal/revision validation, duplicate runs, disabled operation, provider recovery, candidate validation and applying a stored proposal. Implement production composition and routes.
- [x] 5. Add UI tests for companion visibility, minimize/hide/reopen, identity reset, persistence, abort/error handling and planner states. Implement shared context controller, streaming client, chat UI, planner page and site entry points.
- [x] 6. Run relevant regression suites, TypeScript and build; inspect desktop/mobile preview; perform independent spec and quality review and repair actionable issues. Write configuration/verification instructions and report actual remaining deployment/model validation requirements.

## Verification commands

- npm run test:unit -- tests/server/learning-agents.test.ts tests/server/agent-provider.test.ts tests/server/agent-repository.test.ts tests/lib/planning/agent-replanned.test.ts tests/components/agent-companion.test.tsx
- npm run test:unit -- tests/lib/planning tests/server/planning-service.test.ts tests/server/d1-planning-repository.test.ts tests/contracts/planning.test.ts tests/components/plan-diff-review.test.tsx
- npx tsc --noEmit --incremental false
- npm run build
- Browser: open /coach and /today, resize desktop/mobile, open/minimize/hide/reopen companion, navigate without losing state, verify disabled/sign-in state when no live configuration is present.

## References

2026-10-14 amendment: the user selected OpenRouter and immediate planning while keeping the page open. Provider configuration and background recovery in this original plan are superseded by [OpenRouter learning agents](2026-10-14-openrouter-learning-agents.md).

- https://developers.openai.com/api/docs/models/gpt-6-astra
- https://developers.openai.com/api/docs/guides/background
- https://developers.openai.com/api/docs/guides/streaming-responses
