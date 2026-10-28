# 学习伙伴 Cloudflare 发布记录

2026-10-28 10:20（Asia/Shanghai）已发布并启用。正式站：[学习规划师与学习伙伴](https://arcmaps.net/coach)。部署到用户自有 Cloudflare，未发布到旧 Sites。

## 源码与运行版本

- 基线 master：`31b80804e6b91b688116c18e5b92ab338f30840d`。
- 应用源码提交：`66703bbe242e00a730c4291b29eb327381a0ae7d`。
- 分支：`codex/learning-companion-v8-20261028`；[草稿 PR #9](https://github.com/Earorua/arc/pull/9)，未合并 master。
- 网站 Worker：`arc-v8-migration-shadow-20260922`。
- 新版本：`cf2f3d4f-36bf-4229-83f5-0a8303085ed6`；部署：`6de8cfe4-1a5a-4f68-864b-f0bdccb70b67`，100% 流量。
- 上一版本（已含用户保存的 Secret、助手尚未启用）：`1bfe3648-9e0c-4b04-a06e-3c16500298c2`。
- 复核配置 SHA256：`64c33d6a1be773dfcd2f0b64ca087594c25a9e5e7f5dc119ad2f0caa751e81bd`。
- 127 个构建文件的清单 SHA256：`96bd8d325cb5d24812c45e8e3e11ea3c8a7bb7c5c5faf2b2cae20d4b94068584`。

## 用户授权与配置

用户明确选择同时启用 AI 答疑，并亲自在 Cloudflare 保存网站专用 `OPENROUTER_API_KEY` Secret。只检查名称和类型，未读取或复制密钥值。两个 Agent 共用网站 Worker 的密钥，Research Executor 保持独立。

线上显式设置 `ARC_LEARNING_AGENTS_ENABLED=true`，规划师和答疑均为 `openai/gpt-6-astra`。规划使用 max 推理，常规答疑 low、深入讲解 high。全站日/月应用预留额度均为 5 美元，每用户日 2 美元；规划单次 2 美元、答疑单次 0.5 美元。价格上界为输入 13、输出 50 micro-USD/token。额度是应用侧准入预留，不等于实际账单；失败预留不返还。

原登录变量和 Secret、Research 配置与额度、D1/R2 和 service binding、域名与关闭的 workers.dev/preview 设置均保留。未运行数据库迁移、恢复历史数据或发布私有 Executor。

## 行为与验证

- 当前学习上下文来自活动路线及用户时区，只选择未完成且已到日期的必修任务；包含真实进度和保存的主/备选课程资料。
- Research 来源损坏或版本不一致时明确失败，不退回内置全栈路线。没有当天任务、未完成设置、AI 关闭和读取错误分别显示。
- 伙伴内可展开路线和资料，建议问题只填写草稿；原最小化、隐藏、深入讲解和交给规划师功能保留。
- 145 项相关测试（14 个文件）、4 项渲染产物检查、TypeScript、变更文件 ESLint、生产构建、独立规格与质量复核通过。
- 本地桌面及 390×844 窄屏验收通过，内容可滚动，输入区域保持可见。
- 公开 `/coach` 返回 200；匿名 GET `/api/agents/workspace` 返回 401。
- 实际登录会话 GET `/api/agents/workspace` 返回 200、`authenticated: true`、`enabled: true`、`availability: ready`，路线来源为 Research。
- 浏览器确认当前任务、完成进度和保存的课程链接；输入草稿后发送按钮启用，随后清除草稿，未提交。

本轮付费模型调用数为 0。密钥的模型权限、账户余额及真实首条回答尚未通过付费调用验证；由用户在已登录页面自行发送首条问题。

## 发布过程及恢复依据

首次发布因 Wrangler strict 模式发现预定启用变量与远端配置差异而暂停。日志中仅有 9 次 Cloudflare GET，线上版本保持不变。Wrangler 在暂停时将远端默认字段补入本地配置；保留该副本后，恢复并校验了与已审候选完全相同的 SHA256。

独立复核通过后，后续脚本先检查原失败记录、未变化的线上版本、全部旧变量和 Secret 名称、D1/R2/service binding、构建哈希及非 Agent 配置深比较，再执行有独占尝试记录的一次发布。发布后读回版本、100% 流量与配置，随后完成上述公开页面验收。

本地证据保存在本分支工作树 `outputs/companion-release/`，包含 `review-ready.json`、`artifact-manifest.json`、两次尝试记录、`deployed.json`、`production-after.json`、`public-ui-verification.json` 和 `public-companion.png`。输出目录不提交源码仓库；不含密钥值的配置回执也不要用作跨版本自动重放工具。后续发布应从本分支或合并后的最新 master 继续，避免使用旧研究工作目录覆盖本次更新。
