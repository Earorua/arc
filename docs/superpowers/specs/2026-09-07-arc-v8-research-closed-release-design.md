# Arc v8 Research 关闭发布准备与开发提示

用户接受“关闭 Research 入口的小范围 v8 发布”准备方案，并明确要求网站顶部显示 **The website is currently under development.** 本文细化已批准的本地准备与页面修改，延续子代理驱动、TDD、规格审查后质量/安全审查与已批准的公开开发分支备份。起点为干净 `codex/v8-openrouter-research-beta` / `e2871a667dd2ded23f429f362024a00125c316a6`，沿用权威 worktree。

## 交付与边界

1. 在根页面布局添加临时开发提示，验证产品构建中的真实 HTML。
2. 准备 Research 关闭状态的发布操作清单，核对当前 UI/服务端关闭链和已有离线测试，把上线范围与 Research 正式启用分成不同验收。
3. 更新恢复入口，保存并普通备份开发分支。当前公开仍为 v7.2，完成本地准备不代表 v8 已上线。

“先准备”不包含本轮生产变量/旗标/数据库/对象变更、Sites 访问策略/候选保存/部署、master 合并或 PR。没有新的真实 Provider 请求授权，不读取真实 Key、环境文件或原始 Provider 输出。不新建 worktree，不重做已完成的 v8 产品功能或旧版兼容性演练。

## 顶部提示

选择共享 `app/layout.tsx` 中的静态提示，置于跳到主要内容链接之后、页面 children 之前。相比只改公共 SiteHeader，它同时覆盖登录、设置、工作区及分享页；相比 fixed/sticky 横条，它不覆盖导航或内容，不增加高度测量/滚动逻辑。

使用静态 `p`，`role="note"`、`lang="en"`、单一 `.development-notice` 样式，文字完整且仅一次。沿用现有 charcoal/chalk 配色，0.875rem、1.5 行高，居中、适量内边距、自然换行。保留 skip-link 的键盘入口。无关闭按钮、计时器、客户端状态、额外 API 或环境变量；正式发布时可在后续明确改动中移除这段标记和样式。

测试验证真实根布局输出的准确文字、语言、唯一性和位于主内容之前。构建后既有 rendered HTML 测试同时核对生产产物中的提示；不以源码字符串检查代替实际渲染。不新增浏览器视觉测试或截图流程。

## Research 关闭方案

复用既有 `ARC_AI_RESEARCH_ENABLED` 准入机制，未来目标值为字符串 `false`。本轮只记录方案，不读取或修改生产值。配置不满足时 eligibility 必须为 false，新建及重试入口不可用，服务端拒绝新增调用；不能仅隐藏按钮。已有 Research 读取/恢复与 Flagship、规划、Proof 继续使用其现有路径。

先审查当前源码和已有测试，只有发现影响此关闭方案的实际缺口才扩大实现，并先记录范围及测试证据。不新增持久化模型、访问控制系统或公开功能旗标。本次最小发布不需要依赖真实 Research 成功；以后开启 Research 仍要单独完成真实结果、来源质量、usage/cost 与预算验证。关闭准入不取消在途调用，恢复 GET 可能对过期运行对账，不称全部 GET 无写入。

只读审查发现一个实际 UI 文案缺口：`SetupFlow` 把 `researchRecoveryAvailable` 也当成可以发起新 Research 的条件，关闭后恢复槽存在时仍显示 Research this role 的引导。本轮仅把该分支改为 **New research is currently unavailable. Continue keeps the proportional v7 path.**；保持已 eligible 的原始引导、恢复槽渲染、Ready 使用、Flagship 和 Continue 逻辑不变。在已有 setup-flow 测试文件中新增非 Flagship 岗位的 ineligible+recovery 场景，先观察文案 RED，再修改条件。不扩大到一般错误文案改写。

关闭链的精确限制：`role-research-beta` enabled=1 且 cohort `{}` 会放行所有用户，不能当作空名单；但 Research 专用开关为 false 已使新调用不可构建。旧 deterministic preview 与该开关独立，本轮不改 `ARC_AI_ENABLED`。旧计划/Proof 保留不代表所有历史 Research 包永久可重新激活；过期包读取可能返回 503。已准入的调用及其 Repair 不会被旗标即时取消，未来切换必须检查在途状态。

用户已明确选择 **保持公开访问，仅关闭 Research**，覆盖早先暂按本人验收起草的假设。“小范围”指本轮功能范围，不限制访客名单；方案沿用 public，不改变全站访问策略，也不把 Research cohort 当作全站访问控制。实际部署仍须核对目标站点与公开访问状态，自定义域名不是本轮发布前置条件。

## 发布准备的完成条件

页面改动通过针对性 TDD、完整单测、非增量 TypeScript、lint、完整构建与真实产物渲染检查。关闭链的现有测试和必要离线证据被准确引用或新鲜复验。随后独立规格与质量/安全审查通过，精确文件提交并普通备份。

操作清单必须列明：实际发布身份/访问范围；生产登录与回调；D1/R2 映射和 migration ledger/待执行后缀；协调恢复点和恢复耗时；与 v8 数据兼容的恢复应用；Research 关闭状态、主流程与账户隔离验收；观察期和停止扩大范围的条件。旧 v7.2 已证实不能直接接管 v8 数据，不能把直接重部署旧版作为回滚方案。未取得的外部证据必须保持未完成，不用本轮 banner 或构建通过代替它们。
