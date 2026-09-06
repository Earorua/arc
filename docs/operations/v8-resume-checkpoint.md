# Arc. v8 Phase 2 规格恢复检查点

> **2026-09-07：保持公开访问、关闭 Research 的 v8 本地发布准备与双审完成（当前最高优先级）**
>
> 用户接受“关闭 Research 入口的小范围 v8 发布”准备路线，并要求网站顶部显示 `The website is currently under development.`。Root 核对权威 worktree、既有分支及干净 `e2871a667dd2ded23f429f362024a00125c316a6`，设计/计划先保存为 `f7e0583`，见 `docs/superpowers/plans/2026-09-07-arc-v8-research-closed-release.md`。本轮新路线不要求先取得 Research 真实成功，后续开启 Research 才继续其独立验收；登录、数据迁移和恢复等发布条件仍保留。
>
> 新提示采用根布局静态 note、精确英文、自然换行与正常文档流；同时修正关闭新准入但存在恢复槽时仍邀请 Research this role 的文案。独立只读审查确认无需后端改造，显式 `ARC_AI_RESEARCH_ENABLED=false` 可关闭新建/重试，Ready/recovery/Flagship/规划/Proof 保留既有路径及过期限制。旧 preview 单独使用 MockAiProvider，本轮不改全局 ARC_AI_ENABLED。cohort `{}` 不是空名单；关闭也不会取消在途 Research/Repair，GET 恢复可能对账写入。
>
> Root 新鲜完整单测 **138 文件/2,643 测试（72.11 秒）**、非增量类型、完整 lint、五阶段 build 均通过。实际产物 HTML 使用惰性 DOM 检查，最终 **4/4（2,027.1421 ms）**；修正的是把 React script 中的同一文字计成第二条横幅的测试断言，产品实际只有一个 note。Root 最后定向回归 **20/20（7.82 秒）**；独立规格审查 **0/0/0 READY**，随后独立质量/安全审查也 **0/0/0 READY**。最终提交与备份待完成，尚不能宣称本轮提示已在公开站点显示。
>
> 操作清单在 `docs/operations/v8-research-closed-release.md`；用户已明确选择 **保持公开访问，仅关闭 Research**，替代本人验收的初稿假设，“小范围”指功能范围。当前阶段不操作生产变量/旗标/D1/R2/访问策略，不保存 Sites 候选或部署，不合并 master/创建 PR，不读取真实 Key/env/原始输出或发新 Provider 请求。完成后沿用已批准普通开发分支备份，无需再次询问同一许可。

> **2026-09-06：保留旧版本兼容性演练、双审与开发分支备份完成（当前最高优先级）**
>
> 用户在收到下一步兼容性方案后指示“逐步完成你认为目前可以做的任务”。Root 从干净 `271f957fad68b14c764c7432c97290bac641cabb`、既有 `codex/v8-openrouter-research-beta` 开始，已在 `3ce529a` 保存设计与计划：`docs/superpowers/plans/2026-09-06-arc-v8-retained-compatibility.md`。只新增隔离测试及文档，继续子代理/TDD/规格后质量审查；完成后普通备份同一已授权公开开发分支。不要新建 worktree 或重做产品 Tasks 1–12。
>
> 独立只读归档审查已完成。有效首个 RED：0/1，exit 1，263.484 ms，明确为 `Retained compatibility not implemented`；此前 spawn EPERM 只是无效启动。Root 初版新演练 **3/3（30,383.445 ms）**、应用回归 **137 文件/2,641 测试（53.74 秒）**、非增量类型检查、完整 lint 均通过。实际八类差异使 `rollbackEligible: false`；5 库健康、非目标 owner 54 行保留、生产 factory/adapter 未加载，Research fallback 503 且额外 Fake 调用为 0。独立规格审查提出的三项 P2 证据缺口已修正，代码复审无剩余发现。Root 修正后演练 **3/3（39,150.1438 ms）**、非增量类型检查与完整 lint 均通过；混合基线 50 行/2 对象在生成和混合操作后相等，foreign 负例与非空分享前后相等。独立规格审查 **0/0/0 READY**；随后独立质量/安全审查也为 **0/0/0 READY**；本轮实现已在 `03fc035f98d33831a42874acee3bcb96273de957` 本地提交并完成普通 GitHub 开发分支备份。
>
> 演练已经观察旧服务与 v8 规划完成、Proof 版本/状态、目标切换和分享格式的差异。旧归档无 Proof ledger 修订/撤回/Proof 删除/用户删除入口，不能以 SQL 探针冒充这些旧功能。完整矩阵见 `docs/operations/v8-retained-compatibility.md`；回滚及外部门槛见 `docs/operations/v8-release-gates.md`。真实 Research 403、OAuth、生产恢复点/ledger/绑定和 artifact 恢复执行仍未验证。
>
> 用户询问当前公开版本后，已只读核对 Sites：站点 active/public，version 9 源码为 `7ca5b530dfc58f3cbc700b44a7a881a9bd661209`，v7.2 已记录部署 `appgdep_6a728790e0608191bf1286c3a9a3ccfd` 返回 succeeded，与版本 ID 和公开 URL 一致。当前公开仍为 Arc v7.2，Arc v8 尚未上线；该元数据核对不是 artifact 可恢复性验收。
>
> 恢复时先核对 Git 状态和检查点，不重做本轮已完成的演练。实现提交 `03fc035f98d33831a42874acee3bcb96273de957` 已验证本地/远端开发分支一致，远端 master 保持 `f6c3cddbe6d3f177f3681b355142daad84f2330e`。本条完成记录随后单独保存；最新记录提交以当前 Git HEAD 为准。下一步按 release-gates 处理真实 Research、真实 OAuth、生产基线/恢复与 artifact 条件，不重复消耗任何真实请求许可。本轮不新增 Provider GET/Research/Repair/换模型、不读取真实 Key/env/原始输出，不操作生产、master 合并、PR、Sites 候选或部署。

