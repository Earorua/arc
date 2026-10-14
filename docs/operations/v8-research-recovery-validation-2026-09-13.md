# Arc v8 Research 任务找回：本地实施验收

日期：2026-09-13。状态：Tasks1–4本地实施验收完成。Tasks1–3每任务SPEC及独立QUALITY/安全审查全部通过；Root19文件645项回归、类型检查、定向lint、21项HTTP、本地构建及默认离线终端均通过，最终独立整合QUALITY/安全审查PASS，无待修问题。

## 批准与范围

用户明确回复“批准任务找回设计”。实施依据为 `../superpowers/specs/2026-09-13-arc-v8-research-recovery-design.md` 与 `../superpowers/plans/2026-09-13-arc-v8-research-recovery.md`。继续使用已批准的顺序子代理、TDD、每任务SPEC后独立QUALITY/安全审查流程。

工作树为 `C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta`；分支 `codex/v8-openrouter-research-beta`，起始HEAD `7090153b4acad7b12df6a7ee4d675b46c41871dc`。已有未提交成果保留。本阶段只做本地实现和离线验证，不进行Git写入、生产/Sites操作或真实Provider请求，也不读取真实Key、环境文件内容或Provider原文。

第十七次真实验证的PASS及用户ExitCode0保持，单次许可已经消耗。本阶段不复用该许可，没有第十八次请求。

## 实现结果

- Start/Retry发出前保存有界、严格校验的v2恢复身份。存储失败时不发送新请求；原请求响应丢失后，刷新或返回页面可以查询相同提交。
- 新增 `POST /api/intelligence/research/recover`，采用查询语义和真实session owner，通过已有幂等别名或直接mutation记录找回。接口不创建任务、不申请新调用预算、不执行Research或Repair。
- 继续使用原有到期检查及可信费用结算；恢复查询不延长租约，也不使过期结果重新可用。合法别名加入其他活动任务的情况、历史配置、跨owner及损坏数据都有覆盖。
- 浏览器区分尚未确认的提交与已知runId；已知结果通过原GET读取。v1记录经owner GET确认后再迁移，迟到响应不能覆盖新页面或新账户的数据。
- Setup提供“Check research status”和明确的新建确认。换角色、进入Flagship或新建资格关闭不会把pending提交默认为取消。取消新建确认保留原恢复身份；新建仍受原资格限制。
- 本地演练适配器接入相同恢复接口，检查一次Start完成但响应被传输层丢弃后仍找回同一任务，且Fake Provider调用及预算预留不增加。

## 分任务证据

证据目录：`outputs/local-research-recovery-20260913`。`before-hashes.json`与29份`.snapshot`记录本轮前状态，避免将更早的未提交工作混入本轮审查。

| 任务 | 当前验证与审查 |
| --- | --- |
| Task1 服务端/客户端 | SPEC及独立QUALITY通过；独立5套196项通过，类型/lint通过。合法别名和可信费用恢复的测试覆盖问题已修正复审。 |
| Task2 浏览器身份/生命周期 | SPEC及独立QUALITY通过；独立3套145项通过，类型/lint通过。真实卸载/重新挂载后的旧Start/Retry晚到覆盖已补齐并复审关闭。 |
| Task3 页面/本地HTTP | SPEC及独立QUALITY通过。开发者最终8套288项（含Task2浏览器回归）、HTTP1项、类型/lint通过；9文件审查指纹一致。 |
| Task4 整体验收 | 19文件645项回归，失败/跳过0；非增量TypeScript、22文件lint退出0。恢复时275项指纹一致；新HTTP三文件21项、构建、产物核对及默认离线终端退出0。最终独立整合QUALITY/安全审查PASS。 |

初始沙箱`spawn EPERM`属于测试启动限制，没有计作功能RED。HTTP测试曾有Start传入额外kind、诊断未包含预算计数及Vite优化器准备不足等测试设施问题，均与缺失recover路由的实际RED分开记录。页面用例覆盖缺失按钮、错误起始提示及实际Setup资格关闭后编辑角色导致入口消失的RED→GREEN。

