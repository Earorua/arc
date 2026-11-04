# Gate 1B 产品页面取证工作表

本表供通过 B2、B3 并取得 B4 单独授权后使用。以下 24 页的初始状态均为 `NOT RUN`。B0 使用固定回执和合成候选的结果另存于离线报告，不填入本表。

**Kimi 标准端点预算（2026-11-05 离线核对）。** 原登记默认最多 500,000 微美元。若批准为 24 份固定简历/JD 预留全部顶格金额，新的独立 B4 登记需注明 `budgetPlan: "b4-kimi-k31-pro-mxfp4-v1"`，配置与语料摘要必须与[离线验收记录](../../verification/2026-11-05-materials-offline-repair.md)对应。每份预留 72,960 微美元，24 份需 1,751,040 微美元；登记硬上限为 2,000,000 微美元。签发前先核实该专用 key 的实际可用余额及其他轮次已用金额。新增迁移不改旧授权，不改变本表的 `NOT RUN` 状态。

## 操作约定

1. 在受限站点通过产品登录页登录获批测试账户。记录不含身份信息的账户代号和 runId。只使用资料库粘贴入口、核对页、规划页、历史和删除页面。不得用直接调用写接口的脚本代替用户操作。
2. 在仍关闭真实出站时逐一粘贴冻结语料，点击「保存并手动整理」仅保存版本，保留空草稿。在产品页面的网络响应中只抄录版本 ID；同一版本的规范化正文 SHA-256 须与相应页一致。登记 24 份资料的 owner、ID 和 generation，由授权人独立核验登记清单。B4 授权和执行器登记生效后，回到同一资料，检查显示的处理方、用途和当前文本，勾选允许，再发起一次分析。保存操作不计为人工填写。
3. 按页序逐一进行。上一笔须有唯一供应方回执、确切上游、端点、模型、token 与费用对账；未知或不符即停发并记录未执行页。在产品页面点击「查看原文依据」核对每个保留条目；先记录首次呈现，再改、删、增或确认。用户点击采用才记录自评变更。人工补录、拒绝外发和服务故障分别计数。
4. 经授权的只读账本可补齐真实回执、排队/处理毫秒、版本和费用状态。只以代号、ID、摘要、计数、耗时、状态和差异记证。禁存正文、摘录、完整候选、登录凭据、请求头、截图中的私人内容或 HAR。
5. 对 `resume-01` 与 `jd-01` 按 B0 报告的输入生成两份预览。保存前后单位 ID 列表、依赖校验、变化位置和 `itemId → sourceRef(版本及起止位置) → confirmationId → contextVersionId`。在固定进度上分别验证接受与放弃、刷新恢复、历史依据失效、已完成任务和依赖保护。每次审阅/重排后核对新增出站数为 0。最后通过资料库删除，逐个核对清理状态和两端读回。
6. 每页只能对应一个登记 case。先完成 18 个普通样例再处理 6 个边界样例；每页单独导出或打印。若出现越权发送、重复发送、错路由或隐私泄漏，停发，标记此页和未运行页，保留脱敏账目。

<div style="break-before: page"></div>

## 01　`resume-01`　普通简历

预登记文本 SHA-256　`5e86e6dcd87c9011ac5eadcea7e55a91b87746fb8cf7d5922755bfaf15910a95`。现场状态　`NOT RUN`。

| 取证项 | 仅填实际结果 |
| --- | --- |
| 登记与允许 | runId／owner 代号／documentId／documentVersionId／textVersionId／generation／实测摘要匹配／consentId／purpose 与政策版本 |
| 提交与处理 | jobId／receiptId／实际模型、上游及 endpointId／输入和输出 token／费用 micro-USD／审计状态／排队与处理毫秒／实际 POST 数 |
| 首次呈现与来源 | 预填数／可追溯数／核对提醒数及代码／高影响未处理时是否阻止确认 |
| 用户操作 | 保留／修改／移除／新增条目数／人工重录数及原因码／已处理提醒数／自评明确采用数／confirmationId |
| 结果与回收 | PASS、FAIL、BLOCKED 或 NOT RUN／差异或失败代码／删除任务 ID／清理状态／对象读回数／新增推理数 |

<div style="break-before: page"></div>

## 02　`resume-02`　普通简历

