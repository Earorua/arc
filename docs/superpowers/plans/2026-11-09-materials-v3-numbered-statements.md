# v3 完整编号条目引用修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. 每项先 RED，再最小实现，经独立规格与质量审阅后保存；最后统一本地整体验收。

**Goal:** 已明确选择 v3 的资料提取与服务端验证能接受含 `1. ` 或 `１２. ` 前缀的完整原文条目，同时继续拒绝缺少限定语的片段。

**Architecture:** 复用现有句子边界和原文 UTF-16 坐标，仅给 v3 增加“编号前缀到同一完整正文末尾”的边界。正文边界仍由现有规则证明；不连接相邻句子，不改 v1/v2 的边界、策略、提示词或历史记录。

**Tech Stack:** TypeScript、Vitest、现有 DocumentsClient/HTTP/runtime、SQLite 与本地 workerd/D1/R2。所有 Node 命令经现有离线包装器。

## 前提与范围

- 本计划从已定稿 v2.1 对完整原文引用和版本兼容的要求继续，属于已授权的离线缺陷修复。先完成上一批[原文主题保留接入](2026-11-08-materials-mention-projection.md)整体验收、归档与本地保存，再修改源码。
- 已有独立质量观察 `mention-projection-provider-quality-20261109-numeric-baseline-03-results.json` 对旧 v2、当前 v2/v3 留存 54 项观察及 36 项相同比较。完整编号引用被拒绝、正文引用和普通项目符号引用可接受；这一缺口不属于上一批新增回归。
- 假设根因：`Intl.Segmenter` 把数字后的句点当成独立句末；现有 `listPrefix` 只能在已经分割的片段内增加正文起点，不能把编号重新附着到后续完整正文。Task 1 必须用实际边界和 provider 输出再验证这一因果，未证实前不改代码。
- 不新增模型调用，不修改远程配置，不启用 v3，不迁移、不部署或推送。不得修改旧 26 份参考、课程依赖、历史观察或 Research 保护摘要。
- 自然中文“我在指导下清洗数据。”的等级建议另作下一批修复；本计划不扩大能力谓词。

## Task 1：边界根因与仅 v3 的完整编号接口

**Files:**
- Modify: `worker/document-executor/source-statements.ts`
- Modify: `worker/document-executor/source-review-evidence.ts`
- Create: `tests/server/material-numbered-statements.test.ts`

- [x] 冻结本批起点源码身份。只读保存旧 `statementBoundaries`／`groundedStatementBoundaries` 的全部坐标、每个坐标对应的原文片段及 v1/v2/v3 provider 输出，写入新的 `numbered-statements-*` 忽略目录工件，不覆盖上述历史结果。
- [x] 在实际现有函数上验证 `1. I practiced SQL with a mentor.` 的编号与正文边界分离，并保留正文／`- ` 项目符号正常对照。随后先添加新接口的失败测试：

```ts
const text = "1. I practiced SQL with a mentor.";
expect(sourceMentionStatementBoundaries(text).get(0)).toBe(text.length);
expect(sourceMentionStatementBoundaries(text).get(3)).toBe(text.length);
expect(groundedStatementBoundaries(text).get(0)).not.toBe(text.length);
```

- [x] 新接口 `sourceMentionStatementBoundaries(text: string)` 位于 `source-review-evidence.ts`，复用 `groundedStatementBoundaries(text)`；编号识别复用 `source-statements.ts` 的现有 `listPrefix`。新增 `completeNumberedStatementBoundaries(text, baseBounds)` 返回复制后的 Map，不能修改调用方 Map。核心行为如下，实际类型沿用仓库格式：

```ts
export function completeNumberedStatementBoundaries(
  text: string, baseBounds: ReadonlyMap<number, number>,
) {
  const bounds = new Map(baseBounds);
  for (const match of text.matchAll(/[^\r\n]+/gu)) {
    const line = match[0], trimmed = line.trimStart();
    const start = match.index + line.length - trimmed.length;
    // A bare list ordinal is not a fact. Keep this tightening exclusive to v3.
    if (/^[\d０-９]{1,3}\.\s*$/u.test(trimmed)) {
      bounds.delete(start);
      continue;
    }
    const prefix = listPrefix.exec(trimmed);
    if (!prefix || !/^[\d０-９]{1,3}\./u.test(prefix[0])) continue;
    const bodyStart = start + prefix[0].length;
    const end = baseBounds.get(bodyStart);
    if (end !== undefined) bounds.set(start, end);
  }
  return bounds;
}

export function sourceMentionStatementBoundaries(text: string) {
  return completeNumberedStatementBoundaries(text, groundedStatementBoundaries(text));
}
```

