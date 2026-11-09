# 将原文主题保留接入新的提取与核对版本

**2026-11-09 恢复状态：** 用户已恢复持续目标。前置个人实践接入已完成独立规格、质量和全仓验收，保存于 `8cba14ddabc3de6a72af10fe6490f51293559acc`。本计划开始离线实施，逐项完成规格与质量审阅；不启用真实模型、远程迁移或部署。11 月 8 日保存时尚未开始实现、前置修复未复测的状态保留在 Git 历史。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** AI提名的原文主题可以经过提取、服务端投影、用户核对和修订保留下来；否定、他人或未来主题本身不构成个人实践或能力等级。

**Prerequisite:** 先完成[逐词个人实践接入](2026-11-08-materials-experience-attribution.md)的规格、质量、全仓验收与本地保存。本文件细化已批准v2.1的既定功能和[原词接口计划](2026-11-08-materials-source-mention-boundary.md)中的后续接入条件，不启动新的模型调用或发布。

**Architecture:** 新增明确的v3提取策略、wire格式与服务端核对标记。v3使用已审`groundMaterialSkillMentions`保留原文主题，等级判断继续使用独立个人证据规则，实践采用沿用已完成的逐关系检查。旧未包装记录、literal-v1和grounded-v2仍按原分支读取和核对，不重新命名旧记录。

**Tech Stack:** TypeScript、Zod、现有HttpDocumentAnalysisProvider、ReviewService、React核对组件、Vitest及本地workerd/D1/R2。沿用当前工作树，全程使用断网包装器。

## 版本与不变量

新增名称固定为：

```ts
export const SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION = "source-skill-mentions-v3" as const;
export const KIMI_SOURCE_MENTIONS_POLICY_ID = "materials-openrouter-kimi-k31-pro-mxfp4-zdr-extractive-v3";
// 对应wire格式为 source-spans-v3；字段仍是kind/source/requirementLevel/skillTerms/selfLevelHint。
```

这里的Kimi路由名称仅表示当前离线候选，不声明它仍是未来验收时的最新模型。真实评测前必须重新核验模型、端点、价格与隐私，并签发新范围和预算；本次不改运行环境、不启用分析、不复用旧授权。

- `DOCUMENT_SCHEMA_VERSION`、既有v1/v2标记、prompt、路由限制和历史输出保持其原有身份。新版本由服务端已核对的job/provider policy选择，provider正文和客户端保存请求均无权指定核对版本。
- 全句、主体、否定、时间、职责限定、原始引文和来源范围保留。只处理模型提名或用户明确补充的词，不扫描正文自动扩大词表。
- 不把提名主题当作个人能力。保留独立的等级建议、用户采用自评、学习重点选择和接受计划动作；未知或否定语句不能自动产生`uncertain`。
- 每条最多8词、100个UTF-16单位词长、100条事实、原文/JSON配额、来源与重分类保护沿用。空列表、移除和忽略不得恢复。
- 不修改旧26份课程/候选参考，不宣布新课程绑定或完整14场景原生协议通过。课程任务覆盖和能力采用入口仍按各自任务完成。

## Task 1：版本化的词语核对接口

**Files:** `app/contracts/documents.ts`、`app/lib/materials/skill-labels.ts`；新增`tests/lib/materials/reviewed-source-mentions.test.ts`，复用已有`tests/lib/materials/retained-assessment-hints.test.ts`和`material-skill-mentions.test.ts`。

- [x] 先添加失败测试。新标记下负面原文中的SQL可保留、可从同一原文明确补充；旧v2保持原肯定过滤。以下使用现有`GROUNDED_MATERIAL_REVIEW_PROJECTION`和新常量：

```ts
const text = "I have never used SQL for production.";
expect(supportsReviewedSkillLabel(text, "SQL", SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION)).toBe(true);
expect(supportsReviewedSkillLabel(text, "SQL", GROUNDED_MATERIAL_REVIEW_PROJECTION)).toBe(false);
expect(labelForAddedSourceTerm(text, text, "SQL", SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION)).toBe("SQL");
expect(labelForAddedSourceTerm(text, text, "SQL", GROUNDED_MATERIAL_REVIEW_PROJECTION)).toBeNull();
expect(labelForAddedSourceTerm(text, text, "SQL")).toBeNull();
```

