# 原文质量标注草案说明

状态为 `draft-not-approved`。本次仅编制源事实、原词、整条 hint、精确提醒及来源分类，不构成新 Gate 批准或机器评分冻结。

独立依据是两份冻结合成语料及其完整旧 gold、已批准 v2.1 的 §6.2–6.4 / §7.1 / §8，以及 `2026-11-07-materials-quality-contract-v2.md` 的逐字段提案。未阅读或运行 production grounding/mapping、模型/解码结果或 audit 输出；没有联网、依赖安装、真实调用、费用、部署或提交。

`annotations.draft.json` 包含 30 份资料与原样保存的 84 个唯一 legacy 字段；分组为 B2 普通 18 / 边界 6，补充普通 3 / 边界 3。`additionalFields` 单独登记两项：`resume-01` 的数据分析基础学习主题维度与 `jd-12` 的相反任职清单来源。前者可与关联旧字段共享一个候选，后者需要自己的来源事实；均不改变旧 84 分母，也不给重复副本加分。

主 JD 明确分类 31 项、次要 JD 1 项，另检 2 个未决冲突锚点。资源引用 `jd-11-field-3` 与教练建议 `supplement-01-field-2` 保持 requirement / unspecified。全部原词替代都是同一完整原句的字面子串；有限 `combinedLiteralTerms` 可让一个具体短语覆盖多个语义组，不强制拆词方式。完整事实仍须保留主动作、工具、人物、否定与条件，旧课程上位标签不充当原文。

11 条 guided 和 6 条 conceptual 正例未被统一改为 null。局部协助、普通使用、团队成果、明确能力限制和学习目标不自动产生整条 hint。`resume-09` 的伙伴交互测试不成为 React 实现指导；`resume-12` 保留 confirm + missing 而不预设自评冲突；`resume-06-field-3` 保持 constraint / null 且必需 confirm。

提醒清单包括 35 个 required、11 个有明确理由的 optional、5 个显式 forbidden；任何未列出的 code + 完整来源组合默认禁止。相同来源的注入与外链提醒分别保留。`supplement-05` 保留在 30 份中，事实可为空但两个提醒均必需，外链访问次数为零。

自检先于成品编写，第一次运行按预期以 `Independent annotation draft is absent` 失败。现已将原断言和坏例保存为同目录的持久检查脚本；当前共有 26 个坏例，保留原 11 个并新增 15 个计数/分组一致性坏例。以下两条命令必须从仓库根目录运行，均已验证退出 0：

```text
node docs/verification/materials-quality-v2/validate-annotations.mjs
node docs/verification/materials-quality-v2/validate-annotation-mutations.mjs
```

坏例脚本通过自身文件位置调用同目录 `validate-annotations.mjs`，不依赖 `work/` 中的临时脚本。它在当前仓库 `work/` 下创建必要目录，以 PID + UUID 组成唯一进程文件名，并以 `wx` 独占创建；`finally` 只删除当前进程成功创建的该文件，不删除目录或其它文件。两份脚本仅检查标注结构及内部一致性，不是候选评分器。

初版自检结果（保留历史）：正向检查通过 30 文档 / 84 唯一旧字段 / 2 增补项；旧字段、旧提醒与旧 forbidden 完整块逐项深相等。137 个 v2 来源引用在指定 segment 和全文均唯一，segment 与 UTF-16 字符偏移匹配冻结原文；223 个允许字面词替代、62 个合并短语均在本句。三份原输入 SHA-256 均未改变。11 个标注结构损坏副本全部被正确拒绝：漏文档、重复旧字段、伪引用、emoji 后错偏移、凭空补 unit tests、漏任务组、合并词指向不存在组、非原文合并词、资源升 preferred、正例 hint 擦除、提醒清单互相矛盾。

初版草案 SHA-256（保留历史）：`622b09d9d82fb7f3978ad430c9d37c9c30e28e8e5743d3472c19e2eb54f079d3`。

