export const KIMI_RESEARCH_EXECUTION_POLICY = Object.freeze({
  profileId: "kimi-low-output32k-v3",
  model: "moonshotai/kimi-k3",
  reasoningEffort: "low",
  maxOutputTokens: 32_768,
  outputPolicyVersion: "kimi-complete-quality-v2",
  researchTimeoutMs: 1_200_000,
  activeTtlMs: 1_260_000,
} as const);

export type KimiResearchExecutionPolicy = typeof KIMI_RESEARCH_EXECUTION_POLICY;

export function resolveResearchExecutionPolicy(profile: unknown):
  KimiResearchExecutionPolicy | undefined | null {
  if (profile === undefined) return undefined;
  return profile === KIMI_RESEARCH_EXECUTION_POLICY.profileId
    ? KIMI_RESEARCH_EXECUTION_POLICY : null;
}
