import { z } from "zod";
import { BridgeAuthError, type BridgeNonceStore } from "./auth";

type Claim = Parameters<BridgeNonceStore["claim"]>[0];

const claimSchema = z.object({
  scope: z.string().regex(
    /^(site-to-executor|executor-to-site):[A-Za-z0-9_-]{1,32}$/u,
  ),
  nonce: z.string().regex(/^[0-9a-f]{32}$/u),
  now: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 150_001),
  expiresAt: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
}).strict().refine((value) => (
  value.expiresAt > value.now && value.expiresAt - value.now <= 150_001
));

export class D1BridgeNonceStore implements BridgeNonceStore {
  constructor(private readonly db: Pick<D1Database, "prepare">) {}

  async claim(input: Claim): Promise<boolean> {
    const parsed = claimSchema.safeParse(input);
    if (!parsed.success) throw new BridgeAuthError("invalid-config");

    const value = parsed.data;
    try {
      const result = await this.db.prepare(`INSERT INTO research_bridge_nonces
        (scope,nonce,expires_at,created_at) VALUES (?1,?2,?3,?4)
        ON CONFLICT (scope,nonce) DO NOTHING`)
        .bind(value.scope, value.nonce, value.expiresAt, value.now)
        .run();
      const changes = result.meta?.changes;
      if (result.success !== true || (changes !== 0 && changes !== 1)) {
        throw new BridgeAuthError("unavailable");
      }
      return changes === 1;
    } catch {
      throw new BridgeAuthError("unavailable");
    }
  }
}
