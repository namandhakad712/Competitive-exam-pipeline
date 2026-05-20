import { logger } from "./logger.js";

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

interface QueueEntry<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

export class RateLimiter {
  private config: RateLimitConfig;
  private timestamps: number[] = [];
  private queue: QueueEntry<unknown>[] = [];
  private processing = false;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject } as QueueEntry<unknown>);
      this.processQueue();
    }) as Promise<T>;
  }

  private processQueue(): void {
    if (this.processing) return;
    this.processing = true;

    const tick = (): void => {
      if (this.queue.length === 0) {
        this.processing = false;
        return;
      }

      const now = Date.now();
      this.timestamps = this.timestamps.filter(t => now - t < this.config.windowMs);

      if (this.timestamps.length >= this.config.maxRequests) {
        const waitMs = this.timestamps[0] + this.config.windowMs - now;
        logger.debug(`Rate limit hit, waiting ${waitMs}ms`);
        setTimeout(tick, Math.min(waitMs, 10000));
        return;
      }

      const entry = this.queue.shift()!;
      this.timestamps.push(now);

      entry
        .fn()
        .then(entry.resolve)
        .catch(entry.reject)
        .finally(() => setImmediate(tick));
    };

    tick();
  }
}
