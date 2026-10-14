# Arc v8 响应兼容修复：第十次单次真实验证候选

状态：**2026-09-11 第十次已执行，许可已消耗，完整验收未通过。** 用户回复“已运行”后，新安全 Summary 确认 HTTP 200 / stop / 45298 ms，Provider accepted、details 用量有效、本地 USD 0.082915 结算；候选 schema-rejected，未 Ready/激活/规划。返回搜索计数 4，高于约定 2，原因尚待核对。详见 `v8-tenth-response-result-2026-09-11.md`。没有第十一次许可；以下精确范围及源码是本次历史执行依据，不可复用旧命令。

## 要验证的行为

可选引用标题现在允许以经过既有公共 HTTPS 校验的来源域名作为显示标签；新旧两条搜索计数路径均可读取。合法标题、原 URL、候选/来源/安全校验和费用规则保持原值。第九次原始响应不可取得，这两项合成复现不能证明第九次所有根因，也不保证本次实际成功。

完整通过要求真实 Summary 为 passed、Ready，候选合法、来源可信，完整 usage 与实际结算成功，owner 隔离、重复请求拦截、激活和规划生成、零 Repair、数据库最终销毁。仅 HTTP 200、stop、Provider accepted 或 Activity 有费用不算完整通过。

## 已授权的精确范围

- 固定模型 moonshotai/kimi-k3，reasoning low；输入 Data Product Manager / en-US。
- 最多一次 Key GET、一次 Research POST；不增加探测、Repair、自动重试或第二次 POST。
- 保留 strict JSON Schema、12000 max_tokens、最多2次搜索/10个结果及隐私限制；请求内容与上次一致。
- 本次预算上限 USD 5。用户本机隐藏输入新的、未使用、无周期重置且限额不超过 USD 5 的专用测试 Key；可命名 arc-v8-compat-once-20260911。助手不读取 Key，不写入代码/参数/环境文件/聊天。
- Provider 等待600秒，本地租约660秒，启动器总等待720秒。发生失败/超时先保留本次安全 Summary，不自动重跑。取消不能证明远端已经即时停止。
- 使用一次性本地 SQLite；不更改生产变量/Research旗标/D1/R2、云端日志设置、Sites版本或部署，也不暂存/提交/推送/合并 Git。
- 不读取原始模型正文，固定字段诊断只保留枚举和形状；旧真实 Summary 原字节保留。

## 执行与结果交接（已结束）

本次真实安全文件为 `summary-2026-09-11T08-21-04-984Z.json`，SHA256 `ef65367eaf429cd9318b4cbf23858eb0ed2471c26f893e1438178a91a1db26e1`。一次 Key GET + 一次 Research POST、零 Repair，owner/重复拦截/销毁通过。原 16:03 offline/passed/0 real requests 摘要只是前置离线证据。

不再交付本次命令或要求 Key。下一步为零付费请求契约调查和新本地设计审阅；本次执行不授权追加请求或线上启用。恢复入口以 `v8-resume-checkpoint.md` 顶部最新状态为准。

## 固定源码

权威 worktree：`C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta`；分支 `codex/v8-openrouter-research-beta`，HEAD `7090153b4acad7b12df6a7ee4d675b46c41871dc`。保留有意未提交成果，不能只用 HEAD 代表本候选。

| 文件 | SHA256 |
| --- | --- |
| app/server/research/provider.ts | 715baaa6eb31e062c6f9fb6098085e4656666c3cb7a42b359597acf6d50966cb |
| app/server/research/orchestrator.ts | b8756597029b7974bca228048bed1e73d2765845eee2b3edd99ce30fed447e97 |
| app/server/research/result-diagnostic.ts | f366336308489aa0cb2ce7ada83ae190feeff4735b45b939af566e799e33b4b1 |
| scripts/live-research/validation.ts | 9e98eaf087244b113532aacf2e09974bc891c56a8b8655d6acd5f104dab90fe9 |
| app/server/research/openrouter-provider.ts | a95271f918c57e12b3014f56e47e28cc53077e7b0efe1a516c5763864eca1c47 |
| app/server/research/local-validation-profile.json | 84b286701ac98a716255c5092d997bc153fa0f18152164416f7bc90af803b10d |
| scripts/live-research/run.ps1 | 74a553f87f7e5a4878e1032c58fba13ec0b0929c5a9cd291b9088fcf61343f64 |
| scripts/live-research/runner.mjs | 47305aa27df034bea1e669016bb8b2d83338425e4e67da476d050a2b4858a226 |

两项 TDD、规格后质量安全双审及最终独立整合审查均 READY，无实质P1/P2/P3；Root 16 文件771项、非增量类型、六文件lint、五阶段build和25项指纹检查通过。详见 `v8-response-compatibility-validation-2026-09-11.md`。
