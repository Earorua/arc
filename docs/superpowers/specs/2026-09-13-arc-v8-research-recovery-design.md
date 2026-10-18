# Arc v8 线上接入第一阶段：丢失响应后的任务找回

日期：2026-09-13。状态：用户已明确“批准任务找回设计”，Tasks1–4本地实施、每任务SPEC后独立QUALITY及最终整合审查均已完成并通过。645项回归、类型/lint、21项HTTP、本地build/产物核对和默认零真实请求离线演练通过；详见 `../../operations/v8-research-recovery-validation-2026-09-13.md`。独立设计审查中的POST查询响应语义P2已修订并复审关闭，证据见 `outputs/local-native-fetch-seventeenth-20260913/design-review.json`。本次批准回执与批准前设计SHA见 `outputs/local-research-recovery-20260913/approval.json`。第十七次完整本地真实 Research 已通过，单次许可已消耗；未新增真实验证。本地完成不代表完整公开发布完成。

## 目标及范围

用户刷新、页面离开或网络中断后，即使尚未收到首次 Start 或 Retry 的最终响应，也能查询同一次已创建任务。恢复过程不发起 Research、Repair 或付费重试；账户切换不会显示其他账户的结果。

本阶段只在本地实现及离线验证。保留现有生产参数和 Research 入口状态，不部署、不读写生产配置或 D1/R2、不发起真实 Provider 请求、不修改 Git。成功的 Kimi low/32768/10搜索/20分钟候选原样保留。任务找回是后续三种执行方案共有的基础，不承诺断线后任务继续执行。

完整线上接入分为：本阶段恢复身份与查询；成功请求策略/指纹/缓存迁移；有实际托管证据的执行方式；目标环境验收与发布。后面三项不由本设计假定完成。

## 已核对的现状

- `use-role-research.ts` 仅在完整响应后保存 runId；Start/Retry mutationId 只在内存。隐藏页面或卸载会 abort；显式重发在同一次 controller 生命周期内复用 mutationId，刷新后不能继续依赖它。
- `D1ResearchRepository` 已保存 owner+mutationId 的直接运行及 `role-research` 幂等别名。别名绑定 role、locale、input/configFingerprint、retryOfRunId；多个请求可合法加入同一活动任务，不能假定别名 mutationId 等于目标运行的原 mutationId。
- 现有 `GET /api/intelligence/research/[id]` 通过 recovery service 查询，无真实 Provider。其 replay 可标记过期任务及结算已知费用，因此“查询恢复”不是“数据库绝对零写入”。
- 当前生产 Provider 上限120秒、租约60秒、输出12000；第十七次85.685秒已超过该租约。修复恢复身份不会解决这些执行参数差距。

## 方案比较

1. **先补恢复查询（推荐本阶段）**：复用现有 owner 幂等记录和查询服务，解决首次响应丢失，也适用于将来的 HTTP、流式或后台执行器。对托管能力没有新增假设。
2. **先把开始响应改为流式/尽早返回 runId**：可以缩短不知道 runId 的窗口，但仍存在首包丢失，并需新增协议及执行生命周期；不能替代恢复身份。
3. **先接持久后台执行器**：适合关页后继续，但本站可用绑定、部署方式和预算尚未确认。即使采用该方案，浏览器仍需要找回已提交任务。

不在本阶段选择最终执行器；也不把方便实施当作降低稳定完成要求的理由。

## 服务端合同

增加 `POST /api/intelligence/research/recover`，仅表示带请求体的查询，不能创建任务。恢复身份放在 JSON body，避免写入 URL。请求使用 strict discriminated union：

- start：`{ kind: "start", mutationId, role, locale }`。
- retry：`{ kind: "retry", mutationId, role, locale, sourceRunId }`。

