# Capability adoption and persistence: read-only diagnosis

Date: 2026-11-09. Checkout: `C:/Users/XF/.codex/worktrees/materials-replan-recovery/ui-warm-precision`. Branch: `codex/materials-replan-recovery-20261106`. HEAD: `1f65e4a483399db8fb6c143e076f3d7523675399`.

The existing product already implements explicit capability-suggestion adoption through the actual setup UI. The full UI-to-server-storage path passed focused offline verification. One separate start-over bookkeeping defect remains: resetting the audit keeps the old reviewed-skill set and resume acknowledgment. Do not describe that defect as missing adoption or missing adoption persistence.

Both required source indices were read: `D:/CodexScratch/arc-source-readme-20261029/SOURCE_INDEX.md` and live `https://github.com/Earorua/arc/blob/master/SOURCE_INDEX.md`. Initial tracked state was clean. This agent changed only ignored diagnostic files. The final tracked changes in `worker/document-executor/source-statements.ts`, `worker/document-executor/source-review-evidence.ts`, and `tests/server/material-numbered-statements.test.ts` belong to the separate numbered-statements author and were preserved.

## Approved behavior and actual callable path

The approved v2.1 spec is `docs/superpowers/specs/2026-09-11-arc-private-materials-personalized-planning-design.zh-CN.md`. Its lines 197, 201, 275, 339, 421, 423, 468, 700, and 757 establish explicit optional adoption, separate fact confirmation, per-skill independent selection, current legal skill mapping, frozen preview inputs, and recoverable edits/adoption. The existing UI satisfies these boundaries without invoking the otherwise library-tested `adoptMaterialSelfAssessments` helper.

1. `app/components/materials/material-text-panel.tsx:44` (`readEditorReview`) loads the server review draft. Its restoration effect around line 161 reads the document and review. `saveReview` at line 369 updates the visible draft optimistically, drops unsupported hints immediately, serializes saves, and uses edit/lifecycle fences before applying responses. `confirm` at line 406 creates a fact confirmation only. It does not call capability adoption. The panel passes `skills` and `onAdoptLevels` to `MaterialConfirmation` at line 567.
2. `app/lib/materials/skill-labels.ts:42` (`retainedMaterialSelfAssessmentHints`) keeps hints only for retained experience/skill-claim candidates, retained labels, and the applicable self-level evidence rule. `MaterialConfirmation` at `app/components/materials/material-confirmation.tsx:30` uses that function. Its capability section at lines 87–90 offers a button only when one current blueprint skill matches the hint's id/name. Unknown or ambiguous matches require manual review below. A skill-specific click calls `onAdoptLevels({ [currentSkillId]: hint.level })`; displaying results and confirming facts do not call it.
3. `app/components/materials/material-setup-provider.tsx:41` (`MaterialSetupSlot`) passes that callback through the real `MaterialTextPanel`. `OwnedAdaptiveSetupFlow` at `app/components/setup/adaptive-setup-flow.tsx:260` adds adopted skill IDs to `reviewedSkills`, merges only the adopted levels into the audit draft, and clears selected scope. Manual edits at lines 266–269 mark changed levels reviewed and replace the draft. The explicit unreviewed-skills action at line 264 preserves reviewed levels and sets other levels to uncertain. Bulk independent is disabled when materials are selected.
4. `app/components/setup/adaptive-setup-flow.tsx:24` (`toAudit`) serializes only current blueprint skills, preserves the existing public evidence objects/references, and creates the audit fingerprint/ID under the existing `2026.08.1` planning schema. Lines 95–120 restore/save the owner/source-bound setup draft through `readSetupDraft`/`writeSetupDraft` in `app/components/setup/setup-draft.ts:55` and `:68`. Restored levels are treated as existing audit decisions; ordinary reload does not reapply a suggested level over a manual override.
5. `app/components/materials/material-context-review.tsx:75` (`review`) sends the current audit with current selection/scope to `createMaterialContext`. `MaterialContextService.create` at `app/server/documents/context-builder.ts:37` freezes those inputs. In setup, `materialInputKey` and `appliedMaterialPreview` around lines 142–146 invalidate a preview when its audit/selection inputs change. `build` at line 204 validates the submitted audit, reruns the deterministic path preview, compares fingerprints, then passes the exact audit in `generatePlanningRequestSchema` to `generate`.
6. Production wiring is `usePlanningWorkspace` → cloud `client.generate` (`app/lib/use-planning-workspace.ts:318`) → `createPlanningClient.generate` (`app/lib/planning-client.ts:88`) → `POST /api/planning/generate` (`app/api/planning/generate/route.ts`) → `createPlanningGenerateHandler` (`app/server/http/planning-route-factories.ts:255`) → `PlanningService.generateResponse` (`app/server/planning/service.ts:136`). The HTTP transport was traced in source; the diagnostic directly invokes the real service instead of starting a server.
7. `MaterialContextService.verifyGeneration` (`app/server/documents/context-builder.ts:136`) compares the requested audit/availability/target/date/scope and current source versions with the frozen context. `PlanningService.generateResponse` puts `request.audit` into the workspace at line 189, then calls `repository.saveGeneration` at line 203. `D1PlanningRepository.immutableGenerationStatements` (`app/server/planning/d1-planning-repository.ts:575`) stores the complete audit in `skill_audit_versions.payload_json`. `D1PlanningRepository.load` at line 151 reloads that row and checks it against canonical replay. `PlanningService.getWorkspace`/`getWorkspaceResponse` at lines 110–115 use that same repository read.

## Definitive offline result

