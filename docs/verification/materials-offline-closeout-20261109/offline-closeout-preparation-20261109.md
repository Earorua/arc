# 离线收尾准备记录

起点：源码 2107109，上一批归档提交 1f65e4a；范围见 docs/superpowers/plans/2026-11-09-materials-offline-closeout.md。

新 16 项完整 workerd/D1/R2 链路使用实际 HttpDocumentAnalysisProvider 配合合成 fetch、真实 client/HTTP/runtime/ReviewService。原 25 项链路另保留并在最终源码重跑。当前 RED-c：10 项失败（9 个编号、1 个自然中文等级），6 个控制通过；不是 Kimi 质量结果。

RED-a 夹具错误：把规范英文 data cleaning 当成中文 wire 原词，以及把旧谓词未支持的 practiced/with a mentor 当作已支持的个人实践。原 cases/driver 另存 red-a*.source.txt；RED-b 修正原词后仍保留 practiced 的错误优先级预期，原 cases 另存。RED-c 采用已验证的 tested SQL under supervision 以及清洗数据原词；产品谓词与课程没有因此变化。flagship 本来没有 data-cleaning 课程 ID，中文例的映射/实践优先级预期是空，能力提示仍可独立核对。

旧兼容、历史和 25 项原生驱动的副本只改新输出路径，不改旧 entry、cases、worker、历史数据库或已存结果。快照脚本尚未执行，需待最终源码冻结。所有 Node 仍通过原 wrapper，未修改凭据/出站隔离规则。

边界规格审阅的 raw exit1 保留；两项失败属于根任务计划文档的预期并行更新，不是三文件冻结源码变化。审阅单独给出作用域明确的 PASS，不把原 probe 改写为通过。

此准备记录不是最终验收。新模型调用、费用、远程迁移、部署为 0；GitHub 保存只在最终验收和本地提交后执行。

编号阶段中间原生 numbered-a 的 16 例中 15 例通过，仅自然中文指导提示失败；整个运行仍为 exit 1。该次 worker、driver、cases 均保存 numbered-a*.source.txt。编号源码经过两阶段审阅并保存后，最终夹具增加第 17 项“１. 我在指导下清洗数据。”，用于验证两个修复在同一事实上的组合；旧 16 项结果不被改写为 17 项通过。

编号实际链路另发现夹具来源应使用保存后的规范文本：创建接口按既有契约将 CRLF 规范为 LF。新 16 项 worker 在创建后读取实际文档，再将该文本及其范围交给合成 provider；emoji 例明确期望保存后的 LF 文本，来源坐标以该实际版本为准。纯 provider／边界测试仍独立检查原始 CRLF 的 UTF-16 坐标。未修改产品规范化规则；此前 red-c worker、cases 和 driver 均另存，以免把修正后的测试来源冒充原始失败来源。最终拒绝例另明确要求 verified 回执且 extractionRead=invalid-source，不能靠其他故障得到通过。

最终归档输入校验首轮 `offline-closeout-archive-inputs-20261109-a` 因状态字段格式假设失败：重置规格与质量两份原始结果使用 `pass-scope-only`，其余七份使用 `PASS`。九份均无 findings，两个重置备忘录明确为本任务范围通过且独立 5 项复跑通过。原结果未改；首轮脚本、退出 1 和日志已保留。新脚本仅为这两个明确文件要求其原始精确状态，同时逐份要求 findings 为空，并在最终索引保留 reportedStatus 和任务范围；不接受任意状态或扩大验收结论。使用新标签 b 重跑归档输入检查，此工具修正没有修改产品源码或任何测试结论。

