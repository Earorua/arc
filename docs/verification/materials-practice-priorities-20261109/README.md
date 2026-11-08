# 2026-11-09 当前个人实践归因离线验收证据

**当前 Task 2／3 离线验收通过；用户要求本阶段保存后暂停。** 本档案不表示真实模型质量、Gate 1B 或公开发布通过。

197 份原始工件按原字节保存，另附本说明和 [verification.json](verification.json)。清单摘要 `54c2967dd15ca7394b027e4ca9dba5f48816cee2cab1243c09274da748bac372`；46 项通过的必要检查、3 份独立审阅／交接备忘录，以及全部 47 条本轮包装器运行结果均可复核。唯一非零退出的首轮 Node 超时记录保留，不计为通过。

| 核验入口 | 内容 |
| --- | --- |
| [本批报告](../2026-11-09-materials-practice-priorities.md) | 功能变化、测试结果、超时诊断和剩余范围 |
| [最终覆盖清单](experience-priority-full-coverage-20261109-results.json) | 377 文件／9,647 Vitest；最终 290 Node；5 页面；43 原生／Node 对照；3 UI |
| [最终来源身份](experience-priority-integrity-20261109-final-a-results.json) | 1,004 源码文件，26 份冻结参考，85 项课程依赖 |
| [作者冻结](experience-priority-author-20261109-resume-frozen-source.json) | 当前九文件与原断言／历史证据不变 |
| [独立规格审阅](experience-priority-spec-20261109-memo.md) | PASS，公开映射兼容、实际旧源码创建／重读 |
| [独立质量审阅](experience-priority-quality-20261109-memo.md) | PASS，38 条新增服务边界与维护性检查 |
| [最终交接审计](experience-priority-integrated-review-20261109.md) | PASS，核对原始结果、源码和报告边界；非重复产品测试 |
| [根任务命令记录](experience-priority-final-commands-20261109.md) | 具体命令、原工作树／副本用途、首轮与串行复核 |
| [首轮 Node 日志](experience-priority-full-node-20261109-a.log.txt) | 288 通过、2 取消，原 45／60 秒测试预算 |
| [原条件诊断](experience-priority-node-timeout-diagnosis-20261109-results.json) | 首轮事实与原测试／harness 字节核对，串行对照发起前的诊断状态 |
| [最终 Node 日志](experience-priority-full-node-20261109-b.log.txt) | 同源码、同阈值独占串行 290／290 通过 |

测试源码最后变更提交为 `41bcdd7a9110e67c4529468fc26dafb3cfc81ab5`，捕获和归档前 HEAD 为 `714ea9e54d87b91a1fee4883176d4f1dd06ecf63`。当前 1,004 文件摘要 `8ab545fbd75adeaa8274ac9c7b89d7a7bbd37085a473b748071f6d11a5042ecb`；副本与工作树匹配。本轮只复测和审阅已保存的修复，没有新改产品或测试。

较早的 471 份原始证据保留在[暂停档案](../materials-practice-priorities-pause-20261108/README.md)，本次清单再次校验其原字节。新工件的 `source` 字段仍指向原工作目录；日志使用 `.log.txt`，可执行源码附 `.source.txt`，文件内容不改写。恢复脚本时遵守原输出路径和固定来源校验，用新运行名，不能覆盖历史证据。文档中的原运行路径不是要求重新执行这些命令。

旧策略测试数据库留在本机忽略目录，未提交临时 D1/R2 二进制。本档案的原始观察保留真实创建／确认／预览／保存／重读数据，AI 投递是固定合成夹具，模型调用和费用均为 0。没有部署、远程迁移或 GitHub 推送。
