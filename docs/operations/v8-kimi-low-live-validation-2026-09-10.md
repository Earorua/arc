# Arc v8 Kimi low 单次真实验证

状态：**第七次许可已执行并消耗，完整 Research 验收未通过，正在本地排查。** 用户于 2026-09-10 授权一次 Kimi K3 / low、USD 5 上限、无 Repair/自动重试并回复“已运行”。新安全摘要为 `summary-2026-09-09T18-16-27-326Z.json`：Key/Research HTTP 200、Research 108876 ms、failed / invalid-result、usage null、无计划。SHA256 `24bad7859f8c9c0471881609961aa9dfe08ee83ea80ff571a7c40cc31a4a4821`。七次许可均已消耗；没有第八次、其他诊断请求或重复命令许可。完整证据与用户提供的主请求记录见 `v8-kimi-invalid-result-2026-09-10.md`。

## 已验证的候选

- 分支 `codex/v8-openrouter-research-beta`，HEAD `7090153b4acad7b12df6a7ee4d675b46c41871dc`；使用当前已审查的未提交工作树，不回退旧提交。
- 固定 profile `kimi-low-bounded-v1`：`moonshotai/kimi-k3`、reasoning low、Provider 600 秒、租约 660 秒、启动器 720 秒。
- 前轮 16 文件 / 607 项相关测试、类型/lint/build 及逐项和整合审查已通过；2026-09-10 恢复时关键源码 SHA256 保持一致，没有新源码改动。
- 本轮实际无参数 PowerShell PTY：退出 0、3.17 秒，JSON 与 Summary 路径均可见。摘要 `outputs/live-research/summary-2026-09-09T17-31-00-699Z.json`，SHA256 `a2b16dcfed616b4e5eb6f57a85906e460aa5420fc2bf68760f7f37d91bc77a78`。offline-dry-run / passed / 0 real requests / Ready；6 引用、3 技能、6 计划单元及费用 USD 0.10 均为合成夹具，不能作为真实成功证据。

## 请求授权的精确范围

仅运行一次完整 Research：公开岗位 **Data Product Manager / en-US**，上述固定候选，消费预算上限 **USD 5**。至多一次 Key GET 和一次 Research POST；不额外运行账户目录、其他模型、最小探测、Repair 或客户端自动重试。保留严格 Schema、deny / ZDR / require_parameters、Exa fast 最多两次搜索与合计十个结果、每次生成的 max_tokens 12,000 参数。该参数不表示整个工具循环累计输出最多 12,000。

Key 由用户在本机 PowerShell 隐藏提示中输入，不能发送到聊天或写入源码。使用新的、未使用、无周期重置、限额不超过 USD 5 的测试 Key；预检要求 usage 和 BYOK usage 均为零，余额等于该 Key 限额。可命名 `arc-v8-kimi-low-once-20260910`。不放宽检查以复用已扣费 Key。

以下是第七次许可下**已经运行的历史命令，不要再次执行**。当时由用户在本机交互 PowerShell 运行，Key 仅在随后的隐藏提示输入：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\XF\Documents\Codex\2026-07-26\sites-plugin-sites-openai-bundled-2\.worktrees\v8-openrouter-research-beta\scripts\live-research\run.ps1" -ExecuteOne
```

启动器提示应明确 Kimi / low / 10 分钟 Provider / 12 分钟启动器 / USD 5 / no repair or retry。完成、失败、超时或返回终端后，用户回复“已运行”；先读取这一次新安全 Summary，不能自行再跑。非流式本地取消不保证服务端停止计费；缺失最终回执继续按费用未知处理。Root 未代用户启动付费进程，也未取得 Key。

## 真实验收标准

摘要必须为 live-one / passed，Key 和 Research 均 HTTP 200，realRequestCount 2（一次 GET + 一次 POST）、researchRequestCount 1、repairRequestCount 0、auditCount 1。固定策略一致，研究耗时为有界非负数；Ready、质量通过且无问题代码，有有效引用和技能，usage 中 tokens、搜索次数和数值费用齐全且在既有预算范围内，reservation settled 与 usage.costMicros 一致。

ownerWrongReadRejected、secondResearchRejected、freshAccountActivated、planningGenerated、databaseDisposed 均须 true，计划单元大于零。真实内容数量不要求等于离线夹具的 6/3/6。HTTP 200、单条子请求费用或已发生搜索不足以替代这些条件。失败或 Needs review 先记录证据，不自动重试，不改写旧摘要。

这一步仅是本地真实 Provider 验收。成功后继续线上长任务/恢复方案及真实登录、持久化和发布验收；不直接开启线上 Research 或部署。既有 v10 公开版本与生产变量/秘密/D1/R2 保持当前状态。

## 执行前关键指纹

| 文件 | SHA256 |
| --- | --- |
| scripts/live-research/run.ps1 | `74a553f87f7e5a4878e1032c58fba13ec0b0929c5a9cd291b9088fcf61343f64` |
| scripts/live-research/runner.mjs | `47305aa27df034bea1e669016bb8b2d83338425e4e67da476d050a2b4858a226` |
| scripts/live-research/validation.ts | `e48b7a7c90671fab46a2db250ef32ccd402d8eb14aaa18a5a217ed37119e6e0b` |
| app/server/research/openrouter-provider.ts | `15c7fae64df7952eb81849e7331143c0853f5e85111a5024ab839af7ec83e5fa` |
| app/server/research/local-validation-profile.json | `84b286701ac98a716255c5092d997bc153fa0f18152164416f7bc90af803b10d` |

原完整真实失败 Summary 的 SHA256 仍为 `4969ecaff86d720a54a99fe658afc1b4622655784d66e8ca1d90729fecf4a62b`；本轮新离线结果不覆盖它。

授权交接前于 UTC 2026-09-09 17:45:59 再核对分支/完整 HEAD 及上述五份源码、最新离线与旧真实 Summary 哈希，全部一致。当时有 32 份有意保留的未提交文件，无新增代码修改、测试、付费请求、生产操作或 Git/Sites 发布。随后用户已执行一次；上方最新状态与调查记录取代“尚未运行”。本次排查未修改上述源码或历史真实摘要。
