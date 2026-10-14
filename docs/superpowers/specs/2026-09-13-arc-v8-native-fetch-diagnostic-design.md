# Arc v8 本地原生 fetch 失败分类设计

2026-09-13，用户已明确批准本地设计；347项恢复指纹一致，实施计划已写，Task1按TDD启动。第十六次许可已消耗，没有第十七次、Repair、重试、Git或生产/Sites写入许可。

## 问题与目标

第十六次Key200，Research在32899ms后发生响应头前fetch-error，未取得HTTP状态、正文或可信费用。原始异常没有保存。已确认的代码缺口是createGuardedTransport在Provider观察器之前把原生fetch异常替换为统一SafeValidationError，因此下游nativeErrorKind other失去了原生分类意义。现有合成测试也覆盖这一行为。它解释诊断为何不足，未证明本次网络失败原因。

目标是在这个明确边界补充固定错误类别，帮助后续决定连接修复，保持统一安全异常、请求策略和费用规则。不能把本地诊断通过称为Provider修复。

## 方案选择

1. **建议：在本地guard替换异常之前采集独立有限分类。** 私有Summary新增一个小型诊断字段；不改变Provider、transport-v1/v2/v3、公开接口或既有异常。代价是Summary中保留两个不同观察层，需要明确其含义。
2. 将原生异常或cause透传给Provider。接入较短，但扩大敏感异常传播范围，改变既有安全边界，不采用。
3. 只等Activity/客服或重复尝试。Activity可补充远端状态和费用，但不能补回已被丢弃的本地异常；重新付费也可能再次只得到other，不作为当前下一步。

## 范围与接入

仅修改scripts/live-research下的本地验证代码和相关测试，新增fetch-diagnostic.ts纯分类/投影模块；不修改app生产代码、native dispatcher、run.ps1、模型、请求体、超时、代理、TLS校验或其他网络行为。

createGuardedTransport增加可选onResearchFetchDiagnostic。只在已通过现有全部allowlist/凭证/计数检查、调用注入fetch且该fetch拒绝或同步抛错的POST分支调用，位置在原SafeValidationError替换之前。Key GET、调用fetch之前的guard拒绝、已返回Response后被guard拒绝的重定向、读取响应体失败和成功路径均不调用。redirect:error也可能使底层fetch直接拒绝；这种情况属于本观察边界，不能为了识别它读取原始message或任意cause文本，无法按固定码分类时为other。调用上限由现有单次POST guard保证，不添加新的网络请求或计时器。

观察器未提供时完全不检查原异常。提供时同步进行有限分类和投影，然后以既有非await观察方式调用；同步抛错、异步拒绝、永不settle、分类/投影失败均不得改变原异常code/name、重试属性、等待、计数或清理。分类失败时最多产生other；投影失败则丢弃观察。原生异常不附加到SafeValidationError，也不进入观察器、Summary或持久状态。

runValidation仅在executeOne=true的本地guard上注入观察器，并在回调内再次严格投影。ValidationSummary新增researchNativeFetchDiagnostic，默认null；其他模式、未执行和没有该边界失败的路径保持null。由响应头前guard-wrapped异常直接结束Provider的失败，旧researchTransportDiagnostic仍是fetch-error/other；新字段独立描述guard之前的固定类别，不覆盖旧字段或改写业务结果。若deadline先结束Provider，保留原来的deadline诊断；截止前捕获的abort也只描述错误族，不将它解释成触发deadline的原始根因。

观察窗口随本次验证结束关闭：transport.clear()除现有清Key行为外关闭本观察并释放回调引用；关闭后发生的底层fetch拒绝只走原SafeValidationError处理，不再分类或通知。runValidation在finally入口先关闭Summary接收标志，回调在投影前检查该标志，之后继续原计数快照、clear和数据库清理。Provider deadline的Promise.race可能先结束，底层fetch稍后才拒绝；不得因此在runValidation返回后改变Summary，也不得延长等待来收集晚到错误。窗口关闭后不再重新打开，不影响原有guard计数或拒绝规则。

## 有限分类契约

对象严格包含version="native-fetch-diagnostic-v1"和kind两个自身可枚举数据字段。kind只允许下面固定值，没有原始code、名称、message、stack、cause、地址、主机、路径、Key、headers、正文或其他元数据。

