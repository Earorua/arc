# Arc v8 本地发布准备记录

本地源码审查、构建验证、迁移清单和配置/回滚准备已完成。**真实 Research 验收仍未通过，本文不是生产发布或完整目标 3 验收。** 本轮不修改产品代码、迁移、依赖或运行配置。

**2026-09-06 保留旧应用实测：** 固定七份 v7.2 服务源码在实际非持久化 D1/R2 上执行，root 初版演练 3/3（30,383.445 ms），应用回归 137 文件/2,641 测试（53.74 秒）、非增量类型检查与完整 lint 均通过。八类实际差异使 `rollbackEligible: false`，不能对已有 v8 数据直接部署 v7.2 回退。有效的新 Research POST 在进程内关闭准入后返回 503/RESEARCH_UNAVAILABLE，已有终态 Research、规划、Proof 保留，额外 Fake 调用为 0。三项规格证据缺口已修正，root 最终演练 3/3（39,150.1438 ms）及再次类型/lint 通过，独立规格审查 0/0/0 READY，随后独立质量/安全审查也为 0/0/0 READY，本轮提交与备份待执行；详见 `v8-retained-compatibility.md` 和 `v8-release-gates.md`。下文“旧应用兼容性尚未实测”的描述保留为历史；artifact 恢复、生产基线和真实验收仍未完成。

**2026-09-06 公开版本只读核对：** 按用户询问核对 Sites 元数据，v7.2 对应 version 9，源码与历史记录一致，已记录部署返回 succeeded，站点 active/public，公开地址为 `https://arc-precision-path.jiahe-xu.chatgpt.site`。此记录更新下文“没有新鲜线上版本核对”的历史状态；未下载 artifact、未验证其恢复部署能力，Arc v8 没有部署。

**2026-09-06 后续演练：** 用户继续推进后，已完成本地合成旧数据升级/逻辑恢复的实际运行与 root 复核：v7.2 的 20 张表、50 行和 2 个 R2 对象，升级至 41 张表；27 张表时注入真实 SQL 失败，再从原始快照恢复到独立空库/桶并完成升级。五组断言、七项恢复前拒绝和六项约束/原子失败检查通过。完整证据、审查状态与范围见 `v8-legacy-recovery-rehearsal.md`。下方第 3、6 节关于尚缺该演练的描述保留为本报告起草时的历史状态；生产迁移 ledger、原生备份/恢复及保留旧应用兼容性等门槛仍待验证。实际使用 `quick_check` + `foreign_key_check`，不声称完整 `integrity_check` 或真实 Research 通过。

授权范围来自用户“按照你说的继续”：先备份开发分支，再做本地发布准备。执行计划为 `docs/superpowers/plans/2026-09-06-arc-v8-branch-backup-local-readiness.md`。备份与 master 合并分开；master 合并、PR、生产变量/旗标/D1/R2、Sites 候选与部署均不在本轮范围。

## 1. 源码与备份状态