预登记文本 SHA-256　`2245d4a91217deee57a93eb87d1c2d51470832c5f88bffd8598b52d50496877c`。现场状态　`NOT RUN`。

| 取证项 | 仅填实际结果 |
| --- | --- |
| 登记与允许 | runId／owner 代号／documentId／documentVersionId／textVersionId／generation／实测摘要匹配／consentId／purpose 与政策版本 |
| 提交与处理 | jobId／receiptId／实际模型、上游及 endpointId／输入和输出 token／费用 micro-USD／审计状态／排队与处理毫秒／实际 POST 数 |
| 首次呈现与来源 | 预填数／可追溯数／核对提醒数及代码／高影响未处理时是否阻止确认 |
| 用户操作 | 保留／修改／移除／新增条目数／人工重录数及原因码／已处理提醒数／自评明确采用数／confirmationId |
| 结果与回收 | PASS、FAIL、BLOCKED 或 NOT RUN／差异或失败代码／删除任务 ID／清理状态／对象读回数／新增推理数 |

<div style="break-before: page"></div>

## 03　`resume-03`　普通简历

预登记文本 SHA-256　`7b2a15c60937d44001047ef04170a2651eee0b0b027484de023976a8b2debd62`。现场状态　`NOT RUN`。

| 取证项 | 仅填实际结果 |
| --- | --- |
| 登记与允许 | runId／owner 代号／documentId／documentVersionId／textVersionId／generation／实测摘要匹配／consentId／purpose 与政策版本 |
| 提交与处理 | jobId／receiptId／实际模型、上游及 endpointId／输入和输出 token／费用 micro-USD／审计状态／排队与处理毫秒／实际 POST 数 |
| 首次呈现与来源 | 预填数／可追溯数／核对提醒数及代码／高影响未处理时是否阻止确认 |
| 用户操作 | 保留／修改／移除／新增条目数／人工重录数及原因码／已处理提醒数／自评明确采用数／confirmationId |
| 结果与回收 | PASS、FAIL、BLOCKED 或 NOT RUN／差异或失败代码／删除任务 ID／清理状态／对象读回数／新增推理数 |

<div style="break-before: page"></div>

## 04　`resume-04`　普通简历

预登记文本 SHA-256　`6f592a5fc6dea4931da805210df1ca257e5bc964a7fd218228e68f6958b766a8`。现场状态　`NOT RUN`。

| 取证项 | 仅填实际结果 |
| --- | --- |
| 登记与允许 | runId／owner 代号／documentId／documentVersionId／textVersionId／generation／实测摘要匹配／consentId／purpose 与政策版本 |
| 提交与处理 | jobId／receiptId／实际模型、上游及 endpointId／输入和输出 token／费用 micro-USD／审计状态／排队与处理毫秒／实际 POST 数 |
| 首次呈现与来源 | 预填数／可追溯数／核对提醒数及代码／高影响未处理时是否阻止确认 |
| 用户操作 | 保留／修改／移除／新增条目数／人工重录数及原因码／已处理提醒数／自评明确采用数／confirmationId |
| 结果与回收 | PASS、FAIL、BLOCKED 或 NOT RUN／差异或失败代码／删除任务 ID／清理状态／对象读回数／新增推理数 |

<div style="break-before: page"></div>

## 05　`resume-05`　普通简历

预登记文本 SHA-256　`7157372127da28b012b9be687d1b5a6436fa31060df94a2aefcc1319f07f8e98`。现场状态　`NOT RUN`。

| 取证项 | 仅填实际结果 |
| --- | --- |
| 登记与允许 | runId／owner 代号／documentId／documentVersionId／textVersionId／generation／实测摘要匹配／consentId／purpose 与政策版本 |
| 提交与处理 | jobId／receiptId／实际模型、上游及 endpointId／输入和输出 token／费用 micro-USD／审计状态／排队与处理毫秒／实际 POST 数 |
| 首次呈现与来源 | 预填数／可追溯数／核对提醒数及代码／高影响未处理时是否阻止确认 |
| 用户操作 | 保留／修改／移除／新增条目数／人工重录数及原因码／已处理提醒数／自评明确采用数／confirmationId |
| 结果与回收 | PASS、FAIL、BLOCKED 或 NOT RUN／差异或失败代码／删除任务 ID／清理状态／对象读回数／新增推理数 |

