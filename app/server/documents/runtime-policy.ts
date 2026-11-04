import type { DocumentExecutorBridge } from "./executor-bridge";
import { readDocumentSitePolicy } from "./policy";
import { calculateDocumentReservation, isDocumentProviderQualified } from "../../../worker/document-executor/provider-http";
import { documentAcceptanceConfigurationDigest } from "../../../worker/document-executor/acceptance-policy";
import { activeProductionIdentity, documentTransportMode, readDocumentJson, readDocumentProductionRelease } from "../../../worker/document-executor/production-policy";

/** The website uses only public settings and its own authenticated service binding. */
export function documentRuntimePolicy(environment: Readonly<Record<string, unknown>>) {
  const requested = readDocumentSitePolicy(environment), analysis = requested.analysis;
  const raw = readDocumentJson(environment.ARC_DOCUMENT_PROVIDER_QUALIFICATION);
  const qualification = analysis && isDocumentProviderQualified(analysis, raw) ? raw : null;
  const bridge = environment.DOCUMENT_EXECUTOR as {fetch?: unknown} | undefined;
  const secret = environment.ARC_DOCUMENT_BRIDGE_SECRET;
  const connected = typeof bridge?.fetch === "function" && typeof secret === "string" && secret.length >= 32 && secret.length <= 8192;
  const mode = documentTransportMode(environment, "site");
  const reservationMicroUsd = analysis && qualification ? calculateDocumentReservation(analysis, qualification) : null;
  const productionRelease = mode === "production" && analysis && qualification && reservationMicroUsd !== null
    ? readDocumentProductionRelease(environment, analysis, qualification, reservationMicroUsd) : null;
  const analysisEnabled = requested.documentsEnabled && requested.analysisEnabled && !!qualification && connected
    && mode !== "closed" && (mode !== "production" || !!productionRelease);
  const policy = { ...requested, analysisEnabled };
  return {
    policy, productionRelease, reservationMicroUsd,
    acceptanceRunId: mode === "acceptance" ? String(environment.ARC_DOCUMENT_ACCEPTANCE_RUN_ID) : undefined,
    acceptanceConfigurationSha256: mode === "acceptance" && analysis && qualification ? documentAcceptanceConfigurationDigest(analysis, qualification) : undefined,
    async analysisAvailable(now: () => number, bridge?: Pick<DocumentExecutorBridge,"productionReady">) {
      if (!productionRelease || !analysisEnabled) return analysisEnabled;
      const digest=await productionRelease.identity;
      return !!digest && !!bridge && await bridge.productionReady(digest) && !!await activeProductionIdentity(productionRelease,now);
    },
    unavailableReason: !requested.analysisEnabled ? requested.analysisReadiness === "configuration-incomplete" ? "configuration-incomplete" : "disabled" : "qualification-required",
  } as const;
}
