import { describe, expect, it } from "vitest";
import { activityCost, AuditLog, buildGroupProfile, dinnerCost, evaluatePolicy, planOffsite, type PlanRequest } from "../src/agent";
import { DIET_PENALTY_PER_NEED } from "../src/agent/planner";
import { parsePlanRequest, ValidationError } from "../src/agent/validate";
import { cityProfile } from "../src/connectors/qloo/catalog";
import { DECISION_LABEL, money, renderReason, ruleText, warningText } from "../src/i18n";
import { narrateSafely, OpenAICompatibleProvider, parseNarration, providerFromEnv, RuleBasedProvider, type LLMProvider } from "../src/llm";
import { ACTIVITY_VENUES, DINNERS, FakeQloo, place, SEED_FAIRUZ } from "./fixtures/qloo";

const FIXED = () => new Date("2026-10-24T09:00:00.000Z");
const team = [
  { name: "Lina", cuisines: ["lebanese"], activities: ["museum"], artists: ["Fairuz"], dietary: ["vegetarian"] },
  { name: "Omar", cuisines: ["lebanese", "grill"], activities: ["bowling"], artists: ["Amr Diab"], dietary: ["halal"] },
];
const base: PlanRequest = { team, city: "Amman", budgetPerPerson: 40, headcount: 10, date: "2026-11-12", language: "en" };

describe("taste profile", () => {
  it("merges picks into votes ordered by how many members want them", () => {
    const p = buildGroupProfile(team);
    expect(p.cuisines.map((v) => [v.item.key, v.members])).toEqual([
      ["lebanese", ["Lina", "Omar"]],
      ["grill", ["Omar"]],
    ]);
    expect(p.dietary.map((v) => v.item.key).sort()).toEqual(["halal", "vegetarian"]);
  });
  it("accepts Arabic labels and warns on unknown picks", () => {
    const p = buildGroupProfile([{ name: "A", cuisines: ["لبناني", "klingon"], activities: [], artists: [], dietary: [] }]);
    expect(p.cuisines[0]?.item.key).toBe("lebanese");
    expect(p.warnings.join()).toMatch(/klingon/);
  });
});

describe("budget heuristics", () => {
  it("scales price level by city factor and currency; flags assumptions", () => {
    const c = cityProfile("Amman");
    expect(dinnerCost(2, "Amman")).toEqual({ perPerson: 18 * c.priceFactor * c.perUsd, assumed: false });
    expect(dinnerCost(undefined, "Amman").assumed).toBe(true);
    expect(activityCost("bowling", "Amman").assumed).toBe(true);
    expect(activityCost("park", "Amman").perPerson).toBe(0);
  });
});

describe("approval policy + audit", () => {
  const input = { subject: "x", budgetPerPerson: 20, approvalThreshold: 200, currency: "JOD" };
  it("rejects over budget, escalates over threshold, otherwise auto-approves", () => {
    expect(evaluatePolicy({ ...input, costPerPerson: 25, costTotal: 100 }).decision).toBe("rejected_over_budget");
    expect(evaluatePolicy({ ...input, costPerPerson: 20, costTotal: 201 }).decision).toBe("needs_manager_approval");
    expect(evaluatePolicy({ ...input, costPerPerson: 20, costTotal: 200 }).decision).toBe("auto_approved");
  });
  it("writes one sequenced, timestamped entry per decision", () => {
    const log = new AuditLog(FIXED);
    log.record({ ...input, costPerPerson: 10, costTotal: 50 });
    log.record({ ...input, costPerPerson: 30, costTotal: 90 });
    const all = log.all();
    expect(all.map((e) => [e.seq, e.decision])).toEqual([[1, "auto_approved"], [2, "rejected_over_budget"]]);
    expect(all[0]!.at).toBe("2026-10-24T09:00:00.000Z");
  });
});

