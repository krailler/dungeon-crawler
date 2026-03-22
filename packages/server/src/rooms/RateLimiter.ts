/**
 * Generic sliding-window rate limiter.
 * Tracks timestamps per key and rejects operations exceeding the burst limit.
 */
export class RateLimiter {
  private timestamps: Map<string, number[]> = new Map();
  private readonly windowMs: number;
  private readonly maxBurst: number;

  constructor(windowMs: number, maxBurst: number) {
    this.windowMs = windowMs;
    this.maxBurst = maxBurst;
  }

  /** Returns true if the operation is allowed, false if rate-limited. */
  check(key: string): boolean {
    const now = Date.now();
    let ts = this.timestamps.get(key);
    if (!ts) {
      ts = [];
      this.timestamps.set(key, ts);
    }

    // Evict timestamps outside the window
    const cutoff = now - this.windowMs;
    while (ts.length > 0 && ts[0] < cutoff) {
      ts.shift();
    }

    if (ts.length >= this.maxBurst) {
      return false;
    }

    ts.push(now);
    return true;
  }

  /** Remove tracking for a key (e.g. on disconnect). */
  remove(key: string): void {
    this.timestamps.delete(key);
  }

  /** Clear all tracked keys. */
  clear(): void {
    this.timestamps.clear();
  }
}
