import type { RoleBlueprint } from "../../contracts/intelligence";
import type { UnitRegistry } from "../../contracts/planning";
import { validateUnitRegistry } from "../planning/registry-validation";
import { findMaterialSkillEvidence } from "./grounded-skill-terms";
import { normalizeMaterialSkillLabel } from "./skill-labels";

type ContextualSkillMatcher = (term: string, text: string) => string[];

// These are course relationships for this published catalog, not extraction aliases.
// Every rule needs a retained term and evidence in its own sentence or clause.
const uiTerm = /^(?:(?:(?:ui|design)[ -])?tokens?|(?:(?:ui|interface|reusable|accessible)[ -])?components?(?:[ -]states?)?|local[ -]states?|设计令牌|界面组件|交互组件|组件(?:状态)?|本地状态|局部状态)$/u;
const uiContext = /\b(?:ui|user interfaces?|figma|interfaces?|accessible|accessibility)\b|界面|交互|无障碍/u;
const uiBehavior = /\b(?:components?|controls?|tokens?|focus|contrast|keyboard|states?|loading|disabled|error)\b|组件|控件|令牌|焦点|对比度|键盘|状态/u;
const unrelatedTokens = /\b(?:oauth|jwt|access|refresh|authentication|authorization|llm|prompts?|tokenization|language models?)\b|鉴权|认证|授权|访问令牌|刷新令牌|大模型|分词|提示词/u;

const modelingTerm = /^(?:(?:(?:relational|data|database|table|schema)[ -])?modell?ing|(?:关系(?:表|数据)?|关系型|数据表|数据库|数据)?建模|表设计|表结构设计)$/u;
const relationalContext = /\b(?:sql|sqlite|postgresql|mysql|relational|databases?|schema|foreign keys?|primary keys?)\b|数据库|关系表|数据表|主键|外键|表关系|表结构/u;
const unrelatedModeling = /\b(?:financial|predictive|statistical|forecasting|machine learning|3d)\b|财务|财会|金融|预测|统计|机器学习|三维/u;

const signalTerm = /^(?:(?:(?:api|server|application|operational|runtime|structured|error|request|service)[ -])?(?:logs?|logging|traces?|tracing)|(?:运行|服务|接口|系统|应用|请求|错误)?日志|(?:请求|接口|服务|调用|链路)?追踪)$/u;
// Service, requests, latency and their Chinese counterparts also describe physical
// operations. Only an explicit software/runtime domain can qualify a log or trace.
const operationalContext = /\b(?:api|http|runtime|telemetry|software)\b|服务器|软件|接口|运行时/u;
const unrelatedSignals = /\b(?:woodworking|timber|lumber|firewood|paint|footprints?)\b|木工|原木|木材|颜料/u;

const testingTerm = /^(?:(?:(?:async|asynchronous|component|software|integration|regression|behavioral|behavioural)[ -])?(?:tests?|testing)|test(?:ing)?[ -](?:async|asynchronous)[ -]logic|异步测试|组件测试|软件测试|测试异步逻辑)$/u;
// Requests, retries and timeouts can describe laboratory or service processes too.
const softwareContext = /\b(?:software|code|api|http|vitest|jest|playwright|typescript|javascript)\b|软件|代码|接口/u;

// Preserve contrast/denial markers in the following clause; removing "rather than"
// or "而非" would turn a denied second occurrence into affirmative evidence.
// Comma boundaries intentionally withhold relationships that require joining clauses.
const contextScopeBreak = /[。！？!?;；,，\n]|\.(?:\s+|$)|(?=\b(?:but|whereas|while|although|though|however|yet|rather than|except for|excluding)\b)|\band\s+(?=(?:i|we|our|they|my|she|he|the|another|other|not|never)\b)|(?=但是|不过|然而|而|但|却|同时)/giu;
// Extraction already checks the nominated term. Inferring a related course also
// requires an unambiguous affirmative clause, so mixed-polarity clauses stay uncovered.
const nonAffirmativeContext = /\b(?:not(?!\s+only\b)|no|never|neither|without|cannot|[a-z]{1,30}n['’]t|rather than|except|excluding)\b|不(?!仅|只)|没有|并非|而非|未(?:曾|能|做|使用|涉及|包含|支持)|无[需须]/u;

function hasGroundedContext(context: string, pattern: RegExp) {
  for (const match of context.matchAll(new RegExp(pattern.source, "gu"))) {
    // Reuse the same boundary, negation, and literal-evidence rules as retained terms.
    if (findMaterialSkillEvidence(context, match[0]) !== null) return true;
  }
  return false;
}

/** Keep these rules closed for Research and for unvalidated or different catalog versions. */
export function createContextualSkillMatcher(blueprint: RoleBlueprint, registry: UnitRegistry): ContextualSkillMatcher {
  if (blueprint.id !== "ai-native-full-stack-engineer" || blueprint.version !== "2026.08.1"
    || blueprint.status !== "ready" || registry.id !== "ai-native-full-stack-engineer-units"
    || registry.version !== "2026.08.1" || !validateUnitRegistry(registry, blueprint).valid) return () => [];

  return (term, text) => {
    const token = normalizeMaterialSkillLabel(term);
    // Never borrow a qualifier from another clause or add a term found only in the text.
    const contexts = text.split(contextScopeBreak).map(normalizeMaterialSkillLabel)
      .filter(context => !nonAffirmativeContext.test(context) && findMaterialSkillEvidence(context, term) !== null);
    const matches = new Set<string>();
    for (const context of contexts) {
      if (uiTerm.test(token) && hasGroundedContext(context, uiContext) && hasGroundedContext(context, uiBehavior)
        && !unrelatedTokens.test(context)) matches.add("design-systems");
      if (modelingTerm.test(token) && !unrelatedModeling.test(context)
        && (hasGroundedContext(context, relationalContext)
          || (hasGroundedContext(context, /\btables?\b/u) && hasGroundedContext(context, /\b(?:relationships?|relations?|keys?)\b/u)))) matches.add("sql");
      if (signalTerm.test(token) && hasGroundedContext(context, operationalContext) && !unrelatedSignals.test(context)) matches.add("observability");
      if (testingTerm.test(token) && hasGroundedContext(context, softwareContext)) matches.add("testing");
    }
    return [...matches];
  };
}
