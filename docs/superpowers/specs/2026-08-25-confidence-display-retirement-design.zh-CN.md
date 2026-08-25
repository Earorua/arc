# Arc v8 置信度展示退场设计

**日期：** 2026-08-25  
**状态：** 设计已获用户批准，中文书面规格待审阅  
**范围：** 仅限本地 `codex/v8-proof-backed-stack` 分支；不部署

## 1. 问题

Arc 目前会在 Path、Stack 和 `/intelligence` 中展示技能 `confidence` 百分比。这个数值既不是学习者评分，也不是根据证据计算得出的来源可信度。Flagship 数据只是把岗位重要性直接映射为固定值：`core` 为 0.96、`strong` 为 0.90、`advantage` 为 0.82。因此，该百分比与重要性信息重复，却表现得比实际依据更加精确。

这会造成三个产品问题：

- 学习者可能把蓝图置信度误解为个人掌握度、Proof 质量或岗位准备度；
- 该数字增加了视觉权重，却不会改变规划、Proof 投影、Stack 状态或准备度；
- `/intelligence` 暗示置信度能够说明可信性，但当前数值并不是根据来源质量独立计算出来的。

## 2. 决策

从 Path、Stack 和 `/intelligence` 中移除所有面向学习者的置信度标签和百分比。

为了兼容，暂时在内部岗位数据、v8 intelligence schema 和 `/api/intelligence/flagship` 响应中保留 `confidence`。把该字段视为已弃用的产品元数据：

- 产品界面不得展示它；
- 它不得影响规划、排课、Proof 状态、Stack 状态或准备度；
- 任何新的产品行为不得依赖它；
- 未来修订 intelligence contract 时，必须将其删除或替换为有可靠依据、由来源证据计算的模型。

Intelligence API 本身仍然属于 Arc 长期“岗位到计划”链路的一部分。本次改动仅让缺乏依据的百分比展示退场，不删除岗位蓝图服务，也不否定其未来支持自定义岗位的用途。

## 3. 面向用户的变化

### Path

保留学习者的自评语句，移除相邻的 `Blueprint claim confidence N%`。调整后的文案只报告学习者提供的校准信息，不暗示 Arc 已经完成验证。

### Stack

从每个技能条目中移除 `Claim confidence` 事实项及其百分比。继续保留状态、岗位重要性、已完成单元数量、最强 Proof、最近使用时间、下一步行动、前置技能、必要性说明、掌握标准和资源证据。

### `/intelligence`

移除 `Confidence` 行。重写介绍文字，使页面只承诺自己能够证明的内容：明确展示来源归属、观察日期，以及证据与推断之间的边界。继续保留技能、来源和观察日期三行。

### Proof

不修改 Proof。它的 `demonstrated readiness` 和已验证技能数量属于学习者证据指标，与蓝图置信度相互独立。

## 4. 数据与 API 兼容性

本次改动保持以下结构不变：

- v7 兼容模型中的 `SkillNode.confidence`；
- v8 intelligence schema 中的 `RoleSkill.confidence`；
- Flagship 蓝图数据和验证范围；
- `/api/intelligence/flagship` 响应结构；
- D1 intelligence schema 和迁移。

在 `app/domain/learning.ts` 与 `app/contracts/intelligence.ts` 的 `confidence` 旁加入相同且简洁的源码级弃用说明。说明必须明确：该字段只为兼容而保留，它不是学习者证据，也不得驱动产品决策。本次不包含 wire format 重命名、数据迁移、schema 版本升级或 endpoint 版本升级。

## 5. 布局与无障碍

这是一次删减型改动。现有信息层级、焦点行为、语义标题、响应式断点和键盘交互保持不变。移除 Stack 事实项后，不得留下空的 definition list 单元，也不得产生横向溢出。移除 Path 中的 span 后，自评语句必须保持完整。

不引入替代徽标、tooltip、百分比或定性的置信度标签。

## 6. 错误处理与数据流

不修改任何请求、持久化或错误处理路径。在现有 contract 仍要求该兼容字段的地方，浏览器继续接收并验证它，但渲染组件忽略它。规划和 Proof 计算继续使用各自现有输入。

## 7. 测试策略

实施将遵循红—绿循环：

1. 先更新聚焦的组件和页面测试，要求 Path、Stack、`/intelligence` 不再出现置信度文案，同时确认其余信息仍然存在。
2. 运行聚焦测试，确认它们因为现有页面仍在展示置信度而失败。
3. 做最小生产代码修改：移除三处展示、更新 `/intelligence` 文案，并加入 contract 弃用说明。
4. 重新运行聚焦测试，然后运行相关页面和组件回归。
5. 在报告完成前运行 TypeScript、lint、build、渲染 HTML 检查和 `git diff --check`。

API contract 测试必须继续证明 Flagship 响应符合 schema，并且仍携带该兼容字段。除非现有测试错误地把规划或 Proof 行为与置信度耦合，否则规划和 Proof 测试不应改变。

## 8. 非目标

本次改动不会：

- 创建新的来源置信度算法；
- 重命名 API 字段或改变其数值；
- 启用自定义岗位的自适应规划；
- 把 `/api/intelligence/preview` 接入计划生成；
- 修改学习者准备度计算；
- 修改认证、持久化、D1、R2 或生产配置；
- 部署或发布任何 artifact。

## 9. 未来 contract 决策

实现动态岗位研究时，Arc 不得继续把当前固定的重要性映射当作可信度评分。下一版 intelligence contract 设计必须明确选择以下两种结果之一：

- 当来源归属和新鲜度已经足够时，彻底删除 `confidence`；或
- 用结构化的证据强度取代它，并根据有文档定义的输入计算，例如来源等级、独立来源一致性、观察时间新鲜度和审阅状态。

该未来决策必须另行编写规格，并接受 contract 版本控制审查。