初版待审记录（修订结果见下文）：本草案仍需独立原文审阅者逐项复核，尤其是有限词组替代的粒度、所有整条正提示均要求 confirm 的提案，以及局部实践只允许 optional confirm 的范围。未发现必须借候选输出来决定的原文人物、否定或冲突事实。课程内容、别名依据、课程对象 SHA 与逐词映射均明确 `separateCourseReviewPending=true`，没有假装完成；下一步还需独立机器评分器和候选语义故障注入。此处的临时自检只验证标注结构及内部一致性，不是候选评分器，也不能证明当前模型通过。

2026-11-07 独立原文规格复审发现 1 类 P2：`supplement-06-field-1` / `supplement-06-field-2` 的 `expected.sourceRole=secondary-jd-requirement` 正确，但 `semanticScope.actor=document-author` 错将次要岗位要求主体写成资料作者。修订只把这两处 actor 改为 `target-role`。SQL 的 unspecified 与冲突提醒、TypeScript 的 preferred、次要来源权限以及所有其它 JSON 值均保持不变。初版快照保留于 `work/materials-quality-v2-actor-before.json`；逐值差异断言确认仅 `/documents/29/fields/0/semanticScope/actor` 和 `/documents/29/fields/1/semanticScope/actor` 发生变化。本次未重跑初版生成脚本，schema 与 id 未改。

结构自检新增通用规则：凡 `primary-jd-requirement` 或 `secondary-jd-requirement` 来源，actor 必须为 `target-role`。先在初版 SHA 上复现，失败准确列出上述两字段；随后修改并使用统一离线 wrapper 的三个唯一标签验证：

| 标签 | 结果 | 日志 SHA-256 |
| --- | --- | --- |
| `quality-v2-actor-red` | 预期退出 1，两处主体不一致 | `72aff2bb8bd18fcfcfa326a294534c91480db99cce5ceccc0720d11d744d7f28` |
| `quality-v2-actor-green` | 退出 0，结构与覆盖检查全部通过 | `8b03d6f13cab4e9b0184cf95944c7b5324c0d511dbd903f7127d37250eb9c2de` |
| `quality-v2-actor-negative` | 退出 0，原 11 个损坏副本均被拒绝 | `060111a27327045e87c74f3aae7628da9d6034db006f4e8c8138b23926db4c96` |

以上 actor 修订轮次的历史证据保存于 `work/grounded-verification/<标签>.json` 与 `.log`；当前复现入口为上文两份持久脚本。修订仍保留 30 文档、84 唯一旧字段、2 增补项、137 引用、223 字面替代、62 合并短语及原提醒数量，三份冻结输入 SHA 未变。

当前修订 SHA-256：`e512e3fca67fd9133cae4e9186cb054c3044d79b090d567daaba24cb85bd9ef9`。原独立审阅者已增量复审为 **SOURCE PASS（30 文档 / 84 旧字段 + 2 增补项）**，确认 JSON 仅两处 actor 变化。复审记录为 `source-review-quality-v2-20261107-c.log`，退出 0，SHA-256 `42199be91600e908490227980ca409a57df79800cbfe3a8eb344da4319e044d8`。`draft-not-approved` 与课程审阅、机器评分器 pending 保持不变，未冻结新 Gate 或评分器。

持久脚本保存后通过唯一离线 wrapper 标签验证；调用形式为 `node work/grounded-verification/run.mjs <标签> <Node 脚本及参数>`：

| 标签 | 结果 | 日志 SHA-256 |
| --- | --- | --- |
| `quality-v2-durable-structure` | 退出 0，原结构与覆盖断言通过 | `8b03d6f13cab4e9b0184cf95944c7b5324c0d511dbd903f7127d37250eb9c2de` |
| `quality-v2-durable-negative` | 退出 0，原 11 个坏例均被拒绝，唯一临时文件已清理 | `060111a27327045e87c74f3aae7628da9d6034db006f4e8c8138b23926db4c96` |
| `quality-v2-durable-lint` | 两份 mjs 的 ESLint 退出 0，`--max-warnings=0` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

