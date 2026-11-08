# 个人经历证据库：验证归档

本目录绑定源码提交`d6aba60209a59313ef2309b2f7b29c395a6b9296`，只验收独立经历谓词及既有等级行为的保留。映射／排序生产接入和本版全仓验证在后续Task 2／3完成。

- [验收报告](../2026-11-08-materials-experience-evidence.md)
- [逐文件清单](verification.json)：232份原始证据、13项最终必要检查、2份最终独立审查；清单SHA-256为`9ba0f509640cb06ad69ffe5ed18208505551197f730fe6ed47150e11ed3fb9ce`。
- [最终作者交接](experience-evidence-author-20261108-quality-handoff.md)
- [最终规格复审](experience-evidence-spec-20261108-quoted-memo.md)
- [最终质量复审](experience-evidence-quality-20261108-recheck-memo.md)
- [Node／workerd结果](experience-evidence-root-native-20261108-quoted-c-results.json)
- [源码与冻结参考检查](experience-evidence-root-integrity-20261108-quoted-b-results.json)

所有证据按原字节复制；`.log`追加`.txt`，可执行脚本／配置源码追加`.source.txt`，原路径与归档路径的对应关系在清单中。初始红例、第一次规格失败、第一次质量失败、各轮源码冻结及中间通过结果均保留，不能把旧冻结的通过结果转记为最终版本。

最终结果为13套件1,647项，含180项新API测试；78项经历和81项原等级／提醒在Node与本地workerd一致。最终规格复审重新执行180项API及原65＋36项独立断言；最终质量复审执行180项API、原36项断言、8项工具引用对照和140次有界输入调用。重复执行不累加为用户场景数。

归档时对1,002个源码文件同时核对SHA-256和提交对象原字节，源码清单摘要`82da28614aa57e72ef02bcbc44978d4c366f065af918892605fdee80456d568f`。26份旧参考和85项课程依赖未改；新课程绑定未批准。最后一轮全仓检查属于前版`113a9c5`，本目录不声称全仓或发布验收通过。

断网包装器与拦截器亦有原字节副本。重新运行必须在原工作树用新输出标签和新结果路径，不能执行归档文件覆盖已有日志。模型、费用、部署、远程迁移和推送新增均为0。
