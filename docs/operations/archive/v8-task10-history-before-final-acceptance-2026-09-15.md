# Arc v8 恢复检查点

**子Task8实施者已派发：** `/root/site_admission_final_matrix_implementation`，初始只修改 d1-site-execution、site-admission、research-orchestrator 三个现有测试及证据。最终收据须包含完整29文件图哈希，最终lint依据完整Task10自原始before发生变化的TS清单，不能仅检查本子任务三个文件。Root负责唯一 `task10-final-acceptance` 类型检查及最终顺序双审；任何实际缺陷需先保存RED再最小修复。此阶段刚开始，尚无新的验收结论。

**最新：子Task7完成，进入Task10子Task8最终本地整合验收。** Root61bff5实际完成同七源码428/428、七lint0、417类型0及独立SPEC/QUALITY双PASS的核对和勾选，见 `task10-subtask7-completion.json`。计划现37项完成、4项剩余，SHA-256 `c7ce2f205046e6bc22f3099216b1ef96d3fb93c571d5e9110af94de8e0f15723`。29份完整Task10文件图的修改前副本（其中27个TS文件）已由Root25c609实际捕获于 `task10-subtask8-before-sources.json`，原副本/各阶段证据保留。

子Task8限定先补现有d1-site-execution、site-admission和research-orchestrator三个测试文件的具体边界，预检见 `task10-subtask8-preflight.md`。覆盖已有实现直接通过的用例只称补充证据，不伪称RED；若发现真实行为缺陷才按TDD最小修复。随后二十文件联合回归、完整Task10已改TS lint、Root最终417当前输入类型、最终独立SPEC后QUALITY。当前尚未取得子Task8运行/类型/审查结论，完整公开发布仍未完成。

**子Task7 SPEC已正式PASS，独立QUALITY审查中。** `task10-subtask7-spec-review.json` SHA-256 `fdfdba7093eabfb2a72fbd25a08a4427bea7d6181447c06647a1b85dde4c248f`（Root192c53已读）确认七源码/417类型/七before副本及实际调用和SQL均符合规格。QUALITY为新代理 `/root/sync_remote_exclusion_quality_review`。最终收据的RED说明已纠正并保存旧字节，当前SHA-256 `65034362d001125b0b2090162cce67615f0c70e3fb2746ea6ce7b17900ed3f50`，源码未变。计划仍33/8；双审PASS前不执行子Task7勾选或子Task8。Root只准备了 `capture-task10-subtask8-before.mjs`、`verify-task10-final.mjs` 与 `complete-task10-subtask8.mjs`，尚未执行最终检查或完成命令。

**最新：子Task7 r2已冻结并通过Root验收，独立SPEC审查中。** `task10-subtask7-green-r2.json`实际428/428、七文件lint0；`task10-subtask7-acceptance-r2`当前417输入/编译选项完整，非增量tsc退出0（fd85c9，8.7306105秒）。Root f9b9b7 实核七源码、417类型、45保护源码、67原始副本及旧交接允许变化，见该stage的 `-root-verification.json` / `-final-hashes.json`。SPEC为新代理 `/root/sync_remote_exclusion_spec_review`，之后仍需另一位QUALITY；尚未勾选子Task7，计划33/8。原TS2322及修前428证据保留。

实施者 `/root/sync_remote_exclusion_implementation` 只在修正r2收据的RED描述，源码保持冻结：首轮orchestrator为4项行为+2项fixture失败，组合execute/catch用例停在首个execute断言，后续catch仅由GREEN验证，不称为独立观察RED。独立审查依据原JSON和最终源码；收据旧字节保留。子Task8只读预检/捕获脚本已准备，但未执行/实施。

**子Task7当前停点更新：428项运行回归已通过，Root类型检查发现一处测试类型错误，正在最小修复。** 十文件 `task10-subtask7-green.json` 实际428/428（Root c93033），七文件lint0；首次 `task10-subtask7-acceptance` 的417项当前输入/选项范围正确，但非增量tsc实际退出2（3cf372，8.5484815秒），唯一错误为 d1-research-repository.test.ts:734 TS2322：测试辅助函数将result推断为仅ready:true。Root已保存七份修前真实副本 `task10-subtask7-pre-type-sources.json`，与417类型快照一致。原实施者只修测试声明，随后生成独立r2十文件回归/七lint/收据，再由Root新r2类型验证；独立SPEC/QUALITY尚未开始，计划仍33/8。

**子Task7首次实际RED已读回。** Root工具 `b50d13` 实读 `task10-subtask7-orchestrator-red-r3.json`：64项中58通过、6失败、pending0；其中4项行为断言失败（queued/closed未调用专用执行reader、缺reader仍成功、execute/catch状态错误），2项为admitted/begun fixture的SQL时钟/预留设置失败，不能称作产品缺陷。实施者正在修正fixture以获得干净RED，然后才修改生产逻辑；原启动EPERM单独保留，不冒称RED。当前最新实施者仍为 `/root/sync_remote_exclusion_implementation`，最终GREEN/类型/双审待办保持。

**子Task7当前执行点：** 实施者已报告在research-orchestrator测试中写入真实SQLite的远端queued/admitted/closed/begun读取与同步副作用隔离用例，并覆盖缺失/损坏执行记录、无reader、execute入口及catch模式复核。当前准备首次测试启动/RED，尚无实际运行结论；生产文件尚未进入该轮实现。准确七文件边界和before-r2副本见下。Root另保存了子Task8只读覆盖预检 `task10-subtask8-preflight.md`，并准备但未执行 `capture-task10-subtask8-before.mjs`；不能把准备视作子Task8已开始。

**子Task7已派发：** 新实施者 `/root/sync_remote_exclusion_implementation` 正在执行同步隔离TDD。进一步预读发现d1-site-execution测试也通过普通transition设置远端终态，因此追加该现有测试文件作同样的实际SQL fixture适配；当前准确范围为两个生产文件和五个测试文件，共七份修改前副本见 `task10-subtask7-before-sources-r2.json`。原六份清单及所有副本保留，追加文件与已完成子Task6哈希一致。七文件lint/收据、十文件最终回归、Root417类型和后续独立双审均按此范围执行；测试断言不削弱。

**最新：Task10 子Task6 已完成，开始子Task7 同步流程隔离。** `task10-subtask6-completion.json` 由Root实际完成校验：240/240测试、七文件lint0、417项当前输入非增量类型退出0，SPEC r2与独立QUALITY均PASS；QUALITY额外以仍有效的排队期限隔离验证缓存SQL过期保护，1/1通过。计划现为33项已勾选、8项未勾选，SHA-256 `78803eb4b2179a204f868edd287f7ec6f9c198628da6b2c9b525f04f75373c41`。这些结论覆盖下方旧审查中及暂停记录，完整公开发布仍未完成。

子Task7前六份真实源码副本已实际捕获于 `task10-subtask7-before-sources.json` / 对应目录。限定范围为orchestrator、d1-repository及四个现有测试（research-orchestrator、research-recovery、d1-research-repository、site-admission）；最后一项仅为两条原有终态回归改用实际SQLite注入，因新的同步专用transition守卫将正确拒绝原fixture设置。保留原断言，不削弱子Task6覆盖。当前尚无子Task7 RED/GREEN或类型/审查结论，随后按新实施者TDD、Root类型、SPEC再独立QUALITY继续。不新增Provider、Git写入、生产或部署操作。

