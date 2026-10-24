import { describe, expect, it } from "vitest";
import { AUTONOMY, Deadline, DeadlineError, ReusingQloo, runAgent, type PlanRequest } from "../src/agent";
import { parseFeedback, ValidationError } from "../src/agent/validate";
import { DINNERS, FakeQloo, place } from "./fixtures/qloo";

const FIXED = () => new Date("2026-10-24T09:00:00.000Z");
// Synthetic team: Sami's picks (Japanese, park) are the minority.
const team = [
  { name: "Lina", cuisines: ["lebanese"], activities: ["museum"], artists: ["Fairuz"], dietary: ["vegetarian"] },
  { name: "Omar", cuisines: ["lebanese", "grill"], activities: ["bowling"], artists: ["Amr Diab"], dietary: ["halal"] },
  { name: "Sami", cuisines: ["japanese"], activities: ["park"], artists: [], dietary: [] },
];
const base: PlanRequest = { team, city: "Amman", budgetPerPerson: 40, headcount: 10, date: "2026-11-12", language: "en" };
const ids = (p: { options: { dinner: { place: { entityId: string } }; activity: { place: { entityId: string } } }[] }) =>
  p.options.flatMap((o) => [o.dinner.place.entityId, o.activity.place.entityId]);

describe("agent loop", () => {
  it("logs every step in order with inputs, decision, reason and timing", async () => {
    let t = 0;
    const plan = await runAgent(base, [], { qloo: new FakeQloo(), now: FIXED, clock: () => (t += 5) });
    expect(plan.agent.log.map((e) => e.step)).toEqual([
      "understand",
      "qloo_queries",
      "rank",
      "budget_time_check",
      "propose",
      "explain",
      "approval_gate",
    ]);
    for (const e of plan.agent.log) {
      expect(e.pass).toBe("initial");
      expect(e.decision.length).toBeGreaterThan(10);
      expect(e.reason.length).toBeGreaterThan(10);
      expect(e.ms).toBeGreaterThan(0);
      expect(Object.keys(e.inputs).length).toBeGreaterThan(0);
    }
    expect(plan.agent.log.find((e) => e.step === "budget_time_check")!.inputs).toMatchObject({ budgetPerPerson: 40 });
    expect(plan.agent.replanned).toBe(false);
    // Backward compatible: still a full Plan.
    expect(plan.options.length).toBe(3);
    expect(plan.fairness).toBeDefined();
  });

  it("declares and enforces its autonomy limits", async () => {
    const plan = await runAgent(base, [], { qloo: new FakeQloo(), now: FIXED });
    expect(plan.agent.autonomy).toEqual({ proposesOnly: true, books: false, pays: false, r2RequiresHuman: true, autoSubmitsApprovals: false });
    expect(AUTONOMY.books).toBe(false);
  });

  it("never auto-approves an R2 plan: every option over the threshold waits for a human", async () => {
    const plan = await runAgent({ ...base, approvalThreshold: 30 }, [], { qloo: new FakeQloo(), now: FIXED });
    expect(plan.options.length).toBeGreaterThan(0);
    for (const o of plan.options) {
      expect(o.costTotal).toBeGreaterThan(30);
      expect(o.decision).toBe("needs_manager_approval");
    }
    expect(plan.agent.gate.every((g) => g.status === "awaiting_human" && g.rule === "R2")).toBe(true);
    // And the same holds after a replan.
    const re = await runAgent({ ...base, approvalThreshold: 30 }, [{ type: "budget", budgetPerPerson: 20 }], { qloo: new FakeQloo(), now: FIXED });
    expect(re.options.every((o) => o.decision !== "auto_approved")).toBe(true);
    expect(re.agent.gate.every((g) => g.status === "awaiting_human")).toBe(true);
  });

  it("replans after a budget cut into a cheaper plan that fits the new budget, without new Qloo calls", async () => {
    const q = new FakeQloo();
    const before = await runAgent(base, [], { qloo: new FakeQloo(), now: FIXED });
    const plan = await runAgent(base, [{ type: "budget", budgetPerPerson: 15, reason: "Finance cut the budget" }], { qloo: q, now: FIXED });
    const maxBefore = Math.max(...before.options.map((o) => o.costPerPerson));
    const maxAfter = Math.max(...plan.options.map((o) => o.costPerPerson));
    expect(plan.options.length).toBeGreaterThan(0);
    expect(plan.options.every((o) => o.costPerPerson <= 15)).toBe(true);
    expect(maxAfter).toBeLessThan(maxBefore);
    expect(plan.request.budgetPerPerson).toBe(15);
    expect(plan.agent.replanned).toBe(true);
    expect(plan.agent.changed).toBe(true);
    expect(plan.agent.checks).toEqual([expect.objectContaining({ satisfied: true })]);
    // Pass 1 and the replan send identical Qloo requests; the replan reuses them all.
    expect(q.httpCalls).toBe(5);
    expect(plan.agent.qloo).toEqual({ httpCalls: 5, reusedResponses: 5 });
    expect(plan.agent.log.find((e) => e.step === "verify_feedback")!.inputs).toMatchObject({ qlooCallsDuringReplan: 0 });
    const steps = plan.agent.log.map((e) => `${e.pass}:${e.step}`);
    expect(steps).toContain("replan:apply_feedback");
    expect(steps.at(-1)).toBe("replan:verify_feedback");
  });

  it("replans after a rejected venue and excludes it (and other branches of the same chain)", async () => {
    const branch = place({ ...DINNERS[0]!, entityId: "D1-B", tags: DINNERS[0]!.tags.map((t) => t.id) });
    const q = new FakeQloo([...DINNERS, branch]);
    const first = await runAgent(base, [], { qloo: new FakeQloo([...DINNERS, branch]), now: FIXED });
    const rejected = first.options[0]!.dinner.place.entityId;
    const plan = await runAgent(base, [{ type: "reject_venue", entityId: rejected, reason: "Too far" }], { qloo: q, now: FIXED });
    expect(ids(first)).toContain(rejected);
    expect(ids(plan)).not.toContain("D1");
    expect(ids(plan)).not.toContain("D1-B");
    expect(plan.options.length).toBe(3);
    expect(plan.agent.checks[0]).toMatchObject({ satisfied: true });
    expect(plan.agent.log.find((e) => e.pass === "replan" && e.step === "rank")!.inputs.excludedByFeedback).toBeGreaterThanOrEqual(1);
    expect(plan.agent.baseline!.map((o) => o.dinnerId)).toContain(rejected);
  });

  it("replans after 'not fair to Sami' so option 1 covers Sami", async () => {
    const first = await runAgent(base, [], { qloo: new FakeQloo(), now: FIXED });
    expect(first.fairness!.options[0]!.leftOut).toContain("Sami");
    const plan = await runAgent(base, [{ type: "not_fair", member: "Sami", reason: "Sami gets nothing" }], { qloo: new FakeQloo(), now: FIXED });
    expect(plan.fairness!.options[0]!.leftOut).not.toContain("Sami");
    expect(plan.agent.checks[0]).toMatchObject({ satisfied: true });
    expect(plan.options.every((o) => o.costPerPerson <= base.budgetPerPerson)).toBe(true);
  });

  it("replans after a manager rejects option 1: that pairing is gone, its venues may still appear elsewhere", async () => {
    const first = await runAgent(base, [], { qloo: new FakeQloo(), now: FIXED });
    const o1 = first.options[0]!;
    const fb = { type: "manager_reject" as const, dinnerId: o1.dinner.place.entityId, activityId: o1.activity.place.entityId, reason: "Too far from the office" };
    const re = await runAgent(base, [fb], { qloo: new FakeQloo(), now: FIXED });
    expect(re.options.length).toBeGreaterThan(0);
    expect(re.options.some((o) => o.dinner.place.entityId === fb.dinnerId && o.activity.place.entityId === fb.activityId)).toBe(false);
    expect(re.agent.checks).toEqual([expect.objectContaining({ satisfied: true })]);
    expect(re.agent.changed).toBe(true);
    expect(re.agent.log.find((e) => e.step === "apply_feedback")!.inputs).toMatchObject({ managerRejectedOptions: 1 });
    expect(re.agent.log.find((e) => e.step === "apply_feedback")!.reason).toContain("Too far from the office");
  });

  it("requires a reason when a manager rejects, and validates both ids", () => {
    expect(() => parseFeedback([{ type: "manager_reject", dinnerId: "D1", activityId: "A1" }], base)).toThrow(ValidationError);
    expect(() => parseFeedback([{ type: "manager_reject", dinnerId: "D1", activityId: "A 1", reason: "x" }], base)).toThrow(ValidationError);
    expect(parseFeedback([{ type: "manager_reject", dinnerId: "D1", activityId: "A1", reason: " pricey " }], base)).toEqual([
      { type: "manager_reject", dinnerId: "D1", activityId: "A1", reason: "pricey" },
    ]);
  });

  it("says so honestly when feedback cannot be met", async () => {
    const plan = await runAgent(base, [{ type: "budget", budgetPerPerson: 1 }], { qloo: new FakeQloo(), now: FIXED });
    expect(plan.options.length).toBe(0);
    expect(plan.agent.checks[0]).toMatchObject({ satisfied: false });
    expect(plan.agent.log.at(-1)!.reason).toMatch(/reported as-is/);
  });
});

