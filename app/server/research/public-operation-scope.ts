/** A service phase expired or was explicitly fenced. Native SQL already dispatched may still commit. */
export class PublicOperationTimeout extends Error {
  constructor() { super("Public research operation expired"); this.name = "PublicOperationTimeout"; }
}

/** One monotonic budget plus a wall timer, including drivers that ignore AbortSignal. */
export class PublicOperationScope {
  private readonly controller = new AbortController();
  readonly signal = this.controller.signal;
  private readonly end: number;
  private last = 0;
  private closed = false;
  private readonly timer: ReturnType<typeof setTimeout>;

  constructor(private readonly monoNow: () => number, duration: 4500 | 500 | 1500 = 4500) {
    if (duration !== 4500 && duration !== 500 && duration !== 1500) throw new PublicOperationTimeout();
    this.end = this.read() + duration;
    this.timer = setTimeout(() => this.finish(), duration);
  }

  private read(): number {
    const value = this.monoNow();
    if (!Number.isFinite(value) || value < this.last || value > Number.MAX_SAFE_INTEGER - 5000) {
      throw new PublicOperationTimeout();
    }
    this.last = value;
    return value;
  }

  private remaining(): number {
    if (this.closed || this.signal.aborted) throw new PublicOperationTimeout();
    try {
      const remaining = this.end - this.read();
      if (remaining <= 0) throw new PublicOperationTimeout();
      return Math.ceil(remaining);
    } catch (error) { this.finish(); throw error; }
  }

  ensure = (): void => { void this.remaining(); };

  finish(): void {
    clearTimeout(this.timer);
    this.closed = true;
    this.controller.abort();
  }

  /** Pass a thunk so a fenced phase never even schedules the next operation. */
  async run<T>(operation: () => Promise<T>): Promise<T> {
    const remaining = this.remaining();
    let rejectAbort!: () => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAbort = () => reject(new PublicOperationTimeout());
      this.signal.addEventListener("abort", rejectAbort, { once: true });
    });
    const timer = setTimeout(() => this.finish(), remaining);
    try {
      const value = await Promise.race([Promise.resolve().then(() => { this.ensure(); return operation(); }), aborted]);
      this.ensure();
      return value;
    } finally {
      clearTimeout(timer);
      this.signal.removeEventListener("abort", rejectAbort);
    }
  }
}
