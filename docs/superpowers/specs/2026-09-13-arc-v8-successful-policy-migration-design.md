# Arc v8：成功 Research 配置迁移设计

日期：2026-09-13。状态：可审阅草案，尚未批准或实施。本阶段承接任务找回Tasks1–4的本地完成，不重新打开这些任务。完整目标仍是支持真实Research、登录及完整学习流程的首版公开发布并验收；本设计完成仅消除其中的请求配置差距。

## 依据与授权范围

- 当前工作树`C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta`，branch`codex/v8-openrouter-research-beta`，HEAD`7090153b4acad7b12df6a7ee4d675b46c41871dc`；现有未提交成果全部保留。
- 恢复阶段411项交接于本次设计前全部核对一致；645项回归、21项HTTP、本地构建、默认离线及独立最终审查已通过，不因设计工作重复执行。
- 第十七次真实Research已passed/ready，用户实际ExitCode0；85.685秒、8次搜索、USD0.219672可信结算。单次许可已消耗，无第十八次许可。该结果证明既有本地配置成功过一次，不证明新生产入口或20分钟托管链路通过。
- 目标文字中的600/660/720秒是早期阶段；后续用户已批准的当前本地profile为1200/1260/1320秒、low/32768，详见`app/server/research/local-validation-profile.json`。不为了方便托管而降低当前质量或时限。
- 本设计申请的实施范围仅为本地源码、合成TDD、分任务SPEC后独立QUALITY/安全审查及整合验收。不含生产变量/秘密/旗标/D1/R2、Sites候选或部署、Git写入、新账户/服务购买、真实Key或Provider原文读取、真实请求和自动重试。

## 当前问题

`service-factory.ts`的环境解析仍限制Research最多120000ms，生产policy仍是12000输出、60000ms租约。`OpenRouterResearchProvider`标准路径也有120000ms上限，未发出low reasoning或完整quality-v2提示。成功本地路径已具备这些行为，但由单独的验证工厂选择。直接只改环境中的超时时间会被拒绝；只放宽一处上限也无法迁移整组策略。

搜索10次、每次最多5条、总共50条、Exa fast和2000字符已经共享；严格JSON schema、隐私限制、实际课程质量验证也已存在，不重复实现。尤其不能把quality-v2文本直接拼到旧标准提示后：旧提示要求calibrate/reinforce无checkpoint，和现行所有>60分钟单元需要checkpoint的规则冲突。

## 方案比较与选择

| 方案 | 影响 | 判断 |
| --- | --- | --- |
| 显式服务端配置档，复用成功请求语义 | 默认旧路径不变；新档作为一个整体校验，具备独立缓存身份，可被后续执行器使用 | 推荐本阶段 |
| 直接全局替换默认模型/时限/提示 | 所有旧配置隐式改变，难以区分旧缓存及回退行为，部署其他改动也可能一并切换 | 不采用 |
| 先实现外部后台执行器再整理策略 | 仍需同一套请求配置，同时引入尚未确认的账户、托管、鉴权和数据交互 | 后续单独设计，不能跳过策略迁移 |

选择第一项作为接入工作的下一步，并保留后续持久执行、目标环境验收和公开发布门槛。它不是以本地通过替代最终目标。

## 服务端配置档

增加可选服务端环境名`ARC_AI_RESEARCH_PROFILE`，只允许以下语义：

- 未提供（undefined）：保留旧标准行为及原配置指纹对象，不能通过添加一个新空字段使全部旧指纹改变。
- 精确值`kimi-low-output32k-v3`：选择下表的完整配置。不能从请求body、浏览器storage、URL或模型输出指定。
- 空字符串、空白、未知值或非字符串：新调用配置不可用，不静默回退旧档。

