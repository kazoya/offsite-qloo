import { describe, expect, it } from "vitest";
import {
  aggregate,
  categoryKey,
  cleanPool,
  memberScore,
  mulberry32,
  optionCost,
  pairwise,
  rankBy,
  syntheticTeams,
  teamMetrics,
  votedKeys,
} from "../src/agent/baselines";
import { ACTIVITIES, CITIES, CUISINES, DIETARY, findItem } from "../src/connectors/qloo/catalog";
import { dinnerCost, activityCost } from "../src/agent/budget";
import type { Member, PlanRequest } from "../src/agent";
import { place } from "./fixtures/qloo";

// Invented venues only.
const R = "urn:tag:genre:place:restaurant:";
const P = "urn:tag:genre:place:";
const D = "urn:tag:dietary_option:qloo:";
const allDay = { monday: [{ opens: "10:00", closes: "23:59" }] } as never; // 2026-11-16 is a Monday
const leb = place({ entityId: "d-leb", nameEn: "Fake Cedar", tags: [R + "lebanese", D + "halal"], priceLevel: 1, popularity: 0.9, affinity: 0.2, hours: allDay });
const sushi = place({ entityId: "d-sushi", nameEn: "Fake Wave", tags: [R + "sushi"], priceLevel: 3, popularity: 0.5, affinity: 0.9 });
const pizza = place({ entityId: "d-pizza", nameEn: "Fake Slice", tags: [R + "pizza", D + "halal"], priceLevel: 2, popularity: 0.7, affinity: 0.6, hours: allDay });
const museum = place({ entityId: "a-mus", nameEn: "Fake Museum", tags: [P + "museum"], popularity: 0.4, affinity: 0.8, hours: allDay });
const bowl = place({ entityId: "a-bowl", nameEn: "Fake Lanes", tags: [P + "bowling_alley"], popularity: 0.95, affinity: 0.1 });
const hotel = place({ entityId: "a-hotel", nameEn: "Fake Hotel", tags: [P + "hotel", P + "tourist_attraction"], popularity: 1, affinity: 1 });
const closed = place({ entityId: "a-closed", nameEn: "Fake Closed", tags: [P + "park"], isClosed: true, popularity: 1, affinity: 1 });
const branch = place({ entityId: "d-leb-2", nameEn: "Fake Cedar", tags: [R + "lebanese"], popularity: 0.8, affinity: 0.1 });

const m = (name: string, cuisines: string[], activities: string[], dietary: string[] = []): Member => ({ name, cuisines, activities, artists: [], dietary });
const team = [m("Lina", ["lebanese"], ["museum"], ["halal"]), m("Omar", ["sushi"], ["bowling"]), m("Sami", ["thai"], ["karaoke"])];
const req: PlanRequest = { team, city: "Amman", budgetPerPerson: 20, headcount: 3, date: "2026-11-16", language: "en" };

describe("seeded synthetic teams", () => {
  it("is deterministic for a seed and different for another", () => {
    expect(syntheticTeams(7)).toEqual(syntheticTeams(7));
    expect(syntheticTeams(7)).not.toEqual(syntheticTeams(8));
    const r = mulberry32(1);
    const xs = Array.from({ length: 1000 }, r);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
  });
  it("builds 6 valid teams per supported city using catalog keys only", () => {
    const teams = syntheticTeams(20261024);
    expect(teams).toHaveLength(24);
    for (const c of CITIES) expect(teams.filter((t) => t.request.city === c.name)).toHaveLength(6);
    for (const { request: r } of teams) {
      expect(r.team.length).toBeGreaterThanOrEqual(4);
      expect(r.team.length).toBeLessThanOrEqual(12);
      expect(r.headcount).toBe(r.team.length);
      expect(r.date).toMatch(/^2026-(11|12)-\d\d$/);
      expect(r.budgetPerPerson).toBeGreaterThan(0);
      for (const x of r.team) {
        expect(x.cuisines.length).toBeGreaterThan(0);
        expect(x.activities.length).toBeGreaterThan(0);
        x.cuisines.forEach((k) => expect(findItem(CUISINES, k)).toBeDefined());
        x.activities.forEach((k) => expect(findItem(ACTIVITIES, k)).toBeDefined());
        x.dietary.forEach((k) => expect(findItem(DIETARY, k)).toBeDefined());
      }
    }
  });
});

