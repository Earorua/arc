# Arc v8 候选字段诊断：下一次单次真实验证候选

状态：**2026-09-11 第九次已执行，未通过；许可已消耗。** 用户回复“已运行”后，安全 Summary 记录 Key/Research HTTP 200、177531 ms、stop，但 annotations-invalid，usage.server_tool_use 缺失，候选观察未执行；未 Ready/激活/规划。完整证据见 `v8-ninth-response-result-2026-09-11.md`。下方命令仅保留为本次已执行历史，不得再运行；没有第十次或自动重试许可。Root 没有读取 Key 或代为启动请求。

## 目的与已完成条件

第八次真实结果已经 HTTP 200/stop，但候选 invalid-schema、搜索 usage 不合法；旧正文未保存且不能补回。本次将通过新增 `researchCandidateDiagnostic` 定位 JSON/复杂度/Schema 字段拒绝阶段，通过 `providerResultDiagnostic.webSearchUsage` 区分搜索次数缺失、类型和范围问题。不改变模型、请求内容、接受标准或费用规则，不保证本次成功。

本地候选完成两项 TDD、各自先规格后质量安全双审及最终独立整合审查，均 READY。Root 14 文件/635 测试、非增量类型、八文件定向 lint、五阶段构建和产物检查通过；25 项源码/受保护指纹全部匹配。完整证据见 `v8-candidate-field-diagnostics-validation-2026-09-11.md`。

## 已授权范围

- 固定 `moonshotai/kimi-k3`、reasoning `low`，输入 `Data Product Manager` / `en-US`。
- 最多一次 Key GET、一次 Research POST；无额外探测、Repair、自动重试或第二次 POST。Provider 内部搜索调用仍按原请求限制。
- strict JSON Schema、12000 max_tokens、最多 2 次搜索、最多 10 个搜索结果；既有隐私限制保留。
- 本轮费用上限 **USD 5**；用户在本机隐藏输入新的、未使用、无周期重置且限额不超过 USD 5 的专用测试 Key。助手不读取 Key，不写入代码/参数/环境变量/聊天。
- 固定 Provider 等待 600 秒、本地租约 660 秒、启动器总等待 720 秒。失败或超时先保存安全结果，不再自动运行。
- 仅一次性本地数据库；不更改生产变量、Research 旗标、D1/R2、Sites 版本或部署，也不提交/推送/合并 Git。

用户自行开启的 OpenRouter 正文日志仅影响未来请求；本候选不更改该设置，也不自动读取或保存原始正文。若后续需要正文离线重放，单独确定交付方式。

## 固定源码

权威 worktree 为 `C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta`；分支 `codex/v8-openrouter-research-beta`，HEAD `7090153b4acad7b12df6a7ee4d675b46c41871dc`。包含有意保留的未提交成果，不能只用 HEAD 代表候选。

| 文件 | SHA256 |
| --- | --- |
| app/server/research/provider.ts | 715baaa6eb31e062c6f9fb6098085e4656666c3cb7a42b359597acf6d50966cb |
| app/server/research/orchestrator.ts | b8756597029b7974bca228048bed1e73d2765845eee2b3edd99ce30fed447e97 |
| app/server/research/result-diagnostic.ts | 2af34fd5e6fd81f5a0f891e4a64a49e2843d274aa665cc6e1fcc056bc730c6f2 |
| scripts/live-research/validation.ts | 9e98eaf087244b113532aacf2e09974bc891c56a8b8655d6acd5f104dab90fe9 |
| app/server/research/openrouter-provider.ts | 9d73fcedf0d0050cdb510c469e33856dd9f7189e4e71d56e3e7692729ba8124f |
| app/server/research/local-validation-profile.json | 84b286701ac98a716255c5092d997bc153fa0f18152164416f7bc90af803b10d |
| scripts/live-research/run.ps1 | 74a553f87f7e5a4878e1032c58fba13ec0b0929c5a9cd291b9088fcf61343f64 |
| scripts/live-research/runner.mjs | 47305aa27df034bea1e669016bb8b2d83338425e4e67da476d050a2b4858a226 |

授权后的指纹复核已经完成；工作树保留 49 份预期未提交成果，没有修改候选源码、重跑测试或进行 Git/Sites/生产写入。

## 已执行的唯一命令（历史，不要再次运行）

用户在自己的 PowerShell 运行一次；使用新建、未使用、无周期重置、限额 USD 5 的测试 Key，建议名称 `arc-v8-candidate-once-20260911`。只在脚本的 masked 提示处粘贴 Key，不发到聊天。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\XF\Documents\Codex\2026-07-26\sites-plugin-sites-openai-bundled-2\.worktrees\v8-openrouter-research-beta\scripts\live-research\run.ps1" -ExecuteOne
```

本次已退出并完成摘要核对；不要再执行此命令。后续优先根据已有证据进行零 Provider 的契约调查和本地修复；新实测需要新的具体许可。

## 结果判定

完整通过仍要求 Ready、合法来源/技能、可信完整 usage 与结算、owner 隔离、激活/规划、零 Repair 和数据库销毁。只有 HTTP 200、stop、Activity 费用或新增诊断可见均不足以通过。

若未通过，则记录有限字段路径/固定错误码和搜索形状后，准备针对具体证据的本地修复；不得自动重试或放宽 Schema/费用验证。诊断 null 表示未观察到该阶段或诊断安全投影失败，不自动推导具体候选错误。