**子Task6 SPEC复审已PASS，当前独立QUALITY/安全审查中。** `task10-subtask6-spec-review-r2.json`（SHA-256 `79ee08251fdb7c893b4146345de7d8f405b2e5867e93d68bd0ab2a63c80c2ce3`）确认两项P2已解决、findings为空，同七源码和417类型身份独立匹配。不同审查者 `/root/site_admission_coordinator_quality_review` 正在审查该r2候选。实际240项/七lint/417类型证据保持；未通过QUALITY前不勾选子Task6或执行子Task7。Root只准备了子Task7的before捕获及验收脚本，尚未执行或实施。

**子Task6 两项SPEC问题已修复，新候选已冻结，等待SPEC复审。** 正式 `task10-subtask6-spec-fix-red.json` 实际选中2失败/28未选；最小修复后定向2通过，完整五文件 `task10-subtask6-spec-fix-green-r2.json` 240/240，七文件lint0。Root `task10-subtask6-acceptance-r2` 的417项当前输入非增量类型检查退出0（9.0640953秒），编译选项不变；七源码、417类型、43保护源码及53原始副本均匹配，见相应 `-root-verification.json` 与 `-final-hashes.json`。只有协调器及其测试改变，其余五文件保持；收据 `task10-subtask6-spec-fix-receipt.json`。同一SPEC审查者已收到复审；原FAIL报告及修前238项证据保留，不覆盖。QUALITY仍待新SPEC PASS，计划仍27/14。

**子Task6 首轮SPEC已FAIL，正在原实施者修复两项P2；QUALITY尚未开始。** `task10-subtask6-spec-review.json`（SHA-256 `153164e1880c346321ad34d5ae34a60dd8851f5ffb791076c7a76766ae3ab9a1`）及 `task10-subtask6-spec-probes-threads.json`实际复现2/2失败：①正常markAdmitted成功后的最终readPair可能返回failed/admitted不一致配对；②quota finalize及其确认读回均失败会阻断已知预算的独立释放。Root已实际读取失败报告，并把七份冻结源码与旧证据哈希保存在 `task10-subtask6-pre-spec-sources.json` / 对应目录。原实施者 `/root/site_admission_coordinator_resume` 仅在协调器及其测试中修复；后续使用新r2测试/lint/收据和Root新r2类型标签，再请同一SPEC复审，PASS后才安排独立QUALITY。原238项/417类型仅对应修前版本，不冒称新问题已通过。首次fork-pool探测零测试属基础设施失败。

**Task10 子Task6 当前已冻结，独立SPEC审查中。** 实际五文件 `task10-subtask6-green.json` 238/238、pending0，七文件lint0；Root `task10-subtask6-acceptance` 对417项当前输入保持编译选项的非增量类型检查退出0（10.5762765秒）。七源码、417类型、43保护源码、46原始副本及1090旧交接/1372暂停交接允许变化已实际核对，见 `task10-subtask6-acceptance-root-verification.json` 与 `task10-subtask6-acceptance-final-hashes.json`。SPEC为 `/root/site_admission_coordinator_spec_review`，之后仍需另一位独立QUALITY；尚未勾选或进入子Task7。实施收据已补齐三项边界真实RED/GREEN的原始命令、计数及工具chunk，旧收据原样保留，源码未变；原setup/EPERM证据不冒称行为失败。

**子Task6 首次缓存RED已实际观察。** `task10-subtask6-cache-red.json` 为71项中选中1失败、70未选，失败发生于 `attachRemoteCachedPackage` 安全占位方法的 `RESEARCH_UNAVAILABLE`；Root实际读取报告确认。首次Vite `spawn EPERM`仅测试启动失败，不算行为RED。当前正在缓存事务及后续准入协调器TDD，尚无本子任务最终GREEN、类型或独立审查结论。

**2026-09-15 用户已明确恢复 Task10 子Task6，本段覆盖下方暂停状态。** 恢复指令为“继续 Arc v8，读取恢复检查点，从 Task10 子Task6 缓存命中回归的首次 RED 验证继续。” Root实际核对1372项暂停交接全部一致，见 `outputs/local-durable-executor-20260914/resume-task10-subtask6-verification.json`，清单SHA-256 `3150d39e84df6e7005f7d16bddf52f88b636997961e189b144107b1a5ca0a57b`。分支与HEAD保持。旧代理句柄已不存在，限定替代实施者 `/root/site_admission_coordinator_resume` 接续原四文件停点，先运行真实缓存RED，随后缓存挂接与准入/回收协调器；Root负责最终类型检查及SPEC后独立QUALITY。子Task6尚未验收，不重复已完成子Tasks1–5或已消耗的真实验证。

**2026-09-15 用户主动暂停，准备关闭 Codex；本段为最新状态，覆盖下方旧恢复、审查中和暂停记录。** 后台执行器 Tasks1–9 及 Task10 子Tasks1–5 已完成。子Task5 最终255/255测试、七文件lint0、Root415项当前输入非增量类型检查退出0，独立SPEC和QUALITY均PASS，见 `task10-subtask5-completion.json`。计划当前27项已勾选、14项未勾选，SHA-256 `3f16d2a623cb0f5f76bfdf1785773063342ff94dc5eea1aab4d22443377c28f1`。完整首版公开发布尚未完成。

**准确停点：Task10 子Task6 缓存命中的首次 RED 尚未运行。** 已保存远端缓存接口、安全抛错占位方法、同步缓存fixture helper和一条缓存回归用例，共四个已改文件；未实现真正缓存挂接，协调器两个新文件仍不存在。本子任务没有运行测试、lint、类型检查或独立审查，不把已写测试称为已观察RED。实施代理已停止，无活动进程。原五份before快照保留，当前五份源码副本与新交接见 `task10-subtask6-before-sources.json`、`task10-subtask6-pause-sources.json`、`task10-subtask6-user-pause.json`、`task10-subtask6-pause-handoff-hashes.json` 和 `task10-subtask6-pause-handoff-verification.json`（均在 `outputs/local-durable-executor-20260914/`）。

恢复后先实际核对当前交接清单、工作树和计划；保留未提交修改，不重做子Tasks1–5。随后运行已写用例取得真实RED，再按已批准TDD/规格后质量审查流程继续。下一条命令和精确范围已保存于暂停回执；完整子Task6要求以当前计划为准。恢复口令：**继续 Arc v8，读取恢复检查点，从 Task10 子Task6 缓存命中回归的首次 RED 验证继续。** 用户暂停期间停止新实施；既有本地实施及常规部署授权保留，第十八次真实Research仍未单独授权。

本文件只保留当前状态。原逐轮记录完整保存于 [历史记录](archive/v8-resume-history-before-task3-completion-2026-09-14.md)；其中旧暂停、旧待批准及旧策略段落均不能覆盖本文件和用户最新授权。归档前后字节核对见下述证据目录中的 `task3-checkpoint-archive.json`。

## 工作树与授权

- 权威目录：`C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta`
- 分支：`codex/v8-openrouter-research-beta`
- HEAD：`7090153b4acad7b12df6a7ee4d675b46c41871dc`
- 工作树包含已保存的未提交修改。保留全部进度，不 reset、clean 或以旧 HEAD 恢复文件。
- 用户已经批准：**“批准本地实施。后续部署也都批准。”** 已批准的设计、本地实施、常规后续部署及子代理流程不重复索取许可。完整原文和设计指纹见 `outputs/local-durable-executor-20260914/authorization.json`。
- 继续顺序新实施者、TDD、自审、SPEC 后独立 QUALITY/安全审查，再做最终整合验收。Tasks3–9 的实施者及独立双审均已完成；恢复时以实际代理/进程句柄为准。
- 第十七次真实 Research 已成功，其单次许可已消耗；**第十八次尚未单独授权**。后续部署授权不等于新增付费 Provider 次数或额外托管购买预算。真实密钥仅由用户在本机隐藏输入或安全配置，不写入源码、日志或对话。
- 本轮没有新增真实 Provider、Git 写入、Sites/生产写入或部署。实际账户、资源 ID、秘密和服务购买预算在部署准备时依据真实环境处理，不能编造；已有 Cloudflare 账户准备问题仍未得到答复，本地实现不依赖它。