describe("baseline rankers", () => {
  it("apply the shared hygiene: no closed venues, no hotels as activities, one branch per chain", () => {
    expect(cleanPool([hotel, closed, museum], "activity").map((p) => p.entityId)).toEqual(["a-mus"]);
    expect(cleanPool([leb, branch, sushi], "dinner").map((p) => p.entityId)).toEqual(["d-leb", "d-sushi"]);
  });
  it("A ranks by popularity, B by affinity, and pairs dinners with activities by rank", () => {
    const pop = rankBy("popularity", [sushi, leb, pizza], [museum, bowl, hotel]);
    expect(pop.map((o) => [o.dinner.entityId, o.activity.entityId])).toEqual([["d-leb", "a-bowl"], ["d-pizza", "a-mus"]]);
    const aff = rankBy("affinity", [sushi, leb, pizza], [museum, bowl]);
    expect(aff.map((o) => [o.dinner.entityId, o.activity.entityId])).toEqual([["d-sushi", "a-mus"], ["d-pizza", "a-bowl"]]);
  });
});

describe("metrics", () => {
  it("scores a member by tag matches on dinner and activity", () => {
    expect(memberScore(team[0]!, { dinner: leb, activity: museum })).toBe(1);
    expect(memberScore(team[0]!, { dinner: sushi, activity: museum })).toBe(0.5);
    expect(memberScore(team[2]!, { dinner: leb, activity: museum })).toBe(0);
  });
  it("labels categories team-first and costs options like the planner", () => {
    const multi = place({ entityId: "a-x", nameEn: "Fake Mix", tags: [P + "bowling_alley", P + "museum"] });
    expect(categoryKey(multi, ACTIVITIES)).toBe("bowling");
    expect(categoryKey(multi, ACTIVITIES, ["museum"])).toBe("museum");
    expect(votedKeys([m("a", ["sushi"], []), m("b", ["sushi", "lebanese"], [])], "cuisines")).toEqual(["sushi", "lebanese"]);
    expect(optionCost({ dinner: sushi, activity: museum }, req)).toBeCloseTo(dinnerCost(3, "Amman").perPerson + activityCost("museum", "Amman").perPerson);
  });
  it("computes team metrics over the proposed options", () => {
    const t = teamMetrics(req, [{ dinner: leb, activity: museum }, { dinner: sushi, activity: bowl }]);
    expect(t.options).toBe(2);
    expect(t.noPlan).toBe(0);
    expect(t.meanCoverage).toBeCloseTo(1 / 3); // option 1: Lina 1, others 0; option 2: Omar 1, others 0
    expect(t.minCoverage).toBe(0);
    expect(t.zeroShare).toBeCloseTo(2 / 3);
    expect(t.leftOutEverywhere).toBeCloseTo(1 / 3); // Sami
    expect(t.diversity).toBe(1);
    expect(t.budgetFit).toBe(0.5); // sushi is price level 3: 24.85 + bowling 4.97 > 20
    expect(t.dietConfirmed).toBe(0.5); // halal tag only on the first restaurant
    expect(t.unknownHours).toBe(0.5); // sushi and lanes have no hours
    expect(t.closedAtSlot).toBe(0);
  });
  it("flags a venue closed in its slot and marks an empty plan as noPlan", () => {
    const lunchOnly = place({ entityId: "d-l", nameEn: "Fake Lunch", tags: [R + "lebanese"], hours: { monday: [{ opens: "11:00", closes: "15:00" }] } as never });
    expect(teamMetrics(req, [{ dinner: lunchOnly, activity: museum }]).closedAtSlot).toBe(0.5);
    const empty = teamMetrics(req, []);
    expect(empty).toMatchObject({ options: 0, noPlan: 1, meanCoverage: null, budgetFit: null });
    expect(teamMetrics({ ...req, team: [m("x", ["sushi"], ["museum"])] }, [{ dinner: sushi, activity: museum }]).dietConfirmed).toBeNull();
  });
  it("aggregates means (skipping nulls) and counts pairwise wins", () => {
    const a = teamMetrics(req, [{ dinner: leb, activity: museum }]);
    const b = teamMetrics(req, [{ dinner: sushi, activity: bowl }]);
    const e = teamMetrics(req, []);
    const g = aggregate([a, b, e]);
    expect(g.teams).toBe(3);
    expect(g.metrics.noPlan).toEqual({ mean: 0.333, n: 3 });
    expect(g.metrics.meanCoverage).toEqual({ mean: 0.333, n: 2 });
    expect(g.metrics.budgetFit).toEqual({ mean: 0.5, n: 2 });
    expect(pairwise([a, b], [b, a], "budgetFit")).toEqual({ win: 1, tie: 0, loss: 1 });
    expect(pairwise([a], [b], "unknownHours", true)).toEqual({ win: 1, tie: 0, loss: 0 });
    expect(pairwise([e], [a], "meanCoverage")).toEqual({ win: 0, tie: 0, loss: 0 });
  });
});
