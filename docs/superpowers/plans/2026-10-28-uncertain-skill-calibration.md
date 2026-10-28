# Uncertain skill assessment and calibration

Approved source: Arc full-site redesign §6.5. This closes its separately accepted second-phase recommendation without changing saved assessments or evidence rules.

**Rule:** `uncertain` means the learner cannot yet judge their capability. It is distinct from `unseen` and is never mastery evidence. Keep the existing default and all four saved levels compatible. For each uncertain skill, schedule its existing, validated calibration template first, followed by every learn template in registry order. Preserve prerequisites before calibration, chain all of that skill's learning afterward, and release dependent skills only after the final learn unit. Use the template's real duration, steps, checkpoints, and proof requirements; never invent a shorter task or a passing result.

Calibration completion records practice only. Its checkbox completion cannot remove learning, alter the audit level, or create demonstrated/verified evidence. An `already_known` self-claim on an uncertain skill also retains that learning; only the existing proof workflow can establish evidence. Proof review currently has no scheduling integration, so even reviewed proof does not automatically shorten this conservative path. Time-target scope may still explicitly defer an eligible skill as a whole, using the existing disclosed scope rules.

**Compatibility:** Keep the existing schema version and storage envelope. Extend the shared enum; reuse it in draft validation. API requests, persisted planning workspaces, and local drafts continue to accept all old values unchanged. No database migration or production write is needed.

**Execution:**

- [x] Add failing contract/API and draft round-trip tests for five levels; UI tests for the distinct option, explanation, and evidence preservation.
- [x] Add failing path tests for calibration order, prerequisite chains, retained learn units, template duration, and old-level compatibility.
- [x] Add failing scheduler/reducer integration tests: completing calibration schedules learning, self-claims retain learning, and evidence stays exploring/practicing until review.
- [x] Extend enum, UI, shared draft schema, and deterministic template selection. Guard uncertain self-claims in the reducer. Coordinate the route label with the progress owner.
- [x] Run focused suites and TypeScript checks; inspect the diff and preserve existing line endings. No commit.

**Acceptance evidence (2026-10-28):** The original focused run failed nine expected assertions (unknown enum/draft value, missing UI option, missing calibration). After the enum was accepted, path/reducer tests independently failed because calibration was absent and a self-claim removed learning. Those checks now pass. The review notice and history label also went through a failing/passing UI cycle. Final related-suite run: 23 files, 421 tests passing; TypeScript and scoped ESLint pass. Coverage includes real scheduler/reducer transitions, proof projection, persisted local workspace reopen, server generation/reload, all four old levels, uncertain self-claims before/after calibration, and delay/time changes after discarding the proposal.

The proposal review explains why learning remains and how to postpone or change time; history labels the event “自评已会”. Styling and browser viewport verification are owned by the full-site integration pass. No production service, database, or account was written. Research calibration durations remain source-defined; this change does not make a duration guarantee beyond the existing validated registry.
