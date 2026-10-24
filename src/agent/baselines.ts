/**
 * A/B/C experiment helpers (see docs/EXPERIMENT.md). Pure functions only: the seeded team generator, the two
 * baseline rankers and the metrics. The live runner is scripts/experiment.ts.
 *
 *  A  "popular"   : the city's most popular restaurants / activity venues from Qloo, no team taste signal.
 *  A+ "popular-in-pool": the same Qloo pools the full planner received, ranked by Qloo popularity only (ablation).
 *  B  "affinity"  : the same pools ranked by Qloo affinity to the team signal only.
 *  C  "full"      : planOffsite (affinity + member coverage + budget + diet + opening hours + fairness + variety).
 *
 * Every strategy gets the same hygiene: no permanently closed venues, no hotels as activities, no repeated venue or
 * chain inside one plan, at most 3 options. Metrics use Qloo's own tags (a stated limitation, not ground truth).
 */
import { ACTIVITIES, CITIES, CUISINES, DIETARY, findItem, type CatalogItem } from "../connectors/qloo/catalog";
import type { QlooPlace } from "../connectors/qloo/types";
import { activityCost, dinnerCost } from "./budget";
import { checkHours, parseClock } from "./hours";
import { SCHEDULE, chainKey } from "./planner";
import type { Member, PlanRequest } from "./types";

// ---- Seeded PRNG ----------------------------------------------------------------------------------------
/** mulberry32: tiny deterministic PRNG, returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(rnd: () => number, list: readonly T[]): T => list[Math.floor(rnd() * list.length)]!;
const int = (rnd: () => number, lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
function sample<T>(rnd: () => number, list: readonly T[], n: number): T[] {
  const pool = [...list];
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]!);
  return out;
}
/** Like `sample`, but earlier items are likelier (weight 1/(i+1)): clusters list their most common tastes first. */
function sampleWeighted<T>(rnd: () => number, list: readonly T[], n: number): T[] {
  const pool = list.map((v, i) => ({ v, w: 1 / (i + 1) }));
  const out: T[] = [];
  while (out.length < n && pool.length) {
    let r = rnd() * pool.reduce((s, x) => s + x.w, 0);
    let i = 0;
    while (i < pool.length - 1 && (r -= pool[i]!.w) > 0) i++;
    out.push(pool.splice(i, 1)[0]!.v);
  }
  return out;
}

// ---- Synthetic teams --------------------------------------------------------------------------------------
/** Taste clusters (catalog keys). Members mostly pick inside their cluster, sometimes outside it. */
export const CUISINE_CLUSTERS: Record<string, string[]> = {
  levant: ["lebanese", "middle_eastern", "syrian", "grill", "turkish"],
  western: ["italian", "pizza", "hamburger", "american", "steak_house", "french"],
  asian: ["sushi", "japanese", "chinese", "korean", "thai", "indian"],
  light: ["cafe", "mediterranean", "seafood", "vegetarian", "dessert_shop"],
};
export const ACTIVITY_CLUSTERS: Record<string, string[]> = {
  culture: ["museum", "art_gallery", "historical", "tourist"],
  active: ["bowling", "go_kart", "escape_room", "sports", "adventure"],
  outdoor: ["park", "hiking", "zoo", "tourist"],
  social: ["karaoke", "live_music", "amusement", "cooking_class", "spa"],
};
const NAMES = ["Ali", "Basma", "Fadi", "Ghada", "Hala", "Issa", "Joud", "Khaled", "Lama", "Mazen", "Nada", "Rami", "Salma", "Talal", "Wafa", "Zaid"];
/** Budget per person in USD before conversion to the city's currency. */
export const BUDGET_USD = [25, 35, 45, 60, 80];
/** Share of members with each dietary need (illustrative, synthetic). */
const DIET_RATE: [string, number][] = [["halal", 0.35], ["vegetarian", 0.12], ["gluten_free", 0.06], ["vegan", 0.04]];

export interface SyntheticTeam {
  id: string;
  request: PlanRequest;
}

