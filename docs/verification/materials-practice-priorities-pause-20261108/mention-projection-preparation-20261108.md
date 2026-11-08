# Next integration inventory — read-only preparation

This is preparation for the already-required mention-production integration, not implementation or acceptance. Finish and archive the experience-priority batch first. Offline only; old model authorizations remain expired.

## Current consumers located

- `app/contracts/documents.ts`: `GROUNDED_MATERIAL_REVIEW_PROJECTION = grounded-skill-labels-v2`; review draft schema currently permits only this optional projection marker.
- `app/server/documents/policy.ts`: `KIMI_GROUNDED_TERMS_POLICY_ID = materials-openrouter-kimi-k31-pro-mxfp4-zdr-extractive-v2`.
- `worker/document-executor/source-span-extraction.ts`: explicit v1/v2 policy-to-format selection; strict format schemas; v2 uses `groundMaterialSkillTerms`; quotation/complete-statement, self-level and requirement checks must remain intact. Its wire shape still contains model-nominated short literal `skillTerms`.
- `app/server/documents/extraction-validator.ts`: server-owned stored envelope selects literal-v1 or grounded-v2 from provider policy; legacy unwrapped captures retain legacy projection. Stored history must not be reinterpreted as a new projection. First projection currently filters labels via `supportsReviewedSkillLabel` and forwards hints for retained labels; verify new projection also rechecks personal level evidence independently of the provider decoder.
- `app/lib/materials/skill-labels.ts`: `supportsReviewedSkillLabel` uses affirmative `findMaterialSkillEvidence` for v2, literal matching otherwise. `labelForAddedSourceTerm` currently has no projection argument and always uses affirmative grounding. `retainedMaterialSelfAssessmentHints` checks evidence for v2 or user-edited facts; a new projection must retain that safeguard.
- `app/server/documents/review-service.ts`: SQL extraction envelope marker and original candidate kinds are read for v2; edit/add-term validation, source correction, reclassification and output metadata explicitly test the v2 marker. New projection handling must be version-specific rather than relabeling older captures.
- `app/components/materials/material-confirmation.tsx`: owns `AddSourceTerm`, calls the currently unversioned `labelForAddedSourceTerm`, filters edited labels through `supportsReviewedSkillLabel`, and uses affirmative `findMaterialSkillEvidence` to display the original phrase. These must follow the server-selected projection; the client must never select or overwrite that projection. `material-text-panel.tsx` already recomputes retained hints using the draft marker.
- `app/lib/materials/grounded-skill-terms.ts`: independently reviewed `findMaterialSkillMention` / `groundMaterialSkillMentions` exist, but are not production consumers yet. Affirmative APIs must remain available to historical consumers and level evidence.

Existing test entry points discovered (do not guess `tests/worker`): `tests/server/document-source-span-provider.test.ts`, `document-source-review-evidence.test.ts`, `document-review-draft.test.ts`, `document-policy.test.ts`; `tests/components/material-source-term-correction.test.tsx`; `tests/lib/materials/material-skill-mentions.test.ts`, `grounded-skill-terms.test.ts`, `retained-assessment-hints.test.ts`.

Executor policy plumbing is already centralized: `provider-http.ts` calls `sourceSpanPolicy`, rejects unknown IDs in the source-span policy prefix, and passes the selected format to the decoder. `generation-receipt.ts` also reads this explicit policy selection. The next implementation should add an explicit new policy/format and server-owned review marker, preserving v1/v2 dispatch, rather than swapping the matcher under an existing identifier. No live configuration or old authorization may be activated by adding this offline code.

## Required behavior already in the source-mention plan

Retain nominated negative/other/future topics through decoder → server projection → user review and edits, while personal experience, level suggestions, explicit learning-intent adoption and explicit plan acceptance remain separate decisions. Preserve empty retained-label lists, term deletion, manual additions tied to original source, citation bounds, actor/negation/time qualifiers and all ownership/version/expiry guards. No new automatic `uncertain` level from a negative statement. Legacy, literal-v1 and grounded-v2 historical envelopes keep their existing meaning.

Known original three observations and reference plan: `docs/superpowers/plans/2026-11-08-materials-source-mention-boundary.md`. Two lexical fixes already reach v2; the remaining negative task requires the new versioned integration. Do not change old frozen references or claim model/Gate acceptance.
