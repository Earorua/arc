# Arc v8 第十六次：响应头前 fetch 失败

2026-09-13，第十六次已执行并结束，单次许可已消耗，完整真实 Research 和公开发布未完成。没有第十七次、Repair 或重试许可。

## 实际证据

安全 Summary：outputs/live-research/summary-2026-09-13T03-59-53-564Z.json，SHA256 72621bd2d92252fd459fb19e4493d72d9f6ed90b2a8a919b3d13d05fa7490a3c。文件名记录流程开始附近时间，不是完成时间。Research 开始于北京时间 11:59:55.382，耗时 32899ms。

Root 于12:00:27确认同一工作树 launcher6108、runner2376 正在运行；12:03:31确认这两个进程已消失且产生新回执。读取范围仅为PID、父PID、名称和创建时间，没有读取命令行、环境或Key。监视查询的 exit0 不是Research终端退出码；实际终端ExitCode尚待用户补充，源码对本次incomplete应返回1。

| 项目 | 结果 |
| --- | --- |
| 流程 | live-one / incomplete / research-failed / failed |
| 请求计数 | Key GET1、Research POST1、Repair0；计数在调用底层fetch前增加，不能证明远端已收到请求 |
| HTTP | Key200；Research null，尚未收到响应头 |
| 诊断 | transport-diagnostic-v3 / fetch / fetch-error；nativeErrorKind other |
| 响应读取 | receivedBytes0、bodyComplete false；headersElapsedMs和bodyEndElapsedMs均null |
| 本地中止 | localCancellation none，未触发20分钟Provider deadline |
| 格式/业务阶段 | responseFormat、Provider结果、候选预检、课程质量诊断均null，未进入这些检查 |
| 费用 | usage null、charged unknown；USD5 conservative-hold，settledMicros0 |
| 防护 | owner错误读取拒绝、第二次Research拒绝、临时数据库销毁均true |
| 功能验收 | 未Ready、未激活、未生成规划 |

USD5是保守预算占用上限，settledMicros0不是实际扣费0。OpenRouter Activity状态/费用待补充；不追加带Key的查询。Key检查通过只证明该检查当时成功，不能证明随后Research连接成功。当前证据不能判定模型名称、地区限制、DNS、TLS、远端取消或实际扣费。

## 已确认的本地诊断缺口

调用链为runner的原生fetch → 本地native dispatcher → createGuardedTransport → Provider → 私有Summary。scripts/live-research/transport.ts的底层fetch catch会丢弃原异常，重抛SafeValidationError("transport-denied")。Provider之后才调用classifyNativeTransportError，所以响应头前的原生错误类别已经丢失。

因此本次other不能排除分类器已支持的headers-timeout或socket，更不能证明只是未支持的新错误码。tests/server/live-transport-diagnostics.test.ts已有合成headers-timeout经guard后变other的断言；这不是第十六次实际异常重放。响应头后的reader错误走另一条路径，不能混为同一缺口。

独立调查者sixteenth_fetch_investigation已用真实模块完成13例纯内存对照：body timeout、headers timeout、socket、abort直接分类及直接Provider保留各自类别，但经guard均变other；connect timeout、DNS、系统socket码、TLS、深层cause和aggregate内错误在当前分类器本来就是other，经guard仍为other。禁用global fetch及常用HTTP/TCP/TLS/DNS出口，networkAttempts0，实验exit0；未写实现或测试文件。合成统计为每例GET1/POST1，不能当成真实计费调用。精简实验记录见同证据目录synthetic-fetch-investigation.json。

Node/Undici用固定错误码区分连接超时、响应头超时、断连和DNS等；这些类别有助于定位，但仅凭33秒耗时不能反推错误码。[Undici Errors](https://github.com/nodejs/undici/blob/main/docs/docs/api/Errors.md)、[Node Common System Errors](https://nodejs.org/api/errors.html#common-system-errors)。本地native dispatcher只显式配置headers/body等待，不构成这次连接失败的根因证据。

Key GET不使用Research专属dispatcher；Key200不能证明后一个Agent连接正常。当前安装的Undici源码core/connect.js:53给未设置的连接timeout默认10秒，这只是代码配置事实，不能从32.899秒推断实际连接超时，更不能将所有传输阶段都视为20分钟等待。

## 后续与保护

原333项授权交接在本次状态更新前全部一致，113项源码和108项完整构建保持；1632项、本地build、默认离线和最终双审仍是此前候选的本地证据，不是本次实测通过。原有未提交成果保持，没有修改应用或请求参数。

结果记录在outputs/local-response-format-sixteenth-20260913/result-verification.json。本地有限fetch诊断设计../superpowers/specs/2026-09-13-arc-v8-native-fetch-diagnostic-design.md已完成自审及独立复审READY，待用户批准实施：只在统一错误替换之前提取固定类别，保留现有安全异常和业务失败映射；不保留原异常、cause、message、stack、URL、Key或正文，不增加网络调用。两项审查问题已关闭，分别明确原生重定向拒绝仍可归other，以及clear/finally关闭观察防止晚到错误修改已返回Summary。设计审阅与获准后的离线实现无需等待Activity补充，新的真实验证仍须单独授权。