- [x] 验证 ASCII／全角数字、缩进、CRLF、相邻多条、软换行限定、中文正文、技术名内部句点、emoji 前置段落的原始 UTF-16 起止。完整前缀与正文两种引用均须定位同一正文终点；编号单独引用不可成为完整事实。
- [x] 反例覆盖小数、无空格数字技术名、超过既有三位数字范围、仅编号空行、句中数字、跨两条列表的引用和截掉后置否定的半句。不要添加全角句点或新列表语法；若发现不同根因，先保存反例再调整设计。
- [x] 运行新测试及现有源引用相关测试，完成独立规格→质量审阅并冻结本任务文件。旧函数的全量坐标必须与本批起点相同；单独新接口通过不代表生产路径接通。

Task 1 已保存为 `e48e5eb`：37 项边界回归及 794 项相关测试、类型／Lint 通过，80 项旧坐标不变；独立规格 18 项观察和质量 12 项检查通过。规格 raw probe 仍记 exit 1：两个全工作树路径断言遇到根任务的计划文档更新，三份源码冻结及 33 项证据摘要均匹配；审阅已明确作用域后给出 PASS，原失败不重写。Task 2 尚未验收。

## Task 2：provider、服务端与实际持久化接入

**Files:**
- Modify: `worker/document-executor/source-span-extraction.ts`
- Modify: `app/server/documents/extraction-validator.ts`
- Modify after reproduced persistence RED: `app/lib/materials/skill-labels.ts` 及对应等级保留测试。
- Modify: `tests/server/document-source-span-provider.test.ts`
- Modify: `tests/server/document-extraction.test.ts`
- Modify: `tests/server/material-mention-review-flow.test.ts`
- Reuse unchanged: `tests/helpers/material-mention-review-fixture.ts`

实际 RED 已证明还需接通编辑保留路径：只切换 provider／site 边界后，160 项 provider 和 32 项 extraction 通过，但 HTTP 保存把初始 guided 提示清空；ReviewService 调用的保留函数仍直接评估含 `1. ` 的整条事实。该缺口在本 Task 2 内修复：仅对确切 v3、已证明整段为一个完整编号事实时，取相同终点的正文用于能力证据判断。保留实际事实、原引用和所有坐标，不移除任意归属、标题或引用，不改变 v2／默认个人语法。辅助模块必须纯函数且可供浏览器安全打包；多句、否定、他人、未来、引述及旧版本均加对照。原 RED `numbered-statements-flow-20261109-red-a`／中间 `gate-a` 保留。

- [x] 先在真实 provider 解码助手写 RED。新 policy 的 source-spans-v3 回复引用完整编号行，应得到完整文本、完整来源与原文主题；同一 v2 输入继续保留旧拒绝结果。不得用直接构造已通过候选替代 provider 解码。
- [x] provider 仅在 `sourceMentions` 分支调用新边界：

```ts
const bounds = sourceMentions ? sourceMentionStatementBoundaries(sources.text)
  : groundedTerms ? groundedStatementBoundaries(sources.text)
  : statementBoundaries(sources.text);
```

- [x] `extraction-validator.ts` 的 v3 分支使用同一新边界。服务端仍独立检查候选正文等于完整引用、原文身份、范围和引用上下文；不得依赖 provider 已检查的假设。其它版本没有新增重投影。
- [x] 用完整编号和正文引用分别验证能力提示、JD 要求级别及提醒来自同一完整正文；重复提名同一条的两种引用仍按现有去重规则拒绝。来源必须保留实际送达的完整引用，不裁剪并重写为正文。
- [x] 正面例覆盖本人指导 SQL、必备 SQL 的 JD、补充资料；反例覆盖他人、未来、后置否定、引述示例和未提名主题。编号可接受不能让任何能力或优先级绕过各自证据检查。
- [x] 通过实际 DocumentsClient→HTTP→runtime→ReviewService 验证完整编号事实保存、重读、确认、选择及上下文。删除词／空词仍不恢复；客户端伪造标记、过期来源、所有权错误、重分类补词仍被拒绝。保留合法单一主 JD 和原配额。
- [x] 专项通过后，独立规格→质量审阅；保存实际差异和本地提交。新旧 policy、marker、schemaVersion 和 prompt 均不改名；这只修复尚未启用 v3 的完整条目实现。

