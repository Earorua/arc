# 个人实践优先级接入与当前修复验收

2026-11-09，按用户要求恢复暂停点，仅做当前修复的离线复测、独立审阅和完整验证。

**结论：当前个人实践归因修复及 Task 2／3 离线验收通过。** 暂停点的最后修改已经复测，独立规格和质量审阅通过，全仓最终结果通过。本轮没有新增产品源码修改；这不是 Gate 1B 或公开发布通过。

用户要求当前阶段完成后暂停目标。本次验收归档和本地保存完成后即暂停，后续阶段须等待用户恢复。

## 本批实现

课程对应与个人实践分别判断。原文中的 SQL 即使出现在否定、他人经历或未来计划中，仍可保留课程对应；只有该来源词得到本人经历或技能陈述支持，才进入已有实践优先级。混合 React／SQL 事实逐词判断，不能相互借用主体或动作；人工选择不改变原文的主体、时间或肯定性。

行政调度、计划和进度／状态汇报不会因为提到 SQL 就变成技术实践。最新修复补齐 `status/progress reporting on/about/of SQL` 的对象头边界，同时保留实际协助 SQL 测试、修改和技术报表的正向判断。暂停时的两个 `about/of` 失败用例已在当前源码下通过。

新上下文使用规划策略 `2026.11.3`，映射策略保持 `2026.11.5`。公开映射字段、分组与顺序不变，旧保存预览继续原样读取。界面分别显示“已对应课程”的技能数和“参与当前排序”的技能数。用户自评、工时、目标、主 JD 和明确采用的学习重点规则保持原值。

## 来源与验证范围

- 分支：`codex/materials-replan-recovery-20261106`；捕获基点 `714ea9e54d87b91a1fee4883176d4f1dd06ecf63`。
- 产品源码提交：`41bcdd7a9110e67c4529468fc26dafb3cfc81ab5`。它在暂停时标为 WIP；本轮复测没有再修改产品源码或测试。
- 1,004 个非文档源码文件，清单摘要 `8ab545fbd75adeaa8274ac9c7b89d7a7bbd37085a473b748071f6d11a5042ecb`。
- 实际验证副本：`D:/CodexTemp/arc-experience-priority-P3jdvc/source`，来源与工作树逐文件匹配。普通 Vitest、串行组、类型、Lint、构建和页面检查在副本执行；Research 来源边界及含 Git 历史的附加 Node 在原工作树执行。
- 已读取本地和 GitHub master 的 `SOURCE_INDEX.md`，按资料开发路由恢复。网站主线的新界面没有在本轮整合或覆盖。
- 26 份冻结参考、85 项课程依赖保持原字节；历史 R2/P1 结论与候选评分器不改。

## 验证结果

各专项存在交叠，不累加为全仓测试总数。

| 验证 | 结果 |
| --- | --- |
| 暂停后当前经历谓词 | 259 项通过，保留原 RED 日志 |
| 作者集成／能力等级回归 | 14 文件 521 项／12 文件 1,467 项通过 |
| 独立规格审阅 | PASS；1,350 次公开映射逐值对照、38 个原探针、13 文件 408 项通过 |
| 独立质量审阅 | PASS；Critical 0、Important 0；5 文件 383 项，含 38 个新增真实服务边界用例 |
| 本地实际 HTTP/workerd/D1/R2 | 43 个场景通过，Node 完整结果逐项一致 |
| 实际组件／HTTP／保存预览 | 3 项通过；这是组件链路验证，不代替线上浏览器验收 |
| 真实旧策略持久化预览读取 | 当前策略 3 读取旧策略 2，原 preview 与数据库行完全保留 |
| 全仓 Vitest | 373 文件 9,498 项＋串行 2 文件 50 项＋Research 2 文件 99 项＝377 文件 9,647 项通过 |
| 附加 Node | 最终独占串行 290／290 通过，取消／跳过均为 0；首轮 288 通过、2 超时取消原样保留 |
| 全仓类型／Lint／构建 | 通过；Lint 0 错误、4 项既有警告 |
| 构建后页面 | 5 项通过 |
| 最终来源与覆盖核对 | 工作树和副本 1,004 文件一致；377 个 Vitest 文件在三个分组中各执行一次，无遗漏或交叠；26 份参考与 85 项课程依赖不变 |

