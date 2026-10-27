# Formal domain preparation: observed state, no mutation

The authenticated dashboard currently shows the original four records, no www, zero Single Redirects, zero Page Rules and no Worker routes. `observed.json` records the displayed facts. This is a UI observation, not a full API backup or proof of no account-level Bulk Redirects. Refresh the relevant state at actual cutover; preserve the existing four records and exact identifiers before changing anything.

After Task15 and final data reconciliation, use the existing r163 cutover sequence and r176 Site/Executor configurations. The owned apex must be attached and login checked before public Research is enabled. Preserve old Sites data and its maintenance/export path.

For www, prepare one proxied CNAME `www.arcmaps.net` → `arcmaps.net` with Auto TTL, plus one Single Redirect matching only `http.host eq "www.arcmaps.net"`. Dynamic target: `concat("https://arcmaps.net", http.request.uri.path)`, status301, preserve query string enabled. The exact host match handles HTTP and HTTPS and cannot redirect unrelated subdomains. Preserve any rules that appear between this observation and cutover; do not replace an entire unobserved ruleset.

After the actual change, verify `https://www.arcmaps.net/`, `/today`, and a path with a benign query; their Location must retain path/query on the exact HTTPS apex. Also check `http://www.arcmaps.net/`. Verify the apex itself does not loop and that the generated login callbacks remain on the apex. Save actual DNS/rule identifiers so rollback removes only the introduced www entries. Public writes still require the forward-delta rollback discipline in r163.

Current official references: [Single Redirect settings](https://developers.cloudflare.com/rules/url-forwarding/single-redirects/settings/) and [WWW-to-root example](https://developers.cloudflare.com/rules/url-forwarding/examples/redirect-www-to-root/), checked2026-10-26. The prepared exact-host expression is deliberately narrower than the example's generic wildcard.

No DNS, redirect, route, subscription, cohort or model mutation occurred here.