<div style="break-before: page"></div>

## 06　`resume-06`　普通简历

预登记文本 SHA-256　`408a70965fe9c08a56d94c7940afe8ee2e67a8fd959963c4a205f600ac7c18fc`。现场状态　`NOT RUN`。

| 取证项 | 仅填实际结果 |
| --- | --- |
| 登记与允许 | runId／owner 代号／documentId／documentVersionId／textVersionId／generation／实测摘要匹配／consentId／purpose 与政策版本 |
| 提交与处理 | jobId／receiptId／实际模型、上游及 endpointId／输入和输出 token／费用 micro-USD／审计状态／排队与处理毫秒／实际 POST 数 |
| 首次呈现与来源 | 预填数／可追溯数／核对提醒数及代码／高影响未处理时是否阻止确认 |
| 用户操作 | 保留／修改／移除／新增条目数／人工重录数及原因码／已处理提醒数／自评明确采用数／confirmationId |
| 结果与回收 | PASS、FAIL、BLOCKED 或 NOT RUN／差异或失败代码／删除任务 ID／清理状态／对象读回数／新增推理数 |

<div style="break-before: page"></div>

## 07　`resume-07`　普通简历

预登记文本 SHA-256　`25a9023dfd1f6cfe63f539075eca366180e1cbf084f3c67f92c590d678678155`。现场状态　`NOT RUN`。

| 取证项 | 仅填实际结果 |
| --- | --- |
| 登记与允许 | runId／owner 代号／documentId／documentVersionId／textVersionId／generation／实测摘要匹配／consentId／purpose 与政策版本 |
| 提交与处理 | jobId／receiptId／实际模型、上游及 endpointId／输入和输出 token／费用 micro-USD／审计状态／排队与处理毫秒／实际 POST 数 |
| 首次呈现与来源 | 预填数／可追溯数／核对提醒数及代码／高影响未处理时是否阻止确认 |
| 用户操作 | 保留／修改／移除／新增条目数／人工重录数及原因码／已处理提醒数／自评明确采用数／confirmationId |
| 结果与回收 | PASS、FAIL、BLOCKED 或 NOT RUN／差异或失败代码／删除任务 ID／清理状态／对象读回数／新增推理数 |

<div style="break-before: page"></div>

## 08　`resume-08`　普通简历

预登记文本 SHA-256　`ad6ae2ed8374e692a9cdc2f28cf2aaba818cb2297680656fb8eeb735b04ae871`。现场状态　`NOT RUN`。

| 取证项 | 仅填实际结果 |
| --- | --- |
| 登记与允许 | runId／owner 代号／documentId／documentVersionId／textVersionId／generation／实测摘要匹配／consentId／purpose 与政策版本 |
| 提交与处理 | jobId／receiptId／实际模型、上游及 endpointId／输入和输出 token／费用 micro-USD／审计状态／排队与处理毫秒／实际 POST 数 |
| 首次呈现与来源 | 预填数／可追溯数／核对提醒数及代码／高影响未处理时是否阻止确认 |
| 用户操作 | 保留／修改／移除／新增条目数／人工重录数及原因码／已处理提醒数／自评明确采用数／confirmationId |
| 结果与回收 | PASS、FAIL、BLOCKED 或 NOT RUN／差异或失败代码／删除任务 ID／清理状态／对象读回数／新增推理数 |

<div style="break-before: page"></div>

## 09　`resume-09`　普通简历

预登记文本 SHA-256　`d2f087ac7f7502b05f7bef5bf70a62d48413026f08d20f9d5f04169a6a3d7358`。现场状态　`NOT RUN`。

| 取证项 | 仅填实际结果 |
| --- | --- |
| 登记与允许 | runId／owner 代号／documentId／documentVersionId／textVersionId／generation／实测摘要匹配／consentId／purpose 与政策版本 |
| 提交与处理 | jobId／receiptId／实际模型、上游及 endpointId／输入和输出 token／费用 micro-USD／审计状态／排队与处理毫秒／实际 POST 数 |
| 首次呈现与来源 | 预填数／可追溯数／核对提醒数及代码／高影响未处理时是否阻止确认 |
| 用户操作 | 保留／修改／移除／新增条目数／人工重录数及原因码／已处理提醒数／自评明确采用数／confirmationId |
| 结果与回收 | PASS、FAIL、BLOCKED 或 NOT RUN／差异或失败代码／删除任务 ID／清理状态／对象读回数／新增推理数 |

