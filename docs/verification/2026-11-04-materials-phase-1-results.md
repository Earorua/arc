# Arc 私有资料：阶段 1 离线实施结果

日期：2026-11-04  
依据：v2.1 方案、阶段 0 冻结契约与阶段 1 详细计划  
执行分支：`codex/materials-phase-1-offline-20261104`  
起始基线：`2caa51d`

**阶段 1 离线实现已交付 AI 主路径、用户核对修改和人工兜底。** 下文的运行时间、测试数和产物记录对应当次离线候选。后续 Gate 1B 已完成 B0，B1 正在核验 Kimi 标准路由。专用工作区与普通 key 已建立，实付推理仍为 0 次，B2 尚未启动。阶段 1 的真实准入和公开发布仍待完成。[B0 结果](2026-11-04-materials-gate-1b-b0-results.md) · [B1 核验](2026-11-04-materials-gate-1b-b1-review.md) · [当前发布进度](2026-11-04-materials-public-release-progress.md)

**最新离线集成候选**　`fa9c9ae3a3e9` 增加了同岗位更换 JD、补充资料参与规划、从目标取消关联以及专用合成服务的验证。全仓 Vitest 348 个文件、7,424 项通过，另行复核 Research 严格基线 131/131。附加 Node 用例最终 290/290，构建后页面 5/5，类型检查和两种模式的本地打包通过。首次 Node 演练的本机端口冲突和原样重跑记录一并留存。[集成回归](materials-release-integration-candidate/verification.json) · [隔离合成构建](materials-release-integration-candidate/synthetic-verification.json)

## 1. 本地已实现的用户功能

| 能力 | 本轮结果 |
| --- | --- |
| 导入资料 | 登录用户粘贴简历、岗位 JD 或补充资料；保存私有版本，支持查看、修改和重新确认 |
| AI 主路径 | 展示处理方、用途和实际文本；明确允许后创建串行分析任务；合法结果直接预填核对草稿 |
| 用户核对 | 修改/移除/新增事实，查看来源；区分岗位必备与加分要求，处理高影响提醒后确认 |
| 能力建议 | 独立于事实确认；用户明确采用自评建议，未提及能力可显式选“不确定”，不自动授予独立完成或已验证 |
| 技能对应 | 按蓝图版本使用精确别名；用户可手选当前蓝图已有技能，修改对应后必须重新预览 |
| 首次规划 | 将确认资料冻结为上下文，预览后原子保存路线及资料关联；失败不留下半套计划 |
| 当前路线 | 只对未完成任务作合法重排，保留原任务集合、依赖和完成记录；接受后生效，也可放弃 |
| 可追溯依据 | 在候选差异和历史中展示私有依据；资料删除后显示不可用说明，不恢复旧摘录 |
| 异常兜底 | 拒绝外发、关闭分析、候选无效、额度不足或费用未知时，可以手动继续；迟到结果不覆盖已修改草稿 |
| 恢复与删除 | 回执及引用支持刷新恢复；删除先撤销引用，再清理对象及派生资料，提供清理状态查询 |

阶段 1 仅支持粘贴文本。PDF/DOCX 上传、OCR、自动抓取 URL、资料接入普通 Agent 对话，以及新增蓝图外课程仍属后续阶段。

## 2. 技术交付

- 新增应用迁移 `drizzle/0014_private_materials.sql` 和执行器本地迁移；应用模型合计 70 张表（新增 21 张），旧迁移未改写。
- 27 项资料相关端点契约，接入所有者、版本、同源、请求/响应大小、速率及功能开关约束；沿用的规划写入端点补齐生产同源检查。
- 私有文本与来源定位、AI 提取候选、核对草稿、不可变确认、主简历/主 JD/最多三份补充资料的选择。
- 独立预算、允许记录、队列、签名服务桥、专用执行器及持久 Workflow；单次发送栅栏，未知费用保留占位，不自动重发。
- 取消/撤销通知写入持久 outbox，失败由维护重试；发送前再次检查，发送中取消后仍处理迟到费用回执并清理结果。
- 冻结上下文、版本化映射与解释、确定性优先级、首次生成和候选接受事务栅栏。
- 新增 owner 绑定的浏览器引用恢复；正文、名称、摘录和确认事实不写入本地资料草稿。
- 新增隔离的真实模型资格运行器、逐文档报告模板和上线/回退手册；普通离线测试不会发现或运行真实资格套件。

## 3. 验证结果

