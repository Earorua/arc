# 离线收尾证据入口

状态：`MATERIALS_OFFLINE_CLOSEOUT_ACCEPTED`。范围仅为编号引用、有限中文指导实践、既有能力建议采用／持久化核验及重新填写状态修复；不是 Gate 1B、真实模型质量或公开发布通过。

- 最终源码：`2fad2850e447dd353c8d7a9587f114f60ce3dd01`。
- 1,014 文件源码清单：`49323efc6738ecf9df2a5505d791d163559912ae053ce034714b87c622273765`。
- [归档清单](verification.json)：364 份原始工件、42 项通过检查、9 份独立审阅；清单 SHA-256 为 `ca245019631e49d5352085b4dc8aaf9ec112b783051eb913042f8a8e4a9aa9bc`。工件数量不含本 README 和清单自身。
- [最终覆盖](offline-closeout-coverage-20261109-a-results.json)：384 文件／10,009 项 Vitest、290 项附加 Node、5 项页面全部通过；类型／构建通过，Lint 保留 4 条既有警告。
- [最终源码完整性](offline-closeout-integrity-20261109-final-a-results.json)：工作树、副本和提交原始字节一致；26 份参考、85 项课程依赖及上一批 459 份工件不变。
- [最终独立集成审阅](offline-closeout-integration-review-20261109-final-memo.md)及[结构化结果](offline-closeout-integration-review-20261109-final-own-results.json)：PASS，无本批待修问题。

## 如何读取

`numbered-statements-*` 保存边界库及实际 provider／site／核对持久化修复；`guided-practice-*` 保存中文动作范围修复；`adoption-persistence-*` 保存实际采用链路、重置 RED／GREEN 与审阅；`offline-closeout-*` 保存最终 17＋25 项原生／Node 完整对照、历史兼容、全仓检查及归档准备。

全部原始失败、中间候选、诊断夹具问题和通过结果原样保留，不把较早的 GREEN 当作最终源码验收。归档输入首轮因两份审阅采用 `pass-scope-only` 状态名称停止；修正只对这两个明确文件要求原始精确值，并继续要求全部审阅无 findings。原始状态、限定范围和失败脚本都保留。

代码和命令文件以 `.source.txt` 保存，原日志以 `.log.txt` 保存，JSON／Markdown 保持原始字节。`verification.json` 逐项记录原路径、归档路径、大小及摘要。普通源码、报告与本证据不包含密钥、真实用户资料、依赖目录、构建缓存或本地数据库；历史数据库保留在本机，不能重建后冒充先前保存的记录。

17 项新场景与 25 项旧场景使用合成提供方回复及本地 workerd/D1/R2；Node 比较完整公开结果、来源和持久状态。旧 170 项行为、6 份记录及 8 张表均完整对照。采用测试的文档传输为合成夹具，实际上下文／规划服务与 D1 保存重读是真实执行；不把它等同于完整 14 场景规划协议或真实 Kimi 质量验收。

归档清单产生于本地提交与 GitHub 推送之前，所以其中的 GitHub 状态明确为待随后保存。最终保存回执及恢复入口另行记录实际远端 SHA。此次无新增业务模型调用、费用、部署或远程迁移。

[本批报告与剩余步骤](../2026-11-09-materials-offline-closeout.md) · [当前恢复入口](../2026-11-06-materials-grounding-pause.md) · [前一批证据](../materials-mention-projection-20261109/README.md)
