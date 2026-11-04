# 多类型资料首发 · 暂停与恢复交接

> 这是 11 月 4 日的暂停快照。11 月 5 日已完成下文第 1 步的离线修复；继续工作请从[新候选、验证结果和下一步](2026-11-05-materials-offline-repair.md)开始。

2026-11-04，北京时间 22:18。按持有人要求保存并暂停。当前在 Gate 1B 的 B1，资料功能尚未公开上线。首发输入为粘贴的主简历、一份当前主 JD 和最多三份补充文本。已在本地验证用 AI 预填、由用户核对修改、人工兜底，以及换公司 JD 时预览差异、保留已完成任务的流程。PDF、DOCX 等文件导入列入后续阶段。[首发进度](2026-11-04-materials-public-release-progress.md) · [v2.1 设计](../superpowers/specs/2026-09-11-arc-private-materials-personalized-planning-design.zh-CN.md)

## 保存位置

| 内容 | 恢复入口 |
| --- | --- |
| 当前计费修复与测试，9 个文件 | 本地分支 `codex/materials-receipt-accounting-wip-20261104`，WIP 提交 `3e283ee7832c7283a39b6c324910608d52f80cd8`，tree `75b3ed6a0fd6e825a420366442b2ed62fa90a740`。[独立开发工作树](C:/Users/XF/.codex/worktrees/materials-receipt-accounting/ui-warm-precision) |
| 最近全绿的补充资料评分基线 | `dbc27aa6170c2849eef49e76adb96462305c2174`。该版全仓 7,479/7,479，通过的通用产品包来自其父提交 `7052aedd8a49`。计费修改后须重新验证和打包。[上一轮离线结果](2026-11-04-materials-supplement-quality.md) |
| B1 工具、授权草案、验收与恢复文档 | 本文所在的 `.worktrees/ui-warm-precision`，原工作分支 `codex/materials-phase-1-offline-20261104` 的 HEAD 为 `2caa51d56a41f60b837425ffa56dea4fbbecbd47`。本次另存本地快照分支 `codex/materials-pause-20261104`，以 WIP 提交为父，集中保存资料项目文档和取证工具。[B1 工单与账号证据](../superpowers/runbooks/2026-11-04-materials-kimi-account-evidence.md) · [单笔操作单](../superpowers/runbooks/2026-11-04-materials-kimi-single-receipt.md) |

## 最新测试与未结项

| 实际检查 | 结果 |
| --- | --- |
| WIP 工作树，全仓 Vitest | 352 个文件，7,490 通过、1 失败。失败为 `tests/server/document-acceptance-admission.test.ts:295`。该用例的辅助函数仅读取 R2 对象，费用冲突结果可以只保存在数据库，因此辅助函数返回了 `null`。恢复时经正式结果读取入口断言费用冻结、无可交付候选和后续停发。[全仓日志](C:/Users/XF/.codex/worktrees/materials-receipt-accounting/ui-warm-precision/work/receipt-accounting/full-final.log) |
| WIP 专项、类型、lint | 10 个套件 138/138。TypeScript 退出码 0。ESLint 0 错误、4 条既有警告。[专项日志](C:/Users/XF/.codex/worktrees/materials-receipt-accounting/ui-warm-precision/work/receipt-accounting/recovery-green.log) |
| B1 单笔工具，模拟凭据及模拟传输 | 最新 32/32 通过，含增补的小数精度和失败回执检查。未签批的程序摘要为 `1fd600d849216bf5d83a5b2ef321ca409b1ebe7df7f1e480eacf9063371b7c0f`。工作区 key 指纹绑定及持有人授权字段均为空。较早的入口验证 JSON 记录的是 30 项版本；实际取证前须把最终工具、摘要、回归记录重新对应。[较早版本记录](materials-gate-1b-b1/single-receipt-entry-verification.json) · [最新本地测试](../../work/materials-gate-1b/account-review/probe-decimal-green.log) |

三份本地日志的 SHA-256 分别为全仓 `5ff0cac4401f139046b239d053524036963f7af9231148a32e179649736a8742`，恢复专项 `614c3b150397a9e0ab9909127c7223f8f6cdf2cdb49a825035545c19cf87bd8d`，B1 单笔工具 `1234db065753fb66c12a13cb38ab556f9479b022726eadcdc19866eef7aa19bc`。

