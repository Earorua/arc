# Arc v8 候选字段与搜索计数安全诊断

状态：**2026-09-11 用户已明确回复“批准”，进入本地实施；不包含新的付费请求。** 不再重复索取本方案批准；其后关于 Completion 标签的提问是并行协助，不撤销批准。

实施完成：2026-09-11 两项 TDD、先规格后质量安全双审及最终独立整合审查均 READY。Root 635 项相关测试、非增量类型、定向 lint/build、25 项指纹核对通过；本地诊断验收完成，真实 Research 未因此通过。证据见 `../../operations/v8-candidate-field-diagnostics-validation-2026-09-11.md`。

2026-09-11 root 自审及独立只读设计审查 READY，无 P1/P2/P3。已核对真正解析入口、行为保持、路径白名单与回调隔离、搜索形状和许可边界；此为方案审查，不是实现验收。未提交 Git。

## 为什么需要这一项

第八次 Kimi Research 已收到完整 HTTP 200 / stop，耗时 196252 ms，但内部 invalid-schema、三个计数为 0；usage 只有 web-search-requests 不合法。既有三层诊断已经区分 wire 接受和候选拒绝，尚未区分内层 JSON、复杂度边界和具体 Schema 字段。证据见 `../../operations/v8-kimi-schema-result-2026-09-11.md`。

独立只读对照确认请求 JSON Schema 由同一个 Zod 契约生成；缺 evidence、字符串 weeks、JSON 语法错误均可复现相同摘要。trim 与 Unicode 长度还存在可复现的边界差异，但没有证据表明真实响应命中它们。本项不根据这些假设更改接受标准。

用户意图、次数和预算已明确：继续首版发布，避免无诊断价值的重复付费；八次旧许可消耗，不申请第九次，不启用 Repair。下述本地零外网工作及子代理/TDD/双审流程均已获准。

## 路径比较

1. **推荐：在实际候选解析入口报告有限字段诊断，另区分搜索计数字段的缺失/类型/范围。** 合成输入即可验证，不调整任何接受或收费标准；之后若用户能取得已有输出，先离线重放。若无法取得，诊断本身不能恢复历史正文，也不能被当成真实修复。
2. 直接更换服务商、提示词或模型：可能改变输出，但目前不知道具体拒绝点，需额外请求且难判断改善来源。暂不采用。
3. 保存完整响应或自动修复：会扩大数据留存或改变已批准的一次请求流程。暂不采用。

## 候选诊断的唯一入口

保持现有 `orchestrator.produce` 的顺序：`extractJson(content)` → `candidateFromContent` → `validateResearchCandidate`。在这次真正的 `candidateFromContent` 调用传入可选观察回调，回调仅由本地 validation 注入。不要在 Adapter 首次解析未去除 fence 的 content 时替代该诊断；合法 fenced JSON 必须与当前行为一致。

`candidateFromContent` 继续返回相同 `ResearchCandidate | null`。诊断在实际 JSON.parse、既有边界检查、同一次 Zod safeParse 的结果分支产生，不另外解析一份输入，也不提前 trim、补字段、数值转换、剥离额外属性或机械修复。所有已有调用默认无观察器；不提供观察器时不构造字段诊断。标准 production factory 不接入回调，公共 API/数据库契约不扩展。

本地 Summary 新增 nullable `researchCandidateDiagnostic`：

- `outcome`: accepted / rejected。
- `reason`: null / content-limit / json-syntax / node-limit / depth-limit / string-limit / array-limit / object-limit / schema-rejected。accepted 对应 null。
- `issues`: 最多 16 项去重的 `{path, code}`；只有 schema-rejected 可非空。
- `truncated`: 是否省略了其余合法投影的问题项，boolean。

路径只能由当前候选 Schema 的已知属性和数组通配符组成，例如 `unitTemplates[].steps[].minutes`；不保留实际数组下标。未知属性只能退回最近的已知 Schema 父路径（根为 `$`），不能复制动态属性名、Zod `keys`、错误 message、expected/received 值或字段内容。实现时从可信 Schema 结构生成完整路径白名单，输出必须再次属于白名单；排序去重后截到 16 项，未知问题码映射为 `other`。

code 白名单为 invalid-type / invalid-value / invalid-format / too-small / too-big / unrecognized-keys / other。这几个固定词足以区分字段类型、枚举/格式、长度/范围及额外属性，不复刻 Zod 的原始错误对象。JSON 语法和复杂度失败只报告阶段，不报告正文片段、错误偏移、任意字符串或实际内容。

