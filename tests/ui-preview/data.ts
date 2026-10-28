import { agentFixture } from "../helpers/agent-fixture";
import { proofResultFixture } from "../fixtures/proof-ledger";

// Synthetic, local-only visual fixtures. No production state or provider calls.
export const fixture = structuredClone(agentFixture());
fixture.sourceContext.blueprint.name = "数据产品经理";
const unit = fixture.workspace.dailyUnits[0];
unit.objective = "理解从业务问题、原始数据、聚合分组到可视化结论的完整分析过程。";
unit.buildTask = "选择一个熟悉的产品，整理一页业务分析框架：明确问题、所需数据，以及你期待得到的结论。";
unit.estimatedMinutes = 60;
unit.steps = [
  { id: "preview-1", label: "阅读资料，记录业务问题与数据之间的关系", minutes: 15 },
  { id: "preview-2", label: "选择一个产品场景，列出需要收集的数据", minutes: 20 },
  { id: "preview-3", label: "画出从原始数据到分析结论的过程", minutes: 15 },
  { id: "preview-4", label: "检查分析框架，写下一个尚未解决的问题", minutes: 10 },
];
const template = fixture.sourceContext.registry.tracks.flatMap(track => track.templates).find(template => template.id === unit.templateId)!;
template.title = "建立数据分析基础框架";
export const proof = proofResultFixture().workspace;
proof.versions[0].title = "产品使用漏斗分析";
proof.versions[0].summary = "从访问、注册到首次使用，说明关键流失点，并提出可验证的改进假设。";
export const unavailableAgents = {
  enabled: false, authenticated: true, goalId: fixture.workspace.goalId,
  baseVersionId: fixture.workspace.activePlanVersionId, revision: 0,
  roleName: "数据产品经理", currentTask: unit.objective,
  history: [], reason: "学习助手尚未启用，配置模型服务后即可使用。",
  plannerModel: "local-preview", tutorModel: "local-preview",
};
