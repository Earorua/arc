# 2026-11-08 个人实践优先级暂停档案

**PAUSED_UNVERIFIED：这是用户要求保存的未验收检查点。** 当前源码提交 `41bcdd7a9110e67c4529468fc26dafb3cfc81ab5`。最新 RED 为 2 失败／257 通过，随后的最小源码修改尚未复测。历史候选的通过结果不验证当前代码。

- [暂停报告与恢复顺序](../2026-11-08-materials-practice-priorities-pause.md)
- [工件清单](verification.json)：471 份原始文件；100 条有退出码的记录，其中 25 条非零结果保留。
- [当前 1,004 文件源码身份](experience-priority-pause-identity-20261108-results.json)：26 份冻结参考和 85 项课程依赖不变。
- [作者停止交接](experience-priority-author-20261108-quality-pause-handoff.md)：九文件摘要、原命令、未完成项和恢复顺序。
- [最新 RED 元数据](experience-priority-author-20261108-quality-complements-red-14.json)与[原始日志](experience-priority-author-20261108-quality-complements-red-14.log.txt)。
- [候选 C 规格复审](experience-priority-spec-20261108-recheck2-memo.md)与[质量失败备忘录](experience-priority-quality-20261108-memo.md)。

工件按原字节保存；日志使用 `.log.txt`，可执行源码附 `.source.txt`，便于代码库留存而不参与构建。原运行路径不改写，恢复时在原工作区忽略目录使用原文件或按 manifest 的 `source` 路径恢复副本；必须使用新运行名，不能覆盖历史证据。校验 SHA-256 说明内容身份，不表示测试通过。

临时 `experience-priority-history-store-*` D1/R2 二进制不归档，原创建脚本、原始行、旧到新读取证据均保留。档案包含准备但未执行的后续脚本，应以对应结果是否存在及其源码绑定判断，不能把脚本存在算作通过。

本轮没有模型调用、费用、部署、远程迁移或推送。Gate 和公开发布未完成。
