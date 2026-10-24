import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ApprovalError, ApprovalStore, JsonFilePersistence, parseSubmission } from "../src/approvals/store";

// Invented venues only.
const body = (over: Record<string, unknown> = {}) => ({
  city: "amman",
  date: "2027-01-14",
  startTime: "18:00",
  headcount: 20,
  costPerPerson: 30,
  costTotal: 1, // ignored: recomputed server-side
  budgetPerPerson: 40,
  approvalThreshold: 284,
  dinner: { entityId: "D-test", nameEn: "Test Grill", nameAr: "مشاوي تجريبية" },
  activity: { entityId: "A-test", nameEn: "Test Bowling" },
  ...over,
});

let n = 0;
const mkStore = (db?: JsonFilePersistence) =>
  new ApprovalStore(db, () => new Date("2027-01-01T10:00:00Z"), () => `req-${++n}`);

describe("parseSubmission", () => {
  it("normalises city, recomputes total, derives nothing from client currency", () => {
    const s = parseSubmission(body({ currency: "USD" }));
    expect(s.city).toBe("Amman");
    expect(s.costTotal).toBe(600);
    expect((s as Record<string, unknown>).currency).toBeUndefined();
  });
  it("rejects bad input", () => {
    expect(() => parseSubmission(null)).toThrow(ApprovalError);
    expect(() => parseSubmission(body({ city: "Jeddah" }))).toThrow(/city/);
    expect(() => parseSubmission(body({ date: "14/01/2027" }))).toThrow(/date/);
    expect(() => parseSubmission(body({ headcount: 0 }))).toThrow(/headcount/);
    expect(() => parseSubmission(body({ costPerPerson: -1 }))).toThrow(/costPerPerson/);
    expect(() => parseSubmission(body({ dinner: { nameEn: "x" } }))).toThrow(/dinner/);
  });
});

describe("ApprovalStore", () => {
  it("accepts only plans the policy routes to a manager (R2)", async () => {
    const s = mkStore();
    const r = await s.submit(parseSubmission(body()));
    expect(r).toMatchObject({ status: "pending", currency: "JOD", costTotal: 600 });
    await expect(s.submit(parseSubmission(body({ headcount: 5 })))).rejects.toThrow(/R3/); // 150 <= 284
    await expect(s.submit(parseSubmission(body({ costPerPerson: 50 })))).rejects.toThrow(/R1/); // over budget
  });

  it("is idempotent for an identical pending submission", async () => {
    const s = mkStore();
    const a = await s.submit(parseSubmission(body()));
    const b = await s.submit(parseSubmission(body()));
    expect(b.id).toBe(a.id);
    expect((await s.list()).audit).toHaveLength(1);
  });

  it("approves once, refuses a second decision, and appends to the audit trail", async () => {
    const s = mkStore();
    const r = await s.submit(parseSubmission(body()));
    const ok = await s.decide(r.id, "approve", "Lina (Finance)", "fine");
    expect(ok).toMatchObject({ status: "approved", decidedBy: "Lina (Finance)", note: "fine" });
    await expect(s.decide(r.id, "reject", "Omar", "no")).rejects.toMatchObject({ status: 409 });
    const { audit, requests } = await s.list();
    expect(audit.map((a) => a.action)).toEqual(["approved", "submitted"]); // newest first
    expect(audit.map((a) => a.seq)).toEqual([2, 1]);
    expect(requests[0]!.status).toBe("approved");
    expect((await s.list("pending")).requests).toHaveLength(0);
  });

  it("requires an approver, a reason to reject, and a known id", async () => {
    const s = mkStore();
    const r = await s.submit(parseSubmission(body()));
    await expect(s.decide(r.id, "approve", "  ")).rejects.toThrow(/Approver/);
    await expect(s.decide(r.id, "reject", "Omar")).rejects.toThrow(/reason/);
    await expect(s.decide("nope", "approve", "Omar")).rejects.toMatchObject({ status: 404 });
    const rej = await s.decide(r.id, "reject", "Omar", "Too expensive this quarter");
    expect(rej.status).toBe("rejected");
  });

  it("serialises concurrent decisions: exactly one wins", async () => {
    const s = mkStore();
    const r = await s.submit(parseSubmission(body()));
    const results = await Promise.allSettled([s.decide(r.id, "approve", "A"), s.decide(r.id, "reject", "B", "x")]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await s.list()).audit).toHaveLength(2);
  });

  describe("JSON file persistence", () => {
    let dir = "";
    afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));
    it("persists across store instances", async () => {
      dir = mkdtempSync(join(tmpdir(), "approvals-"));
      const file = join(dir, "nested", "approvals.json");
      const r = await mkStore(new JsonFilePersistence(file)).submit(parseSubmission(body()));
      const again = mkStore(new JsonFilePersistence(file));
      await again.decide(r.id, "approve", "Lina");
      const saved = JSON.parse(readFileSync(file, "utf8"));
      expect(saved.requests[0].status).toBe("approved");
      expect(saved.audit).toHaveLength(2);
    });
  });
});
