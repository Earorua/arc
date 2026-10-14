# Arc v8 第十四次真实验证：质量待审

2026-09-12。本次单次许可已经执行并消耗。当前结论为 `incomplete / quality-needs-review`，不是完整真实 Research 通过。没有第十五次、Repair、重试或补充探测许可。

## 1. 回执与执行证据

权威工作树为 `.worktrees/v8-openrouter-research-beta`，分支 `codex/v8-openrouter-research-beta`，HEAD `7090153b4acad7b12df6a7ee4d675b46c41871dc`。原有未提交成果保留，本次调查没有修改应用或测试源代码，也没有暂存、提交、合并、推送或 Sites/生产写入。

用户明确授权“第十四次单次验证”后，Root 只读确认该工作树 `run.ps1 -ExecuteOne` 对应 launcher 和 runner，等待同一执行，随后成功查询确认 runner 已不在并出现新安全 Summary。因此不必等用户另发“已运行”才判断已执行；不得再次启动旧命令。

- runner：node.exe PID 34052，创建时间北京时间 16:43:44；launcher：powershell.exe PID 38188，创建时间 16:43:36。没有输出命令行、Key 或真实环境变量。
- Summary：`outputs/live-research/summary-2026-09-12T08-43-45-288Z.json`。
- SHA256：`81ec03ab106e08dc0d9f8d1c4490636f56a21dfbe691b1f0a0174a0bc550a168`。
- 终端实际退出码未捕获。不能把 runner 消失或 Summary 写出当作已观测 exit 0/1，也不能宣称 launcher 所有清理检查通过。
- 安全派生回执：`outputs/local-quality-investigation-20260912/fourteenth-result.json`；进程/授权记录在 `outputs/local-response-preflight-20260912/fourteenth-live-process.json` 与 `fourteenth-authorization.json`。

## 2. 已确认结果

| 项目 | 本次事实 |
| --- | --- |
| Key / Research HTTP | 200 / 200 |
| 模型与 profile | moonshotai/kimi-k3；kimi-low-output32k-v2 / kimi-complete-quality-v1 |
| 参数 | low、32768 输出；最多 10 搜索/50 结果；Provider/租约/启动器 20/21/22 分钟 |
| Provider 结果 | accepted，finish_reason stop，usage 无格式问题；搜索次数来自 details |
| 引用预检 | compatible；25 条全部 recognized，无错误 |
| 候选结构 | 独立预检与正式 candidateDiagnostic 均 accepted |
| 课程质量 | false；invalid-graph、invalid-registry、missing-core-authority |
| 业务状态 | needs-review；审计 rejected / invalid-result，charged=true |
| 课程条目 | skillCount=8、sourceCount=10、unitCount=24 |
| 调用数 | Key GET 1、Research POST 1、Repair 0；audit 1 |
| 耗时 | Research 122055 ms，开始于北京时间 16:43:45.918 |
| token | prompt 10484、completion 8505、total 18989 |
| 搜索 | 5 次；一个 Research POST 可以包含多轮 Provider 搜索子请求 |
| 费用 | USD 0.151111，151111 micros，可信 settled；总上限 USD 5 |
| 隔离与清理 | wrong-owner 拒绝、第二次 Research 拒绝、临时数据库销毁均 true |
| 后续流程 | freshAccountActivated=false、planningGenerated=false、plan units=0 |

这次响应没有因为超时、length、引用格式或 JSON 结构失败。它不证明过去的所有传输/引用问题已永久解决，也不证明下次、所有角色或线上长请求一定成功。

三个质量值是去重后的宽泛类别，不是只有三个具体错误。技能数量是数组条目数，不保证 ID 唯一；sourceCount 是去重后的规范化审计 URL 数，不等于候选资源行数。没有真实候选正文，不能把这些数量当作引用闭合、证据有效或教材质量充分的证明。

## 3. 原校验器调查

`app/server/research/package-validator.ts` 把 blueprint 多种图问题汇总为 invalid-graph，把 registry schema 与语义问题汇总为 invalid-registry。证据检查只把“目标存在且双方引用一致”的证据算作有效；core 技能的有效证据还必须指向 primary/institutional 来源。资源存在而关联错误，也可能造成 missing-core-authority。

