# 多类型资料：暂停点离线修复验收

2026-11-05（北京时间）。本轮从已保存的 `24e918d3b9a0` 继续。新的产品源码提交是 `d1577b37bd08eea56d5a0a2578dd0eba2e991f84`，本地分支 `codex/materials-offline-recovery-20261105`。旧暂停快照、两批冻结语料和 Research 基线保持原样。[逐文件源码摘要](materials-offline-repair/candidate.json) · [历史暂停快照](2026-11-04-materials-resume-checkpoint.md)

**下文是 d1577b3 的历史离线验收。** 后续 B1 仅有 1 次合成推理、0.019506 USD；独立只读 GET 已成功，模型版本匹配修复及真实配对核验见[最新验收报告](2026-11-05-materials-canonical-model-fix.md)和[实际单笔结果](2026-11-05-materials-b1-single-receipt-result.md)。完整 Gate 1B 尚未通过，没有远程迁移或部署。B2 简历/JD 质量轮 **0/24**，补充资料质量轮 **0/6**，B4 浏览器轮 **0/24**，资料功能未公开发布。

## 修复了什么

| 暂停时的问题 | 新版本的实际行为 | 证据 |
| --- | --- | --- |
| 同笔聊天报 0、元数据报 0.50 USD，或原始金额不同但取整相同；崩溃后可能读到旧的成功草稿 | 先比原始十进制报价。冲突时保留整笔预占、停止后续发送，站点取不到候选。正式结果读取、结果重投和多段上传恢复遵守同一结论；即使任务已完成投递，维护任务仍可用幸存记录修复另一份账本，无须再次调用模型。 | [实际结果读取](../../worker/document-executor/result-store.ts) · [数据库恢复](../../worker/document-executor/d1-job-store.ts) · [恢复回归](../../tests/server/document-production-admission.test.ts) |
| 费用查询期间发生崩溃时，旧零报价可能被放行，已查明的 7 微美元也可能被丢弃 | 只有查询启动记录时继续冻结。若同笔可信回执已证明金额，则保留实际费用；晚到的旧状态不能覆盖冲突。测试辅助程序改为调用与站点相同的读取入口，原有冻结断言保留。 | [费用核验与故障用例](../../tests/server/document-generation-audit.test.ts) · [正式 B4 读取回归](../../tests/server/document-acceptance-admission.test.ts) |
| 未完成的 POST 或只有失败/待处理尝试的 GET 可能被当作已完成回执 | 产品、独立 B1 工具与补充资料入口均不采信未完成 POST 里的 ID 或价格。B1 模拟 HTTP 202、201、跳转后的 200、503：每例 1 次模拟 POST、0 次费用查询，72,960 微美元预占全部保留。GET 的 503 与 202 不能充作成功尝试。 | [产品传输](../../worker/document-executor/provider-http.ts) · [独立 B1 验证清单](materials-gate-1b-b1/single-receipt-entry-verification.json) |
| 补充文本已有 6 份语料和评分器，但没有可单独授权、可对账的采集入口 | 新入口固定候选、模型、价格、六份资料的版本，以及密钥与本地账本指纹。每份先预占、最多发送一次；先保存未经编辑的回答，再对账、评分。重启不会重发。只要已有可信价格就保留证据，无法核定费用时冻结；费用结清与质量达标分开记录。账本已在故障注入下验证。 | [采集入口](../../scripts/collect-materials-supplements.ts) · [持久账本](../../scripts/materials-supplement-ledger.ts) · [故障测试](../../tests/server/materials-supplement-collection.test.ts) |
| B4 默认预算为 0.50 USD，无法覆盖 24 份 Kimi 样例的最坏情况 | 保留原默认规则；新增仅适用于已审 Kimi 配置和原 24 份语料的具名预算方案。每笔顶格预留 0.072960 USD：0.50 USD 可容纳 6 笔；1.751039 USD 可容纳 23 笔；1.751040 USD 可容纳全部 24 笔。新方案硬上限 2.00 USD，旧预算、计数和停发记录不被升级，执行迁移本身不会签发授权。 | [增量 SQL](../../worker/document-executor/migrations/0004_document_acceptance_budget.sql) · [登记脚本](../../scripts/materials-ui-acceptance-enroll.ts) · [预算边界测试](../../tests/server/document-acceptance-budget.test.ts) |

## 如何复核

先复现暂停点的故障，再修改执行器。首次定向复现有 7 项失败。集成时另有 4 个新预算测试使用手写旧审计记录，改为由真实审计器读取模拟 HTTP 回执。没有删除断言、修改 Research 哈希，或把旧日志当作新候选的线上结果。