describe("planner (fake Qloo, synthetic venues)", () => {
  it("builds ranked options, honours dietary evidence, budget, closed venues and the hotel exclusion", async () => {
    const q = new FakeQloo();
    const plan = await planOffsite(base, { qloo: q, now: FIXED });
    expect(plan.options.length).toBeGreaterThan(0);
    const ids = plan.options.flatMap((o) => [o.dinner.place.entityId, o.activity.place.entityId]);
    expect(ids).not.toContain("D4"); // closed
    expect(ids).not.toContain("A3"); // hotel that is not a spa
    expect(plan.options[0]!.dinner.place.entityId).toBe("D1"); // best: affinity + coverage + halal&vegetarian tagged
    for (const o of plan.options) {
      expect(o.costPerPerson).toBeLessThanOrEqual(base.budgetPerPerson);
      expect(o.dinner.dietaryUnconfirmed).toEqual([]);
    }
    // ranks are 1..n and scores descend
    expect(plan.options.map((o) => o.rank)).toEqual(plan.options.map((_, i) => i + 1));
    const scores = plan.options.map((o) => o.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(plan.locality).toBe("Amman, Jordan");
    expect(plan.provider).toBe("rule-based");
    expect(plan.overview).toMatch(/Qloo/);
  });

  it("sends the group taste as Qloo signals (cuisine tags + resolved artist entities) with explainability", async () => {
    const q = new FakeQloo();
    await planOffsite(base, { qloo: q, now: FIXED });
    const dinnerReq = q.requests.find((r) => (r.filterTags ?? []).some((t) => t.includes(":restaurant:")))!;
    expect(dinnerReq.locationQuery).toBe("Amman, Jordan");
    expect(dinnerReq.signalTags?.[0]).toBe("urn:tag:genre:place:restaurant:lebanese");
    expect(dinnerReq.signalEntities).toContain(SEED_FAIRUZ);
    expect(dinnerReq.explainability).toBe(true);
  });

  it("explains with Qloo reasons: cuisine match, artist attribution, dietary evidence, price", async () => {
    const plan = await planOffsite(base, { qloo: new FakeQloo(), now: FIXED });
    const kinds = plan.options[0]!.dinner.reasons.map((r) => r.kind);
    expect(kinds).toEqual(expect.arrayContaining(["cuisine_match", "artist_link", "affinity", "dietary_confirmed", "price_known", "team_fit"]));
    const artist = plan.options[0]!.dinner.reasons.find((r) => r.kind === "artist_link")!;
    expect(artist.members).toEqual(["Lina"]);
    expect(renderReason(artist, "en")).toMatch(/65%.*Lina.*Fairuz/);
    expect(renderReason(artist, "ar")).toMatch(/65%/);
  });

  it("never drops a venue for a missing dietary tag: keeps it, penalises it and says so", async () => {
    const plan = await planOffsite({ ...base, budgetPerPerson: 200 }, { qloo: new FakeQloo(), now: FIXED });
    // D2 (sushi) is tagged vegetarian but not halal: a missing tag is not proof it is not halal.
    expect(plan.warnings.join()).toMatch(/kept, ranked lower and labelled "diet unconfirmed"/);
    expect(plan.warnings.join()).not.toMatch(/left out.*dietary/);
    for (const o of plan.options) {
      expect(o.dinner.score.dietPenalty).toBeCloseTo(DIET_PENALTY_PER_NEED * o.dinner.dietaryUnconfirmed.length);
    }
    expect(plan.options[0]!.dinner.dietaryUnconfirmed).toEqual([]);
  });

  it("ranks a confirmed venue above its otherwise identical untagged twin, and labels the twin", async () => {
    const twinTags = ["urn:tag:genre:place:restaurant:lebanese"];
    const confirmed = place({ entityId: "T1", nameEn: "Twin Confirmed", affinity: 0.8, tags: [...twinTags, "urn:tag:dietary_option:qloo:halal", "urn:tag:dietary_option:qloo:vegetarian"] });
    const untagged = place({ entityId: "T2", nameEn: "Twin Untagged", affinity: 0.8, tags: twinTags });
    const plan = await planOffsite({ ...base, budgetPerPerson: 200 }, { qloo: new FakeQloo([untagged, confirmed]), now: FIXED });
    const order = plan.options.map((o) => o.dinner.place.entityId);
    expect(order).toContain("T2"); // kept, not dropped
    expect(order.indexOf("T1")).toBeLessThan(order.indexOf("T2"));
    const twin = plan.options.find((o) => o.dinner.place.entityId === "T2")!.dinner;
    expect(twin.dietaryUnconfirmed.sort()).toEqual(["halal", "vegetarian"]);
    expect(twin.reasons.map((r) => r.kind)).toContain("dietary_unconfirmed");
    expect(warningText(plan.warnings.find((w) => w.includes("diet unconfirmed"))!, "ar")).toMatch(/غير مؤكد/);
  });

  it("still plans when no venue has dietary tags at all (flagged, never treated as 'not available')", async () => {
    const noTags = DINNERS.map((d) => ({ ...d, tags: d.tags.filter((t) => !t.id.includes(":dietary_option:")) }));
    const plan = await planOffsite({ ...base, budgetPerPerson: 200 }, { qloo: new FakeQloo(noTags), now: FIXED });
    expect(plan.options.length).toBeGreaterThan(0);
    expect(plan.options.every((o) => o.dinner.dietaryUnconfirmed.length === 2)).toBe(true);
  });

  it("applies the approval threshold and logs every decision, including rejected over-budget combos", async () => {
    const plan = await planOffsite({ ...base, budgetPerPerson: 25, approvalThreshold: 1 }, { qloo: new FakeQloo(), now: FIXED });
    expect(plan.options.every((o) => o.decision === "needs_manager_approval")).toBe(true);
    const decisions = plan.audit.map((a) => a.decision);
    expect(decisions.filter((d) => d === "needs_manager_approval")).toHaveLength(plan.options.length);
    expect(decisions).toContain("rejected_over_budget");
    expect(plan.audit.map((a) => a.seq)).toEqual(plan.audit.map((_, i) => i + 1));
  });

  it("returns no options and a warning when nothing fits the budget", async () => {
    const plan = await planOffsite({ ...base, budgetPerPerson: 0.5 }, { qloo: new FakeQloo(), now: FIXED });
    expect(plan.options).toEqual([]);
    expect(plan.warnings.join()).toMatch(/budget/);
    expect(plan.audit.every((a) => a.decision === "rejected_over_budget")).toBe(true);
    expect(plan.overview).toMatch(/budget/i);
  });

  it("falls back to broader activity categories when preferred ones have no venue, and says so", async () => {
    const onlyPark = ACTIVITY_VENUES.filter((v) => v.entityId === "A4" || v.entityId === "A2");
    const plan = await planOffsite(
      { ...base, team: [{ ...team[0]!, activities: ["karaoke"] }] },
      { qloo: new FakeQloo(DINNERS, onlyPark), now: FIXED },
    );
    expect(plan.options.length).toBeGreaterThan(0);
    const reasons = plan.options.flatMap((o) => o.activity.reasons.map((r) => r.kind));
    expect(reasons).toContain("fallback_category");
  });

  it("is deterministic for identical input", async () => {
    const a = await planOffsite(base, { qloo: new FakeQloo(), now: FIXED });
    const b = await planOffsite(base, { qloo: new FakeQloo(), now: FIXED });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("produces Arabic output when asked", async () => {
    const plan = await planOffsite({ ...base, language: "ar" }, { qloo: new FakeQloo(), now: FIXED });
    expect(plan.overview).toMatch(/[\u0600-\u06FF]/);
    expect(plan.options[0]!.summary).toMatch(/[\u0600-\u06FF]/);
    expect(plan.options[0]!.summary).toContain("طاولة لبنانية");
  });

  it("rejects an empty team", async () => {
    await expect(planOffsite({ ...base, team: [] }, { qloo: new FakeQloo() })).rejects.toThrow(/member/);
  });
});

describe("LLM layer", () => {
  it("uses the rule-based provider when no LLM env is set", () => {
    expect(providerFromEnv({}).name).toBe("rule-based");
    expect(providerFromEnv({ LLM_BASE_URL: "http://x/v1", LLM_API_KEY: "k", LLM_MODEL: "m" }).name).toBe("openai-compatible:m");
  });

  it("OpenAI-compatible provider posts chat/completions and parses JSON narration", async () => {
    const plan = await planOffsite(base, { qloo: new FakeQloo(), now: FIXED });
    let seen: { url: string; body: { model: string; messages: { content: string }[] }; auth: string } | undefined;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, body: JSON.parse(init.body as string), auth: (init.headers as Record<string, string>).authorization! };
      const content = JSON.stringify({ overview: "LLM overview", summaries: plan.options.map((_, i) => `S${i}`) });
      return new Response(JSON.stringify({ choices: [{ message: { content: `\`\`\`json\n${content}\n\`\`\`` } }] }));
    }) as unknown as typeof fetch;
    const p = new OpenAICompatibleProvider({ baseUrl: "http://llm.local/v1/", apiKey: "sek", model: "m1", fetchImpl });
    const n = await p.narrate(plan, "en");
    expect(n.overview).toBe("LLM overview");
    expect(seen!.url).toBe("http://llm.local/v1/chat/completions");
    expect(seen!.auth).toBe("Bearer sek");
    expect(seen!.body.messages[1]!.content).toContain("Test Lebanese Table");
  });

  it("parseNarration rejects malformed output", () => {
    expect(() => parseNarration("no json", 1)).toThrow();
    expect(() => parseNarration('{"overview":"a","summaries":["x"]}', 2)).toThrow(/shape/);
    expect(parseNarration('{"overview":"a","summaries":["x"]}', 1).summaries).toEqual(["x"]);
  });

  it("narrateSafely falls back to rule-based when the LLM fails, with a warning and no secrets", async () => {
    const plan = await planOffsite(base, { qloo: new FakeQloo(), now: FIXED });
    const bad: LLMProvider = { name: "broken", narrate: async () => { throw new Error("boom"); } };
    const r = await narrateSafely(bad, plan, "en");
    expect(r.provider).toBe("rule-based");
    expect(r.warning).toMatch(/broken.*boom/);
    expect(r.narration.summaries).toHaveLength(plan.options.length);
  });

  it("plan generation survives a failing LLM provider", async () => {
    const bad: LLMProvider = { name: "broken", narrate: async () => { throw new Error("down"); } };
    const plan = await planOffsite(base, { qloo: new FakeQloo(), llm: bad, now: FIXED });
    expect(plan.provider).toBe("rule-based");
    expect(plan.warnings.join()).toMatch(/down/);
    expect(plan.options[0]!.summary).toBeTruthy();
  });

  it("rule-based provider output is identical for identical input", async () => {
    const plan = await planOffsite(base, { qloo: new FakeQloo(), now: FIXED });
    const p = new RuleBasedProvider();
    expect(await p.narrate(plan, "ar")).toEqual(await p.narrate(plan, "ar"));
  });
});

