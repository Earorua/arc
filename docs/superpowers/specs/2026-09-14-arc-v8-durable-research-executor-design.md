# Arc v8：独立后台 Research 执行设计

2026-09-14，待审阅草案，尚未批准或实施。目标是让 Research 在网站快速返回任务状态后，由独立后台继续运行；刷新、关闭页面和丢失首次响应不触发第二次模型调用。本设计承接已完成的任务找回和成功配置迁移，完整公开发布目标保持不变。

本次申请范围是下述本地实现、合成故障演练及既有顺序子代理/TDD/SPEC后QUALITY流程。实际账户、服务创建/收费、秘密配置、生产DB迁移、Sites/Git写入与发布、真实第十八次请求都不在此次本地批准范围内。账户准备情况仍待用户回复；设计以可使用独立Cloudflare账户为部署假设，不视作该账户已存在。

## 选择与部署边界

采用“现有Sites网站 + 独立Cloudflare Worker/Workflow执行器”：网站继续负责登录、owner、准入、学习/Proof和主数据库；独立服务负责持久任务、一次性Provider执行及受保护结果交接。网页地址不因这一设计改变，本机不作为线上服务器。

相比整站迁移，这条路径避免同时迁移OAuth/学习数据/公开域名。相比同步HTTP或响应流，它把模型执行生命期移出浏览器连接。仅让Workflow调用现有长时间POST不满足本设计：网站现有Worker仍会承担模型等待，必须真正拆开准入、执行与结果入库。

