# Arc v8 本地质量规则与有限诊断设计

日期：2026-09-12。状态：用户已明确回复“批准”，本地实施启动。实施计划为 `../plans/2026-09-12-arc-v8-quality-contract-diagnostics.md`；本轮许可覆盖代码、TDD、双审、本地构建和离线演练。第十四次单次真实验证已执行并消耗许可；本设计不授权第十五次请求。

自审与独立设计审查已完成。`fourteenth_quality_audit` 初审发现两项 P2（免费替代两层要求、语义阶段后失败的诊断保留）及一项 P3（挂起 Promise 的边界）；核对源码修订后，限定复核结论 READY，无剩余 finding。此结论仅表示设计可审阅，不代表代码已经实现、质量实测通过或新请求获准。

## 1. 问题与证据边界

第十四次取得 HTTP 200、正常 stop、可信 USD 0.151111 结算，耗时 122055 ms，5 次搜索。25 条引用预检兼容，正式候选结构通过，但课程质量返回 invalid-graph、invalid-registry、missing-core-authority，状态 needs-review，未激活或生成学习计划。

三个值是去重后的类别，不是三个具体错误。没有保留或读取真实候选正文，不能从摘要还原哪个技能、资源或单元出错。8 个技能条目、10 个审计来源、24 个单元也不能证明引用闭合或技能 ID 不重复。此次引用成功不证明第十三次引用问题已永久解决。

源码及 10 个离线合成案例证实：候选 JSON Schema 没有表达部分跨字段要求；请求文本对若干要求含糊或缺漏。例如资源双向链接、步骤 ID 在整个 registry 中唯一、所有类型单元按时长适用检查点规则。现有请求同时说 calibrate/reinforce 无检查点及不强迫单元低于 60 分钟；runtime 却对所有超过 60 分钟的单元要求检查点。这是已验证的契约表达差异，不是本次具体缺陷的证明。

证据见 `../../operations/v8-fourteenth-quality-result-2026-09-12.md`。完整发布目标仍包括真实 Research、线上长任务、登录、账户隔离、持久化/恢复及公开发布验收。

## 2. 方案比较与选择

| 方案 | 收益 | 局限 |
| --- | --- | --- |
| A：明确本地质量规则，并在原校验点记录有限错误类别（推荐） | 同时消除已知请求歧义、保留下一次失败的定位信息；沿用当前单次 Research 流程 | 不能保证模型一次满足全部规则，也不保存具体错误正文 |
| B：只增加质量诊断 | 行为变化最小 | 已知请求歧义仍在，可能再次付费才看到同类问题 |
| C：拆分来源/技能图与课程生成，分阶段验证与恢复 | 可逐段纠错和恢复，可能适合后续稳定性建设 | 改变调用数、预算、状态与持久执行机制，需要独立方案，不纳入本次局部修复 |

选择 A。本次保留既有质量门槛；不自动补资源链接、改来源等级、丢技能、缩课程、修正文或续写。若后续证据显示单次整体生成持续无法可靠完成，再评估 C，不能无限叠加提示并声称已解决架构问题。

## 3. 本地请求规则 v2

仅本地验证 profile 使用新的质量文本。标准 Research 和 Repair 的请求文本及字段须与改动前一致。明确拆分共享安全/输出约束和各自质量段，避免用字符串替换偷偷改写标准路径，也不能把旧的无检查点指令留在新本地请求中造成冲突。

新本地规则必须准确传达当前接受条件：

1. 保留七个候选区块、完整必要技能范围和真实教学内容；没有隐含技能数量上限。每个技能至少一个 learn、恰好一个 calibrate 和一个 reinforce；总模板数遵守现有每技能最多 8 个的 registry 限制。不能用重复空壳凑数。
2. 技能、资源、阶段、模板各自的 ID 唯一；所有步骤 ID 在整个 registry 中唯一，所有检查点 ID 也在整个 registry 中唯一。引用数组去重，目标存在；不要求不同实体类型共用一个全局 ID 命名空间。
3. 先修关系无环且端点存在；每个技能在阶段中出现且只出现一次。
4. 技能 resourceIds 与资源 skillIds 双向一致。单元主/替代资源存在并关联该单元技能；替代列表唯一且不含主资源。
5. 规范化 URL 不重复，使用已引用的公共 HTTPS 来源。evidence ID 和 skill/resource 对各自唯一；每条 evidence 的双方存在并满足双向关联。每个技能有有效 evidence；每个 core 技能至少一条有效 evidence 指向真实的 primary 或 institutional 来源。来源等级必须如实声明，不能为通过检查而升级。免费替代满足两层条件：技能 resourceIds 中存在 purpose=primary 且 cost=paid/mixed 的资源时，同一列表须含 purpose=alternative 且 cost=free 的资源；每个单元 primaryResourceId 指向 paid/mixed 资源时，该单元自己的 alternativeResourceIds 须含 cost=free 且关联该技能的资源。两层关联均遵守上述双向规则。
6. 单元分钟数等于步骤之和。所有 kind 使用同一时长规则：不超过 60 分钟无检查点；超过 60 分钟必须有检查点，每个检查点 30–60 分钟，覆盖完整、连续且按原顺序的步骤，所有步骤恰好一次；检查点分钟数等于所含步骤之和，检查点总和等于单元总和。calibrate/reinforce 仍各一个模板，但合法的长模板可以有检查点，不强迫所有单元压到 60 分钟以下。
7. completionCriteria 和 rubric 各自去重；保留具体目标、练习、证明要求及评分标准，遵守现有字段长度和数组边界。
8. 输出前静默核对上述关联、覆盖和分钟数，只返回完整候选 JSON；不要求暴露思维链，不添加自检字段。缺少真实证据时不得编造。