<div style="break-before: page"></div>

## 10　`jd-01`　普通 JD

预登记文本 SHA-256　`6c125c0f259b530f50d1c3d55260ce865439f51465edea3217c56420b1f8c95c`。现场状态　`NOT RUN`。

| 取证项 | 仅填实际结果 |
| --- | --- |
| 登记与允许 | runId／owner 代号／documentId／documentVersionId／textVersionId／generation／实测摘要匹配／consentId／purpose 与政策版本 |
| 提交与处理 | jobId／receiptId／实际模型、上游及 endpointId／输入和输出 token／费用 micro-USD／审计状态／排队与处理毫秒／实际 POST 数 |
| 首次呈现与来源 | 预填数／可追溯数／核对提醒数及代码／高影响未处理时是否阻止确认 |
| 用户操作 | 保留／修改／移除／新增条目数／人工重录数及原因码／已处理提醒数／自评明确采用数／confirmationId |
| 结果与回收 | PASS、FAIL、BLOCKED 或 NOT RUN／差异或失败代码／删除任务 ID／清理状态／对象读回数／新增推理数 |

<div style="break-before: page"></div>

## 11　`jd-02`　普通 JD

预登记文本 SHA-256　`98c82fa1a7e939ac80764ad166e20d046bbba20b2aaf67088ff21368e5462879`。现场状态　`NOT RUN`。

| 取证项 | 仅填实际结果 |
| --- | --- |
| 登记与允许 | runId／owner 代号／documentId／documentVersionId／textVersionId／generation／实测摘要匹配／consentId／purpose 与政策版本 |
| 提交与处理 | jobId／receiptId／实际模型、上游及 endpointId／输入和输出 token／费用 micro-USD／审计状态／排队与处理毫秒／实际 POST 数 |
| 首次呈现与来源 | 预填数／可追溯数／核对提醒数及代码／高影响未处理时是否阻止确认 |
| 用户操作 | 保留／修改／移除／新增条目数／人工重录数及原因码／已处理提醒数／自评明确采用数／confirmationId |
| 结果与回收 | PASS、FAIL、BLOCKED 或 NOT RUN／差异或失败代码／删除任务 ID／清理状态／对象读回数／新增推理数 |

<div style="break-before: page"></div>

## 12　`jd-03`　普通 JD

预登记文本 SHA-256　`b23dd7d97d0036727400b947ed94b285db48bcc93d79493d5e57acebaee0edb9`。现场状态　`NOT RUN`。

| 取证项 | 仅填实际结果 |
| --- | --- |
| 登记与允许 | runId／owner 代号／documentId／documentVersionId／textVersionId／generation／实测摘要匹配／consentId／purpose 与政策版本 |
| 提交与处理 | jobId／receiptId／实际模型、上游及 endpointId／输入和输出 token／费用 micro-USD／审计状态／排队与处理毫秒／实际 POST 数 |
| 首次呈现与来源 | 预填数／可追溯数／核对提醒数及代码／高影响未处理时是否阻止确认 |
| 用户操作 | 保留／修改／移除／新增条目数／人工重录数及原因码／已处理提醒数／自评明确采用数／confirmationId |
| 结果与回收 | PASS、FAIL、BLOCKED 或 NOT RUN／差异或失败代码／删除任务 ID／清理状态／对象读回数／新增推理数 |

<div style="break-before: page"></div>

## 13　`jd-04`　普通 JD

预登记文本 SHA-256　`251577e57a79c29aa18b993c4116078f5d1b1609315241b505c6942bb27a164c`。现场状态　`NOT RUN`。