| 离线检查 | 验证结果 |
| --- | --- |
| 全仓 Vitest | **354 个套件，7,526/7,526 通过**。 |
| Research 严格哈希套件 | 另行复跑 3 个套件，**131/131 通过**。 |
| 附加 Node 与构建后页面 | 附加 9 个文件 **290/290 通过**，无跳过；另有构建后页面 **5/5 通过**。Node 附加套件默认并行时有 7 项失败，日志包含共用的本机端口 4181 被占用；保持原测试，按仓库规定的 `--test-concurrency=1` 全数复跑通过。 |
| 静态检查 | TypeScript 退出码 0；全仓 ESLint **0 错误、4 条既有 Research 测试警告**。 |
| 专项回归 | 通用计费与旧回执恢复 123/123；产品 POST 状态等 40/40；集成 B4 登记与预算 29/29；补充资料采集及关联套件 50/50（含 19 项采集测试）。这些数字与全仓有重叠。 |

完整计数、首次失败和最终日志 SHA-256 见[机器验证记录](materials-offline-repair/verification.json)，B4 的旧/新 SQL 和登记边界见[本机 CLI 对照](materials-offline-repair/b4-budget-cli-proof.json)。测试使用本机传输，出站保护拦截的尝试数按环境单独记录；干净构建没有非回环网络尝试。

产品源码树为 `65e102f1309a8108ccf304122d88576ac8864bfa`。已在只含暂停基础提交的本地空库还原[增量源码包](materials-offline-repair/source.bundle)，通过 Git 严格完整性检查。随后从该提交单独提取源码、复制本机锁定依赖，在无账号凭据的临时目录重建。关闭态站点和执行器共 **389** 个文件；构建和复制后分别按清单逐项重算，产物树 SHA-256 为 `6d5c3cfda80da4f12825da04f3708197a2379c95c02ae06e90cedcb63dc15870`。[构建记录](materials-offline-repair/clean-closed-build.json) · [文件清单](materials-offline-repair/artifact-index.json)

用本地归档的 10 月 30 日绑定清单和虚构资源，分别生成关闭态和模拟开放态包，各 389 个文件；每包只有两个 Wrangler 配置变化，其余 387 个文件与输入一致。真实时钟拒绝已过期的测试授权，没有创建开放包；仅在模拟时钟下验证了开放态打包。站点和执行器共 **4 次本地 dry-run** 通过，每次站点 65 个 JavaScript 模块逐字节一致，执行器程序也对回冻结输入及必要导出。该演练没有读取当日云资源，不能作为线上验收。[打包与 dry-run 证据](materials-offline-repair/public-package-proof.json)

独立 B1 工具固定使用旧产品提交 `7052aedd8a49` 下的 8 个已审源码文件。新工具在该固定环境通过 **35/35** 项 Node 测试和 **57/57** 项适配器回归，程序组合摘要为 `147bfe158a418bb49b22203a5dc8eb44e8b7af6521f4dc2555eea56774ec659b`。操作时使用[单笔操作单](../superpowers/runbooks/2026-11-04-materials-kimi-single-receipt.md)规定的固定环境；新产品候选中的工具副本不改变它对那 8 个文件的校验。首次离线验收时登记指纹、签发和执行均未进行，后续本机状态见下文。

### 在这台机器上运行 B1

本工作树已准备好专用目录 `work/kimi-b1-147bfe15`。其中的产品文件取自 `7052aedd8a49`，取证工具取自 `d1577b37bd08`。81 个文件逐一匹配本地 Git 对象，运行时复用本机已安装的锁定依赖。8 个固定产品文件和 8 个取证文件通过摘要检查。在空的模拟用户目录中，从这个入口运行 35 项测试全部通过，查看模板退出码为 0，缺少授权的预检退出码为 2。实际用户目录中的密钥和授权由持有人保管。[本机入口验证记录](materials-offline-repair/b1-operator-directory.json)

在本工作树根目录的 PowerShell 7 中先运行下行。在此目录按[单笔操作单](../superpowers/runbooks/2026-11-04-materials-kimi-single-receipt.md)的顺序登记指纹、生成模板及启动。两小时窗口从持有人明确同意时开始。

```powershell
Set-Location -LiteralPath './work/kimi-b1-147bfe15'
```

此目录可在含有上述两个提交及已安装依赖的其他本地检出中重建。下表内的文件按各自提交从 Git 归档提取，保留相对路径。然后将目录内的 `node_modules` 指向已核对的本机依赖。当前检出与固定产品版本的 `package.json`、`package-lock.json` 和 `tsconfig.json` 已逐字节核对。

