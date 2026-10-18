# Arc v8 Kimi 安全诊断候选：下一次真实验证方案

**状态：2026-09-11 第八次单次验证已执行，许可已消耗，完整 Research 未通过。** 新 Summary `summary-2026-09-11T03-56-51-191Z.json`：HTTP 200、196252 ms、Provider accepted / stop；内部 invalid-schema，usage 搜索次数未通过，保守持留，无激活/规划。详见 `v8-kimi-schema-result-2026-09-11.md`。没有第九次、Repair 或重试许可。下文命令为本次历史执行记录，不能再运行；root 未读取 Key 或启动真实请求。

## 本次目的与范围

取得同一 Kimi Research 流程的安全三层诊断，区分响应解析、候选验证、内部运行拒绝与无效 usage。诊断已经销毁的历史响应不可能追补；新增字段不是对真实问题已经修复的承诺。

候选证据：`v8-result-diagnostics-validation-2026-09-10.md`。两项实施、各自规格后质量安全双审、最终独立整合审查均 READY；root 12 文件/566 测试、类型/lint/build 和 21 项指纹检查全部通过。用户已经授权本次真实验证；真实 Research 成功仍未证实。

权威分支 `codex/v8-openrouter-research-beta`，HEAD `7090153b4acad7b12df6a7ee4d675b46c41871dc`；候选包含有意保留的本地未提交成果。执行前核对以下 SHA256，不以 HEAD 单独代表全部候选：

| 文件 | SHA256 |
| --- | --- |
| `app/server/research/openrouter-provider.ts` | `9d73fcedf0d0050cdb510c469e33856dd9f7189e4e71d56e3e7692729ba8124f` |
| `app/server/research/result-diagnostic.ts` | `c3dc9cf23a8a66d27de77b8e9f9a22e57e75779593de044bf2262ec4e0aa2932` |
| `scripts/live-research/validation.ts` | `1d5bdc8d3036b1a625a2bc3e9e546e374b9286e0abe999277302c0cd8737e98e` |
| `app/server/research/local-validation-profile.json` | `84b286701ac98a716255c5092d997bc153fa0f18152164416f7bc90af803b10d` |
| `scripts/live-research/run.ps1` | `74a553f87f7e5a4878e1032c58fba13ec0b0929c5a9cd291b9088fcf61343f64` |
| `scripts/live-research/runner.mjs` | `47305aa27df034bea1e669016bb8b2d83338425e4e67da476d050a2b4858a226` |

- 模型 `moonshotai/kimi-k3`，reasoning `low`。
- 固定输入 `Data Product Manager`、`en-US`；strict JSON Schema、12000 max_tokens。
- 最多一次 Key GET 和一次完整 Research POST；不运行额外模型探测、Repair、自动重试或第二次 POST。
- Exa fast，最多 2 次搜索、共 10 条结果；保留 `data_collection: deny`、ZDR、`require_parameters: true`。
- Provider 等待上限 600000 ms，本地租约 660000 ms，启动器总等待 720000 ms。
- 使用用户创建的新、未使用、无周期重置、限额不超过 USD 5 的专用测试 Key；本次费用上限 USD 5。限额 Key 由用户私下输入，不交给助手、不写源码、命令参数、环境变量、Git 或聊天。
- 仅使用一次性本地数据库；不改生产凭据、旗标、D1/R2、Sites 版本或部署。

## 已执行的历史步骤（许可已消耗，不要重复）

**本次已执行结束。** 用户曾在自己的 PowerShell 运行以下命令一次，仅保留可追溯记录，不再执行第二遍：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\XF\Documents\Codex\2026-07-26\sites-plugin-sites-openai-bundled-2\.worktrees\v8-openrouter-research-beta\scripts\live-research\run.ps1" -ExecuteOne
```

在隐藏输入提示中粘贴专用 Key。无论成功、失败或超时，结束后只回复“已运行”；不要再次运行，也无需复制完整原始响应或账户信息。助手只核对本次新产生的安全 Summary 和 outcome。

## 判读及停止条件

成功仍要求原有 Ready、质量、引用/技能、可信完整 usage、保守预算正确结算、owner 隔离、激活与计划生成、零 Repair 和 finally 销毁全部通过。三个新字段只解释过程，不参与降低成功标准，也不是额外收费证明。

失败或缺失费用时先记录新增诊断，再结合必要的最小 Activity 字段决定下一步。没有新增许可不得重试、更换模型或提高预算；无法从主记录费用为零推导整条搜索流程免费。

真实执行结果已经收到并核对，见本页顶部及调查记录。本次许可只针对已结束的一次请求；Root 未启动请求，不索要或读取真实 Key。本次失败不能据此再运行一次。