mutationId、role、locale、sourceRunId 使用现有界限/校验；不接受 owner、配置、模型、价格、凭据或任意其他字段。成功响应复用现有 Research public envelope，不增加候选原文、账本内容或私有诊断。recover采用现有GET的读取语义：查到任何合法public状态都返回HTTP200，包括failed和needs-review；查询成功不代表任务成功。未知记录、其他 owner 和身份不匹配均返回同一 NOT_FOUND 外观；损坏的本 owner 存储记录按现有 RESEARCH_UNAVAILABLE 安全错误处理。

client必须明确区分query与mutation，不能再以是否有body推断业务语义。现有helper会将带body的200 failed/needs-review视为无效写响应；新增recover调用必须按query验证，保留Start/Retry原有写响应校验。hook可据查回的终态和retryable展示原显式Retry，不能把合法终态错误映射为响应格式异常。

路由从真实 session 取得 owner；强制现有 configured origin、same-origin Fetch Metadata、JSON content type、16KiB累计body上限和严格UTF-8。独立于 AI enabled/cohort/付费参数是否可用，通过 `createRecoveryService()` 执行。使用现有 read account 限额每分钟120次、无缓存、安全响应头及固定路径 operational telemetry；不以写路由包装器执行，避免无谓依赖 Key/付费配置。拒绝和解析失败也释放未读取请求body。

repo 新增有界 owner+恢复身份查询，不调用 createOrReplay/createRetry、不创建幂等别名。查询顺序为 owner 的同 scope 幂等别名，再兼容 owner 的直接 mutation 运行。先验证存储结构，再验证请求角色正规化、locale、inputFingerprint及start/retry意图；alias 指向的 target 必须仍属于该 owner，且与 alias 的 role/locale/input/configFingerprint 相容。合法加入活动运行的 alias，其 retryOfRunId 按 alias 中的提交意图校验，不能强制等于目标运行原始 retryOfRunId。无 alias 的直接记录按自身 retryOfRunId 校验。

不使用当前生产 configFingerprint 去拒绝历史查询，也不让客户端提供 configFingerprint。存储中的 alias/target 指纹仍必须互相一致；旧配置只读恢复沿现有 get/replay 与 package freshness/identity 规则处理，不能续跑、延长租约或使过期包重新可用。拿到目标运行后沿现有 replay 完成过期/费用恢复，再投影 public view。测试必须证明 Provider、准入新预算和新增 Research audit 调用均为0；既有过期恢复/可信费用结算不是新付费调用。

## 浏览器恢复状态

新增 v2 本地恢复记录，最多2KiB、一个当前槽位，strict校验。包括非授权用途的 ownerHint、kind、mutationId、role、locale、retry sourceRunId，以及收到响应后的 runId（若有）。不存 Key、课程内容、原始请求响应或完整账户数据。ownerHint 只与当前登录状态匹配以避免错误显示，服务端永远不信任它。

Start/Retry 在发出付费 POST 之前先生成并持久化这一份身份；写失败时不发 POST，显示设备无法保存恢复信息并允许用户修复存储后再试。禁止静默退回“只在内存”却承诺可刷新恢复。一次明确提交只生成一个 mutationId，双击不生成第二个请求。

收到最终响应后，校验角色/locale及已知目标身份，再把该槽位更新为包含 runId。Retry 的 sourceRunId 是原任务，返回 runId 是继任任务或合法加入的活动任务，不误把它当作旧任务；随后恢复按新的目标查询。写入后响应及异步状态继续受现有 epoch、owner、abort 保护，旧请求不能覆盖新账户或新选择。

挂载/返回前台时，当前 owner 的 pending身份优先调用 recover；已确认runId沿现有GET查询。成功找回后更新runId并沿既有1→2→4→5秒上限轮询活动任务；自动轮询只查询，不调用Start/Retry。Not found、401、429、网络或结构错误停止自动轮询，保留身份并显示明确状态，供用户主动“Check research status”重查；NOT_FOUND不等于“服务端没收到”，不清空身份或自动提交。

