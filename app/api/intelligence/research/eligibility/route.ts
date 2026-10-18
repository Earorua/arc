import { createResearchEligibilityDependencies, createResearchEligibilityHandler } from "../../../../server/http/research-eligibility-route";

export const dynamic = "force-dynamic";
export const GET = createResearchEligibilityHandler(createResearchEligibilityDependencies());
