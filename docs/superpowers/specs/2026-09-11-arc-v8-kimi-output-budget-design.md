# Arc v8 Kimi 完整输出预算：本地候选设计

状态：用户已批准，并明确要求提高输出上限、质量与稳定完成优先。本地方案据此落实为32768输出、20/21/22分钟期限；保持USD5预算。无需重复询问同一实施许可，无第十三次付费许可或线上变更。

## 问题与目标

第十二次完整读取了 HTTP 200 响应，7 次搜索、216417 ms、USD 0.242346 已可信结算，但 finish_reason 为 length，未进入候选校验。证据和未知项见 `../../operations/v8-twelfth-length-result-2026-09-11.md`。本次针对完整课程输出预算压力，保留用户要求的结果质量及最多 10 次搜索/50 条结果。

成功标准仍是完整、可信、可规划的 Research；HTTP 200、更多 token 或费用结算本身不算通过。源码、离线合成结果不能证明远端能够生成合格课程。

## 方案比较

| 方案 | 收益 | 限制/代价 |
| --- | --- | --- |
| A：本地输出上限 32768，加完整简洁表达指令（推荐） | 针对已观察到的 length 留出更大输出余量；仍为一个 Research POST；保持现有验收、计费和隔离链路 | 用量/耗时可能增加；32k 是受限实验值，没有足够远端证据保证成功 |
| B：仍用 12000，只要求精简表达 | 增量较小，保留原上限 | 完整课程仍可能被截断；不能通过减少核心技能或空壳教学来省 token |
| C：研究来源/技能与教学单元分阶段生成 | 可为每阶段单独规划预算、检查中间成果，适合长期复杂课程 | 增加请求、阶段契约、来源延续、中间状态和恢复/结算设计；不属于已给的一次 POST 授权，需单独设计 |

推荐 A 是一次有边界的本地候选，不是无止境逐次翻倍。若后续另行获准的真实候选仍出现 length 或不能在既有资源边界完成，不再自动提高 token/期限或付费尝试；按新证据评估 C。其他 schema/引用/质量错误分别处理，不预先承诺 A 修复未观察到的错误。

## 固定策略与隔离

用户本次强调高质量规划和稳定跑通，token消耗不是首要约束。选32768而非无限输出：它是原12000的约2.73倍，给教学单元更多余量，同时保留既有字节/费用保护。配套把本地Provider等待延长到20分钟、租约21分钟、启动器22分钟，防止仍按旧10分钟截断较长的合法生成。此选择不保证远端连接或模型一定完成；更大上限也不是必须生成到上限。low不因输出余量变化改为高推理；它和教学质量不是同一个指标，质量仍由完整覆盖与校验判定。

