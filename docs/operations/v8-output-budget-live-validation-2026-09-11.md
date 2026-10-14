# Arc v8 32k 高质量候选：第十三次真实验证记录

**2026-09-12 第十三次已执行，许可已消耗，禁止复用下方历史命令。** 用户回复“已运行”，安全Summary `summary-2026-09-12T04-21-27-102Z.json` 核对为stop、185257ms、3次搜索、USD0.134539 settled，但annotations-invalid，未Ready/激活/规划。GET1+POST1、Repair0，数据库销毁；完整结果见 `v8-thirteenth-annotations-result-2026-09-12.md`。

状态：没有第十四次或重试许可。原53项冻结指纹仍一致，追加本次Summary共54项保护。既有1252项/双审/构建/默认离线演练证据保持，无源码变动；下一步为本地响应预检设计审阅，不能再次执行这次请求。

## 具体范围

- 本机PowerShell隐藏输入专用未使用、非循环USD5限额OpenRouter Key；不写源码、文件、命令参数或环境变量。
- 至多一次Key GET和一次完整Research POST，模型moonshotai/kimi-k3、low、输出上限32768；最多10次搜索、50条结果。一个POST内可能产生多轮服务商搜索子请求。
- 完整规划角色仍为Data Product Manager、en-US。保持完整核心技能与教学内容、实际引用及严格结构/质量验收，不能以减少覆盖或空壳课程换通过。
- 本地Provider总期限20分钟、活动租约21分钟、启动器22分钟；专用Research连接headers/body等待也为20分钟。Key检查沿用30秒。
- Research专用连接直接访问OpenRouter，Key GET保留原native路由；未读取当前代理环境，不配置或自动切换代理/地区。需要特定代理路由时应先明确方案。
- USD5沿用此前明确总预算，token增加不保证实际费用、响应字节或耗时一定达标。没有Repair、自动重试、模型回退、续写或第二次Research。
- 仅本地临时SQLite和临时账号验证；不启用公开Research入口、不修改生产变量/D1/R2、不Git写入/Sites保存部署。

## 运行结果与验收

下列命令是第十三次已经执行并消耗许可的历史交接，仅供审计，不是新的运行指令。真实Key当时只由用户隐藏输入，助手未读取。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\XF\Documents\Codex\2026-07-26\sites-plugin-sites-openai-bundled-2\.worktrees\v8-openrouter-research-beta\scripts\live-research\run.ps1" -ExecuteOne
```

历史执行范围最长约22分钟；当次已经收到“已运行”和安全回执，不重复运行。控制台没输出不能作为未发请求的证据。

安全Summary应记录profileId `kimi-low-output32k-v2`、maxOutputTokens32768、outputPolicyVersion `kimi-complete-quality-v1`、1200000/1260000/1320000ms。Summary文件名由当次启动器返回，用户回复“已运行”后仅核对这个新安全回执，不自动重跑或索取原始正文/思维链/完整账户导出。

通过需要真实完整结果经过引用、来源、技能、教学质量校验，并达到ready、可信费用settled、owner隔离/第二次调用拒绝、激活/规划成功、临时数据库销毁；终端进程也必须正常退出，出现cleanup-incomplete时不能仅凭已打印的Summary判定整轮通过。HTTP200、产生费用或只有valid JSON均不足以通过。该本地角色通过也不等于所有角色质量或线上持久执行已经验收。

失败保留实际有限诊断及可信费用；length不修补截断JSON、不激活、不自动再增加额度。费用未知保守持留，不把本地取消说成远端停止计费。若仍是输出容量/执行期限问题，依据新证据评估分阶段生成或可靠执行方案，不连续扩大参数并付费试错。

## 已完成的冻结证据

实施记录：`v8-output-budget-validation-2026-09-11.md`。三任务SPEC后QUALITY READY；Root31文件1252/1252、非增量类型/18文件lint、当前Sites本地五阶段构建与15份迁移元数据/hosting/Worker产物检查均通过。新的默认离线回执为 `summary-2026-09-12T03-54-48-534Z.json`，SHA256 `d4da0ec79674e4579cf07e958adf502f7931fbf45a61bde7cec75cd8c70abcb6`，passed、0真实请求、质量/激活/规划/隔离/销毁通过。

冻结清单：`outputs/local-output-budget-20260911/root-final-candidate-hashes-20260912.json`，53项；报告 `root-final-validation-20260912.json`。分支codex/v8-openrouter-research-beta、HEAD7090153b4acad7b12df6a7ee4d675b46c41871dc，当前有意未提交成果保留。最终整合审查 `output32k_final_integration_review` 为 FINAL READY FOR LOCAL CANDIDATE，无P1/P2/P3，独立核对53项及19项保护指纹。审阅者只读、未重跑测试/构建或网络；不把离线合成成功等同于真实Research通过。

完整首版目标仍包含线上长任务接入、真实登录/隔离/持久化/恢复、具体发布候选和公开发布后验收。本地真实Research通过后按 `v8-online-research-readiness.md` 接续，不直接改生产旗标。

当次历史测试Key名称建议为`arc-v8-output32k-once-20260912`，助手未创建或读取Key。此次已核对结果，旧名称及参数不授权创建新Key或重发请求。
