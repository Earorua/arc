# Arc. Public Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automated quality gates and a portfolio-grade repository narrative, merge the validated experience, and remove the owner-only access gate.

**Architecture:** GitHub Actions mirrors the local quality commands without adding application runtime dependencies. README content documents the active device-local architecture and reserved server-side seams, while Sites access remains an independent hosting policy.

**Tech Stack:** GitHub Actions, Node.js 22.13.0, npm, Vitest, ESLint, Vinext/Vite, OpenAI Sites.

---

### Task 1: Add the repository quality gate

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] Create a read-only pull-request and `master` workflow using Node 22.13.0 and npm cache.
- [ ] Run unit tests, lint, production build, and rendered HTML verification in one ordered job.
- [ ] Validate the workflow syntax and inspect the diff.
- [ ] Commit the workflow together with the public release documentation.

### Task 2: Turn README into the product handoff

**Files:**
- Modify: `README.md`

- [ ] Lead with the existing Arc. social image, CI badge, and live product link.
- [ ] Explain the learning loop, Warm Precision visual thesis, active architecture, and deliberate trust boundaries.
- [ ] Preserve exact Unix and Windows development and verification commands.
- [ ] Add a focused roadmap without implying live AI, authentication, uploads, or cross-device sync.
- [ ] Inspect Markdown links and headings.

### Task 3: Verify and publish the branch update

**Files:**
- Verify: `.github/workflows/ci.yml`
- Verify: `README.md`

- [ ] Run `npm run test:unit` and confirm all tests pass.
- [ ] Run `npm run lint` and confirm no errors.
- [ ] Run `npm --script-shell="C:\Program Files\Git\bin\bash.exe" run build` on Windows and confirm exit code 0.
- [ ] Run `node --test tests/rendered-html.test.mjs` and confirm the rendered page test passes.
- [ ] Commit with `chore: prepare Arc public release` and push the feature branch.
- [ ] Wait for the GitHub Actions quality job to succeed.

### Task 4: Complete the public release

**Files:**
- No source changes expected.

- [ ] Mark pull request #1 ready for review.
- [ ] Merge pull request #1 into `master` without force-pushing.
- [ ] Confirm the remote default branch contains the merged release.
- [ ] Change the existing Sites access mode from custom owner-only to public.
- [ ] Confirm the site reports public access and retain the current URL until a custom domain is provided.
