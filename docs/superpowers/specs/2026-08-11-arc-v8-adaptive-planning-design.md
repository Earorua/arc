# Arc. v8 Adaptive Planning Loop 设计规格

日期：2026-08-11

状态：交互设计与书面规格已于 2026-08-12 获用户批准；详细实施计划已编写，待用户审阅

版本基线：本地 `master` 检查点 `fa9bc6c`，Phase 1 完成提交 `a3df268`

设计方向：Event-sourced Deterministic Planning Kernel

## 1. 文档目的

本规格定义 Arc. v8 Phase 2 `Adaptive Planning Loop` 的产品体验、领域契约、规划规则、持久化边界、错误恢复、测试和退出门槛。它消费 Phase 1 已验证的 `RoleBlueprint`，不重新设计岗位情报、登录、Proof 或 OpenRouter。

本阶段首先为内置 `AI-Native Full-Stack Engineer` Flagship 岗位交付完整自适应闭环。自定义岗位文本和 v7 proportional path 继续兼容保留；在 Phase 4 Research Beta 提供通过 Phase 1 验证器的岗位蓝图前，Phase 2 不用未经验证的自定义岗位数据生成“可信完整路线”。

本文件批准设计，不授权写功能代码、执行生产 D1 迁移、修改功能旗标、推送远程或公开部署。

## 2. 目标与非目标

### 2.1 产品目标

- 用快速、诚实的技能审计替代单一总体水平对个人能力的粗略推断。
- 把 Phase 1 的技能依赖、资源和掌握标准转换为完整路线与可执行的 Daily Units。
- 根据用户当地日历、逐日空闲时间、休息日和临时例外生成滚动七日计划。
- 让完成、延期、太难、已掌握和时间变化产生确定、可解释、可恢复的重排。
- 保护已完成历史，并让任意当前状态都可由版本化输入和事件重放重建。
- 让 Guest 本地模式与登录用户云端模式使用同一规划结果。
- 保持 v7 Setup、custom-role text、登录、设备迁移、Proof 隐私和现有数据不回归。

### 2.2 非目标

- 不调用 OpenRouter，不进行任意岗位实时研究。
- 不抓取 GitHub、部署站点或其他外部链接内容。
- 不上传文件，不写 R2，不实现 Proof 版本或审核状态机。
- 不授予 `Demonstrated` 或 `Verified` 技能状态。
- 不升级公开 Profile，不实现社区、排行榜、支付或日历集成。
- 不执行生产迁移、修改生产旗标或公开部署。

## 3. 已批准的产品决策

1. 技能审计采用逐技能四级自评：`unseen`、`conceptual`、`guided`、`independent`。证据元数据与自评等级分开保存。
2. 工期不足时同时给出“保持完整范围、延后日期”和“保持目标日期、暂缓非核心能力”两套方案，由用户确认。
3. 核心技能及其传递性前置依赖不能被目标日期方案移除；若它们仍无法在目标日期内完成，系统明确判定该日期不可行。
4. Today 每天只有一个主要可交付单元；剩余时间只提供一个可选 Stretch，不以填满时间为目标。
5. 完成与提前完成自动滚动七日窗口；延期、太难、已掌握和时间变化先生成候选差异，用户确认后才替换有效计划。
6. 七日窗口是从用户当地“今天”起的连续七个日历日。休息日保留在时间轴中并明确显示 `Rest`。
7. 自评 `independent` 的技能缩短为校准关卡，而不是直接消失。校准完成可以解锁依赖，但不等于正式验证。
8. 可选证据只接受公共 HTTPS 链接、类型和简短说明；不抓取、不上传、不调用 AI，也不直接证明掌握度。
9. 架构采用事件溯源式确定性规划内核，而不是快照式隐式重算或可变任务队列。

## 4. 产品体验

### 4.1 Setup

Setup 由五个阶段组成，每个阶段只回答一个主题：

