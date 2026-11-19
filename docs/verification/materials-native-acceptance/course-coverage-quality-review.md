# Course task coverage code-quality review

Date: 2026-11-19. Independent reviewer: `course_coverage_quality`. Base: `850b6be03a1da60eb8ee37d530f05a1b51af10ba`; reviewed the frozen, uncommitted eight production files and five tests listed below after specification re-review passed.

**Result: PASS for this bounded offline patch.** No actionable Critical, Important or Minor finding remains. This does not certify the native 14-scenario matrix, mainline integration, model quality or public release.

## Review observations

- The nine task evidence IDs resolve to actual quoted leaves in `flagship-unit-registry.ts`. The evaluator checks registry validity, catalog identity/version and every required leaf. Changed content closes the corresponding claim even when a version string stays the same; Research coverage is explicitly closed. Frozen evaluation assets and document IDs are not runtime inputs.
- Topic discovery, task coverage, personal practice and ability adoption remain separate. The new compound-topic grammar requires each bounded member to resolve to one registered skill, preserves each member's source word for existing actor/polarity checks, and leaves alternatives ambiguous. Coverage itself does not update audit, practice or planning authority.
- Full coverage requires the entire evaluated task body to match one supported narrow task. Unknown modifiers remain partial; manual choice alone is insufficient. The repaired newline boundary preserves the exact demonstrated soft-wrap modifier. Per-term scope is deliberate: this review does not require a new parser for unrelated unlabelled sibling tasks.
- Coverage metadata is optional for historical previews. The strict contract rejects contradictory status/support/remaining combinations; the grouping key includes the complete metadata so unlike coverage rows cannot be merged. The existing payload bound is unchanged. New mapping/explanation versions preserve previously accepted alias versions and saved preview shapes.
- The interface labels full coverage as limited to the recognized narrow task and displays remaining scope separately. Explanations contain fixed templates and compact IDs; source revocation still returns before any source-dependent projection is exposed. There is no new migration or provider interaction.

## Evidence reused

Read the recorded `course-coverage-20261119-final` run: **193/193 passed in eight suites**. Read `lint-final` and `types-final`: exit 0. Read the narrow follow-up: `wrap-red` reproduced the false-full result; `wrap-green` passed **9/9**; `wrap-lint` exited 0. Independently checked all six log SHA-256 values against their JSON receipts; all matched, and each receipt records zero non-loopback denials.

No tests were rerun and no additional runtime probe was necessary: the code, direct course-leaf inspection and existing targeted evidence resolved the reviewed concerns. The only review output is this memo; application code, reference assets and the separate native collector were not edited.

## Reviewed file identities

| File | SHA-256 |
| --- | --- |
| `app/lib/materials/course-task-evidence.ts` | `ecf8aa41e10ee63ae55b91356c257a131b90e252ee0a4720c41e550f1c62e469` |
| `app/lib/materials/course-task-coverage.ts` | `dcf9d29f7b655217900094d67f5d5ca2b605285427f46d0f60cb704039b58d74` |
| `app/lib/materials/skill-mapper.ts` | `b42bd191f73a75577e2802a6eeb917824e50750b11c0e2dc6a74b485c0a617f4` |
| `app/lib/materials/contextual-skill-mapping.ts` | `66d2d1ad5c4e0fd603c828709b2ad1cb8768c44491d54e7dbe5c5f5397549503` |
| `app/lib/materials/explanations.ts` | `9d953c2d15611c32062e2c98a126ad1ef65ebec8a71e24a863983ae6ea816534` |
| `app/contracts/material-planning.ts` | `ceb15fece5f5a336e78c1289f6e9ecccc54e36e62f1ed8c4450fb0a9c7a60347` |
| `app/server/documents/context-builder.ts` | `aba0c2549dfb277486935db11e22ed716f3746c16db542dc006e6540a27fc09c` |
| `app/components/materials/material-context-review.tsx` | `73355b7bf6ddb4b91edea67f3e70cb467e71d8a0807b0a47f2545b168d30b490` |
| `tests/server/material-course-task-coverage.test.ts` | `36cdc86265ad88e6f477116b37f8b86afdb9ce54e2233dc3addb1e9e4dd3c982` |
| `tests/components/material-context-choices.test.tsx` | `78885fd72abb88141eff88519a36e1c3417f04835e6533fbe95d69a9699ef18b` |
| `tests/contracts/material-planning.test.ts` | `2fc43614e4091dea54f7fdb1bbf6ed8217a572f66cdb64ec2a5ec18cbff589e1` |
| `tests/lib/materials/explanations.test.ts` | `c71c7d9df070e6f9cf3b5497150672eeabe2c429160e48cfb78c3a22ff6e66a3` |
| `tests/lib/materials/skill-mapper.test.ts` | `0f353a2ed2838d7d0f1cf1c7ef3760d65cb1aba208f7d4ef798f7ea2777646dd` |