**恢复后的第一步是离线重现以下路径，再改代码。** 原始金额比较、费用冲突预留、双份本地证据和写入失败演练已进入 WIP。独立复核仍发现以下情形。

1. 一份冲突记录写入失败、站点已收到冻结结果时，维护扫描可能跳过已终结任务，留下另一份账本未修复。
2. 费用冲突证据已存在时，崩溃恢复或结果重投可能交付旧 R2 成功结果，把零费用和候选摘要重新带回站点。核查正式读取、投递及多段上传的写入终止证明。
3. 元数据检查已经结束且可信费用为 7 微美元，随后结果落盘失败时，恢复逻辑可能把已知费用误置为未知。须保留可信单笔价格，并让真正的双边冲突继续冻结。
4. 同一回执只有失败与未完成的尝试（如 503、202），须在产品校验器和 B1 工具验证其费用不会被当作成功回执。修正 B4 测试的读取路径后，重跑全仓、三个严格 Research 哈希套件、附加 Node 和渲染测试、类型、lint，再冻结、构建和核对新包。[独立工作树的执行器](C:/Users/XF/.codex/worktrees/materials-receipt-accounting/ui-warm-precision/worker/document-executor)

## 从暂停点到公开发布

| 顺序 | 待交付结果 | 正常投入估算 |
| --- | --- | ---: |
| 1 · 离线收尾 | 完成上述费用恢复、停发与回归，冻结并打包可复现候选。补齐补充资料独立采集入口与账本，评审 B4 当前 0.50 USD 上限与 Kimi 24 份顶格 1.751040 USD 的差额，准备相应增量迁移及本地兼容验证。 | 1–2 人日 |
| 2 · B1 单笔核验 | 建议在收到单独明确授权后，以一条固定合成 SQL 练习核对 Kimi 标准端点、回执 ID、token 和费用。最多一次推理、总额 0.075 USD。持有人在本机登记专用 key 指纹并私下提供凭据。授权后两小时内有效，启动后最多 15 分钟。生产隐私边界可并行确认。 | 0.25–0.5 人日，含准备与核对 |
| 3 · B2 和补充资料 | 另行获批后，真实模型逐份评测 24 份合成简历/JD，逐笔对账；补充文本 6 份使用单独范围、预算、账本和评分。记录准确率、有效出处、边界处理，并固定原始结果。 | 0.5–1 人日 |
| 4 · B3 隔离环境 | 取得隔离资源、迁移和云费授权，验证真实登录、私有存储、任务恢复、重复提交、删除清理与定时维护。用私有模拟服务注入故障。 | 1–2 人日 |
| 5 · B4 浏览器验收 | 获第二轮授权后从真实浏览器操作同一批 24 份合成简历/JD，验收 18 份预填、6 份边界、核对修改、采用或放弃差异、换主 JD 及完成记录保护，并核对补充资料参与规划的首发场景。 | 0.5–1 人日 |
| 6 · B5、生产签批与上线 | 对账、清理、验证回退，取得生产私有资料处理及预算决定，核对当日资源和绑定，办理发布与迁移授权。备份、迁移、分步开放后，从公网验证登录、资料隔离、分析核对、计划变化与关闭开关。 | 1–1.5 人日 |

顺利情况下，从恢复到公开上线预计约 **5–8 个工作日**，预留 **1–2 个工作周** 较合适。此估算假定测试账户与审核人可用、每轮如期授权、Kimi 质量达标且回执兼容。上游内存缓存的最长保留时限及关闭方式仍未获得书面确认。若上线要求明确时限，需要等待供应方企业条款，等待时间尚无可靠上限。模型质量未达标、回执不兼容或需要调整方案时再按实际结果重估。[验收工期与通过标准](../superpowers/plans/2026-11-04-private-materials-gate-1b-acceptance.md) · [生产操作单](../superpowers/runbooks/2026-11-04-materials-production-package.md)

本次资料功能真实推理 0 次，模型实付 0 USD，云端部署与远程迁移均为 0。B2 与 B4 分别为 0/24，补充资料为 0/6。专用 key 的 2.00 USD 为账户限额。持有人上次询问建议，尚未批准单笔取证、质量轮或生产发布。下次可直接说「从暂停点继续，先完成离线修复」。

