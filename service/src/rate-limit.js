export class FixedWindowRateLimiter {
  constructor(windowSeconds) { this.windowSeconds = windowSeconds; this.entries = new Map(); }
  take(key, limit, now) {
    const start = now - (now % this.windowSeconds);
    const prior = this.entries.get(key);
    const entry = !prior || prior.start !== start ? { start, count: 0 } : prior;
    entry.count += 1;
    this.entries.set(key, entry);
    return { allowed: entry.count <= limit, retryAfter: start + this.windowSeconds - now };
  }
}
