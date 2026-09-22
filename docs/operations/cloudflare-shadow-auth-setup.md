# 独立测试站登录配置

2026-09-22。只配置新测试站，不替换旧站密钥、不删除旧回调、不切换 arcmaps.net。用户已确认能进入原 Google/GitHub 应用，且两份 Client Secret 均有保存。不要把任何秘密值发到聊天或写入项目文件。

## 当前目标

Cloudflare 账户：54eaadb89014252836694203c1e22546。

Worker：`arc-v8-migration-shadow-20260922`。

测试站：https://arc-v8-migration-shadow-20260922.23711031.workers.dev/

这里使用独立新库。后续测试登录可能建立临时验证账号，不能将新生成的用户ID当作原账号迁移成功。最终恢复应使用独立、经验证的源数据副本，不把测试站账号与原站账号按邮箱盲目合并。旧站全部账户、数据、附件仍保留在 Sites。

## 第一步：保存新的测试站登录密钥

在 Bitwarden 新建一条名为 `Arc Cloudflare shadow BETTER_AUTH_SECRET 20260922` 的记录，用密码生成器生成并保存一段64字符随机值。这是本测试站的应用登录密钥，不是 OpenRouter Key，也不是之前的演练密钥A/B/C。不要复用它们。

此时只需回复“测试站登录密钥已保存”，不用发送值。原BETTER_AUTH_SECRET未找到的问题仍按单独的账户迁移方案处理；新随机值不能解密原站已有OAuth令牌。

## 第二步：在指定 Worker 配置

Cloudflare → Workers & Pages → `arc-v8-migration-shadow-20260922` → Settings → Variables and Secrets / Runtime variables and secrets。

本次以下五项都选择 **Secret**，再通过Dashboard保存并部署这些配置到这个测试Worker。这里仅指Dashboard应用Secret配置；随后直接测试当前代码，代理不会自动执行Wrangler代码重部署。Client ID本身不是秘密；统一使用Secret类型可避免把认证配置放进普通版本控制变量。值直接从个人密码库/开发者后台粘贴到Cloudflare，不经过聊天。

| 名称 | 填入内容 |
| --- | --- |
| BETTER_AUTH_SECRET | 第一步新保存的64字符随机值 |
| GOOGLE_CLIENT_ID | 原Google网页OAuth客户端的Client ID |
| GOOGLE_CLIENT_SECRET | 已保存的对应Google Client Secret |
| GITHUB_CLIENT_ID | 原GitHub Arc OAuth应用的Client ID |
| GITHUB_CLIENT_SECRET | 已保存的对应GitHub Client Secret |

保留当前BETTER_AUTH_URL及两个false开关。不要给smoke演练Worker或旧Sites应用添加这些值。配置完成后只核对名称、Secret类型及新部署状态，代理不读取值。

## 第三步：增加精确回调地址

Google网页OAuth客户端的 **Authorized redirect URIs / 已获授权的重定向URI** 新增：

```text
https://arc-v8-migration-shadow-20260922.23711031.workers.dev/api/auth/callback/google
```

GitHub Arc OAuth应用的 **Authorization callback URLs** 使用 **Add callback URL / Add redirect URI** 新增：

```text
https://arc-v8-migration-shadow-20260922.23711031.workers.dev/api/auth/callback/github
```

两处都保留原来的旧站地址。新增地址不启用wildcard matching；不改变现有token过期、权限、应用发布状态或原有回调顺序。GitHub官方2026-08-14更新已支持OAuth应用最多10个回调URL，因此无需为了两个环境重建原应用。若界面没有新增按钮或拒绝workers.dev地址，先提供错误文字，不覆盖原地址。

## 第四步：验收边界

配置和回调保存后，先核对Dashboard产生的部署版本、五项Secret名称与类型、原资源绑定和Research关闭状态，直接验收当前代码，不追加Wrangler代码部署。再由用户分别使用Google/GitHub完成测试站登录。代理不输入用户密码或读取认证令牌。

此阶段只证明独立托管认证可运行。原账户ID/数据保留、两owner隔离、源数据完整恢复仍需后续专项验收；测试站显示空工作区不能视为原数据丢失或迁移完成。旧站继续可用。

## 后续代码部署的密钥保留检查

本次先在已有部署上配置和测试登录，不需要重传代码。添加Secret后，不直接复用最初没有认证配置的构建产物进行代码部署。

锁定Wrangler4.92.0源码中，普通deploy的keepSecrets取决于keepVars或secretsFile；单独配置secrets.required时，addRequiredSecretsInheritBindings会为缺失于本地bindings的指定名称建立inherit绑定。当前构建尚未声明这五个名称，因此不能假定后续普通代码deploy必定继承Dashboard配置。

下一次代码部署前，在构建配置和产物预检中以测试驱动方式显式声明这五项必需Secret名称，并完成独立规格及质量审查；核对原生远端绑定名称/类型和四项普通变量，验证缺失Secret时拒绝部署。该小项尚未实施，不阻碍在现有版本上进行Dashboard配置。不要用包含真实值的本地文件，也不要通过keep-vars无差别保留未知运行开关。完成这些检查后才部署代码，并再次核对五项Secret名称仍在。

独立质量/安全复核：当前保存新秘密以及Dashboard配置后测试既有代码的流程PASS；普通代码重部署的继承保证尚未就绪。锁定源码依据为cli.js:299192（按名称inherit）、308314（普通deploy的keepSecrets）、162846（keep_bindings）及308424/308481（bindings_inherit=strict）。版本上传路径的keepSecrets:true不能用于推断普通deploy。离线审查没有证明服务端必定删除，只确认不能保证自动保留。审查提出的Dashboard部署与代码部署区分已补充到第二、四步。

官方依据（2026-09-22查阅）：
- https://developers.cloudflare.com/workers/configuration/secrets/
- https://github.blog/changelog/2026-08-14-multiple-redirect-uris-and-token-refresh-for-oauth-apps/
- https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app
- https://developers.google.com/identity/protocols/oauth2/web-server