| 参数 | 新档规则 |
| --- | --- |
| Research模型 | `ARC_AI_MODEL_RESEARCH`必须精确为`moonshotai/kimi-k3` |
| Reasoning与输出 | 固定`low`和32768，不再以独立环境值组合 |
| 输出提示 | 完整复用本地`kimi-complete-quality-v2`提示组合及严格候选JSON schema |
| Research期限 | `ARC_AI_RESEARCH_TIMEOUT_MS`必须精确为1200000；覆盖请求到完整响应体，不为每阶段重新计时 |
| 活动租约 | 固定1260000ms；存储到新run，查询不续租 |
| 本地启动器 | 1320000ms，仅本地，不能成为生产执行器承诺或生产指纹字段 |
| Research预算 | 必须大于0且不超过5000000微美元；每日/月预算、配额及限流继续由既有配置和准入执行 |
| Repair | `ARC_AI_REPAIR_MAX_COST_MICROS`必须为0，新档Provider的repair入口也必须在fetch前拒绝；不自动改用economy模型 |
| 搜索与隐私 | 保留现有10/5/50、Exa fast、2000字符，`require_parameters=true`、`data_collection=deny`、`zdr=true` |
| 接受规则及边界 | 保留现有候选schema、引用/语义/课程质量规则和请求/响应/content字节界限；不补造内容或降低质量 |

既有两层启用开关、session owner、cohort、quota、IP限流、预算准入仍全部生效。缺失Key/配置不完整时不创建付费服务；recover/GET仍使用独立恢复服务，不能因新档无效而失去历史查询能力。预算预留是应用准入控制，不能宣称可强制外部Provider恰好按预留封顶或撤销已发生费用。

保留现有economy模型和repair timeout字段的格式验证以兼容部署配置；新档不使用它们发请求。`.env.example`继续默认关闭及空凭据，只增加注释说明这个可选selector，不能写成空的有效配置或默认开启。`worker-configuration.d.ts`仅增加可选string声明。admin的Research可用性已委托同一工厂解析器，应继续只投影enabled，不显示模型、Key、盐或配置详情。

## Provider与本地验证的共用边界

在现有Provider实现中把“执行配置”和“本地诊断观察”分开。可增加一个小的`app/server/research/execution-policy.ts`模块，承载不含凭据的固定配置解析与类型；仅在减少重复和歧义时移动纯提示拼接，不拆出新的网络栈或重写已验证的传输逻辑。

生产工厂通过校验过的档位选择将模型/期限/输出/推理/提示传入Provider，不能直接调用`scripts/live-research`或本地验证入口。本地`createKimiLocalValidationProvider`保持现有严格profile读取、必须注入fetch、Repair禁用及观察回调合同；本地JSON和PowerShell启动器保持原值与行为。若两侧有不可避免的声明重复，测试逐字段核对共同的七项服务器字段，并证明唯一的本地launcher字段不进入生产指纹。

新档和本地验证在同一role/locale下构造的Research JSON body应完全一致：模型、stream=false、max_tokens、system提示全文、user versions、schema、privacy、reasoning和tools。URL、POST方式及受限headers语义一致；真实Key始终只在服务端配置，测试仅用合成凭据。不能通过“model相同”替代完整请求对照。

全局`RESEARCH_PROVIDER_VERSIONS`以及blueprint/registry/template版本保持不变：成功本地请求也使用这些版本。迁移识别放在新的内部配置指纹中；本阶段不同时改变版本字段而破坏请求对照。未来若修改提示语义或schema，应单独做版本迁移。

生产不接入transport/preflight/candidate/quality观察回调，不向API或页面新增诊断。已有安全失败分类保持。任何共用重构必须保留拒绝、完整body期限、abort/cancel、释放reader和定时器、迟到回执的原行为，不能以配置迁移之名放宽错误处理。

## 指纹、缓存与历史记录

旧档的稳定policy对象、序列化值和指纹必须和迁移前精确相同。新档使用同一生产指纹算法，包含明确profileId、outputPolicyVersion、模型、low、32768、1200000期限、1260000租约、Repair禁用、搜索、privacy、byte limits、既有版本、预算及原有缓存/配额参数。不得复用本地`validationFingerprint`，因为其中含launcher和验证专用作用域。

原repo以configFingerprint隔离活动任务和新缓存查询，可直接复用，无需数据库迁移或批量改写。新档不能命中旧档包；新档成功包在同档下仍可命中。修改Key、IP salt等秘密值不能进入或泄漏到指纹，保留旧行为。

历史get/recover按存储run/alias/package的身份相互验证，不受当前档是否启用影响，不改写旧期限、版本、费用或内容。历史已到期run不能因切到长租约而复活。历史Retry与当前配置指纹不同仍返回CONFLICT；不得暗中改为新档请求。用户明确新建才使用新mutationId并执行已有确认/准入。