当前请求没有逐项说清：资源双向关联、技能恰好位于一个阶段、步骤/检查点 ID 全 registry 唯一、每技能最多 8 个模板、替代/标准/评分行去重，以及所有类型长单元的检查点规则。特别是旧请求要求 calibrate/reinforce 无检查点，runtime 却对任何超过 60 分钟的单元要求检查点；本地质量段同时又不要求所有单元压到 60 分钟以下。

上述内容是已核对的规则表达缺口。不能确定本次究竟违反了其中哪一条，也不能由“缺权威证据”直接断言搜索没有找到权威来源。来源审计沿用候选声明的 tier，不能把通过现有 tier 检查冒充独立确认权威，或自动更改等级。

独立只读代理 `fourteenth_quality_audit` 核对了 blueprint、registry、candidate schema、evidence helper 和请求文本，得到相同证据边界。没有要求用户复制正文、旧父请求、完整 Activity JSON 或密钥信息。

## 4. 十个离线合成案例

使用现有 golden fixture 和实际候选/质量校验器，以一次一个明确缺陷的方式验证。所有案例都通过候选 shape；golden Ready，其余被原质量门槛拒绝。

| 合成变化 | 原质量结果 |
| --- | --- |
| 未修改 golden | Ready，无问题 |
| 资源 forward link 不一致 | invalid-graph |
| 技能在两个阶段出现 | invalid-graph |
| 重复 evidence 的 skill/resource 对 | invalid-graph |
| core 的权威资源没有有效 evidence | missing-core-authority |
| 跨模板重用 step ID | invalid-registry |
| 长单元没有检查点 | invalid-registry |
| 30 分钟短单元带检查点 | invalid-registry |
| 检查点 20+70 分钟，总和与顺序均正确 | invalid-registry |
| 主资源也放进替代列表 | invalid-registry |

脚本 `outputs/local-quality-investigation-20260912/quality-contract-investigation.mjs` 通过已有 offline Vite helper 加载模块，关闭配置/env 读取，mock fetch 捕获一次构造请求；全局网络 fetch 拒绝。结果 `quality-contract-investigation.json` 为 externalAttempts=0，模型/32k/10/50/strict schema 正确。成功运行 exit 0，日志 `quality-contract-investigation-run.json`。

首次调查捕获请求后，用空 503 mock 回应，脚本错误地期待 unavailable，而适配器按既有行为返回 invalid-transport；只纠正调查脚本断言，保存 `investigation-initial-capture-error.json`。这不是应用缺陷，也不是功能实施的 TDD RED。十个案例是合成调查，不是第十四次正文重放或精确根因证明。

## 5. 后续步骤与保护

新具体设计：`../superpowers/specs/2026-09-12-arc-v8-quality-contract-diagnostics-design.md`，自审与独立审查 READY，待用户批准。初审两项 P2 与一项 P3 已据源码修订并复核关闭，记录 `outputs/local-quality-investigation-20260912/design-review.json`。推荐同时明确本地现有质量规则并在正式校验点输出有限错误类别，不放宽接受条件、不自动修正文；保留 32k、质量优先、10 搜索/50 结果与 USD 5 上限。批准后再写实施计划，沿子代理/TDD/每任务 SPEC 后 QUALITY/安全与最终独立审查推进。

此前 68 项冻结候选全部核对，追加本次真实 Summary 后 69 项保护清单为 `outputs/local-quality-investigation-20260912/fourteenth-protected-hashes.json`。本轮调查与设计不修改这些应用、测试、产物或历史实测文件。前一候选的 1341 项、本地 build、双审与默认离线演练保持为历史工程证据；不为只改调查文档而重复全部测试。

完整公开发布目标未完成。之前等待第十四次执行的条件已经由真实进程和回执解除；新的本地质量设计交接及随后两个自动续行仍未获得批准，共3个目标回合。后两回合仅重核交接和既有发布准备，未增加实施证据，不是 verified wait。工具现已标 blocked 以停止重复自动续行；用户批准设计后从实施计划继续，不能复用旧实测等待计数或旧付费许可。第十四次许可耗尽，没有第十五次请求、Repair、重试、生产变量/旗标/D1/R2、Git 或 Sites 写入。后续线上方案仍须针对长任务、断线恢复和真实平台能力单独验收。
