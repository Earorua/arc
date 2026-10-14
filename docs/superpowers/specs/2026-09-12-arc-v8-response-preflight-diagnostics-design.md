# Arc v8 本地响应预检诊断设计

状态：2026-09-12，用户已批准，两个实施任务均已完成SPEC后QUALITY双审，Root最终本地验证通过，独立最终整合审查FINAL READY。设计审查记录在文末，实际实施证据以实施记录为准。批准范围仅为本地观察功能及离线验证，不包含新付费调用或部署。

## 问题与目标

第十三次32k真实Research以stop结束，185257ms、USD0.134539可信结算，但annotations-invalid拒绝。现有诊断把至少十种可区分的引用失败合并为一个值，且在引用失败时没有课程JSON结构信息。缺少实际原始响应，不能确定具体兼容修复。

目标是在下一份本地候选中同时收集有限的引用契约错误类别和候选结构检查结果，定位独立问题，减少付费试错。所有观察必须保持现有返回结果、收费、来源安全和课程质量要求。它不恢复第十三次正文、不自动修复模型输出，也不承诺下一次真实结果通过。

用户既有偏好足够明确：完整、高质量规划和稳定跑通优先；保留10次搜索/50结果、USD5、32768输出及20/21/22分钟，不需要再次询问这些选择。本功能没有视觉问题。

## 方案比较

| 方案 | 收益 | 限制与决定 |
| --- | --- | --- |
| A：有限引用诊断+独立候选结构预检 | 一次完整响应可同时发现引用和JSON结构问题；纯离线可覆盖全部分支 | 推荐；仍需精确安全证据才可提出兼容修复 |
| B：立即容忍更多标题/扁平引用或丢弃坏项 | 可能越过当前拒绝点 | 实际格式未知，会改变来源接受策略；本轮不采用 |
| C：立即拆分搜索、技能和教学内容生成 | 有助于未来按阶段验收和恢复 | 涉及调用/预算/持久执行重新设计；本次已stop，不足以把大型重构作为当前引用问题的解法 |

## 范围与接入点

新增本地专用响应预检模块及可选观察回调，只由`createKimiLocalValidationProvider`暴露并由本地`runValidation`启用。标准Provider、Repair、生产工厂与其他脚本模式不启用观察。模块没有网络、文件、日志或数据库能力，不新增依赖。

仅在HTTP200、无上游错误、恰好一个choice、finish_reason为stop、content为非空且不超过现有196608字节时，执行一次预检。接入位于现有annotations接受检查之前。非完整响应、length、错误/过大content、传输失败时不尝试解析部分正文，预检字段保持null。预检不绕过原usage/计费策略；其存在不证明用量有效。

观察不改变原本的fail-fast接受流程，不能把预检产生的候选交给业务流水线。成功业务路径仍按现有位置进行权威解析与来源/安全/质量检查；允许本地观察导致一次额外的有界结构解析，不通过缓存预检候选改变生产流程。

## 安全Summary字段

新增独立字段`researchResponsePreflightDiagnostic`，未执行时为null；执行时为严格白名单对象：

- `version`：固定`response-preflight-v1`。
- `stage`：固定`complete-content-preflight`。
- `annotations`：以下有限引用诊断，无法安全构建时为null。
- `candidateSchema`：复用现有ResearchCandidateDiagnostic的有限投影，无法安全构建时为null。

`candidateSchema.outcome:accepted`只表示候选结构检查通过。它不等于Provider接受、来源安全、课程质量、Ready或规划通过。原`researchCandidateDiagnostic`只由实际业务解析阶段赋值，引用拒绝时仍为null；禁止以预检覆盖它。

新增投影函数须复制自身拥有的数据字段、严格枚举/有限数值/固定键校验，不通过getter、toJSON或对象字符串化提取数据，不保存异常message/stack。反射或投影失败时安全返回null；不声称能在检查Proxy时阻止所有Proxy trap。接入不读取响应中的非必要字段，不复制原对象。

整个预检字段序列化后上限8192字节；意外超限返回null，而非截断字符串制造有效记录。没有URL、hostname、标题、正文、搜索词、任意外来键、账户、Key、请求ID、原始对象或原始错误信息。与现有本地安全Summary保存位置保持一致，不增加原始响应缓存或重放文件。

## 引用诊断

固定字段：`state`为`compatible`或`incompatible`；`container`为`missing/null/array/other`；`count`为0..257或null，其中257仅表示至少257；`recognizedCount`与`ignoredCount`为0..256或null；`issues`最多16条；`truncated`为布尔值。

每条issue仅含`index`（null或0..255）与固定`code`。按index（null在先）再按固定code顺序排序、去重、保留前16项；仅确有更多不同问题才置truncated。扫描至多256项，不能遇到首个坏项就停止观察。超过256的数组只记录容器问题，停止所有子项遍历，计数为257、recognized/ignored为null。

允许code：`container-not-array`、`annotation-count-limit`、`citation-object-missing`、`citation-object-invalid`、`flat-citation-unsupported`、`url-missing`、`url-null`、`url-not-string`、`url-blank`、`url-too-long`、`title-null`、`title-not-string`、`title-blank`、`title-too-long`、`fallback-url-policy`。

