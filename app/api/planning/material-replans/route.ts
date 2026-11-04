import { createDocumentRoute } from "../../../server/http/document-route-factories";
import { productionDocumentRouteDependencies } from "../../../server/documents/runtime";

export const POST = createDocumentRoute("materialReplan", productionDocumentRouteDependencies);

