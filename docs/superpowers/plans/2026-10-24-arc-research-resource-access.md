# Research conditional free-access correction

> **For agentic workers:** Follow the existing debugging and TDD workflow; this is one bounded correction to the approved Research source-quality requirements. Preserve the successful r136 cloud run and saved plan.

**Goal:** Stop treating explicitly conditional free courses as verified free learning material, and improve future source selection without another model request.

**Architecture:** Keep the existing non-fetching citation audit. Inspect bounded resource titles and all provider citation titles for explicit free-trial / time-limited / seat-limited course offers. A course or practice resource labelled `free` with one of these signals produces `unverified-free-access` and Needs review. Do not rewrite its price or generated contents. Other resources, paid/mixed courses, old but usable material, and ordinary articles remain valid. This is an uncertainty check, not proof of present availability.

**Tech Stack:** TypeScript, Zod, Vitest, React.

## Evidence and scope

r136 published resource `r-woshipm-bootcamp` is labelled free/course/primary with title `3天数据产品经理新人集训（限时免费）`. The page itself was a 2020 enrollment promotion; current access was not established. Existing code checks cited URLs and self-declared price only. Use the retained published resource as the regression input, inserted into an otherwise valid fixture, to isolate this fault.

The approved design already requires executable learning resources, honest price information and free alternatives. This is a routine correction within that scope. No broader crawler, source-domain denylist, database migration, new secret, paid retry, cloud deployment or rewrite of existing records is included.

## Implementation and verification

- [ ] Save hashes/backups of exactly the touched files from the current release checkout.
- [ ] Add a failing validator regression for the actual r136 resource. Also cover provider-title-only signals, duplicate citations (a benign duplicate must not hide the warning), English trials, ordinary free courses, paid/mixed courses and reference articles.
- [ ] Add failing request assertions for current direct teaching material, honest access/pricing and publisher attribution. Add a UI regression for the new Needs review reason and unavailable Use action.
- [ ] Run these tests and preserve the expected failures before editing application code.
- [ ] Update `app/server/research/source-audit.ts` to return the uncertainty flag after validating all citations; `package-validator.ts` adds the quality reason while retaining normal counts and candidate handling.
- [ ] Add `unverified-free-access` to `app/contracts/research.ts` and plain-language copy in `app/components/setup/role-research-panel.tsx`.
- [ ] Update the shared research instructions in `openrouter-provider.ts`: prefer directly accessible lessons/documentation, avoid enrollment promotions, do not infer current free access from old offers or free trials, classify publisher authority honestly. Do not alter Repair instructions, model, search budget, transport or spending limits.
- [ ] Bump prompt/quality versions in `provider.ts` so future configuration/cache identities reflect the policy change. Keep the provider candidate schema unchanged.
- [ ] Run the focused regression, source audit, package validator, quality contract, orchestrator, production policy, UI and contract suites plus type check. Update only version/request snapshot expectations affected by the intended change; inspect the request delta before accepting a new snapshot.
- [ ] One bounded review of the changed files and test evidence, then a saved checkpoint. Do not restart unrelated login/schema/cloud simulations.

## Limits

This fix catches explicit conditional-access claims; it cannot independently verify every external course or establish ownership of a mirror. Prompt improvements still require later real-result review. Existing r136 data remains available for inspection but is not retroactively labelled validated by the new policy. Public release remains unfinished.
