# 个人实践优先级接入：用户暂停检查点

2026-11-08 晚，按用户要求保存当前进度并停止后续开发。状态为 **PAUSED_UNVERIFIED**，不表示功能、Gate 或公开发布完成。

## 保存内容

- 分支：`codex/materials-replan-recovery-20261106`。
- WIP 源码：`41bcdd7a9110e67c4529468fc26dafb3cfc81ab5`，保存 9 项源码／测试变更。
- 最近已验收的经历库源码为 `d6aba60209a59313ef2309b2f7b29c395a6b9296`，证据提交为 `c788268b5dbb4e91480ce98738274dfd08a58155`。
- 本次暂停源码包含 1,004 个非文档文件，清单摘要 `8ab545fbd75adeaa8274ac9c7b89d7a7bbd37085a473b748071f6d11a5042ecb`。与经历库基线相比仅 7 项修改／2 项新增，无删除。
- 26 份冻结参考、85 项课程依赖和批准的设计文件均已核对原字节；该检查只确认身份与保存范围，不是功能测试。
- [暂停档案](materials-practice-priorities-pause-20261108/README.md)包含 471 份原始工件、100 条有退出码的运行记录，其中 25 条非零结果保留，不把历史失败改写为通过。
- [档案清单](materials-practice-priorities-pause-20261108/verification.json)摘要为 `1bc7445c8c19b33e6ec3e305affd788abcc186294caaebd2cfc6249317aae199`。

归档暂存第一次被 Windows Git 的长路径限制拒绝，随后的索引完整性检查因此失败；没有丢失或改名证据。改用单条命令的 `git -c core.longpaths=true add/commit` 后重新核对索引原字节，不更改全局 Git 配置。这是保存环境问题，不是产品测试或新的功能验收。

## 当前实现和未验收部分

WIP 将课程映射与个人实践证据分开：映射到课程的主题仍保留，只有逐词支持的个人经历或技能陈述进入实践集合。新上下文策略为 `2026.11.3`，映射策略仍为 `2026.11.5`；界面分别显示映射数量和排序数量，旧保存预览不重算。

候选 C 的规格复审通过，质量审查却复现了四种 `status/progress reporting on SQL` 行政汇报被错误计入 SQL 实践。原始纯探针 4/16 失败、服务 4/8 失败；此前通过的集成、原生、UI 和历史读取不能抵消该缺陷。on-only 中间修复通过了原探针；进一步补上同组 `about/of` 后出现下面的最新 RED：

| 最新状态 | 证据 |
| --- | --- |
| 最新测试 | `experience-priority-author-20261108-quality-complements-red-14` |
| 结果 | 2 失败、257 通过，共 259 项，退出码 1 |
| 日志摘要 | `a593575595b1b4f53a89ad2c44a358fa4022d4d4e2c52f836269ff0ef7fab6d0` |
| 两个反例 | `I assisted with status reporting about SQL.` / `I assisted with progress reporting of SQL.` |
| 随后源码变更 | 对象头边界由 `for\|to\|on` 补为 `for\|to\|about\|on\|of` |
| 当前经历源码摘要 | `12f25330b1719338eec736881d2a19dc8635dbd1c71fa997059dd9bfc21debec` |
| 当前 259 项测试文件摘要 | `0b8f4d54812dfeed46beb53fd18c10b45503b68f0b989bcf1926706ead60d520` |
| 最后修改后的验证 | **未执行 GREEN、未冻结、未独立复审** |

所有实施／审查代理均已停止，无本任务仍在运行的测试或会话。保存期间只做文件身份、日志和 Git 原字节核对，没有继续修复或运行产品测试。当前版本没有完成本批全仓验证。

## 用户恢复后执行顺序

1. 读取[作者暂停交接](materials-practice-priorities-pause-20261108/experience-priority-author-20261108-quality-pause-handoff.md)，核对九文件摘要和旧证据。交接摘要为 `a27481a8e34d113b81a158f9fd99f6c0bb40b3403fc36b8b3a1e2f500d488a77`。
2. 建立新的固定源码绑定。用新输出名运行当前 259 项 GREEN、原质量 16/8、原规格 16/6、技术 reporting 6/6；保留原断言和历史绑定，不能覆盖旧日志或跳过哈希检查。
3. 运行原有 14 文件集成、12 文件等级回归、类型和九文件 Lint；核对共享范围／等级模块、旧补充材料流程、旧测试前缀和已封存证据未变。完成新的候选冻结。
4. 依次完成独立规格复审和质量复审。通过后运行根任务已准备的 43 项原生观察（27＋16 独立临时库）、Node 对照、实际 UI 和旧 policy 2 持久化预览读取。当前这些最新配置只准备了脚本，尚未执行。
5. 为最终候选另建源码副本，按既有分组运行全仓 Vitest／附加 Node、类型、Lint、构建和页面检查。历史全仓结果不能算作当前通过；旧 Research 基线与断言不得绕过。
6. 正式归档当前批次后，才执行[下一批原词保留接入计划](../superpowers/plans/2026-11-08-materials-mention-projection.md)。实际自评采用、课程任务覆盖、新课程绑定及完整原生验收仍是后续事项。

所有 Node 运行继续使用 `node work/grounded-verification/run.mjs <新且唯一的运行名> <脚本或 Node 参数>`。该包装器清理真实配置并限制非回环网络；不要绕过。源码快照 A、候选 A/B/C 及 on-only 中间绑定只对应各自历史版本，不用于当前通过声明。

旧 policy 2 测试数据库留在本机忽略目录 `work/grounded-verification/experience-priority-history-store-20261108-vkUYIE`。档案保留创建输入、原始行和读取证据，不提交临时 D1/R2 二进制。恢复时若临时库缺失，必须使用原历史源码和原创建输入重新建立真实旧数据，不能用新源码拼造旧预览。

## 外部状态

本批新增模型调用 0、费用 0、部署 0、远程迁移 0、GitHub 推送 0。历史累计 30 次推理、0.547151 USD、未决 0；原 R2/P1 质量失败结论保持。旧付费授权已过期。后续真实模型验收及公开发布尚未完成，用户恢复不自动续期旧授权。

完整恢复入口：[多类型资料离线修复暂停点](2026-11-06-materials-grounding-pause.md)。
