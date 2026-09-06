# Arc v8：关闭 Research 的小范围发布准备

**当前状态：本地准备、验证和双审完成，待保存与开发分支备份，尚未发布。** 用户明确接受关闭 Research 入口的小范围 v8 发布准备，并要求顶部显示 `The website is currently under development.`。这条发布路径允许先验收和发布核心规划/Proof 功能，**不以真实 Research 成功作为本阶段前置条件**；真实 Research 的正式启用仍单独验收。

起点：干净开发分支 `codex/v8-openrouter-research-beta` / `e2871a667dd2ded23f429f362024a00125c316a6`。设计与计划先保存为 `f7e0583`。当前阶段只改本地产品文案/样式与相关测试/文档，并普通备份已批准的公开开发分支。没有生产变量/旗标/D1/R2/访问策略操作，没有 Sites 候选或部署、master 合并、PR、真实 Provider 请求或密钥读取。

## 第一轮具体范围

| 内容 | 本阶段方案 |
| --- | --- |
| 访问人群 | 用户已选择保持公开访问，仅关闭 Research；“小范围”指功能范围，沿用 public，不设测试者名单 |
| 公开版本 | 最近 2026-09-06 只读 Sites 核对为 v7.2 / version 9，active/public；本次准备尚未替换它 |
| 页面提示 | 共享根布局中静态、非浮动、可换行的开发提示；文字与用户原文一致，保留 skip-link |
| 新 Research | 未来目标配置 `ARC_AI_RESEARCH_ENABLED="false"`，前端隐藏新建/重试，后端独立拒绝 |
| 原有功能 | 保留 Flagship 规划、Today/Path/Stack/Proof、现有账户数据与 owner 隔离；真实环境仍须验收 |
| 已保存 Research | 保留现有 owner 读取/恢复与可用 Ready 激活，不承诺过期包永远可直接读取或新建规划 |
| 原有 AI preview | Research 专用开关不影响旧 MockAiProvider preview；本方案不修改 `ARC_AI_ENABLED` 或旧 preview cohort |
| 域名 | 沿用现有 Sites 地址即可完成首轮；购买/绑定域名是独立工作，不是本次前置条件 |

当前 Site 最近记录为 public，用户已明确要求保留公开访问，本方案不收缩为本人或指定测试者。Research cohort 是功能准入，**不是全站访问控制**。Sites 每个部署 URL 都属于生产；在公开访问下进行未来迁移时，必须事先明确切换窗口、并发写入处置和恢复方案，不能用“少量测试者”假设代替。若要同时保留公开 v7.2 并另开验证环境，需要另行设计与明确目标，本轮不新建 Site。

## 已核对的关闭链

以下是本地源码事实，不是已读取的生产配置：

- `app/server/research/service-factory.ts` 要求两个 enabled 值都为精确字符串 `true`，并且模型、预算、origin 等完整有效，才构造新调用服务。Research 专用值为 `false`、缺失或其他非 `true` 字符串均不准入。明确 false 比依赖配置缺失更容易核对。
- 配置关闭时，生产工厂的速率上限为 0；`research-route-factories.ts` 对已认证、同源且其余输入有效的新建和 retry POST 返回 **503 / RESEARCH_UNAVAILABLE**，在构造写服务和账户/IP reservation 前停止。身份/输入错误可以先返回，不声称任何请求都固定 503。
- Eligibility 返回 false；新的页面挂载不显示 start/retry 按钮，controller 也拒绝这两种调用。已打开的旧页面不会持续刷新 eligibility，可能暂留旧按钮，但服务端依然拒绝；实际切换后须重新载入验收页面。
- Saved-run 恢复槽与 Ready 使用/Refresh/Flagship 按既有条件保留。对“ineligible + 恢复槽 + 非 Flagship 自定义岗位”的旧引导，本轮改成 `New research is currently unavailable. Continue keeps the proportional v7 path.`，不再邀请发起新 Research。
- 没有独立 Repair 入口；Repair 是已准入 Research 内部的可选第二次调用。关闭新准入阻止新请求产生 Repair，**不取消已准入或在途请求**。它们使用已捕获配置，可能在到期前继续 Repair；后续操作必须先查明并处理在途状态。
- GET 使用 recovery-only 服务，不构造 OpenRouter。但认证、速率限制、telemetry、过期运行转 interrupted 与 quota/budget 对账可能写入。不能把所有 GET 当作无写入检查，也不能无授权发出真实 GET。
- Ready GET 需要包仍新鲜；过期时可返回 503。既有规划通过锁定的 package replay reader 保留，不同于用过期 Research 新建规划。
- `role-research-beta` 缺失/disabled、无效 JSON、用户被排除或 `{"userIds":[]}` 会拒绝。**enabled=1 且 `{}` 放行所有用户**，不能用它表示空名单。仅靠 cohort 拒绝也不同于关配置：会经过部分读写并可能返回 429/ALLOWANCE_REACHED。

源码审查覆盖 eligibility、路由、工厂、orchestrator、D1 Research/cohort、规划/Proof source reader、setup/panel/controller，结论为关闭链已经存在，无需后端功能改造。既有测试 `tests/api/research-routes.test.ts` 已覆盖 disabled start/retry、Failed 恢复、旧 ledger 不变与零 Provider 构造；`research-workspace-pages.test.tsx` 覆盖 ineligible Ready 恢复并生成规划；factory-backed route 测试覆盖 null 写工厂，生产速率为 0 的更早拒绝由源码核对，不冒称同一测试路径。此前 retained 演练的 503/数据保留证据见 `v8-retained-compatibility.md`，本轮不冒称重新运行。

