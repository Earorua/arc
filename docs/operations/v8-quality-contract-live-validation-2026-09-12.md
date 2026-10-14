# Arc v8 质量规则候选：第十五次单次真实验证方案

状态：2026-09-12，第十五次已执行并消耗许可。HTTP200后outer-json/invalid-json，303534ms、1100字节、费用未知；用户ExitCode1，未Ready/激活/规划。原runner已结束。结果见v8-fifteenth-transport-result-2026-09-12.md。没有第十六次或重试许可；下面执行命令仅为历史，不得重跑。

## 已完成的候选与证据

本地 profile 为 kimi-low-output32k-v3，outputPolicyVersion 为 kimi-complete-quality-v2。请求明确表达现有课程质量要求，包括资源双向关联、唯一标识、技能阶段覆盖、权威来源与有效证据、两层免费替代，以及所有单元种类的时长和检查点规则。原质量门槛、标准 Research 和 Repair 请求内容保持不变。

本地 Summary 新增 researchQualityDiagnostic，仅保存固定枚举、有限 schema 范围和错误类别，最多8192 UTF-8字节；不保存正文、URL、标题、ID或错误原文。它表示语义校验阶段的观察，最终是否成功仍以原 outcome、runState、quality、费用和实际规划结果为准。前置失败可为null，后续保存或租约失败可保留accepted阶段诊断但不会因此成为Ready。

Task1–3均完成TDD、独立SPEC后QUALITY审查。Root精确42文件1529项全部通过，原始全项目非增量tsc、18文件lint、Sites本地五阶段build、15项迁移/元数据与hosting一致性、38客户端文件及Worker检查通过。默认PowerShell无模式参数演练exit0，offline/passed/0真实/Repair0/Ready/质量/激活/规划6单元/owner隔离/第二次调用拒绝/数据库销毁通过。fixture costMicros100000是模拟费用，本轮实际费用为0。

安全回执：outputs/live-research/summary-2026-09-12T12-46-23-545Z.json，SHA256 1007c396a1bb3204399e5bae6a10f8c3e190b3159de6ecbd5035597d50dd4dd8。

证据目录：outputs/local-quality-contract-20260912。108项候选、55项构建文件已冻结；70项保护和16份历史安全Summary未变。最终独立审查FINAL READY，无finding，并重新核对上述全部指纹及14份before快照。候选manifest SHA256 dd72e462e520adf5c165496eb85a81c9b2b6a105f7e437f6603509c1dbc1ab96。

## 已授权范围

- 用户在本机PowerShell隐藏输入专用、未使用、非循环USD5总限额测试Key；建议名称 arc-v8-quality-v3-once-20260912。助手不创建或读取Key，Key不写入源码、文件、命令行或环境变量。
- 至多一次Key GET加一次完整Research POST；moonshotai/kimi-k3、reasoning low、32768输出tokens；Data Product Manager、en-US；最多10次搜索、50条结果。一个POST可能产生多条服务商搜索子请求。
- 总预算上限USD5；Provider20分钟、租约21分钟、启动器22分钟；保留既有direct连接及隐私配置。上限不是预计消费额。
- 不含Repair、续写、自动重试、模型回退、探测或第二次Research。成功或失败都先保留当次回执，不自动再发请求。
- 不包含生产变量/旗标/D1/R2、Git写入、Sites候选保存或部署。公开Research入口不由本次本地实测开启。

## 执行与判断

授权后先核对108项候选指纹、当前分支/HEAD及是否已有同一runner，随后只交付一次运行命令。Key仅在用户终端masked提示中输入。用户等待同一窗口结束，输出可能集中在结束时打印；暂时没有输出不能作为重跑理由。

结束后核对新安全Summary、实际终端退出码、有限诊断与可信费用。完整成功须正式引用/来源/课程质量通过、runState ready、费用可信且settled、owner隔离和第二次调用拒绝、账户激活、实际规划生成及临时数据库销毁全部通过。HTTP200、stop、付费或单独诊断accepted不代表完整成功。

如果失败，依据新诊断定位类别；诊断缺失表示该维度未知，不等于无错误。不要求旧正文、完整Activity账户JSON或不可见父请求，也不读真实Key。新修复须有证据与契约支持，不能放宽质量来通过。

本地真实验证成功后，仍需按v8-online-research-readiness.md完成线上长任务方案和公开发布门槛。完整首版公开发布目标保持未完成。

## 第十五次执行交接（历史，许可已消耗，禁止重跑）

使用专用、未使用、非循环USD5总限额测试Key，建议名称arc-v8-quality-v3-once-20260912。只在本机PowerShell执行下面一次；Key在脚本masked提示中输入，不放进命令或对话。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\XF\Documents\Codex\2026-07-26\sites-plugin-sites-openai-bundled-2\.worktrees\v8-openrouter-research-beta\scripts\live-research\run.ps1" -ExecuteOne
Write-Host "ExitCode: $LASTEXITCODE"
```

保持同一窗口等待，最长总期限22分钟；日志可能在结束时集中打印。完成后会显示有限安全JSON/Summary路径或有限错误，最后一行显示实际退出码。回复“已运行”和ExitCode即可，不重试、不补发probe、不发送Key。若尚在运行，只等待同一个runner；暂时无输出不代表失败。
