# Arc v8 本地质量规则与有限诊断实施记录

2026-09-12，用户已批准设计；三任务双审、Root本地验收及最终独立整合审查全部完成，候选FINAL READY。方案 `../superpowers/specs/2026-09-12-arc-v8-quality-contract-diagnostics-design.md`，实施计划 `../superpowers/plans/2026-09-12-arc-v8-quality-contract-diagnostics.md`。

基线：分支 codex/v8-openrouter-research-beta，HEAD7090153b4acad7b12df6a7ee4d675b46c41871dc；88项批准前交接指纹一致，14份应用/脚本/测试before快照已保存到 outputs/local-quality-contract-20260912/before。保留全部原有未提交成果；批准记录 approval-and-status.json。旧goal工具可能保留blocked元数据，但用户批准已解除本地设计等待，不重新创建或缩减完整发布目标。

## 任务与验收

- Task1：本地精确规则/profile v3已完成SPEC→QUALITY审查。初次RED 11项中7失败/4通过，GREEN 9文件176项通过，lint10文件0错误/警告，Root原始全项目非增量tsc exit0。QUALITY的一项P2测试保护回归已补回独立完整前缀；合成删句RED 1失败/26通过→2文件27全通过，tsc/lint通过，QUALITY限定复审PASS。实际只强化一个测试，应用源无改动。12项修后hash保存reviewed-candidate-hashes.json，初审candidate-hashes.json保留。
- Task2：原语义校验点有限诊断已完成并通过独立SPEC→QUALITY，无剩余finding。实际RED为golden结果相同但应观察1次/实际0次；最终4文件263项通过（新diagnostic55、observation58、原package96、source54），原始全项目tsc及目标lint exit0。审查者额外只读合成检查getter零调用，完整枚举+双schema各16对组合2390字节，throwing then/rejected/pending Promise隔离。证据task2/verification.json、manifest.json及双审JSON，Root核对4源码/快照一致、70保护及Task1修后12项未变。
- Task3：首次正式Research观察与Summary已完成TDD及独立SPEC→QUALITY PASS，无剩余finding。初次RED为完整离线生命周期通过后缺诊断字段；最终6文件160项（新增31）通过，原始全量tsc/lint exit0。四文件冻结于task3/manifest.json；观察者on/off全SQLite持久行一致，公开接口/Repair/cache无诊断，后续保存失败保留语义阶段但不误报Ready。QUALITY额外合成恶意投影与Promise隔离检查通过。
- Task4：Root精确42文件1529/1529、全项目非增量tsc、18文件lint、Sites本地五阶段build、产物核验、默认PowerShell无模式参数演练全部exit0。新offline Summary为summary-2026-09-12T12-46-23-545Z.json（SHA1007c396a1bb3204399e5bae6a10f8c3e190b3159de6ecbd5035597d50dd4dd8），0真实/Repair0/Ready/质量诊断accepted/激活/规划6单元/隔离/重复拒绝/销毁通过。108项候选、55项构建文件冻结，70保护及16历史安全Summary未变；最终独立整合审查FINAL READY，无finding；复核108候选、55构建、70保护与14before快照全部一致。

当前真实结果仍为第十四次quality-needs-review：HTTP/引用/候选结构通过，122055ms、5次搜索、USD0.151111 settled，未激活/规划。新本地设计不能把此结果改为通过。没有第十五次/Repair/重试、Git写入、生产变更或Sites候选保存/部署。

Root只读Sites元数据仍显示active/owner/public、latestVersionNumber10（不是新部署确认），未读取或保存凭据字段；本地Sites执行profile检测为portable/configured=false，保持现有项目脚本和依赖。此次是本地构建准备，不是重新发布。

Task1证据在 outputs/local-quality-contract-20260912/task1：原始RED工具显示被30000 token上限截断，red-result.json仅保存事实摘要；targeted-vitest.json/targeted-eslint.json为测试工具结构化输出。标准Research/Repair完整合成body及SHA冻结不变，本地body18027字节；profile指纹d49c3eea…6966变为f5bf6a40…53d0。Root核对70项保护文件未变。之前Root保存的12个.ts证据快照误入根tsconfig的全局include，已仅改为.ts.snapshot且内容SHA不变，before/manifest.json记录14份快照路径；根tsconfig未改，task1/root-tsc.json记录修正后的原始全量通过。

Root实际证据见root-final-validation.json、root-vitest.json（42个实际testResults路径与root-suite-plan.json完全一致；不是describe数）、root-static-checks.json、root-build-command.json、root-build-artifacts.json。测试与build首次受Windows sandbox spawn EPERM阻止，精确本地命令经限定权限重试通过；没有应用失败被隐藏。冻结helper首次因PowerShell5 ConvertFrom-Json数组包装停止，修正helper后70保护hash一致；这不是源文件变化。构建产物为15迁移/元数据、38客户端文件、hosting与Worker共55文件；Worker2385661字节，SHA3efa8c7a32ff59f98d61504c0a37cdc82185424505b6ddbe3385230037363ddc。默认离线costMicros100000为fixture模拟值，本轮真实费用为0。

新交接方案为v8-quality-contract-live-validation-2026-09-12.md，第十五次仍未授权；同Kimi low/32768、10次搜索50结果、USD5、20/21/22分钟，单GET+单POST，无Repair/重试。finishing-a-development-branch按用户既定选择保留分支和工作树，不做Git写入或清理。完整首版公开发布目标未完成；本地三任务批准门槛已经解决，不以旧goal工具blocked元数据暂停或重建缩减目标。
