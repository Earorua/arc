# Arc Cloudflare Migration Stage A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Execute one implementation task, then independent specification review, then a different quality/security review. The user's existing workflow choice and complete-migration authorization apply; do not re-ask.

**Goal:** Produce and verify a standalone build of the published Research-closed Arc baseline, with explicit deployment inventory and no production cutover.

**Architecture:** Build from local baseline cd2b9abe in the new codex/v8-cloudflare-migration worktree. Replace Sites-only binding/packaging with a standalone local configuration and a validated non-secret target inventory. Continue using existing vinext/Cloudflare Vite plugin, SSR worker, DB/PROOF_ASSETS, auth boundary and application behavior. No deployment or export is hidden inside build.

**Tech Stack:** Existing locked TypeScript, React19, vinext0.0.50, Vite8.1.5, Cloudflare plugin1.37.1, Wrangler4.92.0, Vitest/node:test. No dependency updates.

## Accepted constraints

User approved the source/configuration → isolated validation → preserve data → auth → cutover path, then explicitly asked to begin. No new design decision authorizes resetting data, migrating the unreviewed dirty Research candidate, changing the old site's environment, adding model calls or buying add-ons. Written design is docs/superpowers/specs/2026-09-22-arc-cloudflare-migration-design.md.

## Baseline evidence

- [x] Root created isolated branch/worktree from exact local baseline; initial git status clean.
- [x] npm ci completed with original lockfile after offline cache miss; installed810packages without updating dependencies.
- [x] npm test completed: all five build phases and4rendered/client-boundary tests passed, exit0.
- [x] Native Wrangler whoami succeeded using previously authorized localHTTPproxy; exact account54eaadb89014252836694203c1e22546 and OAuth loggedIn=true. Direct attempt fetch failed, retained as connectivity observation; no secret values read.
- [x] Native Sites version10 and41table metadata checked; no source D1/R2 mutation or user-row extraction.

## Task A1: Standalone configuration and production-origin metadata

**Files:**
- Create build/cloudflare-target.ts (strict target inventory parser/config builder; no CLI/no network).
- Create cloudflare.local.json (explicit non-secret local binding inventory; not a remote target).
- Modify vite.config.ts (use standalone config; preserve existing rsc/ssr and client-safe-auth plugin; remove Sites plugin and .openai import).
- Modify app/layout.tsx canonical/metadata origin to https://arcmaps.net.
- Create tests/build/cloudflare-target.test.ts; modify tests/rendered-html.test.mjs expected origin.
- Create scripts/check-cloudflare-build.mjs (read-only preflight of generated artifact, no deploy).

- [x] **RED:** Use real exported config builder/parser under Vitest. Importing a missing module is an initial harness failure only: verify subsequent assertions expose missing contract behavior. At minimum cover Research flagsfalse, absent/mismatched required resources, wrong account, Sites dummy database ID in remote inventory, non-HTTPS or off-allowlist runtimeorigin, unexpected keys includingsecret-like keys, execution flags/routes/triggers that could attach production DNS or run background work, and local inventory rejected for remote preflight. Cases should verify behavior, not source substrings.
- [x] **GREEN:** Implement a small strict schema using already-installed Zod. Local defaults use a clearly local-only Worker name and bindings. Remote inventory must explicitly declare shadow stage, exact account54eaadb89014252836694203c1e22546, Worker name startingarc-v8-migration-shadow-, a distinct non-placeholder D1UUID/name, and private R2name; prohibit known smoke names/IDs and production arcmaps.net host. Runtime origin is the explicit shadow Worker HTTPS address; no credentials, service bindings, routes/custom domains, cron or Workflows in this inventory. Distinct resource names usearc-v8-migration- prefix. Root supplies actual Cloudflare-returned identifiers later; never invent remote resource IDs.
- [x] **Integrate:** Vite defaults to local-only config when no explicit ARC_CLOUDFLARE_TARGET path is supplied. If that non-secret path is supplied, validate JSON and reject invalid target; do not silently fall back. Keep log suppression and do not read .env values in the parser. Set ARC_ENVIRONMENT=production in shadow, both AI flagsfalse; local values remain appropriate tolocal. Preserve ASSETS handling and requiredSSRentry. Prefer no added paid image transformation binding if unused; if keeping IMAGES is required, report its implications before cloud deployment, rather than creating a subscription.
- [x] **Artifact validation:** check-cloudflare-build.mjs accepts explicit target inventory path, reads dist/server/wrangler.json and assets, verifies account/Worker/D1/R2/runtimeorigin/closed flags and no production routes/triggers/services/Workflows or secret values. It must reject a local build for remote use, refuse absent target, and exit nonzero on mismatch. It prints only bounded non-secret outcome; never deploys. JSON keys added by vinext may be allowed only when not operationally dangerous; inspect actual output rather than guessing schema. Verify binding strings/IDs match—not merely manifest exists.
- [x] **Origin regression:** Change the renderedHTML expectation first to arcmaps.net and verify RED against baselinebuiltartifact; then update metadataorigin, rebuild once, run all4existing rendered/client-boundary tests. Keep publicpagecopy/banner, authentication implementation andResearch guards unchanged.
- [x] **Focused regression:** npm run test:unit -- tests/build/cloudflare-target.test.ts tests/server/auth-runtime.test.ts tests/server/auth-policy.test.ts tests/server/research-environment.test.ts; run npx --no-install tsc --noEmit --incremental false and targetedESLint. Run configartifact tests with synthetic temporary targets only and no network.
- [x] **Self-review:** diff only allowed files plus exact test helpers needed; no package-lock/source db changes, no .env/secret file reads, no cloudwrites. Report RED/GREEN commands and failures accurately. No commit until Root's two independent reviews.
- [x] **Independent SPEC then QUALITY:** First check constraints/source separation/configfail-closed/testevidence; then a different reviewerchecks runtimecorrectness/security/maintainability. Fixandrepeat review when required. Root independently runs final changed-area checks.

## Task A2: Local runtime and handoff

**Files:** docs/operations/cloudflare-migration-stage-a.md and ignored outputs/cloudflare-migration-20260922/ safe receipts; tests needed for actual Workerd integration only if A1 leaves a genuinebehaviorgap.

- [x] Run generated SSR artifact in localWorkerd withfresh isolated DB/R2, apply exactlybaseline0000–0006 toemptyDB usinglocalmode, verifypublicpage/staticassets andResearchdisabled behavior. No realOAuth credentials or modelnetwork.
- [x] Confirm generated artifact andconfig identifythe standalone app and containno Sitespackagingdependency. Recordartifact hashes andnon-secretbindingnames; donot includesourceuserdata orsecrets.
- [x] Save stagedplan/evidence/checkpoint; markonlylocal readiness. StageBwillcreate distinctcloudresources andshadowdeployment after reviewingtheconcretetarget, not change DNS.

## Later phases and gates

StageBisolatedresource/remotevalidation, StageCcoordinatedoriginaldataexport/restore+auth, StageDcutover/verification are defined by thedesign. Their exactcommands use returnedresourceIDs andverifieddata-transfercapability, so they are not executable steps in this localplan. Sourceexport/oldsecretavailability is an unresolvedexternal dependency; continue independentlocalwork, preserveusersdata andoldorigin, andreport honestly when it blocks productioncutover.
