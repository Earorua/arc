# Arc v8 第十五次：外层响应JSON失败

2026-09-12，第十五次已执行，单次许可已消耗。用户确认ExitCode1。完整真实Research及首版公开发布仍未完成；没有第十六次、Repair或重试许可。

## 实际回执

安全Summary：outputs/live-research/summary-2026-09-12T13-05-32-428Z.json，SHA256 1e94d2dfbf45b3ecf638e17b6c942c0cf6a9b9441911e7684ee7075818f66ceb。文件名时间为流程开始附近，不是完成时刻。Research开始于北京时间21:05:33.272。

同一PowerShell启动器19844及Node runner46120由只读查询确认运行；监视会话46491在21:10:44看到两个进程均消失并发现新Summary。监视器exit0仅表示监视正常结束；真实验证终端exit1来自用户回执。

| 项目 | 结果 |
| --- | --- |
| 请求数 | Key GET1、Research POST1，Repair0，无额外请求 |
| HTTP | Key200、Research200 |
| 固定候选 | Kimi K3 low、32768输出、v3/v2质量策略、20/21/22分钟 |
| 传输诊断 | outer-json / invalid-json，1100字节，bodyComplete=true |
| 时间 | 响应头121248ms，响应体读取结束303532ms，Research总耗时303534ms |
| 本地中止/原生异常 | localCancellation=none，nativeErrorKind=null |
| 流程 | incomplete / research-failed / runState failed |
| 后续阶段 | Provider结果、引用预检、候选、课程质量诊断均null，尚未进入这些检查 |
| 费用 | usage=null，charged=unknown；conservative-hold，上限5000000micros，settledMicros0 |
| 业务防护 | owner错误读取拒绝、第二次调用拒绝、临时数据库销毁均true；未激活或生成规划 |

费用未知。settledMicros0是本地未取得可信费用，不代表OpenRouter扣费0；5000000是预算保守占用上限，也不代表实际花费5美元。用户尚未提供本次Activity总费用和最终状态，不追加带Key的查询。

## 已支持与未支持的判断

当前适配器在reader.done=true和fatal UTF-8最后flush成功后才执行JSON.parse；outer-json/invalid-json只在该解析失败处记录。bodyComplete只证明当前HTTP响应流正常结束，不证明Provider完成了有效回答。

本次没有触发本地20分钟deadline、原生body/headers timeout、UTF-8错误或512KiB响应上限；不能因为303秒接近5分钟就认定是某个网关固定超时。也不能把null质量诊断解释为课程质量通过，或认定是v2质量规则造成失败。

OpenRouter官方说明，响应状态提交后发生的错误仍可能以HTTP200返回，非流式错误通常写在JSON响应体中。因此HTTP200不能证明生成成功；但一个正常的JSON错误对象本身不会解释本次JSON.parse失败。[Errors and Debugging](https://openrouter.ai/docs/api_reference/errors-and-debugging)

原始1100字节未保存或读取。HTML/SSE、空白响应、残缺JSON等仍是待区分的假设，不能据长度或时长断言具体正文、上游服务商、模型结束原因或费用。当前源码没有修改传输解析、请求模型、额度、生产配置或质量门槛。

## 证据与后续

证据目录outputs/local-fifteenth-transport-investigation-20260912。原108项候选全部保持一致，加新Summary共109项保护。第十四次质量失败记录及本地1529项/双审/build/默认离线成果保留，不因新增结果记录重复测试。

只读源码追踪和六个内存合成案例调查已完成，独立调查者为fifteenth_transport_investigation。合法候选（包含空白、Unicode及逐字节chunk）通过；填充至1100字节的合法JSON错误对象进入原结果/失败观察；1100字节的空白、HTML、SSE、残缺JSON均复现相同outer-json诊断，且结果/失败观察为0。每例一次注入fetch，禁止的全局fetch调用0；调查者没有写文件、运行完整测试或请求网络。报告保存为synthetic-investigation.json，并明确标注合成输入，不是真实正文重放。

这证明当前诊断不能区分这些格式，未证明此次实际正文属于哪一类，也未支持任何解析放宽或重试修复。既有源码/候选保持不变。

下一步可审阅设计为../superpowers/specs/2026-09-12-arc-v8-response-format-observation-design.md：在已有外层JSON失败之后，增加仅本地的固定Content-Type/正文前缀分类，不保存原始值，不改变请求/接受/费用规则。设计已自审及独立审查READY，待用户批准实施；它改善定位能力而非保证Provider修复。第十五次Activity最终状态和费用仍可补充，但不是该本地设计工作的前置要求。线上长任务与完整发布缺口继续单独保留。
