# Arc v8 置信度展示退场实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从 Path、Stack 和 `/intelligence` 移除没有充分依据的置信度展示，同时保持内部字段、Flagship API、规划、Proof 和准备度行为兼容。

**Architecture:** 这是一项纯展示层删减。三个页面分别通过聚焦组件测试建立 RED，再做最小 JSX 和文案修改；内部 `confidence` 数据与 wire contract 保持不变，只在两个源码契约边界加入弃用说明。完整门槛最后证明 UI 已退场、API 仍兼容且其他学习行为没有回归。

**Tech Stack:** TypeScript 5.9、React 19.2、Vinext/Next 16 兼容路由、Zod 4、Vitest 4、Testing Library、ESLint

---

## 文件结构与职责

- `app/components/workspace/adaptive-path.tsx`：只呈现学习者自评，不再呈现蓝图置信度。
- `tests/components/adaptive-path.test.tsx`：锁定 Path 自评仍存在且置信度文案不存在。
- `app/components/stack/stack-browser.tsx`：保留岗位重要性与学习证据事实，删除重复的置信度事实项。
- `tests/components/stack-browser.test.tsx`：锁定 Stack 资源、状态和下一步行动仍存在，置信度在所有技能中均不存在。
- `app/intelligence/page.tsx`：只说明来源、观察时间与证据／推断边界。
- `tests/pages/public-information.test.tsx`：锁定公开 Intelligence 页的可证明信息，并拒绝置信度标签和百分比。
- `app/domain/learning.ts`：保留 v7 兼容字段并加入弃用说明。
- `app/contracts/intelligence.ts`：保留 v8 Zod wire contract 并加入同义弃用说明。
- `tests/api/intelligence-flagship.test.ts`：在 canonical deep equality 之外明确锁定 API 仍包含数值型兼容字段。

不要修改 D1 schema、迁移、Flagship 数值、规划算法、Proof 投影、准备度计算或历史验收记录。

### Task 1: 从 Path 移除蓝图置信度

**Files:**
- Modify: `tests/components/adaptive-path.test.tsx:18-32`
- Modify: `app/components/workspace/adaptive-path.tsx:53-57`

- [ ] **Step 1: 先写失败测试**

在 `renders the exact ordered scope, current phase, calibration and distinct self-assessment` 中保留自评断言，并把现有正向置信度断言替换为零匹配断言：

```tsx
expect(screen.getAllByText(/Your self-assessment: Conceptual/).length).toBeGreaterThan(0);
expect(screen.queryAllByText(/Blueprint claim confidence/i)).toHaveLength(0);
expect(screen.queryByText(/self-assessment.*verified/i)).not.toBeInTheDocument();
```

- [ ] **Step 2: 运行测试并确认 RED 原因正确**

Run:

```powershell
npm run test:unit -- tests/components/adaptive-path.test.tsx
```

Expected: FAIL；`Blueprint claim confidence` 的匹配数量大于 `0`。不得接受导入错误、fixture 错误或其他失败原因。

- [ ] **Step 3: 做最小 Path 实现**

把 `AdaptivePath` 中的审计位置段落改成只输出自评：

```tsx
<p className="audit-position">
  Your self-assessment: {levelLabel[answers.get(skill.id)?.level ?? "unseen"]}.
</p>
```

不要增加替代百分比、badge、tooltip 或新的自评解释。

- [ ] **Step 4: 重新运行 Path 测试并确认 GREEN**

Run:

```powershell
npm run test:unit -- tests/components/adaptive-path.test.tsx
```

Expected: PASS；全部 AdaptivePath 测试通过，无 React warning。

- [ ] **Step 5: 提交 Path 改动**

```powershell
git add tests/components/adaptive-path.test.tsx app/components/workspace/adaptive-path.tsx
git commit -m "fix: remove blueprint confidence from path"
```

### Task 2: 从 Stack 移除置信度事实项

**Files:**
- Modify: `tests/components/stack-browser.test.tsx:10-36`
- Modify: `tests/components/stack-browser.test.tsx:170-201`
- Modify: `app/components/stack/stack-browser.tsx:101-149`

- [ ] **Step 1: 先写失败测试**

在资源证据测试中，把 `Claim confidence` 正向断言改为负向断言，同时继续验证资源元数据：

```tsx
expect(within(structuredContracts!).queryByText(/claim confidence/i)).not.toBeInTheDocument();
expect(within(structuredContracts!).getByText("Free")).toBeInTheDocument();
expect(within(structuredContracts!).getByText("Primary source")).toBeInTheDocument();
```

