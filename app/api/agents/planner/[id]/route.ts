import { agentHandlers } from "../../../../server/agents/runtime";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return agentHandlers.poll(request, (await context.params).id);
}
