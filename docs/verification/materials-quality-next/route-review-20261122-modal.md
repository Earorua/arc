# Kimi 标准端点的自助核验和 Modal 候选

2026 年 11 月 22 日，北京时间。原 OpenRouter 工单保留历史往来，本次追问已撤回。端点资格可以由官方模型页、普通端点目录和严格零数据保留（ZDR）目录交叉核实。

## 实际处理方

| 检查项 | 原固定端点 | 拟用于合成验收的端点 |
| --- | --- | --- |
| OpenRouter 路由 | `moonshotai/mxfp4` | `modal/mxfp4` |
| 实际处理方 | Moonshot AI | Modal |
| 端点 UUID | `a3fafaac-f097-4ef1-86b3-842854dad5c6` | `42406f15-f64c-4bae-95b7-d03877cfff58` |
| 模型及规格 | Kimi K3.1 Pro，20261023，标准版 MXFP4 | 同一模型版本、标准版和量化规格 |
| 严格 ZDR 目录精确匹配数 | 0 | 1，排除 Safety Retention |
| 端点政策 `retainsPrompts` | `true` | `false` |
| 端点政策 `training`、`trainingOpenRouter`、`canPublish` | 均为 `false` | 均为 `false` |
| 每百万 token 输入／输出／缓存读取 | 2.00／10.00／0.20 美元 | 2.00／10.00／0.20 美元 |

15:15 重新获取完整目录。同一 Kimi 模型有 24 条严格 ZDR 路由。两个端点都按完整模型和 tag 精确匹配，模型页各自的端点记录与统计记录中的 UUID 一致。原端点的 UUID 也与项目 11 月 5 日取得的真实配对回执一致。因此现在就可以排除原端点。OpenRouter 同日公告移除了 125 个端点的 ZDR 资格，未指明这条路由变更的具体原因或恢复日期。[模型页](https://openrouter.ai/moonshotai/kimi-k3.1-pro) · [普通端点目录](https://openrouter.ai/api/v1/models/moonshotai/kimi-k3.1-pro/endpoints) · [ZDR 目录](https://openrouter.ai/api/v1/endpoints/zdr) · [平台公告](https://openrouter.ai/blog/announcements/data-processing-incidents-on-inference-providers/)

选择 Modal 是因为其 Model APIs 明确列出这个 Kimi 版本，说明推理由 Modal 承载，默认不存储输入输出，也不使用内容训练模型。Modal 说明会复用 KV 缓存。审阅到的公开资料未给出最长保留时间。OpenRouter 的在途筛查和法定保留例外仍需列入新的合成资料授权。本机工作区已确认 Modal 的自带密钥（BYOK）显示为未配置，强制 BYOK 的开关关闭。[Modal Model APIs 数据政策](https://modal.com/products/model-apis) · [Modal 模型及价格](https://modal.com/library/moonshot/kimi-k3-1-pro) · [OpenRouter ZDR 政策](https://openrouter.ai/docs/guides/features/zdr)

## 资料与费用范围

已从原冻结请求逐份生成新路由的**预期请求字节**。每份只替换 `provider.only`、`provider.order` 两处 tag，回填原 tag 后与原始请求逐字节相等。资料原文、系统提示、JSON 模式、禁用回退、拒绝收集、严格 ZDR 和价格上限都已核对。完整 30 个摘要和新配置摘要保存在本机，资格和授权字段保持未签发。两个端点属于不同处理方，首份真实回执仍须在新的实际运行中取得。

| 拟议范围 | 名额 | 保守计费预留 | 费用硬上限 |
| --- | ---: | ---: | ---: |
| 合成简历及 JD | 24 | 1.751040 美元 | 2.00 美元 |
| 合成补充资料 | 6 | 0.437760 美元 | 0.45 美元 |
| 合计 | 30 | 2.188800 美元 | 2.45 美元 |

每份最多一次推理、三次只读回执查询。单笔上限 0.075 美元，按 16,000 输入和 4,096 输出 token 全价预留 0.072960 美元。

## 首份回执和后续放行

为避免单独增加一次模型调用，拟把原语料中的第一份合成简历 `resume-01` 同时用于取得新端点的真实回执和后续质量评分。新授权需明确先只放行这一份，查对 chat 与 generation 的模型、唯一成功端点、用量及费用，保存回执和结算后才放行其余 23＋6 份。首份照计名额和费用，原始输出留作评分。回执或费用无法核实就停止，保留已知费用或未决预留，首份不重发。这是拟议的新分段授权，不能用旧授权启动。

现有回执审计器在本机模拟输入上接受匹配的 Modal 配对、拒绝错误 UUID，也拒绝把历史 Moonshot 配对算作 Modal 回执。原 v3 适配器拒绝直接把上游换成 Modal，实际传输函数调用为 0。专门重跑了串行执行的三项既有检查，覆盖费用冲突、错误上游、上一份完成回执和持久结算前禁止下一份发送，3/3 通过。[回执审计器](../../../worker/document-executor/generation-receipt.ts) · [串行执行及停止条件](../../../scripts/materials-qualification-runner.ts) · [对应测试](../../../tests/server/document-model-qualification-guards.test.ts)

下一步是在独立的候选配置中把接收方、tag、端点 UUID、费率和 30 个请求摘要绑定到实际执行入口。用离线传输检查首份匹配和首份失败两个分支，以及补充资料的独立授权。原提取及课程评分参考继续沿用。实际执行包就绪后，向持有人一次列明新处理方、分段范围、隐式缓存和法定例外、两组金额及两小时窗口。先前的 Moonshot 授权、真实用户资料及公开发布各按其自身范围处理。

## 恢复证据

本机目录为 `%USERPROFILE%/.arc-materials/gate-1b/materials-b2/quality-preflight/20261122/route-options-20261122T071554604Z/`。保存的原始公开页面与目录可按摘要复核。账户读数、浏览器登录信息和密钥均不随本记录发布。

| 文件 | SHA-256 |
| --- | --- |
| `route-comparison.json`，含七份公开来源和各自的原始摘要 | `d7261dd5af6ae2879fac24f0e62d746688a0edfbca231e93633ae599213e10fa` |
| `modal-request-review/review-manifest.json`，30 份预期请求 | `23e06d4f6d5724d43ee39974e8f9cf3ecf202227a9c172fc8538d132409479e7` |
| `receipt-contract-offline.json`，离线匹配及拒绝结果 | `d3d825717d8163c02876275e02af4c265c78f82c2bb40e153a5b2f09bd331c78` |
| `first-document-guards.vitest.json`，三项定向检查 | `36043ab3c76607039d992d46d3e92a8b79bb47dba101983b2127b375807c5be4` |
