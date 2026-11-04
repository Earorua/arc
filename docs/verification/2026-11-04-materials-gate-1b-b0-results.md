# 私人资料 Gate 1B · B0 离线验收记录

**B0 离线准备通过，六项均有可复核证据。** B1 至 B5 的现场验收仍为 `NOT RUN`，Gate 1B 尚待现场证据。验收依据为[定稿计划第 3 节](../superpowers/plans/2026-11-04-private-materials-gate-1b-acceptance.md)。

## 测试结果

| 检查 | 结果 |
| --- | --- |
| 全仓 Vitest，普通测试配置，最多 8 个 worker | **341 个文件，7,373 项全部通过**，退出码 0，236.23 秒 |
| 定稿计划指定的 6 个专项文件 | 96/96 通过，退出码 0 |
| 额外 11 个 B0 专项文件 | 124/124 通过，含真实运行时所用 HTTP 适配器、准入账本、撤销许可、崩溃恢复、页面预演和规划保护，退出码 0 |
| 此前修复的 3 个 Research 基线套件 | 单独运行 131/131 通过，也包含在最终全仓运行；原有严格哈希检查继续生效 |
| 额外 Node 构建、脚本与离线 UAT | 最终候选串行运行 9 个文件，290/290 通过，失败、取消、跳过均为 0 |
| TypeScript、全仓 ESLint | 类型检查退出 0。Lint 退出 0，0 错误、4 条已有 Research 警告 |
| `npm test`、专用双 Worker 构建校验 | 生产构建通过，5/5 渲染测试通过。站点生成清单、执行器模块入口和 387 个产物文件均经本地验证，退出码 0 |

专项数与全仓数有重叠。126 份产物 JS/CSS 中所选合成资料和测试凭据标记匹配数为 0，客户端中计费密钥变量名匹配数为 0。原始命令输出位于 Git 忽略目录 `work/gate1b-b0/`。[机器可读验证结果](materials-gate-1b-b0/verification.json)

## 六项交付

| 项 | 本地可复核的结果 |
| --- | --- |
| ① 冻结候选与语料 | 确认 9 份普通简历、9 份普通 JD、两类各 3 份边界资料。固定输出与 Workflow 契约 `2026.11.1`、技能映射 `2026.11.2`。同一生产传输结构的保守输入上界为单份最大 4,750、合计 112,234。固定语料原始字节 SHA-256 为 `69e5ddd1005f12abf24483e10dd235629ef309ba3a84e922166963ccd9aed750`。 |
| ② 传输与回执 | 单一允许上游、禁止回退、ZDR、单价上限与 `max_completion_tokens` 进入合成 HTTP 请求。每次 POST 前写预留，收到唯一回执后查同源元数据，最多 3 次、总计 30 秒。精确核对模型、上游、成功端点、原生 token 和费用。路由或用量不符即隔离候选并阻止下一份发送，已知费用保留结算，未知费用保留预留。资格运行器持久化处理起止时间、回执、核验结果。 |
| ③ 验收资源与凭据 | 本地构建采用专用 `materials-acceptance` 清单和 `closed` 模式。站点与执行器使用不同 D1 和私有 R2，配置包含两个具名入口、Workflow 和两侧维护 cron。清单拒绝已知受保护 ID、重复资源、无反向入口及不完整的活动配置。只向站点解析已批准的公开模型配置，即可创建预算预留。执行器的真实传输另需计费密钥。 |
| ④ UI 轮整轮限额 | 执行器 D1 登记专用 runId、账户、24 份精确版本、规范化正文摘要、配置摘要、批准时段和总预算。实际 POST 前原子占用 case 和 job。重试、新 job、竞争、刷新、跨日和进程重启均不能重置整轮名额。上一笔回执待核或账本异常时不能发下一笔。离线 SQL 生成器只产生待审阅的登记语句。 |
| ⑤ 崩溃清理 | 应用端先登记与 owner、operationId、generation 对应的 multipart uploadId，再发送正文。删除关闭新登记，吊销旧句柄，删除目标并逐键读回。已完成写入后丢失登记、暂停在途分片、并发维护、重启及迟到重放均有本地故障用例。执行器路径和旧版本的处置详见下方恢复记录。 |
| ⑥ 产品页面预演 | 24 份先保存且发送数为 0，再用同一组版本逐份核对。产品 React 组件、HTTP 路由、预算、确认与删除服务参加测试，登录用合成账户，分析用固定夹具。18/18 普通样例从预填完成，6/6 边界样例先阻止未处理的高影响确认。共呈现 74 个条目、21 条核对提醒，完成 1 处岗位要求改类，人工重录和自动采用自评均为 0。最后删除 24 份资料，应用资料桶存留对象为 0。 |

