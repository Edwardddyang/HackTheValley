// In-memory sliding-window rate limiter and client-IP helper. Pure (the clock is injectable), so it is unit-tested.
// State lives in one server instance: on Vercel each warm function counts separately, which is enough to keep one
// client from using up the free Gemini quota or hammering the database.

export type RateLimitResult = { ok: true; remaining: number } | { ok: false; retryAfterSeconds: number };

export type RateLimiter = { check(key: string): RateLimitResult };

export function createRateLimiter(opts: {
  limit: number;
  windowMs: number;
  now?: () => number;
  maxKeys?: number;
}): RateLimiter {
  const { limit, windowMs, now = Date.now, maxKeys = 10_000 } = opts;
  const hits = new Map<string, number[]>();

  function sweep(cutoff: number) {
    for (const [key, times] of hits) {
      if (times[times.length - 1] <= cutoff) hits.delete(key);
    }
    // Still too many live keys: forget the least recently seen.
    while (hits.size > maxKeys) {
      const oldest = hits.keys().next();
      if (oldest.done) break;
      hits.delete(oldest.value);
    }
  }

  return {
    check(key) {
      const t = now();
      const cutoff = t - windowMs;
      const times = (hits.get(key) ?? []).filter((x) => x > cutoff);
      hits.delete(key); // re-inserted below, so Map order tracks recency
      if (times.length >= limit) {
        hits.set(key, times);
        return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((times[0] + windowMs - t) / 1000)) };
      }
      times.push(t);
      hits.set(key, times);
      if (hits.size > maxKeys) sweep(cutoff);
      return { ok: true, remaining: limit - times.length };
    },
  };
}

/**
 * The caller's IP from proxy headers (route handlers have no `request.ip`). On Vercel the platform sets
 * `x-forwarded-for`; elsewhere it can be spoofed, which is acceptable for a quota guard.
 */
export function clientIp(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return headers.get("x-real-ip")?.trim() || "unknown";
}