Cloudflare HTTP依赖连接，waitUntil只延长最多30秒；Queue/Cron/DO alarm每次15分钟不能直接容纳20分钟请求。[Workers limits](https://developers.cloudflare.com/workers/platform/limits/) Workflow step墙钟不设固定上限，但有CPU和配置期限，且不能部署到Workers for Platforms namespace；本站现有Sites接口未证实可直接声明其绑定，故独立服务作为明确部署对象。[Workflows limits](https://developers.cloudflare.com/workflows/reference/limits/)

部署建议评估Workers Paid：当前基础订阅为每月USD5，另有超出包含额度的用量费用；免费档10ms CPU上限不能未经实测就保证适合此处理链。[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) Workflows还按步骤和存储计量，等待网络不耗CPU。[Workflows pricing](https://developers.cloudflare.com/workflows/reference/pricing/) 这与OpenRouter每次Research的USD5预算是两项不同费用。账户计划、服务成本预算和配置方式须在实际部署方案中确认；本地实现不购买或升级套餐。

## 固定策略与兼容

- Provider请求保持`kimi-low-output32k-v3`、`moonshotai/kimi-k3`、low、32768、complete-quality-v2、10搜索/每次5条/总50条、隐私要求及既有schema/质量/字节边界。Research完整headers/body期限1200000ms，执行活动租约1260000ms，Repair0；不自动重试Provider。
- **本设计新增的时间语义：** 仅新远端模式先允许最多120000ms排队；取得begin授权时一次性开始1260000ms执行租约，所以新任务允许活动窗口最多23分钟，故障对账可以发生在之后。20分钟Provider预算不减少，已开始执行不续租；当前同步模式、历史run期限与本地1320000ms launcher全部不改。这项新增排队时间须随本设计批准，不能当作既有批准内容。
- 增加显式服务端执行选择`ARC_AI_RESEARCH_EXECUTOR=cloudflare-workflow-v1`。缺省保持当前同步路径及原指纹，未知/空白执行选择拒绝新任务。远端模式只允许上述完整Kimi档。
- 远端模式在原稳定配置指纹中增加执行协议版本、120000ms排队期限和一次性执行租约语义；保持Provider线上请求内容一致。端点、Key或签名秘密不进入指纹。老记录仍按存储的模式/身份读回；跨指纹Retry继续拒绝，不能把旧任务隐式改为远端执行。既有配置fingerprint仅作缓存/配置身份，不作认证；交接使用SHA256和HMAC。
- 网站远端模式不要求或读取OpenRouter Key；只有执行器服务端配置该Key。抽取无凭据的公共策略校验，远端分支另行要求固定HTTPS执行器地址与桥接认证配置。原同步分支的Key/开关/模型/预算校验不得放宽，不能用伪造Key让旧解析器通过。
- recover/get不因新调用开关关闭而失去本地历史读取。无执行器连接配置时返回可证明的已有状态，保守处理到期；不创建任务、不发Provider请求、不虚构远端失败或成功。

## 数据与信任边界

网站D1保留唯一owner及现有run/mutation、quota、budget、audit、package/plan关系。执行器不获得Sites DB/R2绑定或其管理凭据，不接收用户姓名、邮箱、OAuth token、session、Proof或学习进度。

交接仅包含协议版本、不可猜测jobId、不可变执行身份、规范化role/locale、配置指纹/执行策略身份、原始排队到期时间。role使用现行NFKC/空白归一后的rawRole，不用小写缓存键。执行绝对到期时间由begin的签名回执冻结。对外身份不作为用户授权；浏览器始终通过当前session查询网站。模型与执行器URL均不能由浏览器或模型正文选择。

执行器自有D1保存job身份、规范化请求哈希、dispatch标记、状态、可信usage/安全错误及结果引用；独立私有R2保存有界的规范化Provider回执。原始HTTP响应/headers/Key不持久化，候选正文不记录到日志或公开状态。回执仅保留content、annotations、actualModel、usage或安全失败分类；不接受远端提供的“已通过质量”结论。

桥接请求体上限4096字节；结果信封上限1048576字节，且content仍不得超过196608、annotations最多256，继续按现行字段schema和原Provider响应524288字节上限接收。结果信封的额外空间用于转义及身份字段，不放大模型响应或课程容量。签名验证前也限制实际流式读取字节；不用仅信任Content-Length。

非正文单项响应最多4096字节；outbox响应最多10项、16384字节。回调请求只带job/receipt哈希等有界通知，网站通过固定执行器地址的受认证result入口取正文，不能按通知中的任意URL抓取。所有桥接读流均有期限和超限取消；不向浏览器返回私有对象地址。

网站到执行器、执行器到网站使用各自独立的服务端HMAC秘密。签名覆盖协议、方向、HTTP方法、固定路径、jobId、keyId、时间戳、nonce和原始body SHA256。HTTPS、固定配置地址、禁止重定向；不接受请求指定的回调地址。WebCrypto验证；未知keyId/错方向/过期/超前/重复nonce/错body均拒绝。允许2分钟签名窗口及最多30秒时钟偏差；nonce持久保存到窗口结束，网络重试使用新nonce，但job/receipt身份不变。密钥由用户后续安全配置，实施与测试仅用合成值。

## 状态与原子边界

新增两侧各自的执行记录，不批量改写老run；只允许显式远端模式引用新记录。jobId由网站服务端为该run/request生成，唯一约束绑定不可变请求哈希及配置身份。相同job+相同哈希重放读取当前状态；相同job+不同输入返回CONFLICT。不得只依赖Workflow实例ID去重，因为实例重启会清除其步骤状态。[Workflow lifecycle](https://developers.cloudflare.com/workflows/build/trigger-workflows/)

1. **网站准入。** 复用现有session/origin/cohort/IP限流、owner+mutation幂等、缓存、quota和budget逻辑。缓存命中直接Ready，外部调用0。远端新run、mutation alias与执行交接记录在同一网站D1事务中创建，先固定job身份；随后使用原quota/budget原语，只有两者均有匹配的持久有效预留才标admitted。预算reservation到期固定为创建时刻+120000+1260000ms，不能在重放时延长。部分准入只做已有记录核对/终结，不自动增加第二笔预留。网站响应不能等Provider结束。
2. **交接与自主恢复。** 独立服务先原子插入或读取job，再创建同一ID的Workflow。成功的后台已接受响应以job及Workflow已持久接受为界，不能仅凭网站queued行宣称后台已接手。创建回执不明查询相同实例，禁止新ID重建。独立Worker每分钟一个有界Cron，承担下述三类独立维护，不依赖浏览器或Workflow后续步骤。各类持久游标公平推进、每类最多10项，单次总工作上限30秒，各请求5秒，有界并发；只做短交接与对账，不执行20分钟Provider。浏览器recover/get仅查回/导入，不派发。新增公开视图布尔字段backgroundAccepted仅由已存接受记录决定；旧记录缺省false。

   - **网站维护。** Cron通过专用签名维护入口扫描尚未admitted的部分准入、排队/执行已到期项以及待完成导入，不能只列出已admitted且未过期的outbox。部分准入以原job核对已有quota/budget：两者均匹配且仍有效时可CAS补admitted；否则原子封闭其准入身份并释放可证明未发送的已有预留，绝不新增缺失预留。正常准入的每个后续写入必须检查该封闭状态，扫尾再核对已在途写入，避免终结后留下迟到预留。超过2分钟且尚无begin授权的项在网站原子终结；已发begin的项按执行器unsent证明或unknown规则收敛。此维护在关闭新接单后仍运行。
   - **补交与补建。** 在允许接单时读取最多10项已admitted且未过期的网站outbox，补交原job；对执行器已有job补建或查询同一Workflow实例。关闭接单停止领取新的外部job，但已有记录的维护不停止。所有补交仍须通过网站begin，不能绕过过期或关闭条件。
   - **结果账本维护。** 独立扫描已有dispatch标记、待固定结果引用、待交接及待清理的job。对没有D1结果引用的job检查唯一固定R2回执路径；有完整合法且身份匹配的回执则核对哈希、补固定不可变D1结果并调度网站导入，已有结果则继续同一回执交接。不得再进入付费step。无对象不证明未发送；执行仍可能运行时只记录观察状态，不提前写入排斥迟到可信回执的终局“失败结果”。正文到期后仍凭保留的usage/结果元数据推进费用对账。
3. **发出授权。** Workflow在付费前向网站专用受认证begin入口确认有效准入/预算、尚未到期排队项和当前允许开始新执行的开关。网站在原子CAS中将新远端queued转researching并一次性固定开始时间、21分钟执行deadline及begin授权；重复begin只返回原授权，绝不续租。执行器随后以自身D1条件更新取得唯一`dispatch-claimed`资格；必须在fetch之前持久保存。失去这个CAS或读到已有标记的路径只能读状态/结果，不能再fetch。后台收到begin结果时持久保存其原始身份/deadline，不能用新的本地现在时间重开期限。
4. **执行。** 唯一赢家调用共享的真实Provider适配器，注入服务端配置Key，不接本地诊断/launcher。付费step明确禁用重试；内部完整1200秒deadline。Workflow默认10分钟timeout/5次重试不适用，必须显式覆盖。[Step settings](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/) 实例重启、重复投递、执行器崩溃或HTTP不明也不能绕过D1标记。
5. **保存回执。** 规范化成功/安全失败回执先以job绑定路径写私有R2，再以D1 CAS固定结果哈希和引用，之后才回传网站。对象写入成功但确认丢失时可HEAD/GET同一路径并核对；不能借此再调用Provider。对象内带完整不可变身份及可信usage/安全失败元数据，只有经过完整读取、大小/schema/身份/哈希校验后才可补固定引用。R2写入后、结果CAS后但step返回前的进程中断，由独立Cron结果账本维护接管，不依赖禁用重试的付费step自行恢复。不同回执哈希不得覆盖已固定结果。Workflow步骤仅返回小型状态/引用，不把正文当step输出。
6. **网站完成。** 专用服务认证完成入口按job/run/request/配置身份取回匹配回执，不复用要求用户session/Origin的公共mutation入口。网站原有候选/来源/质量验证器决定Ready或needs-review，复用audit/budget/quota原语。创建执行记录时冻结完整版本/validation context（packageId、observedAt、expiresAt）；第一次固定回执保存其latency/usage/hash，之后不按新的日期或网络重试耗时重算。用持久导入阶段记录及CAS接续audit、package、quota、budget各写入，写成功但确认丢失只重读或补完，不走旧execute通用catch把active强行失败。远端Ready不具备发布权；重复/并发回传不得多计配额、多生成包、改写终态。
7. **结果取回。** 后台主动回传与网站已认证用户查回共用同一个完成函数。callback失败可对同一持久回执重试；回到页面时也可受限读取它并尝试相同入库。不会因为回传失败、浏览器首次POST丢失或刷新而启动第二次Research。wrong owner不能获知job或远端结果。

### 期限

新远端模式先有2分钟排队期限；begin原子成功时只初始化一次21分钟执行租约。run的queued到期检查仍使用排队deadline，执行记录另存两种绝对deadline，终态清空run.activeExpiresAt后仍保留账本证据。旧同步和历史run不进入这一初始化路径。

付费前仍需保留完整1200秒Provider和30秒结果入库余量。网站begin回执提供原始deadline和响应时剩余时长；执行器用本地单调时钟扣除该请求全部RTT，再判断剩余时间，不依赖两机墙钟恰好同步。begin响应丢失后重取只能得到原期限的剩余量。若不足则拒绝尚未发出的调用，不能减少模型预算。付费step外层timeout21分钟仅作资源兜底，Provider保持20分钟。

新远端发布/needs-review落库必须在数据库CAS本身检查未过期及execution身份，使用事务实际执行时的数据库时钟；不能仅在请求进入时调用current()后以旧时间参数写入。当前源码先检查再写SQL的窗口需用新的RED复现并最小修正到实际publication guard。单纯录费用/重读终态不受该发布资格条件限制。

结果回传可独立于浏览器继续，但不能保证任意长的平台故障下仍按时完成。到期或已失败终态不复活；晚到可信回执仍只能对账，不能发布计划。若结果在期限内已持久写入网站Ready，即使确认丢失，重放仍读Ready；不能因网络重试改成失败。

### 费用与崩溃

`dispatch-claimed`与外部Provider不能组成跨系统事务。标记写入后、fetch之前崩溃会留下保守的不确定窗口；设计选择禁止自动重发，而不声称“恰好一次收费”或无条件完成。用户可看到安全的未完成状态，后续新建仍走明确确认、全新身份和已有预算规则。

只有可证明从未获得发送资格的终态，或Provider明确未收费回执，才释放预算。网站以原子CAS关闭尚未发出begin授权的排队项，可证明后续不能获授权；begin已经发出则需执行器原子关闭尚未claimed的job并返回不可回退unsent回执，否则保留unknown。远端404、连接失败、没有日志、Workflow错误或超时都不是unsent证明。远端模式不再使用现有stateVersion===1推断noProvider，而读取专门执行账本；旧模式保持原语义。可信实际费用不能截成USD5；预算只是预留准入。晚到费用不改变已最终确定的quota或产生发布资格。

正文在网站确认完成后删除；未确认正文最多保留24小时，过期删除不代表未收费。清理步骤先将可验证回执的结果哈希、usage/安全错误固定到D1，再删除正文；应用内删除失败可幂等重试。若平台故障导致正文不可恢复且元数据未固定，则保留unknown，不虚构费用或未发送证明。job去重标记及小型账本不与正文一并删除；应用未定义清理迁移前不自动删除可重复派发的身份。删除或服务关闭不能成为重发授权。

回传首次立即进行；只对超时/5xx/明确暂时不可用按同一receipt重试，退避从1秒开始、封顶5分钟，正文交接截止结果生成后24小时。Cron按持久nextAttemptAt接续重试，实际执行可能晚于计划时间。401/403/协议或哈希冲突停止重试并记录有限安全错误，保留回执供修复后手动触发同一结果交接；不重启付费step。正文清理后，未确认费用仍保留待对账状态，维护只提交有界元数据，不再尝试发布课程。关闭接单后Cron仍执行上述网站维护、结果交接/账本清理及已接受工作的bootstrap，不再从网站领取新job；网站begin开关负责拒绝尚未授权的调用。

## 中断和关闭

页面沿用已验收的pending mutation持久化及owner/epoch保护；快速获得run后停止请求等待、继续轮询。只有服务端确认已接受独立任务时，才展示可离开后返回的说明。提交确认不明保留原身份，提示查回，不自动重发新任务。

关闭Research入口阻止新的准入与尚未获得begin授权的任务，不抹掉历史查询/结果回传/对账。已授权或已发出的请求可能继续生成和计费；关闭按钮不得显示为撤销费用。独立执行器的停止接单开关同样与既有结果读取分离。硬终止任务只作为后续具体运维操作，按费用不明处理，不自动restart。

## 本地实施边界与验收

先做无真实凭据的本地模块与合成服务，不创建Cloudflare资源。建议在`worker/research-executor/`放独立服务入口/Workflow/存储适配及独立构建配置；网站保留Sites构建流程及现有DB/R2名称，不把独立Worker误打包为网站部署入口。

本地计划按：协议/签名/执行记录 → 网站准入/交接/完成拆分 → 独立Worker/Workflow执行 → 客户端快速状态与恢复 → 整合故障验收顺序开展。实施时使用新的独立子代理、TDD、每任务SPEC后QUALITY和最终整合审查；不重做已完成模块，也不把接口mock全绿代替真实本地D1/Provider适配/validator/planner链路。

必须保存的证据：

1. 缺省同步模式精确兼容；远端模式无Key可校验策略且需要完整桥接配置；非法组合在外部请求之前拒绝，服务端控制不能从客户端选择。
2. 双向签名、路径/body/方向绑定、真实字节上限、nonce和时间窗口、固定URL/无redirect、跨owner隐藏。
3. 两个执行者同时处理同一job，持久CAS仅允许一次合成Provider；不同payload冲突、重复创建/重启也不增加次数。
4. 逐点故障注入：准入/预算写入后、job写入后、Workflow create确认丢失、begin确认丢失、dispatch标记后、fetch前后、R2回执写入后、结果CAS后、网站入库/确认丢失。区分已证明unsent与unknown，预算/配额无重复。
5. Fake timer验证排队后必须仍保留完整20分钟；headers/body共享deadline，21分钟到期不续租、不复活，晚到费用仅结算。
6. 首次HTTP快速返回并丢失响应、浏览器关闭/重开，独立执行者仍完成合成任务，原mutation找回并生成可激活package；重复找回0额外Provider。
7. 回执hash固定、私有对象与正文清理、失败callback重复与用户取回并发、保守费用、已终结quota保持；实际D1账本断言。
8. 原来源/课程质量严格规则仍决定结果；无效needs-review、Repair0；实际激活/规划/新reader读回和账户隔离。
9. 网站与独立服务分别构建、定向回归/当前类型/lint、产物仅含各自所需代码；本地故障验证真实请求0。输出完整源码候选/构建/回执及审查证据。

10. 无浏览器参与的恢复窗口：quota或budget落库后但admitted前、admitted后交接前、外部job落库后实例创建前，以及首次Cron到达时排队已过期。下一次有界Cron在故障解除时恢复同一job或按证明终结；关闭新接单后也能清理部分准入/已过期记录。测试维护与迟到准入写入并发，确认无遗留预留、重复预留或未授权Provider。
11. 导入跨午夜、回执确认丢失、audit/package/quota/budget每个写入阶段故障及callback/GET并发：日期、latency、usage、hash和终态一致。数据库执行阶段才超过deadline的写入必须拒绝，不能仅模拟入口时已超时。
12. 禁用付费step重试、浏览器完全关闭的情况下，分别在R2写入后和D1结果CAS后、step返回前中断。仅通过下一轮独立账本维护取回并交接同一回执，合成Provider仍为1次。并发扫描活跃执行不覆盖尚未到来的真实结果；正文清理前固定费用元数据，清理后继续费用对账但不能生成或复活计划。

## 后续线上门槛

本地通过后才准备实际独立Cloudflare账户/计划、准确Worker/Workflow/D1/R2资源、最少权限、秘密输入、恢复与关闭路径，以及Sites数据库新增迁移的备份/恢复和兼容发布方案。资源ID从实际平台取得，不能在实现时编造。先进行受保护的零Provider长时间/关页/故障演练，再对具体候选申请一次新的真实Research及限额；此前第十七次成功只作策略依据。

随后仍需目标环境真实OAuth登录、两owner、学习/Proof持久化、生产备份恢复、源码/GitHub备份、准确发布候选及公开发布后关键验收。完成本地执行器不标记首版公开发布目标完成。
