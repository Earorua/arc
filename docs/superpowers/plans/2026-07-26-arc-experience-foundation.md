# Arc. Experience Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify a polished, responsive, no-login Arc. flagship experience that demonstrates the complete `setup → path → today → stack → proof` loop using deterministic local demo data.

**Architecture:** Initialize the bundled Sites Vinext starter, then build a multi-route React 19 application as a modular front-end foundation. Domain contracts, flagship role data, guest state, readiness calculation, and completion transitions remain pure TypeScript; route components consume those modules and persist only device-local demo state during this phase.

**Tech Stack:** TypeScript 5.9, React 19.2, Vinext/Next 16 app routes, Tailwind CSS 4 foundation plus authored CSS tokens, Motion for React, Fontsource variable fonts, Vitest, Testing Library, OpenAI Sites/Cloudflare Workers.

---

## Plan boundary

This is implementation plan 1 of 4 derived from the approved master specification at `docs/superpowers/specs/2026-07-26-arc-career-learning-platform-design.md`.

This plan produces working, testable software without D1, R2, authentication, external source ingestion, or live model calls. The next three plans are authored after this foundation is accepted so that their migrations and integration paths target the actual initialized codebase:

1. Product Intelligence: D1, Drizzle, source evidence, AI gateway, deterministic planning.
2. Persistence & Proof: guest merge, Better Auth, completion events, R2 uploads, public profiles, encrypted BYOK.
3. Production Finish: rate limits, security hardening, social preview, final validation, Sites deployment.

## Locked file structure

```text
app/
  components/
    brand/precision-path-hero.tsx
    brand/site-header.tsx
    brand/story-rail.tsx
    proof/proof-profile.tsx
    setup/setup-flow.tsx
    stack/stack-browser.tsx
    today/today-session.tsx
    workspace/phase-rail.tsx
    workspace/workspace-shell.tsx
  data/flagship-role.ts
  domain/learning.ts
  intelligence/page.tsx
  lib/demo-store.ts
  lib/proof-profile.ts
  lib/skill-map.ts
  layout.tsx
  method/page.tsx
  page.tsx
  path/page.tsx
  proof/page.tsx
  setup/page.tsx
  stack/page.tsx
  today/page.tsx
  globals.css
tests/
  components/*.test.tsx
  data/flagship-role.test.ts
  lib/*.test.ts
  pages/*.test.tsx
  rendered-html.test.mjs
  setup.ts
vitest.config.ts
```

Each file has one responsibility: `domain` defines contracts, `data` supplies the deterministic flagship fixture, `lib` owns pure state and selectors, `components` owns one UI concept, and routes only compose those units.

### Task 1: Safely initialize the Sites starter and test harness

**Files:**
- Preserve and restore: `docs/`
- Modify: `.gitignore`
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `tests/harness.test.ts`

- [ ] **Step 1: Stop the temporary visual-companion process**

Stop the retained local brainstorm server before moving `.superpowers/`. Verify that `http://localhost:63896` is no longer serving content.

- [ ] **Step 2: Validate and preserve files that the Sites initializer does not allow at the target root**

Run this entire PowerShell block from the repository root. It resolves every move target and refuses to move anything outside the workspace.

```powershell
$arcWorkspace = (Resolve-Path '.').Path
$arcPreserve = Join-Path $arcWorkspace 'work\pre-init-preserve'
$arcBrainstormArchive = Join-Path $arcWorkspace 'work\brainstorm-archive-2026-07-26'

New-Item -ItemType Directory -Force -Path $arcPreserve | Out-Null

$arcDocs = Join-Path $arcWorkspace 'docs'
$arcIgnore = Join-Path $arcWorkspace '.gitignore'
$arcVisuals = Join-Path $arcWorkspace '.superpowers'

foreach ($arcPath in @($arcDocs, $arcIgnore, $arcVisuals)) {
  if (Test-Path -LiteralPath $arcPath) {
    $arcResolved = (Resolve-Path -LiteralPath $arcPath).Path
    if (-not $arcResolved.StartsWith($arcWorkspace, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to move path outside workspace: $arcResolved"
    }
  }
}

if (Test-Path -LiteralPath $arcDocs) {
  Move-Item -LiteralPath $arcDocs -Destination (Join-Path $arcPreserve 'docs')
}
if (Test-Path -LiteralPath $arcIgnore) {
  Move-Item -LiteralPath $arcIgnore -Destination (Join-Path $arcPreserve '.gitignore')
}
if (Test-Path -LiteralPath $arcVisuals) {
  if (Test-Path -LiteralPath $arcBrainstormArchive) {
    throw "Brainstorm archive already exists: $arcBrainstormArchive"
  }
  Move-Item -LiteralPath $arcVisuals -Destination $arcBrainstormArchive
}

Get-ChildItem -Force | Select-Object Name
```

Expected: only `.git`, `outputs`, and `work` remain at the root.

- [ ] **Step 3: Run the required Sites initializer once**

Run:

```powershell
& 'C:\Program Files\Git\bin\bash.exe' -lc "'/c/Users/XF/.codex/plugins/cache/openai-bundled/sites/0.1.30/scripts/init-site.sh' '/c/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2'"
```

Expected: initializer exits `0`, copies the Vinext starter, and completes `npm ci`.

- [ ] **Step 4: Restore the approved documentation**

Run:

```powershell
$arcWorkspace = (Resolve-Path '.').Path
$arcPreservedDocs = Join-Path $arcWorkspace 'work\pre-init-preserve\docs'
$arcDocsTarget = Join-Path $arcWorkspace 'docs'

if (-not (Test-Path -LiteralPath $arcPreservedDocs)) {
  throw "Preserved docs are missing: $arcPreservedDocs"
}
if (-not $arcDocsTarget.StartsWith($arcWorkspace, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Docs target escaped workspace: $arcDocsTarget"
}

Move-Item -LiteralPath $arcPreservedDocs -Destination $arcDocsTarget
```

Append this exact line to the initializer-provided `.gitignore` using `apply_patch`:

```gitignore
/.superpowers/
```

- [ ] **Step 5: Install only the phase-one dependencies**

Run:

```powershell
npm install motion @fontsource-variable/newsreader @fontsource-variable/manrope
npm install --save-dev vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
npm pkg set "scripts.test:unit=vitest run" "scripts.test:watch=vitest"
```

Expected: `package-lock.json` changes, existing Sites scripts remain present, and the new `test:unit` and `test:watch` scripts appear.

- [ ] **Step 6: Write the failing harness test**

Create `tests/harness.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("Arc test harness", () => {
  it("provides a DOM environment", () => {
    expect(document.documentElement).toBeInstanceOf(HTMLElement);
  });
});
```

- [ ] **Step 7: Run the test to verify the missing configuration fails**

Run:

```powershell
npm run test:unit
```

Expected: FAIL because Vitest has not been configured with `jsdom` and the jest-dom setup.

- [ ] **Step 8: Add the minimal Vitest configuration**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    clearMocks: true,
  },
});
```

Create `tests/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 9: Run the harness test**

Run:

```powershell
npm run test:unit
```

Expected: PASS with `1 passed`.

- [ ] **Step 10: Commit the initialized foundation**

```powershell
git add .gitignore package.json package-lock.json vitest.config.ts tests/setup.ts tests/harness.test.ts docs
git commit -m "chore: initialize Arc experience foundation"
```

### Task 2: Define domain contracts and deterministic flagship data

**Files:**
- Create: `app/domain/learning.ts`
- Create: `app/data/flagship-role.ts`
- Create: `tests/data/flagship-role.test.ts`

- [ ] **Step 1: Write the failing flagship-data contract test**

Create `tests/data/flagship-role.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { flagshipRole } from "../../app/data/flagship-role";

describe("flagshipRole", () => {
  it("covers the eight approved capability categories", () => {
    expect(flagshipRole.id).toBe("ai-native-full-stack-engineer");
    expect(new Set(flagshipRole.skills.map((skill) => skill.category))).toEqual(
      new Set([
        "foundations",
        "frontend",
        "backend",
        "data",
        "quality",
        "cloud",
        "ai",
        "product",
      ]),
    );
    expect(flagshipRole.skills.length).toBeGreaterThanOrEqual(16);
  });

  it("has an 18-week path with valid skill references", () => {
    const skillIds = new Set(flagshipRole.skills.map((skill) => skill.id));
    expect(flagshipRole.phases.reduce((weeks, phase) => weeks + phase.weeks, 0)).toBe(18);
    for (const phase of flagshipRole.phases) {
      expect(phase.skillIds.every((id) => skillIds.has(id))).toBe(true);
    }
  });

  it("keeps every skill attributable", () => {
    for (const skill of flagshipRole.skills) {
      expect(skill.sources.length).toBeGreaterThan(0);
      expect(skill.sources[0].url).toMatch(/^https:\/\//);
      expect(skill.confidence).toBeGreaterThanOrEqual(0.75);
    }
  });
});
```

