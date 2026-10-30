# Homepage Copy Hierarchy Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. The user chose a hero with only the primary promise and relocation of supporting copy. Reuse the existing isolated checkout and established website-only release workflow.

**Goal:** 保留用户喜欢的三句话，减少首屏文字层级。

**Architecture:** Hero 保留 Arc 标志、主口号和唯一学习按钮；中文说明移入首页 Method 介绍；英文副口号移入学习方法页现有引题。导航与状态逻辑不变。

**Tech Stack:** React / TypeScript / CSS / Vitest / Cloudflare。

## 设计

- 视觉：延续暖纸色、紫色和衬线字体，首屏像一张留白充分的品牌海报。
- 内容：主口号负责记忆，第二屏中文负责解释，方法页英文引题负责传达持续学习理念。中文说明替换首页介绍区含义重复的一句；不增加段落数量。
- 动效：保留标志缓动与主口号入场；按钮紧随主口号出现，缩短移走文字后多余的等待。保留降低动态效果偏好。
- 留白：主口号与按钮间距桌面 40px、手机 32px。方法页引题允许自然换行。

## 实施

- [ ] `app/components/brand/precision-path-hero.tsx` 移除英文副口号和中文说明。
- [ ] `app/page.tsx` 将完整中文说明放入 Method 区第一段，合并原来重复表达。
- [ ] `app/method/page.tsx` 将英文副口号放入现有引题；`app/method/method.css` 支持双语引题换行。
- [ ] `app/discovery-theme.css` 清理移走文案的样式，调整按钮间距与入场时间。
- [ ] 更新现有双语内容验收，并运行首页、公开介绍、导航、状态入口、样例相关检查和 TypeScript / ESLint。
- [ ] 构建并验证产物，发布网站且保持执行器版本、运行配置与数据不变。
- [ ] 验收桌面和手机的首页首屏、下方介绍区及方法页；保存截图、报告并推送分支。
