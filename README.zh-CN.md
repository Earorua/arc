# Arc.

[English](./README.md) · **简体中文**

![Arc. — 只学真正推动你前进的知识](./public/og.png)

[![质量检查](https://github.com/Earorua/arc/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/Earorua/arc/actions/workflows/ci.yml)
[![访问 Arc](https://img.shields.io/badge/live-arcmaps.net-744596)](https://arcmaps.net)

**从目标岗位，到可执行的学习路径。**

Arc 将岗位要求拆解为技能和学习单元，结合已有能力与可用时间安排每日任务。学习伙伴围绕当前任务答疑，规划师提出调整建议，作品证据则记录学习进步。

[访问网站](https://arcmaps.net) · [查看产品样例](https://arcmaps.net/showcase)

## 核心功能

| 模块 | 可以做什么 |
| --- | --- |
| **学习设置与岗位研究（Setup & Research）** | 研究目标岗位及学习资料，评估技能、设置学习时间，并恢复未完成的设置草稿。 |
| **学习路径（Path）** | 按先修关系推进学习单元，调整可用时间，审阅计划差异后再确认变更。 |
| **今日学习（Today）** | 查看当前任务和资料，记录完成情况，并继续查看对应技能或作品证据。 |
| **技能图谱（Stack）** | 查看技能、先修关系、掌握标准、学习资料和支撑证据。 |
| **作品证据（Proof）** | 保存作品和私有附件，保留修改记录，并选择需要公开的字段。 |
| **历史计划（History）** | 查看此前的计划及已记录进度，历史计划保持只读。 |
| **学习伙伴与规划师（Coach）** | 围绕当前学习内容提问，审阅个性化学习策略或计划调整建议。 |

## 设计逻辑

**目标岗位 → 技能与资料 → 自评与时间预算 → 学习路径 → 每日任务 → 作品与进度**

1. **学习依据可追溯。** 岗位研究结果通过结构与来源校验后才能用于规划；内置学习数据也支持无需模型调用的确定性样例。
2. **AI 提供建议，规则负责排程。** AI 辅助岗位分析和学习建议，技能依赖、时间分配与每日安排由确定性规划逻辑计算。
3. **关键变化由用户确认。** 「不确定」自评会安排校准；调整计划先展示差异、确认后生效，任务完成和作品审核分别记录。
4. **个人数据有明确归属。** 通过 Google 或 GitHub 登录个人工作区，登录后的学习状态保存在 D1，本地内容经确认后导入；附件保持私有，公开分享仅展示选定字段。

界面采用暖纸色表面、深色文字和紫色强调，突出下一步学习任务，并支持响应式布局、键盘焦点和减少动效。

## 技术栈

| 层次 | 技术 | 作用 |
| --- | --- | --- |
| 前端界面 | React、兼容 Next 的 App Router | 页面、共享组件与工作区交互 |
| 样式与动效 | Tailwind CSS、自定义 CSS、Motion | 视觉主题、响应式布局与交互反馈 |
| 渲染与运行时 | Vinext、Vite、Cloudflare Workers | 服务端渲染、API 路由、构建与本地开发 |
| 身份认证 | Better Auth、Google / GitHub OAuth | 登录、会话与账号隔离 |
| 结构化数据 | Cloudflare D1、Drizzle ORM | 学习状态、历史计划、作品元数据与数据库迁移 |
| 文件存储 | Cloudflare R2 | 私有附件和研究结果回执 |
| AI 与后台任务 | OpenRouter、Cloudflare Workflows | 模型接入与持久化岗位研究任务 |
| 数据契约 | TypeScript、Zod | 共享类型，以及 API 和模型数据的运行时校验 |
| 质量保障 | Vitest、Testing Library、ESLint、GitHub Actions | 行为与界面测试、静态检查和持续集成 |

岗位 Research 通过私有执行器与持久 Workflow 运行；答疑和规划建议使用网站服务端的 Agent 服务。模型凭据始终保留在服务端。

## 本地运行

准备 Node.js 与 npm，运行环境要求见 [`package.json`](./package.json)。

```bash
npm ci
cp .env.example .dev.vars
npm run dev
```

打开终端输出的地址，通常为 `http://localhost:3000`。默认 [`cloudflare.local.json`](./cloudflare.local.json) 使用本地绑定，本地开发时保持 `ARC_CLOUDFLARE_TARGET` 未设置。

[`.env.example`](./.env.example) 列出服务端配置。本地 `.dev.vars` 文件由 Git 忽略，AI 功能默认关闭。个人工作区需要配置登录服务并初始化数据库，具体见[登录配置说明](./docs/operations/cloudflare-shadow-auth-setup.md)和[学习助手配置说明](./docs/operations/dual-learning-agents.md)。

## 目录结构

| 路径 | 内容 |
| --- | --- |
| [`app/`](./app/) | 页面、界面组件、数据契约、规划逻辑与服务端 API |
| [`db/`](./db/) · [`drizzle/`](./drizzle/) | 数据库结构与迁移 |
| [`worker/`](./worker/) | 网站入口和 Research 执行器 |
| [`build/`](./build/) · [`scripts/`](./scripts/) | 构建配置与开发工具 |
| [`tests/`](./tests/) | 单元、集成与页面渲染检查 |
| [`docs/`](./docs/) | 设计、配置与运维文档 |

## 开发检查

```bash
npm run test:unit
npm run lint
npx tsc --noEmit
npm test
```

`npm test` 会构建应用并检查渲染 HTML；单元与集成测试单独运行 `npm run test:unit`。
