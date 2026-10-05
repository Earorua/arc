# 有限登录诊断：隔离测试站

**2026-10-05 最新：Google 与 GitHub 均已通过测试站真实登录和刷新会话验收。** 用户完成 GitHub 个人登录后曾返回登录方式页，再自行选择 Continue with GitHub 后进入 Today；中间返回原因未观测，不推断为密钥或回调错误。Root 在原 IAB2 页4实际展开账户菜单，确认 GitHub connected、Sign out、shadow /today、无允许列表中的错误码；刷新后再次展开，四项结果保持。本轮代理没有再发起登录、没有读取凭据或操作账户关联。安全证据：迁移树 outputs/cloudflare-migration-20261005/auth-diagnostic/github-login-success.json。旧“等待 GitHub 个人登录”的前置条件已解除。

下一步只读核对 Workers Paid。原 IAB2 页5现仍为 dash.cloudflare.com/login，已请用户登录持有 arcmaps.net 的原账户并回复进度；不重新订阅/购买，不读取个人密码/验证码。页3 Google控制台、页4已登录测试站、页5Cloudflare均保留。真实旧账号/数据连续性、完整源 D1/R2 导出恢复、Paid生效与公开Research发布仍未通过；本轮没有模型调用、DNS/源数据/旗标变更。下方登录等待状态为历史；goal工具本轮仍报告上一阶段的blocked，未将全目标标记完成，也不把该管理状态当作当前GitHub失败。

## 2026-10-05 16:54：Google Secret 修正后真实登录成功，刷新保持

用户逐步私下核对 Google Arc Web 密钥已启用、已保存 Client ID 完全一致、Secret 尾部相同。随后发现 VS Code 打开的 Markdown 笔记源码含 `\_`，预览中只显示下划线；用户从预览重新复制完整值，在 migration-shadow 的 GOOGLE_CLIENT_SECRET 中自行替换并保存部署。代理没有读取秘密值，也没有重置/新增 Google 凭据。

08:48:31Z 原生元数据检查 accepted=true：用户部署后版本 458830cc-bfed-4d31-9b9d-de0269c9bcbc，部署 0f3260cb-f9fd-4d66-9906-c7addcf48098，流量100%；五项配置仍是 secret_text，四项普通变量与 DB/R2/ASSETS 精确匹配，两个 AI 开关 false。使用既有安全收集器、现有进程代理取得公开 GET 原生事件后，只点击一次 Continue with Google。浏览器实际到 shadow /today，出现 Sign out，错误参数为空；随后刷新同一页，仍 /today 且 signedIn=true。Google 真实登录和页面刷新后的会话保持已通过。修正前 invalid_client/401、修正后登录成功，与 Markdown 转义误复制一致；代理未读取旧值，不能声称逐字符证实旧值差异。

安全证据：迁移树 outputs/cloudflare-migration-20261005/auth-diagnostic/secret-correction-login-result.json 及新的 pre-deploy-metadata.json。此前同名元数据、观测和浏览器结果已带时间戳归档，未丢弃失败历史。首次未显式设置进程代理的收集器在登录操作前 child-failure；使用既有代理重建后取得事件，实际 Google 按钮共一次。没有新增代码或模型调用，源 Sites/arcmaps.net DNS/源数据及 smoke 未变。

原“等待 Google 私下核对”的阻塞已解除，goal 实查 active。下一步为 GitHub 真实登录验收；旧账号/数据连续性、完整备份恢复、Workers Paid 生效和公开 Research 发布仍未完成，不能用本次 shadow 登录成功替代。以下 blocked/登录失败条目均为历史。

收集器收尾：本轮本地执行会话 stdin 已关闭，stop 输入未送入；收集器随后达到300秒预设边界，报告 collector-timeout、exit1，并按实现等待子进程关闭后退出。它是观测时限终止，不能解释为 Google 登录失败；登录成功来自浏览器真实 /today + Sign out 以及刷新后的会话。没有遗留收集进程。以后需要人工提前停止的同一操作脚本应以保留 stdin 的交互会话启动，不能把 collector-started 本身当作云端连接证明。

## 2026-10-05 早先结果（历史）：已定位客户端认证失败，登录尚未修复

本轮有限诊断四项任务完成。独立整合审查 READY 后，迁移分支 `daf8196044254b048e407abdd1a23ff4a6660ab6` 已备份并核对远端一致；再次匹配已审查代码/操作脚本哈希、新鲜云端元数据及全部 92 个构建文件后，只部署了 migration-shadow。