## 上线前仍需取得的真实证据

| 检查 | 具体通过条件 | 当前状态 |
| --- | --- | --- |
| 目标及访问范围 | 明确项目、最终代码/构建、public 状态和切换窗口；核对对公开访客及并发写入的影响 | 用户已选择保持公开，仅关闭 Research；目标运行时和切换窗口仍待核对 |
| 登录与 origin | 目标 HTTPS origin、实际 OAuth 回调一致；登录/退出、账户切换、冲突与 owner 隔离通过；记录结果，不记录秘密值 | 尚未对 v8 托管环境验收 |
| 迁移基线 | 核实实际 DB/R2 对应关系和已应用 ledger，与七份固定 SQL 哈希对应；只执行尚未应用的后缀，核对失败处理 | 本地清单与演练已有，真实基线未核对 |
| 协调恢复点 | 同一时点的 DB/对象/metadata，恢复耗时与可接受中断、恢复点后写入如何保留或处置 | 只有合成本地逻辑恢复证据，真实恢复能力未验证 |
| 恢复应用 | 精确可用 artifact 与数据兼容；需要修复时优先保留 v8 数据结构或使用经过验证的匹配恢复点 | v7.2 直接接管 v8 数据已被演练否定，不能列为现成回滚 |
| 关闭和在途状态 | 核对 false 配置、无仍可触发 Provider 的在途运行；新页面无 start/retry；获准的受控请求符合拒绝结果且无 Provider 构造 | 本地源码/合成证据已有，真实环境未执行 |
| 核心流程 | 顶部提示、Flagship→规划→完成→Proof→撤回/延期；刷新保持、不同 owner 隔离及附件/分享策略正确 | 原本地验收已通过；最终托管环境尚未验收 |

这条路径没有“先等客服才能做完上述准备”的依赖。客服处理和真实 Research 验收可独立继续；本次不申请或消耗新的模型调用许可。关闭 Research 不降低登录、迁移、恢复和数据隔离的验收要求。

## 后续执行顺序与停止条件

1. 完成本轮源码验证、双审与开发分支备份，确定精确发布来源；当前阶段止于这里。
2. 在明确获准范围内核对目标环境、访问方案、认证和存储/ledger/恢复点，形成包含实际结果的发布记录。没有数据恢复能力或 artifact 身份证据时，不推进写入性发布步骤。
3. 在获准的集成范围完成最终源码集成和对应验证；仅凭开发分支备份不表示 master 已集成。准备精确构建，继续保持 Research 关闭。
4. 保持已选择的公开访问，按最终获准顺序落实 Research false、必要在途处理和切换期间并发写入安排，再进行核实过的待执行迁移和精确版本部署。每个外部步骤记录实际结果；不得把未核实的 SQL 全量重跑。
5. 首轮完成上述核心流程和恢复能力验收后进入观察期。建议观察 24 小时后再评估增加功能或启用 Research，增加范围需有实测结果和明确选择；公开访问不等于已验证任意并发容量。
6. 出现账户串读/串写、迁移失败、Proof/附件丢失、未预期 Provider 活动、持续服务异常或恢复证据不符，立即停止增加功能范围，按获准范围限制受影响写入并保存证据。根据故障选择 v8 兼容修复或协调数据恢复；不直接重部署 v7.2，也不删除新表来配合旧代码。

以后开启 Research 才需另行完成：有限次数/预算的真实请求授权、成功结果与来源质量、实际 usage/cost、本地结算一致性、单独配置及 cohort 放开方案。这些仍未完成，不因本次核心功能发布而自动通过。

## 本轮验证记录

开发提示与修正文案已实现。实现者分别观察缺少 notice 与旧 invitation 的有效 RED，随后 root-layout/setup-flow 20/20 GREEN。Root 新鲜完整单测 **138 文件/2,643 测试（72.11 秒）**、非增量 TypeScript、完整 lint、五阶段 build 均通过；最后只有测试断言修正，定向 lint 也通过。

构建产物首次渲染检查 3/4，原因是 React script 数据和实际横幅各有一处原文，原始文本计数不适合验证 UI 唯一性。同一构建的惰性 jsdom 检查确认实际横幅只有一个；改用 DOM 元素的精确文本/role/lang/顺序检查后，root 最终 **4/4（2,027.1421 ms）** 通过。类型检查也发现并修正了新测试的可空 DOM 算术，root 随后重跑通过。沙箱 spawn EPERM 启动失败不计作产品 RED，获准子进程后才记录有效执行。

Root 最终定向 root-layout/setup-flow **20/20（7.82 秒）**；独立规格审查 **P0/P1/P2 0/0/0 READY**，随后独立质量/安全审查同为 **0/0/0 READY**，均核对实际 11 个文件。没有凭据或原始 Provider 输出进入新增内容。最终提交与开发分支备份待完成；未执行的项目不标记通过。本轮没有浏览器截图/交互 QA 或真实托管验收；本地准备完成不代表已上线或具备全部生产验收证据。
