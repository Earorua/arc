# Homepage Showcase Entry Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. User explicitly authorized removing homepage duplicates; reuse the existing isolated checkout and production release workflow.

**Goal:** 首页仅保留一个通向产品样例的入口，桌面及手机均可找到。

**Architecture:** 保留 SiteHeader 中的「产品样例」导航，移除 PrecisionPathHero 与首页产品介绍部分的重复链接。正文继续介绍 Today / Path / Proof；学习主入口及其他页面的导航不变。

**Tech Stack:** React / TypeScript / Vitest / Cloudflare。

## 设计判断

当前首页共有三个 `/showcase` 链接。选择保留顶部全站导航，可以保持公开页面的导航一致，桌面滚动时仍能找到样例，手机端从「浏览」菜单进入。仅保留首屏会使首页与其他公开页导航不一致；保留导航和首屏两个入口则仍存在用户要求去除的重复。因此移除两处正文入口。

## 实施与验证

- [x] `app/components/brand/precision-path-hero.tsx`：删除样例 Link 和未使用的 Link 导入；保留唯一学习主动作。
- [x] `app/page.tsx`：删除产品介绍末尾指向 `/showcase` 的链接，保留介绍内容。
- [x] `app/discovery-theme.css`：删除仅用于已移除按钮的三个 `.hero-secondary` 规则。
- [x] `tests/pages/home.test.tsx`：将旧的首屏样例断言改为顶部导航内唯一「产品样例」链接；`tests/rendered-html.test.mjs` 对构建后首页检查唯一入口，避免旧副本回归。
- [x] 运行首页、页头、公共学习入口与样例相关测试，TypeScript 和变更文件 ESLint；构建后运行 5 项渲染检查。
- [x] 发布网站候选并核对版本、运行配置及执行器未变。
- [x] 正式网页核对桌面、手机全页仅一个 `/showcase` 链接；手机展开「浏览」并点击可打开样例；保存截图和验收记录，推送分支。
