# 修订资料事实后重新核验能力建议

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户把自己的经历改成他人经历、未来计划、否定或引用示例后，核对页面和服务端不再保留失去支持的旧AI能力建议，同时保留仍有个人证据的建议。

**Architecture:** 将执行器已有的纯文本引文、主体范围和等级支持逻辑抽为应用层共享函数，worker继续调用相同逻辑。保留原建议身份／成员校验，在当前grounded草稿及所有用户修订事实上增加逐建议的语义复核；不新增建议、不升级等级、不写能力自评，也不重算历史记录。先完成这项独立修复，再实施实践优先级归因和新版本的mention投影。

**Tech Stack:** TypeScript、React、现有ReviewService/D1、Vitest、本地workerd；沿用当前工作树和断网包装器。

## 依据、选型与范围

已获准执行的v2.1要求用户核对有影响的能力建议，不让资料事实自动等同个人能力。11月8日只读诊断用实际ReviewService保存／重载确认：把 `I tested SQL under supervision.` 改为 `My colleague tested SQL under supervision.`，原guided SQL建议仍保留，尽管已有worker语义函数会返回null。当前保留函数只检查kind与label，导致真实引用和建议身份虽未伪造，建议却已不适用。

采用共享既有语义逻辑，而不是仅检查技能名或在UI另写一份简化正则。前者不能处理动作否定，后者会使客户端与服务端再次分歧。worker的文档位置定位、JD要求冲突与review-point生成继续留在worker；共享模块不依赖server、worker、D1、环境变量或网络。

这是现有方案内的离线正确性修复。仍不接入新mention投影，不改变课程映射和实践优先级，不扩展学习意图资格，不部署、不远程迁移、不调用真实模型、不推送。

**11月8日Task 1补充的实证修正：** 根任务对 `80546d0` 的原worker函数进行8个只读对照，确认 `I did not test SQL under supervision.` 对SQL错误返回guided，而正常个人实践返回guided、其他6个否定／无指导对照返回null。原日志 `shared-assessment-root-negation-20261108-a`，exit 0、出站拦截0；这是缺陷表征，不是语义验收通过。Task 1须先把该句、前置指导及同类did-not动作写为预期null红例，再增加局限于当前个人动作的否定保护；不能一概拒绝任意包含not的长句，或把未受指导等同于没有经历。其余原行为继续保持并对照；原始基线不得改写。

## Task 1：共享能力建议的文本证据规则

**Files:** 新增 `app/lib/materials/self-assessment-evidence.ts`；必要的引文公共函数放入 `app/lib/materials/quotation-evidence.ts`；修改 `worker/document-executor/source-review-evidence.ts`，维持其已有导出接口；新增 `tests/lib/materials/self-assessment-evidence.test.ts`。原 `tests/server/document-source-review-evidence.test.ts` 等套件不削弱。

- [x] 先增加共享接口的红例，覆盖概念、指导练习和明确自评不确定三个等级，以及相同词出现在另一个不支持该等级任务的情况。

```typescript
export function supportsMaterialSelfLevelHint(input: {
  kind: DocumentCandidate["kind"];
  text: string;
  labels?: readonly string[];
  level: DocumentCandidate["selfLevelHint"];
}): boolean;

expect(supportsMaterialSelfLevelHint({ kind: "experience", text: "I tested SQL under supervision.", labels: ["SQL"], level: "guided" })).toBe(true);
expect(supportsMaterialSelfLevelHint({ kind: "experience", text: "My colleague tested SQL under supervision.", labels: ["SQL"], level: "guided" })).toBe(false);
```

- [x] 把现有worker的引文遮蔽、个人标题、assertion scopes、guided／conceptual／uncertain支持与必要的个人补问辅助移到共享模块。保留规则与源范围，不复制整套正则；只导出worker确实还要使用的辅助函数。现有 `groundSourceSelfLevelHint` 作为薄适配器，将 `source.quote` 传给共享接口并保留其原null返回语义。

```typescript
return supportsMaterialSelfLevelHint({
  kind: item.kind, text: item.source.quote,
  labels: item.skillLabels, level: item.selfLevelHint,
}) ? item.selfLevelHint : null;
```

- [x] 文档完整引文定位、被外围引文包裹的来源判断、JD要求优先级、课程缺失／其他review-point代码留在worker；只从共享模块导入它们需要的文本辅助。新函数不依赖DocumentService或请求上下文。
- [x] 用既有全部source-review／source-span套件证明迁移未改变原提醒和范围行为；加引号包裹工具名、引用整句、前置指导、他人指导不同任务、条件、转述、否定指导与否定实际动作等对照。若新反例暴露旧证据函数的真实缺口，先保存红例并向根任务报告，再做该范围内的最小修复；不得把“没有guided建议”当作“没有经历”。
- [x] 先独立规格审查、再质量审查；确认无worker→app反向运行时依赖和新增网络依赖。根任务统一保存提交。

## Task 2：新保存与当前编辑状态的逐建议复核

**Files:** 修改 `app/lib/materials/skill-labels.ts`、`app/server/documents/review-service.ts`、`app/components/materials/material-confirmation.tsx`、`app/components/materials/material-text-panel.tsx`；测试加入 `tests/lib/materials/retained-assessment-hints.test.ts`，并扩展 `tests/server/document-review-draft.test.ts` 与 `tests/components/material-confirmation-source.test.tsx`。不修改stored extraction的历史分派规则。

