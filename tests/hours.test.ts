import { describe, expect, it } from "vitest";
import { planOffsite, type PlanRequest } from "../src/agent";
import { checkHours, parseClock, weekdayOf } from "../src/agent/hours";
import { parsePlanRequest } from "../src/agent/validate";
import { renderReason } from "../src/i18n";
import { ACTIVITY_VENUES, DINNERS, FakeQloo } from "./fixtures/qloo";

// Invented schedules in the Qloo shape.
const slot = (opens: string, closes: string) => [{ opens: `T${opens}:00`, closes: `T${closes}:00`, closed: false }];
const CLOSED = [{ opens: null, closes: null, closed: true }];
const week = (day: unknown, overrides: Record<string, unknown> = {}) =>
  Object.fromEntries(["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].map((d) => [d, overrides[d] ?? day])) as never;

const THU = "2026-11-12"; // a Thursday
const m = (hhmm: string) => parseClock(hhmm)!;

describe("opening hours check", () => {
  it("computes weekdays without depending on the server time zone", () => {
    expect(weekdayOf(THU)).toBe("thursday");
    expect(weekdayOf("2026-10-24")).toBe("saturday");
  });

  it("parses Qloo clock strings", () => {
    expect(parseClock("T10:30:00")).toBe(630);
    expect(parseClock("19:05")).toBe(1145);
    expect(parseClock(null)).toBeUndefined();
    expect(parseClock("late")).toBeUndefined();
  });

  it("is open when a slot covers the whole window", () => {
    const h = checkHours(week(slot("10:00", "23:30")), THU, m("20:00"), 90);
    expect(h).toMatchObject({ status: "open", weekday: "thursday", from: "20:00", to: "21:30", dayHours: ["10:00–23:30"] });
  });

  it("handles closing after midnight and 24h venues", () => {
    expect(checkHours(week(slot("18:00", "02:00")), THU, m("22:00"), 180).status).toBe("open");
    expect(checkHours(week(slot("00:00", "00:00")), THU, m("23:00"), 120).status).toBe("open");
    // window runs past midnight into a closed Friday -> not open for the whole window
    expect(checkHours(week(slot("18:00", "00:00"), { friday: CLOSED }), THU, m("23:00"), 120).status).toBe("closed_at_time");
  });

  it("uses the previous day's past-midnight hours", () => {
    const h = week(CLOSED, { wednesday: slot("20:00", "03:00") });
    expect(checkHours(h, THU, m("01:00"), 60).status).toBe("open");
  });

  it("flags a venue closed all day and one that closes too early or opens too late", () => {
    expect(checkHours(week(slot("10:00", "23:00"), { thursday: CLOSED }), THU, m("19:00"), 90).status).toBe("closed_day");
    expect(checkHours(week(slot("08:00", "16:00")), THU, m("19:00"), 90).status).toBe("closed_at_time");
    expect(checkHours(week(slot("20:00", "23:00")), THU, m("19:00"), 90).status).toBe("closed_at_time");
    // split shifts: lunch and dinner
    const split = week([...slot("12:00", "15:00"), ...slot("19:00", "23:00")]);
    expect(checkHours(split, THU, m("19:30"), 90).status).toBe("open");
    expect(checkHours(split, THU, m("16:00"), 90).status).toBe("closed_at_time");
  });

  it("reports unknown when hours are missing or unparseable (never guesses)", () => {
    expect(checkHours(undefined, THU, 0, 60).status).toBe("unknown");
    expect(checkHours({} as never, THU, 0, 60).status).toBe("unknown");
    const allClosed = checkHours(week(CLOSED), THU, m("19:00"), 60);
    expect(allClosed).toMatchObject({ status: "unknown", allWeekClosed: true });
    expect(renderReason({ kind: "hours_unknown", value: 1 }, "en")).toMatch(/closed every day.*missing data/);
    expect(checkHours(week([{ opens: "noon", closes: "T22:00:00", closed: false }]), THU, m("19:00"), 60).status).toBe("unknown");
  });
});

describe("planner + opening hours (synthetic venues)", () => {
  const team = [
    { name: "Lina", cuisines: ["lebanese"], activities: ["museum"], artists: [], dietary: [] },
    { name: "Omar", cuisines: ["lebanese"], activities: ["bowling"], artists: [], dietary: [] },
  ];
  const base: PlanRequest = { team, city: "Amman", budgetPerPerson: 60, headcount: 8, date: THU, language: "en", startTime: "18:00" };
  const withHours = (id: string, hours: unknown) => (p: { entityId: string }) => (p.entityId === id ? { ...p, hours } : p);

  it("drops venues closed at their slot, keeps open ones, and flags unknown hours", async () => {
    const dinners = DINNERS.map(withHours("D1", week(slot("09:00", "17:00")))) // closes before the 20:00 dinner
      .map(withHours("D6", week(slot("12:00", "23:59"))))
      .map(withHours("D7", week(slot("12:00", "23:00"), { thursday: CLOSED })));
    const acts = ACTIVITY_VENUES.map(withHours("A1", week(slot("10:00", "23:00"))));
    const plan = await planOffsite(base, { qloo: new FakeQloo(dinners as never, acts as never) });
    const ids = plan.options.map((o) => o.dinner.place.entityId);
    expect(ids).not.toContain("D1");
    expect(ids).not.toContain("D7");
    expect(ids).toContain("D6");
    expect(plan.warnings.join()).toMatch(/2 restaurants were left out because Qloo opening hours show them closed/);
    expect(plan.schedule).toEqual({ weekday: "thursday", activity: { from: "18:00", to: "20:00" }, dinner: { from: "20:00", to: "21:30" } });

    const d6 = plan.options.find((o) => o.dinner.place.entityId === "D6")!.dinner;
    expect(d6.hours?.status).toBe("open");
    const open = d6.reasons.find((r) => r.kind === "hours_open")!;
    expect(renderReason(open, "en")).toBe("Open on Thursday during 20:00–21:30 per Qloo opening hours");
    expect(renderReason(open, "ar")).toMatch(/الخميس/);

    const unknown = plan.options.flatMap((o) => [o.dinner, o.activity]).find((c) => c.hours?.status === "unknown")!;
    expect(unknown.reasons.map((r) => r.kind)).toContain("hours_unknown");
    expect(plan.warnings.join()).toMatch(/no opening hours in Qloo/);
  });

  it("uses the requested start time: a late start excludes venues that close early", async () => {
    const acts = ACTIVITY_VENUES.map((p) => ({ ...p, hours: week(slot("09:00", "18:00")) }));
    const early = await planOffsite({ ...base, startTime: "10:00" }, { qloo: new FakeQloo(DINNERS, acts as never) });
    const late = await planOffsite({ ...base, startTime: "19:00" }, { qloo: new FakeQloo(DINNERS, acts as never) });
    expect(early.options.length).toBeGreaterThan(0);
    expect(late.options).toEqual([]);
    expect(late.warnings.join()).toMatch(/activity venues were left out/);
  });

  it("validates startTime", () => {
    const ok = { team: [{ name: "A" }], city: "Amman", budgetPerPerson: 30, headcount: 8, date: THU };
    expect(parsePlanRequest({ ...ok, startTime: "19:30" }).startTime).toBe("19:30");
    expect(parsePlanRequest(ok).startTime).toBeUndefined();
    expect(() => parsePlanRequest({ ...ok, startTime: "25:00" })).toThrow(/startTime/);
    expect(() => parsePlanRequest({ ...ok, startTime: "7pm" })).toThrow(/startTime/);
  });
});
