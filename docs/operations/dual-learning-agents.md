# 双学习 Agent：接入与验收

## 当前基线（2026-10-28）

正式站 `https://arcmaps.net` 已于 2026-10-27 迁至用户自有 Cloudflare Worker、D1 和 R2；原 Sites 地址仅负责跳转。`0013_learning_agents.sql` 已随迁移应用，后续学习伙伴更新不应重复迁移或覆盖数据库。本文末尾的 Sites 发布记录属于历史。

Research 与学习伙伴独立：Research 在私有 Executor 中运行并已对登录用户开放；学习伙伴与规划师通过网站 Worker 的 `/api/agents/*` 调用 OpenRouter。Research 可用不代表网站 Worker 已配置学习伙伴。2026-10-28 本次更新已在 Cloudflare 发布并启用，登录后的工作区返回 `enabled: true`、`availability: ready`；详见[发布记录](learning-companion-release-2026-10-28.md)。

本次兼容更新读取当前活动路线的来源、用户时区和真实完成事件，参考尚未完成且已到日期的任务；没有当天任务时明确显示，并允许针对现有路线提问。聊天中展示的资料来自已经保存的课程目录，链接并不表示助手读过课程全文。新 Research 路线不能在来源缺失时退回内置全栈课程。

启用配置应放在 Cloudflare 网站 Worker `arc-v8-migration-shadow-20260922` 上。按下表配置网站专用 `OPENROUTER_API_KEY` Secret 和显式开关，保留现有登录、DB/R2、Research service binding、域名和额度。不要将研究执行器的密钥当作网站已经拥有的密钥，不要在旧 Sites 设置中配置新功能。实际密钥由所有者通过安全入口填写，不进入源码、聊天或普通变量。

用户本轮已选择同时启用，并自行填写独立密钥。当前线上使用显式全站日/月预留上限各 5 美元、每用户每天 2 美元、规划每次 2 美元、答疑每次 0.5 美元。这里是应用侧预留额度，不是实际计费；即使生成失败，已发生的预留仍保留。OpenRouter 账户余额和密钥限额另行约束，不会自动充值或扩大 Research 额度。本轮未提交真实付费模型请求，首条回答及密钥的实际模型权限仍由用户发起问题验证。

## 使用流程

1. 登录 Arc 并完成学习设置。现有 Research/Setup 负责岗位来源、技能评估、时间预算和基础路线。
   `/coach` 的功能介绍、提问示例和使用步骤可公开查看。未登录或正在确认登录时仅提供登录入口或确认状态，不显示桌宠、聊天框或个人规划表单，也不加载个人规划工作区。退出账号会取消进行中的请求并清空当前显示的个人内容。
2. 在导航的 **Learning coach** 或路线页进入 `/coach`。输入本次规划重点，点击“开始深度规划”。
   规划使用即时生成，等待期间保持此页面打开；离开或刷新会中断请求。完整生成并保存后的方案可再次打开查看。
3. 规划师返回策略、阶段目标及安排理由。“查看计划差异”生成待确认候选；只有点击现有的 **Accept new plan** 才更新当前计划，**Keep current plan** 保留原计划。
4. 网站右下角的学习伙伴可展开、最小化、隐藏、重新显示。聊天读取当前目标、任务、已完成进度和已批准的资料目录，可停止流式回复、切换深入讲解。
5. “交给规划师”把当前问题和答疑摘要带到规划输入框，由用户决定是否提交。

新岗位仍经过既有来源验证流程。此版本的规划师调整现有任务的优先顺序，并提供里程碑和学习策略；不会自行新增课程、伪造掌握程度或改写已完成任务。每日任务仍由既有调度器根据时间预算生成。

## 运行配置

现有 Cloudflare 正式库保留 Research 与账号恢复的 `0000`–`0012` 迁移链，原 Sites 的 `0008_learning_agents.sql` 已整合为 `0013_learning_agents.sql` 并应用；它只新增 `learning_agent_runs` 及其索引，不重建旧表。不要再次应用旧编号的迁移，也不要用 Sites journal 覆盖当前链。助手默认保持关闭，真实调用须配置和验收。

| 服务端变量 | 默认值 / 用途 |
| --- | --- |
| `ARC_LEARNING_AGENTS_ENABLED` | `false`，显式启用开关 |
| `OPENROUTER_API_KEY` | OpenRouter API 密钥，服务端保存；两个 Agent 共用 |
| `ARC_AGENT_PLANNER_MODEL` | `openai/gpt-6-astra`，`max` 推理 |
| `ARC_AGENT_TUTOR_MODEL` | `openai/gpt-6-astra`，常规 `low`，深入讲解 `high` |
| `ARC_AGENT_SITE_DAILY_BUDGET_MICROS` | 20,000,000 |
| `ARC_AGENT_SITE_MONTHLY_BUDGET_MICROS` | 200,000,000 |
| `ARC_AGENT_USER_DAILY_BUDGET_MICROS` | 5,000,000 |
| `ARC_AGENT_PLANNER_MAX_COST_MICROS` | 2,000,000 |
| `ARC_AGENT_TUTOR_MAX_COST_MICROS` | 500,000 |
| `ARC_AGENT_INPUT_MICROS_PER_TOKEN` | 13 |
| `ARC_AGENT_OUTPUT_MICROS_PER_TOKEN` | 50 |

