# Arc 源码入口

后续任务先读本文件，再确认当前分支和远端状态。项目介绍见 [English README](./README.md) / [中文 README](./README.zh-CN.md)。

## 从哪里开始

| 任务 | 使用的源码 | 状态 |
| --- | --- | --- |
| 网站功能、界面、修复和一般开发 | GitHub [`master`](https://github.com/Earorua/arc/tree/master) | 已合并英文界面、墨青配色、轻量加载、首页改进、Logo，以及主线已有的修复和双语说明 |
| 查看当前已发布网站的原始源码 | [英文发布源码固定提交](https://github.com/Earorua/arc/tree/43179bcd3d5d62441d3bf1f439541fcb8ab46a5f) | 应用提交 `19a81a500b5f87085f3aaddb27fc0e9b050fc48c`；[发布记录](./docs/verification/2026-11-08-english-only-interface.md) |
| 继续资料导入、JD / 简历分析和资料驱动规划 | [`codex/materials-replan-recovery-20261106`](https://github.com/Earorua/arc/tree/codex/materials-replan-recovery-20261106) | 11 月 22 日已在本地暂停。B2 已取得 30 份真实回执，质量未通过。原词保留与课程归属修复已保存，恢复时先修确认回读和双语词组覆盖 |
| 修改或导出品牌素材 | 本应用源码中的 [`docs/brand/`](./docs/brand/) 和 [`public/brand/`](./public/brand/) | 原始设计与当前主题导出分别标明；不要回拷旧网站组件 |

资料功能以[最新恢复记录](./docs/verification/2026-11-06-materials-grounding-pause.md)为入口。11 月 19 日已完成课程覆盖源码 `47b0e0a`、原生验收证据 `ef1b26b`，以及主线 `60e7cb6` 的本地整合。[本批验收](./docs/verification/2026-11-19-materials-course-native-integration.md)记录 386 文件／10,031 项 Vitest、291 项 Node、5 项页面和类型／Lint／构建通过。11 月 22 日真实模型采集和对账已完成，后续工作依据[实际质量报告](./docs/verification/materials-quality-next/modal-b2-result.md)。GitHub 同步状态以实际远端为准。

此前 `714ea9e` 的[暂停说明](https://github.com/Earorua/arc/blob/714ea9e54d87b91a1fee4883176d4f1dd06ecf63/docs/verification/2026-11-08-materials-practice-priorities-pause.md)是历史失败记录，保留用于追溯，不再是最新未完成修复。复用已通过证据，仅为实际变更或缺口补必要检查；旧参考摘要不重写，主线英文界面及已发布改进必须保留。真实模型、远程迁移和部署仍按 Gate 独立授权。

11 月 19 日后续已验收[采集衔接工具](./docs/verification/materials-quality-next/capture-result.md)和[当前评分适配](./docs/verification/materials-quality-next/adapter-result.md)。原有构造输入对照暴露的 69 项课程关系差异已完成[有限修复及独立复审](./docs/verification/materials-course-relations-20261119/README.md)，软件组件诊断为 146/146。[两条新增本地原生链路及旧 14 场景复用范围](./docs/verification/materials-course-relations-20261119/native-result.md)也已通过独立规格／质量审阅。本轮 B2 已使用全部 30 个付费名额，原始失败、独立参考和已验收原生记录保留。

## 开始任务前

```bash
git status --short --branch
git fetch --prune origin
git remote set-head origin -a
git log -1 --oneline origin/master
git log --oneline origin/master..HEAD
git log --oneline HEAD..origin/master
```

本次已修正本地 origin/HEAD 曾指向旧 Research 分支的问题；上述命令会按 GitHub 默认分支刷新这个快捷指针。

先判断正在处理网站主线还是资料功能，再选择对应分支。若当前目录落后或包含其他任务的未提交内容，保留原目录，在正确基线上创建任务分支；不要靠目录名、文件修改时间或历史文档中的“当前版本”决定来源。

## 分支与历史记录

GitHub 长期保留 `master` 和 `codex/materials-replan-recovery-20261106`。一般任务从最新 `master` 创建 `codex/` 分支，验证并合并后清理任务分支；资料功能继续使用上表的开发分支，验收前不并入主线。

2026-11-09 已清理 24 个远端旧分支和 40 个本地旧分支引用。已合并提交仍在主线或资料分支的历史中；三段较早的独立历史保存于 `archive/2026-11-09/*` 标签。完整对应关系和恢复方法见[分支整理记录](./docs/verification/2026-11-09-branch-cleanup.md)及[分支清单](./docs/source/2026-11-09-branches.json)。

历史工作目录保留文件，并固定在原提交上；`detached HEAD` 表示历史快照，不是最新开发分支。读取旧记录时使用其提交号或归档标签，不能依赖已删除的分支名。

## 本机目录对应关系

| 目录 | 用途 |
| --- | --- |
| `D:/CodexScratch/arc-source-readme-20261029` | 本次完整应用源码的整理和验证工作区；以实际分支和远端同步状态为准 |
| `C:/Users/XF/.codex/worktrees/arc-ink-teal/ui-warm-precision` | 11 月 8 日已发布英文界面的原始工作区，固定在发布记录提交 |
| `C:/Users/XF/.codex/worktrees/materials-replan-recovery/ui-warm-precision` | 当前资料功能工作区；2026-11-19 已恢复并进行本地主线整合 |
| 外层 `v8-openrouter-research-beta` | 较早的 Research 工作区；其中独立完成的 Logo 已汇总，不作为网站开发起点 |
| 外层目录下的 `.worktrees/ui-warm-precision` | 较早的资料功能工作区；实现已由最新资料检查点承接 |
| `arc-v8-release-integration`、`arc-v8-replay-ack-order` 和早期 `sites-v7*` | 历史来源与演练记录，不作为当前应用源码 |

旧目录保留原有改动以便追溯；其中的本地入口提示会引导到本文件。

## 源码统计与保存边界

机器可读的来源、提交、目录分类、文件数量和内容校验记录保存在 [`docs/source/2026-11-08-inventory.json`](./docs/source/2026-11-08-inventory.json)。它是本次整理时的快照；之后的最新内容以对应远端分支为准。完整性和验证说明见[源码整理记录](./docs/verification/2026-11-08-source-consolidation.md)。

应用源码、测试、数据库迁移、构建配置、可编辑品牌素材和必要文档纳入 Git。资料功能的开发源码与暂停证据完整保存在开发分支。依赖目录、构建缓存、真实凭据、数据库和私有上传不属于公开源码。

本次汇总只更新源码。网站实际部署仍应依据发布记录和实时状态核对；源码推送不会自动启用资料功能。
