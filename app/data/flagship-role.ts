import type { RoleProfile, SkillCategory, SkillImportance, SkillNode } from "../domain/learning";

const observedAt = "2026-07-26";

const confidenceByImportance: Record<SkillImportance, number> = {
  core: 0.96,
  strong: 0.9,
  advantage: 0.82,
};

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
    confidence: confidenceByImportance[importance],
    prerequisiteIds,
    sources: [{ title: `${name} official documentation`, url, observedAt }],
  };
}

export const flagshipRole: RoleProfile = {
  id: "ai-native-full-stack-engineer",
  name: "AI 原生全栈工程师",
  summary: "Design, build, validate, and ship AI-enabled products across the full stack.",
  version: "2026.07",
  updatedAt: observedAt,
  skills: [
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
  ],
  phases: [
    { id: "foundations", name: "Product Foundations", weeks: 4, outcome: "Build an accessible React product surface with explicit contracts.", skillIds: ["web-platform", "typescript", "react", "design-systems", "product-thinking"] },
    { id: "systems", name: "Full-Stack Systems", weeks: 5, outcome: "Ship a typed edge API backed by relational data.", skillIds: ["http-apis", "edge-runtime", "sql", "testing"] },
    { id: "intelligence", name: "AI & Evidence", weeks: 5, outcome: "Generate schema-valid AI data grounded in sources.", skillIds: ["llm-contracts", "retrieval", "security", "object-storage"] },
    { id: "production", name: "Production Proof", weeks: 4, outcome: "Deploy, observe, and present a verifiable production build.", skillIds: ["cloud-delivery", "observability", "proof-of-work"] },
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