在 learner status 测试末尾，用以下断言替换 `90% claim confidence`：

```tsx
expect(screen.queryAllByText(/claim confidence/i)).toHaveLength(0);
```

- [ ] **Step 2: 运行测试并确认 RED 原因正确**

Run:

```powershell
npm run test:unit -- tests/components/stack-browser.test.tsx
```

Expected: FAIL；失败来自页面仍找到 `Claim confidence`，而不是筛选、资源或 Proof fixture 失败。

- [ ] **Step 3: 做最小 Stack 实现**

从 `skill-facts` definition list 中删除整个置信度节点，使相邻结构变为：

```tsx
<div>
  <dt>Next action</dt>
  <dd><Link href={next.href}>{next.label}</Link></dd>
</div>
<div>
  <dt>Prerequisites</dt>
  <dd>
    {skill.prerequisiteIds.length > 0
      ? skill.prerequisiteIds.map((id) => skillNames.get(id) ?? id).join(", ")
      : "None"}
  </dd>
</div>
```

删除后让 `Next action` 后直接进入 `Prerequisites`。不要留下空 `<div>`，也不要改动 `Role importance`、learner status、Proof、资源或响应式 CSS。

- [ ] **Step 4: 重新运行 Stack 测试并确认 GREEN**

Run:

```powershell
npm run test:unit -- tests/components/stack-browser.test.tsx
```

Expected: PASS；Stack 的筛选、状态、Proof、资源和重复 key 回归全部通过，无 warning。

- [ ] **Step 5: 提交 Stack 改动**

```powershell
git add tests/components/stack-browser.test.tsx app/components/stack/stack-browser.tsx
git commit -m "fix: remove claim confidence from stack"
```

### Task 3: 精简 `/intelligence` 并标记兼容字段弃用

**Files:**
- Modify: `tests/pages/public-information.test.tsx:16-29`
- Modify: `app/intelligence/page.tsx:17-27`
- Modify: `app/domain/learning.ts:13-17`
- Modify: `app/contracts/intelligence.ts:87-97`
- Modify: `tests/api/intelligence-flagship.test.ts:10-31`

- [ ] **Step 1: 先写 `/intelligence` 失败测试**

把公开 Intelligence 测试替换为：

```tsx
it("explains attributable sources and freshness without unsupported confidence", () => {
  render(<IntelligencePage />);
  const heading = screen.getByRole("heading", { name: /Trust is part of the interface/i });
  expect(heading).toBeInTheDocument();
  expect(heading).toHaveAttribute("lang", "en");
  expect(
    screen.getByText("每条技能结论都显示来源和观察时间。可归属的证据与推断保持明确分离。"),
  ).toBeInTheDocument();
  expect(screen.getByText("Source")).toBeInTheDocument();
  expect(screen.getByText("Observed at")).toBeInTheDocument();
  expect(screen.queryByText("Confidence")).not.toBeInTheDocument();
  expect(screen.queryByText("96%")).not.toBeInTheDocument();
  expect(screen.getByText("Web Platform")).toBeInTheDocument();
  expect(screen.getByText("Web Platform official documentation")).toBeInTheDocument();
  expect(screen.getByText("2026-07-26")).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试并确认 RED 原因正确**

Run:

```powershell
npm run test:unit -- tests/pages/public-information.test.tsx
```

Expected: FAIL；新介绍文案尚不存在，并且当前页面仍存在 `Confidence`／`96%`。

- [ ] **Step 3: 做最小 `/intelligence` 实现**

使用以下介绍文案：

```tsx
<p className="lede">每条技能结论都显示来源和观察时间。可归属的证据与推断保持明确分离。</p>
```

把 specimen 列表保留为三行：

```tsx
<dl className="source-specimen" lang="en">
  <div><dt>Skill</dt><dd>{specimen.skill.name}</dd></div>
  <div><dt>Source</dt><dd>{specimen.source.title}</dd></div>
  <div><dt>Observed at</dt><dd>{specimen.source.observedAt}</dd></div>