- [ ] **Step 2: Run the contract test to verify it fails**

Run:

```powershell
npm run test:unit -- tests/data/flagship-role.test.ts
```

Expected: FAIL with module-not-found errors for `learning.ts` and `flagship-role.ts`.

- [ ] **Step 3: Define the complete phase-one domain contracts**

Create `app/domain/learning.ts`:

```ts
export type SkillCategory =
  | "foundations"
  | "frontend"
  | "backend"
  | "data"
  | "quality"
  | "cloud"
  | "ai"
  | "product";

export type SkillImportance = "core" | "strong" | "advantage";

export interface SkillSource {
  title: string;
  url: string;
  observedAt: string;
}

export interface SkillNode {
  id: string;
  name: string;
  category: SkillCategory;
  importance: SkillImportance;
  why: string;
  confidence: number;
  prerequisiteIds: string[];
  sources: SkillSource[];
}

export interface PlanPhase {
  id: string;
  name: string;
  weeks: number;
  outcome: string;
  skillIds: string[];
}

export interface LearningUnit {
  id: string;
  title: string;
  minutes: number;
  skillIds: string[];
  steps: Array<{ id: string; label: string }>;
  deliverable: string;
}

export interface ProofItem {
  id: string;
  title: string;
  kind: "commit" | "project" | "note" | "upload";
  skillIds: string[];
  verified: boolean;
}

export interface RoleProfile {
  id: string;
  name: string;
  summary: string;
  version: string;
  updatedAt: string;
  skills: SkillNode[];
  phases: PlanPhase[];
  today: LearningUnit;
}
```

- [ ] **Step 4: Add the deterministic flagship fixture**

Create `app/data/flagship-role.ts`:

```ts
import type {
  RoleProfile,
  SkillCategory,
  SkillImportance,
  SkillNode,
} from "../domain/learning";

const observedAt = "2026-07-26";

function skill(
  id: string,
  name: string,
  category: SkillCategory,
  importance: SkillImportance,
  why: string,
  url: string,
  prerequisiteIds: string[] = [],
): SkillNode {
  return {
    id,
    name,
    category,
    importance,
    why,
    confidence: importance === "core" ? 0.96 : importance === "strong" ? 0.9 : 0.82,
    prerequisiteIds,
    sources: [{ title: `${name} official documentation`, url, observedAt }],
  };
}

const skills: SkillNode[] = [
  skill("web-platform", "Web Platform", "foundations", "core", "Understand the runtime shared by every full-stack feature.", "https://developer.mozilla.org/en-US/docs/Web"),
  skill("typescript", "TypeScript", "foundations", "core", "Create explicit contracts across UI, APIs, data, and AI outputs.", "https://www.typescriptlang.org/docs/"),
  skill("react", "React 19", "frontend", "core", "Build responsive product surfaces and action-driven interactions.", "https://react.dev/", ["web-platform", "typescript"]),
  skill("design-systems", "Accessible Design Systems", "frontend", "strong", "Turn visual taste into reusable, keyboard-safe behavior.", "https://www.w3.org/WAI/ARIA/apg/", ["web-platform"]),
  skill("http-apis", "HTTP & API Design", "backend", "core", "Define stable boundaries between clients and business modules.", "https://developer.mozilla.org/en-US/docs/Web/HTTP"),
  skill("edge-runtime", "Edge Runtime", "backend", "strong", "Ship server logic close to users without server maintenance.", "https://developers.cloudflare.com/workers/", ["http-apis", "typescript"]),
  skill("sql", "SQL & Relational Modeling", "data", "core", "Model plans, evidence, and versioned role intelligence safely.", "https://www.sqlite.org/docs.html"),
  skill("object-storage", "Object Storage", "data", "strong", "Store proof files separately from transactional records.", "https://developers.cloudflare.com/r2/"),
  skill("testing", "Automated Testing", "quality", "core", "Protect planning rules and AI contracts from regressions.", "https://vitest.dev/guide/"),
  skill("security", "Application Security", "quality", "strong", "Protect sessions, keys, uploads, and user-owned resources.", "https://owasp.org/www-project-top-ten/"),
  skill("cloud-delivery", "Cloud Delivery", "cloud", "core", "Build, deploy, observe, and recover a production product.", "https://developers.cloudflare.com/workers/"),
  skill("observability", "Observability", "cloud", "advantage", "Diagnose latency, failures, and model costs without leaking secrets.", "https://opentelemetry.io/docs/"),
  skill("llm-contracts", "Structured LLM Contracts", "ai", "core", "Convert model output into validated product data.", "https://ai-sdk.dev/docs/ai-sdk-core/overview", ["typescript"]),
  skill("retrieval", "Evidence-grounded Retrieval", "ai", "strong", "Ground role intelligence in attributable sources.", "https://platform.openai.com/docs/guides/retrieval", ["llm-contracts"]),
  skill("product-thinking", "Product Thinking", "product", "core", "Choose a focused user outcome instead of accumulating features.", "https://www.nngroup.com/articles/ten-usability-heuristics/"),
  skill("proof-of-work", "Proof of Work", "product", "strong", "Translate learning into evidence a reviewer can inspect.", "https://docs.github.com/en/repositories"),
];

export const flagshipRole: RoleProfile = {
  id: "ai-native-full-stack-engineer",
  name: "AI 原生全栈工程师",
  summary: "Design, build, validate, and ship AI-enabled products across the full stack.",
  version: "2026.07",
  updatedAt: observedAt,
  skills,
  phases: [
    {
      id: "foundations",
      name: "Product Foundations",
      weeks: 4,
      outcome: "Build an accessible React product surface with explicit contracts.",
      skillIds: ["web-platform", "typescript", "react", "design-systems", "product-thinking"],
    },
    {
      id: "systems",
      name: "Full-Stack Systems",
      weeks: 5,
      outcome: "Ship a typed edge API backed by relational data.",
      skillIds: ["http-apis", "edge-runtime", "sql", "testing"],
    },
    {
      id: "intelligence",
      name: "AI & Evidence",
      weeks: 5,
      outcome: "Generate schema-valid AI data grounded in sources.",
      skillIds: ["llm-contracts", "retrieval", "security", "object-storage"],
    },
    {
      id: "production",
      name: "Production Proof",
      weeks: 4,
      outcome: "Deploy, observe, and present a verifiable production build.",
      skillIds: ["cloud-delivery", "observability", "proof-of-work"],
    },
  ],
  today: {
    id: "server-actions-boundary",
    title: "把一次表单提交变成可验证的服务端动作",
    minutes: 45,
    skillIds: ["react", "http-apis", "typescript"],
    steps: [
      { id: "understand", label: "理解客户端与服务端动作的边界" },
      { id: "build", label: "实现带类型校验的提交路径" },
      { id: "prove", label: "提交一次可回看的代码变更" },
    ],
    deliverable: "Git commit or implementation note",
  },
};
```

- [ ] **Step 5: Run the flagship-data test**

Run:

```powershell
npm run test:unit -- tests/data/flagship-role.test.ts
```

Expected: PASS with `3 passed`.

- [ ] **Step 6: Commit the domain foundation**

```powershell
git add app/domain/learning.ts app/data/flagship-role.ts tests/data/flagship-role.test.ts
git commit -m "feat: add flagship learning domain"
```

### Task 3: Establish the Warm Precision brand system and shared header

**Files:**
- Modify: `app/layout.tsx`
- Replace: `app/globals.css`
- Create: `app/components/brand/site-header.tsx`
- Create: `tests/components/site-header.test.tsx`

- [ ] **Step 1: Write the failing shared-header test**

Create `tests/components/site-header.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteHeader } from "../../app/components/brand/site-header";

describe("SiteHeader", () => {
  it("keeps the brand, public context, and one primary action visible", () => {
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: "Arc. home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Method" })).toHaveAttribute("href", "/method");
    expect(screen.getByRole("link", { name: "Intelligence" })).toHaveAttribute("href", "/intelligence");
    expect(screen.getByRole("link", { name: "Build my path" })).toHaveAttribute("href", "/setup");
  });
});
```

- [ ] **Step 2: Run the header test to verify it fails**

Run:

```powershell
npm run test:unit -- tests/components/site-header.test.tsx
```

Expected: FAIL because `SiteHeader` does not exist.

- [ ] **Step 3: Implement the shared header**

Create `app/components/brand/site-header.tsx`:

```tsx
import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="wordmark" href="/" aria-label="Arc. home">
        Arc.
      </Link>
      <nav className="public-nav" aria-label="Public navigation">
        <Link href="/method">Method</Link>
        <Link href="/intelligence">Intelligence</Link>
      </nav>
      <Link className="header-cta" href="/setup">
        Build my path
      </Link>
    </header>
  );
}
```

- [ ] **Step 4: Replace the starter layout and metadata**

