# Arc v8 安全传输观察：第十二次单次真实验证候选

状态：**第十二次已执行且许可已消耗，完整Research未通过。** 新Summary为 `summary-2026-09-11T12-30-22-364Z.json`：HTTP200、7次搜索、216417ms、USD0.242346 settled，但finish_reason length，未Ready/规划；见 `v8-twelfth-length-result-2026-09-11.md`。没有第十三次、Repair、重试或额外探测许可。本地两任务双审、Root860项/类型/lint/build/产物及最终FINAL READY属于执行前证据；33项冻结清单和分支/HEAD在取得回执后重核一致。

## 已执行的目的与范围（历史，不可重用）

观察下一次失败发生于获取响应、读流、字节限制、UTF-8、外层JSON或形状检查的哪一阶段，以及是否先发生本地取消；若成功则按原完整Research条件验收。诊断不能恢复第十一次正文，不能保证下一次成功，也不能证明远端已停止计费。成功和对象级语义拒绝的传输诊断均应为null，继续结合原结果/候选诊断判断。

- Data Product Manager / en-US；固定moonshotai/kimi-k3、reasoning low、stream false、12000 max_tokens、完整strict schema与原隐私参数。
- 最多一次Key预检GET、一次Research POST；不另发模型/Key探测、Repair或自动重试。一次Research允许服务商内部多轮推理和搜索。
- exa fast，最多10次搜索、每次最多5条、总计50条、每条最多2000字符。远端返回的实际次数保留原值，不裁剪为限额。
- 单次总预算USD5；用户本机创建未使用、USD5限额、无周期重置的专用Key，建议名arc-v8-transport-once-20260911。Key由用户在终端隐藏输入，助手不读取或写入代码、参数、环境变量或聊天。
- Key预检30秒；Provider600秒、租约660秒、启动器720秒。取消只是本地API调用尝试，不保证即时终止远端生成或费用。
- 只用临时SQLite；生成的计划是验收数据。无真实账户数据、生产变量/旗标/D1/R2、Git暂存提交推送合并、Sites保存或部署。

## 新证据与验收

新增安全Summary字段researchStartedAt为adapter调用前的UTC；researchTransportDiagnostic只含固定版本/阶段/原因、饱和字节数、是否观察到EOF、有限错误类别、相对耗时和本地取消尝试。不得保存正文、任意headers、URL、message/stack或账户字段。

实际guard会隐藏fetch原生原因：fetch异常和redirect均可能观察为fetch/fetch-error/other，且headersElapsedMs为null；既有HTTP状态仍可能为200或302。reader原生错误仍可在body-read分类。receivedBytes不是token数；bodyComplete只代表观察到EOF，不代表JSON或候选合法。localCancellation不等同于Activity的取消发起方。

完整通过须同时满足live-one/passed、reason null、Ready、正确实际模型、质量通过、有效来源/技能、可信正token/费用、webSearchRequests在1..10、settled且等于可信costMicros，及owner隔离、第二次调用拦截、激活/规划、audit1、GET1/POST1、Repair0和数据库销毁。USD5保守预留或settled0不能当作实际费用；仅HTTP200/stop/扣费不算通过。

失败、Needs review、超时、未知usage或超搜索限额：保存一次安全Summary后停止付费流程，根据新诊断选择后续本地修复，不自动重跑或放宽接受条件。无需用户再寻找已确认不可见的第十一次父请求或正文。

## 执行结果交接

用户已在本机隐藏输入Key执行一次，Root仅核对安全Summary。原执行命令从本手册移除，避免旧单次授权被误用；不得为更多日志再次执行或把下轮本地设计批准视作付费许可。

下一步为本地输出预算设计审阅；本次尚未完整通过。后续仍须完整真实Research、线上长任务、真实登录/账户隔离/持久化、迁移恢复及发布验收。完整首版公开发布目标继续且未完成。

## 本地候选证据

权威worktree为C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta，分支codex/v8-openrouter-research-beta，HEAD7090153b4acad7b12df6a7ee4d675b46c41871dc；有意未提交改动属于候选，不能只凭HEAD定位。6项本轮文件及27项未改保护合并为ignored outputs/local-transport-observation-20260911/twelfth-candidate-hashes.json，共33项（含旧真实Summary保护）。实施和验证见v8-transport-observation-validation-2026-09-11.md；root-verification-results.json保存Root860项与类型/lint/build实际输出，root-build-artifacts.json保存Worker/38客户端/15迁移及hosting一致性结果。最终整合及执行前手册经transport_observation_final_review审阅FINAL READY；用户随后授权执行一次，其实际失败回执另见新结果报告，不能用本地READY替代真实通过。
