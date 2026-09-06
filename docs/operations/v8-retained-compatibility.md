# Arc v8 保留旧版本兼容性实测

**实测发现八类兼容性差异，`rollbackEligible: false`。审查提出的三项证据缺口已修正，root 修正后复验通过；独立规格审查 0/0/0 READY，随后独立质量/安全审查也为 0/0/0 READY，本轮提交与备份待执行。** 归档 v7.2 不能作为已有 v8 数据的直接应用回退目标。测试通过表示正确观察这些差异，并非旧版本兼容。

用户授权“逐步完成你认为目前可以做的任务”后，本轮从干净 `271f957fad68b14c764c7432c97290bac641cabb` 开始，设计/计划先保存为 `3ce529a`。只新增测试和操作记录，不改变产品、归档、SQL、依赖或运行配置。

## 实际执行对象与范围

归档 v7.2 提交 `7ca5b530dfc58f3cbc700b44a7a881a9bd661209`，tree `d0693b0a6bb0d13ded951d2df44aaab24f69ffe3`。固定七份源码包括 CloudService/D1CloudRepository、cloud-state、demo-store、旧 Proof 仓储、R2ProofStorage、旧公开视图构造/sanitizer。路径和 Git blob 固定值见本轮设计。

Root 独立加载七份源码：**7 个 blob/模块验证通过，TypeScript 5.9.3、Zod 4.4.3，exit 0**。归档与当前的两项依赖版本相同。先校验全部原始字节，再在内存转译；闭合 require 只允许固定归档路径和 zod。未导出 checkout、安装历史依赖或修改旧行为。这是固定可信源码的加载，不声称 JavaScript 求值本身是安全沙箱。

五个实际非持久化 D1 库与本地 R2 承载测试。Worker 和应用外发均拒绝，原 fetch 在 finally 恢复；Vite/Miniflare 清理完成后才返回成功。当前组合使用 Fake Research，虚拟工厂返回不能工作的对象，任一生产方法被调用即抛错；加载图确认真实 Research factory/OpenRouter adapter 均未加载。沿用 `createOfflineVite` 的 `envFile: false` 与 `envDir: false`，已有弃用提示不改变环境隔离。

范围为旧服务/仓储/存储执行，不包含旧 HTTP 认证/限流、浏览器页面、OAuth、历史完整 bundle 或线上 artifact 的恢复执行。旧仓储接收可信 owner；null/false 不是 HTTP 404。旧代码没有 Proof ledger 修订/撤回、Proof 删除、用户删除入口，明确不支持，未用手写 SQL 冒充旧功能。

## 实测兼容性矩阵

| 路径 | 实际观察 | 回退含义 |
| --- | --- | --- |
| 旧数据升级 | 先填充 20 表、50 行、2 个附件，再应用后五份 SQL 至 41 表；两 owner 的旧服务快照及全部旧行/对象指纹相等 | 验证升级保存旧数据，不证明旧应用理解 v8 新语义 |
| 混合库中的旧基线 | primary 库先填充同一旧 fixture，再升级和生成 v8 数据；按固定主键读取全部 50 个旧行，生成后及混合操作后行值、对象字节/metadata 指纹均相等 | 覆盖实际旧数据与新数据共存；新 owner 的合法插入不会被当作旧基线变化 |
| 旧 setup、完成与导入 | 真实服务执行 setup/完成重放，回执与完成事件无重复；导入冲突、archive-import、activate-import 与重放符合旧行为，重新读取确认目标 | 纯旧流程可执行；与 v8 规划混用的结果见下方 |
| 旧附件与分享 | 真实 metadata、R2 put/get 字节与内容类型/大小 metadata 正确；owner 可读，foreign 返回 null；foreign revoke=false，owner revoke=true，重放=false；每个 foreign 负例前后完整 Proof 根/资产/分享表和桶对象指纹相等，撤销负例两次非空 active share 深比较相等 | 证明这些仓储负例保留数据，未冒充 HTTP 认证验收 |
| v8 完成→旧读取 | 旧 workspace 读取 learning_events，遗漏当前 planning_events 中的完成 | 旧版不能完整展示 v8 进度 |
| 旧完成→v8 读取 | 旧服务新增 learning_event 与 verified 兼容根；当前规划响应及新表内容保持原值 | 旧完成不会同步 v8 规划，不能称业务兼容 |
| Proof 版本与状态 | 当前服务提交、修订、撤回；旧根仍是初始 title/project/verified=false，最新版本及 withdrawn 状态来自新 ledger | 旧根不是最新 Proof；旧版本缺少 ledger 能力 |
| 旧 setup→v8 规划 | 旧服务改变 career_goal 的每周分钟；当前 availability/plan 保持原值 | 两种设置语义发生分离，属于跨版本差异 |
| 旧 activate-import→v8 目标 | 旧服务归档有规划的目标，激活新目标；新表和原规划/Proof 行保留，当前 active workspace 变为 null | 数据未被删除，但活动目标的业务连续性中断 |
| v8 setup intent→旧 schema | `research-setup` 被严格 Zod schema 拒绝，完整数据库指纹未变 | 不能把新请求直接交给旧服务 |
| 双向公开分享格式 | v8 title 视图在旧 sanitizer 丢失新字段；status/summary-only 与 document kind 被拒绝；持久化的旧格式被当前 sanitizer 拒绝；旧 revoke 对 v8 分享有效 | 格式互不完全兼容，撤销能力不代表发布兼容 |
| 已撤回 Proof 的新分享 | 当前撤回后，旧可信 owner 根读取/视图构造/仓储可创建新的旧格式分享，缺少 v8 eligibility 判断 | 降级会绕过当前创建分享语义；不将其冒充完整 HTTP 漏洞验证 |
| 既有公开快照 | 现有分享快照按设计可在 Proof 变化后继续保留；撤回前后实际读取均非空且指纹相等 | 与上一行“重新创建分享”不同，非空断言排除空比较 |
| Research 关闭新准入 | 有效同源、owner、JSON POST 实际返回 **503 / RESEARCH_UNAVAILABLE**；已有终态 Research、规划、Proof 保留，额外 Fake 调用 **0** | 支持保留 v8 并停止新调用这一局部故障处理策略 |

