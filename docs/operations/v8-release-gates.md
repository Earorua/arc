# Arc v8 发布门槛与回滚决策

> **2026-09-13 当前：第十七次完整本地真实Research PASS，用户实际ExitCode0，单次授权已消耗。** 85.685秒、8次搜索、USD0.219672可信结算，Ready/课程规则/测试账户激活/计划7/隔离/清理通过，独立验收PASS。结果见v8-seventeenth-success-result-2026-09-13.md。当前任务找回设计已独立审查READY、待用户批准；没有新付费或生产/Sites写入许可，完整公开发布未完成。
>
> 新只读对照覆盖version10对应本地源码的190个文件，7项实质变化及7项新增均限于Research和undici直接开发依赖；15项迁移/metadata无实质变化、无新增迁移。详见v8-version10-source-delta-2026-09-13.md。不是生产ledger、运行兼容或artifact恢复证据，不改变旧v7.2不可直接回退的结论。下方第十五次失败及此前等待状态均为历史。

> **2026-09-12 第十五次已结束且许可已消耗：HTTP200但外层JSON解析失败，用户确认ExitCode1。** 新安全Summary为summary-2026-09-12T13-05-32-428Z.json，SHA1e94d2dfbf45b3ecf638e17b6c942c0cf6a9b9441911e7684ee7075818f66ceb；GET1/POST1/Repair0，outer-json/invalid-json、1100字节、bodyComplete=true、localCancellation=none，耗时303534ms。没有进入Provider结果/引用/候选/质量阶段，未Ready/激活/规划；owner、重复拒绝和DB销毁通过。usage未知，保守占用上限USD5，不是实际扣费；Activity总费用/最终状态仍缺。已确认原launcher19844与runner46120消失，监视会话46491完成，不需要重跑或继续等该进程。原108项候选未变，加本次回执共109项保护；详见v8-fifteenth-transport-result-2026-09-12.md及outputs/local-fifteenth-transport-investigation-20260912。只读源码及六个合成案例调查已完成，未确定实际上游根因；109项保护重新一致。本地响应格式观察设计已自审及独立审查READY，下一步为用户审阅，见../superpowers/specs/2026-09-12-arc-v8-response-format-observation-design.md，尚未实施，不修改解析规则或预算。完整公开发布目标保持未完成且active；没有第十六次/Repair/重试、Git/生产/Sites写入许可。下方待执行、运行中及旧授权均为历史。

> **2026-09-12 第十五次单次真实Research已获用户明确授权，等待本机终端执行。** 固定Kimi K3 low/32768、最多10搜索50结果、USD5总限额、Provider/租约/启动器20/21/22分钟；至多Key GET1+Research POST1，Repair/自动重试/probe均0。Key只由用户在本机masked输入。108项候选与55项构建指纹、分支codex/v8-openrouter-research-beta、HEAD7090153b4acad7b12df6a7ee4d675b46c41871dc均核对一致；精确只读runner/launcher查询匹配0，最新仍是summary-2026-09-12T12-46-23-545Z.json的默认离线回执。授权尚未观测为已执行，不提前视为消耗；授权记录outputs/local-quality-contract-20260912/fifteenth-authorization.json，命令及范围见v8-quality-contract-live-validation-2026-09-12.md。用户回复已运行后检查新安全Summary或同一存活runner，不重复启动或索取相同许可。本地1529项、类型/lint/build/默认离线及最终独立审查FINAL READY保留；完整真实Research和公开发布未完成，无Git/生产/Sites写入许可。下方第十五次待授权及旧blocked均为历史。

> **2026-09-12 当前：第十四次真实 Research 已执行，许可已消耗，结果 quality-needs-review。** Root 确认同一 worktree 的用户本机 launcher/runner，随后 runner 消失并生成安全 Summary `summary-2026-09-12T08-43-45-288Z.json`，SHA256 `81ec03ab106e08dc0d9f8d1c4490636f56a21dfbe691b1f0a0174a0bc550a168`。无需再等用户“已运行”或重跑旧命令。实际终端退出码未捕获，不能据此宣称 exit 0/1。
>
> Key/Research HTTP200，stop，引用25条兼容，预检与正式候选结构 accepted；Research 122055ms、5次搜索、可信 USD0.151111 settled。课程质量返回 invalid-graph / invalid-registry / missing-core-authority 三个去重类别，runState needs-review，未激活/规划。GET1/POST1、Repair0，owner/第二次拒绝/数据库销毁通过。8技能条目、10审计URL、24单元不等于引用闭合或8个唯一ID，不能还原具体错误。完整结果见 `v8-fourteenth-quality-result-2026-09-12.md`。
>
> 新下一步：审阅本地质量规则与有限诊断设计 `../superpowers/specs/2026-09-12-arc-v8-quality-contract-diagnostics-design.md`，待用户批准；尚未实施。源码调查及10个合成案例验证了请求没有明确表达的规则差异，均为离线调查，不是本次正文重放或精确根因证明。拟明确双向关联/有效权威证据/全registry唯一ID/长单元检查点要求，并保留更细有限错误类别；不放宽质量。批准后 writing-plans → 子代理TDD → 每任务SPEC后QUALITY/安全 → Root新候选完整本地验证。
>
> 现有模型Kimi K3 low/32768、最多10搜索50结果、USD5、20/21/22分钟保持；当前profile仍为kimi-low-output32k-v2，拟议v3未实施。69项保护见 `outputs/local-quality-investigation-20260912/fourteenth-protected-hashes.json`，包括原68项及本次Summary。此前1341项/双审/build/默认离线成果保留，不因只改调查文档重复运行。
>
> 分支 codex/v8-openrouter-research-beta、HEAD7090153b4acad7b12df6a7ee4d675b46c41871dc，原有脏工作树保留；没有新的应用源码、真实Key、额外Provider、生产/Git/Sites写入。第十四次许可耗尽，没有第十五次/Repair/重试。完整公开发布目标未完成，工具已标 blocked，等待本地质量设计批准：首次设计交接及随后两个自动续行共3个目标回合，后两回合仅重核证据，没有新增实施进展或存活任务可等待。新门槛独立计数，不复用旧实测等待记录。88项交接指纹仍一致；现有恢复/兼容演练已完成，不重做。用户批准设计后从 writing-plans 继续，不重复索取工作流许可。以下旧等待/批准状态均为历史。

