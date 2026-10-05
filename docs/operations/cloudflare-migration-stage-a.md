# Arc standalone Cloudflare migration evidence

## 2026-10-05: Original successful samples expired; fresh acceptance required

**2026-10-05 后续只读核验：原 long/...0151 和 after-r2/...0152 的 package 已过期。** 两行均仍为 ready/import phase5/active_slot=null/quota accepted，但 package_expires_at=1791158400000，即 2026-10-05T00:00:00Z（北京时间08:00），09:55:01–09:55:02Z 检查 package_fresh=0。数据库观测为零写入；无新控制调用或模型请求。安全证据在 Research 树 outputs/local-durable-executor-20260914/task15-smoke/cloud-ops-20260921/long-run/native-original-freshness-20261005.json。

已检查实际 D1ResearchRepository.resolveReadyPackage 使用 require-fresh，并由 d1-publication.validatePackage 拒绝 expiryMs<=now；因此原两份结果不能作为新的成功 owner-read 回放验收对象。历史成功记录保持有效，不重启旧实例、不改过期时间、不改生产 reader。原 ...0153 保留 failed/interrupted 的合法迟到收尾结果。成功回放必须在新隔离资源集合产生的新鲜样本上补齐，明确记录其与旧场景的区别；不能声称补齐了当时未做的原实例回放。

### Prepared continuation order (not executed)

1. Finish the previously deferred local six-step replay tool after the user confirms resumption. Preserve its production-reader and immutable-identity requirements; it must never admit an expired original sample merely because the stored run says ready.
2. Before cloud changes, freeze the reviewed artifact, record original resources and observations, and recheck exact live bindings plus old instance/drain status. A missing retained native history must be recorded as unavailable, never recreated by restarting the instance. The current SELECT results alone do not prove that no Workflow remains live.
3. Prefer the existing feasibility option A: retain the same isolated smoke Worker identities and inherited Secret names, create two distinct D1 databases, a private R2 bucket and a new named Workflow; retain every old resource and the old Workflow binding. Use a coordinated admission-off/Cron-off drained transition, new nonsecret signing key IDs on both peers and the control driver, and exact post-deployment resource validation. Do not infer duplicate-class Workflow support merely from the generic multiple-binding docs. If the account rejects it, stop and use the separately reviewed new-Worker-pair fallback; never delete the original to force deployment.
4. Run the unchanged long (19m30s synthetic wait), after-R2 and after-D1 sequence on the new stores; preserve actual deadlines and fail-stop behavior. Collect native runtime, accounting and cleanup evidence, then run the six replay/owner checks while each new package remains fresh. Collect actual CPU observations before judging Paid capacity or cost. No OpenRouter key or real model request is part of this smoke suite.

Cloudflare's current [binding documentation](https://developers.cloudflare.com/workflows/build/trigger-workflows/) confirms multiple Workflow bindings per Worker. Its [limits documentation](https://developers.cloudflare.com/workflows/reference/limits/) lists different CPU and state-retention limits by plan; neither establishes retroactive retention of old Free-created history. No same-class account deployment was performed here. Proposed binding/resource manifests remain preparation, not executed cloud changes.

当前回放本地实施确认仍未收到答复，不重复询问或启动实施。确认后先完成已审查六步入口/驱动的本地 TDD、SPEC 和独立 QUALITY；然后在具体云端配置经审查后安排新隔离集合三场演练及及时回放。完整目标本轮 get_goal 实查为 active；前一轮 Paid/旧任务收尾和本轮过期核验均是改变下一步动作的真实进展。

## 2026-10-05: Paid confirmed and original smoke failure reconciled

**2026-10-05 更新：Workers Paid 已确认是当前套餐，Google/GitHub 测试站登录及刷新保持均已通过。** Workers plans 页面显示 Paid / Current plan、Free / Downgrade；客服 case 02342328 确认后端自 2026-09-22 激活，首次发票为 $0 且已支付，Processing 属于控制台显示同步问题。不要重复购买。首次零元不代表持续免费；试用结束和续费时间未核验。下方 Paid 未验证、等待 Cloudflare 登录等描述均为历史。

