import { createDocumentRoute } from "../../../server/http/document-route-factories";
import { productionDocumentRouteDependencies } from "../../../server/documents/runtime";

export const GET = createDocumentRoute("readDocument", productionDocumentRouteDependencies);
export const DELETE = createDocumentRoute("deleteDocument", productionDocumentRouteDependencies);

