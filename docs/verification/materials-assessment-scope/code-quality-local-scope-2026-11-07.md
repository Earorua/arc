# 局部范围状态统一与质量审查修复

日期：2026-11-07。承接前轮实施及规格修复记录，旧报告和日志全部保留。未提交，供规格与代码质量复审。

## 已复现的问题

`reportedAssessment` 仅在整句开头检查。逗号分句进入后半句的报告后，会截出“我/I”并误当直接个人陈述：

- `我完成了 React 原型，但导师说，我熟悉 SQL。`
- `I built a React prototype, but Alice said, I am familiar with SQL.`
- `I built a React prototype, and my mentor said, I tested SQL under supervision.`

三条完整 v2 路径都不应赋予 SQL conceptual/guided 或 confirm。后半句新引入的示例和条件存在相同的续述泄漏；也必须保留报告之前已经成立的直接个人技能证据。

## 一致的局部处理

`assessmentScopes` 现在使用 `asserted / denied / embedded` 单一状态。每个新范围入口均复用现有 hypothetical、reportedAssessment、deniedAssertion 谓词，显式接收并返回状态；不通过闭包隐式更新字符串联合类型，不使用 any 或类型忽略。

| 状态 | 续述规则 |
| --- | --- |
| asserted | 可收集直接个人证据；新范围可引入否定或嵌套范围。 |
| denied | 约束逗号和 and 续述；仅在明确 but/但是/但 后直接个人断言处解除，右侧转述不能解除。 |
| embedded | 示例、条件或报告向后继承，不能借后续第一人称或 but 解除。 |

报告谓词读取当前范围起点后的尾文，保留将被分句边界移除的言说逗号。已经收集的 asserted 范围不被后来报告删除。原句首指导与主体仍共用范围，同词跨实际不同任务仍不能共用整条 hint。

没有再添加首部整句清空分支、人物名单、跨句推理或新 schema。标题白名单与原引用均保持。修复文件仅为 source-review-evidence 实现和两个服务端测试。

## 测试与结果

新增覆盖：三条完整 v2 反例；后半句示例/条件；中文与英文前段真实 SQL 熟悉、真实 SQL 指导仍保留；后段报告中的 React 不得获得水平；混合词保持单条 hint 范围限制。

| 唯一标签 | 结果 |
| --- | --- |
| `assessment-scope-local-state-red-20261107-a` | 12 failed / 442 passed，2 文件，真实断言失败 |
| `assessment-scope-local-state-green-20261107-a` | 2 files / 454 passed |
| `assessment-scope-local-state-final-green-20261107-a` | **9 files / 545 passed**，exit 0 |
| `assessment-scope-local-state-lint-20261107-a` | exit 0，输出为空 |

全部运行通过凭据剥离及出站阻断 wrapper，`nonLoopbackDenials=0`。`git diff --check` 通过。最终日志 SHA-256：`22062fc7190779645239f865cc8d140e742a9159bbfd638864b6f73fc689f99b`。

最终文件 SHA-256：

- `worker/document-executor/source-review-evidence.ts`：`41c20c993bb2f26f8b66828a4062b966208c4eb9f3e52b1289f98013b092a4b0`
- `tests/server/document-source-review-evidence.test.ts`：`605be306c9e54c1fc38f3015854e6c9d62df20a05ce5d0842892e31b8cc70a37`
- `tests/server/document-source-span-provider.test.ts`：`ed0db596a14628331f84044c96106b71048709e05dd40d1ce1ce40fbc7d60f04`

三份冻结文件再次核验一致：quality-corpus `69e5ddd1005f12abf24483e10dd235629ef309ba3a84e922166963ccd9aed750`；supplement-quality-corpus `9775b595f4b44563beb9e3b7f9249b171e731658b454e0f26279d2b46db213d7`；旧评分器 `6297b7bdd112833cbd8a58b3bd63f6cbaf46d86b77cbab760744fe66babec351`。

保留 v1、现有 v2 原文/词/核对/提示投影与用户独立采用路径。真实模型调用、费用、部署、远程迁移均为零；未修改 native oracle。最终原生等价验证、类型检查、全仓验证及独立复审由协调任务执行。仍是有界句内模式识别，不宣称通用自然语言理解或真实模型召回已经验收。