## 恢复核对与下一步

证据目录：`outputs/local-durable-executor-20260914/`。

1. 核对当前目录、分支和 HEAD，保留未提交工作树。
2. 当前Task9源码/类型身份以 `task9-final-hashes.json` 和 `task9-review-type-source-hashes.json` 为准，Root核对见 `task9-review-root-verification.json`。最终交接由 `save-task9-handoff.mjs task9-review` 生成 `task9-handoff-hashes.json` 与 `task9-handoff-verification.json`，恢复时须实际检查生成结果并核对文件。更早Task6/7/8清单为各阶段修改前的历史基线，不要求后续合法更改后仍逐项相同；保留原始证据。
3. **Task5 的共享字节身份修复及双审均已完成**：新SPEC `/root/executor_byte_identity_spec_review` 和最终独立QUALITY `/root/executor_begin_quality_review` 均PASS，无待修问题，回执为 `task5-bytes-spec-review.json` 与 `task5-quality-review.json`。实际RED13项中12项失败，最终201/201、五文件lint0、399项当时类型输入非增量检查0，全部源码/类型哈希一致，见 `task5-bytes-root-verification.json`、`task5-bytes-final-hashes.json` 与 `task5-bytes-final-type-*`。四项初始TS2345只修正了真实ArrayBuffer测试声明，没有复制掉伪报元数据；预类型修复证据保留。`task5-bytes-red-analysis.json`说明已复现与未复现内容。Task5和共享修复计划步骤全部勾选；其后Task6仅给begin增加独立grant解析，兼容性另有字节核对，不重复Task5审查。

   前序证据保留：`task5-spec-review.json`曾PASS；随后 `task5-quality-review-initial.json` 为P2字节上限缺口（审查者仅静态发现，实际复现由实施者进行）。此前 `task5-review-red.json`31项中1项decoder错误翻译回归失败，修复后51/51、398项类型/lint0，全部哈希匹配，见 `task5-review-root-verification.json`。这些不证明新字节缺口已修复。更早48/48和初始stub27项中20项失败均为历史，初始测试数据错误/EPERM/缺模块的局限已明确记录。
4. 按既有顺序子代理/TDD/SPEC 后 QUALITY 流程推进，不重复选择实施方式，不重跑未变的旧构建或旧离线演练。
5. Task6 开始前实际核对 Task5 交接890项全部一致，见 `resume-task6-verification.json`。本次恢复又实际核对暂停清单908项全部一致，清单 SHA-256 `76043a7b8dd8786c4b78dd1d6b6516c1f86963aa06d81be55a251e7eb6d00463`，见 `resume-task6-review-verification.json`。旧实施代理句柄已不存在，新实施者 `/root/executor_receipt_resume` 已完成测试收尾和自审；Root类型检查及两个独立审查者也均已完成。暂停回执保留为历史基线。
6. **Task6 已完成，无遗留问题。** 新实施者确认暂停前边界补充已全部落地，无需再次编辑源码。Root重读实际 `task6-review-green.json` 78/78、三文件 `task6-review-lint.json` 错误/警告0；401项当前输入非增量类型检查退出0，编译选项不变，3源码及401类型输入哈希均匹配，见 `task6-review-root-verification.json` 与 `task6-review-type-*`。`task6-final-hashes.json` 固定当前候选；`task6-begin-compatibility.json` 证明原Task5源码除新增独立解析函数外逐字节相同。独立SPEC及QUALITY均PASS，见 `task6-spec-review.json`、`task6-quality-review.json`，不重复派发。Task6计划五项步骤全部完成。实际RED27项中22项失败；初始fixture错误及本次spawn EPERM均为零测试启动错误，不是行为RED。最终交接须核对真实生成的清单，不能把本单元通过当作后台/生产整合已完成。
7. Task7开始前924项Task6交接实际全部匹配，见 `resume-task7-verification.json`，清单SHA-256 `e8ca2b798153d6c8e7739bc7de15460de14977c48e8aa508145b4d7bcac735e1`。原实施者 `/root/executor_ledger_implementation` 完成三个计划文件。初始RED44项中31项失败；Root发现UUID规则与原codec不一致，新增RED60项中2项失败后复用z.uuid修复。首次完整138项通过的真实报告保留 `task7-pre-spec-*`，原RED和UUID RED不变；spawn EPERM仅基础设施失败。随后SPEC提出两项测试覆盖缺口，最终修复及当前证据见下一项。此前生产源码/旧迁移/helper保持不变，临时SQLite目录0。
8. **Task7最终结论覆盖上项首轮通过记录：已完成，无遗留问题。** `task7-spec-review-initial.json`两项P2覆盖缺口已通过仅测试修改补齐（accept在ack/grant/claimed/closed后全状态重放；异常数据库行结构/访问器/类型/状态组合）。新定向72/72直接通过现有代码，未冒称行为RED；生产store/迁移不变。最终 `task7-green.json`150/150、两文件lint0、403项当前输入非增量类型检查退出0（8.3036秒），3源码和403类型输入哈希一致，见 `task7-review-root-verification.json` 与 `task7-review-type-*`。138项旧候选真实报告保存在 `task7-pre-spec-*`。同SPEC代理复审及新的独立QUALITY代理 `/root/executor_ledger_quality_review` 均PASS，见 `task7-spec-review.json`、`task7-quality-review.json`。计划五项步骤全部完成。最终交接由 `save-task7-handoff.mjs task7-review` 生成 `task7-handoff-hashes.json` 与 `task7-handoff-verification.json`，恢复须实际核对结果；924项Task6清单是Task7实施前基线，不要求合法更新后仍逐项相同。当前源文件身份以 `task7-final-hashes.json` 及403项 `task7-review-type-source-hashes.json` 为准。
9. **Task8已完成本地实施与独立双审，无待修问题。** 私有回执存储/恢复/正文清理计划为 `docs/superpowers/plans/2026-09-14-arc-v8-executor-receipt-storage.md`，五项步骤全部完成。开始前实际核对963项Task7交接一致，见 `resume-task8-verification.json`。范围为receipt元数据扩展、独立结果store/迁移及两测试文件。R2先保存完整规范化回执，D1固定不可变哈希与费用；清理保留同路径的小型永久tombstone，防止延迟写入恢复正文。

   最终 `task8-green.json`180/180通过、pending0，四文件lint0；Root非增量类型检查退出0，405项当前输入及编译选项不变，五源码和全部类型哈希一致，见 `task8-quality-root-verification.json`、`task8-quality-type-*`、`task8-final-hashes.json`。实际旧迁移/helper不变，工作树和临时根均无Task8 fixture残留。`task8-spec-review.json` 与 `task8-quality-review.json` 均PASS；原代理句柄消失后替换审查者，并为已确认问题派限定修复者；未重做其他实现。

   初始行为RED36项中27通过、9安全stub失败，见 `task8-red.json`。首轮SPEC三项P2覆盖缺口保留 `task8-spec-review-initial.json`；补充真实异常结果行/错误grant及tombstone、累计5秒期限、ack与cleanup重叠，定向24/24直接通过现有生产代码，没有新增行为RED。补测前174项证据保留 `task8-pre-spec-*`。两次类型失败及最小修复前证据保留 `task8-type-command.json`、`task8-review-type-command.json`、`task8-pre-type-*`、`task8-pre-type-alias-*`。正则尾换行漏洞的早期猜测被实际Node探测否定；不当作漏洞RED。

   QUALITY首轮另确认一项P2混合快照：较早保存的正文与后读到的清理完成标记一起返回available。真实SQLite/Miniflare探测覆盖save及recover，正文tombstone与费用始终完好，见 `task8-quality-review-initial.json`、`task8-quality-probe.mjs/.json`。修复先记录 `task8-quality-red.json`26项中2项选中断言失败、24项跳过，再修正返回记录一致性；具体改动及验证见 `task8-quality-fix-receipt.json`。178项修复前报告保留 `task8-pre-quality-*`。最终两个审查者已基于修复后的当前哈希重新PASS。

   Windows长工作树路径的R2持久fixture失败与短路径成功对照已记录；唯一 `os.tmpdir()/arc-v8-task8-*` fixture完整销毁、同文件重开、正文与tombstone持久恢复和精确清理均通过。原计划逐字节保存 `task8-plan-before-persistence-exception.md`；路径澄清前SHAacc888bb0aaf47461b118c7c72a8fe704e2c22d3750a0c13817c0084636aa962，勾选前修订计划SHA51b7d985f6e8794ffcdea798becf807e2fcee36c7d39ede2510304d80a1ffcf8。`task8-persistence-probe.json`只证明选中1项通过/14项跳过，不能代替最终全量报告。扩展路径尝试审批审查超时未执行，不是安全拒绝。另有约2209.7秒延迟后1次safe unavailable，保留 `task8-green-interim-post-type-runtime-failure.json`；随后精确174项重跑通过，原因仍未被独立证实。

   最终交接由 `save-task8-handoff.mjs task8-quality` 生成 `task8-handoff-hashes.json` 与 `task8-handoff-verification.json`，恢复须读取并实际核对。该清单是本地源码/证据交接，不是新构建、归档、GitHub备份或部署。Task7旧963项清单是本单元修改前基线。Root的 `site-admission-followup-map.json` 只记录下一阶段准入/预留/关闭守卫接入点，没有实施网站准入。