1. `Role`：选择 Flagship 岗位，或保存自定义岗位文本。
2. `Audit`：按技能类别完成四级自评，并可选择添加轻量证据元数据。
3. `Availability`：设置 IANA 时区、周一至周日分钟数、休息日和临时不可用日期。
4. `Target`：确认目标周数，并在冲突时比较完整范围与目标日期方案。
5. `Build`：确定性生成完整路线和滚动七日计划，只展示真实计算阶段。

审计按 `foundations`、`frontend`、`backend`、`data`、`quality`、`cloud`、`ai`、`product` 分组。类别级快捷选择必须可回看、可逐项覆盖，并明确标记为用户自评。现有 v7 `level` 继续作为兼容摘要，但不得静默转换成用户没有确认过的逐技能掌握声明。

### 4.2 Workspace

- `Today` 回答“今天有限时间里最值得交付什么”，只突出一个主要成果。
- `Path` 展示完整技能范围、依赖原因、当前阶段、校准关卡、暂缓范围和预计完成区间。
- `Next 7 days` 展示连续七个日历日，包括明确的休息日和日期例外。
- `Change summary` 展示新增、移动、移除和保持不变的内容，以及预计完成日期变化。
- `Stack` 继续展示 Phase 1 的岗位能力与资源证据；Phase 3 前不把 Phase 2 自评冒充为已证明能力。

Guest 可以在本机完成 Flagship 审计、路线、七日计划和重排。登录只改变持久化和跨设备能力，不改变规划算法或同一输入的结果。

### 4.3 自定义岗位兼容

自定义岗位文本继续可输入、保存和显示，并继续使用 v7 proportional path。界面必须说明完整审计与自适应计划当前仅适用于已验证 Flagship 蓝图；不得把 Flagship 技能图替换标题后伪装成任意岗位路线。

## 5. 领域架构

规划内核是纯 TypeScript 模块。它不读取登录状态、D1、Local Storage、浏览器当前时间、网络或环境变量。调用方必须显式传入所有会影响结果的数据。

```text
Validated RoleBlueprint + Flagship Unit Registry
                    ↓
Skill Audit + Availability + Target + Planning Date
                    ↓
         Deterministic Path Builder
                    ↓
       LearningPathVersion + alternatives
                    ↓
         Deterministic Day Scheduler
                    ↓
              PlanVersion
                    ↓
        Append-only Learning Events
                    ↓
      Replay → Replan Candidate → PlanDiff
```

领域边界分为：

- `Audit`：自评与轻量证据元数据。
- `Availability`：时区、周模板与日期例外。
- `Unit Registry`：人工策划、版本化的 Flagship 单元模板。
- `Path Engine`：技能范围选择、依赖排序、校准替换与完成区间估算。
- `Planning Engine`：逐日预算分配、七日窗口与 Stretch 选择。
- `Event Reducer`：事件重放和不可变历史保护。
- `Plan Diff`：候选版本与有效版本之间的稳定差异。
- `Repository`：本地与 D1 适配，不包含规划规则。

## 6. 核心契约

### 6.1 Skill Audit

每个 Flagship 技能必须有且只有一项审计答案：

```ts
type SkillSelfLevel = "unseen" | "conceptual" | "guided" | "independent";

type SkillAuditAnswer = {
  skillId: string;
  level: SkillSelfLevel;
  evidenceRefs: string[];
};
```

轻量证据包含稳定 ID、技能映射、`repository | deployment | project | document | other` 类型、公共 HTTPS URL 和最多 300 字符说明。每项技能最多三个证据引用；证据不包含抓取正文、私有对象键、访问令牌或验证结果。

完整 `SkillAuditVersion` 记录审计 ID、Schema 版本、蓝图 ID/版本、答案、证据元数据、创建方式和输入指纹。审计不存储 `verified` 布尔值。

### 6.2 Availability

```ts
type WeekdayMinutes = {
  monday: number;
  tuesday: number;
  wednesday: number;
  thursday: number;
  friday: number;
  saturday: number;
  sunday: number;
};
```