> **2026-09-06：合成旧数据演练、双审及开发分支备份已完成（当前最高优先级）**
>
> 用户在公开开发分支备份完成后回复“继续推进”，继续前述本地合成旧数据升级/恢复演练。起点为干净 `f2874d95aa5f8bbe48494aef3768be29c197dcee`；设计与计划已在 `9a6e78885abbe57db9c5806494f50b7f8af85178` 保存，见 `docs/superpowers/plans/2026-09-06-arc-v8-legacy-recovery.md`。只增加隔离的测试工具、合成 fixture 和证据文档；产品代码、迁移、依赖和生产配置不变。用户已批准子代理驱动、TDD、独立规格审查后质量/安全审查；不要重复询问同一流程许可。
>
> 归档 v7.2 为 0000–0001，20 张表；目标 v8 为 0000–0006，41 张表。独立只读归档/fixture 审查完成，root 已确认 SQL 相等及旧完成记录使用 unit ID 的语义。初始 RED 0/1、扩展 RED 0/5 后，子代理实现 GREEN；root 独立运行 `node --test tests/offline-uat/legacy-recovery.test.mjs` **5/5 通过（38,478.01 ms）**：20 张表的 50 行、2 个附件完整升级/恢复，27 张表时的真实 SQL 中断恢复成功，七项恢复前拒绝及六项约束/原子拒绝无错误写入，非持久化 runtime disposed。使用受支持的 quick_check 与 foreign_key_check，完整 integrity_check 被 workerd 拒绝，不能冒称通过。root 新鲜应用回归 **137 文件/2,641 测试（74.95 秒）**、非增量类型检查、完整 lint 均通过。独立规格审查 **0/0/0 READY**，随后质量/安全审查也 **0/0/0 READY**，公开备份范围未发现真实凭据或私人 payload；最新证据及哈希在 `docs/operations/v8-legacy-recovery-rehearsal.md`。
>
> 演练和双审已完成；root 保存八个预期测试/文档文件为 **`a3678c44c8ccdfebea89878795202ec5823b108d`**，并按已确认范围普通快进备份同一公开开发分支。独立远端读取确认 SHA 与本地一致，工作树干净；远端 master 仍为 `f6c3cddbe6d3f177f3681b355142daad84f2330e`，主工作树干净且 HEAD 仍为 `f0f88b2ebdb61e2951c9d1d6c0004319c131eafa`。该分支/提交的 Actions 查询为 0 次运行，不冒称新 CI 通过。本完成记录随后以文档提交同步到同一分支，最终交接核对包含记录的实际 SHA。不得合并 master、创建 PR、部署或操作生产。两次真实 Research 仍均为 403 且许可已消耗，本轮没有新增请求/Repair/模型切换或真实 Key 读取。合成本地逻辑恢复不代表生产原生备份、旧应用完整兼容或真实验收通过。下一项可独立推进的本地工作是保留旧应用对升级后数据的读写兼容性演练，不能以本轮 SQL 约束测试替代。

> **2026-09-06：公开开发分支备份与本地发布准备已完成（当前最高优先级）**
>
> 用户对公开仓库、分支源码/文档及完整历史的精确确认回复 **“允许”**。Root 随后普通推送 `codex/v8-openrouter-research-beta` 至 `https://github.com/Earorua/arc.git`，新分支创建成功；独立远端读取确认 **`70eb49d8842468dab7c1f946cd368742a8da9f90`** 与本地一致，master 仍为 **`f6c3cddbe6d3f177f3681b355142daad84f2330e`**，工作树干净。对应分支/提交的 Actions 查询为 0 次运行，符合仅 master push/PR 触发的配置，不冒称新的 CI 通过。本完成记录随后以文档提交同步到同一备份分支；最终交接核对包含本记录的实际本地/远端 SHA。无需再次索取已明确授予的同一备份许可。
>
> 本地完整历史备份包已生成并通过 `git bundle verify`：`outputs/backups/arc-v8-70eb49d8842468dab7c1f946cd368742a8da9f90.bundle`，3,787,181 字节，SHA256 `dccefaa26aa899893c8f694125f9406907879aca096b38d23fc6d2f7f2aa01d2`。该包固定至 `70eb49d`，不包含随后备份完成记录，也不是 D1/R2 或浏览器数据备份。
>
> 用户针对客服等待时间提出继续推进，并接受“先将当前开发分支备份到 GitHub，再推进本地发布准备”，回复“按照你说的继续”。按 `docs/superpowers/plans/2026-09-06-arc-v8-branch-backup-local-readiness.md` 从干净 **`d59af3388cc2dbeb0a63dff2d8c0c2e96b8824b6`** 开始。本授权允许在 Research 真实验收未通过时，单独普通推送 **`codex/v8-openrouter-research-beta`** 到已确认的 `https://github.com/Earorua/arc.git`，并完成本地迁移、配置、备份/回滚准备；覆盖下方“所有推送均等待真实验收”的旧顺序。先做公开源码和推送触发检查、必要本地验证，再推送并核对远端精确 SHA。
>
> **本轮不合并 master、不创建 PR、不保存 Sites 候选、不部署、不操作生产变量/旗标/D1/R2。** 两次 Research 许可仍已消耗，不新增真实请求、Repair 或模型切换；403 未定因，客服草稿未发送，测试 Key 撤销未确认。GitHub 备份不代表完整目标 2 或目标 3 验收通过。已在 `304e0eff096cb5c8d37e17dc7a1ea5e53abf9b77` 保存备份计划；root 在本地准备轮运行完整单测 **137 文件/2,641 测试（47.95 秒）**、类型、lint、构建 5/5、渲染 4/4，以及实际隔离 workerd D1 9 步/5 冲突，均通过。独立公开源码审查 **0/0/0，READY**。最初推送在创建进程前被自动审批拒绝；随后获得用户对精确目标和内容的明确授权，再执行同一普通推送成功，没有绕过拒绝。
>
> 已在 `70eb49d` 完成并保存 `docs/operations/v8-local-release-readiness.md`：七份迁移与构建内 SQL 校验和对照、配置规则清单、旧用户数据升级证据缺口、备份/回滚顺序、历史 version 9 与 version 6 的区别。独立规格审查修正一项文档 P2 后 **0/0/0 READY**，随后质量/安全审查也 **0/0/0 READY**；没有产品代码改动。下一项无需等待客服的本地工作是完整合成旧数据升级/恢复演练；不能将本次最小种子/新库 smoke 冒充该演练已经完成。以下较早记录中的“GitHub 备份未完成”及“所有推送等待真实验收”仅为历史状态，以本条为准；真实验收与合并/发布门槛保持不变。