describe("request validation", () => {
  const ok = { team: [{ name: "A", cuisines: ["lebanese"] }], city: "Amman", budgetPerPerson: 30, headcount: 8, date: "2026-11-12", language: "ar" };
  it("accepts a valid body and normalises members", () => {
    const r = parsePlanRequest(ok);
    expect(r.language).toBe("ar");
    expect(r.team[0]).toEqual({ name: "A", cuisines: ["lebanese"], activities: [], artists: [], dietary: [] });
  });
  it.each([
    [{ ...ok, team: [] }, /team/],
    [{ ...ok, city: "Atlantis" }, /city/],
    [{ ...ok, budgetPerPerson: -1 }, /budget/],
    [{ ...ok, headcount: 0 }, /headcount/],
    [{ ...ok, date: "tomorrow" }, /date/],
    [{ ...ok, approvalThreshold: -5 }, /approval/],
    ["nope", /object/],
  ])("rejects bad input %#", (body, re) => {
    expect(() => parsePlanRequest(body)).toThrow(ValidationError);
    expect(() => parsePlanRequest(body)).toThrow(re);
  });
});

describe("i18n", () => {
  it("has labels for every decision in both languages and formats money", () => {
    for (const d of Object.values(DECISION_LABEL)) expect(d.ar).toMatch(/[\u0600-\u06FF]/);
    expect(money(239, "JOD", "en")).toBe("239 JOD");
    expect(ruleText("R2: whatever", "ar")).toMatch(/[\u0600-\u06FF]/);
  });
});
