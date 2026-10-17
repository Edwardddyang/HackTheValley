// Run: npm test (node --test src/lib/ai/)
import assert from "node:assert/strict";
import { test } from "node:test";

import type * as RateLimit from "./rate-limit";
import type * as TtlCache from "./ttl-cache";

// See summary-core.test.ts for why the modules are loaded by URL.
const { clientIp, createRateLimiter } = (await import(new URL("./rate-limit.ts", import.meta.url).href)) as typeof RateLimit;
const { createTtlCache } = (await import(new URL("./ttl-cache.ts", import.meta.url).href)) as typeof TtlCache;

test("rate limiter: 10 per minute per key, sliding window", () => {
  let now = 1_000_000;
  const limiter = createRateLimiter({ limit: 10, windowMs: 60_000, now: () => now });
  for (let i = 0; i < 10; i++) {
    assert.equal(limiter.check("1.2.3.4").ok, true, `request ${i + 1}`);
    now += 1_000;
  }
  const blocked = limiter.check("1.2.3.4");
  assert.equal(!blocked.ok && blocked.retryAfterSeconds, 50);
  assert.equal(limiter.check("5.6.7.8").ok, true, "other IPs are independent");
  now = 1_000_000 + 60_001; // the first hit has left the window
  assert.equal(limiter.check("1.2.3.4").ok, true);
  assert.equal(limiter.check("1.2.3.4").ok, false);
});

test("rate limiter forgets old keys when it grows past maxKeys", () => {
  let now = 0;
  const limiter = createRateLimiter({ limit: 1, windowMs: 1_000, now: () => now, maxKeys: 3 });
  for (const ip of ["a", "b", "c", "d", "e"]) limiter.check(ip);
  now += 10;
  assert.equal(limiter.check("a").ok, true, "a was evicted, so it starts fresh");
});

test("clientIp reads proxy headers", () => {
  const h = (entries: Record<string, string>) => new Headers(entries);
  assert.equal(clientIp(h({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })), "203.0.113.7");
  assert.equal(clientIp(h({ "x-real-ip": "198.51.100.2" })), "198.51.100.2");
  assert.equal(clientIp(h({})), "unknown");
});

test("ttl cache expires entries and caps its size", () => {
  let now = 0;
  const cache = createTtlCache<string>({ maxEntries: 2, now: () => now });
  cache.set("a", "A", 1_000);
  assert.equal(cache.get("a"), "A");
  now = 1_000;
  assert.equal(cache.get("a"), undefined, "expired");
  cache.set("a", "A", 10_000);
  cache.set("b", "B", 10_000);
  cache.set("c", "C", 10_000);
  assert.equal(cache.size, 2);
  assert.equal(cache.get("a"), undefined, "oldest evicted");
  assert.equal(cache.get("c"), "C");
});
