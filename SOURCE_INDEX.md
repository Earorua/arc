# Arc 源码入口

后续任务先读本文件，再确认当前分支和远端状态。项目介绍见 [English README](./README.md) / [中文 README](./README.zh-CN.md)。

## 从哪里开始

| 任务 | 使用的源码 | 状态 |
| --- | --- | --- |
| 网站功能、界面、修复和一般开发 | GitHub `master`；本次汇总合并前使用 `codex/source-consolidation-20261108` | 汇总英文界面、墨青配色、轻量加载、首页改进、Logo，以及主线已有的修复和双语说明 |
| 查看当前已发布网站的原始源码 | [`codex/english-interface-20261108`](https://github.com/Earorua/arc/tree/codex/english-interface-20261108) | 应用提交 `19a81a500b5f87085f3aaddb27fc0e9b050fc48c`；[发布记录](./docs/verification/2026-11-08-english-only-interface.md) |
| 继续资料导入、JD / 简历分析和资料驱动规划 | [`codex/materials-replan-recovery-20261106`](https://github.com/Earorua/arc/tree/codex/materials-replan-recovery-20261106) | 保存到 `714ea9e54d87b91a1fee4883176d4f1dd06ecf63`，暂停开发、尚未验收，不属于已发布功能 |
| 修改或导出品牌素材 | 本应用源码中的 [`docs/brand/`](./docs/brand/) 和 [`public/brand/`](./public/brand/) | 原始设计与当前主题导出分别标明；不要回拷旧网站组件 |

资料功能的[最新暂停说明](https://github.com/Earorua/arc/blob/714ea9e54d87b91a1fee4883176d4f1dd06ecf63/docs/verification/2026-11-08-materials-practice-priorities-pause.md)记录了真实进度：最近一轮有 2 项失败、257 项通过，之后的最后修改尚未复测。该分支包含较早的资料开发提交，保存它不表示验收通过。恢复时应先复测和审阅，再按实际任务整合网站主线的新界面，不能以其旧界面覆盖主线。

## 开始任务前

```bash
git status --short --branch
git fetch origin
git remote set-head origin -a
git log -1 --oneline origin/master
git log --oneline origin/master..HEAD
git log --oneline HEAD..origin/master
```

本次已修正本地 origin/HEAD 曾指向旧 Research 分支的问题；上述命令会按 GitHub 默认分支刷新这个快捷指针。

先判断正在处理网站主线还是资料功能，再选择对应分支。若当前目录落后或包含其他任务的未提交内容，保留原目录，在正确基线上创建任务分支；不要靠目录名、文件修改时间或历史文档中的“当前版本”决定来源。

## 本机目录对应关系

| 目录 | 用途 |
| --- | --- |
| `D:/CodexScratch/arc-source-readme-20261029` | 本次完整应用源码的整理和验证工作区；以实际分支和远端同步状态为准 |
| `C:/Users/XF/.codex/worktrees/arc-ink-teal/ui-warm-precision` | 11 月 8 日已发布英文界面的原始工作区 |
| `C:/Users/XF/.codex/worktrees/materials-replan-recovery/ui-warm-precision` | 最新资料功能的暂停检查点 |
| 外层 `v8-openrouter-research-beta` | 较早的 Research 工作区；其中独立完成的 Logo 已汇总，不作为网站开发起点 |
| 外层目录下的 `.worktrees/ui-warm-precision` | 较早的资料功能工作区；实现已由最新资料检查点承接 |
| `arc-v8-release-integration`、`arc-v8-replay-ack-order` 和早期 `sites-v7*` | 历史来源与演练记录，不作为当前应用源码 |

旧目录保留原有改动以便追溯；其中的本地入口提示会引导到本文件。

## 源码统计与保存边界

机器可读的来源、提交、目录分类、文件数量和内容校验记录保存在 [`docs/source/2026-11-08-inventory.json`](./docs/source/2026-11-08-inventory.json)。它是本次整理时的快照；之后的最新内容以对应远端分支为准。完整性和验证说明见[源码整理记录](./docs/verification/2026-11-08-source-consolidation.md)。

应用源码、测试、数据库迁移、构建配置、可编辑品牌素材和必要文档纳入 Git。资料功能的开发源码与暂停证据完整保存在开发分支。依赖目录、构建缓存、真实凭据、数据库和私有上传不属于公开源码。

本次汇总只更新源码。网站实际部署仍应依据发布记录和实时状态核对；源码推送不会自动启用资料功能。
