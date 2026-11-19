# Course binding specification review

Date: 2026-11-19. Reviewer: independent `course_binding_spec` agent. Scope: Task 1 of `docs/superpowers/plans/2026-11-19-materials-course-native-acceptance.md`. Result: **PASS**, with no important specification gaps or scope additions found.

The review read the four new binding artifacts, the unchanged capture implementation and historical loader, historical source/course review records, the actual `5345317f99d77a62d3bb174dcd6922156a988949` schema diff, and recorded capture, test, CLI and lint results. The branch remains `codex/materials-replan-recovery-20261106` at `3eeb5c3f203dd0ba9cf864fa2b7a48ce6a43bae6`; existing application and frozen-reference files were not edited. No tests or capture were rerun for this review. Independent checks read and compared bytes, JSON and Git blobs only.

- The complete old/current snapshots differ only in the pinned bundle hash and `app/contracts/planning.ts` dependency descriptor. Full role, blueprint, registry, inventory and course source files are equal. All 85 current dependency files match their descriptors; 84 descriptors are unchanged.
- Git blobs independently confirm the permitted transition from SHA-256 `053972ea8b36f6baef224efa41fbf593153e2dff1271e404cc403851fc2a8fa5` (32,489 bytes) to `861260a27d55287661034d5e0a5ca175d6571400031ac3c9d58cb9608b67db93` (32,565 bytes). The only change adds optional `materialProposal: true` at `planningEventSchema`, with its comment and line wrapping.
- All 26 frozen assets and all five original input/basis files match the binding's hashes. The source and course semantic review flags remain backed by those unchanged review records; no new curriculum semantic review is claimed or required by this binding.
- The verifier pins the binding and complete capture, checks the exact source replacement, and calls the unchanged capture API against the selected local root. It accepts no caller capture or expected-hash override. The old loader remains unchanged and rejects the current dependency. No old snapshot is substituted as current evidence and no old WeakSet credential is conferred.
- `course-binding-20261119-{capture-final,green-final,verify,lint-final}` each recorded exit 0 and zero non-loopback denials. Each full raw log matches its metadata SHA-256. The test log records five passing tests, including dependency/course drift, frozen-reference corruption, old-loader rejection and capture/binding substitution. The CLI reports the independently confirmed current capture hash below. These are reused implementation runs, not fresh reviewer test runs; the wrapper's denial count alone is not a whole-process network audit.

Reviewed artifact SHA-256 values:

| File | SHA-256 |
| --- | --- |
| `course-binding.json` | `2c04bc8a15443703454b704102c6a9c3299d92c1fd198ceeebad6b750853ca67` |
| `course-reference.current.snapshot.json` | `9a02b60878d5d581353efb66545a56d81c9da254fd59efc3db34456015a8bed8` |
| `verify-course-binding.mjs` | `8858c7b2c2d4cdf0d28e71d3d23d135659e7fd613da8a3931d34beadfd5d0832` |
| `verify-course-binding.test.mjs` | `27bb94db6be82a796db9fd77ee49b181349aea87bfbfec88315d4c66390f907a` |

The binding deliberately remains `pending-independent-review`; the root task will publish the separate combined review receipt. This specification PASS establishes the narrow course-equivalence binding only. It does not approve candidate/model quality, native planning behavior results, or the release Gate.
