# Arc v8 长响应失败的安全传输观测

状态：Root自审与独立设计复核READY后，用户已明确“批准”，本地实施开始，不重复询问此批准。第十一次真实许可已消耗，没有新的付费请求、Repair、生产或发布许可。具体证据见 `../../operations/v8-eleventh-transport-result-2026-09-11.md`；实施计划为 `../plans/2026-09-11-arc-v8-transport-observation.md`。

## 问题与目标

第十一次本地 Research 在 303101 ms 后记录 HTTP200 / invalid-transport / charged unknown；用户提供的同父请求四条 Activity 显示前三轮 tool_calls，第四轮生成307248 ms、cancelled true、finish/native finish null，输出10555 tokens、其中原生reasoning1966。模型和搜索实际运行，但没有完整客户端候选/用量。

源码和loopback对照表明，正文超限或UTF-8 chunk失败可以先本地拒收再取消；正常EOF后的JSON/外层形状错误则不执行相同清理取消。现有Summary没有这些阶段或计数。普通native body timeout映射unavailable，600秒应用deadline映射timeout，均不能直接解释本次invalid-transport。不能据此盲调五分钟时限或宣布传输问题已解决。

本设计的目标是离线证明下一次运行具备足够的安全观测，区分上述本地路径；它不能恢复第十一次未保存的正文，不能保证下一次真实Research成功。Activity的cancelled仍是远端记录，不能仅凭本地取消动作推导远端立即停止生成或计费。

## 方案比较

| 方案 | 收益 | 成本/限制 |
| --- | --- | --- |
| A：补充有限传输阶段、字节和取消观测（本轮建议） | 可以用合成响应验证；保留当前行为与质量边界，准确定位未知分支 | 只解决可观测性，不直接修复未知远端故障 |
| B：设计流式接收并接入持久化后台任务 | 更适合长生成；可为后续上线提供分段进度与终态保存 | 需新增SSE边界、心跳、usage/引用聚合、取消与持久化/租约设计；不能只把stream改true，且不能保证消除所有中间层时限 |
| C：更换端点、调大时限或正文限额后实测 | 某些已知性能/大小原因下可能有效 | 当前没有足够分支证据，增加费用且可能掩盖契约/安全问题，不作为下一步 |

先完成A的本地实现与TDD/双审，暂不安排第十二次付费请求。B是后续线上长任务设计的候选，须结合A结果明确选择；本轮不削减用户已选择的10次搜索/50结果，也不扩大预算或正文限额。

## 精确范围

1. 在独立模块 `app/server/research/transport-diagnostic.ts` 定义有限诊断类型、严格投影及上限常量。`createKimiLocalValidationProvider` 新增可选 `onTransportDiagnostic` 依赖，共享执行器只向显式注入的观察者报告。标准生产Provider不接入新观察者，公共HTTP响应、数据库、UI和日志均不新增字段。
2. 在 `scripts/live-research/validation.ts` 的安全Summary新增 `researchTransportDiagnostic`，默认null。只由显式本地Kimi观察者写入严格投影的不可变快照。另新增 `researchStartedAt` UTC时间字符串，紧邻adapter调用前设置，与已有performance.now计时起点配对；默认离线与未调用分支的值保持null。此时间不是远端开始/取消回执。
3. 只记录失败于接收响应、读取/解码正文、解析外层JSON及检查外层为对象之前的传输观察。对象进入既有 `readResponse` 后发生的语义校验继续由已有result/candidate诊断负责，不用传输字段伪装成已接受。成功/语义拒绝路径的新增传输诊断保持null。
4. 一次adapter执行最多发出一次传输诊断。读流Promise在deadline之后若又拒绝或返回，不得覆盖已发布观察或触发第二次回调。观察者同步抛错、返回拒绝Promise、投影失败都不能改变原返回值、错误码、charged/audit、清理动作或等待时限，也不得产生未处理的Promise rejection。不等待观察者完成，不由观察者发请求。
5. 在发送传输观察前明确记录本地清理动作是否执行；观察的取消原因是应用动作，不声称远端取消原因。保留当前仅在!complete时abort/cancel的语义；不得为获得日志而新增取消、延后取消或接受残缺响应。
6. 原生错误分类以adapter实际可见对象为界。本地真实路径的 `createGuardedTransport` 会将fetch异常及redirect替换为SafeValidationError，adapter无法还原原因；本轮不改变该guard、不跨层保留原始cause。这些实际接入路径明确记录fetch/fetch-error/nativeErrorKind other，headersElapsedMs为null，即使既有Summary的HTTP状态已在guard内取得。body的reader错误仍由adapter直接观察，可按白名单分类。直接注入adapter时可识别headers-timeout，不将该测试能力声称为真实guarded路径同样可观察。