本地 profile 更新为 `kimi-low-output32k-v3`，outputPolicyVersion 为 `kimi-complete-quality-v2`。本地配置指纹必须随之变化；旧 profile 或混合版本不得继续获得新候选准入。JSON profile、TypeScript 校验、PowerShell 严格校验、native/launcher 检查与相关测试保持一致。标准 prompt/schema/quality/modelConfig 版本不借此变更。

模型 moonshotai/kimi-k3、low、32768 输出、最多 10 次搜索/50 条结果、USD 5 总预算、Provider/租约/启动器 20/21/22 分钟均不变。隐私策略、direct 传输、非流式请求、严格 JSON Schema、无 Repair/重试/续写/回退均不变。旧回执仍按历史记录解释，不能把新 profile 套在第十四次结果上。

## 4. 质量诊断边界与接入

新增独立本地模块 `app/server/research/quality-diagnostic.ts`，负责有限枚举、严格投影和观察者隔离。不要把该模块并入已有 Provider 响应预检；它观察的是正式课程语义校验。

在 `validateResearchCandidate` 中保留现有生成 blueprint/registry 的流程与全部判断。只复用当次已经执行的两次 schema safeParse、blueprint 验证、registry 验证及 evidence/reference 检查结果，在这些结果被汇总为宽泛质量类别之前收集有限信息。不得运行第二套影子验证器、修改规范化/来源审计、改变质量返回值或持久化内容。

函数新增可选的末尾观察选项，不破坏现有三参数调用者。orchestrator 的可选 `onQualityDiagnostic` 仅接到第一次正式 Research 的该验证调用；mechanicallyRepairable、Repair、cache replay、只读查询均不传观察者。标准生产 factory 不注入该观察者。仅本地 validation runner 接入并写入安全 Summary 的 nullable `researchQualityDiagnostic` 字段。

未完成语义阶段的前置失败（例如候选结构失败、来源审计失败、Provider 失败、前置取消或超时）使该字段为 null。完整运行上述语义检查时只观察一次，成功和拒绝均可观察。stage 为 `semantic-validation`，不表示最终 package schema、Ready、入库、计费或激活已通过。语义阶段完成后的 package schema 失败、receipt/current/saveValidation 失败、取消或租约失效保留已观察的阶段诊断，不改成 null，也不得把此前语义诊断当作最终成功证据。

## 5. 有限输出契约

诊断 version 固定为 `quality-diagnostic-v1`，stage 固定为 `semantic-validation`。包含以下固定字段；不增加真实内容样本或按实体展开的大数组。

| 字段 | 内容与上限 |
| --- | --- |
| blueprintSchema、registrySchema | 各为 accepted/rejected、issues、truncated；issues 是固定 scope/code 对，去重排序后至多 16 对 |
| blueprintIssueCodes | 当前 IntelligenceIssueCode 的 13 项显式白名单；唯一、排序，不输出 path/message |
| registryIssueCodes | 当前 RegistryIssueCode 的 10 项显式白名单；唯一、排序，不输出 path/message |
| evidenceIssueCodes | 下述 9 项显式白名单；唯一、排序，不输出 ID/URL |

evidence 枚举固定为 duplicate-resource-url、duplicate-stage-skill、duplicate-evidence-id、duplicate-evidence-pair、missing-edge-endpoint、invalid-evidence-link、missing-skill-evidence、missing-core-authority、missing-free-alternative。它们对应当前 helper 已有谓词。拆开原组合条件以作观察时，必须保持业务 issue 集合、返回值、其他校验执行与顺序等价；不添加新的接受条件。没有观察者时不得做额外诊断遍历。

