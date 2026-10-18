# Arc v8 Task15 云端回放与账户隔离验收补充设计

日期：2026-09-21。状态：候选设计，等待独立审阅与用户确认；尚未实施。仅覆盖隔离 smoke Worker 的验收工具，不修改公开网站功能、生产 Research 策略、用户登录或生产数据。Workers Paid 升级已获用户授权，实际生效尚未核验；这一授权不等于本补充设计已通过审查。

## 问题与边界

原设计要求每个成功场景结束后，真实执行同一任务的签名 submit/status 回放，以及 owner A 找回、owner B 隔离检查。当前云端 start 在已有 observation 时直接返回；status 只做仓库级读取。它们没有调用完整 `ExecutorBridgeClient` / `RemoteResearchReader` 链，因此本地通过和原生 SELECT 都不能补足云端应用行为证据。

另外，现有控制请求受 4500ms 工作预算约束。`RemoteResearchReader.get/recover` 自带 4500ms 工作与 500ms 只读刷新阶段，且不接受外部 signal。把签名 submit/status 和四个 owner 读取塞入一个控制请求，会增加正常超时风险；不得扩大生产短请求预算来让验收通过。

已验收的 long 与 after-R2 证据继续保留。原 after-D1 ...0153 在 Free 上错过 Ready 发布截止，后续只能验证其合法超时收尾，不能把它改成成功。本设计的成功回放入口必须拒绝该未成功场景。升级后的补测资源选择、原任务收尾和 Cron 观察容量是独立操作设计；不能由新增回放入口创建替代任务、改期限或触发故障补测。

## 方案选择

| 方案 | 结论 |
| --- | --- |
| 固定签名回放入口，每次仅一个预定义步骤 | 推荐。复用现有 Site D1、私有服务绑定、生产客户端与 reader，保持短请求限制，可准确记录哪一步完成。 |
| 单请求执行完整六步 | 不采用。共享 4500ms 控制预算不足以稳定覆盖多个真实往返，部分成功后的超时也难以说明。 |
| 本机通过远程 SQL/手写 HTTP 代替应用调用 | 不采用。不能等价验证运行于 Worker 上的 production reader，也会扩大凭据和调试能力。 |

## 固定调用协议

新增仅 smoke Site 使用的 `POST /_smoke/replay`，沿用控制密钥 C、现有签名上下文、持久 nonce、固定 audience、请求与响应 4096 字节上限。不得更改生产认证协议。请求严格只含 `scenarioId` 和 `step`；二者都是编译期闭集，不接受 owner、run、job、URL、SQL、延时、正文或配置指纹。原 start/status 仍保持原有职责。

固定步骤如下；操作员驱动按表顺序各执行一次，每步独立签名，采用新的 nonce。服务器不会依靠客户端提供身份或证明值。

| step | 真实运行的既有方法 | 必须验证的结果 |
| --- | --- | --- |
| submit | 同一请求中先 `status(originalStoredJob)` 核对已有accepted/claimed/receipt，再 `submit(originalStoredJob)` | 同一 accepted proof、job/request identity 与 acceptedAt；不创建新 Workflow 或 Provider effect。任一预读缺失、错误或超时均不得提交。 |
| status | `ExecutorBridgeClient.status(originalStoredJob)` | 原 grant、receipt metadata/hash 不变；正文允许已按合法清理变成 removed。 |
| owner-a-recover | `RemoteResearchReader.recover(ownerA, originalStartSelection)` | 返回原 run 的 Ready public view；仅投影身份匹配布尔值与安全摘要。 |
| owner-a-get | `RemoteResearchReader.get(ownerA, originalRunId)` | 同一原 run、Ready；不返回 candidate/package 正文。 |
| owner-b-recover | 同一原 mutation/role/locale，以固定 ownerB 调用 recover | 返回 null。不能用新 mutation 或不存在的 job 让测试轻易通过。 |
| owner-b-get | 固定 ownerB 与 ownerA 的真实原 runId 调用 get | 返回 null。不得泄露对方 view、正文或原始数据库记录。 |

这六个动作均为已完成任务的重复调用，不重新 admission、dispatch 或重新生成结果。submit步骤的两次短bridge调用必须共用原4500ms预算；不能把此前另一个请求的预读当成提交时仍有效的证据。服务器不要求可重置的“步骤进度表”；每次重新验证先决条件，允许用户在含糊响应后保留同一任务调查。驱动遇到任何失败、拒绝或无法确认的响应立即停止，不自动重试或跳过步骤。

## 独立 Cron 证明与服务器准入

Site D1 无法自行证明 executor Cron 已独立完成，因此不能把 Ready 查询冒充 Cron 归因。采用两层前置条件：