2026-11-09 实测修正：初稿使用 `never configured SQL`，但原 v2 词语定位器对该动词的既有输出是 `true`／`SQL`，不是初稿假定的 `false`／`null`。原 RED（41 失败／22 通过）和测试源码保存在 `mention-projection-library-20261109-red*`，原库摘要为 `d2a5c3c69c1bd671a30b9597bcec44435baa21b3ce7aedd7664045217118bad0`。因此用已被 v2 过滤的 `never used SQL` 验证版本差异，并为原句保留旧 v2 输出的兼容断言；不改共享定位器来迁就错误假设。v3 对两句均保留主题，但能力建议和实践仍须分别通过已有个人证据检查。

- [x] 在documentReviewDraft的可选标记中接受两种明确版本，保留原v2常量。增加共享判别函数`isSourceLinkedMaterialReviewProjection(projection)`，仅对v2/v3返回true；不要以任意非空字符串获得新规则。
- [x] 在`skill-labels.ts`增加`findReviewedSourceTerm(text, label, projection)`，v3调用`findMaterialSkillMention`，其它版本调用原`findMaterialSkillEvidence`。`supportsReviewedSkillLabel`的legacy分支继续使用原字面规则，v2仍走肯定接口，v3才走mention接口。
- [x] `labelForAddedSourceTerm`增加可选第四参数`projection: DocumentReviewDraft["reviewProjection"]`；v3用`groundMaterialSkillMentions`绑定原文提名，并在当前事实中以mention规则验证。省略参数和v2调用保持原肯定语义，不能把全局旧函数直接替换为mention模式。
- [x] `retainedMaterialSelfAssessmentHints`对v2/v3或用户编辑事实均复用`supportsMaterialSelfLevelHint`；未编辑legacy兼容分支不变。针对否定、他人、引用、未来、混合主体和改写后旧提示验证：主题可保留，失去个人证据的旧提示移除，不新造提示。
- [x] 用原文不存在、canonical名称反推、重复大小写来源、重分类、显式空列表和已删除词作反例；保留已审等价词、标题、中文名词尾、字素和完整技术名的现有检查。禁止新词典或另一套词法定位器。
- [x] 执行新测试与既有三个相关套件、相关类型/Lint；完成独立规格与质量审阅，再由根任务保存源码。示例唯一标签首次使用前必须确认不存在：

```powershell
node work/grounded-verification/run.mjs mention-projection-library-20261108-red node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/lib/materials/reviewed-source-mentions.test.ts
node work/grounded-verification/run.mjs mention-projection-library-20261108-green node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/lib/materials/reviewed-source-mentions.test.ts tests/lib/materials/retained-assessment-hints.test.ts tests/lib/materials/material-skill-mentions.test.ts tests/lib/materials/grounded-skill-terms.test.ts
```

## Task 2：新增提取策略与服务端投影

Task 1 于 2026-11-09 完成：4 套件 507 项、专项类型／Lint通过；独立规格 51 项探针（含 7,560 次旧行为对照）与质量 31 项探针通过，三文件摘要保持冻结。根任务 150 个旧 provider 场景、20 个 helper 观察及 6 份实际 v1/v2 持久化记录只读重载一致。本批整体仍须完成 Task 2–4，不能以库验收替代完整接入。

**Files:** `app/server/documents/policy.ts`、`worker/document-executor/source-span-extraction.ts`、`app/server/documents/extraction-validator.ts`；`tests/server/document-source-span-provider.test.ts`、`tests/server/document-extraction.test.ts`。若现有严格策略分派需要调整，仅改明确的v3分支，不放宽未知策略或路由校验。

- [x] 修改前保存v1/v2 prompt、策略选择、正反响应和服务端投影的只读观察，固定输入与源码摘要。旧结果只作为兼容对照，另存新的测试期望，不修改冻结历史记录。
- [x] 先补v3真实provider解码到服务端投影的红例，沿用该测试文件现有`analyze`合成fetch助手，禁止真实fetch。核心输入：

```ts
const text = "I cannot yet configure a Kubernetes cluster myself.";
const source = { segmentId: "section-one", quote: text };
const wire = { format: "source-spans-v3", items: [{ kind: "experience", source,
  requirementLevel: null, skillTerms: ["configure a Kubernetes cluster"], selfLevelHint: "guided" }],
  reviewPoints: [{ code: "confirm-self-assessment", source }] };
const { outcome } = await analyze(wire, { policyId: KIMI_SOURCE_MENTIONS_POLICY_ID, kind: "resume", text });
expect(outcome.candidate).toMatchObject({ items: [{ text, source,
  skillLabels: ["configure a Kubernetes cluster"], selfLevelHint: null }] });
```