| kind | 精确匹配的错误code |
| --- | --- |
| connect-timeout | UND_ERR_CONNECT_TIMEOUT |
| headers-timeout | UND_ERR_HEADERS_TIMEOUT |
| body-timeout | UND_ERR_BODY_TIMEOUT |
| socket | UND_ERR_SOCKET、ECONNRESET、ECONNREFUSED、EPIPE、ENETUNREACH、EHOSTUNREACH |
| dns | ENOTFOUND、EAI_AGAIN |
| tls | ERR_TLS_CERT_ALTNAME_INVALID、CERT_HAS_EXPIRED、CERT_NOT_YET_VALID、DEPTH_ZERO_SELF_SIGNED_CERT、SELF_SIGNED_CERT_IN_CHAIN、UNABLE_TO_VERIFY_LEAF_SIGNATURE、UNABLE_TO_GET_ISSUER_CERT_LOCALLY、ERR_TLS_HANDSHAKE_TIMEOUT |
| abort | ABORT_ERR、UND_ERR_ABORT；或下述安全AbortError名称识别 |
| system-timeout | ETIMEDOUT；不把这个含义较宽的超时码归为确定连接超时 |
| other | 其余、无法安全分类或反射操作失败 |

只检查直接对象，随后最多一个自身数据cause对象。直接对象识别成功优先，不递归cause.cause，不遍历AggregateError.errors、数组、原型或其他属性。读取code/name/cause使用自身数据属性描述符，不调用getter、不强转字符串、不调用toJSON/toString、不用动态code前缀匹配。数组作为当前错误或cause都忽略。真实DOMException AbortError使用现有分类器同等的原生name getter识别方式，其他对象只接受自身数据name严格等于AbortError。反射/品牌检查异常安全回落other。

类别只说明匹配的错误族，不证明请求未发送、服务商取消或费用为零；socket不是“必定连接重置”，system-timeout不是“必定建立连接超时”。未覆盖的新错误或更深结构保留other，不扩大日志范围。官方错误码背景见[Undici Errors](https://github.com/nodejs/undici/blob/main/docs/docs/api/Errors.md)、[Node Errors](https://nodejs.org/api/errors.html)。

严格投影仅允许Object.prototype的普通对象、恰好两个规定字段；拒绝额外字段、symbol、accessor、自定义/null原型、非法值及反射异常。不调用getter/toJSON。返回独立冻结对象，序列化上限256 UTF-8字节；不能将输入对象引用留在Summary。

## 保持条件与验收

Kimi K3 low/32768、10搜索50结果、USD5、Provider/租约/启动器20/21/22分钟保持。Key处理、一次GET/POST、Repair0、无自动重试、重定向拒绝、出站allowlist和默认离线0真实请求保持。所有正式JSON/引用/候选/课程质量接受规则、unknown费用保留、owner隔离、第二次拒绝和数据库销毁保持。不往应用API、客户端、D1/R2或运行审计写入新字段。

批准后先写实施计划，继续已批准子代理驱动、TDD、每任务SPEC后QUALITY/安全审查：

- Task1：纯分类/投影模块和guard可选观察。RED使用底层fetch拒绝证明当前分类丢失；覆盖固定码、直接/单层cause优先、深层/聚合不遍历、getter/Proxy/哨兵、观察器关闭及throw/reject/pending、原SafeValidationError不变；验证Key失败、调用前guard拒绝、返回Response后的redirect拒绝、成功不产生本观察；底层fetch因redirect:error拒绝则安全归other。clear后延迟fetch拒绝不再分类或通知。
- Task2：私有Summary接入及真实guard→Provider→runValidation合成集成，覆盖已识别socket/headers超时和新增连接/DNS/TLS类别；证明旧v3及业务结果不变，unknown/预算保留、实际临时SQLite持久状态和清理相同，失败投影不泄漏。验证provider直接注入成功不能替代guard边界测试；默认离线/Key-only/成功/响应体失败为null。用受控Promise和虚拟时间验证deadline先返回、fetch在Summary返回后才拒绝时Summary逐字段及数据库清理状态不变，没有未处理拒绝或新的等待。
- Root：按修改范围运行相关回归、非增量类型检查和定向lint、项目要求的本地build与默认零真实请求终端演练，完成最终独立质量/安全审查。测试是合成验证，不是重放第十六次原异常或成功真实Research。

当前113项源码、108项构建及第十六次Summary保持为实施前证据。旧333项授权交接是状态更新前的历史快照，后续状态文档变化需明确，不冒充所有文件仍与旧清单一致。

## 后续边界

本设计批准只包含本地实现和离线验收，不包含再次付费或部署。实际失败类别仍需未来已获许可的请求或用户Activity补充；不能据此假定下一次会通过。线上长任务方案、真实登录、持久化及公开发布门槛继续按既有计划处理，不以诊断建设替代发布验收。

Root自审：明确了观察边界、固定分类、双重投影、非干扰、已有安全异常保留及测试范围；没有未决实现占位项。独立native_fetch_design_review初审发现两项P2：重定向路径定义及晚到拒绝修改Summary；均已明确修订并复审关闭，最终READY、无新增阻碍。此结论是设计审查，不是实现或运行测试。获用户批准后从writing-plans继续，未批准前不写实施代码；按用户边界不提交Git。
