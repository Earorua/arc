# 离线产品观测包

本目录在冻结的独立参考之外保存真实产品组件观察、原生服务探针和差异解释。它不修改 `../materials-quality-v2/` 的标准答案或评分器，不提供 Gate 批准。

- `collect-projections.ts`：只接受合成构造输入的 JSON 文本，调用实际提取投影与 mapper；没有网络、数据库写入或模型调用入口。
- `collect-projections.test.ts`：输入边界、真实投影、过滤、空词、意图选项与命令行检查。
- `collector-protocol.md`：输入／输出、退出码、来源声明和缺失能力的解释。
- `evidence/`：运行日志、原始 JSON、独立备忘录与一次性探针脚本的逐字节副本。`.source.txt` 是归档源码，不参与产品构建；脚本保留原始路径，复现前按归档索引的 `originalPath` 还原。
- 完整结论与本批验证结果见[产品观测差距报告](../2026-11-07-materials-product-observation-gaps.md)。

合成词位置由来源标注独立生成，未向产品传入课程期望。255 个唯一位置与独立课程账目的 256 条关系不同：一个共享 facet 不重复计算。另有零候选文档与显式意图组件变体，不增加质量分母。

原始证据保留各自的换行字节；部分 Windows 失败日志和审阅 JSON 含 CRLF，因此对全部归档运行 Git 的空白检查会提示行尾空白。没有为消除提示而重写证据或修改 Git 配置。工具源码、协议与新说明的独立空白检查通过；归档以文件／暂存区字节摘要一致性核验为准。

采集器中的 `projected` 仅指生产函数返回投影，既不是用户确认，也不是计划采用。`learningIntentItemIds` 只是被调用组件的参数。缺少任务覆盖或规划观测时，候选评测始终不完整；不能把完整测试通过写成模型质量通过。

复现使用项目已有 Node 运行时和依赖，在本机恢复归档中的 `work/grounded-verification/run.mjs` 与 `work/materials-browser-handoff/block-outbound.cjs` 后运行。保留原记录，以新标签写下一次运行；不得复用旧标签覆盖日志。归档中的源脚本也需先恢复到其记录的 `originalPath`，不能直接从 `evidence/` 执行相对导入。

```powershell
node work/grounded-verification/run.mjs product-projections-replay-tests --import tsx --test docs/verification/materials-product-observations/collect-projections.test.ts
node work/grounded-verification/run.mjs product-projections-replay-collection --import tsx docs/verification/materials-product-observations/collect-projections.ts docs/verification/materials-product-observations/evidence/product-projection-synthetic-input-20261107.json
```

测试应退出 0。采集命令成功记录原生结果后仍退出 1，表示完整候选评测未完成；输入或实现异常退出 2。命令不会部署、执行远程迁移、连接供应商或创建付费推理。内存 SQLite 服务探针只应用本地测试 schema。
