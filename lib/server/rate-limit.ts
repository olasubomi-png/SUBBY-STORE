/**
 * Lightweight in-process rate limiter for expensive financial endpoints.
 * Suitable for single-instance / serverless with short windows.
 * Not a substitute for edge WAF; reduces accidental/malicious spam.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = { allowed: boolean; retryAfterSec: number };

/**
 * @param key - stable identity (e.g. userId + route)
 * @param limit - max requests per window
 * @param windowMs - window length
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  if (b.count > limit) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
    };
  }
  // Opportunistic cleanup
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (now >= v.resetAt) buckets.delete(k);
    }
  }
  return { allowed: true, retryAfterSec: 0 };
}

/** Test helper */
export function resetRateLimitsForTests(): void {
  buckets.clear();
}
