# Materials native planning behavior binding — 2026-11-19

Status: protocol prepared for independent review; no new results claimed. Binding ID: `materials-native-planning-20261119-v1`.

This is a separately versioned interpretation of the existing 14 behavior categories. The original `materials-quality-v2/planning-reference-cases.json` (SHA-256 `b4980e489b40857514e85afb1fafad15efa8a8976bfd388d0af378430e9a2c51`) and its scorer remain unchanged. Native outputs must not be submitted as the original synthetic projection or given its input digest.

## Scope and evidence reuse

The November 9 accepted baseline includes real UI adoption/persistence (5 cases), context-only adoption (26), atomic replan (11), learning-intent flow (4), context choices (29), workspace adoption (5), document contracts (54), skill mapper (14) and review points (3). Their existing results are reusable for the unchanged source. Do not rerun them merely to relabel evidence.

New collection supplies the missing explicit native input, operation trace and before/after binding. This is **14 behavior bindings, including setup/UI and contract guards**, not a claim that all 14 are existing-plan HTTP mutations. In particular, the product has no bulk-independent adoption endpoint and no material-specific active-plan self-assessment mutation. Those capabilities must not be fabricated by the collector.

## Native setup and observations

- Use the actual flagship blueprint/registry, a legal goal duration (the existing 52-week fixture), valid availability and fixed synthetic clock. Do not alter prerequisites to force reordering.
- Create documents, complete review drafts, confirmations, selections, contexts, plans, completion events and Proof using actual services wherever their lifecycle is being evaluated. A synthetic provider result may initialize an AI review; it must be labelled synthetic and cannot count as model quality. No real provider or outbound HTTP is required.
- Initialize only synthetic local identity/database state directly. Do not seed an expected after-state. A fixture import at a non-evaluated upstream boundary must be explicitly recorded, not described as exercising that upstream service.
- Use one primary `jd` slot. An additional company's JD is a `supplement` in the authority-control case. Replacement uses a new primary selection with the same goal and retained other materials.
- Use real generated task/unit/version identities, actual completion actions and a separate Proof ledger. Proof artifact URLs use `https://example.com/…` and are never fetched.
- Record document/review/selection/context/proposal/workspace revisions separately. Raw attempted-call errors are trace outcomes; they are not invented persisted preview fields.
- Capture full workspace and relevant native rows before and after each meaningful phase: document/review/confirmation, selection, context snapshot/preview, proposal, adopted links/usage, planning events and Proof tables. Record persisted reloads as well as immediate service returns.
- Inputs, collector/worker source, imported source closure and results have separate digests. Expected assertions are independently declared below; the collector must not generate expected state by running the product or reading old expected changes.

## Fixed 14-case matrix

