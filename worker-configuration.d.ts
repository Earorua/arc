declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    PROOF_ASSETS: R2Bucket;
    ARC_ENVIRONMENT?: string;
    BETTER_AUTH_URL?: string;
    BETTER_AUTH_SECRET?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    GITHUB_CLIENT_ID?: string;
    GITHUB_CLIENT_SECRET?: string;
    ARC_ADMIN_EMAILS?: string;
    ARC_ACCOUNT_RECOVERY?: string;
    ARC_AI_ENABLED?: string;
    ARC_AI_USER_DAILY_QUOTA?: string;
    ARC_AI_GLOBAL_DAILY_BUDGET_UNITS?: string;
    ARC_AI_RATE_LIMIT_PER_MINUTE?: string;
    ARC_AI_RESEARCH_ENABLED?: string;
    ARC_AI_RESEARCH_EXECUTOR?: string;
    ARC_AI_RESEARCH_BRIDGE_TRANSPORT?: string;
    ARC_RESEARCH_EXECUTOR?: import("./app/server/research/executor/service-binding-transport").ResearchServiceBinding;
    ARC_RESEARCH_SITE?: import("./app/server/research/executor/service-binding-transport").ResearchServiceBinding;
    ARC_AI_RESEARCH_EXECUTOR_URL?: string;
    ARC_AI_RESEARCH_SITE_TO_EXECUTOR_KEY_ID?: string;
    ARC_AI_RESEARCH_SITE_TO_EXECUTOR_SECRET_HEX?: string;
    ARC_AI_RESEARCH_EXECUTOR_TO_SITE_KEY_ID?: string;
    ARC_AI_RESEARCH_EXECUTOR_TO_SITE_SECRET_HEX?: string;
    ARC_AI_RESEARCH_PROFILE?: string;
    ARC_AI_MODEL_RESEARCH?: string;
    ARC_AI_MODEL_ECONOMY?: string;
    ARC_AI_RESEARCH_TIMEOUT_MS?: string;
    ARC_AI_REPAIR_TIMEOUT_MS?: string;
    ARC_AI_RESEARCH_CACHE_DAYS?: string;
    ARC_AI_SITE_DAILY_BUDGET_MICROS?: string;
    ARC_AI_SITE_MONTHLY_BUDGET_MICROS?: string;
    ARC_AI_RESEARCH_MAX_COST_MICROS?: string;
    ARC_AI_REPAIR_MAX_COST_MICROS?: string;
    ARC_AI_IP_HASH_SALT?: string;
    OPENROUTER_API_KEY?: string;
  }
}