Replace `app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "@fontsource-variable/newsreader";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Arc. — Learn only what moves you forward",
    template: "%s · Arc.",
  },
  description:
    "Turn any role into an attributable technology map, a precise daily path, and proof of capability.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <a className="skip-link" href="#main-content">
          跳到主要内容
        </a>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Replace the starter CSS with the base token system**

Replace `app/globals.css` with:

```css
@import "tailwindcss";

:root {
  --ivory: #f3efe6;
  --chalk: #faf8f2;
  --charcoal: #171715;
  --stone: #787167;
  --hairline: #d7d0c5;
  --signal: #f0643e;
  --success: #55745d;
  --display: "Newsreader Variable", "Noto Serif SC", Georgia, serif;
  --sans: "Manrope Variable", "PingFang SC", "Microsoft YaHei", sans-serif;
  --content: min(1180px, calc(100vw - 48px));
}

* { box-sizing: border-box; }

html { background: var(--ivory); color: var(--charcoal); scroll-behavior: smooth; }

body {
  margin: 0;
  min-height: 100vh;
  background: var(--ivory);
  color: var(--charcoal);
  font-family: var(--sans);
  text-rendering: optimizeLegibility;
}

a { color: inherit; text-decoration: none; }
button, input, select { font: inherit; }
button, a { -webkit-tap-highlight-color: transparent; }

.skip-link {
  position: fixed;
  z-index: 100;
  left: 16px;
  top: 12px;
  transform: translateY(-160%);
  border-radius: 999px;
  background: var(--charcoal);
  color: white;
  padding: 10px 14px;
}
.skip-link:focus { transform: translateY(0); }

.site-header {
  position: relative;
  z-index: 20;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  width: var(--content);
  height: 72px;
  margin: 0 auto;
  border-bottom: 1px solid color-mix(in srgb, var(--charcoal) 10%, transparent);
}
.wordmark { font-size: 1.25rem; font-weight: 800; letter-spacing: -0.06em; }
.public-nav { display: flex; gap: 28px; color: var(--stone); font-size: 0.78rem; }
.public-nav a:hover { color: var(--charcoal); }
.header-cta { justify-self: end; border-bottom: 1px solid currentColor; padding-bottom: 3px; font-size: 0.78rem; }

:focus-visible { outline: 2px solid var(--signal); outline-offset: 4px; }
```

- [ ] **Step 6: Run the header test**

Run:

```powershell
npm run test:unit -- tests/components/site-header.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit the brand foundation**

```powershell
git add app/layout.tsx app/globals.css app/components/brand/site-header.tsx tests/components/site-header.test.tsx
git commit -m "feat: establish Arc visual system"
```

### Task 4: Build the image-free editorial landing page and remove the starter skeleton

**Files:**
- Create: `app/components/brand/precision-path-hero.tsx`
- Create: `app/components/brand/story-rail.tsx`
- Replace: `app/page.tsx`
- Modify: `app/globals.css`
- Replace: `tests/rendered-html.test.mjs`
- Create: `tests/pages/home.test.tsx`
- Delete: `app/_sites-preview/SkeletonPreview.tsx`
- Delete: `app/_sites-preview/preview.css`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Write the failing landing-page test**

Create `tests/pages/home.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "../../app/page";

describe("Arc home", () => {
  it("presents one promise, one primary action, and the product loop", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1, name: /Learn only what moves you forward/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Build my precise path/i })).toHaveAttribute("href", "/setup");
    expect(screen.getByText("Understand")).toBeInTheDocument();
    expect(screen.getByText("Build")).toBeInTheDocument();
    expect(screen.getByText("Prove")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the landing-page test to verify it fails**

Run:

```powershell
npm run test:unit -- tests/pages/home.test.tsx
```

Expected: FAIL because the starter page still renders `SkeletonPreview`.

- [ ] **Step 3: Implement the animated hero and chapter rail**

Create `app/components/brand/story-rail.tsx`:

```tsx
const chapters = [
  ["01", "Understand", "看清岗位真正需要什么"],
  ["02", "Build", "每天完成一个可验证结果"],
  ["03", "Prove", "让作品成为能力证据"],
] as const;

export function StoryRail() {
  return (
    <ol className="story-rail" aria-label="Arc learning method">
      {chapters.map(([number, title, description], index) => (
        <li className={index === 0 ? "story-chapter is-active" : "story-chapter"} key={title}>
          <span>{number}</span>
          <div><strong>{title}</strong><small>{description}</small></div>
        </li>
      ))}
    </ol>
  );
}
```

Create `app/components/brand/precision-path-hero.tsx`:

```tsx
"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { StoryRail } from "./story-rail";

export function PrecisionPathHero() {
  const reduceMotion = useReducedMotion();
  const enter = reduceMotion ? {} : { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 } };

  return (
    <section className="hero-poster">
      <div className="hero-copy">
        <motion.p {...enter} transition={{ duration: 0.55 }} className="eyebrow">
          Career intelligence · 2026 edition
        </motion.p>
        <motion.h1 {...enter} transition={{ duration: 0.7, delay: 0.06 }}>
          Learn only what moves you forward.
        </motion.h1>
        <motion.p {...enter} transition={{ duration: 0.65, delay: 0.13 }} className="hero-support">
          把任意岗位拆成清晰、可信、每天都能完成的成长路径。
        </motion.p>
        <motion.div {...enter} transition={{ duration: 0.55, delay: 0.2 }}>
          <Link className="primary-action" href="/setup">Build my precise path →</Link>
        </motion.div>
      </div>
      <StoryRail />
      <div className="signal-rule" aria-hidden="true" />
    </section>
  );
}
```

- [ ] **Step 4: Replace the home route with the approved four-part narrative**

Replace `app/page.tsx` with:

```tsx
import Link from "next/link";
import { PrecisionPathHero } from "./components/brand/precision-path-hero";
import { SiteHeader } from "./components/brand/site-header";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main-content">
        <PrecisionPathHero />
        <section className="editorial-section method-preview">
          <p className="section-index">01 · Method</p>
          <h2>路线不是课程目录。它是一组有依赖、有证据、有时间预算的决定。</h2>
          <Link href="/method">Explore the method →</Link>
        </section>
        <section className="editorial-section product-preview">
          <p className="section-index">02 · Product</p>
          <div><strong>Today</strong><span>只做今天最重要的 45 分钟。</span></div>
          <div><strong>Path</strong><span>看清十八周如何抵达岗位目标。</span></div>
          <div><strong>Proof</strong><span>把完成记录变成可分享的能力证据。</span></div>
        </section>
        <section className="final-cta">
          <h2>Start with direction.<br />Finish with proof.</h2>
          <Link className="primary-action" href="/setup">Build my path →</Link>
        </section>
      </main>
    </>
  );
}
```

- [ ] **Step 5: Add the exact landing-page composition styles**

Append to `app/globals.css`:

```css
.hero-poster {
  position: relative;
  display: grid;
  grid-template-columns: 1.45fr 0.55fr;
  min-height: calc(100svh - 72px);
  padding: clamp(72px, 10vh, 120px) max(24px, calc((100vw - 1180px) / 2));
  overflow: hidden;
}
.hero-copy { align-self: center; max-width: 760px; }
.eyebrow, .section-index { color: var(--stone); font: 0.7rem/1.2 ui-monospace, monospace; letter-spacing: 0.1em; text-transform: uppercase; }
.hero-copy h1 { margin: 22px 0; font-family: var(--display); font-size: clamp(4rem, 8.5vw, 8.5rem); font-weight: 430; line-height: 0.84; letter-spacing: -0.065em; }
.hero-support { max-width: 430px; color: var(--stone); font-size: clamp(1rem, 1.4vw, 1.25rem); line-height: 1.7; }
.primary-action { display: inline-flex; margin-top: 28px; border-radius: 999px; background: var(--charcoal); color: white; padding: 14px 18px; font-size: 0.82rem; }
.story-rail { position: relative; display: flex; flex-direction: column; justify-content: space-between; align-self: stretch; margin: 0; padding: 12px 0 12px 34px; list-style: none; }
.story-rail::before { content: ""; position: absolute; left: 29px; top: 40px; bottom: 40px; width: 1px; background: var(--hairline); }
.story-chapter { position: relative; display: flex; align-items: center; gap: 18px; }
.story-chapter > span { z-index: 1; display: grid; place-items: center; width: 58px; height: 58px; border: 1px solid #b7afa4; border-radius: 50%; background: var(--ivory); font: 0.68rem ui-monospace, monospace; }
.story-chapter.is-active > span { border-color: var(--signal); background: var(--signal); color: white; }
.story-chapter strong, .story-chapter small { display: block; }
.story-chapter strong { font-family: var(--display); font-size: 1.15rem; font-weight: 520; }
.story-chapter small { margin-top: 5px; color: var(--stone); }
.signal-rule { position: absolute; left: 0; right: 0; bottom: 0; height: 5px; background: var(--signal); }
.editorial-section, .final-cta { width: var(--content); margin: 0 auto; padding: 120px 0; border-bottom: 1px solid var(--hairline); }
.editorial-section h2, .final-cta h2 { max-width: 900px; margin: 26px 0; font-family: var(--display); font-size: clamp(2.7rem, 5vw, 5.4rem); font-weight: 450; line-height: 0.98; letter-spacing: -0.05em; }
.product-preview { display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; }
.product-preview .section-index { grid-column: 1 / -1; }
.product-preview div { padding-top: 22px; border-top: 1px solid var(--hairline); }
.product-preview strong, .product-preview span { display: block; }
.product-preview strong { font-family: var(--display); font-size: 2rem; font-weight: 500; }
.product-preview span { margin-top: 10px; color: var(--stone); line-height: 1.6; }
.final-cta { min-height: 72svh; display: flex; flex-direction: column; justify-content: center; border-bottom: 0; }
```

- [ ] **Step 6: Replace the starter server-render test**

Replace `tests/rendered-html.test.mjs` with:

```js
import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the Arc landing page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Arc\./);
  assert.match(html, /Learn only what moves you forward/);
  assert.match(html, /Build my precise path/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});