| Original case ID | Native setup/action | Required observations and pass condition |
| --- | --- | --- |
| `fact-confirm-only` | Existing plan with a completed task and Proof; save and confirm another legal review draft. | Document/confirmation revisions change as the service specifies. The existing workspace, audit, adopted context, completion records and Proof do not change. |
| `explicit-guided-self-adopt` | Setup draft with a source-bound guided hint. Existing accepted UI evidence supplies the explicit single-choice action; generate a plan from that chosen audit using the native services. | Only the selected skill is guided; unrelated choices remain. Reloaded repository audit equals the explicit generation audit. This verifies initial setup adoption, not a new active-plan edit endpoint. |
| `reject-batch-independent` | Attempt a `mode:batch` independent adoption against the actual adoption contract; retain an existing native workspace and Proof. | The actual contract rejects. UI evidence confirms the bulk-independent control is absent with selected materials. Native records remain unchanged; no fabricated service error or transaction is claimed. |
| `explicit-single-independent` | Setup with a user-selected individual independent radio value, using accepted UI evidence; native generation and reload. | The chosen skill's audit retains independent, other choices remain; this is a self-assessment, not verified competence. No synthetic material hint grants independent. |
| `unadopted-learning-intent` | Confirm/select a supplement but omit its learning-intent choice when creating context. | Preview reports the unadopted intent, no supplement hard requirement/automatic ability arises, and current adopted plan/Proof remain unchanged. |
| `explicit-adopt-soft-focus` | Create context with the selected supplemental intent, propose, inspect before acceptance, then explicitly accept. | Before acceptance the old context stays active. After acceptance/reload the chosen intent is active; self-assessment, primary-JD authority and protected records remain. Task-order change is not required. |
| `withdraw-focus` | Start with adopted item intent; create a new context without that item choice, propose and explicitly accept. | Only the item intent is withdrawn; document and other choices remain. Reload does not restore it. Preserve protected records and require explicit acceptance. |
| `delete-material` | Delete an adopted supplemental document through its real revision-checked lifecycle; attempt to reuse its old context/proposal. | Actual lifecycle/cleanup state and revoked/disabled dependencies are recorded. Old material cannot be reapplied. Existing task contents, completion records and Proof remain. Cleanup completion is not claimed merely from a pending deletion receipt. |
| `exclude-individual-term` | Confirm an item with at least two retained legal skill terms; submit an exact term choice with `skillIds:[]`, then propose/accept. | Only that term is omitted; another term remains usable. Accepted/reloaded context retains the exclusion. No whole-item deletion or substituted label is used. |
| `replace-primary-jd-same-job` | With JD A adopted, create/confirm/select JD C for the same goal; retain resume/supplement and create/propose the new context. | The proposed context has C; the current adopted context still has A until explicit acceptance. Other materials and all protected records remain. |
| `accept-current-primary-jd-preview` | Accept a real current proposal from A to C with its actual base/candidate identifiers. | The active plan and adopted context switch atomically to the proposal; C becomes primary, others remain. Verify persisted reload, proposal state and adopted links, not just a response boolean. |
| `secondary-jd-cannot-add-must` | A secondary JD is a confirmed supplement with a must-labelled requirement; inspect context with/without explicit soft intent. | Only the primary JD supplies hard requirements. The supplement may contribute an explicitly chosen soft focus; it does not change authority or grant ability. |
| `unresolved-conflict-not-hard-resolved` | A source-bound high-impact unresolved review point; attempt actual confirmation without resolving it. | Confirmation is blocked by the real review service, the unresolved point remains and no confirmation/requirement/plan change is fabricated. This differs explicitly from the old abstract fixture's accepted-confirmation bookkeeping. |
| `stale-preview-reject` | Create a real proposal, then invalidate it through a legal selection change or expiry; attempt acceptance. | Real conflict/gone rejection is captured. Proposed context is not applied, current active plan/completions/Proof are retained. Do not insert an impossible completion event into a pending workspace. |

## Protected state and interpretation

For every operation on an existing plan, preserve its complete audit, goal/workspace/source identity, availability and all availability versions, target, full task set/content/unit versions/dependencies/estimated minutes, every historical DailyUnit object, completion events and Proof records. The task set must not gain or lose units. A proposal may contain a different candidate order and schedule before acceptance; the current active path/plan/order/days and adopted context remain unchanged until explicit acceptance. After acceptance, pending task membership, prerequisite order and daily budget remain valid. Material deletion may revoke private source metadata without deleting learning progress or Proof.

The two setup self-assessment cases have a different lifecycle: audit selection precedes generation. They are not evidence that an existing plan's audit can be changed while its task set stays fixed. The unchanged accepted UI tests establish explicit selection; the new native run establishes actual persisted generation. This limitation remains visible in the results.

## Minimal run and review policy

Review this mapping before executing the fixed matrix. Reuse existing UI/contract evidence where specified. Collect the additional native trace in one fixed run after relevant source changes settle. If a specific case fails, diagnose its fixture/adapter or product cause before altering anything, retain the failure, and rerun only affected cases until the shared harness is stable. No extra exploratory scenario becomes a release requirement without a demonstrated defect in promised behavior.

Each result distinguishes passed, failed and not-collected categories and identifies its actual layer. Source/course quality and hosted runtime readiness remain separate. A 14-case behavior pass does not approve Kimi quality, the full Gate or public release.