describe("deadline", () => {
  class SlowQloo extends FakeQloo {
    override async insights(r: Parameters<FakeQloo["insights"]>[0]) {
      await new Promise((res) => setTimeout(res, 300));
      return super.insights(r);
    }
  }

  it("stops a slow run with DeadlineError instead of hanging", async () => {
    const started = Date.now();
    await expect(runAgent(base, [], { qloo: new SlowQloo(), now: FIXED, deadline: new Deadline(80) })).rejects.toBeInstanceOf(DeadlineError);
    expect(Date.now() - started).toBeLessThan(250);
  });

  it("lets a run that fits the budget finish, and reports the budget", async () => {
    const plan = await runAgent(base, [], { qloo: new FakeQloo(), now: FIXED, deadline: new Deadline(25_000) });
    expect(plan.agent.deadlineMs).toBe(25_000);
  });

  it("checks with an injectable clock", () => {
    let now = 0;
    const d = new Deadline(1000, () => now);
    expect(d.remaining()).toBe(1000);
    now = 1500;
    expect(d.remaining()).toBe(0);
    expect(() => d.check("rank")).toThrow(DeadlineError);
  });

  it("reuses identical Qloo requests inside a run", async () => {
    const inner = new FakeQloo();
    const q = new ReusingQloo(inner);
    await q.searchEntities({ query: "Fairuz", types: ["urn:entity:artist"], take: 5 });
    await q.searchEntities({ query: "Fairuz", types: ["urn:entity:artist"], take: 5 });
    expect(inner.httpCalls).toBe(1);
    expect(q.reused).toBe(1);
  });
});

