# Kimi 资料分析验收 · 账户持有人操作单

适用于第一轮 24 份合成资料的 B1 配置核验。本轮已完成工作区与密钥设置、护栏指派及两次工单取证。供应方已答复无法提供该路由的历史样例或上游缓存时长保证。下一项由持有人选择单笔合成取证或先取得书面条款。[当前 B1 记录](../../verification/2026-11-04-materials-gate-1b-b1-review.md) · [单笔取证草案](2026-11-04-materials-kimi-single-receipt.md)

## 1. 确认用的是资料验收工作区

1. 登录 OpenRouter，选择专用于本次验收的工作区。若账户已有其他项目在用，先确认哪些设置是组织级的，避免改变其他项目。给材料写上一个一致的工作区别名和截图日期。
2. `materials-b2` 已建好。在该工作区进入 **Guardrails → New guardrail → Model & provider access → Configure → Data & privacy**。对 **All other models** 启用 ZDR，选择严格零保留，排除 **Safety Retention**。Moonshot 属于此分组。关闭允许将数据用于训练的选项。在 **Assign** 将护栏指派给本轮普通 key 或整个专用工作区，保存后在 **Assignments** 核实生效范围。账户 **Privacy** 的 **Allow 1% data discount in workspaces** 控制工作区能否同意 OpenRouter 使用正文，核对其有效设置。核对响应缓存和 preset。[专用工作区护栏](https://openrouter.ai/workspaces/materials-b2/guardrails) · [账户隐私](https://openrouter.ai/settings/privacy) · [ZDR 分组和护栏](https://openrouter.ai/docs/guides/features/zdr) · [响应缓存](https://openrouter.ai/docs/guides/features/response-caching)
3. 在工作区 **Observability** 核实 **Input & output logging** 已关闭，并检查 **Traces** 下没有接收本次请求正文的目的地。在 **BYOK** 核实本轮没有 Moonshot 上游自带密钥，在 **Presets** 核实本轮没有改变缓存或路由的预设。[Observability](https://openrouter.ai/workspaces/materials-b2/observability) · [BYOK](https://openrouter.ai/workspaces/materials-b2/byok) · [Presets](https://openrouter.ai/workspaces/materials-b2/presets)
4. 确认本轮只使用合成文本。审阅上游隐式缓存、OpenRouter 可能抽样做匿名输入分类，以及其公布的在途 CSAM 筛查与法定保留例外。若你需要端到端地区保证、完全禁止分类或具有约束力的合同证明，请列为待解决项。[标准端点](https://openrouter.ai/moonshotai/kimi-k3.1-pro/providers) · [筛查公告](https://openrouter.ai/blog/announcements/csam-screening/) · [国际服务条款](https://platform.kimi.ai/docs/agreement/modeluse)

## 2. 准备单轮额度

2026-11-04 的实操已完成密钥创建、私下保存和护栏指派。工作区显示为 `materials-b2`。护栏的 **Assign** 页先显示一张空表。保持工作区默认护栏开关关闭，点右侧 **＋ Add**，在选择框勾选唯一显示的 **`materials-b2`**，确认它已加入表格，再点右上角 **Create guardrail**。选择框中连字符前没有空格，API keys 列表的辅助功能文本将同一条显示为 **`materials -b2`**。保存后，从护栏 **materials-b2-zdr → Assignments** 核对具体密钥，再刷新 API keys 列表核对该行的 **1 guardrail** 和累计限额 **$2 TOTAL**。

- 在专用工作区进入 **API keys → New key**。名称填 `materials-b2`，**Credit limit** 选 **Custom amount**，输入 **2.00 USD**。**Reset limit every...** 选 **N/A**。页面会说明累计达到 2 美元后拒绝请求。账户持有人点 **Create**，私下保存密钥并关闭一次性弹窗。截图只显示额度、重置周期、有效余量和本轮别名，遮掉 token、key hash 和账户标识。[专用工作区 API keys](https://openrouter.ai/workspaces/materials-b2/keys) · [当前 key 字段](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key)
- 单独截取 Credits 里的可用余额。标准端点按已公示文本费用计算，一轮顶格需预留 **1.751040 USD**。若需要充值，先记录最低充值额、手续费及税费，再决定是否购买。余额、key 限额和推理支出是三个不同的数字。[Credits](https://openrouter.ai/settings/credits) · [标准价格](https://openrouter.ai/api/v1/models/moonshotai/kimi-k3.1-pro/endpoints)
- 请将下列值记在本地：工作区别名、政策核验日期、普通 key 的 **limit / limit_remaining / limit_reset**、工作区余额是否足够、BYOK 是否关闭。密钥正文不属于验收材料。B2 完成、对账后回收该 key。第二轮和生产环境的额度分别办理。

## 3. 没有历史回执时的做法

如果已有**获准的同一标准端点**历史请求，提供其聊天响应和 generation 元数据的脱敏字段，并提供本次专用 key 的回执读取权限证据。比较两份材料时可以使用同一回执 ID 的本地摘要。不需要提示词、输出正文、推理过程或开启正文日志。[回执元数据接口](https://openrouter.ai/docs/api/api-reference/generations/get-request-%26-usage-metadata-for-a-generation)

如果是新 key 或从未使用过该路由，请直接记 **“无历史回执”**。在官方支持页进入 **Create Ticket**，类别选择 **API and model technical issues**。请求针对本工作区和普通 key 权限范围的书面确认。表单使用已登录账户的邮箱接收客服回复。正文只写路由和技术问题，提交后保存工单编号。下面的英文可直接使用。[OpenRouter 私有工单](https://openrouter.ai/support/new)

> We are evaluating the standard OpenRouter route `moonshotai/kimi-k3.1-pro` with only `moonshotai/mxfp4`, no fallbacks, strict ZDR, and no input/output logging. We have not sent an evaluation prompt. Could you confirm the following for an ordinary dedicated API key in our workspace?
>
> 1. Can the key read its own completed requests through `GET /api/v1/generation?id=…` with content logging disabled? For this route, what model IDs appear in the chat and generation responses? Does a single successful attempt expose `provider_name="Moonshot AI"`, `status=200`, and `endpoint_id="a3fafaac-f097-4ef1-86b3-842854dad5c6"`? Are latency and generation time available?
> 2. Do the chat and generation records report matching prompt tokens, total completion tokens including reasoning, and total cost for the same generation? Are there any additional cache-write, fixed-request or other charges for ordinary non-streaming text without explicit caching, tools or plugins? What implicit caching and TTL apply on this route?
> 3. With the above settings, what retention and training terms apply to prompts, responses, and implicit caches along this specific route? Please identify any applicable exceptions.

本轮工单已受理，账户持有人的三项操作均已完成。2026-11-04 12:18 UTC 收到官方技术答复。普通 key 在关闭正文日志时读取自己的生成元数据、标准文本价格和免费缓存写入均已有书面依据。

供应方若只给通用文档，记录工单编号和仍缺的字段。没有对应证据时，B1 保持待核验。使用新推理补证需要先单独修订验收方式及取得有明确上限的授权。

### 本轮工单的后续取证

客服建议先产生一笔请求，再给出 generation ID。本工作区没有历史请求。持有人已批准向同一张工单回复，优先索取供应方已有的脱敏样例及上游缓存边界。以下两段已于 2026-11-04 12:40:59 UTC 发送，已从原邮件线程核对收件人、回复关系和新增正文。模型调用和费用均为零。

> Thank you for confirming ordinary-key access and the route pricing. Our dedicated key has no prior generations. Could you provide an existing redacted pair of chat and generation metadata from a synthetic request on the standard `moonshotai/kimi-k3.1-pro` route pinned to `moonshotai/mxfp4`? We only need the two model strings, a consistent placeholder for the generation ID, provider name, attempted endpoint IDs and statuses, prompt and total completion tokens including reasoning, cost in both records, and available timing fields. Please omit all prompt and completion text, credentials and account identifiers.
>
> For Moonshot's automatic prompt cache on this route under strict ZDR, is there a documented maximum retention time or a way to disable the upstream cache? If neither a bound nor a sample is available, please say so and identify where a route-specific written commitment can be obtained.

官方支持已于 12:43:19 UTC 回复。没有可分享的标准路由配对样例，公开示例只展示另一模型的虚构记录。Moonshot 自动缓存的保留上限和关闭方式均没有公开文档，正式书面保证需向企业渠道申请。当前单笔推理、企业联系、提供真实 generation ID 和 24 份 B2 评测的授权分别为零。本次获准邮件已完成。[单笔范围和预算](2026-11-04-materials-kimi-single-receipt.md) · [企业联系入口](https://openrouter.ai/enterprise/form)

## 4. 把什么交回项目

可以用工作区外的私有目录；若用项目内目录，建议使用 Git 忽略的 `work/materials-gate-1b/account-review/`。把**脱敏材料的路径**告知工程负责人即可。不要把密钥、未脱敏页面导出、请求正文放入仓库、报告或聊天。

| 交回项 | 最少内容 |
| --- | --- |
| 账户设置 | 同一工作区/key 的有效 ZDR 分组、护栏、正文改进和日志、响应缓存、Broadcast、BYOK，含核对日期 |
| 费用 | key 限额、不重置、剩余额度和工作区余额分别核实，供应方对该路由附加费的说明或未决项 |
| 回执 | 既有合规配对字段和本 key 权限，或同时覆盖这两项的供应方书面答复 |
| 下一轮授权 | B1 复核通过后，另签候选及配置摘要、语料摘要、新 runId、独占主机、持久账本、24 次与 2.00 USD 上限和实际 UTC 批准/截止时间。生产日额、公开用户资料处理和 B4 另行登记 |

