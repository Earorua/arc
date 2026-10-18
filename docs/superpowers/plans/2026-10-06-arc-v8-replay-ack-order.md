# Arc V8 Replay Acknowledgement Ordering Implementation Plan

**Root 执行补充（2026-10-09）：** 独立副本 Task1–2 完成，188 项 replay、既有首次 ack 回归及类型检查通过，SPEC_PASS 后不同 QUALITY READY。原 long 已结算且新终端 signed status ExitCode0；两个 fault 从未提交，旧启动命令已停用。云端 executor 已实际关闭准入和 Cron（版本 961b3e8f-cd32-4dcc-88f1-f235f60eeacd），排空核对仍待。本轮解除原树仅三个已审查文件的本地整合/Task3 构建冻结；新构建名为 task15-replay-ack-order-cloud-20261009-r1。部署仍必须先取得排空证据；观察表已达 256 容量，后续故障证明需明确处理证据连续性，不能删除旧记录或把未执行的 fault 写为通过。原报告及云端代码不变，以下旧冻结文字保留为历史计划。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 TEMPORAL-001，使 replay 接受原始 Workflow ack 晚于 begin 的合法证明，同时保留所有身份、grant、owner、TTL 和结算约束。

**Architecture:** 只删除 replay-contract 的两条错误时间比较。复用现有真实生产路径 fixture，以一个一次性 create 响应钩子覆盖正常延迟确认及响应丢失后的 get/status 确认；不改生产 executor、数据库时间或协议。

**Tech Stack:** TypeScript、Zod、Vitest、现有 SQLite D1/paired-binding fixture、现有 esbuild smoke 构建器。

---

**Root 执行补充（2026-10-06）：** 为在等待操作员故障演练输入期间继续开发，已创建独立分支 `codex/arc-v8-replay-ack-order`，目录 `C:/Users/XF/.codex/worktrees/arc-v8-replay-ack-order/v8-openrouter-research-beta`。仅在该副本解除 Task1–2 的本地源码/测试冻结；当前云端启动器所用原工作树、旧候选和现有证据全部保持冻结。副本从原 HEAD 加当前允许列表源码逐字节复制，清单见 `outputs/local-durable-executor-20261005/replay/isolated-ack-worktree-baseline.json`。副本的本地修复与独立审查可先行，构建、回写原树和云部署仍待原场景完成；这不改变以下修复范围或云端证据归属。

当前仅准备文档，**不可执行以下源码/测试/构建步骤，直到 Root 明确解除应用冻结**。既有推进授权和既定 TDD → SPEC → 不同 QUALITY 流程沿用，不再询问通用实现选择。本计划不 stage/commit，不部署，不改变当前 faults 工作。

工作目录：`C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta`。所有命令均从该目录运行。设计见 `docs/superpowers/specs/2026-10-06-arc-v8-replay-ack-order-design.md`。

## 文件与只读依据

| 文件 | 变化 |
| --- | --- |
| `worker/research-executor-smoke/replay-contract.ts:22–54` | 两处 refinement 删除 ack-before-begin；一条语义注释 |
| `tests/helpers/research-cloud-smoke-fixture.ts:519–538,641` | 一次性 create 响应钩子与调用轨迹，默认路径不变 |
| `tests/server/research-cloud-smoke-replay.test.ts:120–131,220` | 小型解析器边界、两条真实接入回归；复用既有 helpers/cleanup |
| `worker/research-executor-smoke/replay-admission.ts`, `replay.ts` | 只读；原 proof equality、所有 admission/settlement/owner 检查保持 |
| `worker/research-executor/bootstrap.ts`, `execute-job.ts`, `d1-job-store.ts` | 只读；已有先 begin/claim 后 ack 生产语义保持 |
| `tests/server/research-executor-job-store.test.ts:495–513` | 复用现有回归，不新增重复 store 测试 |
| 所有现存 outputs、inventory、冻结候选和生产 executor 文件 | 不改；未来构建另起唯一目录 |

源码变更前，Root 先完成当前冻结候选需要旧 driver 的 signed status/fault 工作并确认无活动任务；driver 会校验当前 source hashes，不能一边改源码一边假定旧候选命令仍可用。现存冻结 contract SHA 为 `05ef9e37aa890f767a07a5ac3bf02cdbd0a79ae0db9cf2b85816586043d0256a`。

### Task 1: 用现有 fixture 建立真实时序 RED