- [x] `sourceSpanPolicy`仅为新ID返回`source-spans-v3`。新增严格v3 schema，复用v2的字段形状、完整句子/独立列表条目定位、引文上下文、review point及要求等级规则。v3主题步骤调用`groundMaterialSkillMentions`；v2继续调用`groundMaterialSkillTerms`，v1保持原路径。
- [x] 新prompt明确“可以提名否定、他人或未来陈述中的真实原文主题；它们不代表本人能力或实践”。保持不可信文档、禁止工具/外链、完整引文、有限词数和不认证掌握等原约束。v1/v2 prompt字节不改，v3格式与策略必须对应；错配format、未知前缀策略、截断/拒答/额外字段继续拒绝。
- [x] `serializeDocumentExtraction`只在已核对policy为新ID时写新标记；`storedExtractionSchema`明确增加v3。`validateStoredDocumentExtraction`按保存标记读取，不用当前默认policy重投影旧记录。
- [x] 新v3服务端投影独立校验主题来源与个人等级证据。即使送达的candidate带有错误guided/uncertain提示，v3也必须用现有个人等级谓词过滤；不能仅靠worker解码器保证安全。旧legacy/literal-v1/v2的初始投影行为保持对应版本语义。
- [x] 测试新policy不能由provider额外字段、用户草稿标记或错误来源伪造；未提名不加词、超限不截成合法资料、旧marker不升级。测试中伪造的是合成候选，不向真实服务发送内容。
- [x] 对相同源事实对照v2与v3：只有明确选择v3才保留负面主题；全句、限定、引用、现有要求等级和安全提醒不丢失。本人SQL与同事React的两个词均可发现，等级建议仍不相互借用；正常本人/指导实践继续有证据支持。
- [x] 运行provider/extraction/receipt/quotation/requirement/self-level相关既有测试及类型/Lint、本地执行器打包，确认新库可被worker包含。完成独立规格→质量审阅后保存源码；不改任何账户或运行配置。

Task 2 于 2026-11-09 完成：11 套件 1,342 项、专项类型／Lint、执行器本地打包和 170 项旧行为对照通过；独立规格 74 项与质量 103 项检查通过。v3 服务端另拒绝候选正文与完整引文不一致、截断或脱离引用上下文的事实；旧版本保持原语义。审阅记录了两个既有质量缺口（自然中文“在指导下清洗数据”的等级提示、完整 `1.`／`１２.` 编号条目引文）；本批未修改共享语法，后续须按新候选版本范围修复，不能将它们算作已关闭。

## Task 3：核对、人工补词与保存/重载

**Files:** `app/server/documents/review-service.ts`、`app/components/materials/material-confirmation.tsx`，必要时`material-text-panel.tsx`的类型/传参；`tests/server/document-review-draft.test.ts`、`tests/components/material-source-term-correction.test.tsx`、`tests/components/material-confirmation-source.test.tsx`，新增`tests/server/material-mention-review-flow.test.ts`。

- [x] 先用实际ReviewService保存/重载与真实核对组件建立红例：AI保留否定SQL；用户从同一原文补回先前未保留的SQL；修改本人为同事或未来计划后主题仍在、旧等级提示消失；删除/空词后重载不恢复。
- [x] `reviewProjectionColumns`仅对已知v2/v3读取原candidate分类；`rowDraft`输出实际已保存的marker。`reviewedItem`、来源补词、重分类及保存结果用共享版本判别，禁止把v3输出固定写回v2，也禁止客户端请求覆盖服务端版本。
- [x] 服务端补词调用第四参数：

```ts
addedLabel = labelForAddedSourceTerm(
  originalText.slice(candidate.sourceRef.start, candidate.sourceRef.end),
  item.text,
  addition,
  projection,
);
```

- [x] 核对组件`AddSourceTerm`增加`projection: DocumentReviewDraft["reviewProjection"]`属性；父组件只传`draft.reviewProjection`。补词按钮调用相同版本函数，来源词展示使用`findReviewedSourceTerm`，继续显示真实原文与规范名称的区别。保留原8词限制、重分类禁补、来源校验和旧快照交互。
- [x] 通过实际DocumentsClient→HTTP工厂→runtime→ReviewService持久化验证核对与重载，不能只手工组装一个成功预览。确认后进入选取/上下文：否定或他人SQL保留课程对应但无实践优先级；本人React/他人SQL只给React实践；显式学习重点、人工兜底、已确认自评、工时和目标分别保持。
- [x] 主JD的负面/有条件要求仍保持现有`unspecified`与用户核对门槛，不从主题出现推断must/preferred。任何实际已批准等级建议仍须用户单独采用，本次不顺带实现该尚未接通的采用入口。
- [x] 对既有v2核对与补词跑相同历史输入，对照旧输出；legacy/literal-v1/v2标记及来源摘要不重写。所有权、精确来源版本、过期、删除、重试和原有原子提交保护继续有效。
- [x] 完成独立规格与质量审阅。若发现新的明确根因，先封存反例与旧源码，再修改；不把未通过的候选当作当前验收结论。

