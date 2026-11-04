# 普通用户资料分析的生产包与回退

资料执行器处理简历、当前岗位的一份主 JD 和补充文本。每次分析需要登录用户就具体资料版本作出授权。生产开关默认关闭。上线前须完成 Gate 1B、补充资料首发验证、生产隐私审查以及独立的云资源和费用审批。[验收计划](../plans/2026-11-04-private-materials-gate-1b-acceptance.md) · [当前进度](../../verification/2026-11-04-materials-public-release-progress.md)

## 本地准备

在与评测候选匹配的工作区使用已有的锁定依赖。将一份脱敏输入包保存在本地受控目录，使用本次审核的非秘密配置和引用。不要把凭据或用户资料写入输入包、命令行、源码或归档。打包入口只生成本地文件。[打包脚本](../../../scripts/prepare-materials-production-package.mjs)

| 输入 | 内容 |
| --- | --- |
| `schemaVersion` | 数字 `1`。 |
| `baseline` | `configFile`、`versionFile`、`deploymentsFile` 为同一账户、同一公开 Worker 的 Wrangler 配置、原生版本和部署记录。另填 `accountId`、`workerName`、`versionId`、`deploymentId`、`configSha256`。相对文件路径从输入包所在目录解析。秘密绑定只收集名称。 |
| `source` | `candidateDirectory` 指向仓库 `docs/verification` 下的已验候选目录。`candidate`、`tree`、`bundleSha256`、`verificationSha256`、`artifactTreeSha256` 分别固定提交、Git tree、源码包、回归记录和关闭态逐文件清单。 |
| `resources` | `documentsBucket`、`executorName`、`executorDatabase: {name, id}`、`resultsBucket`、`workflow`。五个资源使用独立名称及 `arc-materials-prod-` 前缀。私有执行库与既有站点库、Research 库及验收库分离。 |
| `activation` | 准备关闭态或回退时用 `{"mode":"closed"}`。准备开放时提供 `mode="production"` 及三份独立审核的对象 `config`、`qualification`、`authorization`。 |

从项目根目录运行，最后一个参数是尚未使用过的输出名称。

```powershell
node --import tsx scripts/prepare-materials-production-package.mjs work/materials-production/operator-packet.json reviewed-closed
```

结果在 `outputs/materials-production/reviewed-closed/`。校验 `verification.json` 和 `artifact-index.json`，核对站点与执行器的程序、静态资源和全部迁移与冻结文件逐个一致。两个 Wrangler 配置分别指向公共站点和仅能通过绑定访问的执行器。若同名目标已存在，保留旧结果，使用新的审核名称。

完整源码包在空 Git 库中还原。增量包只向临时库提供候选记录标明的基础快照，再检查提交、祖先关系、tree 和对象连通性。执行器从还原后的源文件复编，站点和执行器迁移与 Git 比对。开放态还检查实际运行的打包程序与策略源码，并在最终输出改名前复核授权仍生效。留存包内的时点是本地审核时点，正式切换使用新的现场核验。

## 开放前的现场核验

1. 取得当日、完整的站点版本与部署回读。验证唯一生效版本承接 100% 流量，域名、路由、预览、地域、静态资源入口、登录、Research 服务与学习 Agent 使用的绑定均与批准清单一致。历史快照可用于演练，正式放行使用新鲜回读。
2. 核对两个私有桶的访问策略、私有执行器的路由与预览关闭、两个方向的具名服务绑定、Workflow 和清理 cron。执行器使用普通用户分析专用凭据；站点只持有资料服务的桥接秘密。核实实际账户限制与费率。平台保存秘密后只核验绑定名称和就绪响应。
3. 独立批准生产资格、数据处理范围、用户日限额、全局日限额、单次上限、总授权额和有效期。授权的 `purpose` 必须是 `production-private-material-analysis`，同时记录唯一 `id`、`configurationSha256`、`approvedAt`、`expiresAt`、`totalBudgetMicroUsd`。摘要覆盖端点、固定路由、回执、价格和限额。B2、B4 及其专用 key 额度各有独立用途。[执行器策略](../../../worker/document-executor/production-policy.ts)
4. 核对站点增量迁移和执行器 `0000` 至 `0003` 的实际应用清单、兼容读取、备份和恢复演练。先验证关闭态能读取与删除既有资料，并核实新分析不可用。取得发布批准后，分别核对站点与执行器上的开关、同一授权、就绪握手、私有 D1、R2 和任务绑定，再开放入口。正式切换时再次核对授权时间、预算和当前版本。
5. 上线后用专用测试账户和获准的合成资料验证提取、人工修改、采用与学习计划差异预览、换公司 JD、保护已完成任务及删除。每次获准模型请求只产生一次可核对的费用。未登录请求、跨用户访问、未授权资料版本和超额请求均须拒绝。登记实际线上版本、测试范围和费用。

## 停发与对账

发生费用不明、回执重复、实际费用高于批准上限、隐私条件变化或绑定偏差时，先停新分析。使用同一正式基线和资源清单准备 `closed` 包，核对阻断新发送及维护任务继续运行。已确定的费用和原预留都要保留。持有人使用供应方回执与账单对账，查清仍可能扣费的每笔请求，完成独立审计后再决定是否开放新授权。保留已完成任务、删除代次及私有费用账本。当前实现提供停发与记账，解除异常停发需另行核准的运维对账流程。
