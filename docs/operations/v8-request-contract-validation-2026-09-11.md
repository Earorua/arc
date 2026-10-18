# Arc v8 请求契约本地实施与验收

## 最新验收状态（以本节为准）

2026-09-11：Task1、Task2及最后的测试覆盖补足全部完成；各自独立规格后质量/安全审查 READY，无P1/P2/P3。Root本地回归、类型/lint和构建均通过；最终独立整合审查 `request_contract_final_review` 为 INTEGRATION READY，无P1/P2/P3。恢复检查点、目标和发布门槛已同步，所有本轮会话已结束。

最终范围为完整同源输出契约、promptVersion v2、modelConfigVersion v2，以及用户明确选择的**最多10次搜索、每次最多5条、合计最多50条结果、USD5单轮上限**。最多10次不是固定用满。共享策略同时控制可信提示、标准/Kimi请求、工厂及本地配置身份和最终次数验收。每轮仍最多一个客户端Research POST，无Repair或自动重试；模型、推理和时限保持原已批准配置。

### 新鲜验证证据

| 检查 | 实际结果 |
| --- | --- |
| Task1 TDD | 首个行为RED为缺契约marker的2 fail/2 pass；实现后八文件413/413、类型/lint通过 |
| Task2 TDD | 首个RED为两入口仍发2次、合法count4仍incomplete，共3/3预期失败；九文件426/426、类型/十文件lint通过 |
| Root完整相关回归 | 16文件773/773，包含计划15文件及工厂相关research-environment；非增量类型、十文件lint exit0 |
| 最后覆盖补足 | 仅将已有来源缺失、教学分钟不一致两项fixture由legacy/count2改为details-only/count4，断言实际count4；实现者及Root各自受影响完整文件57/57、类型和该文件lint exit0。未增加测试数量，773与57不相加 |
| 本地构建 | Root经Sites build-site.mjs完成五阶段构建，exit0；构建输入应用源码未因最后测试fixture补足改变 |
| 构建产物 | Worker入口2346179 bytes，静态确认default fetch导出；38个客户端文件；hosting源码/产物hash相同；15份迁移/元数据源码、产物及基线全部匹配 |
| 保护检查 | Task1结束时20项匹配；Task2仅解锁factory/validation后18项匹配。最终10份候选匹配，旧第八/九/十次Summary字节保持 |

Root回归与build初次在默认沙箱遇到Vite `spawn EPERM`；明确仅离线子进程执行的自动审批通过后执行成功。启动错误不算功能RED，也不是实际Provider失败。未安装依赖、修改工具或发起新的真实Provider请求。

原请求标准7905/Kimi7933 bytes；Task1中间15298/15326；最终15429/15457，较最初各增加7524。完整契约仍同时匹配response_format与Zod schema，whole-body 262144字节限制仍在fetch前检查；字节测量不是tokens或费用估计。

实际注入响应、一次性SQLite与规划流程证明：合法count2/4/10均passed、Ready、按实际可信usage结算、激活及规划；count0最终incomplete且保存合法用量；count11或非法用量最终incomplete、usage null、保守持留，不推定或伪造费用。新范围内count4的严格候选字段错误仍拒绝；来源缺失和教学分钟不一致仍needs-review、实际100000 micros settled、禁止激活/规划。owner隔离、重复请求拦截、GET+POST次数、Repair0及数据库清理断言保留。

真实工厂与临时validation测试区分prompt v1/v2，以及Task1 promptv2/modelConfigv1/search2/10、中间仅modelConfigv2、最终v2/v2/search10/50。真实SQLite旧身份miss、新同身份hit，合成Key轮换不改变配置身份；出站、审计与已存包对应版本一致。版本观察helper为了读取SQLite暂缓close，外围finally恢复并真实关闭；该helper的disposed字段只证明关闭调用，原物理清理另有未mock close的兼容测试覆盖。

### 审查与可恢复记录

- Task1：`request_contract_t1_spec` 后 `request_contract_t1_quality` 均READY。
- Task2：`request_contract_search_implementation/independent_spec_review` 后 `request_contract_t2_quality` 均READY。质量审查指出原来源/教学负例仍为count2的证据差异；Root按原计划补足count4，两者先后增量复审PASS/READY，无问题。
- 最终整合：`request_contract_final_review` INTEGRATION READY，无P1/P2/P3；实际审阅四项应用/六项测试相对原基线的差异及Root命令/构建证据，重新核对10份候选/快照和18项保护一致。审查是代码检查，未重跑Root测试或真实验证。