- 应用源码检查基线：`d59af3388cc2dbeb0a63dff2d8c0c2e96b8824b6`；之后 `304e0eff096cb5c8d37e17dc7a1ea5e53abf9b77` 仅增加三份备份授权/计划文档。
- 本地分支：`codex/v8-openrouter-research-beta`；目标公开仓库：`https://github.com/Earorua/arc.git`。
- 推送前远端 master：`f6c3cddbe6d3f177f3681b355142daad84f2330e`；开发分支尚不存在。本地主工作树 master 干净，仍为 `f0f88b2ebdb61e2951c9d1d6c0004319c131eafa`。
- 独立公开源码审查：**READY，P0/P1/P2 0/0/0**。范围为已公开 master 后到 `d59af33` 的 105 个提交、431 个新 blob、164 条路径及提交信息，再加 `304e0ef` 的三份文档与提交信息。疑似凭据命中均核对为合成测试数据或字段误命中；未发现需阻止备份的凭据或私密负载。
- `.env`、Key、数据库、输出和日志文件未纳入上述发布范围；未读取实际环境文件或真实 Key。忽略目录中的测试/实测摘要不随源码推送，也不作为数据库备份。
- `.github/workflows/ci.yml` 仅针对 master 推送和 PR，权限为 `contents: read`，无部署步骤；本地无活动 Git hook 或已检查的特殊推送覆盖。GitHub webhook 列表为空，管理员身份下 Pages API 为 404。**这些检查没有完整审计外部 GitHub Apps。**
- GitHub 直连出现 reset/timeout；复用用户已启用的系统代理后远端只读查询成功。仅使用命令级代理参数，没有修改全局 Git 或持久网络设置。
- 首次推送在进程创建前被自动审批拒绝，原因是需要用户明确确认公开仓库及整条分支源码/历史内容范围。用户随后对精确确认回复“允许”；root 重新核对远端后执行同一普通推送成功，没有绕过拒绝。
- 开发分支已备份：远端 `codex/v8-openrouter-research-beta` 与本地均为 `70eb49d8842468dab7c1f946cd368742a8da9f90`，master 仍为 `f6c3cddbe6d3f177f3681b355142daad84f2330e`，推送后工作树干净。该分支/提交的 GitHub Actions 查询为 0 次运行，不能记作 CI 通过。本完成记录随随后文档提交同步到相同分支，最终交接再核对其实际 SHA。

## 2. 本轮新鲜本地验证

本轮使用已安装 **Node v24.14.1**；项目最低版本为 22.13.0，GitHub CI 配置为 22.13.0。以下结果是本机验证，不能冒称新的 GitHub CI 结果。源码与 `d59af33` 一致；准备文档不改变验证对象。

| 检查 | 实际结果 |
| --- | --- |
| `npm run test:unit`，单独运行 | **137 文件 / 2,641 测试通过，47.95 秒，exit 0** |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | 通过，exit 0 |
| `npm run lint` | 完整 lint 通过，exit 0 |
| `npm run build` | **5/5 阶段通过**，exit 0；存在 `dist/server/index.js` |
| `node --test tests/rendered-html.test.mjs` | **4/4**：页面渲染、客户端秘密标识隔离、未使用的 Provider 成本 schema 排除、恢复/审阅文案检查 |
| `node tests/offline-uat/miniflare-smoke.mjs` | 实际隔离非持久化 workerd D1；**9 步流程 + 5 个原子冲突**，错误成功收据 0、外键违规 0，exit 0，最终销毁 |
| 构建内迁移与源码对照 | **7/7** 个 SQL 的 UTF-8/LF 规范化 SHA256 相同 |
| 文档 diff | root 在暂存/提交前检查；最终交接核对实际 HEAD 和工作树 |

本地 D1 流程覆盖 Ready、当前目标激活、规划生成、完成、全新服务读取、幂等重放、跨账户 404、Demonstrated Proof 和撤回。Provider 为 Fake，不发真实请求。SQLite 实验性提示及 `envFile` 弃用提示未影响结果；本轮没有为此修改依赖或配置。

## 3. 迁移清单与兼容性证据

顺序以 `drizzle/meta/_journal.json` 为准，snapshot `prevId` 连续。SQL 全部是新增表或索引，没有 ALTER、DROP、数据改写、回填或 down migration。

| 顺序 | 内容 | 累计表数 |
| --- | --- | --- |
| `0000_beta_foundation.sql` | 认证、目标、完成、Proof 根/资产/分享、迁移回执、配额和运营；19 表、31 索引 | 19 |
| `0001_secure_account_linking.sql` | 账户关联意图；1 表、3 索引 | 20 |
| `0002_product_intelligence.sql` | 标准化岗位、技能和资源；6 表、11 索引 | 26 |
| `0003_adaptive_planning.sql` | 自适应规划；7 表、15 索引，包含旧目标表索引 | 33 |
| `0004_proof_backed_stack.sql` | Proof 版本、评审、能力投影；3 表、11 索引，包含旧 Proof/资产的 owner 索引 | 36 |
| `0005_openrouter_research_beta.sql` | Research、包、来源审计和预算；5 表、10 索引，状态/owner/JSON/金额约束 | 41 |
| `0006_research_health_indexes.sql` | 预算日期/状态和运行时间/状态两个非唯一索引 | 41 |

