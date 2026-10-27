# Arc v8：Research 关闭版本的部署结果

**结果：本次公开部署成功。** Sites 在北京时间 **2026-09-07 01:25:22**（UTC 2026-09-06 17:25:22）报告 `succeeded`；现有公开地址为 `https://arc-precision-path.jiahe-xu.chatgpt.site`。这完成用户本轮“完成这次的部署尝试”的目标，不表示真实 Research 或全部登录后功能验收完成。API 问题留待用户后续通知。

## 授权、来源与部署身份

用户先选择“保持公开访问，仅关闭 Research”，随后明确请求完成部署尝试。该新指令覆盖此前仅限本地准备、禁止本轮 Sites 发布的阶段边界；本次只部署已审查的 v8，新增明确的 Research false 配置，沿用现有公开范围、认证配置和逻辑 DB/R2 绑定。没有合并或推送 GitHub master，没有新建 Site、绑定域名或发起真实 Provider 请求。

| 项目 | 实际身份 |
| --- | --- |
| 权威开发分支 | `codex/v8-openrouter-research-beta` |
| 已验证源码及准备记录 | `cd2b9abead3a98d635850461e2b49bb650618a6d`；产品实现 `c2104b7e723b82f574bc2a46405693e88eecf8af` |
| 精确文件树 | `fd4c50e8989e3ea5e189b15dd2283a6e0324f32c` |
| Sites 发布源码 | `2b0ed9376e8693250277c194c297076ff975a257`，与上述文件树相同；父提交保留既有 Sites 源码 `7ca5b530dfc58f3cbc700b44a7a881a9bd661209` |
| Site | `appgprj_6a6678d3e3848191a352778c6db1e7b1`，owner / active / public |
| Sites version | 10：`appgprj_6a6678d3e3848191a352778c6db1e7b1~appgver_165fcb7248a081919299de873212df6f` |
| Deployment | `appgdep_6a9da1f1f8748191a6a32e8ce6b591b8`，publish / succeeded，failure_message 为 null |
| 已应用环境修订 | 2；`ARC_AI_ENABLED="false"` 保持，新增 `ARC_AI_RESEARCH_ENABLED="false"` |

使用忽略目录中的一次性源码发布快照，普通快进推送 Sites 的 `main`，没有改动权威开发分支或 GitHub master 的产品内容。临时源码写凭证只用于命令级 Git 认证，没有写入 URL、配置、文件或本记录；生产秘密值未读取或复制。

## 发布前的实际检查

- 复用上一轮已通过的验证：138 文件/2,643 单测、非增量类型、完整 lint、五阶段 build、最终 4/4 构建 HTML 和 20/20 定向测试；规格和质量/安全审查均为 0/0/0 READY。只增加部署记录不重跑这些未受影响的检查。
- 独立只读发布检查没有发现新的 P0/P1/P2 源码或迁移包缺陷。旧 0000/0001 SQL、snapshots 与线上来源的 Git 内容相同，journal 仅追加；0002–0006 是 70 条 CREATE TABLE/INDEX、21 张新表，没有旧行 DML、ALTER、DROP 或回填。旧表新增的三个唯一索引均包含已有全局主键 id。
- 15 个 SQL/metadata 文件和 hosting manifest 在源码与构建中逐字节一致；snapshot 链连续。认证、账户关联、依赖、Worker 与 Sites 配置相对旧线上源码保持一致。
- 线上原来是 v7.2 / Sites version 9，DB 概览为 20 张用户表；目标和学习档案各返回 1 行且无后续页。学习任务、完成事件、Proof、资产、分享、feature_flags、ai_runs 均为空。只记录数量，不保存实际行值；没有查询 accounts、sessions 或 verifications 的凭据内容。`migration_runs` 是应用表，不冒称它是平台 SQL migration ledger。
- 旧首页、登录页、认证 providers 与匿名 session 接口均返回 200；providers 为 google/github，匿名 session 为 null，旧首页尚无开发提示。`BETTER_AUTH_URL` 与当前 HTTPS origin 相同；秘密仅核对存在的键名，未读取值。