/** Builds `perCity` teams for each supported city, fully determined by `seed`. Names are synthetic. */
export function syntheticTeams(seed: number, perCity = 6, budgetsUsd: readonly number[] = BUDGET_USD): SyntheticTeam[] {
  const rnd = mulberry32(seed);
  const teams: SyntheticTeam[] = [];
  for (const city of CITIES) {
    for (let i = 0; i < perCity; i++) {
      const size = int(rnd, 4, 12);
      const cClusters = sample(rnd, Object.keys(CUISINE_CLUSTERS), int(rnd, 1, 3));
      const aClusters = sample(rnd, Object.keys(ACTIVITY_CLUSTERS), int(rnd, 1, 3));
      const team: Member[] = [];
      for (let m = 0; m < size; m++) {
        const cc = CUISINE_CLUSTERS[pick(rnd, cClusters)]!;
        const ac = ACTIVITY_CLUSTERS[pick(rnd, aClusters)]!;
        const cuisines = sampleWeighted(rnd, cc, int(rnd, 1, 3));
        if (rnd() < 0.25) cuisines.push(pick(rnd, CUISINES).key); // an off-cluster taste
        const activities = sampleWeighted(rnd, ac, int(rnd, 1, 2));
        if (rnd() < 0.2) activities.push(pick(rnd, ACTIVITIES).key);
        const dietary = DIET_RATE.filter(([, p]) => rnd() < p).map(([k]) => k);
        team.push({
          name: `${NAMES[m % NAMES.length]}${m >= NAMES.length ? m : ""}`,
          cuisines: [...new Set(cuisines)],
          activities: [...new Set(activities)],
          artists: [],
          dietary: dietary.includes("vegan") ? dietary.filter((d) => d !== "vegetarian") : dietary,
        });
      }
      const day = int(rnd, 2, 60); // 2..60 days after 2026-11-01
      const date = new Date(Date.UTC(2026, 10, 1 + day)).toISOString().slice(0, 10);
      const budgetPerPerson = Math.round(pick(rnd, budgetsUsd) * city.perUsd);
      teams.push({ id: `${city.name}-${i + 1}`, request: { team, city: city.name, budgetPerPerson, headcount: size, date, language: "en" } });
    }
  }
  return teams;
}

// ---- Baseline rankers ---------------------------------------------------------------------------------------
export interface SimpleOption {
  dinner: QlooPlace;
  activity: QlooPlace;
}

const HOTEL_TAG = "urn:tag:genre:place:hotel";
const has = (p: QlooPlace, tag: string) => p.tags.some((t) => t.id === tag);

