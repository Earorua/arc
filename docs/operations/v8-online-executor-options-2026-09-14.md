# Arc v8 线上执行器：下一阶段方案依据

2026-09-14，只读源码与官方资料核对。此页为设计输入，不是批准后的实施规格，也不是托管实测。成功配置迁移的最终独立整合审查另行记录；本轮未创建服务、读取真实配置或发起 Provider 请求。

## 已消除与仍存在的差距

成功配置迁移已在当前源码提供显式 Kimi low / 32768 / 1200 秒 Provider / 1260 秒租约档，保留旧档。任务找回已有 owner 绑定的 mutation 恢复入口。不能再把旧调查里的“只有 120 秒、首次响应丢失无法找回”当成当前待实现功能。

但 `research-route-factories.ts` 的 mutation handler 仍等待 service 返回；`ResearchOrchestrator.start` 创建或重放后直接执行 `execute`，该方法内完成准入、预算、`produce`、校验、存储与回执。`produce` 直接等待 Provider。已有 recover/get 只查回状态并处理到期/结算，不能接续被终止的 Provider 执行。下一阶段必须处理这条实际执行链，而非仅在浏览器加轮询或给现有 POST 套一层后台请求。

## 当前能力依据

- HTTP Worker 在调用方保持连接时没有固定墙钟上限，响应结束或断开后相关工作可能被取消；`waitUntil` 最多延长 30 秒。Queue、Cron、DO alarm 每次上限 15 分钟，不能直接覆盖已批准的 20 分钟请求边界。[Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- Workflows step 墙钟无固定上限，但有 CPU 限制与配置期限；不支持 Workers for Platforms namespace。免费档每次 CPU 上限 10ms，不能未测量就保证适合整个 Arc 校验流程。[Workflows limits](https://developers.cloudflare.com/workflows/reference/limits/)
- 默认 step timeout 10 分钟、重试 5 次，不可直接照搬到付费 Research。更长明确期限、禁止不确定请求重发、持久发送标记和安全重复结算必须纳入设计。[Step timeout and retry](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/)
- Workflows 在 Free/Paid Workers 中均可用；按请求、CPU、步骤与存储计量。网络等待不耗 CPU，但不代表整项服务永远免费。实际账户计划及预算尚未确认。[Workflows pricing](https://developers.cloudflare.com/workflows/reference/pricing/)
- 本地 `.openai/hosting.json` 仅声明现有 `DB`、`PROOF_ASSETS`；本次可见 Sites 工具 24 项与 starter-capabilities 文档没有给出 Workflow 绑定配置操作。此为能力未确认，不能推导“Sites 绝对不支持”，也不能把独立 Cloudflare 账户内的绑定当成本站已存在。

## 三种路径

| 路径 | 能提供的行为与主要代价 | 当前判断 |
| --- | --- | --- |
| 保留 Sites 页面及账户/学习数据，独立后台执行 Research | 浏览器离开后仍由持久执行器处理；需受认证的任务交接、结果持久保存与取回、费用对账，以及单独账户/服务配置 | 优先继续设计，符合稳定完成的目标；尚未选定或创建实际服务 |
| 整站迁到自行管理的 Cloudflare 部署 | 可直接管理所需绑定，但需额外迁移 OAuth、DB/R2、域名及备份恢复 | 变更范围更大，当前不推荐作为第一步 |
| 保持现有 Sites 同步 HTTP | 实施较少，但依赖连接；须受保护、零 Provider 的实际持续连接和断开演练 | 仅在用户接受连接依赖并通过平台实测后考虑，不能冒充离开后继续 |

独立后台方案不能只从 Workflow 调用现有同步网站 POST：该网站 Worker 仍可能被终止，且完成回执、租约、收费与重复投递边界仍未解决。应明确准入/预算归属、执行所有权、发送前持久标记、最少任务数据、固定服务端策略、受认证结果交接及过期后的仅结算行为。崩溃发生在发送标记与外部请求之间时，宁可保守记录不确定并拒绝自动重发；不得宣称外部收费“恰好一次”。

## 下一份设计前待确认

已向用户询问是否有自己的 Cloudflare 账户，尚待回复；不需要账户 ID、Key、付款资料或登录凭据。先确认可用托管范围，再形成具体服务、数据/秘密边界、费用上限、关闭方式和验收方案。方案批准前不实施新执行器或修改生产。真实登录、学习/Proof 持久化、生产备份恢复、GitHub 源码备份及正式发布验收继续保留。
