import { materialSelfAssessmentAdoptionSchema, type ConfirmedMaterialItem } from "../../contracts/documents";
import type { RoleBlueprint } from "../../contracts/intelligence";
import type { UnitRegistry, SkillSelfLevel } from "../../contracts/planning";
import { validateUnitRegistry } from "../planning/registry-validation";
export const MATERIAL_MAPPING_VERSION = "2026.11.2" as const;
export type MaterialSkillMapping = {
    itemId: string;
    status: "mapped" | "ambiguous" | "uncovered" | "non-learning";
    skillIds: string[];
    labels: string[];
};
export type MappingOptions = {
    userMappings?: Record<string, string[]>;
    aliases?: Readonly<{
        version: typeof MATERIAL_MAPPING_VERSION;
        skills: Record<string, string[]>;
    }>;
};
/** Reviewed literal vocabulary for one published catalog; Research never inherits another role's aliases. */
const FLAGSHIP_ALIASES: NonNullable<MappingOptions["aliases"]> = {
    version: MATERIAL_MAPPING_VERSION,
    skills: {
        "web-platform": ["HTML", "HTML5", "CSS", "CSS3", "JavaScript", "网页基础", "浏览器基础"],
        typescript: ["类型脚本"],
        react: ["React.js", "ReactJS"],
        "design-systems": ["design system", "设计系统", "无障碍设计", "WAI-ARIA"],
        "http-apis": ["REST API", "RESTful API", "接口设计", "HTTP接口"],
        "edge-runtime": ["Cloudflare Workers", "边缘运行时", "边缘计算"],
        sql: ["SQLite", "PostgreSQL", "MySQL", "关系数据库", "关系型数据库"],
        "object-storage": ["对象存储", "Cloudflare R2", "Amazon S3"],
        testing: ["Vitest", "Jest", "Playwright", "单元测试", "自动化测试"],
        security: ["应用安全", "OWASP", "访问控制"],
        "cloud-delivery": ["持续部署", "持续交付", "CI/CD"],
        observability: ["OpenTelemetry", "可观测性", "分布式追踪"],
        "llm-contracts": ["结构化模型输出", "结构化大模型输出", "LLM schema"],
        retrieval: ["RAG", "检索增强生成", "证据检索"],
        "product-thinking": ["产品思维"],
        "proof-of-work": ["作品证据", "作品集证明"],
    }
};
function containsToken(text: string, label: string) {
    const normalized = text.normalize("NFKC").toLowerCase(), token = label.normalize("NFKC").toLowerCase();
    let offset = normalized.indexOf(token);
    while (offset >= 0) {
        const before = normalized[offset - 1] ?? "", after = normalized[offset + token.length] ?? "";
        if (!/^[a-z0-9_]/u.test(token) || (!/[a-z0-9_]/u.test(before) && !/[a-z0-9_]/u.test(after)))
            return true;
        offset = normalized.indexOf(token, offset + 1);
    }
    return false;
}
/** Literal IDs/names and versioned aliases; similarity scores never establish a mapping. */
export function mapMaterialItems(items: readonly ConfirmedMaterialItem[], blueprint: RoleBlueprint, registry: UnitRegistry, options: MappingOptions = {}): MaterialSkillMapping[] {
    const valid = blueprint.status === "ready" && validateUnitRegistry(registry, blueprint).valid;
    const aliases = options.aliases ?? (blueprint.id === "ai-native-full-stack-engineer" && blueprint.version === "2026.08.1" ? FLAGSHIP_ALIASES : undefined);
    return items.map(item => {
        if (item.kind === "constraint")
            return { itemId: item.id, status: "non-learning", skillIds: [], labels: [] };
        const manual = options.userMappings?.[item.id], matches = blueprint.skills.filter(skill => manual ? manual.includes(skill.id) : [
            skill.id, skill.name, ...(aliases?.version === MATERIAL_MAPPING_VERSION ? aliases.skills[skill.id] ?? [] : [])
        ].some(label => containsToken(item.text, label)));
        const skillIds = matches.map(skill => skill.id);
        return {
            itemId: item.id,
            status: !valid || skillIds.length === 0 ? "uncovered" : !manual && skillIds.length > 1 ? "ambiguous" : "mapped",
            skillIds: valid ? skillIds : [],
            labels: matches.length ? matches.map(skill => skill.name) : [item.text.slice(0, 100)]
        };
    });
}
/** Called only by a separate, explicit user adoption action; fact confirmation never calls this. */
export function adoptMaterialSelfAssessments(existing: Record<string, SkillSelfLevel>, adoption: unknown, blueprint: RoleBlueprint): Record<string, SkillSelfLevel> {
    if (adoption === null)
        return { ...existing };
    const parsed = materialSelfAssessmentAdoptionSchema.parse(adoption), next = { ...existing };
    for (const decision of parsed.decisions) {
        if (!blueprint.skills.some(skill => skill.id === decision.skillId))
            throw new Error("UNKNOWN_SKILL");
        next[decision.skillId] = decision.level;
    }
    return next;
}
