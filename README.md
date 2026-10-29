# Arc.

**English** · [简体中文](./README.zh-CN.md)

![Arc. — Learn only what moves you forward](./public/og.png)

[![Quality](https://github.com/Earorua/arc/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/Earorua/arc/actions/workflows/ci.yml)
[![Live experience](https://img.shields.io/badge/live-arcmaps.net-744596)](https://arcmaps.net)

**From a target role to a practical learning path.**

Arc turns role requirements into skills and learning units, then schedules daily work around your existing knowledge and available time. A learning companion helps with the current task, a planner proposes adjustments, and work evidence records progress.

[Visit Arc](https://arcmaps.net) · [Explore the public example](https://arcmaps.net/showcase)

## Features

| Area | What you can do |
| --- | --- |
| **Setup & Research** | Research a target role and its learning resources, assess skills, set study time, and resume a saved setup draft. |
| **Path** | Follow prerequisite-based learning units, adjust availability, and review plan changes before accepting them. |
| **Today** | Open the current task and its resources, record completion, and continue to the relevant skill or evidence. |
| **Stack** | Explore skills, prerequisites, mastery criteria, learning materials, and supporting evidence. |
| **Proof** | Save work samples and private attachments, retain revisions, and choose which fields to share publicly. |
| **History** | View previous plans and their recorded progress; historical plans remain read-only. |
| **Learning companion & Coach** | Ask questions about your current work and review personalized learning strategies or plan adjustments. |

## Design logic

**Target role → Skills and resources → Self-assessment and time budget → Learning path → Daily tasks → Evidence and progress**

1. **Traceable learning inputs.** Research results must pass structure and source checks before entering a plan. Built-in learning data also supports a deterministic example without model calls.
2. **AI advice, explicit scheduling rules.** AI supports role research and learning suggestions. Prerequisites, time allocation, and daily schedules are computed by deterministic planning logic.
3. **Changes stay reviewable.** An uncertain assessment leads to calibration. Plan adjustments show a diff and take effect after confirmation; task completion and evidence review retain distinct meanings.
4. **Personal state has a clear owner.** Google or GitHub sign-in opens the personal workspace. D1 stores signed-in learning state, local work is imported with consent, and attachments remain private while public views expose only selected fields.

The interface uses warm paper surfaces, dark text, and purple accents to keep attention on the next task. Responsive layouts, keyboard focus, and reduced-motion support are built into the experience.

## Technology stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| Interface | React, Next-compatible App Router | Pages, shared components, and workspace interactions |
| Styling & motion | Tailwind CSS, custom CSS, Motion | Visual themes, responsive layouts, and interaction feedback |
| Rendering & runtime | Vinext, Vite, Cloudflare Workers | Server rendering, API routes, builds, and local development |
| Authentication | Better Auth, Google / GitHub OAuth | Sign-in, sessions, and account boundaries |
| Structured data | Cloudflare D1, Drizzle ORM | Learning state, history, evidence metadata, and migrations |
| File storage | Cloudflare R2 | Private attachments and research result receipts |
| AI & background work | OpenRouter, Cloudflare Workflows | Model access and durable role-research execution |
| Data contracts | TypeScript, Zod | Shared types and runtime validation of API and model data |
| Quality | Vitest, Testing Library, ESLint, GitHub Actions | Behavior tests, interface tests, static checks, and CI |

Role Research runs through a private executor and durable Workflows. Tutoring and planning suggestions use the website's server-side agent service. Model credentials stay on the server.

## Local development

Install Node.js and npm; the required runtime is specified in [`package.json`](./package.json).

```bash
npm ci
cp .env.example .dev.vars
npm run dev
```

Open the address printed by the server, normally `http://localhost:3000`. The default [`cloudflare.local.json`](./cloudflare.local.json) uses local bindings; leave `ARC_CLOUDFLARE_TARGET` unset for local development.

[`.env.example`](./.env.example) lists server configuration. Local `.dev.vars` files are ignored by Git, and AI features start disabled. Personal workspaces require configured authentication and an initialized database. See the [authentication guide](./docs/operations/cloudflare-shadow-auth-setup.md) and [learning-assistant guide](./docs/operations/dual-learning-agents.md) for details.

## Project structure

| Path | Contents |
| --- | --- |
| [`app/`](./app/) | Pages, UI components, contracts, planning logic, and server APIs |
| [`db/`](./db/) · [`drizzle/`](./drizzle/) | Database schema and migrations |
| [`worker/`](./worker/) | Website entry and Research executor |
| [`build/`](./build/) · [`scripts/`](./scripts/) | Build configuration and development tools |
| [`tests/`](./tests/) | Unit, integration, and rendered-page checks |
| [`docs/`](./docs/) | Design, configuration, and operational documentation |

## Development checks

```bash
npm run test:unit
npm run lint
npx tsc --noEmit
npm test
```

`npm test` builds the application and checks rendered HTML. Run `npm run test:unit` separately for the unit and integration suites.
