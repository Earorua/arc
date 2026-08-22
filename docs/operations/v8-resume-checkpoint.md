# Arc. v8 Phase 2 规格恢复检查点

> **2026-08-22 本地用户验收暂停记录（当前最高优先级）**
>
> Phase 2 工程完成提交仍为 `91188eb1bf7e61f7153b0b7719dd8d5d20d5aac4`，本轮没有修改功能代码。用户已从 `.worktrees/v8-adaptive-planning` 启动 `npm run dev`，在访客本地模式完成 Setup → Build → Path → Today 的人工验收，并确认刷新后 Path 与 Today 状态一致、规划结果可从本地持久化恢复。
>
> 已人工确认：Flagship Setup 可以生成自适应计划；Path 可以显示完整阶段、学习目标、自评状态与 Blueprint claim confidence；Today 可以显示当前单元总分钟数、分步分钟数、主要资源、Build、Completion criteria、Proof requirement 与 Rubric；Delay 可以生成 `Review every change.` 候选差异；Keep / Accept 决策链路可用；决策后的计划跨刷新保持一致。
>
> 验收中发现并保留一个待修 UI 缺陷：候选计划实际已生成时，Today 仍可能显示 `Arc could not update this plan. Try again when the connection recovers.`；候选待审期间学习动作也仍保持可用，后续动作会被内核的 pending-replan guard 拒绝，却被 UI 归类成连接错误。预期行为是显示 `Candidate plan ready for review. Your current plan has not changed.`，并在候选被 Accept 或 Keep 前禁用或隐藏 Complete / Delay / Skip / Too hard / Already know this。修复必须先写可判别 RED，再做最小实现与 focused/full gate；不要把它当作网络或数据丢失。
>
> 另一个产品呈现事实：分钟数与资源当前只在 Today 显示，Path 只显示路线结构与能力叙事。此前口头验收指引中“Path 每个单元显示分钟和资源”不准确；若后续用户要求 Path 也直接展示，应作为新的产品呈现改动单独批准，而不是误报为当前已实现。
>
> **验收尚未最终签字。** 下次从这里继续：先修复上述 pending-candidate 状态与错误文案，运行相关 Today / controller / repository 回归、TypeScript、ESLint，并按风险决定是否重跑 96-file full gate；然后恢复本地预览，验收 Complete 持久化（若当天不是 Rest）、键盘焦点、窄屏单列与状态语义。通过后再请用户明确回复“本地验收通过”。
>
> 本地预览地址为 `http://localhost:3000/setup`；当前会话启动过开发服务器，但关闭 Codex 或电脑后不能假设进程仍在，恢复时应先检查端口，再从 v8 worktree 运行 `npm run dev`。本轮没有 merge、push、PR、生产 D1 迁移、环境变量、功能旗标或部署动作；公开生产仍为 Arc v7.2 / Sites version 9。浏览器中的访客计划属于本地存储，不写入 Git；本检查点保存的是可复现的验收结论与后续动作。

