# Arc. v8 恢复检查点

**保存日期：** 2026-08-05

**当前阶段：** v7.2 已发布并闭环；下一阶段为 v8 产品规格

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

## 2. v7 已完成的范围

v7.2 的开发、自动化验证、公开部署、人工验收、文档记录和 GitHub 合并均已完成。已验证的关键行为包括：

- Google 与 GitHub 独立登录和退出；
- 当前提供商重认证、取消连接和过期授权拒绝；
- 已被另一 Arc. 用户拥有的目标账号不会被合并，两个账号及学习状态保持隔离；
- 设备学习状态迁移必须取得明确同意；
- “Not now” 对同一用户和同一状态快照持续生效，快照变化后才重新提示；
- v7.2 发布门禁通过 61 个测试文件、516 项测试、ESLint、TypeScript、五阶段生产构建和 2/2 渲染 HTML/秘密边界检查；
- 生产 `/` 与 `/api/auth/get-session` 返回 200，未发现应用异常。

因此，**v7 产品发布周期已经结束，可以开始 v8**。

## 3. 不阻塞 v8 的保留待办

以下内容没有被错误标记为通过。它们进入安全与基础设施待办，不阻止 v8 产品规划：

1. 使用安全、未归属的不同邮箱身份完成一次真实的第二提供商关联；
2. 补充重放攻击与绕过应用层的生产证据；
3. 补充可观察的账户关联事件日志证据；
4. 在一次真实成功关联后，验证两种提供商都返回同一个 Arc. 用户且云端学习状态连续；
5. 验证 R2 私有文件 put/get 与元数据补偿流程；
6. 修复不影响应用运行的 `/favicon.ico` 404。

这些项目必须继续显示为“待验证/待完成”，不能在缺少证据时改写为已通过。

## 4. v8 的产品起点

v8 不从继续打磨登录开始，而从原始产品构想中尚未落地的 **Product Intelligence** 开始。优先问题是：

> 如何把任意目标岗位转换成尽可能全面、可追溯、可更新的技术栈，并为每项能力提供优质学习资源，再根据用户的真实空闲时间生成每日可执行步骤？

现有批准方向来自主规格中的四个模块：

- Career Intelligence：岗位规范化、技能依赖图、来源、观察时间与置信度；
- Path Planner：根据现有水平、每周时间和目标周期生成确定性阶段路线；
- Daily Engine：把阶段路线切分成每日“理解 → 练习 → 产出”单元，并支持重排；
- AI Provider Gateway：以结构化输出补全陌生岗位；无 API Key 时仍使用内置图谱与确定性规划。

“最领先的优质学习链接”属于 v8 的核心范围，但具体来源白名单、更新策略、质量评分、版权边界、失效链接检查、AI 使用边界及第一批岗位覆盖面，必须先形成并批准 v8 规格，不能直接凭实现过程临时决定。

## 5. 恢复 v8 的固定流程

恢复时先做规格，不直接写代码：

1. 读取本检查点、主产品规格和 v7 运维记录；
2. 核对 GitHub `master`、生产 v7.2 与待办状态是否变化；
3. 围绕“岗位情报 → 优质资源 → 个性化路线 → 每日任务”完成 v8 构思；
4. 向用户提交 v8 完整产品规格，等待明确批准；
5. 规格批准后编写可执行计划；
6. 从最新 `master` 创建独立的 `codex/arc-v8-*` 分支或 worktree；
7. 按测试驱动方式实现、验证、提交、公开部署和人工验收。

## 6. 本地环境提示

当前用户级 `.npmrc` 把 npm cache 指向不可写的 `C:\Program Files\nodejs\node_cache`。不要擅自修改用户的全局 npm 配置。需要安装依赖时使用临时可写缓存，例如：

```powershell
npm install --cache "$env:TEMP\arc-npm-cache"
```

在仓库根目录执行 ESLint 时应排除同级嵌套 worktree 的构建产物：

```powershell
npx eslint . --ignore-pattern dist --ignore-pattern .next --ignore-pattern .worktrees
```

## 7. 用户恢复口令

以后回到这个 Codex 任务，只需发送：

> 继续 Arc v8。请先读取 `docs/operations/v8-resume-checkpoint.md`，从 v8 产品规格阶段继续，不要直接写代码。

即使电脑关闭或当前页面关闭，只要源代码仓库仍在并可访问，就可以依据本文件和 GitHub 历史恢复；不需要重新完成 v7。