> **2026-09-06：额外 1 次真实 Research 已执行并再次 403；授权已消耗，转向客服核查（当前最高优先级）**
>
> 用户在授权后运行隐藏入口并回复“已运行”。Root 核对权威工作树、`codex/v8-openrouter-research-beta` 和干净执行 HEAD **`7409fbd8c509bc567a68dd35a61551b1e44258d6`**（诊断实现 `31755b39ccef8592512b23711c3b8a9278534c08`），只读取新增白名单摘要 `outputs/live-research/summary-2026-09-06T09-57-33-859Z.json`。结果 **live-one / incomplete / research-failed**：Key **200 / complete / 1,390 ms**，Research **403**；真实请求 **2**（Key GET 1、Research POST **1**）、Repair **0**。
>
> 新诊断实际生效：`httpStatus: 403`、`location: http-error`、`errorCode: 403`、`errorCodeState: recognized`、`errorType: null`、`errorTypeState: missing`。这表示已解析错误未提供可用的标准类型，不证明具体拒绝原因，也不证明一定到达了上游 Provider；不读取原始 message/metadata 或新增实验诊断请求。固定请求模型 Sol，actualModel/usage 均 null；run `1017b0b3-d011-4b17-ad0f-62e8af4d33f2` failed，引用/技能 0、audit 1。本地 5,000,000 micros 预留 released、settled 0；owner 和第二次 Research 拒绝检查 true，未激活账户/生成规划，数据库 disposed。**本地释放预留不是 Provider 最终零扣费证明。** 摘要 SHA256：`eba89578f1ca457974d1d8c45d74b31aea3bae4991e54c71c40d6eeef58c1a87`。
>
> 两次分别授权的 Research 均已使用、均为 403；当前没有第三次或自动重试/Repair/换模型授权。按诊断计划，标准类型缺失后保持原因未知，更新 `docs/operations/v8-openrouter-support-note.md` 供用户提交官方支持；草稿仍未发送。用户在本次 **北京时间 2026-09-06 17:57（UTC 09:57）** 实测后提供 Activity 截图：Overview、GMT+8、Past 1 Month，Total spend **$0.00**、Requests **0**、Token volume **0**，Top API Keys/Top Apps 显示 No data in this window。这只证明截图中当前范围的概览未显示用量，不冒充单条 Explore 明细、最终结算或具体拒绝原因。测试 Key 的事后撤销尚未确认。下一步由用户撤销测试 Key，并提交含两次时间窗及概览观察的脱敏说明；不要直接重跑 `-ExecuteOne`。真实验收、合并与 GitHub 备份仍未完成；生产变量/旗标/D1/R2、Sites 候选和部署仍禁止。
>
> 本次仅保存实测证据和客服草稿，不改实现或重跑已通过的离线测试；原 137 文件 / 2,641 测试及双审仍只对应已记录的诊断实现。安全摘要继续保留在 Git 忽略的本地输出目录，不附加目录、凭据或原始日志到客服材料。

> **2026-09-06 历史授权：额外 1 次真实 Research 的隐藏输入交接（已执行，见上方）**
>
> 用户在诊断实现双审及本地保存完成后回复“授权再运行 1 次真实 Research”。本次核对实现提交 **`31755b39ccef8592512b23711c3b8a9278534c08`**、`codex/v8-openrouter-research-beta` 分支和干净工作树。该授权覆盖同一 `openai/gpt-5.6-sol`、真实验证总预算至多 **5 美元**、一次新的 Key GET 预检和通过后的至多 **1 次额外 Research POST**；无自动重试、Repair 或模型切换。原 04:23 Research 的授权仍已消耗，不得与本次新增许可重复计算。
>
> 实现和执行入口未变。本次仅保存授权文档；用户在本地交互 PowerShell 运行 `scripts/live-research/run.ps1 -ExecuteOne`，仅在隐藏提示输入原限额测试 Key，不向代理提供 Key。脚本会重新核对限额、剩余、usage/BYOK、有效期及非管理 Key 条件；预检不通过即停止。当前尚未运行本次入口、没有新增真实请求或结果。交接前最后摘要文件名为 `summary-2026-09-06T09-36-14-251Z.json`；此前确认其为 offline/realRequestCount 0。
>
> 用户回复“已运行”后，只读取此次新增的白名单 `live-one` 摘要，核对 `researchFailureDiagnostic`、请求计数、HTTP、usage/cost 和原验收门槛；保留精确摘要哈希及执行代码提交。无论失败、超时或结果缺失，都先检查证据，不能自行再运行命令或假定尚未消耗许可。恢复时先判断本次是否已执行，不要因下方旧授权状态重复索取同一许可。若仍无已识别错误类型，保持 403 原因未知并转向未发送客服草稿，不能猜测或反复请求。真实验收通过前不合并、推送；生产操作、Sites 候选和部署仍禁止。

> **2026-09-06：已完成暂停 RED 后的错误诊断实现、离线验证和双审（当前恢复入口，覆盖下方历史暂停状态）**
>
> 已完整读取本检查点和 `docs/superpowers/plans/2026-09-06-arc-v8-provider-error-observation.md`，核对权威工作树、`codex/v8-openrouter-research-beta` 分支及干净暂停 HEAD。首个 callback RED 已新鲜复现；仅四个实现/测试文件接入纯白名单提取、已有三个错误边界的可选回调和本地 summary 独立快照。HTTP 状态/数值错误码及其有效性、27 个精确错误类型及 missing/invalid/unrecognized 状态可以记录，原始 message/metadata/标识符不输出；不改变模型请求、错误映射、计费判断、取消或超时。
>
> 实现者相关回归 **407/407**（诊断套件 108）；root 最终全套 **137 文件 / 2,641 测试**（43.62 秒）、非增量 TypeScript、定向 ESLint 和 diff 检查通过。独立规格审查 **P0/P1/P2 0/0/0，READY**（静态审查）；随后独立质量/安全审查同为 **0/0/0，READY**，另做实际 adapter 的 **24 个纯内存合成案例全部通过**、未处理拒绝 0，diff 检查通过。两次审查对应同一冻结四文件，未冒称复跑 root 全套。准确 RED 及验证范围见诊断计划，不将新增测试首次 GREEN 冒称为全部曾 RED。
>
> 本地交付范围仅四个诊断实现/测试文件与三份进度文档；包含本条的 Git 提交记录该交付，最终交接记录实际提交 SHA 和提交后干净状态。下次恢复先核对 `pwd`、分支、HEAD 和工作树，再读取本条及诊断计划；不要回到下方历史 RED 或重做已通过的实现与本地验收。下一步是取得额外一次真实验证的明确授权，或由用户使用未发送的客服草稿继续诊断。
>
> 当前没有新的真实 GET 或 Research，原 04:23 失败摘要与 05:49 账户摘要哈希均未变；真实 403 仍未定因，唯一一次原 Research 授权已消耗。之后如要用同一 Sol、总预算至多 5 美元、仅再一次 Research 且无自动重试/Repair 做进一步验证，必须在工具双审及本地保存后取得新的明确授权；不要自行运行 `-ExecuteOne`。客服说明仍未发送，Key 仍未确认撤销。4179 预览当前不可连接，未重启或重置。本轮无合并、推送、生产操作、Sites 候选保存或部署。

