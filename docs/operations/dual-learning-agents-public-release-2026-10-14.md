# 双学习 Agent 公开站点发布记录

- 日期：2026-10-14，Asia/Shanghai。
- 公开入口：https://arcmaps.net/coach
- Sites 备用地址：https://arc-precision-path.jiahe-xu.chatgpt.site
- 项目：`appgprj_6a6678d3e3848191a352778c6db1e7b1`，保持 public。
- 版本：13。
- 保存版本 ID：`appgprj_6a6678d3e3848191a352778c6db1e7b1~appgver_cbd6c73360388191a7e1a317715458cb`。
- 部署 ID：`appgdep_6acf5e86f81c8191a3893725d0ff7126`。
- 部署结果：succeeded，2026-10-14T10:50:58.431659Z，环境 revision 7。
- Sites 源码：`7744edb00b7e01632e3738a1c621be49abd3d6be`，基于 v12 `d4c636e9409cf90e4c2d3c81b910bb383f121806`。
- 产物 SHA-256：`1c3c6a8f9d36df7936ceb952d26748b81e5d9692bda6f535a49f0fb569a76cd4`。

## 集成范围

将双 Agent、OpenRouter 即时生成、登录限制三项变更应用到最新公开源码，保留线上账号恢复与 Continue learning 入口。未合入另一个工作区的 Research / Cloudflare 演练变更。

公开站点使用重新生成的 `0008_learning_agents.sql`，仅新增 `learning_agent_runs` 表及两个索引。旧迁移、快照及 journal 条目保持不变。线上只读 overview 确认从 42 张表增至 43 张，助手表已存在。开发分支原 `0012` 迁移不适用于公开站点迁移链，不可直接覆盖。

独立审查发现并修复登录刷新重置整页表单的问题。助手状态按身份清理，但页面子树保持挂载；规划页局部状态按账号与目标重建，防止无目标时跨账号保留草稿。修复同步回开发分支 `dd43714`。

## 验证

- 最终公开候选：150 个 Vitest 文件、2745 项测试全部通过。
- TypeScript、变更代码 ESLint、Sites 生产构建通过；4 项构建产物/SSR 检查通过。
- 独立审查及复审无剩余阻塞项，包含迁移不可变、登录、退休账号、同源校验、owner/goal/revision 边界。
- 线上浏览器确认 `/coach` HTTP 200；现有登录会话、规划工作区及助手工作区请求 HTTP 200；桌宠可展开聊天，模型未配置时发送按钮禁用。
- 发布后首次脚本加载失败，正常刷新后所有必要脚本成功加载。命令行匿名探测被 Cloudflare 边缘拦截，因此没有把其 403 当成应用鉴权结果；匿名接口拒绝行为由自动测试覆盖。
- 没有进行真实付费模型调用。

## 待配置

生产环境目前没有 `OPENROUTER_API_KEY` 和 `ARC_LEARNING_AGENTS_ENABLED`。助手保持默认禁用；现有 Research 开关未改变。启用需要在站点服务端安全配置密钥及 `ARC_LEARNING_AGENTS_ENABLED=true`，然后完成真实规划、候选采用/放弃、流式答疑与取消的验收。

## 本地发布位置

候选源码位于开发工作区 `outputs/public-agents-20261014`，是从 Sites source helper 打开的独立 checkout。产物 `outputs/arc-public-learning-agents-20261014.tar`、线上截图 `outputs/arc-public-agents-v13.jpg` 均未纳入源码。

Windows 下运行 Sites source helper 打包时，进程内使用 Git Bash（`C:\Program Files\Git\bin` 优先于 WSL bash），并设置 `TAR_OPTIONS=--force-local`，避免 GNU tar 将 Windows 盘符误当远程主机。临时源码凭据只通过隐藏 stdin 传入，不保存到文件、源码或命令行参数。
