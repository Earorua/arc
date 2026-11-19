# 新一轮 Kimi 验收：2026-11-19 只读预检

状态：公开端点与账户界面已只读核对，采集、评分适配、有限课程关系修复、新原生证据复用和当前绑定 v2 均已离线验收。[固定操作入口](operator-result.md)已通过独立规格／质量复审，[最终全仓验收](../2026-11-19-materials-course-relations-final.md)亦通过。最终冻结授权包和精确 key 预检仍在准备。没有新付费授权、推理、远程迁移或部署。旧 R2／P1 不续期。

## 公开候选

OpenRouter 当前 Moonshot 目录中最新的普通推理候选仍为 `moonshotai/kimi-k3.1-pro`。标准路由为 `moonshotai/mxfp4`，对应 `moonshotai/kimi-k3.1-pro-20261023`，不使用 highspeed、batch 或回退。输入／输出每百万 token 分别 USD 2／10，缓存读取为 USD 0.2；预算按不命中缓存计算。[模型目录](https://openrouter.ai/api/v1/models) · [端点及价格](https://openrouter.ai/api/v1/models/moonshotai/kimi-k3.1-pro/endpoints)。

严格 ZDR 目录包含该标准端点，`safety_retention:false`，同时 `supports_implicit_caching:true`。公开端点 JSON 不提供成功端点 UUID，不能替代已有回执身份和本轮实际回执核对。[ZDR 端点目录](https://openrouter.ai/api/v1/endpoints/zdr)。

ZDR 不等于绝对零存储：官方政策允许上游隐式内存缓存，也列出 CSAM 审查、报告及依法保存的例外。本次查阅的页面没有给出 Moonshot 隐式缓存的最长期限；新授权须继续明确本轮合成资料的边界。[当前 ZDR 政策](https://openrouter.ai/docs/guides/features/zdr)。

平台响应缓存与上游隐式缓存分开核验。官方文档的开启入口为请求头或所引用的 preset；当前生产适配器不发送开启缓存的请求头，也不引用 preset。最终离线请求冻结仍须核对此事实，不能仅凭 `provider.zdr:true` 推断平台缓存关闭。[响应缓存文档](https://openrouter.ai/docs/guides/features/response-caching)。

四份公开读取结果及摘要保存于 [public-preflight/](public-preflight/kimi-20261119-public-preflight.json)。这些是本次读取时点的公开事实，不保证未来启动时端点、价格或账户状态不变。

## 账户界面观察

通过内置浏览器查看 `materials-b2`，没有读取完整密钥或改变设置：

- 唯一专用 key 已指派 `materials-b2-zdr`；All other models 启用，ZDR only 选中，Safety Retention 排除。
- 付费训练、免费训练和公开提示均禁用；账户数据折扣未开启。
- Input & output logging 关闭；没有已配置的 trace destination；Moonshot BYOK 未配置。
- 账户显示余额可覆盖拟议预留，但专用 key 的现有累计额度不足。最终必须由本机隐藏输入执行精确只读预检，界面舍入值不代替它。

完整账户余额和密钥标识不纳入公开源码。受控本机观察记录位于忽略的 `work/grounded-verification/kimi-20261119-account-ui.private.json`，仅用于本轮现场核对。没有改变全局隐私设置、key 额度或充值。

## 待授权包列明的费用

沿用每份 16,000 输入＋4,096 输出上界，单份顶格预留 USD 0.072960：24 份共 USD 1.751040，六份共 USD 0.437760，合计 USD 2.188800。拟议硬上限分别为 USD 2.00／0.45，合计 USD 2.45，单次仍不超过 USD 0.075。每份仅一次推理；新的六份授权将明确至多三次只读回执查询，旧授权维持原边界。

具体授权单还应集中申请将现有专用 key 的**累计额度**调整到 USD 3.00（不是新增充值），以容纳已发生费用和新一轮上限。是否足够以启动前精确余额为准。上述均为待确认配置，不是已批准或已生效变更；只有采集适配、独立审阅、冻结请求及操作单全部完成后才提出新的付费批准请求。

## 离线请求草稿

使用当前真实 provider 构造器、本机占位凭据和完全拦截的传输，已记录 30 份原始请求正文；本机返回固定非成功响应，不发生 generation 查询或任何真实出站。逐份核对了原文完整重组、v3 提取政策、唯一标准路由、严格 ZDR／不训练／不回退、4,096 输出上限和价格上限；没有开启响应缓存的请求头、preset、插件或工具。

[请求草稿清单](request-draft/manifest.json) SHA-256 为 `06238bde3fbc45aa33efb38da95234cfbb74d34d162bf1941d9ac0c56c964ac7`，含 30 个逐正文摘要和分开的 24／6 配置摘要。原始正文、构造脚本与离线回执一并保存；30 份副本已按清单逐字节摘要核对。所有落盘资格位为 false、授权为 null，最终执行提交尚未绑定。

这一结果是授权材料的输入，不是模型质量或有效授权。评分适配暴露的课程对应缺口已完成有限修复及独立审阅；当前工具已接入新回执并独立审定，最终操作包仍须固定其实际字节。仅当提取提示、传输相关源码、原文或配置发生变化时才重新生成受影响请求，不因无关映射修改重做请求草稿。
