// In-memory rate limit: at most `limit` requests per window and per key (the client IP). Fixed window, no
// storage: the counts are lost on restart, which is enough for a local demo without database.

export interface RateLimiter {
  /** True if the request is allowed (and counted), false if the key reached the limit in the current window. */
  allow(key: string): boolean;
  reset(): void;
}

export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    allow(key) {
      const time = now();
      const current = windows.get(key);
      if (!current || time - current.start >= windowMs) {
        // Old windows are dropped so the map does not grow with every IP seen.
        for (const [k, w] of windows) if (time - w.start >= windowMs) windows.delete(k);
        windows.set(key, { start: time, count: 1 });
        return true;
      }
      if (current.count >= limit) return false;
      current.count++;
      return true;
    },
    reset() {
      windows.clear();
    },
  };
}
