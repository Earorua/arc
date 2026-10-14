# Arc v8 原生 fetch 诊断：第十七次单次真实验证方案

状态：第十七次完整本地真实验收 PASS，用户实际终端 ExitCode 0，独立验收审查 PASS。单次授权已消耗，下面范围和命令仅供历史审计，不得再次运行；没有第十八次许可。结果见 `v8-seventeenth-success-result-2026-09-13.md`。此前本地实施、双审、525项、类型/lint/build和离线证据继续有效。

## 已授权单次范围

- 模型 `moonshotai/kimi-k3`，reasoning low，输出上限 32768 tokens；角色 Data Product Manager，语言 en-US。
- 最多 10 次搜索、50 条结果；专用、未使用且不自动重置的 USD 5 总限额测试 Key。一个 Research POST 可能产生多个搜索子请求，USD 5 是总上限，并非预计消费。
- 至多 Key GET 1 次、Research POST 1 次；Repair、自动重试、续写、探测、模型回退及第二次 Research 均为 0。
- Provider、租约、启动器时限分别为 20、21、22 分钟。原生连接阶段仍有独立超时，不能将三项时限解释为所有网络阶段都等待 20 分钟。
- Key 仅由用户在本机 PowerShell 隐藏输入；助手不创建、读取或保存。建议名称 `arc-v8-native-fetch-once-20260913`。
- 本次不包含 Git 写入、生产配置或数据库操作、Sites 候选保存或部署。

2026-09-13 用户明确回复“授权第十七次单次验证”。执行前560项交接一致；结果更新前564项仍一致。新回执 passed/ready、85.685秒、8次搜索、USD0.219672可信结算，激活/计划/隔离/清理通过，用户明确报告 ExitCode 0。授权记录见 outputs/local-native-fetch-seventeenth-20260913/authorization.json。先前跨最终写入时点的旧Summary及退出后进程快照导致“尚未执行”误判，已修正；原等待记录仅保留历史。当前恢复交接改用同目录 result-handoff-hashes.json 及 result-handoff-verification.json。

## 历史终端命令（已消耗，不得再次执行）

当时使用专用、未使用且不自动重置的USD5总限额Key，仅在本机masked提示中输入。以下命令已完成，仅为执行来源记录，不是新的操作指令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\XF\Documents\Codex\2026-07-26\sites-plugin-sites-openai-bundled-2\.worktrees\v8-openrouter-research-beta\scripts\live-research\run.ps1" -ExecuteOne
Write-Host "ExitCode: $LASTEXITCODE"
```

该运行已结束并取得用户实际 ExitCode 0，无存活验证进程待等。不得再次执行此命令。请求边界为 Key GET1、Research POST1、Repair0，成功回执不构成后续付费请求许可。

## 本次变化与判读边界

本地 guard 在替换原生 fetch 异常前，向私有 Summary 的 `researchNativeFetchDiagnostic` 写入版本和固定类别。分类只读取已批准的错误码或名称以及最多一层自身 cause，不记录异常原文、Key、正文、任意对象字段或动态字符串。原 Provider/v3 诊断、请求参数、费用保留和业务判定保持原样。

若返回 headers-timeout、connect-timeout、socket、dns、tls 等类别，可缩小调查范围，但不能据此确定服务商责任、地区限制或网络根因。`other` 仍可能表示未识别错误。新字段默认 null；成功、有 HTTP Response 的拒绝和 body-reader 错误不写此字段。验证完成后的迟到错误也不能改写已返回 Summary。

本次本地改动补充诊断，不证明第十六次故障已修复，也不保证下一次调用成功。第十六次真实结果及未知费用保持，见 `v8-sixteenth-fetch-result-2026-09-13.md`。

## 执行前及结果验收

本地完成证据已保存在 `outputs/local-native-fetch-20260913`：Task1/Task2 的 RED、GREEN、SPEC 后 QUALITY，Root 18 套件、非增量类型检查、定向 lint、本地构建、产物核对、默认零真实请求演练和最终独立审查。精确候选以该目录最终源码、完整构建及交接指纹清单为准。

获得新的单次授权后，先核对候选、分支、HEAD 和同一验证进程状态，再交付一次执行命令。启动后等待同一次运行，不因输出延迟重新启动。结束时只核对新安全 Summary、实际终端 ExitCode 和必要的 Activity 状态/费用；不索取完整账户 JSON、Key 或正文。

完整成功仍要求 outcome passed、runState ready、正式引用/来源/课程质量通过、费用可信并 settled、账户激活与规划生成、owner 隔离、第二次调用拒绝和临时数据库销毁。HTTP 200、stop、收费或单项诊断 accepted 都不足以证明完成。失败则保存证据，不自动重试。

即使本地真实验证成功，线上长任务接入、真实登录和发布后验收仍需完成，见 `v8-online-research-readiness.md`；完整公开发布目标尚未完成。

当前源码/既有回执候选117项，清单SHA256 b1949435464df40cb4419d521d92e377e07ea12502bf74519523fba18514bae2；完整构建108项，清单SHA256 92698d823174b5da395e7d18e660a580ef3381e7ec64bf00d574e7b34de9b462。默认离线Summary为outputs/live-research/summary-2026-09-13T05-23-43-795Z.json，SHA256 dd2fc71af0fbbe6526acad30b0d6968293a9549530b96800b59937d46e37eae2。分支codex/v8-openrouter-research-beta、HEAD7090153b4acad7b12df6a7ee4d675b46c41871dc；完整当前交接位于outputs/local-native-fetch-20260913/final-handoff-hashes.json。
