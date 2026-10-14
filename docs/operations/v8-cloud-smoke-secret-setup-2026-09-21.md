# Arc v8 云端演练：用户安全配置签名密钥

2026-09-21。仅用于已经创建的两个隔离演练 Worker。公开网站仍保持现状。本步骤不需要 OpenRouter Key，也不会发起模型请求。

## 1. 准备并保存三枚随机值

准备三个不同的随机值，分别记为 A、B、C。每个必须恰好是 **64 个小写十六进制字符**，即只包含 `0–9` 和 `a–f`，不要加空格或换行。

在自己的密码管理器中分别保存为：

- A：`arc-v8-smoke-site-to-executor-20260921`
- B：`arc-v8-smoke-executor-to-site-20260921`
- C：`arc-v8-smoke-control-20260921`

可以用密码管理器的安全随机生成器生成符合上述格式的值。若需要用本机 Windows PowerShell 生成，下面这段命令每次生成一个 32 字节随机值，转换为 64 个小写十六进制字符，并复制到剪贴板；终端只显示固定提示，不打印密钥。**这段命令由用户自己执行，Codex 不执行，也不读取剪贴板。**

```powershell
$arcSmokeBytes = New-Object byte[] 32
$arcSmokeRng = [Security.Cryptography.RandomNumberGenerator]::Create()
$arcSmokeHex = $null
try {
    $arcSmokeRng.GetBytes($arcSmokeBytes)
    $arcSmokeHex = [BitConverter]::ToString($arcSmokeBytes).Replace('-', '').ToLowerInvariant()
    Set-Clipboard -Value $arcSmokeHex -ErrorAction Stop
    Write-Host 'Copied one new smoke secret. Save it in your password manager.'
} finally {
    [Array]::Clear($arcSmokeBytes, 0, $arcSmokeBytes.Length)
    $arcSmokeHex = $null
    $arcSmokeRng.Dispose()
}
```

每次运行后立即粘贴到对应的密码管理器条目，再为下一条生成新值。不要用同一个值充当 A、B、C，也不要把值发送到聊天、存入源码或截图。命令会把值放入系统剪贴板；若开启剪贴板历史或跨设备同步，优先使用密码管理器自身的生成方式。上面的清理不保证擦除托管字符串或剪贴板副本。

保存好 C，后续演练启动器需要你在隐藏输入提示中粘贴它；Cloudflare 保存 Secret 后不会再次显示原值。

## 2. 配置执行器的两个 Secret

登录自己的 [Cloudflare Dashboard](https://dash.cloudflare.com/)，进入 **Workers & Pages**，选择：

`arc-v8-smoke-executor-20260921`

打开 **Settings → Variables and Secrets → Add**。类型都选择 **Secret**，填写下面两项，然后选择 **Deploy** 保存到该演练 Worker：

| Variable name | Value |
| --- | --- |
| `ARC_AI_RESEARCH_SITE_TO_EXECUTOR_SECRET_HEX` | 密码管理器中的 A |
| `ARC_AI_RESEARCH_EXECUTOR_TO_SITE_SECRET_HEX` | 密码管理器中的 B |

## 3. 配置演练网站的三个 Secret

在 Workers & Pages 选择：

`arc-v8-smoke-site-20260921`

同样进入 **Settings → Variables and Secrets → Add**，类型选择 **Secret**，填入下面三项，然后选择 **Deploy**：

| Variable name | Value |
| --- | --- |
| `ARC_AI_RESEARCH_SITE_TO_EXECUTOR_SECRET_HEX` | 同一枚 A，必须与执行器中的对应值相同 |
| `ARC_AI_RESEARCH_EXECUTOR_TO_SITE_SECRET_HEX` | 同一枚 B，必须与执行器中的对应值相同 |
| `SMOKE_CONTROL_SECRET_HEX` | C，只配置在此 Worker |

这一步只添加上述 Secret。保留已有普通变量、绑定和代码；保留执行器 `ARC_RESEARCH_EXECUTOR_ACCEPT_NEW=false` 及空 Cron。不要向演练 Worker 添加 `OPENROUTER_API_KEY`，也不要修改公开 Sites 的变量、域名或数据库。

Cloudflare 的 **Deploy** 在这里只发布所选演练 Worker 的密钥配置，会产生新的部署版本；公开 Arc 网站是另一个独立服务。两个 Worker 的这次配置都保存成功后，回复 **“演练密钥已配置”** 即可，不要提供任何值。

## 4. Codex 收到完成通知后的检查

只读取 Secret 名称与类型、部署版本、原有变量是否保持、服务/D1/R2/Workflow 绑定和调度配置，不读取 Secret 值。重新核对两个 Worker 的部署身份，并生成与当前部署匹配的隔离清单。随后再给出用户本机运行的准确启动器命令。

当前本地启动器已通过 18 项测试、类型检查及独立规格/质量审查，但没有完成真实 Node 代理联网验证。此前自动审批拒绝了两次 Node 代理探测，原因均仅为 `blocked by policy`；不能再由工具重试、委派或换形式规避。用户自己的终端验证与真实云端长任务结果需要分别记录；不提前声明 Task15 完成。

## 配置依据

- 当前代码：`app/server/research/executor/connection-config.ts`、`worker/research-executor-smoke/site-entry.ts`、两份 `worker/research-executor-smoke/wrangler.*.jsonc`。
- [Cloudflare 官方 Secret 配置说明](https://developers.cloudflare.com/workers/configuration/secrets/#via-the-dashboard)，2026-09-21 核对：Worker Settings → Variables and Secrets → Add → Secret → Deploy。
- 现有关闭入口的云端部署与绑定证据：`outputs/local-durable-executor-20260914/task15-smoke/cloud-ops-20260921/gated-deployment-verified.json`。
- 本地启动器验收：`outputs/local-durable-executor-20260914/task15-launcher-completion.json`。

本文不包含真实密钥。编写和审查本文不代表用户已经配置密钥，不代表云端演练或公开发布已经完成。