此阶段保留隐藏/卸载时现有 abort 行为；回来恢复查询。它可能找回 Ready、仍进行中的任务或 interrupted，不能显示“后台必定继续”。真实退出或切换 owner 仍清除当前槽位/内存并立即遮蔽旧内容；初始session等待时不读取或展示恢复内容。跨账户传入复制的槽位也无法取得别人的服务端结果。

兼容 v1 `{runId,role,locale}`：首次读取只调用现有 owner GET，未经服务端确认不展示存储内容；成功后保存包含当前 ownerHint 的已知runId v2记录。由于旧记录没有mutationId，v2已知runId记录允许没有mutationId；它不能用于新的恢复POST。损坏、超长或不匹配owner的记录清除，不发请求。此兼容分支不创建任务。

## 用户交互与状态不明

在现有 Research 面板增加“正在查询上次任务”和“上次任务状态尚未确认”两种本地展示；正式 queued/researching/ready/failed 等服务端状态不改。状态不明时不显示把普通刷新理解成重新Research的按钮。优先提供查询状态和Use Flagship。

换角色、reset或进入Flagship可离开当前显示，但不得静默把pending任务解释为取消成功。若用户之后明确选择另一次付费提交且旧身份仍未确认，先展示一次具体说明：上一任务可能仍在运行或计费，开始新的任务可能另收费；只有明确选择“Start new research”才放弃旧恢复槽位并生成新mutationId。取消该选择保留旧槽位。该分支仍要通过原 eligibility/服务端预算与限流，不能作为账户额度旁路。恢复到正式可重试的终态后沿原显式Retry行为，并在发送前持久化新的retry身份。

退出会按既有隐私边界清除本机恢复线索；本阶段不新增跨设备任务列表，也不保证清除浏览器数据之后仍可从本机线索找回。用户主动丢弃线索不会取消服务端任务或退还未知费用。页面只解释这些实际影响，不展示调试字段或内部策略名称。

## 验证及实施边界

按现有子代理、TDD、每任务SPEC后QUALITY/安全及Root整合验收执行。优先复用现有合同/repo/orchestrator/API/client/hook/panel测试及SQLite/D1测试适配器，不发外网请求。

- repo/API：直接/alias/start/retry/合法加入活动任务、同mutation不同owner、伪造角色/源任务、损坏alias、跨旧配置、安全错误、Key缺失/AI关闭仍可查询、限流/body/UTF8/缓存头。
- 费用与执行：恢复活动任务、租约到期、已知/未知费用和重复查询；Provider research/repair始终0，新run/alias/新调用审计始终0，过期任务不复活。
- client/hook：POST recover正确接受200 active/ready/failed/needs-review；提交前存储顺序、存储失败0 POST、Start和Retry丢失响应后真正卸载/重新挂载、首次提交尚未落盘时NOT_FOUND、5xx/401/429、v1迁移、损坏storage、双击、owner切换、迟到响应、隐藏后回来。
- UI：状态不明时只查询、换角色/Flagship保留意图、新提交的明确提示、取消提示0 POST、正式Retry身份正确；正常Ready激活/计划路径不回归。
- 运行相关回归、类型/lint及Sites本地build；默认离线脚本仅在修改触及其合同或集成风险时重跑，不重做未变的525项诊断或新的真实验证。源码/build/回执冻结并独立审查。

本阶段预计触及研究合同、repo/orchestrator读取接口、recover route、client/hook及必要的Setup/面板交互；不改Provider内容合同、schema质量判定、付费策略、生产旗标/租约或数据库schema。若旧表不能支持上述查回，应先呈现具体新证据及设计修订，不顺手增加迁移。

## 后续进入发布的依赖

本阶段通过后，下一份设计处理成功请求策略迁移（low/32768/v2质量指令、10搜索、整个期限、预算、版本和配置指纹/缓存隔离）与实际执行能力。本站20分钟连接、断开后状态、持久执行绑定均保持未验证；任何探针或新托管方案须具体定义权限/数据/费用/关闭路径，再按现有授权边界推进。真实登录、目标环境学习流程、生产备份恢复、精确源码集成/GitHub备份和最终发布验收继续保留。