4 项既有 Lint 警告位于 `research-completed-acknowledgement.test.ts`、`research-executor-runtime.test.ts`、`research-planning-integration.test.ts` 和 `research-service-binding-transport.test.ts`；规则和位置与上一完整验收一致。本批未调整这些测试。

## 首轮 Node 超时与受控复核

首轮 `experience-priority-full-node-20261109-a` 与普通 Vitest、Research 长验证并行。Node 汇总为 290 项中 288 通过、0 断言失败、2 取消；失败详情分别为：

- `research-public-recovery.test.mjs`：原 `60000ms` 测试上限取消，记录耗时约 61.97 秒。
- `research-recovery.test.mjs`：原 `45000ms` 测试上限取消，记录耗时约 48.39 秒。

首轮日志摘要 `2fc24d2e25069d580395af31e089b9df2e51ad46865a122b0f2f75b2e4488929`。已核对两测试和 `tests/offline-uat/server.mjs` 与最近完整验收源码 `113a9c5` 的原字节一致；所有 1,004 个当前源码也与暂停身份一致。这确认了取消来自测试框架的既有时间预算，不是哈希、行为断言或模型请求失败。并行负载是待用受控运行检验的原因假设，不凭首次日志断言具体资源瓶颈。

其他长验证全部结束后，用原九脚本命令、原 `--test-concurrency=1`、原 45／60 秒阈值另起 `experience-priority-full-node-20261109-b`，最终 **290／290 通过，0 失败、0 取消、0 跳过**。两处原超时用例分别约 41.93 秒、36.70 秒通过，最终日志摘要 `4cf095923c20e80475962a050c7eae1a0a6141113cf6d05b7157faffe638bfc0`。

没有放宽超时、删除断言、改来源基线或覆盖首轮日志。同源码、同阈值的独占运行通过，支持并行本地验证负载耗尽时间预算的解释；没有进一步声称定位到某个 CPU 或 I/O 瓶颈。最终完整覆盖核对已通过，首轮取消仍是独立保留的失败运行。后续复跑这些时间敏感的 Node 用例应与其他长验证分开。

## 证据与后续边界

197 份本轮原始工件已归档，清单包含 46 项通过检查、3 份审阅／交接备忘录及首轮未通过的 Node 运行。档案清单摘要 `54c2967dd15ca7394b027e4ca9dba5f48816cee2cab1243c09274da748bac372`；之前 471 份暂停工件的原字节再次核对一致。

- [证据索引](materials-practice-priorities-20261109/README.md)与[完整清单](materials-practice-priorities-20261109/verification.json)
- [最终文件覆盖与结果](materials-practice-priorities-20261109/experience-priority-full-coverage-20261109-results.json)
- [独立规格审阅](materials-practice-priorities-20261109/experience-priority-spec-20261109-memo.md)、[独立质量审阅](materials-practice-priorities-20261109/experience-priority-quality-20261109-memo.md)、[最终交接审计](materials-practice-priorities-20261109/experience-priority-integrated-review-20261109.md)
- [实际命令记录](materials-practice-priorities-20261109/experience-priority-final-commands-20261109.md)，包含原生、源副本、Research 和两轮附加 Node 的执行方式

作者、规格、质量和根任务所有命令使用已冻结的断网包装器，产品配置与真实凭据从子进程清除，网络限制在回环地址。原暂停档案保持原字节；本轮新结果独立保存，旧 RED 与首轮取消不改记为通过。

本轮模型调用 0、费用 0、部署 0、远程迁移 0、GitHub 推送 0。历史累计 30 次真实推理、0.547151 USD、未决 0；R2/P1 质量失败结论不变。

本批只验收当前个人实践归因接入。下一批版本化原词保留接入、真实自评采用入口、课程任务覆盖／新参考绑定和完整原生场景仍待继续；真实模型质量、B3/B4/B5、主线界面整合及公开发布未完成。没有启动下一批功能，旧付费授权不因恢复而续期。

恢复入口：[当前进度](2026-11-06-materials-grounding-pause.md)。