| 取证项 | 仅填实际结果 |
| --- | --- |
| 登记与允许 | runId／owner 代号／documentId／documentVersionId／textVersionId／generation／实测摘要匹配／consentId／purpose 与政策版本 |
| 提交与处理 | jobId／receiptId／实际模型、上游及 endpointId／输入和输出 token／费用 micro-USD／审计状态／排队与处理毫秒／实际 POST 数 |
| 首次呈现与来源 | 预填数／可追溯数／核对提醒数及代码／高影响未处理时是否阻止确认 |
| 用户操作 | 保留／修改／移除／新增条目数／人工重录数及原因码／已处理提醒数／自评明确采用数／confirmationId |
| 结果与回收 | PASS、FAIL、BLOCKED 或 NOT RUN／差异或失败代码／删除任务 ID／清理状态／对象读回数／新增推理数 |

<div style="break-before: page"></div>

## 14　`jd-05`　普通 JD

预登记文本 SHA-256　`3d1d78ffbb0840936ee476a70cf3fb420d681b1cf2196ad8105aa497e7e77e19`。现场状态　`NOT RUN`。

| 取证项 | 仅填实际结果 |
| --- | --- |
| 登记与允许 | runId／owner 代号／documentId／documentVersionId／textVersionId／generation／实测摘要匹配／consentId／purpose 与政策版本 |
| 提交与处理 | jobId／receiptId／实际模型、上游及 endpointId／输入和输出 token／费用 micro-USD／审计状态／排队与处理毫秒／实际 POST 数 |
| 首次呈现与来源 | 预填数／可追溯数／核对提醒数及代码／高影响未处理时是否阻止确认 |
| 用户操作 | 保留／修改／移除／新增条目数／人工重录数及原因码／已处理提醒数／自评明确采用数／confirmationId |
| 结果与回收 | PASS、FAIL、BLOCKED 或 NOT RUN／差异或失败代码／删除任务 ID／清理状态／对象读回数／新增推理数 |

<div style="break-before: page"></div>

## 15　`jd-06`　普通 JD

预登记文本 SHA-256　`5260c8bee8b908a5161500487124dbf28173194e84df42d37e5ef736f0d7083c`。现场状态　`NOT RUN`。

| 取证项 | 仅填实际结果 |
| --- | --- |
| 登记与允许 | runId／owner 代号／documentId／documentVersionId／textVersionId／generation／实测摘要匹配／consentId／purpose 与政策版本 |
| 提交与处理 | jobId／receiptId／实际模型、上游及 endpointId／输入和输出 token／费用 micro-USD／审计状态／排队与处理毫秒／实际 POST 数 |
| 首次呈现与来源 | 预填数／可追溯数／核对提醒数及代码／高影响未处理时是否阻止确认 |
| 用户操作 | 保留／修改／移除／新增条目数／人工重录数及原因码／已处理提醒数／自评明确采用数／confirmationId |
| 结果与回收 | PASS、FAIL、BLOCKED 或 NOT RUN／差异或失败代码／删除任务 ID／清理状态／对象读回数／新增推理数 |

<div style="break-before: page"></div>

## 16　`jd-07`　普通 JD

预登记文本 SHA-256　`c3d37e33fabc74e3b9e8d78fd6d60fc012dd02f05c6fd8f596caba44f5052968`。现场状态　`NOT RUN`。

| 取证项 | 仅填实际结果 |
| --- | --- |
| 登记与允许 | runId／owner 代号／documentId／documentVersionId／textVersionId／generation／实测摘要匹配／consentId／purpose 与政策版本 |
| 提交与处理 | jobId／receiptId／实际模型、上游及 endpointId／输入和输出 token／费用 micro-USD／审计状态／排队与处理毫秒／实际 POST 数 |
| 首次呈现与来源 | 预填数／可追溯数／核对提醒数及代码／高影响未处理时是否阻止确认 |
| 用户操作 | 保留／修改／移除／新增条目数／人工重录数及原因码／已处理提醒数／自评明确采用数／confirmationId |
| 结果与回收 | PASS、FAIL、BLOCKED 或 NOT RUN／差异或失败代码／删除任务 ID／清理状态／对象读回数／新增推理数 |

<div style="break-before: page"></div>

## 17　`jd-08`　普通 JD

预登记文本 SHA-256　`ba7748177b04bc0153c3d71028553b4fb882d690953c4e51e78c7757fc3b9cba`。现场状态　`NOT RUN`。

