# arcmaps.net 接入当前公开版本

2026-09-22 用户明确要求：“先推进域名接入现有公开版本”。本项为独立授权的域名接入；完整 Research 发布目标仍 paused，回放补充设计仍暂缓。

## 最新验收：域名、证书和公开页面已生效

用户提供四条记录已添加的截图后，公开 DNS 查询确认两条 A 和两条 TXT 均与下表逐字相符。2026-09-22T06:11:26.846442Z 原生状态为 pending / active_redeploying / SSL active，此时新域名首次访问返回404；这是保留的传播期观察，不作为最终失败。之后 HTTPS 首页已返回200。

2026-09-22T06:17:28.992819Z 原生 refresh 最终返回 status=active、provider_status=active、ssl_status=active、last_error=null。没有新增验证记录要求。

实际 HTTP 验收（系统正常 TLS 验证，没有跳过证书检查）：

| URL/路径 | 结果 |
| --- | --- |
| https://arcmaps.net/ | 200；标题 Arc. — Learn only what moves you forward；12817字节；保留开发中横幅 |
| https://arcmaps.net/assets/index-Cls9PxQI.css | 200；text/css；61146字节 |
| https://arcmaps.net/sign-in | 200；HTML登录页；9196字节 |
| http://arcmaps.net/ | 302，Location=https://arcmaps.net/ |
| https://arcmaps.net/api/auth/providers | 200；providers=[google,github]，与原站相同 |
| 原 chatgpt.site 首页 | 200；相同标题、12817字节及开发中横幅 |

本轮完成的是域名绑定和公开页面可访问验收；没有进行真实账户 OAuth 登录或已登录数据读写验收。现有页面 canonical/og:url/分享图片/favicon 仍引用原 chatgpt.site 域名。新域名的完整登录回调与主域名 SEO 切换若后续推进，应单独核对已发布版本的认证设置及第三方回调白名单；不能凭本地未发布源码或 /sign-in 200 声称真实登录已通过。本轮没有更改这些配置或顺带发布新代码。

DNS 是用户在 Cloudflare 添加，代理未直接写入。Research 仍保持现有关闭版本；尚未配置 www.arcmaps.net，不应让用户访问带 www 地址。保留现有四条记录及 DNS only 设置，不重复创建绑定。以下为创建时的原始记录和操作说明。

## 当前证据

- 现有公开站点：https://arc-precision-path.jiahe-xu.chatgpt.site
- project_id：`appgprj_6a6678d3e3848191a352778c6db1e7b1`，来自 `.openai/hosting.json` 并经原生 get_site 核对；站点 active/public，latest_version_number=10。未保存或部署新版本。
- 2026-09-22T05:53:50.815197Z 原生 sites_add_custom_domain 成功创建 `arcmaps.net`。
- custom_domain_id：`appgdom_6ab217eed0988191b9b3eb08235c4259`；worker_name：`jiahe-xu--arc-precision-path`。
- 05:55:15.657907Z 原生 refresh：status=pending、provider_status=pending、ssl_status=pending_validation、last_error=null。这不是接入完成证明。
- 公开 DNS 初查仅返回 NS：`audrey.ns.cloudflare.com`、`curt.ns.cloudflare.com`；A/AAAA/MX 未返回答案。未读取登录后完整 DNS 记录清单，不能推断域名完全没有其他记录。
- 浏览器控制 getState 返回 apps=[]、browsers=[]、`Browsers: Error: nodeRepl.fetch request failed`；未操作 Cloudflare DNS。现有工具没有 Cloudflare DNS 写入接口，不读取 Wrangler OAuth 或要求用户提供 API Key 作为替代。

## 已由用户添加并公开核对的准确记录

打开 Cloudflare 中的 arcmaps.net → DNS → Records → Add record。TTL 保持 Auto；两条 A 使用 DNS only（灰云）。TXT 本身没有代理选项。下列验证值是需要公开的 DNS 验证内容，不是服务 API Key。

| 类型 | Name（相对 arcmaps.net） | 内容 |
| --- | --- | --- |
| A | @ | 162.159.143.30 |
| A | @ | 172.66.3.26 |
| TXT | _openai-site-verification | openai-site-verification=ls2HCncYAUwnTCPnq2O8WnFQDoI286ESJV_r-jbOnQU |
| TXT | _cf-custom-hostname | 69c8b04d-6bf3-4c09-a414-c02dc444e4be |

以上 IP 和 TXT 均逐字来自 Sites 原生响应。根域采用返回的 apex_proxy_ipv4_targets；响应另提供的 `custom-domains.chatgpt.site.` 是子域名 CNAME 目标，本次不要求用户另加根域 CNAME。没有创建 www 绑定。

刷新响应还含一条全部为 null 的 validation_records 占位；不将其当作可填写记录、不编造 _acme-challenge 内容。后续刷新若返回新的完整验证记录，再据实补充。

保留已有邮件和其他无关记录。若出现已有冲突的 @ A/AAAA/CNAME，先核对实际用途再调整，不批量删除 DNS。

## 后续复核与验收边界

1. DNS、平台激活、HTTPS首页/样式/登录页和HTTP跳转已实测通过；无需再让用户重复添加记录。
2. 后续状态查询使用上述准确 project_id/custom_domain_id，不重复 add。
3. 用户可在 https://arcmaps.net 打开当前公开版本；真实账户登录尚未验收，不宣称整个产品所有功能通过。
4. 如需修改 OAuth 来源、回调或 SEO 主域名，先核对当前已发布版本，不将工作树未发布的新 Research 代码顺带部署。

代理仅创建/刷新了域名绑定并完成公开只读验证，用户已添加 DNS；未修改网站代码、环境变量、生产 D1/R2、Research 开关、Workers 套餐或演练部署，也没有真实 Provider 请求。本次 Sites 域名接入没有等待用户自有 Workers Paid 升级完成。

参考：
- https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/
- https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/apex-proxying/setup/
- https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/getting-started/
