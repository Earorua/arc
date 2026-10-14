# 双学习 Agent：接入与验收

## 使用流程

1. 登录 Arc 并完成学习设置。现有 Research/Setup 负责岗位来源、技能评估、时间预算和基础路线。
2. 在导航的 **Learning coach** 或路线页进入 `/coach`。输入本次规划重点，点击“开始深度规划”。
3. 规划师返回策略、阶段目标及安排理由。“查看计划差异”生成待确认候选；只有点击现有的 **Accept new plan** 才更新当前计划，**Keep current plan** 保留原计划。
4. 网站右下角的学习伙伴可展开、最小化、隐藏、重新显示。聊天读取当前目标、任务、已完成进度和已批准的资料目录，可停止流式回复、切换深入讲解。
5. “交给规划师”把当前问题和答疑摘要带到规划输入框，由用户决定是否提交。

新岗位仍经过既有来源验证流程。此版本的规划师调整现有任务的优先顺序，并提供里程碑和学习策略；不会自行新增课程、伪造掌握程度或改写已完成任务。每日任务仍由既有调度器根据时间预算生成。

## 运行配置

先确保现有 Arc 登录服务、D1 绑定和历史迁移可用，再应用新增的 `0012_learning_agents.sql`，最后开启助手。迁移只新增 `learning_agent_runs` 及其索引，不重建旧表。此次生成的 Drizzle 快照同时记录了之前已有的研究表结构。

| 服务端变量 | 默认值 / 用途 |
| --- | --- |
| `ARC_LEARNING_AGENTS_ENABLED` | `false`，显式启用开关 |
| `OPENAI_API_KEY` | OpenAI API 密钥，服务端保存 |
| `ARC_AGENT_PLANNER_MODEL` | `gpt-6-astra`，`max` 推理 |
| `ARC_AGENT_TUTOR_MODEL` | `gpt-6-astra`，常规 `low`，深入讲解 `high` |
| `ARC_AGENT_SITE_DAILY_BUDGET_MICROS` | 20,000,000 |
| `ARC_AGENT_SITE_MONTHLY_BUDGET_MICROS` | 200,000,000 |
| `ARC_AGENT_USER_DAILY_BUDGET_MICROS` | 5,000,000 |
| `ARC_AGENT_PLANNER_MAX_COST_MICROS` | 2,000,000 |
| `ARC_AGENT_TUTOR_MAX_COST_MICROS` | 500,000 |
| `ARC_AGENT_INPUT_MICROS_PER_TOKEN` | 13 |
| `ARC_AGENT_OUTPUT_MICROS_PER_TOKEN` | 50 |

1,000,000 micro-units = 1 美元。按 UTC 日/月统计，两个 Agent 共用额度。所有数值必须为正整数；格式错误时关闭助手。两类请求都固定 `service_tier: "default"`。切换模型前需验证其 Responses、推理档位、结构化输出支持和 Standard 价格，并同步配置输入/输出 token 价格上界。

这些值与 OpenRouter Research 配置独立。不要把密钥放入客户端代码或任何 `NEXT_PUBLIC_` 变量；浏览器请求始终发送至同源的 `/api/agents/*`。

## 请求与数据生命周期

