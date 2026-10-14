# Sites 托管数据备份与恢复：待发送说明

2026-09-21。本文是可供用户提交给 Sites 平台支持的草稿，尚未发送。

当前发布要求包含迁移前的数据备份和隔离恢复验证。现有可用 Sites 工具提供受限的数据库概览与行读取，但尚未确认支持托管 D1、R2 的一致备份和恢复。不能把源码备份、少量行读取或本地合成恢复当成生产数据恢复证据。

## 可提交的英文正文

Subject: Supported backup and restore procedure before a Sites database migration

I am preparing an update to my Sites application, Arc:
https://arc-precision-path.jiahe-xu.chatgpt.site/

The currently published application is version 10 and contains existing user data. Research remains disabled. The planned update includes new database migrations (0007–0011), including ALTER TABLE and an UPDATE. We have not applied these migrations to production.

Before proceeding, please confirm the supported procedure for:

1. Creating a consistent, restorable backup of the Sites-managed D1 database and R2 proof attachments, including any platform-managed authentication data, without exposing credentials in chat or logs.
2. Coordinating or temporarily stopping application writes while the backup is taken and restored.
3. Restoring the backup into an isolated test environment and verifying the application's records, attachment references and migration state before touching production.
4. Inspecting the actual production migration ledger through a supported mechanism.
5. Recovering the previous application and data state if the migration or post-release checks fail.

Are these operations available through the Sites interface or tools, or do they require platform assistance? Please provide the supported steps, prerequisites and any limitations. A source-code backup alone does not cover the data recovery requirement.

## 收到回复后需要落实的证据

- 平台支持的实际备份、隔离恢复及写入协调步骤。
- 实际备份身份/时间、数据库与对象覆盖范围，以及迁移账本；不把凭据或用户数据复制到聊天。
- 隔离恢复结果，包括记录关系、附件引用、所有者隔离和账本一致性。
- 确定具体回滚路径后，再执行生产迁移。

此项与用户自有 Cloudflare 账户中的空白演练资源分开。演练成功不能证明 Sites 托管生产数据可以恢复。
