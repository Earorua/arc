# Homepage Method Entry Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. User authorized removing homepage duplicates; reuse the isolated checkout and established release workflow.

**Goal:** 首页只保留一个学习方法页面入口，并清楚区分页面跳转和页内浏览。

**Architecture:** 保留顶部「学习方法」，删除正文与页尾两个同址链接。首屏 `#learning-method` 页内锚点改名「向下浏览」，保留滚动提示与介绍内容。

**Tech Stack:** React / TypeScript / Vitest / Cloudflare。

## 设计

三个 `/method` 链接功能相同，统一保留全站导航，和刚完成的样例入口规则一致。首屏锚点不离开首页，属于不同功能；保留并改名比删除更有利于发现下方内容。保持学习方法页面本身、学习入口与产品样例导航不变。

## 实施

- [x] `app/page.tsx` 删除正文「了解学习方法」及页尾「学习方法」链接；页尾保留品牌和标语。
- [x] `app/components/brand/precision-path-hero.tsx` 将「探索学习方法」改为「向下浏览」，保留锚点目标。
- [x] `app/discovery-theme.css` 清理已无使用位置的正文文字链接及页尾链接样式。
- [x] 更新已有首页及构建产物检查：全页唯一 `/method` 链接位于导航，页内锚点仍有有效目标，样例和学习入口的精简结果保持。
- [x] 运行 5 个相关测试文件、TypeScript、变更文件 ESLint 和构建产物检查。
- [x] 发布新网站候选，核对版本及绑定，研究执行器保持原版本。
- [x] 验证桌面及手机菜单可进入方法页；「向下浏览」只滚动首页；保存截图与记录，推送分支。
