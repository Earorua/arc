import type { BridgeBeginReply } from "./executor/begin";
import type { SiteExecutionIdentity } from "./site-execution-repository";

export type SiteBeginCommand = SiteExecutionIdentity & Readonly<{
  newExecutionAllowed: boolean;
}>;

export interface SiteBeginRepository {
  begin(command: SiteBeginCommand): Promise<BridgeBeginReply>;
}
