# Task 2 独立代码质量复审 — 2026-11-09

结论：**PASS（限定本次离线代码质量审阅）**。Critical 0，Important 0，未发现需作为阻断项提出的 Minor 问题。当前修复可继续根任务的整体验证；本结论不是上线、部署、合并或发布 Gate 通过。

## 来源与审阅范围

- 工作区：`C:/Users/XF/.codex/worktrees/materials-replan-recovery/ui-warm-precision`。
- 分支：`codex/materials-replan-recovery-20261106`；HEAD `714ea9e54d87b91a1fee4883176d4f1dd06ecf63`；产品 WIP `41bcdd7`。
- 审阅区间：`c788268b5dbb4e91480ce98738274dfd08a58155..714ea9e54d87b91a1fee4883176d4f1dd06ecf63` 的 9 个产品/测试文件，并读取其共享规则、上下文服务、契约与测试辅助代码。
- 已读取本地 `AGENTS.md`、`D:/CodexScratch/arc-source-readme-20261029/SOURCE_INDEX.md` 和 GitHub connector 返回的 `Earorua/arc master/SOURCE_INDEX.md`（blob `545f678d70953f7cadf46e3cd2cc10e00f5e8481`）。没有运行 fetch、merge 或任何历史发布命令。
- 依 `superpowers:requesting-code-review` 和 `superpowers:verification-before-completion` 完成独立复审。Task 1 已验收的有限语法保持既定范围；本次重点是逐关系实践投影和 assist with/in 的行政对象头修复。
- 冻结来源 `experience-priority-author-20261109-resume-frozen-source.json` SHA256 `7c3b39d88da8cce80b3e1a6eff59215508eb8cac18de9fbff328f8966c210134`；来源绑定 `experience-priority-author-20261109-resume-source-binding.json` SHA256 `c0a400acc5554be8189708a2b5d1511f306b9e29c6d421655be02aadf723f93c`。

## 质量判断

- `app/lib/materials/skill-mapper.ts:54` 的证据目标类型来自既有谓词接口；`resolveMaterialTerms` 在同一词典/同一匹配判断中携带来源，未新增技能词典或从课程名反推原文。保留词和逐词人工选择使用原词；无词自动关系逐别名判断；整条人工关系使用 whole-fact。公开投影在 125 行起逐字段返回旧形状，不泄露内部 Map。
- `skill-mapper.ts:150` 的实践投影要求 mapped、experience/skill-claim 和关系自身的证据，并按 itemId/skillId 去重。人工选择、无词列表、显式空列表、已删词和忽略路径均保留约定；不以任一关系的个人动作证明另一技能。
- `app/lib/materials/experience-evidence.ts:78` 只为明确 assist with/in 检查实际对象；89–92 行的对象头去掉 for/to/about/on/of 补语后仍识别 scheduling、planning 和 progress/status reporting。嵌套实际测试/修改动作与未限定的技术 SQL reporting 保持正向；复用了已有范围、引文和主体处理。新增测试验证他人、否定、未来、条件、转述、整句引用和混合主体未被放行。
- `app/server/documents/context-builder.ts:265` 仅替换非 JD 的 practices 来源；requirements、learning-intents、资格检查和 self-audit 原路径未被改写。新服务实测保存的 audit、availability、target 均与请求相同，普通经验未获得 learningIntentEligible。
- `app/lib/materials/planning-priority.ts:3` 升到 policy `2026.11.3`，mapper 仍为 `2026.11.5`。`context-builder.ts:76/205` 的 read/loadValid 和 mutation receipt 继续返回已保存 preview_json，不调用 project 重算；旧策略字符串仍可解析，指纹/owner/依赖/失效守卫保留。当前创建→持久化→重读→同 mutation replay 已独立实测。真正旧源码创建/新源码历史读取由根任务统一完成，本次未冒充重复该项运行；已核阅规格审查的旧源码插件测试实现及原始通过日志。
- `app/components/materials/material-context-review.tsx:145/198` 只对 mapped 的 skillIds 去重，独立显示 priorities.length；旧预览无 mappingDetails 时只显示排序数。29 个组件测试验证了分离计数、歧义、空/忽略/非学习项和旧快照路径；组件测试使用 API fixture，不等同原生浏览器验收。

## 本次独立命令与结果

所有 Node 都通过已校验的断网包装器运行。包装器 SHA256 `4a2fe29b3c5c0fd9c6ce06cfd436e86e8a9ef9daa8fada44e7c87021c5f28242`；blocker SHA256 `48332c5bcf02a17b7cc7fbf27e3771db7e8809afb36acd1c870b683909d10e9f`。以下命令 exit 均为 0，nonLoopbackDenials 均为 0。

```text
node work/grounded-verification/run.mjs experience-priority-quality-20261109-identity-before-01 work/grounded-verification/experience-priority-quality-20261109-integrity.mjs before
node work/grounded-verification/run.mjs experience-priority-quality-20261109-focused-02 node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-priority-quality-20261109-focused.config.ts
node work/grounded-verification/run.mjs experience-priority-quality-20261109-identity-after-03 work/grounded-verification/experience-priority-quality-20261109-integrity.mjs after
```

