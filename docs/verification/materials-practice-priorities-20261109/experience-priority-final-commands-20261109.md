# 2026-11-09 根任务实际离线命令记录

本文件记录已发起的命令，不单独证明通过。每条结果以同名包装器 `.json`／`.log` 为准；首轮 Node `a` 为 288 通过、2 超时取消，不能算通过。最终验收须另核对独占串行 `b` 的结果以及完整文件覆盖清单。

工作目录：`C:/Users/XF/.codex/worktrees/materials-replan-recovery/ui-warm-precision`。捕获 HEAD `714ea9e54d87b91a1fee4883176d4f1dd06ecf63`，产品源码提交 `41bcdd7a9110e67c4529468fc26dafb3cfc81ab5`。1,004 个源码清单摘要 `8ab545fbd75adeaa8274ac9c7b89d7a7bbd37085a473b748071f6d11a5042ecb`。

所有命令均经 `work/grounded-verification/run.mjs`（SHA256 `4a2fe29b3c5c0fd9c6ce06cfd436e86e8a9ef9daa8fada44e7c87021c5f28242`），加载固定 `block-outbound.cjs`（SHA256 `48332c5bcf02a17b7cc7fbf27e3771db7e8809afb36acd1c870b683909d10e9f`）。该包装器清理凭据与真实配置，只允许回环网络。所有输出名是一次性标识，后续复跑必须换名。

## 原生、Node 对照、UI 与真实旧数据

```powershell
node work/grounded-verification/run.mjs experience-priority-root-cases-20261109-final-a work/grounded-verification/experience-priority-root-cases-20261109.mjs work/grounded-verification/experience-priority-root-cases-20261109-final-a-results.json
node work/grounded-verification/run.mjs experience-priority-node-parity-20261109-final-a node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-priority-node-parity-20261109.config.ts
node work/grounded-verification/run.mjs experience-priority-root-ui-20261109-final-a node_modules/vitest/vitest.mjs run --config work/grounded-verification/experience-priority-root-ui-20261109.config.ts
node work/grounded-verification/run.mjs experience-priority-history-read-20261109-a work/grounded-verification/experience-priority-history-read-20261108.mjs work/grounded-verification/experience-priority-history-read-20261109-a-results.json 2026.11.3
```

43 项原生用正常 30 文档配额下的两个独立临时库（27＋16），实际公共 HTTP 与 createDocumentRuntime；候选投递固定为无推理的历史格式合成夹具，分析关闭。Node 运行同一 handler，完整对照实际预览、重读、原资料、草稿和快照。UI 使用实际组件、HTTP factory 与 SQLite/D1 适配器，不宣称原生浏览器视觉验收。历史测试打开原 policy 2 测试库，保持原数据、creator 和 baseline 摘要检查；没有手工拼装旧预览。

## 在匹配源码副本中执行

每条命令单独将 `ARC_LOCAL_GROUNDED_CHECKOUT` 设置为 `D:/CodexTemp/arc-experience-priority-P3jdvc/source`，在 PowerShell `finally` 中清除，保留 Node 原退出码。副本与工作树逐文件相同，`node_modules` junction 只供本机依赖读取。

```powershell
node work/grounded-verification/run.mjs experience-priority-full-unit-20261109-a node_modules/vitest/vitest.mjs run --maxWorkers=2 --exclude tests/server/document-diagnostic-pilot-host.test.ts --exclude tests/server/materials-supplement-collection.test.ts --exclude tests/server/research-cloud-smoke-composition.test.ts --exclude tests/server/research-executor-private-integration.test.ts
node work/grounded-verification/run.mjs experience-priority-full-serial-20261109-a node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/server/document-diagnostic-pilot-host.test.ts tests/server/materials-supplement-collection.test.ts
node work/grounded-verification/run.mjs experience-priority-full-types-20261109-a node_modules/typescript/bin/tsc --noEmit
node work/grounded-verification/run.mjs experience-priority-full-lint-20261109-a node_modules/eslint/bin/eslint.js . --ignore-pattern dist --ignore-pattern .next
node work/grounded-verification/run.mjs experience-priority-build-20261109-a scripts/run-vinext.mjs build
node work/grounded-verification/run.mjs experience-priority-render-20261109-a --test tests/rendered-html.test.mjs
```

类型、Lint、构建按此顺序完成，页面检查在构建完成后执行。普通组与串行组可重叠运行，但每组内部使用指定 maxWorkers。

## Research 与附加 Node 在原工作树执行

保留 Research 的实际依赖来源边界，以及 Node 固定 Git 历史闭包，不在 junction 副本绕过校验。

```powershell
node work/grounded-verification/run.mjs experience-priority-full-research-20261109-a node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/server/research-cloud-smoke-composition.test.ts tests/server/research-executor-private-integration.test.ts
node work/grounded-verification/run.mjs experience-priority-full-node-20261109-a --test --test-concurrency=1 tests/build/restricted-candidate-files.test.mjs tests/build/restricted-research-candidate.test.mjs tests/offline-uat/entry.test.mjs tests/offline-uat/http-clients.test.mjs tests/offline-uat/legacy-recovery.test.mjs tests/offline-uat/research-public-recovery.test.mjs tests/offline-uat/research-recovery.test.mjs tests/offline-uat/retained-compatibility.test.mjs tests/scripts/auth-tail.test.mjs
node work/grounded-verification/run.mjs experience-priority-node-timeout-diagnosis-20261109-a work/grounded-verification/experience-priority-node-timeout-diagnosis-20261109.mjs
node work/grounded-verification/run.mjs experience-priority-full-node-20261109-b --test --test-concurrency=1 tests/build/restricted-candidate-files.test.mjs tests/build/restricted-research-candidate.test.mjs tests/offline-uat/entry.test.mjs tests/offline-uat/http-clients.test.mjs tests/offline-uat/legacy-recovery.test.mjs tests/offline-uat/research-public-recovery.test.mjs tests/offline-uat/research-recovery.test.mjs tests/offline-uat/retained-compatibility.test.mjs tests/scripts/auth-tail.test.mjs
```

`b` 在其他长验证全部退出后启动；与 `a` 的区别只有输出标识和并行负载，未更改命令参数、源码、断言或超时上限。诊断文件记录旧测试／harness 与上次完整验收源码的字节对照，以及首轮 45 秒／60 秒取消。

## 完成后核验

最终源码、副本、26 冻结参考、85 课程依赖、两个审阅 memo 和完整运行覆盖须再次核对；对应命令和结果由最后验收清单列出。没有真实模型、费用、部署、远程迁移或推送。