可信费用、未知费用保守持留、配额最终状态、晚到回执及锁定学习计划的历史包引用继续沿现有逻辑；迁移不需要动这些存储实现，发现新证据时先界定必要修改范围。

## 必须证明的验收

1. **配置RED→GREEN：** 未设置selector的旧配置、原超时上下界及完整指纹保持；新档在旧代码下被拒绝、实现后正确选择。空白/未知档、错模型/期限、非零Repair、超USD5、缺Key或开关关闭均无付费请求。
2. **请求完整对照：** 用可控fetch捕获新档与现有本地验证的同输入JSON，逐字段及完整提示比较；不得只测实现常量。旧档与repair的原payload保持。全程无真实网络。
3. **期限与资源：** Fake timers分别覆盖headers停滞、body停滞、跨headers/body的同一1200秒deadline、边界前成功、期限后迟到；清理timer/reader，返回现有安全超时/未知费用，无自动重试或Repair。不能用此测试宣称托管20分钟通过。
4. **真实本地D1集成：** 旧档ready包在新档下不命中；新档首次合成Research→ready→同档第二个合法新建可缓存命中，调用/预算计数正确，配置指纹写入一致。旧档指纹精确回归需要迁移前保存基线。
5. **历史边界：** 新档或配置关闭时get/recover旧ready/failed/expired任务及已知费用，owner隔离、过期不复活、已定配额不重写、迟到费用不变成发布许可、跨指纹Retry拒绝且0额外调用。
6. **完整学习流程：** 新生产工厂接真实本地repo/校验器、仅Provider传输为已写好的合成fixture，验证Ready、激活、规划生成与刷新读回；实质无效候选仍needs-review且Repair0。测试账户和临时DB销毁。
7. **交付检查：** 相关回归、非增量类型、定向lint、本地Sites build与产物检查；确实受影响时一次默认无flags离线launcher，完成后读取新Summary。分任务SPEC后独立QUALITY及最终整合审查。没有需求变化不重跑全部历史测试。

建议顺序：Provider配置共用与完整请求对照 → 工厂/环境/指纹 → D1/恢复/规划集成与交接。详细TDD实施计划仅在用户批准此设计后编写。预计修改Provider、service-factory、小型执行配置模块、Worker类型/示例注释及针对性测试；不改恢复hook/页面、课程合同/validator、数据库schema、生产变量或部署资源。

## 后续执行器及发布仍须完成

Cloudflare官方说明：HTTP可在客户端连接保持时持续运行，断开或响应结束后工作可能终止，waitUntil只能再延长最多30秒；队列、Cron和alarm每次最多15分钟。因此它们不能直接证明当前20分钟Research可在用户离开后可靠完成。[Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

持久后台方案优先调查独立Cloudflare Workflows：step墙钟无固定上限，但不能部署到Workers for Platforms namespace。当前Sites的24个可见工具、DB/R2 manifest及本地打包器没有证实本站Workflow绑定能力，不能虚构绑定，也不能据此断言平台绝对不支持。[Workflows limits](https://developers.cloudflare.com/workflows/reference/limits/)

后续独立执行器设计必须明确实际账户/托管位置、最少数据与密钥归属、认证/防重放、持久发送标记、结果存储/取回、未知费用和关闭路径。Workflows默认10分钟step timeout及重试配置不适合直接包住付费请求；需定义更长的明确期限、禁止不确定请求重发及可重复读取/结算的边界。任何崩溃后“恰好一次收费”都不能仅凭step设置声称成立。[Sleeping and retrying](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/)

若最终采用保持连接方案，应由用户在具体方案中知悉连接依赖，且先有本站受保护、无Provider的持续连接/断开实测。它不能证明离开页面后仍能继续。若选择独立后台服务，应在确认服务、数据边界、预算及所需权限后才创建；本设计不授权其中任一路线的部署。

实际托管执行及断开恢复、目标环境真实登录/跨owner/学习/Proof持久化、生产迁移备份恢复、精确源码/GitHub备份、可审阅发布候选、公开deployment成功及发布后关键验收，仍全部保留。只有这些证据齐备才完成持续目标。
