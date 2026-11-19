# B4 浏览器验收的 v3 登记准备

**2026-11-19，离线修复通过独立审阅。** 当前 B2 使用 `source-spans-v3` 提取策略。之前的 B4 登记工具及执行数据库只接受早期 Kimi 配置，无法按当前策略登记全部 24 份浏览器用例。修复已保存为待合入补丁。当前 B2 执行源码仍为 `ff1d60f`。B4 云环境、真实授权与浏览器验收均待后续完成。[补丁](prepared.patch.txt) · [复审结论](independent-review-final.md)

## 原因和修复

旧 v2 与当前配置在 `config` 和 `qualification` 中的 `providerPolicyId` 不同，该字段决定实际提取格式，也参与配置摘要。用相同的过期合成资料登记时，旧 v2 配置在登记工具与内存 SQLite 中通过，当前配置在两处均被拒绝。改用新名称后，原代码仍会拒绝。原始数据及旧额度规则均保留。[基线复现](baseline.log.txt) · [两条回归的初始失败](red.log.txt)

新增的 `b4-kimi-k31-pro-mxfp4-v3` 只接受当前 24 份简历／JD 的冻结语料及配置摘要 `892574c4a5d37288614fca6c8e6fe812fdd291f4ecb5af2d1c1d4bd86998eaa8`。B4 仍需独立授权，整轮硬上限 USD 2.00。迁移 `0006` 先加入新约束，再移除原约束并恢复列名。历史登记、默认 USD 0.50 上限、既有两种具名配置和账目继续按原规则处理。[冻结配置](../materials-quality-next/request-draft/manifest.json)

## 已实测的范围

| 检查 | 结果 |
| --- | --- |
| 预算登记专用套件 | 13/13 通过，含本次两条回归。检查新旧配置交叉、错误回执路线、错误语料、超额、重复登记及历史运行保护。[测试输出](green.log.txt) |
| 实际本地 D1 升级 | workerd 使用与基线 Git 一致的 `0000–0005`，再应用 `0006`。旧运行、24 条视图记录、已结算和待核对的两笔记录、全局停发标记逐值一致，外键异常 0。升级后成功登记一份已过期的合成配置，远程迁移、实际授权及模型请求均为 0。[原始输出](native.log.txt) |
| 静态检查与审阅 | 两个变更 TypeScript 文件的语法和语义诊断为 0，定向 Lint 通过。独立审阅发现工作表对两份采集授权的表述有歧义，已更正并复审。最终差异仅为工作表一行，沿用同一份实现的实测结果。[类型检查](types.log.txt) · [首次审阅](independent-review.md) · [最终审阅](independent-review-final.md) |

## 恢复与使用

基线为 `817cbc9c559db216c6350b9ef44b78a411ace38e`，实测实现为 `805f1de52090e3f82f33c359a42b8aa5b880ddb7`，含工作表修订的最终候选为 `455693a32e2ad5036026ad35b6c0ac1c597aeffb`。归档包含一份普通 Git 差异和原始证据，共 18 份。补丁 SHA-256 为 `d888497ca1118b22c2c9826e8c4fb717ed8ed449d7aed21a4c4def4eb69da4b3`。在临时 Git 索引从基线应用该补丁，所得完整 tree `bc17e3b8ebc78d6545da47bf70694ec2216943e0` 与最终候选一致。[归档清单](manifest.json)

待 B2 用实际回执证明当前配置达标后，核对该配置、语料及五个补丁目标的当前版本。若仍匹配，在资料分支用 `git apply --check docs/verification/materials-b4-extractive-preparation/prepared.patch.txt` 检查后合入补丁。两份更新后的操作单随修复一并生效。若 B2 改用其他配置，按实际通过质量验收的配置审查其精确摘要。B3 单独批准云资源和迁移，B4 单独批准浏览器轮费用后再登记真实用例。已通过的全仓和 14 场景无需因这份预备补丁重跑。[分阶段验收计划](../../superpowers/plans/2026-11-04-private-materials-gate-1b-acceptance.md)