## 成对规划

预演先试了计划举例的 HTML/TypeScript 组合，在冻结输入下未改变任务顺序。正式选定 `resume-01` 与 `jd-01` 的 SQL 要求作为 B4 的首选比较。固定旗舰蓝图和注册表、全部技能自评为 `conceptual`、UTC 每天 60 分钟、52 周、起始日 2026-11-04、完整范围和相同空进度。输入摘要为 `7f65236a3c68b561e1f85c3cbe1d338359fbff814b1464dcfdd4c61f5f45800a`。

同一构建在有无确认资料时均生成 28 个任务，15 个位置不同，所有先修依赖满足。第一个任务从 `path-unit-ee974eb71c7c0bed1c5e04c3e3237c89` 变为 `path-unit-a9c77807ad72a3bdab827da3427a85e9`。保存两份完整任务 ID 顺序与确认条目到来源位置、确认和上下文 ID 的链路。现场须使用真实候选重新产生有效差异。[脱敏预演记录](materials-gate-1b-b0/ui-rehearsal.json) · [24 页现场工作表](../superpowers/runbooks/2026-11-04-materials-gate-1b-ui-casebook.md)

## 已复现并修正的失败

- **费用与路由**。旧路径没有限制审阅单价，错上游仍能交付候选，尚未核验上一张回执就可能继续。增加正确路由、同名供应商不同端点、重复 ID、重定向、缺元数据、超时、费用不符、账本短写和批准窗口变化的合成响应。资格运行器只计推理 POST，另计只读 GET。第一个失败记录之后未运行的文档保留独立状态。
- **站点和整轮授权**。原站点若没有计费凭据，完整元数据也无法通过校验。新检查直接让读取计费密钥的动作抛错，验证站点仍能工作。若改动单价或回执端点，即使最坏预留金额不变，两端摘要仍须匹配才能发送。验收名单使用登录系统的混合大小写 owner ID，资源版本 ID 继续使用独立的严格格式。D1 不可写或收不到确认时，执行器保留占用，站点保留必要的费用挂账。
- **两类迟到写**。先复现应用原文落桶后丢失提交回执，旧逻辑无法完成清理。另复现执行器在 Workflow 终态后由维护逻辑重新写 R2，与同时清理发生竞争。新执行器结果使用单一已登记的 multipart 句柄，恢复时只从 D1 重投可证实的账务信息。终止标志、超时或一次空读均不能作为未确认旧写入的清理凭据。
- **拉取文本之后撤销允许**。在执行器取到内容后暂停、使取消通知返回 503、撤销允许，再释放执行器。旧路径仍会抵达假传输。新增双向签名协议中的一次性站点发送许可，站点 D1 在同一写入中校验允许、版本、代次、配置和预留。撤销优先提交或站点无法确认时实际 POST 为 0；许可已生效的发送按在途处理，保留账务并禁止迟到结果激活。真实传输仍须通过执行器本轮名额和费用闸门。
- **证据不足的旧数据**。旧应用直写没有精确到版本的已提交操作回执、没有写操作可关联的对象，须保留 `cleanup-pending`。旧执行器单次未确认直写可以在 Workflow 终态并有匹配对象读回后再清理；历史维护逻辑可能多次直写的记录保留 `legacy_recovery_hold`，仍需独立证明所有写入已结束。该策略允许已知费用对账，同时保留物理清理阻塞。[离线故障证据](materials-gate-1b-b0/cleanup-evidence.json)
- **历史 UAT 与当前服务的数据库**。额外 Node 检查在基线 HEAD 同样报 `RESEARCH_UNAVAILABLE`。原因是当前 Research 服务读取 `0008` 新增的两列，夹具却给它使用了只含 `0000–0006` 的存档库。现行生命周期改从 Drizzle journal 建库，历史库的 7 个迁移哈希、41 张表、7 个归档源文件和 8 项已知兼容性差异沿用原断言。丢失 Start 响应的独立用例在并发高负载下另曾超过 45 秒，串行用原限时复验。两个用例都只运行于本机。

## 配置与运行入口

