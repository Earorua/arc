# Arc v8 成功配置迁移：实施前核对

2026-09-13：任务找回Tasks1–4已完成本地验收；下一阶段为成功请求配置迁移。新设计自审及独立复审READY，无具体待修问题，尚未批准或实施。持续公开发布目标保持active、未完成。

## 本次新增证据

- 恢复阶段411项交接均一致；之前645项回归、21项HTTP、build、默认离线及最终独立审查不重做。
- 新的只读源码审查明确了两个容易遗漏的点：成功本地请求与标准路径都使用同一组全局versions；新的配置身份足以隔离缓存，无需同时改变请求中的版本。旧标准提示与本地quality-v2关于checkpoint的规则不同，必须迁移完整本地提示组合，不能简单追加一段要求。
- 新生产档可复用现有repo的configFingerprint隔离、历史get/recover和费用恢复；跨指纹Retry应继续拒绝，不能改成隐式新请求。admin可用性委托同一个工厂解析器，没有另一个需要同步放宽的超时校验器。
- 本次仅调用Sites get_site的只读元数据投影：active、owner、public、latest version10，公开地址仍为`https://arc-precision-path.jiahe-xu.chatgpt.site`。该元数据不证明版本内容、真实登录或生产功能验收。
- 当前可见Sites接口共24项，本地manifest只有既有D1 DB/R2 PROOF_ASSETS，未取得Workflow等持久执行绑定证据。没有读取运行环境值、用户数据、Provider正文或日志，也没有远端写入。

证据：`outputs/local-policy-migration-design-20260913/context-audit.json`、`source-audit.json`与`audited-source-hashes.json`。15项源码/声明/示例/元数据哈希保持不变。`.env.example`只是受版本管理的空凭据示例，不是真实环境文件。独立审查见`design-review.json`，已核对实际源码、配置边界、Repair、缓存与恢复设计；设计SHA256为`cec3a4f98ff80fcbf58a97b7b97198d04cf93d58a4377ae0d166bcef26cf58d9`。

## 当前可审阅方案

设计：`../superpowers/specs/2026-09-13-arc-v8-successful-policy-migration-design.md`。

增加明确的服务端selector：不提供时旧行为及旧指纹保持；精确选择Kimi档时统一校验low/32768、完整quality-v2提示、1200秒Provider/1260秒租约、Repair0和每轮应用预留不超过USD5，1320秒launcher仅本地。未知/错误配置拒绝新调用。搜索10/5/50、隐私、schema和质量接受规则保持。

实施将用完整请求对照、Fake timers、真实本地D1缓存/历史恢复/费用/规划集成证明新工厂行为。旧真实单次成功不能冒充新入口的实际调用；本地测试不能冒充20分钟托管运行。这一阶段不新增付费请求或生产开关。

新配置迁移范围尚未批准。用户批准这份具体设计后，再写详细实施计划并沿已批准的顺序子代理、TDD、规格后独立质量/安全审查推进；不再询问相同工作流。此批准不延伸到后续服务创建、生产变量/数据、Git推送或部署。

## 后续公开发布依赖

此次重新核对的[Workers限制](https://developers.cloudflare.com/workers/platform/limits/)仍区分连接保持与断线后的生命周期；[Workflows限制](https://developers.cloudflare.com/workflows/reference/limits/)和[step设置](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/)说明它也不能直接采用默认超时/重试包住付费调用。具体执行器、账户、数据与凭据边界、费用和关闭路径需在下一份设计中确定，并取得本站实测。

真实登录、跨账户隔离、学习/Proof持久化、生产迁移备份恢复、源码集成/GitHub备份、可审阅发布候选、deployment成功和发布后验收仍待完成。本轮没有修改应用、构建、生产或Git。第十七次已消耗，无第十八次；完整目标没有缩减为本地配置迁移。