## Task1双审前历史

> **2026-09-12 当前：用户已批准本地响应预检设计，Task1实施启动。** 54项恢复指纹全部一致；52项保护及两份before源码快照已保存。计划 `../superpowers/plans/2026-09-12-arc-v8-response-preflight-diagnostics.md`，记录 `v8-response-preflight-validation-2026-09-12.md`。先完成诊断模块/本地适配器的TDD及SPEC后QUALITY，再做Summary接入与双审，最后Root回归/本地build/零真实请求演练/最终审查。当前未宣称新实现或验证通过。
>
> 设计批准不再重问；第十三次许可已消耗，无第十四次/Repair/重试。原stop/annotations-invalid/可信USD0.134539结果保持；完整Research和公开发布仍未通过。没有生产/Git/Sites写入许可。旧工具blocked不覆盖用户现已批准继续的本地工作，不新建或缩减目标。下方待设计批准/执行均为历史。

## 本地响应预检批准前历史

> **2026-09-12 当前门槛：第十三次真实Research仍未完整通过。** stop、185257ms、可信USD0.134539 settled，不再是本次length失败；annotations-invalid拒绝，候选结构/来源/课程质量尚未检查，未Ready/激活/规划。结果及54项保护见 `v8-thirteenth-annotations-result-2026-09-12.md`；已完成1252项本地合成验收不等于真实或线上通过。
>
> 第十三次许可已消耗，无第十四次/Repair/重试。已具体化并独立SPEC READY的本地响应预检设计等待用户批准，尚未实施；定位引用类别及独立JSON结构问题，不能放宽来源或质量来通过。公开Research未因此启用，本轮没有生产/Git/Sites保存部署。旧执行等待已解除，新设计批准是首次交接，完整目标保留；旧blocked工具元数据不覆盖本次新回执。

## 第十三次结果前历史

> **2026-09-12 当前：blocked，等待已授权第十三次验证的用户本机执行/新安全Summary；授权继续有效。** 授权交接与随后两个自动续行仍没有执行回执，同一等待条件共3回合；两次成功的精确只读runner进程查询均匹配0，最新仍为此前默认离线 summary-2026-09-12T03-54-48-534Z.json。没有确认存活的runner句柄，两次自动回合没有新实施或实测进展，不是 verified wait；目标工具已标blocked以停止重复自动轮询。
>
> 第十三次许可已授予，不再索取。当前不能认定它已执行、失败或已消耗；用户按上一条已交付命令只运行一次后回复“已运行”，再核对新安全Summary。若已有运行进程则等同一进程，不启动第二份流程、不读取真实Key/env/原始正文。53项候选、1252项/双审/构建/离线演练及完整公开发布目标保留，无新源码/测试/构建/Provider/生产/Git/Sites动作。下方active为等待前历史。

> **2026-09-12 最新：第十三次单次真实 Research 已明确授权，等待用户本机执行回执。** 用户对已审阅32k候选回复“授权”，许可范围为Kimi K3 low、32768输出、最多10搜索50结果、USD5专用未使用非循环限额Key、至多Key GET1+Research POST1、Provider20分钟/租约21分钟/启动器22分钟、无Repair/重试。53项冻结指纹与分支codex/v8-openrouter-research-beta、HEAD7090153b4acad7b12df6a7ee4d675b46c41871dc已重新全部核对一致。
>
> 命令按 `v8-output-budget-live-validation-2026-09-11.md` 交付用户本机隐藏输入一次，助手未读取Key或发起真实调用。尚无执行回执，不能把许可视为已执行/成功或已消耗。用户回复“已运行”后仅核对新安全Summary；若说明正在运行，则确认并等待同一次进程，不启动第二份流程。无需重问这一次许可或重跑已通过1252项/双审/build。
>
> 原等待第十三次许可的blocked条件已解除，目标工具当前active，完整公开发布仍未完成；新的阶段是用户本机执行/回执。不操作生产/Git/Sites。下面等待许可/blocked等均为历史。

