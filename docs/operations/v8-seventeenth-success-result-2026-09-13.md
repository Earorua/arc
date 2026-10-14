# Arc v8 第十七次真实 Research：本地完整验收通过

2026-09-13，第十七次已执行并通过，用户明确提供实际 PowerShell `ExitCode: 0`。独立 `seventeenth_acceptance_review` 审查 PASS。单次许可已消耗；不得再次执行第十七次命令，没有第十八次许可。

## 结果与证据

安全回执：`outputs/live-research/summary-2026-09-13T06-02-51-035Z.json`，SHA256 `24c4e808cae6aa8d7e42540b29df61151921edb7ea03620b71b8d9d2804ac065`。Root 对已有回执完成 13 项断言，更新结果前 564 项交接指纹全部一致。记录见 `outputs/local-native-fetch-seventeenth-20260913/result-verification.json`、`acceptance-review.json` 和 `authorization.json`。

| 验收项 | 实际结果 |
| --- | --- |
| 完整状态 | live-one / passed / ready；Key 与 Research HTTP 200；finish stop |
| 模型与策略 | moonshotai/kimi-k3，low，32768 输出上限；20/21/22 分钟期限 |
| 时长与搜索 | Research 85.685 秒；服务商回报 8 次搜索，来自 server_tool_use_details |
| 正式候选与质量 | 候选、blueprint、registry、evidence 校验通过，无 issue |
| 课程规模 | 8 个技能、8 个通过引用对应及 URL 规则校验的资源、24 个课程单元模板 |
| 注解 | 40 个兼容且识别的引用注解；不等于 40 个正式课程资源或独立搜索结果 |
| Token | prompt 13879 + completion 9495 = total 23374 |
| 费用 | Provider 回应 usage 219672 micros，即 USD 0.219672；本地账本同额 settled，低于 USD 5 上限 |
| 完整流程 | 新建测试账户激活、生成 7 个每日计划单元、跨 owner 拒绝、第二次 Research 拒绝、临时数据库销毁通过 |
| 请求边界 | Key GET 1 + Research POST 1；Repair 0，无追加请求 |
| 终端 | 用户明确报告 ExitCode 0；不由 Summary 或工具退出码推断 |

成功路径的原生 fetch 与 transport 失败诊断为 null，符合设计。此次可信费用来自 Provider 回应并在本地结算，没有另行核对 Activity；本次成功验收不要求再查账户或发送完整 JSON。

## 修正之前的运行观察

文件名中的 06:02:51.035Z 是初始化时间，最终文件在 06:04:18.033–034Z 才创建/写入。此前“最新 Summary”快照发生在最终写入之前，而随后 06:04:18.269Z 的进程查询发生在退出之后。两次不同时间的观察组合不能证明未执行；旧“待执行、未消耗”状态现由已落盘回执与用户 ExitCode 修正。

没有重启或重复请求。未来在进程查询后重新读取最新 Summary，再判定是否存在已完成运行；进程过滤继续覆盖 Node 相对 `scripts/live-research/runner.mjs` 参数。原 execution-wait 审计和 blocked 工具记录保留为历史，不再是当前恢复指令。

## 通过范围与下一步

这证明一次使用真实 Provider、临时数据库和种子测试账户的完整本地 Research 链路通过。课程规则审计不等于逐篇来源事实核查；7 个每日计划单元与 24 个可复用课程模板是不同计数。本次通过不证明第十六次故障原因、长期网络可靠性、真实 OAuth 或线上发布完成。

完整公开发布目标仍未完成。下一阶段是线上接入设计：迁移成功的请求策略和配置指纹，解决生产 120 秒调用/60 秒租约与当前候选的差距，以及首次响应丢失时的只读恢复。持久执行能力与本站 20 分钟链路需要后续实际平台证据，不能直接打开 Research。

原应用、构建和已通过测试未改，不重跑本地验收。分支 `codex/v8-openrouter-research-beta`，HEAD `7090153b4acad7b12df6a7ee4d675b46c41871dc`；未提交成果原地保留。本次无 Git、生产配置、生产 D1/R2 或 Sites 写入。
