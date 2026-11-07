# 能力范围离线修复实施记录

日期：2026-11-07。基线：`38c5fde`（源码暂停点 `c7c55ea`）。未提交；供独立规格与代码审查。本记录不修改旧质量门、语料、评分器或历史成绩。

## 变更文件

- `worker/document-executor/source-review-evidence.ts`
- `worker/document-executor/source-span-extraction.ts`（仅 v2 prompt）
- `app/components/materials/material-confirmation.tsx`
- `tests/server/document-source-review-evidence.test.ts`
- `tests/server/document-source-span-provider.test.ts`
- `tests/components/material-confirmation-source.test.tsx`

## 根因与实现

1. 原 `guidedSkillScope` 把尾句“由导师/伙伴协助”当作前句本人工作的指导。删除该泛化，只保留个人练习与指导在自身范围内共同成立的证据。React 原型与伙伴交互测试、BeamLang 解析器与导师边界测试均保留事实，不能借用协助赋予 guided。
2. 原范围检查只要求每个技能词在任意支持范围出现。同一 React 先用于无指导实现、后用于指导测试时会错误覆盖两项任务。现在同时检查该词出现的每个已识别任务范围；任一范围不支持同一水平就不保留全条提示。明确同范围多词指导仍保留。
3. `confirm-self-assessment` 原来绑定可接受的提示，能力问题谓词又仅覆盖少数英语限制。核对问题与全条 hint 分别判断；明确个人独立能力、能力限制、熟悉/阅读/指导证据可只生成整句核对提醒。局部个人指导可以保留提醒而不给整条赋予 guided。
4. 自动及模型提名核对均受个人候选类型约束。省略人称的“熟悉 SQL”需要 experience/skill-claim 锚点；requirement/constraint 不据此生成个人核对。零候选时仅接纳直接第一人称证据。不会把普通安装或配置活动统一变成能力问题。
5. 仅对固定的个人简介类结构标题做匹配预处理；原文引用不改。团队/他人归属、招聘条件、引文示例、假设、否定和将来意向有保护用例。
6. 新增直接个人职责缺失模式：`本人是否编写查询待确认。` 单独成句也生成 `missing-information`；假设、示例、他人、已确认、并非/不再待确认不生成此提醒。没有改成 team-attribution。
7. resume-12 的简介、导师提供 SQL、时间/职责缺失三条事实全部保留；前者产生个人能力核对，后者产生缺失信息提醒。共享 SQL 不构成冲突，不赋 uncertain。保留现有一事实一个可选 hint，未新增 wire/schema/数据库字段。
8. v2 prompt 明确任务与人称范围、无 hint 的核对、职责待确认、共享技能不证明冲突。v1 prompt 及解码路径未修改。UI 为 missing-information 显示“信息缺失或待确认”；确认事实不会调用采用自评。

既有两处错误 guided 正例已纠正：原“我用 BeamLang 写过解析器，边界情况由导师协助补充（TraceKit 测试）”现在作为负例；以“我在导师指导下用 BeamLang 编写了解析器”及明确 React 同任务指导替换正例。此调整不是弱化全部提示；有效 conceptual/guided/uncertain 与同范围多词保护仍通过。

## TDD 与验证证据

所有命令通过 `work/grounded-verification/run.mjs` 剥离凭据并阻止出站，标签均唯一，旧日志未覆盖。对应 `.log` 与 `.json` 位于 `work/grounded-verification/`。

| 标签 | 结果 | 作用 |
| --- | --- | --- |
| `assessment-scope-unit-red-20261107-a` | 20 failed / 273 passed | 原协助误归属、能力核对、标题、职责缺失、同词不同任务真实断言失败 |
| `assessment-scope-integration-red-20261107-a` | 9 failed / 80 passed | v2 解码→站点草稿与 UI 缺失标签真实失败 |
| `assessment-scope-green-attempt-20261107-a` | 382 passed | 第一轮专项绿例 |
| `assessment-scope-kind-red-20261107-a` | 3 failed / 293 passed | 独立检查发现招聘/约束及无个人锚点误核对，补红例 |
| `assessment-scope-kind-green-20261107-a` | 385 passed | 类型与明确个人锚点修复 |
| `assessment-scope-denial-red-20261107-a` | 2 failed / 296 passed | “并非/不再待确认”否定状态保护红例 |
| `assessment-scope-final-green-20261107-a` | **9 files / 474 passed** | 最终专项及相邻回归，exit 0 |
| `assessment-scope-lint-final-20261107-b` | exit 0，输出为空 | 六个变更代码/测试文件的 ESLint |

上表全部 `nonLoopbackDenials=0`。最终测试日志 SHA-256：`71dbca0bfb1717416b03471a413ea6aa147aa58bf1eb122415eead04465617ee`。

最终九文件验证覆盖：source review、source-span provider（含 v1 历史路径、v2 prompt 小于 4096 字节、原文/词/提醒/空或有效提示的站点投影）、确认组件、extraction、confirmation、confirmed skill labels、supplement quality、supplement collection、document provider。没有真实模型调用；provider 响应和费用字段来自离线 fixture，真实费用为零。未部署、未远程迁移。标准类型、全仓检查与原生等价检查由协调任务另行执行，不在本记录冒称通过。

## 冻结文件核验

以下 SHA-256 与任务给定值一致：

- `tests/fixtures/documents/quality-corpus.json`：`69e5ddd1005f12abf24483e10dd235629ef309ba3a84e922166963ccd9aed750`
- `tests/fixtures/documents/supplement-quality-corpus.json`：`9775b595f4b44563beb9e3b7f9249b171e731658b454e0f26279d2b46db213d7`
- `tests/helpers/document-quality-evaluation.ts`：`6297b7bdd112833cbd8a58b3bd63f6cbaf46d86b77cbab760744fe66babec351`

## 限制

这是受边界用例保护的确定性范围识别，不是通用自然语言推理或跨句指代解析器。只对识别到的明确任务、人称、结构标题及缺失表述作判断，未宣称覆盖任意省略、转述和任务关系。全句核对保留原文，最终自评仍须用户单独采用。离线输入不能证明真实模型的召回或产品验收成绩；下一轮真实质量验证仍需独立授权。