ignored `outputs/local-request-contract-20260911/` 保存前置快照、三阶段字节测量、`root-verification-results.json` 的实际命令/结果与 `root-build-artifacts.json`。最新十文件SHA清单为 **task2-complete-hashes.json**；task2-review-hashes.json是最后fixture补足前的阶段清单，保留原样。其余九份最终快照沿用task2-final-*；最后测试完整快照为task2-complete-tests--server--live-research-validation.test.ts.txt。18项冻结保护为task2-protected-hashes.json，15项迁移基线为migration-before-hashes.json。

最终四个应用文件SHA256：

| 文件 | SHA256 |
| --- | --- |
| app/server/research/provider.ts | 415B6D9D7AF3B2EC5C881312A5114939B623F4558EAF25CF63259754F1195359 |
| app/server/research/openrouter-provider.ts | 31AD4D966353C14D0D4AF4BE2450768598A91974964C31D60CD065384979BC39 |
| app/server/research/service-factory.ts | 977D2F9F6C51E6D466ED18D1EC67072E59AFACFEDFF38026F06CFDA1DFAF0216 |
| scripts/live-research/validation.ts | 2F3E9828328CB0A757C723A571CC5D7BFC3D58E146D6417D7B5D6F4FA9790BED |

权威目录/分支保留，HEAD仍7090153b4acad7b12df6a7ee4d675b46c41871dc；62份有意未提交文件，包括原57份成果，本轮未暂存或提交。完成本地修复不等于已备份到GitHub或已发布。

第十次仍是历史schema-rejected失败，没有第十一次许可。本地配置不证明远端遵从10次上限或完整候选已经成功；后续需要另列具体新候选并获准一次真实验证。本次不读取真实Key/env/原始正文、不交付付费运行命令、不修改生产或Git/Sites远端状态。完整首版公开发布目标仍未完成。

## 阶段过程记录（历史状态）

2026-09-11 用户明确“批准”请求契约方案，按 `../superpowers/plans/2026-09-11-arc-v8-request-contract.md` 实施；本记录不代表真实 Research 或公开发布通过。

## 当前执行点

用户在实施期间追加质量优先搜索范围并明确选择10次/50结果/USD5/仅本地；现已加入Task2。Task1先验证契约/提示v2，保持旧参数作为中间基线；Task2在Task1双审后统一搜索配置和验收并提升modelConfigVersion。最终新策略允许合法count4，不能继续用旧2次上限验收；旧第十次Summary仍原样保留为当时失败证据。

Root 已核对权威 worktree、分支 `codex/v8-openrouter-research-beta`、HEAD `7090153b4acad7b12df6a7ee4d675b46c41871dc`。已有 57 份有意未提交成果保留。linked worktree 检查通过，没有 superproject；无需创建工作树或安装依赖。

实施前八份源/测试快照及20项受保护文件指纹保存于 ignored `outputs/local-request-contract-20260911`。应用可改范围只有 `openrouter-provider.ts` 与 `provider.ts`；所有实际差异须相对这些前置快照审查，不能把 HEAD 当作本轮起点源码。

Task 1 实施者 `request_contract_implementation` 已收到完整任务、测试先行要求和边界；当前进行旧请求字节测量及首个 RED。Root 管理文档及最终构建。规格审查、质量/安全审查和最终整合审查尚未开始，不能填为通过。

## 已取得的 RED 与前置测量

实施者首次 Vitest 在沙箱内因 Vite 子进程 `spawn EPERM` 无法启动；明确纯离线测试升级获自动审批通过后正常执行。该启动问题不算 RED，也没有因此发起 Provider 请求。

生产变更前，标准/Kimi 系统提示均因不存在 `OUTPUT_CONTRACT_JSON` marker 而断言失败，首次行为运行 2 fail / 2 pass。后续测量步骤用精确断言差异显示字节数，属于单独测量，不计为新增功能 RED。合成截获的旧请求标准为7905 bytes、Kimi为7933 bytes，版本 research-prompt-v1，global fetch调用0；记录 `outputs/local-request-contract-20260911/request-bytes-before.txt`。这些是实际注入合成响应的出站 body 测量，不是 token 数或付费请求。

## Task1 实现者验收与待审查候选

实施者已 DONE：应用仅追加同源完整契约说明及promptVersion v2，新增request-contract测试，扩展response-compatibility测试；共四个文件。测量新标准15298 bytes、Kimi15326，均较旧请求增加7393；这是尚未追加10次/50结果的Task1中间候选。

