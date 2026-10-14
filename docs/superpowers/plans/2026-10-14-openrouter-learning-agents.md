# OpenRouter 双学习 Agent 接入

用户已选择即时生成：规划期间保持页面打开。沿用已批准的双 Agent 交互与候选计划确认流程。

- [x] 两个 Agent 共用服务端 `OPENROUTER_API_KEY`；默认 `openai/gpt-6-astra`，规划 max，答疑 low/high。
- [x] 使用 OpenRouter Responses 流式接口、`store: false`，移除后台任务提交/远端恢复；价格上界参与路由筛选。
- [x] 规划先保存本地运行记录，再发送 started/heartbeat/done；完成后保存结果，查询只读取本站 D1。
- [x] 断开、取消、超时、过期上下文都不会自动重发付费请求；已保存结果可再次查看。
- [x] 页面展示生成进度和保持页面打开提示，候选方案仍需用户确认。
- [x] 用模拟流验证 UTF-8 分片、完成/中断、取消、去重、预算和账户隔离；运行类型、lint、构建及相关回归。
- [x] 更新配置文档，独立审查改动；没有密钥时明确区分模拟验证与真实联调。

参考：[OpenRouter Responses](https://openrouter.ai/docs/api_reference/responses/overview)、[模型](https://openrouter.ai/openai/gpt-6-astra)、[价格路由](https://openrouter.ai/docs/guides/routing/provider-selection)。不修改现有 Research 执行器及生产绑定。

验证：30 个 Vitest 文件、451 项测试通过；4 项构建产物/服务端渲染检查通过；TypeScript、ESLint 和生产构建通过。独立审查未发现阻塞项，并用 OpenRouter 当前公开 OpenAPI/模型元数据确认事件类型和 max 推理支持。预览 `/coach` 返回 200，显示即时生成提示。真实模型及登录环境联调尚未执行。