- D1 在单条原子 SQL 中执行去重、同目标同类任务互斥、用户日额度、全站日/月额度检查。
- 每个付费请求使用 UUID；已提交的重复请求不会再次创建模型任务。结果不确定时不自动重试付费 POST。
- 预算预留覆盖 UTF-8 字节数估算的输入上界、提示词与 schema 余量、最大输出（含推理 token）。先裁剪较旧的历史，再拒绝超过单次预算的请求。
- 单次预留额度在失败后仍保留，避免网络中断造成重复放行；实际 token 用量另存。预留额不是实际账单，实际账单以模型服务为准。
- 规划使用 Responses `background: true, store: true`，保存 provider ID；刷新和重新打开页面查询同一任务。即使返回较晚，也先读取已知任务的结果。只有已知仍在运行超过 24 小时的任务才标记超时。拒答、非法结构、上游任务已不存在均成为可恢复的失败状态。
- 无 provider ID 的中断提交在 2 分钟后释放进行中状态；中断答疑在 150 秒后标记失败。已发生的预算预留不返还。
- 答疑使用 `store: false`，只转发公开回答文本。完整答复才保存为完成；中断或取消不会把部分回答标记为成功。
- 本站 D1 保存 owner/goal 隔离的对话、规划、上下文快照、使用量和错误状态。接口返回最近 30 条及仍在进行/最近一次规划。当前没有自动清除策略。
- 浏览器 localStorage 只保存按账户隔离的展示偏好；sessionStorage 保存按账户和目标隔离的输入草稿。退出或换账户时取消旧请求、清空旧上下文；目标切换后不会接收旧目标迟到的回复。
- 提交前及应用方案时重新校验当前目标、workspace、活动版本和 revision。方案只允许精确排列全部未完成任务，并保持依赖顺序、任务身份和历史不变。

## 接口

| 方法与路径 | 用途 |
| --- | --- |
| GET `/api/agents/workspace` | 可用状态、当前目标与聊天/规划记录 |
| POST `/api/agents/planner` | 提交一次深度规划 |
| GET `/api/agents/planner/:id` | 恢复/查询同一规划 |
| POST `/api/agents/planner/:id/apply` | 将已校验结果放入候选计划审阅 |
| POST `/api/agents/tutor` | NDJSON 流式答疑 |

付费操作要求现有 Arc 登录与活动目标；所有写请求校验精确同源 Origin。候选采用/放弃继续使用既有 planning 接口。

## 验证

本地启动：`npm run dev`，查看 `/coach`。未配置登录或模型服务时，界面会明确显示原因，发送按钮不可用。

自动测试覆盖模型请求参数、流式拆包、拒答/断流、费用并发预留、身份隔离、任务恢复、规划事件重放和候选确认。无需真实密钥即可运行这些测试：

```powershell
npm run test:unit -- tests/api/agents.test.ts tests/server/agent-provider.test.ts tests/server/agent-repository.test.ts tests/server/learning-agents.test.ts tests/components/agent-context.test.tsx tests/components/agent-companion.test.tsx tests/components/learning-coach.test.tsx tests/lib/planning/agent-replanned.test.ts
npx tsc --noEmit --incremental false
npm run build
```

真实服务验收需要一个已配置登录的测试环境、具有对应模型权限的 OpenAI 项目和小额预算。检查：一次深度规划、刷新后恢复、候选采用/放弃、连续两轮答疑、取消回复、目标/账户切换、服务不可用时保留当前计划。此次开发没有调用真实付费模型，也没有发布或迁移线上数据库。

模型参数依据：[GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra)、[Responses background](https://developers.openai.com/api/docs/guides/background)、[streaming](https://developers.openai.com/api/docs/guides/streaming-responses)。

## 本次开发验证记录（2026-10-14）

- 相关回归测试：25 个文件、407 项全部通过，包含原有规划、D1、账户切换、计划差异和新 Agent 测试。
- TypeScript 全项目检查通过；变更涉及的 TS/TSX 文件 ESLint 通过；生产构建通过。
- 前后端分别经独立审查并复审通过；修复了终态拒答恢复、历史窗口遗漏任务、隔天结果恢复、计费档位、取消时覆盖草稿、候选刷新失败时的重试入口。
- 浏览器验证：规划页和路线页；桌面及 390 × 844 手机视口；展开、最小化、隐藏、重新显示；跨页面草稿保留；未配置时禁用；手机无横向溢出，桌宠避开底部导航。
- 独立分支：`codex/dual-learning-agents`。本地预览：`http://localhost:3000/coach`。新数据库迁移已在本地 SQLite 测试库执行验证，线上迁移和真实付费模型联调留待配置后的环境验收。
