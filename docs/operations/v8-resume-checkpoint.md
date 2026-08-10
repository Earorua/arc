# Arc. v8 合并后恢复检查点

**保存日期：** 2026-08-10

**当前阶段：** Phase 1 `Trusted Intelligence Kernel` 已通过工程质量门槛，并按用户选择快进合并到本地 `master`；暂停在远程备份、受控发布和 Phase 2 规划之前。

**生产地址：** <https://arc-precision-path.jiahe-xu.chatgpt.site>

## 1. 当前权威状态

- 当前本地分支：`master`
- Phase 1 完成提交：`a3df2688724f01d2c1ac5e9df3c2d9f3ca7db7c5`（`docs: close v8 intelligence kernel phase`）。本检查点自身的提交以恢复时的 `git rev-parse HEAD` 为准，避免在文档中写入自引用哈希。
- Phase 1 验证实现范围：`2825ff4..fe26ff27f914eb19c8c15a3fe11ed5cabf12c24b`
- 本地合并方式：从 `7861b8d` 快进到 `a3df268`，没有冲突或额外 merge commit。
- `codex/v8-intelligence-kernel` 分支已在确认合并后删除；对应隔离 worktree 已移除。
- 合并后的本地 `master` 已重新通过 67 个测试文件、616 项测试及 `npx tsc --noEmit`。
- 保存检查点前 `git status --short` 无输出。
- 本地 `master` 领先缓存的 `origin/master`；提交本检查点前差值为 24，保存后应使用 `git rev-list --count origin/master..master` 读取最新数量。
- 2026-08-10 曾尝试 `git fetch` / `git pull --ff-only`，但 GitHub 443 连接超时；因此没有刷新远程引用，也没有推送。

生产环境仍是 Arc. v7.2 / Sites version 9。当前公开网站、OAuth 配置、运行时变量、D1、R2、访问策略和生产 slug 均未因 Phase 1 改变。Sites version 6 仍是直接回滚基线。

## 2. Phase 1 已完成的范围

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

## 3. 明确未发生的动作

- 没有推送本地 `master`；
- 没有创建新的 PR；
- 没有执行 `drizzle/0002_product_intelligence.sql`；
- 没有生产 D1 迁移、R2 写入或数据修改；
- 没有启用功能旗标；
- 没有保存或部署新的 Sites 版本；
- 没有配置或读取 `OPENROUTER_API_KEY`；
- 没有开始 Phase 2 代码；
- 没有开始真实 OpenRouter Research Beta（路线图 Phase 4）。

Phase 1 新表目前只是未来版本发布的结构预留；运行中的 Flagship 读取源仍是 `BuiltinIntelligenceRepository`，所以不要把生成迁移误认为已经执行。

## 4. 下一次继续时的三个合法方向

### A. 远程备份本地 `master`

先恢复 GitHub 网络并刷新远程引用。确认 `origin/master` 没有新提交后，再向用户申请推送授权。若远程已经前进，不得 force push；先形成 rebase 或 merge 方案并获得批准。

### B. 编写 Phase 2 详细计划

读取已经落地的 Phase 1 类型和文件结构，为 `Adaptive Planning Loop` 编写详细产品规格与实施计划。第一步只规划，不直接写代码；需要用户批准计划后才能实现。

Phase 2 的重点是技能审计、逐日可用时间、完整路线、滚动七日计划、Today 单元与学习事件驱动重排。现有 v7 proportional path 与 custom-role text 必须兼容保留。

### C. 准备 Phase 1 受控公开发布

先写独立发布方案，明确 Sites 构建/保存/部署、人工 smoke、回滚与线上验收步骤。推送、D1 生产迁移、功能旗标和公开部署仍是不同的授权动作，不能互相推断。

## 5. 仍保留的 v7 安全与基础设施待办

以下项目没有被 Phase 1 错误标记为完成：

1. 使用安全、未归属的身份完成真实 second-provider linking；
2. 补充 replay 与 application-bypass 生产证据；
3. 补充 account-link event-log 证据；
4. 成功关联后验证两个 provider 返回同一 Arc. 用户且云端状态连续；
5. 验证 R2 私有 Proof put/get 与 metadata compensation；
6. 修复不阻塞应用的 `/favicon.ico` 404。

## 6. 下次恢复流程

1. 读取本文件、v8 总路线图与 Phase 1 完成记录；
2. 运行 `git status --short --branch`、`git log -5 --oneline`、`git rev-list --count origin/master..master`；
3. 确认本地 `master` 至少包含 `a3df268`，且工作树干净；
4. 不要重做 Phase 1，也不要重新设计已经批准的 v8 总规格；
5. 让用户在远程备份、Phase 2 规划、Phase 1 受控发布之间选择；
6. 未经单独批准，不推送、不迁移生产 D1、不启用旗标、不部署、不发起真实 OpenRouter 请求。

当前权威文档：

- 产品规格：`docs/superpowers/specs/2026-08-09-arc-v8-product-intelligence-design.md`
- 五阶段路线图：`docs/superpowers/plans/2026-08-10-arc-v8-product-intelligence-roadmap.md`
- Phase 1 完成记录：`docs/superpowers/plans/2026-08-10-arc-v8-intelligence-kernel.md`

## 7. 用户恢复口令

一般恢复：

> 继续 Arc v8。请先读取 `docs/operations/v8-resume-checkpoint.md`，从合并后检查点继续，不要重做 Phase 1，也不要直接部署。

开始 Phase 2 规划：

> 继续 Arc v8。读取恢复检查点和总路线图，先编写 Phase 2 Adaptive Planning Loop 的详细规格与实施计划，不直接写代码。

准备远程备份：

> 继续 Arc v8。先核对本地与 `origin/master`，形成安全推送方案，获得我的批准后再推送。

即使关闭电脑或 Codex，只要本地仓库仍可访问，就可以通过本检查点和 Git 历史继续。

## 8. 本地环境提示

用户级 `.npmrc` 的 npm cache 可能指向不可写位置。不要修改全局配置；安装依赖时使用临时可写缓存：

```powershell
npm install --cache "$env:TEMP\arc-npm-cache"
```

运行全仓 ESLint 时继续排除生成目录和嵌套 worktree：

```powershell
npx eslint . --ignore-pattern dist --ignore-pattern .next --ignore-pattern .worktrees
```
