# Arc v8 请求契约与广泛搜索：第十一次单次真实验证候选

状态：**2026-09-11 第十一次已执行，完整 Research 未通过，单次许可已消耗。** 用户“已运行”后核对新安全 Summary：Key/Research HTTP 200，Research 303101 ms 后 invalid-transport / charged unknown，usage null、USD5 conservative-hold，未 Ready/激活/规划。28项候选指纹匹配，根因未确定；调查见 `v8-eleventh-transport-result-2026-09-11.md`。本文范围与条件保留为历史依据，不再作为可执行手册；没有第十二次、Repair、自动重试或生产/部署许可。

## 目的与已有证据

验证模型能否在系统消息与response_format同时收到完整同源契约后，返回可用于真实学习规划的合法候选；并验证用户选择的广泛搜索范围。promptVersion为research-prompt-v2，modelConfigVersion为research-model-config-v2，搜索策略openrouter-web-search-exa-fast-v2。

本地两项TDD、各自规格后质量/安全双审、最后count4来源/教学负例补足与最终独立整合均READY。Root16文件773/773，最后受影响完整文件57/57、类型/lint及应用未变的五阶段build通过；详情见 `v8-request-contract-validation-2026-09-11.md`。这些是合成注入和本地证据，不保证远端遵从契约、搜索上限或实际成功。

## 已授权的精确范围

- 输入：Data Product Manager / en-US；固定moonshotai/kimi-k3，reasoning low，stream false，12000 max_tokens。
- 最多一次Key预检GET和一次Research POST。不附加Key单测、模型探测、Repair或自动重试；一次客户端Research可包含服务商内部多次搜索和推理，不是十次客户端POST。
- 搜索：exa fast；max_tool_calls 10、max_uses 10、max_results 5、max_total_results 50、max_characters 2000。最多10次，资料充分时可以少用。完整strict schema、隐私deny/zdr/require_parameters保留。
- 单次总预算USD5，专用Key设置USD5限额、无周期重置、未使用且仍有效。预检要求limit_remaining等于limit、usage与byok_usage为0且非管理/供应Key；有过实际调用费用的旧Key不能复用。建议名称arc-v8-contract-search10-once-20260911。助手不创建或读取Key、不写入代码/参数/env/聊天。
- Key预检最多30秒；Provider600秒、活动租约660秒、启动器总期限720秒。终端等待结束再交接；本地超时/断开不证明远端已即时停止或没有费用。
- 使用一次性本地SQLite，成功生成的是验证用学习计划，不保存到真实用户账户，不代表真实OAuth或线上持久化通过。此次没有生产变量/旗标/D1/R2、日志设置、Git暂存/提交/推送/合并、Sites保存或部署范围。
- 只保留安全Summary的计数、费用、状态和固定诊断；不读取/复制原始模型正文或账户完整JSON。

## 已完成的执行与结果交接

本次用户已在本机隐藏输入 Key 并执行一次。安全结果为 `outputs/live-research/summary-2026-09-11T10-08-39-632Z.json`，SHA256 `1E953105FEF331377340252D4FB88169B970147DCBE5E2ADFC72A728C3640666`；一次 GET、一次 POST、Repair 0、databaseDisposed true。旧命令已从本手册移除，不能重用本次许可。

后续仅核对同次 Activity 的最小字段；子请求可以提供局部证据，不强求界面单独展示父请求，也不把子费用当整轮费用。没有完整可信 usage 时保守预留不变。不得重新运行启动器以获取更多日志。

## 通过与停止条件

新Summary必须对应这次执行，mode live-one，outcome passed，reason null，runState ready；requestedModel/actualModel核对到所选Kimi模型，quality.passed为true、候选accepted、来源和技能数量均大于0。仅HTTP200、stop、扣费或Provider accepted不算完整通过。

可信usage须为有效正token数、正costMicros且不超过5000000、原值webSearchRequests在1..10；reservation为settled且settledMicros等于usage.costMicros。保留原数值，不裁剪计数，不把conservative-hold的USD5或settled0当实际消费；无法确认整轮费用则保留未知。

还须同时满足ownerWrongReadRejected、secondResearchRejected、freshAccountActivated、planningGenerated、planningUnitCount>0、auditCount1、researchRequestCount1、repairRequestCount0、正常Key/Research两次请求及databaseDisposed。失败/Needs review/超时/未知用量/超搜索上限则记录这次结果后停止付费流程，不放宽schema或自动追加请求。

真实候选合格仅通过本地真实Research这一关。后续另行选择并批准线上长任务方案，完成真实登录/账户隔离/持久化、迁移与恢复、最终发布和发布后关键验收；不会因为本轮passed直接启用公开Research。

## 固定候选与审阅

权威worktree：`C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta`；分支codex/v8-openrouter-research-beta，HEAD7090153b4acad7b12df6a7ee4d675b46c41871dc。候选包含有意未提交源码，不能只用HEAD代表。

本次准备时最新10候选与18保护全部匹配。完整28项清单保存于ignored `outputs/local-request-contract-20260911/eleventh-candidate-hashes.json`，来自task2-complete-hashes.json与task2-protected-hashes.json；任务阶段的task2-review-hashes.json不是当前测试清单。

| 应用文件 | SHA256 |
| --- | --- |
| provider.ts | 415B6D9D7AF3B2EC5C881312A5114939B623F4558EAF25CF63259754F1195359 |
| openrouter-provider.ts | 31AD4D966353C14D0D4AF4BE2450768598A91974964C31D60CD065384979BC39 |
| service-factory.ts | 977D2F9F6C51E6D466ED18D1EC67072E59AFACFEDFF38026F06CFDA1DFAF0216 |
| validation.ts | 2F3E9828328CB0A757C723A571CC5D7BFC3D58E146D6417D7B5D6F4FA9790BED |

Root自审：模型/时限/一次POST/USD5沿用已验收实现；新增契约/10与50已由用户明确选择，真实执行许可单独申请；无新功能代码或需重跑的未变测试。此前持续目标回合属于有实质源码、验收和审查进展，本回合继续准备具体下一步，不将整个目标标记完成。

独立候选审阅 `eleventh_candidate_review` READY，无P1/P2/P3；实际读取执行前手册与源码，核对28项哈希及分支/HEAD，确认模型/预算/次数/时限和交接边界一致。随后用户单独授权并执行；此审阅不代表真实结果通过。现已记录失败和独立传输路径审计，目标保持active且完整公开发布未完成；恢复时从结果调查继续，不重复运行本次候选。
