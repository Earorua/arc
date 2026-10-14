# Arc v8 第十三次真实结果：正常结束，引用校验未通过

2026-09-12：用户对32k候选明确授权后执行，并回复“已运行”。本次许可已消耗；没有第十四次、Repair、自动重试或追加探测许可。助手只读取本次安全Summary并做离线合成调查，没有读取Key、环境凭据或原始响应。

## 实测证据

- 安全回执：`outputs/live-research/summary-2026-09-12T04-21-27-102Z.json`。
- SHA256：`5952C4217AD730131ECB0D5B83225CD1CD310640BFE3EEE48FD1E869604F6D67`。
- 分支：`codex/v8-openrouter-research-beta`；HEAD：`7090153b4acad7b12df6a7ee4d675b46c41871dc`。
- 原53项冻结指纹全部一致；追加本次Summary形成54项保护记录，见 `outputs/local-annotation-investigation-20260912/thirteenth-protected-hashes.json`。

| 项目 | 结果 |
| --- | --- |
| 模型/配置 | moonshotai/kimi-k3；low；32768输出；1200/1260/1320秒 |
| HTTP与请求数 | Key200、Research200；GET1+POST1；Repair0 |
| 完成状态/耗时 | stop；185257ms，约3分5秒 |
| 用量 | prompt8339、completion8076、total16415；details报告3次搜索 |
| 费用 | 可信USD0.134539，reservation settled；USD5为上限 |
| 拒绝位置 | providerResultDiagnostic.reason = annotations-invalid |
| 业务结果 | incomplete / failed / invalid-result；未Ready、未激活、未生成计划 |
| 本地保护 | owner误读拒绝、第二次Research拒绝、临时数据库销毁均true |

本次没有再次因length或应用超时拒绝。终端退出码未直接取得，不把安全回执代替终端正常退出证明。`researchCandidateDiagnostic:null`及`researchRunDiagnostic.quality:null`表示未到相应阶段；citationCount/skillCount为0不证明原响应没有引用或技能。

## 已确定与尚未知的原因

适配器在校验annotations之前已接受完整、非空且字节数在界限内的content字符串。这不证明它是合法JSON或符合课程契约；`candidateFromContent`在引用检查之后才运行。

现有`annotations-invalid`覆盖四个实际拒绝位置：annotations不是数组或超过256项；缺失标题时URL字符串不合格；缺失标题的URL无法安全生成hostname；最终URL/title字符串契约失败。缺失或null的annotations按空数组处理，非对象/未知type项会跳过，因此这些情况本身不能解释本次拒绝。

缺失title时的安全hostname兼容已经实现。null、空白、非字符串或过长的已提供title仍拒绝；不支持扁平url_citation。已有title时，URL公共HTTPS等安全检查还会在后续来源审计执行，不能把适配器通过称为来源安全通过。

根因尚不能归到某一具体字段，不能据此扩展title回退、接受扁平结构、删除坏引用或降低来源要求。

## 本轮离线调查

实际通过本地适配器注入14组纯合成响应，外部请求数0，证据 `outputs/local-annotation-investigation-20260912/synthetic-branch-observation.json`。10种不同失败全部只暴露相同annotations-invalid，包括非数组、257项、扁平结构、缺失嵌套对象、空/过长URL、null/空/过长title及缺失title的私网URL。4种适配器成功包括有效标题、安全省略标题、缺失annotations、null annotations；实验content为合成`{}`，这些成功绝不代表有效课程。

独立只读审查`thirteenth_annotation_audit`核对了上述分支及后续候选/来源/质量边界，没有认定具体兼容修复成立。它建议在未来本地候选中同时观测引用错误类别和独立候选结构检查，避免每轮付费只获得一个模糊错误。审查者没有修改源码或发请求。

官方[server tools说明](https://openrouter.ai/docs/guides/features/server-tools/web-search)说明搜索结果通过url_citation暴露；[web-search插件示例](https://openrouter.ai/docs/guides/features/plugins/web-search)展示嵌套url_citation。后者是文档示例，不是本次真实响应的复现证据，不据此推断实际字段值。

## 下一步与权限

具体本地方案见 `../superpowers/specs/2026-09-12-arc-v8-response-preflight-diagnostics-design.md`。这份新设计先审阅并等待用户批准，随后按既有子代理/TDD/每任务规格后质量审查实施；不复用第十三次付费许可。

当前只更新记录和设计，源代码及原1252项/双审/构建/默认离线演练成果保持，没有重跑这些检查。完整真实Research和首版公开发布仍未通过，没有生产/Git写入/Sites保存部署。旧等待用户运行的阻碍已解除；目标工具若仍显示blocked，是旧等待元数据，不能解释为本次未运行，也不能宣称完整目标完成。
