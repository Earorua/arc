export type RateLimitRequest = {
  scope: string;
  subject: string;
  limit: number;
  windowSeconds: number;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export interface RateLimiter {
  reserve(request: RateLimitRequest): Promise<RateLimitResult>;
}

export class RateLimitUnavailableError extends Error {
  readonly code = "RATE_LIMIT_UNAVAILABLE";

  constructor() {
    super("Rate limiting is temporarily unavailable.");
    this.name = "RateLimitUnavailableError";
  }
}

type RateLimitOptions = {
  createId: () => string;
  now: () => number;
  hash: (value: string) => Promise<string>;
};

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const defaultOptions: RateLimitOptions = {
  createId: () => crypto.randomUUID(),
  now: () => Date.now(),
  hash: sha256,
};

type CountRow = { count: number };

export class D1RateLimiter implements RateLimiter {
  private readonly options: RateLimitOptions;

  constructor(
    private readonly db: D1Database,
    options: Partial<RateLimitOptions> = {},
  ) {
    this.options = { ...defaultOptions, ...options };
  }

  async reserve(request: RateLimitRequest): Promise<RateLimitResult> {
    const scope = request.scope.trim();
    const subject = request.subject.trim();
    if (!scope || !subject || !Number.isInteger(request.limit) || request.limit < 1
      || !Number.isInteger(request.windowSeconds) || request.windowSeconds < 1) {
      throw new RateLimitUnavailableError();
    }

    const now = this.options.now();
    const windowMs = request.windowSeconds * 1000;
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const expiresAt = windowStart + windowMs;
    const subjectHash = await this.options.hash(`${scope}\0${subject}`);

    try {
      const row = await this.db.prepare(`
        INSERT INTO endpoint_rate_buckets (
          id, scope, subject_hash, window_start, count, expires_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ON CONFLICT(scope, subject_hash, window_start) DO UPDATE
        SET count = endpoint_rate_buckets.count + 1,
            expires_at = excluded.expires_at
        RETURNING count
      `).bind(
        this.options.createId(),
        scope,
        subjectHash,
        windowStart,
        1,
        expiresAt,
      ).first<CountRow>();

      if (!row || !Number.isInteger(row.count)) throw new Error("Missing D1 rate bucket result.");
      return {
        allowed: row.count <= request.limit,
        retryAfterSeconds: Math.max(1, Math.ceil((expiresAt - now) / 1000)),
      };
    } catch (error) {
      if (error instanceof RateLimitUnavailableError) throw error;
      throw new RateLimitUnavailableError();
    }
  }
}
