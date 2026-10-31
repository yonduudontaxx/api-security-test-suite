export interface ThrottleDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export class FixedWindowLimiter {
  private readonly windows = new Map<string, { startedAt: number; count: number }>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  peek(key: string, now = Date.now()): ThrottleDecision {
    const current = this.windows.get(key);
    if (!current || now - current.startedAt >= this.windowMs) return { allowed: true, retryAfterSeconds: 0 };
    const retryAfterSeconds = Math.ceil((current.startedAt + this.windowMs - now) / 1000);
    return { allowed: current.count < this.limit, retryAfterSeconds };
  }

  hit(key: string, now = Date.now()): ThrottleDecision {
    const current = this.windows.get(key);
    const window = current && now - current.startedAt < this.windowMs ? current : { startedAt: now, count: 0 };
    window.count += 1;
    this.windows.set(key, window);
    const retryAfterSeconds = Math.ceil((window.startedAt + this.windowMs - now) / 1000);
    return { allowed: window.count <= this.limit, retryAfterSeconds };
  }
}

export class LoginLockout {
  private readonly failures = new Map<string, { count: number; lockedUntil: number }>();
  private readonly maxFailures: number;
  private readonly lockMs: number;

  constructor(maxFailures: number, lockMs: number) {
    this.maxFailures = maxFailures;
    this.lockMs = lockMs;
  }

  retryAfterSeconds(key: string, now = Date.now()): number {
    const entry = this.failures.get(key);
    if (!entry || entry.lockedUntil <= now) return 0;
    return Math.ceil((entry.lockedUntil - now) / 1000);
  }

  recordFailure(key: string, now = Date.now()): void {
    const entry = this.failures.get(key) ?? { count: 0, lockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= this.maxFailures) {
      entry.lockedUntil = now + this.lockMs;
      entry.count = 0;
    }
    this.failures.set(key, entry);
  }

  reset(key: string): void {
    this.failures.delete(key);
  }
}
