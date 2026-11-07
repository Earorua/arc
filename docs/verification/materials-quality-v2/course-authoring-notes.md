# 独立课程覆盖账目：作者说明

日期：2026-11-07。资产是独立课程审阅草案，不是新 Gate 批准，也没有真实模型或产品质量成绩。原文层保持只读。最终规格审阅和工具质量审阅由根任务分别记录，不能用本文件的测试通过代替审阅结论。

## 输入与独立性

作者仅使用两份冻结合成语料、已审原文标注、批准的 v2.1 设计、v2 契约 proposal、完整本地课程数据及其 schema 依赖。未读取或运行产品 grounding、映射、别名逻辑；未读取模型、解码或既有评测输出。没有通过当前候选结果推导期望值。历史 scorer 仅在最终 CLI 的输入完整性校验中读取原始字节计算 SHA，未解释、导入或执行其代码。

Node 捕获、账目序列化、验证和 ESLint 均经 `work/grounded-verification/run.mjs` 的独立环境执行，凭据从子进程环境剥离，出站请求被拦截。所有记录的 author 批次 `nonLoopbackDenials` 为 0。外链仅保存为字符串，未请求其内容。本轮真实模型调用、费用、部署、迁移均为 0。

| 固定输入 | SHA-256 |
| --- | --- |
| `annotations.draft.json` | `e512e3fca67fd9133cae4e9186cb054c3044d79b090d567daaba24cb85bd9ef9` |
| `tests/fixtures/documents/quality-corpus.json` | `69e5ddd1005f12abf24483e10dd235629ef309ba3a84e922166963ccd9aed750` |
| `tests/fixtures/documents/supplement-quality-corpus.json` | `9775b595f4b44563beb9e3b7f9249b171e731658b454e0f26279d2b46db213d7` |
| `tests/helpers/document-quality-evaluation.ts`，仅校验字节 | `6297b7bdd112833cbd8a58b3bd63f6cbaf46d86b77cbab760744fe66babec351` |
| 批准 v2.1 设计 | `5d978e38d1c3b4a85eb83327e800df2c561aef598a63edc6c61c433acba21822` |
| v2 契约 proposal | `d428b2ffefb184b8578102e639120407dcdc432d6fb78623bc753961d2e127a1` |

上述文件未修改。完整路径见原文标注的 `inputHashes` 与 `basis`，CLI 检查全部三份原输入和两份依据文档。

## 课程冻结

`capture-course-reference.mjs` 以本地 esbuild 0.28.0 仅打包三份数据模块和它们的 schema 依赖。加载 allowlist 在读取其他运行时模块前拒绝它们；外部运行时 import 不被允许。除 esbuild 的已解析 import 清单外，工具使用本地 TypeScript 5.9.3 JavaScript AST 解析器检查最终 bundle，在执行前拒绝仍存留的 import 调用、import 声明或 export-from，包括未进入依赖清单的计算式 import。该检查约束模块导入，不是任意 JavaScript 沙箱。导出对象使用普通 JSON 完整序列化，保留全部数组及字段，不制作挑选过的课程摘要。

| 对象 | 身份 | 完整对象 SHA-256 |
| --- | --- | --- |
| `role` / `flagshipRole` | `ai-native-full-stack-engineer@2026.07` | `3d63cfe446a8ae5a78e8a10164020d5ecd150a00c9363c92dbbcffff7fdee007` |
| `blueprint` / `flagshipBlueprint` | `ai-native-full-stack-engineer@2026.08.1` | `9f3c951eef3c4f2e26a9dba73ece80b4d1be6899970c1423bb2281c156b55f41` |
| `registry` / `flagshipUnitRegistry` | `ai-native-full-stack-engineer-units@2026.08.1` | `513853f6f699bc42336222d067a14900f5b76982fd789c30e916e97e9caeb3f7` |

对象摘要使用 UTF-8 canonical JSON：对象 key 排序，数组顺序保留。文件摘要使用原始文件字节。快照包含三份源码的完整 UTF-8 内容：

| 数据文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `app/data/flagship-role.ts` | 5171 | `e57cb6a20bb27ca2622fa43677f91be9c8c964cbd48847759007824ae9b37eef` |
| `app/data/flagship-blueprint.ts` | 1800 | `b7aafe379b7c27eb133b378090ec50818835cdd39a9a274f7ba603aa72c46264` |
| `app/data/flagship-unit-registry.ts` | 75439 | `feda4ce53ee53ebb3cc1e80f486dc8c32014193cb79f856d44962b0501bdd4cc` |