[OpenRouter模型页](https://openrouter.ai/moonshotai/kimi-k3)于2026-09-11列出的模型容量高于本候选32768；具体路由接受参数及实际耗时仍需后续单次验证，不能把模型页吞吐中位数当作时延保证。保持USD5是沿用上次明确金额，用户优先质量不等于授权无限费用。

本地配置 `local-validation-profile.json` 升为八个明确字段：

- profileId：`kimi-low-output32k-v2`。
- model：`moonshotai/kimi-k3`；reasoningEffort：`low`。
- maxOutputTokens：`32768`；outputPolicyVersion：`kimi-complete-quality-v1`。
- researchTimeoutMs：1200000；activeTtlMs：1260000；launcherTimeoutMs：1320000。

配置仍为严格 JSON。PowerShell 对原始字节进行 UTF-8、恰好八对成员/重复与额外字段、固定值/类型和时序校验，在 Key 提示或启动子进程前拒绝错误。TypeScript 对已经解析的 import 校验严格八字段、固定值/类型和时序，在首次 Key GET 之前拒绝错误；不能用已解析对象检测原始重复成员或编码。直接 runner 仍先读取管道输入再加载 validation，不新增其原始 JSON 或读 Key 前校验流程。旧六字段配置不被默默解释成新版本，不新增用户输入参数、环境变量或任意输出上限开关。

只有 `createKimiLocalValidationProvider` 使用新输出上限和表达政策。共享执行函数通过私有、明确的本地策略取值；标准 Provider 保留原 Research 12000、Repair 8000、原提示/versions/请求结构与时限。不得因为标准 Provider 恰好使用 Kimi 模型而切换成本地模式。生产 factory、公共配置/旗标、契约、数据库迁移均不变。依赖仅允许下述本地传输所需的已安装Undici直接声明，不更新或下载包。

`maxOutputTokens` 同源用于本地请求、validation fingerprint 和安全 Summary 的 researchPolicy；outputPolicyVersion 同样进入 fingerprint、安全 researchPolicy 与本地执行描述。`kimi-complete-quality-v1` 只映射到下面已批准的静态提示政策，未知版本拒绝；不从文件、角色或 Provider 内容加载指令。共享 `RESEARCH_PROVIDER_VERSIONS` 不为这项本地变化整体升版。实际新增提示与固定版本配套测试，避免指纹仍声称旧 12000/旧提示。标准请求不要出现本地字段。LIVE_POLICY.timeoutMs同步新本地期限，避免入口声明仍为旧600秒。

PowerShell 的启动提示应显示新 profile、32k 输出上限及原请求/预算/时限范围；默认模式仍是离线、零真实请求，Key 仅由用户隐藏输入。既有最小 probe 模式参数和行为不随完整 Research 候选变化。

本地安全传输观察随20分钟期限同步：新本地执行产生 `transport-diagnostic-v2`，三个相对耗时字段允许0..1320000的有限整数或原条件下的null；仍按本地22分钟上限饱和。`projectTransportDiagnostic`继续接受旧v1，但v1仍仅允许0..720000；未知版本和越界均拒绝。字节上限、phase/reason/EOF/cancellation关系与无敏感字段契约不变，旧Summary不重写。标准Provider不启用该本地观察，不放宽标准时限。需要添加v1兼容、v2新边界及1200000真实虚拟时钟超时的RED/GREEN验证，不仅更改测试字面量。

## 本地连接时限协调补充

Root在Task1双审完成后确认：当前runner捕获的原生Node fetch在本机使用内置Undici7.24.4，未配置的headers/body等待默认300000ms，独立于上层20分钟AbortController。[官方Client说明](https://github.com/nodejs/undici/blob/main/docs/docs/api/Client.md)区分headers等待与相邻body块空闲等待；二者都不是总生成时长。4次127.0.0.1实验验证原生fetch使用每请求Agent选项后可延长这两个期限，0外部请求；这不是第十一次历史原因的确定证明。

为兑现本轮已批准的稳定完成要求，增加顺序Task3：只对本地execute-one中的准确Research POST使用独立Undici Agent，headersTimeout/bodyTimeout均取严格profile的1200000ms；上层AbortController继续提供总20分钟硬边界。Key GET继续使用原捕获的native fetch和现有30秒限制；offline、check-key、account和minimal-probe路径不创建此Agent。原global fetch拒绝、准确URL/方法/redirect门禁和GET1/POST1、零重试保持。

runner经既有Vite SSR模块加载器调用现有严格profile getter后才创建本地helper，不新增JSON解析器或runtime profile覆盖。helper只接受固定合法期限，保留原生fetch/Response/Headers组合；在动态import公开Undici前先访问原生Response以初始化原生dispatcher，防止Undici首次import改变尚未初始化的默认dispatcher。独立clean-process测试已证实这个顺序保持默认实例一致，零请求。生产代码不调用setGlobalDispatcher、不访问Node内部API。finally以有限清理期限独立销毁Agent并清理Vite，任何一项失败不能跳过另一项，处理晚到拒绝；输出仅固定安全错误。新helper不接收或保存Key。

该专用Research Agent为直接连接，Key GET仍保留原生默认路由；没有读取当前代理环境或改变代理设置。若后续使用场景必须保留已有自定义代理，此候选不能声称支持该要求，应单独设计明确路由；不自动尝试代理、地域或网络回退。

直接声明已经安装并锁定的Undici7.24.8为devDependency，同时同步lockfile根声明；不安装、不更新、删除或下载任何包，不将本地helper导入Worker。原计划保护runner与依赖的要求在这一明确范围内调整，其余保护不变；旧快照不覆盖。下一真实候选必须包括这项连接策略，并明确它不能保证远端不取消、不超时。

此补充经独立只读架构审查，方向可行；上述初始化顺序、只改POST、有限清理及直接路由说明为实施要求，需Task3行为测试及SPEC→QUALITY双审，不是已实现或真实通过。

## 完整且简洁的内容政策

在原完整同源契约提示基础上，仅给本地 Research 添加静态输出指令。静态指令放在 `OUTPUT_CONTRACT_JSON` 标记之前，标记后的内容继续是可整体解析、与 strict response_format 同源的纯 JSON schema：

1. 在输出最终 JSON 前规划所有七个必需区块，留足 unitTemplates、evidence 和所有引用闭合空间。
2. 使用简洁、具体、可执行的正文及短而合法且一致的 ID；资源只定义一次，通过现有 ID 引用；避免重复背景和填充段落。
3. 覆盖该角色必要的核心技能，不设置隐含技能数量上限，不因节省 token 丢弃来源、核心领域、步骤、练习、证明要求或 rubric，不使用空壳与通用占位内容。
4. 每个技能保持至少一个 learn、恰好一个 calibrate、一个 reinforce；教学上需要时允许额外 learn。时长、checkpoint、原子单元和引用关系沿用现有验证规则，不为减小输出强迫所有学习单元短于 60 分钟。
5. 返回完整 JSON；不能把部分包宣称完整，也不能以重新调用、续写或 Repair 自动补齐。

不改 schema、质量版本、来源可信度规则、候选内容 196608-byte 与外层响应 524288-byte 限制。32k token 不是字节数，不能证明任何语言/引用/推理输出都在字节上限内；越界仍拒绝。

## 请求、费用与失败

保持 non-stream、strict schema、require_parameters、data_collection deny、zdr；exa fast、每次最多 5 条、最多 10 次/总 50 条、每条 2000 字符。保留一次 Key GET + 一次 Research POST，Repair 0、无重试/模型回退；模型可在一次 POST 内运行多轮搜索。

仍为 USD 5 专用未使用限额 Key 和本地预留上限。新增 token 余量不是 USD 5 内完成的数学证明，也不是远端路由支持该值的证据；实际可信用量原值结算，未知费用仍保守持留。不得裁剪次数/费用使其“符合”预算，也不放宽预检来复用已计费 Key。

length 仍在候选校验前拒绝并保留实际模型与可信费用，不解析截断片段、自动补 JSON 或继续生成。其他错误、transport/result/candidate 有限诊断和 Summary 默认 null 语义保持。不得记录 Key、账户信息、原始正文或思维链。本地取消不保证远端即时停止或停止计费。

## 实施范围与验收

按用户既有子代理/TDD/每任务先规格后质量安全审查推进；用户已批准本轮本地实施：

1. 本地 profile、adapter 私有策略、完整简洁提示及运行器读取/提示同步；实际 PowerShell 离线校验覆盖旧/新字段、重复/额外/类型/UTF-8 错误的提前拒绝。先观察有意义的 RED，再实现。
2. validation fingerprint、Summary 与请求描述一致，增加有真实语义的离线集成覆盖：模拟 length+可信 usage 的结算/未激活/零 Repair；模拟完整多技能课程通过实际 adapter、SQLite、来源/质量校验、激活与规划。已有充分的 fixture 可以复用；不能把机械复制一个技能或只检查字符串当作角色覆盖的证明。
3. 验证本地 32768 与标准 Research 12000/Repair 8000 隔离，保持完整 strict schema/隐私/10次50条、1200/1260/1320 秒/byte cap/禁重试。涉及指纹的语义字段改变必须导致指纹变化，不仅断言新字面量存在。
4. Root 在最终候选上执行受影响回归、类型/lint、必要的 Sites 本地构建与产物核对；各任务规格和质量安全审查完成后再做整合审查。

不改 `app/contracts/research.ts`、package/registry/source validator、生产 factory、D1/R2、迁移或 Sites 配置。可能修改的文件是 local-validation-profile、openrouter-provider、transport-diagnostic、run.ps1、validation.ts，以及对应测试/本地记录；Task3另明确包括runner.mjs、新native-transport.mjs、package.json和package-lock.json根devDependency声明。实现发现需扩大范围时先更新具体方案，不能把旧付费许可解释成新调用授权。

本地验证完成后才准备可核对的真实执行候选与预算交接。第十二次许可已经消耗，本设计批准仅授权上述本地工作，不授权第十三次、生产、Git 暂存/提交/推送/合并、Sites 保存或部署。线上长任务/登录/恢复/发布门槛继续参照 `../../operations/v8-online-research-readiness.md` 和首版目标。

## 设计自审

已核对：问题证据与假设分开；未把 13572 completion 当作单轮可见 token；32k 无成功/耗时/费用保证；不降低角色覆盖；标准与本地隔离；配置/指纹/请求/Summary/终端一致；失败与收费不被改写；无新付费或发布许可。

独立 `twelfth_length_audit` 初审发现 1 个 P2、2 个 P3：原始 JSON/已解析 profile 的校验职责、报告生成字段数量、outputPolicyVersion 的回执来源。Root 对照源码修正，补充了静态提示位于 schema 标记之前的约束；复审为 READY，无剩余发现。此处是设计可审阅状态，不是已实施、本地验证或真实通过。Root 最终核对原 33 项冻结候选全部匹配，Summary 哈希/2155-byte 大小一致，仓库默认配置下 git diff --check 退出 0；没有为文档变更重复旧 860 项或 build。额外临时关闭 autocrlf 的检查把检查点历史 CRLF 行识别为尾部空白；保留原文件与仓库配置，用默认配置复核通过，未为此重写历史记录。
