# Arc. v8 恢复检查点

**保存日期：** 2026-08-10

**当前阶段：** v8 产品规格和实施路线图已批准；等待选择 Phase 1 执行方式

**生产地址：** <https://arc-precision-path.jiahe-xu.chatgpt.site>

## 1. 稳定基线

- GitHub 默认分支：`master`
- v7.2 合并提交：`7861b8d1f45d83bcfcce52e1fc3ba0f41bd4465d`
- 已合并 PR：[#3](https://github.com/Earorua/arc/pull/3)
- 生产产品版本：Arc. v7.2
- Sites 保存版本：number 9，`appgprj_6a6678d3e3848191a352778c6db1e7b1~appgver_165606d8964c8191a362046f03b6d93a`
- Sites 部署：`appgdep_6a728790e0608191bf1286c3a9a3ccfd`，状态 `succeeded`
- 生产源提交：`7ca5b530dfc58f3cbc700b44a7a881a9bd661209`；其文件树与 GitHub 提交 `1ac6f2c2414727fef422d94074f7baf43c0a4a5a` 完全一致
- 直接回滚基线：Sites version 6，`appgprj_6a6678d3e3848191a352778c6db1e7b1~appgver_954b8ee1fbb08191b91062090e87d5b2`

## 2. 当前开发状态

- 当前分支：`codex/v8-resume-checkpoint`
- v8 产品规格提交：`de15395 docs: define Arc v8 product intelligence`
- v8 实施规划提交：`350950d docs: plan v8 product intelligence implementation`
- 保存检查点前，分支比远程 `origin/codex/v8-resume-checkpoint` 领先 2 个提交；这两个提交尚未推送。
- 本轮只完成了规格和计划文档，没有开始 Phase 1 产品代码、数据库迁移或 OpenRouter 接入。
- 没有执行预览部署、生产迁移、公开部署或功能旗标变更。

当前权威文档：

- 产品规格：`docs/superpowers/specs/2026-08-09-arc-v8-product-intelligence-design.md`
- 五阶段路线图：`docs/superpowers/plans/2026-08-10-arc-v8-product-intelligence-roadmap.md`
- Phase 1 详细计划：`docs/superpowers/plans/2026-08-10-arc-v8-intelligence-kernel.md`

## 3. v7 已完成的范围

v7.2 的开发、自动化验证、公开部署、人工验收、文档记录和 GitHub 合并均已完成。已验证的关键行为包括：

- Google 与 GitHub 独立登录和退出；
- 当前提供商重认证、取消连接和过期授权拒绝；
- 已被另一 Arc. 用户拥有的目标账号不会被合并，两个账号及学习状态保持隔离；
- 设备学习状态迁移必须取得明确同意；
- “Not now” 对同一用户和同一状态快照持续生效，快照变化后才重新提示；
- v7.2 发布门禁通过 61 个测试文件、516 项测试、ESLint、TypeScript、五阶段生产构建和 2/2 渲染 HTML/秘密边界检查；
- 生产 `/` 与 `/api/auth/get-session` 返回 200，未发现应用异常。

因此，**v7 产品发布周期已经结束，可以开始 v8**。

## 4. 不阻塞 v8 的保留待办

以下内容没有被错误标记为通过。它们进入安全与基础设施待办，不阻止 v8 产品规划：

1. 使用安全、未归属的不同邮箱身份完成一次真实的第二提供商关联；
2. 补充重放攻击与绕过应用层的生产证据；
3. 补充可观察的账户关联事件日志证据；
4. 在一次真实成功关联后，验证两种提供商都返回同一个 Arc. 用户且云端学习状态连续；
5. 验证 R2 私有文件 put/get 与元数据补偿流程；
6. 修复不影响应用运行的 `/favicon.ico` 404。

这些项目必须继续显示为“待验证/待完成”，不能在缺少证据时改写为已通过。

## 5. 已批准的 v8 方向

v8 的核心闭环已经批准：

```text
岗位目标
  → 可追溯的岗位技能图谱
  → 优质学习资源
  → 基于能力与时间的完整路线
  → 滚动七日计划
  → 今日可交付成果
  → Proof 验证
  → 有证据的 Stack
  → 按新状态重新规划
```

关键决策：

- 先把 `AI-Native Full-Stack Engineer` 做成生产质量 Flagship；其他岗位作为受控 Research Beta。
- 学习资源 English-first，质量优先于免费与否；付费核心资源必须显示费用并提供免费替代。
- 用户以周一至周日逐日分钟数和休息日描述真实时间。
- 先做快速技能审计，可选提交 GitHub、项目或其他证据。
- 同时提供完整路线和滚动七日详细计划；每日单元以可交付成果为中心。
- 采用可信情报内核加 AI 增强；OpenRouter 是首个正式模型 Provider。
- OpenRouter 密钥由站点所有者配置，v8 不提供用户 BYOK。
- AI 不能单独授予 `Verified`；技能状态必须由学习事件和 Proof 支撑。
- Flagship 访客体验无模型和登录也能工作；实时 Research Beta 与付费 AI 只向认证用户开放。

## 6. v8 五阶段路线图

1. **Trusted Intelligence Kernel**：版本化岗位蓝图、资源注册表、图验证、D1 情报表、只读 API 和可信 Stack 视图。
2. **Adaptive Planning Loop**：技能审计、逐日时间、完整路线、滚动七日计划、Today 和确定性重排。
3. **Proof-backed Stack**：Proof 版本和审核状态机、证据聚合与技能状态。
4. **OpenRouter Research Beta**：固定模型策略、结构化输出、来源审计、预算与速率闸门、确定性降级。
5. **Production Validation & Controlled Beta**：完整回归、安全/隐私/成本验证、功能旗标、受控验收和发布候选。

详细计划采用顺序编写：Phase 1 的详细计划已完成，但实现尚未开始；Phase 2–5 的详细计划在前一阶段实现和复核后，依据真实落地的类型与文件结构编写。

## 7. 下一次恢复流程

恢复时不要重新讨论已经批准的产品规格，也不要直接跳到 OpenRouter：

1. 读取本检查点、v8 产品规格、总路线图和 Phase 1 详细计划；
2. 运行 `git status --short --branch` 和 `git log -4 --oneline`，确认分支与提交仍一致；
3. 若需要远程备份，先取得用户批准再推送当前分支；
4. 让用户选择 Phase 1 执行方式：
   - `1`：子代理驱动，逐任务实现和审查；
   - `2`：由当前任务按详细计划连续执行；
5. 选择后，从 Phase 1 Task 1 开始，严格按 TDD 实施；
6. Phase 1 完成完整质量闸门后停止，等待用户验收；
7. 未经单独批准，不进行生产 D1 迁移、真实 OpenRouter 请求、推送、合并或公开部署。

## 8. 本地环境提示

当前用户级 `.npmrc` 把 npm cache 指向不可写的 `C:\Program Files\nodejs\node_cache`。不要擅自修改用户的全局 npm 配置。需要安装依赖时使用临时可写缓存，例如：

```powershell
npm install --cache "$env:TEMP\arc-npm-cache"
```

在仓库根目录执行 ESLint 时应排除同级嵌套 worktree 的构建产物：

```powershell
npx eslint . --ignore-pattern dist --ignore-pattern .next --ignore-pattern .worktrees
```

## 9. 用户恢复口令

以后回到这个 Codex 任务，只需发送：

> 继续 Arc v8。请先读取 `docs/operations/v8-resume-checkpoint.md`、v8 总路线图和 Phase 1 详细计划，从执行方式选择处继续，不要重新设计规格，也不要直接部署。

如果希望直接指定执行方式，也可以发送：

> 继续 Arc v8，选择执行方式 1。

或：

> 继续 Arc v8，选择执行方式 2。

即使电脑关闭或当前页面关闭，只要源代码仓库仍在并可访问，就可以依据本文件和 Git 历史恢复；不需要重新完成 v7，也不需要重新审批 v8 规格。
