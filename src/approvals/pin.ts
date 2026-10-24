import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Demo guard for approve/reject: a shared PIN from APPROVALS_PIN, checked on the server.
 * - PIN set: every decision must carry it (header x-approvals-pin or body.pin).
 * - PIN unset in production: decisions are disabled (fail closed).
 * - PIN unset outside production: open, for local development and tests.
 * Failed attempts are rate-limited per client key (in-process, best effort on serverless).
 */
export type PinMode = "pin" | "disabled" | "open";
export type PinCode = "pin_required" | "pin_invalid" | "approvals_disabled" | "pin_locked";

export function pinMode(env: NodeJS.ProcessEnv = process.env): PinMode {
  if (env.APPROVALS_PIN && env.APPROVALS_PIN.trim()) return "pin";
  return env.NODE_ENV === "production" ? "disabled" : "open";
}

const digest = (s: string) => createHash("sha256").update(s).digest();
export function pinMatches(given: string, expected: string): boolean {
  return timingSafeEqual(digest(given.trim()), digest(expected.trim()));
}

export const MAX_FAILURES = 5;
export const LOCK_MS = 10 * 60_000;

export class PinGuard {
  private failures = new Map<string, { n: number; until: number }>();
  constructor(
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly now: () => number = Date.now,
  ) {}

  /** Returns null if allowed, otherwise the refusal code and HTTP status. */
  check(given: string | undefined, client: string): { code: PinCode; status: number } | null {
    const mode = pinMode(this.env);
    if (mode === "open") return null;
    if (mode === "disabled") return { code: "approvals_disabled", status: 503 };
    const f = this.failures.get(client);
    if (f && f.n >= MAX_FAILURES && f.until > this.now()) return { code: "pin_locked", status: 429 };
    if (!given) return { code: "pin_required", status: 401 };
    if (pinMatches(given, this.env.APPROVALS_PIN as string)) {
      this.failures.delete(client);
      return null;
    }
    const n = f && f.until > this.now() ? f.n + 1 : 1;
    this.failures.set(client, { n, until: this.now() + LOCK_MS });
    return { code: n >= MAX_FAILURES ? "pin_locked" : "pin_invalid", status: n >= MAX_FAILURES ? 429 : 401 };
  }
}

let shared: PinGuard | undefined;
export const pinGuard = () => (shared ??= new PinGuard());