> **2026-08-22 Phase 2 工程完成记录（覆盖下方历史状态）**
>
> 当前实现 worktree 为 `.worktrees/v8-adaptive-planning`，分支 `codex/v8-adaptive-planning`。Phase 2 Task 1–15 已按 TDD 完成本地工程建设；实现范围为 `c8473eb04c93be39e604e68865806ea51c11a73b..19b8c8765704f2e6c88e007568f28eef32a4e830`。本完成记录提交不纳入范围，避免自指。Arc v8 现在停在**用户验收门槛**，不是线上发布状态。
>
> 最终审查修复包括 `165d1a6`、`c978312` 与 `19b8c87`。已关闭的重点问题包括：七张 planning 表使用 `(user_id, goal_id, id)` composite primary key 并重新生成同名 `0003_adaptive_planning`（无 `0004`、无 ALTER/DROP）；event 只接受当前首个 required primary；Today 使用 availability 时区的真实今天且 Stretch 只在 primary checklist 完成后显示；生产首读调用 guarded v7 upgrade；Flagship Setup 同步公共 Role；Path 显示 pending diff；版本不匹配保留历史；restoring/首次 cloud unavailable 不回退 legacy；Path 与 Today 的候选决策公告在 diff 卸载和 Rest/Open 转换后仍可播报。
>
> 最终 fresh Task 15 工程证据全部通过：`npm run test:unit` 为 96 files / 1093 tests；`npx tsc --noEmit`、`npm run lint`、`npm run build`（5/5）均 exit 0；rendered HTML 3/3；仅 `dist` 存在、`.next` 不存在；产物 secret 扫描与 Phase 2 provider / outbound `fetch` 扫描均 0 matches（`rg` exit `1`）；实现范围 diff-check 通过，提交前工作树干净。
>
> 两位独立 reviewer 的最终结论均为 **Critical 0 / Important 0 / Minor 0 / Ready Yes**。没有未解决的阻断或非阻断 finding。审查确认严格契约、确定性内核、append-only replay、owner/goal 与 CAS、请求/响应上限、私密错误、身份生命周期、v7 兼容、可访问性与 provider/secret 边界均满足已批准 Phase 2 规格。
>
> **下一步只接受显式用户选择。** 可以先做用户验收；通过后再分别决定是否本地合并、远程备份、编写发布方案、执行生产 D1 迁移、修改功能旗标或部署 Sites。当前没有 merge、push、PR、生产 D1 迁移、环境变量、线上配置或部署改动；公开生产仍是 Arc v7.2 / Sites version 9。不要重做 Phase 1，不要直接开始 Phase 3。
>
> 下方 2026-08-12 内容是历史检查点，仅用于背景，不再代表当前门槛。

**保存日期：** 2026-08-12

**当前阶段：** Phase 1 `Trusted Intelligence Kernel` 已完成并合并到本地 `master`；Phase 2 `Adaptive Planning Loop` 的交互设计与书面规格已获用户批准，详细 TDD 实施计划已保存到隔离分支。当前暂停在用户审阅并批准实施计划之前；没有开始 Phase 2 功能代码、测试或迁移。

**生产地址：** <https://arc-precision-path.jiahe-xu.chatgpt.site>

## 1. 当前权威状态

- 当前本地分支：`codex/v8-adaptive-planning-spec`
- 当前 Phase 2 规格提交：`7cb9181e959f4129acb253fc1fddee90efe36560`（`docs: specify v8 adaptive planning loop`）。本检查点自身的提交以恢复时的 `git rev-parse HEAD` 为准，避免自引用。
- Phase 2 规格分支基于本地 `master` 检查点 `fa9bc6c` 创建；`master` 中的 Phase 1 没有被重做或改写。
- Phase 1 完成提交：`a3df2688724f01d2c1ac5e9df3c2d9f3ca7db7c5`（`docs: close v8 intelligence kernel phase`）。本检查点自身的提交以恢复时的 `git rev-parse HEAD` 为准，避免在文档中写入自引用哈希。
- Phase 1 验证实现范围：`2825ff4..fe26ff27f914eb19c8c15a3fe11ed5cabf12c24b`
- 本地合并方式：从 `7861b8d` 快进到 `a3df268`，没有冲突或额外 merge commit。
- `codex/v8-intelligence-kernel` 分支已在确认合并后删除；对应隔离 worktree 已移除。
- 合并后的本地 `master` 已重新通过 67 个测试文件、616 项测试及 `npx tsc --noEmit`。
- 保存检查点前 `git status --short` 无输出。
- 本地 `master` 领先缓存的 `origin/master`；提交本检查点前差值为 24，保存后应使用 `git rev-list --count origin/master..master` 读取最新数量。
- 2026-08-10 曾尝试 `git fetch` / `git pull --ff-only`，但 GitHub 443 连接超时；因此没有刷新远程引用，也没有推送。

生产环境仍是 Arc. v7.2 / Sites version 9。当前公开网站、OAuth 配置、运行时变量、D1、R2、访问策略和生产 slug 均未因 Phase 1 改变。Sites version 6 仍是直接回滚基线。

## 2. Phase 2 已完成的规划工作

