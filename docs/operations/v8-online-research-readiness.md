# Arc v8 线上 Research 接入调查

2026-09-13 当前：第十七次完整本地真实Research已PASS，用户实际ExitCode0，85.685秒、8次搜索、USD0.219672可信结算、Ready/质量/测试账户激活/计划7/隔离/清理通过。结果见v8-seventeenth-success-result-2026-09-13.md；许可已消耗，没有第十八次。本地诊断与候选无需重做。此处及后文旧十分钟、旧请求失败、待授权/待实施状态是历史，当前成功候选为low/32768及1200/1260/1320秒。

最新只读源码审查确认：生产factory及Provider两处120秒上限、60秒租约、12000输出仍在；strict JSON schema本来就已共享，不能把它列为线上缺失功能。此次85.685秒成功仍超过生产租约。恢复服务无真实Provider，但GET/replay可以执行过期状态和费用恢复，不能称绝对零D1写入。下一阶段草案为 `../superpowers/specs/2026-09-13-arc-v8-research-recovery-design.md`，先补同一任务找回，尚未批准或实施；不据此选择执行器或放开公开Research。平台20分钟链路和持久绑定仍未验证。

2026-09-12 新执行器约束：已核对官方现行文档，Queue consumer/Cron/DO alarm的15分钟墙钟上限不能直接承接当前20分钟单次Provider期限；Workflows虽无平台step墙钟上限，仍有默认10分钟timeout/重试，且不能部署进Workers for Platforms namespace。当前Sites接口未确认其接入能力；不能把通用Cloudflare能力视作本站已支持。证据与源码接入约束见v8-online-executor-constraints-2026-09-12.md。没有改变模型/期限/生产环境；本地格式诊断设计仍待批准。

2026-09-12 当前衔接：第十五次已执行且许可消耗，用户确认ExitCode1；HTTP200后1100字节外层JSON解析失败，303534ms，usage未知，未进入候选/课程质量。详见v8-fifteenth-transport-result-2026-09-12.md。已有本地1529项/双审/build/离线成果保留；只读及六个合成案例调查完成，本地响应格式观察设计已独立审查READY、待用户批准、未实施。当前没有第十六次/重试/生产发布许可，完整真实Research和公开发布未完成。以下旧执行等待及参数仅为历史。

2026-09-12 上线依赖复核新增结论：当前生产factory不仅限制120秒/60秒租约，仍使用标准12,000输出tokens，未注入本地low推理档或v2质量请求规则。因此第十五次本地结果不能通过“只提高线上timeout”直接迁移；后续线上设计必须显式包含请求策略、输出额度、推理档、配置指纹和缓存隔离的迁移验证。正式观察器仍不注入生产。源码与完整目标证据缺口见 `v8-public-release-evidence-gap-2026-09-12.md`；没有修改生产或应用源码。

2026-09-11 本地策略更新：用户已批准质量/稳定完成优先的32768输出候选，Provider1200秒、租约1260秒、启动器1320秒；实施与验收见 `v8-output-budget-validation-2026-09-11.md`。第十二次仍为length失败，无第十三次真实许可。下面600/660/720与十分钟文字是此前调查基线，不是新候选参数或新的线上验证证据。

后续线上设计必须针对新真实候选的实际时长与更长边界重新核验，不能把本地20分钟期限直接复制到生产后宣称稳定。用户把稳定性列为首要需求，独立持久执行器、响应流与可恢复HTTP三种方案仍须按真实托管能力/断线行为比较；成本或改动量较小不能替代完成可靠性。现有生产factory/浏览器中断/首次runId时机未因本地修改而改变。当前没有发平台探针、改公开入口、配置生产绑定或再次读取Sites远端状态。

## 此前平台调查及待验证条件

2026-09-09，只读调查，2026-09-10 补充本地验收结果与工具文档核对。此文是首版公开发布目标的准备证据，不是已批准的线上实现规格，也不证明线上 Research 已开启。当前本地 Kimi low 候选的实施和验证单独记录在 `../superpowers/plans/2026-09-09-arc-v8-kimi-budget-timeout.md`。