> **2026-09-06 历史暂停记录：用户准备关闭 Codex（已由上方完成记录取代）**
>
> 权威工作树：`C:\Users\XF\Documents\Codex\2026-07-26\sites-plugin-sites-openai-bundled-2\.worktrees\v8-openrouter-research-beta`；分支 `codex/v8-openrouter-research-beta`。最后完整验证通过的实现提交为 **`748cc264e57a35171b43cfee1f336b6a07e4b139`**（136 文件 / 2,533 测试）。本次只保存其后的账户实测证据、诊断计划、未发送的客服说明和一个明确未完成的 RED 测试；不是诊断实现通过或真实验收通过。
>
> **已完成：** 用户只读实测 Key/Catalog 200/200、Sol 列出、限额/剩余 5/5 美元、usage/BYOK 0/0，详见紧接下方证据。唯一一次 Research 仍为此前 403，原因未知，无新增 POST。最新 Key 状态仍为用户确认未撤销。客服草稿 `docs/operations/v8-openrouter-support-note.md` 未发送。
>
> **暂停位置：** `docs/superpowers/plans/2026-09-06-arc-v8-provider-error-observation.md` 的首个 TDD RED 已观察：`tests/server/provider-failure-diagnostic.test.ts` 唯一测试因回调应调用 1 次、实际 0 次而失败，exit 1；旧错误映射/计费断言先通过。纯提取器尚未创建，`app/server/research/openrouter-provider.ts` 和 `scripts/live-research/validation.ts` 均未修改；无 GREEN、无新实现的规格/质量审查。当前快照故意保留该 RED，不应称为全套测试通过。实现代理已停止，没有未结束的测试或真实请求。
>
> **恢复顺序：** 先运行 `pwd`、`git status --short --branch`、`git rev-parse HEAD`，核对本暂停快照及干净工作树；完整读取本检查点和上述错误观察计划，从现有 RED 接着实施可选白名单错误观察。遵循子代理 TDD、规格审查、质量/安全审查和 root 验证流程，完成后再决定是否申请另一次单独授权的真实验证。不要重做 Tasks 1–9、Task 12 或已验收的本地主流程，不要把“继续”当作额外付费请求授权。
>
> 继续保留 **Sol / 总预算至多 5 美元 / 无自动重试与 Repair** 的边界；第二次 Research **尚未获准**。不读取或保存真实 Key、环境文件、原始 Provider 错误；不操作生产变量/旗标/D1/R2，不合并、推送、保存 Sites 候选或部署。4179 Fake 预览未主动停止或重置；其数据库为进程内临时状态，关闭应用/进程后不保证保留。恢复先检查原预览，勿自动重置；代码和已写入文件的验收证据已保存在本地仓库，不等同于 GitHub 备份。

> **2026-09-06：只读账户实测完成；Key/目录均 200，Sol 列出，Research 403 尚未定因**
>
> 用户在干净 `748cc264e57a35171b43cfee1f336b6a07e4b139` 上运行 `-CheckAccountOnly` 并回复“已运行”。新摘要 `outputs/live-research/summary-2026-09-06T05-49-11-188Z.json` 为 `account-check-only / completed`：Key **200 / 5,408 ms**、目录 **200 / 1,386 ms**，均 complete 且无 failure；`openai/gpt-5.6-sol` 列出。Key 限额/剩余 **5/5 美元**，观察用量/BYOK **0/0 美元**；总真实请求 **2 GET**，Research/Repair **0/0**。SHA256：`ed18cec0a545bac31b77b0204c9f260c984e30dc1a753b2def8955e7af551b0b`。这不是账户余额查询或此前最终零扣费证明，也没有验证完整 Research 参数组合。
>
> 独立只读检查未发现可证明的请求构造错误。已定位证据缺口：现有适配器丢弃 Provider 的固定错误类型，仅把 403 归为 unavailable。依照 `docs/superpowers/plans/2026-09-06-arc-v8-provider-error-observation.md` 准备可选白名单错误观察及客服说明；不重新读取响应、回显原始错误或修改请求参数。完成 TDD、规格后质量/安全双审、本地验证和保存后，才能提出另一次单独授权的验证。当前唯一 Research 授权已消耗，没有新增 POST；密钥仍未确认撤销。合并、推送、生产操作和部署均未执行。

> **2026-09-06：只读账户诊断已通过本地验证与双审；等待用户运行**
>
> 用户最新确认“个人账户。本次测试 Key 没有撤销”，此前答复 Activity“未找到记录”。企业专用 IP 允许列表不适用于所述个人账户；其他拒绝原因仍未知。已依照 `docs/superpowers/plans/2026-09-06-arc-v8-readonly-account-diagnostics.md` 完成独立 `-CheckAccountOnly`：最多一次 Key GET 和一次账户模型列表 GET，仅输出经验证的 Key 用量数字、状态/固定失败类别及 Sol 是否列出，不创建 Research、审计、预算预留或数据库。密钥仍由用户在本机隐藏提示输入；原有 live/key-only 的未使用 Key 策略不变。
>
> 最终专项 **175/175**、root 全套 **136 文件 / 2,533 测试**（58.95 秒）、非增量 TypeScript、定向 ESLint 和 diff 检查通过。初次质量审查的一个 P2（HTTP 200 同时携带 data/error 被误判完成）经 **18 RED** 后修复；规格复审和质量/安全复审均 **P0/P1/P2 0/0/0，READY**，另分别独立通过 22/22、6/6 合成验证。本地保存后的交接命令为 `powershell -NoProfile -ExecutionPolicy Bypass -File "<authoritative-worktree>\scripts\live-research\run.ps1" -CheckAccountOnly`；用户输入现有测试 Key 后回复“已运行”，只读取新 `account-check-only` 脱敏摘要。
>
> 当前没有新增真实账户查询结果或 Research 成功证据；唯一 Research POST 已消耗，未经另行明确授权不可重试。测试生成的 account-mode 摘要已仅按自身精确路径清理，保留的新摘要均为 offline/realRequestCount 0，原 Research 403 摘要 SHA256 不变。没有 Activity 记录不证明零扣费，目录列出模型也不证明完整 Research 请求可用。撤销 Key 尚未完成，待本次只读观察后再次处理；不宣称已撤销。合并、推送及部署仍未执行。

