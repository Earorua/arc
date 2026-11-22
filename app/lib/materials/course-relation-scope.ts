import { findMaterialSkillEvidence, findMaterialSkillMention } from "./grounded-skill-terms";
import { normalizeMaterialSkillLabel } from "./skill-labels";

const sentenceBreak = /[。！？!?;；]|\.(?:\s+|$)/u;
const clauseBreak = /[,，]|(?=\b(?:but|whereas|while|although|however|rather than)\b)|\band\s+(?=(?:i|we|they|my|another|the)\b)|(?=但是|不过|然而|而|但|同时)/iu;
export const deniedCourseContext = /\b(?:not(?!\s+only\b)|no|never|neither|without|cannot|[a-z]{1,30}n['’]t|rather than|except|excluding)\b|不(?!仅|只)|没有|并非|而非|未(?:曾|能|做|用|使用|通过|涉及|包含|支持)|无[需须]/u;
const prohibitedAction = /\b(?:forbid(?:s|den|ding)?|forbade|prohibit(?:s|ed|ing)?|ban(?:s|ned|ning)?|disallow(?:s|ed|ing)?)\s+(?:(?:to|from)\s+)?(?:test(?:ing)?|inspect(?:ing)?)\b/u;
const sqlContext = /\b(?:sql|sqlite|postgresql|mysql|join|cte)\b|关系数据库/u;
const softwareContext = /\b(?:software|code|api|http|typescript|javascript|python|dbt|vitest|jest|playwright)\b|软件|代码|接口|数据管道/u;
const reactContext = /\breact\b/u;
const explicitTesting = /^(?:vitest|jest|playwright|unit test(?:s|ing)?|automated tests?|automated testing|software tests?|software testing|单元测试|自动化测试|软件测试)$/u;
const testingTask = /(?:\btests?\b|\btesting\b|测试)/u;
const attachedWcagLabels = /\bwcag(?:\s*(?:的|关于)\s*表单标签|\s+(?:(?:guidance|guidelines) for )?form[ -]labels?)/u;
const typeScriptBehavior = String.raw`(?:(?:async(?:hronous)?|synchronous)\s+)?typescript\s+behaviou?rs?`;
const testingObject = new RegExp(`^(?:测试|${typeScriptBehavior})$`, "u");
const testedBehavior = new RegExp(String.raw`\btest(?:s|ed|ing)?\s+(?:the\s+)?(${typeScriptBehavior})(?=$|\s*[([]|\s+(?:for|with|using|in|under|on|before|after|when|if|during|across|and|or)\b)`, "gu");
const apiLogInspection = /^(?:(?:inspect|interpret)(?:s|ed|ing)? (?:the )?)?api (?:error )?logs?$/u;

/** These retained objects acquire a testing relation only from their source actions. */
export function isContextualTestingObject(term: string) {
  return testingObject.test(normalizeMaterialSkillLabel(term));
}

/** Scope here concerns what is discussed, never who practiced it or adopted it. */
export function courseRelationSentences(text: string, term: string): string[] {
  return text.split(sentenceBreak).filter(part => findMaterialSkillMention(part, term) !== null);
}

function ownContexts(text: string, term: string) {
  return courseRelationSentences(text, term).flatMap(sentence => sentence.split(clauseBreak))
    .filter(part => findMaterialSkillMention(part, term) !== null);
}

// A coordinated rule-writing step names its source operation again. Require
// that operation immediately after the tool in the preceding affirmative clause.
function hasLinkedRuleTest(sentence: string) {
  const clauses = normalizeMaterialSkillLabel(sentence).split(clauseBreak).map(part => part.trim());
  return clauses.some((clause, index) => {
    const rule = /^并(?:且)?(?:把|将)(清洗|校验|解析|转换)规则(?:写入|写进|编入)测试$/u.exec(clause);
    const previous = clauses[index - 1];
    if (!rule || !previous || deniedCourseContext.test(previous)) return false;
    const tool = /(?:使用|用|通过)\s*([a-z][a-z0-9+#-]*|代码)\s*(?:来)?/u.exec(previous);
    return !!tool && softwareContext.test(tool[1]!) && previous.slice(tool.index + tool[0].length).startsWith(rule[1]!)
      && findMaterialSkillEvidence(previous, tool[1]!) !== null;
  });
}

/** Additional bounded concepts, separate from literal course names and aliases. */
export function courseRelationTopics(term: string, text: string): string[] {
  const token = normalizeMaterialSkillLabel(term), topics = new Set<string>();
  const contexts = ownContexts(text, term);
  if (!contexts.length && !courseRelationSentences(text, term).length) return [];
  // These technical names supply their own domain, including in a denied
  // experience statement. Generic words below still require affirmative context.
  if (/\bsql\b/u.test(token) || token === "cte" || term === "JOIN"
    || /^(?:distributed tracing|opentelemetry|分布式追踪)$/u.test(token)) {
    topics.add(/\bsql\b/u.test(token) || token === "cte" || term === "JOIN" ? "sql" : "observability");
  }
  if (explicitTesting.test(token)) topics.add("testing");
  for (const rawContext of contexts) {
    const context = normalizeMaterialSkillLabel(rawContext).trim();
    if (deniedCourseContext.test(context) || prohibitedAction.test(context)) continue;
    const has = (pattern: RegExp) => [...rawContext.matchAll(new RegExp(pattern.source, "giu"))]
      .some(match => findMaterialSkillEvidence(rawContext, match[0]) !== null);
    if (has(sqlContext) && /^(?:cte|join|queries|query|(?:model )?warehouse tables|reconcile\b.*|汇总查询|联表|查询|窗口计算|空值(?:边界|处理)|替换了?日期参数|重复行问题|完成报表)$/u.test(token)) topics.add("sql");
    if (/\btypescript\b/u.test(token) || has(/\btypescript\b/u) && /^(?:(?:implement|build) (?:ui|interface) logic|实现界面逻辑)$/u.test(token)) topics.add("typescript");
    if (has(reactContext) && /^(?:react\b.*|(?:semantic )?forms?|prototype|component (?:states?|tests?|testing)|interaction tests?|表单|原型|组件状态设计|组件测试|交互测试)$/u.test(token)) topics.add("react");
    if (/^(?:html5?|semantic html forms?|labeled (?:semantic )?html forms?|accessible form labels|表单标签)$/u.test(token)
      && /\b(?:forms?|labels?)\b|表单|标签/u.test(context)) topics.add("web-platform");
    // WCAG is much broader than these courses. Only its explicitly attached
    // form-label task has this contextual, still ambiguous, relationship.
    if (token === "wcag" && attachedWcagLabels.test(context)) {
      topics.add("web-platform"); topics.add("design-systems");
    }
    if (/^(?:accessible form labels|表单标签|键盘焦点顺序|键盘可访问性的基本检查|按钮状态|组件说明|keyboard focus(?: order)?|button states?|component descriptions?)$/u.test(token)) topics.add("design-systems");
    if (/^(?:ui tokens?|design tokens?)$/u.test(token)) topics.add("design-systems");
    if (testingTask.test(token) && (has(softwareContext) || has(reactContext)
      || /^(?:清洗规则写入测试|脚本测试)$/u.test(token))) topics.add("testing");
    if ([...context.matchAll(testedBehavior)].some(match => match[1] === token)) topics.add("testing");
    if ((apiLogInspection.test(token) || /^(?:log parser|traced? (?:one |a )?(?:failed )?request|document incidents)$/u.test(token))
      && (has(/\b(?:api|opentelemetry|python|software)\b/u) || /^api /u.test(token))) topics.add("observability");
    if (/^(?:trace|log)$/u.test(token) && /difference between (?:a )?trace and (?:a )?log/u.test(context)) topics.add("observability");
    if (/^(?:(?:(?:review|reviewing|write|create|author) (?:a |the )?)?(?:release|migration) checklist|end-to-end deployment exercise|记录回滚步骤|rollback documentation)$/u.test(token)) topics.add("cloud-delivery");
    if (/^(?:(?:define|design) )?product metrics$/u.test(token)) topics.add("product-thinking");
  }
  if (token === "测试" && courseRelationSentences(text, term).some(hasLinkedRuleTest)) topics.add("testing");
  // A testing clause explicitly attached to a React artifact and assisted by a
  // partner refers to that artifact. This is not another actor's unrelated work.
  if (/^交互测试$/u.test(token) && courseRelationSentences(text, term).some(sentence =>
    /\breact\b[^,，]*(?:prototype|原型)[,，]\s*交互测试由[^。;；]*(?:协助|帮助)/iu.test(sentence))) {
    topics.add("react"); topics.add("testing");
  }
  // A supplied SQL artifact can be the direct antecedent of replacing its date
  // parameter. This closed attachment does not join arbitrary comma clauses,
  // another actor's task, or a denied artifact. It grants no query-writing task.
  if (/^替换了?日期参数$/u.test(token) && courseRelationSentences(text, term).some(sentence =>
    /^(?:(?:项目说明|项目描述|说明)\s*[:：]\s*)?(?:所有\s*)?sql\s*由(?:导师|同事|团队)提供\s*[,，]\s*(?:我|本人)(?:只|仅)?替换了?日期参数\s*$/u
      .test(normalizeMaterialSkillLabel(sentence).trim()))) topics.add("sql");
  return [...topics];
}

// Only recognized actor, time, guidance, or requirement wrappers may be ignored.
// Unknown domain/tool/task modifiers remain in the body and prevent full coverage.
export function courseTaskBody(value: string): string {
  return normalizeMaterialSkillLabel(value).replace(/[。.!]$/u, "").trim()
    .replace(/^(?:required|essential|preferred|must have|nice to have|任职必备|必备|必须|加分项|岗位摘要|任职清单)\s*[:：]\s*/u, "")
    .replace(/^(?:must be able to|must|should|required to|(?:i|we|my colleague) (?:need to|want to|will|can|have|had)|(?:learn|need|want) to) /u, "")
    .replace(/^(?:i|we|my colleague) /u, "")
    .replace(/^(?:练习项目中[，,]?|我|本人|我个人|只|跟随教程|按(?:导师示例|示例|评审反馈)|必须能|必须|能|掌握|学习目标是|有)+/u, "")
    .replace(/^在[\p{L}\p{N} ]{1,40}(?:社|公司|工作室|项目中)/u, "")
    .replace(/^(?:与设计师协作|在同事指导下)/u, "")
    .replace(/(?:经验者优先|经验|者优先)$/u, "")
    .replace(/[,，]?\s*(?:following review notes|按(?:导师示例|示例|评审反馈))$/u, "").trim();
}

/** The scope owned by one retained term; soft line wraps are not boundaries. */
export function courseTaskScopes(text: string, term: string, wholeFact: boolean): string[] {
  if (wholeFact) return [courseTaskBody(text)];
  // The literal course ID "testing" also names a source's test/tests activity;
  // this small inflection does not locate arbitrary manually chosen terms.
  const sourceTerm = term === "testing" && findMaterialSkillMention(text, term) === null
    ? text.match(/\btests?\b/iu)?.[0] ?? term : term;
  const broadName = /^(?:sql|typescript|react)$/u.test(normalizeMaterialSkillLabel(term));
  return courseRelationSentences(text, sourceTerm).flatMap(sentence => {
    // Guidance, negation and contrast alone are not separate tasks. Keep their
    // unknown qualifiers attached; split only explicit actors/actions or a
    // recognized guide followed by an existing task action.
    const clauses = sentence.split(/[,，]\s*(?=(?:按(?:导师示例|示例|评审反馈)(?=修复|检查|设计|实现|编写|构建|维护|测试|拆分|定义|交付|建立|审查)|交付|我|i\b|we\b|my\b))|(?=\b(?:but|whereas|while)\s+(?:i|we|my|another|design|write|build|implement|investigate|take)\b)|\band\s+(?=(?:i|we|my|another)\b)/iu);
    return clauses.filter(clause => findMaterialSkillMention(clause, sourceTerm) !== null).flatMap(clause => {
      // A specific retained task can distinguish a coordinated second action;
      // a broad course name still owns both tasks and keeps the unknown remainder.
      const pieces = broadName ? [clause] : clause.split(/\s+and\s+(?=(?:design|write|build|implement|investigate|take)\b)|并(?=检查|设计|实现|编写)/iu);
      return pieces.filter(piece => findMaterialSkillMention(piece, sourceTerm) !== null).map(courseTaskBody);
    });
  });
}