单日分钟数必须是 `0` 或 `15..720` 的整数；`0` 表示休息日。七日合计必须保持在现有兼容范围 `30..2400`。时区必须是运行时支持的 IANA 标识。日期例外使用唯一 ISO 日历日期、覆盖分钟数和可选简短原因；最多保存未来 365 天内的 90 项例外。

`weeklyMinutes` 始终由七日模板求和生成，不成为第二个可独立编辑的权威输入。

### 6.3 Planning Target

目标周数继续使用 v7 的 `4..52` 整数范围。冲突时系统生成：

- `full-scope`：包含全部 Flagship 能力，完成日期可延后。
- `target-date`：保留全部 core 技能及其传递性前置依赖，按稳定规则暂缓其他技能。

目标日期方案的暂缓顺序为：先 `advantage`，再非前置的 `strong`；同级按阶段、蓝图顺序和技能 ID 稳定排序。不能暂缓任何 core 技能，也不能暂缓被保留技能所依赖的技能。

### 6.4 Flagship Unit Registry

Phase 1 蓝图定义技能、掌握标准和资源，但不足以独立产生高质量学习步骤。Phase 2 增加版本化、人工策划的 Flagship Unit Registry。

每项技能至少包含：

- 一个或多个 `learn` 单元；
- 一个 `calibrate` 单元；
- 可选 `reinforce` 单元，用于 `too_hard`；
- 对应 Phase 1 资源 ID；
- 能力目标、为什么现在学、分时步骤、构建任务、完成标准、Proof 要求和 Rubric；
- `15..180` 分钟的估算；
- 可稳定拆分的检查点，而不是运行时任意切断文本。

Registry 必须覆盖全部 16 项 Flagship 技能。资源只能通过 Phase 1 resource ID 引用；缺失或悬空引用使整个 Registry 无效。

### 6.5 Path、Plan 与 Daily Unit

`LearningPathVersion` 至少包含：

- 蓝图与 Registry 版本；
- 审计、Availability 和 Target 输入版本；
- 所选范围模式；
- 有序阶段与有序单元；
- 暂缓技能及明确原因；
- 预计开始与完成日期；
- 输入指纹和 Schema 版本。

`PlanVersion` 至少包含不可变版本 ID、`initial | automatic | proposed` 生成类型、基础版本、重排原因、七个日历日、Daily Unit 引用、输入指纹和可读摘要。`active`、`pending` 与历史版本关系由 workspace 的版本指针和决策事件派生，不通过修改计划正文表达。

`DailyUnit` 必须包含能力目标、`whyNow`、主要及替代资源、分时步骤、构建任务、完成标准、Proof 要求、Rubric、预计分钟、技能 ID、类型和稳定模板版本。每天最多一个 required primary unit；Stretch 不计入必需完成时间或预计完成日期。

## 7. 确定性规划规则

### 7.1 路线构建

1. 严格解析 Role Blueprint、Registry、Audit、Availability 和 Target。
2. 验证 Registry 覆盖、资源引用、分钟边界和稳定 ID 唯一性。
3. 根据自评选择 `learn` 或 `calibrate` 单元；`independent` 不直接跳过技能。
4. 从 Phase 1 依赖图生成稳定拓扑顺序。
5. 按阶段、依赖、重要性、蓝图顺序和 ID 处理可并列技能。
6. 生成 full-scope 路线，并在需要时生成 target-date 替代路线。
7. 估算可用学习日和预计完成日期，不突破逐日预算。

若 target-date 连 core 技能和传递性前置依赖都无法容纳，系统只返回 full-scope 作为可行方案，并明确说明目标日期不可实现；不得压缩分钟、越过依赖或伪造可行日期。

### 7.2 日程分配

七日窗口从显式 `planningDate` 起覆盖七个当地日历日。日期例外覆盖周模板；没有例外时使用对应 weekday 分钟。`0` 分钟日显示 `Rest`。

Scheduler 只把完整单元或 Registry 声明的检查点放入能够容纳它的日期。若当天剩余时间不足，不拼接不可验证的半个单元。只有在 primary unit 之后仍有足够时间、依赖已满足且存在适配模板时，才显示一个 Stretch。