10. **Task9已完成本地配置实施、类型检查与顺序独立双审。** 计划为 `docs/superpowers/plans/2026-09-14-arc-v8-site-executor-configuration.md`，五项步骤已完成。开始前实际核对Task8交接1041项全部一致（清单SHA-256 `f5728b983ce449814fdc353210141d23911f0e4a8a71dbdbbc0912a6daf5d722`）及原解析器四项源码，见 `resume-task9-verification.json`。原 `site-policy-baseline.json` 保持SHA-256 `9508ac8bfd79518359b0300ea9baae3ea957b054c69dd4b7d95e9924219a6041`；三个完整同步public snapshots及字面量指纹保持兼容，测试不依赖outputs。

   新增无Provider Key策略模块及私有固定HTTPS双向桥接配置；旧工厂只构造同步服务，显式远端配置仍返回不可用，直至真实准入服务接入。同步Key/盐检查、历史恢复及公开响应保持既有行为。最终 `task9-green.json`145/145、pending0，五文件lint0；Root非增量类型检查退出0，408项当前输入和编译选项核对一致，七源码及全部类型哈希匹配，见 `task9-review-root-verification.json` 与 `task9-final-hashes.json`。`task9-spec-review.json`、`task9-quality-review.json` 均PASS，无待修问题。

   原行为RED `task9-red.json`77项中13项失败；spawn EPERM只属测试启动失败，不冒称RED。实施中Root发现纯策略遗漏原IP盐校验并要求先补回归再修复，所有真实阶段报告与具体命令以 `task9-implementation-receipt.json` 为准。修改前工厂、worker声明及.env.example三份逐字节副本已核对Task8哈希，见 `task9-before-sources.json`；测试文件当时已合法修改，未伪造其原始副本。

   首轮SPEC两项P2已修正：.env新增示例全部注释并通过真实配置回归；补齐关闭开关、访问器、origin边界/轮换及有效连接下的不可用门槛。初始139项候选保留 `task9-pre-spec-*`，首轮审查保留 `task9-spec-review-initial.json`；具体RED及覆盖验证见 `task9-spec-fix-receipt.json`。覆盖缺口不冒称新生产漏洞，最终SPEC/QUALITY基于修复后哈希。

   最终交接由 `save-task9-handoff.mjs task9-review` 生成 `task9-handoff-hashes.json` / `task9-handoff-verification.json`，恢复须实际核对。该清单不是新构建、归档、GitHub备份、远端验收或部署。

