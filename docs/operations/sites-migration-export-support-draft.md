# Sites export assistance for independent Arc hosting

2026-09-22. This is a draft for the user to review and submit; no support message has been sent. It is separate from the Cloudflare Workers Paid billing issue and from the earlier Research database-upgrade request.

## Subject

Supported complete data export and authentication migration from Sites to my own Cloudflare account

## Message

I own Arc, currently published at https://arc-precision-path.jiahe-xu.chatgpt.site/ and connected to https://arcmaps.net/. I am preparing a migration of the current public version 10 to my own Cloudflare account, with Research still disabled. The existing Site and its data must remain available until the replacement is verified; I am not requesting Site deletion or a data reset.

Please advise the supported procedure for:

1. Obtaining a complete, consistent export of the managed D1 database: schema, indexes, triggers, all 41 application tables and rows, and actual schema-migration state. Bounded table previews are insufficient for a restorable migration.
2. Exporting every R2 proof attachment, preserving object keys, bytes, HTTP/custom metadata and a verifiable inventory, including objects not currently referenced by a row.
3. Coordinating a temporary write freeze across both existing hostnames and in-flight requests so D1 records and R2 attachments form a consistent snapshot. The app has write-capable GET and OAuth callbacks as well as POST routes.
4. Transferring backup files through a protected mechanism without placing user data, authentication material or secrets in chat or support attachments, and restoring them into an isolated destination for verification.
5. Identifying whether the original Google/GitHub OAuth applications are owner-managed or provisioned by Sites, and the supported way to configure those integrations on an independently hosted domain.
6. Preserving user and provider-account identities when the original BETTER_AUTH_SECRET is not in my records. Can it be transferred through a secure supported channel? If not, please confirm any platform requirements for invalidating old sessions and requiring fresh provider login without losing application ownership or data. Please do not send secret values in a support reply.
7. Retrieving the exact source or a verifiable source archive associated with public version 10 (source commit 2b0ed9376e8693250277c194c297076ff975a257), and keeping the old deployment available as a fallback until migration acceptance.

Please distinguish supported self-service steps from operations requiring platform assistance. No production changes should be made merely by opening this inquiry.

## Required local evidence before cutover

- Confirmed export scope and consistent snapshot identity/time.
- Complete encrypted transfer, manifest and isolated restore verification; no raw backup content in Git or routine logs.
- Stable existing user/provider/owner mapping, actual OAuth login and cross-owner isolation.
- Documented old-origin browser-state handling and rollback rules after the new site accepts writes.

The independently created Cloudflare D1/R2 resources contain no source user data at the time of this draft. Their existence and a successful empty-site deployment do not establish these transfer guarantees.