1,000,000 micro-units = 1 美元。按 UTC 日/月统计，两个 Agent 共用额度。所有数值必须为正整数，模型名须为 OpenRouter 的 `提供商/模型` 格式；配置错误时关闭助手。两类请求都固定 `service_tier: "default"`，并设置 `provider.require_parameters: true`、`allow_fallbacks: false` 和 `max_price` 输入/输出价格上界及单请求价格 0，避免转入超出预留依据的端点。切换模型前需验证其 Responses、推理档位、结构化输出支持及价格，并同步配置输入/输出 token 价格上界。

助手预算及开关与 Research 独立，复用本站服务端的 `OPENROUTER_API_KEY`。远程 Research executor 仍使用其自身密钥配置。浏览器始终请求同源 `/api/agents/*`，服务端再调用 `https://openrouter.ai/api/v1/responses`；密钥不进入客户端或任何 `NEXT_PUBLIC_` 变量。

本地按现有 Cloudflare 开发方式配置 `.dev.vars`（已被 Git 忽略），保留现有登录配置并添加以下值；重启开发服务器后生效。部署时在站点 Worker 上配置对应变量和密钥。

```dotenv
OPENROUTER_API_KEY=替换为你的OpenRouter密钥
ARC_LEARNING_AGENTS_ENABLED=true
ARC_AGENT_PLANNER_MODEL=openai/gpt-6-astra
ARC_AGENT_TUTOR_MODEL=openai/gpt-6-astra
```

## 请求与数据生命周期

- D1 在单条原子 SQL 中执行去重、同目标同类任务互斥、用户日额度、全站日/月额度检查。
- 每个付费请求使用 UUID；已提交的重复请求不会再次创建模型任务。结果不确定时不自动重试付费 POST。
- 预算预留覆盖 UTF-8 字节数估算的输入上界、提示词与 schema 余量、最大输出（含推理 token）。先裁剪较旧的历史，再拒绝超过单次预算的请求。
- 单次预留额度在失败后仍保留，避免网络中断造成重复放行；实际 token 用量另存。预留额不是实际账单，实际账单以模型服务为准。
- 规划使用无状态 Responses 流，`store: false`，不发送 `background` 或 `previous_response_id`。本站先保存 running 状态并发出 started，每 15 秒发送心跳；完整结果经当前进度校验并保存后才发出 done。GET 只读取本站 D1，不向 OpenRouter 恢复或重新生成任务。
- 规划上限 10 分钟，答疑上限 2 分钟；浏览器离开/取消会中止上游连接。异常退出遗留的 starting 记录在 2 分钟后、running 记录在对应超时加 30 秒后标记失败。升级前的遗留后台记录也按此规则到期，不会尝试跨服务恢复。已发生的预算预留不返还。
- 答疑使用 `store: false`，只转发公开回答文本。完整答复才保存为完成；中断或取消不会把部分回答标记为成功。
- 本站 D1 保存 owner/goal 隔离的对话、规划、上下文快照、使用量和错误状态。接口返回最近 30 条及仍在进行/最近一次规划。当前没有自动清除策略。
- 浏览器 localStorage 只保存按账户隔离的展示偏好；sessionStorage 保存按账户和目标隔离的输入草稿。退出或换账户时取消旧请求、清空旧上下文；目标切换后不会接收旧目标迟到的回复。
- 提交前及应用方案时重新校验当前目标、workspace、活动版本和 revision。方案只允许精确排列全部未完成任务，并保持依赖顺序、任务身份和历史不变。

## 接口

| 方法与路径 | 用途 |
| --- | --- |
| GET `/api/agents/workspace` | 可用状态、当前目标与聊天/规划记录 |
| POST `/api/agents/planner` | 即时规划，NDJSON started/heartbeat/done/error |
| GET `/api/agents/planner/:id` | 读取本站保存的状态与完整结果 |
| POST `/api/agents/planner/:id/apply` | 将已校验结果放入候选计划审阅 |
| POST `/api/agents/tutor` | NDJSON 流式答疑 |

所有 `/api/agents/*` 接口都在服务端校验当前 Arc 登录，包括状态与历史读取；无有效会话返回 401，并且不会创建模型服务或预留额度。登录服务不可用时保持关闭并返回 503。付费操作还要求活动目标；所有写请求校验精确同源 Origin。候选采用/放弃继续使用既有 planning 接口。

## 验证

本地启动：`npm run dev`，查看 `/coach`。未配置登录或模型服务时，界面会明确显示原因，发送按钮不可用。

