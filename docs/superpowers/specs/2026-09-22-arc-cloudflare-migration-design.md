# Arc 独立 Cloudflare 迁移设计

2026-09-22。用户在听取“整站独立部署、保留旧数据、配置登录、验收后切域名”的四步路径后明确要求“现在开始推进完整迁移”，随后“继续任务”。本设计把已授权路径落实为可验证边界；日常本地实施和部署授权继续有效，不重复索取。用户仍保留原 Research 子代理/TDD/规格后质量审查流程。

## 目标与方案选择

将当前公开 Arc 迁到用户自有 Cloudflare 账户，域名仍为 arcmaps.net，保留原账户、学习/规划/Proof数据和附件。第一版迁移保持 Research 关闭及开发中横幅。

选择“当前公开版本 + 最小独立托管适配 → 隔离验证 → 协调数据转移 → 域名切换”。备选“同时发布当前未发布Research”扩大变更和恢复范围，本次不采用；备选“新空库直接上线”不能保留旧数据，未经用户允许不采用。隔离空库/合成数据只用于试部署，绝不冒充完整迁移。

## 已核对的来源

- 生产 Sites project_id 为 appgprj_6a6678d3e3848191a352778c6db1e7b1；原生 list_site_versions 返回 version10、源码2b0ed9376e8693250277c194c297076ff975a257、deployment appgdep_6a9da1f1f8748191a6a32e8ce6b591b8。此远端源码对象不在当前本地Git中。
- 历史部署记录对应的本地提交 cd2b9abead3a98d635850461e2b49bb650618a6d，tree fd4c50e8989e3ea5e189b15dd2283a6e0324f32c；本分支从这个完整本地提交建立。远端关联由历史记录及本轮版本元数据共同支持，不宣称已下载远端源码逐字比对。
- 原生 database overview 返回 DB、41张完整应用表，omitted/truncated均为false。该检查没有读取用户行，不能证明实际迁移ledger或数据库内容。
- 用户账户54eaadb89014252836694203c1e22546；Workers Paid仍Processing（用户本轮确认）。原背景演练资源不复用、不重置。
- 原 arcmaps.net 已接到 Sites，DNS A为162.159.143.30和172.66.3.26。迁移验收前保持不变。

## 独立源码与部署适配

独立工作树 .worktrees/v8-cloudflare-migration，分支 codex/v8-cloudflare-migration。原 .worktrees/v8-openrouter-research-beta 的7090153提交和既有未提交研究代码保留。第一次迁移不混入原工作树drizzle/0007–0011。

保留React/vinext/Workers结构与锁定依赖。worker/index.ts是SSR和API入口，不能只上传静态文件。Vite保留rsc/ssr配置及客户端Better Auth环境修复，移除Sites打包插件及placeholder配置；独立Wrangler配置由明确的账户、Worker、D1和private R2资源清单产生。静态assets绑定ASSETS，图片优化binding仅按实际使用/账户能力核验，不购买额外图片服务。构建产物检查含SSR和client assets；不存在真实资源清单时只允许local/dry-run，不允许远端部署。

平台秘密不写入Git、聊天或普通报告。配置只含非秘密资源身份及变量；ARC_AI_ENABLED和ARC_AI_RESEARCH_ENABLED固定false，不提供OPENROUTER_API_KEY。构建和部署分开，不把npm build变成云端写入。首个验证环境为独立新资源，不绑定生产域名、不导入真实数据、不宣称可用生产替代。

## 认证与浏览器状态

独立运行时需要正确BETTER_AUTH_URL、Google/GitHub callback与trusted origin。原BETTER_AUTH_SECRET保护加密OAuth token和关联签名，导入数据必须使用匹配秘密版本，或另行验证保留owner/provider身份的重新认证转换。代理不读取真实秘密；由用户在安全输入或Dashboard配置，不能用随机新值假装旧密文可用。

旧chatgpt.site cookie、关联intent及localStorage不会跨域迁移。保留原域名和数据；对旧origin的未同步学习/Proof/离线队列另行明确迁移方式。新域需要重新登录，不承诺旧cookie继续有效。SEO/canonical/分享资源改用arcmaps.net，避免依赖旧站资源。

## 数据搬迁与切换门槛

源端范围包括41张表、实际schema/index/trigger与迁移账本、全部Proof对象key/字节/metadata、关系及业务幂等回执。migration_runs是业务表，不等同于schema迁移账本。Research关闭也不允许遗漏Research记录。

优先采用平台支持的完整导出与隔离恢复。当前Sites工具仅提供有限表读，尚未确认全量D1/R2导出；已保存支持草稿但未发送。备选是基于匹配源版本实现受保护维护/逻辑导出：需另有完整分页、完整对象枚举、中断恢复、受保护流式传输、无明文数据日志、时限/容量验证和源端生产方案审查；本地适配不暗中加入临时公开导出接口。

冻结写入必须先于所有会写入的handler，包括会写限流/事件的GET、OAuth/账户关联、上传、分享、业务导入、Research状态回收；覆盖旧Sites域名与自定义域名，并排空在途上传。只停POST/关Research/改DNS都不等于一致快照。核对R2与D1引用及未引用对象，不自动删除所谓孤立对象。

目标需完成隔离恢复、记录关系/数量/校验、两owner隔离、学习与Proof持久化、附件可读和鉴权、实际迁移账本及真实登录验收后方可切换。导出路径未明确时，继续目标适配和合成验证，但不动生产DNS或标记完整迁移完成。

切换前保留旧站及已验证的恢复资料。新站尚未接收真实写入时可撤销DNS切换；接收新写入后不能盲切旧库，必须先冻结/保存增量并使用已验证的恢复方式或在新站修复。删除旧站和旧资源不属于本次自动操作。

## 成本与验收

Cloudflare约USD10/月是用户预期，不是硬封顶；OpenRouter单列且本次无真实调用。Paid未生效不妨碍本地适配/构建；不能宣称Free能稳定承载已有实际超CPU的执行器。独立网站容量也需实际验收，暂不开放Research或改演练Cron。

阶段A：来源隔离、独立构建、Research关闭、元数据新域名、配置误部署防护、类型/针对性回归及SPEC→QUALITY。

阶段B：新资源、隔离试部署、合成数据和真实runtime验证；不导入旧用户数据。涉及秘密时等待用户安全配置，不生成/读取真实Provider Key。

阶段C：源端协调导出与完整隔离恢复、真实账户与数据验收。

阶段D：生产配置核对、域名切换、实际用户流程验收、精确源码GitHub备份与迁移记录。自动Git提交仅限经审查的本分支变更，推送现有授权范围内的准确内容，避免任何真实数据/秘密/本地outputs。

本地审查、空库演练、域名证书与真实数据迁移是不同证据，报告逐项区分，不用部分通过替代整站迁移完成。
