export type ResearchBridgeEnvironment = {
  BETTER_AUTH_URL?: string;
  ARC_AI_RESEARCH_EXECUTOR_URL?: string;
  ARC_AI_RESEARCH_SITE_TO_EXECUTOR_KEY_ID?: string;
  ARC_AI_RESEARCH_SITE_TO_EXECUTOR_SECRET_HEX?: string;
  ARC_AI_RESEARCH_EXECUTOR_TO_SITE_KEY_ID?: string;
  ARC_AI_RESEARCH_EXECUTOR_TO_SITE_SECRET_HEX?: string;
};

export type BridgeChannelCredential = Readonly<{
  keyId: string;
  copyKeyBytes(): Uint8Array<ArrayBuffer>;
}>;

export type ResearchBridgeConnection = Readonly<{
  siteOrigin: string;
  executorOrigin: string;
  siteToExecutor: BridgeChannelCredential;
  executorToSite: BridgeChannelCredential;
}>;

const KEY_ID = /^[A-Za-z0-9_-]{1,32}$/u;
const SECRET_HEX = /^[0-9a-f]{64}$/u;

function readHttpsOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const origin = url.origin;
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || url.search
      || url.hash
      || url.pathname !== "/"
      || origin.length > 256
      || (value !== origin && value !== `${origin}/`)
    ) return null;
    return origin;
  } catch {
    return null;
  }
}

function fromHex(value: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index]! ^ right[index]!;
  }
  return difference === 0;
}

function credential(keyId: string, keyBytes: Uint8Array<ArrayBuffer>): BridgeChannelCredential {
  return Object.freeze({
    keyId,
    copyKeyBytes: () => new Uint8Array(keyBytes),
  });
}

export function readResearchBridgeConnection(
  environment: ResearchBridgeEnvironment,
): ResearchBridgeConnection | null {
  try {
    const siteOrigin = readHttpsOrigin(environment.BETTER_AUTH_URL);
    const executorOrigin = readHttpsOrigin(environment.ARC_AI_RESEARCH_EXECUTOR_URL);
    const siteToExecutorKeyId = environment.ARC_AI_RESEARCH_SITE_TO_EXECUTOR_KEY_ID;
    const siteToExecutorSecret = environment.ARC_AI_RESEARCH_SITE_TO_EXECUTOR_SECRET_HEX;
    const executorToSiteKeyId = environment.ARC_AI_RESEARCH_EXECUTOR_TO_SITE_KEY_ID;
    const executorToSiteSecret = environment.ARC_AI_RESEARCH_EXECUTOR_TO_SITE_SECRET_HEX;
    if (
      !siteOrigin
      || !executorOrigin
      || siteOrigin === executorOrigin
      || typeof siteToExecutorKeyId !== "string"
      || !KEY_ID.test(siteToExecutorKeyId)
      || typeof executorToSiteKeyId !== "string"
      || !KEY_ID.test(executorToSiteKeyId)
      || typeof siteToExecutorSecret !== "string"
      || !SECRET_HEX.test(siteToExecutorSecret)
      || typeof executorToSiteSecret !== "string"
      || !SECRET_HEX.test(executorToSiteSecret)
    ) return null;
    const siteToExecutorBytes = fromHex(siteToExecutorSecret);
    const executorToSiteBytes = fromHex(executorToSiteSecret);
    if (equalBytes(siteToExecutorBytes, executorToSiteBytes)) return null;
    return Object.freeze({
      siteOrigin,
      executorOrigin,
      siteToExecutor: credential(siteToExecutorKeyId, siteToExecutorBytes),
      executorToSite: credential(executorToSiteKeyId, executorToSiteBytes),
    });
  } catch {
    return null;
  }
}