schema issue scope 只按可信属性路径映射到固定类别，不输出自由格式路径：blueprint 允许 root、skill、resource、stage、unknown；registry 允许 root、track、template、alternative-resource-ids、step、checkpoint、checkpoint-step-ids、completion-criteria、rubric、unknown。嵌套类别优先，动态 ID、索引数值、未知键和值不能进入输出。未知路径归 unknown；不把模型字符串截断后当作路径。

schema issue code 只允许项目现有候选诊断的有限 Zod code 映射及 other，不输出 Zod message、received/input、未知 key 列表或异常文本。accepted 时 issues 为空且 truncated=false；truncated=true 仅表示去重后超过 16 对且保留 16 对。列表表示不同类别，不表示错误实体数；不新增可能被误读的错误总数。

整个对象 UTF-8 JSON 不超过 8192 字节。投影创建新的固定字段对象，校验枚举、排序/唯一性、容量和组合一致性；拒绝额外键、访问器、异常原型及危险序列化入口，不调用输入 getter/toJSON。任一不合法诊断投影为 null。不得复制候选、来源正文、引用 URL/标题、角色文本、证据说明、实体 ID、账户信息、Key、堆栈、Provider 原响应或任意自由文本。

观察者在语义阶段结果确定后接收与原数据脱离的有限对象；同步抛错、异步拒绝和返回永不 settled 的 Promise 均不能改变请求结果、费用、状态、时限或等待完成，不能出现未处理 rejection。观察者是受控本地依赖，本方案不承诺隔离同步无限循环，也不引入 worker。诊断构建/投影异常只丢弃诊断；绝不能吞掉原业务校验异常，或重复进行业务验证。关闭观察后保持 dormant，不增加诊断依赖的工作。

此 v1 不定位具体实体；invalid-checkpoint 仍可能代表多种分钟数或覆盖错误。若缺少更细粒度信息，必须承认未知，不能利用自由格式 message 或真实正文补齐。

## 6. 本地验证与审查

批准后编写分任务实施计划，继续已批准的子代理驱动、TDD、每任务 SPEC 后 QUALITY/安全审查，最后独立整合审查。

必要的行为证据：

- 先建立 RED：本地请求缺少精确规则/存在冲突；新的 profile 被旧准入拒绝；各质量类别当前无法被有限诊断区分。合成调查不是实现 RED。
- golden candidate 仍 Ready；合法长 calibrate/reinforce 通过既有分钟规则；关联、重复 ID、来源 authority 与检查点错误仍被原门槛拒绝。用前后结果对比证明没有放宽质量。
- 10 个已验证合成案例及剩余诊断枚举的针对性覆盖；特别覆盖原 OR 短路中同时存在多个重复问题、registry superRefine、超过上限与去重排序。不能只断言实现内部函数互相返回同样值。
- 捕获真实构造的 mock 请求，验证本地 v2 文本/严格 schema/参数及指纹；标准 Research 与 Repair 的完整请求相对冻结 before 数据保持不变。安全/injection/来源政策不能因文本拆分丢失。
- 未观察、观察成功、抛错、拒绝、挂起、污染输入、恶意路径/属性、容量、null 及重复调用边界；业务结果、审计、预算、owner、第二次拒绝、销毁状态均等价。
- 本地 Summary 对语义 accepted/rejected、前置失败 null、阶段完成后失败仍保留诊断的投影；旧 Summary/历史实测保留；不把质量诊断写入公开 API、D1、缓存或 ResearchPackage。
- Root 聚焦/相邻回归、类型检查、目标 lint、本地构建及产物核查、默认 PowerShell 零真实请求演练。已有 1341 项是前一候选证据，新候选完成后必须记录自己的新鲜结果。

最终冻结新候选及历史保护指纹，保存可恢复检查点；只有本地双审与整体验证通过后，才可准备具体的下一次真实验证交接。当前没有第十五次、Repair、重试、生产配置、迁移、Git 写入、Sites 候选保存或部署动作。

## 7. 批准后边界与完成定义

批准本设计仅允许上述本地代码、测试、文档和离线演练，沿用既有 worktree。实施成功表示本地请求精确表达质量规则、有限诊断接入且不改变接受条件；不等于真实规划成功或公开首版发布。

本地完成后，下一次真实验证仍须有明确的新单次许可。必须取得完整质量通过、Ready、可信结算、账户隔离、实际激活和计划生成的回执，才能推进线上长任务及发布链路。不得复用第十四次已消耗许可。
