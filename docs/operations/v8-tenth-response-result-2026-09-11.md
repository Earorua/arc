# Arc v8 第十次真实 Research 结果与请求契约调查

状态：2026-09-11 用户回复“已运行”后已核对新安全 Summary；本次许可已消耗。完整 Research 未通过，没有第十一次许可。当前完成只读调查与下一项本地设计，未实施新请求行为。

## 实际结果

安全文件 `outputs/live-research/summary-2026-09-11T08-21-04-984Z.json`，3433 bytes，SHA256 `ef65367eaf429cd9318b4cbf23858eb0ed2471c26f893e1438178a91a1db26e1`。摘要时间为北京时间 16:21:04.984；落盘时间为 16:21:51.515。原字节保留，不读取 Key 或模型原始正文。

| 项目 | 本次证据 |
| --- | --- |
| 模型与耗时 | requested/actual `moonshotai/kimi-k3`；low；Research 45298 ms |
| 连接与返回 | Key/Research HTTP 200；finish_reason stop；Provider 结果 accepted |
| 用量兼容 | legacy 路径 missing；details 路径 object/valid；来源 details；usageIssueCodes 空 |
| tokens | prompt 6800；completion 5076；total 11876 |
| 费用与结算 | costMicros 82915；reservation settled，settledMicros 82915，最大保留 5000000 |
| 搜索 | 返回 webSearchRequests 4；请求参数与最终验收上限均为 2，尚未解释差异 |
| 候选 | schema-rejected；run failed / invalid-result；quality invalid-schema |
| 完整流程 | 未 Ready、未激活、未生成计划 |
| 调用边界 | 一次 Key GET + 一次 Research POST；Repair 0；拒绝第二次 Research |
| 隔离与收尾 | ownerWrongReadRejected true；databaseDisposed true |

USD 0.082915 是本地按微美元上取整后记录并结算的费用，不冒称门户未取整金额。USD 5 是预留上限，不是本次消费。两个 real requests 不代表两次 Research，也不表示远端只发生两项内部操作。

安全候选诊断包含 14 个去重后的 path/code 组合（不是原始错误总数），truncated false：

- `$` 和 `skills[]`：unrecognized-keys。
- evidence、prerequisiteEdges、resources、role、skills[].masteryCriteria、skills[].resourceIds、skills[].why、stages、unitTemplates：invalid-type。
- skills[].category、skills[].importance：invalid-value；skills[].id：invalid-format。

invalid-type 不能区分缺失与错误类型，未知键诊断不透露名称。数组下标已归并。最终 citationCount/skillCount 为 0 不证明原始响应没有来源/技能；Provider accepted 不等于来源质量或教学契约通过。

## 零付费调查结论

Root 核对官方文档；独立只读子代理核对请求、传输、接收、计数、版本和缓存，未发现本地丢字段、覆盖 response_format 或搜索计数翻倍路径：

1. `openrouter-provider.ts` 直接把 `z.toJSONSchema(researchCandidateSchema, { target: "draft-7" })` 放入 strict response_format；其后的 spread 没有覆盖 schema/messages。既有通过测试也检查与完整导出契约相等。`transport.ts` 原样转发 init，runner 注入 native fetch。
2. 候选正文未经字段重写返回；orchestrator 仅 trim/完整 JSON fence 解包，然后使用同一严格 schema。没有把完整对象裁成技能数组的本地路径。
3. 系统消息要求 strict schema 和完整教学内容，但没有展开真实字段、类型与枚举；用户消息的 role 是岗位字符串，输出契约的 role 是对象。这是可改善的请求说明，不证明本次模型具体输出值，也不证明远端丢弃 schema。
4. 官方说明结构化输出能力按 endpoint 判断，strict 执行程度依 Provider 而异。代码已有 require_parameters true；模型页面显示 Kimi K3 支持 response_format，但这不能证明本次具体 endpoint 保证原生 strict。公开 endpoint 元数据读取未成功，不能填写路由已验证。[结构化输出](https://openrouter.ai/docs/guides/features/structured-outputs)、[Kimi K3](https://openrouter.ai/moonshotai/kimi-k3)。
5. 现有 max_uses 2 位于 tool.parameters，max_tool_calls 2 位于请求顶层，与官方位置一致；没有 stop_server_tools_when 覆盖。官方说达到次数上限后进一步调用返回错误，并将 web_search_requests 定义为搜索 query 总数；文档没有充分解释本次计数 4 与执行/计费的关系。不能据此认定真正执行四次或计算搜索费用。[Web Search 限制与计数](https://openrouter.ai/docs/guides/features/server-tools/web-search)。
6. 本地从 details 原值复制 4，不相加或裁剪。通用 usage 接受 0..10 以保存可信费用；本地最终验收要求 1..2。若候选合法而次数为 4，临时激活/规划会先执行，但最终 Summary 仍 incomplete；本次候选已失败，未走到激活。次数门槛目前是验收门槛，不是远端执行控制。
7. 新提示必须提升 promptVersion：生产和本地 configFingerprint 依赖显式版本，不直接哈希提示正文；否则未来新行为可能复用旧缓存身份。

已向用户请求本次主记录的 Provider、usage_web、num_search_results 三个可选字段，以补充端点和搜索证据；无需重新运行、提供完整 JSON、Key 或原始正文。未收到这些字段前保留未知，不阻塞本地设计准备。

## 后续与保护范围

可审阅设计：`../superpowers/specs/2026-09-11-arc-v8-request-contract-design.md`，Root 自审及独立审查 READY，无 P1/P2/P3 实质问题，待用户批准。建议只做本地提示契约强化及版本/TDD，不放宽 schema、不改变搜索参数或账单。该措施不能保证远端合规，也不解决尚未知的搜索计数原因；不以设计批准推定第十一次付费许可。

本轮源码未改，原 25 项候选/受保护指纹重新匹配，第十次 Summary 哈希再次一致；tracked diff check 通过，新增两份文档 UTF-8/末尾空白检查通过。既有 16 文件/771 项回归、类型/lint/build 和双审仍为前轮证据，不重复执行。新增本次 Summary 为后续保护证据。分支 `codex/v8-openrouter-research-beta`，HEAD `7090153b4acad7b12df6a7ee4d675b46c41871dc`；55 份此前有意成果保留，加两份文档后共 57 份未提交文件。

没有生产变量/旗标/D1/R2、Git 暂存/提交/推送/合并、Sites 候选或部署操作；公开 Research 仍未启用。等待第十次执行的旧阻碍已解除，完整首版公开发布目标未完成；目标工具曾记录的 blocked 不能继续解释为用户尚未执行。
