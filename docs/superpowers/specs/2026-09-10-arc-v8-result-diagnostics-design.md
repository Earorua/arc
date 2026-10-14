# Arc v8 本地 Research 结果安全诊断设计

状态：**用户已于 2026-09-10 回复“确认”；本地实施与离线验收于 2026-09-11 完成。** 两项 TDD、各自规格后质量安全双审、root 566 项相关测试/类型/lint/build、最终独立整合审查均通过，证据见 `../../operations/v8-result-diagnostics-validation-2026-09-10.md`。本方案不是新的真实请求许可，既有七次推理许可已消耗，不重复请求已经批准的本地工作。

2026-09-10 草案自审及独立只读审阅 **READY，无 P1/P2 文档问题**。已核对失败来源区分、安全字段、观察失败隔离、原接受/计费合同及 Activity 推论边界；这是设计审阅，不是实现或代码验收。用户随后已确认，实施计划为 `../plans/2026-09-10-arc-v8-result-diagnostics.md`；已完成的 Kimi 预算/超时方案不重做。

## 问题与完成条件

第七次真实 Research 在 108876 ms 后返回 HTTP 200，但本地 Failed / invalid-result，usage null；用户提供的主请求 Activity 也没有正常结束标记。当前摘要无法定位解析、候选质量或仓储拒绝。四项合成对照已证实信息丢失；实际响应已不可恢复，详见 `../../operations/v8-kimi-invalid-result-2026-09-10.md`。

目标是在未来本地运行的安全 Summary 中，区分已解析响应拒绝、候选验证拒绝及缺失/无效 usage 字段。成功标准是合成分支可准确区分，所有原接受/拒绝/预算结果保持相同，且恶意响应中的任意字符串都不会进入新增诊断。

## 可选路径与建议

1. **推荐：固定枚举诊断 + 既有本地审计投影。** 补齐已复现的信息缺口，以零外网 TDD 验证后再决定下一次实测。不会恢复本次原始响应，但能避免再次只有一个泛化错误码。
2. 仅继续核对 Activity/等待客服：没有代码改动，可辅助查完成状态和费用；无法指出本地 Schema/citation 拒绝点。
3. 立即更换模型、放宽限制或扩大等待：本次证据不支持某个具体参数修正；会引入新费用或错误接受风险，暂不采用。

## 范围与结构

保持 Kimi low / 600000 / 660000 / 720000、请求 body、12k max_tokens、搜索与隐私约束、unused-key 预检、单次请求和零 Repair。保持生产 factory、公开 API、orchestrator、repository、预算/schema、启动器和 runner 行为。原始 Summary 不补写、不迁移。

新增诊断只接入 `createKimiLocalValidationProvider` 和本地 `validation.ts`；共享私有执行器仍是同一个，标准 `OpenRouterResearchProvider` 不暴露/接入新回调。共享解析器加入可选观察参数，未提供时不构造新增诊断，不重做响应读取。

本地 Summary 新增三个字段，初始均为 null；保留现有 failureCategory、quality、usage 和计费字段语义：

### 1. providerResultDiagnostic：已解析响应的拒绝环节

在现有有界读取、UTF-8 解码及 JSON.parse 得到外层普通对象后，沿实际接受/拒绝分支生成全新安全值，通过只在本地工厂使用的回调接收；外层读取/解析失败仍为 null，由现有 failureCategory 表示。不得复制外层响应或从另一条路径重解析。

- `outcome`：accepted / rejected。
- `reason`：null / choices-invalid / finish-not-stop / content-invalid / annotations-invalid / upstream-error / provider-error / filtered；accepted 必须为 null，rejected 必须非 null。在实际拒绝点赋值，不能凭其他统计字段猜测。
- `finishReasonState`：recognized / missing / invalid / unrecognized / unavailable。仅当 choices 长度恰为 1 且该成员是普通对象时投影其 finish_reason；否则 unavailable。缺省或 null 为 missing，非字符串 invalid，不在白名单的字符串 unrecognized。
- `finishReason`：stop / length / tool_calls / content_filter / error / null；只有 recognized 时保留枚举值。暂不收集 native_finish_reason（自由字符串不是当前决定接受的字段）。
- `usageIssueCodes`：固定白名单，排序、去重、最多 7 项：usage-shape / prompt-tokens / completion-tokens / total-tokens / token-total-mismatch / cost / web-search-requests。缺省、null、数组或非对象 usage 只输出 usage-shape；usage 为对象时分别按当前 authoritative token、creditsToMicros、搜索字段约束判断。只有三个 token 本身都合法且总和不等时标 token-total-mismatch。有效聚合为空数组，不从缺失值推导零。

reason 为 provider-error 对应 finish_reason:error；filtered 对应当前 content_filter/refusal 分支；upstream-error 对应现有非 200、top-level、choice 错误。保留原 researchFailureDiagnostic，两个字段描述不同事实。HTTP 非 200 只有已成功解析外层对象时才可生成本字段。

