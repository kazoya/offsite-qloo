/**
 * Small request guards for the public API routes: per-client rate limit and a request-body size cap.
 * The rate limiter is in-memory, so on serverless it is per instance (best effort, not a global quota).
 */

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(
    readonly limit: number,
    readonly windowMs: number,
    private readonly now: () => number = Date.now,
    private readonly maxKeys = 5000,
  ) {}

  /** Records one request for `key`. Returns ok=false with seconds to wait when the window is full. */
  hit(key: string): { ok: true } | { ok: false; retryAfterS: number } {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return { ok: false, retryAfterS: Math.max(1, Math.ceil((recent[0]! + this.windowMs - t) / 1000)) };
    }
    recent.push(t);
    this.hits.set(key, recent);
    if (this.hits.size > this.maxKeys) this.prune(t);
    return { ok: true };
  }

  private prune(t: number) {
    for (const [k, v] of this.hits) if (!v.some((x) => t - x < this.windowMs)) this.hits.delete(k);
    // Still too many distinct clients: drop the oldest entries (Map keeps insertion order).
    for (const k of this.hits.keys()) {
      if (this.hits.size <= this.maxKeys) break;
      this.hits.delete(k);
    }
  }
}

/** Best-effort client identity from proxy headers (Vercel sets x-forwarded-for). */
export function clientKey(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "local"
  );
}

export class BodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Request body is larger than ${maxBytes} bytes.`);
    this.name = "BodyTooLargeError";
  }
}
export class BadJsonError extends Error {
  constructor() {
    super("Invalid JSON body.");
    this.name = "BadJsonError";
  }
}

/** Reads and parses a JSON body, refusing anything over `maxBytes` without buffering it all. */
export async function readJsonCapped(request: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLargeError(maxBytes);
  if (!request.body) throw new BadJsonError();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new BodyTooLargeError(maxBytes);
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(buf));
  } catch {
    throw new BadJsonError();
  }
}

/** Shared limiters (module scope = one per server instance). */
export const LIMITS = {
  planPerMinute: 10,
  approvalsPerMinute: 30,
  planBodyBytes: 32 * 1024,
  approvalsBodyBytes: 16 * 1024,
  planDeadlineMs: 25_000,
} as const;

const g = globalThis as unknown as { __offsiteLimiters?: { plan: RateLimiter; approvals: RateLimiter } };
export function limiters() {
  g.__offsiteLimiters ??= {
    plan: new RateLimiter(LIMITS.planPerMinute, 60_000),
    approvals: new RateLimiter(LIMITS.approvalsPerMinute, 60_000),
  };
  return g.__offsiteLimiters;
}