## 固定诊断契约

所有字段都通过白名单投影；不含任何自由文本、响应/请求正文、URL、账户、Key、任意header值、异常message/stack或动态对象键。未知值丢弃/归类，不把错误对象序列化。

| 字段 | 可接受值与定义 |
| --- | --- |
| version | 固定 `transport-diagnostic-v1` |
| phase | `fetch`、`headers`、`body-read`、`utf8-chunk`、`utf8-flush`、`outer-json`、`outer-shape`；表示首个本地失败位置 |
| reason | `fetch-error`、`redirect`、`invalid-content-length`、`declared-body-too-large`、`missing-body`、`body-read-error`、`body-too-large`、`invalid-utf8`、`invalid-json`、`non-object`、`deadline`；phase与reason必须为实现明确列出的合法组合 |
| receivedBytes | 0..524289的整数；仅计reader返回的Uint8Array bytes，超过524288时投影饱和为524289，不保存正文。不是token数或远端已生成字节数 |
| bodyComplete | boolean；仅观察到reader.done才为true，不代表UTF-8/JSON/候选合法 |
| localCancellation | `none`、`deadline-abort`、`reject-response-body`、`reject-read-abort`；分别记录未主动取消、应用deadline调用abort、header拒绝调用body.cancel、读流未完成失败后调用abort/cancel。只在实际调用上述取消API时标记，调用helper但body为空不算；若deadline先触发，清理阶段不得改写为reject-read-abort。标记调用尝试，不保证远端收到或成功停止 |
| nativeErrorKind | null或`body-timeout`、`headers-timeout`、`socket`、`abort`、`other`；对adapter接收到的fetch/read错误作有限分类，adapter主动构造的传输拒绝为null；guard包装错误按范围6记other |
| headersElapsedMs | null或0..720000整数；adapter收到Response相对adapter开始的耗时；guard已取得但未向adapter交付Response时仍为null |
| bodyEndElapsedMs | null或0..720000整数；正文处理首次终止相对adapter开始的耗时：EOF、read rejection、字节超限、chunk UTF-8拒绝或读流deadline时记录。EOF后flush/JSON/外层形状失败仍保留EOF时刻，不改成解析结束时间 |
| localCancellationElapsedMs | null或0..720000整数；首次本地主动取消尝试相对adapter开始的耗时，none必须null |

phase/reason合法组合：fetch配fetch-error/deadline；headers配redirect/invalid-content-length/declared-body-too-large/missing-body；body-read配body-read-error/body-too-large/deadline；utf8-chunk或utf8-flush配invalid-utf8；outer-json配invalid-json；outer-shape配non-object。缺少或非法字段使诊断投影为null，不影响Research原结果。

nativeErrorKind映射只识别 `UND_ERR_BODY_TIMEOUT`、`UND_ERR_HEADERS_TIMEOUT`、`UND_ERR_SOCKET` 和 `AbortError`/`ABORT_ERR`，其余固定other。最多检查error自身和一层cause的已知属性，属性访问须保护，getter/Proxy抛错也不能改变原错误。不得递归搜集cause树、原样保留code/name，或记录错误中的秘密哨兵。

接收字节、EOF、相对计时和取消动作由执行路径内部产生，不能从Provider正文声明推导。计时有限、非负、整数并封顶；headers/body/local取消未发生时为null，默认值不能伪装为发生于0ms。不能为了补计时创建第二个deadline。

跨字段约束：outer-json/outer-shape/utf8-flush的bodyComplete必须true；body-too-large必须bodyComplete false且receivedBytes524289；尚未开始读流的失败bodyEndElapsedMs为null。localCancellationElapsedMs记录首次实际取消API调用时刻，单纯helper空操作为none/null。投影拒绝不满足这些约束的对象，不改变原错误。