部署成功且原生复查通过：新版本 `b75bd747-a8d5-4873-b084-e9b5f14401bc`、部署 `31067373-568e-43a1-b1e0-f46ad2a21ebe`、100% 流量。五项 Secret 均继承为 secret_text，四项普通变量和 DB/R2/ASSETS 精确匹配；两个 AI 开关仍 false。旧版本回滚参考 `72fbb334-c989-40b3-ade1-008e92811a9e`。匿名首页、登录页、providers 均 HTTP 200，开发提示存在、providers 恰好 google/github；这不证明凭据有效。

安全观测从 03:04:45Z 至 03:07:02Z（约 137 秒），先通过公开页面请求获得新原生事件，确认真实连接，再在既有内置浏览器仅点击一次 Google 登录。03:07:00.202Z 记录：

```text
[Arc Auth] ERROR upstream_error=invalid_client http_status=401
```

对应 Cloudflare outcome=ok；它表示 Worker 正常返回，不表示 OAuth 成功。收集器收到分类 marker 后自动停止、确认子进程关闭，退出码 0。最终浏览器仍在测试站 `/sign-in`，只读投影的 error 值为 oauth、invalid_code；未登录。没有第二次点击，没有 raw 日志、完整授权网址、code/state/Cookie/token 或秘密值输出/落盘。

Google 官方 token endpoint 参考将 invalid_client / 401 定义为客户端认证失败，可能涉及 Client ID、Client Secret 或客户端类型；不能仅凭此确定哪一项配置错误。已核对 Arc Web 为网页客户端，原站/测试站回调均正确，下一步由用户私下核对同一 Arc Web 的 ID/Secret 配对及密钥启用状态；不自动新建、重置或删除密钥。官方依据：https://developers.google.com/identity/openid-connect/reference 。已发起仅询问核对进度的用户步骤，不索取值。

安全结果：`pre-deploy-metadata.json`、`deploy-receipt.json`、`post-deploy-metadata.json`、`post-deploy-public.json`、`one-login-observation.json`、`browser-google-result.json`，均在下述 ignored 证据目录。本次没有 OpenRouter 请求、源 Sites/DNS/原数据变动或公开 Research 上线。有限诊断完成不等于认证修复、旧账号连续性或完整公开发布完成；总体目标仍 active。以下是保留的过程记录。

## 当前范围与证据

2026-10-05 用户批准有限诊断；计划为 `docs/superpowers/plans/2026-10-05-auth-upstream-error-diagnostic.md`。本次只处理 `arc-v8-migration-shadow-20260922` 的登录错误观测，不改变认证策略、原 Sites、arcmaps.net、真实源数据或 Research 开关，也不调用 OpenRouter。

Google Arc Web 原站和测试站回调已通过真实浏览器核对，测试站单次登录实际返回 oauth/invalid_code。Client ID 与 Secret 配对未验证，错误根因仍未知。

2026-10-05T02:11:51Z 只读原生复查通过：活动版本 `72fbb334-c989-40b3-ade1-008e92811a9e`、部署 `a7a46d20-bba3-415d-93c4-0965d4be3813`、100% 流量；五项登录配置均 secret_text；四项普通变量以及独立 DB / PROOF_ASSETS / ASSETS 绑定精确匹配；没有额外绑定；两个 AI 开关均 false。此版本作为当前回滚参考，部署前还须新鲜复核。本次仅读取元数据并投影匹配结果，不取得 Secret 值。

最初原生检查因为 WRANGLER_LOG=error 抑制 logRaw JSON 而没有可解析输出；改为 log 后成功。这是本地观察命令设置，不是云端连接故障或登录根因。

## 本地与部署门槛

Task 1 已完成并备份；Task 2 收集器完成 SPEC 与不同 QUALITY/安全复审，提交 bddd676；最终独立整合审查 READY；部署待执行。真实 callback 首次有效 RED：原 marker 仅为 `[Arc Auth] ERROR`，预期分类 invalid_client/401；此前 state、请求字段、单次兑换、原重定向与数据库不变断言通过。随后 formatter RED 为 46 failed / 28 passed；GREEN 及独立复核均为 6 文件 / 97 项通过（67 formatter、7 genuine callback，另有原有回归），类型与限定 lint 通过。独立 SPEC PASS 后不同 QUALITY/security READY，零未解决问题。提交 `1a465ee7fecf3c3e9e4daf75146469565437d9d1` 已推送 GitHub 同名迁移分支并 ls-remote 匹配；未合并 master。

