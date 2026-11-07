# 否定范围与真实转折复审修复

日期：2026-11-07。承接 `spec-review-fixes-2026-11-07.md`，保留前轮报告及所有日志；未提交，待独立复审。

## 原因与修复边界

复审确认：首分句的 `deniedAssertion` 直接令整个 `assessmentScopes` 返回空，导致真实转折也被删除。例如：

- `没有证据说我能独立配置 React，但我熟悉 SQL。`
- `It is false that I configured React, but I am familiar with SQL.`

两条的 SQL conceptual 与 confirm 都有直接个人证据，前面的否定不能越过明确对比转折继续约束它。

本次移除“首否定清空整句”，改为局部 `deniedContinuation` 状态：否定继续约束逗号或 and 后的续述；只有明确 but/但是/但 后直接的个人陈述才解除。如果转折右侧仍是转述，状态不解除。示例、条件与报告的外层保护保持，不用去掉它们换取正例通过。

新增反向转折单元与完整 v2 解码断言；同时新增“否定后的逗号续述不能解除”和“示例/条件/转述内部出现但不能解除”的保护。原有效指导、多词范围、同词不同任务、能力限制、职责缺失、v1 与站点投影回归保持通过。

变更仅涉及：

- `worker/document-executor/source-review-evidence.ts`
- `tests/server/document-source-review-evidence.test.ts`
- `tests/server/document-source-span-provider.test.ts`

未改 schema、v1 prompt、数据库、原生 oracle 或旧语料/评分器。仍是有界句内范围判断，不宣称支持任意跨句推理或所有自然语言转折。

## 红绿与回归

| 唯一运行标签 | 结果 |
| --- | --- |
| `assessment-scope-contrast-red-20261107-a` | 2 files；4 failed / 436 passed，真实断言失败 |
| `assessment-scope-contrast-green-20261107-a` | 2 files / 440 passed |
| `assessment-scope-contrast-final-green-20261107-a` | **9 files / 531 passed**，exit 0 |
| `assessment-scope-contrast-lint-20261107-a` | exit 0，输出为空 |

全部运行通过凭据剥离及出站封锁 wrapper，`nonLoopbackDenials=0`。`git diff --check` 通过。最终回归日志 SHA-256：`2befd116e75d13d2c58677a84dc11d333fd3cd65b93dbca42733fd6705a4f23a`。

此次最终源码 SHA-256：`9069abca2eeebe11a420ef23e7afe5a3308e8419b72c0ea14131702dbd81f607`。两个测试文件 SHA-256 分别为 `120a1fb3c364530fc189eb122ed515359b5ca028a7cbee03c4e64d535b5a5cb7`（source-review）与 `066b01e41e75524c533b9bf3c7c72ea1edf037bfd332dbe1222ca048e0d9bee1`（source-span provider）。

三份冻结文件 SHA-256 再次与给定值一致：quality-corpus `69e5ddd1005f12abf24483e10dd235629ef309ba3a84e922166963ccd9aed750`；supplement-quality-corpus `9775b595f4b44563beb9e3b7f9249b171e731658b454e0f26279d2b46db213d7`；旧评分器 `6297b7bdd112833cbd8a58b3bd63f6cbaf46d86b77cbab760744fe66babec351`。

真实模型调用、费用、部署、远程迁移均为零。未执行全仓或构建检查；最终独立原生等价验证与规格复审由协调任务执行。
