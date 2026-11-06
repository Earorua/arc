# B2 诊断小样本 P1 授权单

**单号 `B2-KIMI-20261106-P1`，待持有人批准。** 申请让新 Kimi 提取策略重新处理四份已在 R2 计费的合成资料。目的是以较低费用测出哪些事实可直接预填，哪些字段还需修复。[离线修复验收](../../verification/2026-11-06-materials-source-span-repair.md) · [R2 真实结果](../../verification/2026-11-06-materials-b2-r2-result.md)

| 次序 | 冻结合成资料 | 本次要验证的现象 |
| --- | --- | --- |
| 1 | `resume-01`，普通简历 | R2 三项事实中仅匹配一项。核对原文、技能词及自评提醒。 |
| 2 | `resume-08`，普通简历 | R2 用尽 4,096 输出 token 并被生产校验拒绝。验证精简输出和结束状态记录。 |
| 3 | `jd-01`，普通岗位 JD | 检查必须、优先分类及事实对应。 |
| 4 | `jd-11`，边界岗位 JD | 检查来源和预先标注的影响用户决定的核对项。 |

| 决策 | 仅限本次四份 |
| --- | --- |
| 发送内容 | 固定系统提示，以及该份材料的类型、带 ID 的原文分段。标准答案和评分器留在本地。每份源文本和完整请求体的 SHA-256 均已锁定。 |
| 端点和隐私 | 专用 `materials-b2` key，严格 ZDR、关闭供应商回退。chat 模型 `moonshotai/kimi-k3.1-pro`，generation 版本 `moonshotai/kimi-k3.1-pro-20261023`，仅 `moonshotai/mxfp4`、端点 UUID `a3fafaac-f097-4ef1-86b3-842854dad5c6`。上游隐式缓存最长期限未公布，须接受本轮四份合成材料的这一边界。 |
| 调用与时限 | 每份最多 1 次推理 POST、3 次只读回执 GET，合计最多 **4 POST、12 GET**。从明确批准起 2 小时内发起新推理。单笔模型 HTTP 最多 180 秒、查询最多 30 秒，整组套件最多 15 分钟。 |
| 价格与预算 | 11 月 6 日 10:34:55 UTC 复核公开目录。每百万输入/输出 token 2/10 USD，每份按 16,000/4,096 token 顶格预留 **0.072960 USD**，单笔上限 **0.075 USD**。四份合计顶格预留 **0.291840 USD**，本单硬上限 **0.30 USD**。R2 同四份实际共 0.100623 USD。新提示的费用按实际配对回执结算。 |
| 启动前 | 再读双方余额、严格 ZDR 指派、正文日志、训练、公开提示、追踪、缓存与 BYOK 设置。专用 key 可用额度和账户 Credits 均须覆盖 0.291840 USD。按当前项目累计 0.493065 USD 和 2.00 USD key 终身上限推算，理论剩余 1.506935 USD。 |
| 运行与停发 | 只允许已登记的本机工作树、冻结源码和逐份请求。持有人在自己的 PowerShell 隐藏输入已保存的 key。任一回执未核验、费用不明或额度、时间、写账校验失败即停发。已核验但质量落线的样例可继续收集本轮余项。 |
| 如何判定 | 四个唯一回执均核验、结算、评分且未决费用为零，记录为收集完成。三份普通样例可预填、一份边界通过、适用召回及 JD 分类 ≥90%、保留来源 100%，才记为本小样本质量通过。结果分别记录 `pilotCompleted` 和 `pilotQualityPassed`。正式 B2 的 `passed` 在此入口恒为 false。 |

批准范围到此结束。后续 24 份正式 B2、6 份补充资料、B4、真实用户资料、重新充值或提额、远程迁移和部署需分别决定。[公开端点价目](https://openrouter.ai/api/v1/models/moonshotai/kimi-k3.1-pro/endpoints) · [OpenRouter ZDR 缓存说明](https://openrouter.ai/docs/guides/features/zdr)

## 冻结记录

| 对象 | 值 |
| --- | --- |
| 产品提交 / tree | `ada498f5700be3d99b824f7d38fee35f8d88bbcc` / `591e0140cbd9892594c45cea7efc187c33018534` |
| 源码 bundle SHA-256 | `6cd51cca7516551c7bcba8ba3abef83c7268275e0a54c355eea87845e4dc2cf1` |
| 工作树文件清单 SHA-256 | `c17029df67392e8e4c6c12edb6b645c6b0c286078cf1cb669744c9bf532364fc` |
| 预检 SHA-256 | `121bf8d63bb73ebc78bf55f8e3cddb1a443b84e775f621ebd61ed95be41442a4` |
| 配置 / 语料 SHA-256 | `0d88cf478e6959c22c5cd22717f5f47b21a62d5b5e889b1a0273b3a41ddb5d93` / `69e5ddd1005f12abf24483e10dd235629ef309ba3a84e922166963ccd9aed750` |
| 本次 runId | `materials-b2-diagnostic-pilot-kimi-spans-p1` |

四份材料的逐一摘要和价格读回保存在[脱敏预检](../../verification/materials-gate-1b-b2/2026-11-06-p1-preflight.json)。主机须使用新授权生成专用登记。P1 的评分和账本独立保存，结束后封存并汇报。