可跨 Windows/Linux 比较的 SQL SHA256（UTF-8，CRLF 规范化为 LF）：

| 文件编号 | SHA256 |
| --- | --- |
| 0000 | `1e92f53ce6aeec38c3c39d4e5c77f86d9e44d08a4b4f30d425094736b99cbde8` |
| 0001 | `666fb7dc150a1106bd68726e4c8b6286c3908e56b8fc86c5518b2f8d4a384445` |
| 0002 | `52d1203563d185e09a3b098a57df053658f3b44ddd94e8c3c268dde4abab9847` |
| 0003 | `e113c423bb4cef4c46c4cbef7c13a7d9ba40f1e666baa3d458acbd8959c49580` |
| 0004 | `dd16d381d8b766773a388e46ec6b138e4a8878f649768aa8d0296b3cf6caf19d` |
| 0005 | `bbecea2119999103906e3c721d602467124a60f72ad9c672ae847212fe52ee35` |
| 0006 | `24caea1c12c3ffa16b7b03c4f0a5a9c21736501b6dc2b2f2afbd149e6da78b73` |

证据必须按以下层次解释：

- `tests/db/research-migration.test.ts:23` 先应用至 0004，插入 **2 个用户、1 个岗位根、1 个岗位版本**，记录所有旧表结构与行，再应用 0005–0006 并比较。因此已有最小种子数据升级证据，但大多数旧表是空的。
- `tests/db/planning-migration.test.ts:40` 和 `tests/db/proof-ledger-migration.test.ts:31` 的迁移前快照主要是空旧表；迁移后插入的 fixture 不证明跨版本数据保留。
- `tests/offline-uat/miniflare-smoke.mjs:8` 在 fixture 前应用全部迁移，证明最终 schema 和服务流程兼容真实本地 workerd，**不证明完整旧用户数据升级或恢复**。
- `tests/lib/planning/v7-upgrade.test.ts:86` 覆盖设备端旧存储字节保留；云端部分使用内存仓储对象，不等同于实际 D1 升级。

现存数据库只能应用已核实的待执行后缀。源码 journal 不是生产已应用迁移清单；没有 `IF NOT EXISTS` 的 SQL 不能被当作可任意重跑。现有本地 smoke 绕过生产迁移 runner，未验证其检查点、部分失败和重试行为。

## 4. 配置清单：只记录名字和源码规则

本节不是实际运行值。`.env.example` 是模板，真实 Research 工厂不会自动把缺失配置补成模板默认值。