> **2026-09-06：首次真实 Research 返回 HTTP 403；唯一一次 POST 已使用，真实验收未通过**
>
> 用户确认“OpenRouter 账户本身已有可用余额”后，在干净 `31f80525c0efe556146f2830b1c049f1055de964` 上手动运行 `-ExecuteOne`。脱敏摘要 `outputs/live-research/summary-2026-09-06T04-23-53-054Z.json` 为 `live-one / incomplete / research-failed`：Key HTTP 200、complete / 2,078 ms；Research HTTP **403**、POST **1**、Repair 0，总真实请求 2（含 Key GET）。run `62288a2f-5218-40ae-9c1a-8e33ebd4ac73` 为 failed；实际模型和 usage 均为空，引用/技能为 0，audit 1；本地 5,000,000 micros 预留 released、settled 0，所有权及第二次 Research 拒绝检查通过，未激活账户或生成规划，数据库已销毁。
>
> 摘要 SHA-256：`61583f2d3999c2f7c93d92ccd32362602f0628cb9a2a3769c84799048d4819f7`。主代理仅读取白名单摘要，没有读取 Key、环境文件或原始错误正文。账本释放不等于 OpenRouter 零扣费证明；实际费用待用户账户活动记录核对。403 不能单独确定具体权限、规则或内容拦截原因；现有适配器将其归为不可重试的 unavailable，没有保留更细错误消息。没有证据支持更换模型、增加余额、放宽隐私策略或修改代理配置。
>
> **恢复下一步：** 请用户在 OpenRouter Activity 查看北京时间 2026-09-06 12:23 左右这次 Sol 记录，仅提供不含密钥/账户标识的错误短句及费用；没有记录时如实说明。按既定计划撤销本次测试 Key，确认情况即可。不得再次运行 `-ExecuteOne`；任何第二次 Research 必须先查明原因并取得新的明确授权。真实门槛仍未通过，因此尚未合并、推送或部署。本次仅保存证据文档，不改代码或运行配置，不重跑已通过的全量离线测试。下方更早的“尚未调用 Research / 唯一请求未使用”均为历史状态，由本条覆盖。

> **2026-09-06：用户 Key 已通过认证及限额检查；尚未调用 Research**
>
> 在干净 `0fb4305cf9b850b91abe692392b78b834513c027` 上，新摘要 `outputs/live-research/summary-2026-09-06T04-02-11-596Z.json` 为 `key-check-only / passed`、Key HTTP **200**、阶段 complete、failure 为空、耗时 **9,863 ms**；GET 1、Research POST **0**、Repair 0、无 run/audit/usage/reservation，数据库销毁。主代理仅读取白名单摘要，没有读取 Key。现在已验证密钥和既定额度策略通过，不能将此当成真实 Research 成功。
>
> 成功检查距旧 10 秒期限只有 137 ms 余量，现已将只读 Key 期限放宽到 **30 秒**；TDD 3 RED→49 GREEN，规格和质量/安全两轮对代码/测试均为 P0/P1/P2 0/0/0、READY。Root 完整单测 **135 文件 / 2,407 测试通过，41.82 秒**，非增量类型/目标静态/diff 检查通过。Research 仍 120 秒，PowerShell 子进程仍 180 秒，模型 Sol、预算 5 美元、一次 POST、Key-only 禁止 POST、无自动重试均不变。该调整不证明前两次失败的具体原因。已异步询问用户账户是否有可用余额（Key 限额不等于充值余额）；待回答且改动保存后，下一步使用原 `-ExecuteOne` 命令进行唯一真实研究，不必为期限修改再跑一次 Key-only。尚未合并、推送或部署。