> **2026-09-12 最新目标状态：blocked，等待第十三次单次真实 Research 的明确新许可；完整公开发布目标未完成。** 首次候选交接及随后两个自动续行均未收到许可，同一条件共3个目标回合。交接回合完成本地1252项/双审/构建/演练/最终审阅，属于实际进展；两个自动回合仅核对冻结记录及授权状态，无新增目标实施进展，不是 verified wait。当前已完成所有本轮本地候选待办，后续依赖真实结果，无可绕过新许可的下一步；工具已标blocked停止重复自动续行。
>
> 具体方案仍为 `v8-output-budget-live-validation-2026-09-11.md`：一次Kimi K3 low Research、32768输出、最多10搜索50结果、USD5、20/21/22分钟、GET1/POST1、无Repair重试。53项冻结候选、全部验证和源码保留；无新增真实请求/测试/构建/生产/Git/Sites操作。用户明确授权后重核候选并交付单次本机隐藏输入命令，不重复问同一许可或重做已通过检查。该阻碍与先前用户暂停不同；下面active/首次申请为过程历史。

> **2026-09-12 最新：32k 本地候选已全部验收，最终整合审查 FINAL READY，等待新的第十三次单次真实 Research 许可。** Task1、Task2、Task3 均先 SPEC 后 QUALITY READY，最终独立整合审查 output32k_final_integration_review 无 P1/P2/P3；Root31文件1252/1252、非增量类型、18文件lint、当前Sites0.1.62本地五阶段构建与产物检查、默认PowerShell零真实请求演练均通过。53项冻结指纹和19项保护指纹已由Root及最终审查者独立核对。没有待收取的本轮测试/构建/审查任务。
>
> 具体单次方案见 `v8-output-budget-live-validation-2026-09-11.md`：Kimi K3 low、32768输出、最多10次搜索/50结果、专用未使用非循环USD5 Key，至多Key GET1+Research POST1，Provider20分钟/租约21分钟/启动器22分钟，Research专用direct连接，无Repair/自动重试。目前仅完成可审阅交接，本回合首次申请这份候选的新许可，未交付或执行新付费命令。第十二次许可已消耗，旧许可不复用。
>
> 用户明确授权后只重核53项指纹并交付本机隐藏输入Key的单次命令，无需重问相同许可或重做未变测试。用户回复“已运行”后仅核对当次新安全Summary，不重新启动。当前最新人工默认离线Summary `summary-2026-09-12T03-54-48-534Z.json` SHA256 `d4da0ec79674e4579cf07e958adf502f7931fbf45a61bde7cec75cd8c70abcb6` 为offline/passed/0真实请求/ready/质量/激活/规划/隔离/销毁通过；不是第十三次实测。
>
> 完整首版公开发布目标 active 且未完成，尚待真实完整Research、线上长任务方案和接入、真实登录/隔离/持久化与恢复、公开发布及发布后验收。本轮无Key/env/原始正文读取、真实Provider调用、生产/Git写入或Sites保存部署。已公开站点的现有版本不因本地build改变。源代码与有意未提交成果保留，分支codex/v8-openrouter-research-beta、HEAD7090153b4acad7b12df6a7ee4d675b46c41871dc。以下进行中/暂停/blocked为历史。

> **2026-09-12 当前：32k 候选三项任务均已完成规格后质量双审，Root 最终离线验证通过，最终整合审查进行中。** 新的31文件1252/1252、非增量类型检查及18文件lint均exit0；当前Sites0.1.62独立本地构建五阶段通过，Worker导出/38客户端文件/hosting与15迁移元数据检查通过。默认PowerShell无模式演练exit0，新Summary为 summary-2026-09-12T03-54-48-534Z.json，passed、0真实请求、ready、质量/激活/规划/隔离/销毁通过。此为合成离线证据，完整真实Research及公开发布目标未完成。
>
> Task3质量审查 output32k_task3_quality_resume 为QUALITY READY，无P1/P2/P3；只读审查及无网络dispatcher探针，没有重跑旧测试。当前52项源码保护/暂停指纹仍全部一致，另加新的离线Summary共53项，清单 outputs/local-output-budget-20260911/root-final-candidate-hashes-20260912.json；完整本地报告 root-final-validation-20260912.json。下一步收取独立最终整合审查，关闭发现后完成具体真实验证交接。
>
> 第十二次许可已消耗，无第十三次/Repair/重试许可。候选固定Kimi K3 low、32768输出、10搜索50结果/USD5、Provider/租约/启动器1200/1260/1320秒及direct Research连接；不放宽来源/课程质量/费用门槛。本轮无真实Key/env/正文读取、真实Provider请求、生产变更、Git写入或Sites保存部署。用户暂停条件已解除，完整目标active。下方为此前恢复/暂停历史。

> **2026-09-12 已恢复：** 用户明确“继续 Arc v8”，此前用户暂停阻碍解除，目标工具当前 active，完整公开发布目标保留。已核对分支/HEAD和52项暂停指纹全部一致；Task3独立 QUALITY/SAFETY 正在进行，之后完成 Root 最终离线回归、构建、终端演练和整合审查。Task1/2和Task3规格审查不重做。无第十三次真实许可或生产/Git/Sites写入许可。下方暂停/blocked为历史。

> **暂停后的目标状态：blocked，等待用户主动恢复。** 用户要求保存暂停的回合及随后两个自动续行均未收到恢复指令，同一等待条件共3回合。原暂停回合完成保存；上一自动回合只核对既有保存状态，没有目标实施进展，不是活任务的 verified wait。本回合复核检查点后，目标工具已标记 blocked 以停止重复自动续行，完整公开发布目标保留且未完成。此状态不代表代码故障或设计待批准。用户恢复后先继续 Task3 QUALITY，再完成最终离线整合验证；不重做已通过任务，也不新增真实请求。下方 active 元数据是暂停交接时的历史。

