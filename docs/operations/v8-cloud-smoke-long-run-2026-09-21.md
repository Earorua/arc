# Arc v8 云端长任务演练启动（2026-09-21）

**本轮完成更新：实际19分30.042秒、Ready/phase5、单次结算、独立R2清理和用户新进程status（ExitCode:0）均已核对。不要重复下面历史start/status命令。仅long运行场景通过；完整云端验收仍待故障/Cron、回放/owner等证明。**

**最新状态：本轮已于北京时间 15:41:08 接单，用户确认 ExitCode:0。下方 start 命令仅作为本次已完成操作的记录，请勿再次执行。** 当前保留客户端退出后的静默观察窗口；最早在 16:01:45 之后检查云端。后续只读 status 使用新的报告名，由 Codex 核对时机后提供。接单并不等于长任务完成。

**启动器修复后的一次重试：** 先前的 `credential-channel / ExitCode:1` 已确认是 Windows 管道被误判，发生在读取凭据及网络请求之前。修复已通过回归、类型检查和两项独立审查，未修改云端部署，也无需重新生成密钥。原报告目录未创建、云端无该场景，因此本次继续使用下方原命令和相同 ReportName，只运行一次。之后若再次失败，仍先报告结果，勿连续重试。


当前隔离演练已启用，五项Secret类型及资源绑定已原生核对；首个真实Cron开始/正常结束证据在 activation/cron-observation-01.json。公开网站仍保持原版本。仅采用合成Provider，真实模型调用0；保持Workers Free。

现在在自己的PowerShell中完整复制下面三行，仅运行一次：

```powershell
$arcRoot = 'C:\Users\XF\Documents\Codex\2026-07-26\sites-plugin-sites-openai-bundled-2\.worktrees\v8-openrouter-research-beta'
$arcEvidence = "$arcRoot\outputs\local-durable-executor-20260914\task15-smoke"
powershell -NoProfile -ExecutionPolicy Bypass -File "$arcRoot\scripts\run-research-cloud-smoke.ps1" -Mode start -Scenario long -Inventory "$arcEvidence\cloud-ops-20260921\activation\isolation-inventory.json" -ArtifactReport "$arcEvidence\build\cloud\task15-cloud-candidate-20260921\report.json" -ReportName 'cloud-long-start-20260921-01' -UseSystemProxy
```

提示 Paste 64-hex cloud smoke control secret (masked) 时，从Bitwarden复制刚更新的控制密钥C（SMOKE_CONTROL_SECRET_HEX）输入并回车。不要输入OpenRouter Key，不要把值发到聊天。

成功接单应有 status: accepted、accepted: true 和 ExitCode: 0；这是后台接单成功，尚不等于长任务完成。命令返回后可关闭启动终端，立即告诉Codex“已运行”和ExitCode。保持至少19分30秒不运行任何状态/恢复命令；Codex之后根据实际acceptedAt安排新的只读状态进程和原生Workflow/D1/R2证据检查。

若出现pending、refused、ExitCode:1或其他错误，保留原报告和固定场景身份，不要重复start，不要换ReportName再试；只告知结果。报告在 outputs/local-durable-executor-20260914/task15-smoke/cloud-long-start-20260921-01/。本文件不含任何密钥。

控制入口依赖现有无凭据本机HTTP代理；启动器只对其子进程使用代理。已被自动审批拒绝的代理探测不得由代理更换工具重试。

Cron证据最多256行，约128分钟容量；本轮应及时运行。若已离开很久或次日恢复，先让Codex复核现有场景、Cron容量和配置，勿自行重启场景。长任务、两项故障恢复及后续回放清理验收仍待完成，不能把当前Cron成功当成这些场景通过。
