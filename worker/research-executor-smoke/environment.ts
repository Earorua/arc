import type { ExecutorEnvironment } from "../research-executor/environment";
import type { ResearchProductionEnvironment } from "../../app/server/research/production-policy";

export type SmokeExecutorEnvironment = ExecutorEnvironment & { SMOKE_SITE: Fetcher };
export type SmokeSiteEnvironment = ResearchProductionEnvironment & {
  SMOKE_SITE_DB: D1Database;
  SMOKE_EXECUTOR: Fetcher;
  SMOKE_CONTROL_KEY_ID?: string;
  SMOKE_CONTROL_SECRET_HEX?: string;
  SMOKE_REPLAY_APPROVAL_JSON?: string;
  SMOKE_REPLAY_INVENTORY_SHA256?: string;
};