**2026-09-11 最新：用户要求保存并暂停，等待稍后恢复；完整首版公开发布未完成。** 32k 候选 Task1/Task2 双审 READY；Task3 实现冻结、revision1 SPEC READY，QUALITY 审查按要求停止，尚未检查源码、未完成。阶段303项和修订14项/类型/lint通过，Root 最终回归、构建、默认离线演练、最终整合审查与冻结尚待，真实及线上发布门槛仍未通过。

恢复先完成 Task3 QUALITY，再按计划完成 Root 最终验证。32k/1200-1260-1320秒/10次搜索50结果/USD5 与严格质量要求保持。无第十三次真实许可；本次只保存本地进度，无新增真实调用、生产/Git/Sites操作。目标工具 active 元数据不覆盖用户暂停要求。准确恢复点及暂停哈希见 `v8-resume-checkpoint.md` 和 `outputs/local-output-budget-20260911/user-pause-20260911.json`。

## 用户暂停前阶段历史

**2026-09-11 当前：32k本地Task1双审完成，真实/线上发布门槛仍未通过，完整目标active。** 32768输出、1200/1260/1320秒、v2兼容已通过275项/类型/lint与SPEC后QUALITY。Task2回执/规划已通过229项与规格修订验证、SPEC后QUALITY READY；Task3原生连接期限协调已取得实际启动器RED并实施中，仍待双审/Root最终验证。10次搜索50结果/USD5/来源质量/费用/隔离门槛保持，无第十三次真实许可或生产/Git/Sites操作。详细记录见 `v8-output-budget-validation-2026-09-11.md`；本地通过不能替代真实或线上通过。下方为批准前历史。

## 本地输出预算批准前历史

**2026-09-11 当前：第十二次完整真实Research仍未通过；目标blocked，等待新本地24k设计批准。** 审阅READY后同一批准等待共3回合，两个自动续行没有新增目标进展，详见恢复检查点审计；不缩减或完成发布目标。第十二次回执证明HTTP200、7次搜索、216417ms、可信USD0.242346 settled；明确length拒绝，未Ready/激活/规划。传输读取已通过不等于课程质量通过，见 `v8-twelfth-length-result-2026-09-11.md`。第十二次许可消耗，无第十三次或重试，旧等待执行的阻塞已解除。

后续本地24k/完整简洁表达设计待审阅批准；不放宽10次搜索/50结果、USD5、完整契约、来源/质量或费用门槛。本轮只处理安全证据与方案，没有源码、生产/Git/Sites变更；线上Research和完整公开发布仍未验收。旧860项/双审/build及33项冻结清单保持，下方均为回执前历史。

## 第十二次回执前历史

**2026-09-11 最新：目标blocked，等待已授权第十二次本机验证回执。** 当前没有匹配运行进程或新真实Summary，连续等待达到审计门槛；授权有效，真实及公开发布门槛仍未通过。仅保存等待状态，不新增请求或生产/Git/Sites动作；用户执行反馈后继续同次结果处理。下方active为此前历史。

## 第十二次等待前历史

**2026-09-11 第十二次单次真实验证已获明确授权，待用户本机执行回执。** 候选33项指纹重核一致，沿用一次GET+一次Research、Kimi low/USD5/10次搜索50结果/无Repair重试；见v8-transport-observation-live-validation-2026-09-11.md。授权不等于真实或线上门槛通过，也不代表已消耗本次许可。没有生产启用、Git/Sites操作或新部署；完整发布目标active且未完成。下方未授权段落为历史。

## 第十二次授权前记录

**2026-09-11 最新本地门槛：安全传输诊断两任务双审、Root860项/类型/lint/build与产物一致性通过；最终整合审阅FINAL READY，无P1/P2/P3。** 具体记录v8-transport-observation-validation-2026-09-11.md。新增有限失败观察和本地Summary保持原候选/质量/费用/隔离/请求边界，不构成真实Research或线上门槛通过。

**真实与发布门槛仍未通过。** 第十一次许可已消耗，下一份一次Research/USD5/10次搜索50结果候选v8-transport-observation-live-validation-2026-09-11.md尚未授权或执行。没有第十二次、Repair、自动重试、生产启用、Git或Sites写入。完整公开发布目标active且未完成。下方为历史过程。

## 此前过程记录

**2026-09-11 用户已批准本地安全传输观测设计，实施启动。** 计划 `../superpowers/plans/2026-09-11-arc-v8-transport-observation.md` 只补有限失败阶段/字节/EOF/计时/取消观察与安全Summary，沿TDD/两阶段审查验证原业务边界。尚未完成本轮实现、测试、审查或构建，不视为真实Research门槛通过；没有第十二次真实请求、生产启用或部署许可。下方待此设计批准是历史。

**2026-09-11 第十一次真实结果：完整 Research 门槛未通过。** Key/Research HTTP200，303101 ms 后 invalid-transport / charged unknown；没有完整候选、可信usage、Ready、激活或规划。USD5是保守预留而非实际消费。一次GET+一次POST、Repair0、owner/重复拦截/销毁通过；许可已消耗，无第十二次。28项候选指纹匹配，本机loopback和独立审计只区分了多个传输/解析失败路径，未证明实际根因或修复。见 `v8-eleventh-transport-result-2026-09-11.md`。