11. **Task10计划三项澄清已完成并独立PASS；子Tasks1–3完成，子Task4实施中。** 澄清审查版本 `42414a2c5ed2561e7243e6a8181de3cd1710f4bf03a67ec6fa4ace7e88c787a5`逐字节保留于 `task10-plan-after-clarifications.md`。当前计划 `docs/superpowers/plans/2026-09-15-arc-v8-site-durable-admission.md`已勾选子Tasks1–3共13项，SHA-256 `5e4c8fb1979d95ca11f6d6da80ec35eba25565471f585e611a5e98bca21ec9d3`，剩余28项。子Task3勾选前f3f版本实际保留于 `task10-plan-before-subtask3-completion.md`；子Task2勾选前实际计划保留于 `task10-plan-before-subtask2-completion.md`，SHA-256 `9cee3624a994f5439a8ff213f5cbe402e43e31e1968a1684f7b7e0d11d6fd27c`。原草案SHA-256 `3ff4cc7ac02f2c610811ebce7e294475a753ff49deb258488d2abdbf5ded09c4`仍逐字节保留于 `task10-plan-before-clarifications.md`，原整体设计PASS见 `task10-plan-review.json`；初审副本 `task10-plan-review-initial.json` SHA-256 `08af01ae475c5aa151fbca89b7307782b0d1c565aa631eae8583e8d70e176fa0`。

   新修订者 `/root/site_admission_plan_clarification`已落实：①现有类型scope verifier及父任务独立阶段标签，保持全部当前输入和编译选项，仅排除历史outputs；②子Task1严格只新增两个独立可运行基础设施文件，远端接口/fixture能力随所属行为步骤加入；③明确 `releaseRemoteBeforeBegin` 的实际SQL固定身份、closed且未begin、准确reserved预留守卫，精确released幂等、held/settled冲突、连续bucket扣回和最终SQL断言整批回滚，保持generic settle及实际费用结算，协调器禁用通用not-charged释放。

   修订回执 `task10-plan-clarification-receipt.json`，Root复核 `task10-plan-root-verification.json`；新的独立审查者 `/root/site_admission_clarification_review`实际核对差异/API及19源码和快照不变，限定三项复核PASS、findings为空，见 `task10-plan-clarification-review.json`（SHA-256 `d8b82a9085a3c8397f2cacd43688c9185002ffe44b834973eb63fdd8bbfed246`）。这是计划审查，不是实现验收；计划中的旧pending状态由此条实际结果覆盖。

   **子Task1已完成。** `/root/site_admission_fixture_implementation`仅创建两个测试基础设施文件；最终实际3/3（一个测试文件）、pending0、两文件lint0，Root对全部410项当前输入保持编译选项的非增量类型检查退出0（9.565983秒），全部类型和两文件哈希一致。见 `task10-subtask1-root-verification.json`、`task10-subtask1-final-hashes.json`、`task10-subtask1-acceptance-type-*`。真实SQL时钟、owner隔离及暂停后实际写入通过；初始spawn EPERM仅启动失败，无行为RED声明。独立SPEC `/root/site_admission_fixture_spec_review`及QUALITY `/root/site_admission_fixture_quality_review`均PASS、findings为空，同源码身份。Root实际运行 `complete-task10-subtask1.mjs`核对双审及410身份后勾选三项，见 `task10-subtask1-completion.json`。

   **当前子Task2：** 新实施者 `/root/site_admission_schema_implementation`负责新增0008迁移及独立迁移测试、追加journal/标准SQLite迁移列表、Drizzle结构、必填私有mode/key和严格parseRun、模式测试及两项旧清单测试的窄更新。只在计划列出的十个文件及单元证据中工作，不改旧0000..0007/快照、不生成新snapshot、不接入后续创建/准入/关闭/网络。实现后Root类型检查，再SPEC后QUALITY；未完成前不进入子Task3。修改前19文件逐字节副本和9个新文件原本不存在的记录见 `task10-before-sources.json`及 `task10-before-sources/`，不可覆盖。

   子Task2实际首轮RED为176项：108通过、68失败、pending0，见 `task10-subtask2-red.json`、`task10-subtask2-red-receipt.json`。Root逐项核对首个失败原因，分类见 `task10-subtask2-red-root-analysis.json`：56项实际SQL违规写入被接受、10项运行时分类缺口、1项索引结构缺失、1项测试安排先撞旧active唯一键。不能把68项全部称行为RED；后两项已要求实施者修正/明确分类。另一个标为null mode的原用例被helper的`??`替换为remote，实际测的是remote+null key，原报告不证明null模式覆盖；已要求保留显式null并补测。Root表达式探测 `task10-subtask2-text-probe.json`实际证明TEXT长度/GLOB对NUL后缀的盲点及JSON缺失比较的NULL语义，属于本地表达式证据，不是成品迁移漏洞结论。SQL约束及严格解析已开始写入；最终GREEN/lint、Root类型和独立双审尚未完成。

   **子Task2当前续接点覆盖上段末句：** 首次实施交接 `task10-subtask2-receipt.json`及r4测试/lint保留为类型修复前候选。初始命名green的报告实际232/233，错误是数字字符串`"30"`可按SQLite INTEGER affinity正常转换；非法文本用例已改成非数字文本，不声明存在单独的正向存储类型断言。r2/r3和原失败报告均保留。Root兼容核对 `task10-subtask2-compatibility.json`证明16旧SQL/快照、Task9七文件、子Task1两文件和journal前八项保持，1090旧交接仅批准范围变化。首次411项当前输入非增量类型检查退出2（8.7322786秒），唯一TS2322为新迁移测试helper的Partial Record传播undefined，见 `task10-subtask2-acceptance-type-command.json`。

   原实施者仅修测试helper，显式跳过undefined而保留null；真实修前副本 `task10-subtask2-pre-type-test.ts` SHA-256 `4304efcc83df41cf9b82875379e298caa3af74415a65bed70ba25a03e51f0335`。最终测试SHA-256 `0752bbfa3280bb767f4717700fa225df8bfa377d2ccdd41ee8419e1ed8ceb02b`，其余九文件未变；见 `task10-subtask2-type-fix-receipt.json`。实际r5为237/237、pending0，8文件lint0；Root新标签 `task10-subtask2-acceptance-r2`对411项当前输入、相同编译选项非增量检查退出0（8.3391629秒）。Root实际核对十文件及411类型哈希、25保护源码、19原副本和1090旧清单，见 `task10-subtask2-root-verification.json`、`task10-subtask2-final-hashes.json`。

   **子Task2最终双审已PASS，无遗留问题。** 独立SPEC `/root/site_admission_schema_spec_review`及QUALITY `/root/site_admission_schema_quality_review`均检查同十文件身份，findings为空，见 `task10-subtask2-spec-review-r2.json`、`task10-subtask2-quality-review.json`（后者SHA-256 `469a9fbb18293e24dd6394a70c52b2a4fac189ce53394fb7dbfed388e88a68a0`）。原 `task10-subtask2-spec-review.json`仅含四字节null，是PowerShell报告写入错误，保持原样，不是审查结论；有效SPEC另用新文件并核对。Root实际运行 `complete-task10-subtask2.mjs`核对双审/十源码/411类型后勾选四项，见 `task10-subtask2-completion.json`。这是数据库结构/分类验收，不是完整Research或部署验收。

   **当前子Task3：** 新实施者 `/root/site_admission_creation_implementation`负责上下文解析器抽取、不可变job/context/policy快照、同批run/alias/execution原子创建、重放/Retry及真实SQLite故障和重开测试。原限定七个旧文件、三个新文件；实际修改前副本/缺失记录见 `task10-subtask3-before-sources.json`与 `task10-subtask3-before-sources/`，在子Task2双审完成后由Root捕获。仅创建/Retry/read/builder接口；不写后续准入/关闭stub，不改已通过迁移、配置或codec。Root接手类型和顺序独立双审。子Task3各步骤未勾选，Task4未开始。

   子Task3原始联合seam RED已运行，`task10-subtask3-red-r2.json`为241项中225通过、16失败、pending0；初次Vite spawn EPERM仅启动错误，随后精确离线命令才得到真实结果。实际11文件seam/测试副本保留于 `task10-subtask3-red-stage-sources/`。Root读实际报告和代码并分类，见 `task10-subtask3-red-root-analysis.json`：12项在新创建seam/前置setup即不可用，1项上下文parser seam不可用，1项混合模式fixture多传policy，1项hash控制点未到达，1项fixture能力未添加。不能将16项全部称为各场景的行为漏洞；四项rollback测试在stub直接抛错时已通过，最终必须证明实际batch执行。错误行读取测试的直接UPDATE还会撞保留的lifecycle/JSON约束，需要修正安排；原文件重开把filename传给只创建内存DB的helper，原RED不证明磁盘持久化。只读policy应通过调用方保留的可变原对象测试修改；等待hash的测试须处理早期reject。已发回同实施者修正，原报告和副本不改。实际顺序为parser和创建seam联合RED，不冒称先完成parser才进入创建RED。

   Root据上述实际夹具问题作窄范围澄清：额外包含 `tests/server/site-admission-fixture.test.ts`的新能力回归（保留原三项）及 `tests/helpers/sqlite-d1.ts`仅增加可选filename并传给已有构造器，缺省仍为内存DB，不重复迁移列表、不改batch。源码范围合计12文件。helper修前实际字节在RED后、扩展前捕获为 `task10-subtask3-before-sqlite-d1.ts`，SHA-256仍为Task2的 `9ba6c70503f5e1eb414bde4ee60be5dc8eb2e206074bfb7a67647c2bb1c6f5a5`；fixture test只有原Task1哈希，没有伪造原字节副本。见 `task10-subtask3-fixture-clarification.json`。当前计划SHA-256更新为 `f3f3474c19300c41ea333c11adbc57fcdd146cc750b55094f92d0b3cc1d610f1`，仍七项已勾选、34项未勾选；174a版本实际保留 `task10-plan-before-subtask3-fixtures.md`。此为既有本地持久化验收的测试基础设施澄清，后续子Task3双审覆盖，不增加产品/线上范围。

   子Task3第一版GREEN为242/242。Root自审发现的终态读取、历史版本、规范化字节及别名竞争均已修正；另补同步源Retry角色规范化及已begin任务的期限验证。四项后续缺陷有实际21项中4失败的RED及修复GREEN；codec字节检查是明确撤回该守卫后的回归复现，不冒称原始前向TDD。实际报告和顺序局限见 `task10-subtask3-implementation-receipt.json`，保留初始联合RED及前置fixture错误。

   **子Task3当前验收：源码已冻结，独立SPEC进行中、QUALITY待其PASS后派发。** 首轮完整五文件259/259通过；类型检查发现测试部分D1替身的TS2352，已仅把该用例改为真实SQLite生命周期行，并补真实零行执行记录写入触发最终SQL断言整批回滚、remote缺记录报不可用两项验收。新测试文件36/36，其余四文件与全部生产源码不变，合计261项已验证；不是一次新跑出的261项报告。十二文件lint错误/警告0；Root `task10-subtask3-acceptance-r2` 对414项当前输入、相同编译选项非增量类型检查退出0（8.46612秒）。最终十二源码及414类型哈希、29受保护源码、26历史副本、1090旧交接文件允许变化均实际核对，见 `task10-subtask3-root-verification.json`、`task10-subtask3-final-hashes.json` 和 `task10-subtask3-type-fix-receipt.json`。修前真实测试副本及首次类型失败保留。独立SPEC代理为 `/root/site_admission_creation_spec_review`；未获得双审前不勾选子Task3，不实施子Task4。

   **最新审查覆盖上段“SPEC进行中”：** 首轮SPEC一项P2要求按计划把两项远端创建方法放到独立 `RemoteResearchCreationRepository`。已仅改两个接口相关文件，真实修前副本保留；Root与实施者分别核对转译JavaScript逐字节相同。新增两文件lint0、其余十文件原lint仍适用；Root `task10-subtask3-acceptance-r3` 全部414当前输入非增量类型检查0（8.9750043秒）。原FAIL保留于 `task10-subtask3-spec-review.json`，规格复审 `task10-subtask3-spec-review-r2.json` 已PASS、findings为空。当前十二源码权威身份为 `task10-subtask3-spec-final-hashes.json`，Root证据为 `task10-subtask3-spec-fix-root-verification.json`。独立QUALITY代理 `/root/site_admission_creation_quality_review` 正在核对同一候选；Task3勾选与Task4实施仍等待该结果。纯类型修正不伪称新增行为RED或重新跑261项。