- 用户选择事件溯源式确定性规划内核，不采用快照式隐式重算或可变任务队列。
- 技能审计锁定为逐技能四级自评，并把轻量证据元数据与掌握状态分离。
- 工期冲突锁定为“完整范围、延后日期”与“保持日期、暂缓非核心能力”双方案确认。
- Today 锁定为每天一个主要可交付单元和至多一个可选 Stretch。
- 重排锁定为分级处理：完成自动滚动；延期、太难、已掌握和时间变化先预览差异再确认。
- 七日窗口锁定为用户当地今天起连续七个日历日，休息日仍显示在时间轴中。
- 自评独立技能必须通过校准关卡，不直接消失，也不在 Phase 2 授予 `Verified`。
- 可选证据只保存公共 HTTPS 链接、类型和简短说明；不抓取、不上传、不调用 AI。
- 用户逐段批准产品体验、领域契约、持久化、API、安全、视觉、测试和 Phase 2 完成定义，并统一反馈“全部符合”。
- 书面规格已保存为 `docs/superpowers/specs/2026-08-11-arc-v8-adaptive-planning-design.md`，自审无占位符、矛盾或范围越界，提交只包含该文档。
- 用户于 2026-08-12 明确批准 Phase 2 书面规格。
- 已使用 `writing-plans` 按当前真实代码结构编写 `docs/superpowers/plans/2026-08-10-arc-v8-adaptive-planning.md`，分为契约与策划数据、确定性内核、持久化/API、产品体验和最终工程门槛五个检查点。

当前门槛：必须先由用户审阅并明确批准 Phase 2 实施计划，然后选择执行方式。只有这两项完成后，才能创建独立实施 worktree 并开始 TDD；本分支不得直接写功能代码。

## 3. Phase 1 已完成的范围

- 严格、版本化的 Role Blueprint、Skill、Phase 与 Learning Resource Zod 契约；
- 16 项技能的确定性 Flagship 蓝图与资源注册表；
- 依赖图、阶段覆盖、资源双向引用、重复引用、来源与免费替代策略验证；
- 学习资源公共 HTTPS、真实日历日期及非公共主机拒绝规则；
- 六张非个人 D1 情报表、外键、索引与生成的增量迁移；
- 对不可信 repository 数据重新解析、只发布 `ready` 且 slug 匹配蓝图的 service；
- guest-safe、read-only 的 `/api/intelligence/flagship`；
- Stack 的 category、importance、claim confidence、why、mastery criteria、prerequisite 和完整资源证据展示；
- README、路线图、详细计划与工程完成记录。

最终新鲜证据：

- `npm run test:unit`：exit `0`，67 files / 616 tests；
- `npx tsc --noEmit`：exit `0`；
- `npm run lint`：exit `0`；
- `npm run build`：exit `0`，5/5；
- `node --test tests/rendered-html.test.mjs`：exit `0`，2/2；
- `dist` 中模型密钥模式：0 matches；
- Flagship 数据、service 与 API 路径中的模型 provider / outbound `fetch`：0 matches；
- 两位独立 reviewer 最终结论：Critical / Important / Minor 均为 0。

## 4. 明确未发生的动作

- 没有推送本地 `master`；
- 没有创建新的 PR；
- 没有执行 `drizzle/0002_product_intelligence.sql`；
- 没有生产 D1 迁移、R2 写入或数据修改；
- 没有启用功能旗标；
- 没有保存或部署新的 Sites 版本；
- 没有配置或读取 `OPENROUTER_API_KEY`；
- 已编写 Phase 2 实施计划，但尚未获得实施批准，也未开始执行；
- 没有开始 Phase 2 功能代码、测试或 `0003` 迁移文件；
- 没有开始真实 OpenRouter Research Beta（路线图 Phase 4）。

Phase 1 新表目前只是未来版本发布的结构预留；运行中的 Flagship 读取源仍是 `BuiltinIntelligenceRepository`，所以不要把生成迁移误认为已经执行。

## 5. 下一次继续时的权威下一步

### A. 审阅并批准 Phase 2 实施计划（当前推荐路径）

先读取 `docs/superpowers/plans/2026-08-10-arc-v8-adaptive-planning.md`，并与已批准规格逐项核对。如果用户要求修改，只修改计划和检查点并重新自审；如果用户明确批准计划，再让用户选择“子代理逐任务执行”或“当前任务内分批执行”。选定方式前仍不写功能代码。

