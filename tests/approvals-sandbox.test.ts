import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SANDBOX_COOKIE,
  SandboxRegistry,
  approvalsMode,
  resolveApprovals,
  sandboxCookie,
  sandboxIdFromCookie,
} from "@/approvals/sandbox";
import { parseSubmission } from "@/approvals/store";

// Invented venues only.
const submission = (n = 1) =>
  parseSubmission({
    city: "amman", date: "2027-01-14", startTime: "18:00", headcount: 12, costPerPerson: 30, budgetPerPerson: 40,
    approvalThreshold: 284, dinner: { entityId: `D-fake-${n}`, nameEn: `Fake Grill ${n}` }, activity: { entityId: "A-fake", nameEn: "Fake Lanes" },
  });
const A = "11111111-2222-4333-8444-555555555555";
const B = "66666666-7777-4888-9999-aaaaaaaaaaaa";
const env = (e: Record<string, string> = {}) => ({ NODE_ENV: "production", ...e }) as unknown as NodeJS.ProcessEnv;
const withCookie = (id?: string) => new Request("http://x/api/approvals", { headers: id ? { cookie: `foo=1; ${SANDBOX_COOKIE}=${id}` } : {} });

describe("approvals demo sandbox", () => {
  it("is the default mode; the shared queue needs APPROVALS_MODE=shared", () => {
    expect(approvalsMode(env())).toBe("sandbox");
    expect(approvalsMode(env({ APPROVALS_PIN: "424242" }))).toBe("sandbox");
    expect(approvalsMode(env({ APPROVALS_MODE: " Shared " }))).toBe("shared");
  });

  it("reads only well-formed ids from the cookie and issues a secure HttpOnly cookie", () => {
    expect(sandboxIdFromCookie(`a=b; ${SANDBOX_COOKIE}=${A}`)).toBe(A);
    expect(sandboxIdFromCookie(`${SANDBOX_COOKIE}=../../etc`)).toBeUndefined();
    expect(sandboxIdFromCookie(undefined)).toBeUndefined();
    const c = sandboxCookie(A, true);
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Lax");
    expect(c).toContain("Secure");
    expect(sandboxCookie(A, false)).not.toContain("Secure");
  });

  it("scopes each visitor to a private queue", async () => {
    const reg = new SandboxRegistry();
    const a = resolveApprovals(withCookie(A), env(), reg);
    const b = resolveApprovals(withCookie(B), env(), reg);
    expect(a.setCookie).toBeUndefined();
    await a.store.submit(submission());
    expect((await a.store.list()).requests).toHaveLength(1);
    expect((await b.store.list()).requests).toHaveLength(0);
    // Same visitor again sees the same queue.
    expect((await resolveApprovals(withCookie(A), env(), reg).store.list()).requests).toHaveLength(1);
  });

  it("gives a new visitor (no or bad cookie) a fresh sandbox and a cookie for it", async () => {
    const reg = new SandboxRegistry();
    await resolveApprovals(withCookie(A), env(), reg).store.submit(submission());
    const fresh = resolveApprovals(withCookie("not-a-uuid"), env(), reg);
    expect(fresh.setCookie).toMatch(new RegExp(`^${SANDBOX_COOKIE}=[0-9a-f-]{36};`));
    expect((await fresh.store.list()).requests).toHaveLength(0);
  });

  it("expires idle sandboxes, caps how many exist, and caps requests per sandbox", async () => {
    let now = 0;
    const reg = new SandboxRegistry({ ttlMs: 1000, maxSandboxes: 2, maxRequests: 2 }, () => now);
    const s = reg.store(A);
    await s.submit(submission(1));
    await s.submit(submission(2));
    await expect(s.submit(submission(3))).rejects.toMatchObject({ status: 409 });
    now = 2000; // idle past the TTL
    expect((await reg.store(A).list()).requests).toHaveLength(0);
    reg.store(B);
    reg.store("33333333-2222-4333-8444-555555555555");
    expect(reg.size).toBe(2); // oldest evicted
  });
});

describe("approvals routes in sandbox mode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("lets a visitor submit and decide without a PIN, and other visitors cannot see or decide it", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APPROVALS_PIN", "424242"); // ignored in sandbox mode
    vi.stubEnv("APPROVALS_MODE", "");
    const { POST, GET } = await import("../app/api/approvals/route");
    const { POST: DECIDE } = await import("../app/api/approvals/[id]/route");
    const body = {
      city: "amman", date: "2027-01-14", startTime: "18:00", headcount: 12, costPerPerson: 30, budgetPerPerson: 40,
      approvalThreshold: 284, dinner: { entityId: "D-fake", nameEn: "Fake Grill" }, activity: { entityId: "A-fake", nameEn: "Fake Lanes" },
    };
    const created = await POST(new Request("http://x/api/approvals", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.1.1.1" }, body: JSON.stringify(body) }));
    expect(created.status).toBe(201);
    const cookie = created.headers.get("set-cookie")!.split(";")[0]!;
    const { id, mode } = await created.json();
    expect(mode).toBe("sandbox");

    const other = await GET(new Request("http://x/api/approvals", { headers: { "x-forwarded-for": "10.1.1.2" } }));
    expect((await other.json()).requests).toHaveLength(0);
    const stranger = await DECIDE(
      new Request(`http://x/api/approvals/${id}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.1.1.3" }, body: JSON.stringify({ action: "approve", actor: "M" }) }),
      { params: Promise.resolve({ id }) },
    );
    expect(stranger.status).toBe(404);

    const mine = await DECIDE(
      new Request(`http://x/api/approvals/${id}`, { method: "POST", headers: { "content-type": "application/json", cookie, "x-forwarded-for": "10.1.1.1" }, body: JSON.stringify({ action: "reject", actor: "Demo manager", note: "Too pricey" }) }),
      { params: Promise.resolve({ id }) },
    );
    expect(mine.status).toBe(200);
    expect((await mine.json()).status).toBe("rejected");
  });
});
