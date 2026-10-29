# Arc 工作区按钮与入口精简实施计划

> **For agentic workers:** Use superpowers:subagent-driven-development. User approved the existing audit and implementation; proceed through verification and the established production release without another design gate.

**Goal:** 完成 2026-10-29 按钮审查的 A1–A4、B1–B3，保留必要导航、草稿、来源参数及不同后果的操作。

**Architecture:** 保留四项主导航；在现有组件内按场景删除重复入口。时间编辑采用显式的成功接受状态，学习伙伴采用共享路由显示规则，不改变会话存储或数据服务。

**Stack:** React / TypeScript / Vitest / Cloudflare，复用当前 ui-warm-precision 工作区。公开发布仅更新网站，不部署 Research executor。

## 1. 实现与针对性验证

- [x] A1：账户菜单删除“继续学习”“我的学习路线”，保留账户与偏好操作。
  - `app/components/account/account-menu.tsx`；现有 account-menu 测试。
- [x] A2：`workspace-header.tsx` 删除通用学习规划入口，非 Path 页移除空工具菜单；Path 保留历史、编辑时间、新建路线。核实所有路线类型均有合适的调整计划入口，保留来源参数及伙伴上下文转交。
- [x] A3：`time-edit-flow.tsx` 删除常驻完成区。保留页头返回和明确“取消修改”；前者保留草稿，后者清除时间草稿。仅成功保存/接受后显示一个“继续今日学习”，编辑、失败和放弃状态不显示。`plan-diff-review.tsx` 用显式决定类型区分接受与放弃；父层保存 owner/goal 作用域的结果，跨 availability 重挂载仍正确，新编辑清除完成态。基础计划同步处理保存完成态。
  - 先增加行为测试：接受/放弃/失败、成功后的再编辑、草稿清除、取消中止、重挂载；再实现。
- [x] A4：`stack-browser.tsx` 在来源返回与下一步的完整目的地和效果相同时删除重复下一步。保留不同 query/hash、作品焦点恢复等副作用；保证删除入口后仍能正确恢复焦点。
- [x] B1：`setup-flow.tsx` 普通限制段删除第二个返回当前路线；保留错误、未确认保存、目标变化等恢复出口与步骤返回。
- [x] B2：`sign-in/page.tsx` 仅在不可用登录面板已经提供样例出口时隐藏页尾样例。正常登录、登录处理中、已登录恢复仍有恰当出口；检查 hydration。
- [x] B3：伙伴仅显示于实际学习页（Today、Path、Stack、Proof、Coach、History、Setup）；公开介绍、登录、后台及未匹配路径隐藏。同一规则用于 `AgentCompanion` 和 `AgentPageFrame`，不得留下空侧栏或改变会话/草稿/用户显示偏好。
  - 验证 workspace → public → workspace 保留会话与草稿，公开页无入口及空白侧栏。
- [x] 不调整审查中的首页可选精简项，不合并不同对象或后果的按钮。

## 2. 审查与构建

- [x] 按清单逐项独立规格审查，再代码质量审查；修复并复核所有实质问题。
- [x] 运行受影响组件/页面测试、TypeScript、Lint；提交干净的应用源码。
- [x] 在 D:/CodexTemp 创建新候选，验证来源/文件清单、执行渲染测试；不复用或覆盖已消费发布证据。

## 3. 发布与验收

- [x] 读取当前生产版本、绑定、运行配置与活动 Research 状态；保存新证据。
- [x] 只替换网站候选入口和静态资产，先 dry-run，再发布一次并核对版本/绑定；Research executor 保持原版本。
- [x] 在正式站桌面和手机验证账号菜单、路线菜单、时间编辑、资料来源返回、公开页伙伴隐藏。涉及保存/失败的状态使用本地行为测试，不更改用户真实学习计划或触发付费模型请求。
- [x] 保存验收结果与截图，推送分支，给用户简洁的变更与发布结果。