## 保持的行为

- 请求仍为固定Kimi low、stream:false、12000 max_tokens、完整strict schema、现有隐私参数、最多10次搜索/50结果，Provider600/lease660/launcher720秒。
- 原始异常映射、public failure category、usage验证、USD5 conservative-hold/结算、候选/来源/教学质量及owner隔离不变；记录费用的Activity不能回填为可信成功usage。
- 零真实请求的测试与离线运行默认值不变；不修改Key预检、不读取env或真实Key、不记录模型正文。不新增依赖、SSE解码器、Provider路由、生产变量或部署。
- 原29项清单保留为实施前基线。实施将有意修改adapter/validation等文件，按明确任务记录新候选哈希；不覆盖第十一次及旧Summary，不把允许修改文件仍称为未变。

## 验收与任务划分

Task 1：失败阶段及清理顺序的内部观察。先RED复现当前破损JSON/超大正文等均无新诊断，随后实现可选观察和投影。覆盖fetch拒绝/redirect、非法或超大Content-Length、缺body、实际正文超限、chunk UTF-8与flush UTF-8失败、正常EOF后坏JSON、外层null/数组/标量、native body/headers timeout与socket错误、headers前/读流中应用deadline。使用注入Response/ReadableStream和短合成计时，不运行分钟级或真实Provider测试。

Task 1的重要断言：读取未完成的本地拒绝记录主动取消及正文处理终止时刻；正常EOF后解析失败不新增abort/cancel且保留EOF时刻；声明超限但body为空时helper不产生取消记录；deadline原因不被finally覆盖。验证上述跨字段约束、观察仅一次、字段有限、真实错误code/charged与原行为一致。覆盖回调throw/异步reject、恶意getter/cause、秘密哨兵不外泄；正确响应/语义拒绝路径仍沿既有验证，传输诊断null。

Task 2：本地Summary接入与整体验证。将transport投影接入固定Kimi观察者，记录UTC开始时间；覆盖合成故障下HTTP200、原invalid-result/unknown、保守预留、未激活/规划、一次Research、Repair0和数据库销毁仍正确；合成合法响应仍Ready/结算/规划。验证默认offline不发请求、不读env、新增字段默认null，已有Key诊断和result/candidate诊断不受影响。操作文档明确这是诊断能力通过，不是真实故障已修复。

Task 2必须经过实际createGuardedTransport覆盖fetch headers timeout、普通fetch failure及redirect；三者在当前guard后只能观察fetch-error/other，而非保留原生原因或redirect诊断。再通过同一guard返回HTTP200且reader抛出原生body timeout，确认该body错误仍可分类。对照Key预检继续沿旧诊断且不得发Research，不修改guard的拒绝或原始错误映射。

继续用户已批准的子代理驱动流程；每项先TDD，再独立规格审查，随后质量/安全审查，修正发现后完成Root相关回归、类型和定向lint。源码变更后执行项目要求的构建检查，但不做真实调用或部署。没有关联变更时不反复全量测试。

## 审阅与后续

Root设计自审：范围限于本地显式观察，不改变业务接受或付费次数；枚举、字节边界、时钟、清理顺序和回调故障均有可验证条件；避免把cancelled当取消发起方，避免把诊断改动称为根因修复。方案比较保留后续流式/后台任务路径，本轮不实施该架构。

独立设计审查首次发现1项P2与2项P3：guarded fetch已经丢失原生cause、正文主动拒绝的终止时刻定义、helper空调用与实际取消区分。均已在范围6、诊断契约/跨字段约束和真实guarded接入测试中具体修正；`eleventh_transport_audit`复核READY，三项关闭。随后按其非阻塞建议澄清nativeErrorKind中adapter主动拒绝与guard包装错误的区别。此为设计审查，不代表实现或真实故障修复。

用户审阅本文件并批准后编写实施计划；未批准前只完成设计和审查。此次无Git暂存/提交授权，设计保留在当前工作树，未按技能默认提交。后续实测仍需独立具体次数/预算许可，不能将本地设计批准当第十二次许可。
