# 付费前发现的一项课程对应缺口

2026-11-19。状态：**已用一项离线软件样例复现，尚未修复**。没有使用真实模型输出、没有发出模型请求，也没有重复全仓或原生矩阵。

对固定 `resume-04` 原文 `I used SQL joins to reconcile trial and paid accounts, following review notes.`，手写一个保留 `SQL joins` 的合法候选，仅通过当前 v3 验证、实际逐词映射和任务覆盖函数：

| 环节 | 观察 |
| --- | --- |
| 验证投影 | 原词保留，未改写正文 |
| 实际课程对应 | `uncovered`、空 skillIds |
| 实际任务覆盖 | `none`，`unassessed-scope` |
| 已审独立参考 | `resume-04-field-2` 的同一原词应对应 SQL，任务覆盖为 `partial` |

这个结果定位在产品的有限课程对应/任务规则，不说明 Kimi 的质量。原九锚点切片的验收仍然只适用于当时声明的有限范围；不能将其扩大为全部冻结资料已经通过课程质量。

实际观察及七份原始工件已逐字节保存到 [course-gap-evidence/manifest.json](course-gap-evidence/manifest.json)，清单 SHA-256 为 `8cdc8de4c3cc4e9f6b637d04fd5f5e8b30970af92e3e5d4b76d4f99103e5e150`。归档前核对应用和 worker 与已验收提交 `a5d2fda` 未变。有效运行回执为 `kimi-quality-20261119-course-gap-02.json`，日志 SHA-256 为 `d997a16c057c61bd5dfb72a2f5cab4a39a136231abc85d89ce28d532621530fb`。单次有效诊断退出 1，外部请求为 0。首次诊断错误定位到参考的 field-1，读取不到 expected 而中止；原脚本副本、失败日志和修正后的 field-2 定位全部保留，不把首次失败算作产品证据。

后续先完成当前评分适配，分开保留无采用状态及明确标记的课程关系观察，再处理这项已证实的产品缺口。只修改有实际依据的有限课程关系，保留独立参考、阈值和历史证据；修复只执行受影响检查并评估原生证据的实际复用范围。不得因这个软件样例把 30 份真实 Kimi 结果标为通过或开始付费采集。
