import { afterEach, describe, expect, it, vi } from "vitest";
import { LOCK_MS, MAX_FAILURES, PinGuard, pinMatches, pinMode } from "@/approvals/pin";
import { PIN_TEXT } from "@/i18n";

const prod = (extra: Record<string, string> = {}) => ({ NODE_ENV: "production", ...extra }) as unknown as NodeJS.ProcessEnv;

describe("approvals PIN guard", () => {
  it("is open in development, disabled in production without a PIN, and PIN-gated when set", () => {
    expect(pinMode({ NODE_ENV: "development" } as unknown as NodeJS.ProcessEnv)).toBe("open");
    expect(pinMode(prod())).toBe("disabled");
    expect(pinMode(prod({ APPROVALS_PIN: "   " }))).toBe("disabled");
    expect(pinMode(prod({ APPROVALS_PIN: "424242" }))).toBe("pin");
  });

  it("refuses with clear codes and accepts the right PIN", () => {
    expect(new PinGuard(prod()).check("123456", "c")).toEqual({ code: "approvals_disabled", status: 503 });
    const g = new PinGuard(prod({ APPROVALS_PIN: "424242" }));
    expect(g.check(undefined, "c")).toEqual({ code: "pin_required", status: 401 });
    expect(g.check("000000", "c")).toEqual({ code: "pin_invalid", status: 401 });
    expect(g.check(" 424242 ", "c")).toBeNull();
    expect(pinMatches("424242", "424243")).toBe(false);
  });

  it("locks a client after repeated wrong PINs, then unlocks after the window", () => {
    let now = 1_000;
    const g = new PinGuard(prod({ APPROVALS_PIN: "424242" }), () => now);
    for (let i = 1; i < MAX_FAILURES; i++) expect(g.check("111111", "a")?.code).toBe("pin_invalid");
    expect(g.check("111111", "a")).toEqual({ code: "pin_locked", status: 429 });
    expect(g.check("424242", "a")?.code).toBe("pin_locked"); // even the right PIN, while locked
    expect(g.check("424242", "b")).toBeNull(); // other clients unaffected
    now += LOCK_MS + 1;
    expect(g.check("424242", "a")).toBeNull();
  });

  it("has bilingual text for every refusal", () => {
    for (const v of Object.values(PIN_TEXT)) {
      expect(v.en.length).toBeGreaterThan(5);
      expect(v.ar).toMatch(/[\u0600-\u06FF]/);
    }
  });
});

describe("approve/reject route with the guard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function setup(env: Record<string, string>) {
    vi.resetModules();
    vi.stubEnv("APPROVALS_FILE", "memory");
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    const { approvalStore, parseSubmission } = await import("@/approvals/store");
    const { POST } = await import("../app/api/approvals/[id]/route");
    // Invented venues only.
    const req = await approvalStore().submit(parseSubmission({
      city: "amman", date: "2027-01-14", startTime: "18:00", headcount: 20, costPerPerson: 30, budgetPerPerson: 40,
      approvalThreshold: 284, dinner: { entityId: "D-test", nameEn: "Test Grill" }, activity: { entityId: "A-test", nameEn: "Test Bowling" },
    }));
    const call = (body: object, headers: Record<string, string> = {}) =>
      POST(new Request(`http://x/api/approvals/${req.id}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: req.id }) });
    return { call, approvalStore, id: req.id };
  }

  it("refuses approve without the PIN and accepts it with the PIN header", async () => {
    const { call, approvalStore, id } = await setup({ NODE_ENV: "production", APPROVALS_PIN: "424242" });
    const r1 = await call({ action: "approve", actor: "Manager" });
    expect(r1.status).toBe(401);
    expect((await r1.json()).code).toBe("pin_required");
    expect((await approvalStore().list("pending")).requests.map((r) => r.id)).toContain(id);
    const r2 = await call({ action: "approve", actor: "Manager" }, { "x-approvals-pin": "424242" });
    expect(r2.status).toBe(200);
    expect((await r2.json()).status).toBe("approved");
  });

  it("is disabled in production when no PIN is configured", async () => {
    const { call } = await setup({ NODE_ENV: "production", APPROVALS_PIN: "" });
    const r = await call({ action: "reject", actor: "Manager", note: "no", pin: "123456" });
    expect(r.status).toBe(503);
    expect((await r.json()).code).toBe("approvals_disabled");
  });
});

describe("serverless filesystem", () => {
  it("a cache write that cannot reach disk does not fail the request", async () => {
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const { ResponseCache } = await import("@/connectors/qloo/cache");
    const blocker = join(mkdtempSync(join(tmpdir(), "oq-")), "file");
    writeFileSync(blocker, "x"); // a file where the cache directory should be
    await expect(new ResponseCache(join(blocker, "qloo"), "on").set("k", { a: 1 })).resolves.toBeUndefined();
  });
});