Task3独立规格审查发现一个真实显示缺口：Retry响应丢失后旧failed来源仍存在，手动recover被误标为非restoring。已用延迟响应的真实hook交互先验证RED，再限定修正为“查询且没有视图或存在pending身份时restoring”。付费Start/Retry和已知v2 GET轮询语义保持，Checking文案及焦点回归通过，复审关闭。Task2已审源码快照保存在Task3证据中，供核对这一行增量。

## Task4 恢复后的验收证据

| 检查 | 实际结果 |
| --- | --- |
| 恢复连续性 | `task4-resume-verification.json`：暂停清单SHA及275个文件均一致，保留之前645项、类型/lint证据，未重复未变测试。 |
| 本机HTTP | 三文件使用`--test-concurrency=1`串行执行，21项通过，失败/跳过0。覆盖响应丢失后的同任务找回、owner隔离、关闭付费入口仍可查询及原有激活/规划/私有路径保护。 |
| 本地构建 | 0.1.62的profile脚本返回portable/configured:false，保留现有项目配置；独立build命令退出0，包含recover接口。 |
| 构建产物 | 35项本轮候选、177项应用清单、13项保护源码、108项产物核对。Worker默认fetch及recover路由静态检查通过；63个JS文件未包含指定本地诊断/演练标记。15项迁移/metadata与历史版本及产物配对一致，hosting配对一致。 |
| 默认离线终端 | 无flags、仅一次，退出0。完成后复读`outputs/live-research/summary-2026-09-13T10-27-35-310Z.json`：passed/ready、质量通过、激活、6规划单元、owner隔离、重复请求拒绝及临时DB销毁。真实请求0、模拟Research1、Repair0，费用字段为模拟数据。 |
| 最终独立审查 | 独立审查者`/root/recovery_final_integration_review`阅读源码/快照差异/测试实现及实际回执，并核对35源码、29基线快照、13保护文件、108构建文件与离线Summary；PASS，无具体待修问题。见`final-integration-review.json`。 |

先前完整命令和645项结果位于`root-command-receipts.json`与`root-vitest.json`；本次实际命令/退出结果保存在`task4-command-receipts.json`，产物与离线断言分别见`root-artifact-verification.json`及`task4-offline-verification.json`。新Summary SHA256为`ece0ec766d91f3f007628655315b54c5b42fe1e49f89a7b16f5889f0214f0625`。当前dist已由本次源码重新构建；只验证本地产物，不据此宣称生产Worker运行通过。

HTTP/build启动时的沙箱spawn EPERM经限定本地命令提权解决，不属于功能失败。验收脚本初次在Windows PowerShell 5.1将ConvertFrom-Json数组作为一个管道对象，误报迁移数变化；用同版本最小诊断确认后改为显式数组枚举，源目录/产物均为15项且hash不变。只修正验收脚本，应用代码未变；无需重复645项或构建。

暂停清单保留为历史证据；当前交接采用`final-handoff-hashes.json`及`final-handoff-verification.json`，包含当前源码、构建、分任务/Root验证、独立审查及恢复文档。所有已启动命令均已结束，没有新预览或真实验证进程，也没有Git写入。分支`codex/v8-openrouter-research-beta`、HEAD`7090153b4acad7b12df6a7ee4d675b46c41871dc`保持，原有未提交成果保留。

## 产品与发布限制

本机恢复线索仍是一个当前账户槽位；退出登录按原隐私边界清除线索。本阶段不提供跨设备任务列表，清除浏览器数据后不能承诺找回。页面隐藏或卸载仍可中止当前等待；任务找回不保证服务端在断线后持续执行，也不代表取消成功或退款。

完整公开发布目标尚未完成。下一阶段仍需设计并验证：已成功Kimi请求策略与版本/缓存隔离的迁移；实际托管环境中的执行期限和断开行为；真实登录与学习流程；生产数据备份恢复、源码集成/GitHub备份及最终发布。当前生产参数和公开Research入口状态没有在本阶段改变。