The read-only browser check found support case 02342328 in Engineering Investigation, last modified September 30 at 01:25 Beijing time. The September 24 reply confirms backend activation, a paid zero-dollar setup invoice under trial terms, and a dashboard synchronization mismatch affecting Workers Paid and Images Stream Basic. No payment, subscription change or support message was sent. Safe receipt: outputs/cloudflare-migration-20261005/auth-diagnostic/paid-plan-support-verification.json. Account-plan evidence is not a CPU-duration measurement or a new Workflow acceptance result.

原 9 月 21 日 after-D1 演练 ...0153 的新鲜原生只读核验已完成：failed/interrupted、import phase5、active slot 已释放、唯一 failed/0-unit 配额终态、预算 settled 一次、交付确认和正文清理已完成；没有 Ready package。原 reserved 行为追加式账本历史，不是仍未结算；expiry-recovery 无记录，不把迟到 receipt 的收尾路径宣称为 expiry scanner 验收。原失败不得改判成功，也不能据此证明 Paid 下的新故障成功恢复。证据详见 cloudflare-migration-stage-a.md 最新节。

At 09:49:35–09:49:41Z, eight fixed metadata/SELECT projections succeeded with zero writes. A supplementary single SELECT at 09:50:58–09:51:00Z confirmed exactly one failed quota terminal row with zero units, matching the import resolution. The original synthetic provider call count remains one, repair count zero. Recorded terminal/cleanup timestamps are September 21, not a new action triggered by this read: failed at 11:11:40Z, import complete at 11:12:40Z, delivery acknowledged at 11:14:32Z and body removal recorded at 11:14:36Z. We did not perform a new R2 object probe or re-establish Cron provenance/Workflow status; prior history remains intact. Execution closed_at is null and the separate expiry-recovery table has no row; this observation is the completed receipt-import failure path, not proof of that separate expiry path.

Evidence remains in the original Research worktree under outputs/local-durable-executor-20260914/task15-smoke/cloud-ops-20260921/long-run/: native-after-d1-upgrade-check-20261005.json and native-after-d1-quota-20261005.json, with corresponding bounded collectors. The old collector and all earlier observations were preserved. Each collector uses the fixed isolated resource IDs/config hashes, neutral CLI directory, existing process proxy, no dev vars or raw stderr output, and no automatic retry. No application source, cloud bindings, data, AI flags or DNS were changed.

下一步：恢复此前用户明确暂缓的六步签名回放本地实施（重复提交、状态读取、A/B 找回与隔离），候选设计已有独立 PASS，但仍待用户解除“先完成套餐升级，暂不实施”的暂缓指令。此时尚未实施/部署回放、未启动新演练或真实模型请求；新的 Paid 成功补测资源及操作需另行核对。旧账号与完整源 D1/R2 导出恢复、域名切换和公开 Research 验收仍未完成。

The reviewed candidate is in the Research worktree at docs/superpowers/specs/2026-09-21-arc-v8-cloud-smoke-replay-design.md; design SHA256 fa5e7c81fb575a94d03a314d260f521f15b05d484210fcc5c491b30264e858aa. Its independent review PASS is design-only. The historical title paragraph still says pending review; the dated review receipt is authoritative for review status, while the user's local implementation deferral remains in effect.

Date: 2026-09-22. This is an isolated migration rehearsal of the public Research-closed baseline, not a production cutover or completed data migration.

## Source and local baseline