同一合法输入必须产生相同的路线顺序、日期分配、单位 ID、指纹和核心差异。`createdAt`、Request ID 等运行元数据不进入领域结果指纹。

## 8. 学习事件与重排

事件是追加式事实，至少包含事件 ID、mutation ID、workspace sequence、目标/计划版本、unit ID、类型、结构化 payload 和发生时间。sequence 由 repository 在每个 workspace 内原子分配，Guest 使用持久化单调计数器；发生时间只用于审计，不参与事件排序。

事件语义：

- `completed`：锁定单元及其历史位置，记录可选实际分钟，自动接受滚动后的新七日窗口。
- `delayed`：生成把该单元移动到下一个合格日期的候选，并顺延受影响依赖。
- `skipped`：保留跳过事实，行为等同需要用户确认的重新安排，不等于完成。
- `too_hard`：在目标单元前插入 Registry 的 `reinforce` 单元；没有合法补强模板时保留原计划并返回可执行错误。
- `already_known`：把该技能尚未完成的教学单元替换为一个校准关卡；不直接解锁依赖。
- `availability_changed`：使用新 Availability 版本重排所有未完成单元。
- `replan_accepted`：引用候选计划和 base revision，把候选原子设为活动计划。
- `replan_discarded`：引用候选计划，明确记录它没有改变活动计划。

除 `completed` 外，学习事件先产生 proposed 计划和 `PlanDiff`。用户接受或放弃时追加对应决策事件；接受动作原子更新活动计划指针，放弃动作保留旧活动计划。事件重放同时消费学习事件和决策事件，因此可以区分“候选仍待处理”“候选已接受”和“候选已放弃”，不会因保留历史而反复应用已放弃候选。

PlanDiff 以稳定 unit ID 比较，输出 `added`、`moved`、`removed`、`unchanged`、原日期、新日期、原因和预计完成日期变化。已完成单元只能出现在 `unchanged`。

## 9. 本地与云端持久化

### 9.1 Guest local state

Phase 2 使用新的版本化本地键，不覆盖 `arc-demo-state-v1`。本地 envelope 保存当前输入版本、活动路线、活动/候选计划、Daily Units、事件流和迁移标记。

首次升级采用 read-validate-write：

1. 读取并严格解析 v7 状态。
2. 生成 Phase 2 兼容输入，不把总体 `level` 静默提升为技能审计答案。
3. 在内存中构建并验证完整 Phase 2 envelope。
4. 只在全部成功后写入新键。
5. 失败时继续使用原 v7 状态，不写半成品。

### 9.2 D1

Phase 2 计划生成新的 additive `0003` 迁移；它依赖但不修改 `0002_product_intelligence.sql`，也不执行任何生产迁移。

领域表计划为：

- `planning_workspaces`：每个用户目标的当前版本指针与并发 revision。
- `skill_audit_versions`：不可变审计与轻量证据快照。
- `availability_versions`：不可变时区、周模板和日期例外。
- `learning_path_versions`：不可变完整路线与范围选择。
- `plan_versions`：不可变的初始、自动和候选七日计划；活动/待处理关系由 workspace 指针派生。
- `daily_units`：绑定计划版本的不可变 Daily Unit 记录。
- `planning_events`：带 workspace sequence 的追加式、幂等学习事件与候选决策事件。

全部个人表同时包含由服务器决定的 `userId` 和 `goalId`，并通过外键/复合唯一边界防止跨用户或跨目标引用。`planning_workspaces` 使用 revision 和活动版本指针解决并发；不可通过覆盖历史行实现重排。

现有 `career_goals.weekly_minutes` 继续写入 Availability 周模板求和结果。现有 `learning_tasks`、`learning_events` 和 `proof_items.verified` 保持兼容读取；Adaptive Today 使用新的 planning events，不能调用会自动写 `verified=true` 的旧完成路径。

## 10. Server API 与并发

建议的认证 API 边界：