最初类型检查的 BigInt 字面量及 lint 未用参数问题已在实施时修正。成功命令无输出，Tee-Object 遗留旧输出导致回执失真；旧失败分别保存为 historical 文件，已重新验证并写入含时间和退出码的成功回执。不得将旧日志误作当前失败，也不得丢弃失败历史。

Task 2 首次独立 QUALITY 发现终端 stdout 异步错误可能绕过子进程清理（Q1）。实施者先复现 RED，再加入输出错误监听、写入回调及待完成写入跟踪，确保关闭私有流、终止并等待子进程关闭。同步 throwing emit 回归也已补齐；56 项测试通过，SPEC 复审 PASS → 不同 QUALITY/安全复审 READY，Q1 已关闭；原始失败与 52/55 项历史保留。Root 最终相关测试为 97 项认证 + 56 项收集器全部通过，类型检查及七文件 lint 均 exit 0。

本轮 shadow 实际构建、严格预检均 exit 0，现有页面检查 4/4 通过。92 个 dist 文件及八个构建/应用源文件哈希保存在 `outputs/cloudflare-migration-20261005/auth-diagnostic/artifact-manifest.json`，清单 SHA256 为 `595b079ba5d751a6e959ae6338551771b85c06ed148c52445d0c3ac35dc04635`。构建包含已提交的诊断 formatter；之后改动仅本地收集器和测试，不进入 Worker 包。部署前必须再次匹配全部哈希，五项 required Secret 名称、四项变量与隔离绑定保持精确限制。

按顺序完成：新 formatter / genuine callback 测试 → 独立 SPEC → 不同 QUALITY/security；安全收集器同样 TDD/双审；相关回归、类型、限定 lint、实际 shadow 构建和严格预检；最终独立整合审查。未通过前不部署。

构建：

```powershell
$env:ARC_CLOUDFLARE_TARGET='cloudflare.shadow.json'
$env:CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV='false'
node scripts/run-vinext.mjs build
node --experimental-strip-types scripts/check-cloudflare-build.mjs cloudflare.shadow.json
```

部署必须使用已审查、哈希匹配的 `dist/server/wrangler.json`，依照 required Secret 名称继承方案，不能用 keep-vars 无差别保留配置。新鲜核验原生版本和五项 Secret 类型后部署；随后再核验配置和匿名页面/providers，后者仅证明配置被识别，不证明凭据有效。

## 观测方法

收集器实现并审查通过后才可运行：

```powershell
node scripts/cloudflare-migration/auth-tail.mjs
```

只允许输出经过验证的时间、固定 Cloudflare outcome 和完整匹配的 Arc 错误类别/数字 HTTP 状态。原始 stdout/stderr、事件请求网址、异常对象及 OAuth 参数不输出、不落盘；Wrangler 磁盘日志、遥测、错误上报和 dev vars 读取显式关闭。多行 JSON 私有缓冲最大 256 KiB，最长观察 300 秒，完成单次操作或超时后清理子进程。不要直接运行未过滤的 wrangler tail。

只进行一次已批准登录观察；用户处理个人认证输入。missing marker / timeout / generic ERROR 均不等于网络失败，也不触发自动重试。invalid_client 提示私下检查客户端凭据；invalid_grant 仍需区分授权码、回调及 PKCE 条件。只有真实 UI 会话验证才能确认登录成功。

## 未完成的独立门槛

有限诊断的完成条件是本地门槛、审查、限定部署均通过，并取得实际可行动错误类别或验证登录成功。当前尚未达到。即使测试站登录成功，旧账号连续性、源数据完整导出恢复、Workers Paid 生效及 Research 公开发布仍是后续独立验收，不可混为已经完成。

本轮安全证据存于 ignored `outputs/cloudflare-migration-20261005/auth-diagnostic/`。

## 最终整合门槛通过

2026-10-05T03:03:03Z，独立最终审查 READY、零未解决问题。审查者重新验证 97+56 项测试、九项离线操作脚本探针、操作脚本语法与严格预检，并逐一匹配 92 个构建文件、八个源文件及三个操作脚本哈希。报告 final-integration-review.json 保存在本轮 ignored 证据目录。03:01:13Z 新鲜原生配置检查 accepted=true，旧版本仍为 72fbb334-c989-40b3-ade1-008e92811a9e。准备提交说明、备份迁移分支后部署；本段不构成云部署或登录成功证明。
