# 多类型资料参与学习计划的发布进度

更新于 2026-11-06。目标站点为 [arcmaps.net](https://arcmaps.net/)。B1 回执技术核验已通过。B2 第一轮停发后已完成回执查询的离线修复，新的 R2 质量轮待独立审批。

**R2 候选已冻结。** 新版将可重试的读取分布到原有 30 秒窗口，逐次保存脱敏状态和耗时。全仓 7,566/7,566、附加 Node 290/290、页面 5/5 通过，新构建已完成 4 次本地发布 dry-run。24 份合成请求体逐一匹配原待审摘要。R2 真实推理 0、费用 0，累计已结算仍为 0.055168 USD。[修复验收](2026-11-06-materials-b2-lookup-repair.md) · [R2 授权单](../superpowers/runbooks/2026-11-06-materials-b2-r2-authorization.md)

**11 月 6 日 B2 第一轮结案。** 持有人批准后完成账户、预算与冻结候选核验，提交首份 `resume-01`。3 次自动 generation GET 后为 `metadata-unavailable`，费用已结算 **0.035662 USD**，未决预留 0；质量评分 **0/24**，余下 23 份未发送。该 runId 已封存。[B2 结果](2026-11-06-materials-b2-r1-result.md) · [B2 授权单](../superpowers/runbooks/2026-11-06-materials-b2-authorization.md)

**B1 与 B2 合计已提交 2 次推理，累计已结算 0.055168 USD。** B1 普通 key 的延后 generation GET 返回 HTTP 200，修复后的精确模型版本匹配已通过真实配对的离线回放。B2 首份在自动查询窗口内未取得可用元数据。完整 Gate 1B 与公开发布尚未完成。[B1 实际结果](2026-11-05-materials-b1-single-receipt-result.md) · [离线修复验收](2026-11-05-materials-canonical-model-fix.md)

## 首发范围

登录用户粘贴一份主简历、一份主岗位 JD 和最多三份补充文本，也可以只提供其中一类。三类资料都可在用户允许后由 AI 提取，用户对照原文核对、修改和采用，或选择人工整理。时间预算以用户本次确认的设置为准。替换公司的主 JD 时，需在同一岗位下保留仍有效且已采用的其他资料，让用户预览并决定是否应用计划变化，保留已完成任务。PDF、OCR、链接抓取和并行多目标比较留在后续阶段。[v2.1 产品方案](../superpowers/specs/2026-09-11-arc-private-materials-personalized-planning-design.zh-CN.md)

| 检查点 | 当前证据 | 放行所需结果 |
| --- | --- | --- |
| B0 离线准备 | 已冻结合成语料、执行器与站点基线，有离线质量、UI、恢复与清理记录。[B0 结果](2026-11-04-materials-gate-1b-b0-results.md) | 语料和历史结果保留核验依据。 |
| B1 路由与账号 | 严格 ZDR 已指派，key 总限额 2.00 USD。累计推理 1 次、0.019506 USD；独立 GET 已返回 HTTP 200，真实配对核验通过。[B1 核验](2026-11-04-materials-gate-1b-b1-review.md) | 回执技术证据已补齐。原自动 GET 失败原因仍未知；后续合成范围、真实资料隐私边界和预算须分别授权。[实际结果](2026-11-05-materials-b1-single-receipt-result.md) |
| B2 真实模型质量 | R1 `STOPPED`，已提交 1/24、已评分 0/24，原始账本已封存。R2 新候选及独立授权单已准备。[R1 实际结果](2026-11-06-materials-b2-r1-result.md) | 独立批准后验证 R2 的真实回执可用性、24 份质量与逐笔账务。[R2 待审范围](../superpowers/runbooks/2026-11-06-materials-b2-r2-authorization.md) |
| B3 与 B4 隔离验收 | B3 的本机模拟证据已经取得，线上隔离环境、B4 的真实用户操作和第二轮预算待办。[验收计划](../superpowers/plans/2026-11-04-private-materials-gate-1b-acceptance.md) | 独立验证实际绑定、账户准入、私有存储、恢复和删除；在页面以合成资料验证提取、确认、计划差异与已完成任务保护。 |
| B5 与生产发布 | 已为普通用户实现独立生产准入、关闭开关和本地打包工具。两端要求同一份限时限额的生产授权。当前尚无生产授权或远端迁移。[执行器准入](../../worker/document-executor/production-policy.ts) · [生产包操作单](../superpowers/runbooks/2026-11-04-materials-production-package.md) | 完成 B2 至 B5、补充资料验证、生产资源实盘和签批，执行备份、迁移、回退演练及上线后验证。 |

单笔合成取证入口保留独立工作树争用、崩溃、到期、指纹不匹配及费用冲突的防护，未完成或重定向的 POST 不得触发费用查询。本次名额已消耗，不得重跑原推理。旧产品候选 `7052aedd8a49` 曾把有冲突的 0 与 0.50 USD 结算成 0；新产品候选在两份账本中保留冲突、冻结预留并禁止交付旧结果，同时保留有凭据可核实的单边费用。两种候选的证据按版本区分。[模拟复现与单笔验证](materials-gate-1b-b1/single-receipt-entry-verification.json) · [新候选证据](2026-11-05-materials-offline-repair.md)

生产发布前还须对照届时生效的站点和 Research 绑定、域名及路由，形成正式发布清单。B4 的登记机制只覆盖固定合成用例。普通用户通过独立生产策略检查每份资料授权、预算预留和回执唯一性，费用不明时全局停止新发送。2026-10-30 的站点发布记录用于本地打包演练。[已有站点发布记录](2026-10-30-home-copy-hierarchy.md)

## 首发场景的证据范围

- B2 与 B4 各自的 24 份样例只含简历和 JD。另为补充资料冻结 6 份合成样例、逐项预期及离线评分器。六份预标注答案已经过正反对照，真实模型结果仍为 0/6。三组样例各自评分，增加真实调用须独立授权。[原冻结语料](materials-gate-1b-b0/candidate.json) · [补充资料验收](2026-11-04-materials-supplement-quality.md)
- B4 原有 0.50 USD 默认上限和旧凭证保持不变。v2 专用计划绑定新增 canonical model 的配置摘要，单轮最高 2.00 USD；全数按顶格预留需 1.751040 USD。本机迁移测试保留旧授权、费用、外键和防重复规则。真实浏览器轮仍须独立签发授权并在获准隔离环境应用迁移，B2 单独核算。[B4 登记脚本](../../scripts/materials-ui-acceptance-enroll.ts) · [新增本地迁移](../../worker/document-executor/migrations/0005_document_canonical_receipt_budget.sql)
- 在较早的 Kimi 冻结候选上复现了新会话重新选择 JD 时丢失其他资料的风险。工作区修复已通过离线专项验证。重新打开同一目标后，从服务端读回仍有效的已采用版本；从公司 A 的 JD 调整为 B 时，提案待确认期间沿用 A，接受后采用 B，放弃后保留 A。主简历、补充资料和已完成任务均有回归覆盖。无可信基准且与当前资料冲突的旧本机草稿，须先由用户选择。[工作区](../../app/components/materials/material-workspace-panel.tsx) · [服务端采用引用测试](../../tests/server/material-adopted-refs.test.ts) · [旧草稿合并测试](../../tests/lib/material-workspace-selection.test.tsx)
- 已用本地模拟 AI 验证补充资料从预填、修正到合法重排的完整流程。已有的 `observability` 练习可以提前。主 JD 指定的 TypeScript 必备项只引用实际生效的 JD 条目，原有 SQL 加分项、自评、已完成事件和完整任务集合均保留。[补充资料端到端测试](../../tests/server/material-supplement-flow.test.ts)
- 为未来 B3 准备了独立的私有合成服务。它只接受冻结语料和已审配置，默认 HTTP 入口返回 404，回执只在同一资格配置下有效。隔离环境的 synthetic 模式还需批准第三个私有 Worker 以及仅保存回执计数的 SQLite Durable Object 和对应云费。closed 和 live 产物均不包含该服务。[合成服务](../../worker/document-fake-transport/index.ts) · [本地运行与打包测试](../../tests/build/document-fake-transport.test.ts)
- 用户可以明确从当前目标取消使用资料，包括最后一份。资料库原件、当前路线、完成记录和历史依据保留。其他设备的旧草稿会排除已取消的文档及其其他版本，保留无关的新草稿资料，用户仍可主动重新选择。已有待确认提案时需先接受或放弃。服务端在同一事务中核对所有权、活动目标、精确版本与当前修订，同时登记幂等回执。公开事件请求不能伪造该内部变更。[事务与路由测试](../../tests/server/material-detach.test.ts) · [界面确认测试](../../tests/components/material-detach.test.tsx)

## 历史普通用户生产候选（7052aedd）

11 月 4 日的离线提交为 `7052aedd8a493a5fae2c1e4a6ecbf32e702eeeef`，tree 为 `1d73935f8a0c68bc5187f7e1118941ef00498161`，父候选为 `fa9c9ae3a3e9`。以下数字仅属于该版。29 个变更路径已在独立索引冻结，24 份评测语料保持 B0 的摘要。源码包已从约定基础提交独立还原。[历史候选及逐文件摘要](materials-production-release-candidate/candidate.json)

| 检查 | 实际结果 |
| --- | --- |
| 全仓回归 | 普通 Vitest 351 个文件、7,471/7,471 通过。三个 Research 严格哈希套件另跑 131/131。附加 Node 测试 9 个文件串行运行，290/290 通过。 |
| 静态检查与页面 | TypeScript 通过。ESLint 零错误，四条警告的位置和内容与前候选相同。构建后页面渲染 5/5。 |
| 站点和执行器 | 主工作区关闭态产物共 388 个文件，逐一重算哈希，产物树 `544a075f07196b7183f29521c26bfaab5117b070b5132688fa24f4af7d38a352`。B0 原清单已恢复并核对。 |
| 干净源码构建 | 从冻结提交提取到新目录，用本机锁定依赖的独立副本构建，页面渲染 5/5。388 个路径全部对应，385 个文件逐字节相同。剩余三个文件逐项比对，仅有框架生成的 build ID、草稿和预渲染秘密值不同。两次构建的执行器程序及全部迁移逐字节一致。 |
| 公网站点打包演练 | 使用 10 月 30 日的历史 44 项绑定、虚构的新资源与过期的本地授权样本，分别生成关闭态和模拟开放态包，各 388 个文件。每包仅两个 Wrangler 配置与输入不同，其余 386 个文件逐字节相同。真实时钟下过期授权被拒绝。站点和执行器各做两次本地 Wrangler dry-run。每次站点的 65 个 JS 模块均与输入逐字节相同，执行器以源码映射核对了冻结输入及三个导出。 |

普通用户每次分析须经过站点与私有执行器的双向就绪检查，并有绑定到当前配置的独立限时限额授权。每笔发送先预留，回执先认领再取费用，重复回执、费用不明或超限会停止后续发送。专项回归有 31 个文件、284 项通过。已重现并修复排队时间较长时误判执行占用过期，以及回执已落库、随后两次数据库确认失败时丢失已知费用的问题。后一种情况保存可核对金额，同时继续停发。[准入契约](../../worker/document-executor/production-policy.ts) · [专项用例](../../tests/server/document-production-admission.test.ts) · [全仓结果](materials-production-release-candidate/verification.json) · [干净构建差异](materials-production-release-candidate/clean-closed-build.json)

本地验收工具首次用 Windows PowerShell 5 启动 Vitest 时将 SQLite 实验性警告作为异常，改由项目环境的 PowerShell 7 使用原命令完整重跑。首次全仓 lint 同时检查了忽略目录里的临时验证脚本，修正这些脚本的模块加载方式和五个闲置导入后，重新执行原仓库 lint 命令。最终检查使用的源码、测试断言及 Research 哈希均与本候选一致。

独立复核曾用只有文件头和空对象包的 Git bundle 复现误放行。现要求只从获准基础提交在空库还原并校验连通性，已分别验证空包、无关对象、冒用基础提交和非提交类型均被拒绝。定向打包测试 19/19，另有 17 项验收目标测试通过。[打包测试](../../tests/build/materials-production-package.test.ts) · [源码恢复校验](../../scripts/lib/verify-materials-frozen-source.mjs)

第一次模拟开放态 CLI 返回通用拒绝，未产生目标包；以原输入重新运行成功，未能进一步确定首次原因。对 Wrangler 的演练另查明，默认横幅会查询工具版本，出站限制拦截了四次尝试。关闭横幅后在隔离目录重新运行了完整流程，新记录中非回环 Node 网络尝试为 0，云端部署、远程迁移和模型请求均为 0。公开发布仍需当日资源实盘、独立预算、真实质量证据和操作授权。[最终打包演练](materials-production-release-candidate/public-package-proof.json) · [B4 额度约束复现](materials-production-release-candidate/b4-budget-compatibility.json) · [离线证据清单](materials-production-release-candidate/offline-evidence.json) · [操作单](../superpowers/runbooks/2026-11-04-materials-production-package.md)

## 前一版集成候选

已在独立索引中冻结 `fa9c9ae3a3e94a721d4f101fac272895ddad54e1`，tree `f1215d7246cd6e020068315cc1e63002b957dd94`。父候选为 `306c9b0b326a`。已在单独的本地 Git 库从基础提交和 bundle 重建核对，37 个产品与测试文件变更已逐项列出。24 份评测语料与 B0 摘要一致。回归后再次比对，工作区产品源码匹配该候选，原分支 HEAD 和暂存区已保留。[源码清单](materials-release-integration-candidate/candidate.json)

| 集成候选的离线验证 | 结果 |
| --- | --- |
| 全仓 Vitest | 348 个文件，7,424/7,424 通过。 |
| 三个 Research 严格哈希套件单独复跑 | 3 个文件，131/131 通过。该组也包含在上面的全仓集合中。 |
| 附加 Node 测试 | 9 个文件串行运行，290/290 通过。首次运行有 5 个用例共享的数据库恢复演练在本机 Miniflare D1 回环连接处遇到 `EADDRINUSE`，当次共 285 项通过。保留首次日志摘要和退出码，待连接释放后用相同源码、断言和命令重跑全部九个文件。 |
| 类型、静态检查与渲染 | TypeScript 退出码为 0。ESLint 零错误、四条既有警告。构建后的 HTML 测试 5/5。 |
| 关闭态站点和执行器 | 重新计算 387 个文件的 SHA-256，产物树为 `9f0dcb01f2cb22637c5563dc77b0bcba4416ae065ec3ab474da165dd37913e15`。B0 的历史清单已恢复并核对。 |

本轮真实推理、云端部署、远程迁移均为 0。B2 的资格和授权仍关闭。[离线验证与两次 Node 结果](materials-release-integration-candidate/verification.json) · [关闭态构建清单](materials-release-integration-candidate/artifact-index.json)

另从该提交的干净源码归档构建了完整的合成模式站点和两个内部服务。构建进程使用临时用户目录、本机既有依赖和虚构端点，无账户凭据。回环限制记录到的 Node 对外 fetch 和 TCP 连接尝试均为 0。源产物及留存副本的 389 个文件已逐一核对，产物树 SHA-256 为 `a10467c7e2e2ad33a16f4f4c63ab90c48737b94951bc07e22bfacd0ec3037c77`。合成服务关闭公网路由和预览，只声明一个 SQLite 回执类。这个离线复现为 B3 的资源申请提供清单，线上 B3 仍待独立授权。核价时按实际套餐分别登记 Durable Object 请求、运行时长和存储余量。[合成打包记录](materials-release-integration-candidate/synthetic-verification.json) · [逐文件清单](materials-release-integration-candidate/synthetic-artifact-index.json) · [Cloudflare Durable Objects 计费](https://developers.cloudflare.com/durable-objects/platform/pricing/)