Task 3 于 2026-11-09 完成：七文件冻结，作者 338 项及专项类型／Lint通过；独立规格 338＋13 项与质量 338＋4 项（含 7 种 HTTP 拒绝变体）通过，无待修审阅问题。根任务 25 项原生／Node 完整对照、3 项实际上下文组件、170 项旧行为和 6 份真实历史核对记录只读重载通过。全部原始失败、夹具修正及未关闭的质量缺口另存，Task 4 全仓与最终归档仍待完成。现有能力建议按钮已存在，后续缺口是明确决策契约与实际持久化验证，不是创建第一个按钮。

## Task 4：本地整体验证与交接

- [x] 用本地workerd/D1/R2执行v3合成provider解码、送达核对、用户修正、确认、选择和预览，并对照Node/SQLite结果。保存前后原文、来源范围、marker、确认词、提示、课程对应、实践优先级及audit，完整比较；分账户/独立存储遵守30份资料配额。
- [x] 在修改前合法建立的v2持久化记录上执行新代码只读重载，比较完整公开返回与数据库行。legacy旧载荷使用已有真实历史格式夹具并说明来源；不伪造新旧上下文身份来制造兼容通过。
- [x] 以全新逐文件源码副本完成全仓Vitest分组、附加Node、类型、Lint、构建和页面检查。Research来源边界在原工作树执行；每个Node命令必须通过`work/grounded-verification/run.mjs`，使用新的`mention-projection-*`标签。
- [x] 复核旧26份参考及课程依赖，记录新源码/协议身份。新的产品观测使用独立版本或新目录；不改旧267项观察、旧评分器或其摘要来适配新代码，不宣布新课程绑定已批准。
- [x] 归档原始红绿结果、脚本、源码身份与独立审阅，更新恢复入口和发布进度、本地提交。持续目标保持active，下一步继续真实课程任务覆盖、明确自评采用入口及完整14场景原生绑定。真实模型、隔离环境和公开发布仍需各自有效的配置、预算与授权。

### Task 4 发现的既有 Research 截止时间缺口

2026-11-09 首轮完整验收中，普通分组 375 文件 9,682 项和串行 50 项通过；Research 分组 98 项通过、1 项失败。`research-cloud-smoke-composition.test.ts` 的不响应 start 用例预期一次请求，实际两次。`test-research-cloud-smoke.mjs` 与该测试均和 `8cba14dd` 及旧验收源码原字节相同；不是本批 v3 变更引入，也不能用此前通过结论忽略当前失败。

已执行实际 `control()` 原函数的确定性时间探针：签名耗时 0.25 ms，向下取整的计时器在 9,999.25 ms 触发，剩余不足 1 ms 仍让循环发送 status；另一反例中签名已超过 10 秒仍发送请求。两个 RED 与整数时间、快速失败三次重试、一次接受和两次协调的四个正常对照完整保留。此探针隔离了实际函数与合成时钟、签名/传输助手，不声称原生或云端验收。

这是既有超时契约的修复，不改模型或发布范围。根任务已审根因并同意最小设计：函数作用域保存 `deadlineExpired`；自身 watchdog 触发后置位，重试条件与 `check()` 同时检查该状态；签名完成后在传输前再次 `check()`。原 10/5 秒窗口、3/1 次正常尝试、鉴权与 nonce 校验保持。

- [x] 保存首轮全仓失败、旧源码身份及两个确定性 RED，不先改校验。
- [x] 作者在 `scripts/test-research-cloud-smoke.mjs` 和 `tests/server/research-cloud-smoke-composition.test.ts` 实施最小修复与定向 RED/GREEN。原真实 10 秒测试和全部原断言保持，不增加关闭生产时钟保护的 CLI 选项。
- [x] 完成独立规格→质量审阅并冻结新源码；旧 1,007 文件副本 `b56f6d79a300d2cdd85113b79265cd053bdde27a125cca742065208c23d2dbfa` 与旧 sealed 资产不改。两变更文件不属于 Worker 的构建输入清单，无须改受保护的基线摘要。
- [x] 使用新的源码副本和新标签完成全仓分组、独占附加 Node、类型／Lint、构建／页面、完整性和集成复核，再归档。第一轮结果继续按原来源和状态保留，不能冒充新源码的全量结果。