用户已提供四条同父ID子请求：前三条tool_calls且未取消，第四条307248 ms/cancelledtrue/finishnull、输出10555/推理1966；确认推理与Exa搜索运行，不能确认最终候选。子费用小计USD0.22243364不是整轮结算，不替换本地unknown；无需继续补日志。具体安全传输观测设计已形成，待审阅批准，未实施；当前证据不能判定取消发起方。完整10次搜索/50结果/契约/质量/费用验收条件保持；不依赖盲调时限或反复付费推进。没有启用公开Research、生产配置/数据、Git/Sites写入或部署；完整持续目标active且未完成。下方等待第十一次执行/授权为历史。

## 第十一次执行前历史

**2026-09-11 第十一次单次实测已授权，等待本机执行结果。** Kimi low/完整契约v2/10次搜索50结果/USD5/一次Research/无重试，见 `v8-request-contract-live-validation-2026-09-11.md`。28项指纹核对一致，许可不等于真实或线上门槛通过；未启用公开Research，无生产/Git/Sites变更。旧等待新许可状态已被本段取代，不重复问同一授权。

**2026-09-11 下一关卡已具体化并审阅READY：** 第十一次单次Kimi low/完整契约v2/最多10次搜索50结果/USD5方案见 `v8-request-contract-live-validation-2026-09-11.md`，未授权或执行，28项候选指纹重核一致。独立候选审阅无P1/P2/P3；方案与审阅不替代真实Ready/计费/规划回执，也不授权线上Research或发布。

**2026-09-11 当前本地门槛已通过：完整契约提示v2与用户选择的最多10次搜索/50结果/USD5已完成。** 两任务与增量覆盖均先规格后质量双审READY，最终整合审查READY，无P1/P2/P3。Root16文件773/773；最后两项count4来源/教学fixture调整后受影响57/57、类型/lint复核通过；应用不变的五阶段build及Worker/客户端/hosting/15迁移产物核对通过。10候选和18保护指纹匹配，见 `v8-request-contract-validation-2026-09-11.md`。实际usage/费用原值保留，字段/来源/教学质量门槛不降低。

**真实/线上/完整发布门槛仍未通过。** 第十次是历史schema-rejected失败，新候选没有真实执行证据或第十一次许可，不能把本地配置当作远端限额证明。下一次仍需具体一次Research/USD5/10次搜索50结果/无Repair重试方案及许可。当前公开Research未启用，本轮无生产/Git/Sites写入。下方旧“当前/最新”段落按过程保留，以本段和恢复检查点顶部为准。

**2026-09-11 新本地候选范围：用户明确选择最多10次搜索、50条结果、USD5总上限。** Task1同源契约提示/v2已413项与规格后质量双审通过；Task2统一策略与验收尚在实施，未真实验证或发布。新候选允许合法count4，仍须完整候选/来源/教学/结算/隔离/规划通过；不能追溯改写第十次在旧2次约定下的失败。没有第十一次真实许可或生产/Git/Sites操作，原完整发布门槛保留。

**2026-09-11 最新门槛：第十次真实请求已返回并结算，完整 Research 仍失败。** HTTP 200 / stop / 45298 ms，details 用量有效、本地 USD 0.082915 settled；候选 schema-rejected，搜索计数 4 高于上限 2，未 Ready/激活/规划。一次 GET + 一次 POST、Repair 0、owner/重复拦截/销毁通过。证据见 `v8-tenth-response-result-2026-09-11.md`；许可已消耗，无第十一次。新本地请求契约设计待审阅，搜索差异尚未解释，不改 schema 或次数门槛来通过。当前无源码/生产/Git/Sites变更，公开 Research 未启用。以下各轮未执行/等待授权状态为历史，不覆盖本段。

**2026-09-11 第十次单次实测已获准，待用户本机执行结果。** Kimi K3 low、USD 5上限、最多一次Key GET + 一次Research POST、无Repair/自动重试，见 `v8-response-compatibility-live-validation-2026-09-11.md`。25项指纹重新匹配，源码和771项本地验收保留；授权不代表真实或线上门槛通过。尚不能认定本次已执行或许可已消耗，无生产/部署/Git操作；下方待第十次许可是历史。

**2026-09-11 响应兼容本地门槛通过，真实与线上门槛仍未通过。** 可选引用标题与两种搜索计数路径完成两项TDD、各自规格后质量/安全双审和最终独立整合审查，均 READY；Root 16文件771/771、类型/lint/build与25项指纹通过。完整合成SQLite Ready/结算/隔离/规划不替代真实Provider或线上证据。本次未改生产、Sites或Git状态；现有公开Research关闭状态保持。证据见 `v8-response-compatibility-validation-2026-09-11.md`；第十次单次Kimi low/USD 5候选仅准备，见 `v8-response-compatibility-live-validation-2026-09-11.md`，尚未获准或执行。九次旧许可已消耗，不自动追加请求。

**2026-09-11 第九次真实结果：完整 Research 仍未通过。** Key/Research HTTP 200、stop、177531 ms，但引用解析 annotations-invalid、usage.server_tool_use 缺失，候选解析观察未执行，未 Ready/激活/规划。一次 GET + 一次 POST、零 Repair、owner/重复拦截/销毁通过；保守持留 USD 5 不是实际消费，精确费用未知。第九次许可已消耗，无第十次，见 `v8-ninth-response-result-2026-09-11.md`。当前继续本地契约调查，没有生产/Sites 发布操作；下方待第九次执行为历史。