1. **操作员证据批准记录。** Root 先通过只读原生 Workflow/D1/R2 与 Cron 证据完成独立验收，再生成一份具体、有限的成功场景批准表，作为 smoke Site 部署的普通配置。该表是操作员基于已审证据的声明，不是运行时重新验证远端原生日志。初始部署无批准表时入口拒绝；不得默认批准所有场景。
2. **每次请求即时核对。** 配置中的场景必须属于闭集；原 jobId、requestHash、receiptHash、run 身份摘要、acceptedAt、beganAt、executionExpiresAt 必须与 Site 持久记录精确匹配。要求 Ready、active slot 已释放、import phase5、正确 package、预算 settled 及单次 quota/package/audit 等效果。缺失、失败、仍运行或数量不符均在调用 submit/status/reader 之前拒绝。

批准表还固定当前隔离资源清单摘要和对应原生证明摘要；部署时核对实际 D1/服务绑定及配置。每个场景最多一项，最多三个既有场景，整个配置不超过4096字节；额外键、重复项、未知场景或不完整时间/hash均拒绝。资源清单摘要只作准确关联，不能替代真实绑定核验。它不含密钥、正文、账户邮箱或真实用户身份。

批准表不能凭空授予失败场景成功身份。原 ...0153 不加入成功列表。若在新的隔离资源集合重演同名场景，必须使用新的清单与该集合实际证据；旧清单的批准不得沿用。升级本身、历史通用 Cron ok 或客户端 ExitCode0 均不够成为批准依据。

## 构造、超时与副作用约束

- 独立 smoke 模块负责固定 replay 操作；不让现有 site-entry 承担越来越多验收实现。复用 production `D1ResearchRepository`、`D1SiteExecutionRepository`、`D1SiteBridgeRepository`、`createSiteBridgeOperations`、`ExecutorBridgeClient`、`BridgeTransport` 与 `RemoteResearchReader`。
- 每个请求建立现有 `PublicOperationScope`。每一项 D1 操作，包括请求/响应 nonce，都经 `createGuardedD1`。reader 提供的内部 guard 必须与外部 scope.ensure 组合；工厂创建、transport调用和异步后续操作也检查外部 guard，不能照搬本地 helper 的无操作 guard。
- reader 的只读刷新工厂仅有只读仓库能力，不注入 importer、nonce、executor 或 admission。legacy 分支在本固定 cloudflare-workflow fixture 中不可达；提供 fail-closed 实现，不能回退到同步 Research。
- 所有动作经 scope.run 的 thunk 调度；控制连接终止或范围超时后不再安排下一动作。直接client调用使用外部signal；reader创建的transport同时遵守reader传入的signal和外部signal，并在开始传输前检查组合guard。底层已发出的原生 SQL 仍可能完成，故超时结果记 unknown，而不是承诺绝无写入。不得为此延长4500/500ms预算。
- bridge仍只使用原私有executor服务绑定，沿用现有路径与签名校验。Site不得获得executor D1/R2绑定，不开放executor公网路由、不新增任意诊断/管理端点。
- 没有 Provider 凭据、全局 fetch 回退、真实模型或 paid retry。`submit` 只能取得已完成任务的相同幂等结果；应由真实计数和 Workflow 记录证明没有第二次执行。

## 回应、驱动与证据

回应仅包含严格版本、scenario、step、完成状态、安全身份/原期限/receipt 摘要和核对布尔值；owner-B 只回应是否为 null，绝不返回意外得到的 view。若非 null，作为失败记录，不泄露内容。拒绝回应保持现有统一 unavailable 形式。

Node 驱动新增 replay 模式，PowerShell 启动器允许该模式并继续隐藏读取 C。复用现有 inventory、artifact/source digest、私有绑定、响应签名及跨进程 nonce 校验。每个步骤一个短请求，保留各自开始/结束/结果及最后完成步骤；没有自动重试，没有 start/status兼容回退，没有每步新任务。所有流程结束或异常后清零本机 key byte buffer。

Root 在首步之前与全部步骤之后，使用原生只读查询比较同一集合的：job/request hash、原 grant/deadline、receipt hash、终态、Provider1/Repair0、单个run/package/import/audit、单次配额/预算效果。清理时间与 bodyState 可以出现生产保留策略允许的变化，其他不可变身份和计数不允许变化。该比较不是原子跨存储快照，须保留每次观测时间。原生证据与签名步骤回应共同证明结果，不能仅依据驱动accepted标志。

## 验收与交付边界

实施计划应覆盖：缺失/错误批准表、未独立批准或未settled场景的提前拒绝；未知step、额外owner/job字段、nonce回放、错误key/audience及超限；完整六步运行在实际构建的配对Worker中；A匹配/B为null；guard贯穿reader工作/刷新/response nonce；慢D1/bridge超时后的禁止续调；中途断连与含糊响应不自动重试；tombstone存在时status与owner读取稳定；生产构建不包含新smoke入口或配置。

执行顺序仍为 TDD → 类型检查与适当回归 → 独立规格审查 → 不同代理质量/安全审查 → 明确artifact/resource清单 → 云端调用。不得以此新增设计为理由重做已验收的生产功能。

本设计完成也不等于 Task15 或首版公开发布完成。原故障收尾、Paid下独立恢复成功、生产一致备份/隔离恢复、受保护部署、真实新许可Research、登录/学习Proof及发布整合仍需各自证据。本文未提交Git、未修改运行代码、未部署、未读取密钥或调用真实Provider。
