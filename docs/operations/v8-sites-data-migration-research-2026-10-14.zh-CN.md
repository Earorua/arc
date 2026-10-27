# Arc 旧站数据迁移方法研究（2026-10-14）

本轮范围：核查旧站归属、当前可用平台能力、官方文档、相关客服答复和既有源码；没有实施生产迁移。日期按北京时间。结论是已经找到可继续验证的技术路线，尚未取得可恢复的真实数据备份。

## 结论

旧站由 OpenAI 的 ChatGPT Sites 托管，底层采用 Cloudflare Workers、D1 和 R2。现在的迁移方向是从 Sites 管理的资源迁到用户自有 Cloudflare 资源，而不是从一种完全不同的数据库产品重写到另一种产品。

目前没有在本次可用的 Sites 工具或已阅读文档中找到完整自助导出入口。这不等于数据无法迁出。除平台协助导出外，旧站应用通过现有存储绑定执行受控的逻辑导出，是值得独立开发和验证的备选路线。这里的“可行”是依据源码与官方接口作出的技术判断，不是已通过真实 Sites 环境验收的结论。

## 本轮核实的事实

- 原生 get_site 返回 Arc.、public、active、当前用户 owner、current_live_url 为 https://arcmaps.net；latest_version_number 为 11。该字段表示最新保存版本，本轮没有用它单独推断正在服务的版本号。
- list_custom_domains 返回 arcmaps.net 的绑定、平台及 SSL 状态均 active。
- read_database_overview 返回 DB 绑定及 42 张应用表，无省略或截断，包含 users、accounts、planning_workspaces、proof_assets 和 account_recoveries。本轮没有读取业务行或认证字段值；这不是数据备份或行数统计。
- 当前可用的 25 项 Sites 工具没有完整数据库 export/backup/restore 或 R2 对象枚举下载工具。read_database_table_rows 每次最多 25 行、offset 上限 10000，并具有字段/行/值截断投影，因此不能当成完整备份工具。
- 本地 .openai/hosting.json 明确声明 DB 和 PROOF_ASSETS。保留的 Sites v11 源码通过 env.DB、env.PROOF_ASSETS 访问存储，普通应用已有文件读取能力。
- 本次尝试打开 Sites 网页设置，内置浏览器转到未登录页面；没有验证设置界面是否另有导出按钮。这个限制不影响上述原生工具读取。
- OpenAI Support 案件 16497022 的北京时间 2026-10-06 02:43 答复指出：现有指导没有文档化的完整 D1/R2、账号、秘密及历史源码打包迁移流程，并要求项目 ID、工作区、套餐、地区和相关聊天/版本信息。北京时间 10 月 9 日的后续邮件是自动提醒，不是新的迁移方案。未从这一邮件线程判断工单当前是否关闭，也未发送回复。

本轮安全元数据见 [核查证据](../../outputs/local-sites-migration-research-20261014/metadata.json)。其中没有用户行、令牌或备份正文。

