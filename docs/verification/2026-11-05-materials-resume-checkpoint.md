# 多类型资料：2026-11-05 暂停与恢复说明

保存于 **2026-11-05 21:06（Asia/Shanghai）**。持有人明确要求保存后关闭 Codex，长期目标暂停。不要自动启动 B2、部署、远程迁移或任何新增模型调用。

## 已完成并保存

- 工作树：`C:/Users/XF/.codex/worktrees/materials-receipt-accounting/ui-warm-precision`。
- 分支：`codex/materials-offline-recovery-20261105`。
- 最新产品源码候选：`2bcff0964d1238b10bf8acc3196a15b8479edbe4`；tree：`4005dfba35753467e23bd3e71eaafa39222479be`。后续证据提交只补充本次报告，不改变这个冻结候选。
- B1 只有 **1 次真实合成推理，费用 0.019506 USD**。原 3 次自动 GET 未取得可用回执；本次由用户隐藏输入 key 后，额外 **1 次只读 GET 返回 HTTP 200**。
- 真实 chat 使用请求 alias，generation 使用 `moonshotai/kimi-k3.1-pro-20261023`。已先用旧程序复现 `model-mismatch`，再做显式版本绑定修复；同一脱敏配对在新校验器中 `verified` / `compatible`。
- 全仓 **355 套件、7,546/7,546**；附加 Node **290/290**；只读工具 **5/5**；构建后页面 **5/5**。干净目录类型检查通过；lint 0 错误、4 条既有警告。
- 关闭态站点/执行器构建成功，390 个文件逐一核验哈希；无账号凭据、构建出站记录 0。源码包从约定基础提交独立还原，`fsck --strict` 通过。
- 独立审查无阻断问题。B4 v2 的新配置摘要、增量迁移及旧授权/外键/费用保留已离线验证，未执行远程迁移。

[本轮验收](2026-11-05-materials-canonical-model-fix.md) · [单笔及只读实证](2026-11-05-materials-b1-single-receipt-result.md) · [候选与源码包](materials-canonical-model-fix/candidate.json) · [机器验证](materials-canonical-model-fix/verification.json) · [整体进度](2026-11-04-materials-public-release-progress.md)

## 必须保留的边界

原 B1 冻结目录 `work/kimi-b1-147bfe15` 的 16 个文件仍匹配固定摘要。原 paid run 仍是 `unverified`，不能改写为 PASS；新增真实 API 证据与新版本离线核验单独保存。完整 Gate 1B 尚未通过，仅 B1 回执技术证据通过。

本机私有证据目录为 `C:/Users/XF/.arc-materials/gate-1b/materials-b2/receipt-probe`。其中 `kimi-standard-receipt-v1` 与 `metadata-readonly/api-read-v1` 均已消耗；**不得删除、重建或重复运行原入口**。原授权已过期。密钥没有保存到报告或源码，恢复时不要从聊天、剪贴板或进程内存提取。

原失败 GET 的 HTTP 状态码没有保留，具体失败原因未知。延后读取成功不能证明原自动窗口可靠；尚未凭猜测延长重试。

新配置 `b2-settings.canonical-model.review.json` 仍 `qualified:false`，runId、批准时间等未签发。配置摘要为 `ec56126eff54568bbd9960ad050c7311b137cb0ac44c2f42e0ea506c6c81718f`；文件 SHA-256 为 `e77ac7703652018d0d1c6247a75f7cdfd5b3ab1780cdf94c9b8ef0d3ab863c72`。

## 恢复后从这里继续

1. 读取本文件、最新验收和候选清单，确认分支及 Git 状态；使用新的冻结候选，保持旧 B1 工具和证据不变。
2. 完成 B2 本机执行入口、独占账本及授权材料的最后核对。**B2 授权申请尚未发出**；先准备具体可审阅的执行单，再请求用户批准。
3. B2 拟为同一标准端点、24 份冻结合成简历/JD，单轮拟议上限 2.00 USD、建议批准后 2 小时内完成。按当前价格和 token 上限，24 笔最大预留 1.751040 USD。账户累计 key 上限 2.00 USD 中已有 0.019506 USD 消耗，执行前核对剩余额度。
4. 原用户只接受了一个固定合成句的缓存边界。B2 新语料、6 份补充样例、B3/B4 云资源/第二轮及真实用户资料隐私和公开发布，均不能借用该授权。
5. 获得范围、配置、预算与有效期批准后，才签发并让用户在本机隐藏输入 key。B2 任一回执未核验或费用不明即停止；不能自动重做付费推理。

B2 当前 **0/24**，补充资料 **0/6**，B4 **0/24**，公开资料功能尚未发布。上游缓存最长保留期限及关闭方式仍未公布。之后按质量评测、隔离环境、真实 UI 验收、生产隐私/预算/发布清单和发布后验证依次推进。

本次进度保存到本地 Git；关闭 Codex 不需要保持任何输入窗口或测试进程运行。恢复时可以说：**“从 11 月 5 日暂停点继续，先准备 B2 授权材料，不调用真实模型。”**