**2026-09-11 第九次实测已授权，尚待用户本机执行结果。** Kimi K3 low、USD 5 上限、最多一次 Key GET + 一次 Research POST、无 Repair/自动重试，具体命令见 `v8-candidate-field-live-validation-2026-09-11.md`。25 项候选/受保护指纹重新匹配；root 没有发起真实请求或读取 Key。授权不等于真实完整 Research 或发布门槛通过；公开 Research 状态未改，无 Git/Sites/生产写入。用户“已运行”后只检查新安全 Summary，不重复启动；下方未获第九次许可为历史。

**2026-09-11 候选字段诊断本地验收完成。** Task 1/2 均通过先规格后质量安全双审，最终独立整合审查 READY；root 14 文件/635 测试、类型/lint/build 和 25 项指纹检查通过。新增安全字段只解释候选拒绝与搜索 usage 形状，不改变接受、计费或生产入口。真实完整 Research/线上长任务/发布门槛仍未通过；当前公开仍为 Research 关闭的 v10。下一次 Kimi low / USD 5 / 一次 Research / 无重试方案见 `v8-candidate-field-live-validation-2026-09-11.md`，仅准备，未授权或执行。本轮无 Git/Sites/生产写入，旧八次许可均已耗尽。

**2026-09-11 第八次真实结果：未通过完整验收。** 新安全 Summary `summary-2026-09-11T03-56-51-191Z.json`（SHA256 `d7d7adabc53d6deeb43295ddbd0220fc4406ad42a6d98667f73086c788ad2f24`）证明 Key/Research 200、196252 ms、Provider accepted / stop；内部 invalid-schema、计数 0，usage 搜索次数字段未通过，保守持留，未激活/规划。一 GET + 一 POST、零 Repair、owner/重复拦截/销毁通过。第八次许可已消耗，无第九次；实际费用未知，不能把保留上限或 settled 0 当作消费。调查见 `v8-kimi-schema-result-2026-09-11.md`。真实完整 Research、线上长任务与发布门槛仍未通过；本轮无部署。下方旧次数/等待状态均为历史。

**2026-09-10 第七次真实结果：未通过。** 用户执行后新 Summary `summary-2026-09-09T18-16-27-326Z.json`（SHA256 `24bad7859f8c9c0471881609961aa9dfe08ee83ea80ff571a7c40cc31a4a4821`）记录 Key/Research HTTP 200、108876 ms、failed / invalid-result、usage null、保守持留、未激活/生成计划。用户提供的主请求 Activity 为约 105 秒、结束原因空、未取消、费用/token 0；不是完整聚合回执或成功证明。许可已消耗，无第八次或自动重试。四项零外网对照确认多个失败路径具有相同摘要，实际根因待进一步安全证据。详见 `v8-kimi-invalid-result-2026-09-10.md`。线上门槛仍未通过，无生产变更或部署；下方“尚未执行”仅为历史。

**2026-09-10 实测授权：** 用户已回复“授权”，允许 `v8-kimi-low-live-validation-2026-09-10.md` 中第七次单次完整 Kimi low Research：USD 5 上限、最多一次 Key GET + 一次 POST、无 Repair/自动重试。源码/摘要指纹复核一致，命令交给用户本机隐藏输入 Key 后运行；当前尚未执行，不能填为真实通过。六次旧许可仍耗尽，下方“待新许可”属于授权前历史，生产启用与发布门槛不变。

**2026-09-10 最新进展：** 用户恢复后，实际无参数离线 PowerShell PTY 一次运行退出 0，完整 JSON/Summary 可见，落盘摘要核对 offline/passed/0 real requests、Ready/owner/重复拦截/规划/销毁及固定 low/600/660/720 策略均通过。本地候选完成，原自动审批阻碍已解除。新 Summary SHA256 `a2b16dcfed616b4e5eb6f57a85906e460aa5420fc2bf68760f7f37d91bc77a78`；源码及旧真实摘要未变，607 项回归和双审仍为前轮证据，本轮无重复源码修改/测试。下一次真实验证方案见 `v8-kimi-low-live-validation-2026-09-10.md`，尚待新许可；六次旧许可已消耗。完整真实/线上门槛和公开发布仍未完成，本轮无生产修改或部署。下方“默认离线未执行”是已被取代的历史状态。

**2026-09-09 当前持续目标：** 用户明确要求直至首版成功公开发布；执行顺序及授权边界以 `v8-first-public-release-goal.md` 为准。Root 最终相关回归 **16 文件 / 607 测试**、非增量类型、定向 lint 与五阶段 build 通过；两项实现、最终严格 UTF-8/JSON 修正均已先规格后质量双审 READY，整合复审也 READY，P2 关闭。实际默认 PowerShell 离线演练因自动审批两次误判默认模式而尚未执行，明确离线授权问题仍待用户回复，不能记作通过。完整真实 Research、线上长任务接入和发布验收仍未完成；当前没有新部署或真实 Provider 请求，既有 Research 关闭 v10 不等于新持续目标完成。

**2026-09-09 本地实施已获批准：** 用户批准固定 Kimi low、600/660/720 秒本地候选，实施计划 `2026-09-09-arc-v8-kimi-budget-timeout.md` 正按子代理/TDD/规格后质量安全双审推进。此许可不包括新的真实请求或部署，公开 Research 继续关闭；完成状态以恢复检查点中的新鲜验证记录为准。