### B. 远程备份

如果用户改选远程备份，先恢复 GitHub 网络、刷新远程引用并确认远程没有新提交。不得从当前规格分支推送到 `master`，不得 force push；先形成安全集成/推送方案并单独获批。

### C. 受控发布规划

如果用户改选公开发布，先写独立发布方案；推送、D1 生产迁移、功能旗标和公开部署仍是不同授权动作。当前 Phase 2 规格分支不得直接部署。

## 6. 仍保留的 v7 安全与基础设施待办

以下项目没有被 Phase 1 错误标记为完成：

1. 使用安全、未归属的身份完成真实 second-provider linking；
2. 补充 replay 与 application-bypass 生产证据；
3. 补充 account-link event-log 证据；
4. 成功关联后验证两个 provider 返回同一 Arc. 用户且云端状态连续；
5. 验证 R2 私有 Proof put/get 与 metadata compensation；
6. 修复不阻塞应用的 `/favicon.ico` 404。

## 7. 下次恢复流程

1. 读取本文件、Phase 2 书面规格、Phase 2 实施计划、v8 总路线图与 Phase 1 完成记录；
2. 运行 `git status --short --branch`、`git log -5 --oneline`、`git rev-parse HEAD`；
3. 确认当前分支包含 `7cb9181` 且工作树干净；若用户位于 `master`，切回 `codex/v8-adaptive-planning-spec` 前先确认没有未提交修改；
4. 不要重做 Phase 1，不要重新询问已经批准的七项 Phase 2 产品决策，也不要重新设计已批准书面规格；
5. 当前只等待用户审阅实施计划。用户明确批准计划并选择执行方式后，才允许创建独立实现 worktree 并按 TDD 开始；不要在规格分支直接写代码；
6. 未经后续独立批准，不合并、不推送、不迁移生产 D1、不启用旗标、不部署、不发起真实 OpenRouter 请求。

当前权威文档：

- 产品规格：`docs/superpowers/specs/2026-08-09-arc-v8-product-intelligence-design.md`
- Phase 2 书面规格：`docs/superpowers/specs/2026-08-11-arc-v8-adaptive-planning-design.md`
- Phase 2 实施计划：`docs/superpowers/plans/2026-08-10-arc-v8-adaptive-planning.md`
- 五阶段路线图：`docs/superpowers/plans/2026-08-10-arc-v8-product-intelligence-roadmap.md`
- Phase 1 完成记录：`docs/superpowers/plans/2026-08-10-arc-v8-intelligence-kernel.md`

## 8. 用户恢复口令

一般恢复：

> 继续 Arc v8。请先读取 `docs/operations/v8-resume-checkpoint.md`，从合并后检查点继续，不要重做 Phase 1，也不要直接部署。

继续审阅 Phase 2 规格：

> 继续 Arc v8。读取恢复检查点和 Phase 2 书面规格，从规格审阅门槛继续，不要重做设计，也不要直接写代码或部署。

批准书面规格并开始实施计划：

> 批准 Phase 2 书面规格。请使用 writing-plans 编写详细实施计划，不直接写功能代码。

审阅并批准实施计划：

> 继续 Arc v8。读取恢复检查点、已批准的 Phase 2 书面规格和详细实施计划，从实施计划审阅门槛继续，不要直接写代码、迁移或部署。

准备远程备份：

> 继续 Arc v8。先核对本地与 `origin/master`，形成安全推送方案，获得我的批准后再推送。

即使关闭电脑或 Codex，只要本地仓库仍可访问，就可以通过本检查点和 Git 历史继续。

## 9. 本地环境提示

用户级 `.npmrc` 的 npm cache 可能指向不可写位置。不要修改全局配置；安装依赖时使用临时可写缓存：

```powershell
npm install --cache "$env:TEMP\arc-npm-cache"
```

运行全仓 ESLint 时继续排除生成目录和嵌套 worktree：

```powershell
npx eslint . --ignore-pattern dist --ignore-pattern .next --ignore-pattern .worktrees
```