**恢复能力仍未验证。** 当前 Sites 接口没有 D1/R2 原生备份、恢复或平台 migration ledger 读取操作；R2 没有资产引用不证明不存在孤立对象。此前完整发布清单中的协调恢复条件未取得真实证据。本轮按照用户已明确请求的部署尝试、精确不变的旧迁移和经核对的追加迁移执行，默认保留全部旧数据；没有把未回答的数据重要性问题解释成可丢失数据的许可，也没有声称通过完整生产验收。旧 v7.2 仍不能直接接管已有 v8 数据，不把直接重部署旧版作为已验证回滚方案。

## 归档与执行证据

- 使用 Sites 官方 `scripts/package-site.sh`；临时目录限定并核对在当前工作区。首次打包因 Windows 盘符被 tar 识别为远程地址而失败，转换为 Git Bash 绝对路径后成功；该失败没有发起部署或迁移。
- 本地 `outputs/releases/arc-v8-cd2b9ab.tar.gz`：3,932,577 字节，SHA256 `267ac165f11b4677af85bc5fb25a90a1cdb4bb18a3fade153d2639c8f1563ced`。检查所有路径均在 dist 内且无环境/凭据目录；解包的 108 个文件与已验证构建逐文件字节一致。
- Sites 保存结果：108 文件、9,072,640 字节、archive_format `tar`，content_hash `sha256:1ecee28f71966e3db1ab45c6f165794db7040c6ba8292b67771b1c2bbf11fc3a`。本地 gzip 解压流是 9,082,880 字节、SHA256 `ffc1e7784e30fc43e187c67f8b72a5aa114fd849ade0ffae50c919cca62e3363`；它与平台存储容器不是同一字节序列，不能混用哈希。当前接口没有可下载的存储 artifact，因此未声称完成远端 artifact 的逐文件恢复验证，也没有仅凭容器差异重新部署。
- 只新增 Research false 这一项运行值，环境 revision 1→2；其余值保留。随后对精确 version 10 发起 **一次**公开部署；状态从 pending 变为 succeeded，返回原公开 URL 并确认 env_set_revision=2。没有自动重新部署、数据库手工 SQL、删除数据、回退旧版或新增模型调用。

## 部署后检查与限度

| 检查 | 实际结果 |
| --- | --- |
| `/`、`/sign-in`、`/setup`、`/today`、`/path`、`/stack`、`/proof` | 七个无登录 HTTP 请求均 200；每份 HTML 中精确 notice 标记出现一次且位于 main 前 |
| 顶部文字 | `The website is currently under development.`，role=note、lang=en |
| `/api/auth/providers` | 200，google/github |
| `/api/auth/get-session` | 200，匿名结果 null |
| `/api/intelligence/research/eligibility` | 匿名请求 401，未绕过认证；不冒称执行了已登录用户的资格/新建/重试验收 |
| 关闭配置 | 发布应用 revision 2，两项 AI/Research flag 均 false；配合已验证的新建/重试服务端关闭链 |
| DB 概览 | 20→41 用户表，原表保留；不冒称读取了平台逐条 SQL ledger 或实际索引清单 |
| 原有业务记录 | 目标和学习档案仍各 1 行，其余上述空表仍为空；只证明观测的数量保留，不等于完整数据库字节备份或所有行值比较 |
| Research | 新 research_runs 表为空；本轮真实 Provider 请求为 0 |
| 浏览器交接 | 未发现已有浏览器标签页，open_in_codex 已请求展示部署 URL，返回 queued；未声称已完成浏览器交互或截图 QA |

真实 OAuth 往返、登录后跨账户/规划/Proof/附件流程、本次完整数据恢复与远端 artifact 恢复仍未验收。当前完成的是已获授权的公开部署尝试及以上 HTTP/配置/表概览检查。用户解决 API 问题后再通知继续；不要消耗旧的两次 Research 许可，不自动开启 Research、重试付费模型、增加功能或另行部署。

独立记录审查修正一项 P2 措辞后为 **P0/P1/P2 0/0/0 READY**，没有剩余准确性或保密问题；这不是新的完整生产验收。Root diff 检查通过。本记录随后本地提交并普通同步已授权 GitHub 开发分支；其记录提交不是新的 Sites 部署版本，线上源码仍以上方精确 Sites commit 为准。