Run `adoption-persistence-diagnosis-20261109-probe-05`: **one file, four tests, three passed, one failed**, exit 1, **zero non-loopback denials**. The single remaining failed test is the start-over defect below. The full adoption/persistence tests passed; this is not an overall green run.

The test mounts real `MaterialSetupProvider`, `MaterialTextPanel`, `MaterialConfirmation`, `AdaptiveSetupFlow`, and `MaterialContextReview`. Document transport returns a synthetic review fixture. Context preview, generation, repository serialization, and reload use real `MaterialContextService`, `PlanningService`, and `D1PlanningRepository` with the existing in-memory SQLite/D1 test fixture. No deployed database or service is touched. No model, external network, deployment, commit, or push is used.

Observed passing assertions:

- Rendering a TypeScript guided suggestion leaves the existing unseen level unchanged. Clicking “确认这些事实” also leaves it unchanged.
- Explicitly adopting TypeScript changes only TypeScript. A manually chosen conceptual Web Platform level and an unmentioned SQL level are preserved.
- Manually changing the adopted TypeScript level to independent survives the explicit unreviewed-to-uncertain action and a full component unmount/re-mount. SQL changes to uncertain only after the user's explicit action.
- The submitted audit, material-context snapshot audit, stored workspace audit, and audit returned by a new PlanningService/D1PlanningRepository instance are equal. Independent TypeScript uses calibration; uncertain SQL retains calibration plus learning.
- A separate run through the same actual UI preserves an adopted guided level and an existing public project evidence object/reference through D1 reload. The existing audit/evidence schema is unchanged.
- No adoption button is offered for zero skill matches, two skill matches, or a removed supporting fact. One current TypeScript match adopts exactly `{ typescript: "guided" }` on click.

## One demonstrated defect and minimal repair

Location: `app/components/setup/adaptive-setup-flow.tsx:255`–258, the “重新填写此岗位” reset handler.

Reproduction:

1. Load a resume suggestion and explicitly adopt TypeScript guided.
2. Check “我已核对当前技能自评”; Continue is enabled.
3. Choose “重新填写此岗位”. The audit level resets to unseen.
4. The acknowledgment incorrectly remains checked, and Continue remains enabled for the reset audit.
5. Choose “未逐项评估的技能设为不确定”. TypeScript incorrectly remains unseen because its previous review marker survived the reset; an untouched SQL skill changes to uncertain.

Root cause: the reset handler recreates `auditDraft` but clears neither `reviewedSkills.current` nor `materialAuditAcknowledged`. The previously adopted value itself has correctly been reset; the stale internal review state causes the inconsistency.

Minimal repair inside that same explicit reset handler:

```ts
reviewedSkills.current.clear();
setMaterialAuditAcknowledged(null);
```

Both lines are supported by observed failures. Clearing only the Set fixes the later batch action but leaves acknowledgment/Continue referring to the prior audit. Clearing only acknowledgment leaves the old skill marker. No new confirmation gate, provenance field, adoption helper wiring, plan schema, evidence schema, or unrelated task/event rewrite is needed.

## Immutable RED artifacts and acceptance handoff

All artifacts are under `work/grounded-verification/` and must remain unchanged:

- `adoption-persistence-diagnosis-20261109-probe-05-results.json`: exact Vitest assertions, statuses, and three failing expectations in the reset test.
- `adoption-persistence-diagnosis-20261109-probe-05-observations.json`: compact observed behavior for all four tests.
- `adoption-persistence-diagnosis-20261109-probe-05.json` and `.log`: wrapper exit/time/network result and raw output.
- `adoption-persistence-diagnosis-20261109-probe-05.test.tsx.source.txt`: exact test source frozen before the run.
- `adoption-persistence-diagnosis-20261109-probe-05.config.ts.source.txt`: exact narrowed configuration frozen before the run.
- `adoption-persistence-diagnosis-20261109-probe-05-adaptive-setup-flow.tsx.source.txt`: exact pre-fix product source frozen before the run.
- `adoption-persistence-diagnosis-20261109-manifest.json`: SHA-256 hashes and run summary.

The runnable probe remains `adoption-persistence-diagnosis-20261109-probe.test.tsx`, with `adoption-persistence-diagnosis-20261109.config.ts`. After applying the two-line reset repair, use a newly checked-unused wrapper label and explicit file filter:

```text
node work/grounded-verification/run.mjs <UNUSED-LABEL> node_modules/vitest/vitest.mjs run --config work/grounded-verification/adoption-persistence-diagnosis-20261109.config.ts work/grounded-verification/adoption-persistence-diagnosis-20261109-probe.test.tsx --reporter=json --outputFile=work/grounded-verification/<UNUSED-LABEL>-results.json
```

Permanent acceptance candidates are the actual UI→context→D1 reload test, the guided-with-evidence persistence test, and the reset regression test. The direct current-mapping test is useful small coverage, though existing MaterialConfirmation tests already cover much of that boundary. Keep future testing focused on these paths and existing AdaptiveSetupFlow behavior; there is no reason here to run the full suite or alter the paused model/deployment acceptance state.

Diagnostic history is retained honestly: probe-01 accidentally inherited the broad test glob because `mergeConfig` concatenated includes. It was interrupted immediately when unrelated output appeared, returned exit 1, and subsequent process inspection found zero matching Node/Vitest processes. Its raw log and original config are preserved as incomplete; it supplies no accepted test evidence. Probe-02 first proved the full flow and reset-marker defect (2 pass/1 fail). Probe-03/04 also exposed the acknowledgment failure but contained probe-only evidence-fixture failures (waiting for a native disclosure toggle, then using a `.test` URL rejected by the existing public-URL schema). Probe-05 corrected those fixture issues and is the definitive bounded RED run. Final inspection found zero running processes for this diagnostic label.
