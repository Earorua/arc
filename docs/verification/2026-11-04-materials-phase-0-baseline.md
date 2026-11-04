# 私有资料阶段 0：执行基线

日期：2026-11-04。范围：v2.1 阶段 0，仅本地契约、合成样例、假 Provider 和运行时探针；禁止部署、真实模型调用及阶段 1 产品接入。

## 工作区

- APP_ROOT：C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta/.worktrees/ui-warm-precision
- 起始 HEAD：63d7b2ee5533fe8e8a6e3077f30198f8cfd3d753。
- 起始分支：codex/refine-home-copy-hierarchy-20261030。
- 本次分支：codex/materials-phase-0-20261104，复用已存在隔离工作树。
- 起始改动：v2.1 设计文档已修改；phase-0/phase-1 两份计划未跟踪。保留这些内容。
- 未发现工作区及祖先目录的 AGENTS.md。
- Node：v24.14.1，满足 package.json 的 >=24.14.1。
- 应用迁移截至 0013_learning_agents.sql；本次不生成 0014、不修改 db/schema.ts。
- 最近发布记录仍为 docs/verification/2026-10-30-home-copy-hierarchy.md：应用源码 b913e8182c293b11e473291adccff429ff99bbd6；Site 411c0b46-98e9-4c61-afd1-9d63db8e6004；Research Executor 60b176c2-be13-4df2-8743-c899b596f6d4。
- 上述为已有记录，不是本次重新验证的线上状态；未读取生产配置、余额或密钥。

## 保持的产品边界

| 现有能力 | 本阶段边界 |
| --- | --- |
| 四步 Setup | goal/foundation/time/confirm 不变，资料 UI 尚未实现 |
| 创建恢复 | activation → generate、previousGoalId 与 Ready Research 约束不变 |
| uncertain | 校准 + 学习；完成校准不自动变成 independent |
| 历史 | 只读，不恢复历史为当前 |
| agent_replanned | 精确覆盖未完成任务及依赖，不扩展增删任务 |
| Research | role/locale 输入、权威来源及非个人包缓存不变 |
| 伙伴 | 无资料原文/摘要注入、原预算和请求生命周期不变 |
| 个人资料 | 新增契约尚未被生产路由导入，不创建云端对象或用户资料 |

## 已执行基线检查

命令：

~~~powershell
npm run test:unit -- tests/contracts/planning-api.test.ts tests/components/setup-draft.test.ts tests/components/research-setup-activation.test.tsx tests/lib/planning/agent-replanned.test.ts tests/server/planning-history.test.ts
~~~

结果：**5 个文件，137 项通过，exit 0**。运行耗时 25.14s。Node SQLite 的 ExperimentalWarning 为现有运行时提示，不是失败。未升级 npm 或依赖。

## 阶段 0 的验证性质

本阶段检查基础契约和机制。SQL 使用 tests/fixtures 下的独立内存原型；Workflow 使用本地 Miniflare 和假 Provider；质量指标使用人工标注的合成资料和合成候选。此类通过均不能证明真实模型已合格，也不能说明产品已可导入资料。完整产品接入与真实资格验证属于未执行的阶段 1。