- `GET /api/planning/workspace`：读取当前输入、路线、活动计划和候选差异。
- `POST /api/planning/generate`：保存审计、Availability、Target 并生成初始版本。
- `POST /api/planning/events`：幂等记录学习事件并返回活动计划或候选重排。
- `POST /api/planning/replans/accept`：以 base revision 原子接受候选。
- `POST /api/planning/replans/discard`：放弃候选但保留可审计记录。

服务端从会话解析 `userId`，从活动目标解析 `goalId`，从 IntelligenceService 读取并重新验证 Flagship Blueprint。请求体不能选择所有者、传入任意蓝图正文或覆盖 Registry。

写请求必须包含 `mutationId` 和 `baseVersionId`。重复 mutation 返回第一次接受的相同公开结果；过期 base version 返回 `409 CONFLICT` 和刷新操作，不采用最后写入获胜。活动指针、事件和新版本必须在同一个 D1 batch/事务边界内写入。

Guest 通过本地 facade 调用同一 contracts 与 pure engine，不向这些认证写 API 发送数据。

## 11. 错误恢复与安全

- Schema 或领域输入无效：返回 `400 INVALID_INPUT`，不生成或保存候选。
- 未认证云端写入：返回 `401 UNAUTHENTICATED`。
- 所有权不匹配：返回脱敏 `404` 或既有统一策略，不确认资源存在。
- base version 过期：返回 `409 CONFLICT`，要求刷新后重试。
- repository 或规划器不可用：返回 `503 PLANNING_UNAVAILABLE`，保留上一份有效计划。
- 未知错误：返回安全 Request ID；不泄露 SQL、堆栈、证据说明或私有状态。

所有 persisted 和 repository 输出在进入领域层前重新严格解析。候选计划只有在 contracts、依赖、分钟、日期和历史保护验证全部通过后才能保存。系统永远先生成并验证新版本，再切换活动指针。

证据 URL 复用 Phase 1 公共 HTTPS 规则，拒绝凭据、IP literal、localhost、私有/特殊用途主机和非 HTTPS 协议。Phase 2 不对 URL 发起 fetch，因此不存在本阶段的外部内容信任或自动证据判断。

数组、字符串、日期例外、证据和事件 payload 均有严格上限。日志只记录 request ID、结果代码、版本 ID、计数和耗时，不记录完整审计说明、链接查询参数或用户学习正文。

## 12. 视觉、交互与可访问性

继续使用 `Editorial Precision`：温暖纸面、近黑文字、克制珊瑚强调、衬线标题、无衬线正文和等宽元数据。层级依赖排版、留白、细线和严格网格，不使用玻璃拟态、渐变卡片墙或装饰性 AI 动画。

技能审计用分组列表和清晰的四态选择，不用模糊滑杆。自评与 Arc. 验证状态使用不同文案和视觉层级。证据入口保持次要，不阻塞完成审计。

Availability 一行对应一天，直接编辑分钟；`0` 立即呈现为休息日。界面实时显示周总分钟和目标冲突，但不在用户确认前修改路线。

Path 使用编辑式纵向路线展示阶段、技能、依赖原因和 Later 区域。Today 展示一个主要成果、分时步骤、主资源、完成标准和一个主动作；`Too hard`、`Delay`、`Already know this` 是上下文动作。Next 7 days 使用连续时间轴，不创建七张通用卡片。

重排差异必须在接受前可完整阅读。移动内容以短促、可中断的过渡表达，并尊重 `prefers-reduced-motion`。移动端保持 Today 优先的底部导航；桌面端给 Path 和 diff 更宽空间。

全部核心流程满足语义标题、键盘操作、可见焦点、状态文本、错误关联、触控目标和 WCAG 2.2 AA 对比要求。颜色不是状态的唯一载体。

## 13. 测试策略

### 13.1 Contracts 与 Registry