```

- [ ] **Step 7: Remove all disposable starter UI**

Delete with `apply_patch`:

```text
app/_sites-preview/SkeletonPreview.tsx
app/_sites-preview/preview.css
```

Run:

```powershell
npm uninstall react-loading-skeleton
```

Expected: the dependency disappears from `package.json` and `package-lock.json`.

- [ ] **Step 8: Run the landing and rendered-output tests**

Run:

```powershell
npm run test:unit -- tests/pages/home.test.tsx
npm run build
node --test tests/rendered-html.test.mjs
```

Expected: all commands PASS; built HTML contains Arc product content and no preview marker.

- [ ] **Step 9: Commit the complete landing experience**

```powershell
git add app package.json package-lock.json tests
git commit -m "feat: build Arc editorial landing experience"
```

### Task 5: Add the Method and Intelligence trust pages

**Files:**
- Create: `app/method/page.tsx`
- Create: `app/intelligence/page.tsx`
- Create: `tests/pages/public-information.test.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Write the failing trust-page tests**

Create `tests/pages/public-information.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import IntelligencePage from "../../app/intelligence/page";
import MethodPage from "../../app/method/page";

describe("public trust pages", () => {
  it("explains the deterministic learning loop", () => {
    render(<MethodPage />);
    expect(screen.getByRole("heading", { name: /A path is a decision system/i })).toBeInTheDocument();
    expect(screen.getByText(/Understand → Build → Prove/i)).toBeInTheDocument();
  });

  it("explains sources, freshness, and confidence", () => {
    render(<IntelligencePage />);
    expect(screen.getByRole("heading", { name: /Trust is part of the interface/i })).toBeInTheDocument();
    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByText("Observed at")).toBeInTheDocument();
    expect(screen.getByText("Confidence")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```powershell
npm run test:unit -- tests/pages/public-information.test.tsx
```

Expected: FAIL because both routes are missing.

- [ ] **Step 3: Implement the Method page**

Create `app/method/page.tsx`:

```tsx
import { SiteHeader } from "../components/brand/site-header";

export default function MethodPage() {
  return (
    <><SiteHeader /><main id="main-content" className="reading-page">
      <p className="eyebrow">Method · 01</p>
      <h1>A path is a decision system.</h1>
      <p className="lede">路线同时考虑岗位重要度、技能依赖、个人基础、时间预算和可验证产出。</p>
      <ol className="method-list">
        <li><span>01</span><div><strong>Understand</strong><p>先解释岗位真正要求什么，以及信息来自哪里。</p></div></li>
        <li><span>02</span><div><strong>Build</strong><p>每天安排一个在现有时间内能够完成的结果。</p></div></li>
        <li><span>03</span><div><strong>Prove</strong><p>完成记录只有与项目、代码或笔记关联后才提升成熟度。</p></div></li>
      </ol>
      <p className="method-equation">Understand → Build → Prove</p>
    </main></>
  );
}
```

- [ ] **Step 4: Implement the Intelligence page**

Create `app/intelligence/page.tsx`:

```tsx
import { flagshipRole } from "../data/flagship-role";
import { SiteHeader } from "../components/brand/site-header";

export default function IntelligencePage() {
  const sample = flagshipRole.skills[0];
  return (
    <><SiteHeader /><main id="main-content" className="reading-page">
      <p className="eyebrow">Intelligence · 02</p>
      <h1>Trust is part of the interface.</h1>
      <p className="lede">每条技能结论都显示来源、观察时间和置信度。AI 推断永远不会伪装成事实。</p>
      <dl className="source-specimen">
        <div><dt>Skill</dt><dd>{sample.name}</dd></div>
        <div><dt>Source</dt><dd>{sample.sources[0].title}</dd></div>
        <div><dt>Observed at</dt><dd>{sample.sources[0].observedAt}</dd></div>
        <div><dt>Confidence</dt><dd>{Math.round(sample.confidence * 100)}%</dd></div>
      </dl>
    </main></>
  );
}
```

- [ ] **Step 5: Add the reading-page styles**

Append to `app/globals.css`:

```css
.reading-page { width: min(920px, calc(100vw - 48px)); margin: 0 auto; padding: 110px 0 150px; }
.reading-page h1 { max-width: 830px; margin: 24px 0; font-family: var(--display); font-size: clamp(3.8rem, 8vw, 7.5rem); font-weight: 440; line-height: 0.88; letter-spacing: -0.06em; }
.lede { max-width: 650px; color: var(--stone); font-size: 1.12rem; line-height: 1.8; }
.method-list { margin: 80px 0 0; padding: 0; list-style: none; }
.method-list li { display: grid; grid-template-columns: 72px 1fr; gap: 24px; padding: 28px 0; border-top: 1px solid var(--hairline); }
.method-list span { font: 0.72rem ui-monospace, monospace; }
.method-list strong { font-family: var(--display); font-size: 2rem; font-weight: 500; }
.method-list p { color: var(--stone); line-height: 1.7; }
.method-equation { margin-top: 72px; font-family: var(--display); font-size: clamp(2rem, 4vw, 4rem); }
.source-specimen { margin-top: 72px; }
.source-specimen div { display: grid; grid-template-columns: 160px 1fr; gap: 20px; padding: 22px 0; border-top: 1px solid var(--hairline); }
.source-specimen dt { color: var(--stone); }
.source-specimen dd { margin: 0; }
```

- [ ] **Step 6: Run and commit**

Run:

```powershell
npm run test:unit -- tests/pages/public-information.test.tsx
```

Expected: PASS.

Commit:

```powershell
git add app/method app/intelligence app/globals.css tests/pages/public-information.test.tsx
git commit -m "feat: explain Arc method and intelligence"
```

### Task 6: Implement guest setup and device-local demo state

**Files:**
- Create: `app/lib/demo-store.ts`
- Create: `app/components/setup/setup-flow.tsx`
- Create: `app/setup/page.tsx`
- Create: `tests/lib/demo-store.test.ts`
- Create: `tests/components/setup-flow.test.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Write the failing state tests**

Create `tests/lib/demo-store.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { completeDemoUnit, createDemoState, mergeSetup } from "../../app/lib/demo-store";
import { flagshipRole } from "../../app/data/flagship-role";

describe("demo store", () => {
  it("merges setup answers without erasing progress", () => {
    const state = completeDemoUnit(createDemoState(), flagshipRole.today);
    const next = mergeSetup(state, { roleId: flagshipRole.id, level: "beginner", weeklyMinutes: 420, targetWeeks: 18 });
    expect(next.completedUnitIds).toEqual([flagshipRole.today.id]);
    expect(next.setup.weeklyMinutes).toBe(420);
  });

  it("creates exactly one verified proof for an idempotent completion", () => {
    const once = completeDemoUnit(createDemoState(), flagshipRole.today);
    const twice = completeDemoUnit(once, flagshipRole.today);
    expect(twice.completedUnitIds).toEqual([flagshipRole.today.id]);
    expect(twice.proofs).toHaveLength(1);
    expect(twice.proofs[0].verified).toBe(true);
  });
});
```

- [ ] **Step 2: Run the state tests to verify they fail**

Run:

```powershell
npm run test:unit -- tests/lib/demo-store.test.ts
```

Expected: FAIL because `demo-store.ts` is missing.

- [ ] **Step 3: Implement pure state transitions and safe persistence**

Create `app/lib/demo-store.ts`:

