# 分支整理与本地同步 — 2026-11-09

GitHub 保留两个长期分支：`master` 用于当前完整应用，`codex/materials-replan-recovery-20261106` 保存尚未验收的资料功能。完整的分支名、原提交及保留位置见[机器可读清单](../source/2026-11-09-branches.json)；后续任务从 [SOURCE_INDEX.md](../../SOURCE_INDEX.md) 选择源码。

## 合并与保留判断

清理基于实际提交祖先关系及现有源码整理证据，不按分支名称或日期直接判断。检查时没有未关闭的 Pull Request。

| 分支类别 | 判断与处理 |
| --- | --- |
| 网站功能、英文界面、墨青配色、加载改进、双语说明和源码汇总 | 已包含在 `master` 的 `bcd979150eb5269019688450dd6a8e2ea1ce199f` 中，无需重复合并。删除已完成的任务分支。 |
| 早期资料开发、暂停点与恢复分支 | 已包含在最新资料分支 `714ea9e54d87b91a1fee4883176d4f1dd06ecf63` 中。删除旧分支，保留最新分支。 |
| 最新资料功能 | 保持暂停、未验收。原记录为 2 项失败、257 项通过，之后的修改未复测，因此未并入应用主线。 |
| 早期基础、Sites 和双智能体历史 | 属于较早的重建、导入前历史，不应把旧应用文件覆盖到主线。使用三个归档标签完整保留原提交链，再删除旧分支引用。 |

已完成的网站改动由 [PR #16](https://github.com/Earorua/arc/pull/16) 承接，源码完整性说明见[前一日整理记录](2026-11-08-source-consolidation.md)。本次没有改动应用运行代码。

## 清理结果

| 范围 | 清理前 | 删除 | 清理后 |
| --- | ---: | ---: | ---: |
| GitHub 分支 | 26 | 24 | 2 |
| 三个本地 Git 仓库的分支引用 | 43 | 40 | 4，包含为独立旧仓库补建的 1 个 `master` |

本地引用按仓库计数，相同名称在不同仓库中各计一次。当前应用仓库保留 `master` 和最新资料分支；另两个仓库各保留同步到远端的 `master`。整理文档使用的临时分支在合并后删除，不作为长期分支。

远端删除使用原提交 SHA 校验与原子推送，避免删除检查期间被更新的分支。所有删除的分支头均可从保留分支或归档标签访问。

## 历史归档

| GitHub 标签 | 保留的历史 |
| --- | --- |
| [`archive/2026-11-09/pre-rebase-foundation`](https://github.com/Earorua/arc/tree/archive/2026-11-09/pre-rebase-foundation) | `457ecb5e444c8c17870bf20332a84e148f268284`，含原体验基础与重建前开发历史 |
| [`archive/2026-11-09/dual-learning-agents`](https://github.com/Earorua/arc/tree/archive/2026-11-09/dual-learning-agents) | `3470ec7ff5ffbf59dc013e35a67c15389550c9a4`，原双智能体发布历史 |
| [`archive/2026-11-09/sites-v72-source`](https://github.com/Earorua/arc/tree/archive/2026-11-09/sites-v72-source) | `7ca5b530dfc58f3cbc700b44a7a881a9bd661209`，含账号关联及 Sites v7、v7.1、v7.2 的原始历史 |

三个标签覆盖七个未被当前分支直接承接的本地旧分支头。原有 `sites-v6` 标签保留。标签用于追溯，不代表当前应用或待合并功能。

需要查阅时先运行 `git fetch --prune --tags origin`，再使用 `git show <提交号>`。若确需恢复某条旧分支，可从清单中的完整 SHA 创建新分支：`git branch codex/recovered-task <提交号>`。

## 本地文件与验证

- 三个仓库的 `master` 与 `origin/master` 对齐，远端跟踪引用已清理，`origin/HEAD` 指向 `origin/master`。最新资料分支与远端保持相同提交。
- 12 个原先挂在旧分支上的工作目录改为在原提交上 detached HEAD；原本已固定提交的历史目录继续保留。没有删除工作目录。
- 四个含未提交改动的目录共 1,101 个文件。前后 Git 状态与逐文件 SHA-256 一致，资料、Research、演练和品牌改动均保留。
- 删除前为三个本地仓库分别建立完整 Git bundle，并通过 `git bundle verify`。本地备份及操作回执位于 `D:/CodexTemp/arc-branch-cleanup-20261109`；bundle 保存提交与引用，未提交文件仍保留在原工作目录中。
- 重新检查了全部被删除分支头的可达性，并回读 GitHub 剩余分支和归档标签。源码入口、操作索引与恢复检查点改用保留分支或固定提交链接。

前一日的文件清单和验证报告继续作为历史快照保存，不因分支删除重写当时的事实。没有部署网站、恢复暂停的资料任务或改写原有提交。