12. **Task10修改前基线已经真实运行，无需无故重跑。** 八文件418项：415通过、3项失败、pending0；实际退出1，见 `task10-baseline.json` 与 `task10-baseline-analysis.json`。三项均为原有清单仍止于0006/41表，漏掉已存在0007/42表：SQL文件列表、journal索引列表、schema导出表数量。属于修改前缺口，不是Task10行为RED，后续仅窄更新清单并保留旧hash/snapshot断言。最初spawn EPERM为零测试启动失败；相同离线命令获执行后才得到上述真实结果。

13. 上次暂停时已核对没有运行中的子代理或测试进程；该记录为历史。`complete-task9.mjs task9-review`已实际执行，Task9五项已勾选；随后 `save-task9-handoff.mjs task9-review`生成最终源码/文档/证据清单。本次恢复已实际核对 `task9-handoff-hashes.json`、`task9-handoff-verification.json`及 `task10-pause-receipt.json`。这是本地交接，未新增归档、构建、GitHub备份或部署。

**本次恢复核对：** `resume-task10-verification.json`记录1090项暂停交接全部一致、清单SHA-256 `3df4c4fa8f4865227409a0f8a21905b68cc25a45043d77b711a40cf696b37161`，Task9七文件与408项当时类型输入及最终双审身份一致。目录、分支、HEAD已实际核对，保留全部合法未提交修改。原代理句柄均缺失，已由新代理完成三项澄清及子Task1；当前从子Task2继续。基线418项证据保留，不无故重跑。旧1090交接和子Task1的410类型身份是各阶段开始前/完成时证据，后续合法修改后不要求旧列表仍逐项相同。

   **最终子Task3双审及勾选已完成。** SPEC复审 `task10-subtask3-spec-review-r2.json` 与QUALITY `task10-subtask3-quality-review.json` 均PASS、findings为空，同十二源码及414当前类型身份。QUALITY报告SHA-256 `460845cd549194324ae8046439955c4a8cad5c7760619a81c87fb15ecea96996`。Root实际执行 `complete-task10-subtask3.mjs` 核对全部身份后勾选六项，见 `task10-subtask3-completion.json`；没有宣称整体Task10、远端验收或发布完成。以上“审查待进行”等为该单元中间历史。

   **当前子Task4：** 新实施者 `/root/site_admission_reservation_implementation` 顺序抽取并验证原配额完整性SQL，再TDD实现远端配额、预算预留与实际SQL身份/状态/时间守卫。仅八个既有源码/测试加一个新SQL helper；Root在子Task3双审勾选后实际捕获八份副本及新文件缺失，见 `task10-subtask4-before-sources.json`。不提前实现子Task5关闭/释放、后续协调器、网络或工厂。完成后Root类型检查，再独立SPEC后QUALITY；当前步骤未勾选。

   子Task4已完成抽取兼容检查：`task10-subtask4-extraction-green.json`真实61/61（一个文件、五个suite），初次spawn EPERM仅启动错误。Root实际对照修前字节，确认CTE、精确范围及期间范围生成SQL完全相同，见 `task10-subtask4-extraction-root-check.json`。新有效预留谓词先有绑定参数安排错误（`live-predicate-red`），修正后真正的 `task10-subtask4-live-predicate-behavior-red.json` 为62项中61通过、1项有效预留被拒绝的断言失败；随后 `task10-subtask4-live-predicate-green.json`62/62。当前正在远端quota安全seam/写入保护阶段，budget阶段未完成。`siteOpenAdmissionSql`已在quota seam RED之前写出，不冒称已有该谓词的前向失败证据；最终仍需真实延迟SQL路径验收。尚无子Task4最终类型检查或独立双审。

   **子Task4最新阶段记录：** 远端quota首轮69/69通过（`task10-subtask4-quota-green.json`）；Root随后发现旧接口INSERT后读回缺少remote-key重放排除，实际受控并发回归 `task10-subtask4-quota-legacy-race-red.json` 选中1项错误返回allowed，另外69项未选。原跨午夜用例同时跨过队列期限，已要求改为午夜前创建、午夜后仍在队列有效期内，隔离UTC日守卫；这是覆盖补强，不冒称原报告已证明该边界。Fixture quota command应使用调用时应用UTC日，固定身份与policy仍取实际stored execution。

   预算安全seam已进入独立RED：`task10-subtask4-budget-seam-red.json`选中1项BUDGET_UNAVAILABLE、43项未选。`task10-subtask4-budget-ordinary-red.json`两项初始失败涉及不可变模式trigger/错误类别，尚非模式绕过行为证据；已要求修正受控fixture并保留原报告。同实施者继续预算SQL与回归，Task5关闭/释放尚未实施。Root已准备 `verify-task10-subtask4.mjs` 并通过Node语法检查，但尚未执行最终验收；须待六测试文件GREEN、九源码lint及哈希收据，再运行Root类型检查和SPEC后QUALITY。任何选中用例的RED报告都不能算完整测试通过。

   **子Task4当前验收覆盖上述实施中状态：** 同实施者已完成九文件并冻结；旧接口INSERT后重放漏洞修复、午夜仍queue有效的新旧日证明、同日SQL恰到deadline拒绝、已有预算容量拒绝不改余额/version及day/month实际零行或抛错整批回滚均通过。完整六文件 `task10-subtask4-green.json`208/208、pending0；九文件 `task10-subtask4-lint.json`无错误或警告。Root `task10-subtask4-acceptance` 对全部415项当前输入、相同编译选项非增量类型检查0（8.791465秒），排除1732历史outputs。九源码、39保护文件、34历史副本及1090旧交接允许变动已实际核对；权威身份为 `task10-subtask4-acceptance-final-hashes.json`，验收为 `task10-subtask4-acceptance-root-verification.json`。初次Root脚本AST范围核对漏放新谓词所需的精确sqlNow常量，已仅修脚本并保留 `task10-subtask4-root-verifier-correction.json`；不是应用缺陷或类型失败，不重复已通过测试。

   独立SPEC `/root/site_admission_reservation_spec_review` 已PASS、findings为空，实际核对同九源码及415类型输入，见 `task10-subtask4-spec-review.json`。随后已派不同审查者 `/root/site_admission_reservation_quality_review` 执行QUALITY/安全审查。当前仍未勾选子Task4，Task5尚未开始；其修改前捕获脚本已准备，但须双审完成后才运行。`task10-subtask4-implementation-receipt.json`记录真实TDD过程与fixture错误；不把修正后的模式corruption fixture或后加覆盖冒称额外前向RED。远端工厂仍关闭，未进行真实Provider、构建、Git或部署。

   **子Task4最终双审已PASS并完成勾选，覆盖上段待审状态。** SPEC为 `task10-subtask4-spec-review.json`、QUALITY为 `task10-subtask4-quality-review.json`，findings均为空；Root实际核对同九源码、415类型输入及保护文件后运行 `complete-task10-subtask4.mjs`，见 `task10-subtask4-completion.json`。当前计划SHA-256 `b7c75213c86f383a947d3e61f181d9c2a486382225ed975e0ace88b71e441c4c`，19项已勾选、22项未完成；勾选前5e4c版本实际保存于 `task10-plan-before-subtask4-completion.md`。完整208项及九lint/415类型证据仍适用于这次完成版本；之后Task5合法修改时不可要求旧类型清单继续匹配当前源码。

   **当前子Task5：** 新实施者 `/root/site_admission_lifecycle_implementation` 仅负责七个现有文件：Site execution契约/仓库、budget契约/仓库、site-admission fixture及两仓库测试。实际修改前七份副本在子Task4双审完成后捕获，见 `task10-subtask5-before-sources.json`及对应目录。按markAdmitted、closeBeforeBegin、releaseRemoteBeforeBegin分别加入安全seam、行为RED、实现和GREEN；每一项必须由真实SQL测试证明身份/账目/期限守卫、成对关闭和余额扣回的整批回滚。禁止改Task4 quota/helper、迁移、配置、同步编排、工厂、路由或Task6后续协调器。Root仍负责当前输入类型检查及SPEC后独立QUALITY；未到完成门槛不勾选本子任务。当前未发起新Provider、Git、构建或部署。

   子Task5已实际核对七份before/worktree哈希及计划后开始markAdmitted阶段；安全seam正向RED见 `task10-subtask5-mark-admitted-red-r2.json`（选中1失败、36未选），随后 `task10-subtask5-mark-admitted-green.json` 为选中1通过、36未选，不能称37项全量通过。初次Vite spawn EPERM为基础设施失败。单条实际UPDATE已加入完整quota CTE/live关系、精确budget/bucket、SQL期限和版本守卫。异常矩阵 `task10-subtask5-mark-matrix-red.json` 为55项中53通过、2失败；两项首先暴露begun与损坏行测试安排问题。修正安排后，`task10-subtask5-mark-corrupt-read-red.json` 的选中1项失败、54未选，实际证明损坏context/job在UPDATE后才由read发现，行已从pending变成admitted。

   **暂停续接点：** 实施者已在UPDATE之前加入严格read、固定身份和expectedVersion检查；Root已读到实际源码，但此修复尚未运行回归，不能宣称通过。当前七文件及逐字节副本保存在 `task10-subtask5-pause-sources.json` / `task10-subtask5-pause-sources/`。恢复后先核对当前交接与计划，再从这项修复的定向回归及完整mark矩阵继续，随后TDD实施 `closeBeforeBegin` 和 `releaseRemoteBeforeBegin`。最终组合测试、lint、Root新阶段类型检查、SPEC后独立QUALITY及实施收据均未完成。`verify-task10-subtask5.mjs` 只是已准备的验收工具；Task4的415项类型及208项测试只证明Task4完成时版本。计划保持19项已勾选、22项未完成，子Task5未勾选。用户暂停后不继续测试、构建、部署或付费调用。

   **本次恢复后的实际进展，覆盖上方暂停续接点：** Root核对 `task10-subtask5-mark-corrupt-read-green-resume.json` 选中1通过/54未选，及 `task10-subtask5-mark-matrix-green-resume.json` 全55项通过。预读修复已验证。原实现者继续安全seam RED后实现四语句关闭事务；`task10-subtask5-close-matrix-green.json` 实际66/66。Root提示的“公开run独立终止但execution仍admitted”精确路径已由 `task10-subtask5-mark-terminal-replay-red.json` 选中1项失败复现，随后queued配对重放检查修复，对应green选中1通过/66未选。不能把这个定向报告称67项全量通过。

   预算释放独立契约/seam的真实RED为 `task10-subtask5-release-red.json`（选中1失败/58未选），首条带closed/no-begin/身份/status及bucket更新链和最终SQL断言的实现通过 `task10-subtask5-release-green.json`（选中1通过/58未选）。当前仍在补充释放冲突、延迟实际SQL、整批回滚及文件重开矩阵。最终组合测试、lint、Root类型、SPEC及独立QUALITY尚未完成；`complete-task10-subtask5.mjs`只是准备好的完成门槛工具，尚未执行，计划仍19/22。

   **子Task5当前进入独立SPEC审查，覆盖上段矩阵待办。** 实施者已冻结七文件并交付 `task10-subtask5-implementation-receipt.json`；Root重读最终五文件 `task10-subtask5-green.json` 255/255、pending0，七文件lint0。当前415项类型输入无缺失/额外、编译选项不变，非增量tsc退出0（10.2628036秒）。Root实际核对同七源码、415类型、41保护源码和41原始副本，旧1090交接仅批准范围变化，见 `task10-subtask5-acceptance-root-verification.json` / `task10-subtask5-acceptance-final-hashes.json`。原budget settle及三个读取方法仅规范化CRLF后AST文本一致，见 `task10-subtask5-legacy-method-check.json`。新SPEC `/root/site_admission_lifecycle_spec_review` 正在审查；之后才派另一位独立QUALITY。尚未执行完成勾选或进入子Task6，也未新增真实Provider/构建/Git/部署。

