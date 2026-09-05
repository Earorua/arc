# Arc. v8 Phase 2 规格恢复检查点

> **2026-09-05 持续目标执行：Task 10 已关闭，下一步 Task 11，然后 Task 13 离线验收**
>
> 权威工作树为 `C:\Users\XF\Documents\Codex\2026-07-26\sites-plugin-sites-openai-bundled-2\.worktrees\v8-openrouter-research-beta`，分支为 `codex/v8-openrouter-research-beta`。本轮从已核对干净的 `2a82567f1a6dfd0a49cb4ff59b07deff564ed356` 恢复。Task 10 初版 `ad58a3e`，修复 `a06adf7`，最终代码 `0cdfe0ac565d5e15da9c6d16730ed38fe27105a4`；之后 `cebb22e` 仅补充离线浏览器验收方案，代码未变。本记录随后以文档提交保存；恢复时以实际 `git status --short --branch`、`git rev-parse HEAD` 和历史为准。
>
> Task 10 已完成严格公共响应客户端和可刷新恢复控制器。规格审查的权限切换时序问题以 15 项 RED 和提交阶段同步修复；质量审查的首次提交中断卡住问题以 3 项 RED 和保留同 mutation ID 的显式恢复修复。最终独立规格与质量/安全审查均为 **Critical 0 / Important 0 / Minor 0 / READY YES**，各自独立通过 92 项相关测试。主代理在干净 `cebb22e` 上完成完整 **125 files / 2104 tests**、非增量 TypeScript、完整 ESLint、build **5/5**、rendered HTML **3/3**、diff-check、客户端敏感标识及生产边界检查，全部通过。
>
> **当前权威下一步：** Tasks 1–10 与 Task 12 已关闭，不重做。派发新的 Task 11 实现子代理，按 TDD 接通 Setup Research Beta、只读资格提示以及 Path/Today/Stack/Proof 的真实研究来源；先规格审查，再质量/安全审查，清零并复验后执行 Task 13。Task 11 的最小资格读取和 Task 13 的隔离浏览器/一次性本地 D1 验收方案已写入详细计划。浏览器验收必须覆盖完整页面链路，不能仅凭 Ready 面板或服务端单测关闭目标。
>
> 用户已设置持续目标，要求持续推进当前已授权范围。**目标 2 尚未完成；Task 11、Task 13 离线验收、真实 Provider 证据及用户验收仍待完成。** 当前执行只覆盖离线工程范围；不读取/创建真实密钥、不发真实/付费 Provider 请求、不修改生产变量/旗标、不操作生产 D1/R2、不合并 `master`、不推送、不保存 Sites 候选、不部署。详细计划的历史线上/集成步骤由本轮限制覆盖，记录未执行，不在本轮索取这些操作的授权。

> **2026-09-05 模型切换保存：目标 2 Task 9 已关闭，下一步从 Task 10 继续**
>
> 权威项目根目录为 `C:\Users\XF\Documents\Codex\2026-07-26\sites-plugin-sites-openai-bundled-2`；本目标的权威隔离工作树为 `C:\Users\XF\Documents\Codex\2026-07-26\sites-plugin-sites-openai-bundled-2\.worktrees\v8-openrouter-research-beta`，分支为 `codex/v8-openrouter-research-beta`。Task 9 的最终代码 HEAD 为 `f97ca800cbf959da78b4878a288386e429f753fb`（`fix: close planning response integrity gaps`）；包含本记录的后续文档提交是当前模型切换检查点。恢复时先核对实际 `git status --short --branch`、`git rev-parse HEAD` 与 `git log -5 --oneline`。
>
> Task 1–9 与提前独立完成的 Task 12 均已关闭。Task 9 初版为 `4ab6790`，后续修复为 `9b599dc`、`767a0bf`、`cc0e9a2`、`f97ca80`。最终全新规格复审和质量/安全复审均为 **Critical 0 / Important 0 / Minor 0 / READY YES**。主代理在精确代码提交 `f97ca80` 上完成：相关 12 files / 343 tests、完整 123 files / 2012 tests、TypeScript、完整 ESLint、production build 5/5、rendered HTML 3/3、diff-check 与生产边界检查全部通过。Windows 沙箱内 build 和 rendered HTML 的首次运行仅因子进程 `spawn EPERM` 失败；未改源码后以相同命令在沙箱外复跑通过。
>
> **恢复后的权威下一步：** 从详细计划的 Task 10 开始，随后完成 Task 11；Task 13 在 10–11 完成后执行目标 2 的最终离线验收和检查点。不要重做 Tasks 1–9 或 12。继续沿用已批准的子代理驱动、逐任务 TDD、规格审查与质量/安全审查门槛。
>
> 本轮没有创建或读取真实密钥，没有真实或付费 Provider 请求，没有修改生产变量或生产旗标，没有生产 D1/R2 操作，没有合并到 `master`、GitHub 推送、Sites 候选保存或部署。公开生产仍保持 Arc. v7.2 / Sites version 9。

> **2026-09-04 暂停保存：Task 9 第二轮规格修复已提交，复审在结论前按用户要求中止**
>
> 当前权威工作树仍为 `.worktrees/v8-openrouter-research-beta`，分支仍为 `codex/v8-openrouter-research-beta`。用户要求暂停时，工作树干净，HEAD 为 `767a0bf3125e1226f1a723594f4c95da68299a22`（`fix: reject expired research planning commits`）；其上一个检查点提交为 `f01a517`，六项首轮修复提交 `9b599dc` 仍完整存在。Task 1–8、12 已关闭；Task 9 尚未关闭，Tasks 10–11 尚未开始。
>
> 从下方 `f01a517` 检查点恢复后，全新独立规格 reviewer 对 `4ab6790..9b599dc` 完成只读复审，结论为 **Critical 0 / Important 2 / Minor 0 / READY NO**。原六项中 A（Proof legacy fallback 仅 exact Flagship role）、B（Ready `planningData` required）、D（Flagship source context canonical blueprint/registry ID+version）和 F（11 类真实 D1 过期损坏矩阵、四类动作零写入且零 Flagship fallback）通过；C 仍因 `D1PlanningRepository.saveGeneration` 调用允许过期的 replay resolver 而失败，存在 fresh resolve 后构建跨过 expiry 仍写入新计划的 TOCTOU；E 的真实 Research → completed unit → Proof demonstrated → withdrawal 闭环存在，但缺少真实 SQLite wrong-owner / wrong-goal 历史 daily-unit 负向证据。其余 Task 9 规格未发现新缺口。
>
> 修复代理按 TDD 创建 `767a0bf`，仅修改 3 个文件（138 insertions / 2 deletions）：先用真实 SQLite 复现 I1 RED——fresh resolve 后把 Research repository 时钟推进至过期，旧实现错误完成 generation；随后新增独立的 fresh exact-reference `resolveForGenerationCommit`，要求 Research 重新经过通用 Ready/fresh repository 校验并完整比较 canonical source reference，`saveGeneration` 改走该能力，既有 generation 的 load/event replay/Complete/Delay/replan 仍走 replay-only reader。I1 GREEN 为 1/1，规划表零增量。I2 新增第二 owner + active goal 和同 owner 第二 inactive goal 的真实 SQLite 证据，正确 owner+goal 可读已完成历史单元，wrong owner / wrong goal 均返回 `null`，Proof 四表零增量；该测试首次即 GREEN，因此是规格证据补强，不是生产 bug 修复。代理报告七文件 211 tests、TypeScript、目标 ESLint、diff-check 全通过并提交，工作树干净。
>
> 主代理已独立核对 `767a0bf` 的三文件差异和 diff-check。根侧首次运行 `tests/server/research-planning-integration.test.ts` 被 Windows 沙箱的 Vite `spawn EPERM` 阻止启动；在不改源码的情况下以获批沙箱外同命令重跑，得到 **1 file / 29 tests 全通过**。这只是交接真实性验证，不替代 Task 9 最终完整根验证。
>
> 第二名全新只读规格 reviewer 已开始审查 `767a0bf`，但在给出任何结论前，用户明确要求暂停并关闭 Codex；该 reviewer 已被中止，不能把进行中检查视为通过。审阅提交时另识别出一个必须在恢复后由全新 reviewer 明确裁定的边界：`saveGeneration` 目前在 `findMutation` 之前执行 fresh commit validation；若同一已成功 generation 的**幂等重放**发生在 package expiry 后，它可能被拒绝。需要对照既有 planning idempotency 与规则 A 判断：已存在 generation 的同 mutation replay 是否应返回原响应，同时只有真正的新 mutation 才执行 fresh commit 校验。不要在未完成独立审查前自行假定结论。
>
> **恢复时的权威下一步：** 先运行 `git status --short --branch`、`git log -5 --oneline`、`git rev-parse HEAD`，确认工作树干净且 HEAD 包含 `767a0bf`。然后派发一名全新的只读规格 reviewer，完整复核 `4ab6790..767a0bf`，重点复核上一轮 I1/I2、原 A–F，以及上述“过期后的同 mutation generation 幂等重放”排序边界。若有任何 Critical/Important/Minor，按 TDD 最小修复并再次独立复审；只有规格清零后，才启动全新的质量/安全 reviewer。两轮均清零后，再由主代理在精确最终提交上执行 Task 9 完整相关回归、全量单元测试、TypeScript、完整 ESLint、production build、rendered HTML、diff/秘密/生产边界扫描，更新 Task 9 计划勾选和检查点。Task 9 完整关闭后才进入 Tasks 10–11；不要重做 Tasks 1–8 或 12。
>
> 本轮没有创建或读取真实密钥，没有真实或付费模型请求，没有生产变量/旗标、生产 D1/R2、合并、推送、Sites 候选保存或部署。公开生产仍为 Arc. v7.2 / Sites version 9。关闭 Codex 后不要假定任何代理或本地预览仍在运行；以 Git 历史、此检查点和实际工作树为准。