**2026-09-08 本地修复设计更新：** 已通过两次无认证公开元数据 GET 核对 Kimi 默认 max、支持 low。新的可审阅方案 `2026-09-08-arc-v8-kimi-budget-timeout-design.md` 采用固定本地 low、600 秒 Provider / 660 秒租约 / 720 秒启动器，并保留标准 Adapter 和生产 factory 时限/入口。当前只完成设计，尚未实施或取得新真实许可；非流式本地取消不能保证远端即时停止计费。具体审阅状态以恢复检查点为准。

**2026-09-08 API 进展与继续路线：** Kimi 最小调用 200/OK 已通过；获准的完整 Kimi Research 在北京时间 21:52 执行，Key/Research 均 200，但约 120.861 秒后 incomplete/research-failed，无完整结果、客户端 usage 或计划。用户提供的两条 Activity 都是同一父请求下的子推理：第一条用满 12,000 原生输出 tokens，其中 reasoning 11,334，native length，94.864 秒，USD 0.1581398；第二条有 **Exa 10 个结果、232.585 秒、cancelled true**，USD 0.11268125（含 web USD 0.014）。子记录证明推理与搜索实际运行，不证明父请求 Ready 或聚合费用；不可将子时长当作整轮时长。累计六次客户端推理许可已消耗。本地失败分类摘要修复已完成，**498 项回归、类型/lint 和先规格后质量双审通过**，见 `2026-09-08-arc-v8-research-failure-summary.md`。后续设计优先核对 Kimi 推理控制与多阶段超时/取消机制；本轮未改变参数、追加真实请求或启用线上 Research。

**2026-09-07 部署尝试结果：** 用户后续明确请求部署，保持公开、关闭 Research 的 v8 已在 Sites version 10 成功发布；精确版本/部署、七页 HTTP 与配置/表概览证据见 `v8-deployment-attempt-2026-09-07.md`。完整恢复、平台逐条 ledger、远端 artifact 恢复和登录后验收尚未通过；这次成功不等于这些门槛自动通过，也不授权重新启用 Research 或直接回退旧版。下方较早“本轮只准备/未部署”仅为历史阶段。

**2026-09-07 新增已批准路线：保持公开访问、关闭 Research 的核心功能发布准备。** 用户明确接受该路线，并要求顶部显示开发提示；“小范围”指功能范围，不限制访客名单。该路线无需等待真实 Research 成功，但仍需真实登录/账户隔离、迁移基线、协调恢复点和兼容 artifact 验收；本轮先完成本地修改、验证和方案，未授权或执行实际部署。具体范围与顺序见 `v8-research-closed-release.md`。下文 Research 成功门槛适用于以后开启 Research 的完整发布，不阻塞关闭入口的核心功能准备。

本文件记录本地证据、外部验收与未来运维条件，不授权或证明生产操作已执行。本轮实际旧服务演练发现八类差异，`rollbackEligible: false`；关闭新 Research 准入的本地 fallback 返回 503 且保存已有数据。三项规格证据缺口已修正，root 最终演练 3/3（39,150.1438 ms），独立规格审查 0/0/0 READY，随后独立质量/安全审查也为 0/0/0 READY，本轮实现已在 `03fc035f98d33831a42874acee3bcb96273de957` 本地提交并完成普通 GitHub 开发分支备份，精确结果见 `v8-retained-compatibility.md`。

## 当前证据与进入下一阶段的条件

| 项目 | 当前证据 | 进入下一阶段所需证据 |
| --- | --- | --- |
| 源码可恢复 | 本轮实现提交 `03fc035f98d33831a42874acee3bcb96273de957` 已普通备份至公开开发分支，read-only ls-remote 匹配；完成记录随后单独保存 | 每次备份核对精确本地/远端 SHA 和干净状态；源码备份不包含用户数据库、对象或浏览器存储 |
| 新库与应用流程 | 既有离线交互验收、实际本地 workerd smoke、单元/类型/lint/构建证据见 readiness | 发生产品或构建输入改动时，针对最终源码重新验证；不能用当前开发分支的零次 Actions 冒称 CI 已通过 |
| 有数据的旧库升级与恢复 | 已实测 20→41 表、50 旧行、2 附件、部分失败后独立恢复；见 legacy recovery 报告 | 生产 ledger 与原生恢复点仍需另行验证；本地逻辑快照不等于 Cloudflare 原生备份 |
| 旧应用读写兼容 | 固定 v7.2 七份源码实测八类差异，直接旧版回退不具备条件；修正后 root 演练 3/3 通过，独立规格审查 0/0/0 READY，随后独立质量/安全审查也为 0/0/0 READY | 必须排除旧写入引发的规划、Proof、目标和分享语义差异，或验证匹配应用/数据恢复方案；仅 schema additive 不足以批准旧版回滚 |
| Research 真实验证 | Kimi 最小 200/OK；完整 Kimi 未完成。两条用户提供的子记录显示输出上限、真实搜索 10 结果及下游生成取消，但无父请求最终包/聚合费用或客户端 usage。六次许可已消耗；失败摘要修复 498 项回归与双审通过 | 基于已有子记录准备推理预算和多阶段耗时/取消的本地修复，先核对固定模型支持参数并 TDD/双审。新实验须有具体次数/预算许可；完整通过仍需 Ready、来源/技能/规划、owner、服务商整轮 usage/cost 与本地结算，不能由 HTTP 200、搜索结果或已扣费推导 |
| 真实登录与账户关联 | 合成 owner 隔离及本地登录流程有证据；不等同于 Google/GitHub OAuth | 在明确的目标环境验证实际登录、退出、跨账户隔离、关联冲突和回调 origin；不将本地合成会话当作真实登录回执 |
| 生产存储与配置 | 七份迁移哈希和配置准入规则已有清单；未读取或修改生产 | 确认目标环境身份、DB/R2 逻辑绑定映射、已应用迁移 ledger、待执行后缀及安全配置引用；秘密值不写入文档/Git |
| 数据恢复能力 | 本地独立 D1/R2 恢复演练通过 | 在另行获准范围建立协调恢复点，验证对象字节/metadata、数据库一致性、恢复耗时和恢复点后写入处置；没有新鲜证据前保持未验证 |
| 保留应用 artifact | 本地 v7.2 commit/tree 已确认；2026-09-06 用户询问后只读核对 Sites version 9 源码/归档哈希及已记录部署 succeeded，站点 active/public；version 6 是不同源码 | 元数据仍不是 artifact 恢复执行证据。需核对实际文件字节、构建/运行条件与部署能力；七份源码执行不能代替远端 artifact 验收 |
| master 集成与发布 | 本轮只允许开发分支备份；master、PR、Sites 候选、生产与部署不操作 | 外部验收和回滚条件满足后，按明确获准范围集成，针对最终提交完成所需 CI；候选与部署另按届时许可推进 |

