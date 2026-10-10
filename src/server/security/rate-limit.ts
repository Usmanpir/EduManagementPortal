import "server-only";
import { db } from "@/server/db/client";
import { AppError } from "@/server/http/errors";

export type RateLimitRule = { limit: number; windowSeconds: number };

/**
 * Fixed-window limiter backed by Postgres so limits hold across every app
 * instance. One atomic upsert per check.
 */
export async function hitRateLimit(key: string, rule: RateLimitRule): Promise<{ allowed: boolean; count: number }> {
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "rate_limits" ("key", "count", "windowStart")
    VALUES (${key}, 1, now())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "rate_limits"."windowStart" < now() - make_interval(secs => ${rule.windowSeconds})
                     THEN 1 ELSE "rate_limits"."count" + 1 END,
      "windowStart" = CASE WHEN "rate_limits"."windowStart" < now() - make_interval(secs => ${rule.windowSeconds})
                     THEN now() ELSE "rate_limits"."windowStart" END
    RETURNING "count"`;
  const count = Number(rows[0]?.count ?? 0);
  return { allowed: count <= rule.limit, count };
}

/** Current count in the active window, without incrementing. */
export async function peekRateLimit(key: string, rule: RateLimitRule): Promise<number> {
  const row = await db.rateLimit.findUnique({ where: { key } });
  if (!row) return 0;
  if (row.windowStart.getTime() < Date.now() - rule.windowSeconds * 1000) return 0;
  return row.count;
}

/** Throws when a key has already reached its limit (used for failure-only throttles). */
export async function assertUnderLimit(key: string, rule: RateLimitRule, message = "Too many attempts. Please wait a moment and try again.") {
  if ((await peekRateLimit(key, rule)) >= rule.limit) throw new AppError("RATE_LIMITED", message);
}

export async function clearRateLimit(key: string) {
  await db.rateLimit.deleteMany({ where: { key } });
}

export async function enforceRateLimit(key: string, rule: RateLimitRule, message = "Too many attempts. Please wait a moment and try again.") {
  const { allowed } = await hitRateLimit(key, rule);
  if (!allowed) throw new AppError("RATE_LIMITED", message);
}

export const RATE_LIMITS = {
  /** Failed sign-ins per IP. Generous because a whole school often shares one IP. */
  loginFailuresPerIp: { limit: 50, windowSeconds: 15 * 60 },
  /** Failed sign-ins per account — the real brute-force guard. */
  loginFailuresPerEmail: { limit: 8, windowSeconds: 15 * 60 },
  register: { limit: 5, windowSeconds: 60 * 60 },
  passwordReset: { limit: 5, windowSeconds: 60 * 60 },
  mutation: { limit: 300, windowSeconds: 60 },
  upload: { limit: 30, windowSeconds: 60 },
  /** Integration test messages cost real money; keep them rare. */
  testMessage: { limit: 10, windowSeconds: 60 * 60 },
} satisfies Record<string, RateLimitRule>;
