# Homepage Learning Action Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans; user explicitly authorized identifying and removing homepage duplicates. Reuse the current isolated checkout and established website-only release workflow.

**Goal:** 首页只保留首屏一个状态感知的学习入口。

**Architecture:** 首页移除页尾 HomeLearningAction，SiteHeader 在首页不显示同址的学习工作区入口。其他公共页保留工作区入口。既有 LearningEntry 的恢复草稿、未知保存结果、账号隔离、错误重试与重新登录逻辑不变；仅减少呈现次数。

**Tech Stack:** React / TypeScript / Vitest / Cloudflare。

## 已确认的设计

已有路线时当前首页共有三个 `/today` 入口：顶部学习工作区、首屏继续学习、页尾继续学习。仅保留首屏。没有路线或恢复设置时同样保留一个主动作，避免重复加载提示、重复错误重试和重复创建入口。设置流程本身仍提供返回当前路线的出口。

## 实施

- [x] 修改 `tests/pages/home.test.tsx`，验证已有路线仅一个 `/today` 链接、未建路线仅一个创建动作，加载/错误/重新登录/恢复草稿仍有一个正确动作；保留读取失败后的重试行为测试。
- [x] 修改 `tests/components/site-header.test.tsx`，验证首页不显示工作区入口，方法/样例页仍随登录状态显示，hydration 正常。
- [x] 运行相关测试观察新增行为断言失败。
- [x] 修改 `app/page.tsx`、`app/components/brand/site-header.tsx`；移除不再使用的 `HomeLearningAction.secondary` 和专用文字按钮样式，保持其他版式。
- [x] 运行首页、公开入口、页头、创建恢复相关测试与 TypeScript / ESLint，独立代码审查。
- [ ] 提交应用源码，在 D:/CodexTemp 构建新候选，运行渲染检查，确认 executor 文件未变。
- [ ] 只发布正式网站，核对版本与绑定；桌面和手机核对全页仅一个学习入口，并保留方法页工作区入口。
- [ ] 保存验收记录和截图，推送分支。