观察器同步抛错、返回 rejected Promise、诊断投影异常都不得改变原 candidate 返回、Research 终态、计费、调用次数或清理。没有观察到解析（例如 Key/HTTP 失败、缓存直接返回）保持 null；不能假装是 schema-rejected。本地 wrapper 接收字段后再次做严格安全 schema 检查，只复制安全新值。

## 搜索次数的形状诊断

在现有 `providerResultDiagnostic` 中增加 `webSearchUsage`，只描述形状、不输出值：

- `container`: unavailable / missing / null / object / invalid。unavailable 表示 usage 本身不是对象；其余描述 usage.server_tool_use。
- `requests`: unavailable / missing / null / non-number / non-finite / non-integer / out-of-range / valid。只有 container=object 时才可能不是 unavailable；范围复用现有 0..10 校验。

这两个枚举区分“没有返回字段”和“字段存在但不合法”。现有五个 Provider 诊断字段保持相同语义；原 usage 对象、creditsToMicros 转换、usageIssueCodes 和预算结算完全不变。缺省值不补成 0，不将引用/结果数转换为搜索次数，不输出部分 token/费用冒充完整结算。

## 文件与执行边界

- `app/server/research/provider.ts`：既有解析器增加可选安全观察器，保持所有原限制与返回。
- `app/server/research/orchestrator.ts`：仅新增可选依赖并在实际首次解析调用传入；不改变规范化、Repair、时限、状态 CAS、包验证和结算。
- `app/server/research/result-diagnostic.ts`：白名单类型/投影及搜索次数形状。
- `app/server/research/openrouter-provider.ts`：沿既有本地结果观察器传递新增枚举；标准类不增加观察接线。
- `scripts/live-research/validation.ts`：仅本地注入、复制新字段，默认离线流程可观察。
- 新增/调整相关测试与本地证据文档。profile、launcher、runner、生产 service-factory、包/来源验证器、D1/R2 schema 与预算契约不修改。

已有 Summary 原文件保持原字节。只用合成 fixture 进行本轮验证。若用户能取得本次模型正文，再由用户明确选择交付方式并做本地内存重放；本设计不添加会读取剪贴板、扫描日志、恢复响应或索取 Key 的自动流程。官方说明正文位于 Logs 的 Completion，且仅保存启用 Input & Output Logging 后的请求；现在开启不会补回本次，本轮不更改这个设置。若正文不可取得，则记录限制，不能为取得正文自动调用 Provider。

## TDD 与验收

两项顺序工作：先候选解析入口与本地投影，后搜索次数形状；每项先 RED/GREEN，再独立规格审查及质量/安全审查，最后 root 整合。

必要覆盖：

- golden Ready；合法 fence 仍 Ready；JSON 语法错误；节点/深度/字符串/数组/对象边界；缺 evidence、字符串 weeks、枚举/长度/未知属性，阶段与路径准确。
- 可复现 trim/Unicode 边界只用于定位对照，不改变原返回。
- 嵌套未知属性、Key-like canary、URL/标题/正文、模型提供的数字下标和原始 Zod message/keys 均不进入诊断；多于 16 项的截断、排序、去重和未知问题码可预测。
- 回调 throw/rejected Promise、投影异常、无回调、没有解析机会时，原候选/质量/计费/规划/销毁结果不变；测试额外观察不触发 Repair、第二次 POST 或真实网络。
- search 容器/字段全部形状、负数/小数/非有限/超范围与合法边界；原 usageIssueCodes 与接受/持留完全不变。
- 固定请求 body/模型/low/600/660/720、标准 factory 未接入、owner 隔离和 finally 销毁。

最终运行相关 Provider、orchestrator、validation、预算回归及非增量类型、定向 lint、既有 build；记录实际证据和新源码指纹。禁止把离线通过记为真实 Research 通过。后续是否改提示词、模型兼容或计费策略，由具体字段证据单独决定。

## 许可范围

本方案仅本地诊断实现和零外网验收，不包含真实密钥、新 Provider/搜索请求、Repair/重试、生产变量/旗标/D1/R2、Git 提交/推送/合并或 Sites 保存/部署。首版完整公开发布持续目标保留，当前 Research 关闭的公共版本不变。
