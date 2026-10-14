# Arc v8：20分钟Research的线上执行约束

2026-09-13 衔接更新：第十七次完整本地真实Research PASS，85.685秒、8搜索、USD0.219672可信结算、用户实际ExitCode0；详见v8-seventeenth-success-result-2026-09-13.md。单次成功没有验证本页20分钟平台边界，也没有降低已批准的质量/期限。当前从本地任务找回设计继续，执行器及生产策略迁移仍待后续；下方“本地格式诊断待批准/真实结果未通过”均为历史。

2026-09-12，只读能力与源码调查，未实施、部署或发起Provider请求。本轮在本地响应格式观察设计待批准期间推进独立上线准备；该设计仍未获批准，第十五次许可已消耗。当前完整公开发布目标未完成。

## 新证据改变了哪些选择

当前本地Provider期限1200秒，旧线上调查基于600秒。本轮核对Cloudflare官方现行限制后，不能再把队列、Cron或Durable Object alarm笼统列作可直接容纳当前整轮Research的后台执行器。

| 执行方式 | 已查明边界 | 对当前候选的判断 |
| --- | --- | --- |
| HTTP请求／持续响应流 | 调用方保持连接时无固定墙钟上限，断开或返回响应后相关工作可能终止；waitUntil最多再延长30秒 | 时长可能足够，但不保证离开页面后继续。仍需本站链路验证和恢复身份，不能以HTTP/SSE等同持久后台执行 |
| Queue consumer／Cron／Durable Object alarm | 每次调用墙钟上限15分钟，网络等待也计入 | 不能直接执行允许20分钟的单次Provider请求；降低期限去适配会改变用户已批准的质量/稳定性边界 |
| Workflows step | 平台墙钟时长不限，但仍有CPU及可配置step timeout | 值得进一步核对的持久执行选项；必须设置适合完整预算的step timeout，而非照用默认值 |

依据：[Workers limits](https://developers.cloudflare.com/workers/platform/limits/)、[Queues invocation limits](https://developers.cloudflare.com/queues/platform/limits/)、[Workflows limits](https://developers.cloudflare.com/workflows/reference/limits/)。这是将文档边界与本地1200秒策略比较后的工程判断，不是本站实测。不能据此解释第十五次在303秒结束的原因。

Workflows文档另外明确不支持部署到Workers for Platforms namespaces。本站是否能使用独立Workflow、跨服务调用或对应绑定目前没有证据；不把Sites直接等同于任意个人Cloudflare账户，也不仅凭dispatch字样认定其内部部署结构。[Workflows deployment restriction](https://developers.cloudflare.com/workflows/reference/limits/)

## 默认重试不能直接套用付费推理

Workflows默认step配置为10分钟timeout、retries.limit 5；文档同时说明step可能重试，外部API调用需要幂等设计。[Step configuration](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/)、[Idempotent calls](https://developers.cloudflare.com/workflows/build/rules-of-workflows/)

因此，即使最终获得Workflow能力，也不能把当前Research函数包进默认step后视为完成。付费调用开始但回执丢失时，重新执行可能产生另一次付费请求；后台任务重新投递不构成用户的新许可。下一份线上设计必须明确持久调用准入、已开始但结果未知的处理、只读恢复、关闭入口及晚到费用结算；不能承诺Provider端恰好一次，不能把停止自动重试等同所有崩溃窗口都已解决。

## 当前Sites能力证据的范围

核对当前会话可调用的24个Sites工具，以及安装路径0.1.62的hosting、starter-capabilities、persistence-and-storage文档。当前可见范围包括站点/版本/部署、访问、环境值、逻辑D1/R2和相关读取；未找到队列、Workflow或Durable Object绑定的可调用管理操作。保存版本工具只接收项目、源码提交及可选构建归档，没有可据此确认的后台执行器配置参数。

本站manifest只有既有project_id、D1 DB及R2 PROOF_ASSETS。以上说明“当前可用接口未确认接入能力”，不证明平台绝对不支持。没有调用生产变量、数据库、R2、日志、Key或新的部署/账户接口；未购买或创建外部服务器，未安装插件。

## 源码接入约束

- app/server/research/orchestrator.ts:49的start在创建或重放运行后，同一调用栈执行Research；重放分支只返回现有运行。不能将start重放解释为后台恢复执行。
- orchestrator.ts:97的准入检查、配额/预算与researching状态转换目前位于同步执行流程内；:178的call在action之前检查当前状态，而成功/失败审计在响应后记录。现有设计避免未知运行自动重发，未来拆分执行不能绕过这些门槛，也不能把“没有最终审计”视为“未发请求”。本轮未证明现有同步流程存在重复调用漏洞。
- app/lib/use-role-research.ts:94隐藏/卸载停止操作会abort；:137后才持久化首次返回的runId。后续恢复必须覆盖“服务端已创建而浏览器还没拿到runId”，且owner来自服务端session。
- 生产仍是120秒Provider/60秒租约/12000输出；本地low/32768/v2请求质量规则尚未迁移。线上方案必须同时解决请求策略、配置指纹和缓存边界，不能只更换执行器。

## 可据此推进的具体下一步

不能把更易通过的连接保持演练当作持久后台完成证明。线上规格应明确区分：连接保持时完成、断线后查回状态、断线后仍能完成，三者需要不同证据；用户对具体行为的选择应在完整方案中确定。

1. 本地格式诊断按已写好的设计等待批准，随后离线实施；当前候选的完整真实Research仍需后续明确许可和成功回执。
2. 在确认Sites可调用的持久执行能力之前，不编造Workflow绑定或用queue/alarm代替20分钟完整请求。若需独立托管服务，先给出具体服务、数据/密钥边界、成本及部署方案再交用户审阅。
3. 若最终选择HTTP路径，必须对用户明确连接依赖，并以本站受保护、无Provider的实测证明20分钟链路和断线恢复；现阶段未获准新增公开探针或部署。
4. 任何路径均需模拟重复投递、调用前后崩溃、费用未知、首次响应丢失、跨账户查询和晚到回执，验证不会自动增加Provider请求；之后才进入目标环境真实登录、学习流程、备份恢复及公开发布验收。

调查证据目录outputs/local-online-execution-readiness-20260912。上一目标回合完成真实失败核对、合成调查和可审阅设计，归为progress；本回合新增15分钟执行上限、Workflow部署限制和默认重试/超时证据，改变后续执行器选择，也归为progress。没有存活的真实runner等待；未缩减目标，未将此调查记作实现或上线成功。