> **2026-09-06：Key-only 诊断入口已通过检查，下一步由用户运行 `-CheckKeyOnly`**
>
> 用户要求“继续帮我解决api key的问题”。从干净 `6e14cbaad0644f2bc7b5de1545a753988f39cacb` 继续，最新用户摘要仍为 03:30 的 `key-check-failed / Research POST 0`。按启动器相同的子进程环境设置，无认证公开模型接口返回 200 / 1,362 ms，无认证 Key 接口返回预期 401 / 2,200 ms；未读取 Key，未调用模型。不能据此证明用户 Key 有效，也没有证据要求恢复 `NODE_OPTIONS`、改代理或放宽 TLS。
>
> 最小诊断扩展已完成 TDD（11 RED→48 GREEN）、独立规格后质量/安全审查（两轮 P0/P1/P2 均 0/0/0、READY）。Root 最终完整单测 **135 文件 / 2,406 测试通过，45.95 秒**，非增量类型/目标静态/diff 检查通过；实际默认 PowerShell 演练 `outputs/live-research/summary-2026-09-06T03-55-04-760Z.json` 为 `offline-dry-run / passed`、真实请求 0。
>
> 新入口为 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/live-research/run.ps1 -CheckKeyOnly`，仅一次 GET，传输层强制禁止 POST，独立 `key-check-only` 模式；新字段 `keyDiagnostics` 只含固定阶段/失败类别及 0–10,000 ms 耗时。用户仍在隐藏提示输入 Key，运行后说“已运行”即可；主代理读取新 `key-check-only` 摘要，依据 HTTP 状态和阶段类别判断。仍保留 10 秒 Key 检查期限、120 秒 Research、Sol、5 美元、无自动重试。**Key-only 的 passed 仅代表密钥检查通过，不能作为真实研究成功证据。** 目前尚未证明用户 Key 有效，也未完成真实研究、合并或推送。

> **2026-09-06：5 美元入口已保存；前两次用户启动均停在 Key 预检，Research 请求仍为 0（覆盖下方 1 美元状态）**
>
> 用户问 `outcome` 和 `Summary` 在哪里获取，并说明“另外我设置了5美元的限额，会宽裕一点”。已告知终端会打印 `outcome`，末行 `Summary:` 是摘要完整路径；摘要位于 `outputs/live-research/`。按最新设置将本轮上限同步到 **5 美元**，仍固定 `openai/gpt-5.6-sol`、只执行一次 Research、无自动重试/Repair。
>
> 在干净 `320bd2d9ed90d9c38f4770b391e8a279d6fed925` 上，用户已手动启动工具。安全摘要 `outputs/live-research/summary-2026-09-06T03-14-44-044Z.json` 为 `live-one / incomplete / key-policy-denied`，Key GET HTTP 200、Research POST **0**、Repair 0、无 run/usage。5 美元 Key 超过旧入口的 1 美元上限，尚未调用模型。主代理仅读取白名单摘要，未读取 Key 或原始账户元数据。
>
> 用户在干净的 5 美元入口提交 **`9fbf233ed3f9bc7b5d1fc5fc4bc54b4cf7c8a4b5`** 上再次运行。最新摘要 `outputs/live-research/summary-2026-09-06T03-30-05-252Z.json` 为 `live-one / incomplete / key-check-failed`，Key/Research HTTP 状态均为空，一次 GET 尝试、Research POST **0**、Repair 0、无 run/audit/usage/reservation，数据库已销毁。生成耗时约 10 秒，与 Key 预检期限吻合，但不能从安全摘要断言具体网络原因。随后无密钥的公开模型元数据连通性检查：Node HTTP 200 / 905 ms，系统 PowerShell HTTP 200 / 650 ms；不代表刚才的认证预检成功。未修改实现或超时。下一步仍为用户手动执行原隐藏输入命令；两次均未消耗唯一 Research 请求，不自动重试，也不提前合并/推送。
>
> 5 美元更新已完成 TDD（16 RED→38 GREEN）、规格和质量/安全审查（两轮 P0/P1/P2 均为 0/0/0）。Root 最终完整单测 **135 文件 / 2,396 测试通过，44.11 秒**，非增量类型、目标静态、diff 检查通过。默认 PowerShell 演练摘要 `outputs/live-research/summary-2026-09-06T03-22-31-042Z.json` 为 `offline-dry-run / passed`、真实请求 0、5,000,000 micros 预留及 Ready/账户/规划/销毁检查通过，不能作为真实结果。完成本地保存后，用户再次从隐藏提示启动，执行新的 Key 预检和仍未消耗的唯一 Research；运行完成后只需说“已运行”，主代理可直接读取新生成的 `live-one` 白名单摘要。已有 4179 预览保留。真实验证、合并、推送仍未完成，生产操作及部署仍禁止。

> **2026-09-06：真实验证入口已通过离线检查和两轮审查，等待用户在隐藏提示中输入专用 Key（覆盖下方相关未授权状态）**
>
> 用户指示“带我继续完成真实验证、合并与github备份”，确认本轮总预算 **1 美元**，已有账户并可创建限额测试 Key；随后要求更先进模型，并明确选择 **“GPT-5.6 Sol，维持 1 美元（推荐）”**。首轮固定为 `openai/gpt-5.6-sol`，仅一次 Research，无自动重试/Repair。密钥由用户在本机隐藏终端提示中输入，不能发送到聊天、写入文件/环境变量或输出到日志。
>
> 执行方案见 `docs/superpowers/plans/2026-09-06-arc-v8-live-validation-and-backup.md`。从干净 `28fc14277ae1176bfdcbd82d862468ad46aa3107` 继续；隔离命令行工具已完成 TDD、规格复审和质量/安全审查，两轮最终均无 P0/P1/P2 问题。Root 最终完整单测 **135 文件 / 2,394 测试通过**，类型/静态检查通过；实际默认 PowerShell 演练真实请求 0，Ready、全新账户初始化、所有权拒绝、规划生成及数据库销毁通过。仍使用实际 Provider/校验/账户限定仓储/规划和一次性本地数据库，保留现有 4179 Fake 预览。下一步由用户执行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/live-research/run.ps1 -ExecuteOne`，仅在隐藏提示中输入专用限额 Key；安全摘要保存到已忽略的 `outputs/live-research/`。先核对摘要，任何失败均不自动重试；真实证据通过后继续合并与备份。
>
> 验证入口及测试已保存到本地提交 **`8ed27cb96c48f148f5046c35305f6951cd333576`**，提交后工作树干净；随后仅补充本次交接记录。真实执行前核对当前 HEAD，结果中应为 `mode: live-one`、`researchRequestCount: 1`，且 `outcome: passed`；默认演练的 `offline-dry-run` 不能作为真实证据。无需重做已验收页面流程。
>
> 只读预检：主工作树干净，local master `f0f88b2` 是当前分支祖先；GitHub `Earorua/arc` 的 master 为 `f6c3cdd`，公开仓库且具有推送权限。仓库 webhook 列表为空、Pages 未启用，提交内 CI 无部署步骤。真实证据和最终检查通过后才 fast-forward、普通 push 并核对远端精确哈希，不 force push。
>
> **当前尚未读取真实 Key、发真实 Research 请求、合并或推送；不声称真实验证完成。** 这次授权仅覆盖文档所列范围，生产变量/旗标/D1/R2、Sites candidate 和部署仍禁止。限额及有限请求不等同于超时零费用；失败或费用/质量证据不完整时停止，不自动消费第二次请求。

> **2026-09-06：用户已明确确认本轮本地验收通过（覆盖下方历史“用户验收待完成”状态）**
>
> 用户原话：**“确认本轮本地验收通过”**。本轮在干净 `976903c105a10e71cf4f73cfd40f05b1b82489d8` 启动的隔离 Fake 预览上完成，期间应用、测试和运行配置未改；本次仅更新验收记录、检查点和详细计划并本地提交。权威工作树仍为 `C:\Users\XF\Documents\Codex\2026-07-26\sites-plugin-sites-openai-bundled-2\.worktrees\v8-openrouter-research-beta`，分支仍为 `codex/v8-openrouter-research-beta`；含本记录的实际 HEAD 以 Git 为准。
>
> 用户逐步确认：Owner A 的 Data Product Manager Research→Ready→Path；完成两个单元后刷新仍为 Practicing；Proof 提交后 Demonstrated、撤回后 Practicing；切换账号再返回 A，两个完成单元仍保留；Owner B 的 Delay 预览、Keep 后刷新不变、Accept 后刷新保留新计划。根侧核对了对应页面，最终 B 的 2026-09-06 为休息日，任务在 09-07、09-08，各 60 分钟。A、B 分别使用自己的研究运行和计划，未导入旧设备历史。
>
> **验收范围：** 本轮本地主流程由用户明确接受；此前完整工程、负向、视觉和并发证据仍独立保留，不冒称用户逐项重测。验收详情和两个实际 run ID 见 `docs/operations/v8-goal2-local-uat.md`。本次文档更新未重跑此前全量测试，既有门槛仍绑定下方记载的精确提交。
>
> **Offline Research Beta complete; no live OpenRouter evidence claimed.** 本地用户验收门槛已关闭；完整目标 2 仍有经单独授权的最小真实 Provider 验证及本地集成/GitHub 备份门槛，当前尚未执行。未读取/创建真实密钥，未发真实/付费请求，未改生产变量/旗标或 D1/R2，未合并 master、推送、保存 Sites candidate 或部署。本次验收确认不扩大这些操作的授权范围。
>
> **恢复位置：** 最后页面为 Owner B 的 `http://127.0.0.1:4179/today`，已确认延期；预览使用一次性本地数据库，先检查已有进程和页面，不自动 Reset fresh scenario 或重启。证据记录已保存，临时数据库不视作持久备份。恢复先核对 `pwd`、`git status --short --branch`、`git rev-parse HEAD`；不重做已完成的离线实现、工程验收和本轮主流程。后续按用户指示处理仍未授权的门槛。

