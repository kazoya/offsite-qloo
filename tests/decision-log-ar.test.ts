import { describe, expect, it } from "vitest";
import { runAgent, type Feedback, type PlanRequest } from "../src/agent";
import { checkText, logText } from "../src/i18n/decisionLog";
import { DINNERS, FakeQloo } from "./fixtures/qloo";

const FIXED = () => new Date("2026-10-24T09:00:00.000Z");
// Synthetic team and invented venues (fixtures).
const team = [
  { name: "Lina", cuisines: ["lebanese"], activities: ["museum"], artists: ["Fairuz"], dietary: ["vegetarian"] },
  { name: "Omar", cuisines: ["lebanese", "grill"], activities: ["bowling"], artists: [], dietary: ["halal"] },
  { name: "Sami", cuisines: ["japanese"], activities: ["park"], artists: [], dietary: [] },
];
const base: PlanRequest = { team, city: "Amman", budgetPerPerson: 40, headcount: 10, date: "2026-11-12", language: "ar" };
const latinWords = (s: string) => (s.match(/[A-Za-z]{4,}/g) ?? []).filter((w) => !["Qloo", "Lina", "Omar", "Sami", "Fake"].includes(w));

describe("Arabic decision log", () => {
  it("renders every step and check of a replan in Arabic from the structured facts", async () => {
    const fb: Feedback[] = [
      { type: "budget", budgetPerPerson: 30 },
      { type: "reject_venue", entityId: DINNERS[0]!.entityId },
      { type: "not_fair", member: "Sami" },
      { type: "manager_reject", dinnerId: "X", activityId: "Y", reason: "بعيد عن المكتب" },
    ];
    const plan = await runAgent(base, fb, { qloo: new FakeQloo(), now: FIXED });
    const steps = new Set(plan.agent.log.map((e) => e.step));
    expect(steps.size).toBe(9);
    for (const e of plan.agent.log) {
      const t = logText(e, "ar", plan.agent.feedback);
      for (const s of [t.decision, t.reason]) {
        expect(s).toMatch(/[\u0600-\u06ff]/);
        // Only names and the "Qloo"/"R2" labels may stay Latin; topRestaurant names come from the fixtures.
        expect(latinWords(s.replace(/"[^"]*"/g, ""))).toEqual([]);
      }
    }
    expect(logText(plan.agent.log.find((e) => e.step === "understand")!, "ar").decision).toContain("عمّان");
    expect(logText(plan.agent.log.find((e) => e.step === "apply_feedback")!, "ar", plan.agent.feedback).reason).toContain("بعيد عن المكتب");
    expect(plan.agent.checks).toHaveLength(4);
    for (const c of plan.agent.checks) {
      expect(c.code).toBeTruthy();
      expect(checkText(c, "ar")).toMatch(/[\u0600-\u06ff]/);
      expect(checkText(c, "en")).toBe(c.detail);
    }
    const budget = plan.agent.checks.find((c) => c.feedback.type === "budget")!;
    if (budget.code === "budget") expect(checkText(budget, "ar")).toContain(String(budget.values!.now));
  });

  it("keeps the server's English text for the EN UI", async () => {
    const plan = await runAgent({ ...base, language: "en" }, [], { qloo: new FakeQloo(), now: FIXED });
    for (const e of plan.agent.log) expect(logText(e, "en")).toEqual({ decision: e.decision, reason: e.reason });
  });
});