| 取证项 | 仅填实际结果 |
| --- | --- |
| 登记与允许 | runId／owner 代号／documentId／documentVersionId／textVersionId／generation／实测摘要匹配／consentId／purpose 与政策版本 |
| 提交与处理 | jobId／receiptId／实际模型、上游及 endpointId／输入和输出 token／费用 micro-USD／审计状态／排队与处理毫秒／实际 POST 数 |
| 首次呈现与来源 | 预填数／可追溯数／核对提醒数及代码／高影响未处理时是否阻止确认 |
| 用户操作 | 保留／修改／移除／新增条目数／人工重录数及原因码／已处理提醒数／自评明确采用数／confirmationId |
| 结果与回收 | PASS、FAIL、BLOCKED 或 NOT RUN／差异或失败代码／删除任务 ID／清理状态／对象读回数／新增推理数 |

<div style="break-before: page"></div>

## 18　`jd-09`　普通 JD

预登记文本 SHA-256　`e4385d3e9a70aa091f13ced7c918ac111a2c9e8d161b4ea9c7a364013db101c1`。现场状态　`NOT RUN`。

| 取证项 | 仅填实际结果 |
| --- | --- |
| 登记与允许 | runId／owner 代号／documentId／documentVersionId／textVersionId／generation／实测摘要匹配／consentId／purpose 与政策版本 |
| 提交与处理 | jobId／receiptId／实际模型、上游及 endpointId／输入和输出 token／费用 micro-USD／审计状态／排队与处理毫秒／实际 POST 数 |
| 首次呈现与来源 | 预填数／可追溯数／核对提醒数及代码／高影响未处理时是否阻止确认 |
| 用户操作 | 保留／修改／移除／新增条目数／人工重录数及原因码／已处理提醒数／自评明确采用数／confirmationId |
| 结果与回收 | PASS、FAIL、BLOCKED 或 NOT RUN／差异或失败代码／删除任务 ID／清理状态／对象读回数／新增推理数 |

<div style="break-before: page"></div>

## 19　`resume-10`　边界简历

预登记文本 SHA-256　`ba1be3e62a02c7022049d8e13413c0f37120e34e8da928bf11b126e2970fba3b`。现场状态　`NOT RUN`。

| 取证项 | 仅填实际结果 |
| --- | --- |
| 登记与允许 | runId／owner 代号／documentId／documentVersionId／textVersionId／generation／实测摘要匹配／consentId／purpose 与政策版本 |
| 提交与处理 | jobId／receiptId／实际模型、上游及 endpointId／输入和输出 token／费用 micro-USD／审计状态／排队与处理毫秒／实际 POST 数 |
| 首次呈现与来源 | 预填数／可追溯数／核对提醒数及代码／高影响未处理时是否阻止确认 |
| 用户操作 | 保留／修改／移除／新增条目数／人工重录数及原因码／已处理提醒数／自评明确采用数／confirmationId |
| 结果与回收 | PASS、FAIL、BLOCKED 或 NOT RUN／差异或失败代码／删除任务 ID／清理状态／对象读回数／新增推理数 |

<div style="break-before: page"></div>

## 20　`resume-11`　边界简历

预登记文本 SHA-256　`4364ca73e0171cdd189a1106f3b39c8a9e280cf6472ff98dbbf44bbc3dab6021`。现场状态　`NOT RUN`。

| 取证项 | 仅填实际结果 |
| --- | --- |
| 登记与允许 | runId／owner 代号／documentId／documentVersionId／textVersionId／generation／实测摘要匹配／consentId／purpose 与政策版本 |
| 提交与处理 | jobId／receiptId／实际模型、上游及 endpointId／输入和输出 token／费用 micro-USD／审计状态／排队与处理毫秒／实际 POST 数 |
| 首次呈现与来源 | 预填数／可追溯数／核对提醒数及代码／高影响未处理时是否阻止确认 |
| 用户操作 | 保留／修改／移除／新增条目数／人工重录数及原因码／已处理提醒数／自评明确采用数／confirmationId |
| 结果与回收 | PASS、FAIL、BLOCKED 或 NOT RUN／差异或失败代码／删除任务 ID／清理状态／对象读回数／新增推理数 |

<div style="break-before: page"></div>

## 21　`resume-12`　边界简历

预登记文本 SHA-256　`0558d678a5b012a1e49145ce94b2f2ee565cd8c28368a351f3a671acbd78ce57`。现场状态　`NOT RUN`。