> **2026-09-04 暂停保存：目标 2 Task 9 规格修复已提交，下一门槛为全新独立规格复审**
>
> 当前分支仍为 `codex/v8-openrouter-research-beta`，隔离工作树仍为 `.worktrees/v8-openrouter-research-beta`。Task 1–8、12 已关闭；Task 9 初版实现提交为 `4ab67902ece6decfaac4c427ea4dbf33ca09412f`，首次独立规格审查结论为 Critical 0 / Important 6 / Minor 0，因此 Task 9 没有提前关闭。
>
> 六项规格修复已按 TDD 保存在本地提交 `9b599dc`（`fix: close research planning replay gaps`）：只有服务端确认 exact Flagship role 的旧目标才能在无 planning workspace 时使用 Flagship Proof authority；Ready owner view 的 `planningData` 改为必填；过期 package 读取从通用 `ResearchRepository` 移入只接受完整 immutable Research source reference 的专用 planning-replay reader；Flagship source context 锁定 canonical blueprint / registry ID 与版本；真实同库 SQLite/D1 覆盖 Research plan Complete → Proof demonstrated → withdrawal；11 类过期后 missing/corrupt/cross-owner/substitution/identity/version/config/content/domain 损坏矩阵覆盖 load、Complete、Delay、accept replan，并要求规划表零增量和 Flagship resolver 零调用。为保持完成单元可提交 Proof，D1 Proof 的 daily-unit 所有权读取从仅 active plan 扩展为同 owner + goal planning workspace 内的历史单元，仍不接受跨账户或跨目标单元。
>
> 修复代理记录的判别性证据：首批 3 files / 71 tests 有 4 项预期 RED，最小修复后 71/71 GREEN；通用仓库仍暴露过期旁路的能力测试先 1/107 RED，能力拆分后 GREEN；真实 D1 Proof 闭环先因已完成单元离开 active plan 而 RED，修复后相应范围 17/17 GREEN；11 类真实 D1 失败矩阵 28/28 GREEN；最终相关范围 17 files / 495 tests GREEN，fresh `npx tsc --noEmit` exit 0，变更文件 ESLint 0 error / 0 warning，`git diff --check` 0。代理在边界扫描和提交前因其独立额度终止；主代理确认全部修复已暂存、cached diff-check 通过，并原样创建 `9b599dc`，没有在提交前后改写实现。上述修复后验证目前是实现代理证据，仍需主代理 fresh 复验，不能冒充 Task 9 最终门槛。
>
> **恢复时的权威下一步：** 先检查 `git status --short --branch`、`git log -5 --oneline` 和 `git rev-parse HEAD`，确认工作树干净且包含 `9b599dc`。然后派发一名全新的只读规格 reviewer，逐项复核首次审查的 6 项 Important；若规格清零，再派发全新的只读质量/安全 reviewer。两轮均清零后，由主代理在精确最终提交上运行 Task 9 完整相关回归、全量单元测试、TypeScript、完整 ESLint、production build 5/5、rendered HTML、diff/秘密/生产边界扫描，并更新 Task 9 计划勾选与本检查点。只有 Task 9 完整关闭后才进入 Tasks 10–11；不要重做 Tasks 1–8 或 12。
>
> 本次暂停没有创建或读取真实密钥，没有真实或付费模型请求，没有生产变量或生产旗标修改，没有生产 D1/R2 操作，没有合并到 `master`、GitHub 推送、Sites 候选保存或部署。公开生产继续保持 Arc. v7.2 / Sites version 9。关闭 Codex 后不要假定任何代理或本地预览进程仍在运行；以 Git 历史、此检查点和实际工作树为准。