- [ ] 先复现真实服务红例：使用有来源的grounded提取和review草稿，保存作者本人guided事实，再将同一事实编辑为同事完成，重载后旧guided建议应消失；引用、事实正文、版本和所有者仍正确，原建议身份不能伪造。UI应在编辑后立即显示相同结果，而不等保存才变化。
- [ ] 扩展保留函数接收可选reviewProjection，所有已有调用方显式传入当前草稿／提取的projection。保留当前kind、label及服务端原建议身份／prior membership检查后，按以下规则判断：

```typescript
const needsEvidence = projection === GROUNDED_MATERIAL_REVIEW_PROJECTION || item.origin === "user";
return retainsOriginalMembership && (!needsEvidence || supportsMaterialSelfLevelHint({
  kind: item.kind, text: item.text, labels: [hint.skillLabel], level: hint.level,
}));
```

每条建议只能用自身技能词的范围，不能借另一个词的指导经历；新补词没有原建议身份，不能因此产生建议。

- [ ] 兼容规则明确化：未编辑的legacy／literal-v1提取摘要沿用原保留规则，因为历史摘要可能未复制原文的指导限定；不重写历史提取或已确认事实。用户编辑后若当前文字不足以继续支持旧建议，则移除该建议，不推断新等级；用户既有自评、手动输入和已完成记录均不改变。只改另一条事实时，未编辑的旧事实建议仍保留。
- [ ] 加入以下失败／保留对照：改成否定动作、未来练习、条件、他人主体或整句引用→移除；仅删掉指导→移除guided；真实个人指导与只引用工具名→保留；概念级改为他人熟悉→移除；明确个人不确定→保留原uncertain；单纯“不会”→不得生成uncertain；混合SQL／React事实按各自建议判断；显式空词、删词和分类改为非能力事实仍移除。
- [ ] 服务器即使收到原始合法hint ID也必须拒绝其不再支持的采用；但不得把合法修订请求整体报成无效，应该保存修订后的事实并丢弃失效建议。新造hint／改hint等级继续由既有校验拒绝。
- [ ] 独立规格与质量审查覆盖纯函数、真实保存／重载和组件编辑。使用原子写入和来源版本保护的既有回归，不削弱任何guard。

## Task 3：集成复核与后续边界

- [ ] 根任务在断网包装器下复跑资料证据、提取、review保存、组件和上下文相关专项；本地workerd验证共享纯函数及真实ReviewService保存／重载对照。统一记录新源码摘要与新输出名。
- [ ] 按本批多层改动执行全仓Vitest分组、附加Node、类型、Lint、构建和页面检查。Research在原工作树运行；类型／构建使用新的逐文件匹配干净副本，不修改上一批已冻结副本或ignored非法夹具。
- [ ] 冻结参考与评分器保持原字节，记录新增源码依赖影响，旧课程绑定不因本批而自动通过。
- [ ] 本地保存源码、红绿结果、审查与恢复文档，持续目标保持进行中。下一批再基于逐词映射来源区分自身经历与他人／未来／否定，完成实践优先级门槛，之后另建显式版本的新mention提取投影并接通UI。

验证命令使用 `node work/grounded-verification/run.mjs <唯一日志标签> node_modules/vitest/vitest.mjs run --maxWorkers=1 <本步测试文件>`。脚本／配置／结果与包装器日志不得同名；不得覆盖历史证据。本项通过不代表实践优先级、新真实模型质量、完整14场景或发布Gate通过。

## 执行记录

- 11月8日Task 1：共享模块迁移先保留原行为，四个did-not场景保持红例；加当前个人动作范围内的否定保护后，作者695项通过，根任务六套件1,008项、28个Node/workerd对照通过。原生对照显式记录旧did-not-test误判与新null结果，其他观察保持一致。当前尚待完整两阶段审查结束与本地源码保存，不能当作Task 2已完成。
- Task 2原生红例已准备：`work/grounded-verification/edited-assessment-native-20261108.mjs` 使用真实本地workerd、D1和R2，走create→合成候选交付→编辑保存→重载→同请求重试，并核对原文与sourceRef不变。运行 `edited-assessment-root-native-20261108-red` 在8个观察中取得6个预期行为不符（他人、未来、否定、引用、移除指导、编辑旧摘要），正常个人实践和未编辑旧摘要两项对照符合预期；最终断言失败、exit 1、出站拦截0。原结果单独保存，修复后用同一脚本和新的输出名复跑，不能把表征或准备工作计为验收通过。
- Task 2界面红例：`edited-assessment-root-ui-20261108-red` 用实际MaterialTextPanel、HTTP路由、服务与SQLite储存，只有提供方响应和网络调度是内存合成夹具。把本人SQL指导实践改为同事经历后，立即移除按钮、保存时清除建议、重载后不显示按钮三项均不符预期；事实编辑与原引用正确保存，能力采用调用0。最终断言失败、exit 1、出站拦截0；合成提供方调用1不是真实模型调用。该测试与原生红例共同作为修复前证据。
- Task 1两阶段审查通过：规格717项及29个迁移／33个保留声明结构检查；质量744项，含2,080个原等级结果和208个提醒结果对照，以及15个did-not纠正对照。独立Lint通过，全部新验证出站拦截0、五份实现摘要一致。尚未完成Task 2接入，亦未将这些专项计为全仓通过。
