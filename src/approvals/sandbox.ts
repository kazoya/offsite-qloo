import { ApprovalStore, MemoryPersistence, approvalStore } from "./store";

/**
 * Demo approvals sandbox: every visitor gets a private, in-memory approvals queue keyed by a random cookie id.
 * Nothing is shared between visitors, nothing is booked or paid, and a sandbox disappears after SANDBOX_TTL_MS of
 * inactivity or when the server restarts. Because the queue is private, approving or rejecting needs no PIN.
 *
 * The old shared queue (file or memory, PIN-gated) is only used when APPROVALS_MODE=shared is set explicitly.
 * Neither mode is production authentication: the PIN is a demo guard for a shared queue, not a login.
 */
export type ApprovalsMode = "sandbox" | "shared";

export const SANDBOX_COOKIE = "offsite_demo";
export const SANDBOX_TTL_MS = 2 * 60 * 60_000;
export const MAX_SANDBOXES = 2000;
export const MAX_REQUESTS_PER_SANDBOX = 25;

export function approvalsMode(env: NodeJS.ProcessEnv = process.env): ApprovalsMode {
  return env.APPROVALS_MODE?.trim().toLowerCase() === "shared" ? "shared" : "sandbox";
}

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isSandboxId = (v: string | undefined): v is string => !!v && ID_RE.test(v);

/** Reads the sandbox id from a Cookie header; ignores anything that is not a v4-style uuid. */
export function sandboxIdFromCookie(header: string | null | undefined): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SANDBOX_COOKIE) {
      const id = decodeURIComponent(v.join("="));
      return isSandboxId(id) ? id : undefined;
    }
  }
  return undefined;
}

export function sandboxCookie(id: string, secure: boolean): string {
  return `${SANDBOX_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SANDBOX_TTL_MS / 1000}${secure ? "; Secure" : ""}`;
}

export class SandboxRegistry {
  private readonly boxes = new Map<string, { store: ApprovalStore; seen: number }>();
  constructor(
    private readonly opts: { ttlMs?: number; maxSandboxes?: number; maxRequests?: number } = {},
    private readonly now: () => number = Date.now,
    private readonly newStore: (maxRequests: number) => ApprovalStore = (max) =>
      new ApprovalStore(new MemoryPersistence(), undefined, undefined, max),
  ) {}

  get size() {
    return this.boxes.size;
  }

  /** The visitor's own store; created on first use. Expired sandboxes are dropped, oldest first when over capacity. */
  store(id: string): ApprovalStore {
    const t = this.now();
    this.prune(t);
    let box = this.boxes.get(id);
    if (!box) {
      const max = this.opts.maxSandboxes ?? MAX_SANDBOXES;
      while (this.boxes.size >= max) this.boxes.delete(this.boxes.keys().next().value as string);
      box = { store: this.newStore(this.opts.maxRequests ?? MAX_REQUESTS_PER_SANDBOX), seen: t };
      this.boxes.set(id, box);
    }
    box.seen = t;
    // Map keeps insertion order; re-insert so the least recently used sandbox is first.
    this.boxes.delete(id);
    this.boxes.set(id, box);
    return box.store;
  }

  private prune(t: number) {
    const ttl = this.opts.ttlMs ?? SANDBOX_TTL_MS;
    for (const [k, b] of this.boxes) if (t - b.seen > ttl) this.boxes.delete(k);
  }
}

let registry: SandboxRegistry | undefined;
export const sandboxes = () => (registry ??= new SandboxRegistry());

export interface ResolvedApprovals {
  mode: ApprovalsMode;
  store: ApprovalStore;
  /** Set-Cookie value when a new sandbox id was issued. */
  setCookie?: string;
}

/** Picks the store for this request: the caller's sandbox (issuing an id if needed) or the shared queue. */
export function resolveApprovals(request: Request, env: NodeJS.ProcessEnv = process.env, reg: SandboxRegistry = sandboxes()): ResolvedApprovals {
  const mode = approvalsMode(env);
  if (mode === "shared") return { mode, store: approvalStore() };
  let id = sandboxIdFromCookie(request.headers.get("cookie"));
  let setCookie: string | undefined;
  if (!id) {
    id = crypto.randomUUID();
    setCookie = sandboxCookie(id, env.NODE_ENV === "production");
  }
  return { mode, store: reg.store(id), setCookie };
}
