# 能力范围规格审查修复记录

日期：2026-11-07。承接 `implementation-2026-11-07.md`，保留前轮记录与全部红绿日志。未提交，待独立规格复审；本记录不表示全仓或真实模型验收通过。

## 已验证的问题

1. P1：新增逗号分句只过滤了含“例如/如果/不能说/我没有说过/导师说”的前句，后面的“我熟悉/我在指导下…”被错误当作直接个人陈述。完整 v2 解码保留了 quote，但错误保留 conceptual/guided 与 confirm。
2. P2：`I built a React prototype, I tested React under peer guidance.` 没有 `and`，未拆成不同任务，仍错误保留整条 guided。
3. P2：明确个人标题下省略人称的 `简介：可独立完成 SQL 报表。` 与 `I cannot independently configure Kubernetes.` / `I cannot write SQL reports independently.` 漏掉核对问题。
4. 同源保护检查确认：新增英语逗号分句会暴露具名转述 `Alice said, I am familiar with SQL.`；中文 `张宁说，我熟悉 SQL。` 也不能靠枚举“导师”等身份守卫。两例均先补红例。

## 最小修复

变更文件仅：

- `worker/document-executor/source-review-evidence.ts`
- `tests/server/document-source-review-evidence.test.ts`
- `tests/server/document-source-span-provider.test.ts`

在剥离既有白名单个人结构标题后、拆分任务前，先判断整个陈述首部的示例、条件、否定与有界言说结构。外层语义不能因分句消失；事实与原文位置仍保留。对言说结构使用有界“主体 + 言说动词 + 标点”，不列举姓名。

英语逗号后明确的 `I` 可分成独立任务；`Under supervision, I…` / `With a mentor, I…` 仍保留句首指导，中文 `在导师指导下，我…` 也不被拆坏。同词跨不同任务仍为 hint=null，直接的局部指导仍可保留整句 confirm。

只有明确个人结构标题且具有 experience/skill-claim 锚点时，才接纳标题下省略人称的独立能力核对。英语能力限制复用正向能力的动词与 independently 前后语序规则。上述能力主张或限制只产生核对问题，不生成 independent、uncertain 或其他水平提示；JD/constraint、引文、招聘、未来与假设保护继续有效。

新增真实转折正例验证前后不同断言仍可分别处理，例如“我不熟悉 React，但我熟悉 SQL”和“I am familiar with SQL, but it is false that I configured React”。这与外层示例/报告包住整句的情况分开。

## 红绿证据

所有运行均经凭据剥离与出站封锁 wrapper，日志名唯一，`nonLoopbackDenials=0`。

| 标签 | 结果 |
| --- | --- |
| `assessment-scope-review-red-20261107-a` | 20 failed / 394 passed，初始审查复现 |
| `assessment-scope-review-red-20261107-b` | 30 failed / 395 passed，完整审查用例 |
| `assessment-scope-review-green-20261107-a` | 2 files / 425 passed |
| `assessment-scope-reporting-red-20261107-a` | 2 failed / 333 passed，具名转述保护 |
| `assessment-scope-review-final-green-20261107-a` | **9 files / 522 passed**，exit 0 |
| `assessment-scope-review-lint-20261107-a` | exit 0，输出为空 |

最终九文件回归与前轮相同：source review、source-span provider、确认组件、extraction、confirmation、confirmed skill labels、supplement quality、supplement collection、document provider。含 v1 历史路径以及 v2→站点投影的完整原文、词、提醒与提示断言。最终测试日志 SHA-256：`1f63bd877c3c87673ad0ce277db32605b2ab162c860f84678c667f917a76a990`。`git diff --check` 通过。

三份冻结文件复核 SHA-256 与任务给定值仍一致：quality-corpus `69e5ddd1005f12abf24483e10dd235629ef309ba3a84e922166963ccd9aed750`；supplement-quality-corpus `9775b595f4b44563beb9e3b7f9249b171e731658b454e0f26279d2b46db213d7`；旧评分器 `6297b7bdd112833cbd8a58b3bd63f6cbaf46d86b77cbab760744fe66babec351`。

真实模型、费用、部署、远程迁移均为零。未修改原生 oracle。最终源码的独立 Node/workerd 等价复验、规格复审与全仓检查由协调任务执行。仍不宣称通用自然语言范围推理，保持现有单事实、单引用、单可选 hint 契约。