```ts
import type { LearningUnit, ProofItem } from "../domain/learning";

export type LearnerLevel = "new" | "beginner" | "intermediate" | "advanced";

export interface SetupAnswers {
  roleId: string;
  level: LearnerLevel;
  weeklyMinutes: number;
  targetWeeks: number;
}

export interface DemoState {
  setup: SetupAnswers;
  completedUnitIds: string[];
  proofs: ProofItem[];
}

const storageKey = "arc-demo-state-v1";

export function createDemoState(): DemoState {
  return {
    setup: { roleId: "ai-native-full-stack-engineer", level: "beginner", weeklyMinutes: 420, targetWeeks: 18 },
    completedUnitIds: [],
    proofs: [],
  };
}

export function mergeSetup(state: DemoState, setup: SetupAnswers): DemoState {
  return { ...state, setup: { ...setup } };
}

export function completeDemoUnit(state: DemoState, unit: LearningUnit): DemoState {
  if (state.completedUnitIds.includes(unit.id)) return state;
  const proof: ProofItem = {
    id: `proof-${unit.id}`,
    title: unit.deliverable,
    kind: "commit",
    skillIds: [...unit.skillIds],
    verified: true,
  };
  return { ...state, completedUnitIds: [...state.completedUnitIds, unit.id], proofs: [...state.proofs, proof] };
}

export function loadDemoState(storage: Pick<Storage, "getItem"> = window.localStorage): DemoState {
  try {
    const raw = storage.getItem(storageKey);
    return raw ? { ...createDemoState(), ...JSON.parse(raw) } : createDemoState();
  } catch {
    return createDemoState();
  }
}

export function saveDemoState(state: DemoState, storage: Pick<Storage, "setItem"> = window.localStorage): void {
  storage.setItem(storageKey, JSON.stringify(state));
}
```

- [ ] **Step 4: Run the state tests**

Run:

```powershell
npm run test:unit -- tests/lib/demo-store.test.ts
```

Expected: PASS with `2 passed`.

- [ ] **Step 5: Write the failing setup-flow test**

Create `tests/components/setup-flow.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SetupFlow } from "../../app/components/setup/setup-flow";

describe("SetupFlow", () => {
  it("asks one question at a time and submits typed answers", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<SetupFlow onComplete={onComplete} />);

    expect(screen.getByRole("heading", { name: /想成为怎样的构建者/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "AI 原生全栈工程师" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Beginner" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.clear(screen.getByLabelText("Weekly minutes"));
    await user.type(screen.getByLabelText("Weekly minutes"), "420");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.clear(screen.getByLabelText("Target weeks"));
    await user.type(screen.getByLabelText("Target weeks"), "18");
    await user.click(screen.getByRole("button", { name: "Build my path" }));

    expect(onComplete).toHaveBeenCalledWith({
      roleId: "ai-native-full-stack-engineer",
      level: "beginner",
      weeklyMinutes: 420,
      targetWeeks: 18,
    });
  });
});
```

- [ ] **Step 6: Run the setup-flow test to verify it fails**

Run:

```powershell
npm run test:unit -- tests/components/setup-flow.test.tsx
```

Expected: FAIL because `SetupFlow` is missing.

- [ ] **Step 7: Implement the setup flow**

Create `app/components/setup/setup-flow.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { LearnerLevel, SetupAnswers } from "../../lib/demo-store";

export function SetupFlow({ onComplete }: { onComplete: (answers: SetupAnswers) => void }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<SetupAnswers>({
    roleId: "ai-native-full-stack-engineer",
    level: "beginner",
    weeklyMinutes: 420,
    targetWeeks: 18,
  });
  const advance = () => setStep((current) => Math.min(current + 1, 3));

  return (
    <section className="setup-flow" aria-live="polite">
      <p className="setup-progress">{String(step + 1).padStart(2, "0")} / 04</p>
      {step === 0 && <><h1>你想成为怎样的构建者？</h1><button className="answer-choice is-selected" onClick={() => setAnswers({ ...answers, roleId: "ai-native-full-stack-engineer" })}>AI 原生全栈工程师</button><label className="answer-field">或输入任意岗位<input aria-label="Custom role" placeholder="例如：数据产品经理" /></label><button className="setup-next" onClick={advance}>Continue</button></>}
      {step === 1 && <><h1>你现在处于哪个阶段？</h1><div className="answer-grid">{(["new", "beginner", "intermediate", "advanced"] as LearnerLevel[]).map((level) => <button className={answers.level === level ? "answer-choice is-selected" : "answer-choice"} key={level} onClick={() => setAnswers({ ...answers, level })}>{level[0].toUpperCase() + level.slice(1)}</button>)}</div><button className="setup-next" onClick={advance}>Continue</button></>}
      {step === 2 && <><h1>你每周真正拥有多少时间？</h1><label className="answer-field">Weekly minutes<input aria-label="Weekly minutes" min="30" max="2400" type="number" value={answers.weeklyMinutes} onChange={(event) => setAnswers({ ...answers, weeklyMinutes: Number(event.target.value) })} /></label><button className="setup-next" onClick={advance}>Continue</button></>}
      {step === 3 && <><h1>你希望用多少周抵达目标？</h1><label className="answer-field">Target weeks<input aria-label="Target weeks" min="4" max="52" type="number" value={answers.targetWeeks} onChange={(event) => setAnswers({ ...answers, targetWeeks: Number(event.target.value) })} /></label><button className="setup-next" onClick={() => onComplete(answers)}>Build my path</button></>}
    </section>
  );
}
```

Create `app/setup/page.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { SetupFlow } from "../components/setup/setup-flow";
import { createDemoState, mergeSetup, saveDemoState, type SetupAnswers } from "../lib/demo-store";

export default function SetupPage() {
  const router = useRouter();
  const finish = (answers: SetupAnswers) => {
    saveDemoState(mergeSetup(createDemoState(), answers));
    router.push("/path");
  };
  return <main id="main-content" className="setup-page"><a className="wordmark setup-wordmark" href="/">Arc.</a><SetupFlow onComplete={finish} /></main>;
}
```

- [ ] **Step 8: Add the setup styles**

Append to `app/globals.css`:

```css
.setup-page { min-height: 100svh; background: var(--charcoal); color: white; padding: 28px max(24px, calc((100vw - 1180px) / 2)); }
.setup-wordmark { display: inline-block; color: white; }
.setup-flow { width: min(760px, 100%); margin: 12vh auto 0; }
.setup-progress { color: #8e918f; font: 0.72rem ui-monospace, monospace; }
.setup-flow h1 { max-width: 720px; margin: 26px 0 48px; font-family: var(--display); font-size: clamp(3rem, 7vw, 6rem); font-weight: 440; line-height: 0.92; letter-spacing: -0.055em; }
.answer-grid { display: grid; grid-template-columns: 1fr 1fr; }
.answer-choice, .answer-field { display: flex; justify-content: space-between; width: 100%; border: 0; border-top: 1px solid #3b3d3b; background: transparent; color: #bfc1be; padding: 20px 0; text-align: left; }
.answer-choice { cursor: pointer; }
.answer-choice.is-selected { color: white; }
.answer-choice.is-selected::after { content: "Selected"; color: #9ee8b4; font-size: 0.72rem; }
.answer-field { flex-direction: column; gap: 12px; }
.answer-field input { border: 0; border-bottom: 1px solid #666966; background: transparent; color: white; padding: 10px 0; font-size: 1.2rem; }
.setup-next { margin-top: 40px; border: 0; border-radius: 999px; background: white; color: var(--charcoal); padding: 13px 18px; cursor: pointer; }
```

- [ ] **Step 9: Run and commit**

Run:

```powershell
npm run test:unit -- tests/lib/demo-store.test.ts tests/components/setup-flow.test.tsx
```

Expected: PASS with `4 passed` total.

Commit:

```powershell
git add app/lib/demo-store.ts app/components/setup app/setup app/globals.css tests/lib/demo-store.test.ts tests/components/setup-flow.test.tsx
git commit -m "feat: add guest learning setup"
```

### Task 7: Build the workspace shell and Precision Path route

**Files:**
- Create: `app/components/workspace/workspace-shell.tsx`
- Create: `app/components/workspace/phase-rail.tsx`
- Create: `app/path/page.tsx`
- Create: `tests/pages/path.test.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Write the failing Path page test**

Create `tests/pages/path.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PathPage from "../../app/path/page";

