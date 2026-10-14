# Arc v8 响应预检候选：下一次单次真实验证方案

状态：2026-09-12，第十四次已经执行并消耗许可。安全 Summary `summary-2026-09-12T08-43-45-288Z.json` 确认 GET1/POST1、Repair0，122055ms、5次搜索、USD0.151111 settled；HTTP200/stop/引用/候选结构通过，课程质量 quality-needs-review，未激活/规划。详见 `v8-fourteenth-quality-result-2026-09-12.md`。已确认原 runner 不再运行，但实际终端退出码未知。没有第十五次或重试许可；下方固定候选和执行命令只保留为历史，不能再次运行。

## 已有候选证据

Root新验证为36组1341项全部通过、非增量类型和八文件lint退出0、当前Sites0.1.62五阶段本地构建退出0；15项迁移/元数据、hosting一致、38客户端文件与Worker默认fetch导出检查通过。默认PowerShell无模式参数演练退出0，新增安全Summary `outputs/live-research/summary-2026-09-12T05-54-45-164Z.json`，SHA256 `e1d5bda0dd6c99649cdb6b37aa53812cfca72b955fd46da090732f162695928a`。

该回执为offline/passed/0真实请求，预检compatible+accepted（291字节）、正式ready/质量/合成结算/激活/规划6单元/owner隔离/第二次拒绝/数据库销毁通过。它证明本地新增诊断和完整合成流程配合，不证明真实模型结果通过。八项实现、52项保护、13份历史实测和新离线Summary去重共68项已核对冻结，见 `outputs/local-response-preflight-20260912/root-final-candidate-hashes.json` 和 `root-final-validation.json`。

## 固定范围

- 用户在本机PowerShell隐藏输入专用、未使用、非循环USD5总限额的OpenRouter测试Key；助手不创建或读取Key，Key不写源码、文件、命令行或环境变量。名称可使用`arc-v8-preflight-once-20260912`，这只是名称建议。
- 至多一次Key GET加一次完整Research POST，固定moonshotai/kimi-k3、low、32768输出；最多10次搜索、50条结果，角色Data Product Manager、en-US。一个POST可含多轮服务商搜索子请求。
- Provider20分钟、租约21分钟、启动器22分钟；Research专用direct连接及现有隐私设置保持。USD5是总预算上限，不代表实际将花费USD5；本轮不因增加诊断而提高预算或改变模型。
- 不含Repair、续写、自动重试、模型回退、探测或第二次Research；不操作生产变量/旗标/D1/R2、Git写入、Sites候选或部署。

## 相比第十三次的变化

请求参数与候选课程验收要求不变，仅本地安全Summary新增`researchResponsePreflightDiagnostic`。完整stop响应在原引用验收之前收集引用错误类别及独立原始候选结构诊断；不保存URL、标题、正文或原始错误。

原`researchCandidateDiagnostic`仍表示正式业务解析；预检中的candidateSchema accepted只代表原始结构符合契约。合法JSON围栏可能在预检中报json-syntax、随后由既有流程整理并正式接受，这是阶段差异，不能据预检擅自改变业务结果。新诊断不放宽来源、质量或费用门槛。

## 结果与停止条件

完整真实Research通过仍须正式引用/来源/课程质量通过，runState ready、可信费用settled、owner隔离与第二次调用拒绝、激活和实际规划生成、临时数据库销毁及终端正常退出。HTTP200、stop、付费或单独预检accepted均不够；本地单角色通过也不代表线上持久任务或所有角色已验收。

如果失败，先核对当次新安全Summary的有限诊断与费用记录；保留结果，不再运行。若缺少某项诊断，明确该维度未知，不能把观察缺失冒充没有错误。不要求粘贴Key、完整Activity账户JSON、正文或不可见的旧父请求，也不尝试恢复旧正文。

后续针对实际字段提出兼容修复，必须有安全证据与契约支持；不能自动扩展标题回退、丢弃坏引用或修补截断JSON。成功后按`v8-online-research-readiness.md`推进线上长任务方案，不能直接启用生产Research。

## 第十四次执行前核对（历史）

本地Task1、Task2均已完成SPEC后QUALITY，Root最终相关回归/类型/lint/本地build/产物/默认离线PowerShell演练及独立整合审查均已通过。最终审查preflight_final_integration为FINAL READY，无P1/P2/P3，并独立核对68项候选、八项实现、52项保护、13份历史Summary和两份before快照。记录见outputs/local-response-preflight-20260912/final-integration-review.json；候选清单SHA256为6cf6fb11c0ba66443c38fbcf3081c1063363598d226ea3dc068040b36d1b5825。用户已明确授予第十四次许可并完成上述重核。执行只交给用户本机终端隐藏输入Key；用户回复“已运行”后只核对新结果，不重复启动。

## 第十四次执行交接（已消耗，不可重跑）

**本段是已执行命令的历史记录，不是新运行指令。第十四次已取得安全 Summary；请勿再次运行下列命令。新的质量设计尚待批准，也没有第十五次请求许可。**

建议专用未使用、非循环总限额USD5的Key名称：`arc-v8-preflight-once-20260912`。仅在本机PowerShell执行以下命令一次；Key只在脚本的masked提示中输入，不放进命令。输入后等待同一窗口，最长总期限22分钟；输出可能在结束时集中出现。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\XF\Documents\Codex\2026-07-26\sites-plugin-sites-openai-bundled-2\.worktrees\v8-openrouter-research-beta\scripts\live-research\run.ps1" -ExecuteOne
```

结束会打印有限安全JSON和Summary路径，或有限错误。成功/失败均先保留结果并回复“已运行”；不重试、不补发probe。若说明仍在运行，先确认并等待同一次runner，不因为暂时没有输出就再次启动。交接前最新Summary仍为05:54:45的offline-dry-run，不是本次实测。授权记录位于outputs/local-response-preflight-20260912/fourteenth-authorization.json。