> **2026-09-04 目标 2 Research Beta：Task 1–8、12 已完成；Task 9 历史缓存规则已选择 A，进入实现**
>
> 用户已批准目标 2 书面规格及后续最优选项，执行方式为子代理驱动、逐任务 TDD 与规格/质量双阶段审查。目标 2 分支为 `codex/v8-openrouter-research-beta`，工作树为 `.worktrees/v8-openrouter-research-beta`；不要在根目录的 `master` 重做实现。
>
> 已保存规格 `docs/superpowers/specs/2026-08-27-arc-v8-openrouter-research-beta-design.md` 和详细计划 `docs/superpowers/plans/2026-08-10-arc-v8-openrouter-research-beta.md`（计划提交 `21e40ce`）。Task 1 契约/夹具实现提交为 `2666662`，规格审查修复为 `2b2e9f0`；Task 1 已完成独立规格及质量审查。后续计划修正包括实际 Drizzle schema 入口、SQLite/D1 原子事务验证、受限搜索引擎及 Research 配额并发准入（文档提交至 `42fcf95`）。
>
> Task 2 实现为 `380708b`，审查修复为 `af31ae5`、`bf82f1f`、`89c803f`。普通技术文案误判、JSON 字段名长度预算和斜杠事件属性拦截均已有 RED→GREEN 回归；最终独立质量复审确认无待修问题，独立规格审查也已通过。主代理在 `89c803f` 独立复跑五文件 229/229 通过；`bf82f1f` 全量为 111 files / 1395 tests，TypeScript 与完整 ESLint 通过；较早 `380708b` 构建 5/5、rendered HTML 3/3 通过，不能将这些不同版本证据冒充最终目标验收。
>
> Task 3 实现已提交为 `9cf3ca50ec6015a72a908234717c47a59138fa50`，仅修改计划中的七个文件：五张研究/预算表、生成迁移 `0005` 及元数据、三个数据库测试文件；`0000`–`0004` 保持不变。聚焦数据库套件 93/93 通过，包含活跃运行必须有恢复期限、错误码不得隐藏 NUL 尾部、UTF-8 JSON 字节边界、所有者重试外键、实际成本超额记录与查询索引检查。主代理在该提交独立复验完整套件 112 files / 1451 tests、TypeScript、完整 ESLint、生产构建 5/5、rendered HTML 3/3 和提交范围 diff-check 均通过；这些是 Task 3 版本的证据，不是目标 2 最终验收。
>
> Task 3 已通过独立规格审查。质量审查提出的唯一 Minor（二进制错误码绕过文本约束）已先复现 RED，再在 `33cb78dbe8bcc24abfd8f1639ebf05a712494da8` 修复；主代理独立数据库回归为 95/95，TypeScript 与 diff-check 通过，质量复审确认 Critical / Important / Minor 均为零。修复从原 `0004` 元数据重新生成尚未发布的 `0005`，没有新增 `0006` 或修改旧迁移。
>
> Task 4 初版已提交为 `986d43a`（四个文件），实现代理报告 13/13 聚焦测试、TypeScript 与局部 lint 通过，但尚未通过独立审查，不能据此标记完成。主代理已核实：高扇出用例实际包含自依赖/循环和不完整资源引用，当前包解析只验证 Schema/指纹而漏掉领域规则；缓存附加缺少运行岗位/locale/config 绑定，重试 lineage 也在创建后另行更新。已交回同一实现代理 `task4_research_persistence` 按 TDD 修复，补齐有效 DAG 高扇出、非法 Ready 拒绝、缓存身份、原子重试、失败分类及完整事务测试，再进入规格/质量双审。之后继续 Task 5–13。恢复先核对实际 Git HEAD、代理状态与未提交文件；不要重做 Task 1–3 或覆盖后续进行中的修改。代理 observation timeout 不等于停止；只有实际终态或句柄缺失才允许重新派发。
>
> **2026-08-31 恢复补记：** 旧实现代理明确因额度错误终止，随后代理列表确认句柄已不存在。新代理 `task4_persistence_repair` 从原未提交修复接手，未重做 Task 1–3。已报告首组 18 项判别性失败及后续重试/输入边界 RED→GREEN（阶段性 74/74），仍在补齐 UTF-8 存储上限、各方法所有者/错误边界、双包共享网址和幂等记录损坏测试；这些不是最终审查证据。主代理在检查点提交 `2501ed0` 后独立运行原有 entitlements / D1 entitlements / AI gateway 三套件，14/14 通过。有效但超出存储上限的 Ready 包应以 CAS 进入 Failed 且不写入截断内容；伪造或矛盾的 Ready 命令直接拒绝、不产生局部写入。主代理不修改实现代理负责的四个代码/测试文件。
>
> **Task 4 修复与验证更新：** 修复已提交为 `e1b4083`，实现代理报告五组判别性 RED→GREEN，聚焦 99/99、相邻套件 331/331。主代理在该源码版本独立验证 TypeScript、完整 ESLint、生产构建 5/5 和 rendered HTML 3/3 通过；全量测试首次与 tsc/lint 并行时仅长 ID/网址压力用例超过 10 秒，随后保持源码和时限不变、单独运行全量得到 **113 files / 1552 tests 全通过**。不要把先前超时隐藏为断言修复；大型全量套件后续单独运行，避免额外 CPU 竞争。独立规格审查尚有一项验收覆盖缺口：双包共享 URL 用例改变了第二包 canonical role ID，没有直接证明同一 canonical role/version 的双包命名空间；已交回实现代理参数化补强，待复审后再启动质量审查。Task 4 仍未关闭，Task 5 尚未实施。
>
> 双包覆盖补强已提交为 `26e55b4`，仅修改测试，生产源码未变。主代理独立持久化回归为 **100/100**；规格代理复审确认 SPEC COMPLIANT，无剩余规格发现。质量代理 `task4_persistence_quality_review` 正在审查，不得在其完成且问题修复前关闭 Task 4 或开始 Task 5。
>
> **Task 4 最终关闭（覆盖上方阶段性状态）：** 规格审查在 `26e55b4` 通过；质量审查仅提出两处紧凑校验函数的可读性问题，已在 `a7b18f5` 仅作格式展开。主代理核对提交差异，质量代理复审确认行为、条件与求值顺序未变，Critical / Important / Minor 均为零。主代理在最终源码 `a7b18f5` 独立运行完整 `npm run test:unit`：**113 files / 1553 tests 全通过**，exit 0；未修改测试超时。Task 4 的 TypeScript、完整 lint、build 5/5、rendered HTML 3/3 证据来自上述 `e1b4083`，其后仅增加一项测试和格式整理，不冒称重新构建。现在从 Task 5 继续，Task 5 尚未实施，Task 1–4 不重做。
>
> **Task 5 规格修复中（2026-08-31）：** Task 4 关闭记录已提交 `1e2685b`；后续 `aa8d3c1`、`c6acd1a` 仅补齐已批准 Task 6/8 与当前契约、Provider 错误/费用、IP 哈希和运行时类型的接线要求。Task 5 九文件实现已提交为 `68ec17e6eee55b45e270d9cc78ce6458040cfd6e`，包含原子双期间成本预留/结算、Research 原子用户配额和真实 SQLite 回归；此前额度中断已恢复，不是当前阻碍。实现代理报告五套件 108/108，主代理在该提交独立验证完整 **115 files / 1647 tests**、TypeScript、完整 ESLint、build 5/5，并补跑 rendered HTML **3/3** 通过。独立规格审查仍发现两项问题：相关 terminal 行的 purpose/owner/key 损坏可能逃过按行筛选的校验；聚合校验没有对齐 Schema 的标识符 trim 规则。主代理核对源码后已交回同一实现代理 `task5_atomic_budgets` 按 TDD 修复，保持历史范围隔离与线性查询计划。Task 5 尚未通过规格门槛，质量审查尚未开始；不能据全量绿色提前关闭或开始 Task 6。恢复时先核对实际 Git、代理状态及未提交差异，不重做 Tasks 1–4。
>
> **Task 5 复审更新：** 配额修复已提交为 `8bdf2d1a959b0450147c8870a95da1ecaa4c1910`，仅修改 entitlement repository 和对应测试，新增 29 项回归。关系范围、ECMAScript 空白、UTF-16 长度及 NUL 边界均经 RED→GREEN；实现代理五套件 **137/137** 通过。独立规格代理重新运行原始复现、历史期间隔离和真实查询 EXPLAIN，确认 SPEC COMPLIANT，未发现相关全表嵌套扫描（最长 SQL 5,537 bytes）。主代理独立完整回归 **115 files / 1676 tests**、TypeScript、完整 ESLint、build **5/5**、rendered HTML **3/3** 与 diff-check 通过。质量代理 `task5_budget_quality_review` 正在审查；未获质量结论前 Task 5 仍不关闭。
>
> 主代理另在一次性本地 Miniflare D1 上从 `0000` 顺序应用到 `0005`，运行实际预算及配额仓库：预算并发只准入一次、重放无新调用权限、unknown hold 转实际成本并重复结算后日/月账本各为 reserved 0 / settled 430；配额并发只准入一次、相关损坏 terminal 的准入与 usage 均拒绝、合法 UTF-16 最短键可完成；两次外键检查均为 0。数据库不持久化，未访问 Cloudflare 账户或生产 D1。运行工具需用安装版本支持的兼容日期 `2026-05-22`；stdin 脚本用普通 `node` 加 async IIFE，避免 `--input-type=module` 被 Miniflare worker thread 继承导致同步代理启动挂起。此诊断不是生产运行时配置变更。
>
> **Task 5 最终关闭（覆盖上方阶段性状态）：** 质量审查未发现 Critical/Important，提出的两项 Minor 已在 `870a207ba2d1dfc3b792709edf0075e867010743` 关闭：类型禁止 replay 同时授予 Provider 权限；新增跨月 actual/not-charged 结算只改变原日/月桶的回归。该提交仅修改类型及测试，不改变运行时 SQL/行为；类型测试已验证 RED→GREEN，跨月用例为现有正确行为的补强。独立规格及质量复审均通过，剩余发现为零。主代理在最终提交独立完整回归 **115 files / 1679 tests**、TypeScript、完整 ESLint、build **5/5**、rendered HTML **3/3**、diff-check 均通过。计划 Task 5 五项已勾选；下一步按 Task 6 五文件范围创建服务端 Provider 接口、OpenRouter 传输及 Fake，不重做 Tasks 1–5。没有真实模型请求、合并、推送或部署。
>
> **Task 6 已启动：** Task 5 关闭文档为 `68148c8`。新实现代理 `task6_openrouter_adapter` 负责计划中的五个 Provider/测试文件，已报告缺失模块 RED、接口骨架下 88/88 失败及七项请求/密钥/Fake 行为 RED，正在实现。传输输入仅 role/locale，Repair 另带原内容/annotations；版本为固定服务端导出，结果保留有界 content/candidate/annotations/actualModel/usage，错误不带上游原始消息。没有真实密钥读取或真实 Provider 请求。恢复先检查代理状态和未提交差异，不并行重派实现；Task 6 尚未审查或完成。
>
> **Task 6 边界复核更新：** 同一实现代理在额度错误终止后已恢复，保留原五文件工作，未重做任务。代理报告三文件 94/94 后补强至阶段性 111/111，TypeScript 与目标 lint 通过；这些尚未代替主代理独立验证。主代理用真实 Adapter 加纯内存 fetch stub 复现计费缺陷：HTTP 400/402/429 携带正数 `usage.cost`、但缺少可选搜索汇总时，完整 usage 校验失败导致错误被标为 `charged: false`。已交回实现代理先写 RED 再修复：部分计费证据不得释放预留，未知汇总保持 unknown，合法明确正数成本可以标记 charged，但不能伪造完整 usage。Task 6 尚未进入独立规格/质量审查；Fake 当前为固定 Data Product Manager 离线样例、usage unknown，不是真实任意岗位研究证据。
>
> **Task 6 初版冻结与送审：** 五文件实现已提交 `7a12885f03ab52a916b72e87638d6c6b2249985f`，上述计费误判已按 RED→GREEN 修复。主代理独立内存 stub 复测确认 partial-positive → charged true / usage null、malformed → charged unknown、clean absent → charged false；独立三文件回归 **133/133** 通过。模型输入另经 RED→GREEN 拒绝 auto/free/bodybuilder/pareto-code/fusion 等动态选择器及其变体，同时保留具体模型的 `:free` 变体；[Free Router](https://openrouter.ai/docs/guides/routing/routers/free-router)、[Pareto Router](https://openrouter.ai/docs/guides/routing/routers/pareto-router)、[Fusion Router](https://openrouter.ai/docs/guides/routing/routers/fusion-router) 官方文档支持此区别，查阅文档未调用模型。主代理在精确提交独立验证完整单元回归 **117 files / 1807 tests**、TypeScript、完整 ESLint、build **5/5**、rendered HTML **3/3** 和 diff-check 均通过。独立规格代理 `task6_provider_spec_review` 正在审查；后续仍需质量审查，不能提前关闭 Task 6。
>
> **Task 6 质量修复门槛：** 独立规格审查已在 `7a12885` 通过。质量代理 `task6_provider_quality_review` 发现唯一 Important：读取每个响应块都对同一 deadline 执行 `Promise.race`，导致未清除的监听随块数增长；490,078 字节合法响应的一字节分块诊断约额外保留 239 MB。主代理独立复现 10,078 字节响应产生同一 deadline 的 10,080 次订阅。已交回原实现代理 `task6_openrouter_adapter` 先写确定性 RED，再把超时竞争移到整个有界读取操作，保留 stalled body、超时取消、迟到响应和 reader lock 清理。不要用任意分块数量限制或放宽时限掩盖问题。质量审查无其他 Critical/Important/Minor；修复后需要规格/质量复审及 fresh 回归，Task 6 仍未关闭，Task 7 尚未实施。
>
> **Task 6 最终关闭（覆盖上方阶段性状态）：** 修复提交 `f379a23e7581ec2a67a64257a27c2f03f108d725` 仅改变 Adapter 及其测试；RED 证明一字节分块产生 17,166 次 deadline 订阅，GREEN 将上限固定为 2。独立规格及质量复审均通过；质量代理另用真实内存 stream 验证超时、迟到响应、挂起取消、超限与 reader lock，未出现未处理 rejection，剩余 Critical/Important/Minor 均为零。主代理在精确提交独立完整回归 **117 files / 1809 tests**、TypeScript、完整 ESLint、build **5/5**、rendered HTML **3/3** 和 diff-check 全通过。Task 6 五项已勾选；从 Task 7 研究编排、模型审计和跨进程结算恢复继续，不重做 Tasks 1–6。此时只是服务端 Provider 边界完成，Research API、规划与 UI 接线仍待完成，不能宣称目标 2 已完成；无真实密钥、模型请求、合并、推送或部署。
>
> **Task 7 已启动：** Task 6 关闭文档提交为 `7703d9d`。新实现代理 `task7_research_orchestration` 已接收计划中的十文件范围、完整 TDD 与跨进程恢复要求；原 Provider 实现已冻结，主代理只更新接线计划/检查点，不与实现代理重叠编辑。恢复时核对该代理实际状态及工作树，不并行重派。Task 8 计划另明确新调用授权与 GET 恢复分离：关闭 AI/Research 或移除密钥后，所有者仍能读取旧状态并对账，绝不因此调用 Provider 或隐式选择 Fake；这与 Task 7 的持久化恢复约束一致。Task 7 尚未通过实现/双审/验证门槛。
>
> **Task 7 首组独立回归（2026-08-31）：** 实现代理报告七项新增配额恢复/审计测试 RED→GREEN；主代理随后在 `472b07a` 之上的未提交 Task 7 工作树独立运行 `d1-research-run-recorder`、`d1-entitlement-repository`、`entitlements`、`ai-gateway` 四文件，**84/84 通过**。此证据只覆盖原配额的所有者限定读取、严格且幂等的 Research/Repair 审计记录及旧 Preview 兼容性，不代表研究状态机已完成。状态机测试及实现仍由原代理负责，下一门槛为真实 SQLite 上的中断恢复、一次修复、费用与用户配额分别结算、独立规格/质量双审。不要把当前骨架或未提交测试误认为可用 Research API。
>
> 接线计划另在 `472b07a` 明确终态 HTTP 连续性：POST 的 Needs-review/Failed 即使返回 422/503，仍须携带可安全读取的公共 run；所有者刷新后 GET 返回 200 状态包，客户端不得丢掉 run ID、问题码和显式 Retry 能力。Task 8 负责共享响应 Schema/API 测试，Task 10 复用同一契约；无可读持久化 run 的认证、准入或存储错误不能伪造运行。这是现有刷新恢复要求的接线补足，未更改模型、生产或部署授权。
>
> 主代理在 Task 6 期间补跑实际研究仓库的本地 Miniflare D1 smoke：同一有效包保存为 Ready、原 mutation 重放、他人运行不可见，以及第二所有者经独立运行复用缓存均通过；结果为 2 runs / 1 package / 3 skills / 2 edges / 6 resource links / 6 source audits，外键异常 0，无外部模型或持久化数据库。Task 7 计划已在 `b1ff3ac` 补齐原配额和模型审计的 owner-bound 恢复读取、跨进程故障注入与结算要求；配置变更后不得用旧 retry 的缓存身份调用新模型。此补充不改变已批准的产品语义，不是提前实施 Task 7。
>
> 主代理核对实际消费者后，在计划提交 `1cbb136` 补齐了 Tasks 9–11 的研究数据接线范围：Ready 公共规划投影、规划 HTTP/source context、刷新后的客户端恢复、Path/Today/Stack/Proof 与服务端 Proof 的同源数据、工作区岗位标题和完整链路测试。这些都是既有 Goal 2 可用闭环的必要接入，不能只实现 Ready 面板或服务器生成就宣称完成。
>
> **历史缓存到期规则已由用户于 2026-09-04 选择 A：** 到期只禁止缓存附着和新计划生成；已有计划继续以持久化、不可变、owner-bound 的精确 package / blueprint / registry 引用完成、延期和重排。历史重放不再检查当前有效期，但必须重新校验所有者、ID、版本、配置/内容指纹和领域完整性；缺失、损坏、跨用户或不匹配时失败关闭且绝不回退 Flagship。该例外不授予新计划、来源切换、Research retry 或跨用户使用权限。规格和 Task 9 计划已同步；实现必须先写 expired-new-use rejection 与 expired-locked-replay RED。
>
> **Task 7 最终关闭（覆盖上方阶段性状态）：** 可恢复研究编排初版提交为 `8bb6cbe758f708020cbca929189510994b7842e3`，恢复预检修复为 `f1ebf7d26136cbac1c4cc517e9414b09e197943a`。独立规格审查确认 Research / Repair 审计预检、过期运行首次保守持有及后续精确结算均符合规格。质量审查发现 `readResearchReservation` 的缺失键路径会先物化全局配额账本；该问题已按 TDD 在 `f7918843f7b42ccaec4128c0eec5c976d5530326` 修复为先走现有 `(user_id,idempotency_key,entry_kind)` 唯一索引，只有找到父预留后才执行一次受限关系读取。质量复审在真实 SQLite 的 100,000 条无关记录上确认查询计划为 `SEARCH quota_ledger USING INDEX quota_ledger_user_idempotency_idx`、约 0.026 ms，且无全表扫描、分组物化或临时 B 树；剩余 Critical / Important / Minor 均为 0。
>
> 主代理在精确提交 `f791884` 独立运行 Research / entitlement 相关 11 文件 **470/470**、完整单元回归 **119 files / 1883 tests**、TypeScript、完整 ESLint、生产构建 **5/5**、rendered HTML **3/3**、diff-check 与工作树洁净检查，全部通过。Task 7 五项已勾选；从 Task 8 的认证 Research Beta HTTP 路由、严格公共响应包及恢复读取继续，不重做 Tasks 1–7。关闭 AI / Research、缺少密钥或 cohort 改变时，旧运行 GET 与结算仍须可用且绝不调用 Provider；新调用权限仍要求双旗标和完整可信配置。
>
> **Task 8 最终关闭：** 认证 Research API 初版提交为 `a03706b664aef21ae2a9bfd3cec402caf93339ce`。规格审查发现 cohort 拒绝晚于运行/缓存附着，以及写请求接受缺失或 `same-site` Fetch Metadata；两项均在 `19d23e7ea5b12d8336c90d039ed329d6afa61466` 按 TDD 修复为无 run 的 `429 ALLOWANCE_REACHED` 前置拒绝、retry 所有者预检和精确 `same-origin`。独立规格复审确认双旗标/完整配置、新调用与无 Provider 恢复分离、盐化 `cf-connecting-ip`、严格公共响应包、终态连续性与旧 Preview / Planning 隔离均符合规格，无剩余问题。
>
> 质量审查随后发现 429 终态遥测误分类、内部 Zod 错误误报 400 和请求体 reader lock 未释放；`1cf43ef55154f23077754670a297ee4ebde68b53` 以受验证语义结果码、边界错误收窄和完整流取消/解锁修复，质量复审确认 Critical / Important / Minor 均为 0。主代理在精确 `1cf43ef` 独立运行 Task 8 五文件 **93/93**、完整单元回归 **120 files / 1924 tests**、TypeScript、完整 ESLint、生产构建 **5/5**、rendered HTML **3/3**、diff-check 与工作树洁净检查，全部通过。Task 8 五项已勾选；没有真实密钥、模型请求、生产变量值、合并、推送或部署。
>
> **Task 12 最终关闭（提前完成不依赖 Task 9 的独立范围）：** disabled-by-default 环境契约与聚合管理员健康初版提交为 `2518b68677443b31f31fe4c9ab0c6f836915a069`。规格审查发现有效启用状态没有复用完整 Task 8 运行时校验，以及损坏 reservation 可能被 SQL 过滤或强制转零；`5d3b26e402fa4c88d165286dc36fd275ece35aab` 以完整环境校验和显式损坏行检测修复，规格复审确认 SPEC COMPLIANT。
>
> 质量审查随后发现管理员健康读取旧 `role-research-preview` 旗标、两条全历史聚合不符合 UTC 有界查询要求，以及存在但损坏为 `NULL` 的日 bucket 会静默归零。`e35c4d7346c45d40bcbb244b4a1d3f1bbf5264b2` 按 TDD 改为真实 `role-research-beta` 旗标、当前 UTC 日 `[dayStart, dayEnd)` 状态窗口、当前日 site bucket reservation 关联和严格 bucket 值校验，并以纯增量 `0006` 只新增 `research_runs_updated_state_idx` 与 `ai_budget_reservations_day_status_idx`。真实生产 SQL 的 EXPLAIN 测试确认使用这两个新索引及既有 bucket-period 索引，不再扫描全历史表；质量复审为 Critical / Important / Minor 全部 0。
>
> 主代理在精确 `e35c4d7` 独立完成最终验证：Task 12 九文件 **181/181**、完整单元回归 **122 files / 1963 tests**、TypeScript、完整 ESLint、生产构建 **5/5**、rendered HTML **3/3**、完整 Task 12 diff-check 与工作树洁净检查均通过。计划 Task 12 五项已勾选。没有创建或读取真实密钥、真实/付费模型请求、生产变量值、功能旗标变更、生产 D1/R2 操作、合并、推送或部署。
>
> **当前下一步：** 从 Task 9 的 owner-bound Research planning source、不可变 source reference 与上述 A 规则开始 TDD；完成规格/质量双审后再接续 Task 10–11。此前一次 Task 10 子代理在写入任何文件前因代理额度终止，工作树经核对保持干净，因此没有可保留或覆盖的 Task 10 实现。Task 13 在 9–11 完成后执行最终离线验收与检查点。目标 2 尚未完成。
>
> 此时不能宣称目标 2 已完成。真实密钥、付费请求、生产变量、生产旗标、生产 D1/R2、Sites 候选及部署仍是独立授权门槛。本轮没有调用真实模型、合并或推送。恢复以此条及实际 Git 状态为准，下方目标 1 / Phase 2 记录均为历史。

> **2026-08-27 目标 1 `Proof-backed Stack` 已验收、合并并完成 GitHub 远程备份（当前权威门槛）**
>
> 用户已完成目标 1 本地验收并明确选择本地合并。`master` 已从四目标流程基线 `3db3fc9cacafe4afc1b05f3d3d1025648a56ecda` 快进到 `2f2a9a29718caf12c4fffa8aa2c8d62d6e393c57`，没有冲突或额外 merge commit。`codex/v8-proof-backed-stack` 已确认完整合并后删除，对应 `.worktrees/v8-proof-backed-stack` 已注销并清理；为释放 Miniflare / workerd 锁定的 `.wrangler` 与原生依赖文件，只结束了命令行明确指向该工作树的本地预览进程，因此当前不能假定 `http://localhost:3000` 仍在运行。
>
> 合并后的 fresh 全量门槛为 `npm run test:unit` 108 files / 1217 tests 全通过。合并前同一精确文件树还通过 `npx tsc --noEmit`、完整 `npm run lint`、vinext production build 5/5、rendered HTML 3/3、`git diff --check`，以及 1440px / 320px 的 Path、Stack、Intelligence、Proof 本地浏览器验收。一次未改动的 accessibility 用例在全量并发下触及 10 秒超时；该文件隔离复跑 23/23，随后完整套件 1217/1217，并且合并后完整套件再次 1217/1217，未通过放宽超时掩盖问题。
>
> 用户随后批准并验收了置信度展示退场：Path 仅保留 self-assessment，Stack 保留 learner status、Role importance、Proof、资源与下一步行动，`/intelligence` 仅保留 Skill、Source、Observed at 与证据／推断边界；三个用户界面均不再显示 confidence、百分比或中文“置信度”。内部 `confidence` 数据字段、Zod wire contract 与 `/api/intelligence/flagship` 返回仍为兼容目的保留，并已标记为非 learner evidence、不得用于产品决策。规划、Proof 投影和 readiness 行为未改变。
>
> 目标 1 的普通 GitHub 远程备份已完成。执行前 `git fetch origin` 成功，确认 `origin/master` 仍为 `9128321575a67c2fc6ec86e2ce1924e631ba28fe`、远端独有提交 0，且远端是本地 `master` 的祖先；随后以非 force 的 `git push origin master` 将远端快进到检查点提交 `6fad25e00f4ba41ace9f03eb92c398703dd9c904`，并用 `git ls-remote origin refs/heads/master` 独立确认远端 HEAD 精确一致。本权威状态提交应紧随 `6fad25e` 以普通 push 同步，恢复时以本地与远端实际 HEAD 为准。下一门槛是目标 2 `OpenRouter Research Beta` 的详细实施计划，不直接开始真实模型调用；真实密钥、付费请求、生产变量与生产旗标仍需单独明确授权。
>
> 本轮没有执行生产 D1 迁移、生产 R2 写入、Sites 候选保存、运行时配置／功能旗标修改或公开部署。公开生产继续保持 Arc. v7.2 / Sites version 9。下方所有“UAT 待决定”“分支仍存在”记录均为历史检查点，不再代表当前状态。

> **2026-08-25 目标 1 `Proof-backed Stack` 工程完成；本地 UAT 待用户决定（当前权威门槛）**
>
> 分支仍为 `codex/v8-proof-backed-stack`，隔离工作树仍为 `.worktrees/v8-proof-backed-stack`；最终审查后的工程 HEAD（本验收交接文档提交前）为 `19157f5c97eb468b311e9207c097e1fe44f90bf0`。Tasks 0–15 与 Task 16 的工程审查、修复和最终复验均已完成；当前只停在用户本地 UAT 决定。不要重做 Phase 1–2，也不要把自动化或 Codex 浏览器检查解释为用户验收签字。
>
> 最终工程门槛：`npm run test:unit` 为 108 files / 1217 tests；`npm exec tsc -- --noEmit` exit 0；`npm run lint` exit 0；独立 `npm run build` 的 vinext 5/5 完成；`npm test` 的 vinext 5/5 与 rendered HTML 3/3 通过；`git diff --check` 无错误。所有权与隐私聚焦套件为 4 files / 39 tests。临时 SQLite 已依次应用迁移 `0000`–`0004`，双账户 create / revise / reject / privacy / withdraw 夹具通过，`PRAGMA foreign_key_check` 为空。
>
> Task 16 规格对照审查未发现 P0/P1，确认并修复两项 P2：同一毫秒幂等快照现在按 workspace revision 确定性加载；v7 legacy Proof 可通过新版 `title` / `skillNames` 安全字段重新分享，且旧 `verified` 不会被提升为新状态。两项均先获得判别性失败测试，再转绿；审查后聚焦套件为 3 files / 38 tests。
>
> 本地人工辅助检查已覆盖 `/today`、`/proof`、`/stack` 的桌面和 320px 窄屏、键盘焦点、状态联动、不可变版本、撤销降级及公开/私有切换；详细记录位于 `docs/operations/v8-goal-1-uat.md`。浏览器自动化无法改变实际浏览器缩放，故 200% 缩放仍列为用户确认项；本地 UAT 结论必须保持 `Pending user decision`，直到用户明确接受。
>
> 本地预览保持在 `http://localhost:3000`，但进程跨会话不可假定仍存活。下一步是 `User reviews Goal 1 local acceptance`：向用户提供本地 URL 与 UAT 清单并停下等待。用户明确接受前，不合并、不推送、不清理分支。
>
> 本目标仍未执行生产 D1 迁移、生产 R2 写入、Sites 候选保存、运行时配置/旗标修改或公开部署。公开生产继续保持 Arc. v7.2 / Sites version 9。

> **2026-08-25 目标 1 `Proof-backed Stack` 已获实施批准（当前权威门槛）**
>
> 用户已批准目标 1 详细实施计划并选择“方式 1：当前任务内顺序执行”。隔离工作树为 `.worktrees/v8-proof-backed-stack`，分支为 `codex/v8-proof-backed-stack`；计划提交为 `d9dd4446559c2cf9c99bdacee167186147f7e489`，基于本地 `master` 的四目标规格提交 `3db3fc9cacafe4afc1b05f3d3d1025648a56ecda`。
>
> 启动时已刷新 GitHub 引用：`origin/master` 仍为 `9128321575a67c2fc6ec86e2ce1924e631ba28fe`，没有远程漂移；本地 `master` 仅领先该引用一个已批准的四目标规格提交。下一步按 `docs/superpowers/plans/2026-08-24-proof-backed-stack.md` 从 Task 0 基线验证继续，不重做 Phase 1–2。
>
> 本批准仅授权目标 1 的本地实现、测试、本地验收、通过验收后的本地合并与普通 GitHub 备份；不授权生产 D1 迁移、生产 R2 写入、Sites 候选保存或公开部署。公开生产仍为 Arc. v7.2 / Sites version 9。

> **2026-08-24 整站完成四目标流程已批准（当前权威门槛）**
>
> Phase 1–2 已完成，`master` 已合并并远程备份到 GitHub；本地与 `origin/master` 在制定流程前均为 `9128321575a67c2fc6ec86e2ce1924e631ba28fe`。用户已批准把剩余整站建设拆为四个长目标：Proof-backed Stack、OpenRouter Research Beta、Production Candidate、Public Release & Stabilization。正式书面规格位于 `docs/superpowers/specs/2026-08-24-arc-v8-completion-program-design.md`。
>
> 当前停在书面规格复核门槛。用户批准书面规格后，下一步只为目标 1 编写详细实施计划；不要重做 Phase 1–2，不要直接写 Phase 3 功能代码。四目标流程批准不等于真实模型调用、生产 D1/R2 写入、运行时变量、功能旗标、访问范围或公开部署授权，这些仍按规格中的强制门槛单独确认。公开生产仍为 Arc. v7.2 / Sites version 9。

> **2026-08-24 Arc v8 已合并到本地 `master`（当前权威状态）**
>
> 用户完成本地验收后明确选择“本地合并回 `master`”。本地 `master` 已从 `fa9bc6c` 快进到验收签字提交 `a7ee0837ebc3a86e9ca4dab6c89bc14484ea976a`，没有冲突或额外 merge commit。合并后源代码门槛重新通过：`npm run test:unit` 为 96 files / 1095 tests，`npx tsc --noEmit` exit 0，排除仓库内其他独立 `.worktrees` 构建产物后的 ESLint exit 0，`npm test` 的 vinext production build 5/5 与 rendered HTML 3/3 均通过。
>
> `codex/v8-adaptive-planning` 已确认完整合并后删除，对应 Git worktree 已注销，残留的本地依赖、Wrangler 状态和构建缓存也已清理；为释放这些缓存文件，已结束只属于该 worktree 的本地 vinext / workerd 预览进程。因此当前没有运行中的 v8 本地预览。
>
> 本次仅完成本地集成与清理。没有 push、PR、生产 D1 迁移、R2 写入、环境变量、功能旗标或 Sites 部署；公开生产仍保持 Arc v7.2 / Sites version 9。后续如需远程备份或公开发布，必须重新获得用户明确授权。下方“尚未集成”的记录是合并前历史状态，不再代表当前门槛。

> **2026-08-24 本地用户验收通过（当前最终状态）**
>
> 用户已明确回复“本地验收通过”。人工验收覆盖：Flagship Setup → Build → Path → Today 主链路；Today 分钟数、分步分钟、主要资源与完整 brief；Delay 候选差异、正确候选状态提示、候选待审动作锁定、Keep / Accept；决策与 Complete 的跨刷新持久化；键盘焦点；319px 窄屏单列、无横向溢出与动作换行。状态语义由人工提示检查及自动化 `role="status"` / `role="alert"` contract 共同覆盖。
>
> 签字后 fresh 最终工程门槛：`npm run test:unit` 为 96 files / 1095 tests 全通过；`npx tsc --noEmit` 与完整 `npm run lint` exit 0；`npm test` 的 vinext production build 5/5 完成，rendered HTML 3/3 通过。最新功能修复提交为 `e8d1179`，窄屏修复检查点为 `55e68b8`；本签字记录随后单独提交。
>
> Arc v8 Phase 2 至此完成本地建设与本地用户验收，但尚未集成或公开发布。分支仍为 `codex/v8-adaptive-planning`，worktree 仍为 `.worktrees/v8-adaptive-planning`。未执行 merge、push、PR、生产 D1 迁移、环境变量、功能旗标或部署；公开生产仍保持 Arc v7.2 / Sites version 9。下一步必须由用户单独选择保留分支、合并、PR 或放弃；部署需要另行明确授权。
>
> **2026-08-24 窄屏单列修复完成（继续本地验收）**
>
> 用户已人工确认 pending-candidate 提示与动作锁定正常、Complete 跨刷新持久化成功、键盘焦点符合。窄屏验收在 319px 视口发现 Today brief 仍为两列；根因是 `@media (max-width: 760px)` 将 `.today-brief` 与 `.diff-counts` 共同设置为 `1fr 1fr`，违反已批准的 one-column mobile stacking 规格。
>
> 用户批准后按 TDD 修复并在本地提交 `e8d1179`（`fix: stack Today brief on mobile`）：新增移动端 CSS contract RED，再只把 `.today-brief` 改为 `1fr`，保留 `.diff-counts` 两列。浏览器重新加载后的计算样式在 319px 视口为单列 `287.333px`，document width 304px、actions `flex-wrap: wrap`。聚焦测试 18/18、相邻回归 3 files / 35 tests、TypeScript、目标 ESLint 与 `git diff --check` 通过；第一次完整门槛有一个无关 `skill-audit-step` 5 秒并发超时，单文件立即 3/3 通过，随后 fresh 完整门槛 96 files / 1095 tests 全通过，未修改超时。
>
> 下一步请用户在当前本地 Today 页确认窄屏单列视觉符合，然后继续状态语义验收。用户明确回复“本地验收通过”前，不执行 merge、push、PR、生产 D1 迁移、环境变量、功能旗标或部署。
>
> **2026-08-23 pending-candidate 修复完成（本地验收待继续）**
>
> 已从下方本地用户验收暂停记录继续，并在本地提交 `2b021a5`（`fix: lock pending planning actions`）修复候选计划状态。Today 现在以 workspace 的 `pendingPlanVersionId` 为权威状态：候选待审期间禁用 Complete / Delay / Skip / Too hard / Already know this，Accept new plan / Keep current plan 保持可用；候选差异存在时固定显示 `Candidate plan ready for review. Your current plan has not changed.`，不会再让陈旧的 record 失败结果显示为连接错误。
>
> 本轮按 TDD 先捕获 2 条可判别 RED，再完成最小实现。验证结果：Today 聚焦测试 11/11；Today / diff review / controller / local repository / Today page 相邻回归 5 files、68 tests 全通过；完整 Vitest 门槛 96 files、1094 tests 全通过；`npx tsc --noEmit`、目标文件 ESLint 与 `git diff --check` 通过。
>
> **下一步仍是本地用户验收，不是部署。** 启动或恢复 `.worktrees/v8-adaptive-planning` 的 `npm run dev` 后，先复验 Delay → 候选提示与五个动作锁定 → Keep / Accept 解锁；随后继续验收 Complete 持久化（若当天不是 Rest）、键盘焦点、窄屏单列与状态语义。用户明确回复“本地验收通过”前，不执行 merge、push、PR、生产 D1 迁移、环境变量、功能旗标或部署。
>
> **2026-08-22 本地用户验收暂停记录（已由上方修复记录接续）**
>
> Phase 2 工程完成提交仍为 `91188eb1bf7e61f7153b0b7719dd8d5d20d5aac4`，本轮没有修改功能代码。用户已从 `.worktrees/v8-adaptive-planning` 启动 `npm run dev`，在访客本地模式完成 Setup → Build → Path → Today 的人工验收，并确认刷新后 Path 与 Today 状态一致、规划结果可从本地持久化恢复。
>
> 已人工确认：Flagship Setup 可以生成自适应计划；Path 可以显示完整阶段、学习目标、自评状态与 Blueprint claim confidence；Today 可以显示当前单元总分钟数、分步分钟数、主要资源、Build、Completion criteria、Proof requirement 与 Rubric；Delay 可以生成 `Review every change.` 候选差异；Keep / Accept 决策链路可用；决策后的计划跨刷新保持一致。
>
> 验收中发现并保留一个待修 UI 缺陷：候选计划实际已生成时，Today 仍可能显示 `Arc could not update this plan. Try again when the connection recovers.`；候选待审期间学习动作也仍保持可用，后续动作会被内核的 pending-replan guard 拒绝，却被 UI 归类成连接错误。预期行为是显示 `Candidate plan ready for review. Your current plan has not changed.`，并在候选被 Accept 或 Keep 前禁用或隐藏 Complete / Delay / Skip / Too hard / Already know this。修复必须先写可判别 RED，再做最小实现与 focused/full gate；不要把它当作网络或数据丢失。
>
> 另一个产品呈现事实：分钟数与资源当前只在 Today 显示，Path 只显示路线结构与能力叙事。此前口头验收指引中“Path 每个单元显示分钟和资源”不准确；若后续用户要求 Path 也直接展示，应作为新的产品呈现改动单独批准，而不是误报为当前已实现。
>
> **验收尚未最终签字。** 下次从这里继续：先修复上述 pending-candidate 状态与错误文案，运行相关 Today / controller / repository 回归、TypeScript、ESLint，并按风险决定是否重跑 96-file full gate；然后恢复本地预览，验收 Complete 持久化（若当天不是 Rest）、键盘焦点、窄屏单列与状态语义。通过后再请用户明确回复“本地验收通过”。
>
> 本地预览地址为 `http://localhost:3000/setup`；当前会话启动过开发服务器，但关闭 Codex 或电脑后不能假设进程仍在，恢复时应先检查端口，再从 v8 worktree 运行 `npm run dev`。本轮没有 merge、push、PR、生产 D1 迁移、环境变量、功能旗标或部署动作；公开生产仍为 Arc v7.2 / Sites version 9。浏览器中的访客计划属于本地存储，不写入 Git；本检查点保存的是可复现的验收结论与后续动作。

> **2026-08-22 Phase 2 工程完成记录（覆盖下方历史状态）**
>
> 当前实现 worktree 为 `.worktrees/v8-adaptive-planning`，分支 `codex/v8-adaptive-planning`。Phase 2 Task 1–15 已按 TDD 完成本地工程建设；实现范围为 `c8473eb04c93be39e604e68865806ea51c11a73b..19b8c8765704f2e6c88e007568f28eef32a4e830`。本完成记录提交不纳入范围，避免自指。Arc v8 现在停在**用户验收门槛**，不是线上发布状态。
>
> 最终审查修复包括 `165d1a6`、`c978312` 与 `19b8c87`。已关闭的重点问题包括：七张 planning 表使用 `(user_id, goal_id, id)` composite primary key 并重新生成同名 `0003_adaptive_planning`（无 `0004`、无 ALTER/DROP）；event 只接受当前首个 required primary；Today 使用 availability 时区的真实今天且 Stretch 只在 primary checklist 完成后显示；生产首读调用 guarded v7 upgrade；Flagship Setup 同步公共 Role；Path 显示 pending diff；版本不匹配保留历史；restoring/首次 cloud unavailable 不回退 legacy；Path 与 Today 的候选决策公告在 diff 卸载和 Rest/Open 转换后仍可播报。
>
> 最终 fresh Task 15 工程证据全部通过：`npm run test:unit` 为 96 files / 1093 tests；`npx tsc --noEmit`、`npm run lint`、`npm run build`（5/5）均 exit 0；rendered HTML 3/3；仅 `dist` 存在、`.next` 不存在；产物 secret 扫描与 Phase 2 provider / outbound `fetch` 扫描均 0 matches（`rg` exit `1`）；实现范围 diff-check 通过，提交前工作树干净。
>
> 两位独立 reviewer 的最终结论均为 **Critical 0 / Important 0 / Minor 0 / Ready Yes**。没有未解决的阻断或非阻断 finding。审查确认严格契约、确定性内核、append-only replay、owner/goal 与 CAS、请求/响应上限、私密错误、身份生命周期、v7 兼容、可访问性与 provider/secret 边界均满足已批准 Phase 2 规格。
>
> **下一步只接受显式用户选择。** 可以先做用户验收；通过后再分别决定是否本地合并、远程备份、编写发布方案、执行生产 D1 迁移、修改功能旗标或部署 Sites。当前没有 merge、push、PR、生产 D1 迁移、环境变量、线上配置或部署改动；公开生产仍是 Arc v7.2 / Sites version 9。不要重做 Phase 1，不要直接开始 Phase 3。
>
> 下方 2026-08-12 内容是历史检查点，仅用于背景，不再代表当前门槛。

**保存日期：** 2026-08-12

**当前阶段：** Phase 1 `Trusted Intelligence Kernel` 已完成并合并到本地 `master`；Phase 2 `Adaptive Planning Loop` 的交互设计与书面规格已获用户批准，详细 TDD 实施计划已保存到隔离分支。当前暂停在用户审阅并批准实施计划之前；没有开始 Phase 2 功能代码、测试或迁移。

**生产地址：** <https://arc-precision-path.jiahe-xu.chatgpt.site>

## 1. 当前权威状态

- 当前本地分支：`codex/v8-adaptive-planning-spec`
- 当前 Phase 2 规格提交：`7cb9181e959f4129acb253fc1fddee90efe36560`（`docs: specify v8 adaptive planning loop`）。本检查点自身的提交以恢复时的 `git rev-parse HEAD` 为准，避免自引用。
- Phase 2 规格分支基于本地 `master` 检查点 `fa9bc6c` 创建；`master` 中的 Phase 1 没有被重做或改写。
- Phase 1 完成提交：`a3df2688724f01d2c1ac5e9df3c2d9f3ca7db7c5`（`docs: close v8 intelligence kernel phase`）。本检查点自身的提交以恢复时的 `git rev-parse HEAD` 为准，避免在文档中写入自引用哈希。
- Phase 1 验证实现范围：`2825ff4..fe26ff27f914eb19c8c15a3fe11ed5cabf12c24b`
- 本地合并方式：从 `7861b8d` 快进到 `a3df268`，没有冲突或额外 merge commit。
- `codex/v8-intelligence-kernel` 分支已在确认合并后删除；对应隔离 worktree 已移除。
- 合并后的本地 `master` 已重新通过 67 个测试文件、616 项测试及 `npx tsc --noEmit`。
- 保存检查点前 `git status --short` 无输出。
- 本地 `master` 领先缓存的 `origin/master`；提交本检查点前差值为 24，保存后应使用 `git rev-list --count origin/master..master` 读取最新数量。
- 2026-08-10 曾尝试 `git fetch` / `git pull --ff-only`，但 GitHub 443 连接超时；因此没有刷新远程引用，也没有推送。

生产环境仍是 Arc. v7.2 / Sites version 9。当前公开网站、OAuth 配置、运行时变量、D1、R2、访问策略和生产 slug 均未因 Phase 1 改变。Sites version 6 仍是直接回滚基线。

## 2. Phase 2 已完成的规划工作

- 用户选择事件溯源式确定性规划内核，不采用快照式隐式重算或可变任务队列。
- 技能审计锁定为逐技能四级自评，并把轻量证据元数据与掌握状态分离。
- 工期冲突锁定为“完整范围、延后日期”与“保持日期、暂缓非核心能力”双方案确认。
- Today 锁定为每天一个主要可交付单元和至多一个可选 Stretch。
- 重排锁定为分级处理：完成自动滚动；延期、太难、已掌握和时间变化先预览差异再确认。
- 七日窗口锁定为用户当地今天起连续七个日历日，休息日仍显示在时间轴中。
- 自评独立技能必须通过校准关卡，不直接消失，也不在 Phase 2 授予 `Verified`。
- 可选证据只保存公共 HTTPS 链接、类型和简短说明；不抓取、不上传、不调用 AI。
- 用户逐段批准产品体验、领域契约、持久化、API、安全、视觉、测试和 Phase 2 完成定义，并统一反馈“全部符合”。
- 书面规格已保存为 `docs/superpowers/specs/2026-08-11-arc-v8-adaptive-planning-design.md`，自审无占位符、矛盾或范围越界，提交只包含该文档。
- 用户于 2026-08-12 明确批准 Phase 2 书面规格。
- 已使用 `writing-plans` 按当前真实代码结构编写 `docs/superpowers/plans/2026-08-10-arc-v8-adaptive-planning.md`，分为契约与策划数据、确定性内核、持久化/API、产品体验和最终工程门槛五个检查点。

当前门槛：必须先由用户审阅并明确批准 Phase 2 实施计划，然后选择执行方式。只有这两项完成后，才能创建独立实施 worktree 并开始 TDD；本分支不得直接写功能代码。

## 3. Phase 1 已完成的范围

- 严格、版本化的 Role Blueprint、Skill、Phase 与 Learning Resource Zod 契约；
- 16 项技能的确定性 Flagship 蓝图与资源注册表；
- 依赖图、阶段覆盖、资源双向引用、重复引用、来源与免费替代策略验证；
- 学习资源公共 HTTPS、真实日历日期及非公共主机拒绝规则；
- 六张非个人 D1 情报表、外键、索引与生成的增量迁移；
- 对不可信 repository 数据重新解析、只发布 `ready` 且 slug 匹配蓝图的 service；
- guest-safe、read-only 的 `/api/intelligence/flagship`；
- Stack 的 category、importance、claim confidence、why、mastery criteria、prerequisite 和完整资源证据展示；
- README、路线图、详细计划与工程完成记录。

最终新鲜证据：

- `npm run test:unit`：exit `0`，67 files / 616 tests；
- `npx tsc --noEmit`：exit `0`；
- `npm run lint`：exit `0`；
- `npm run build`：exit `0`，5/5；
- `node --test tests/rendered-html.test.mjs`：exit `0`，2/2；
- `dist` 中模型密钥模式：0 matches；
- Flagship 数据、service 与 API 路径中的模型 provider / outbound `fetch`：0 matches；
- 两位独立 reviewer 最终结论：Critical / Important / Minor 均为 0。

## 4. 明确未发生的动作

- 没有推送本地 `master`；
- 没有创建新的 PR；
- 没有执行 `drizzle/0002_product_intelligence.sql`；
- 没有生产 D1 迁移、R2 写入或数据修改；
- 没有启用功能旗标；
- 没有保存或部署新的 Sites 版本；
- 没有配置或读取 `OPENROUTER_API_KEY`；
- 已编写 Phase 2 实施计划，但尚未获得实施批准，也未开始执行；
- 没有开始 Phase 2 功能代码、测试或 `0003` 迁移文件；
- 没有开始真实 OpenRouter Research Beta（路线图 Phase 4）。

Phase 1 新表目前只是未来版本发布的结构预留；运行中的 Flagship 读取源仍是 `BuiltinIntelligenceRepository`，所以不要把生成迁移误认为已经执行。

## 5. 下一次继续时的权威下一步

### A. 审阅并批准 Phase 2 实施计划（当前推荐路径）

先读取 `docs/superpowers/plans/2026-08-10-arc-v8-adaptive-planning.md`，并与已批准规格逐项核对。如果用户要求修改，只修改计划和检查点并重新自审；如果用户明确批准计划，再让用户选择“子代理逐任务执行”或“当前任务内分批执行”。选定方式前仍不写功能代码。

### B. 远程备份

如果用户改选远程备份，先恢复 GitHub 网络、刷新远程引用并确认远程没有新提交。不得从当前规格分支推送到 `master`，不得 force push；先形成安全集成/推送方案并单独获批。

### C. 受控发布规划

如果用户改选公开发布，先写独立发布方案；推送、D1 生产迁移、功能旗标和公开部署仍是不同授权动作。当前 Phase 2 规格分支不得直接部署。

## 6. 仍保留的 v7 安全与基础设施待办

以下项目没有被 Phase 1 错误标记为完成：

1. 使用安全、未归属的身份完成真实 second-provider linking；
2. 补充 replay 与 application-bypass 生产证据；
3. 补充 account-link event-log 证据；
4. 成功关联后验证两个 provider 返回同一 Arc. 用户且云端状态连续；
5. 验证 R2 私有 Proof put/get 与 metadata compensation；
6. 修复不阻塞应用的 `/favicon.ico` 404。

## 7. 下次恢复流程

1. 读取本文件、Phase 2 书面规格、Phase 2 实施计划、v8 总路线图与 Phase 1 完成记录；
2. 运行 `git status --short --branch`、`git log -5 --oneline`、`git rev-parse HEAD`；
3. 确认当前分支包含 `7cb9181` 且工作树干净；若用户位于 `master`，切回 `codex/v8-adaptive-planning-spec` 前先确认没有未提交修改；
4. 不要重做 Phase 1，不要重新询问已经批准的七项 Phase 2 产品决策，也不要重新设计已批准书面规格；
5. 当前只等待用户审阅实施计划。用户明确批准计划并选择执行方式后，才允许创建独立实现 worktree 并按 TDD 开始；不要在规格分支直接写代码；
6. 未经后续独立批准，不合并、不推送、不迁移生产 D1、不启用旗标、不部署、不发起真实 OpenRouter 请求。

当前权威文档：

- 产品规格：`docs/superpowers/specs/2026-08-09-arc-v8-product-intelligence-design.md`
- Phase 2 书面规格：`docs/superpowers/specs/2026-08-11-arc-v8-adaptive-planning-design.md`
- Phase 2 实施计划：`docs/superpowers/plans/2026-08-10-arc-v8-adaptive-planning.md`
- 五阶段路线图：`docs/superpowers/plans/2026-08-10-arc-v8-product-intelligence-roadmap.md`
- Phase 1 完成记录：`docs/superpowers/plans/2026-08-10-arc-v8-intelligence-kernel.md`

## 8. 用户恢复口令

一般恢复：

> 继续 Arc v8。请先读取 `docs/operations/v8-resume-checkpoint.md`，从合并后检查点继续，不要重做 Phase 1，也不要直接部署。

继续审阅 Phase 2 规格：

> 继续 Arc v8。读取恢复检查点和 Phase 2 书面规格，从规格审阅门槛继续，不要重做设计，也不要直接写代码或部署。

批准书面规格并开始实施计划：

> 批准 Phase 2 书面规格。请使用 writing-plans 编写详细实施计划，不直接写功能代码。

审阅并批准实施计划：

> 继续 Arc v8。读取恢复检查点、已批准的 Phase 2 书面规格和详细实施计划，从实施计划审阅门槛继续，不要直接写代码、迁移或部署。

准备远程备份：

> 继续 Arc v8。先核对本地与 `origin/master`，形成安全推送方案，获得我的批准后再推送。

即使关闭电脑或 Codex，只要本地仓库仍可访问，就可以通过本检查点和 Git 历史继续。

## 9. 本地环境提示

用户级 `.npmrc` 的 npm cache 可能指向不可写位置。不要修改全局配置；安装依赖时使用临时可写缓存：

```powershell
npm install --cache "$env:TEMP\arc-npm-cache"
```

运行全仓 ESLint 时继续排除生成目录和嵌套 worktree：

```powershell
npx eslint . --ignore-pattern dist --ignore-pattern .next --ignore-pattern .worktrees
```