## 当前结论

长于两分钟的 Research 在 Cloudflare Workers 上并非天然不可行，但当前应用的生产参数和浏览器恢复行为不能直接承接本地十分钟候选。先完成一次有完整结果和数值费用的真实本地验收，再确认 Sites 实际请求链路，选择最小可行的线上方案。不能只把一个 timeout 改大或直接开启旗标。

Root 已重新读取 Sites 站点和精确 version 10 元数据：站点 active、当前用户 owner、访问 public，公开地址为 `https://arc-precision-path.jiahe-xu.chatgpt.site`。version 10 的源码为 `2b0ed9376e8693250277c194c297076ff975a257`；保存归档格式 tar、108 文件、9,072,640 bytes，服务端记录 SHA256 为 `1ecee28f71966e3db1ab45c6f165794db7040c6ba8292b67771b1c2bbf11fc3a`。这些是来源元数据，不是本轮下载/恢复/重新部署成功的证据。未读取生产秘密、调用 Provider、修改 DB/R2、保存版本或部署。

本地既有 `outputs/releases/arc-v8-cd2b9ab-source.tar` 仍存在，8,017,920 bytes，重新计算 SHA256 为 `e4962227af841fa2493f0b5451a20c2ceaf8df8f6e84710624d8215a6d56c236`。它与 Sites 服务端保存归档的字节/哈希不同，不能宣称两者逐字节一致；本轮也没有将旧归档当成当前未提交源码的备份。

## 平台边界：已知与未知