Research 基线问题已在确认 Git 历史和原始字节差异后修复。重新运行全仓回归，**没有排除任何套件，335 个测试文件、7,273 项测试全部通过**。各项只使用本地 SQLite、内存私有对象存储、Miniflare 和假 Provider；真实模型资格套件保持独立且未运行。

| 检查 | 结果 |
| --- | --- |
| 全仓回归 | 335/335 个文件、7,273/7,273 项通过；无排除项，包含原先阻塞的三个 Research 套件 |
| Research 基线专项 | 三个原阻塞套件及引用兼容性、诊断回归共 5 个文件、229 项通过；含 4 项新增篡改拒绝测试 |
| TypeScript | `npx tsc --noEmit --incremental false` 通过 |
| ESLint | 0 error；4 个既有 Research 测试未使用变量 warning |
| 生产构建 | `npm run build` 通过；未发布 |
| 构建后渲染 | `node --test tests/rendered-html.test.mjs`，5/5 通过 |
| 实际本地执行器 | Miniflare 12/12 通过，包括重启、签名边界、取消竞态和迟到结果清理；外网请求为 0 |
| 资料 UI 边界 | 7/7 通过：A→B→A 延迟响应、移除不被旧回执复活、新资料 AI 链不中断、删除刷新恢复等 |
| 创建恢复 | 真实 SQLite 4/4 通过；过期未提交可在同一首次目标重预览，已提交按原请求恢复 |
| 独立审查 | 新选择失效、关闭开关接受、取消通知和旧规划同源检查缺口已修复并回归 |
| 固定 24 份质量样例 | 18 普通 + 6 边界的离线评测器/候选校验通过；这是固定模拟输出，不是模型质量成绩 |
| 真实模型资格 | **NOT RUN：24 份均未调用，不计为通过** |

### 已解决的 Research 基线阻塞

修复前复现确认，以下 3 个 Research 套件被同一严格哈希校验阻断，共 106 项失败、21 项通过：

- `tests/server/research-cloud-smoke-build.test.ts`
- `tests/server/research-cloud-smoke-composition.test.ts`
- `tests/server/site-import-native-d1.test.ts`

构建器要求 `app/server/research/openrouter-provider.ts` 的 SHA-256 为：

```text
5e762073cd357184f1925ecc412c9fcd8e06433351e4aba56b70ae8a43cc1a8d
```

基线 `2caa51d` 与本轮工作区该文件的实际值均为：

```text
d0c962c1ba0bcaf2e87119e40b982e0ebe6560d67ddcc662530b21db4ed7c54d
```

根因已确认：`513d84f`（2026-10-29）提交了引用标题为空时的兼容性修复，但没有同步更新 smoke 构建器中的固定值。原值对应 `cc38e02` 的 Provider；仅应用该提交中的导入与条件判断两处差异，即可逐字节得到当前文件。不是换行差异，也不是阶段 1 改动。

复核后更新 Provider 固定值，并将其依赖 `citation-title.ts` 同时纳入固定哈希与构建前后保护清单。原始字节精确校验、其他固定值、构建隔离和失败时禁止输出产物的约束全部保留；新增 4 项测试证明两个文件在构建前或构建中变化仍会被拒绝。生产 Provider 与辅助函数本身没有修改。

此前排除这三个套件后的 332 文件 / 7,142 项通过记录仅作历史记录；本次无排除全仓结果为 335 文件 / 7,273 项通过，已解除这一阻塞。完整根因、版本与验证证据见 [Research 基线修复报告](2026-11-04-research-smoke-baseline-repair.md)。

### 本地浏览器实际操作

测试入口为 `tests/materials-uat/start.mjs`，仅监听 loopback；固定合成候选，服务端外发 fetch 直接抛错，无真实 Provider 凭据。

1. JD + 简历依次允许、模拟分析、自动预填；修改事实并确认，明确选用“不确定”自评。
2. 四步设置进入资料影响预览；新版精确别名识别 JavaScript 对应已有 Web Platform。
3. 手动选择已有技能后，“创建路线”立即失效；重新预览后可提交。
4. 键盘 Enter 提交成功，保存 44 个学习单元，保留校准及后续学习；历史显示必备技能和范围保护依据。
5. 分析关闭时保存人工 JD，新增事实默认岗位要求，必须明确必备/加分后才能确认。
6. 私人资料库新增资料不会因取得保存回执而中断分析；费用未知时 AI 再发送按钮禁用，手动整理仍可用。
7. 本地合成资料删除后显示清理中，维护后查询显示完成；账户切换不显示另一账户正文。
8. 390 px 窄屏检查无横向溢出；关键表单、选择和提交可操作。