describe("feedback validation", () => {
  const ok = (raw: unknown) => parseFeedback(raw, base);
  it("accepts the three feedback types and trims reasons", () => {
    expect(ok(undefined)).toEqual([]);
    expect(
      ok([
        { type: "budget", budgetPerPerson: 20 },
        { type: "reject_venue", entityId: "ABC-123_x:y", reason: "  too far " },
        { type: "not_fair", member: "Sami" },
      ]),
    ).toEqual([
      { type: "budget", budgetPerPerson: 20 },
      { type: "reject_venue", entityId: "ABC-123_x:y", reason: "too far" },
      { type: "not_fair", member: "Sami" },
    ]);
  });
  it.each([
    ["not a list", { type: "budget" }],
    ["too many", Array.from({ length: 11 }, () => ({ type: "budget", budgetPerPerson: 10 }))],
    ["unknown type", [{ type: "book_it" }]],
    ["negative budget", [{ type: "budget", budgetPerPerson: -5 }]],
    ["huge budget", [{ type: "budget", budgetPerPerson: 1e9 }]],
    ["bad entity id", [{ type: "reject_venue", entityId: "<script>" }]],
    ["long entity id", [{ type: "reject_venue", entityId: "x".repeat(81) }]],
    ["unknown member", [{ type: "not_fair", member: "Mallory" }]],
    ["long reason", [{ type: "not_fair", member: "Sami", reason: "x".repeat(201) }]],
  ])("rejects %s", (_, raw) => {
    expect(() => ok(raw)).toThrow(ValidationError);
  });
});

describe("loop warnings in Arabic", () => {
  it("translates the could-not-be-fairer note", async () => {
    const { warningText } = await import("../src/i18n");
    expect(warningText("No option within budget covers Sami's picks; the plan could not be made fairer to them.", "ar")).toMatch(/Sami/);
    expect(warningText("No option within budget covers Sami's picks; the plan could not be made fairer to them.", "ar")).not.toMatch(/No option/);
  });
});
