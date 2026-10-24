import { describe, expect, it } from "vitest";
import { planOffsite, type PlanRequest } from "../src/agent";
import { pickDiverse } from "../src/agent/planner";
import { ACTIVITY_VENUES, FakeQloo, place } from "./fixtures/qloo";

const R = "urn:tag:genre:place:restaurant:";
const D = "urn:tag:dietary_option:qloo:";
const FIXED = () => new Date("2026-10-24T09:00:00.000Z");
const team = [
  { name: "Lina", cuisines: ["lebanese"], activities: ["museum"], artists: [], dietary: ["halal"] },
  { name: "Omar", cuisines: ["italian"], activities: ["bowling"], artists: [], dietary: [] },
];
// Dubai-like budget: AED, price level 2 ~ 79 AED, level 4 ~ 308 AED.
const base: PlanRequest = { team, city: "Dubai", budgetPerPerson: 110, headcount: 10, date: "2026-11-12", language: "en" };

describe("option variety (synthetic venues)", () => {
  it("does not let expensive top-ranked dinners crowd out distinct affordable ones", async () => {
    // Eight pricey, highly ranked, halal-confirmed dinners and three cheap ones (one confirmed, two not).
    const pricey = Array.from({ length: 8 }, (_, i) =>
      place({ entityId: `X${i}`, nameEn: `Invented Luxe ${i}`, affinity: 0.99 - i * 0.01, priceLevel: 4, tags: [R + "lebanese", D + "halal"] }),
    );
    const cheap = [
      place({ entityId: "C1", nameEn: "Invented Diner One", affinity: 0.4, priceLevel: 2, tags: [R + "lebanese", D + "halal"] }),
      place({ entityId: "C2", nameEn: "Invented Diner Two", affinity: 0.35, priceLevel: 2, tags: [R + "italian"] }),
      place({ entityId: "C3", nameEn: "Invented Diner Three", affinity: 0.3, priceLevel: 1, tags: [R + "italian"] }),
    ];
    const plan = await planOffsite(base, { qloo: new FakeQloo([...pricey, ...cheap], ACTIVITY_VENUES, "Dubai"), now: FIXED });
    const dinners = plan.options.map((o) => o.dinner.place.entityId);
    expect(plan.options).toHaveLength(3);
    expect(new Set(dinners).size).toBe(3);
    expect(dinners[0]).toBe("C1"); // the only confirmed affordable dinner ranks first
    // Unconfirmed dinners are kept (flagged) because fewer than 3 confirmed dinners fit the budget.
    expect(plan.options.slice(1).every((o) => o.dinner.dietaryUnconfirmed.includes("halal"))).toBe(true);
    expect(plan.warnings.join()).not.toMatch(/share a dinner/);
    // Expensive dinners still show up as justified rejections in the audit.
    expect(plan.audit.some((a) => a.decision === "rejected_over_budget" && a.subject.startsWith("Invented Luxe"))).toBe(true);
  });

  it("collapses branches of one chain into a single candidate", async () => {
    const chain = [
      place({ entityId: "B1", nameEn: "Invented Chain Grill", affinity: 0.9, priceLevel: 2, tags: [R + "lebanese"] }),
      place({ entityId: "B2", nameEn: "Invented Chain  Grill!", affinity: 0.89, priceLevel: 2, tags: [R + "lebanese"] }),
      place({ entityId: "B3", nameEn: "invented chain grill", affinity: 0.88, priceLevel: 2, tags: [R + "lebanese"] }),
      place({ entityId: "O1", nameEn: "Invented Other", affinity: 0.5, priceLevel: 2, tags: [R + "italian"] }),
    ];
    const plan = await planOffsite({ ...base, team: team.map((m) => ({ ...m, dietary: [] })) }, { qloo: new FakeQloo(chain, ACTIVITY_VENUES, "Dubai"), now: FIXED });
    const dinners = plan.options.map((o) => o.dinner.place.entityId);
    expect(dinners).not.toContain("B2");
    expect(dinners).not.toContain("B3");
    expect(dinners[0]).toBe("B1");
    expect(dinners).toContain("O1");
  });

  it("repeats a dinner only when it is the sole affordable one, and says so", async () => {
    const one = [
      place({ entityId: "S1", nameEn: "Invented Solo", affinity: 0.5, priceLevel: 1, tags: [R + "lebanese", D + "halal"] }),
      place({ entityId: "S2", nameEn: "Invented Pricey", affinity: 0.9, priceLevel: 4, tags: [R + "lebanese", D + "halal"] }),
    ];
    const plan = await planOffsite(base, { qloo: new FakeQloo(one, ACTIVITY_VENUES, "Dubai"), now: FIXED });
    expect(plan.options.every((o) => o.dinner.place.entityId === "S1")).toBe(true);
    expect(new Set(plan.options.map((o) => o.activity.place.entityId)).size).toBe(plan.options.length);
    expect(plan.warnings.join()).toMatch(/Only 1 restaurant fit the budget/);
  });

  it("pickDiverse relaxes constraints in order", () => {
    const mk = (d: string, a: string, cat: string, score: number) => ({
      d: { place: { entityId: d } }, a: { place: { entityId: a }, categoryKey: cat }, score,
    });
    const list = [mk("d1", "a1", "museum", 0.9), mk("d1", "a2", "park", 0.8), mk("d2", "a1", "museum", 0.7), mk("d3", "a3", "museum", 0.6)];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const got = pickDiverse(list as any, 3).map((c: any) => `${c.d.place.entityId}/${c.a.place.entityId}`);
    expect(got).toEqual(["d1/a1", "d3/a3", "d2/a1"]);
  });
});
