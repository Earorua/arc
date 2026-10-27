# Arc v8 第八次 Kimi 实测：返回完成，候选结构未通过

状态：**已执行，未通过完整 Research 验收。** 用户于 2026-09-11 回复“已运行”，root 只读取新安全 Summary。第八次一次性许可已消耗，没有第九次、Repair 或重试许可。

## 实际证据

- 文件：`outputs/live-research/summary-2026-09-11T03-56-51-191Z.json`，1833 bytes。
- SHA256：`d7d7adabc53d6deeb43295ddbd0220fc4406ad42a6d98667f73086c788ad2f24`。原文件保持不变。
- 开始时间 UTC 2026-09-11 03:56:51.191（北京时间 11:56:51）；Research 196252 ms。
- mode live-one；outcome incomplete / reason research-failed；requested/actual model 均为 `moonshotai/kimi-k3`。
- Key GET 200、Research POST 200；共 2 个真实请求，其中 Research 1、Repair 0。
- Provider 结果 accepted；finishReasonState recognized、finishReason stop；failure diagnostic null。
- Provider usage 问题仅 `web-search-requests`；审计 rejected / invalid-result / charged true。
- 内部 run failed / invalid-result；内部质量 passed false，issueCodes 仅 invalid-schema，skill/source/unitCount 均 0。
- 原公开质量视图仍是空 issueCodes，不覆盖内部诊断；citation/skillCount 0、auditCount 1。
- usage null；reservation conservative-hold，maximumMicros 5000000、settledMicros 0。
- ownerWrongReadRejected、secondResearchRejected、databaseDisposed 均 true；freshAccountActivated、planningGenerated 均 false，planningUnitCount 0。
- 固定 low / 600000 Provider / 660000 lease / 720000 launcher 策略匹配。

`charged: true` 是保守审计分类，5 美元是本地保留上限，settled 0 是未能结算；三者都不是实际消费金额。当前不能声称本次免费或花费 5 美元。没有新增账户 Activity 费用证据。

## 已定位及尚不能断定的部分

本次鉴权、HTTP 返回及外层响应解析已成功，模型以 stop 结束；不是本地 600 秒超时或 length 截断。Provider accepted 只表示 wire 解析通过，不表示候选通过结构/来源/教学质量验收。

`openrouter-provider.ts` 返回原 content，并用 `candidateFromContent` 做结构解析；`orchestrator.ts` 对 `extractJson(content)` 再调用同一解析器。该解析器将 JSON 语法、对象规模限制和 Zod 结构失败都映射为 null；包验证器对 null 返回 invalid-schema，三个计数为 0。因此当前证据尚不能指出某个具体字段，也不能断言是模型忽略了 Schema。原正文未保存，数据库已销毁，不恢复或搜寻原始响应/Key。

本次 usage 校验只报告搜索次数字段问题：实际缺失、null、类型错误或超出本地 0..10 整数范围仍不可区分。其余 token/费用字段未报告校验问题，但原聚合为 null；不输出部分费用冒充结算依据，不把缺少次数自动当 0，也不以引用数或搜索结果数替代搜索调用次数。

2026-09-11 官方只读资料核对：

- [OpenRouter Structured Outputs](https://openrouter.ai/docs/guides/features/structured-outputs)：严格结构支持按 endpoint 区分，strict 的具体执行因服务商而异。当前请求已经设置 json_schema、strict 和 require_parameters；不能只凭这些参数宣称响应一定符合全部本地规则。
- [Web Search Server Tool](https://openrouter.ai/docs/guides/features/server-tools/web-search)：搜索次数位置为 usage.server_tool_use.web_search_requests。代码读取路径一致；搜索结果数量不是该次数。
- [API Reference](https://openrouter.ai/docs/api_reference/overview)：server_tool_use 及其计数是可选字段。文档可选不构成缺省值为 0 的完整收费证据；现有预算策略仍保守持留。

## 工作树与下一步

独立只读子代理完成现有 golden fixture 与同源 JSON Schema/Ajv 的合成对照（无源码/测试文件修改、零外网）：golden Ready，3 技能/6 来源/9 单元；缺 evidence、weeks 字符串、内层 JSON 语法错误都复现 invalid-schema/0/0/0。`role.name="A "` 在 JSON Schema minLength=2 下通过，而 Zod trim 后拒绝；61 个 astral emoji 按 Schema 码点长度通过，但 Zod UTF-16 长度 122 超过上限 120。它们只是已证明的边界差异，不是本次真实根因，也不构成放宽契约的理由。

后续本地草案为 `../superpowers/specs/2026-09-11-arc-v8-candidate-field-diagnostics-design.md`：在真正 extractJson 后的候选解析处报告固定阶段/白名单字段路径/问题码，并区分搜索计数字段形状；不保留原文、不改变接受/计费、不发新请求。当前只形成方案，尚未实施；需要用户审阅这一项新增范围。已通过异步问题询问用户 Activity 是否可见本次最终正文，暂不索要正文/Key。若可取得，优先离线重放；若不能，不据此自动实测。

用户随后询问“在哪里可以找到正文”。已按[官方 Input & Output Logging 文档](https://openrouter.ai/docs/guides/features/input-output-logging)纠正导航与前提：[Logs](https://openrouter.ai/logs) → 对应 generation → Completion；只有执行前已启用该功能且匹配记录策略的请求才有保存内容，现在开启不能补回本次。此前直接指引 Activity 查正文遗漏了这个前提；用户尚未确认是否可见。本轮不启用云端输入输出日志、不改变隐私配置。

候选字段诊断草案已完成 root 自审和独立只读设计审查，READY、无 P1/P2/P3；实现尚未批准或开始。两项只读子任务均已结束，不把等待用户审阅误作等待活任务。

后续状态：用户已批准该字段诊断设计，Task 1 按计划进入本地实施。用户又确认刚刚自行开启 Input & Output Logging，提示仅对未来新请求生效；本次没有保存的正文不能补回。Root 不再等待取得第八次正文，也不为记录正文重跑；用合成输入完成已批准诊断的 TDD/双审。此前“待批准/正文可否取得”是历史。

分支 `codex/v8-openrouter-research-beta`，HEAD `7090153b4acad7b12df6a7ee4d675b46c41871dc`。原 40 份未提交成果完整保留；Provider、诊断 helper、validation、profile、launcher、runner 六项指纹仍匹配第八次已授权候选。此前 566 项离线回归/类型/lint/build 和双审为已完成的本地证据，本次没有因失败而重跑无关测试或改写源码。

继续做无 Provider 的结构契约核对及最小后续方案：区分具体解析阶段和安全字段级失败，保留原校验/隐私/计费门槛。不能直接再运行本页对应命令，也不能通过启用 Repair、换模型、提高预算或放宽 Schema 来宣告成功。

首版完整公开发布目标恢复 active、尚未完成。线上仍以此前只读确认的 Research 关闭 v10 为基线；本轮没有生产凭据/旗标/D1/R2、Git 提交/推送/合并或 Sites 保存/部署。
