# Narrow course binding for the integrated English interface

Status: completed and independently accepted 2026-11-19. Four focused checks, lint, specification review and quality review passed; the separate result and receipt are in `docs/verification/materials-native-acceptance/integrated-course-result.md`. Scope is verification metadata/tooling only. The already accepted November 19 binding and all historical references remain unchanged.

## Why this is necessary

The accepted pre-integration binding pins the exact full course capture, including display names. Mainline commit `19a81a5` changes five strings in `app/data/flagship-role.ts`: the role name, today's summary title and three summary step labels. The role name also flows into the blueprint name. Registry content, its 48 teaching templates, skill membership and prerequisite structure do not change. The old binding must reject these new bytes; a separately reviewed binding is needed instead of rewriting its hashes or repeating course annotation.

## Bounded implementation

- Add a separately named binding JSON, complete current capture, verifier and focused tests under `docs/verification/materials-native-acceptance/`. Reuse the unchanged capture API, never its overwriting CLI. Preserve the existing binding JSON/snapshot/verifier/test/review bytes and all 26 frozen assets.
- Pin the previous reviewed binding, its capture and its separate review receipt. Verify that receipt and all old frozen assets/inputs before reusing its semantic judgments. The new verifier must independently check current files; it must not fabricate an old tree to persuade the old loader to accept the integrated application.
- Declare exactly the five before/after string replacements and source commit. Reverse them in the actual current role source and require the previous exact source digest; reject additional source or newline drift. Derive the expected new role object and blueprint display name from those same changes; recompute canonical object hashes with the already pinned canonical serializer.
- Compare the complete new capture against the transformed old one: only the role source descriptor/content, that dependency descriptor, role/blueprint object display values and their hashes, and the separately pinned generated bundle may differ. The inventory, complete registry and other dependencies stay identical. Then recapture the actual current local files and require full byte equality to the new pinned capture.
- Keep the earlier reviewed `planning.ts` delta exactly as it was. A broader change in any course dependency is a reason to inspect, not to silently refresh a checksum. Product/UI explanation translations outside this course closure are reviewed separately as application changes.
- Use four small meaningful tests: accept the actual integrated capture while old loaders reject it; reject an extra role/course/dependency edit; reject corrupted prior/current bindings or frozen evidence; reject substituted caller-supplied captures/digests. Do not rerun the historical positive test against a different binding and call the resulting rejection a regression. Historical verification files are source-specific records; the new version is the current binding check.
- Run targeted syntax/lint and those four tests once after their RED phase. Independent specification then quality review should read the delta and existing raw results. Do not repeat the historical course semantic review, native matrix or repository-wide suite for this tooling change.

## Pass criteria

Five reviewed display translations are the only course delta. All 48 teaching units and all immutable historical references remain identical; any sixth change fails closed. The current capture is independently checked against actual local source. A separate approval receipt identifies the new binding and its reviews. This permits reuse of course evidence only; it grants no model-quality, hosted-runtime or release approval.
