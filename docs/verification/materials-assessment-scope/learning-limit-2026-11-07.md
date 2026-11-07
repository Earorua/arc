# 明确未实践学习限制的核对兼容修复

日期：2026-11-07。旧报告、红绿日志和中间快照结果保留。本次未提交，待规格与代码质量复审；此前快照的类型或全仓结果不冒充此次源码验证。

## 问题与最小修复

兼容性审计确认 `I have not designed a live experiment and want practice with experiment planning.` 是合法 constraint，selfLevelHint 为 null。原来无候选时可生成 confirm；加入 constraint 候选后，personal/noItems 守卫反而将自动及模型提名提醒清空。候选种类对水平提示的限制不应被扩为这类明确学习限制不能核对。

抽出已有未实践核对判定为 `personalPracticeNeed`，共用于个人核对与一个窄的 constraint 分支。仅接受同一有效范围内、明确第一人称未实践某项动作，并直接肯定 `and want/need/would like practice` 的意愿；允许 do/still/now 等肯定修饰。旧谓词会误接 `do not want`、`no longer want` 或另一人物的 `would like`，本次一并用肯定句式限制。

constraint 分支仍通过 `assessmentScopes`，保留三态的示例、条件、转述、否定范围过滤。一般 constraint familiarity、独立能力句、时间地点、仅有练习愿望以及 requirement 均不适用此例外。没有按文档 ID、公司名或原句硬编码。

保留完整原文、constraint 类型、技能/约束主题及 selfLevelHint=null。仅增加既有 confirm-self-assessment 核对提醒，不推导水平、不更改能力 audit 或用户采用机制。

修改文件：`worker/document-executor/source-review-evidence.ts`、`tests/server/document-source-review-evidence.test.ts`、`tests/server/document-source-span-provider.test.ts`。

## TDD 与受影响验证

| 唯一 wrapper 标签 | 结果 |
| --- | --- |
| `assessment-scope-learning-limit-red-20261107-a` | 13 failed / 477 passed；真实断言失败 |
| `assessment-scope-learning-limit-green-20261107-a` | **2 files / 490 passed**，exit 0 |
| `assessment-scope-learning-limit-lint-20261107-a` | exit 0，输出为空 |

单元正例覆盖 want、need、would like、do want、still want；反例覆盖 do not/don't/no longer want、否定 need/would like、另一人物、示例、条件、转述、一般约束及 requirement。完整 v2→站点投影验证有/无模型提名均保留事实、类型、主题、空提示与来源准确的未解决提醒。

所有运行凭据剥离并阻断出站，`nonLoopbackDenials=0`；`git diff --check` 通过。绿例日志 SHA-256：`d3416bf20a9fbe86987a60935fa163cd8d72d6bcadda8305d0a5ae5a2d59878b`。本次仅执行两套受影响测试及靶向 lint，后续统一冻结与全仓验证由协调任务执行。

最终文件 SHA-256：

- source-review-evidence：`2b51cb84aa127bf624a100123d042660b08ccad39688b7f4b77f8e4394f99354`
- source-review 测试：`7589f43c6f14bcbdca2182514d488378baccb9246d26b2d8db71bb61c068b8ad`
- source-span provider 测试：`7882b85a381374b3a178adfa1f45b3186227f910108b46321798f7b137f2a9cb`

三份冻结文件 SHA-256 再次一致：quality-corpus `69e5ddd1005f12abf24483e10dd235629ef309ba3a84e922166963ccd9aed750`；supplement-quality-corpus `9775b595f4b44563beb9e3b7f9249b171e731658b454e0f26279d2b46db213d7`；旧评分器 `6297b7bdd112833cbd8a58b3bd63f6cbaf46d86b77cbab760744fe66babec351`。评分门槛、schema、native oracle 均未修改。真实模型调用、费用、部署和远程迁移均为零。
