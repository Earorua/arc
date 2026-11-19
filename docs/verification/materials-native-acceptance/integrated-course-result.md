# Integrated English display binding

2026-11-19: **PASS for the narrow course binding**, following four focused tests, lint, independent specification review and independent code-quality review. The application integration itself is still under verification.

The new `materials-integrated-course-binding-20261119` permits exactly five literal translations from the reviewed mainline role source: the role name, today's summary title and three summary step labels. The role name also changes the blueprint display name. All 48 teaching units, inventory, prerequisites, remaining course source and previous planning-schema delta remain unchanged.

The verifier checks the prior reviewed binding/capture/approval receipt, 26 frozen assets, five inputs and every one of the 85 current dependencies. It derives the entire permitted capture from the previous one, reverses the five actual source literals to the previous source hash, and independently recaptures the actual local files. A sixth change, unreviewed dependency, substituted capture or changed old reference is rejected. The old loaders still reject the integrated source; none of their bytes or checks was replaced.

The new binding JSON retains its immutable pending-review field. Its separate [review receipt](integrated-course-review-receipt.json) records approval of those exact bytes, alongside [specification](integrated-course-spec-review.md) and [quality](integrated-course-quality-review.md) findings. Reviewers reused recorded outputs without repeating tests or capture execution.

[Raw evidence](integrated-binding-evidence/manifest.json) retains the four missing-verifier RED failures, actual capture, four passing checks and lint results. The initial lint error concerned the test-local variable name `module`; its identifier-only rename to `verificationModule` passed final lint and did not change assertions. Historical positive tests remain source-specific records for the previous binding; the separately named integrated tests check the new source.

No historical course annotation, candidate scoring rule, native result or Gate threshold was changed. This binding permits reuse of unchanged course semantics; it does not approve model quality, hosted behavior or release. No model call, deployment or remote migration occurred.
