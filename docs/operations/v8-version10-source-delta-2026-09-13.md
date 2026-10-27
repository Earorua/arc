# Arc v8 当前候选与 version 10 来源对照

2026-09-13，只读源码审计。第十七次完整本地真实Research已通过；任务找回设计仍待用户批准。本轮核定已部署v8来源与当前候选的差异范围，没有重跑测试/构建、修改应用或访问生产。

## 来源与比较方法

以历史部署报告 `v8-deployment-attempt-2026-09-07.md` 指定的本地源码 `cd2b9abead3a98d635850461e2b49bb650618a6d` 为基准。重新解析完整commit及tree `fd4c50e8989e3ea5e189b15dd2283a6e0324f32c`，与报告一致。报告将此tree对应到Sites version10源码 `2b0ed9376e8693250277c194c297076ff975a257`；本轮没有下载远端源码或artifact，因此这是本地对应来源的比较。

范围为app、db、drizzle、worker、`.openai/hosting.json`、package.json和package-lock.json，190个基准文件。逐项比较原始Git blob和当前文件字节，先分原样一致，再单列仅CRLF/LF不同；没有移除其他空白或把换行差异混写为字节一致。另核对这些范围内已跟踪及未忽略新增文件。未读取环境文件、Key或Provider正文。

初次未引用花括号的PowerShell rev-parse参数解析失败，不作为来源证据；随后对完整带引号的commit/tree参数逐条检查退出码，均成功。没有Git写操作。

## 当前结果

| 项目 | 实测 |
| --- | --- |
| 基准文件 | 190：26字节完全一致、157仅CRLF/LF差异、7实质变化、0缺失 |
| 实质变化的应用文件 | research目录中的openrouter-provider、orchestrator、package-validator、provider、service-factory，共5个 |
| 其余实质变化 | package.json、package-lock.json：增加undici 7.24.8直接devDependency；lock仅根声明新增1行 |
| 新增应用源码 | 7个，均位于app/server/research：6个诊断模块和local-validation-profile.json |
| 迁移/metadata | 7份SQL、7份snapshot、1份journal，共15项；相对基准无实质差异，也无新增迁移文件 |
| 其他范围 | 已比较的非Research应用、db、worker、hosting文件无实质差异；此结论不扩展到未比较的public、scripts、tests或其他根配置 |

逐文件双方SHA256及分类位于 `outputs/local-recovery-design-wait-20260913/version10-source-delta-audit.json`。当前源码/回执117项与构建108项的既有验收指纹继续有效；此次静态审计不替代它们。

## 对后续工作的影响

当前候选没有相对已部署v8对应来源的新SQL迁移要打包；不要重复套用旧v7.2→v8新增五份迁移的步骤。但生产已应用ledger、实际结构和协调恢复点仍未检查，不能据此断言生产无需执行任何迁移。

共享搜索策略已在当前候选中为10次、每次5条、总50条，`service-factory.ts`把完整 `RESEARCH_SEARCH_POLICY` 放入配置指纹。它相对version10已发生变化；后续生产迁移应核验这个现有变化与旧缓存隔离，不重新实现10次搜索。当前生产factory仍未注入本地low/32768/v2质量请求策略，仍为120秒调用/60秒租约；这些才是明确未接入项。

旧v7.2不可直接接管v8数据的实测结论保留。version10同属v8且数据合同范围本次无实质源码差异，是后续评估保留应用的具体起点，但尚未实际执行version10对新Research数据的读写、核验依赖/完整bundle或恢复artifact，因此本报告不给出rollbackEligible=true。当前Research关闭路径也不能取消已在途调用或退还未知费用。

第十七次许可已消耗，没有追加请求。完整目标仍包括线上运行、真实登录和学习流程、生产恢复、GitHub源码备份及公开发布后验收。任务找回设计的批准仍是下一实施步骤；本轮没有把静态对照当作设计实施或发布通过。
