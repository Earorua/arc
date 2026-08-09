# Arc. v8 Product Intelligence Implementation Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Arc. 从可交互的 v7.2 学习体验升级为可信、个性化、可持续调整的职业学习系统，同时保持现有登录、账户隔离、设备迁移和 Proof 隐私边界不回归。

**Architecture:** 采用 `Trusted Intelligence Kernel + OpenRouter Augmentation`。内置 Flagship 岗位、资源注册表、图验证、规划算法和 Proof 状态机组成确定性内核；OpenRouter 只在认证、授权、预算和质量门槛内生成 Research Beta 候选数据。所有 AI 输出先进入严格契约和来源审计，再进入规划闭环；AI 不直接授予 `Verified`。

**Tech Stack:** TypeScript 5.9, React 19.2, Vinext/Next 16 compatibility routes, Zod 4, Drizzle ORM 0.45 + Cloudflare D1, Cloudflare R2, Better Auth 1.6, OpenRouter API, Vitest 4, Testing Library, ESLint, OpenAI Sites.

---

## 1. 路线图边界

本文件负责锁定 v8 的阶段顺序、跨阶段不变量、验收门槛和回滚边界。每个阶段在开始实现前必须有独立的详细实施计划；不得把本路线图当作跳过测试驱动开发的授权。

v8 不重写 Better Auth，不更换现有 D1/R2 绑定，不删除 v7.2 数据，也不在本版本加入支付、社区、排行榜、用户 BYOK 或多 Agent 架构。

## 2. 不可回归的不变量

- 未登录访客始终可以体验内置 `AI-Native Full-Stack Engineer` 岗位的审计、路线和 Today 示例。
- 实时 Research Beta、云端保存、Proof 上传和跨设备同步继续要求认证。
- 任意用户数据查询都必须由服务端会话解析出的 `userId` 限定；客户端不能指定归属用户。
- OpenRouter 密钥只存在于服务端环境变量；不得进入浏览器 bundle、响应、日志、D1 或错误信息。
- OpenRouter 不可用、未配置、超时、超预算或输出不合格时，Flagship 闭环仍然可用。
- 完成学习单元只能产生 `self-reported` 或 `submitted` 证据，不能直接产生 `verified` 技能。
- 公开 Proof 继续使用独立的最小字段快照；私有对象键、邮箱、内部 ID 和 AI 输入不得泄漏。
- 所有新状态都要有显式版本，迁移必须向前兼容 v7.2 本地状态和云端状态。

## 3. 阶段顺序与交付物

### Phase 1 — Trusted Intelligence Kernel

详细计划：`docs/superpowers/plans/2026-08-10-arc-v8-intelligence-kernel.md`

交付：版本化岗位蓝图契约、Flagship 资源注册表、依赖图与资源质量验证器、D1 情报表、只读 API、升级后的 Stack 可信来源视图。

退出门槛：Flagship 数据可被严格解析；技能图无环且引用完整；每项技能至少有一个可追溯资源；付费核心资源必须有免费替代；访客路径无网络依赖。

**2026-08-10 实现记录（最终质量门槛前）：**

- [x] 已实现 canonical、versioned Flagship 契约，以及可确定性重建的 16 项技能与资源注册表。
- [x] 已实现引用、依赖图、阶段覆盖、资源反向链接与付费资源免费替代策略验证。
- [x] 已生成六张非个人 D1 情报表及增量迁移，并用静态测试锁定表、索引、外键和只增不减边界；这些表仅为未来版本发布预留，尚未迁移生产，也不是当前读取源。
- [x] 已实现只返回通过契约、发布状态、slug 与策略验证数据的 guest-safe、read-only Flagship endpoint。
- [x] Stack 已展示资源 language、cost、format、source tier 与 verification date，并把 confidence 明确为 curated claim confidence，而非 learner mastery。
- [x] 当前聚焦验证通过：11 个测试文件、82 项测试；这是 Task 1–6 的实现证据，Task 7 另由文档边界审计验证；两者都不是 Phase 1 最终验收证据。
- [ ] Task 8 完整单元、类型、lint、build、渲染、bundle 审计与最终代码审查仍待执行；因此 Phase 1 尚未标记完成。
- [ ] Phase 2 尚未开始；尚未实现的是本阶段定义的岗位研究驱动完整路线、滚动每日计划与基于学习事件的自适应重排，现有 v7 proportional path 与 custom role text 不受此状态判断影响。

Phase 1 不要求也不读取 `OPENROUTER_API_KEY`，确定性 Flagship 路径不发起 OpenRouter 请求。Live Research Beta 保持关闭，D1 生产迁移、功能旗标、推送、合并和部署均不在本记录内。

### Phase 2 — Adaptive Planning Loop

计划文件将在 Phase 1 合并并复核实际契约后编写，目标路径：
`docs/superpowers/plans/2026-08-10-arc-v8-adaptive-planning.md`

交付：快速技能审计、可选证据入口、周一至周日分钟模板和休息日、完整路线、滚动七日计划、Today 可交付单元、完成/延迟/太难/已掌握后的确定性重排以及变更摘要。

