import { createDocumentRoute } from "../../server/http/document-route-factories";
import { productionDocumentRouteDependencies } from "../../server/documents/runtime";

export const GET = createDocumentRoute("listDocuments", productionDocumentRouteDependencies);
export const POST = createDocumentRoute("createDocument", productionDocumentRouteDependencies);