| 命令标签后缀 | 结果 | 原始 log SHA256 |
| --- | --- | --- |
| identity-before-01 | 9 来源 / 12 共享候选 / 22 依赖 / 370 历史工件核验 | `f25b74180a5edd11374ac410d404d70adaf6c23f3aa5b3f2d3a167d2b8349da3` |
| focused-02 | 5 文件，383 测试通过 | `79b2eee75e863be3d1a5ab169a3f1934536ddc9167a17adf60ee49c6c72d243d` |
| identity-after-03 | 同上；前后来源/依赖/审阅输入均一致 | `142ef3ebd1df81cc814aaf29d6baf683ec74dc631c103b5698364bc3bdbb2d54` |

383 项分解：experience-evidence 259；practice-skill-mapping 25；material-practice-priorities 32；material-context-choices 29；独立 boundary-service 38。没有把其中交叠的谓词、映射和服务断言重复算作测试数量。

38 个新增用例包含 with/in × status/progress × on/about/of 的 12 种组合、行政对象和技术正例、mentor-supplied SQL 的实际测试/修改、他人/否定/计划/条件/引用/转述以及 React/SQL 混合关系。25 个无实践结果、13 个有实践结果；3 个混合关系用例包含在上述数量内。每例独立检查谓词、whole-fact、公开映射形状、实践投影，以及真实 MaterialContextService + SQLite/D1 适配器的 create/persist/read/replay；未 mock 投影或手工拼装期望 preview。

原始服务观察：`experience-priority-quality-20261109-boundary-service-results.json`，SHA256 `14d025e8dbbf55e9b54eb902a433ab01be1b947c0163fdbf06f25d08e175258c`。日志仅有预期的 Node SQLite ExperimentalWarning，无测试诊断。

## 前后来源摘要与冻结

以下 9 项前后 SHA256 全部相同，与作者固定来源及其源文件副本逐字节相符。12 项共享候选、22 项依赖、370 份历史工件的完整摘要在 before/after identity JSON 中；旧 253 测试仍为当前测试文件的原字节前缀。

| 路径 | 前后共同 SHA256 |
| --- | --- |
| app/lib/materials/skill-mapper.ts | `f6dc1cb1302e72f3904847b9eeabe3ff8bcb4af409fb75dc0bf37f5a68f854c9` |
| app/lib/materials/experience-evidence.ts | `12f25330b1719338eec736881d2a19dc8635dbd1c71fa997059dd9bfc21debec` |
| app/lib/materials/planning-priority.ts | `9620b2a75b3826f7ccaa330bf95aab8ca5ef0608f2e4af4f3df80bdaa8dd154b` |
| app/server/documents/context-builder.ts | `aff6dca10db13459beb5d4da00c4e3bb43534b74ffe543f2d307c1c2d2fdd416` |
| app/components/materials/material-context-review.tsx | `e74ed4b00d3c5495d7564ab4875503a6b3faebeb5744dd45ca07abab12a65389` |
| tests/lib/materials/experience-evidence.test.ts | `0b8f4d54812dfeed46beb53fd18c10b45503b68f0b989bcf1926706ead60d520` |
| tests/lib/materials/practice-skill-mapping.test.ts | `f28f7049081747cc55638b171f30fc9b0c4d6716e6f3e52c471dada1969941b8` |
| tests/server/material-practice-priorities.test.ts | `6b6f4222a6848748fa2eb1503e3fa887c6ae31c95bbd2d6080c7563e00a64b91` |
| tests/components/material-context-choices.test.tsx | `b47bfc1a2f016eb6501fd6666d3b7a78a6d22c028f2ac6e5fd3c05ca8bace33a` |

Before identity JSON SHA256 `9fdfd304956d540949fb02546c1529a9d68904322e67956a991dd374ad5e8895`；after identity JSON SHA256 `7c525ea934ad753b748de55068e6b0c532c4aacc2b64773dce4e5f41c207c55b`。

本次仅在 ignored `work/grounded-verification` 增加 quality-20261109 前缀工件，使用排他写入保存结果；没有覆盖原日志、原断言、来源 hash 或产品源码。前后 `app/tests` status 为空；既有 `docs/verification/2026-11-06-materials-grounding-pause.md` 修改保留。

最终审阅封存文件为 `experience-priority-quality-20261109-frozen-source.json`，在本 memo 完成后由 `experience-priority-quality-20261109-freeze-04` 包装命令生成，记录 memo、脚本、配置、原始结果、日志与包装器结果的 SHA256。封存完成后停止测试。

本次没有运行真实模型、原生完整 UI/HTTP 链路、全仓、构建、远程迁移、部署、推送或提交；其余经授权的离线整体验证由根任务完成。此 PASS 不扩展有限自然语言语法、不重设计 Task 1，也不替代剩余课程覆盖、能力采用、14 场景绑定或任何发布 Gate。