</dl>
```

不要改动空 specimen 的 truthful fallback。

- [ ] **Step 4: 在两个 contract 边界加入同义弃用说明**

把 `SkillNode` 字段展开为：

```ts
export interface SkillNode {
  id: string; name: string; category: SkillCategory; importance: SkillImportance;
  why: string;
  /** @deprecated Compatibility-only metadata. Not learner evidence; do not use for product decisions. */
  confidence: number;
  prerequisiteIds: string[]; sources: SkillSource[];
}
```

在 `roleSkillSchema` 中保留原来的数值约束，只加入说明：

```ts
why: z.string().trim().min(12).max(360),
// Deprecated compatibility field. Not learner evidence; do not use for product decisions.
confidence: z.number().min(0.75).max(1),
masteryCriteria: z.array(z.string().trim().min(12).max(240)).min(2),
```

- [ ] **Step 5: 显式锁定 API 继续返回兼容字段**

在 `is guest-safe and returns the canonical version` 中，把一次性 promise 断言改成读取 payload 后的两项断言：

```ts
const payload = await response.json();
expect(payload).toEqual({
  blueprint: flagshipBlueprint,
});
expect(payload).toMatchObject({
  blueprint: {
    skills: expect.arrayContaining([
      expect.objectContaining({ confidence: expect.any(Number) }),
    ]),
  },
});
```

这是对既有兼容行为的 characterization guard；它在生产实现前已经成立，不承担本次 UI 改动的 RED。三个页面测试承担 RED 证明。

- [ ] **Step 6: 运行公开页、契约和 API 兼容测试**

Run:

```powershell
npm run test:unit -- tests/pages/public-information.test.tsx tests/contracts/intelligence.test.ts tests/api/intelligence-flagship.test.ts
```

Expected: PASS；公开页不再显示置信度，Zod schema 仍接受原字段，Flagship API 仍与 canonical blueprint 完全相等。

- [ ] **Step 7: 明确验证 wire contract 未被删除或重命名**

Run:

```powershell
rg -n "confidence:" app/domain/learning.ts app/contracts/intelligence.ts app/data/flagship-role.ts app/data/flagship-blueprint.ts
```

Expected: exit `0`；兼容字段仍存在于两个契约边界和 Flagship 数据转换链路。

- [ ] **Step 8: 提交 Intelligence 与弃用说明**

```powershell
git add tests/pages/public-information.test.tsx tests/api/intelligence-flagship.test.ts app/intelligence/page.tsx app/domain/learning.ts app/contracts/intelligence.ts
git commit -m "fix: retire unsupported confidence display"
```

### Task 4: 聚合回归、构建门槛和本地验收

**Files:**
- Verify only: all files changed in Tasks 1-3
- Do not modify: `docs/operations/v8-resume-checkpoint.md` historical records

- [ ] **Step 1: 运行四文件聚焦回归**

Run:

```powershell
npm run test:unit -- tests/components/adaptive-path.test.tsx tests/components/stack-browser.test.tsx tests/pages/public-information.test.tsx tests/api/intelligence-flagship.test.ts
```

Expected: PASS；四个测试文件全部通过，无 unhandled rejection 或 React warning。

- [ ] **Step 2: 运行完整 unit suite**

Run:

```powershell
npm run test:unit
```

Expected: exit `0`，无失败测试。

- [ ] **Step 3: 运行 TypeScript 与 lint**

Run:

```powershell
npx tsc --noEmit
npm run lint
```

Expected: 两条命令均 exit `0`，无 TypeScript 或 ESLint 错误。

- [ ] **Step 4: 运行 production build 与渲染 HTML 检查**

Run:

```powershell
npm run build
node --test tests/rendered-html.test.mjs
```

Expected: build exit `0` 且所有阶段完成；rendered HTML tests exit `0` 且无失败。

- [ ] **Step 5: 运行文本和 diff 边界检查**

Run:

```powershell
rg -n "confidence|Claim confidence|Blueprint claim confidence" app/components/workspace/adaptive-path.tsx app/components/stack/stack-browser.tsx app/intelligence/page.tsx
git diff --check
```

Expected: `rg` exit `1` 且无匹配，证明三个用户界面已完全退场；`git diff --check` exit `0`。

- [ ] **Step 6: 在现有本地预览执行人工验收**

按以下顺序检查，不修改任何数据模型：

1. `/path`：仍显示 `Your self-assessment`，不出现 `Blueprint claim confidence`。
2. `/stack`：仍显示 learner status、Role importance、Proof、资源和下一步行动，不出现 claim confidence。
3. `/intelligence`：仍显示 Skill、Source、Observed at 和新边界文案，不出现 Confidence 或百分比。
4. `/proof`：`demonstrated readiness` 和 verified skills 保持原行为，页面不受本次改动影响。

Expected: 四项均符合；320px 和桌面宽度均无新增空白事实项或横向溢出。

- [ ] **Step 7: 确认工作树与提交边界**

Run:

```powershell
git status --short --branch
git log -5 --oneline
```

Expected: 工作树无未提交改动；最近提交依次包含 Path、Stack、Intelligence 三个聚焦提交以及此前规格提交。不得 push、merge 或 deploy。