## 故障时如何选择

以下是未来受控运维的决策，不是在当前机器执行生产命令。

**仅 Research 新调用失败：** 优先保留 v8 应用和完整 schema。在获准环境关闭新调用准入，确认已有规划、Proof、历史 Research 与结算证据仍可读取；验证拒绝新建/重试且不触发额外 Provider 调用。本轮合成组合的有效新建 POST 实测返回 503/RESEARCH_UNAVAILABLE，已有终态 Research、规划、Proof 保留，额外 Fake 调用为 0；没有更改真实旗标，也不冒称所有重试/在途场景已验。关闭准入不是取消在途请求；Research GET 也可能将过期运行转为 interrupted 并对账，不是任意时刻的纯只读操作。

**当前版本某个应用功能失败，但存储完整：** 先保存故障证据并限制受影响写入，选择与现有数据兼容且经过演练的应用修复或保留版本。本轮已发现 v7.2 的完成事件、Proof 版本/状态、分享格式和 active goal 连续性差异，不能把它作为已有 v8 数据的直接回退目标。现有分享快照按设计可在后续 Proof 变化后保留；撤回 Proof 与撤销分享是不同动作。

**数据完整性失败：** 在另行获准范围限制写入并保留故障现场，从已验证、相互协调的 D1/R2 恢复点恢复到隔离目标；核对 owner、会话、任务、Proof/附件、配额与回执，再选择匹配应用版本。恢复点后的合法写入需明确保留、重放或接受损失的处置，不以“重新部署旧版”隐含解决。

**需要回到旧版业务：** 先满足旧应用与恢复数据的兼容条件以及实际 artifact 条件。没有已验证的数据转换或匹配恢复点时保持回退未批准；不得盲目重放非幂等 CREATE、删除 v8 新表或手写 down migration 来使旧代码勉强启动。

## 按顺序执行的下一步

1. 本轮旧服务实测、关闭 Research 准入后的数据保留检查、双审与实现提交备份已完成，见 `v8-retained-compatibility.md`。保留测试所发现的不兼容结论，后续不重做本轮工具。
2. Kimi 本地适配和失败分类摘要修复均已完成。依据现有两条子请求记录，下一项本地设计聚焦推理预算与多阶段耗时/取消，核对受支持参数、活动租约、启动器期限和费用未知状态；不重复要求用户提供账户元数据，不把旧 GPT 403 或等待客服当作这项工作的前提。客服草稿尚未发送。
3. 新的候选修改应先离线 TDD/双审，再按具体次数/预算许可做一次有限验证，不自动重发。维持未使用专用限额 Key 条件；旧成功/有 Activity 费用的 Key 不能通过放宽预检复用。子记录时长、费用和搜索结果分别记录，不冒充父请求聚合回执或完整 Ready 验收。
4. 在获准的目标环境完成真实 OAuth、存储/迁移基线、恢复点与 retained artifact 验收；同时确认本轮发现的任何不兼容路径已被回滚方案排除或有经验证的解决方式。Sites 的每个部署 URL 都属于生产部署，限制访问范围不等于创建了非生产环境。
5. 所有必要条件满足后再按实际许可推进 master 集成、候选与发布；沿用最小 cohort 和失败后的停止条件，不能从“GitHub 已备份”推导“可以上线”。

历史依据：`v8-local-release-readiness.md`、`v8-legacy-recovery-rehearsal.md`、`v8-resume-checkpoint.md`。本轮源码依据包括 `app/server/research/service-factory.ts`、`app/server/research/orchestrator.ts`、`app/server/http/research-route-factories.ts`、`app/server/proof/public-view.ts`、`tests/api/proof-sharing.test.ts` 及 `.github/workflows/ci.yml`。不读取真实环境文件、密钥或 Provider 原始输出。
