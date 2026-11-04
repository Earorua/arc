# 私有资料阶段 1：真实模型资格记录

日期：2026-11-04。状态：**NOT RUN — Gate 1B 未通过**。

本次仅实现资格运行器、生产来源约束的 reviewPoints 和离线守卫测试。未访问真实模型端点，未发送语料，未产生真实费用，未执行远程迁移或部署。下列“未配置/未核验”不能写成零成本的真实成功记录。

## 真实运行登记

| 项目 | 当前状态 |
| --- | --- |
| 授权 ID / runId / 有效期 | 待后续明确授权 |
| 实际 endpoint / provider / model | 未配置、未核验 |
| 隐私/路由依据 | 未核验；必须禁 fallback、zdr-only |
| providerPolicyId / policyVersion / priceVersion | 待授权具体版本 |
| token 单价、总预算、最大请求数 | 待授权；套件固定上限 24 |
| API key | 未使用；不得写入本报告 |
| 真实请求 / 回执 / 费用 | NOT RUN，无真实结果 |
| 语料 | 12 简历 + 12 JD；18 normal + 6 edge；仅合成数据 |
| 语料 SHA-256 | `69e5ddd1005f12abf24483e10dd235629ef309ba3a84e922166963ccd9aed750` |
| Gate 1A | 由主实施报告单独评估，不由本报告推断 |
| Gate 1B / 阶段 1 完成 | 未通过 / 不宣称完成 |

## 逐文档真实结果

| 文档 ID | 种类 | 类别 | 结果 | 原因 |
| --- | --- | --- | --- | --- |
| resume-01 | resume | normal | NOT RUN | 未授权实际请求 |
| resume-02 | resume | normal | NOT RUN | 未授权实际请求 |
| resume-03 | resume | normal | NOT RUN | 未授权实际请求 |
| resume-04 | resume | normal | NOT RUN | 未授权实际请求 |
| resume-05 | resume | normal | NOT RUN | 未授权实际请求 |
| resume-06 | resume | normal | NOT RUN | 未授权实际请求 |
| resume-07 | resume | normal | NOT RUN | 未授权实际请求 |
| resume-08 | resume | normal | NOT RUN | 未授权实际请求 |
| resume-09 | resume | normal | NOT RUN | 未授权实际请求 |
| jd-01 | jd | normal | NOT RUN | 未授权实际请求 |
| jd-02 | jd | normal | NOT RUN | 未授权实际请求 |
| jd-03 | jd | normal | NOT RUN | 未授权实际请求 |
| jd-04 | jd | normal | NOT RUN | 未授权实际请求 |
| jd-05 | jd | normal | NOT RUN | 未授权实际请求 |
| jd-06 | jd | normal | NOT RUN | 未授权实际请求 |
| jd-07 | jd | normal | NOT RUN | 未授权实际请求 |
| jd-08 | jd | normal | NOT RUN | 未授权实际请求 |
| jd-09 | jd | normal | NOT RUN | 未授权实际请求 |
| resume-10 | resume | edge | NOT RUN | 未授权实际请求 |
| resume-11 | resume | edge | NOT RUN | 未授权实际请求 |
| resume-12 | resume | edge | NOT RUN | 未授权实际请求 |
| jd-10 | jd | edge | NOT RUN | 未授权实际请求 |
| jd-11 | jd | edge | NOT RUN | 未授权实际请求 |
| jd-12 | jd | edge | NOT RUN | 未授权实际请求 |

## 已执行的离线验证

执行：`npm run test:unit -- tests/server/document-model-qualification-guards.test.ts tests/server/document-qualification-journal.test.ts tests/server/document-review-points.test.ts`。实际结果：**3 个测试文件、14 个测试通过**。

覆盖显式开关/完整授权、精确 endpoint/模型/价格/路由/语料/有效期、普通测试不发现真实套件、retry=0、发送前 durable reservation、预留落盘失败零发送、预算不足零发送、未知费用只发送一次并停止、唯一运行目录/拒绝重跑、来源坐标保持、实际候选 reviewPoints 来源校验与高影响问题不可删除绕过。

注入假 HTTP 的固定 oracle 执行验证了 24 文档、18 普通可预填与 6 边界可被正式适配器/校验器/评分器处理。此结果明确标记 `mode=offline-test`，**不是任何模型的质量成绩**。缺失实际 reviewPoints 的假输出仍会被评分器判为 missing-review-point，运行器不会复制金标准补分。测试未调用真实网络。

已对上述运行器、独立配置、journal、新 reviewPoints 模块及测试运行 scoped ESLint，exit 0。整个应用类型/构建与浏览器证据以主实施报告为准。

## 后续运行与判定

按 `../runbooks/2026-11-04-private-materials-phase-1.md` 准备每轮独立授权与匹配配置，仅在允许真实调用后执行独立 Vitest 配置。每个文档最多一次，不自动纠错/重试；保留每文档 recall、classificationAccuracy、retainedSourceValidity、canPrefill、失败码以及 token/费用/回执。任何未知成本保留 held-unknown 并停止，未执行项继续标 NOT RUN。

必须 24 份逐项全部达标，普通 18/18、边界 6/6；不得平均掉失败项，不得用人工或假 Provider 替代。资格通过仅完成模型准入证据的一部分，不能自动打开生产开关或代替发布授权。