实现者记录：契约+兼容66/66；八文件回归413/413；清理后契约12/12；非增量类型和四文件lint通过。实际标准factory v1/v2身份不同、合成key轮换身份不变；真实SQLite旧版本hit/新版本miss；临时runValidation出站/审计/包版本一致。完整count4中间基线保留计数与100000micros结算、Ready/激活/规划，但旧最终门槛incomplete。严格候选负例均拒绝。运行记录 `task1-verification-summary.txt`，测量 `request-bytes-task1-after.txt`。

Root已读取真实两项应用差异和测量/验证日志，20项保护重新匹配；四份Task1候选完整快照及SHA保存于 `outputs/local-request-contract-20260911/task1-review-hashes.json`。独立规格审查 `request_contract_t1_spec` 正在进行；通过后才派质量/安全审查，尚不能记作双审完成或开始Task2实现。

独立规格审查现已 SPEC READY，无P1/P2/P3，实际比较四文件并重算20项保护指纹。审查没有重新运行测试；其指出版本观察helper暂缓close仅为了读取实际SQLite，最终finally真实关闭，因此该helper里的disposed字段只表示调用关闭，实际原流程销毁由未mock close的兼容整合测试覆盖。已进入随后独立质量/安全审查 `request_contract_t1_quality`。

随后独立质量/安全审查也为 READY，无P1/P2/P3；四项源码与冻结候选哈希匹配，实际请求信任边界、module mock恢复和SQLite最终关闭无实质问题。Task1双审完成。两次审查均只读，不把它们称为额外测试通过或真实验证。

## Task2 最新执行点

新实现者 `request_contract_search_implementation` 在Task1双审通过后接续，完整收到10次/50结果/USD5、本地TDD及边界要求。允许新增修改service-factory/validation；这两份前置快照与哈希已独立保存，其他18项仍由 `task2-protected-hashes.json` 冻结。Task2尚待RED/GREEN、规格后质量审查及Root最终整合/构建，不能用Task1的413项或双审冒充本任务通过。

Task2 RED已取得：新 `research-search-policy.test.ts` 三项均因旧行为失败；标准/Kimi的max_tool_calls实际2、期望10；实际注入runValidation的合法candidate/details count4为incomplete/validation-incomplete、期望passed。初次spawn EPERM启动错误已通过明确纯离线Vitest升级解决，不计为RED。当前进入统一策略GREEN；无真实Provider调用。

Task2核心GREEN：六文件274/274。实际一次性SQLite+注入Provider流程中，count2/4/10均passed/Ready/settled/激活/规划，count0为incomplete且保留合法用量；count11与非法值为incomplete、usage null、保守持留，不伪造结算。新配置缓存身份与Task1旧搜索策略分开，同新身份命中、合成key轮换不影响身份。最终标准15429/Kimi15457 bytes，较最初各增加7524，仍小于262144。尚待扩大回归、类型/lint、自审及双审，不能记作本轮结束。

Task2实现者最终验证：九文件426/426、非增量类型及十文件lint均exit0。Root实际核对四个应用文件相对Task1/Task2基线的差异，重新计算18项保护均一致，并将十份最终源码/测试快照及SHA保存到 `task2-review-hashes.json`。独立规格审查 `request_contract_search_implementation/independent_spec_review` 已按冻结候选进行；尚未开始随后质量/安全审查、最终整合或Root构建。

独立Task2规格审查已PASS，无P1/P2/P3，十份候选与18项保护哈希均匹配；实际核对共享策略/提示位置/Repair隔离、工厂及临时身份、完整验收条件、原值计费与边界测试。审查只读，没有重跑426项测试。Root随后派独立质量/安全审查 `request_contract_t2_quality`，未与规格审查并行。

## 授权与结果边界

第十次真实许可已消耗，没有第十一次，不读取 Key/env/原始响应，不运行真实启动器。本轮仅合成注入 fetch、一次性 SQLite、测试/类型/lint/本地 build。

新提示不能证明远端strict的具体失效根因，也不保证远端限额强制生效。第十次4/旧上限2的差异尚未解释，但用户已选择新的1..10验收范围；最终合法count4须通过，候选结构错误仍拒绝。所有计数/费用原样保存，不降低来源、教学或计费门槛，不追溯改写旧Summary。

没有生产变量/旗标/D1/R2、Git 暂存/提交/推送/合并、Sites 版本保存或部署范围。进度以恢复检查点顶部和本文件后续实际证据为准。
