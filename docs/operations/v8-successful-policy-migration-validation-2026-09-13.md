# Arc v8 成功配置迁移：本地实施验收

日期：2026-09-13，2026-09-14完成最终审查及交接。用户已批准成功请求配置迁移设计，按既有顺序子代理、TDD、每任务SPEC后独立QUALITY/安全审查实施。Tasks1–4本地迁移阶段完成；完整公开发布目标仍active、未完成。

2026-09-14用户明确恢复。706项暂停交接文件全部一致，分支/HEAD与原有工作树保留。新的独立整合审查policy_final_integration_review判定PASS，无P1/P2/P3；独立核对392源码、108构建、388类型输入及12项before副本，全部匹配。审查实际实现、611项回执、类型/lint、构建与默认离线结果，没有重跑未变测试或演练。审查结果与恢复核对分别见final-integration-quality-review-20260914.json、resume-task4-20260914.json。最终交接清单为final-handoff-hashes.json及final-handoff-verification.json；不是GitHub备份或生产恢复证据。

## 恢复与实施前证据

- 当前工作树保持codex/v8-openrouter-research-beta，HEAD7090153b4acad7b12df6a7ee4d675b46c41871dc。
- 433项交接哈希核对一致；原任务找回Tasks1–4和源码备份验收保留。
- 设计批准字节SHA256 cec3a4f98ff80fcbf58a97b7b97198d04cf93d58a4377ae0d166bcef26cf58d9，设计文件中的“尚未批准”是审查快照状态；本次authorization.json记录用户后续明确批准。
- 在修改任何Provider或工厂实现之前，实际调用未替换的生产配置解析器，冻结两组合成配置的旧指纹：
  - 固定20000ms/1200微美元Research：p2-2f912248ea8be6becb1d8614acbf92ca。
  - 固定35000ms/1300微美元Research：p2-f20d7dbe8d9fe6c8883212924cff093c。
- 基线观察1项通过，global fetch拒绝所有调用，真实请求0。初次Vitest因沙箱spawn EPERM在启动前退出，不计为行为RED；同一受限本地命令获自动审查许可后退出0。
- 精确合成输入/输出和命令见outputs/local-successful-policy-migration-20260913/legacy-fingerprint-baseline.json、baseline-command-receipts.json；12项实施前副本及before-hashes.json保留。包含已批准的版本化空示例.env.example，没有读取真实运行环境文件。

## 当前任务

- Task1：恢复后完成自审、非增量类型检查及双审，SPEC PASS后独立QUALITY/安全PASS，无待修问题。修正仅限测试辅助函数的刻意非法selector类型及一项launcher断言；生产类型和Provider实现保持。Root最终新22项机器JSON、类型、三文件lint均退出0且无警告。原七文件238项通过为暂停前观察摘要，产品字节未变；本轮未冒充重新执行238项。
- Task2：实施、自审、SPEC及独立QUALITY/安全全部通过。实际行为RED为14失败/21通过；首次GREEN58项后，Root非增量类型发现测试mock空参数元组TS2493，仅修正测试类型。最终新机器JSON为task2/green-after-type-fix.json，58/58、三文件通过；Root最终类型/lint均退出0无警告。Task2审查均核对最终五文件哈希；初始RED后新增旧selector/租约回归及加强的零构造断言未单独观察RED，已在red-green-coverage-accounting.json明确记录。
- Task3：实际D1、历史恢复、缓存及完整规划集成实施、自审、SPEC及独立QUALITY复审全部通过。最终新测试SHA256 282220e9ce4b6da97d0dbc55a6d9a5d101fe6895b5d5d3115487afad303054c5，最终11/11通过，见task3/green-after-quality.json。原210项和机械lint清理后的11项分别保留，字节范围见task3/evidence-scope.json。此前语法、NOT_FOUND断言与lint问题均为测试层；Task3没有生产源码改动。
- Task4：最终18文件611/611回归、当前非增量类型/八文件lint、Sites本地build、产物核对及一次默认离线全部已通过。2026-09-13按用户要求暂停；2026-09-14恢复后完成新的最终独立整合QUALITY/安全审查，PASS且无待修问题。Tasks1–4本地完成，未变字节未重跑611项/build/离线。