共记录 85 个依赖文件摘要：3 个数据模块、2 个 schema 模块、1 个仅类型依赖 `app/domain/learning.ts`、79 个本地 zod 文件。schema 摘要为 `intelligence.ts`：`22e4bde2ff3f059135b861f47b26d4686a92d6ccb4bcf386764e18245305e9f6`，`planning.ts`：`053972ea8b36f6baef224efa41fbf593153e2dff1271e404cc403851fc2a8fa5`。完整逐文件清单在快照内。

角色和蓝图各有 16 个技能；注册表有 16 条轨道及 48 个完整模板，每条保留 learn/calibrate/reinforce。新鲜捕获与冻结快照逐值及序列化字节相同。校验器同时钉住独立快照文件摘要并要求 `currentReference` 等于新鲜本地捕获，不能靠修改对象和自报哈希共同绕过。

## 账目格式与计数

`documents[].fields[]` 保留 `fieldId`、legacy/additional 类别、完整 `source`、`sourceQuote`、`sourceRole` 和 `sourceSemantics`。每个字段的 required alternatives、optional alternatives、combined literals 取有限集合；同一字段同一原词只出现一条关系，`groupIds` 保存它实际覆盖的全部语义组。零学习词字段仅有一条 `literal:null` 的显式 non-learning 账目。没有旧字段的 `supplement-05` 仍保留文档记录与空 `fields`。

| 项目 | 数量 |
| --- | ---: |
| 文档 | 30 |
| B2 普通 / 边界 | 18 / 6 |
| 补充普通 / 边界 | 3 / 3 |
| 旧字段 / 独立增补 facet | 84 / 2 |
| 有限非空原词关系 | 245 |
| 空词非学习账目 | 11 |
| 总关系 | 256 |
| topic：mapped / ambiguous / uncovered / non-learning | 139 / 5 / 99 / 13 |
| task：full / partial / none / not-applicable | 39 / 74 / 130 / 13 |
| basis：literal / contextual / none / not-applicable | 25 / 119 / 99 / 13 |

13 条 non-learning 中，11 条是空词字段，另外 2 条是原文标注允许但课程审阅判定为非学习职责的 `meeting notes` / `taking meeting notes`。包含这些职责的组合短语仍保留 partial 与全部剩余范围，不吞掉会议记录动作。两个增补保持各自账目；与旧字段共享的学习主题 facet 不变成第二条经历，也不增加旧 84 分母。

`topic` 与 `taskCoverage` 是两条独立轴。mapped/none 表示主题有课程对应，但原文具体任务没有练习；ambiguous/full 表示引用内容的并集覆盖狭窄任务，映射选择仍有歧义。`topic.skillIds` 是集合，不能拿数组顺序当优先级。

课程引文形如 `{object:'registry', pointer:'/tracks/0/templates/0/steps/0/label', quote:'...'}`。pointer 从指定完整导出对象的 `value` 根开始，quote 是该 string leaf 的完整精确值。外链和技能名字可支持语境或名称核对，不能独自支持任务 full。每个支持范围的 `skillIds` 指明真正提供该段内容的轨道。

`taskCoverage.aggregation` 固定为 `union-of-cited-content`，不宣称每个歧义候选都能单独完全覆盖。例如 form labels 的 web-platform 内容直接要求构建 labeled form，design-systems 内容支持 accessible-name/语义审阅。保留二者不等于选择任一候选后都获得同样的写标签练习。未来采用某个候选时仍须按其实际引用内容限制范围。

## 关键语义决策

- 只有 SQL、TypeScript、React 使用独立冻结的本地名称关系。React 限于当前 React 19 课程名，不声明其他版本全兼容。HTML 使用 semantic HTML/form 单元的 contextual 关系；未把 HTML 等同 Web Platform 声明为全局别名。
- CSS grid / animation 在本地没有被明确命名为课程别名，也没有布局/动画练习，保留 uncovered/none。Kubernetes、Python、dbt、统计、漏斗、dashboard、spreadsheet 和多数分析任务保持实际目录外范围。
- SQL 关系模型任务有明确 full 依据；账户对账、仓库表模型、JOIN 重复行解释只保留相应子集。聚合、CTE、窗口计算、空值处理、报表与 SQL analytics 的具体任务不因 SQL 名称而获得 full。
- TypeScript 的名称对应与任务覆盖分开。schema/narrowing 不是异步行为测试或日期格式化器任务的已教子任务。这些组合短语只有通用 testing 方法的部分支持，工具和具体异步/日期范围仍未覆盖。
- Figma 工具未覆盖；UI/design tokens 只在组件语义、对比度与 token 修正语境得到部分对应。没有将其他语境中的 tokens 泛化为设计系统。
- WCAG 标签阅读和 accessible form labels 保留 web-platform/design-systems 双候选。WCAG 阅读不升级为完整审计。React 原型未明确限定表单，不能把表单交互测试当成整个原型的 full 覆盖。
- OpenTelemetry 的本地 URL 与 trace 单元只支持有限 contextual 关系，未读取外链或声称工具实施完整。trace/log 用途区别是狭窄概念任务，可由信号选择内容覆盖；这不等于分布式链路实施或生产运维能力。
- 迁移清单审阅与回滚步骤记录只有通用发布文档子集，不变成 Kubernetes 集群操作。团队、个人仅参与部分、未操作或尚不能独立等范围完整保留。
- 学习意向、教练建议、非主 JD 和资源链接不授予能力、不自动采用、不提升主 JD 权威。课程匹配不修改自评、提醒或原文允许词表。