截止时间修复的独立规格 10 项、独立质量 2 项回归与 14 项边界探针以及专项 Lint 均通过，无审阅发现；1,007 文件冻结身份核对一致。源码保存为 `d9a021907cc679e8b7b8960f3f4a167a7304c18b`。全新副本 `D:/CodexTemp/arc-mention-projection-repaired-LiqTIV/source` 的摘要为 `12b789509f1fcee928f0e97c5cfcf055cca470c6f41db38b47dad475f94314c0`，正在使用 `*-20261109-b` 标签执行最终全仓，不复用旧源码的通过结论。

### Task 4 附加 Node B 轮的启动计时排查

三个 Vitest B 分组已全部通过（379 文件、9,833 项）。随后独占运行的附加 Node B 为 289 通过／1 取消；`research-recovery.test.mjs:25` 达到原 45 秒上限，尚未输出“实际客户端已加载”的首个阶段标记。原测试、harness 和研究客户端与本批起点相同；同轮相邻新建 Vite 的用例耗时约 53–56 秒，不能仅凭这些现象判定具体原因，也不能沿用此前并行运行解释。

- [x] 保存原 B 轮日志与退出状态，摘要 `87202fb42d1380a05a7179671cdf37e46b247527f8dd239c202190aea823e164`，1 次取消不算通过。
- [x] 在忽略目录的等价诊断副本中加入分段计时，保持实际 harness、HTTP/client、原 45 秒及全部断言；确认耗时位置后再决定是否修改。
- [x] 若有源码修复，先明确最小设计并走 RED/GREEN、独立规格／质量审阅；若无需修改，记录证据与限制，按同源码、原阈值做新的独占全量复测。不得覆盖 B 轮或仅用目标用例通过冒充附加 Node 全量通过。
- [x] 更新最终全量覆盖与源码身份，整体验收通过后才归档为已接受候选。

已完成 A/B/A 单变量对照：原配置与反向对照分别在组合模块 SSR 加载耗时约 54.09／45.97 秒时触发原用例超时；仅在 `createHarnessServer` 的 `extra.server` 中补回 `watch:null`，同一模块约 1.31 秒、完整用例约 7 秒通过。配置浅合并覆盖了基础 `watch:null`，实际启用 FSWatcher，观察到 9,341 个目录／40,489 条监听记录（其中 work 目录 4,335 个）；控制组使用 NoopWatcher。确切探针、逆向还原及 1,007 文件不变证明保存于 `mention-projection-recovery-timing-20261109-comparison-results.json`，摘要 `6c5e2518802f8ea532d87a9bbbb4925aad21ef20ad8e6e6c07032ec90493475b`。

根任务据此批准最小两文件修复：`tests/offline-uat/server.mjs` 在完整服务器配置中显式保留 `watch:null`；`tests/offline-uat/entry.test.mjs` 在真实 harness 启动后检查有效设置及空监听集合。先用旧服务器得到新断言的 RED，再修复，运行入口／私有兼容恢复／公共持久恢复及相关 Lint，完成两阶段审阅。原 45 秒、所有 HTTP／来源／断言均保留，不把启动工作移到计时器外。

作者 21 项和相关 Lint 通过；独立规格另跑 21 项与 Lint 通过，质量审阅核对实际配置、清理、安全边界和全部冻结源码后 PASS。最小修复保存为 `2107109f4453c5d5bb19c9bd7609915b77ef9f6a`；C 副本为 `D:/CodexTemp/arc-mention-projection-watcher-6F7Kb3/source`，1,007 文件摘要 `88b472fd3c2421f3d89d5de6a21bd2b5f0b6cb9f9d2b021a90b0c60998221d5a`。最终 C 轮正在执行，旧 B 失败及诊断 A/B/A 均不覆盖。


Task 4 最终 C 轮已完成：379 个 Vitest 文件 9,833 项、附加 Node 290 项、页面 5 项及类型／Lint／构建通过；4 项既有 Lint 警告保留。25 项原生与 Node 完整对照、3 项实际上下文组件、170 项旧行为、6 份旧记录、26 份参考及 85 项课程依赖全部核验，最终集成审阅 PASS。源码 `2107109f4453c5d5bb19c9bd7609915b77ef9f6a`，C 清单 `88b472fd3c2421f3d89d5de6a21bd2b5f0b6cb9f9d2b021a90b0c60998221d5a`。459 份证据见[报告](../../verification/2026-11-09-materials-mention-projection.md)。以上 B 轮“正在执行”等为原时点记录。

最新停止边界：完成编号引用、中文指导实践和现有能力建议采用／持久化的离线收尾后，本地保存、推送当前资料分支至 GitHub，再暂停目标。当前归档完成后先继续[编号修复](2026-11-09-materials-v3-numbered-statements.md)，不调用真实模型、远程迁移或部署。
