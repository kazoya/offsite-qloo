import { describe, expect, it } from "vitest";
import { planOffsite, type PlanRequest } from "../src/agent";
import { assessFairness, optionFairness } from "../src/agent/fairness";
import { alwaysLeftOutText, coverageLine, fairnessExplanationText } from "../src/i18n";
import { FakeQloo } from "./fixtures/qloo";

const FIXED = () => new Date("2026-10-24T09:00:00.000Z");
// Synthetic options: only the fields the engine reads.
const opt = (rank: number, score: number, costPerPerson: number, dinner: string[], activity: string[]) => ({
  rank,
  score,
  costPerPerson,
  dinner: { membersCovered: dinner },
  activity: { membersCovered: activity },
});
const TEAM = ["Ana", "Ben", "Cyd", "Dov", "Eli"];

describe("fairness engine (synthetic teams)", () => {
  it("scores each member 1 / 0.5 / 0 and reports mean, min, coverage and who is left out", () => {
    const f = optionFairness(opt(1, 0.8, 20, ["Ana", "Ben"], ["Ana", "Cyd"]), ["Ana", "Ben", "Cyd", "Dov"]);
    expect(f.members.map((m) => [m.name, m.score])).toEqual([["Ana", 1], ["Ben", 0.5], ["Cyd", 0.5], ["Dov", 0]]);
    expect(f.mean).toBe(0.5);
    expect(f.min).toBe(0);
    expect(f.coverage).toBe(0.75);
    expect(f.leftOut).toEqual(["Dov"]);
  });

  it("labels Best fit / Fairest / Cheapest and explains why a lower-ranked option is fairer (marginalised minority)", () => {
    const majority = ["Ana", "Ben", "Cyd", "Dov"];
    const r = assessFairness(
      [
        opt(1, 0.8, 20, majority, majority), // Eli (the minority) gets nothing
        opt(2, 0.7, 25, ["Ana", "Ben", "Cyd"], ["Dov", "Eli"]), // everyone gets something
        opt(3, 0.6, 15, ["Ana"], ["Ben"]),
      ],
      TEAM,
    )!;
    expect([r.bestFitRank, r.fairestRank, r.cheapestRank]).toEqual([1, 2, 3]);
    expect(r.options.map((o) => o.labels)).toEqual([["best_fit"], ["fairest"], ["cheapest"]]);
    expect(r.options[0]!.leftOut).toEqual(["Eli"]);
    expect(r.explanation).toEqual({ fairerRank: 2, bestRank: 1, gains: ["Eli"], losses: [], costDeltaPerPerson: 5, scoreGap: 0.1 });
    expect(r.alwaysLeftOut).toEqual([]);
    const en = fairnessExplanationText(r.explanation!, "JOD", "en");
    expect(en).toMatch(/^Option 2 is fairer than option 1: it also matches Eli, who gets none of their picks in option 1/);
    expect(en).toMatch(/more per person \(estimate\), with a 0\.10 lower score\./);
    expect(fairnessExplanationText(r.explanation!, "JOD", "ar")).toMatch(/الخيار 2 أعدل من الخيار 1.*Eli/);
  });

  it("gives no explanation when the best-fit option is also the fairest, and can stack labels", () => {
    const r = assessFairness([opt(1, 0.9, 10, TEAM, TEAM), opt(2, 0.5, 30, ["Ana"], ["Ana"])], TEAM)!;
    expect(r.options[0]!.labels).toEqual(["best_fit", "fairest", "cheapest"]);
    expect(r.explanation).toBeUndefined();
  });

  it("breaks a tie on the minimum by fewer members left out, then by mean", () => {
    const r = assessFairness(
      [
        opt(1, 0.9, 10, ["Ana"], ["Ana"]), // 4 left out
        opt(2, 0.8, 10, ["Ana", "Ben"], ["Cyd"]), // 2 left out
        opt(3, 0.7, 10, ["Ana", "Ben"], ["Ana", "Cyd"]), // 2 left out, higher mean
      ],
      TEAM,
    )!;
    expect(r.fairestRank).toBe(3);
    expect(r.cheapestRank).toBe(1); // equal cost -> best rank
  });

  it("names members no option serves, and records trade-offs (who the fairer option drops)", () => {
    const r = assessFairness([opt(1, 0.9, 10, ["Ana", "Ben"], ["Ana"]), opt(2, 0.8, 12, ["Cyd"], ["Ben", "Dov"])], TEAM)!;
    expect(r.alwaysLeftOut).toEqual(["Eli"]);
    expect(r.fairestRank).toBe(2);
    expect(r.explanation!.gains).toEqual(["Cyd", "Dov"]);
    expect(r.explanation!.losses).toEqual(["Ana"]);
    expect(alwaysLeftOutText(r.alwaysLeftOut, "en")).toMatch(/Eli/);
    expect(coverageLine(r.options[0]!, "en")).toBe("Matches the picks of 2 of 5: Ana and Ben · Nothing picked by: Cyd, Dov and Eli");
  });

  it("returns undefined for an empty shortlist", () => {
    expect(assessFairness([], TEAM)).toBeUndefined();
  });
});

describe("fairness in the plan (fake Qloo, invented venues)", () => {
  const req: PlanRequest = {
    team: [
      { name: "Lina", cuisines: ["lebanese"], activities: ["museum"], artists: [], dietary: [] },
      { name: "Omar", cuisines: ["lebanese"], activities: ["museum"], artists: [], dietary: [] },
      { name: "Rami", cuisines: ["lebanese"], activities: ["museum"], artists: [], dietary: [] },
      { name: "Sara", cuisines: ["japanese"], activities: ["park"], artists: [], dietary: [] }, // minority
    ],
    city: "Amman",
    budgetPerPerson: 200,
    headcount: 4,
    date: "2026-11-12",
    language: "en",
  };

  it("flags the minority member left out by the top option and points to the fairer one", async () => {
    const plan = await planOffsite(req, { qloo: new FakeQloo(), now: FIXED });
    const f = plan.fairness!;
    expect(f.members).toEqual(["Lina", "Omar", "Rami", "Sara"]);
    expect(f.options.map((o) => o.rank)).toEqual(plan.options.map((o) => o.rank));
    expect(f.bestFitRank).toBe(1);
    expect(f.options[0]!.leftOut).toEqual(["Sara"]);
    expect(f.fairestRank).not.toBe(1);
    expect(f.explanation!.gains).toContain("Sara");
    // The engine uses exactly the venues' own coverage evidence.
    for (const o of plan.options) {
      const fo = f.options.find((x) => x.rank === o.rank)!;
      for (const m of fo.members) {
        expect(m.dinner).toBe(o.dinner.membersCovered.includes(m.name));
        expect(m.activity).toBe(o.activity.membersCovered.includes(m.name));
      }
    }
    const cheapest = Math.min(...plan.options.map((o) => o.costPerPerson));
    expect(plan.options.find((o) => o.rank === f.cheapestRank)!.costPerPerson).toBe(cheapest);
  });

  it("omits fairness when no option fits", async () => {
    const plan = await planOffsite({ ...req, budgetPerPerson: 0.5 }, { qloo: new FakeQloo(), now: FIXED });
    expect(plan.fairness).toBeUndefined();
  });
});
