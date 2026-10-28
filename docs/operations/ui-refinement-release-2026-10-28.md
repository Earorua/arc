# Arc 全站 UI 优化正式发布 — 2026-10-28

正式网站：https://arcmaps.net 。学习工作区：https://arcmaps.net/today 。

本次发布已完成。Cloudflare 在北京时间 2026-10-28 12:33 将 100% Site 流量切到新版本，随后完成原生读回、公开 HTTP 验证和真实登录态浏览器检查。

## 发布来源

- 应用源码提交：`fc9be49379b88eb747459a45320404daabc2b339`。
- 源码分支：`codex/ui-warm-precision-20261028`。
- 当前完整源码：`C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta/.worktrees/ui-warm-precision`。
- 已合并当天正式站学习伙伴提交 `66703bbe242e00a730c4291b29eb327381a0ae7d` 及其分支进展；不能直接从旧 r207 或仅包含伙伴更新的分支再次部署。
- 冻结候选：`C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta/.worktrees/restricted-research-candidates/ui-warm-precision-20261028-r2`。
- 产物清单 SHA256：`17304312d51f95e876472fa0477d00bff399579027ce19a9cfe13413abf28b12`。
- 正式配置 SHA256：`a57b1308490d6bac93b855aaeadad06042f42e31a0782fa85622e90e9200d861`。
- 原始回执目录：`C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta/outputs/ui-release-20261028`。

`d339021` 是 UI 初稿提交；最终上线的是与最新生产功能合并后的 `fc9be49`。首个无 r2 后缀的候选没有发布。

## 云端结果

| 项目 | 结果 |
| --- | --- |
| Site Worker | `arc-v8-migration-shadow-20260922` |
| 新版本 | `09769554-b2dd-4ff5-a09c-2be000d11a97` |
| Deployment | `5656dc8c-2288-445c-8dd3-c66367695b82` |
| 流量 | 100% |
| 上一版本 / 回退基线 | `cf2f3d4f-36bf-4229-83f5-0a8303085ed6` |
| 私有 Executor | `58ce29e7-80df-4d78-8a28-c7dcdf614555`，未修改 |
| 原配置比对 | 44 项绑定及运行时配置全部一致；未读取密钥值 |

Research 和学习伙伴继续开放。D1、R2、认证、模型、预算、域名和 Executor 维护调度沿用上一正式版本。本次没有数据库迁移、数据回填或学习记录写入。

应用 `app/server`、`app/contracts`、`worker`、`scripts`、`build`、依赖清单与发布前学习伙伴版本一致。配置仅替换主程序与静态资源路径。发布使用冻结的 r2 产物和现有认证，不使用旧 Sites 发布链路。

## 验收结果

- 合并最新功能后的组件、页面、学习伙伴后端及接口定向测试：462 / 462 通过。
- TypeScript、改动文件 ESLint、正式构建通过；构建 HTML 检查 4 / 4 通过。
- 冻结产物核对、Cloudflare dry-run、发布前后原生读取均通过。
- 正式域名首页及 Today、Path、Stack、Proof、History、Coach、Setup、Sign-in 共 9 页均返回 200，旧开发提示未出现。
- 未登录学习伙伴接口返回 401；WWW 返回 308 并保留路径和参数。
- 正式 CSS `/assets/index-DDxk82Kc.css` 与冻结产物 SHA256 一致：`0eb61776061abfada0c4b03baa38eec9040fadba0852d973544dfc44b6c766e5`。
- 真实 Chrome 登录态：原有数据产品经理计划恢复；今日任务、中文导航、独立伙伴侧栏、真实任务上下文和可输入状态正常；技能资料页显示 8 项技能和课程来源。
- 本地同版预览已检查桌面、390×844 手机、667×375 横屏，以及短屏表单与 Escape / 返回焦点。正式站未另做手机实机验收。
- 本次发布及验收付费模型调用为 0；没有点击生成、发送或完成任务。

初始 HTTP 验证脚本误将客户端工作区 landmark 当成服务端 HTML 固定文本，后又假定 Stack 初始外壳与其他页相同。只读检查确认 Stack 在账号加载时显示原有认证外壳，登录后渲染完整工作区。修正的是验收脚本的判定对象，没有为通过检查修改线上应用；最终完整结果在 `public-http-verification.json`。

原实现阶段全仓库测试仍有 1 项既有后台烟雾测试未通过，具体证据与未完全确认的根因保留于 [UI 交付记录](../superpowers/plans/2026-10-28-ui-delivery.md)。本次不宣称全仓库测试全部通过。

## 证据和后续维护

回执目录包含 `deployed.json`、`after-site-deployment.json`、`after-site-version.json`、`after-executor-deployment.json`、`public-http-verification.json`、`browser-verification.json` 和真实正式站截图 `public-today-ui.png`。

后续开发从上述 UI 分支或包含该提交的整合分支继续。保留前一版本作为回退基线；如需回退，先核实届时最新部署和数据兼容性，不重跑本次已消费的单次发布脚本，也不运行旧迁移或关闭演练脚本。文档后续提交不改变实际部署的应用源码提交。