自动测试覆盖 OpenRouter 请求参数、流式拆包、拒答/断流、取消、费用并发预留、身份隔离、本地记录读取、规划事件重放和候选确认。无需真实密钥即可运行这些测试：

```powershell
npm run test:unit -- tests/api/agents.test.ts tests/server/agent-configuration.test.ts tests/server/agent-provider.test.ts tests/server/agent-repository.test.ts tests/server/learning-agents.test.ts tests/lib/agent-client.test.ts tests/components/agent-context.test.tsx tests/components/agent-companion.test.tsx tests/components/learning-coach.test.tsx tests/lib/planning/agent-replanned.test.ts
npx tsc --noEmit --incremental false
npm run build
```

真实服务验收需要已配置登录和 D1 的测试环境、具有对应模型权限及余额的 OpenRouter 密钥。检查：保持页面打开完成一次规划、生成中离开后的中断处理、完成后再次查看、候选采用/放弃、连续两轮答疑、取消回复、目标/账户切换、服务不可用时保留当前计划。下面的开发验证未调用真实付费模型；公开站点集成范围见末节。

模型参数依据：[OpenRouter GPT-6 Astra](https://openrouter.ai/openai/gpt-6-astra)、[无状态 Responses](https://openrouter.ai/docs/api_reference/responses/overview)、[价格路由](https://openrouter.ai/docs/guides/routing/provider-selection)。

## 首版开发验证记录（2026-10-14，OpenRouter 迁移前）

- 相关回归测试：25 个文件、407 项全部通过，包含原有规划、D1、账户切换、计划差异和新 Agent 测试。
- TypeScript 全项目检查通过；变更涉及的 TS/TSX 文件 ESLint 通过；生产构建通过。
- 前后端分别经独立审查并复审通过；修复了终态拒答恢复、历史窗口遗漏任务、隔天结果恢复、计费档位、取消时覆盖草稿、候选刷新失败时的重试入口。
- 浏览器验证：规划页和路线页；桌面及 390 × 844 手机视口；展开、最小化、隐藏、重新显示；跨页面草稿保留；未配置时禁用；手机无横向溢出，桌宠避开底部导航。
- 独立分支：`codex/dual-learning-agents`。本地预览：`http://localhost:3000/coach`。新数据库迁移已在本地 SQLite 测试库执行验证，线上迁移和真实付费模型联调留待配置后的环境验收。

## OpenRouter 迁移验证（2026-10-14）

- 30 个相关 Vitest 文件、451 项测试通过，包含规划、预算/去重、取消、心跳、客户端流读取、Research 配置及候选审阅。
- 4 项服务端渲染/构建产物检查通过，包含 OpenRouter 密钥标识不出现在客户端包；TypeScript、ESLint、生产构建通过。
- 独立审查未发现阻塞项；依据当前公开 [OpenAPI](https://openrouter.ai/openapi.json) 和 [模型元数据](https://openrouter.ai/api/v1/models) 核实 max 推理及 Responses 事件类型。旧版 basic-usage 教程中的 response.done 示例不作为当前事件契约。
- 浏览器已确认即时规划提示；`/coach` HTTP 200。当前本地登录未配置，助手接口按预期返回 503。没有使用真实密钥发起模型调用；需配置后的登录/D1 环境完成真实验收。

## 登录限制验证（2026-10-14）

- 所有助手接口统一校验登录，覆盖访客直接请求及会话过期后的再次读取；客户端覆盖确认中、未登录、登录错误、退出及账户切换。
- 浏览器确认 `/coach` 未登录时只显示登录入口，桌宠和个人输入框不出现。修复登录状态提前返回导致的首次渲染不一致，并用实际 SSR/hydration 回归测试验证。
- 10 个相关测试文件、112 项测试及 4 项构建产物检查通过；TypeScript、ESLint、生产构建通过；独立审查未发现阻塞项。

## 公开站点集成（2026-10-14）

- 以 Sites v12 源码 `d4c636e9409cf90e4c2d3c81b910bb383f121806` 为基线，仅集成双 Agent 变更；保留既有账号恢复、登录和 Continue learning 入口。独立 Research / Cloudflare 分支未合入。
- 原公开站迁移为 `0008_learning_agents`；本 Research 迁移候选追加 `0013_learning_agents`，只创建助手记录表及索引，快照衔接 `0012_account_recovery`。当前旧 SQL、快照和已有 journal 条目保持不变。
- 最终全量回归为 150 个文件、2745 项通过；4 项构建产物检查、TypeScript、变更代码 lint 和生产构建通过。独立审查发现登录刷新会重置整页表单，已将重置范围缩到助手私有状态，并补充访客会话刷新、跨账号草稿清理回归，复审无剩余阻塞项。
- 发布前的运行配置未包含 OpenRouter 密钥或助手启用开关。默认关闭模型调用；配置服务端 `OPENROUTER_API_KEY` 和 `ARC_LEARNING_AGENTS_ENABLED=true` 后再验收真实规划和答疑。此次集成未发起付费模型请求。
