import { createDocumentRoute } from "../../../server/http/document-route-factories";
import { productionDocumentRouteDependencies } from "../../../server/documents/runtime";

export const GET = createDocumentRoute("readMaterialSelection", productionDocumentRouteDependencies);
export const PUT = createDocumentRoute("updateMaterialSelection", productionDocumentRouteDependencies);

