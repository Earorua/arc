# 当前冻结源码的完整离线验证执行清单

本文件是待执行清单，不表示通过。各命令执行结果由同名包装器 JSON／log 和最终报告证明。

源码捕获基点 `714ea9e54d87b91a1fee4883176d4f1dd06ecf63`，产品变更提交 `41bcdd7a9110e67c4529468fc26dafb3cfc81ab5`；1,004 个源码文件摘要 `8ab545fbd75adeaa8274ac9c7b89d7a7bbd37085a473b748071f6d11a5042ecb`。

副本 `D:/CodexTemp/arc-experience-priority-P3jdvc/source` 来自 `experience-priority-snapshot-20261109-a-results.json`。`node_modules` 只作为本机依赖目录的 junction，不安装依赖、不联网。完整类型／Lint／构建使用该副本排除忽略目录里的历史故意失败探针。Research 来源边界和含 Git 固定历史的附加 Node 使用原工作树，保留原校验。

1. 独立规格与质量审阅关闭全部当前阻塞项。源码冻结后，只读审阅与本地测试可并行；最终验收必须二者均通过。若审阅引发源码变化，保留本轮记录，为新源码另行取得所需结果。
2. 根任务 43 项实际 HTTP/workerd/D1/R2 场景、Node 完整结果对照、3 项实际服务到 UI 流程、旧策略 2 的真实持久化预览原样读取。
3. 普通 Vitest 组：副本中 `run --maxWorkers=2`，只排除 document-diagnostic-pilot-host、materials-supplement-collection、research-cloud-smoke-composition、research-executor-private-integration 四套件。
4. 串行组：前两套件在副本中 `--maxWorkers=1` 执行。
5. Research 组：后两套件在原工作树 `--maxWorkers=1` 执行。三组文件集合必须与 `tests/**/*.test.{ts,tsx}` 相同且不交叠，不用分组遗漏任何测试。
6. 附加 Node：原工作树 `--test --test-concurrency=1`，运行旧完整清单的 9 个 `.test.mjs`；构建后页面的第 10 个 `.test.mjs` 单列执行。首次 `full-node-20261109-a` 与其他长验证并行，最终为 288 通过／0 断言失败／2 原 45 秒及 60 秒预算取消；保留原日志。已核对测试和服务 harness 与此前已验证基线原字节相同，其他长验证全部结束后用相同命令独占串行执行新的 `full-node-20261109-b`。不得延长阈值、删除断言或将 a 改记通过；并行资源竞争仅是假设，b 的实际结果才能证明受控环境是否通过。
7. 副本内 TypeScript、全仓 ESLint、构建依次执行，然后 5 项页面验证。副本路径经 `ARC_LOCAL_GROUNDED_CHECKOUT` 传给既有包装器，执行后清除该临时环境变量。
8. 最终重新核对来源树／副本全部源码、26 份旧参考、85 项课程依赖、作者及独立审阅固定哈希。匹配之后才写最终通过结论并归档。

每个 Node 命令均由 `node work/grounded-verification/run.mjs <新的唯一标签> <Node 参数>` 执行，沿用冻结的断网包装器；不改变原断言、预算或产品权限。运行名统一 `experience-priority-...-20261109-...`。若任一失败，保存日志、先定位原因，再按新运行名复测；源码若改变，旧通过结果不能直接验证新候选。

本轮不部署、不远程迁移、不调用真实模型，也不推送、合并或接入下一批原词投影。
