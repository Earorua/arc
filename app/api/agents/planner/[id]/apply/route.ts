import { agentHandlers } from "../../../../../server/agents/runtime";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return agentHandlers.apply(request, (await context.params).id);
}