| 取证项 | 仅填实际结果 |
| --- | --- |
| 登记与允许 | runId／owner 代号／documentId／documentVersionId／textVersionId／generation／实测摘要匹配／consentId／purpose 与政策版本 |
| 提交与处理 | jobId／receiptId／实际模型、上游及 endpointId／输入和输出 token／费用 micro-USD／审计状态／排队与处理毫秒／实际 POST 数 |
| 首次呈现与来源 | 预填数／可追溯数／核对提醒数及代码／高影响未处理时是否阻止确认 |
| 用户操作 | 保留／修改／移除／新增条目数／人工重录数及原因码／已处理提醒数／自评明确采用数／confirmationId |
| 结果与回收 | PASS、FAIL、BLOCKED 或 NOT RUN／差异或失败代码／删除任务 ID／清理状态／对象读回数／新增推理数 |

<div style="break-before: page"></div>

## 22　`jd-10`　边界 JD

预登记文本 SHA-256　`beac97c08b025909990f96e08a6d5ca7198f3e4e87741f54baad4ca0c0db8d2f`。现场状态　`NOT RUN`。

| 取证项 | 仅填实际结果 |
| --- | --- |
| 登记与允许 | runId／owner 代号／documentId／documentVersionId／textVersionId／generation／实测摘要匹配／consentId／purpose 与政策版本 |
| 提交与处理 | jobId／receiptId／实际模型、上游及 endpointId／输入和输出 token／费用 micro-USD／审计状态／排队与处理毫秒／实际 POST 数 |
| 首次呈现与来源 | 预填数／可追溯数／核对提醒数及代码／高影响未处理时是否阻止确认 |
| 用户操作 | 保留／修改／移除／新增条目数／人工重录数及原因码／已处理提醒数／自评明确采用数／confirmationId |
| 结果与回收 | PASS、FAIL、BLOCKED 或 NOT RUN／差异或失败代码／删除任务 ID／清理状态／对象读回数／新增推理数 |

<div style="break-before: page"></div>

## 23　`jd-11`　边界 JD

预登记文本 SHA-256　`2a8e533613e4201c422e41773c70ded5773bebde13005dd50a5f33f88ea54efb`。现场状态　`NOT RUN`。

| 取证项 | 仅填实际结果 |
| --- | --- |
| 登记与允许 | runId／owner 代号／documentId／documentVersionId／textVersionId／generation／实测摘要匹配／consentId／purpose 与政策版本 |
| 提交与处理 | jobId／receiptId／实际模型、上游及 endpointId／输入和输出 token／费用 micro-USD／审计状态／排队与处理毫秒／实际 POST 数 |
| 首次呈现与来源 | 预填数／可追溯数／核对提醒数及代码／高影响未处理时是否阻止确认 |
| 用户操作 | 保留／修改／移除／新增条目数／人工重录数及原因码／已处理提醒数／自评明确采用数／confirmationId |
| 结果与回收 | PASS、FAIL、BLOCKED 或 NOT RUN／差异或失败代码／删除任务 ID／清理状态／对象读回数／新增推理数 |

<div style="break-before: page"></div>

## 24　`jd-12`　边界 JD

预登记文本 SHA-256　`b1c95010fca788ebfe7ff9aa51fc4526edc6603df080957b104994cf1d181ef1`。现场状态　`NOT RUN`。

| 取证项 | 仅填实际结果 |
| --- | --- |
| 登记与允许 | runId／owner 代号／documentId／documentVersionId／textVersionId／generation／实测摘要匹配／consentId／purpose 与政策版本 |
| 提交与处理 | jobId／receiptId／实际模型、上游及 endpointId／输入和输出 token／费用 micro-USD／审计状态／排队与处理毫秒／实际 POST 数 |
| 首次呈现与来源 | 预填数／可追溯数／核对提醒数及代码／高影响未处理时是否阻止确认 |
| 用户操作 | 保留／修改／移除／新增条目数／人工重录数及原因码／已处理提醒数／自评明确采用数／confirmationId |
| 结果与回收 | PASS、FAIL、BLOCKED 或 NOT RUN／差异或失败代码／删除任务 ID／清理状态／对象读回数／新增推理数 |
