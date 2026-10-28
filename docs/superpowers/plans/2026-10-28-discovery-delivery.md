# Arc Discovery 风格调整交付 — 2026-10-28

**状态：本地实现及验收完成，尚未发布。** 当前正式站仍为上一轮已发布版本 `09769554-b2dd-4ff5-a09c-2be000d11a97`。本次没有修改生产配置、账户、学习记录或发起付费模型调用。

分支：`codex/ui-discovery-20261028`；基线 `5858891`，包含上一轮 UI 和最新学习伙伴的完整整合。工作区：`C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta/.worktrees/ui-warm-precision`。

## 实际调整

- 参考 [Discovery Loop](https://www.discoveryloop.com/) 的公开页面与样式参数：纸色背景、轻字重、宽字距导航、衬线叙事、大留白、紫色和舒缓动效。
- 首页改为居中 Arc 品牌构图、原创弧线图形、学习方法、产品样例和深墨色行动区。保留已有账号跳转、创建路线、完整样例和语言标记。
- 全站使用本地 Jost、Fraunces、Newsreader；中文展示文字使用 Noto Serif SC，任务与输入使用中文无衬线字体。保留开源字体许可证及锁定版本。
- 新主题统一 Today、Path、Stack、Proof、Coach、设置与其他公开页的色彩和字型；工作区标题 32–44px，正文 16px，操作区继续清晰可读。
- 主背景 #f5efe7，装饰紫 #8e5db0；小字链接和状态文字使用 #744596，在主背景上对比度 6.06:1。
- 首页 1.1 秒分层淡入、章节单次滚动淡入、弧线轻浮动、250–300ms 悬停。减少动效偏好下停用动效；无脚本时正文与入口可见。
- 学习伙伴延续真实任务上下文、独立侧栏和手机模态，配色一致；手机收起时隐藏气泡文字、缩小头像，减少正文遮挡。
- favicon 的纸色与紫色同步。已有分享预览 PNG 未重制。

## 验收证据

| 检查 | 结果 |
| --- | --- |
| 组件与页面测试 | 437 / 437 通过，报告 `work/ui-verification/discovery-tests.json` |
| TypeScript | 通过 |
| 修改文件 ESLint | 通过 |
| 正式构建 | 通过 |
| 构建 HTML 检查 | 4 / 4 通过 |
| Git 差异检查 | 使用 CRLF 感知设置，通过 |
| 桌面 1440×900 | 首页、Today、Path、Stack、Proof、Coach 已检查 |
| 手机 390×844 | 上述页面均无横向溢出；首页菜单及末尾入口可用 |
| 短屏 667×375 | 伙伴输入与页脚可通过滚动和键盘访问 |
| 焦点 | Escape、隐藏、重新显示均恢复到相应入口 |
| 减少动效 | 首页无运行中的动画，内容可见 |
| 无 JavaScript | 正式构建的首页文字和操作入口仍显示 |
| 控制台 | 视觉检查没有页面运行错误 |
| 独立代码复核 | 小字紫色对比度问题已修复，无剩余阻断发现 |

默认浏览器工具在检查过程中发生临时目录异常。用户随后明确允许改用 Playwright；后续验收使用项目内独立安装的 Playwright 1.55.0 与本机 Chromium，所有学习数据均为合成样例，浏览器关闭后保留预览服务。

本地证据目录：`outputs/discovery-review/`。主要截图：`home-desktop.jpg`、`home-mobile.jpg`、`today-desktop.jpg`、`today-mobile.jpg`、`companion-mobile.jpg`。最终结果为 `final-pass.json`、`edge-checks.json`、`mobile-pages.json` 和 `contrast.json`。初始快照误在下一动画帧前读取焦点、菜单检查未包含其加号名称；原始失败记录保留，最终检查已按实际可访问名称和焦点状态等待后通过。

未进行真实手机硬件验收，也未逐一登录生产账号重测后端流程。上次全仓库后台烟雾测试的既有问题见 [上一轮交付记录](2026-10-28-ui-delivery.md)；本次没有重跑全仓库测试或将定向测试表述为全仓库通过。

## 查看与后续发布

- 本地首页：http://127.0.0.1:4180/
- 本地学习工作区：http://127.0.0.1:4180/today
- 启动方式及隔离边界：`tests/ui-preview/README.md`。
- 源码变更不涉及 `app/server`、`app/contracts`、`worker`、`scripts`、`build`；依赖清单仅添加三种字体。
- 后续如发布，需从本分支冻结新的候选，核对届时最新云端配置；不要复用上一轮已经消费的单次发布脚本。