可用恢复语句：**“继续 Arc v8，读取恢复检查点，从Task10子Task5独立审查继续。”**

## 已完成的后台执行器基础

| 单元 | 实现与证据 | 当前结论 |
| --- | --- | --- |
| Task1 传输 | `app/server/research/executor/body.ts`；实际字节上限、期限、取消、安全 JSON 解码；`task1-implementation-receipt.json`、`task1-root-verification.json`、`task1-quality-review.json` | 最终32/32、类型/lint通过，SPEC及QUALITY PASS |
| Task2 认证 | `app/server/research/executor/auth.ts`；原始字节及上下文 HMAC、时间窗口、复制输入、必须原子占用 nonce；`task2-implementation-receipt.json`、`task2-spec-review.json`、`task2-quality-review.json` | 最终86/86、392项类型输入/lint通过，双审PASS |
| Task3 持久记录 | `app/server/research/executor/d1-nonce-store.ts`；单条原子 INSERT、错误关闭、数据库重开后拒绝重复；两侧独立增量迁移 | 最终244/244、394项类型输入/lint通过，双审PASS |
| Task4 不可变任务 | `app/server/research/executor/job.ts`；严格规范化消息、SHA-256完整身份、复制与字节边界 | 最终106/106、396项类型输入/lint通过，双审PASS |
| Task5 开始授权与共享字节修复 | `app/server/research/executor/begin.ts`；不可变原始授权、完整单调耗时扣除；body/auth/job/begin 统一使用真实字节身份 | 最新201/201、399项类型输入、五文件lint通过，功能SPEC、修复SPEC及最终QUALITY PASS |
| Task6 私有规范化回执 | `app/server/research/executor/receipt.ts` 与begin独立grant解析；严格私有结果/错误、完整grant匹配、原文/费用保留、冻结快照及SHA-256 | 最终78/78、401项当前类型输入、三文件lint通过，SPEC及QUALITY PASS |
| Task7 持久任务与发送控制 | `worker/research-executor/d1-job-store.ts` 及独立jobs迁移；永久身份、原始授权、单次发送CAS与不可回退关闭 | 最终150/150、403项当前类型输入、两文件lint通过，SPEC及QUALITY PASS |
| Task8 私有回执存储与正文清理 | 真实R2条件写入、D1永久费用/身份、丢失确认恢复、同路径tombstone阻止正文重建 | 最终180/180、405项类型输入、四文件lint通过，SPEC及QUALITY PASS |
| Task9 网站策略与私有桥接配置 | 同步三份完整快照/指纹保持、远端Key不读取、独立HTTPS/HMAC凭据及不可用工厂门槛 | 最终145/145、408项类型输入、五文件lint通过，SPEC及QUALITY PASS |

