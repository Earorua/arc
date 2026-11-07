import { materialSelfAssessmentAdoptionSchema, type ConfirmedMaterialItem } from "../../contracts/documents";
import type { RoleBlueprint } from "../../contracts/intelligence";
import type { UnitRegistry, SkillSelfLevel } from "../../contracts/planning";
import { validateUnitRegistry } from "../planning/registry-validation";
import { createContextualSkillMatcher } from "./contextual-skill-mapping";
import { containsMaterialSkillLabel, normalizeMaterialSkillLabel } from "./skill-labels";
export const MATERIAL_MAPPING_VERSION = "2026.11.5" as const;
const literalAliasVersion = "2026.11.2";
const groundedAliasVersion = "2026.11.3";
const tracingAliasVersion = "2026.11.4";
export type MaterialSkillMapping = {
    itemId: string;
    status: "mapped" | "ambiguous" | "uncovered" | "non-learning";
    skillIds: string[];
    labels: string[];
};
export type MaterialTermMapping = {
    itemId: string;
    term: string;
    status: MaterialSkillMapping["status"] | "omitted";
    skillIds: string[];
    basis: "literal" | "contextual" | "manual" | null;
};
export type MappingOptions = {
    userMappings?: Record<string, string[]>;
    termMappings?: Record<string, { skillLabel: string; skillIds: string[] }[]>;
    learningIntentItemIds?: readonly string[];
    aliases?: Readonly<{
        version: typeof MATERIAL_MAPPING_VERSION | typeof literalAliasVersion | typeof groundedAliasVersion | typeof tracingAliasVersion;
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
type ResolvedMaterialTerm = MaterialTermMapping & { labels: string[] };

function resolveMaterialTerms(items: readonly ConfirmedMaterialItem[], blueprint: RoleBlueprint, registry: UnitRegistry, options: MappingOptions): ResolvedMaterialTerm[] {
    const valid = blueprint.status === "ready" && validateUnitRegistry(registry, blueprint).valid;
    const matchContextual = createContextualSkillMatcher(blueprint, registry);
    const aliases = options.aliases ?? (blueprint.id === "ai-native-full-stack-engineer" && blueprint.version === "2026.08.1" ? FLAGSHIP_ALIASES : undefined);
    const reviewed = aliases?.version === MATERIAL_MAPPING_VERSION || aliases?.version === literalAliasVersion
      || aliases?.version === groundedAliasVersion || aliases?.version === tracingAliasVersion ? aliases.skills : {};
    const vocabulary = blueprint.skills.map(skill => ({ id: skill.id, name: skill.name, words: [
        skill.id, skill.name, ...(reviewed[skill.id] ?? [])
    ] }));
    return items.flatMap((item): ResolvedMaterialTerm[] => {
        if (item.kind === "constraint" && !options.learningIntentItemIds?.includes(item.id)) {
            return (item.skillLabels ?? [item.text]).map(term => ({
                itemId: item.id, term, status: "non-learning", skillIds: [], basis: null, labels: [],
            }));
        }
        const manual = options.userMappings && Object.hasOwn(options.userMappings, item.id) ? options.userMappings[item.id] : undefined;
        const termMappings = options.termMappings && Object.hasOwn(options.termMappings, item.id) ? options.termMappings[item.id] : undefined;
        // A present list is the user's reviewed vocabulary, including an intentionally empty list.
        // Manual and older facts have only their confirmed text.
        const terms = manual ? [item.text] : item.skillLabels ?? [item.text];
        return terms.map((term): ResolvedMaterialTerm => {
            // Exact retained-label membership is intentional. Deleted and legacy terms cannot be restored by an override.
            const termMapping = !manual && item.skillLabels ? termMappings?.find(mapping => mapping.skillLabel === term) : undefined;
            if (termMapping && termMapping.skillIds.length === 0) return {
                itemId: item.id, term, status: "omitted", skillIds: [], basis: "manual", labels: [],
            };
            const selected = manual ?? termMapping?.skillIds;
            let matches = vocabulary.filter(skill => selected ? selected.includes(skill.id) : skill.words.some(word =>
                item.skillLabels ? normalizeMaterialSkillLabel(term) === normalizeMaterialSkillLabel(word) : containsMaterialSkillLabel(term, word)));
            let basis: MaterialTermMapping["basis"] = selected ? "manual" : valid && matches.length ? "literal" : null;
            if (!selected && !matches.length && valid && item.skillLabels) {
                const contextualIds = matchContextual(term, item.text);
                matches = vocabulary.filter(skill => contextualIds.includes(skill.id));
                if (matches.length) basis = "contextual";
            }
            const status = !valid || !matches.length ? "uncovered" : !selected && matches.length > 1 ? "ambiguous" : "mapped";
            return { itemId: item.id, term, status, skillIds: valid ? matches.map(skill => skill.id) : [], basis,
                labels: matches.length && (valid || !item.skillLabels) ? matches.map(skill => skill.name) : [term.slice(0, 100)] };
        });
    });
}

/** Resolve only confirmed retained terms, preserving their raw wording and the mapping basis. */
export function mapMaterialItemTerms(items: readonly ConfirmedMaterialItem[], blueprint: RoleBlueprint, registry: UnitRegistry, options: MappingOptions = {}): MaterialTermMapping[] {
    return resolveMaterialTerms(items, blueprint, registry, options).map(({ itemId, term, status, skillIds, basis }) => ({
        itemId, term, status, skillIds, basis,
    }));
}

/** Compatibility projection: omitted terms are visible only in the per-term API. */
export function mapMaterialItems(items: readonly ConfirmedMaterialItem[], blueprint: RoleBlueprint, registry: UnitRegistry, options: MappingOptions = {}): MaterialSkillMapping[] {
    const resolved = resolveMaterialTerms(items, blueprint, registry, options);
    return items.flatMap((item): MaterialSkillMapping[] => {
        if (item.kind === "constraint" && !options.learningIntentItemIds?.includes(item.id))
            return [{ itemId: item.id, status: "non-learning", skillIds: [], labels: [] }];
        const groups = new Map<MaterialSkillMapping["status"], MaterialSkillMapping>();
        for (const mapping of resolved.filter(mapping => mapping.itemId === item.id)) {
            if (mapping.status === "omitted") continue;
            const group = groups.get(mapping.status) ?? { itemId: item.id, status: mapping.status, skillIds: [], labels: [] };
            group.skillIds.push(...mapping.skillIds);
            group.labels.push(...mapping.labels);
            groups.set(mapping.status, group);
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
