// Small in-memory cache with a TTL per entry and a size cap (oldest entries go first). Pure; the clock is injectable.

export type TtlCache<V> = {
  get(key: string): V | undefined;
  set(key: string, value: V, ttlMs: number): void;
  delete(key: string): void;
  clear(): void;
  readonly size: number;
};

export function createTtlCache<V>(opts: { maxEntries?: number; now?: () => number } = {}): TtlCache<V> {
  const { maxEntries = 500, now = Date.now } = opts;
  const entries = new Map<string, { value: V; expiresAt: number }>();

  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value, ttlMs) {
      entries.delete(key); // re-inserted last, so Map order tracks age
      entries.set(key, { value, expiresAt: now() + ttlMs });
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next();
        if (oldest.done) break;
        entries.delete(oldest.value);
      }
    },
    delete(key) {
      entries.delete(key);
    },
    clear() {
      entries.clear();
    },
    get size() {
      return entries.size;
    },
  };
}
