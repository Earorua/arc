# 报告检测输入范围复审修复

日期：2026-11-07。承接 `code-quality-local-scope-2026-11-07.md`。旧报告和红绿证据均保留，未提交，待复审。

复审发现 `reportedAssessment` 读取整个 remaining 尾文，跨过已识别的 but/and 分句，在没有逗号的版本中误把前段真实 SQL 自述视为后段转述的一部分：

- `我熟悉 SQL 但导师说，我熟悉 React。`
- `I am familiar with SQL but Alice said, I am familiar with React.`
- `I tested SQL under supervision and my mentor said, I tested React under supervision.`

本次保持 asserted / denied / embedded 三态及转移规则，只统一报告谓词的输入窗口：当前 range 文本，加其紧邻结束处的报告标点。不能读取连接词后的另一个分句。否定后的直接个人转折守卫复用同一有界检测，覆盖“否定→真实 SQL→后续报告”的组合情况。报告词表未扩展，原 `Alice said, I…` 泄漏保护继续通过。

修改文件为 `worker/document-executor/source-review-evidence.ts`、`tests/server/document-source-review-evidence.test.ts`、`tests/server/document-source-span-provider.test.ts`。新增四条正例在单元及 v2 解码层各断言一次；保留先前报告泄漏、前段真实自述和跨任务单 hint 保护。

| 唯一 wrapper 标签 | 结果 |
| --- | --- |
| `assessment-scope-range-bound-red-20261107-a` | 8 failed / 454 passed，真实断言失败 |
| `assessment-scope-range-bound-green-20261107-a` | **2 files / 462 passed**，exit 0 |
| `assessment-scope-range-bound-lint-20261107-a` | exit 0，输出为空 |

所有运行凭据剥离、出站阻断，`nonLoopbackDenials=0`。`git diff --check` 通过。绿例日志 SHA-256：`f271fab14fb56af1aca1a60d649e4422aadd4a0e3197d4863b6cecda930ef277`。本次按协调范围仅验证两套受影响测试及靶向 lint；全仓由协调任务统一验证。

最终文件 SHA-256：

- source-review-evidence：`ae65534ee577c59318bc6a420af30e064e0b331880cca30ebed4af28f56c2dd4`
- source-review 测试：`1dec30a52dd6ae602be2c8e7539b7c3957af6f2e6c0dc992786fb94944f247d0`
- source-span provider 测试：`bc756e690103d601553a495c5099aad6fbb21251dac24d975b66b98edf50bcd6`

三份冻结文件再次核验未变：quality-corpus `69e5ddd1005f12abf24483e10dd235629ef309ba3a84e922166963ccd9aed750`；supplement-quality-corpus `9775b595f4b44563beb9e3b7f9249b171e731658b454e0f26279d2b46db213d7`；旧评分器 `6297b7bdd112833cbd8a58b3bd63f6cbaf46d86b77cbab760744fe66babec351`。真实模型、费用、部署、远程迁移均为零；未修改 native oracle 或 schema。