- 本地双端构建样例为 `tests/fixtures/build/materials-acceptance.json`，包含虚构资源标识、已启用 OAuth 渠道名称和关闭态开关。B3 需用获批清单替换这些标识。仅验收账户可访问、OAuth 回调、R2 实际私有性、密钥作用域、双向绑定、Workflow 与 cron 实际触发均须在隔离环境核验。
- 新的公开资格字段为 `qualification.receiptRoute.{providerName,endpointId}`。B2 的 `authorization.receiptRoute` 须逐项相同。B4 强配置摘要也包含此字段、两种单价、token 上限和预算。现场尚无批准的真实模型政策、端点变体或价格版本。清单中的 `2026.11.1` 样例仅覆盖离线夹具。
- 闭合态本地验收使用 `ARC_CLOUDFLARE_TARGET=tests/fixtures/build/materials-acceptance.json` 运行 `npm test` 后，再运行 `node scripts/build-materials-offline-pair.mjs tests/fixtures/build/materials-acceptance.json`。该入口验证站点产物的实际 Wrangler 配置并构建执行器。产物清单逐文件覆盖两个 Worker、客户端静态资源及各自的 SQL。
- 在 B4 单独获批之后，登记工具的格式是 `node scripts/materials-ui-acceptance-enroll.ts <reviewed.json> <new.sql>`。输入含 `runId/ownerId/approvedAt/expiresAt/maxRequests/totalBudgetMicroUsd/corpusSha256/config/qualification/cases`。每个 case 都有 `caseId/documentId/documentVersionId/textVersionId/generation/textSha256`。真实登记、迁移和发布均由后续授权控制。

## 候选可恢复性

| 证据 | 值 |
| --- | --- |
| 基线 HEAD | `2caa51d56a41f60b837425ffa56dea4fbbecbd47` |
| 本地候选提交 | `87add0a010d601873f493a13cfa327deb5a5e657` |
| 已还原的 Git tree | `b93efadeb38136f35f6c5a35de20a14c617fac1f` |
| 源码包 SHA-256 | `57fd1881ad07b93c15278711133ff6c006af045c52ee3028b7eedae82b4b4246` |
| 站点 Worker SHA-256 | `a3b2ee7be603d505a580a416a7742c3c06d204c74128966c6c6d3df6e1cdcf74` |
| 执行器 Worker SHA-256 | `c771647f194d028f880d27b6845f24debdf48ee08ccf6a5c6b7095abfcff0eee` |

候选包含 1,233 个文件，相对基线有 207 个路径变更，含此前未跟踪的阶段 1 实现。独立 Git 索引排除了既有用户设计稿的本地修改；候选内该稿的 blob 与基线一致。原工作分支继续停在基线。已从仅含基线的本地裸仓库导入源码包，验证提交、tree 和对象连通性。验收报告及运行后证据单独保存，以避免清单自引用。[可携带的源码包](materials-gate-1b-b0/source.bundle) · [候选与输入清单](materials-gate-1b-b0/candidate.json) · [387 个构建文件的摘要](materials-gate-1b-b0/artifact-index.json)

在已有上述基线的本地仓库中，可以复核源码包。

```powershell
git bundle verify docs/verification/materials-gate-1b-b0/source.bundle
git fetch --no-tags docs/verification/materials-gate-1b-b0/source.bundle refs/codex/candidates/materials-gate-1b-b0-b93efadeb381
git rev-parse 'FETCH_HEAD^{tree}'
```

## 剩余阻塞与现场证据

| 阶段 | 仍缺少的证据 |
| --- | --- |
| B1 配置与授权 | 专用 key 的隐私与 ZDR 政策、当日单价、确切上游和 endpointId、真实元数据可用性，以及分轮授权、预算和截止时间。本次只验证了代码如何拒绝无法证明的路由。 |
| B2 模型质量 | 冻结语料上的 24 个真实输出、逐份评分、唯一回执与账单。普通样例的 18 次预填和 6 个边界用例本次均为合成预演。 |
| B3 平台 | 隔离资源、测试账户准入、密钥作用域、迁移和双 Worker 实际绑定；两端重启、Workflow、cron 及 R2 已完成、在途、迟到写入的实际语义和二次读回。若旧写入仍缺终止证明，继续阻塞对应清理验收。 |
| B4、B5 产品与收尾 | 真实登录下独立获批的 24 份页面记录，与当次回执、预留和实收逐项对应；验证实际候选带来的规划变化、接受与放弃、删除和历史失效，最后完成预算与私有对象对账、验收签字。 |

B0 期间实际模型请求 0，模型推理费用 0 USD，远程迁移和部署均为 0。
