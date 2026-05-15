export class ThrottledError extends Error {
  constructor(public retryAfterMs: number) {
    super(`rate limited; retry in ${retryAfterMs}ms`);
    this.name = "ThrottledError";
  }
}

export interface ThrottleOptions {
  intervalMs: number;
  cooldownMs: number;
}

interface Task<T> {
  fn: () => Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}

export class Throttle {
  private queue: Task<unknown>[] = [];
  private running = false;
  private lastRunAt = 0;
  private cooldownUntil = 0;

  constructor(private opts: ThrottleOptions) {}

  triggerCooldown(): void {
    this.cooldownUntil = Date.now() + this.opts.cooldownMs;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    if (now < this.cooldownUntil) {
      throw new ThrottledError(this.cooldownUntil - now);
    }
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve: resolve as (v: unknown) => void, reject } as Task<unknown>);
      void this.pump();
    });
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length > 0) {
        const wait = Math.max(0, this.lastRunAt + this.opts.intervalMs - Date.now());
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        const task = this.queue.shift()!;
        this.lastRunAt = Date.now();
        try {
          const v = await task.fn();
          task.resolve(v);
        } catch (e) {
          task.reject(e);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