| 来源 | 需要恢复的路径 |
| --- | --- |
| `7052aedd8a49` | `app/contracts/`、`app/server/documents/`、`app/lib/planning/`、`worker/document-executor/`、`scripts/materials-qualification-journal.ts`、`scripts/materials-qualification-runner.ts` 和上列三个根配置文件。 |
| `d1577b37bd08` | [B1 验证清单](materials-gate-1b-b1/single-receipt-entry-verification.json)中 `testedFilesSha256` 列出的全部 8 个文件，恢复至 `docs/verification/materials-gate-1b-b1/`。 |

### 内置浏览器与授权窗口核验

北京时间 11 月 5 日 07:47:03 收到单笔明确授权，接受固定合成句的缓存边界，总额上限 0.075 USD，有效至 09:47:03。用户后续要求使用内置浏览器时，该窗口已到期。

内置浏览器成功打开已登录的 `materials-b2` 工作区。页面确认专用 key 的使用额为 0.000 USD、累计限额 2 USD、尚未使用，护栏 `materials-b2-zdr` 已指派，Other ZDR 已启用、免费训练已禁用，输入输出日志关闭，追踪目的地均待设置。使用页面给出的密钥标识在工作树外登记了工作区指纹，完整 key 由持有人保管。

公共端点的本次读取仍为 `moonshotai/kimi-k3.1-pro` 经 `moonshotai/mxfp4`，输入与输出费率分别为每百万 token 2 和 10 USD。本机保存了原始批准的时间窗口，预检以退出码 2 拒绝过期授权。唯一发送名额尚未占用，实际模型调用和实付仍为 0。重新取得有效时间窗口后，持有人只需在本机隐藏输入完整 key。[本次预检记录](materials-gate-1b-b1/2026-11-05-owner-preflight.json)

### 手机输入准备及未发送记录

北京时间 11 月 5 日 11:41:59，持有人再次确认同一笔合成取证；两小时授权窗口截至 13:41:59。本机预检通过。12:11:29 启动隐藏输入进程，随后按用户的手机远程操作要求改用内置浏览器的本机密码输入页。切换界面没有延长原进程的 15 分钟限制，输入截止仍为 12:26:29。

12:29:14 核对时，服务仍停留在等待输入状态，独占运行目录不存在，没有取得发送名额，也没有发出模型请求或产生调用费用。旧输入服务已停止、浏览器输入页已关闭。已向持有人请求重新开启输入窗口，等待明确答复；不得把自动续跑视为续期授权，也不得删除已有运行账本来重试。[本机状态记录](materials-gate-1b-b1/2026-11-05-mobile-input-status.json)

本机输入辅助页曾在到期后继续显示“等待输入”，服务端仍会拒绝提交。已修正为到期时禁用输入与提交按钮、清空输入框并显示到期提示；状态接口也报告 `expired`。定向回归先复现该缺陷，再通过 **2/2** 项本机测试，覆盖来源校验、错误密钥、重复提交和到期拒绝。辅助页仅保存在忽略的 `work/receipt-accounting/` 下，固定取证程序和产品源码没有改动。这不是新的全仓测试、B1 配对回执或线上验收。

## 下一步

1. **B1 技术取证**：单笔推理名额已消耗，费用为 **0.019506 USD**，不得重开原推理。账户网页核对了相同回执、标准端点、用量和费用；自动 3 次 GET 未取得可用元数据。下一步仅由持有人运行已准备的额外一次只读查询，确认普通 key 的实际读取结果及 API 模型标识。[结果与只读命令](2026-11-05-materials-b1-single-receipt-result.md)
2. **B2 与补充资料**：B1 技术条件满足后，24 份简历/JD 和 6 份补充文本须分别授权、采集、逐笔对账和评分。按当前审阅配置，顶格预留分别为 **1.751040 USD** 和 **0.437760 USD**，合计超过当前 key 限额；不能共用一次授权。B4 是另一轮浏览器验证，也要单独预算。
3. **B3–B5 与发布**：取得隔离资源和迁移授权，实测登录、隔离、恢复、删除及浏览器中的核对修改、换 JD、已完成任务保护；完成预算对账、回退演练和当日生产资源核对。OpenRouter 尚未给出上游缓存最长保留时间或关闭方式，处理真实简历需要单独的隐私决定及生产签批。单笔合成回执只回答路由与计费问题。[B1 供应方核验](2026-11-04-materials-gate-1b-b1-review.md) · [各阶段通过标准](../superpowers/plans/2026-11-04-private-materials-gate-1b-acceptance.md)