describe("PathPage", () => {
  it("shows the complete 18-week route in four editorial phases", () => {
    render(<PathPage />);
    expect(screen.getByRole("heading", { name: "Your precise path." })).toBeInTheDocument();
    expect(screen.getByText("18 weeks · 7 hours / week")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByRole("navigation", { name: "Learning workspace" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the Path test to verify it fails**

Run:

```powershell
npm run test:unit -- tests/pages/path.test.tsx
```

Expected: FAIL because the route and workspace components do not exist.

- [ ] **Step 3: Implement the shared workspace shell**

Create `app/components/workspace/workspace-shell.tsx`:

```tsx
import Link from "next/link";

const links = [["Today", "/today"], ["Path", "/path"], ["Stack", "/stack"], ["Proof", "/proof"]] as const;

export function WorkspaceShell({ current, children }: { current: string; children: React.ReactNode }) {
  return (
    <div className="workspace-shell">
      <header className="workspace-header">
        <Link className="wordmark" href="/">Arc.</Link>
        <nav aria-label="Learning workspace">{links.map(([label, href]) => <Link aria-current={current === label ? "page" : undefined} href={href} key={href}>{label}</Link>)}</nav>
        <span className="workspace-context">AI Full-Stack · 06 / 18</span>
      </header>
      <main id="main-content" className="workspace-main">{children}</main>
    </div>
  );
}
```

Create `app/components/workspace/phase-rail.tsx`:

```tsx
import type { PlanPhase } from "../../domain/learning";

export function PhaseRail({ phases }: { phases: PlanPhase[] }) {
  return <ol className="phase-rail">{phases.map((phase, index) => <li className={index === 0 ? "is-current" : ""} key={phase.id}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{phase.name}</strong><p>{phase.outcome}</p><small>{phase.weeks} weeks</small></div></li>)}</ol>;
}
```

- [ ] **Step 4: Implement the Path route**

Create `app/path/page.tsx`:

```tsx
import { flagshipRole } from "../data/flagship-role";
import { PhaseRail } from "../components/workspace/phase-rail";
import { WorkspaceShell } from "../components/workspace/workspace-shell";

export default function PathPage() {
  return <WorkspaceShell current="Path"><section className="workspace-intro"><p className="eyebrow">18 weeks · 7 hours / week</p><h1>Your precise path.</h1><p>每个阶段只承担一个明确结果；时间变化时，后续路线重新分配但历史保持不变。</p></section><PhaseRail phases={flagshipRole.phases} /></WorkspaceShell>;
}
```

- [ ] **Step 5: Add the workspace and Path styles**

Append to `app/globals.css`:

```css
.workspace-shell { min-height: 100svh; background: var(--chalk); }
.workspace-header { position: sticky; top: 0; z-index: 20; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; height: 68px; padding: 0 max(24px, calc((100vw - 1180px) / 2)); border-bottom: 1px solid var(--hairline); background: color-mix(in srgb, var(--chalk) 92%, transparent); backdrop-filter: blur(14px); }
.workspace-header nav { display: flex; gap: 26px; font-size: 0.78rem; }
.workspace-header nav a { color: var(--stone); }
.workspace-header nav a[aria-current="page"] { color: var(--charcoal); border-bottom: 1px solid currentColor; }
.workspace-context { justify-self: end; color: var(--stone); font: 0.68rem ui-monospace, monospace; }
.workspace-main { width: var(--content); margin: 0 auto; padding: 90px 0 120px; }
.workspace-intro { max-width: 780px; }
.workspace-intro h1 { margin: 20px 0; font-family: var(--display); font-size: clamp(4rem, 8vw, 8rem); font-weight: 440; line-height: 0.86; letter-spacing: -0.065em; }
.workspace-intro > p:last-child { max-width: 580px; color: var(--stone); line-height: 1.75; }
.phase-rail { position: relative; margin: 90px 0 0; padding: 0; list-style: none; }
.phase-rail::before { content: ""; position: absolute; left: 31px; top: 32px; bottom: 32px; width: 1px; background: var(--hairline); }
.phase-rail li { position: relative; display: grid; grid-template-columns: 64px 1fr; gap: 30px; padding: 30px 0; border-bottom: 1px solid var(--hairline); }
.phase-rail li > span { z-index: 1; display: grid; place-items: center; width: 64px; height: 64px; border: 1px solid #bcb4a9; border-radius: 50%; background: var(--chalk); font: 0.72rem ui-monospace, monospace; }
.phase-rail li.is-current > span { border-color: var(--signal); background: var(--signal); color: white; }
.phase-rail strong { font-family: var(--display); font-size: 2rem; font-weight: 500; }
.phase-rail p, .phase-rail small { color: var(--stone); }
```

- [ ] **Step 6: Run and commit**

Run:

```powershell
npm run test:unit -- tests/pages/path.test.tsx
```

Expected: PASS.

Commit:

```powershell
git add app/components/workspace app/path app/globals.css tests/pages/path.test.tsx
git commit -m "feat: add Precision Path workspace"
```

### Task 8: Build the actionable Today session and proof transition

**Files:**
- Create: `app/components/today/today-session.tsx`
- Create: `app/today/page.tsx`
- Create: `tests/components/today-session.test.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Write the failing Today-session test**

Create `tests/components/today-session.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TodaySession } from "../../app/components/today/today-session";
import { flagshipRole } from "../../app/data/flagship-role";

describe("TodaySession", () => {
  it("completes all three steps before emitting the unit completion", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<TodaySession onComplete={onComplete} unit={flagshipRole.today} />);
    for (const step of flagshipRole.today.steps) await user.click(screen.getByRole("checkbox", { name: step.label }));
    await user.click(screen.getByRole("button", { name: "Complete & move to Proof" }));
    expect(onComplete).toHaveBeenCalledWith(flagshipRole.today);
  });
});
```

- [ ] **Step 2: Run the Today test to verify it fails**

Run:

```powershell
npm run test:unit -- tests/components/today-session.test.tsx
```

Expected: FAIL because `TodaySession` is missing.

- [ ] **Step 3: Implement the Today session**

Create `app/components/today/today-session.tsx`:

```tsx
"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { LearningUnit } from "../../domain/learning";

export function TodaySession({ unit, onComplete }: { unit: LearningUnit; onComplete: (unit: LearningUnit) => void }) {
  const [done, setDone] = useState<string[]>([]);
  const toggle = (id: string) => setDone((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const ready = done.length === unit.steps.length;
  return <section className="today-session"><p className="eyebrow">Tuesday · Build session</p><div className="time-budget"><strong>{unit.minutes}</strong><span>minutes</span></div><h1>{unit.title}</h1><div className="task-steps">{unit.steps.map((step, index) => <label key={step.id}><input aria-label={step.label} checked={done.includes(step.id)} onChange={() => toggle(step.id)} type="checkbox" /><span>{String(index + 1).padStart(2, "0")}</span><strong>{step.label}</strong></label>)}</div><AnimatePresence>{ready && <motion.div className="deliverable-bar" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}><span>Deliverable · {unit.deliverable}</span><button onClick={() => onComplete(unit)}>Complete & move to Proof</button></motion.div>}</AnimatePresence></section>;
}
```

Create `app/today/page.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { TodaySession } from "../components/today/today-session";
import { WorkspaceShell } from "../components/workspace/workspace-shell";
import { flagshipRole } from "../data/flagship-role";
import { completeDemoUnit, loadDemoState, saveDemoState } from "../lib/demo-store";

export default function TodayPage() {
  const router = useRouter();
  return <WorkspaceShell current="Today"><TodaySession unit={flagshipRole.today} onComplete={(unit) => { saveDemoState(completeDemoUnit(loadDemoState(), unit)); router.push("/proof"); }} /></WorkspaceShell>;
}
```

- [ ] **Step 4: Add Today styles**

Append to `app/globals.css`:

```css
.today-session { max-width: 860px; margin: 0 auto; }
.time-budget { display: flex; align-items: baseline; gap: 12px; margin: 32px 0; }
.time-budget strong { font-family: var(--display); font-size: clamp(5rem, 12vw, 10rem); font-weight: 430; line-height: 0.75; letter-spacing: -0.07em; }
.time-budget span { color: var(--stone); }
.today-session h1 { max-width: 760px; font-family: var(--display); font-size: clamp(2.8rem, 5vw, 5rem); font-weight: 460; line-height: 0.98; letter-spacing: -0.05em; }
.task-steps { margin-top: 64px; }
.task-steps label { display: grid; grid-template-columns: 28px 54px 1fr; align-items: center; padding: 24px 0; border-top: 1px solid var(--hairline); cursor: pointer; }
.task-steps input { width: 18px; height: 18px; accent-color: var(--signal); }
.task-steps span { color: var(--stone); font: 0.7rem ui-monospace, monospace; }
.task-steps strong { font-weight: 560; }
.deliverable-bar { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-top: 34px; border-radius: 12px; background: var(--charcoal); color: white; padding: 18px 20px; }
.deliverable-bar button { border: 0; background: transparent; color: #a8efbc; cursor: pointer; }
```

- [ ] **Step 5: Run and commit**

Run:

```powershell
npm run test:unit -- tests/components/today-session.test.tsx
```

Expected: PASS.

Commit:

```powershell
git add app/components/today app/today app/globals.css tests/components/today-session.test.tsx
git commit -m "feat: add actionable Today session"
```

### Task 9: Build the attributable Stack browser

**Files:**
- Create: `app/lib/skill-map.ts`
- Create: `app/components/stack/stack-browser.tsx`
- Create: `app/stack/page.tsx`
- Create: `tests/lib/skill-map.test.ts`
- Create: `tests/components/stack-browser.test.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Write the failing Stack selector test**

Create `tests/lib/skill-map.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { flagshipRole } from "../../app/data/flagship-role";
import { filterSkills } from "../../app/lib/skill-map";

describe("filterSkills", () => {
  it("filters by category while preserving attributable records", () => {
    const ai = filterSkills(flagshipRole.skills, "ai");
    expect(ai.map((skill) => skill.id)).toEqual(["llm-contracts", "retrieval"]);
    expect(ai.every((skill) => skill.sources.length > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the selector test to verify it fails**

Run:

```powershell
npm run test:unit -- tests/lib/skill-map.test.ts
```

Expected: FAIL because `filterSkills` is missing.

- [ ] **Step 3: Implement the selector**

Create `app/lib/skill-map.ts`:

```ts
import type { SkillCategory, SkillNode } from "../domain/learning";

export function filterSkills(skills: SkillNode[], category: SkillCategory | "all"): SkillNode[] {
  return category === "all" ? skills : skills.filter((skill) => skill.category === category);
}
```

- [ ] **Step 4: Write the failing Stack component test**

Create `tests/components/stack-browser.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { StackBrowser } from "../../app/components/stack/stack-browser";
import { flagshipRole } from "../../app/data/flagship-role";

describe("StackBrowser", () => {
  it("reveals importance, confidence, and source evidence", async () => {
    const user = userEvent.setup();
    render(<StackBrowser skills={flagshipRole.skills} />);
    await user.click(screen.getByRole("button", { name: "AI" }));
    expect(screen.getByText("Structured LLM Contracts")).toBeInTheDocument();
    expect(screen.getAllByText(/confidence/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /official documentation/i }).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 5: Implement the Stack browser and route**

Create `app/components/stack/stack-browser.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { SkillCategory, SkillNode } from "../../domain/learning";
import { filterSkills } from "../../lib/skill-map";

const categories: Array<[SkillCategory | "all", string]> = [["all", "All"], ["foundations", "Foundations"], ["frontend", "Frontend"], ["backend", "Backend"], ["data", "Data"], ["quality", "Quality"], ["cloud", "Cloud"], ["ai", "AI"], ["product", "Product"]];

export function StackBrowser({ skills }: { skills: SkillNode[] }) {
  const [category, setCategory] = useState<SkillCategory | "all">("all");
  return <section><div className="stack-filters" aria-label="Skill categories">{categories.map(([value, label]) => <button aria-pressed={category === value} key={value} onClick={() => setCategory(value)}>{label}</button>)}</div><div className="skill-list">{filterSkills(skills, category).map((skill) => <article key={skill.id}><div><p>{skill.category} · {skill.importance}</p><h2>{skill.name}</h2><span>{skill.why}</span></div><dl><div><dt>Confidence</dt><dd>{Math.round(skill.confidence * 100)}%</dd></div><div><dt>Source</dt><dd><a href={skill.sources[0].url}>{skill.sources[0].title}</a></dd></div></dl></article>)}</div></section>;
}
```

Create `app/stack/page.tsx`:

```tsx
import { StackBrowser } from "../components/stack/stack-browser";
import { WorkspaceShell } from "../components/workspace/workspace-shell";
import { flagshipRole } from "../data/flagship-role";

export default function StackPage() {
  return <WorkspaceShell current="Stack"><section className="workspace-intro"><p className="eyebrow">Role intelligence · {flagshipRole.version}</p><h1>The complete stack.</h1><p>岗位重要度与个人成熟度分开显示；每条结论都能回到来源。</p></section><StackBrowser skills={flagshipRole.skills} /></WorkspaceShell>;
}
```

- [ ] **Step 6: Add Stack styles**

Append to `app/globals.css`:

```css
.stack-filters { display: flex; gap: 8px; margin: 58px 0 24px; overflow-x: auto; padding-bottom: 8px; }
.stack-filters button { flex: 0 0 auto; border: 1px solid var(--hairline); border-radius: 999px; background: transparent; padding: 9px 12px; color: var(--stone); cursor: pointer; }
.stack-filters button[aria-pressed="true"] { border-color: var(--charcoal); background: var(--charcoal); color: white; }
.skill-list article { display: grid; grid-template-columns: 1.25fr 0.75fr; gap: 42px; padding: 28px 0; border-top: 1px solid var(--hairline); }
.skill-list article p { color: var(--stone); font: 0.66rem ui-monospace, monospace; text-transform: uppercase; }
.skill-list h2 { margin: 8px 0; font-family: var(--display); font-size: 2rem; font-weight: 500; }
.skill-list span, .skill-list dt { color: var(--stone); }
.skill-list dl { margin: 0; }
.skill-list dl div { display: grid; grid-template-columns: 90px 1fr; padding: 8px 0; }
.skill-list dd { margin: 0; }
.skill-list dd a { border-bottom: 1px solid currentColor; }
```

- [ ] **Step 7: Run and commit**

Run:

```powershell
npm run test:unit -- tests/lib/skill-map.test.ts tests/components/stack-browser.test.tsx
```

Expected: PASS.

Commit:

```powershell
git add app/lib/skill-map.ts app/components/stack app/stack app/globals.css tests/lib/skill-map.test.ts tests/components/stack-browser.test.tsx
git commit -m "feat: add attributable Stack browser"
```

### Task 10: Build the evidence-based Proof profile

**Files:**
- Create: `app/lib/proof-profile.ts`
- Create: `app/components/proof/proof-profile.tsx`
- Create: `app/proof/page.tsx`
- Create: `tests/lib/proof-profile.test.ts`
- Create: `tests/components/proof-profile.test.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Write the failing readiness tests**

Create `tests/lib/proof-profile.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { flagshipRole } from "../../app/data/flagship-role";
import { calculateReadiness } from "../../app/lib/proof-profile";

describe("calculateReadiness", () => {
  it("never increases readiness without verified evidence", () => {
    expect(calculateReadiness(flagshipRole.skills, [])).toEqual({ percentage: 0, verifiedSkillIds: [] });
  });

  it("counts unique skills from verified proofs only", () => {
    const result = calculateReadiness(flagshipRole.skills, [{ id: "p1", title: "commit", kind: "commit", skillIds: ["react", "typescript", "react"], verified: true }, { id: "p2", title: "draft", kind: "note", skillIds: ["cloud-delivery"], verified: false }]);
    expect(result.verifiedSkillIds).toEqual(["react", "typescript"]);
    expect(result.percentage).toBe(13);
  });
});
```

- [ ] **Step 2: Run the readiness tests to verify they fail**

Run:

```powershell
npm run test:unit -- tests/lib/proof-profile.test.ts
```

Expected: FAIL because `calculateReadiness` is missing.

- [ ] **Step 3: Implement evidence-only readiness**

Create `app/lib/proof-profile.ts`:

```ts
import type { ProofItem, SkillNode } from "../domain/learning";

export function calculateReadiness(skills: SkillNode[], proofs: ProofItem[]) {
  const allowed = new Set(skills.map((skill) => skill.id));
  const verifiedSkillIds = [...new Set(proofs.filter((proof) => proof.verified).flatMap((proof) => proof.skillIds).filter((id) => allowed.has(id)))].sort();
  return { percentage: Math.round((verifiedSkillIds.length / skills.length) * 100), verifiedSkillIds };
}
```

- [ ] **Step 4: Write the failing profile component test**

Create `tests/components/proof-profile.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProofProfile } from "../../app/components/proof/proof-profile";
import { flagshipRole } from "../../app/data/flagship-role";

describe("ProofProfile", () => {
  it("shows an empty evidence state without inventing progress", () => {
    render(<ProofProfile proofs={[]} skills={flagshipRole.skills} />);
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByText(/Complete today's unit/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Implement the Proof profile and route**

Create `app/components/proof/proof-profile.tsx`:

```tsx
import type { ProofItem, SkillNode } from "../../domain/learning";
import { calculateReadiness } from "../../lib/proof-profile";

export function ProofProfile({ proofs, skills }: { proofs: ProofItem[]; skills: SkillNode[] }) {
  const readiness = calculateReadiness(skills, proofs);
  return <section className="proof-profile"><div className="profile-heading"><div><p className="eyebrow">Capability profile</p><h1>Your stack, proven.</h1></div><div className="readiness"><strong>{readiness.percentage}%</strong><span>role readiness</span></div></div>{proofs.length === 0 ? <p className="empty-proof">Complete today's unit to create your first verified proof.</p> : <ol>{proofs.map((proof) => <li key={proof.id}><div><strong>{proof.title}</strong><span>{proof.kind} · {proof.skillIds.length} linked skills</span></div><b>{proof.verified ? "Verified" : "Draft"}</b></li>)}</ol>}<button className="share-profile" type="button">Share public profile →</button></section>;
}
```

Create `app/proof/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { ProofProfile } from "../components/proof/proof-profile";
import { WorkspaceShell } from "../components/workspace/workspace-shell";
import { flagshipRole } from "../data/flagship-role";
import { createDemoState, loadDemoState, type DemoState } from "../lib/demo-store";

export default function ProofPage() {
  const [state, setState] = useState<DemoState>(createDemoState());
  useEffect(() => setState(loadDemoState()), []);
  return <WorkspaceShell current="Proof"><ProofProfile proofs={state.proofs} skills={flagshipRole.skills} /></WorkspaceShell>;
}
```

- [ ] **Step 6: Add Proof styles**

Append to `app/globals.css`:

```css
.proof-profile { max-width: 980px; margin: 0 auto; }
.profile-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 30px; }
.profile-heading h1 { max-width: 700px; margin: 18px 0; font-family: var(--display); font-size: clamp(4rem, 8vw, 7.5rem); font-weight: 440; line-height: 0.86; letter-spacing: -0.06em; }
.readiness { text-align: right; }
.readiness strong, .readiness span { display: block; }
.readiness strong { font-family: var(--display); font-size: 4rem; font-weight: 450; }
.readiness span { color: var(--stone); }
.proof-profile ol { margin: 72px 0 0; padding: 0; list-style: none; }
.proof-profile li { display: flex; justify-content: space-between; padding: 24px 0; border-top: 1px solid var(--hairline); }
.proof-profile li strong, .proof-profile li span { display: block; }
.proof-profile li span { margin-top: 6px; color: var(--stone); }
.proof-profile li b { color: var(--success); }
.empty-proof { margin: 72px 0; border-top: 1px solid var(--hairline); padding-top: 24px; color: var(--stone); }
.share-profile { border: 0; border-bottom: 1px solid currentColor; background: transparent; padding: 0 0 4px; cursor: pointer; }
```

- [ ] **Step 7: Run and commit**

Run:

```powershell
npm run test:unit -- tests/lib/proof-profile.test.ts tests/components/proof-profile.test.tsx
```

Expected: PASS with `3 passed` total.

Commit:

```powershell
git add app/lib/proof-profile.ts app/components/proof app/proof app/globals.css tests/lib/proof-profile.test.ts tests/components/proof-profile.test.tsx
git commit -m "feat: add evidence-based Proof profile"
```

### Task 11: Complete responsive, focus, and reduced-motion behavior

**Files:**
- Modify: `app/globals.css`
- Create: `tests/components/accessibility-contracts.test.tsx`

- [ ] **Step 1: Write the failing accessibility-contract test**

Create `tests/components/accessibility-contracts.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteHeader } from "../../app/components/brand/site-header";
import { WorkspaceShell } from "../../app/components/workspace/workspace-shell";

describe("navigation accessibility contracts", () => {
  it("names public and workspace navigation independently", () => {
    render(<><SiteHeader /><WorkspaceShell current="Today"><p>content</p></WorkspaceShell></>);
    expect(screen.getByRole("navigation", { name: "Public navigation" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Learning workspace" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
  });
});
```

- [ ] **Step 2: Run the accessibility test before mobile styling**

Run:

```powershell
npm run test:unit -- tests/components/accessibility-contracts.test.tsx
```

Expected: PASS for semantics. Record this as the baseline before CSS-only responsive changes.

- [ ] **Step 3: Add exact mobile and reduced-motion rules**

Append to `app/globals.css`:

```css
@media (max-width: 760px) {
  :root { --content: calc(100vw - 32px); }
  .site-header { grid-template-columns: 1fr auto; height: 62px; }
  .public-nav { display: none; }
  .hero-poster { grid-template-columns: 1fr; min-height: calc(100svh - 62px); padding-top: 64px; }
  .hero-copy h1 { font-size: clamp(4rem, 20vw, 6.5rem); }
  .story-rail { margin-top: 72px; min-height: 420px; }
  .product-preview { grid-template-columns: 1fr; }
  .product-preview .section-index { grid-column: 1; }
  .editorial-section, .final-cta { padding: 84px 0; }
  .workspace-header { position: fixed; top: auto; bottom: 0; left: 0; right: 0; grid-template-columns: 0 auto 0; height: 64px; padding: 0 18px; }
  .workspace-header > .wordmark, .workspace-context { overflow: hidden; width: 0; opacity: 0; }
  .workspace-header nav { gap: 0; width: calc(100vw - 36px); justify-content: space-between; }
  .workspace-header nav a { min-width: 64px; min-height: 44px; display: grid; place-items: center; }
  .workspace-main { padding: 60px 0 100px; }
  .workspace-intro h1, .profile-heading h1 { font-size: clamp(3.8rem, 18vw, 6rem); }
  .skill-list article { grid-template-columns: 1fr; gap: 20px; }
  .profile-heading { flex-direction: column; }
  .readiness { text-align: left; }
  .answer-grid { grid-template-columns: 1fr; }
  .deliverable-bar { align-items: flex-start; flex-direction: column; }
}

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
}
```

- [ ] **Step 4: Run the full unit suite and commit**

Run:

```powershell
npm run test:unit
```

Expected: every Vitest file passes.

Commit:

```powershell
git add app/globals.css tests/components/accessibility-contracts.test.tsx
git commit -m "feat: complete responsive accessible behavior"
```

### Task 12: Verify the complete local demo loop and production build

**Files:**
- Create: `tests/lib/core-loop.test.ts`
- Modify: `README.md`
- Verify: `app/_sites-preview/` absent
- Verify: `package.json` has no `react-loading-skeleton`

- [ ] **Step 1: Write the end-to-end domain-loop test**

Create `tests/lib/core-loop.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { flagshipRole } from "../../app/data/flagship-role";
import { completeDemoUnit, createDemoState, mergeSetup } from "../../app/lib/demo-store";
import { calculateReadiness } from "../../app/lib/proof-profile";

describe("Arc flagship demo loop", () => {
  it("moves from setup through completion into attributable readiness", () => {
    const configured = mergeSetup(createDemoState(), {
      roleId: flagshipRole.id,
      level: "beginner",
      weeklyMinutes: 420,
      targetWeeks: 18,
    });
    const completed = completeDemoUnit(configured, flagshipRole.today);
    const readiness = calculateReadiness(flagshipRole.skills, completed.proofs);
    expect(completed.completedUnitIds).toEqual([flagshipRole.today.id]);
    expect(completed.proofs[0].skillIds).toEqual(flagshipRole.today.skillIds);
    expect(readiness.percentage).toBe(19);
  });
});
```

- [ ] **Step 2: Run the loop test**

Run:

```powershell
npm run test:unit -- tests/lib/core-loop.test.ts
```

Expected: PASS. If the percentage differs, fix the fixture or calculation rather than weakening the assertion; 3 of 16 verified skills must equal 19% after rounding.

- [ ] **Step 3: Replace the starter README with exact local usage and phase boundary**

Replace `README.md` with:

````md
# Arc.

Arc. turns a target role into an attributable technology map, a precise daily path, and proof of capability.

## Local development

```powershell
npm install
npm run dev
```

## Verification

```powershell
npm run test:unit
npm run build
node --test tests/rendered-html.test.mjs
```

## Current implementation

Experience Foundation is a deterministic, device-local flagship demo covering setup, Path, Today, Stack, and Proof. D1 intelligence, authentication, uploads, and live model providers are defined in the approved design specification and are implemented in the next subsystem plans.
````

- [ ] **Step 4: Verify all starter artifacts are gone**

Run:

```powershell
rg -n "codex-preview|SkeletonPreview|react-loading-skeleton|Your site is taking shape" app package.json tests
```

Expected: no matches.

Run:

```powershell
Test-Path 'app\_sites-preview'
```

Expected: `False`.

- [ ] **Step 5: Run the complete verification gate**

Keep the retained `npm run dev` process alive, then run:

```powershell
npm run test:unit
npm run build
node --test tests/rendered-html.test.mjs
git status --short
```

Expected:

- Vitest: all tests PASS.
- Build: exits `0` and produces Cloudflare Worker-compatible output.
- Rendered HTML test: PASS.
- Git status: only the intended Task 12 files are modified or untracked.

Do not perform browser DOM inspection, clicking, screenshots, or visual QA unless the user separately authorizes browser testing.

- [ ] **Step 6: Commit the verified Experience Foundation**

```powershell
git add README.md tests/lib/core-loop.test.ts
git commit -m "test: verify Arc flagship experience"
```

- [ ] **Step 7: Record the phase handoff**

Run:

```powershell
git log --oneline -12
git status --short
```

Expected: one focused commit per task, clean tracked worktree, and a runnable Experience Foundation ready for review before the Product Intelligence plan is written.
