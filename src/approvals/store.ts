import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { evaluatePolicy } from "../agent/policy";
import { cityProfile, CITIES } from "../connectors/qloo/catalog";

/**
 * Manager-approval queue with an append-only audit trail, persisted to a local JSON file (gitignored
 * data/private/ by default) or kept in memory. Single-process demo store: writes are serialised in-process.
 */
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type ApprovalAction = "submitted" | "approved" | "rejected";

export interface VenueRef {
  entityId: string;
  nameEn: string;
  nameAr?: string;
}

export interface ApprovalRequest {
  id: string;
  createdAt: string;
  status: ApprovalStatus;
  city: string;
  date: string;
  startTime?: string;
  headcount: number;
  currency: string;
  costPerPerson: number;
  costTotal: number;
  budgetPerPerson: number;
  approvalThreshold: number;
  dinner: VenueRef;
  activity: VenueRef;
  requestedBy: string;
  decidedAt?: string;
  decidedBy?: string;
  note?: string;
}

export interface ApprovalAuditEntry {
  seq: number;
  at: string;
  requestId: string;
  action: ApprovalAction;
  actor: string;
  rule: string;
  note?: string;
}

export interface ApprovalData {
  requests: ApprovalRequest[];
  audit: ApprovalAuditEntry[];
}

export class ApprovalError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 = 400) {
    super(message);
  }
}

export interface Persistence {
  load(): Promise<ApprovalData>;
  save(d: ApprovalData): Promise<void>;
}

export class MemoryPersistence implements Persistence {
  private data: ApprovalData = { requests: [], audit: [] };
  async load() {
    return structuredClone(this.data);
  }
  async save(d: ApprovalData) {
    this.data = structuredClone(d);
  }
}

export class JsonFilePersistence implements Persistence {
  constructor(readonly file: string) {}
  async load(): Promise<ApprovalData> {
    try {
      const d = JSON.parse(await readFile(this.file, "utf8")) as ApprovalData;
      return { requests: Array.isArray(d.requests) ? d.requests : [], audit: Array.isArray(d.audit) ? d.audit : [] };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return { requests: [], audit: [] };
      throw e;
    }
  }
  async save(d: ApprovalData) {
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(d, null, 2), "utf8");
    await rename(tmp, this.file); // atomic replace
  }
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number.NaN);

function venue(v: unknown, field: string): VenueRef {
  const o = (v ?? {}) as Record<string, unknown>;
  const entityId = str(o.entityId, 80);
  const nameEn = str(o.nameEn, 120);
  if (!entityId || !nameEn) throw new ApprovalError(`${field} needs entityId and nameEn.`);
  const nameAr = str(o.nameAr, 120);
  return nameAr ? { entityId, nameEn, nameAr } : { entityId, nameEn };
}

export type SubmissionInput = Omit<ApprovalRequest, "id" | "createdAt" | "status" | "currency" | "decidedAt" | "decidedBy" | "note">;