- Cloudflare 官方说明，HTTP Worker 在客户端保持连接时没有固定的墙钟执行上限，网络等待不计作 CPU 时间；客户端断开后，相关任务可能被取消。该能力不等于 Sites 已经验证支持任意十分钟请求。[Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- `waitUntil()` 在响应结束或断开连接后最多延续 30 秒；不能把它当成十分钟后台任务的可靠执行器。较长脱离客户端的任务需要独立执行机制。[Execution context](https://developers.cloudflare.com/workers/runtime-apis/context/)
- Sites 本站实际 CPU 配额、前置网关/适配器等待期限和长请求表现尚未取得证据。现有 Sites 工具及本地 manifest 提供 DB/R2，但没有可据此确认的 Queues、Workflows 或 Durable Objects 配置能力。Cloudflare 产品存在不代表 Sites 自动提供对应绑定。
- 2026-09-10 只读核对更新后的 Sites 0.1.66 本地 building/hosting 环境及 persistence 文档和当前工具清单，仍未找到可据此确认的 Queues/Workflows/Durable Objects 绑定操作或本站 HTTP 等待期限；保持“未验证”，不推导平台绝对不支持。没有调用生产环境、数据或写入工具。
- 现有 Provider 是 `stream:false`。OpenRouter 说明非流式请求在本地断开后仍可能继续生成和计费；没有最终可信回执时，保持费用未知和保守预算占用。[OpenRouter cancellation](https://openrouter.ai/docs/api_reference/streaming)

## 实际代码约束

| 部位 | 当前行为 | 下一方案必须解决的事项 |
| --- | --- | --- |
| `app/server/research/service-factory.ts` | 显式生产 Research/Repair 时限均限制在 1..120000 ms；活动租约固定 60000 ms。生产配置必须完整通过校验 | 为获准模型协调 Provider、整个应用工作和租约期限；配置指纹必须包括新策略。不能借本地 factory 绕过生产配置和预算准入 |
| `app/server/http/research-route-factories.ts` | Start/Retry 返回前等待整个 service 调用完成 | 明确使用同步等待、响应流还是独立执行器；每种路径都必须保持身份、origin、限流、cohort、幂等和预算门槛 |
| `app/lib/use-role-research.ts` | 标签页隐藏/组件卸载时 stop() 会 abort；首次 runId 只在 POST 最终返回后持久化；mutationId 仅在 controller 内存中保留 | 分开处理“暂停轮询”和“取消首个付费操作”；首次响应丢失后也能以 owner 绑定的身份查回运行，不能自动发起新付费任务 |
| `app/server/research/orchestrator.ts` | GET 可以将过期活动运行变为 interrupted 并对账；它不会重新执行 Provider；过期 CAS 不能发布 Ready | 恢复入口仍不能重启已执行/状态不明的请求。晚到可信费用可审计/结算，但不能复活已过期运行或生成计划 |
| 当前公开产品 | 网站 public、Research 关闭，开发提示保留；Google/GitHub 登录后完整使用验收尚未完成 | 先在明确 cohort/预算内核验真实结果，再启用对应入口；验证现有计划、Proof 和关闭入口后的读取连续性 |

## 可选路径及取舍

恢复设计的额外源码依据：当前 `D1ResearchRepository` 已持久保存 owner + mutation 的幂等别名，但查询封装为创建/重放的私有路径，公开 GET 仍要求先知道 runId。后续可复用既有别名建立只读恢复查询，不能以重发创建 POST 代替恢复。设计需覆盖首个 POST 与 Retry 丢失响应两种情况、输入/原运行绑定、旧配置下已存在记录的读取，以及返回 NOT_FOUND 时不得自动补发付费请求。浏览器保存的恢复身份不是服务端授权；服务端始终从已登录 session 确定 owner。此处仅记录设计依据，尚未新增接口或改变存储格式。

1. **有界 HTTP 等待，补齐恢复身份和浏览器生命周期。** 当前平台文档支持其可行性，复用最多。切换标签页应停止轮询而非主动打断正在等待的首个请求；刷新/离开后查回已创建运行，不保证后台一定完成。需要通过同一 Sites 请求链路的无 Provider 延时演练，验证实际时长、断开后的状态和不会重复扣费。若实测无法维持请求，则不能采用。
2. **响应流承载状态和最终结果。** 可尽早交付 runId 并持续输出状态；这仍依赖客户端连接，并不自动成为可靠后台任务。新增协议、字节边界、错误/最终回执解析和断线恢复工作较多；对 OpenRouter 上游流式支持也必须单独验证。
3. **独立持久后台执行器。** 可以把任务生命期从浏览器连接中移出，适合明确要求关页后继续执行的版本；但须先确认真实可用的托管/绑定及预算，设计重复投递和状态不明时不重复请求的约束。不能假定 Sites 已有该能力或让本机常驻充当线上服务器。

当前倾向先验证路径 1 的平台条件，最终选择依赖完整本地 Research 的耗时/回执和 Sites 延时演练。这里没有授权或实施临时公开诊断接口；具体探针需要包含访问保护、固定时长、零 Provider/数据写入、关闭机制和候选来源，并纳入下一份可审阅设计。

## 进入线上实现前的具体证据

1. **本地候选已完成（2026-09-10）：** TDD、规格后质量双审及整合审查通过；实际默认离线 PTY 退出 0，Summary `summary-2026-09-09T17-31-00-699Z.json` 核对 passed/0 real requests，原审批阻碍解除。错误根 JSON/非标准语法/编码在 Key 前拒绝由前轮双主机回归证明。离线数据仍不计作真实 Provider 验收。
2. 用户明确授权的新一轮本地测试：专用未使用且非循环 USD 5 上限 Key，至多 Key GET 1 + Research POST 1，Kimi low / 600 秒 Provider / 660 秒租约 / 720 秒启动器，无 Repair 或自动重试。安全 Summary 需包含 Ready、来源/技能/计划、owner/第二次调用拒绝、数值费用与完成回执。失败先记录；不重复要求账户完整导出。
3. 整理具体线上候选设计：运行生命周期、恢复查询身份、账户隔离、费用未知行为、固定预算/cohort、关闭入口、平台无费用探针以及真实登录后的验收路径；得到用户对具体行为的批准后再按既有子代理/TDD/双审实施。
4. 公共发布前核对精确源提交、构建/归档、兼容保留版本、生产配置与恢复能力；无法证实的 D1/R2 原生恢复能力保持未验证，不能用表数或 archive 元数据替代。

本调查没有重做已通过 Tasks 1–12、本地用户验收或旧恢复演练。后续只针对新行为和真实目标环境补足必要证据。
