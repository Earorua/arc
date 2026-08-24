# Arc. v8 Goal 1 local UAT record

Date: 2026-08-25  
Branch: `codex/v8-proof-backed-stack`  
Preview: `http://localhost:3000`  
Environment: local guest storage; no authenticated D1 or R2 bindings  
User acceptance: **Pending user decision**

This record covers the local acceptance surface for Goal 1, Proof-backed Stack. It is not a production release record and does not authorize a D1 migration, an R2 write, a Sites candidate save, or deployment.

## Manual interaction matrix

| Surface and width | Expected | Observed | Capture reference | Result |
| --- | --- | --- | --- | --- |
| Proof, 1440px | Native labelled editor controls; create a public HTTPS link proof; structural review reaches `Demonstrated`. | All fields had accessible names and native controls. A React proof titled `Accessible request trace` with a GitHub HTTPS URL was submitted and reached `Demonstrated`. | `goal1-proof-1440-inline.png` | Pass |
| Proof, 320px | Editor becomes one column and does not force page-level horizontal scrolling. | Form width was 288px; document/body width was 305px inside a 320px viewport. Status facts reflowed without page overflow. | `goal1-proof-320-inline.png` | Pass |
| Proof revision | Adding a revision preserves immutable history. | Saving the edited summary created Version 2 `Draft`; Version 1 remained visible as `Superseded`. | `goal1-proof-revision-inline.png` | Pass |
| Proof withdrawal and visibility | Withdrawal downgrades evidence-derived status; public/private changes visibility without restoring status. | Withdrawal changed the proof to `Withdrawn`; changing visibility to public retained `Withdrawn`. | `goal1-proof-withdrawn-inline.png` | Pass |
| Proof Daily Unit selector | Only active-plan units are selectable and repeated objectives remain distinguishable. | Fresh-browser check showed 7 active units plus `No linked unit`; labels contain date, `Primary`/`Stretch`, and objective. No React duplicate-key errors remained. | `goal1-proof-active-units-inline.png` | Pass |
| Stack, 1440px | Status, strongest proof, latest use, next action, and claim confidence agree with the ledger. | While the proof was active, React showed `Demonstrated`, 2 completed units, the correct strongest-proof link and latest use, and `Add stronger proof`; claim confidence was separate. | `goal1-stack-1440-inline.png` | Pass |
| Stack after withdrawal | Withdrawing the strongest proof recomputes the skill instead of retaining the claim. | React recomputed to `Practicing`, strongest proof became `None yet`, and next action became `Continue Today`; completed-unit evidence remained 2. | `goal1-stack-withdrawn-inline.png` | Pass |
| Stack, 320px | Facts stack to one column; filters remain usable; no page-level horizontal overflow. | Fact grid was 288px and one column. The category rail scrolled within its own region while document/body width stayed 305px in a 320px viewport. | `goal1-stack-320-inline.png` | Pass |
| Today, 1440px | Completing all required steps grants at most `Practicing`, links to Proof, and never claims local verification. | After all required checkboxes and Complete, the page announced `Completed. This skill is now practicing; add proof to demonstrate it.` and exposed one `Open Proof` link. `Verified locally` was absent. | `goal1-today-1440-inline.png` | Pass |
| Today, 320px | Brief and actions reflow without horizontal scrolling. | Today brief width was 288px; document/body width was 305px inside a 320px viewport. | `goal1-today-320-inline.png` | Pass |
| Keyboard and focus | Category filters and actions work from the keyboard; focus is visible; invalid Proof submission focuses its error summary. | `Frontend` activated with Enter and retained focus with a 2px solid outline and 4px offset. Automated DOM interaction confirmed the Proof error summary receives focus. | `goal1-keyboard-focus-inline.png` | Pass |
| Screen-reader semantics | Fields, navigation, history, status, and errors have distinct accessible names and announcement roles. | Native labels/buttons were exposed; Proof history had its own named region; mutation feedback used `role=status`; validation used a focused `role=alert`. | `goal1-semantic-dom-inline.txt` | Pass |
| 200% zoom | Content reflows without page-level horizontal scrolling. | The in-app browser automation could not change browser zoom with Ctrl-plus, so exact 200% zoom remains for user confirmation. Equivalent constrained-width checks passed at 720px and 320px, plus automated CSS contracts at 320/768/1440. | `goal1-zoom-automation-limit.txt` | Pending user check |

Capture references ending in `-inline` refer to images or DOM evidence emitted by the Codex in-app browser during this local QA session; they are not production artifacts and are intentionally not committed as generated binaries.

## Automated evidence completed before the full gate

- Focused accessibility, page-state, and D1 repository regression: 41 tests passed after the active-plan Daily Unit fix.
- The Task 14 four-file focused UI suite passed 47 tests; the final full gate will rerun the authoritative full suite after this record is committed.
- The service/API suites cover failed-save non-promotion and the authenticated `arc.test-report.v1` upload path. Manual upload was unavailable in this guest-only local preview because no authenticated D1/R2 bindings were present.
- Responsive CSS contracts assert Proof and Stack width safety at 320px, 768px, and 1440px.
- Reduced-motion and visible-focus contracts remain covered by `tests/components/accessibility-contracts.test.tsx`.

## User acceptance checklist

- [ ] At normal desktop width, review `/proof`, `/stack`, and `/today` for visual fit and copy.
- [ ] At 200% browser zoom, confirm `/proof` and `/stack` remain readable and do not create page-level horizontal scrolling.
- [ ] Confirm that completion means `Practicing`, submitted link proof means `Demonstrated`, and withdrawing proof downgrades the Stack status.
- [ ] Explicitly state whether Goal 1 local UAT is accepted.

Current decision: **Pending user decision**.