Task4–9计划步骤均全部完成。表中早期验证对应各自历史版本，当前类型输入以Task9最终408项为准。Task9是配置兼容单元，尚未启用Workflow或远端Research；后续按网站持久准入、begin、执行与导入顺序接入。

Task3 的计划 `docs/superpowers/plans/2026-09-14-arc-v8-executor-nonce-storage.md` 五项步骤已全部勾选。最初实际行为 RED 为6项中5项预期失败，最终四个测试文件分别为 nonce51、auth54、body32、repository107，共244项全部通过。4个文件 lint 无错误/警告；非增量类型检查包含全部394项当前输入，未放宽编译器配置。

Task3 独立验证了实际文件数据库关闭/重开、两个数据库相互独立、20次竞争仅一条记录、不同方向/密钥标识/nonce、输入复制、过期及回拨时钟下保守拒绝、SQL字段/时间检查及数据库异常。测试的并发环境是本地同步 SQLite，并不证明线上分布式 D1 验收。

新增迁移 `drizzle/0007_research_bridge_nonces.sql` 与 `worker/research-executor/migrations/0000_research_bridge_nonces.sql` 完全一致；41张原表及14份旧SQL/快照不变，新增后42张表。没有运行时自动建表、端点启用或实际远端迁移；测试数据库临时目录已清理。

Task3 权威证据：

- `task3-implementation-receipt.json`、`task3-red.json`、`task3-green.json`、`task3-lint.json`
- `task3-root-type-verification.json`、`task3-type-input-scope.json`、`task3-type-source-hashes.json`
- `task3-root-migration-verification.json`、`task3-final-hashes.json`、`task3-root-final-hash-verification.json`
- `task3-spec-review.json`、`task3-quality-review.json`：均 PASS，无待修 P1/P2/P3。

8项最终文件和394项类型输入由 Root 与独立审查者分别核对一致。探索性的 `task3-trailing-line-red.json` 实际为通过的边界检查，不能按文件名当作新的 RED。质量审查中的只读 SQL 类型观察未发现当前字符串绑定路径的可达绕过，不增加无关修复范围。

## 当前已批准策略与总体设计

权威设计：`docs/superpowers/specs/2026-09-14-arc-v8-durable-research-executor-design.md`，批准时 SHA-256 为 `7f4c33ae18a95e3a87ea8a5d9b9e11893c8ee8d88316fdad85f40020ecc20411`。其冻结草案标题中的“尚未批准”已被用户后续明确授权取代。

- Kimi `moonshotai/kimi-k3`、`kimi-low-output32k-v3`、low、32768输出、complete-quality-v2；最多10次搜索、每次5条、总50条；Repair0，保持来源/课程质量、隐私和字节限制。
- Provider完整期限1200000ms、执行租约1260000ms、本地launcher1320000ms。新远端模式另有原始120000ms排队期限；begin只初始化一次执行租约，不延长或缩减模型预算。早期600/660/720秒记录为历史。
- 现有 Sites 网站负责登录、owner、准入、主D1、质量/发布、学习与Proof。独立 Cloudflare Worker/Workflow/D1/R2负责持久执行和受认证回执；不能仅让 Workflow 调用原有长时间网站 POST。
- 新服务端选择 `ARC_AI_RESEARCH_EXECUTOR=cloudflare-workflow-v1`。缺省同步分支及旧指纹完全保持；远端网站分支不要求或读取 Provider Key，固定 HTTPS 服务地址、独立双向HMAC，禁止请求选择地址及重定向。
- 网站 run+alias+outbox 原子创建，quota/budget 实际SQL检查准入封闭状态；begin一次授权，执行器持久 dispatch CAS 必须先于 fetch。付费 step 重试0；不明状态不能自动重发。
- 规范化回执先存私有 R2，再固定 D1 结果哈希；独立有界 Cron 从各中断点继续维护/交接。回执/费用证据不可变；无日志、404、超时不能证明未发送。晚到费用可对账，过期任务不复活为 Ready。
- 网站冻结完整 validation context、第一次回执解释及导入阶段。实际数据库时钟和事务失败断言保护最终发布；callback/用户 GET 共用完成函数，不重复生成包、配额或费用。
- 正文确认后或24小时后清理前必须固定有界费用元数据；去重身份保留。关闭新接单仍允许已有任务维护、历史读取和对账。

后续完整要求以该设计的12项故障/验收场景为准，Task1–3不替代整体后台验收。源码接入调查见 `site-integration-source-map.json`；具体进行到哪个计划，以本文件“下一步”为准。

## 已完成的前序工作与仍待发布的部分

不要重做原 v8 Tasks1–12、任务找回、成功配置迁移 Tasks1–4或已经验收的本地流程。

- 成功配置迁移报告：`docs/operations/v8-successful-policy-migration-validation-2026-09-13.md`；最终611/611、类型/lint/build、一次默认离线演练和独立整合审查已通过。
- 第十七次真实成功报告：`docs/operations/v8-seventeenth-success-result-2026-09-13.md`；实际结果 `outputs/live-research/summary-2026-09-13T06-02-51-035Z.json`。用户确认 ExitCode0，约85.685秒、8次搜索、费用约0.219672美元；该成功用于策略依据，不代表本次新后台已经线上通过。
- 本地源码备份报告：`docs/operations/v8-policy-source-backup-2026-09-14.md`。旧557文件归档和实际还原已验证；它不包含后加的本轮执行器源码。当前交接是本地源码/证据清单，不是新的归档、构建、GitHub备份或生产恢复。
- 恢复范围差距：`docs/operations/v8-release-data-evidence-2026-09-14.md`。旧工具只验证固定合成旧版数据，不能冒称完整v8真实D1/R2/Proof/OAuth恢复完成。
- 本地平台探测 `d1-clock-probe.json` 已验证毫秒DB时钟及批次最终失败回滚，模拟器已销毁；它不替代应用实际发布CAS测试或生产证明。

仍需完成两侧执行账本及服务接入、网站准入与导入拆分、独立Worker/Workflow及三类维护、页面快速返回与关页恢复、实际本地D1/Provider适配器/validator/planner的故障整合验证和两侧构建。之后推进真实资源及登录准备、零Provider托管演练、另获单次许可的真实验收、账户隔离/学习/Proof持久化、完整备份恢复、准确候选与GitHub备份、公开发布和发布后关键验收。

当前公开网站历史版本为 Research 关闭并保留开发提示的版本；本轮没有查询或改变线上状态。完整公开发布目标仍 active、未完成，不用 complete/blocked 代替用户暂停。
