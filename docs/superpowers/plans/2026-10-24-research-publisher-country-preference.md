# Research publisher country preference

User requirement: keep mandatory publisher authority; prefer open courses from leading US universities. For official company courses, prefer leading US companies, then leading Chinese companies; either free or paid is acceptable. This is a preference among relevant, accessible courses at the right level, not a claim that geography establishes authority or a reason to choose an unrelated course. Publisher origin is independent of website language, locale and hosting domain.

The old Today sources are replayed from the already saved r136 research package/plan. `PlanningSourceResolver.resolveForReplay` preserves the locked content identity; `AdaptiveTodaySession` resolves its source IDs from that blueprint. Updating future selection rules does not rewrite that stored package. Do not relabel or swap one URL while keeping lessons/tasks derived from a different course. No new paid Research or existing-plan mutation is authorized by this change.

Implement this bounded policy update in a fresh stage based on the already deployed r139 source, then copy only its reviewed changed files into the current canonical v18-integrated checkout. This lets the policy deploy without accidentally deploying the separate v18 merge or requiring its unapplied 0013 migration.

- [x] Copy and hash-check the prior source plus its accepted authority changes; keep original evidence immutable. Use existing dependencies.
- [x] Add failing integration tests for the actual provider instruction's US-university preference, US-before-China company preference, publisher-country metadata independent of Chinese URL locale, and retained relevance/cost requirements. Add authority checks for verified Alibaba Cloud Academy course entry, claimed-US publisher mismatch, community/marketing paths and spoofed hosts.
- [x] Add explicit publisherCountry metadata to the reviewed catalog, the country preference instruction and a narrowly verified Alibaba Cloud Academy `/course/<id>/info` teaching entry. Keep the non-authoritative source rejection and truthful free/paid/mixed rules. Bump prompt v4→v5 and quality v3→v4 to separate future cached Research identities.
- [x] Run only affected authority/provider/planning/config-version tests and type checking; fix any version-dependent fingerprint expectation. Update the source policy documentation. One scoped independent review, no broad application or Task15 re-audit.
- [x] Apply only the verified policy/test/docs delta to canonical source after checking preimages. Build one closed candidate from the r139-based stage; preserve all existing flags, bindings, logs, budgets, routes and secrets. Deploy through fresh one-use operations with native predecessor/readback checks. Do not reuse consumed deployment helpers or apply a cloud schema change.
- [x] Save the result and clearly tell the user that current saved sources remain historical until an explicitly requested new/replacement plan is generated. No model request, course purchase, account change or public-domain cutover.

Official provenance checked 2026-10-24:
- https://www.alibabacloud.com/en/about links its Training & Certification service to `edu.alibabacloud.com`.
- https://edu.alibabacloud.com/course/353/info presents Alibaba Cloud Computing Fundamentals with lessons/course goals and an Alibaba Cloud Academy trainer. Individual course access and cloud-service costs still require checking; this is not blanket course-quality or free-access certification.

The broader migration/Task15 goal remains paused unless the user resumes it. This request authorizes this narrow preference change and explanation.

Completed 2026-10-24T10:35:22.172Z. Seven source/test/docs files integrated, 312 scoped tests plus type/lint and one independent review passed. One candidate built from the deployed r139 base; only two runtime source files differ. Closed pair deployed and native versions/bindings read back. No new model call or historical-plan rewrite.
