# Arc V8 replay acknowledgement ordering — TEMPORAL-001

状态：仅本地设计。当前应用、测试、候选构建和云资源仍冻结；本文没有执行修复或部署。既有推进授权已足够确定方向，不再增加通用设计许可环节。Root 明确解除应用冻结后才执行配套计划。

## 已核实的原因

`acceptedAt` 在 replay 契约中一直表示原始 `workflowAcceptedAt`，不是 executor 初次插入的 `accepted_at`。`worker/research-executor/bootstrap.ts:25–51` 先持久化 job，再等待 `create`；若响应丢失，则通过 `get` 和 `status` 确认已有实例，最后持久化首次 Workflow 确认时间。`worker/research-executor/execute-job.ts:23–57` 可在此之前调用真实 Site begin、记录 grant 并 claim dispatch。`tests/server/research-executor-job-store.test.ts:495–513` 已覆盖先 begin/claim 后 ack 及首次 ack 不变的生产存储语义。

当前 long 的实际时间为：初次 job accepted `1791215252066`，begin `1791215256085`，dispatch `1791215256504`，Workflow ack `1791215267920`，expiry `1791216516085`。ack 比 begin 晚 11,835ms；grant 仍是 1,260,000ms。原始来源及哈希见 `outputs/local-durable-executor-20260914/task15-smoke/cloud-ops-20261005-replay/long-followup-preparation-r1/temporal-diagnosis/temporal-diagnosis.md` 和同目录 `source-hashes.json`。这些记录不能证明实际走了 create 返回还是 get/status 恢复分支；回归分别覆盖两条合法路径。

`replay-contract.ts:26,52` 的两条 `acceptedAt <= beganAt` 比较因此错误。`replay-admission.ts:109–130` 和 `replay.ts:71` 则正确地绑定并返回真实首次 ack；无需修改它们。

## 选择与边界

采用最小修复：只从 approval 与 bridge reply 的 refinement 删除上述两条比较，并注明 ack 是确认观察时间。生产存储、字段名、字段含义、原始时间、协议版本均不变。

不采用更名/增加时间字段：它需要协议及持久化迁移，对本缺陷没有必要。不采用时间钳制、用初次 accepted 替换 ack、改 SQL 时间或延长 TTL：这些会破坏原始身份/证据，且与既有 proof equality 冲突。

保留全部 strict schema、安全非负整数时间、固定 scenario/job、hash、inventory/native-evidence 绑定及 roster 唯一性/大小限制。approval 继续检查 `beganAt < executionExpiresAt` 与生产 `validGrant`；reply 继续检查 `beganAt < queueExpiresAt` 与 `validGrant`。生产 grant parser 仍要求 expiry 精确等于 begin + active TTL。admission 继续检查 job.createdAt 下界、原始 accepted proof、grant、receipt metadata、run/package 身份、owner、Ready/phase5、未到期 package、quota/budget/audit 精确结算。不得补入 ack-before-expiry/queue 一类没有源依据的替代上界。

## 最小验证设计

只改三个文件：契约、现有 paired fixture、现有 replay 测试。fixture 增加一个消费一次的 create 响应钩子和本地 Workflow 调用轨迹；默认行为不变，不创建新测试基础设施。钩子在实例已注册但 create 尚未返回时，调用已有 `runWorkflow`，以真实生产 bootstrap/store/execute/Site begin 路径产生 begin/claim/result；测试只前进 fixture 的 Date 时钟，再允许 create 返回，或模拟已创建后的响应丢失。后者必须实际经过 get/status。

两个参数化接入回归复用同一代码：保存 ack 前真实状态；确认 `workflow_accepted_at` 尚空而 dispatch 已 claimed；完成独立 Cron import；用真实时间构造 roster；完成六个签名 replay；验证原始时间/身份和单次业务效果不变、Provider1/Repair0/Workflow1、错误 owner 不可见。再验证晚 ack 的 roster 不能容忍一毫秒的错误 proof。全程不通过 UPDATE/SQL 改时间制造通过。解析器小测试覆盖 ack 早于/等于/晚于 begin，保留坏 grant/queue 边界拒绝。

一次 TDD → SPEC → 不同 QUALITY 足够。既有广泛拒绝/TTL/owner/settlement 测试复用，不复制矩阵或新增审批循环。

## 证据归属

原候选 report SHA 为 `27f727f41702241f3a58868450a74930b186cc28443978db8b49e86df82e15b2`，原 inventory SHA 为 `54817a776ef12054378cabe59669539fbc5fa45b0b43780349a9fdba5effe2ad`，executor artifact SHA 必须保持 `24a9436527b943f9f37c41404160b311e4eec32a3c906deeb71a0fc18cee9918`。

`root-final-native-long-verification-r1.json` 已确认原候选 long native completion/elapsed、audit 与独立 R2 tombstone；该记录仍保留 signed status 和 replay pending，不能当作完整 Task15 通过。Root 正准备的 faults 继续记在其实际执行候选下。先完成原冻结候选的原定状态/fault 观察，再解除源码冻结，避免旧 driver 的 source-hash 校验因源码变更而失效。

修复后使用独立命名的 Site successor artifact/report、真实部署读回和 successor inventory；原 anchor/report/运行数据不改。companion transition 记录原、新 digest 链和各场景归属，strict inventory 不擅自增加字段。新的六步 replay 是“修正 Site 对原不可变结果的回放”证据；不能把旧 long/fault elapsed 重新标记为整个新候选全程云验证。若要求同一新候选从执行到 replay 全部通过，或原 package 已到期，应使用另行明确的全新隔离 run，不能续命/重启现有固定身份。