| 用途 | 名字 | 本地模板及准入规则 |
| --- | --- | --- |
| 环境/认证 | `ARC_ENVIRONMENT`、`BETTER_AUTH_URL`、`BETTER_AUTH_SECRET` | 模板 development/本地 origin/空秘密；生产需 HTTPS，认证秘密至少 32 字符并配齐至少一个 OAuth provider |
| Google/GitHub 登录 | `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET` | 模板为空，每组需同时齐备；providers 列表不证明真实 OAuth 流程成功 |
| 管理员 | `ARC_ADMIN_EMAILS` | 模板空即拒绝所有人；1–32 个精确地址，无通配符，仍需认证用户 |
| AI 准入 | `ARC_AI_ENABLED`、`ARC_AI_USER_DAILY_QUOTA`、`ARC_AI_RATE_LIMIT_PER_MINUTE` | 模板 false/3/2；配额与速率需有效十进制整数 |
| 旧 mock 预算 | `ARC_AI_GLOBAL_DAILY_BUDGET_UNITS` | 模板 100，用于旧 deterministic preview，不是 Research 美元预算 |
| Research 准入 | `ARC_AI_RESEARCH_ENABLED`、`ARC_AI_MODEL_RESEARCH`、`ARC_AI_MODEL_ECONOMY`、`OPENROUTER_API_KEY` | 模板 false/空；两开关均 true、固定模型及有效服务器 Key 才可构建新调用服务 |
| 金额限制 | `ARC_AI_SITE_DAILY_BUDGET_MICROS`、`ARC_AI_SITE_MONTHLY_BUDGET_MICROS`、`ARC_AI_RESEARCH_MAX_COST_MICROS`、`ARC_AI_REPAIR_MAX_COST_MICROS` | 模板均 0，日/月/Research 正数才准入；Repair 可为 0，预留上限为 Research+Repair |
| 超时/缓存 | `ARC_AI_RESEARCH_TIMEOUT_MS`、`ARC_AI_REPAIR_TIMEOUT_MS`、`ARC_AI_RESEARCH_CACHE_DAYS` | 模板 20000/10000/14；需显式有效值，超时 1–120000 ms，缓存 1–365 天 |
| IP 限制 | `ARC_AI_IP_HASH_SALT` | 模板空；16–256 字符并符合字符限制，写入还需合法 `cf-connecting-ip` |
| 持久化 | `DB`、`PROOF_ASSETS` | 分别为逻辑 D1、R2 绑定；源码名字不证明生产资源映射正确 |
| Worker 图片 | `ASSETS`、`IMAGES` | Worker 图片优化入口消费的绑定 |

源码依据：`app/server/auth/policy.ts:17`、`app/server/auth/runtime.ts:64`、`app/server/admin/policy.ts:23`、`app/server/research/service-factory.ts:36`、`app/server/research/budget.ts:30`、`worker/index.ts:6`。本轮没有读取 hosted runtime 或把秘密值写入清单。

另有 D1 `feature_flags` 的 `role-research-beta` 条目。缺失、禁用、cohort JSON 无效或不符合 schema、读取失败均拒绝；**启用条目且 cohort 为 `{}` 会允许全部登录用户**。未来小范围启用必须给出明确的 `userIds` 列表，空列表允许 0 人。依据 `app/server/entitlements/d1-feature-cohort.ts:12`；本轮没有更改该表。

关闭 Research 后仍需保留完整 schema：`app/server/admin/d1-admin-repository.ts:91` 的健康检查无条件读取 Research/预算表。现有运行 GET 不调用 Provider，但可使过期运行转为 interrupted 并对账，见 `app/server/research/orchestrator.ts:201`，因此不能称为数据库只读。Flagship 和已保存规划不依赖新的 Provider 调用，登录持久化仍需要迁移后的 D1。健康页面的 enabled/ok 也不是实时 Provider 连通或完整 OAuth 验收。

## 5. 备份与回滚操作准备

以下是未来受控发布时的操作顺序，**本轮未执行任何生产备份、恢复、旗标切换或发布**。

1. 固定候选 Git commit/tree、lockfile、迁移顺序/校验和及验证记录；分别记录当前应用版本与将要选用的回滚版本。
2. 单独核实 retained artifact 的身份、可用性、文件哈希和部署能力。历史记录中的 v7.2 / Sites version 9 与更早保留的 version 6 不能混为同一个回滚基线。
3. 在任何迁移前建立协调的 D1 恢复点和 R2 恢复能力，记录迁移 ledger、时间戳、逻辑/物理绑定映射和对象完整性清单；认证配置仅保留安全引用，不复制秘密到 Git。
4. 先在隔离环境恢复该基线，再应用待执行迁移后缀；核对账户/会话、owner、目标、完成、Proof/资产/分享、配额和回执，执行 FK/integrity 检查。另测迁移中断/恢复及完整备份还原。
5. 运行保留旧应用对升级后 schema 和 v8 写入数据的读写演练。新增外键及预算记录可能改变删除行为；仅因为 SQL additive 就声称旧应用全部兼容是不充分的。
6. 未来发布先保持 Research 新调用关闭；迁移、OAuth、存储和恢复通过后，才在独立授权范围准备小 cohort。真实 Research 验收未解决时不得把这次本地报告当作开启依据。
7. Research 单项故障先关闭新调用准入，保留已有运行/包/计费证据并检查 Flagship 和规划恢复；旗标不是在途取消机制，也不是数据回滚。
8. 完整性故障则按预演方案停止受影响写入，保留证据，恢复获准应用版本，必要时协调恢复 D1/R2；明确恢复点之后写入的处置，再验证 owner、会话、规划、Proof 资产和健康后开放。

