/** Turn deployment-only setup advice into a learner-facing availability state. */
export function learnerAvailability(reason: string | null | undefined): string {
  if (!reason || /not yet enabled|configure the model service|尚未启用|配置模型服务/i.test(reason)) return "The learning companion is not available yet";
  return reason;
}
