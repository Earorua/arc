import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { documentAnalysisConfigurationSchema } from "../../../app/server/documents/policy.ts";
import { documentProviderQualificationSchema, isDocumentProviderQualified } from "../../../worker/document-executor/provider-http.ts";
import { documentAcceptanceConfigurationDigest } from "../../../worker/document-executor/acceptance-policy.ts";
import { auditDocumentGeneration, readChatReceipt } from "../../../worker/document-executor/generation-receipt.ts";

// Successor replay only. The original replay, operator and consumed inference slot stay frozen.
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const readPinned = (name, expected) => {
  const bytes = readFileSync(new URL(name, import.meta.url));
  if (sha(bytes) !== expected) throw new Error("Unexpected offline replay evidence");
  return JSON.parse(bytes);
};
if (process.argv.length !== 2) throw new Error("This replay accepts no arguments or credentials");
const settingsSha256 = "e77ac7703652018d0d1c6247a75f7cdfd5b3ab1780cdf94c9b8ef0d3ab863c72";
const pairSha256 = "cff27e802557257c95146e112a4addf363887a6c1e24dd1e68e4675f6d0b0748";
const settings = readPinned("./b2-settings.canonical-model.review.json", settingsSha256);
const pair = readPinned("./2026-11-05-receipt-pair.redacted.json", pairSha256);
if (settings.qualification.qualified !== false || settings.authorization.approvedAt !== null) throw new Error("Review must remain unissued");
const config = documentAnalysisConfigurationSchema.parse({ ...settings.config, apiKey: "offline-replay-placeholder" });
// This in-memory flag is used only to validate the offline configuration; it issues no live qualification.
const qualification = documentProviderQualificationSchema.parse({ ...settings.qualification, qualified: true });
if (!isDocumentProviderQualified(config, qualification)) throw new Error("Invalid replay configuration");
let simulatedGets = 0;
const checkedAt = new Date().toISOString();
const audit = await auditDocumentGeneration({ config, qualification,
  chat: readChatReceipt(pair.chat, "", config.apiKey), signal: new AbortController().signal,
  now: () => new Date(checkedAt), sentAt: checkedAt, returnedAt: checkedAt,
  fetch: async (url, init) => {
    const expected = config.endpoint.replace("/chat/completions", "/generation?id=") + pair.chat.id;
    if (String(url) !== expected || init?.method !== "GET" || ++simulatedGets !== 1) throw new Error("Invalid offline lookup");
    return Response.json(pair.generation);
  },
});
const exactCostAgreement = pair.chat.usage.cost === pair.generation.data.total_cost;
const reasoningMatches = pair.chat.usage.completion_tokens_details.reasoning_tokens === pair.generation.data.native_tokens_reasoning;
const compatible = audit.status === "verified" && exactCostAgreement && reasoningMatches;
process.stdout.write(JSON.stringify({ mode: "offline-replay", comparison: compatible ? "compatible" : "incompatible",
  checkedAt, pairSha256, settingsSha256, configurationSha256: await documentAcceptanceConfigurationDigest(config, qualification),
  auditorSha256: sha(readFileSync(new URL("../../../worker/document-executor/generation-receipt.ts", import.meta.url))),
  audit, exactCostAgreement, reasoningMatches, simulatedGets, networkRequests: 0, inferenceRequests: 0,
  sourceAuthenticatedByReplay: false, inferenceAuthorized: false }, null, 2) + "\n");
process.exitCode = compatible ? 0 : 1;
