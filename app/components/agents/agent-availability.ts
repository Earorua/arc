/** Turn deployment-only setup advice into a learner-facing availability state. */
export function learnerAvailability(reason: string | null | undefined): string {
  if (!reason || /尚未启用|配置模型服务/.test(reason)) return "学习伙伴暂未开放";
  return reason;
}