/** Validates an untrusted submission body. Currency comes from the city, never from the client. */
export function parseSubmission(body: unknown): SubmissionInput {
  if (typeof body !== "object" || body === null) throw new ApprovalError("Body must be a JSON object.");
  const b = body as Record<string, unknown>;
  const city = str(b.city, 40);
  if (!CITIES.some((c) => c.name.toLowerCase() === city.toLowerCase())) throw new ApprovalError("Unknown city.");
  const date = str(b.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApprovalError("date must be yyyy-mm-dd.");
  const startTime = str(b.startTime, 5);
  if (startTime && !/^\d{2}:\d{2}$/.test(startTime)) throw new ApprovalError("startTime must be HH:MM.");
  const headcount = Math.trunc(num(b.headcount));
  const costPerPerson = num(b.costPerPerson);
  const budgetPerPerson = num(b.budgetPerPerson);
  const approvalThreshold = num(b.approvalThreshold);
  if (!(headcount >= 1 && headcount <= 1000)) throw new ApprovalError("headcount must be 1-1000.");
  for (const [k, v] of Object.entries({ costPerPerson, budgetPerPerson, approvalThreshold })) {
    if (!(v >= 0 && v <= 10_000_000)) throw new ApprovalError(`${k} must be a non-negative number.`);
  }
  return {
    city: CITIES.find((c) => c.name.toLowerCase() === city.toLowerCase())!.name,
    date,
    ...(startTime ? { startTime } : {}),
    headcount,
    costPerPerson,
    // Total is recomputed server-side so a client cannot under-report it.
    costTotal: Math.round(costPerPerson * headcount * 100) / 100,
    budgetPerPerson,
    approvalThreshold,
    dinner: venue(b.dinner, "dinner"),
    activity: venue(b.activity, "activity"),
    requestedBy: str(b.requestedBy, 60) || "planner",
  };
}

export class ApprovalStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly db: Persistence = new MemoryPersistence(),
    private readonly now: () => Date = () => new Date(),
    private readonly newId: () => string = () => crypto.randomUUID(),
    /** Cap on stored requests (the per-visitor demo sandbox uses a small one). */
    private readonly maxRequests: number = Number.POSITIVE_INFINITY,
  ) {}

  /** Serialise read-modify-write cycles so concurrent requests cannot drop each other's updates. */
  private tx<T>(fn: (d: ApprovalData) => T | Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const d = await this.db.load();
      const out = await fn(d);
      await this.db.save(d);
      return out;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async list(status?: ApprovalStatus): Promise<ApprovalData> {
    const d = await this.db.load();
    const requests = (status ? d.requests.filter((r) => r.status === status) : d.requests).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    return { requests, audit: [...d.audit].reverse() };
  }

  /** Queues a plan option for manager approval. Only plans the policy routes to a manager (rule R2) are accepted. */
  submit(input: SubmissionInput): Promise<ApprovalRequest> {
    const policy = evaluatePolicy({
      subject: `${input.dinner.nameEn} + ${input.activity.nameEn}`,
      costPerPerson: input.costPerPerson,
      costTotal: input.costTotal,
      budgetPerPerson: input.budgetPerPerson,
      approvalThreshold: input.approvalThreshold,
      currency: cityProfile(input.city).currency,
    });
    if (policy.decision !== "needs_manager_approval") {
      return Promise.reject(new ApprovalError(`This plan does not need manager approval (${policy.rule}).`, 409));
    }
    return this.tx((d) => {
      const dup = d.requests.find(
        (r) =>
          r.status === "pending" &&
          r.dinner.entityId === input.dinner.entityId &&
          r.activity.entityId === input.activity.entityId &&
          r.date === input.date &&
          r.headcount === input.headcount,
      );
      if (dup) return dup; // idempotent re-submit
      if (d.requests.length >= this.maxRequests) throw new ApprovalError("This demo sandbox is full; it resets after two hours.", 409);
      const at = this.now().toISOString();
      const req: ApprovalRequest = { ...input, id: this.newId(), createdAt: at, status: "pending", currency: cityProfile(input.city).currency };
      d.requests.push(req);
      d.audit.push({ seq: d.audit.length + 1, at, requestId: req.id, action: "submitted", actor: input.requestedBy, rule: policy.rule });
      return req;
    });
  }

  decide(id: string, action: "approve" | "reject", actor: string, note?: string): Promise<ApprovalRequest> {
    const who = actor.trim().slice(0, 60);
    if (!who) return Promise.reject(new ApprovalError("Approver name is required."));
    if (action !== "approve" && action !== "reject") return Promise.reject(new ApprovalError("action must be approve or reject."));
    const cleanNote = note?.trim().slice(0, 300) || undefined;
    if (action === "reject" && !cleanNote) return Promise.reject(new ApprovalError("A reason is required to reject."));
    return this.tx((d) => {
      const r = d.requests.find((x) => x.id === id);
      if (!r) throw new ApprovalError("Approval request not found.", 404);
      if (r.status !== "pending") throw new ApprovalError(`Already ${r.status}.`, 409);
      const at = this.now().toISOString();
      r.status = action === "approve" ? "approved" : "rejected";
      r.decidedAt = at;
      r.decidedBy = who;
      if (cleanNote) r.note = cleanNote;
      d.audit.push({
        seq: d.audit.length + 1,
        at,
        requestId: id,
        action: r.status,
        actor: who,
        rule: action === "approve" ? "M1: manager approved spend above threshold" : "M2: manager rejected spend above threshold",
        ...(cleanNote ? { note: cleanNote } : {}),
      });
      return { ...r };
    });
  }
}

let shared: ApprovalStore | undefined;
/** Process-wide store for the API routes. APPROVALS_FILE overrides the path; APPROVALS_FILE=memory keeps it in RAM (default on Vercel, where the filesystem is read-only; resets on cold start). */
export function approvalStore(): ApprovalStore {
  if (!shared) {
    const f = process.env.APPROVALS_FILE ?? (process.env.VERCEL ? "memory" : "data/private/approvals.json");
    shared = new ApprovalStore(f === "memory" ? new MemoryPersistence() : new JsonFilePersistence(f));
  }
  return shared;
}
