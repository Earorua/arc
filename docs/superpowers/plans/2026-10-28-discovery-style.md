# Arc Discovery 风格实施计划

**Goal:** 将参考站的纸色、字型层级、紫色与舒缓动效统一应用于 Arc。

**Architecture:** 保留产品逻辑和现有结构；增加独立 discovery-theme.css 作为最后样式层，重写首页品牌构图并增加展示型 reveal 组件；字体从本地 npm 包加载。

**Tech Stack:** React 19、TypeScript、CSS、现有 Motion、Vite/Vinext、Vitest。

- [x] 1. 安装 Jost / Fraunces / Noto Serif SC；布局与预览使用同一字体入口，包括 Newsreader italic。
- [x] 2. 调整 PrecisionPathHero：首页居中品牌、原创弧线和保留的双入口；原有学习循环移到方法区。维持现有 heading、语言标注与跳转契约。
- [x] 3. 添加渐进增强 Reveal：无脚本默认可见；仅对尚未进入视口的展示章节启用一次出现动画；减少动效直接显示。
- [x] 4. 新增主题文件：全站色彩、排版、按钮、导航、学习工作区、伙伴和各移动断点；保留原有模态和焦点行为。
- [x] 5. 本地预览加入首页并加载正式主题；检查首页和学习工作区桌面 / 手机 / 短屏。
- [x] 6. 运行组件页面测试、类型、lint、构建和 HTML 检查；记录截图、结果与未覆盖范围；提交代码及交付说明。

样式更改通过真实浏览器验收，复用已有功能测试；为新的 reveal 的无脚本 / 减少动效 / observer 清理行为添加必要测试。执行在本会话现有工作区顺序完成。
