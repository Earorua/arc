# Arc v8 响应格式观察：第十六次单次真实验证准备

状态：2026-09-13，第十六次已执行并结束，单次许可已消耗。Key200；Research在32899ms后响应头前fetch-error，HTTPnull、原生类别other、费用unknown、未Ready。详见v8-sixteenth-fetch-result-2026-09-13.md及outputs/local-response-format-sixteenth-20260913/result-verification.json。下方范围和命令为该次历史，不得重复运行；没有第十七次或重试许可。本地Task1/Task2双审、1632项/类型/lint/build/默认离线证据保持，不等于真实验证通过。

## 已授权的单次范围

- 一次Key GET和一次Research POST；Kimi K3 (`moonshotai/kimi-k3`)、reasoning low、32768输出tokens，角色Data Product Manager、语言en-US。
- 仍采用最多10次搜索、50条结果，专用未使用且非循环USD5总限额测试Key；Provider/租约/启动器分别20/21/22分钟。一个POST可能产生多条搜索子请求，USD5是总上限而非预计消费额。
- Key仅由用户在本机PowerShell隐藏输入，助手不创建、读取或保存。无Repair、自动重试、续写、探测、模型回退或第二次Research。
- 不含Git写入、生产配置/数据库、Sites候选或部署。本地最终审查及本次单独授权均已完成，下面命令只用于这次单次许可；执行后不重复运行。

## 本次新增证据及其限度

若原JSON.parse再次失败，私有Summary的transport-diagnostic-v3可保留Content-Type和已解码正文前缀的固定类别。两项独立，允许互相矛盾；HTML/SSE/JSON前缀提示均不是完整格式或服务商根因证明。没有正文、任意header、片段、散列或异常原文。诊断异常也不得改变原失败或预算保留。

本次不修改请求、严格JSON/引用/候选/课程质量规则或额度。第十五次原正文未保存，无法事后证明具体格式；没有理由在无新许可时补发请求。

## 执行前与完成判据

已完成Task2的实际代码路径合成验证、持久状态等价与修改前请求指纹对照、SPEC后QUALITY，以及Root相关45文件1632项回归、类型/lint、本地build和默认零真实请求终端演练。独立最终审查及第十六次单次授权均已完成；上一候选1529项结果不作为本次通过证据。

本次精确候选（最终审查已核对）：

- 分支codex/v8-openrouter-research-beta，HEAD7090153b4acad7b12df6a7ee4d675b46c41871dc；113项源码/回执清单outputs/local-response-format-20260912/root-source-candidate-hashes.json，SHA25657ce1f2f53dac9a1e6c89e9fa226da1e07e5772e089a0c9e95be95091b9fcb42。
- 完整108项构建清单outputs/local-response-format-20260912/root-build-hashes.json，SHA2566b2898825fc3e0291ef3ad18e92cb6ff07cdd810f367c445e02c51373010e8b1。Worker SHA256ab2c06da1899cc31f9d743a34f431a0d8c78a3881eddda039c64f05e75e13e66。
- 默认离线回执outputs/live-research/summary-2026-09-12T15-42-09-690Z.json，SHA256dc0b26ad208da9d99768dc6b268e1a404a050be1443ef01de209f1ed99b072e3；passed/Ready/quality/activation/plan6/owner隔离/重复拒绝/DB销毁通过，realRequestCount0。合成费用不是真实消费。

用户授权后先核对候选、分支/HEAD和是否已有同一runner；只交付一次命令。开始后只等待同一运行，不因输出延迟而再次启动。结束时核对新安全Summary和实际ExitCode。

完整成功要求outcome passed、runState ready、正式引用/来源/课程质量通过、费用可信并settled、账户激活和实际规划生成、owner隔离/第二次调用拒绝/临时数据库销毁通过。HTTP200、stop、收费或某项诊断accepted均不足以证明成功。失败或费用未知时保存证据再决定下一步，不自动重试。

本地真实验证成功后仍须完成线上长任务接入和公开发布门槛，见v8-online-research-readiness.md。完整公开发布目标未完成。

## 第十六次历史终端命令（已执行，不得重复运行）

使用专用未使用、USD5总限额且不自动重置的测试Key，名称可为arc-v8-format-once-20260913。Key只在下面脚本的masked提示中输入，不发送聊天或写入代码。助手不代填或读取Key。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\XF\Documents\Codex\2026-07-26\sites-plugin-sites-openai-bundled-2\.worktrees\v8-openrouter-research-beta\scripts\live-research\run.ps1" -ExecuteOne
Write-Host "ExitCode: $LASTEXITCODE"
```

输入后允许脚本等待至多22分钟。启动后告知“已运行”，Root只检查新安全Summary或同一存活进程；不重复发起命令。终端完成后保留实际ExitCode，不能把监视器退出码当作Research退出码。若尚未启动，只维持授权待执行状态，不反复索取相同许可；用户暂停不等于允许第二次调用。