> **2026-09-06：Tasks 10、11、13 已完成本轮授权的离线范围（覆盖下方所有阶段性状态）**
>
> **Offline Research Beta complete; no live OpenRouter evidence claimed.**
>
> 权威工作树：`C:\Users\XF\Documents\Codex\2026-07-26\sites-plugin-sites-openai-bundled-2\.worktrees\v8-openrouter-research-beta`；保留本地分支 `codex/v8-openrouter-research-beta`。Task 10 最终代码 `0cdfe0a`，Task 11 最终代码 `1575a1e`，Task 13 最终代码 `81c4c26be2a82c2611c1ae0363b14b90ad3586c3`。Tasks 1–9 和 12 未重做。最终根侧门槛在精确干净提交 `6dd64286b23dedf6180d6b48bdfeb31ff063a915` 上运行，前后工作树均干净；本关闭记录随后作为仅文档提交保存，实际 HEAD 以 Git 为准。
>
> Task 13 精确 `81c4c26` 的独立规格和质量/安全复审均为 **Critical 0 / Important 0 / Minor 0，READY YES**。规格 8 files / 153 tests，质量 6 files / 55 tests；各自入口 19/19 与真实 HTTP 链 1/1。发现并修复的问题均保留判别 RED：稀疏审计空分类两项（`efb1e25`），Windows/Vite 私有源码路径绕过四项（`504e3aa`）。最终有界诊断与真实 HTTP 链回归在 `81c4c26`。
>
> **根侧最终门槛全部退出 0：** 全量 **134 files / 2358 tests**（42.68s）、非增量 TypeScript、完整 ESLint、build **5/5**、render/client **4/4**、明确 migration/security **5 files / 256 tests**、入口与真实 HTTP 客户端 **20/20**、实际非持久 Miniflare/workerd D1 **9 步链路 + 5 类原子冲突**（错误成功记录 0、外键违规 0）。提交范围 diff-check 通过。源码扫描仅命中计划扫描表达式和两份相对初始 `2a82567` 未变的负向夹具；客户端敏感标识零匹配（`rg` 的无匹配退出码 1 属预期）。生产配置、环境示例、bindings、迁移和依赖无本轮差异。
>
> **根侧实际 Fake 浏览器验收已完成：** Guest Flagship；新账号 Research Ready→audit→Build→Path/Today/Stack/Proof；Ready/Researching/Validating 刷新；Needs review/Failed、显式重试与安全回退；禁用/预算与缓存；新账号 Use Flagship；legacy custom unavailable/declined 四页；Complete、Delay Keep/Accept 与刷新；历史单元 Proof 提交/撤回；账号隔离；320/1440 布局、键盘/焦点/live、已编写 reduced-motion CSS 分支和同来源 Back。初次 POST 无 ID 的中断及异步过期结果使用确定性自动化证据，不冒称手动浏览器竞态或系统偏好改变。
>
> 带 Guest 本地计划和设备 completion/proof 1/1 的最终 Research run `608f2718-9b64-4f72-ba4d-3946daa316bd` 成功创建当前账号 goal/plan/receipt 各 1；设备历史仍为 1/1，cloud history/Proof 为 0。实际 trace 为 planning 404→activation 200→planning 200→generate 200。此前失败在最终根侧服务中未复现，没有增加产品绕过，也未声称已确定历史失败原因。已有不可变计划的新 Build 被拒绝，原角色、计划、事件与证据完整保留。两种一次性数据库的证据分开记录。浏览器预览与测试 binding 已停止/释放，视口还原。
>
> **本轮已授权范围无待办。** 完整验收、命令、实际 run ID 和证据边界见 `docs/operations/v8-goal2-local-uat.md`。真实 Provider 证据和用户明确验收仍未执行，因此不声称完整目标 2 已经过线上验证或可生产发布。
>
> 未读取/创建真实密钥，未发送真实/付费 Provider 请求，未更改生产变量/旗标或生产 D1/R2，未合并 master、推送、保存 Sites candidate 或部署。保留当前本地分支和工作树；历史线上与集成步骤由用户当前限制覆盖。后续只有用户改变授权范围时才考虑这些操作。