- Branch: codex/v8-cloudflare-migration.
- Baseline commit: cd2b9abead3a98d635850461e2b49bb650618a6d.
- Baseline tree: fd4c50e8989e3ea5e189b15dd2283a6e0324f32c.
- Original Research working tree remains separate and unchanged except progress documentation.
- `npm ci --offline` initially failed because one locked package was absent from cache. Normal `npm ci --no-audit --no-fund` then installed 810 packages successfully with the original lockfile; no dependency upgrade.
- Baseline `npm test` passed all five build phases and four rendered/client-boundary tests before adaptation.
- A1 implementation is frozen. Independent SPEC and a different QUALITY/security reviewer both passed, with no blocking findings.
- Root independently reran 88 target/preflight/auth/Research tests and four rendered/client tests; all passed. Actual shadow artifact preflight, TypeScript, targeted ESLint and git diff whitespace checks passed.
- Native Wrangler deploy --dry-run passed: total upload 4565.62 KiB, gzip 978.01 KiB; exact DB/R2/ASSETS and four non-secret variables. No cloud Worker deployment was performed by dry-run.
- Root receipt with artifact hashes and the seven baseline migration hashes: ignored outputs/cloudflare-migration-20260922/root-a1-verification.json.

## Local Workerd validation

- The first local D1 initialization failed with SQLITE_CANTOPEN before application SQL. The long output root would produce a 264-character hashed SQLite path; metadata.sqlite at 208 characters was created while the main database was not. A fresh shorter ignored `.wrangler/migration-a2` path produces 237 characters and the same seven migrations then completed. No application or SQL change was needed; the failed state was retained.
- Native local D1 verification returned exactly 41 application tables, seven ordered baseline migration entries and zero foreign-key violations. Users, accounts and Research runs remained zero. Two sanitized operational error events were produced by the intentionally unconfigured-auth probe.
- Local Workerd served `/`, `/sign-in`, `/setup`, `/today`, `/path` and `/stack` with status 200 and the development notice. CSS returned 200 and homepage canonical metadata points to arcmaps.net.
- `/api/auth/providers` correctly reports no configured providers; eligibility rejects with 503/UNAVAILABLE. The initial probe expected the Research write endpoint to use 503 as well, but it returned the baseline 500/INTERNAL because absent auth runtime is classified generically before service construction. This is a recorded missing-auth limitation, not a passing login or Research acceptance. No Provider key exists and both enable flags remain false.
- Native local R2 synthetic attachment put/get completed with identical SHA-256. It contains no source user data and was not uploaded to cloud R2.
- Miniflare's optional Request.cf metadata fetch timed out and fell back to defaults; local Workerd still became ready. These measurements do not establish real cloud CPU usage or geographic access.
- The local server was stopped after verification. Safe receipts: local-http-receipt.json, local-d1-receipt.json and local-r2-receipt.json in the ignored output directory above.

## Isolated cloud resources

Native Wrangler authenticated through the already-authorized local HTTP proxy, using its existing OAuth credential without reading token values. Direct connectivity failed first; proxied native requests succeeded. All listed identities are non-secret.

| Resource | Identity | Verified state |
| --- | --- | --- |
| Account | 54eaadb89014252836694203c1e22546 | Existing OAuth login and account verified |
| D1 | arc-v8-migration-db-20260922 | Created successfully; UUID 83a47917-a4f4-4121-baad-1032677f18a8; WNAM |
| R2 | arc-v8-migration-proofs-20260922 | Created successfully; Standard; r2.dev public access disabled; no custom domains |
| Worker | arc-v8-migration-shadow-20260922 | Deployed successfully; version 7f6766af-f5b6-4d7a-ada5-ac67b1c2b227 |

The initial Worker-name lookup encountered a Windows libuv exit assertion after API code 10007. That initial lookup is not recorded as a successful command. The later native deployment succeeded separately. No source or existing smoke resource was changed.

The exact non-secret target is `cloudflare.shadow.json`. Required application bindings are `DB` and `PROOF_ASSETS`, not the suggested generated binding names printed by resource creation. This inventory has no routes, production custom domain, triggers, model key or authentication secrets. After the local checks, a native query confirmed that the new remote D1 contained only Cloudflare's `_cf_KV` table. The seven baseline migrations were then applied successfully to this exact new database. No source user data was imported.

Existing smoke D1 UUIDs fe4952d0-da78-4c85-b1fa-8a5706d42fa3 and 81d44533-40d9-4544-a03d-81a01e2719ae, their Workers and arc-v8-smoke-receipts-20260921 remain untouched. arcmaps.net still serves the existing Sites version.