刷新、过期、并发、跨账户迟到响应、额度、失败等更完整矩阵由自动化组件与服务测试覆盖；浏览器外壳不替代真实登录或云端双 Worker 验收。

![资料影响预览](C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta/.worktrees/ui-warm-precision/docs/verification/materials-phase-1/context-preview.png)

[查看窄屏截图](C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta/.worktrees/ui-warm-precision/docs/verification/materials-phase-1/mobile-preview.png) · [查看保存路线及依据](C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta/.worktrees/ui-warm-precision/docs/verification/materials-phase-1/saved-route.png)

## 4. 剩余验证项

| 项目 | 当前状态与下一步 |
| --- | --- |
| 真实 AI 质量 | 未运行；在明确授权固定端点、模型、策略、24 请求上限和预算后，逐份核验召回、分类、来源和 6 类边界 |
| 服务商隐私与费用 | 未核实实际 ZDR、固定路由、禁止回退、token 单价和计费回执；必须与资格配置精确一致 |
| 云端运行环境 | 未部署；验证目标 D1 增量迁移、私有 R2、独立执行器、Workflow、双向命名入口、独立秘密与定时维护 |
| 真实故障恢复 | 验证网络中断、回执丢失、重启、取消/删除竞态、对象最终一致性和费用不明状态 |
| 硬崩溃写入者 | 无法证明写入者已终止时会保持 cleanup-pending；需目标环境的停止证据及受控运维恢复流程，不能以超时冒充删除完成 |
| 正式产品验收 | 使用实际登录流程、部署配置及真实模型结果验证完整用户体验；本轮本地测试使用合成账户和假分析 |
| 发布 | 本轮未执行；Gate 1B 与发布前检查全部满足后，再按后续授权进行 |

## 5. 交接文件

- [阶段 1 实施计划](C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta/.worktrees/ui-warm-precision/docs/superpowers/plans/2026-11-04-arc-private-materials-phase-1.md)
- [资格与运行手册](C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta/.worktrees/ui-warm-precision/docs/superpowers/runbooks/2026-11-04-private-materials-phase-1.md)
- [真实模型逐文档资格记录（NOT RUN）](C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta/.worktrees/ui-warm-precision/docs/superpowers/reports/2026-11-04-private-materials-model-qualification.md)
- [阶段 0 契约与阶段 1 字段增补](C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta/.worktrees/ui-warm-precision/docs/superpowers/specs/2026-11-04-private-materials-contracts.md)

功能默认关闭；构建产物没有测试 harness、真实 Provider key 或已认证模型配置。保留已有 v2.1 设计文档的用户修改。本轮实现留在本地分支，未合并、推送或部署。

## 6. 收尾记录

- **Gate 1A（阶段 1 功能离线集成与兜底）：通过。** Research 基线阻塞已修复，全仓离线回归通过；该结论不覆盖真实 Provider 或云端部署。
- **Gate 1B：NOT RUN。阶段 1 整体准入未完成，尚不能作为真实 AI 已可上线的结论。**
- 最新全仓回归于本地 13:34:34 开始，215.73 秒结束：335 个文件、7,273 项通过，退出码 0，无排除项。
- 构建后页面渲染 5/5 通过；最终 TypeScript 退出码 0；最终 ESLint 退出码 0（4 个既有 warning）。
- 构建、迁移产物哈希见 [artifact-hashes.json](materials-phase-1/artifact-hashes.json)；浏览器记录见 [browser-verification.json](materials-phase-1/browser-verification.json)。
- 临时浏览器标签和本地 UAT 服务均已关闭。实现未提交，保留在本地工作树；未合并、推送或部署。

主要复现命令（APP_ROOT 下执行；没有任何真实模型命令）：

```powershell
node node_modules/vitest/vitest.mjs run --reporter=dot --maxWorkers=8
npx tsc --noEmit --incremental false
npm run lint
npm test # 执行生产构建与构建后页面渲染测试
```

最新本地原始输出保存在 Git 忽略的 `work/research-hash-all-unit.log`、`work/research-hash-focused.log`、`work/research-hash-typecheck.log`、`work/research-hash-all-lint.log` 和 `work/research-hash-build-rendered.log`。修复前复现与新增拒绝测试的失败记录分别为 `work/research-hash-before.log`、`work/research-hash-guard-red.log`。此前 `work/materials-phase-1-*.log` 保留作历史记录。