> **2026-09-06：Task 11 已关闭，下一步 Task 13 离线验收（覆盖下方阶段性状态）**
>
> 权威工作树：`C:\Users\XF\Documents\Codex\2026-07-26\sites-plugin-sites-openai-bundled-2\.worktrees\v8-openrouter-research-beta`；分支：`codex/v8-openrouter-research-beta`。Task 11 最终代码为 `1575a1e0272609cfe426d361a8c3851654e70acc`；本关闭记录随后单独本地提交。恢复先核对实际状态和历史，保留后续 Task 13 未提交文件。
>
> Task 11 已接通只读资格提示、Research 状态/Ready/Use/audit/Build，以及使用同一真实来源的 Path/Today/Stack/Proof。已修复 known Flagship aliases、账户切换/卸载后的迟到保存和离线队列、客户端未使用 Provider schema、新账户当前设置激活、同批次原子并发保护，以及新账户 legacy custom 和 Use Flagship 回退链路。当前设置激活仅保存本次答案，不导入设备历史；Guest Flagship 与普通 custom 保留设备流程。已知无目标必须由当前 owner 的严格读取确认，普通失败或损坏 Research context 继续关闭。
>
> 最终独立规格审查为 **Critical 0 / Important 0 / Minor 0 / READY YES**，**22 files / 428 tests**；质量/安全审查亦为 **Critical 0 / Important 0 / Minor 0 / READY YES**，**18 files / 383 tests**、非增量 TypeScript、13 个文件 lint、rendered **4/4** 与 diff-check 通过。根侧在精确干净的 `1575a1e` 上通过 **130 files / 2324 tests**（38.58s）、非增量 TypeScript、完整 ESLint、build **5/5**、rendered/client artifact **4/4**、diff-check、客户端敏感标识零匹配及生产配置/迁移/依赖边界无差异。源码扫描匹配的两份既有负向夹具相对初始 `2a82567` 未变。Windows 子进程权限按同一离线命令解决，未改测试或运行配置。
>
> **当前下一步：** Tasks 1–11 与 Task 12 均已关闭，不重做。按已批准 Task 13 范围派发新的 test-only harness 实现代理，限定 `tests/offline-uat/`；使用实际页面、hooks、clients、route factories、services/repositories、Fake Provider 和一次性本地存储。根侧完成浏览器 UAT、最终所有门槛、双审及验收/检查点记录。必须区分 SQLite 的 D1 接口适配与真正 Miniflare/workerd D1，并在后者验证同批次冲突回滚。新账户 Research、legacy custom 和 Flagship 验收都不能预置 cloud goal 来隐藏初始化问题。
>
> **Task 13 尚未执行，浏览器 UAT、真实本地 D1 验收、最终离线验收和用户验收均不能据上述中间门槛宣称完成。** 继续仅执行用户授权的离线范围；不读取/创建真实密钥，不发真实/付费 Provider 请求，不改生产变量/旗标，不操作生产 D1/R2，不 merge `master`、push、保存 Sites candidate 或部署。真实 Provider 证据与用户明确验收仍未完成。

> **2026-09-05 持续执行中：Task 11 回退路径质量问题尚未关闭，Task 13 尚未开始**
>
> 继续使用下方相同权威工作树和 `codex/v8-openrouter-research-beta` 分支。Task 10 已关闭；Task 11 当前代码为 `79e90dd13193e34870f1a73b45b5f1adf684ae1c`，此前 `137e028a831a151b0db9a6a7c39b47b18b9f81cd` 仅记录文档。恢复时核对实际 Git 状态与历史，保留正在进行的修复文件，不按旧记录重做实现。
>
> `82359d2` 修复了已知 Flagship 别名误开新 Research、账户切换/卸载后的保存结果进入离线队列，以及客户端产物携带未使用的 Provider 用量 schema。独立规格复审为 **Critical 0 / Important 0 / Minor 0 / READY YES**，15 files / 301 tests。根侧在干净 `272dc1a` 上通过 **129 files / 2200 tests**、非增量 TypeScript、完整 ESLint、build **5/5**、rendered/client artifact **4/4**、diff/client/生产配置边界检查。这些是当前代码的中间验证，不是 Task 11 或最终离线验收完成声明。
>
> 新账户激活修复已提交为 `8253f585b799f4ab74bc63fde21d0ce1598e8d90`。真实页面/客户端/路由/服务/SQLite 回归仅预置 users 和已验证的 Ready 研究数据，不预置 career goal 或 planning workspace；当前 Research 设置通过既有能力单独激活，无关设备 completion/proof/local planning 保持原样。根侧在干净的该提交上通过 **130 files / 2230 tests**、非增量 TypeScript、完整 ESLint、build **5/5**、rendered/client artifact **4/4**、diff/client/生产配置边界检查。这些仍是中间验证，不能替代最终双审。
>
> `79e90dd` 已修复预检后出现计划/替换目标的并发漏洞：严格 Research intent、同一 D1 batch 的原子保护、整体回滚、独立幂等作用域、409/500 区分。永久 SQLite 并发测试先为 **6 FAIL / 13 PASS**；最终实现聚焦 **16 files / 240 tests**。独立规格复审正式为 **Critical 0 / Important 0 / Minor 0 / READY YES**，**20 files / 404 tests**、非增量 TypeScript、局部 lint、rendered **4/4** 与范围检查通过。根侧在精确干净提交上通过 **130 files / 2253 tests**、非增量 TypeScript、完整 ESLint、build **5/5**、rendered/client artifact **4/4**、diff/client/生产配置边界检查。沙箱内子进程 `spawn EPERM` 仅以相同离线命令提权复跑，未改配置或测试。
>
> **质量审查尚未通过，已确认两项 Important。** 新登录且无 cloud goal 的账户完成普通自定义岗位 Setup 后，四个工作区页面都被精确 no-goal 404 导向重试边界；Research unavailable/declined 两模式合计 **8 FAIL**，仅在内存换回 Task 11 前的四页源码则同例 **8 PASS**。另外新面板 `Use Flagship` 和默认 Flagship 都无法为该新账户完成 Build（**2 FAIL**，goal/workspace/navigation 均为 0）；基线默认 Flagship 也失败，因此准确归类为既有初始化缺陷导致新回退承诺未闭合。独立质量结论已正式为 Critical 0 / Important 2 / Minor 0 / READY NO；15 files / 260 tests、四页空值/错误矩阵 32 项、TypeScript、局部 lint、rendered 4/4 均通过，但不能覆盖这两项失败。
>
> **当前下一步：** 原实现代理已获批按永久 RED 修复两项回退链路：增加 owner-bound 的明确无目标视图，仅与已恢复的本地 Arc 状态共同允许 legacy；已登录 adaptive Setup 的 Research/Flagship 共用当前设置激活与重新加载。内部方法可泛化命名，保持既有 wire intent 和 SQL guard 不变。权威无 goal/plan 必须与认证、限流、网络、坏响应和损坏 Research context 区分；已登录 Flagship adaptive Build 仅激活当前设置，沿用空历史、取消、幂等和原子保护，不替换已有计划。Guest Flagship 和普通 custom 的设备流程保持原语义；不更改已完成 Planning service/API、迁移、生产或外部接线。范围已写入详细计划，三份操作/计划文档由根代理单独维护。最终仍需规格后质量双审及根侧新验证，关闭 Task 11 后才开始 Task 13；其浏览器验收必须包含这两个新账户回退场景及实际 Miniflare/workerd D1 原子回滚。
>
> Task 13 的本地 UAT 记录目前全部待执行。新账户浏览器验收必须从没有 career goal/planning workspace 开始，不能用预置目标隐藏初始化缺口。Tasks 1–10、12 保持关闭，不重做。持续目标仍有效，当前仅授权离线工程范围；真实密钥/Provider 请求、生产变量/旗标/D1/R2、merge、push、Sites candidate、部署均禁止。用户验收与真实 Provider 证据仍未完成。

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