历史来源为 `docs/operations/sites-oauth-feasibility.md:39` 和 `docs/superpowers/plans/2026-08-01-arc-secure-cross-email-account-linking.md:1146`。本地可找到 version 9 的源码提交 `7ca5b530dfc58f3cbc700b44a7a881a9bd661209`；它与记录的 GitHub 源码 `1ac6f2c2414727fef422d94074f7baf43c0a4a5a` 的 tree 都为 `d0693b0a6bb0d13ded951d2df44aaab24f69ffe3`。这只验证本地源码等价，**没有新鲜验证当前线上版本、远端 artifact 保留或可恢复性**。更早 version 6 源码为 `9d14a05a87b7f9c48e67f1082fbf9f86a10fe3c0`。

GitHub 备份仅覆盖源码与提交历史，不覆盖 D1 记录、R2 对象、真实配置或浏览器设备存储。没有 down migration；删新表会丢失 v8 规划、Proof 或 Research/预算数据，不能作为默认回滚办法。

## 6. 可继续的本地工作与独立发布门槛

无需等待客服的下一项具体工作是**隔离的旧数据升级及恢复演练**：依据归档 v7.2 schema 创建合成 fixture，覆盖账户/会话、活动与历史目标、完成、Proof 根/资产/分享、配额和迁移回执，比较升级前后旧行及约束，再测试恢复到独立本地库。其数据必须完全合成，不能从生产导入。现有实际 workerd smoke 和最小 `0004→0006` fixture 不能替代这项证据。

正式候选/发布仍需要：解决真实 Research 验收、核对真实迁移基线及运行资源、完成完整旧数据升级/恢复和旧应用兼容性演练、核对真实 OAuth 与账户关联、核实 retained artifacts，并另行完成获准的 master 集成和 Sites 候选/发布流程。本报告把这些门槛列清楚，不虚构已通过。

独立迁移与配置审查均为只读源码审查，未自行运行本轮 root 测试。报告的独立规格审查先指出一项 P2：不能泛称所有损坏 flag 值都被拒绝；root 按源码将表述限为无效 cohort JSON/schema，复审 **P0/P1/P2 0/0/0，READY**。随后独立质量/安全审查报告及两份增量进度文档，同为 **0/0/0，READY**，未发现需修正项。两位审查者均未冒称重跑测试、访问网络或实际生产资源。

本地交付已在 `70eb49d8842468dab7c1f946cd368742a8da9f90` 保存，并完成获准的公开开发分支备份。本地 `outputs/backups/arc-v8-70eb49d8842468dab7c1f946cd368742a8da9f90.bundle` 也已通过 `git bundle verify`，记录完整历史及同一分支 SHA；大小 3,787,181 字节，SHA256 `dccefaa26aa899893c8f694125f9406907879aca096b38d23fc6d2f7f2aa01d2`。该文件固定至 `70eb49d`，不包含随后备份完成记录，且不是 D1/R2 数据备份。含本次完成记录的文档提交另行同步到同一远端分支，最终交接核对实际 SHA 和干净状态；不重复运行未受文档改动影响的应用测试。
