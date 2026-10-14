# Arc v8 第十一次真实 Research：传输结果调查

当前结论：**第十一次已执行，完整 Research 未通过；Key 预检成功，根因尚未确定。** 用户本机的一次 Key GET 和一次 Research POST 均记录 HTTP 200；Research 在 303101 ms 后失败为 invalid-transport / charged unknown。未取得完整可用候选、可信 usage 或学习计划。USD 5 是保守预留，实际消费未知。

第十一次许可已消耗，没有第十二次、Repair 或自动重试许可。本轮后续只有只读源码审计、公开官方文档查询、合成本机 loopback 对照与文档保存；未追加 Provider 请求，未读取 Key/env/原始响应，未操作生产、Git 写入或 Sites。

## 原始安全证据

- 安全 Summary：`outputs/live-research/summary-2026-09-11T10-08-39-632Z.json`，1541 bytes。
- SHA256：`1E953105FEF331377340252D4FB88169B970147DCBE5E2ADFC72A728C3640666`。
- 开始时间 2026-09-11T10:08:39.632Z，即北京时间 18:08:39.632；文件写入约 18:13:43。
- mode live-one；outcome incomplete；reason research-failed；runState failed；failureCategory invalid-result。
- requestedModel moonshotai/kimi-k3；actualModel null。Key HTTP 200 / complete / 1069 ms；Research HTTP 200 / 303101 ms。
- researchAttemptDiagnostic：failed / invalid-transport / charged unknown；researchRunDiagnostic：invalid-transport / quality null。
- researchFailureDiagnostic、providerResultDiagnostic、researchCandidateDiagnostic、usage 均 null。
- quality.passed false，issueCount 0；citationCount/skillCount/planningUnitCount 均 0。没有诊断 issue 不表示质量通过。
- realRequestCount 2、researchRequestCount 1、repairRequestCount 0、auditCount 1。
- reservation conservative-hold / maximumMicros 5000000 / settledMicros 0。不能把上限当支出，也不能把 settled 0 当免费。
- ownerWrongReadRejected / secondResearchRejected / databaseDisposed 均 true；freshAccountActivated / planningGenerated 均 false。
- profile kimi-low-bounded-v1：low / Provider 600000 ms / active TTL 660000 ms / launcher 720000 ms。

此次候选是 research-prompt-v2 / research-model-config-v2 / 最多 10 次搜索、50 条结果。28 项原候选/保护 SHA256 均再次匹配；未改写第十次在旧 2 次策略下的 schema-rejected 历史结果。完整指纹见 `outputs/local-request-contract-20260911/eleventh-candidate-hashes.json`；本次另存 29 项保护清单，增加第十一次 Summary，不覆盖原清单。

## 错误路径审计

独立只读代理 `eleventh_transport_audit` 实际核对 adapter、transport、validation、orchestrator、诊断投影及既有测试；Root 独立进行本机对照。没有使用失败耗时直接推断修复参数。

| 路径 | 当前应用映射 | 与本次核心签名的关系 |
| --- | --- | --- |
| Content-Length 格式错误或超过 524288 | invalid-transport / unknown | 相容 |
| response.body 缺失 | invalid-transport / unknown | 应用分支相容；真实 native HTTP 200 下的可达性未证明 |
| UTF-8 解码失败、正文实际超过 524288 bytes | invalid-transport / unknown | 相容 |
| 正常 EOF 后外层 JSON 解析失败 | invalid-transport / unknown | 相容，包括空内容、非 JSON、截断 JSON |
| 外层 JSON 为 null、数组或标量 | invalid-transport / unknown | 相容 |
| 原生 reader.read 异常，如 body timeout 或断流 | unavailable / unknown；应用 controller 已 abort 时为 timeout | 不直接解释本次 invalid-transport |
| 应用 600 秒 deadline | timeout / unknown | 不解释本次错误码与 303 秒耗时 |
| 已解析对象的内容/结束原因/引用校验失败 | 通常有 result diagnostic | 需额外发生诊断投影或回调失败才可能仍全 null |
| orchestrator 在 Provider 返回后再拒绝 | charged true | 不符合本次 unknown |

