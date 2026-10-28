# Arc Discovery 风格正式发布 — 2026-10-28

正式入口：https://arcmaps.net 。学习工作区：https://arcmaps.net/today 。
北京时间 2026-10-28 17:11，全部 Site 流量已切换到 Discovery 风格版本；发布后原生读取、公开 HTTP 和真实正式域名浏览器检查通过。

## 发布来源与云端结果

- 应用源码：`8dcd6eb89965588b85eb527881dfd203ba491eb0`。
- 分支：`codex/ui-discovery-20261028`；完整源码：`C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta/.worktrees/ui-warm-precision`。
- Site Worker：`arc-v8-migration-shadow-20260922`。
- Site 版本：`78126d3f-7dac-4f71-84a7-ab5227f2e994`；Deployment：`7cebd1f2-9758-4acf-96d8-33c2f455b212`；流量 100%。
- 上一版本 / 回退基线：`09769554-b2dd-4ff5-a09c-2be000d11a97`。
- 冻结候选：`C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta/.worktrees/restricted-research-candidates/discovery-style-20261028`。
- 产物清单 SHA256：`badc83b2bc8499401bbb4e74a0c2bc648aed7900203d9a6d951519c6a9d575ad`；341 个文件已核对。
- 正式配置 SHA256：`ee59445bdaff6eb98ff88ee2c88331168252f4bbdb53fc8482245af2746c04a4`。
- 原始回执：`C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta/outputs/discovery-release-20261028`。

## 本次发布内容

纸色与紫色主题、Jost / Fraunces / Newsreader 与中文衬线排版、大留白首页、原创 Arc 弧线标记、分层入场与滚动动效、全站学习工作区主题和手机伙伴布局。详情见 [实现与验收记录](../superpowers/plans/2026-10-28-discovery-delivery.md)。

发布前核对 app/server、app/contracts、worker、scripts、build 与上一正式源码完全一致。依赖清单仅增加三种字体；44 项生产绑定和运行时配置保持一致。Research、学习伙伴、认证、数据库、存储、模型、预算、域名和维护调度延续原配置。私有 Executor 仍为 `58ce29e7-80df-4d78-8a28-c7dcdf614555`。

## 发布后验证

- 冻结候选构建与完整性检查、Cloudflare dry-run、发布前后版本核对通过。
- 首页、Today、Path、Stack、Proof、History、Coach、Setup、Sign-in 共 9 页返回 200。
- 首页返回新品牌构图和文案；新版 CSS `/assets/index-BIyYr1hW.css` 与冻结产物哈希一致。
- 未登录学习伙伴接口返回 401；WWW 308 跳转保留路径与参数。
- 真实正式域名、全新匿名浏览器：1440×900 桌面与 390×844 手机首页均无横向溢出；纸色、紫色及字体加载正确。
- 章节滚动淡入、手机导航菜单、登录页显示正常；减少动效模式无运行中的动画；没有页面运行错误。
- 已逐张检查正式站截图：`public-home-desktop.jpg`、`public-home-mobile.jpg`、`public-home-method.jpg`、`public-home-mobile-menu.jpg`。
- 付费模型调用 0；没有数据库迁移、账户修改或学习记录写入。

本次正式浏览器检查使用匿名会话，没有重新登录并重测生成、发送等后端流程。登录态工作区的 UI 验收来自同一应用源码的本地合成样例；本次不将其表述为真实生产账户验收。组件与页面 437 项测试、TypeScript、lint、4 项 HTML 检查及更多本地屏幕尺寸的既有证据保留在实现记录中；没有重复宣称全仓库测试通过。

## 恢复与维护

下一次开发从包含应用提交 `8dcd6eb89965588b85eb527881dfd203ba491eb0` 的分支继续。发布文档提交不改变云端应用源码版本。上线时临时工作目录已不存在，已恢复空目录后继续原有配置检查；没有修改认证信息。
后续发布先读取当时最新云端状态；不要重跑本轮或上一轮已消费的单次发布脚本。回退前重新核对实时版本和数据兼容性。