初版持久文件 SHA-256（保留历史）：`validate-annotations.mjs` 为 `7d9bd9ea16a61e336726553a679fc71b0ec31eb701aa6d12176855a36c9482ee`；`validate-annotation-mutations.mjs` 为 `952ae2fae3c15a771d8bbd7494cccc5ff3e7e158e0b21ceb5e9643eaecdfd8aa`。该次持久化没有修改标注 JSON。

工具独立质量复审发现 1 类 P2：原校验器只要求增补 ID 包含指定两项，没有限制其全集；它没有核对顶层 `denominators` / `reportingGroups` 声明，也只累计文档分组总数。因此，额外克隆增补项、改坏声明分母/分组计数、删除分组声明、交换 normal/edge 文档分组但保留总数，均可能误通过。先增加相关坏例，在未改校验器时运行 `quality-v2-counts-red`，首个新增 `extra-additional-field` 实际错误返回 0，使坏例套件按预期失败；此 RED 证据没有被改名为通过。

最小修正只扩展结构一致性：增补 ID 全集必须恰为 `resume-01-additional-1` 与 `jd-12-additional-1`；五个声明分母必须与已固定并实际统计的 84 / 31 / 1 / 2 / 2 一致；四个报告分组声明必须完整、唯一且与 18 / 6 / 3 / 3 的实际计数一致；每份文档的分组须由冻结语料的 kind/category 决定。原 11 个坏例不变，新增 15 个分别覆盖额外增补、五个错误分母、四个错误分组计数、整份分组声明缺失、单个分组缺失、重复分组、额外分组、保持总数的 normal/edge 交换，最终 26 个全部被拒绝。

| 标签 | 结果 | 日志 SHA-256 |
| --- | --- | --- |
| `quality-v2-counts-red` | 预期退出 1，复现额外增补被旧工具放过 | `af56d1523944ec96839f9c2f1c93c2a9a50235fb988751fa28dbdc7838b430fe` |
| `quality-v2-counts-green` | 退出 0，正确草案的结构/覆盖/声明一致性通过 | `8b03d6f13cab4e9b0184cf95944c7b5324c0d511dbd903f7127d37250eb9c2de` |
| `quality-v2-counts-negative` | 退出 0，26 个坏例全部被拒绝且唯一临时文件已清理 | `fb1b84a3bca6d3b68c4318e9d6381897bc2717926a991828340a16063710414b` |
| `quality-v2-counts-lint` | 两份 mjs 的 ESLint 退出 0，`--max-warnings=0` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

当前脚本 SHA-256：`validate-annotations.mjs` 为 `6611b36facf987a7f6c1c3c0bad739d04d6c216c621ca34b5bd5e76e6e82a34b`；`validate-annotation-mutations.mjs` 为 `5fe16d4c7448df00bb3c2ba7220ebf8ee0aaed5b65a7184092abd01b8195083d`。这轮只修改两份持久 mjs 和本说明，标注 JSON 仍为 `e512e3fca67fd9133cae4e9186cb054c3044d79b090d567daaba24cb85bd9ef9`，原三份冻结输入 SHA 也未变。没有扩展为候选或课程评分器。

最终工具质量增量复审已 PASS。原审阅者重新执行正向、26 个坏例，以及此前实际错误放行的 12 个副本；全部按预期拒绝，且错误原因对应。证据标签为 `quality-v2-tools-rereview-structure-20261107-b27dc4`、`quality-v2-tools-rereview-negative-20261107-b27dc4` 与 `quality-v2-tools-rereview-prior-repros-20261107-b27dc4`，最后一项日志 SHA 为 `321cb476e1423bdcb6e6b9dc15c98d19b1a35575993b2b97a07c3b8e7e3b137e`。根任务另以 `quality-v2-final-structure`、`quality-v2-final-negative`、`quality-v2-final-lint` 从持久路径复验，均退出 0，出站计数为 0。[归档证据](source-review-verification.json)记录最终文件摘要、原始冻结输入、红绿及两阶段复审记录。本结论仅覆盖已审原文标注和结构工具；课程层、独立候选评分器、完整冻结及新 Gate 均仍待完成。
