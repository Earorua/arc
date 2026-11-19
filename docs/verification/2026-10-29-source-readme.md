# Latest source and bilingual README — 2026-10-29

## Source and scope / 源码与范围

The source baseline is `b0847ccd4a7ff500f67303ca00b37f07a469d996`, the complete application tree following the October 29 homepage method-entry release. It includes the Research response repair, local smoke-test persistence fix, learning-entry simplification, workspace controls, and homepage refinements. The working branch is `codex/latest-source-bilingual-readme-20261029`.

源码基线为上述完整提交，包含 10 月 29 日所有已记录的应用修正。本次更新英文 README、增加对应的简体中文 README、同步操作索引和恢复入口，并补充 Cloudflare 本地 `.dev.vars*` 的忽略规则。提交前测试发现烟雾构建仍固定校验旧 provider，因此另同步这一处已审查源码的 SHA-256 常量；具体原因见下文。应用代码、依赖锁文件、迁移和运行配置保持基线内容。

The latest deployment recorded in this tree is application `a826114`, Site `bd827c05-4041-40e3-90cd-b97127fc1f6b`; executor `60b176c2-be13-4df2-8743-c899b596f6d4`. This source/documentation update does not publish a deployment or make paid provider calls. See [the release verification](2026-10-29-home-method-entry.md).

## Verification / 验证

Verification uses an isolated checkout on D:, Node.js 24.14.1, and a fresh successful `npm ci --no-audit --no-fund` against the committed package lock. Logs and temporary artifacts are retained outside the source tree at `D:/CodexTemp/arc-source-readme-20261029/`. An initial offline install lacked a cached package; the regular install completed without changing the lock file.

### Initial run and cause / 首轮结果与原因

The full 286-file suite ran with `--maxWorkers=4`: **6,796 passed, 106 failed, 0 skipped** out of 6,902 tests. All failures stopped at the smoke builder's reviewed-input hash check for `app/server/research/openrouter-provider.ts`:

| Suite | Failures |
| --- | ---: |
| `tests/server/research-cloud-smoke-build.test.ts` | 19 |
| `tests/server/research-cloud-smoke-composition.test.ts` | 86 |
| `tests/server/site-import-native-d1.test.ts` | 1 |

The old SHA-256 `5e762073cd357184f1925ecc412c9fcd8e06433351e4aba56b70ae8a43cc1a8d` exactly matches the provider before the already published `513d84f` citation-title repair. The current file and baseline `b0847cc` both hash to `d0c962c1ba0bcaf2e87119e40b982e0ebe6560d67ddcc662530b21db4ed7c54d`. The build script's fixed value had not followed that repair.

Only this constant in `scripts/build-research-executor-smoke.mjs` was updated, in commit `ae1adac`. The hash check, before/after source checks, graph separation, deadlines, and test assertions remain intact. This does not rewrite old reports, authorize a cloud smoke run, or modify the provider. The initial failing report remains `unit-results.json`; the affected-suite rerun is recorded separately as `smoke-results.json`.

### Final checks / 最终检查

The affected three suites passed **127/127 tests** with `--maxWorkers=2`, zero failures and zero skips. Their case identities exactly match the initial run. Combined with the disjoint 283 unaffected files / 6,775 passing tests, final coverage is **286 files / 6,902 tests passed**, without double-counting. This is verification across the initial run and the targeted rerun, not a claim that the initial full run passed. `combined-verification.json` records the reconciliation; the original failure report is preserved.

| Check | Result |
| --- | --- |
| Unit/integration tests | 6,902 passed across the disjoint sets above; 0 final failures, 0 skips |
| `node node_modules/typescript/bin/tsc --noEmit` | Passed |
| `npm run lint` | 0 errors; 4 existing unused-variable warnings in test files |
| Changed smoke-build script ESLint | Passed after the hash update |
| `npm run build` | Passed with the local Cloudflare target |
| `node --test tests/rendered-html.test.mjs` | All 5 passed |
| Bilingual documentation | 11 sections and 5 identical command blocks; corresponding references match |
| Relative document links | All 93 checked targets exist |
| Git ignore rules | `.dev.vars`, `.dev.vars.production`, and `.env.local` are ignored |
| Source credential-pattern scan | 1,048 tracked/candidate files; no matching credentials or private environment files |
| Whitespace | Passed with `git -c core.whitespace=cr-at-eol diff --check`, respecting existing CRLF files |

Independent read-only review found no actionable issues in the SHA re-pin, documentation accuracy/parity, local setup, or ignore rules. Its approval was conditional on the affected-suite results and updating this record; both are now complete. Production APIs, model requests, deployments, and database writes were not part of this verification.

Both READMEs have the same section structure, command examples, feature boundaries, and reference destinations apart from the reciprocal language links. Relative links, configuration ignore rules, whitespace, and credential patterns are checked before submission. Historical `outputs/` evidence remains local and is not added to Git.
