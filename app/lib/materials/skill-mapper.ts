import { materialSelfAssessmentAdoptionSchema, type ConfirmedMaterialItem } from "../../contracts/documents";
import type { RoleBlueprint } from "../../contracts/intelligence";
import type { UnitRegistry, SkillSelfLevel } from "../../contracts/planning";
import { validateUnitRegistry } from "../planning/registry-validation";
import { containsMaterialSkillLabel, normalizeMaterialSkillLabel } from "./skill-labels";
export const MATERIAL_MAPPING_VERSION = "2026.11.4" as const;
const literalAliasVersion = "2026.11.2";
const groundedAliasVersion = "2026.11.3";
export type MaterialSkillMapping = {
    itemId: string;
    status: "mapped" | "ambiguous" | "uncovered" | "non-learning";
    skillIds: string[];
    labels: string[];
};
export type MappingOptions = {
    userMappings?: Record<string, string[]>;
    aliases?: Readonly<{
        version: typeof MATERIAL_MAPPING_VERSION | typeof literalAliasVersion | typeof groundedAliasVersion;
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
        testing: ["Vitest", "Jest", "Playwright", "单元测试", "自动化测试", "unit testing"],
        security: ["应用安全", "OWASP", "访问控制"],
        "cloud-delivery": ["持续部署", "持续交付", "CI/CD"],
        observability: ["OpenTelemetry", "可观测性", "分布式追踪", "distributed tracing"],
        "llm-contracts": ["结构化模型输出", "结构化大模型输出", "LLM schema"],
        retrieval: ["RAG", "检索增强生成", "证据检索"],
        "product-thinking": ["产品思维"],
        "proof-of-work": ["作品证据", "作品集证明"],
    }
};
/** Literal IDs/names and versioned aliases; similarity scores never establish a mapping. */
export function mapMaterialItems(items: readonly ConfirmedMaterialItem[], blueprint: RoleBlueprint, registry: UnitRegistry, options: MappingOptions = {}): MaterialSkillMapping[] {
    const valid = blueprint.status === "ready" && validateUnitRegistry(registry, blueprint).valid;
    const aliases = options.aliases ?? (blueprint.id === "ai-native-full-stack-engineer" && blueprint.version === "2026.08.1" ? FLAGSHIP_ALIASES : undefined);
    const reviewed = aliases?.version === MATERIAL_MAPPING_VERSION || aliases?.version === literalAliasVersion
      || aliases?.version === groundedAliasVersion ? aliases.skills : {};
    const vocabulary = blueprint.skills.map(skill => ({ id: skill.id, name: skill.name, words: [
        skill.id, skill.name, ...(reviewed[skill.id] ?? [])
    ] }));
    return items.flatMap((item): MaterialSkillMapping[] => {
        if (item.kind === "constraint")
            return [{ itemId: item.id, status: "non-learning", skillIds: [], labels: [] }];
        const manual = options.userMappings?.[item.id];
        // A present list is the user's reviewed vocabulary, including an intentionally empty list.
        // Manual and older facts have only their confirmed text.
        const terms = manual ? [item.text] : item.skillLabels ?? [item.text];
        const groups = new Map<MaterialSkillMapping["status"], MaterialSkillMapping>();
        for (const term of terms) {
            const matches = vocabulary.filter(skill => manual ? manual.includes(skill.id) : skill.words.some(word =>
                item.skillLabels ? normalizeMaterialSkillLabel(term) === normalizeMaterialSkillLabel(word) : containsMaterialSkillLabel(term, word)));
            const status = !valid || !matches.length ? "uncovered" : !manual && matches.length > 1 ? "ambiguous" : "mapped";
            const group = groups.get(status) ?? { itemId: item.id, status, skillIds: [], labels: [] };
            if (valid) group.skillIds.push(...matches.map(skill => skill.id));
            group.labels.push(...(matches.length && (valid || !item.skillLabels) ? matches.map(skill => skill.name) : [term.slice(0, 100)]));
            groups.set(status, group);
        }
        return [...groups.values()].map(group => ({ ...group, skillIds: [...new Set(group.skillIds)], labels: [...new Set(group.labels)] }));
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