- 四级审计、证据、Availability、Target、Path、Plan、Daily Unit、Event 和 Diff 严格解析。
- 未知字段、重复 ID、越界分钟、无效时区、重复/过期例外、非公共 URL 和超长 payload 被拒绝。
- Registry 覆盖全部 16 项 Flagship 技能，包含 learn/calibrate 和必要 reinforce 模板。
- Registry 的每个 resource ID、skill ID 和依赖都能解析到同一 Blueprint 版本。

### 13.2 Deterministic domain tests

- 相同合法输入产生相同路线、计划、指纹和差异。
- 稳定拓扑排序不越过前置依赖，并拒绝循环或悬空引用。
- required minutes 不超过每日预算，休息日没有 required unit。
- 七日窗口恰好覆盖七个当地日历日，包括跨月、跨年和 DST 时区日期。
- 已完成单元在任意重排后保持完成、ID 和历史位置。
- 事件重放重建相同活动状态。
- 候选接受、放弃和仍待处理三种决策状态都能由事件重放准确恢复。
- `delayed`、`skipped`、`too_hard`、`already_known` 和 Availability 变化产生精确差异。
- full-scope 与 target-date 方案保护 core 和传递性前置依赖。
- 不可行目标日期被诚实拒绝，不超预算或缩短 Registry 估算。

### 13.3 Repository、API 与迁移

- Guest/local 与 cloud repository 对同一输入返回领域等价结果。
- 重复 mutation 不创建重复事件、版本或 Daily Units。
- 并发旧 revision 返回冲突；接受/放弃候选不会覆盖历史。
- 用户不能读写其他用户的审计、计划或事件。
- `0003` 只增加结构，保留 v7 表和 `0002` metadata，外键与唯一边界可在本地 D1 执行。
- v7 local/cloud 状态可升级；解析或写入失败时原状态仍可读取。
- Adaptive completion 不写 `proof_items.verified=true`。
- 错误响应脱敏且带安全恢复动作。

### 13.4 UI 与全仓回归

- Setup 五阶段、类别快捷审计、逐日分钟、时区、日期例外和双方案确认。
- Path 完整范围、Later、依赖原因和预计日期。
- Today 单一主要动作、资源、完成标准、Stretch 和事件动作。
- 七日时间轴、Rest、候选 diff、接受与放弃。
- 键盘、焦点、语义、reduced motion、手机和桌面布局。
- v7 OAuth、账户隔离、设备迁移、Proof 隐私、custom-role text 和 proportional path 回归。

完整门槛继续执行：

```powershell
npm run test:unit
npx tsc --noEmit
npm run lint
npm run build
node --test tests/rendered-html.test.mjs
```

常规测试不得发起真实 OpenRouter、GitHub、R2 或生产 D1 请求。

## 14. Phase 2 完成定义

Phase 2 只有在以下内容全部实现并通过新鲜验证后才能标记工程完成：

- Flagship 四级技能审计与轻量证据元数据；
- 时区、七日分钟模板、休息日和日期例外；
- 完整路线、目标日期替代方案和诚实不可行状态；
- 覆盖全部 Flagship 技能的版本化 Unit Registry；
- Outcome-driven Daily Units 与滚动七日计划；
- 完成、延期、跳过、太难、已掌握和时间变化的确定性重排；
- 活动/候选计划、可读差异、事件重放、幂等和并发保护；
- Guest 本地与登录用户云端的领域一致性；
- v7 状态兼容、失败回退和全仓回归证据；
- 独立规格与质量审查没有未解决 Critical 或 Important 问题。

工程完成不等于公开发布。Phase 2 结束后不得自动执行生产 D1 迁移、启用旗标、部署或进入 Phase 3；这些动作继续需要各自的计划、验证与用户批准。

## 15. 后续流程

1. 用户已审阅并批准本书面规格。
2. 已使用 `writing-plans` 基于真实代码结构编写逐任务实施计划。
3. 用户批准实施计划并选择执行方式后，才允许开始 TDD 实现。
4. 实现使用独立 `codex/` 分支或 worktree，不在生产环境运行迁移或部署。
5. Phase 2 工程门槛和独立审查通过后，再由用户决定合并、远程备份或后续阶段。