/** Shared hygiene: drop permanently closed venues, hotels as activities, and repeated chains (first one wins). */
export function cleanPool(places: QlooPlace[], kind: "dinner" | "activity"): QlooPlace[] {
  const seen = new Set<string>();
  return places.filter((p) => {
    if (p.isClosed) return false;
    if (kind === "activity" && has(p, HOTEL_TAG) && !has(p, findItem(ACTIVITIES, "spa")!.tag)) return false;
    const k = chainKey(p) || p.entityId;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Ranks each pool by one Qloo number and pairs the i-th dinner with the i-th activity (ties: name). */
export function rankBy(field: "popularity" | "affinity", dinners: QlooPlace[], activities: QlooPlace[], max = 3): SimpleOption[] {
  const sort = (list: QlooPlace[]) =>
    [...list].sort((a, b) => (b[field] ?? -1) - (a[field] ?? -1) || a.nameEn.localeCompare(b.nameEn));
  const d = sort(cleanPool(dinners, "dinner"));
  const a = sort(cleanPool(activities, "activity"));
  const n = Math.min(max, d.length, a.length);
  return Array.from({ length: n }, (_, i) => ({ dinner: d[i]!, activity: a[i]! }));
}

// ---- Metrics --------------------------------------------------------------------------------------------------
const tagOf = (list: CatalogItem[], key: string) => findItem(list, key)?.tag;
/**
 * Category of a venue, as the planner labels it: the first of the team's picks the venue carries (most-voted first),
 * else the first catalog category. Used for activity cost and diversity, identically for every strategy.
 */
export function categoryKey(p: QlooPlace, list: CatalogItem[], voted: string[] = []): string | undefined {
  return voted.map((k) => findItem(list, k)).find((i) => i && has(p, i.tag))?.key ?? list.find((i) => has(p, i.tag))?.key;
}
/** Team picks of one kind, most-voted first (ties: first mention), as catalog keys. */
export function votedKeys(team: Member[], kind: "cuisines" | "activities"): string[] {
  const list = kind === "cuisines" ? CUISINES : ACTIVITIES;
  const count = new Map<string, number>();
  for (const m of team) for (const k of new Set(m[kind].map((x) => findItem(list, x)?.key).filter((x): x is string => !!x))) count.set(k, (count.get(k) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

/** Member score for one option: (dinner matches one of their cuisines + activity matches one of their activities) / 2. */
export function memberScore(m: Member, o: SimpleOption): number {
  const d = m.cuisines.some((k) => { const t = tagOf(CUISINES, k); return !!t && has(o.dinner, t); });
  const a = m.activities.some((k) => { const t = tagOf(ACTIVITIES, k); return !!t && has(o.activity, t); });
  return (Number(d) + Number(a)) / 2;
}

/** Estimated cost per person (local currency), same heuristic as the planner for every strategy. */
export function optionCost(o: SimpleOption, req: Pick<PlanRequest, "city" | "team">): number {
  const act = categoryKey(o.activity, ACTIVITIES, votedKeys(req.team, "activities"));
  return dinnerCost(o.dinner.priceLevel, req.city).perPerson + activityCost(act ?? "", req.city).perPerson;
}

export interface TeamMetrics {
  options: number;
  /** 1 when the strategy proposed no option at all (e.g. nothing fits the budget), else 0. */
  noPlan: number;
  /** Mean member score, averaged over options (0..1). */
  meanCoverage: number | null;
  /** Lowest member score per option, averaged over options (0..1). */
  minCoverage: number | null;
  /** Share of members with score 0 in an option, averaged over options. */
  zeroShare: number | null;
  /** Share of members with score 0 in every option the strategy proposed. */
  leftOutEverywhere: number | null;
  /** Mean of distinct dinner categories / options and distinct activity categories / options (0..1). */
  diversity: number | null;
  /** Share of options whose estimated cost per person is within the budget. */
  budgetFit: number | null;
  /** Share of options whose restaurant carries Qloo tags for every dietary need of the team; null if no needs. */
  dietConfirmed: number | null;
  /** Share of proposed venues whose opening hours Qloo does not report for the slot. */
  unknownHours: number | null;
  /** Share of proposed venues that Qloo hours show closed in the planned slot. */
  closedAtSlot: number | null;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

export function teamMetrics(req: PlanRequest, options: SimpleOption[]): TeamMetrics {
  const n = options.length;
  const members = req.team;
  const scores = options.map((o) => members.map((m) => memberScore(m, o)));
  const needs = [...new Set(members.flatMap((m) => m.dietary))].map((k) => tagOf(DIETARY, k)).filter((t): t is string => !!t);
  const start = parseClock(req.startTime ?? SCHEDULE.defaultStart) ?? 18 * 60;
  const slots = options.flatMap((o) => [
    checkHours(o.activity.hours, req.date, start, SCHEDULE.activityMinutes).status,
    checkHours(o.dinner.hours, req.date, start + SCHEDULE.activityMinutes, SCHEDULE.dinnerMinutes).status,
  ]);
  const distinct = (xs: (string | undefined)[]) => new Set(xs.map((x, i) => x ?? `none-${i}`)).size;
  const vc = votedKeys(members, "cuisines");
  const va = votedKeys(members, "activities");
  if (n === 0) {
    // Nothing proposed: plan-quality metrics are undefined (null), counted by `noPlan` instead.
    return { options: 0, noPlan: 1, meanCoverage: null, minCoverage: null, zeroShare: null, leftOutEverywhere: null, diversity: null, budgetFit: null, dietConfirmed: null, unknownHours: null, closedAtSlot: null };
  }
  return {
    options: n,
    noPlan: 0,
    meanCoverage: mean(scores.map(mean)),
    minCoverage: mean(scores.map((s) => Math.min(...s))),
    zeroShare: mean(scores.map((s) => s.filter((x) => x === 0).length / s.length)),
    leftOutEverywhere: members.filter((_, i) => scores.every((s) => s[i] === 0)).length / members.length,
    diversity: (distinct(options.map((o) => categoryKey(o.dinner, CUISINES, vc))) / n + distinct(options.map((o) => categoryKey(o.activity, ACTIVITIES, va))) / n) / 2,
    budgetFit: options.filter((o) => optionCost(o, req) <= req.budgetPerPerson + 1e-9).length / n,
    dietConfirmed: needs.length ? options.filter((o) => needs.every((t) => has(o.dinner, t))).length / n : null,
    unknownHours: slots.filter((s) => s === "unknown").length / slots.length,
    closedAtSlot: slots.filter((s) => s === "closed_day" || s === "closed_at_time").length / slots.length,
  };
}

export type MetricKey = Exclude<keyof TeamMetrics, "options">;
export const METRIC_KEYS: MetricKey[] = ["noPlan", "meanCoverage", "minCoverage", "zeroShare", "leftOutEverywhere", "diversity", "budgetFit", "dietConfirmed", "unknownHours", "closedAtSlot"];

export interface Aggregate {
  teams: number;
  meanOptions: number;
  /** Mean over teams (teams where a metric is null are skipped; `n` says how many counted). */
  metrics: Record<MetricKey, { mean: number; n: number }>;
}

/** Aggregates per-team metrics into means. Only aggregates leave the experiment. */
export function aggregate(rows: TeamMetrics[]): Aggregate {
  const metrics = {} as Aggregate["metrics"];
  for (const k of METRIC_KEYS) {
    const vals = rows.map((r) => r[k]).filter((v): v is number => v !== null);
    metrics[k] = { mean: Math.round(mean(vals) * 1000) / 1000, n: vals.length };
  }
  return { teams: rows.length, meanOptions: Math.round(mean(rows.map((r) => r.options)) * 100) / 100, metrics };
}

/** Share of teams where `x` beats / ties / loses to `y` on a metric (higher is better unless `lowerIsBetter`). */
export function pairwise(x: TeamMetrics[], y: TeamMetrics[], k: MetricKey, lowerIsBetter = false) {
  let win = 0, tie = 0, loss = 0;
  x.forEach((r, i) => {
    const a = r[k], b = y[i]![k];
    if (a === null || b === null) return;
    const d = lowerIsBetter ? b - a : a - b;
    if (Math.abs(d) < 1e-9) tie++; else if (d > 0) win++; else loss++;
  });
  return { win, tie, loss };
}
