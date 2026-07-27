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
    ARC_AI_ENABLED?: string;
    ARC_AI_USER_DAILY_QUOTA?: string;
    ARC_AI_GLOBAL_DAILY_BUDGET_UNITS?: string;
    ARC_AI_RATE_LIMIT_PER_MINUTE?: string;
    OPENAI_API_KEY?: string;
  }
}