## 审阅修正与测试证据

独立语义审阅指出两个范围过强的判断：未限定的 React 原型交互测试被标 full，以及 TypeScript schema 被当成 async testing 的部分任务。复核后作最小修正：前者改 partial，后者保留 mapped/literal 但 task none。第二轮同项检查又发现 3 条组合短语保留了相同的不受支持 TypeScript 子集；其 `supportedScope` 已缩为 testing-only，两个 topic 候选、partial 状态及全部未覆盖范围保持。

两次修改前的账目保存在忽略目录，便于比较：

| 账目 | SHA-256 |
| --- | --- |
| `work/grounded-verification/course-v2-author-ledger-pre-review-001.json` | `69f1b8ebe3964004133fbee48049179761e9e498b694173551c57803503926a6` |
| `work/grounded-verification/course-v2-author-ledger-pre-review-002.json` | `6b3e3639042c3bd4424202f4daea72d292a9f8fd91345b6ebc7d31e1780fa3b0` |

所有测试先观察相应缺失/错误，再实现或修正；没有通过修改源事实来使测试变绿。日志与 wrapper JSON 同名存于 `work/grounded-verification/`：

| wrapper label | 结果 | 日志 SHA-256 |
| --- | --- | --- |
| `course-v2-author-capture-red-001` | 1 测试，0 通过，缺少完整 role 捕获 | `5d631cf436ef65f83f2b01b30f68355f312f97307268c408c1209dec9a8e8a79` |
| `course-v2-author-capture-green-002` | 1/1 通过 | `4b27d748e1b73c6894770d8e9c1fcce5b73fb1585a8e44a45d3953388a8053f4` |
| `course-v2-author-validator-red-001` | 45 测试，4 正例通过，41 坏例按预期失败 | `8a651feae8e8571e10615ba9484376d35490abea4e800a8cb394594dc661a479` |
| `course-v2-author-validator-green-001` | 45/45 通过 | `bc2852e4ab7cd222128524c5c72107fda92e6081e06ec9514859b98e110766be` |
| `course-v2-author-semantic-review-red-001` | 47 测试，45 通过，2 个范围回归失败 | `1b026bb2833726677955faba805434c71322d133baec81fb1445ec13601b6830` |
| `course-v2-author-semantic-review-green-001` | 47/47 通过 | `70d5a3d982f51162f8e5ad6ff2f18c9707c0ff0280b5477150123bb197b54f35` |
| `course-v2-author-input-integrity-red-001` | 48 测试，47 通过，全部输入字节检查尚缺失 | `ed812d204b00a61041740541bb0bd1de818112acbb94d1215b7371b66200e54d` |
| `course-v2-author-input-integrity-green-001` | 48/48 通过；临时 scorer 字节变更被检测 | `ad35705cb3c8335fcf8fc83e79c233dd88c2d4bffc27b5697471c1a3d824f88d` |
| `course-v2-author-combined-scope-red-001` | 51 测试，48 通过，3 条组合范围回归失败 | `cf42585eb39735120db2ffbd592d8afe19c84be02983a323b2caf4cbb2166575` |
| `course-v2-author-combined-scope-green-001` | 51/51 通过 | `fac8a54d4bd2cee1fa6212403ff13504b171018a4ccdaaab46fca8f095aa2fad` |
| `course-v2-author-complete-tests-001` | 语义修正后的 51/51 通过 | `615b5b7d0e2d5b6e73e8da7d1f3b7d4e51fc7ce4a5f37bc16536fba931aab806` |
| `course-v2-author-quality-review-red-001` | 独立质量复现 0/2 通过，确认两项缺陷 | `87f39782c42d1ec8fe100bfacb35c32282b71b47607fd528fb73be8bc201bd09` |
| `course-v2-author-durable-quality-red-001` | 53 测试，51 通过，2 项持久回归失败 | `7a1015e521f9bdfd1c29723b66a5b8812883415a721a568dbdd715eab698932d` |
| `course-v2-author-durable-quality-green-001` | 最终 53/53 通过 | `071e55c6f5c97d4f29e05e2c8b776b2f674e1c426520a6cf61422842c62d245c` |
| `course-v2-author-quality-review-green-001` | 独立质量复现 2/2 通过 | `1a2ae4dd681e193de248dd3f57577b44890eb3987e2147029063e6b1b9257873` |
| `course-v2-author-quality-cli-001` | exit 0，最终完整性/结构验证通过 | `44c07cf553ad7f5d2927556b7b7542fdb54022bdb5d3600bdff2a56099a67b3f` |
| `course-v2-author-quality-eslint-001` | exit 0，最终三个新增 mjs 无诊断 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