关键源码：`app/server/research/openrouter-provider.ts` 的 executeOpenRouter/readResponse；`scripts/live-research/transport.ts` 仅在拿到 Response 时记录 HTTP 状态，未证明正文读完。诊断回调和投影有保护性吞错，因此 null 不能绝对证明程序从未解析到对象。actualModel null 也可能表示模型投影不匹配。

既有 `live-result-diagnostics.test.ts` 的 Response.json([]) 已覆盖本次主要签名；`provider-result-diagnostic.test.ts` 也覆盖坏 JSON/数组不发 observation。独立代理本轮只读测试，没有冒称重跑通过。

## 本机对照结果

证据与脚本位于 ignored `outputs/local-eleventh-transport-20260911/loopback-evidence.json` 和 `loopback-probe.mjs`。Root 本轮实际执行一次，exit 0，约 3.71 秒；不是再次运行真实启动器。

运行时 Node v24.14.1、内置 Undici 7.24.4；只读检查内置源码确认默认 body/headers timeout 为 300000 ms。官方 [Undici Client 文档](https://github.com/nodejs/undici/blob/main/docs/docs/api/Client.md) 将 bodyTimeout 描述为正文块之间的间隔限制，而非固定整轮总时长。仅凭 303 秒接近这一值，不能认定其为本次根因。

实验使用已安装的 Undici Agent 7.24.8，将 loopback bodyTimeout 缩短到 150 ms，不改变应用候选。6 次合成 HTTP 200 请求全部限定到临时 127.0.0.1 origin 和固定路径；应用 global fetch 被拒绝，native fetch 只接收经过 allowlist 的 loopback URL，不转发 Authorization。离线 Vite 禁用 config/env 加载。清理限定到已验证的临时缓存前缀，所有服务器/Agent/Vite 句柄已关闭。

| 合成场景 | 实际观察 |
| --- | --- |
| 原生正文停顿 | cause.code UND_ERR_BODY_TIMEOUT |
| 同类停顿进入实际 Kimi adapter | unavailable / unknown，约 1032 ms |
| 正常 EOF 的截断 JSON | invalid-transport / unknown |
| 合法 JSON null 外层 | invalid-transport / unknown |
| 非法 UTF-8 | invalid-transport / unknown |
| 524289 bytes 正文 | invalid-transport / unknown |

五个 adapter 场景均只有一次请求、actualModel/usage/resultDiagnostic/failureDiagnostic null。它们区分了应用错误映射，**没有复现或识别第十一次远端实际内容与耗时根因**。externalRequests:0 是脚本摘要，非独立 socket 遥测；源码的固定 loopback 路径经独立审计支持本机限定结论。

## Activity 补证与界面说明

用户回复能看到主请求 ID，但找不到主行，只有四条子请求，随后已提供全部四条；只提取下列诊断字段，不保存或转述其附带的账户、Key 标识/哈希或 workspace 元数据。四条 parent_generation_id 和 request_id 相同，模型均为 moonshotai/kimi-k3-20260715，provider DigitalOcean，记录的上游 HTTP 状态均为 200。以下是用户提供的 Activity 数据，未通过账户 API 独立拉取。

| 子记录 | created_at（UTC） | generation_time | finish / native finish | cancelled | usage（USD） | 原生 completion / reasoning tokens | 搜索 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 10:08:49.677 | 4700 ms | tool_calls / tool_calls | false | 0.00807725 | 109 / 12 | num_search_results null |
| 2 | 10:08:55.600 | 6986 ms | tool_calls / tool_calls | false | 0.0209971 | 151 / 48 | Exa；num_search_results 10；usage_web 0.014 |
| 3 | 10:09:03.940 | 7385 ms | tool_calls / tool_calls | false | 0.02191504 | 151 / 47 | Exa；num_search_results 10；usage_web 0.014 |
| 4 | 10:09:12.131 | 307248 ms | null / null | true | 0.17144425 | 10555 / 1966 | Exa；num_search_results 10；usage_web 0.014 |

这些记录证明关联流程已经进行模型推理并执行搜索。前三条均以 tool_calls 结束，第四条长时间生成后记录取消，没有任何一条是最终答案 stop 的回执。第四条10555输出/1966推理tokens不支持把本次归因于旧的纯推理占满输出预算；其native finish为null而非length，也不能断言触达token上限。子记录的结果条数不等于整轮搜索次数。客户端 stream:false 与内部子推理 streamed:true 属于不同层级，并不单独证明客户端收到 SSE。

四条usage按原数值算术小计为USD0.22243364，其中第四条USD0.17144425。这只是已提供子记录的小计，不是经确认的整轮总费或可信成功usage；不据此改写原Summary、释放保守预留或启用规划。主行缺失的原因仍未知；现在已有足够局部证据继续本地设计，无待补Activity问题，不再要求主行、正文、完整JSON或额外请求。

独立取消传播复核确认两类可相容顺序：

1. header声明超限会调用body.cancel；实际正文超限/chunk UTF-8失败会先invalid-transport，再在!complete的finally调用controller.abort和reader.cancel。远端cancelled可能是本地拒收后的结果。
2. reader.done先将complete置true；随后UTF-8 flush/JSON/外层形状失败不会触发同一finally取消。上游/中间层先结束响应、客户端再拒绝内容，也与当前证据相容。

Summary的timestamp在初始化时产生，Research计时另起，中间有Key1069ms和未单列的初始化间隔。第四条created_at+generation_time的算术值是10:14:19.379Z，不能当成精确取消时间，也不能与本机Summary直接相减断言谁先取消。当前没有失败阶段、EOF、已读字节、取消发起动作或对应时刻，根因仍未确定；原生timeout与应用deadline的映射差异结论保留。

官方 [Web tools 介绍](https://openrouter.ai/blog/agentic-web-tools/) 说明一次客户端请求可触发多次服务端搜索；[Server tools 日志示例](https://openrouter.ai/blog/announcements/shell-tool/) 展示 Logs generation 详情中的模型/工具时间线，后者是 shell 示例，不能据此保证本次 web-search 主请求必有独立行或 Parent 链接。

用户可以从 Logs → Generations 打开此次 Kimi 记录，查看详情是否有时间线/父请求链接；没有则停止强求主行。子记录的最小结束状态/耗时/费用仍可用于关联调查，但单条子记录不能替代整轮耗时、总费用或 Ready 结果。查不到父记录不阻塞离线工作，不要求用户读取正文、提供账户完整 JSON、改变日志设置或重新运行。助手此前将 parent_generation_id 为空的主行作为必找项过于确定，现已修正。

## 下一步与恢复边界

1. 先保留本次失败与第十一次许可消耗状态；本次不能判定 API 整体修复或完整发布成功。
2. 四条同次Activity已纳入，后续不重复索取日志。局部记录证明推理/搜索及第四轮取消，但不能恢复未取得的完整响应或确认总费用。
3. 本地安全传输观测设计已写成 `../superpowers/specs/2026-09-11-arc-v8-transport-observation-design.md`：有限阶段/原因、已读字节、EOF、相对计时、本地主动取消和白名单native原因，保留原行为。Root自审与独立复核READY；guard失因、正文终止时刻、实际取消API三项问题已关闭。用户审阅批准后按TDD、规格后质量/安全审查实施；本轮只有设计，未改应用行为。设计不是已完成的根因修复，也不附带第十二次许可。
4. 广泛搜索依赖长时间单次非流式响应的架构风险仍待处理。不要靠盲目加长 timeout、增大正文限额或放松 schema 连续付费试错；线上长任务方案必须另有设计和验收。
5. 10 次搜索/50 结果、完整契约、质量、USD 5、未知费用保守预留和关闭线上 Research 保持。任何新付费试验需独立具体许可，本轮没有第十二次许可。

完整持续目标仍 active 且未完成。此次仅新增本机调查证据及运维记录；前轮 Root 773 项、最后受影响 57 项、类型/lint/build 和双审是既有候选证据，本轮未无谓重跑或相加计数。权威分支与 HEAD 保留，既有未提交成果全部保留。