只投影固定枚举，不输出部分费用或原始 token 值；原 usage 仍是完整验证后才可用的唯一结算依据。验证标准复用当前解析逻辑，不能再写一份宽松的费用转换。可在同一内部 usage 解析函数返回 `{usage, issueCodes}`，但前后 usage/charged 结果必须完全相同。

回调同步抛错或返回 rejected Promise 都不得改变原返回、异常分类、时限、计费或调用次数；新建值不含响应对象引用。观察代码本身异常时忽略该诊断，不用它控制业务成功或失败。

### 2. researchAttemptDiagnostic：已有审计结果

在已有的 `audits.readResearchAttempt(OWNER, requestId)` 结果中投影 status（accepted/rejected/failed）、errorCode 和 charged（true/false/unknown）。errorCode 仅允许现有审计白名单 repair-required / invalid-result / missing-key / timeout / rate / balance / unavailable / filtered / invalid-transport 或 null。完整对象再经严格 schema 检查，缺失/无效则保持 null。

不复制审计 model、身份、输入、版本或任意错误消息。charged 为既有保守审计判断，不是新增收费证明或实际金额。

### 3. researchRunDiagnostic：临时运行的内部错误与质量

调用既有 `repository.getRun(OWNER, run.id)`，在内存数据库关闭前取得记录；只保留 `errorCode` 和 nullable `quality`。errorCode 白名单为当前 Provider 错误集合、invalid-result、result-too-large、null，其他值安全映射为 unrecognized，绝不复制任意字符串。

quality 必须先通过现有 `researchQualityReportSchema`；之后仅投影 passed、issueCodes、skillCount/sourceCount/unitCount（当前上限 64/256/512），不输出日期或 candidate/package 内容。没有质量报告保持 null；不能将 null 替换成“质量合格”或伪造问题代码。

这个额外只读观察独立 try/catch；读取或投影失败仅使新诊断为 null，不改变原 Summary outcome/计费/激活/规划或 finally 销毁。原有审计读取路径不因本方案增加一次外部请求或额外写入。

## 文件边界

- 新增一个服务器侧纯诊断 helper，包含固定投影与 schema，不访问环境、网络或文件。
- 修改 `app/server/research/openrouter-provider.ts` 的私有观察接线及本地工厂参数；不改变标准类公开参数或 wire body。
- 修改 `scripts/live-research/validation.ts` 的三个安全字段/只读投影。
- 增加对应 Vitest 纯单元和真实本地 Adapter/SQLite 合成回归，必要时更新已有完整 Summary 断言。若仅投影额外字段，runner 的通用 JSON 输出无需修改。

## TDD、审查与验收

按两项顺序实施：Provider 固定枚举观察；本地审计/内部质量投影。每项先 RED、最小实现 GREEN，独立规格审查通过后再质量/安全审查。Root 做相关整合验证；不重做已完成 Tasks 1–12，也不以合成结果声称真实问题已修复。

必要测试：

- 相同缺失 usage 下，length/null finish、无效 content、无效 annotations 与 candidate `{}` 分别给出准确来源；候选拒绝保留内部 invalid-schema，而非只给空公开质量。
- 正常候选、只缺 usage、普通 Needs-review、HTTP/choice error、边界 malformed JSON 仍得到原来的 run/usage/settlement/计数结果；超大最终包错误码可通过有界合成仓储读投影验证，无须构造超大真实响应或提高限制。
- usage 所有现有 missing/type/range/total-inconsistency 场景，新 issue codes 精确且不改变当前 usage null/有效对象或 charged 判断。
- 未知 finish/error 字符串、Key-like/canary 文本、URL/标题/正文、嵌套 metadata 均不能出现在新增字段；回调 throw/rejected Promise、额外观察读取失败仍保持原业务结果。
- 固定 profile、请求 body、零 Repair、调用次数、owner 隔离、finally 清理；标准 Adapter 无新诊断接线/参数变化。所有 tests 的 fetch 为注入合成函数，实际外网必须为零。

实现完成后运行相关 Provider/validation/计费回归、非增量类型和定向 lint；若运行时模块改动触及构建则执行既有 build。记录新鲜证据和指纹，旧真实摘要不变。

## 权限与后续

本草案只请求本地诊断实现与离线验证。没有新增真实 Key/Provider 请求、自动 Repair/重试、生产变量/旗标/D1/R2/Sites 版本或部署，也不申请 Git 提交/推送/合并。首次公开发布的持续目标保持不变。

本次真实响应无法追补。实施通过后，以有明确新许可的下一次请求取得更精确证据，或结合用户自愿提供的最小 Activity/客服资料确定后续修复；不得先改接受标准让不完整结果通过。