- [ ] 在现有 paired fixture 的 Workflow create capability 加一个消费一次的异步响应钩子。调用顺序固定为：注册原 job 的 queued 实例 → 消费钩子 → 正常返回 id，或模拟“已创建、响应丢失”异常。为 create/get/status 记录本地调用轨迹，默认无钩子路径不变。不抽取/重构 runWorkflow，不新增 fixture 文件。
- [ ] 在现有 replay contracts describe 增加 ack 早于/等于/晚于 begin 的小参数化用例（1000/1001/1002 对 begin1001），同时检查 roster、submit reply、status reply。原 negative time 测试只移除错误的 acceptedAt1002 拒绝项，继续拒绝不正确的 grant interval，并补上 reply 的同一 grant/queue 边界。既有 strict/hash/inventory/safe-time 拒绝项保留。
- [ ] 在现有 signed replay describe 增加两个同代码参数化用例，统一名称前缀 `TEMPORAL-001`：create 正常返回、create 响应丢失。两者都在 create 钩子中调用现有 `f.runWorkflow("long")`，读回 claimed dispatch、尚空的 workflow_accepted_at、真实 Site begin/expiry；只前进 fixture Date 11,835ms，再释放 create。lost 分支必须由真实 bootstrap 调用 get/status，轨迹精确为 create/get/status；正常分支只有 create。hook 内收集结果，断言放在 signedStart 完成之后，避免被 create catch 吞掉。
- [ ] 两条用例继续沿现有 complete 流程：前进 Date30,001ms、runCron、approveReplay、admission、六个 signedReplay。断言真实 ack>begin、approval ack等于原proof、原 begin/expiry/queue 不变、reply身份/原时间一致、ownerB返回null、Site业务快照不变、Provider1/Repair0/Workflow1、全局fetch未调用。随后仅在测试的 roster 副本将 ack加1，确认 admission 在任何新流量前拒绝，再恢复 honest roster。不得用 UPDATE、SQL 时间改写或人工 proof 替换使 positive case通过。
- [ ] 复用本文件现成 fixture()/afterEach/admission()/签名验证；不新增 store测试。既有 `research-executor-job-store.test.ts:495–513` 已验证真实 begin/claim先于ack及首次ack不可改。
- [ ] 聚焦运行一次 RED；契约此时仍保持冻结原代码。保存命令/退出码/具体失败位置。

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-cloud-smoke-replay.test.ts -t TEMPORAL-001
```

预期晚 ack 的 parser 拒绝，两个真实接入用例均在 approveReplay 的 roster 解析处因 Smoke unavailable 失败；此前 begin/claim/null-ack/get-status 断言必须通过。若失败发生在装配、签名、begin或导入，应先修正测试，不能把那种失败算作本缺陷 RED。完整未来 fixture/test 代码在实施时编写，本计划阶段不扩展测试基础设施。
### Task 2: 两条谓词最小 GREEN

- [ ] 在 `replay-contract.ts` 加一条说明 `acceptedAt` 语义的注释，并且只修改以下两处。`replay-admission.ts`、`replay.ts` 和 executor 保持逐字不变。

```diff
+// acceptedAt is the first durable Workflow acknowledgement, which may follow begin.
 const approvalSchema = z.object({ scenarioId, jobId: z.uuid(), requestHash: hash, receiptHash: hash,
@@
-  && value.acceptedAt <= value.beganAt && value.beganAt < value.executionExpiresAt && validGrant(value));
+  && value.beganAt < value.executionExpiresAt && validGrant(value));
@@
-  return !("original" in value) || (value.original.acceptedAt <= value.original.beganAt
-    && value.original.beganAt < value.original.queueExpiresAt && validGrant({ ...value.identity, ...value.original }));
+  return !("original" in value) || (value.original.beganAt < value.original.queueExpiresAt
+    && validGrant({ ...value.identity, ...value.original }));
```

- [ ] 重跑上一条聚焦命令一次获得 GREEN；随后只运行相关完整 replay 文件、既有 store 时序回归和 smoke 类型检查。

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-cloud-smoke-replay.test.ts
node node_modules/vitest/vitest.mjs run tests/server/research-executor-job-store.test.ts -t "records only the first workflow acknowledgement and allows begin/claim before it"
node node_modules/typescript/bin/tsc --noEmit -p worker/research-executor-smoke/tsconfig.json
```

预期全部通过；完整 replay 文件复用既有 strict shape、safe time、原 proof/hash、owner、settlement、package expiry、scope 和身份拒绝矩阵。不再新增平行测试矩阵或反复跑未修改的全站 suite。

### Task 3: 一次审查与后继候选链

- [ ] 由 SPEC reviewer 对照设计检查三文件最小 delta、两条谓词均修复、真实 RED/GREEN 及无 SQL 时间改写。再由**另一位** QUALITY reviewer检查 hook 一次性/默认路径、create-loss 确实走 get/status、错误 proof 拒绝和全部保留约束。只有新增具体问题才做相应修复/定向复验；不为每个小步骤重复审查。

- [ ] 审查通过且 Root 已解除构建冻结后，运行一次现有本地 native composition 集成检查，再生成独立命名的 cloud 构建。两条命令现在均不执行。

```powershell
node node_modules/vitest/vitest.mjs run tests/server/research-cloud-smoke-composition.test.ts -t "starts through the signed paired binding chain and persists actual acceptance"
node scripts/build-research-executor-smoke.mjs --profile cloud --report-name task15-replay-ack-order-cloud-20261006-r1
```

