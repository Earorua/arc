# Arc 操作记录与历史索引

先阅读当前恢复检查点。旧记录中的“下一步”“待批准”“当前版本”和进程编号描述的是记录当时的状态，不覆盖较新的用户授权和检查点。

| 用途 | 入口 |
| --- | --- |
| 当前停点、已完成任务、恢复指令 | [v8 恢复检查点](v8-resume-checkpoint.md) |
| 已完成的正式迁移、公开 Research 与恢复说明 | [r206 发布记录](../../outputs/local-resource-access-20261027/public-cutover-r199/FINAL-r206.md) |
| 已完成的网站持久准入实现（历史） | [Task10 实施计划](../superpowers/plans/2026-09-15-arc-v8-site-durable-admission.md) |
| 已完成演练的历史计时修正 | [限定 preparation 缓存计划](../superpowers/plans/2026-10-24-task15-preparation-cache.md) |
| 新 Research 的学习资料来源要求 | [权威来源规则计划](../superpowers/plans/2026-10-24-research-source-authority.md)、[美国高校/公司优先](../superpowers/plans/2026-10-24-research-publisher-country-preference.md) |
| 后台执行器总体设计 | [后台执行器设计](../superpowers/specs/2026-09-14-arc-v8-durable-research-executor-design.md) |
| 本地实施的详细时间记录 | [后台执行器本地进度](v8-durable-executor-local-progress-2026-09-14.md) |
| 完整公开发布目标及历史 | [首版公开发布目标](v8-first-public-release-goal.md) |
| 本地证据、备份与按需还原 | [outputs 文件索引](../../outputs/README.md) |
| 本次历史文件清理 | [2026-09-15 清理记录](v8-history-cleanup-2026-09-15.md) |

## 关键历史记录

| 类别 | 记录 |
| --- | --- |
| 第十七次真实 Research 成功证据 | [单次成功结果](v8-seventeenth-success-result-2026-09-13.md) |
| 任务找回与成功配置迁移 | [任务找回验收](v8-research-recovery-validation-2026-09-13.md)、[配置迁移验收](v8-successful-policy-migration-validation-2026-09-13.md) |
| 三个时间点的源码备份 | [原生传输修复后](v8-local-source-backup-2026-09-13.md)、[任务找回后](v8-recovery-source-backup-2026-09-13.md)、[成功配置迁移后](v8-policy-source-backup-2026-09-14.md) |
| 线上执行方案和发布证据缺口 | [执行器选项](v8-online-executor-options-2026-09-14.md)、[发布数据审计](v8-release-data-evidence-2026-09-14.md) |
| 较早的完整恢复历史 | [Task3 前历史](archive/v8-resume-history-before-task3-completion-2026-09-14.md)、[Task10 最终验收前历史](archive/v8-task10-history-before-final-acceptance-2026-09-15.md) |

其余文件继续按日期和专题保存。`docs/superpowers/plans/` 与 `docs/superpowers/specs/` 中的计划、设计，以及操作记录引用的测试、审查和授权证据，仍有追溯用途。文件名和路径保持稳定，便于按原引用查找。

2026-09-15 已清理五个仅用于检查归档的展开目录；旧备份记录中的“还原目录”是历史执行位置。原压缩包、清单和验收结论保留，具体位置及还原方法见 outputs 索引。

`outputs/` 是被 Git 忽略的本地证据目录；上述本地证据链接只在保留该目录的工作区有效，不能据此声称已经完成 GitHub 备份。