## Shadow deployment and remote checks

- Reviewed source commit: a57455f1497d2dd67ea3479ea002c18cecf48b8a. The three build/inventory hashes were checked against root-a1-verification.json immediately before deployment. That earlier receipt correctly says no cloud deployment had occurred at its timestamp; do not rewrite historical receipts.
- Native Wrangler deployment exited 0, uploaded 36 assets, and reported version `7f6766af-f5b6-4d7a-ada5-ac67b1c2b227`, created 2026-09-22T09:36:37.83412Z. Native deployments list confirmed 100% traffic; a subsequent versions view confirmed the exact version and bindings.
- URL: https://arc-v8-migration-shadow-20260922.23711031.workers.dev/ . Script etag: 1d432b37226fc491123ff684f68c1f267228a5764b4d4647792c324265a1aa6d.
- Bindings are exactly ASSETS, the new DB, the private PROOF_ASSETS bucket and four plain variables: ARC_ENVIRONMENT=production, BETTER_AUTH_URL=the shadow origin, ARC_AI_ENABLED=false and ARC_AI_RESEARCH_ENABLED=false. The initial version has no auth/model secrets, workflows or scheduled handler. It does not attach arcmaps.net.
- Native remote D1 checks found 41 application tables, the seven baseline migrations, no foreign-key violations, and zero users/accounts/Research runs. Safe result: ignored outputs/cloudflare-migration-20260922/cloud-d1-receipt.json. This is an empty target schema, not a restored source database.
- HTTPS checks through the authorized local proxy returned 200 for Setup, Today, Path and Stack. Initial homepage/login attempts failed before receiving HTTP; the first receipt retains two null observations. Follow-up checks returned 200 for homepage, login, CSS and og.png, and verified the development notice and arcmaps.net canonical metadata. Both cloud-http-receipt.json and cloud-http-followup.json are retained; the first is not described as an entirely passing run.
- Auth providers returned an empty list and Research eligibility returned 503/UNAVAILABLE while auth is unconfigured. No real login, authenticated ownership test or cloud attachment write has occurred. Page responses through the observed LAX edge do not establish universal regional access or load capacity.
- Worker startup time was 91 ms. This is not per-request CPU time, Research duration or a billing estimate. The version's usage_model=standard is not evidence that the user's pending Workers Paid subscription has activated.

## Authentication and transfer dependencies

User searched Bitwarden and did not find the original BETTER_AUTH_SECRET. The three smoke secrets A/B/C are unrelated. The read-only dependency audit has documented the conditions for preserving provider/user/owner identity while forcing fresh authentication; no old secret has been changed and no encrypted token has been read or transformed.

User found both the Arc GitHub OAuth app and the matching Google OAuth client and confirmed that both Client Secrets are saved. The values have not been read or validated; existing callback URLs have not been changed. The next guided step is saving a new shadow-only BETTER_AUTH_SECRET in Bitwarden, followed by direct Dashboard Secret entry and additive callback setup. See cloudflare-shadow-auth-setup.md. The currently deployed version remains usable for that configuration; subsequent code redeployment requires the secret-preservation checks documented there.

The read-only auth audit found that fresh provider login can preserve existing user IDs without decrypting old OAuth tokens first, conditional on exact provider-account continuity. Residual encrypted refresh tokens and in-flight account-link state require deliberate destination-only handling. This fallback is documented in auth-migration-readiness.md and has not been implemented or tested against real accounts.

Native Sites metadata confirms 41 application tables and configured encrypted auth secrets, but does not provide a verified complete source D1/R2 export. Full consistent transfer, safe authentication configuration and real account acceptance remain prerequisites for DNS cutover. Empty or synthetic target tests do not satisfy these prerequisites.

Workers Paid remains Processing by user report. This does not block local build work or isolated resources; it is not evidence that paid limits are active. No real Provider request is authorized or performed by this migration preparation.
