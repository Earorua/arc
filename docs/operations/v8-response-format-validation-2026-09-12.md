# Arc v8 本地响应格式观察：实施记录

2026-09-12 当前：Task1与Task2已完成独立SPEC后QUALITY/安全审查。Root最终45文件1632项全部通过，非增量类型检查、10个修改TS文件lint、本地构建和默认离线终端演练退出0；最终独立集成QUALITY/安全审查PASS（LOCAL FINAL READY），最终交接已准备并核对。设计批准继续有效，没有第十六次真实请求、Repair/重试、Git写入或生产/Sites变更许可。

设计：../superpowers/specs/2026-09-12-arc-v8-response-format-observation-design.md。计划：../superpowers/plans/2026-09-12-arc-v8-response-format-observation.md。证据目录：outputs/local-response-format-20260912。

## 基线与修改范围

权威分支codex/v8-openrouter-research-beta，HEAD7090153b4acad7b12df6a7ee4d675b46c41871dc。实施前130项交接一致；本次恢复时166项暂停交接一致。所有已有未提交成果原地保留，未操作Git索引。

原109项保护保留在protected-before-hashes.json；最终只有6项预期已有文件变化，其他103项保持不变，包含validation.ts、第十五次真实安全Summary、profile、标准请求策略、生产factory、hosting和迁移。新增4个源/测试文件，最终113项在root-source-candidate-hashes.json。旧before快照、报告和交接清单均为各自时点证据，不覆盖为新候选。

## Task1：分类、v3投影、本地适配器

先以四种同为1100字节的合成响应得到真实RED，原因是原适配器缺少v3/responseFormat。实现后5文件161项通过；SPEC审查后仅增加13条边界覆盖，单文件58项通过，不把两次不同范围结果相加。非增量类型和定向lint退出0。SPEC PASS；暂停前QUALITY为INCOMPLETE，恢复后新的独立审查QUALITY/安全PASS，无待处理问题。证据task1-spec-review.json、task1-quality-resumed-review.json。

分类只在原外层JSON解析失败之后，从已有解码文本及Content-Type返回固定枚举；不修改正文、解析或请求，不保存正文、header原值、前缀、散列或异常原文。v3严格拒绝额外字段/getter/symbol/异常原型，旧v1/v2保持。分类及观察器失败不改变原业务错误、费用保留或清理。

## Task2：Summary、持久行为、请求字节

只新增tests/server/live-response-format.test.ts的15项测试，原validation.ts通用再投影直接复用。4文件103项通过，类型/lint退出0。独立SPEC和QUALITY/安全均PASS，证据task2-spec-review.json、task2-quality-review.json。

覆盖实际guarded transport与隔离SQLite、五种格式/矛盾情况、恶意嵌套对象的再次拒绝、getter不执行、观察器关闭/throw/reject/pending的业务Summary及公开返回和7个持久表等价、真实DB关闭、成功fixture和默认离线路径。Task2未修改运行时代码；初始执行/测试夹具/类型错误已单独记录，不冒充新的产品RED。

本地、标准Research及Repair的实际POST字节与独立修改前证据一致，观察器开关不改变请求。本地Synthetic Quality Contract Role/en-US为18038字节，SHA25605eb807e4e7ea1c035e34c9f9ad0005a9bbb06fd29f6f52def57a88575bcde57。标准Research15440字节，SHA256ca1086cc876a9d1edf3bac26ffea04e410139a4ea3baa37b2c5f72f49878f408；Repair7295字节，SHA2562fef124876e28a27b73b00e076307168f231fd40e68ff8f4708bc187ebb4f55d。标准类没有transport observer入口，其对照使用现有failure observer；不声称测试了不存在的入口。

## Root最终验证

- 初轮45文件1631通过、1失败：local deadline测试仍要求v2。独立复现确认仅版本差异，测试只改v3并显式断言responseFormat:null；原1200000ms、charged unknown、USD5保留、abort和zero-timer断言不变。该差异SPEC PASS，最终集成QUALITY审查亦PASS。
- 修正后45个精确计划文件1632/1632通过，0失败/待定/跳过，报告root-vitest-final.json；旧失败报告保留。非增量tsc和最终10个修改TS文件lint退出0。
- Sites portable/configured=false；项目脚本、依赖和生产配置未改。build-site.mjs退出0。Worker默认fetch静态导出已核对，本地native transport未进入Worker。38个client文件、15份迁移/元数据和hosting与源一致。完整dist共108文件（55个主要产物及53个额外server产物），见root-build-hashes.json；最初将55子集误当全量的清点失败如实记入root-build-inventory.json，构建未失败、未因此修改源码或重建。
- Worker2390052字节，SHA256ab2c06da1899cc31f9d743a34f431a0d8c78a3881eddda039c64f05e75e13e66。构建后113项源码指纹一致。
- 默认PowerShell命令无开关，只执行一次。新安全回执outputs/live-research/summary-2026-09-12T15-42-09-690Z.json，SHA256dc0b26ad208da9d99768dc6b268e1a404a050be1443ef01de209f1ed99b072e3，offline-dry-run/passed/Ready、realRequestCount0、Repair0、quality、activation、plan6、owner隔离、重复拒绝、DB销毁均通过。回执usage/cost来自合成fixture，不是真实费用。

最终独立集成QUALITY/安全审查PASS，结论LOCAL FINAL READY，无可行动问题。审查者独立核对113项源码、108项构建、最终45文件1632项报告和离线回执，未重复执行测试或改变源码。审查报告root-final-quality-review.json，SHA25690d80fa8451741b09ae6b36748c5cdf3598b212ef3b3312c06537e9537592d9d。最终交接清单final-handoff-hashes.json及其核对记录final-handoff-verification.json包含当前源码、构建、文档和安全证据；旧清单仅作为历史快照保留。

## 后续边界

新增诊断仅减少下一次同类失败的信息缺口；第十五次1100字节原正文未保存，实际上游根因仍未知，不能据此宣称API问题已修复。第十五次许可已消耗，Activity最终费用/状态可补充，但不阻碍本轮本地门槛。

第十六次方案见v8-response-format-live-validation-2026-09-12.md，须最终审查通过及新的单次许可。Kimi K3 low/32768、最多10搜索50结果、USD5、20/21/22分钟保持；不自动Repair、重试、换模型或追加请求。完整真实Research、线上长任务接入与公开发布仍待后续完成，目标保持active且不缩减。