Task 2 已保存为 `6b49bce`：624 项专项、类型／Lint／浏览器纯依赖检查通过；独立规格 59 项（另有 269 项被名称过滤、未计通过）和质量 25 项检查 PASS。11 项编号原生场景通过，中间 16 例整体仍 exit 1，仅中文指导提示待修。实际 HTTP 夹具按既有保存契约使用 LF 文本，纯 provider 仍检查原始 CRLF 坐标；测试前提错误与修正均保留。完整兼容、原生对照和全仓留至 Task 3 的最终统一验收。

## Task 3：本地最终验收与后续入口

最新执行安排见[离线收尾计划](2026-11-09-materials-offline-closeout.md)：编号专项、两阶段审阅、原生及旧行为检查先完成；本项完整全仓检查与中文指导、采用重置修复合并到最终源码上统一执行，避免对中间源码重复全仓。所有要求仍保留，最终全仓前不宣布整批收尾通过。

- [x] 用上一批固定的 170 项旧行为、6 份真实保存的旧记录只读重载及 25 场景完整链路做兼容检查。新增编号场景另存，不能重写冻结基准或只比较摘录字段。
- [x] 对新增合法完整编号、否定／他人、删除补词、JD 要求及引用拒绝，用本地 workerd/D1/R2 与 Node 对照完整返回、原文坐标、持久行及审计；合成模型回复必须明确标注，不能称为真实 Kimi 质量验收。
- [x] 新建逐文件源码副本，完成全仓 Vitest 分组、独占附加 Node、类型／Lint、构建／页面、旧参考及课程依赖完整性检查。附加 Node 不与长验证并行，超时值及断言保持。
- [x] 最终集成审阅后归档 RED/GREEN、脚本、源码身份和审阅，更新恢复入口与发布进度并本地保存。按用户最新停止边界，中文指导与能力采用／重置合并在同批完成；随后推送资料分支并暂停目标，不开启下一批工作。

所有运行标签在使用前检查不存在。命令形状：

```powershell
node work/grounded-verification/run.mjs numbered-statements-boundary-red-20261109-a node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/server/material-numbered-statements.test.ts
node work/grounded-verification/run.mjs numbered-statements-provider-green-20261109-a node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/server/document-source-span-provider.test.ts tests/server/document-extraction.test.ts tests/server/material-mention-review-flow.test.ts
```

通过标准：新 v3 完整编号例通过，旧版本完整观察不变，完整引用与来源校验不放宽，无未关闭的审阅发现；全仓／原生／类型／Lint／构建证据齐全。仍不替代完整 14 场景规划协议、课程新参考绑定、真实模型质量或发布 Gate。

## 2026-11-09 只读准备与设计修正

当前源码 `2107109f4453c5d5bb19c9bd7609915b77ef9f6a` 的一次小型纯函数／解码诊断确认了编号被分割的根因。34 个输入、168 项观察中，112 项旧 v1/v2 对照保持一致；隔离虚拟补丁验证了 provider 与 site 必须同时使用新边界。仅替换 provider 时，实际 site 仍拒绝完整编号，不能算作接入完成。

诊断同时证明初稿 helper 留下了孤立 `1.`：`text="1. \n"`、`quote="1."` 会被实际和虚拟 v3 两端接受。这与本计划的空编号拒绝要求冲突，因此上面的设计显式在 v3 删除完整独占行的裸编号边界，必须先对 ASCII／全角、缩进、结尾换行，以及小数／有效正文控制做 RED，再实现；旧版本原结果仍保留。编号和正文分处不同物理行的样式不在本批新增支持范围，不能把编号单独采用成事实。

另一个既有独立限制是前导点技术名：`1. .NET is required.` 的正文缺少完整 `.NET` 基础边界，拟议 helper 不能证明它完整，仍拒绝。已通过的 `Node.js` 是内部句点，不能把它当成 `.NET` 已支持的证据。该限制单独保留，不隐式扩大本批语法修改。

原始结果位于 `work/grounded-verification/numbered-statements-diagnosis-20261109-02-results.json`；修正后的离线探针退出 0、耗时 295 ms、出站拦截 0。首轮 `01` 因 esbuild 不接受带 `/u` 的解析过滤器而在执行前失败，原文件／日志保留，`02` 只修正忽略目录里的诊断过滤器。这些都是准备证据，未修改产品源码，不代表产品修复或整体验收。