构建器使用独占目录，若名字已存在就停止并由 Root 为新尝试分配新记录名，不能覆盖。预期 local composition 通过；cloud report 为 passed/deployable，但 `cloudElapsedProved` 仍 false。新 report 位于 `outputs/local-durable-executor-20260914/task15-smoke/build/cloud/task15-replay-ack-order-cloud-20261006-r1/report.json`。

- [ ] 从实际构建输出计算并比较字节 hash，executor 必须仍是 `24a9436527b943f9f37c41404160b311e4eec32a3c906deeb71a0fc18cee9918`。同样核对 executor 输入图、21 分钟 paid-step、0 retries、20 分钟 provider deadline、21 分钟 grant 和合成时序均不变。若 executor 字节不等，停止 Site-only 候选路线，不能通过改旧 pin 来宣称不变。

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath 'outputs/local-durable-executor-20260914/task15-smoke/build/cloud/task15-replay-ack-order-cloud-20261006-r1/executor.js','outputs/local-durable-executor-20260914/task15-smoke/build/cloud/task15-replay-ack-order-cloud-20261006-r1/site.js','outputs/local-durable-executor-20260914/task15-smoke/build/cloud/task15-replay-ack-order-cloud-20261006-r1/report.json'
git diff --check
git diff --stat -- worker/research-executor-smoke/replay-contract.ts tests/helpers/research-cloud-smoke-fixture.ts tests/server/research-cloud-smoke-replay.test.ts
```

## Root 后继操作清单与证据归属

这是已有任务的后继清单，不是当前文档任务中的部署执行，也不增加通用许可链。具体部署材料准备/实际映射核对由 Root 沿原操作流程完成。

1. 保存旧候选全部事实：原 report `27f727f4…`、原 anchor `54817a77…`、Site artifact `f8a6c381…`、原 executor artifact、long `root-final-native-long-verification-r1.json`、原 signed status、两个 faults 的实际 gap/Cron/import/receipt/accounting 记录。旧 long 证明 1,170,055ms 原候选合成后台执行；R2 已是 tombstone，不能声称重算了已删除 receipt body 的 hash。faults 尚在准备时不能预先写为通过。
2. 将新 Site artifact/report、源差异、local tests、SPEC/QUALITY、实际 predecessor revisions 放入新的 append-only `cloud-ops-20261005-replay/replay-ack-order-transition-r1/`。部署前证明当前工作已 settled/drained；禁止在活动工作中切换。不要触碰原 inventory、存储时间、grants、quota/budget 或固定三身份。
3. Site-only 切换后读回实际新 Site revision、未变 executor revision/bytes、既有 D1/R2/Workflow 资源、peer/private/key-id 配置及原结果/时间/计数。将实际前后读回 digest 和操作时刻记到 `transition.json`。旧 Site bundle 变成新字节，必须如实记为 artifact transition，不是“仅配置变化”。
4. 使用现有 strict `arc-smoke-isolation-v1` 字段生成新 `successor-inventory.json`，绑定新 report、实际新 Site revision/entry/digest，以及同一资源 epoch/原 executor。严格 schema 没有 predecessor 字段：原 anchor digest、successor inventory digest、原/新 report digest、实际部署/readback digest 和各场景归属放在 companion `transition.json`。不要把旧 source/report 与新 Site 混配或放宽 driver 校验。
5. 用当前仍未过期、成功结算的原生记录生成 honest roster；`acceptedAt` 保留原始 `1791215267920`（long），begin/expiry/hash 均逐项不变。roster 的 inventory 绑定 successor；nativeEvidenceSha256 指向链接原运行与当前兼容性读回的完整安全证据。Root 使用原 masked launcher、正确 successor inventory/report/approval 继续六步签名 replay，并保存原状态/计数前后相等证据。禁止重试 start、续 TTL 或 SQL 改时间。
6. 每场景记录两组归属：`executionCandidateReportSha256` 是实际运行时的候选（目前计划原候选）；`replayCandidateReportSha256` 是修正 Site 的 successor。结论可以是“原候选 execution/elapsed/fault + successor Site replay 对同一结果通过”，不能写“整个新候选三个场景从头到尾已云验证”。若验收必须证明后者，或 package 已过期，只能安排另外明确的全新隔离场景；原证据保留，不重启当前固定 Workflow。

## 完成标准

- [ ] 仅两条错误跨事件时间比较删除；所有原身份/proof/TTL/owner/settlement 条件保留。
- [ ] 晚 ack 两条真实路径均 RED→GREEN；六步签名 reply 保留真实原时间，单次效果不变；不存在事后 SQL 时间改写。
- [ ] 一轮 SPEC 后不同 QUALITY 通过；没有为本窄修复引入协议字段、executor 改动或测试基础设施重构。
- [ ] 新旧 artifact/inventory/证据归属清楚，executor 实际字节相等；修复本地通过、部署和云 replay 分开报告。

本计划自检：文件/方法/测试命令来自当前代码；测试 cleanup、fixture approval、runWorkflow 和 runCron 全部复用现有实现；计划没有修改应用、运行测试、构建、云调用、stage 或 commit。
