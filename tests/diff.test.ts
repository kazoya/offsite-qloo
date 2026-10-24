import { describe, expect, it } from "vitest";
import { diffPlans, diffViews, runAgent, type PlanRequest } from "../src/agent";
import { DEMO_COMPANY } from "../src/demo/company";
import { FakeQloo } from "./fixtures/qloo";

const FIXED = () => new Date("2026-10-24T09:00:00.000Z");
const team = [
  { name: "Lina", cuisines: ["lebanese"], activities: ["museum"], artists: ["Fairuz"], dietary: ["vegetarian"] },
  { name: "Omar", cuisines: ["lebanese", "grill"], activities: ["bowling"], artists: [], dietary: ["halal"] },
  { name: "Sami", cuisines: ["japanese"], activities: ["park"], artists: [], dietary: [] },
];
const base: PlanRequest = { team, city: "Amman", budgetPerPerson: 40, headcount: 10, date: "2026-11-12", language: "en" };

// Hand-built minimal plans with invented venues.
const cand = (id: string, cost: number) => ({ place: { entityId: id, nameEn: `Fake ${id}` }, costPerPerson: cost });
const opt = (rank: number, d: string, a: string, cost: number) => ({ rank, dinner: cand(d, cost / 2), activity: cand(a, cost / 2), costPerPerson: cost });
const fair = (rank: number, mean: number, min: number, leftOut: string[]) => ({
  rank, mean, min, coverage: 0, leftOut, labels: [],
  members: ["A", "B", "C"].map((name) => ({ name, score: leftOut.includes(name) ? 0 : 0.5, dinner: 0, activity: 0 })),
});
const mk = (budget: number, options: ReturnType<typeof opt>[], f: ReturnType<typeof fair>[]) =>
  ({ request: { ...base, budgetPerPerson: budget }, options, fairness: { options: f } }) as never;

describe("diffPlans", () => {
  it("reports same, changed, added and removed options with cost and fairness deltas", () => {
    const before = mk(40, [opt(1, "D1", "A1", 30), opt(2, "D2", "A2", 25)], [fair(1, 0.6, 0, ["C"]), fair(2, 0.5, 0.2, [])]);
    const after = mk(20, [opt(1, "D1", "A1", 30), opt(2, "D3", "A2", 18), opt(3, "D4", "A4", 15)], [fair(1, 0.6, 0, ["C"]), fair(2, 0.55, 0, ["B"]), fair(3, 0.4, 0.1, [])]);
    const d = diffPlans(before, after);
    expect(d.options.map((o) => o.status)).toEqual(["same", "changed", "added"]);
    const o2 = d.options[1]!;
    expect(o2).toMatchObject({ dinnerChanged: true, activityChanged: false, costDeltaPerPerson: -7, meanDelta: 0.05, minDelta: -0.2, leftOutAdded: ["B"], leftOutRemoved: [] });
    expect(o2.before!.dinner.nameEn).toBe("Fake D2");
    expect(o2.after!.covered).toBe(2);
    expect(d.changedCount).toBe(2);
    expect([d.budgetBefore, d.budgetAfter, d.cheapestBefore, d.cheapestAfter]).toEqual([40, 20, 25, 15]);
    expect(d.venuesDropped.map((v) => v.id)).toEqual(["D2"]);
    expect(d.venuesAdded.map((v) => v.id).sort()).toEqual(["A4", "D3", "D4"]);
    expect(diffPlans(after, before).options[2]!.status).toBe("removed");
  });

  it("an identical replan shows no change", async () => {
    const p = await runAgent(base, [], { qloo: new FakeQloo(), now: FIXED });
    const d = diffPlans(p, p);
    expect(d.changedCount).toBe(0);
    expect(d.venuesAdded).toEqual([]);
  });

  it("a budget cut replan diff shows cheaper options and the new budget", async () => {
    const p = await runAgent(base, [], { qloo: new FakeQloo(), now: FIXED });
    const q = await runAgent(base, [{ type: "budget", budgetPerPerson: 20 }], { qloo: new FakeQloo(), now: FIXED });
    const d = diffPlans(p, q);
    expect(d.budgetAfter).toBe(20);
    expect(d.cheapestAfter!).toBeLessThanOrEqual(d.cheapestBefore!);
    for (const o of d.options) if (o.after) expect(o.after.costPerPerson).toBeLessThanOrEqual(20);
  });
});

describe("demo company", () => {
  it("is a synthetic team of 12 profiles for 20 people with a set budget and varied tastes from the catalog", async () => {
    const { CUISINES, ACTIVITIES, DIETARY } = await import("../src/connectors/qloo/catalog");
    expect(DEMO_COMPANY.members).toHaveLength(12);
    expect(DEMO_COMPANY.headcount).toBe(20);
    expect(DEMO_COMPANY.budgetPerPerson).toBeGreaterThan(0);
    expect(new Set(DEMO_COMPANY.members.map((m) => m.name)).size).toBe(12);
    const keys = (xs: readonly { key: string }[]) => new Set(xs.map((x) => x.key));
    const c = keys(CUISINES), a = keys(ACTIVITIES), dt = keys(DIETARY);
    for (const m of DEMO_COMPANY.members) {
      m.cuisines.forEach((k) => expect(c.has(k)).toBe(true));
      m.activities.forEach((k) => expect(a.has(k)).toBe(true));
      m.dietary.forEach((k) => expect(dt.has(k)).toBe(true));
    }
    expect(new Set(DEMO_COMPANY.members.flatMap((m) => m.cuisines)).size).toBeGreaterThanOrEqual(10);
  });
});

describe("diffViews", () => {
  const p0 = mk(40, [opt(1, "D1", "A1", 30)], [fair(1, 0.5, 0, ["C"])]);
  const p1 = mk(30, [opt(1, "D2", "A1", 25)], [fair(1, 0.5, 0.5, [])]);
  const p2 = mk(20, [opt(1, "D3", "A1", 18)], [fair(1, 0.6, 0.5, [])]);
  it("has no diff before any replan", () => {
    expect(diffViews(p0, null, p0)).toEqual({});
  });
  it("after one replan only the previous view exists (it is the original)", () => {
    const v = diffViews(p0, p0, p1);
    expect(v.vsOriginal).toBeUndefined();
    expect(v.vsPrevious!.options[0]!.before!.dinner.id).toBe("D1");
  });
  it("after two replans compares against both the previous and the original plan", () => {
    const v = diffViews(p0, p1, p2);
    expect(v.vsPrevious!.options[0]!.before!.dinner.id).toBe("D2");
    expect(v.vsOriginal!.options[0]!.before!.dinner.id).toBe("D1");
    expect([v.vsOriginal!.budgetBefore, v.vsOriginal!.budgetAfter]).toEqual([40, 20]);
    expect(v.vsOriginal!.options[0]!.leftOutRemoved).toEqual(["C"]);
    expect(v.vsPrevious!.options[0]!.leftOutRemoved).toEqual([]);
  });
});
