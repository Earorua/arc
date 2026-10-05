# 有限登录诊断：隔离测试站

## 当前范围与证据

2026-10-05 用户批准有限诊断；计划为 `docs/superpowers/plans/2026-10-05-auth-upstream-error-diagnostic.md`。本次只处理 `arc-v8-migration-shadow-20260922` 的登录错误观测，不改变认证策略、原 Sites、arcmaps.net、真实源数据或 Research 开关，也不调用 OpenRouter。

Google Arc Web 原站和测试站回调已通过真实浏览器核对，测试站单次登录实际返回 oauth/invalid_code。Client ID 与 Secret 配对未验证，错误根因仍未知。

2026-10-05T02:11:51Z 只读原生复查通过：活动版本 `72fbb334-c989-40b3-ade1-008e92811a9e`、部署 `a7a46d20-bba3-415d-93c4-0965d4be3813`、100% 流量；五项登录配置均 secret_text；四项普通变量以及独立 DB / PROOF_ASSETS / ASSETS 绑定精确匹配；没有额外绑定；两个 AI 开关均 false。此版本作为当前回滚参考，部署前还须新鲜复核。本次仅读取元数据并投影匹配结果，不取得 Secret 值。

最初原生检查因为 WRANGLER_LOG=error 抑制 logRaw JSON 而没有可解析输出；改为 log 后成功。这是本地观察命令设置，不是云端连接故障或登录根因。

## 本地与部署门槛

Task 1 已完成并备份；Task 2 收集器正在实施，没有新代码部署。真实 callback 首次有效 RED：原 marker 仅为 `[Arc Auth] ERROR`，预期分类 invalid_client/401；此前 state、请求字段、单次兑换、原重定向与数据库不变断言通过。随后 formatter RED 为 46 failed / 28 passed；GREEN 及独立复核均为 6 文件 / 97 项通过（67 formatter、7 genuine callback，另有原有回归），类型与限定 lint 通过。独立 SPEC PASS 后不同 QUALITY/security READY，零未解决问题。提交 `1a465ee7fecf3c3e9e4daf75146469565437d9d1` 已推送 GitHub 同名迁移分支并 ls-remote 匹配；未合并 master。

最初类型检查的 BigInt 字面量及 lint 未用参数问题已在实施时修正。成功命令无输出，Tee-Object 遗留旧输出导致回执失真；旧失败分别保存为 historical 文件，已重新验证并写入含时间和退出码的成功回执。不得将旧日志误作当前失败，也不得丢弃失败历史。

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