Task3独立QUALITY发现的两项P2已解决：跨配置Retry使用真实adapter产生的retryable:true、已知费用100微美元失败，同档重试成功作为正对照；迟到回执entered等待与立即处理的start结果竞速，提前结束也进入finally。Root核对后重新进行类型/lint，SPEC后QUALITY对最终字节再次PASS。初始审查意见和修正前副本保留，不把旧字节的通过回执当作最终字节证据。

详细步骤见../superpowers/plans/2026-09-13-arc-v8-successful-policy-migration.md。没有把既有local runValidation代替新生产工厂接入证明；集成需要生产factory→真实OpenRouterResearchProvider→注入合成fetch→真实本地D1/validator/planner。

早前Task1恢复核对469项交接，全部一致；本次Task4恢复核对706项，全部一致。用户暂停已由2026-09-14明确继续指令解除。最终独立审查已完成；原测试session70175及构建/离线命令早已退出，没有本阶段运行句柄待等。当前dist已包含本阶段迁移。

类型验收使用临时tsconfig.acceptance.json继承原配置，只排除node_modules和outputs。最终388项当前源码/测试输入全部保留且选项不变，排除1290项历史备份/还原/辅助输入（含新保存的审查前测试副本）。root-final-type-lint.json记录最后一次实际非增量类型及八文件lint，均退出0无输出；type-source-hashes.json冻结全部388项。构建时再次核对它们全部未变，故复用本轮最终检查，不重复执行。

## Task4当前实证与恢复入口

- root-merged-vitest.json：18文件611通过，0失败/跳过/todo；实际命令与退出0在root-merged-command-receipt.json，仅有现有Node SQLite实验性警告。
- root-build-command-receipts.json：portable/configured=false；首次build在加载Vite配置时因spawn EPERM退出，同一插件build-site.mjs本地重试成功，没有改依赖或发布。
- root-artifact-verification.json：392项源码候选、108项构建、全部9项分任务审查文件、388项类型输入一致。应用仅Provider/factory两项修改及execution-policy新增；12项实施前副本校验通过。
- Worker SHA256 0d8f2627fa65bf3d7e278a519eee9cac43512fc1fb3d10f4899c58c30a141425；默认fetch/recover入口、新服务端selector存在；63项JS检查未含本地runner/凭据诊断接线，浏览器未含服务端selector；15项迁移/metadata及hosting配对一致。
- root-source-candidate-hashes.json SHA256 3704548f79f5bd2542a0f5173edd2b093094357451a57d16c337396272542c4e；root-build-hashes.json SHA256 948c2d19af7f7a832d771cd0d2debf1a0d34ccab7061ea496a912249d88d3ddc。
- 默认无flags run.ps1一次退出0。完成后重读outputs/live-research/summary-2026-09-13T13-54-16-382Z.json，SHA256 80bee53cfa5ed311d165ad803233a7fef816469e800df57f4c2c4cf92c3ad07c：passed/ready、质量通过、激活、6规划单元、owner隔离/重复拒绝/DB销毁均通过，真实请求0/合成Research1/Repair0。见root-offline-command-receipt.json和root-offline-verification.json。
- 暂停交接pause-after-task4-hashes.json及pause-after-task4-verification.json于2026-09-14恢复前全部核对一致；现由final-handoff-hashes.json及final-handoff-verification.json承接最终审查与文档更新。当前产品和构建候选没有变化。下一步是线上执行器具体设计；设计输入见v8-online-executor-options-2026-09-14.md，已询问用户可用Cloudflare账户情况。

## 用户询问的剩余距离和估时

核心功能基本齐全；剩余主要是托管环境的Research持续执行/断开处理、线上真实登录/账户隔离/学习/Proof持久化、生产备份恢复、源码/GitHub备份与发布后验收。按有效工作时间粗估顺利3–5个工作日；若需新增独立后台执行服务或处理平台限制，可能1–2周。这是条件性粗估，不是交付保证；最大不确定性为长时间Research托管方式。

## 边界

本轮批准仅为本地源码与合成验收。既有Key、生产变量/旗标/D1/R2、Sites候选/部署、Git写入均未授权；第十七次真实验证已消耗，无第十八次。默认本地launcher及profile保持原行为，不降低搜索/质量/时限。完成本阶段不代表托管20分钟、断开继续、真实登录/Proof或公开部署已通过。