OpenAI 的 [Sites 文档](https://learn.chatgpt.com/docs/sites) 说明其托管工作流，以及 D1 用于持久记录、R2 用于文件；具体到 Arc 的归属及绑定以上述原生结果与项目配置为依据。

## 三条迁移路线

| 路线 | 必要条件 | 本次判断 |
| --- | --- | --- |
| Sites 平台协助提供完整导出 | 平台明确提供 D1、R2、结构状态及一致性协调方式 | 保留为首选支持路线，现有回复尚未交付操作方法或导出包 |
| 直接调用 Cloudflare 导出 | 对源数据库/桶有有效的所属账户权限及准确资源身份 | Cloudflare 有标准工具，但 Sites owner 身份不等于底层 Cloudflare 管理权限；当前没有这项源资源凭据证据 |
| 在旧站应用中加入受控导出能力 | 能通过正常 Sites 发布流程部署经过验证的维护/导出版本；现有存储绑定提供所需读取能力 | 自主推进价值最高的备选路线；需要先做本地/隔离实验，不能声称当前已经可用于生产 |

Cloudflare 支持用 [D1 导入导出工具](https://developers.cloudflare.com/d1/best-practices/import-export-data/) 导出 SQL，再导入目标库；[导出 API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/export/) 需要源账户和数据库身份及授权。原生导出会阻塞该库的查询，不能当作完全无业务影响的探测。

## 应用层导出路线的具体要求

1. **从旧站准确版本单独准备导出候选。** 不把未发布的 Research 数据库升级混入旧站导出版本；检查发布包中 SQL 与旧站历史精确一致，避免平台自动应用新迁移。先验证导出候选不会改变业务表。
2. **建立受控的一致性窗口。** 除非平台提供协调快照，否则需要暂停源站写入并排空在途请求。覆盖两个域名、登录回调、会写入限流/审计的读取路由、文件上传及删除。仅关闭 Research 或只拦截 POST 不够。新站在最终切换前也不能任意积累待覆盖数据。
3. **导出数据库结构与完整应用记录。** 通过绑定读取实际 schema、索引、触发器和全部可访问应用表；用稳定主键游标分块。按 SQLite 类型保留 NULL、二进制、文本和数值，避免 JSON 截断及大整数精度损失。检查未知表、复合主键和大字段；未知结构必须报告，不能静默跳过。
4. **枚举并下载文件。** 通过 R2 原生绑定 list/get 取得完整对象清单、原 key、字节和 HTTP/custom metadata，包括没有数据库引用的对象。分页只跟随返回 cursor；逐对象计算校验和。上传时间/version/etag 等平台产生字段作为源证据记录，不能承诺导入后平台会生成相同值。
5. **安全交付并保留原始备份。** 导出接口应具备独立管理员认证、短时授权和关闭机制，文件加密保存到受控位置；禁止匿名下载、公开桶、在 URL/聊天/Git/常规日志中传递凭据或原始账号数据。原始导出保持不变，所有转换在副本进行。
6. **先恢复到隔离目标。** 验证所有行、关系、文件字节及元数据，随后验证旧用户重新登录能找到原计划/进度、两位用户互相不可访问、新注册/计划创建/附件读写正常。源站在验收完成前保留。

依据：[D1 Worker 绑定 API](https://developers.cloudflare.com/d1/worker-api/) 支持应用内 SQL 读取；[R2 Worker API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) 支持对象枚举、正文和元数据读取。将这些能力组合为迁移工具是本项目的设计推断，尚未进行生产验证。

不要以 db.dump() 作为现代 D1 的默认方案：[官方说明](https://developers.cloudflare.com/d1/worker-api/d1-database/#dump) 限定该接口适用于早期 alpha 数据库。也不能用 D1 session/bookmark 替代跨 D1/R2 的快照协调证明。

## Arc 特有的两项转换

**账号身份。** 保留 users.id、accounts 的 provider/account/user 映射及全部业务 owner 关联。旧 BETTER_AUTH_SECRET 缺失不必然意味着丢账号；现有本地认证演练支持在目标副本清理旧会话、OAuth 临时状态、旧 token 和未完成关联意图，再使用新秘密重新登录。真实用户连续性仍需验收，不能按邮箱自动合并或把意外新建用户算作迁移成功。参见已有 [认证迁移研究](../../../v8-cloudflare-migration/docs/operations/auth-migration-readiness.md)。

**数据库历史。** Sites v11 的 0007 是 account_recovery，而整合候选的 0007–0011 是 Research 扩展、0012 才是 account_recovery。必须建立实际 schema/数据转换及历史对照，不能直接重放整条新迁移链。若平台内部迁移台账不向绑定开放，应单独记录这一缺口；目标台账的重建不能冒充原平台台账的导出。参见 [整合设计](../superpowers/specs/2026-10-14-arc-v8-release-source-integration-design.md)。

## 后续验证顺序

先验证受控逻辑导出的本地往返：使用 v11 完整结构和合成数据，覆盖账号关联、长 JSON、二进制、空值、数值、全部表和无引用文件；证明恢复后值与关系完全一致。随后在隔离托管环境验证运行时限制、断点续传、授权和写入协调。通过后，才能形成可审阅的旧站维护/导出发布候选，并执行真实导出和隔离恢复。

平台支持路线可以与这些验证同时推进，不必把全部技术研究挂起等待客服。本轮产出是研究和证据，不是可执行的生产导出器、已完成的数据迁移或正式切换。

