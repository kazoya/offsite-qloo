/** Thrown when a request runs past its overall time budget. The route maps it to HTTP 504 "timeout". */
export class DeadlineError extends Error {
  constructor(readonly budgetMs: number, readonly during?: string) {
    super(`The plan did not finish within ${Math.round(budgetMs / 1000)} s${during ? ` (during ${during})` : ""}.`);
    this.name = "DeadlineError";
  }
}

/** One overall time budget shared by every step of a request. `now` is injectable for tests. */
export class Deadline {
  readonly at: number;
  constructor(readonly budgetMs: number, private readonly now: () => number = Date.now) {
    this.at = now() + budgetMs;
  }
  remaining(): number {
    return Math.max(0, this.at - this.now());
  }
  /** Throws DeadlineError if the budget is already spent. */
  check(during?: string): void {
    if (this.remaining() <= 0) throw new DeadlineError(this.budgetMs, during);
  }
  /** Resolves with `p`, or rejects with DeadlineError when the remaining budget runs out first. */
  race<T>(p: Promise<T>, during?: string): Promise<T> {
    this.check(during);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new DeadlineError(this.budgetMs, during)), this.remaining());
    });
    return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
  }
}
