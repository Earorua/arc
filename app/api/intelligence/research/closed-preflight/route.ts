import { createResearchClosedPreflightDependencies, createResearchClosedPreflightHandler } from "../../../../server/http/research-closed-preflight-route";

export const dynamic = "force-dynamic";
export const POST = createResearchClosedPreflightHandler(createResearchClosedPreflightDependencies());