具体规则：

1. 缺失/null容器沿用兼容空数组，计数均0；未知type或非对象条目沿用忽略，不能因此宣称适配器拒绝。
2. 识别到url_citation而嵌套citation缺失时，仅检查已知的外层url/title数据字段来区分扁平形状或缺失。嵌套非普通对象归invalid，避免枚举外来键；这一项不重复报告缺失的子字段。
3. 有普通嵌套对象时，URL和已提供title可分别记录问题，从而一次观察两种独立失败。对字符串使用与现有Zod契约一致的trim/min/max规则；URL1..2048、title1..500按既有字符串长度语义，不能误用UTF8字节长度或新阈值。
4. 只有title为undefined且URL字符串通过时，调用现有`canonicalizePublicCitationUrl`验证hostname回退；失败只输出fallback-url-policy，不暴露URL或细分敏感值。已提供null/blank/过长title仍拒绝，不能转为fallback。
5. 已提供合格title时，不把URL公共HTTPS策略提前作为适配器不兼容原因；该安全判断仍在原来源审计。compatible仅指现有适配器引用归一化契约，空数组/忽略项也不保证后续来源覆盖。

复用现有schema与canonicalizer，不新增URL接受策略。实现应保持原权威检查位置与规则，通过成对行为测试证明观察开/关的返回或错误、可信审计完全相同；如内部小型共享检查能避免漂移，必须证明输出与fail-fast顺序等价，不能趁此重构整个适配器。

## 候选结构预检

调用现有`candidateFromContent(content, observer)`，使用其相同的JSON解析、25000节点/12深度/8192字符串/4096数组/64对象字段限制和`researchCandidateSchema`。复用现有`projectValidationCandidateDiagnostic`，保持最多16个可信schema路径、有限code和truncated；禁止另写较弱的JSON-only解析或将外来字段名混入路径。

仅收集这次调用的诊断，丢弃返回候选。引用观察失败不得阻止结构预检，结构预检失败不得覆盖引用观察。两者分别隔离异常；外层投影失败可使整个字段为null。语义安全、引用覆盖及教学质量依赖权威流水线，本轮不做副本式“影子质量验收”。

## 非干扰和边界

观察回调同步throw、异步reject或永不完成都不能改变Provider结果、可信费用、超时、取消、数据库销毁或退出；不等待回调完成、不将观察失败映射为业务失败。一次Research最多发一次预检观察，返回新的安全对象，禁止跨请求复用旧状态。

请求体、模型、profile/fingerprint、输出及搜索限额、隐私路由、传输/租约/启动器期限不变。旧diagnostic版本和已有Summary字段含义保持；新增观察版本不冒充Provider参数版本。不改契约、source-audit、package-validator、orchestrator状态机、计费或数据库迁移。

## 离线验收与实施拆分

批准后写实施计划，继续子代理驱动/TDD，每任务先规格后质量/安全审查；两任务顺序执行。

1. 本地观察模块与适配器接入：先以10种已确认合成失败、双字段/多条错误、容器0/256/257、未知type、缺失/null/合法title、合法/非法content取得诊断RED；补字符串与输出边界、外来键/URL/title/正文canary、getter/toJSON、回调异常/悬挂及单次观察。成对断言观察开/关的原接受/拒绝、audit/charged、调用次数完全相同。标准/Repair观察不启用、请求体保持。实现并双审。
2. 本地Summary接入：RED覆盖引用坏+结构好、引用坏+结构坏、引用好+结构坏和完整合成成功；检查新的双诊断与原业务诊断分离，真实服务路径拒绝时仍收费settled、未Ready/激活/规划、临时DB销毁；成功fixture仍完整Ready/质量/规划。投影拒绝不可信对象，旧模式字段null，隐私canary和版本兼容明确。实现并双审。

Root随后运行受影响回归、非增量类型/lint、本地构建与产物核对、默认零真实请求PowerShell演练、最终独立整合审查，冻结增量候选及全部旧真实Summary。无需重复未变历史阶段测试来冒充新证据；具体测试范围由实施计划结合接入决定。

本地诊断通过只代表观察可靠；后续任何兼容修复须有区分性证据与明确契约映射。新真实候选须单独给出一次请求和预算方案取得许可；第十三次许可已消耗，不因本设计批准而发第十四次。生产Research、Git写入、Sites候选保存或部署不在范围内。

## 设计审查记录

Root自审：需求与用户质量偏好一致；实际根因保持未知；不接受无证据的兼容变化；预检与权威验收明确分离；全部观察有界、不持久化正文；无新付费/生产/Git许可推断。

独立根因及书面设计审查`thirteenth_annotation_audit`已确认SPEC READY，无P1/P2/P3：既有校验等价性、独立结构预检与接受/质量区分、隐私边界、有界观察、离线交叉验收及权限明确。审查者没有重核Root的53/54项哈希、14组合成实验或官方网页，相关证据仍归Root实际核对。设计审查时尚未实施；用户批准后的实际实现、修订和验证以实施计划及 `../../operations/v8-response-preflight-validation-2026-09-12.md` 为准。