另有两个已保留的工程失败：首次 capture GREEN 尝试因 esbuild 的 Go 正则不接受 `/u` flag 退出，移除 flag 后通过；首次 ESLint 因 Next 的保留变量名 `module` 报错，重命名局部变量后通过。它们没有改变课程内容或范围。

工具质量审阅另确认两项 P2：计算式 `import(variable)` 未出现在 esbuild 的静态依赖清单，可能越过捕获范围；支持范围中第二个技能只有 title 引文时，第一技能的具体证据让整个条目误通过。修正分别为执行前的真实 AST import 检查，以及逐个 `supportedScope.skillIds` 要求其自身的具体单元内容。回归在隔离副本中注入静态/计算式 import，原课程未修改；检查拒绝发生在执行标记写入之前。第二项回归给 testing 范围添加 TypeScript 的 title-only 证据，必须拒绝。课程快照、语义账目和原文标注摘要均未改变。

测试涵盖完整/部分/无覆盖/歧义正例，以及丢文档、丢旧/增补字段、丢 required/optional/combined 原词、丢空词账目、重复、非法课程、伪造引文、来源角色/人物/否定变化、版本、源码内容、schema 依赖、对象与自报哈希同时变化、残缺注册表、缺少具体内容却宣称 full 等坏例。53 项包括 42 项结构变异、原始 4 项正例、5 项审阅范围回归、1 项真实文件字节完整性测试和 1 项隔离副本 import 回归；另复跑独立审阅者的 2 项复现。

## 使用与限制

从仓库根运行，每次使用未占用的 wrapper label：

```powershell
node work/grounded-verification/run.mjs course-v2-new-test-label --test docs/verification/materials-quality-v2/course-annotations.test.mjs
node work/grounded-verification/run.mjs course-v2-new-validation-label docs/verification/materials-quality-v2/validate-course-annotations.mjs
```

捕获工具只有显式 `--write` 才覆盖相邻快照。不要用重新捕获来掩盖课程变化；任何源文件、schema、依赖或导出对象变化都需重新审阅和独立冻结。校验器固定当前快照摘要，无法靠重算自报 SHA 自动接受新的课程版本。

纯校验接口为 `validateCourseAnnotations(annotations, {snapshot, sourceAnnotationText, currentReference})`，其中 `currentReference` 必须来自本地 `captureCourseReference()`，不能来自被评候选。返回 `valid`、细项 `errors`、实际 `totals`，并固定声明 `semanticJudgmentsCertified:false`、`newGateApproved:false`、`actualModelOrProductQualityEvaluated:false`。未来独立评分器需按 document + field source match + literal 消费这些政策，不能要求候选生成私有 gold ID。

结构验证只证明账目齐全、冻结对象一致、引文真实以及状态形状自洽。它不能证明中文解释正确、引文语义足够、所有 partial 缺口都被作者描述完整，或选定某个歧义候选后仍有完整任务支持。这些必须由独立语义审阅判断。更换具体课程或查看外部资源都不在本次范围内。构造正例和坏例不代表真实模型召回，也不能把历史失败改名通过。

## 当前资产摘要

| 资产 | SHA-256 |
| --- | --- |
| `course-reference.snapshot.json` | `bf458308b5811f60b61f6e5fa24f6910642a7276615f0b212d930d04868d9676` |
| `course-annotations.draft.json` | `c602035d36fba77a36287149891b775c2ed9420d64612f0cbd76309fc02d6bcf` |
| `capture-course-reference.mjs` | `3735c41c91d7d5dbaaf9ebf5b0037dd8a4b3c09f225fdac6d3d734a000db4423` |
| `validate-course-annotations.mjs` | `f03741ca32f54e73163d07c0a353c9491513274214f8d058e5304b8469f30886` |
| `course-annotations.test.mjs` | `ede46489ed7f46ee51437692e30a5704fbde361b68da8971a15c4a4231c99789` |

本说明自身的摘要由根任务的最终资产清单登记，避免自引用摘要。作者只新增上述课程资产及本说明，未提交、未修改产品行为或原文层。
