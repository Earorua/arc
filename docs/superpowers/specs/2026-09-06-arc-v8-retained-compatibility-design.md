# Arc v8 保留旧版本兼容性与本地回滚条件

用户接受上一条“升级合成数据、运行保留旧版本读写、验证隔离、双审后备份”的方案，并指示“逐步完成你认为目前可以做的任务”。本设计细化该已批准范围，继续既有工作树与子代理/TDD/规格审查后质量安全审查流程，不重复索取流程或公开开发分支备份许可。

起点：干净 `codex/v8-openrouter-research-beta`，`271f957fad68b14c764c7432c97290bac641cabb`。只新增本地测试工具及文档，不修改产品实现、迁移、依赖、运行配置或归档代码。后续交付是依据实测补齐回滚条件与发布门槛，不另造没有需求的新功能。

## 方法

选择实际非持久化 Miniflare D1/R2，执行固定归档源文件的服务和仓储，再与当前服务创建的数据比较。重复手写旧 SQL 只能验证模仿代码；启动完整历史站点会扩大认证/依赖与环境输入范围。本轮固定执行旧服务边界，明确不声称旧浏览器、OAuth 或历史部署 artifact 已通过。

归档提交 `7ca5b530dfc58f3cbc700b44a7a881a9bd661209`，tree `d0693b0a6bb0d13ded951d2df44aaab24f69ffe3`。仅允许 Git 只读取得以下七份源码；以 Git blob 哈希校验原始字节，全部核对后才求值。TypeScript 5.9.3 转译为 CommonJS，仅允许白名单内相对引用和已安装 zod 4.4.3；这些依赖版本与归档 package.json 相同。禁止任意路径、shell 拼接、下载、checkout、外部模块或真实运行配置。

| 源码 | Git blob |
| --- | --- |
| `app/contracts/cloud-state.ts` | `c028b3050261fe1f8496d502e77d1bfe0168ad5d` |
| `app/lib/demo-store.ts` | `1910a1e73785259de66307d45bde7a92bb5d3d87` |
| `app/server/cloud/d1-cloud-repository.ts` | `4deeb0291a6bec637076e7ae4ca338cf02bfce35` |
| `app/server/cloud/service.ts` | `4d8884913d292dea52349f0fab65e357045667a7` |
| `app/server/proof/d1-proof-repository.ts` | `2f53245861448aa29c8b05a303f882346fc8c8b6` |
| `app/server/proof/storage.ts` | `fa9de7a660a3b82b89b30fbfcbd85e77d2f044b4` |
| `app/server/proof/public-view.ts` | `5d48c3953a0fd1e80a6179b6e3c3fea093c1a4d3` |

## 数据与真实断言

1. 复用已有 20 表/50 行/2 附件合成 fixture 与七份 SQL 哈希。应用 0000–0001 后填充；先用旧服务读取两个 owner，再应用 0002–0006 比较同一服务读值。全部旧行和对象保留、41 表、quick_check/FK 检查通过。
2. 使用原样旧 CloudService/D1CloudRepository 执行 setup 更新、完成记录、幂等重放、导入/角色冲突/激活；使用旧 Proof 仓储与 R2ProofStorage 完成附件写入/读取、元数据、分享创建/读取/撤回。对跨 owner 的读取/撤回验证 null/false 及数据不变。仓储方法接收可信 owner，不能把仓储调用冒充认证路由测试。
3. 在升级后隔离库通过当前服务产生实际规划、完成事件、Proof 提交/修订/撤回与配额/Research 行。允许现有 FakeResearchProvider；绝不导入真实 adapter 或发外部请求。保留生成前的旧基线与非目标 owner 的数据。当前依赖组合可复用已审核 createOfflineVite/createOfflineComposition，禁止读取 Vite/env/生产配置。组合中的 HTTP 工厂会间接导入生产 service-factory，因此测试 Vite 必须额外精确替换该模块。实际路由在模块加载阶段就创建工厂，虚拟入口允许返回无工作能力的对象，但任一生产方法被调用即抛错；同时保留现有 auth/cloudflare 别名，核对模块图确认真实 factory/adapter 未加载。
4. 比较旧服务与当前服务对 v8 完成、Proof 最新版本和状态的读取；验证旧 setup 更新、旧完成写入、旧 activate-import 对当前规划的实际影响。每个可能有害的操作使用不同合成 owner/目标或隔离数据库，记录旧返回值、真实行变化和当前服务再读结果；不能把 SQL 成功、缺少抛错或新表仍在当作业务兼容。
5. 执行旧/新 public-view 构造与 sanitizer，并通过实际 public_proof_shares 持久化验证两方向格式兼容。覆盖 v8 状态/摘要字段、旧格式分享和已撤回 v8 Proof 的旧根读取风险；不实际发布链接，不生成真实 token，不声称整个 HTTP 安全链已测试。
6. 对不支持的旧操作（Proof ledger 修订/撤回、删除 Proof/用户）明确记为无此入口。不要写 SQL 删除冒充旧应用行为。当前服务执行的 Proof 修订/撤回用于产生待兼容数据。
7. 对已有当前版本数据，在测试组合中关闭新 Research 准入，使用合法请求观察新建被拒绝，并读取已有终态 Research、规划和 Proof，确认内容保留且没有额外 Fake Provider 调用。这只切换进程内合成配置，不操作真实旗标。Research GET 可对过期运行对账，不能泛称所有 GET 为数据库只读。

## 输出与判定

测试工具必须观察 RED 后再实现 GREEN，针对实际行为断言。初始 stub 明确抛 `Retained compatibility not implemented`，不能把工具启动失败当作 RED。固定源码漂移、白名单外引用必须拒绝。使用单次共享演练的多个断言组可以，但不能冒称多次完整运行。

成功表示演练完整运行并正确分类，不表示所有兼容性通过。若旧应用遗漏 v8 完成或版本/状态、旧写入导致规划/目标不一致、分享格式不兼容，结果必须保留具体差异并给出 `rollbackEligible: false`。不得修补归档源码或放宽断言来伪造兼容。

保留完整数据库前后内容指纹和对象字节/metadata 比较；输出只含计数、哈希、差异类别和布尔值，不打印会话、附件、完整快照或 token。资源在 finally 中关闭，全部关闭后才返回完成。失败应非零；worker 和应用外发均拒绝，数据库/桶非持久化，原 fetch 在所有退出路径恢复。

## 第二项交付：回滚条件与发布门槛

依据实际结果编写操作判断：Research 单项故障优先保留 v8 应用和 schema，在未来授权范围停止新调用；未经兼容的旧 artifact 不可对已有 v8 写入开放。确需旧版回退时必须先另行验证匹配的应用与协调数据恢复点及恢复点后的写入处置。不能删新表、伪造 down migration 或用源码 Git bundle 代替 D1/R2 恢复。

将当前可完成的本地证据与外部未验项目逐项映射，写清具体成功条件及下一步。真实 Research 403、真实 OAuth、生产 ledger/绑定/备份、线上 artifact 均保留未验证状态。此次不新增第三次 Provider 请求，不读取 Key/env/原始输出，不操作生产、master/PR、Sites 候选或部署。完成后仅保存并普通备份已批准公开开发分支。