八个差异类别由实际返回值、数据和新鲜读取计算：`archived-activation-detaches-active-v8-workspace`、`archived-completion-leaves-v8-planning-stale`、`archived-proof-root-stale-vs-ledger`、`archived-read-misses-planning-events`、`archived-schema-rejects-research-intent`、`archived-setup-diverges-from-v8-plan`、`public-share-schema-incompatible`、`withdrawn-proof-old-share-creation-gap`。没有修补归档或产品以伪造兼容。

## 验证与审查记录

入口为 `node --test tests/offline-uat/retained-compatibility.test.mjs`。三项测试包含一次完整共享演练与两项纯加载器拒绝测试，不能表述成三次独立完整演练。

| 检查 | 实际结果 |
| --- | --- |
| 实现前 TDD RED | 0/1，exit 1，263.484 ms，wall 1.575 秒；明确抛 `Retained compatibility not implemented` |
| 初次沙箱启动 | spawn EPERM，是无效启动，未计为 RED；获准相同子进程运行后才观察上述 RED |
| 初版 root 完整演练 | **3/3，exit 0，30,383.445 ms**；完整演练 case 为 29,472.9528 ms |
| 规格补强 TDD RED→GREEN | 新断言先因缺少 primaryMixedBaseline.identity 失败：2 通过/1 失败，exit 1，27.135 秒（wall 27.619 秒）；补强后实现者 3/3，exit 0，38.030 秒 |
| 修正后 root 最终演练 | **3/3，exit 0，39,150.1438 ms**；完整演练 case 为 38,078.8167 ms；混合基线/foreign 指纹/非空快照断言均通过 |
| 初版健康与隔离 | 5 库 quick_check=ok，foreign_key_check=0；有规划及 Proof 的非目标 owner **54 行**保留；生产 factory/adapter 未加载，外发为 0，disposed=true |
| Root 应用全量回归 | **137 文件/2,641 测试通过，53.74 秒，exit 0**；不包含新 `.mjs` node:test 入口 |
| Root 非增量类型检查、完整 lint | 修正后再次运行，两者 exit 0；产品和构建输入未改，不重复声称新 build/render/CI 证据 |
| 规格审查 | 三项 P2 证据缺口已修正；独立代码及最终文档复审 **0/0/0 READY** |
| 质量/安全审查 | 规格通过后独立审查完成，**0/0/0 READY**，未要求修正；同意已授权测试/文档提交与开发分支备份，不是生产发布许可 |

最终旧库升级前后行指纹均为 `2adc30b17821a5bbc0d29f1ebe07359c37d283437a47c565379379ffffab1e81`，对象指纹均为 `fe43d60811f31b03f4c9d0c0e19f6d54c552aff2a1af2a22796fbcaec1a938ac`。修正后混合库固定主键基线在生成前、生成后、混合操作后均为 `7a2888d6f103325ffbc27a11e67a45c38579bb87066fd9fd742cf94500fbb85e`，两对象指纹同上。固定 fixture 顺序与整表主键排序不同，因此两种行指纹不同；它们各自只在相同算法与范围内比较，不互相替代。

## 运维交接

回滚分支与外部门槛见 `v8-release-gates.md`。Research fallback 只切换进程内合成配置，不更改真实旗标；关闭准入不等于取消在途调用，Research GET 也可能对过期运行对账。

按用户询问只读核对 Sites：v7.2 对应 version 9，源码 `7ca5b530dfc58f3cbc700b44a7a881a9bd661209`；已记录部署 `appgdep_6a728790e0608191bf1286c3a9a3ccfd` 当前返回 succeeded，版本 ID 与保存记录一致，站点 active/public，公开 URL 为 `https://arc-precision-path.jiahe-xu.chatgpt.site`。保存版本的 archive 哈希与历史记录相同；这属于元数据核对，没有下载、重新构建或恢复 artifact，不能据此宣布可回滚。Arc v8 尚未保存 Sites 候选或部署。

两次真实 Research 403 原因仍未知，许可已消耗。未新增 Provider 请求或读取 Key/env/原始输出；未改生产、master/PR、Sites 候选和部署。后续只有经验证及双审的测试/文档进入已授权公开开发分支备份。