退出门槛：相同输入得到相同计划；前置依赖不被越过；每日分钟不超预算；休息日不排任务；事件重放能重建计划状态；本地访客与云端用户行为一致。

### Phase 3 — Proof-backed Stack

计划文件将在 Phase 2 合并后编写，目标路径：
`docs/superpowers/plans/2026-08-10-arc-v8-proof-backed-stack.md`

交付：Proof 版本、审核状态机、技能证据聚合、`exploring / practicing / demonstrated / verified` 技能状态、公开快照升级和旧 `verified` 布尔值的安全迁移。

退出门槛：学习完成不再自动验证；每个技能状态都能追溯到事件和 Proof；拒绝或撤销 Proof 会重算状态；公开数据仍是允许字段快照。

### Phase 4 — OpenRouter Research Beta

计划文件将在 Phase 3 合并后编写，目标路径：
`docs/superpowers/plans/2026-08-10-arc-v8-openrouter-research-beta.md`

交付：OpenRouter provider、固定任务模型策略、来源检索和规范化、结构化输出、一次受控修复、成本与速率闸门、结果缓存、Research Beta 状态和 Flagship 确定性降级。

退出门槛：仅认证且获准的用户能触发；密钥不泄漏；所有结果带来源和模型审计；失败不消耗已接受配额；不合格结果不能进入规划；重复请求幂等。

### Phase 5 — Production Validation & Controlled Beta

计划文件将在 Phase 4 合并后编写，目标路径：
`docs/superpowers/plans/2026-08-10-arc-v8-production-validation.md`

交付：全链路回归、安全/隐私测试、可访问性与响应式 QA、成本观测、功能旗标、管理员启停、回滚说明、受控账户验收和公开部署候选。

退出门槛：单元、集成、渲染、类型、lint、build 全绿；OAuth/账户关联/设备迁移回归通过；OpenRouter 关闭时 Flagship 全闭环通过；部署仍需用户单独批准。

## 4. 阶段依赖

```text
Phase 1 可信岗位与资源数据
   ↓
Phase 2 审计、路线、七日计划与重排
   ↓
Phase 3 Proof 状态机与证据化 Stack
   ↓
Phase 4 OpenRouter Research Beta
   ↓
Phase 5 生产验收与受控发布
```

这一顺序是数据依赖，不是视觉优先级。Phase 2 必须消费 Phase 1 的最终蓝图契约；Phase 3 必须消费 Phase 2 的学习事件；Phase 4 生成的数据必须通过 Phase 1 的同一验证器；Phase 5 才允许修改生产功能旗标。

## 5. 数据迁移策略

- 只做增量迁移：从 `drizzle/0002_product_intelligence.sql` 开始，不重写 `0000` 或 `0001`。
- 新字段优先采用并行读写和版本适配，确认 v8 路径稳定后再停止旧字段写入。
- v7.2 的 `career_goals.weekly_minutes` 保留为兼容汇总；逐日可用时间存储为新版本化 JSON 或子表，由 Phase 2 计划锁定。
- v7.2 的 `proof_items.verified` 在 Phase 3 之前保持只读兼容；任何新完成事件不得据此自动写入 `true`。
- 所有迁移先在本地 D1 生成并测试，再在预览环境验证；生产迁移与公开部署必须再次获得用户批准。

## 6. 每阶段的标准验证门槛

每个阶段至少执行并记录：

```powershell
npm run test:unit
npx tsc --noEmit
npm run lint
npm run build
node --test tests/rendered-html.test.mjs
```

预期：所有命令退出码为 `0`。若阶段引入数据库迁移，还必须运行迁移静态断言和 D1 本地 smoke test；若引入外部服务，还必须使用无真实密钥的契约测试和一个经用户批准的受控线上测试。

## 7. 提交、审查与发布规则

- 每个详细计划中的任务按 TDD 顺序执行：先写失败测试，再写最小实现，再运行聚焦测试。
- 每完成一个可独立回滚的任务就提交；提交不能混入无关文件。
- 每个阶段完成后使用 `superpowers:requesting-code-review` 进行代码审查，修复后再跑完整验证。
- 只有完整验证有新鲜证据时，才能使用 `superpowers:verification-before-completion` 声明阶段完成。
- Phase 1–4 默认只允许预览部署或本地验证；任何公开部署都必须由用户明确批准。
- OpenRouter 真实请求、D1 生产迁移、R2 生产写入和公开功能旗标变更都属于独立发布动作，不能由“批准计划”推断授权。

## 8. 计划维护规则

- 开始下一阶段前，先读取本路线图、已批准规格和上一阶段完成记录。
- 下一阶段的详细计划必须引用当时真实存在的文件和最终类型，不使用推测路径或占位符。
- 如果实现证据迫使产品决策变化，先更新规格并取得批准，再更新路线图。
- 若某阶段未通过退出门槛，不得以版本号推进代替问题修复。

## 9. 路线图完成定义

只有当五个阶段全部通过各自退出门槛、v7.2 回归验证通过、受控 Beta 验收完成且用户批准公开部署时，Arc. v8 才能标记为完成。在此之前，界面和文档必须准确显示对应阶段或 Beta 状态。
